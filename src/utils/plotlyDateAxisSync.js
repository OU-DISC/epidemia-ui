import Plotly from "./plotly";
import { buildVerticalDateLine } from "./chartHighlightDate";
import { normalizeChartAxisDate } from "./plotlyXAxisSync";
import { toPlotlyDateRangeMs } from "./chartDateRange";

export function isPlotlyGraphReady(graphDiv) {
  // Plotly attaches an event emitter API to the graph div (gd.on/gd.emit).
  // If we attempt relayout on a partially initialized or stale div, Plotly can
  // throw async errors like "gd.emit is not a function".
  return Boolean(
    graphDiv &&
      graphDiv._fullLayout &&
      typeof graphDiv.on === "function" &&
      typeof graphDiv.emit === "function"
  );
}

function isBaselinePeriodShape(shape) {
  if (!shape) return false;
  if (shape.type === "rect" && shape.layer === "below") return true;
  if (shape.type === "line" && shape.layer === "below" && shape.line?.dash === "dash") {
    return true;
  }
  return false;
}

function resolveBaselineShapes(graphDiv) {
  const fromLayout = (graphDiv?._fullLayout?.shapes || []).filter(isBaselinePeriodShape);
  if (fromLayout.length) {
    graphDiv._epidemiaBaselineShapes = fromLayout;
    return fromLayout;
  }
  return graphDiv._epidemiaBaselineShapes || [];
}

function highlightShapesMatch(graphDiv, highlightDate) {
  const baseline = resolveBaselineShapes(graphDiv);
  const current = graphDiv?._fullLayout?.shapes || [];
  const currentHighlight = current.slice(baseline.length);
  const expectedHighlight = buildVerticalDateLine(highlightDate);

  if (!expectedHighlight.length) return currentHighlight.length === 0;
  if (currentHighlight.length !== expectedHighlight.length) return false;

  const expectedDay = normalizeChartAxisDate(highlightDate);
  const currentDay = normalizeChartAxisDate(currentHighlight[0]?.x0);
  return expectedDay === currentDay;
}

/** Apply synced hover marker via relayout (not React layout — uirevision blocks shape updates). */
export function applyPlotlyHighlightShapes(graphDiv, highlightDate) {
  if (!isPlotlyGraphReady(graphDiv)) return Promise.resolve();
  if (graphDiv._epidemiaApplyingHighlight) return Promise.resolve();
  if (highlightShapesMatch(graphDiv, highlightDate)) return Promise.resolve();

  graphDiv._epidemiaApplyingHighlight = true;
  const baseline = resolveBaselineShapes(graphDiv);
  try {
    return Plotly.relayout(graphDiv, {
      shapes: [...baseline, ...buildVerticalDateLine(highlightDate)],
    })
      .catch(() => {})
      .finally(() => {
        graphDiv._epidemiaApplyingHighlight = false;
      });
  } catch (_err) {
    graphDiv._epidemiaApplyingHighlight = false;
    return Promise.resolve();
  }
}

/** Apply chart picker dates on a Plotly graph div (after init or when dates change). */
export function applyPlotlyDateRange(graphDiv, startDate, endDate) {
  if (!isPlotlyGraphReady(graphDiv)) return Promise.resolve();
  const msRange = toPlotlyDateRangeMs([startDate, endDate]);
  try {
    if (!msRange) {
      return Plotly.relayout(graphDiv, { "xaxis.autorange": true }).catch(() => {});
    }
    return Plotly.relayout(graphDiv, {
      "xaxis.autorange": false,
      "xaxis.range": msRange,
    }).catch(() => {});
  } catch (err) {
    return Promise.resolve();
  }
}

/** Push the same x-axis span to every registered chart. */
export function syncPlotlyDateRange(registry, startDate, endDate) {
  if (!registry) return Promise.resolve();
  const jobs = [];
  registry.forEach((graphDiv) => {
    jobs.push(applyPlotlyDateRange(graphDiv, startDate, endDate));
  });
  return Promise.all(jobs);
}

export function buildPlotlyDateXAxis(title = "Date") {
  return {
    title,
    type: "date",
    tickangle: -35,
    gridcolor: "#e2e8f1",
    zeroline: false,
    tickfont: { size: 11, color: "#495367" },
    titlefont: { color: "#495367" },
    fixedrange: false,
    autorange: true,
  };
}
