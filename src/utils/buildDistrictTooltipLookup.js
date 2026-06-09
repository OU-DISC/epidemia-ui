import { averageObservedCasesInRange } from "./buildIncidentRateData";
import { findDistrictFromLookup } from "./districtNameMatch";
import { findDistrictForecastRow } from "./epidemiaReportMerge";
import { formatDistrictTooltipHtml } from "./alertExplainer";
import { assignTooltipKey } from "./buildAlertTooltipLookup";

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveForecastForDistrict(
  epidemiaData,
  adm3Lookup,
  mapDistrict,
  rawDistrict,
  selectedSpecies
) {
  const report = epidemiaData?.forecasts?.length ? epidemiaData : null;
  if (report) {
    const byMap = findDistrictForecastRow(report, adm3Lookup, mapDistrict, selectedSpecies);
    if (byMap) return byMap;
    const byRaw = findDistrictForecastRow(report, adm3Lookup, rawDistrict, selectedSpecies);
    if (byRaw) return byRaw;
  }

  return (epidemiaData?.forecasts || []).find(
    (forecast) =>
      forecast.species === selectedSpecies &&
      (forecast.district === rawDistrict || forecast.district === mapDistrict)
  );
}

export function resolveTooltipAverageCases(forecast, alert, startDate, endDate) {
  let averageCases = averageObservedCasesInRange(
    forecast?.observed_history,
    startDate,
    endDate
  );
  if (averageCases != null) return averageCases;

  averageCases = averageObservedCasesInRange(forecast?.observed_history, null, null);
  if (averageCases != null) return averageCases;

  const latestObserved = finiteNumber(alert?.latest_observed);
  if (latestObserved != null) return latestObserved;

  const history = forecast?.observed_history || [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const value = finiteNumber(history[index]?.observed);
    if (value != null) return value;
  }

  return null;
}

export function resolveTooltipPopulation(row, alert, populationData, surfaceValueForDistrict) {
  const fromRow = finiteNumber(row?.populationAtRisk);
  if (fromRow != null) return fromRow;

  const fromAlert = finiteNumber(alert?.population_at_risk);
  if (fromAlert != null) return fromAlert;

  for (const name of [row?.mapDistrict, row?.rawDistrict]) {
    const fromSurface = surfaceValueForDistrict?.(populationData, name);
    if (fromSurface != null) return fromSurface;
  }

  return null;
}

export function buildDistrictTooltipLookup({
  forecastTableRows,
  populationData,
  populationYear,
  surfaceValueForDistrict,
  epidemiaData,
  adm3Lookup,
  speciesAlerts = [],
  selectedSpecies,
  startDate,
  endDate,
}) {
  const lookup = {};
  const alertsByDistrict = new Map(
    (speciesAlerts || []).map((alert) => [alert.district, alert])
  );

  forecastTableRows.forEach((row) => {
    const alert =
      alertsByDistrict.get(row.rawDistrict) ||
      alertsByDistrict.get(row.mapDistrict) ||
      (adm3Lookup
        ? (speciesAlerts || []).find((item) => {
            const feature = findDistrictFromLookup(adm3Lookup, item.district);
            const mapName = feature?.properties?.adm3_name;
            return mapName === row.mapDistrict || item.district === row.rawDistrict;
          })
        : null);

    const forecast = resolveForecastForDistrict(
      epidemiaData,
      adm3Lookup,
      row.mapDistrict,
      row.rawDistrict,
      selectedSpecies
    );
    const averageCases = resolveTooltipAverageCases(forecast, alert, startDate, endDate);
    const population = resolveTooltipPopulation(
      row,
      alert,
      populationData,
      surfaceValueForDistrict
    );
    const html = formatDistrictTooltipHtml({
      region: row.region,
      district: row.mapDistrict,
      population,
      cases: averageCases,
      populationYear,
      casesLabel: "Avg weekly cases",
      status: row.statusRank > 1 ? row.status : null,
    });

    assignTooltipKey(lookup, row.mapDistrict, html);
    assignTooltipKey(lookup, row.rawDistrict, html);
  });

  return lookup;
}
