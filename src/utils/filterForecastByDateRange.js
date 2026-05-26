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
    const day = parseDay(row.date);
    if (day == null) return false;
    if (start != null && day < start) return false;
    if (end != null && day > end) return false;
    return true;
  });
}
