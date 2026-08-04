function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Count forecast weeks where projected cases exceed the warning / alarm band.
 *
 * Prefer warning_threshold (GAM upper / Farrington-style band on the point).
 * Fall back to alarm_threshold. Do NOT use detection_threshold: in the current
 * pipeline that field is often equal to the forecast median (expected level),
 * which would incorrectly clear every early-warning flag.
 */
export function countEarlyWarningWeeks(forecastRow) {
  return (forecastRow?.forecast || []).filter((point) => {
    const median = finiteNumber(point?.median);
    if (median == null) return false;
    const warning = finiteNumber(point?.warning_threshold);
    const alarm = finiteNumber(point?.alarm_threshold);
    const threshold = warning ?? alarm;
    return threshold != null && median > threshold;
  }).length;
}

export function earlyWarningLevelFromCount(count) {
  if (count > 1) return "High";
  if (count === 1) return "Medium";
  return "Low";
}

/**
 * Optionally refresh EW from forecast points, but never erase a backend EW flag
 * when point-level thresholds cannot reproduce it (common when detection_threshold
 * == median, or when EW came from Farrington on the combined series).
 */
export function enrichAlertWithForecastWarning(alert, forecastRow) {
  if (!alert) return alert;
  if (!forecastRow?.forecast?.length) return alert;

  const recomputedCount = countEarlyWarningWeeks(forecastRow);
  const backendCount = Number(alert.ew_alert_count) || 0;
  const backendEw = Boolean(alert.early_warning);

  // If client recomputation finds EW weeks, prefer that (keeps UI aligned with chart).
  if (recomputedCount >= 1) {
    return {
      ...alert,
      early_warning: true,
      ew_alert_count: recomputedCount,
      ew_level: earlyWarningLevelFromCount(recomputedCount),
    };
  }

  // Otherwise keep pipeline/backend EW summary unchanged.
  if (backendEw || backendCount >= 1) {
    return {
      ...alert,
      early_warning: backendEw || backendCount >= 1,
      ew_alert_count: backendCount,
      ew_level: alert.ew_level || earlyWarningLevelFromCount(backendCount),
    };
  }

  return {
    ...alert,
    early_warning: false,
    ew_alert_count: 0,
    ew_level: "Low",
  };
}

export function enrichAlertsWithForecastWarnings(alerts, forecasts, species) {
  const forecastByDistrict = new Map(
    (forecasts || []).filter((row) => row.species === species).map((row) => [row.district, row])
  );

  return (alerts || [])
    .filter((alert) => alert.species === species)
    .map((alert) => enrichAlertWithForecastWarning(alert, forecastByDistrict.get(alert.district)));
}
