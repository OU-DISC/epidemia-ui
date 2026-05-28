function parseDay(value) {
  if (!value) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Filter forecast chart rows to [startDate, endDate] inclusive (YYYY-MM-DD). */
export function filterForecastRowsByDateRange(rows, startDate, endDate) {
  if (!rows?.length) return rows || [];

  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (start == null && end == null) return rows;

  return rows.filter((row) => {
    // Keep forecast points even if they extend past the selected endDate, otherwise
    // the chart can show "observations only" when the range ends before the horizon.
    const isForecastPoint = row?.median !== null && row?.median !== undefined;
    if (isForecastPoint) {
      if (start != null) {
        const day = parseDay(row.date);
        return day != null && day >= start;
      }
      return true;
    }
    const day = parseDay(row.date);
    if (day == null) return false;
    if (start != null && day < start) return false;
    if (end != null && day > end) return false;
    return true;
  });
}
