const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const GEO_PATH = path.join(PUBLIC_DIR, "eth_admin3.geojson");
const POP_PATH = path.join(PUBLIC_DIR, "ethiopia_population_2022.json");
const SPLIT_PATH = path.join(PUBLIC_DIR, "ethiopia_population_parent_splits.csv");
const CSV_OUT = path.join(PUBLIC_DIR, "ethiopia_admin3_population_crosswalk.csv");
const SUMMARY_OUT = path.join(PUBLIC_DIR, "ethiopia_admin3_population_crosswalk_summary.json");
const SURFACE_OUT = path.join(PUBLIC_DIR, "ethiopia_admin3_population_surface.json");

function normalizeName(value) {
  if (value == null || value === "") return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/&/g, "and")
    .replace(/\b(woreda|district|special|town|administration)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function replaceWord(value, from, to) {
  return value.replace(new RegExp(`\\b${from}\\b`, "gi"), to);
}

function variants(value) {
  if (value == null || value === "") return [];
  const raw = String(value).trim();
  const out = new Set([raw]);

  for (const item of Array.from(out)) {
    out.add(item.replace(/\s*\([^)]*\)\s*/g, " ").trim());
  }

  for (const item of Array.from(out)) {
    out.add(item.replace(/\s+town\s+administration$/i, "").trim());
    out.add(item.replace(/\s+town$/i, "").trim());
    out.add(item.replace(/\s+zuriya$/i, " Zuria").trim());
    out.add(item.replace(/\s+zuria$/i, " Zuriya").trim());
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
    for (const item of Array.from(out)) {
      out.add(replaceWord(item, a, b).trim());
      out.add(replaceWord(item, b, a).trim());
    }
  }

  return Array.from(out).filter(Boolean);
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function addIndex(map, key, record) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(record);
}

function levenshtein(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const dp = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0)
  );
  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[left.length][right.length];
}

function similarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  const maxLen = Math.max(left.length, right.length);
  return maxLen === 0 ? 0 : 1 - levenshtein(left, right) / maxLen;
}

const geo = JSON.parse(fs.readFileSync(GEO_PATH, "utf8"));
const population = JSON.parse(fs.readFileSync(POP_PATH, "utf8"));

const byCode = new Map();
const byExactName = new Map();
const byNormalizedName = new Map();
const byVariantName = new Map();

for (const record of population) {
  const pop = Number(record.population_projection_2022);
  if (!Number.isFinite(pop)) continue;

  if (record.admin_code) addIndex(byCode, String(record.admin_code), record);

  const names = [record.name, ...(record.aliases || [])].filter(Boolean);
  for (const name of names) {
    addIndex(byExactName, name, record);
    addIndex(byNormalizedName, normalizeName(name), record);
    for (const variant of variants(name)) {
      addIndex(byVariantName, normalizeName(variant), record);
    }
  }
}

function choose(candidates) {
  if (!candidates || candidates.length === 0) return null;
  return candidates[0];
}

function findPopulationRecord({ code, name }) {
  const byCodeHit = code ? choose(byCode.get(String(code))) : null;
  if (byCodeHit) return byCodeHit;

  const names = variants(name || "");
  for (const candidateName of names) {
    const key = normalizeName(candidateName);
    const hit =
      choose(byExactName.get(candidateName)) ||
      choose(byNormalizedName.get(key)) ||
      choose(byVariantName.get(key));
    if (hit) return hit;
  }

  return null;
}

function matchFeature(feature) {
  const props = feature.properties || {};
  const geoName = props.adm3_name || "";
  const geoCode = props.adm3_pcode || "";
  const geoNormalized = normalizeName(geoName);

  const codeHit = choose(byCode.get(String(geoCode)));
  if (codeHit) {
    return {
      record: codeHit,
      method: "admin_code",
      confidence: 1,
      matchKey: String(geoCode),
      candidateCount: byCode.get(String(geoCode)).length,
    };
  }

  const exactHit = choose(byExactName.get(geoName));
  if (exactHit) {
    return {
      record: exactHit,
      method: "exact_name",
      confidence: 0.95,
      matchKey: geoName,
      candidateCount: byExactName.get(geoName).length,
    };
  }

  const normalizedHit = choose(byNormalizedName.get(geoNormalized));
  if (normalizedHit) {
    return {
      record: normalizedHit,
      method: "normalized_name",
      confidence: 0.85,
      matchKey: geoNormalized,
      candidateCount: byNormalizedName.get(geoNormalized).length,
    };
  }

  for (const variant of variants(geoName)) {
    const key = normalizeName(variant);
    const variantHit = choose(byVariantName.get(key));
    if (variantHit) {
      return {
        record: variantHit,
        method: "alias_variant",
        confidence: 0.72,
        matchKey: key,
        candidateCount: byVariantName.get(key).length,
      };
    }
  }

  return {
    record: null,
    method: "unmatched",
    confidence: 0,
    matchKey: geoNormalized,
    candidateCount: 0,
  };
}

