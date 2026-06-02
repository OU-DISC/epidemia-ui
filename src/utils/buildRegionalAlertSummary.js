function isElevatedLevel(level) {
  return level === "Medium" || level === "High";
}

function filterRowsByAdminRegion(rows, selectedAdminRegion) {
  if (
    !selectedAdminRegion ||
    selectedAdminRegion === "All Regions" ||
    selectedAdminRegion === "No Selection"
  ) {
    return rows || [];
  }
  return (rows || []).filter((row) => row.region === selectedAdminRegion);
}

/**
 * Aggregate district alert levels by admin region for bar charts.
 */
export function buildRegionalAlertSummary(rows, selectedAdminRegion) {
  const filtered = filterRowsByAdminRegion(rows, selectedAdminRegion);
  const byRegion = new Map();

  filtered.forEach((row) => {
    const region = row.region?.trim() || "Unknown region";
    if (!byRegion.has(region)) {
      byRegion.set(region, {
        region,
        districts: 0,
        edElevated: 0,
        ewElevated: 0,
        bothElevated: 0,
        anyElevated: 0,
      });
    }

    const agg = byRegion.get(region);
    agg.districts += 1;

    const ed = isElevatedLevel(row.edLevel);
    const ew = isElevatedLevel(row.ewLevel);
    if (ed) agg.edElevated += 1;
    if (ew) agg.ewElevated += 1;
    if (ed && ew) agg.bothElevated += 1;

    if (ed || ew) {
      agg.anyElevated += 1;
    }
  });

  return [...byRegion.values()].sort(
    (a, b) => b.anyElevated - a.anyElevated || a.region.localeCompare(b.region)
  );
}
