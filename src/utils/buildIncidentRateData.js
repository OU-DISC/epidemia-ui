import { findDistrictFromLookup, getDistrictNameVariants, normalizeDistrictKey } from "./districtNameMatch";

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDay(value) {
  if (!value) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

function isObservedWeekInRange(weekStart, startDate, endDate) {
  const day = parseDay(weekStart);
  if (day == null) return false;
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (start != null && day < start) return false;
  if (end != null && day > end) return false;
  return true;
}

function assignRate(out, name, rate) {
  if (!name || !Number.isFinite(rate)) return;
  const variants = [name, ...getDistrictNameVariants(name)];
  variants.forEach((variant) => {
    out[variant] = rate;
    out[normalizeDistrictKey(variant)] = rate;
  });
}

export function averageObservedCasesInRange(observedHistory, startDate, endDate) {
  const values = (observedHistory || [])
    .filter((point) => isObservedWeekInRange(point.week_start, startDate, endDate))
    .map((point) => finiteNumber(point.observed))
    .filter((value) => value != null);

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildIncidentRateData({
  epidemiaData,
  adm3Lookup,
  populationData,
  selectedSpecies,
  startDate,
  endDate,
  surfaceValueForDistrict,
}) {
  const out = {};
  const forecasts = (epidemiaData?.forecasts || []).filter(
    (forecast) => forecast.species === selectedSpecies
  );
  const alertsByDistrict = new Map(
    (epidemiaData?.alerts || [])
      .filter((alert) => alert.species === selectedSpecies)
      .map((alert) => [alert.district, alert])
  );

  forecasts.forEach((forecast) => {
    let averageCases = averageObservedCasesInRange(
      forecast.observed_history,
      startDate,
      endDate
    );

    if (averageCases == null) {
      const alert = alertsByDistrict.get(forecast.district);
      const fallbackWeek = forecast.forecast?.[0]?.week_start;
      if (
        alert?.latest_observed != null &&
        fallbackWeek &&
        isObservedWeekInRange(fallbackWeek, startDate, endDate)
      ) {
        averageCases = finiteNumber(alert.latest_observed);
      }
    }

    if (averageCases == null) return;

    const district = findDistrictFromLookup(adm3Lookup, forecast.district);
    const mapName = district?.properties?.adm3_name || forecast.district;
    const alert = alertsByDistrict.get(forecast.district);
    const population =
      finiteNumber(alert?.population_at_risk) ??
      surfaceValueForDistrict(populationData, mapName);
    if (population == null || population <= 0) return;

    const rate = (averageCases / population) * 100000;
    assignRate(out, mapName, rate);
    assignRate(out, forecast.district, rate);
  });

  return out;
}