const rows = [];
const usedPopulationCodes = new Set();
const counts = {};
const byRegionMissing = {};
const rowByGeoCode = new Map();

for (const feature of geo.features || []) {
  const props = feature.properties || {};
  const match = matchFeature(feature);
  const record = match.record;
  counts[match.method] = (counts[match.method] || 0) + 1;

  if (record?.admin_code) usedPopulationCodes.add(String(record.admin_code));
  if (match.method === "unmatched") {
    const region = props.adm1_name || "Unknown";
    byRegionMissing[region] = (byRegionMissing[region] || 0) + 1;
  }

  const row = {
    geojson_admin3_name: props.adm3_name || "",
    geojson_admin3_code: props.adm3_pcode || "",
    geojson_admin2_name: props.adm2_name || "",
    geojson_admin1_name: props.adm1_name || "",
    geojson_normalized_name: normalizeName(props.adm3_name || ""),
    citypopulation_name: record?.name || "",
    citypopulation_code: record?.admin_code || "",
    citypopulation_status: record?.status || "",
    citypopulation_normalized_name: normalizeName(record?.name || ""),
    population_census_2007: record?.population_census_2007 ?? "",
    population_projection_2022: record?.population_projection_2022 ?? "",
    match_method: match.method,
    match_confidence: match.confidence,
    match_key: match.matchKey,
    candidate_count: match.candidateCount,
  };
  rows.push(row);
  if (row.geojson_admin3_code) rowByGeoCode.set(row.geojson_admin3_code, row);
}

const splitRows = readCsv(SPLIT_PATH).filter(
  (row) =>
    row.geojson_admin3_code &&
    (row.citypopulation_parent_code || row.citypopulation_parent_name)
);

const splitGroups = new Map();
for (const split of splitRows) {
  const row = rowByGeoCode.get(split.geojson_admin3_code);
  if (!row || row.match_method !== "unmatched") continue;

  const parent = findPopulationRecord({
    code: split.citypopulation_parent_code,
    name: split.citypopulation_parent_name,
  });
  if (!parent) continue;

  const parentKey = parent.admin_code || normalizeName(parent.name);
  if (!splitGroups.has(parentKey)) {
    splitGroups.set(parentKey, { parent, children: [] });
  }
  const parsedWeight = Number(split.allocation_weight);
  splitGroups.get(parentKey).children.push({
    row,
    weight: Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 1,
    explicitWeight: Number.isFinite(parsedWeight) && parsedWeight > 0,
  });
}

for (const { parent, children } of splitGroups.values()) {
  const parentPopulation = Number(parent.population_projection_2022);
  if (!Number.isFinite(parentPopulation) || children.length === 0) continue;

  const totalWeight = children.reduce((sum, child) => sum + child.weight, 0);
  const hasExplicitWeight = children.some((child) => child.explicitWeight);
  for (const child of children) {
    const allocatedPopulation = Math.round((parentPopulation * child.weight) / totalWeight);
    const row = child.row;
    counts[row.match_method] = Math.max((counts[row.match_method] || 1) - 1, 0);
    row.citypopulation_name = parent.name || "";
    row.citypopulation_code = parent.admin_code || "";
    row.citypopulation_status = parent.status || "";
    row.citypopulation_normalized_name = normalizeName(parent.name || "");
    row.population_census_2007 = parent.population_census_2007 ?? "";
    row.population_projection_2022 = allocatedPopulation;
    row.match_method = hasExplicitWeight ? "parent_split_weighted" : "parent_split_equal";
    row.match_confidence = hasExplicitWeight ? 0.62 : 0.55;
    row.match_key = parent.admin_code || normalizeName(parent.name || "");
    row.candidate_count = children.length;
    counts[row.match_method] = (counts[row.match_method] || 0) + 1;
    if (parent.admin_code) usedPopulationCodes.add(String(parent.admin_code));
  }
}

const unmatchedAfterSplits = rows.filter((row) => row.match_method === "unmatched");
const splitTemplateRows = unmatchedAfterSplits.map((row) => ({
  geojson_admin3_code: row.geojson_admin3_code,
  geojson_admin3_name: row.geojson_admin3_name,
  geojson_admin2_name: row.geojson_admin2_name,
  geojson_admin1_name: row.geojson_admin1_name,
  geojson_normalized_name: row.geojson_normalized_name,
  citypopulation_parent_code: "",
  citypopulation_parent_name: "",
  suggested_parent_code: "",
  suggested_parent_name: "",
  suggested_parent_score: "",
  allocation_weight: "",
  notes: "",
}));

const scoredPopulation = population.map((record) => ({
  record,
  normalizedName: normalizeName(record.name),
}));

