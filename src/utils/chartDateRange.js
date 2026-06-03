import { normalizeChartAxisDate } from "./plotlyXAxisSync";

export const CHART_DEFAULT_START_DATE = "2025-10-31";

/** Today's date as YYYY-MM-DD (local calendar day). */
export function getChartDefaultEndDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
export const CHART_PANEL_HEIGHT = 330;

/** Default x-axis span: chart date pickers, then optional override, then data extent. */
export function resolveChartXAxisRange({
  startDate,
  endDate,
  syncedXRange,
  dataDates = [],
}) {
  if (syncedXRange?.length === 2) {
    return [syncedXRange[0], syncedXRange[1]];
  }
  if (startDate && endDate) {
    return [startDate, endDate];
  }
  const sorted = [...dataDates].filter(Boolean).sort();
  if (sorted.length >= 2) {
    return [sorted[0], sorted[sorted.length - 1]];
  }
  return null;
}

/** Plotly uirevision — stable for a scope; do not embed dates (hover updates must not reset zoom). */
export function chartRangeUiRevision(prefix, chartScopeKey = "", suffix = "") {
  return `${prefix}-${chartScopeKey || "scope"}${suffix}`;
}

/** Convert a chart day string or ms timestamp to Plotly date-axis milliseconds (UTC noon). */
export function toPlotlyDateMs(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const day = normalizeChartAxisDate(value);
  if (!day) return null;
  return Date.parse(`${day}T12:00:00.000Z`);
}

/** Build Plotly x-axis range as [ms, ms] so both charts share an identical scale. */
export function toPlotlyDateRangeMs(range) {
  if (!range || range.length !== 2) return null;
  const startMs = toPlotlyDateMs(range[0]);
  const endMs = toPlotlyDateMs(range[1]);
  if (startMs == null || endMs == null) return null;
  return startMs <= endMs ? [startMs, endMs] : [endMs, startMs];
}

/** Shared x-axis config — always uses millisecond range when bounds are known. */
export function buildSyncedDateXAxis({ title = "Date", range }) {
  const plotlyRange = toPlotlyDateRangeMs(range);

  return {
    title,
    type: "date",
    tickangle: -35,
    gridcolor: "#e2e8f1",
    zeroline: false,
    tickfont: { size: 11, color: "#495367" },
    titlefont: { color: "#495367" },
    ...(plotlyRange
      ? { range: plotlyRange, autorange: false, fixedrange: false }
      : { autorange: true }),
  };
}
