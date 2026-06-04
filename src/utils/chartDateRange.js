import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeChartAxisDate } from "./plotlyXAxisSync";

/** Fallback start when no epidemiological report is loaded yet. */
export const CHART_DEFAULT_START_DATE = "2025-01-01";

/** Today's date as YYYY-MM-DD (local calendar day). */
export function getChartDefaultEndDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** YYYY-MM-DD one calendar year before the given day (UTC). */
export function subtractOneCalendarYear(day) {
  const text = String(day || "").slice(0, 10);
  const parsed = Date.parse(`${text}T12:00:00Z`);
  if (!text || Number.isNaN(parsed)) return null;

  const date = new Date(parsed);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

export function getFallbackChartDateRange() {
  const endDate = getChartDefaultEndDate();
  return {
    startDate: subtractOneCalendarYear(endDate) || CHART_DEFAULT_START_DATE,
    endDate,
  };
}

/** All observed and forecast week_start values from the loaded report. */
export function collectEpidemiaDataDates(epidemiaData) {
  const dates = new Set();
  (epidemiaData?.forecasts || []).forEach((forecast) => {
    (forecast.observed_history || []).forEach((point) => {
      if (point?.week_start) dates.add(String(point.week_start).slice(0, 10));
    });
    (forecast.forecast || []).forEach((point) => {
      if (point?.week_start) dates.add(String(point.week_start).slice(0, 10));
    });
  });
  return Array.from(dates).filter(Boolean).sort();
}

/**
 * Default chart span: one calendar year ending on the latest week in the report.
 */
export function resolveLatestDataYearRange(epidemiaData) {
  const sorted = collectEpidemiaDataDates(epidemiaData);
  if (!sorted.length) return null;

  const endDate = sorted[sorted.length - 1];
  const startDate = subtractOneCalendarYear(endDate);
  if (!startDate) return null;

  return { startDate, endDate };
}

export function resolveChartDateRange(epidemiaData) {
  return resolveLatestDataYearRange(epidemiaData) || getFallbackChartDateRange();
}
export const CHART_PANEL_MIN_HEIGHT = 150;
export const CHART_PANEL_MAX_HEIGHT = 520;
/** Non-chart chrome (toolbar, hero, panel headers, regional summary, gaps). */
export const CHART_VIEWPORT_CHROME = 450;

export const CHARTS_VIEW_SELECTOR = ".side-panel-body.charts-view";

/** Fallback when the charts panel is not mounted or not yet laid out. */
export function getChartPanelHeight(
  viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900
) {
  const raw = (viewportHeight - CHART_VIEWPORT_CHROME) / 2;
  return Math.min(
    CHART_PANEL_MAX_HEIGHT,
    Math.max(CHART_PANEL_MIN_HEIGHT, Math.round(raw))
  );
}

function clampChartHeight(value) {
  return Math.min(
    CHART_PANEL_MAX_HEIGHT,
    Math.max(CHART_PANEL_MIN_HEIGHT, Math.round(value))
  );
}

/**
 * Divide the charts panel height between Plotly slots after subtracting headers
 * and the regional summary bar.
 */
export function measureChartHeightFromChartsView(panelEl) {
  if (!panelEl?.clientHeight || panelEl.clientHeight < 80) {
    return getChartPanelHeight();
  }

  const style = getComputedStyle(panelEl);
  const gap = parseFloat(style.rowGap) || parseFloat(style.gap) || 4;
  const children = [...panelEl.children].filter((node) => node.nodeType === 1);

  let overhead = 0;
  let chartSlotCount = 0;

  for (const child of children) {
    const chartSlots = child.querySelectorAll(".chart-panel-slot");
    const childHeight = child.offsetHeight || child.getBoundingClientRect().height;

    if (chartSlots.length > 0) {
      chartSlotCount += chartSlots.length;
      let slotsHeight = 0;
      chartSlots.forEach((slot) => {
        slotsHeight += slot.offsetHeight || slot.getBoundingClientRect().height;
      });
      overhead += Math.max(0, childHeight - slotsHeight);
    } else if (childHeight > 0) {
      overhead += childHeight;
    }
  }

  overhead += gap * Math.max(0, children.length - 1);

  const divisor = chartSlotCount > 0 ? chartSlotCount : 2;
  const available = panelEl.clientHeight - overhead;

  if (available <= CHART_PANEL_MIN_HEIGHT) {
    return CHART_PANEL_MIN_HEIGHT;
  }

  return clampChartHeight(available / divisor);
}

/**
 * Plot height from the chart slot's laid-out size (fills flex panel — no gap below plot).
 * Returns { height, slotRef } — attach slotRef to the chart-panel-slot wrapper.
 */
export function useChartSlotHeight() {
  const resizeObserverRef = useRef(null);
  const [height, setHeight] = useState(() => getChartPanelHeight());

  const slotRef = useCallback((node) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    if (!node || typeof window === "undefined") return;

    const measure = () => {
      const measured = Math.round(node.getBoundingClientRect().height);
      if (measured < 40) return;
      const next = clampChartHeight(measured);
      setHeight((prev) => (prev === next ? prev : next));
    };

    measure();

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(measure);
    });
    resizeObserver.observe(node);
    if (node.parentElement) resizeObserver.observe(node.parentElement);
    resizeObserverRef.current = resizeObserver;
  }, []);

  useEffect(() => {
    return () => resizeObserverRef.current?.disconnect();
  }, []);

  return { height, slotRef };
}

/** Static fallback for exports and tests. */
export const CHART_PANEL_HEIGHT = CHART_PANEL_MAX_HEIGHT;

function shiftChartDay(day, days) {
  const text = String(day || "").slice(0, 10);
  const parsed = Date.parse(`${text}T12:00:00Z`);
  if (!text || Number.isNaN(parsed)) return text;
  const date = new Date(parsed);
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

/**
 * Plotly x-axis span: union of picker dates and plotted series so data is never
 * drawn outside a 2000–today style default when pickers and data disagree.
 */
export function resolvePlotlyChartXRange({ startDate, endDate, dataDates = [] }) {
  const sorted = [...new Set(dataDates.map((d) => String(d).slice(0, 10)))]
    .filter(Boolean)
    .sort();

  let rangeStart = startDate ? normalizeChartAxisDate(startDate) : null;
  let rangeEnd = endDate ? normalizeChartAxisDate(endDate) : null;

  if (sorted.length) {
    const dataMin = sorted[0];
    const dataMax = sorted[sorted.length - 1];
    if (!rangeStart && !rangeEnd) {
      return [shiftChartDay(dataMin, -7), shiftChartDay(dataMax, 7)];
    }
    const toMs = (day) => Date.parse(`${day}T00:00:00Z`);
    const msValues = [rangeStart, rangeEnd, dataMin, dataMax]
      .filter(Boolean)
      .map(toMs)
      .filter((ms) => !Number.isNaN(ms));
    if (msValues.length) {
      const minMs = Math.min(...msValues);
      const maxMs = Math.max(...msValues);
      rangeStart = new Date(minMs).toISOString().slice(0, 10);
      rangeEnd = new Date(maxMs).toISOString().slice(0, 10);
    }
  }

  if (rangeStart && rangeEnd) {
    return [shiftChartDay(rangeStart, -7), shiftChartDay(rangeEnd, 7)];
  }
  return null;
}

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
    tickfont: { size: 9, color: "#495367" },
    titlefont: { color: "#495367" },
    ...(plotlyRange
      ? { range: plotlyRange, autorange: false, fixedrange: false }
      : { autorange: true }),
  };
}
