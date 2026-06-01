import { formatDistrictTooltipHtml } from "./alertExplainer";
import { assignTooltipKey } from "./buildAlertTooltipLookup";
import { averageObservedCasesInRange } from "./buildIncidentRateData";

export function buildDistrictTooltipLookup({
  forecastTableRows,
  populationData,
  populationYear,
  surfaceValueForDistrict,
  epidemiaData,
  selectedSpecies,
  startDate,
  endDate,
}) {
  const lookup = {};
  const forecastsByDistrict = new Map(
    (epidemiaData?.forecasts || [])
      .filter((forecast) => forecast.species === selectedSpecies)
      .map((forecast) => [forecast.district, forecast])
  );

  forecastTableRows.forEach((row) => {
    const forecast = forecastsByDistrict.get(row.rawDistrict);
    const averageCases = forecast
      ? averageObservedCasesInRange(forecast.observed_history, startDate, endDate)
      : null;
    const population =
      row.populationAtRisk ??
      surfaceValueForDistrict(populationData, row.mapDistrict) ??
      surfaceValueForDistrict(populationData, row.rawDistrict);
    const html = formatDistrictTooltipHtml({
      region: row.region,
      district: row.mapDistrict,
      population,
      cases: averageCases ?? row.latestObserved,
      populationYear,
      casesLabel: "Avg weekly cases",
    });

    assignTooltipKey(lookup, row.mapDistrict, html);
    assignTooltipKey(lookup, row.rawDistrict, html);
  });

  return lookup;
}
