import { useEffect, useMemo } from "react";
import { Plot } from "../utils/plotly";
import { resolveChartHighlightDate } from "../utils/chartHighlightDate";
import { useSyncedChartHover } from "../utils/useSyncedChartHover";
import { chartRangeUiRevision } from "../utils/chartDateRange";
import { buildPlotlyDateXAxis } from "../utils/plotlyDateAxisSync";

const DISTRICT_COLORS = ["#1f5b9b", "#e04848", "#7356d8"];

export default function MultiDistrictComparisonChart({
  series = [],
  startDate,
  endDate,
  chartScopeKey = "",
  onPlotReady,
  onPlotPurge,
  registerHighlightResolver,
  syncedHoverDate,
  onHoverDateChange,
  alertTimeMode = "current",
  alertAnimationWeek = null,
  height = 380,
}) {
  const { syncHoverDate, clearHoverDate } = useSyncedChartHover(onHoverDateChange);
  const xaxis = useMemo(() => buildPlotlyDateXAxis("Date"), []);

  const activeSeries = (series || []).filter((item) => item?.rows?.length);

  const chartDates = useMemo(() => {
    const dates = new Set();
    activeSeries.forEach((item) => {
      item.rows.forEach((row) => {
        if (row.date) dates.add(row.date);
      });
    });
    return Array.from(dates).sort();
  }, [activeSeries]);

  useEffect(() => {
    if (!registerHighlightResolver) return undefined;
    registerHighlightResolver("compare", (hoverDate) =>
      resolveChartHighlightDate({
        alertTimeMode,
        alertAnimationWeek,
        syncedHoverDate: hoverDate,
        chartDates,
      })
    );
    return () => registerHighlightResolver("compare", null);
  }, [
    alertAnimationWeek,
    alertTimeMode,
    chartDates,
    registerHighlightResolver,
  ]);

  const traces = useMemo(() => {
    const out = [];

    activeSeries.forEach((item, index) => {
      const color = DISTRICT_COLORS[index % DISTRICT_COLORS.length];
      const observedPoints = item.rows.filter(
        (row) => row.observed !== null && row.observed !== undefined
      );
      const forecastPoints = item.rows.filter(
        (row) => row.median !== null && row.median !== undefined
      );

      if (observedPoints.length > 0) {
        out.push({
          x: observedPoints.map((row) => row.date),
          y: observedPoints.map((row) => row.observed),
          type: "scatter",
          mode: "lines+markers",
          name: `${item.district} · Observed`,
          legendgroup: item.district,
          line: { color, width: 2.2 },
          marker: { color, size: 5 },
          hovertemplate: `${item.district}<br>Observed: %{y:.1f}<extra></extra>`,
        });
      }

      if (forecastPoints.length > 0) {
        out.push({
          x: forecastPoints.map((row) => row.date),
          y: forecastPoints.map((row) => row.median),
          type: "scatter",
          mode: "lines+markers",
          name: `${item.district} · Forecast`,
          legendgroup: item.district,
          line: { color, width: 2, dash: "dot" },
          marker: { color, size: 4, symbol: "diamond-open" },
          hovertemplate: `${item.district}<br>Forecast: %{y:.1f}<extra></extra>`,
        });
      }
    });

    return out;
  }, [activeSeries]);

  const layout = useMemo(
    () => ({
      uirevision: chartRangeUiRevision(
        "compare",
        chartScopeKey,
        `-${activeSeries.map((s) => s.district).join("|")}`
      ),
      autosize: true,
      height,
      margin: { l: 58, r: 24, t: 24, b: 60 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.5)",
      dragmode: "zoom",
      hovermode: "x unified",
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
        y: 1.14,
        x: 0,
        font: { size: 10 },
      },
    }),
    [activeSeries, chartScopeKey, height, xaxis]
  );

  if (activeSeries.length === 0) {
    return <div className="chart-state">Select at least one district to compare.</div>;
  }

  return (
    <div className="comparison-chart-wrap">
      <Plot
        data={traces}
        layout={layout}
        config={{
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
          modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
        }}
        style={{ width: "100%", height: `${height}px` }}
        useResizeHandler
        onInitialized={onPlotReady}
        onPurge={onPlotPurge}
        onHover={syncHoverDate}
        onUnhover={clearHoverDate}
      />
    </div>
  );
}
