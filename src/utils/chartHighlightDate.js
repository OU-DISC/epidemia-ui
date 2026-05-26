import { normalizeChartAxisDate } from "./plotlyXAxisSync";

function normalizeDate(value) {
  if (value == null || value === "") return null;
  const normalized = normalizeChartAxisDate(value);
  if (!normalized || normalized.length < 10) return null;
  return normalized.slice(0, 10);
}

export function normalizeHoverDate(value) {
  const normalized = normalizeDate(value);
  if (!normalized || normalized.length < 10) return null;
  return normalized;
}

function dateWithinRange(date, chartDates) {
  const target = normalizeDate(date);
  if (!target || !chartDates?.length) return false;

  const sorted = chartDates.map(normalizeDate).filter(Boolean).sort();
  if (!sorted.length) return false;

  return target >= sorted[0] && target <= sorted[sorted.length - 1];
}

function snapToNearestChartDate(date, chartDates) {
  const target = normalizeDate(date);
  if (!target || !chartDates?.length) return null;

  const sorted = chartDates.map(normalizeDate).filter(Boolean).sort();
  if (!sorted.length) return null;

  const exact = sorted.find((day) => day === target);
  if (exact) return exact;

  const targetMs = Date.parse(`${target}T00:00:00Z`);
  if (Number.isNaN(targetMs)) return null;

  let nearest = null;
  let nearestDiff = Infinity;
  for (const day of sorted) {
    const dayMs = Date.parse(`${day}T00:00:00Z`);
    if (Number.isNaN(dayMs)) continue;
    const diff = Math.abs(dayMs - targetMs);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearest = day;
    }
  }

  return nearest;
}

/**
 * Pick the date for a synced vertical chart marker.
 * Hover takes priority so linked charts stay in sync; animation fills in otherwise.
 */
export function resolveChartHighlightDate({
  alertTimeMode,
  alertAnimationWeek,
  syncedHoverDate,
  chartDates,
}) {
  if (!chartDates?.length) return null;

  const resolve = (candidate) => {
    const normalized = normalizeDate(candidate);
    if (!normalized) return null;

    const exact = chartDates.some((date) => normalizeDate(date) === normalized);
    if (exact) return normalized;
    if (dateWithinRange(normalized, chartDates)) return normalized;
    return snapToNearestChartDate(normalized, chartDates);
  };

  const hovered = resolve(syncedHoverDate);
  if (hovered) return hovered;

  if (alertTimeMode === "animate") {
    return resolve(alertAnimationWeek);
  }

  return null;
}

export function buildVerticalDateLine(date) {
  if (!date) return [];

  const day = String(date).slice(0, 10);
  const ms = Date.parse(`${day}T12:00:00Z`);
  const x = Number.isNaN(ms) ? day : ms;

  return [
    {
      type: "line",
      xref: "x",
      yref: "paper",
      x0: x,
      x1: x,
      y0: 0,
      y1: 1,
      line: { color: "#41506a", width: 1.2, dash: "dash" },
      layer: "above",
    },
  ];
}
