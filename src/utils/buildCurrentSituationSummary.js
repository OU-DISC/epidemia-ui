import { buildAlertExplanation } from "./alertExplainer";
import {
  finiteNumber,
  FORECAST_VALUE_MODE,
  formatForecastMetric,
  getForecastMetricLabel,
} from "./forecastValueMode";

export const DETECTION_WINDOW_WEEKS = 4;

function pointExceedsDetectionThreshold(point) {
  const observed = finiteNumber(point?.observed);
  const detectionThreshold = finiteNumber(
    point?.detection_threshold ?? point?.detectionThreshold ?? point?.expected
  );
  if (observed == null || detectionThreshold == null) return false;
  return observed > detectionThreshold;
}

/** Last N observed weeks — one dot each for the early-detection rolling window. */
export function buildDetectionWeekStates(
  observedHistory = [],
  windowWeeks = DETECTION_WINDOW_WEEKS
) {
  const horizon = finiteNumber(windowWeeks) ?? DETECTION_WINDOW_WEEKS;
  const recent = (observedHistory || []).slice(-horizon);
  const entries = Array.from({ length: horizon }, (_, index) => {
    const offset = horizon - recent.length;
    const point = index >= offset ? recent[index - offset] : null;
    return {
      active: point ? pointExceedsDetectionThreshold(point) : false,
      week: point?.week_start || point?.date || null,
    };
  });

  return {
    detectionWeekStates: entries.map((entry) => entry.active),
    detectionWeekLabels: entries.map((entry) => entry.week),
    detectionWeeksActive: entries.filter((entry) => entry.active).length,
    detectionWindowWeeks: horizon,
  };
}

function buildDetectionWindowTooltip({
  activeCount,
  windowWeeks,
  weekLabels,
  weekStates,
  status,
}) {
  const parts = [`${activeCount} of ${windowWeeks} observed weeks above detection threshold`];
  weekLabels.forEach((week, index) => {
    if (!week) return;
    parts.push(
      `${week}: ${weekStates[index] ? "above threshold" : "at or below threshold"}`
    );
  });
  if (status === "Early Detection" && activeCount === 0) {
    parts.push("Pipeline ED flag may reflect an earlier week in this window");
  }
  return parts.join(" · ");
}

function countPersistenceWeeks(forecastPoints = []) {
  return buildForecastWeekStates(forecastPoints).filter(Boolean).length;
}

function buildForecastWeekStates(forecastPoints = [], forecastHorizonWeeks = 12) {
  const horizon = finiteNumber(forecastHorizonWeeks) ?? 12;
  return Array.from({ length: horizon }, (_, index) => {
    const point = forecastPoints[index];
    if (!point) return false;

    const median = finiteNumber(point?.median);
    const warningThreshold = finiteNumber(point?.warning_threshold);
    const detectionThreshold = finiteNumber(point?.detection_threshold);
    if (median == null) return false;
    if (warningThreshold != null && median > warningThreshold) return true;
    if (detectionThreshold != null && median > detectionThreshold) return true;
    return false;
  });
}

function resolvePersistenceWeeks({ insightPersistence, forecastPoints, forecastHorizonWeeks }) {
  const fromPoints = countPersistenceWeeks(forecastPoints);
  const fromInsight = finiteNumber(insightPersistence) ?? 0;
  const resolved = Math.max(fromInsight, fromPoints);
  const horizon = finiteNumber(forecastHorizonWeeks) ?? 12;
  return Math.min(resolved, horizon);
}

function filterRowsByScope(rows, selectedAdminRegion) {
  let scoped = [...(rows || [])];
  if (
    selectedAdminRegion &&
    selectedAdminRegion !== "All Regions" &&
    selectedAdminRegion !== "No Selection"
  ) {
    scoped = scoped.filter((row) => row.region === selectedAdminRegion);
  }
  return scoped.sort((a, b) => b.priority - a.priority);
}

function alertLevelLabel(row) {
  if (row.earlyWarning) return row.ewLevel || "Low";
  if (row.earlyDetection) return row.edLevel || "Low";
  return null;
}

function buildEvidenceTooltip(explanation, insight) {
  if (explanation?.summary) return explanation.summary;
  if (insight?.latestObserved != null && insight?.activeThreshold != null) {
    return `Observed ${formatForecastMetric(insight.latestObserved, FORECAST_VALUE_MODE.CASES, 0)} vs threshold ${formatForecastMetric(insight.activeThreshold, FORECAST_VALUE_MODE.CASES, 0)}`;
  }
  return "Recent observed case trend vs alert threshold";
}

