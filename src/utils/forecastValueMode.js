import { findDistrictFromLookup } from "./districtNameMatch";

export const FORECAST_VALUE_MODE = {
  CASES: "cases",
  INCIDENCE: "incidence",
};

export const FORECAST_VALUE_MODE_OPTIONS = [
  { value: FORECAST_VALUE_MODE.CASES, label: "Cases" },
  { value: FORECAST_VALUE_MODE.INCIDENCE, label: "Incidence (/100k)" },
];

const PER_100K = 100000;

export function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function casesToIncidenceRate(cases, population) {
  const count = finiteNumber(cases);
  const pop = finiteNumber(population);
  if (count == null || pop == null || pop <= 0) return null;
  return (count / pop) * PER_100K;
}

export function resolveDistrictPopulation({
  populationData,
  adm3Lookup,
  districtName,
  alertPopulation,
  surfaceValueForDistrict,
}) {
  const feature = findDistrictFromLookup(adm3Lookup, districtName);
  const mapName = feature?.properties?.adm3_name || districtName;

  if (surfaceValueForDistrict && populationData) {
    const fromSurface = finiteNumber(surfaceValueForDistrict(populationData, mapName));
    if (fromSurface != null && fromSurface > 0) return fromSurface;
    const fromRaw = finiteNumber(surfaceValueForDistrict(populationData, districtName));
    if (fromRaw != null && fromRaw > 0) return fromRaw;
  }

  const fromAlert = finiteNumber(alertPopulation);
  if (fromAlert != null && fromAlert > 0) return fromAlert;

  return null;
}

function scaleCountField(value, population) {
  if (value == null) return null;
  return casesToIncidenceRate(value, population);
}

export function applyForecastValueModeToRow(row, population) {
  if (!population || population <= 0) return row;

  return {
    ...row,
    observed: scaleCountField(row.observed, population),
    median: scaleCountField(row.median, population),
    lower: scaleCountField(row.lower, population),
    upper: scaleCountField(row.upper, population),
    detection_threshold: scaleCountField(row.detection_threshold, population),
    warning_threshold: scaleCountField(row.warning_threshold, population),
    alarm_threshold: scaleCountField(row.alarm_threshold, population),
  };
}

export function applyForecastValueModeToRows(rows, population) {
  if (!population || population <= 0) return rows;
  return rows.map((row) => applyForecastValueModeToRow(row, population));
}

export function transformForecastTableRow(row, valueMode, population) {
  if (valueMode !== FORECAST_VALUE_MODE.INCIDENCE || !population || population <= 0) {
    return row;
  }

  const latestObserved = scaleCountField(row.latestObserved, population);
  const latestForecast = scaleCountField(row.latestForecast, population);
  const activeThreshold = scaleCountField(row.activeThreshold, population);
  const magnitude =
    latestForecast != null && activeThreshold != null
      ? latestForecast - activeThreshold
      : null;
  const magnitudePercent =
    magnitude != null && activeThreshold > 0 ? (magnitude / activeThreshold) * 100 : null;

  return {
    ...row,
    latestObserved,
    latestForecast,
    detectionThreshold: scaleCountField(row.detectionThreshold, population),
    warningThreshold: scaleCountField(row.warningThreshold, population),
    activeThreshold,
    magnitude,
    magnitudePercent,
    caseSparkline: (row.caseSparkline || []).map((value) => scaleCountField(value, population) ?? 0),
  };
}

export function getForecastYAxisTitle(valueMode) {
  return valueMode === FORECAST_VALUE_MODE.INCIDENCE
    ? "Incidence per 100,000"
    : "Weekly cases";
}

export function getForecastMetricLabel(valueMode) {
  return valueMode === FORECAST_VALUE_MODE.INCIDENCE ? "Incidence (/100k)" : "Cases";
}

export function formatForecastMetric(value, valueMode, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const maxDigits = valueMode === FORECAST_VALUE_MODE.INCIDENCE ? digits : 0;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxDigits,
    minimumFractionDigits: valueMode === FORECAST_VALUE_MODE.INCIDENCE ? Math.min(1, maxDigits) : 0,
  }).format(Number(value));
}

export function buildComparisonHighlightModes(valueMode) {
  const peakLabel =
    valueMode === FORECAST_VALUE_MODE.INCIDENCE
      ? "Peak incidence (date range)"
      : "Peak cases (date range)";
  const latestLabel =
    valueMode === FORECAST_VALUE_MODE.INCIDENCE
      ? "Latest forecast (incidence)"
      : "Latest forecast";

  return [
    { value: "alert-priority", label: "Alert priority" },
    { value: "peak-cases", label: peakLabel },
    { value: "latest-forecast", label: latestLabel },
  ];
}
