import Plot from "react-plotly.js";

export default function ForecastChart({ data, alert, syncedHoverDate, onHoverDateChange }) {
  if (!data || data.length === 0) {
    return <div className="chart-state">No forecast data available</div>;
  }

  const forecastPoints = data.filter(
    (d) => d.median !== null && d.median !== undefined
  );
  const observedPoints = data.filter(
    (d) => d.observed !== null && d.observed !== undefined
  );

  const forecastDates = forecastPoints.map((d) => d.date);
  const upper = forecastPoints.map((d) => d.upper);
  const lower = forecastPoints.map((d) => d.lower);
  const median = forecastPoints.map((d) => d.median);

  const observedDates = observedPoints.map((d) => d.date);
  const observed = observedPoints.map((d) => d.observed);
  const chartDates = [...observedDates, ...forecastDates];

  const detectionThreshold =
    alert?.detection_threshold !== null && alert?.detection_threshold !== undefined
      ? Number(alert.detection_threshold)
      : null;
  const warningThreshold =
    alert?.warning_threshold !== null && alert?.warning_threshold !== undefined
      ? Number(alert.warning_threshold)
      : null;

  const isWarning = Boolean(alert?.early_warning);
  const isDetection = Boolean(!alert?.early_warning && alert?.early_detection);
  const alertLabel = isWarning
    ? "Early Warning"
    : isDetection
      ? "Early Detection"
      : null;

  const alertTrace =
    alertLabel && forecastDates.length > 0 && median.length > 0
      ? {
          x: [forecastDates[0]],
          y: [median[0]],
          type: "scatter",
          mode: "markers",
          name: alertLabel,
          marker: {
            size: 12,
            color: isWarning ? "#c43f3f" : "#d48806",
            symbol: "diamond",
            line: { color: "#ffffff", width: 1.5 },
          },
          hovertemplate: `${alertLabel}<br>Date: %{x}<br>Median: %{y:.2f}<extra></extra>`,
        }
      : null;

  const detectionThresholdTrace =
    detectionThreshold !== null && chartDates.length > 0
      ? {
          x: chartDates,
          y: chartDates.map(() => detectionThreshold),
          type: "scatter",
          mode: "lines",
          name: "Detection Threshold",
          line: { color: "#d48806", width: 1.5, dash: "dash" },
          hovertemplate: "Detection Threshold: %{y:.2f}<extra></extra>",
        }
      : null;

  const warningThresholdTrace =
    warningThreshold !== null && chartDates.length > 0
      ? {
          x: chartDates,
          y: chartDates.map(() => warningThreshold),
          type: "scatter",
          mode: "lines",
          name: "Warning Threshold",
          line: { color: "#c43f3f", width: 1.5, dash: "dot" },
          hovertemplate: "Warning Threshold: %{y:.2f}<extra></extra>",
        }
      : null;

  const syncHoverDate = (event) => {
    const hoveredX = event?.points?.[0]?.x;
    if (hoveredX !== undefined && hoveredX !== null && onHoverDateChange) {
      onHoverDateChange(String(hoveredX));
    }
  };

  const clearHoverDate = () => {
    if (onHoverDateChange) {
      onHoverDateChange(null);
    }
  };

  return (
    <div className="forecast-chart-wrap">
      <Plot
        data={[
          {
            x: forecastDates,
            y: upper,
            type: "scatter",
            mode: "lines",
            line: { width: 0 },
            hoverinfo: "skip",
            showlegend: false,
            name: "Upper",
          },
          {
            x: forecastDates,
            y: lower,
            type: "scatter",
            mode: "lines",
            line: { width: 0 },
            fill: "tonexty",
            fillcolor: "rgba(126, 201, 189, 0.22)",
            name: "Uncertainty",
            hovertemplate: "Lower: %{y:.2f}<extra></extra>",
          },
          {
            x: forecastDates,
            y: median,
            type: "scatter",
            mode: "lines+markers",
            name: "Forecast Median",
            line: { color: "#e04848", width: 2.5 },
            marker: { size: 5, color: "#e04848" },
            hovertemplate: "Median: %{y:.2f}<extra></extra>",
          },
          {
            x: observedDates,
            y: observed,
            type: "scatter",
            mode: "lines+markers",
            name: "Observed",
            line: { color: "#1f5b9b", width: 2 },
            marker: { size: 5, color: "#1f5b9b" },
            hovertemplate: "Observed: %{y:.2f}<extra></extra>",
          },
          ...(detectionThresholdTrace ? [detectionThresholdTrace] : []),
          ...(warningThresholdTrace ? [warningThresholdTrace] : []),
          ...(alertTrace ? [alertTrace] : []),
        ]}
        layout={{
          autosize: true,
          height: 350,
          margin: { l: 52, r: 24, t: 16, b: 52 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(255,255,255,0.5)",
          xaxis: {
            title: "Date",
            gridcolor: "#e2e8f1",
            zeroline: false,
            tickfont: { color: "#495367" },
            titlefont: { color: "#495367" },
          },
          yaxis: {
            title: "Cases",
            gridcolor: "#e2e8f1",
            zeroline: false,
            tickfont: { color: "#495367" },
            titlefont: { color: "#495367" },
          },
          legend: {
            orientation: "h",
            y: 1.12,
            x: 0,
            font: { size: 11 },
          },
          shapes: syncedHoverDate
            ? [
                {
                  type: "line",
                  xref: "x",
                  yref: "paper",
                  x0: syncedHoverDate,
                  x1: syncedHoverDate,
                  y0: 0,
                  y1: 1,
                  line: { color: "#41506a", width: 1.2, dash: "dot" },
                  layer: "above",
                },
              ]
            : [],
          annotations: alertLabel
            ? [
                {
                  xref: "paper",
                  yref: "paper",
                  x: 0,
                  y: 1.18,
                  xanchor: "left",
                  yanchor: "bottom",
                  text: `Status: ${alertLabel}`,
                  showarrow: false,
                  font: {
                    size: 11,
                    color: isWarning ? "#c43f3f" : "#a86d00",
                  },
                },
              ]
            : [],
          hovermode: "x unified",
        }}
        config={{
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
          modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
        }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
        onHover={syncHoverDate}
        onUnhover={clearHoverDate}
      />
    </div>
  );
}
