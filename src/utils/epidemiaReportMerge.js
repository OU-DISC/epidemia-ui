import { findDistrictFromLookup, normalizeDistrictKey } from "./districtNameMatch";

function forecastKey(forecast) {
  if (!forecast) return "";
  return `${forecast.species || ""}|${normalizeDistrictKey(forecast.district)}`;
}

function districtMatchesSelection(forecast, adm3Lookup, selectedDistrict, species) {
  if (!forecast || forecast.species !== species) return false;
  if (forecast.district === selectedDistrict) return true;

  const selectedFeature = findDistrictFromLookup(adm3Lookup, selectedDistrict);
  const forecastFeature = findDistrictFromLookup(adm3Lookup, forecast.district);
  const selectedName = selectedFeature?.properties?.adm3_name;
  const forecastName = forecastFeature?.properties?.adm3_name;

  return (
    selectedName === forecast.district ||
    forecastName === selectedDistrict ||
    normalizeDistrictKey(forecast.district) === normalizeDistrictKey(selectedDistrict)
  );
}

function forecastHistoryCount(forecast) {
  return (forecast?.observed_history || []).length;
}

/** Merge forecast rows, keeping whichever copy has deeper observed history. */
export function mergeForecastRows(existing = [], incoming = []) {
  const byKey = new Map();

  for (const row of existing || []) {
    const key = forecastKey(row);
    if (key) byKey.set(key, row);
  }

  for (const row of incoming || []) {
    const key = forecastKey(row);
    if (!key) continue;

    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, row);
      continue;
    }

    const keepPrevious = forecastHistoryCount(previous) >= forecastHistoryCount(row);
    const richer = keepPrevious ? previous : row;
    const other = keepPrevious ? row : previous;
    byKey.set(key, {
      ...other,
      ...richer,
      observed_history: richer.observed_history || [],
      forecast: richer.forecast?.length ? richer.forecast : other.forecast || [],
    });
  }

  return [...byKey.values()];
}

/** Merge forecast rows from a deferred bootstrap payload into a map-first report. */
export function mergeForecastBootstrap(report, bootstrap) {
  if (!report || !bootstrap) return report || bootstrap;

  const forecasts = bootstrap.forecasts?.length
    ? mergeForecastRows(report.forecasts, bootstrap.forecasts)
    : report.forecasts || [];

  return {
    ...report,
    ...bootstrap,
    alerts: bootstrap.alerts?.length ? bootstrap.alerts : report.alerts,
    forecasts,
    artifacts: { ...(report.artifacts || {}), ...(bootstrap.artifacts || {}) },
  };
}

/** Replace one district forecast row inside a cached EPIDEMIA report. */
export function mergeDistrictForecast(report, detail) {
  if (!report || !detail) return report;
  const detailKey = forecastKey(detail);
  if (!detailKey) return report;

  const forecasts = (report.forecasts || []).map((forecast) =>
    forecastKey(forecast) === detailKey
      ? {
          ...forecast,
          ...detail,
          observed_history: detail.observed_history || forecast.observed_history || [],
          forecast: detail.forecast?.length ? detail.forecast : forecast.forecast || [],
        }
      : forecast
  );

  const hasMatch = forecasts.some((forecast) => forecastKey(forecast) === detailKey);
  if (!hasMatch) {
    forecasts.push(detail);
  }

  return { ...report, forecasts };
}

/** Resolve the report district label for a selected UI district name. */
export function resolveReportDistrictName(adm3Lookup, selectedDistrict) {
  if (!selectedDistrict || selectedDistrict === "All Regions") return null;
  const match = findDistrictFromLookup(adm3Lookup, selectedDistrict);
  return match?.properties?.adm3_name || selectedDistrict;
}

/** Resolve the exact district label stored in the EPIDEMIA report JSON. */
export function resolveReportDistrictForSelection(
  report,
  adm3Lookup,
  selectedDistrict,
  species
) {
  if (!selectedDistrict || selectedDistrict === "All Regions") return null;

  const match = (report?.forecasts || []).find((forecast) =>
    districtMatchesSelection(forecast, adm3Lookup, selectedDistrict, species)
  );
  if (match?.district) return match.district;

  return resolveReportDistrictName(adm3Lookup, selectedDistrict);
}

export function findDistrictForecastRow(report, adm3Lookup, selectedDistrict, species) {
  return (report?.forecasts || []).find((forecast) =>
    districtMatchesSelection(forecast, adm3Lookup, selectedDistrict, species)
  );
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function expectedWeeksInRange(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.max(1, Math.floor((end - start) / MS_PER_WEEK) + 1);
}

/** True when observed history already spans the chart date range. */
export function forecastHistoryCoversRange(forecast, startDate, endDate) {
  const history = forecast?.observed_history || [];
  if (!history.length || !startDate || !endDate) return false;

  const weeksInRange = history
    .map((point) => point?.week_start)
    .filter((week) => week && week >= startDate && week <= endDate);

  if (weeksInRange.length < 2) return false;

  const expected = expectedWeeksInRange(startDate, endDate);
  if (!expected) return false;

  // Require most of the chart span — 16 bootstrap weeks must not satisfy a 2-year range.
  return weeksInRange.length >= Math.max(8, Math.floor(expected * 0.85));
}
