/** EPIDEMIAR epidemiological week (1–52), matching backend seasonal_gam_thresholds.epidemiar_week. */
export function epidemiarWeek(isoDate) {
  const ms = Date.parse(`${String(isoDate).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(ms)) return null;

  const year = new Date(ms).getUTCFullYear();
  const startMs = Date.UTC(year, 0, 1);
  const doy = Math.floor((ms - startMs) / 86400000) + 1;
  return Math.min(52, Math.max(1, Math.floor((doy - 1) / 7) + 1));
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

export function formatSeasonalDelta(percentVsExpected) {
  if (percentVsExpected == null || !Number.isFinite(percentVsExpected)) return "—";
  if (Math.abs(percentVsExpected) <= 5) return "Typic.";
  const sign = percentVsExpected > 0 ? "+" : "";
  return `${sign}${percentVsExpected}%`;
}

/**
 * Build seasonal context for the latest observed week from district history rows.
 * Each row: { date, observed, detection_threshold? }
 */
export function buildSeasonalContext(observedRows = []) {
  const history = observedRows.filter(
    (point) =>
      point?.date &&
      point.observed !== null &&
      point.observed !== undefined &&
      Number.isFinite(Number(point.observed))
  );
  if (!history.length) return null;

  const latest = history[history.length - 1];
  const week = epidemiarWeek(latest.date);
  if (!week) return null;

  const observed = finiteNumber(latest.observed);
  const expected = finiteNumber(latest.detection_threshold);
  const ratio = observed != null && expected != null && expected > 0 ? observed / expected : null;
  const percentVsExpected = ratio != null ? Math.round((ratio - 1) * 100) : null;

  const byWeek = Array.from({ length: 52 }, () => []);
  for (const point of history) {
    const epidemWeek = epidemiarWeek(point.date);
    if (epidemWeek) byWeek[epidemWeek - 1].push(point);
  }

  const empiricalMedians = byWeek.map((points) =>
    median(
      points
        .map((point) => finiteNumber(point.observed))
        .filter((value) => value != null)
    )
  );

  const ring = byWeek.map((points, index) => {
    for (let i = points.length - 1; i >= 0; i -= 1) {
      const gamExpected = finiteNumber(points[i].detection_threshold);
      if (gamExpected != null && gamExpected > 0) return gamExpected;
    }
    const empirical = empiricalMedians[index];
    return empirical != null && empirical > 0 ? empirical : 0;
  });

  const ringMax = Math.max(...ring, 0);
  const empiricalMedian = empiricalMedians[week - 1];

  if (observed == null) return null;
  if (expected == null && empiricalMedian == null && ringMax === 0) return null;

  return {
    week,
    weekStart: String(latest.date).slice(0, 10),
    observed,
    expected,
    empiricalMedian,
    ratio,
    percentVsExpected,
    ring,
    ringMax,
    hasGamBaseline: expected != null && expected > 0,
  };
}
