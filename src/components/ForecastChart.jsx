import { useCallback, useEffect, useMemo, useRef } from "react";

import { Plot } from "../utils/plotly";
import { resolveChartHighlightDate } from "../utils/chartHighlightDate";
import { useSyncedChartHover } from "../utils/useSyncedChartHover";
import { chartRangeUiRevision, useChartPanelHeight } from "../utils/chartDateRange";
import { buildPlotlyDateXAxis, buildPlotlyValueYAxis } from "../utils/plotlyDateAxisSync";
import { buildForecastChartLayers } from "../utils/buildForecastChartLayers";

export default function ForecastChart({
  data,
  alert,
  startDate,
  endDate,
  districtKey = "",
  onPlotReady,
  onPlotPurge,
  registerHighlightResolver,
  chartScopeKey = "",
  syncedHoverDate,
  onHoverDateChange,
  alertTimeMode = "current",
  alertAnimationWeek = null,
}) {
  const chartPanelHeight = useChartPanelHeight();
  const traceSetRevision = "epidemiar-control-chart-v3-yaxis";
  const { syncHoverDate, clearHoverDate } = useSyncedChartHover(onHoverDateChange);
  const xaxis = useMemo(() => buildPlotlyDateXAxis("Date"), []);

  const chartDates = useMemo(() => {
    if (!data?.length) return [];
    const observedDates = data
      .filter((point) => point.observed !== null && point.observed !== undefined)
      .map((point) => point.date);
    const forecastDates = data
      .filter((point) => point.median !== null && point.median !== undefined)
      .map((point) => point.date);
    return [...observedDates, ...forecastDates];
  }, [data]);

  const chartLayers = useMemo(() => buildForecastChartLayers(data), [data]);
  const baselineShapesRef = useRef([]);
  baselineShapesRef.current = chartLayers.shapes;

  const handlePlotReady = useCallback(
    (figure, graphDiv) => {
      if (graphDiv) {
        graphDiv._epidemiaBaselineShapes = baselineShapesRef.current;
      }
      onPlotReady?.(figure, graphDiv);
    },
    [onPlotReady]
  );

  useEffect(() => {
    if (!registerHighlightResolver) return undefined;

    registerHighlightResolver("forecast", (hoverDate) =>
      resolveChartHighlightDate({
        alertTimeMode,
        alertAnimationWeek,
        syncedHoverDate: hoverDate,
        chartDates,
      })
    );

    return () => registerHighlightResolver("forecast", null);
  }, [alertAnimationWeek, alertTimeMode, chartDates, registerHighlightResolver]);

  const layout = useMemo(
    () => ({
      uirevision: chartRangeUiRevision(
        "forecast",
        chartScopeKey,
        `${districtKey ? `-${districtKey}` : ""}-${traceSetRevision}`
      ),
      autosize: true,
      height: chartPanelHeight,
      margin: { l: 58, r: 24, t: 42, b: 60 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.5)",
      dragmode: "zoom",
      xaxis,
      yaxis: buildPlotlyValueYAxis("Cases"),
      legend: {
        orientation: "h",
        y: 1.16,
        x: 0,
        font: { size: 11 },
      },
      shapes: chartLayers.shapes,
      annotations: chartLayers.annotations,
      hovermode: "x unified",
    }),
    [chartLayers.annotations, chartLayers.shapes, chartPanelHeight, chartScopeKey, districtKey, xaxis]
  );

  const plotData = useMemo(() => {
    if (!data?.length) return [];

    const forecastPoints = data.filter(
      (point) => point.median !== null && point.median !== undefined
    );
    const observedPoints = data.filter(
      (point) => point.observed !== null && point.observed !== undefined
    );

    const forecastDates = forecastPoints.map((point) => point.date);
    const upper = forecastPoints.map((point) => point.upper);
    const lower = forecastPoints.map((point) => point.lower);
    const median = forecastPoints.map((point) => point.median);
    const observedDates = observedPoints.map((point) => point.date);
    const observed = observedPoints.map((point) => point.observed);

    return [
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
      ...(chartLayers.thresholdTrace ? [chartLayers.thresholdTrace] : []),
      {
        x: forecastDates,
        y: median,
        type: "scatter",
        mode: "lines+markers",
        name: "Forecast Median",
        line: { color: "#9b59b6", width: 2.5 },
        marker: { size: 5, color: "#9b59b6" },
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
      ...(chartLayers.edAlertTrace ? [chartLayers.edAlertTrace] : []),
      ...(chartLayers.ewAlertTrace ? [chartLayers.ewAlertTrace] : []),
    ];
  }, [chartLayers, data]);

  if (!data || data.length === 0) {
    return <div className="chart-state">No forecast data available</div>;
  }

  const forecastPointsCount = data.filter(
    (point) => point.median !== null && point.median !== undefined
  ).length;
  const observedPointsCount = data.filter(
    (point) => point.observed !== null && point.observed !== undefined
  ).length;

  if (forecastPointsCount === 0 && observedPointsCount > 0) {
    return (
      <div className="chart-state">
        No forecast points found for this selection (observations only).
      </div>
    );
  }

  return (
    <div className="forecast-chart-wrap chart-panel-slot">
      <Plot
        data={plotData}
        layout={layout}
        config={{
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
          modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
        }}
        style={{ width: "100%", height: `${chartPanelHeight}px` }}
        useResizeHandler
        onInitialized={handlePlotReady}
        onPurge={onPlotPurge}
        onHover={syncHoverDate}
        onUnhover={clearHoverDate}
      />
    </div>
  );
}
