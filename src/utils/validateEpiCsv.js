export const REQUIRED_EPI_COLUMNS = [
  "obs_date",
  "woreda_name",
  "pop_at_risk",
  "test_pf_tot",
  "test_pv_only",
];

export const EPI_COLUMN_HELP = {
  obs_date: "Weekly observation date (YYYY-MM-DD)",
  woreda_name: "District / woreda name matching Amhara reporting list",
  pop_at_risk: "Population at risk for that week",
  test_pf_tot: "P. falciparum cases (tests positive total)",
  test_pv_only: "P. vivax-only cases",
};

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function parseCsvHeaders(text) {
  const firstLine = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);

  if (!firstLine) return [];
  return parseCsvLine(firstLine).map((header) => header.replace(/^"|"$/g, "").trim());
}

export function validateEpiCsvClient(text) {
  const headers = parseCsvHeaders(text);
  const missing = REQUIRED_EPI_COLUMNS.filter((column) => !headers.includes(column));
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const rowCount = Math.max(0, lines.length - 1);

  return {
    ok: missing.length === 0 && rowCount > 0,
    missing_columns: missing,
    row_count: rowCount,
    headers,
  };
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.readAsText(file);
  });
}
