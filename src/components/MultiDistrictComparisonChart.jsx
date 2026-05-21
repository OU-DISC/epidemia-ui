import { useCallback, useMemo } from "react";
import Plot from "react-plotly.js";
import {
  parseXAxisRangeFromRelayoutEvent,
  xAxisRangesEqual,
} from "../utils/plotlyXAxisSync";
import {
  buildVerticalDateLine,
  resolveChartHighlightDate,
} from "../utils/chartHighlightDate";
import { useSyncedChartHover } from "../utils/useSyncedChartHover";

const DISTRICT_COLORS = ["#1f5b9b", "#e04848", "#7356d8"];

export default function MultiDistrictComparisonChart({
  series = [],
  syncedHoverDate,
  onHoverDateChange,
  syncedXRange,
  onXRangeChange,
  alertTimeMode = "current",
  alertAnimationWeek = null,
  height = 380,
}) {
  const { syncHoverDate, clearHoverDate } = useSyncedChartHover(onHoverDateChange);

  const handleRelayout = useCallback(
    (ev) => {
      if (!onXRangeChange) return;
      const parsed = parseXAxisRangeFromRelayoutEvent(ev);
      if (parsed == null) return;
      if (parsed === "autorange") {
        onXRangeChange(null);
        return;
      }
      if (xAxisRangesEqual(parsed, syncedXRange)) return;
      onXRangeChange([parsed[0], parsed[1]]);
    },
    [onXRangeChange, syncedXRange]
  );

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

  const defaultXRange =
    chartDates.length >= 2 ? [chartDates[0], chartDates[chartDates.length - 1]] : null;
  const xAxisRange =
    syncedXRange && syncedXRange.length === 2
      ? [syncedXRange[0], syncedXRange[1]]
      : defaultXRange;

  const highlightDate = resolveChartHighlightDate({
    alertTimeMode,
    alertAnimationWeek,
    syncedHoverDate,
    chartDates,
  });

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

  if (activeSeries.length === 0) {
    return <div className="chart-state">Select at least one district to compare.</div>;
  }

  return (
    <div className="comparison-chart-wrap">
      <Plot
        data={traces}
        layout={{
          uirevision: syncedXRange
            ? `compare-zoom-${syncedXRange[0]}-${syncedXRange[1]}`
            : "district-comparison-chart",
          autosize: true,
          height,
          margin: { l: 58, r: 24, t: 24, b: 60 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(255,255,255,0.5)",
          dragmode: "zoom",
          hovermode: "x unified",
          xaxis: {
            title: "Date",
            tickangle: -35,
            gridcolor: "#e2e8f1",
            zeroline: false,
            tickfont: { size: 11, color: "#495367" },
            titlefont: { color: "#495367" },
            ...(xAxisRange ? { range: xAxisRange } : {}),
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
            y: 1.14,
            x: 0,
            font: { size: 10 },
          },
          shapes: buildVerticalDateLine(highlightDate),
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
        onRelayout={handleRelayout}
      />
    </div>
  );
}