function buildForecastTooltip({ row, valueMode, persistenceWeeks, forecastHorizonWeeks }) {
  if (!row) return "Near-term forecast outlook";
  const metricLabel = getForecastMetricLabel(valueMode);
  const parts = [];
  if (row.latestForecast != null) {
    parts.push(`Forecast ${formatForecastMetric(row.latestForecast, valueMode, 1)} ${metricLabel}`);
  }
  parts.push(
    `${persistenceWeeks} of ${forecastHorizonWeeks} forecast weeks above threshold`
  );
  if (row.magnitudePercent != null && row.magnitudePercent > 0) {
    parts.push(`${formatForecastMetric(row.magnitudePercent, FORECAST_VALUE_MODE.CASES, 1)}% above threshold`);
  }
  return parts.join(" · ");
}

function alertStatusFromFlags(alert) {
  if (!alert) return "Normal";
  if (alert.early_warning) return "Early Warning";
  if (alert.early_detection) return "Early Detection";
  return "Normal";
}

function countWeekAlerts(weekAlerts = []) {
  let warnings = 0;
  let detections = 0;
  (weekAlerts || []).forEach((alert) => {
    if (alert.early_warning) warnings += 1;
    if (alert.early_detection) detections += 1;
  });
  return { warnings, detections };
}

function weekVisualMetrics(alert, weekObservedPoint) {
  const observed = finiteNumber(weekObservedPoint?.observed);
  const detectionThreshold = finiteNumber(
    weekObservedPoint?.detection_threshold ?? alert?.detection_threshold
  );
  const warningThreshold = finiteNumber(
    weekObservedPoint?.warning_threshold ?? alert?.warning_threshold
  );
  const status = alertStatusFromFlags(alert);
  const activeThreshold =
    status === "Early Warning"
      ? warningThreshold ?? detectionThreshold
      : detectionThreshold ?? warningThreshold;

  return {
    latestObserved: observed,
    latestForecast: null,
    activeThreshold,
    status,
    earlyWarning: Boolean(alert?.early_warning),
    earlyDetection: Boolean(alert?.early_detection),
  };
}

function rowVisualMetrics(row) {
  if (!row) {
    return {
      latestObserved: null,
      latestForecast: null,
      activeThreshold: null,
      magnitudePercent: null,
      persistenceWeeks: 0,
      caseSparkline: [],
      caseSparklineWeeks: [],
      status: "Normal",
      topDistrict: null,
    };
  }
  return {
    latestObserved: row.latestObserved ?? null,
    latestForecast: row.latestForecast ?? null,
    activeThreshold: row.activeThreshold ?? null,
    magnitudePercent: row.magnitudePercent ?? null,
    persistenceWeeks: row.persistenceWeeks ?? 0,
    caseSparkline: row.caseSparkline || [],
    caseSparklineWeeks: row.caseSparklineWeeks || [],
    status: row.status || "Normal",
    topDistrict: row.mapDistrict || null,
  };
}

/**
 * Build structured situation summary for the visual map controls panel.
 */
