import {
  findDistrictFromLookup,
  getDistrictNameVariants,
  normalizeDistrictKey,
  resolveDistrictFeature,
} from "./districtNameMatch";
import { buildAlertExplanation, formatAlertTooltipHtml } from "./alertExplainer";
import {
  resolveForecastForDistrict,
  resolveTooltipPopulation,
} from "./buildDistrictTooltipLookup";

export function tooltipHtmlHasContent(html) {
  if (!html) return false;
  return String(html).replace(/<[^>]+>/g, "").replace(/\s+/g, "").length > 0;
}

export function assignTooltipKey(lookup, key, html) {
  if (!key || !tooltipHtmlHasContent(html)) return;
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

function collectDistrictNameCandidates(districtName, adm3Lookup, geoData, feature) {
  const names = new Set();
  const add = (value) => {
    if (value == null || value === "") return;
    names.add(String(value).trim());
    getDistrictNameVariants(value).forEach((variant) => names.add(variant));
  };

  add(districtName);
  add(feature?.properties?.adm3_name);
  add(feature?.properties?.W_NAME);

  const linked = resolveDistrictFeature(adm3Lookup, districtName, geoData);
  add(linked?.properties?.adm3_name);
  add(linked?.properties?.W_NAME);

  if (linked && adm3Lookup?.size) {
    for (const key of adm3Lookup.keys()) {
      if (findDistrictFromLookup(adm3Lookup, key) === linked) {
        add(key);
      }
    }
  }

  return Array.from(names).filter(Boolean);
}

/** Shared map tooltip resolver — district facts first (matches alert pin hover). */
export function resolveMapDistrictTooltipHtml({
  districtName,
  districtTooltipByDistrict,
  alertTooltipByDistrict,
  adm3Lookup,
  geoData = null,
  feature = null,
}) {
  if (!districtName) return null;

  const candidates = collectDistrictNameCandidates(
    districtName,
    adm3Lookup,
    geoData,
    feature
  );

  for (const name of candidates) {
    const districtHtml = resolveLookupEntry(
      districtTooltipByDistrict,
      name,
      adm3Lookup
    );
    if (tooltipHtmlHasContent(districtHtml)) return districtHtml;
  }

  for (const name of candidates) {
    const alertHtml = resolveLookupEntry(alertTooltipByDistrict, name, adm3Lookup);
    if (tooltipHtmlHasContent(alertHtml)) return alertHtml;
  }

  return null;
}

export function buildAlertTooltipLookup({
  forecastTableRows,
  alerts,
  selectedSpecies,
  speciesLabel = "P. falciparum",
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
      const explanation = buildAlertExplanation({
        districtName: row.mapDistrict,
        regionName: row.region,
        speciesLabel,
        alert,
        insight: {
          status: row.status,
          latestObserved: row.latestObserved,
          latestForecast: row.latestForecast,
          activeThreshold: row.activeThreshold,
          magnitudePercent: row.magnitudePercent,
          persistenceWeeks: row.persistenceWeeks,
          warningThreshold: row.warningThreshold,
          detectionThreshold: row.detectionThreshold,
          earlyWarning: row.earlyWarning,
          earlyDetection: row.earlyDetection,
        },
        population,
        populationYear,
        observedHistory: forecast?.observed_history || [],
        forecastPoints: forecast?.forecast || [],
      });
      const html = formatAlertTooltipHtml(row.mapDistrict, explanation);

      assignTooltipKey(lookup, row.mapDistrict, html);
      assignTooltipKey(lookup, row.rawDistrict, html);
    });

  return lookup;
}
