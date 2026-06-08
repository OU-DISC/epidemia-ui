import { useCallback, useEffect, useMemo, useRef } from "react";

import { Plot } from "../utils/plotly";
import { resolveChartHighlightDate } from "../utils/chartHighlightDate";
import { useSyncedChartHover } from "../utils/useSyncedChartHover";
import {
  chartRangeUiRevision,
  resolvePlotlyChartXRange,
  toPlotlyDateMs,
  useChartSlotHeight,
} from "../utils/chartDateRange";
import {
  buildChartPlotMargin,
  buildPlotlyDateXAxis,
  buildPlotlyValueYAxis,
  CHART_PLOT_CONFIG,
  CHART_PLOT_SURFACE,
} from "../utils/plotlyDateAxisSync";
import { buildForecastChartLayers } from "../utils/buildForecastChartLayers";
import { FORECAST_VALUE_MODE, getForecastYAxisTitle } from "../utils/forecastValueMode";

export default function ForecastChart({
  data,
  alert,
  valueMode = FORECAST_VALUE_MODE.CASES,
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
  const { height: chartPanelHeight, slotRef: chartSlotRef } = useChartSlotHeight();
  const traceSetRevision = `epidemiar-control-chart-v4-${valueMode}`;
  const { syncHoverDate, clearHoverDate } = useSyncedChartHover(onHoverDateChange);

  const plotlyXRange = useMemo(() => {
    const dataDates = (data || []).map((point) => point.date).filter(Boolean);
    return resolvePlotlyChartXRange({ startDate, endDate, dataDates });
  }, [data, endDate, startDate]);

  const xaxis = useMemo(
    () => buildPlotlyDateXAxis("", plotlyXRange),
    [plotlyXRange]
  );

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
        `${districtKey ? `-${districtKey}` : ""}-${traceSetRevision}-${startDate}-${endDate}`
      ),
      autosize: true,
      height: chartPanelHeight,
      margin: buildChartPlotMargin({ withLegend: true }),
      ...CHART_PLOT_SURFACE,
      dragmode: "zoom",
      xaxis,
      yaxis: buildPlotlyValueYAxis(getForecastYAxisTitle(valueMode), { nonnegative: true }),
      legend: {
        orientation: "h",
        y: 1,
        yanchor: "bottom",
        x: 0,
        xanchor: "left",
        font: { size: 9 },
        bgcolor: "rgba(0,0,0,0)",
      },
      shapes: chartLayers.shapes,
      annotations: chartLayers.annotations,
      hovermode: "x unified",
    }),
    [
      chartLayers.annotations,
      chartLayers.shapes,
      chartPanelHeight,
      chartScopeKey,
      districtKey,
      endDate,
      startDate,
      valueMode,
      xaxis,
    ]
  );

  const plotData = useMemo(() => {
    if (!data?.length) return [];
    const yFormat = valueMode === FORECAST_VALUE_MODE.INCIDENCE ? ".1f" : ".0f";

    const forecastPoints = data.filter(
      (point) => point.median !== null && point.median !== undefined
    );
    const observedPoints = data.filter(
      (point) => point.observed !== null && point.observed !== undefined
    );

    const toX = (point) => toPlotlyDateMs(point.date);
    const forecastDates = forecastPoints.map(toX);
    const upper = forecastPoints.map((point) => point.upper);
    const lower = forecastPoints.map((point) => point.lower);
    const median = forecastPoints.map((point) => point.median);
    const observedDates = observedPoints.map(toX);
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
        hovertemplate: `Lower: %{y:${yFormat}}<extra></extra>`,
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
        hovertemplate: `Median: %{y:${yFormat}}<extra></extra>`,
      },
      {
        x: observedDates,
        y: observed,
        type: "scatter",
        mode: "lines+markers",
        name: "Observed",
        line: { color: "#1f5b9b", width: 2 },
        marker: { size: 5, color: "#1f5b9b" },
        hovertemplate: `Observed: %{y:${yFormat}}<extra></extra>`,
      },
      ...(chartLayers.edAlertTrace ? [chartLayers.edAlertTrace] : []),
      ...(chartLayers.ewAlertTrace ? [chartLayers.ewAlertTrace] : []),
    ];
  }, [chartLayers, data, valueMode]);

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
    <div ref={chartSlotRef} className="forecast-chart-wrap chart-panel-slot">
      <Plot
        data={plotData}
        layout={layout}
        config={{
          ...CHART_PLOT_CONFIG,
          modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
        }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
        onInitialized={handlePlotReady}
        onPurge={onPlotPurge}
        onHover={syncHoverDate}
        onUnhover={clearHoverDate}
      />
    </div>
  );
}
