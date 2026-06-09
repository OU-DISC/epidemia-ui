function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Count forecast weeks where projected cases exceed the seasonal expected level. */
export function countEarlyWarningWeeks(forecastRow) {
  return (forecastRow?.forecast || []).filter((point) => {
    const median = finiteNumber(point?.median);
    const expected = finiteNumber(point?.detection_threshold);
    return median != null && expected != null && median > expected;
  }).length;
}

export function earlyWarningLevelFromCount(count) {
  if (count > 1) return "High";
  if (count === 1) return "Medium";
  return "Low";
}

/** Align alert EW flags with forecast-vs-expected logic used by the map and regional chart. */
export function enrichAlertWithForecastWarning(alert, forecastRow) {
  if (!alert) return alert;

  const ewAlertCount = countEarlyWarningWeeks(forecastRow);
  const ewLevel = earlyWarningLevelFromCount(ewAlertCount);

  return {
    ...alert,
    early_warning: ewAlertCount >= 1,
    ew_alert_count: ewAlertCount,
    ew_level: ewLevel,
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
