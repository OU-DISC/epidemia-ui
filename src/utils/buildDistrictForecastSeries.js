import { findDistrictFromLookup } from "./districtNameMatch";

export function buildDistrictForecastSeries(
  epidemiaData,
  adm3Lookup,
  districtName,
  selectedSpecies
) {
  if (!epidemiaData?.forecasts || !districtName) return null;

  const districtFc = epidemiaData.forecasts.find(
    (forecast) =>
      forecast.species === selectedSpecies &&
      (forecast.district === districtName ||
        findDistrictFromLookup(adm3Lookup, forecast.district)?.properties?.adm3_name ===
          districtName)
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
  }));

  return {
    district: districtName,
    alert,
    rows: [...observedRows, ...forecastRows],
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
