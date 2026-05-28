import { useEffect, useMemo } from "react";

import { Plot } from "../utils/plotly";

import { resolveChartHighlightDate } from "../utils/chartHighlightDate";

import { useSyncedChartHover } from "../utils/useSyncedChartHover";

import { chartRangeUiRevision, CHART_PANEL_HEIGHT } from "../utils/chartDateRange";

import { buildPlotlyDateXAxis } from "../utils/plotlyDateAxisSync";



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
  // Changing the trace set (e.g. removing a line) can cause Plotly to reapply
  // previous legend visibility to the wrong series under the same uirevision.
  // Bump this when we change which traces are rendered.
  const traceSetRevision = "warn-only-thresholds-v1";

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

  }, [

    alertAnimationWeek,

    alertTimeMode,

    chartDates,

    registerHighlightResolver,

  ]);



  const alertLabelInfo = useMemo(() => {

    const isWarning = Boolean(alert?.early_warning);

    const alertLabel = isWarning

      ? "Early Warning"

        : null;

    return { isWarning, alertLabel };

  }, [alert]);



  const layout = useMemo(

    () => ({

      uirevision: chartRangeUiRevision(

        "forecast",

        chartScopeKey,

        `${districtKey ? `-${districtKey}` : ""}-${traceSetRevision}`

      ),

      autosize: true,

      height: CHART_PANEL_HEIGHT,

      margin: { l: 58, r: 24, t: 16, b: 60 },

      paper_bgcolor: "rgba(0,0,0,0)",

      plot_bgcolor: "rgba(255,255,255,0.5)",

      dragmode: "zoom",

      xaxis,

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

      annotations: alertLabelInfo.alertLabel

        ? [

            {

              xref: "paper",

              yref: "paper",

              x: 0,

              y: 1.18,

              xanchor: "left",

              yanchor: "bottom",

              text: `Status: ${alertLabelInfo.alertLabel}`,

              showarrow: false,

              font: {

                size: 11,

                color: alertLabelInfo.isWarning ? "#c43f3f" : "#a86d00",

              },

            },

          ]

        : [],

      hovermode: "x unified",

    }),

    [alertLabelInfo, chartScopeKey, districtKey, xaxis]

  );



  if (!data || data.length === 0) {

    return <div className="chart-state">No forecast data available</div>;

  }

  const forecastPointsCount = data.filter(
    (d) => d.median !== null && d.median !== undefined
  ).length;
  const observedPointsCount = data.filter(
    (d) => d.observed !== null && d.observed !== undefined
  ).length;
  if (forecastPointsCount === 0 && observedPointsCount > 0) {
    return (
      <div className="chart-state">
        No forecast points found for this selection (observations only).
      </div>
    );
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



  const warningThreshold =

    alert?.warning_threshold !== null && alert?.warning_threshold !== undefined

      ? Number(alert.warning_threshold)

      : null;

  const { alertLabel } = alertLabelInfo;



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

            color: alertLabelInfo.isWarning ? "#c43f3f" : "#d48806",

            symbol: "diamond",

            line: { color: "#ffffff", width: 1.5 },

          },

          hovertemplate: `${alertLabel}<br>Date: %{x}<br>Median: %{y:.2f}<extra></extra>`,

        }

      : null;



  const warningThresholdPoints = [...data]

    .filter(

      (point) =>

        point.warning_threshold !== null &&

        point.warning_threshold !== undefined &&

        point.date

    )

    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const hasSeasonalThresholds = warningThresholdPoints.length > 0;



  const warningThresholdTrace =

    hasSeasonalThresholds

      ? {

          x: warningThresholdPoints.map((point) => point.date),

          y: warningThresholdPoints.map((point) => Number(point.warning_threshold)),

          type: "scatter",

          mode: "lines",

          name: "Warning Threshold",

          line: { color: "#c43f3f", width: 1.5, dash: "dot" },

          hovertemplate: "Warning Threshold: %{y:.2f}<extra></extra>",

        }

      : warningThreshold !== null && chartDates.length > 0

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



  return (

    <div className="forecast-chart-wrap chart-panel-slot">

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

          ...(warningThresholdTrace ? [warningThresholdTrace] : []),

          ...(alertTrace ? [alertTrace] : []),

        ]}

        layout={layout}

        config={{

          responsive: true,

          displaylogo: false,

          scrollZoom: true,

          modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],

        }}

        style={{ width: "100%", height: `${CHART_PANEL_HEIGHT}px` }}

        useResizeHandler

        onInitialized={onPlotReady}

        onPurge={onPlotPurge}

        onHover={syncHoverDate}

        onUnhover={clearHoverDate}

      />

    </div>

  );

}