for (const row of splitTemplateRows) {
  const sameRegionPrefix = String(row.geojson_admin3_code || "").slice(0, 4);
  let best = null;
  for (const candidate of scoredPopulation) {
    const candidateCode = String(candidate.record.admin_code || "");
    const sameRegionBonus = candidateCode.startsWith(sameRegionPrefix) ? 0.08 : 0;
    const score =
      Math.max(
        similarity(row.geojson_admin3_name, candidate.record.name),
        similarity(row.geojson_admin2_name, candidate.record.name)
      ) + sameRegionBonus;
    if (!best || score > best.score) best = { ...candidate, score };
  }

  if (best && best.score >= 0.42) {
    row.suggested_parent_code = best.record.admin_code || "";
    row.suggested_parent_name = best.record.name || "";
    row.suggested_parent_score = best.score.toFixed(2);
  }
}

const splitHeaders = Object.keys(splitTemplateRows[0] || {
  geojson_admin3_code: "",
  geojson_admin3_name: "",
  geojson_admin2_name: "",
  geojson_admin1_name: "",
  geojson_normalized_name: "",
  citypopulation_parent_code: "",
  citypopulation_parent_name: "",
  suggested_parent_code: "",
  suggested_parent_name: "",
  suggested_parent_score: "",
  allocation_weight: "",
  notes: "",
});

const existingSplitByCode = new Map(readCsv(SPLIT_PATH).map((row) => [row.geojson_admin3_code, row]));
const mergedSplitTemplateRows = [
  ...Array.from(existingSplitByCode.values()),
  ...splitTemplateRows.filter((row) => !existingSplitByCode.has(row.geojson_admin3_code)),
];
const splitCsv = [
  splitHeaders.join(","),
  ...mergedSplitTemplateRows.map((row) =>
    splitHeaders.map((header) => csvEscape(row[header])).join(",")
  ),
].join("\n");
fs.writeFileSync(SPLIT_PATH, `${splitCsv}\n`, "utf8");

const finalCounts = {};
const finalByRegionMissing = {};
for (const row of rows) {
  finalCounts[row.match_method] = (finalCounts[row.match_method] || 0) + 1;
  if (row.match_method === "unmatched") {
    finalByRegionMissing[row.geojson_admin1_name || "Unknown"] =
      (finalByRegionMissing[row.geojson_admin1_name || "Unknown"] || 0) + 1;
  }
}

const headers = Object.keys(rows[0] || {});
const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
].join("\n");
fs.writeFileSync(CSV_OUT, `${csv}\n`, "utf8");

const surface = {};
for (const row of rows) {
  const population = Number(row.population_projection_2022);
  if (!Number.isFinite(population)) continue;

  const names = [
    row.geojson_admin3_name,
    row.geojson_admin3_code,
    row.geojson_normalized_name,
  ].filter(Boolean);

  for (const name of names) {
    surface[name] = population;
    surface[normalizeName(name)] = population;
  }
}
fs.writeFileSync(SURFACE_OUT, `${JSON.stringify(surface, null, 2)}\n`, "utf8");

const unmatchedGeo = rows
  .filter((row) => row.match_method === "unmatched")
  .map((row) => ({
    geojson_admin1_name: row.geojson_admin1_name,
    geojson_admin2_name: row.geojson_admin2_name,
    geojson_admin3_name: row.geojson_admin3_name,
    geojson_admin3_code: row.geojson_admin3_code,
    geojson_normalized_name: row.geojson_normalized_name,
  }));

const unusedPopulation = population
  .filter((record) => record.admin_code && !usedPopulationCodes.has(String(record.admin_code)))
  .map((record) => ({
    citypopulation_name: record.name,
    citypopulation_code: record.admin_code,
    citypopulation_status: record.status,
    citypopulation_normalized_name: normalizeName(record.name),
    population_projection_2022: record.population_projection_2022,
  }));

const summary = {
  generated_at: new Date().toISOString(),
  geojson_districts: rows.length,
  citypopulation_records: population.length,
  matched: rows.length - (finalCounts.unmatched || 0),
  unmatched: finalCounts.unmatched || 0,
  parent_split_rows_available: splitRows.length,
  match_counts: finalCounts,
  unmatched_by_region: finalByRegionMissing,
  unmatched_geo_sample: unmatchedGeo.slice(0, 100),
  unused_citypopulation_sample: unusedPopulation.slice(0, 100),
  outputs: {
    csv: path.relative(ROOT, CSV_OUT).replace(/\\/g, "/"),
    surface: path.relative(ROOT, SURFACE_OUT).replace(/\\/g, "/"),
    parent_splits: path.relative(ROOT, SPLIT_PATH).replace(/\\/g, "/"),
    summary: path.relative(ROOT, SUMMARY_OUT).replace(/\\/g, "/"),
  },
};

fs.writeFileSync(SUMMARY_OUT, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(`Wrote ${path.relative(process.cwd(), CSV_OUT)}`);
console.log(`Wrote ${path.relative(process.cwd(), SURFACE_OUT)}`);
console.log(`Wrote ${path.relative(process.cwd(), SUMMARY_OUT)}`);
console.log(`Matched ${summary.matched}/${summary.geojson_districts}; unmatched ${summary.unmatched}`);
