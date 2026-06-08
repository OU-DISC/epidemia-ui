import {
  parseCsvHeaders,
  parseCsvLine,
  REQUIRED_EPI_COLUMNS,
} from "./validateEpiCsv";

export const EPI_COLUMN_ALIASES = {
  obs_date: [
    "obs_date",
    "obsdate",
    "date",
    "week_start",
    "weekstart",
    "observation_date",
    "report_date",
    "reporting_date",
  ],
  woreda_name: [
    "woreda_name",
    "woredaname",
    "woreda",
    "district",
    "district_name",
    "w_name",
    "woredahospital",
    "woreda_hospital",
    "site",
    "location",
    "admin3_name",
  ],
  pop_at_risk: [
    "pop_at_risk",
    "popatrisk",
    "population",
    "population_at_risk",
    "pop",
    "par",
  ],
  test_pf_tot: [
    "test_pf_tot",
    "testpftot",
    "pf_cases",
    "pospf_cases",
    "pf",
    "pf_tot",
    "falciparum",
    "pf_positive",
    "pf_mixed",
    "test_pf",
    "pos_pf",
  ],
  test_pv_only: [
    "test_pv_only",
    "testpvonly",
    "pv_cases",
    "pospv_cases",
    "pv",
    "pv_only",
    "vivax",
    "pv_positive",
    "pos_pv",
  ],
};

function normalizeHeader(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function escapeCsvValue(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseCsvRows(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return { headers: parseCsvHeaders(text), rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line).map((cell) => cell.replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

export function needsColumnMapping(clientValidation) {
  return (clientValidation?.missing_columns || []).length > 0;
}

export function suggestColumnMapping(headers = []) {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    norm: normalizeHeader(header),
  }));
  const usedSources = new Set();

  const mapping = {};
  for (const target of REQUIRED_EPI_COLUMNS) {
    if (headers.includes(target)) {
      mapping[target] = target;
      usedSources.add(target);
      continue;
    }

    const aliases = EPI_COLUMN_ALIASES[target] || [target];
    const match = normalizedHeaders.find(
      (header) => aliases.includes(header.norm) && !usedSources.has(header.original)
    );
    mapping[target] = match?.original || "";
    if (match?.original) {
      usedSources.add(match.original);
    }
  }

  return mapping;
}

export function validateColumnMapping(mapping = {}, headers = []) {
  const errors = [];
  const missing = REQUIRED_EPI_COLUMNS.filter((column) => !mapping[column]);
  if (missing.length > 0) {
    errors.push(`Choose a source column for: ${missing.join(", ")}`);
  }

  const sourceToTargets = new Map();
  for (const target of REQUIRED_EPI_COLUMNS) {
    const source = mapping[target];
    if (!source) continue;
    if (!headers.includes(source)) {
      errors.push(`Source column "${source}" was not found in the uploaded CSV`);
      continue;
    }
    const targets = sourceToTargets.get(source) || [];
    targets.push(target);
    sourceToTargets.set(source, targets);
  }

  for (const [source, targets] of sourceToTargets.entries()) {
    if (targets.length > 1) {
      errors.push(`"${source}" cannot map to ${targets.join(" and ")}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function applyColumnMapping(csvText, mapping = {}) {
  const { headers, rows } = parseCsvRows(csvText);
  const check = validateColumnMapping(mapping, headers);
  if (!check.ok) {
    throw new Error(check.errors[0]);
  }

  const mappedRows = rows.map((row) => {
    const mapped = {};
    for (const target of REQUIRED_EPI_COLUMNS) {
      mapped[target] = row[mapping[target]] ?? "";
    }
    return mapped;
  });

  const headerLine = REQUIRED_EPI_COLUMNS.join(",");
  const body = mappedRows
    .map((row) => REQUIRED_EPI_COLUMNS.map((column) => escapeCsvValue(row[column])).join(","))
    .join("\n");

  return `${headerLine}\n${body}\n`;
}
