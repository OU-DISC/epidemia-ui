function normalizeDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
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
    return null;
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

  return [
    {
      type: "line",
      xref: "x",
      yref: "paper",
      x0: date,
      x1: date,
      y0: 0,
      y1: 1,
      line: { color: "#41506a", width: 1.2, dash: "dash" },
      layer: "above",
    },
  ];
}
