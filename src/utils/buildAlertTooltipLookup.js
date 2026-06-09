import {
  findDistrictFromLookup,
  getDistrictNameVariants,
  normalizeDistrictKey,
} from "./districtNameMatch";
import { formatDistrictTooltipHtml } from "./alertExplainer";
import {
  resolveForecastForDistrict,
  resolveTooltipAverageCases,
  resolveTooltipPopulation,
} from "./buildDistrictTooltipLookup";

export function assignTooltipKey(lookup, key, html) {
  if (!key || !html) return;
  lookup[key] = html;
  lookup[normalizeDistrictKey(key)] = html;
  getDistrictNameVariants(key).forEach((variant) => {
    lookup[variant] = html;
    lookup[normalizeDistrictKey(variant)] = html;
  });
}

function tryLookupKey(lookup, key) {
  if (!key) return null;
  return lookup[key] ?? lookup[normalizeDistrictKey(key)] ?? null;
}

/** Resolve pre-rendered tooltip HTML across registry vs shapefile district names. */
export function resolveLookupEntry(lookup, districtName, adm3Lookup) {
  if (!lookup || !districtName) return null;

  let hit = tryLookupKey(lookup, districtName);
  if (hit) return hit;

  for (const variant of getDistrictNameVariants(districtName)) {
    hit = tryLookupKey(lookup, variant);
    if (hit) return hit;
  }

  if (!adm3Lookup?.size) return null;

  const feature = findDistrictFromLookup(adm3Lookup, districtName);
  if (!feature) return null;

  const adm3Name = feature.properties?.adm3_name;
  hit = tryLookupKey(lookup, adm3Name);
  if (hit) return hit;

  for (const key of Object.keys(lookup)) {
    if (String(key).startsWith("ET")) continue;
    const linked = findDistrictFromLookup(adm3Lookup, key);
    if (linked === feature) {
      hit = lookup[key];
      if (hit) return hit;
    }
  }

  return null;
}

export function buildAlertTooltipLookup({
  forecastTableRows,
  alerts,
  selectedSpecies,
  populationData,
  populationYear,
  surfaceValueForDistrict,
  epidemiaData,
  adm3Lookup,
  startDate,
  endDate,
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

      const forecast = resolveForecastForDistrict(
        epidemiaData,
        adm3Lookup,
        row.mapDistrict,
        row.rawDistrict,
        selectedSpecies
      );
      const population = resolveTooltipPopulation(
        row,
        alert,
        populationData,
        surfaceValueForDistrict
      );
      const averageCases = resolveTooltipAverageCases(forecast, alert, startDate, endDate);
      const html = formatDistrictTooltipHtml({
        region: row.region,
        district: row.mapDistrict,
        population,
        cases: averageCases,
        populationYear,
        casesLabel: "Avg weekly cases",
        status: row.status,
      });

      assignTooltipKey(lookup, row.mapDistrict, html);
      assignTooltipKey(lookup, row.rawDistrict, html);
    });

  return lookup;
}
