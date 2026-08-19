/** Last N observed weeks used for early detection summary (matches epidemiar R). */
export const EARLY_DETECTION_SUMMARY_WEEKS = 4;

const ED_BAND_FILL = "rgba(135, 206, 235, 0.32)";
const EW_BAND_FILL = "rgba(218, 112, 214, 0.28)";
const ED_BAND_LABEL = "#4682b4";
const EW_BAND_LABEL = "#9932cc";
const ALERT_MARKER_COLOR = "#ff6347";
const THRESHOLD_COLOR = "#cd5c5c";

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function shiftDate(dateStr, days) {
  const parsed = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed)) return dateStr;
  const next = new Date(parsed);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function toPlotlyDate(dateStr) {
  const ms = Date.parse(`${String(dateStr).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(ms) ? dateStr : ms;
}

function sortedUniqueDates(dates) {
  return Array.from(new Set(dates.filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function weekAlarm(value, threshold) {
  const v = finiteNumber(value);
  const t = finiteNumber(threshold);
  return v != null && t != null && v > t;
}

/** Farrington upper bound used for observed early-detection markers. */
function resolveAlarmThreshold(point) {
  return finiteNumber(point?.alarm_threshold) ?? finiteNumber(point?.warning_threshold);
}

/** Seasonal expected level used for forecast early-warning markers. */
function resolveExpectedThreshold(point) {
  return finiteNumber(point?.detection_threshold);
}

function bandShape(x0, x1, fill) {
  return {
    type: "rect",
    xref: "x",
    yref: "paper",
    x0: toPlotlyDate(x0),
    x1: toPlotlyDate(x1),
    y0: 0,
    y1: 1,
    fillcolor: fill,
    line: { width: 0 },
    layer: "below",
  };
}

function verticalDivider(x, color = "rgba(120, 120, 120, 0.65)") {
  const plotlyX = toPlotlyDate(x);
  return {
    type: "line",
    xref: "x",
    yref: "paper",
    x0: plotlyX,
    x1: plotlyX,
    y0: 0,
    y1: 1,
    line: { color, width: 1, dash: "dash" },
    layer: "below",
  };
}

function periodLabel(text, x, color) {
  return {
    xref: "x",
    yref: "paper",
    x: toPlotlyDate(x),
    y: 1.03,
    xanchor: "center",
    yanchor: "bottom",
    text,
    showarrow: false,
    font: { size: 10, color },
  };
}

function markerFloorY(values) {
  const maxValue = values.reduce(
    (max, value) => (value != null && value > max ? value : max),
    0
  );
  return Math.max(maxValue * 0.03, 0.5);
}

/**
 * Build Plotly shapes, annotations, and alert marker traces for the district
 * control chart (aligned with epidemia_report_demo_child.Rnw).
 */
export function buildForecastChartLayers(data) {
  const observedPoints = (data || []).filter(
    (point) => point.observed !== null && point.observed !== undefined
  );
  const forecastPoints = (data || []).filter(
    (point) => point.median !== null && point.median !== undefined
  );

  const observedDates = sortedUniqueDates(observedPoints.map((point) => point.date));
  const forecastDates = sortedUniqueDates(forecastPoints.map((point) => point.date));

  const edDates = observedDates.slice(-EARLY_DETECTION_SUMMARY_WEEKS);
  const ewDates = forecastDates;

  const shapes = [];
  const annotations = [];

  if (edDates.length > 0) {
    const x0 = shiftDate(edDates[0], -3);
    const x1 = shiftDate(edDates[edDates.length - 1], 3);
    shapes.push(bandShape(x0, x1, ED_BAND_FILL));
    annotations.push(
      periodLabel(
        "Early Detection",
        shiftDate(edDates[Math.floor(edDates.length / 2)], 0),
        ED_BAND_LABEL
      )
    );
  }

  if (ewDates.length > 0) {
    const x0 = shiftDate(ewDates[0], -3);
    const x1 = shiftDate(ewDates[ewDates.length - 1], 3);
    shapes.push(bandShape(x0, x1, EW_BAND_FILL));
    annotations.push(
      periodLabel(
        "Early Warning",
        shiftDate(ewDates[Math.floor(ewDates.length / 2)], 0),
        EW_BAND_LABEL
      )
    );
  }

  if (observedDates.length > 0 && forecastDates.length > 0) {
    const lastObserved = observedDates[observedDates.length - 1];
    const firstForecast = forecastDates[0];
    const dividerDate = shiftDate(lastObserved, 3);
    if (dividerDate <= firstForecast || lastObserved !== firstForecast) {
      shapes.push(verticalDivider(dividerDate));
    }
  }

  const thresholdPoints = [...data]
    .filter(
      (point) =>
        point.warning_threshold !== null &&
        point.warning_threshold !== undefined &&
        point.date
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const thresholdTrace =
    thresholdPoints.length > 0
      ? {
          x: thresholdPoints.map((point) => point.date),
          y: thresholdPoints.map((point) => Number(point.warning_threshold)),
          type: "scatter",
          mode: "lines",
          name: "Warning threshold",
          line: { color: THRESHOLD_COLOR, width: 1.5, dash: "dot" },
          hovertemplate: "Warning threshold: %{y:.2f}<extra></extra>",
        }
      : null;

  const floorValues = [];
  observedPoints.forEach((point) => {
    floorValues.push(finiteNumber(point.observed));
    floorValues.push(finiteNumber(point.warning_threshold));
  });
  forecastPoints.forEach((point) => {
    floorValues.push(finiteNumber(point.median));
    floorValues.push(finiteNumber(point.upper));
    floorValues.push(finiteNumber(point.warning_threshold));
  });
  const markerY = markerFloorY(floorValues.filter((value) => value != null));

  const edAlertDates = [];
  const edAlertWeeks = new Set(edDates);
  observedPoints.forEach((point) => {
    if (!edAlertWeeks.has(point.date)) return;
    if (weekAlarm(point.observed, resolveAlarmThreshold(point))) {
      edAlertDates.push(point.date);
    }
  });

  const ewAlertDates = [];
  forecastPoints.forEach((point) => {
    if (weekAlarm(point.median, resolveExpectedThreshold(point))) {
      ewAlertDates.push(point.date);
    }
  });

  const edAlertTrace =
    edAlertDates.length > 0
      ? {
          x: edAlertDates,
          y: edAlertDates.map(() => markerY),
          type: "scatter",
          mode: "markers",
          name: "ED alert",
          marker: {
            symbol: "triangle-up",
            size: 11,
            color: ALERT_MARKER_COLOR,
            line: { color: "#ffffff", width: 1 },
          },
          hovertemplate:
            "Early Detection Alert<br>Date: %{x}<br>Observed week above threshold<extra></extra>",
        }
      : null;

  const ewAlertTrace =
    ewAlertDates.length > 0
      ? {
          x: ewAlertDates,
          y: ewAlertDates.map(() => markerY),
          type: "scatter",
          mode: "markers",
          name: "EW alert",
          marker: {
            symbol: "triangle-up-open",
            size: 12,
            color: ALERT_MARKER_COLOR,
            line: { color: ALERT_MARKER_COLOR, width: 2 },
          },
          hovertemplate:
            "Early Warning Alert<br>Date: %{x}<br>Forecast week above threshold<extra></extra>",
        }
      : null;

  return {
    shapes,
    annotations,
    thresholdTrace,
    edAlertTrace,
    ewAlertTrace,
    markerY,
  };
}