export function buildCurrentSituationSummary({
  rows = [],
  selectedAdminRegion,
  selectedDistrict,
  speciesLabel,
  valueMode = FORECAST_VALUE_MODE.CASES,
  insight = null,
  alert = null,
  weekAlerts = null,
  alertAnimationWeek = null,
  weekObservedPoint = null,
  observedHistory = [],
  forecastPoints = [],
  population = null,
  incidentRate = null,
  startDate,
  endDate,
  forecastHorizonWeeks = 12,
}) {
  const scopedRows = filterRowsByScope(rows, selectedAdminRegion);
  const isDistrictFocus = selectedDistrict && selectedDistrict !== "All Regions";
  const horizonWeeks = finiteNumber(forecastHorizonWeeks) ?? 12;
  const isHistoricalWeek = Boolean(alertAnimationWeek && weekAlerts);
  const scopeLabel =
    selectedAdminRegion && selectedAdminRegion !== "All Regions"
      ? selectedAdminRegion
      : "All regions";
  const dateRange = startDate && endDate ? `${startDate} → ${endDate}` : null;
  const weekSuffix = isHistoricalWeek ? ` · Week ${alertAnimationWeek}` : "";
  const metricLabel = getForecastMetricLabel(valueMode);

  if (isDistrictFocus) {
    const regionName = insight?.region || scopeLabel;
    const weekMetrics = isHistoricalWeek ? weekVisualMetrics(alert, weekObservedPoint) : null;
    const explanation = buildAlertExplanation({
      districtName: selectedDistrict,
      regionName,
      speciesLabel,
      alert,
      insight: isHistoricalWeek
        ? {
            ...(insight || {}),
            status: weekMetrics?.status || "Normal",
            latestObserved: weekMetrics?.latestObserved ?? null,
            activeThreshold: weekMetrics?.activeThreshold ?? null,
            earlyWarning: weekMetrics?.earlyWarning,
            earlyDetection: weekMetrics?.earlyDetection,
          }
        : insight,
      population,
      incidentRate,
      observedHistory,
      forecastPoints,
    });

    const status = isHistoricalWeek
      ? weekMetrics?.status || "Normal"
      : insight?.status || explanation.status || "Normal";
    const level = isHistoricalWeek
      ? alert?.ew_level || alert?.ed_level || null
      : alertLevelLabel(insight || {}) || explanation.level;
    const persistenceWeeks = resolvePersistenceWeeks({
      insightPersistence: insight?.persistenceWeeks,
      forecastPoints,
      forecastHorizonWeeks: horizonWeeks,
    });
    const detectionWindow = buildDetectionWeekStates(observedHistory);
    const forecastRow = insight || {
      latestForecast: null,
      magnitudePercent: null,
    };

    return {
      scopeLabel: `${selectedDistrict} · ${regionName}${weekSuffix}`,
      dateRange,
      isDistrictFocus: true,
      alertStatus: status,
      alertLevel: level,
      earlyWarning: isHistoricalWeek
        ? Boolean(weekMetrics?.earlyWarning)
        : Boolean(insight?.earlyWarning || alert?.early_warning),
      earlyDetection: isHistoricalWeek
        ? Boolean(weekMetrics?.earlyDetection)
        : Boolean(insight?.earlyDetection || alert?.early_detection),
      warningCount: 0,
      detectionCount: 0,
      topDistrict: selectedDistrict,
      latestObserved: isHistoricalWeek
        ? weekMetrics?.latestObserved ?? null
        : insight?.latestObserved ?? null,
      latestForecast: isHistoricalWeek ? null : insight?.latestForecast ?? null,
      activeThreshold: isHistoricalWeek
        ? weekMetrics?.activeThreshold ?? null
        : insight?.activeThreshold ?? null,
      magnitudePercent: isHistoricalWeek ? null : insight?.magnitudePercent ?? null,
      persistenceWeeks,
      detectionWeekStates: detectionWindow.detectionWeekStates,
      detectionWeekLabels: detectionWindow.detectionWeekLabels,
      detectionWeeksActive: detectionWindow.detectionWeeksActive,
      detectionWindowWeeks: detectionWindow.detectionWindowWeeks,
      detectionWindowTooltip: buildDetectionWindowTooltip({
        activeCount: detectionWindow.detectionWeeksActive,
        windowWeeks: detectionWindow.detectionWindowWeeks,
        weekLabels: detectionWindow.detectionWeekLabels,
        weekStates: detectionWindow.detectionWeekStates,
        status,
      }),
      forecastHorizonWeeks: horizonWeeks,
      caseSparkline: insight?.caseSparkline || [],
      caseSparklineWeeks: insight?.caseSparklineWeeks || [],
      metricLabel,
      valueMode,
      evidenceTooltip: isHistoricalWeek
        ? weekObservedPoint
          ? `Week of ${alertAnimationWeek}: observed ${formatForecastMetric(weekMetrics?.latestObserved, FORECAST_VALUE_MODE.CASES, 0)} vs threshold ${formatForecastMetric(weekMetrics?.activeThreshold, FORECAST_VALUE_MODE.CASES, 0)}`
          : `No observed data for week ${alertAnimationWeek}`
        : buildEvidenceTooltip(explanation, insight),
      forecastTooltip: isHistoricalWeek
        ? `Historical replay for ${alertAnimationWeek}. Forecast outlook reflects the current run.`
        : buildForecastTooltip({
            row: forecastRow,
            valueMode,
            persistenceWeeks,
            forecastHorizonWeeks: horizonWeeks,
          }),
    };
  }

  const weekCounts = isHistoricalWeek
    ? countWeekAlerts(weekAlerts)
    : {
        warnings: scopedRows.filter((row) => row.status === "Early Warning").length,
        detections: scopedRows.filter((row) => row.status === "Early Detection").length,
      };
  const warningCount = weekCounts.warnings;
  const detectionCount = weekCounts.detections;
  const elevatedRows = isHistoricalWeek
    ? (weekAlerts || []).map((weekAlert) => ({
        mapDistrict: weekAlert.district,
        status: alertStatusFromFlags(weekAlert),
        earlyWarning: Boolean(weekAlert.early_warning),
        earlyDetection: Boolean(weekAlert.early_detection),
        ewLevel: weekAlert.ew_level,
        edLevel: weekAlert.ed_level,
        latestObserved: weekAlert.latest_observed ?? null,
        latestForecast: weekAlert.latest_forecast ?? null,
        activeThreshold:
          weekAlert.warning_threshold ?? weekAlert.detection_threshold ?? null,
        magnitudePercent: null,
        persistenceWeeks: 0,
        caseSparkline: [],
        caseSparklineWeeks: [],
      }))
    : scopedRows.filter(
        (row) => row.status === "Early Warning" || row.status === "Early Detection"
      );
  const topRow = elevatedRows[0] || (!isHistoricalWeek ? scopedRows[0] : null) || null;
  const visual = rowVisualMetrics(topRow);
  const persistenceWeeks = resolvePersistenceWeeks({
    insightPersistence: visual.persistenceWeeks,
    forecastPoints,
    forecastHorizonWeeks: horizonWeeks,
  });
  const detectionWindow = buildDetectionWeekStates(observedHistory);
  const scopeStatus =
    warningCount || detectionCount
      ? warningCount && detectionCount
        ? "Mixed alerts"
        : warningCount
        ? "Early Warning"
        : "Early Detection"
      : "Normal";

  return {
    scopeLabel: `${scopeLabel} · ${scopedRows.length} district${scopedRows.length === 1 ? "" : "s"}${weekSuffix}`,
    dateRange,
    isDistrictFocus: false,
    alertStatus: scopeStatus,
    alertLevel: topRow ? alertLevelLabel(topRow) : null,
    earlyWarning: warningCount > 0,
    earlyDetection: detectionCount > 0,
    warningCount,
    detectionCount,
    topDistrict: visual.topDistrict,
    latestObserved: visual.latestObserved,
    latestForecast: visual.latestForecast,
    activeThreshold: visual.activeThreshold,
    magnitudePercent: visual.magnitudePercent,
    persistenceWeeks,
    detectionWeekStates: detectionWindow.detectionWeekStates,
    detectionWeekLabels: detectionWindow.detectionWeekLabels,
    detectionWeeksActive: detectionWindow.detectionWeeksActive,
    detectionWindowWeeks: detectionWindow.detectionWindowWeeks,
    detectionWindowTooltip: buildDetectionWindowTooltip({
      activeCount: detectionWindow.detectionWeeksActive,
      windowWeeks: detectionWindow.detectionWindowWeeks,
      weekLabels: detectionWindow.detectionWeekLabels,
      weekStates: detectionWindow.detectionWeekStates,
      status: scopeStatus,
    }),
    forecastHorizonWeeks: horizonWeeks,
    caseSparkline: visual.caseSparkline,
    caseSparklineWeeks: visual.caseSparklineWeeks,
    metricLabel,
    valueMode,
    evidenceTooltip: isHistoricalWeek
      ? `${warningCount + detectionCount} elevated district${warningCount + detectionCount === 1 ? "" : "s"} in week ${alertAnimationWeek}`
      : topRow
      ? `Highest priority: ${topRow.mapDistrict} (${topRow.status})`
      : "No elevated alerts in this scope",
    forecastTooltip: isHistoricalWeek
      ? `Historical replay for ${alertAnimationWeek}. Forecast outlook reflects the current run.`
      : topRow
      ? buildForecastTooltip({
          row: topRow,
          valueMode,
          persistenceWeeks,
          forecastHorizonWeeks: horizonWeeks,
        })
      : "No forecast signal in scope",
  };
}
