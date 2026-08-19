function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(rows, columns) {
  const header = columns.join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCsvValue(row[column])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

/**
 * Build a demo epidemiology CSV from bundled bootstrap files.
 * Mirrors backend build_sample_epi_csv so demos work without the API.
 */
export async function buildSampleEpiCsvFromReport() {
  const bootstrapUrls = [
    "/report_bootstrap.json",
    "/report_bootstrap_h12.json",
    "/report_bootstrap_h8.json",
  ];

  let payload = null;
  for (const url of bootstrapUrls) {
    const response = await fetch(url);
    if (!response.ok) continue;
    payload = await response.json();
    if (payload?.forecasts?.length) break;
  }

  if (!payload?.forecasts?.length) {
    throw new Error("Sample bootstrap files were not found in the app bundle.");
  }
  const alertsByDistrict = Object.fromEntries(
    (payload.alerts || [])
      .filter((alert) => alert?.district)
      .map((alert) => [alert.district, alert])
  );

  const rowsByKey = new Map();

  (payload.forecasts || []).forEach((forecast) => {
    const district = forecast?.district;
    const species = forecast?.species;
    if (!district || !species) return;

    const population = alertsByDistrict[district]?.population_at_risk ?? 100000;
    const caseColumn = species === "pfm" ? "test_pf_tot" : "test_pv_only";

    (forecast.observed_history || []).forEach((point) => {
      const weekStart = point?.week_start;
      const observed = point?.observed;
      if (weekStart == null || observed == null) return;

      const key = `${district}|${weekStart}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          obs_date: weekStart,
          woreda_name: district,
          pop_at_risk: population,
          test_pf_tot: 0,
          test_pv_only: 0,
        });
      }

      rowsByKey.get(key)[caseColumn] = Number(observed);
    });
  });

  const rows = Array.from(rowsByKey.values()).sort((a, b) => {
    const districtCompare = String(a.woreda_name).localeCompare(String(b.woreda_name));
    if (districtCompare !== 0) return districtCompare;
    return String(a.obs_date).localeCompare(String(b.obs_date));
  });

  if (rows.length === 0) {
    throw new Error("Report data did not contain observed history for sample CSV generation.");
  }

  const columns = [
    "obs_date",
    "woreda_name",
    "pop_at_risk",
    "test_pf_tot",
    "test_pv_only",
  ];

  return {
    filename: "sample_epi_data.csv",
    content: rowsToCsv(rows, columns),
  };
}
