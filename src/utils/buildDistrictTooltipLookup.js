import { formatDistrictTooltipHtml } from "./alertExplainer";
import { assignTooltipKey } from "./buildAlertTooltipLookup";

export function buildDistrictTooltipLookup({
  forecastTableRows,
  populationData,
  populationYear,
  surfaceValueForDistrict,
}) {
  const lookup = {};

  forecastTableRows
    .filter((row) => row.statusRank <= 1)
    .forEach((row) => {
      const population =
        row.populationAtRisk ?? surfaceValueForDistrict(populationData, row.mapDistrict);
      const html = formatDistrictTooltipHtml({
        region: row.region,
        district: row.mapDistrict,
        population,
        cases: row.latestObserved,
        populationYear,
      });

      assignTooltipKey(lookup, row.mapDistrict, html);
      assignTooltipKey(lookup, row.rawDistrict, html);
    });

  return lookup;
}
