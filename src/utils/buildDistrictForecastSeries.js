import { findDistrictFromLookup } from "./districtNameMatch";
import { findDistrictForecastRow } from "./epidemiaReportMerge";
import { filterForecastRowsByDateRange } from "./filterForecastByDateRange";
import {
  FORECAST_VALUE_MODE,
  applyForecastValueModeToRows,
  resolveDistrictPopulation,
} from "./forecastValueMode";

export function buildDistrictForecastSeries(
  epidemiaData,
  adm3Lookup,
  districtName,
  selectedSpecies,
  startDate = null,
  endDate = null,
  {
    valueMode = FORECAST_VALUE_MODE.CASES,
    populationData = null,
    surfaceValueForDistrict = null,
  } = {}
) {
  if (!epidemiaData?.forecasts || !districtName) return null;

  const districtFc = findDistrictForecastRow(
    epidemiaData,
    adm3Lookup,
    districtName,
    selectedSpecies
  );

  if (!districtFc) return null;

  const alert =
    (epidemiaData.alerts || []).find(
      (item) =>
        item.species === selectedSpecies &&
        (item.district === districtName ||
          findDistrictFromLookup(adm3Lookup, item.district)?.properties?.adm3_name ===
            districtName)
    ) || null;

  let observedRows = (districtFc.observed_history || []).map((point) => ({
    date: point.week_start,
    median: null,
    lower: null,
    upper: null,
    observed: point.observed,
    detection_threshold: point.detection_threshold ?? null,
    warning_threshold: point.warning_threshold ?? null,
    alarm_threshold: point.alarm_threshold ?? null,
  }));

  if (
    observedRows.length === 0 &&
    alert?.latest_observed != null &&
    districtFc.forecast?.length
  ) {
    observedRows = [
      {
        date: districtFc.forecast[0].week_start,
        median: null,
        lower: null,
        upper: null,
        observed: alert.latest_observed,
      },
    ];
  }

  const forecastRows = (districtFc.forecast || []).map((point) => ({
    date: point.week_start,
    median: point.median,
    lower: point.lower,
    upper: point.upper,
    observed: null,
    detection_threshold: point.detection_threshold ?? null,
    warning_threshold: point.warning_threshold ?? null,
    alarm_threshold: point.alarm_threshold ?? null,
  }));

  const population = resolveDistrictPopulation({
    populationData,
    adm3Lookup,
    districtName,
    alertPopulation: alert?.population_at_risk,
    surfaceValueForDistrict,
  });

  let rows = filterForecastRowsByDateRange(
    [...observedRows, ...forecastRows],
    startDate,
    endDate
  );

  if (valueMode === FORECAST_VALUE_MODE.INCIDENCE) {
    rows = applyForecastValueModeToRows(rows, population);
  }

  return {
    district: districtName,
    alert,
    population,
    valueMode,
    rows,
  };
}

export function buildComparisonDistrictOptions(forecastTableRows, adminRegion) {
  let rows = [...(forecastTableRows || [])].sort((a, b) => b.priority - a.priority);

  if (adminRegion && adminRegion !== "All Regions" && adminRegion !== "No Selection") {
    rows = rows.filter((row) => row.region === adminRegion);
  }

  return rows.map((row) => ({
    value: row.mapDistrict,
    label: row.mapDistrict,
    region: row.region,
    status: row.status,
  }));
}

function filterRowsByAdminRegion(forecastTableRows, adminRegion) {
  let rows = [...(forecastTableRows || [])];
  if (adminRegion && adminRegion !== "All Regions" && adminRegion !== "No Selection") {
    rows = rows.filter((row) => row.region === adminRegion);
  }
  return rows;
}

function peakObservedInRange(
  epidemiaData,
  adm3Lookup,
  districtName,
  selectedSpecies,
  startDate,
  endDate,
  seriesOptions = {}
) {
  const series = buildDistrictForecastSeries(
    epidemiaData,
    adm3Lookup,
    districtName,
    selectedSpecies,
    startDate,
    endDate,
    seriesOptions
  );
  const observed = (series?.rows || [])
    .map((row) => row.observed)
    .filter((value) => value != null && Number.isFinite(Number(value)))
    .map(Number);
  return observed.length ? Math.max(...observed) : -Infinity;
}

/** Default highlighted districts for the comparison chart (scoped to admin region when set). */
export function buildRegionalComparisonDistricts(
  forecastTableRows,
  adminRegion,
  mode = "alert-priority",
  {
    epidemiaData = null,
    adm3Lookup = null,
    selectedSpecies = null,
    startDate = null,
    endDate = null,
    count = 3,
    valueMode = FORECAST_VALUE_MODE.CASES,
    populationData = null,
    surfaceValueForDistrict = null,
  } = {}
) {
  const seriesOptions = { valueMode, populationData, surfaceValueForDistrict };
  let rows = filterRowsByAdminRegion(forecastTableRows, adminRegion);

  if (mode === "latest-forecast") {
    rows.sort(
      (a, b) =>
        (Number.isFinite(Number(b.latestForecast)) ? Number(b.latestForecast) : -Infinity) -
        (Number.isFinite(Number(a.latestForecast)) ? Number(a.latestForecast) : -Infinity)
    );
  } else if (mode === "peak-cases") {
    rows = rows
      .map((row) => ({
        ...row,
        peakObserved: peakObservedInRange(
          epidemiaData,
          adm3Lookup,
          row.mapDistrict,
          selectedSpecies,
          startDate,
          endDate,
          seriesOptions
        ),
      }))
      .sort((a, b) => b.peakObserved - a.peakObserved);
  } else {
    rows.sort((a, b) => b.priority - a.priority);
  }

  return Array.from({ length: count }, (_, index) => rows[index]?.mapDistrict || "");
}

/** @deprecated Use buildRegionalComparisonDistricts with mode "alert-priority". */
export function buildRegionalTopPriorityDistricts(forecastTableRows, adminRegion, count = 3) {
  return buildRegionalComparisonDistricts(forecastTableRows, adminRegion, "alert-priority", {
    count,
  });
}

/** Top priority districts for table badges (national, not region-filtered). */
export function buildTableTopPriorityDistricts(forecastTableRows, count = 3) {
  const top = [...(forecastTableRows || [])]
    .filter((row) => row.statusRank > 1)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, count)
    .map((row) => row.mapDistrict);

  return Array.from({ length: count }, (_, index) => top[index] || "");
}

export function buildTableTopPriorityRankByKey(forecastTableRows, count = 3) {
  const rankByKey = new Map();
  [...(forecastTableRows || [])]
    .filter((row) => row.statusRank > 1)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, count)
    .forEach((row, index) => {
      rankByKey.set(`${row.species}-${row.rawDistrict}`, index + 1);
    });
  return rankByKey;
}
