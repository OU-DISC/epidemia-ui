export const CASE_SPARKLINE_WEEKS = 8;

/**
 * Last N weeks of observed cases for table sparklines.
 */
export function buildDistrictCaseSparkline(observedHistory, weeks = CASE_SPARKLINE_WEEKS) {
  const sorted = [...(observedHistory || [])]
    .filter((point) => point?.week_start)
    .sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)))
    .slice(-weeks);

  return {
    values: sorted.map((point) => {
      const value = Number(point.observed);
      return Number.isFinite(value) ? value : 0;
    }),
    weeks: sorted.map((point) => point.week_start),
  };
}
