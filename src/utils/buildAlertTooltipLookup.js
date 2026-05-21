import { getDistrictNameVariants, normalizeDistrictKey } from "./districtNameMatch";
import { buildAlertExplanation, formatAlertTooltipHtml } from "./alertExplainer";

export function assignTooltipKey(lookup, key, html) {
  if (!key || !html) return;
  lookup[key] = html;
  lookup[normalizeDistrictKey(key)] = html;
  getDistrictNameVariants(key).forEach((variant) => {
    lookup[variant] = html;
    lookup[normalizeDistrictKey(variant)] = html;
  });
}

export function buildAlertTooltipLookup({
  forecastTableRows,
  alerts,
  selectedSpecies,
  speciesLabel,
  populationData,
  incidentRateData,
  populationYear,
  surfaceValueForDistrict,
}) {
  const lookup = {};

  forecastTableRows
    .filter((row) => row.statusRank > 1)
    .forEach((row) => {
      const alert = (alerts || []).find(
        (item) =>
          item.species === selectedSpecies &&
          (item.district === row.rawDistrict || item.district === row.mapDistrict)
      );
      if (!alert) return;

      const population =
        row.populationAtRisk ?? surfaceValueForDistrict(populationData, row.mapDistrict);
      const incidentRate = surfaceValueForDistrict(incidentRateData, row.mapDistrict);
      const explanation = buildAlertExplanation({
        districtName: row.mapDistrict,
        regionName: row.region,
        speciesLabel,
        alert,
        insight: row,
        population,
        populationYear,
        incidentRate,
      });
      const html = formatAlertTooltipHtml(row.mapDistrict, explanation, row);

      assignTooltipKey(lookup, row.mapDistrict, html);
      assignTooltipKey(lookup, row.rawDistrict, html);
    });

  return lookup;
}
