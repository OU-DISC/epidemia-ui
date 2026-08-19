/**
 * Match EPIDEMIA pipeline woreda_name strings to map GeoJSON features.
 * Name variants are tried first; NewPCODE crosswalk resolves remaining mismatches.
 */
export function normalizeDistrictKey(s) {
  if (s == null || s === "") return "";
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizePcode(pcode) {
  if (pcode == null || pcode === "") return "";
  return String(pcode).trim().toUpperCase();
}

/** Static path for a pre-generated per-district forecast cache file. */
export function districtForecastCacheUrl(district, species = "pfm") {
  const speciesNorm = String(species || "pfm").toLowerCase();
  return `/district_forecasts/${speciesNorm}/${normalizeDistrictKey(district)}.json`;
}

function replaceWord(value, from, to) {
  return value.replace(new RegExp(`\\b${from}\\b`, "gi"), to);
}

export function getDistrictNameVariants(s) {
  if (s == null || s === "") return [];
  const raw = String(s).trim();
  const variants = new Set([raw]);

  for (const value of Array.from(variants)) {
    variants.add(value.replace(/\s*\([^)]*\)\s*/g, " ").trim());
  }

  for (const value of Array.from(variants)) {
    variants.add(value.replace(/\s+town\s+administration$/i, "").trim());
    variants.add(value.replace(/\s+town$/i, "").trim());
    variants.add(value.replace(/\s+zuriya$/i, " Zuria").trim());
    variants.add(value.replace(/\s+zuria$/i, " Zuriya").trim());
  }

  const swaps = [
    ["Semen", "North"],
    ["Debub", "South"],
    ["Misrak", "East"],
    ["Mirab", "West"],
    ["Mekele", "Mekelle"],
    ["Bahirdar", "Bahir Dar"],
    ["Wemberma", "Womberma"],
    ["Sahila", "Sehela"],
    ["Denbecha", "Dembecha"],
    ["Adiss", "Addis"],
    ["Wereilu", "Were Ilu"],
    ["Debresina", "Debre Sina"],
    ["Legehida", "Lege Hida"],
  ];

  for (const [a, b] of swaps) {
    for (const value of Array.from(variants)) {
      variants.add(replaceWord(value, a, b).trim());
      variants.add(replaceWord(value, b, a).trim());
    }
  }

  return Array.from(variants).filter(Boolean);
}

export function districtPcodeFromProperties(properties) {
  if (!properties) return null;
  const code = properties?.NewPCODE ?? properties?.adm3_pcode;
  if (code == null || String(code).trim() === "") return null;
  return String(code).trim();
}

export function resolveWoredaPcode(crosswalk, districtName) {
  if (!crosswalk || districtName == null) return null;
  const raw = String(districtName).trim();
  if (!raw) return null;
  const fromName = crosswalk.byName?.[raw];
  if (fromName) return normalizePcode(fromName);
  const fromKey = crosswalk.byKey?.[normalizeDistrictKey(raw)];
  if (fromKey) return normalizePcode(fromKey);
  for (const variant of getDistrictNameVariants(raw)) {
    const pcode = crosswalk.byName?.[variant] || crosswalk.byKey?.[normalizeDistrictKey(variant)];
    if (pcode) return normalizePcode(pcode);
  }
  return null;
}

function assignFeatureKeys(map, feature, keys) {
  keys.forEach((key) => {
    if (!key || map.has(key)) return;
    map.set(key, feature);
  });
}

export function buildAdm3Lookup(geoData, woredaPcodeCrosswalk = null) {
  const map = new Map();
  if (!geoData?.features) return map;

  const byPcode = new Map();
  for (const f of geoData.features) {
    const name = f?.properties?.adm3_name;
    if (name == null || name === "") continue;

    map.set(name, f);
    getDistrictNameVariants(name).forEach((variant) => {
      assignFeatureKeys(map, f, [variant, normalizeDistrictKey(variant)]);
    });

    const pcode = districtPcodeFromProperties(f.properties);
    if (pcode) {
      const norm = normalizePcode(pcode);
      byPcode.set(norm, f);
      map.set(norm, f);
      map.set(pcode, f);
    }
  }

  if (woredaPcodeCrosswalk?.byName) {
    for (const name of Object.keys(woredaPcodeCrosswalk.byName)) {
      const pcode = resolveWoredaPcode(woredaPcodeCrosswalk, name);
      const feature = pcode ? byPcode.get(pcode) : null;
      if (!feature) continue;

      map.set(name, feature);
      assignFeatureKeys(map, feature, [normalizeDistrictKey(name)]);
      getDistrictNameVariants(name).forEach((variant) => {
        assignFeatureKeys(map, feature, [variant, normalizeDistrictKey(variant)]);
      });
    }
  }

  return map;
}

export function findDistrictFromLookup(lookup, districtName) {
  if (!lookup || districtName == null) return null;
  const raw = String(districtName);
  const exact = lookup.get(raw) || lookup.get(normalizeDistrictKey(raw));
  if (exact) return exact;

  const maybePcode = normalizePcode(raw);
  if (maybePcode.startsWith("ET") && lookup.has(maybePcode)) {
    return lookup.get(maybePcode);
  }

  for (const variant of getDistrictNameVariants(raw)) {
    const match = lookup.get(variant) || lookup.get(normalizeDistrictKey(variant));
    if (match) return match;
  }
  return null;
}

/** Resolve a district GeoJSON feature from lookup, with geojson scan fallback. */
export function resolveDistrictFeature(lookup, districtName, geoData = null) {
  const fromLookup = findDistrictFromLookup(lookup, districtName);
  if (fromLookup) return fromLookup;
  if (!geoData?.features?.length || districtName == null) return null;

  const key = normalizeDistrictKey(districtName);
  if (!key) return null;

  return (
    geoData.features.find((f) => normalizeDistrictKey(f?.properties?.adm3_name) === key) ||
    geoData.features.find((f) => normalizeDistrictKey(f?.properties?.W_NAME) === key) ||
    null
  );
}

/** Resolve admin-1 region from a selected district name (map adm3_name or pipeline woreda_name). */
export function resolveAdminRegionForDistrict(lookup, districtName, geoData = null) {
  if (!districtName || districtName === "All Regions") return null;

  const feature = resolveDistrictFeature(lookup, districtName, geoData);
  const adm1 = feature?.properties?.adm1_name;
  return adm1 && String(adm1).trim() ? String(adm1).trim() : null;
}

/** Resolve admin-1 region from geojson NewPCODE / adm3_pcode (e.g. ET010101). */
export function resolveAdminRegionByPcode(geoData, pcode) {
  if (!pcode || !geoData?.features) return null;
  const normalized = normalizePcode(pcode);
  const feature = geoData.features.find((f) => {
    const candidate = districtPcodeFromProperties(f?.properties);
    return candidate != null && normalizePcode(candidate) === normalized;
  });
  const adm1 = feature?.properties?.adm1_name;
  return adm1 && String(adm1).trim() ? String(adm1).trim() : null;
}
