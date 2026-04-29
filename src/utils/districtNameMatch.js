/**
 * Match EPIDEMIA pipeline woreda_name strings to map GeoJSON `adm3_name` values.
 * Admin boundaries and CSVs often differ by spacing, punctuation, or spelling.
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

export function buildAdm3Lookup(geoData) {
  const map = new Map();
  if (!geoData?.features) return map;
  for (const f of geoData.features) {
    const name = f?.properties?.adm3_name;
    if (name == null || name === "") continue;
    map.set(name, f);
    getDistrictNameVariants(name).forEach((variant) => {
      const key = normalizeDistrictKey(variant);
      if (key && !map.has(key)) map.set(key, f);
    });
  }
  return map;
}

export function findDistrictFromLookup(lookup, districtName) {
  if (!lookup || districtName == null) return null;
  const raw = String(districtName);
  const exact = lookup.get(raw) || lookup.get(normalizeDistrictKey(raw));
  if (exact) return exact;
  for (const variant of getDistrictNameVariants(raw)) {
    const match = lookup.get(variant) || lookup.get(normalizeDistrictKey(variant));
    if (match) return match;
  }
  return null;
}
