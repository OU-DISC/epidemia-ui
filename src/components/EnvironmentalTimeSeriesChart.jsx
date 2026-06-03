import { useEffect, useMemo, useState } from "react";
import { Plot } from "../utils/plotly";
import { fetchEnvironmentalTimeseries, ENV_API_BASE } from "../api";
import { resolveChartHighlightDate } from "../utils/chartHighlightDate";
import { useSyncedChartHover } from "../utils/useSyncedChartHover";
import { chartRangeUiRevision, useChartPanelHeight } from "../utils/chartDateRange";
import { buildPlotlyDateXAxis, buildPlotlyValueYAxis } from "../utils/plotlyDateAxisSync";
import { kelvinToCelsiusValue } from "../utils/temperatureUnits";

const ENV_DATASET_LABELS = {
  totprec: "Precipitation (mm/day)",
  lst_day: "LST Day (°C)",
  lst_night: "LST Night (°C)",
  lst_mean: "LST Mean (°C)",
  net: "Air Temperature (°C)",
  ndvi: "NDVI Index",
  savi: "SAVI Index",
  evi: "EVI Index",
  ndwi5: "NDWI5 Index",
  ndwi6: "NDWI6 Index",
};

export default function EnvironmentalTimeSeriesChart({
  selectedDistrict,
  districtGeometry,
  startDate,
  endDate,
  dataset,
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
  const [timeseries, setTimeseries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { syncHoverDate, clearHoverDate } = useSyncedChartHover(onHoverDateChange);
  const xaxis = useMemo(() => buildPlotlyDateXAxis("Date"), []);

  useEffect(() => {
    if (!selectedDistrict || !districtGeometry || !startDate || !endDate || !dataset) {
      setTimeseries([]);
      return;
    }

    const fetchTimeseries = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchEnvironmentalTimeseries({
          districtName: selectedDistrict,
          districtGeometry: districtGeometry,
          startDate,
          endDate,
          dataset,
        });

        setTimeseries(data.timeseries || []);
      } catch (err) {
        console.error("Error fetching timeseries:", err);
        const detail =
          err.response?.data?.error ||
          (err.code === "ERR_NETWORK"
            ? `Cannot reach environmental API at ${ENV_API_BASE || "http://localhost:5000"}`
            : null);
        setError(detail || err.message || "Failed to load chart data");
      } finally {
        setLoading(false);
      }
    };

    fetchTimeseries();
  }, [selectedDistrict, districtGeometry, startDate, endDate, dataset]);

  const plotSeries = useMemo(
    () =>
      (timeseries || []).map((point) => ({
        date: point.date,
        value: kelvinToCelsiusValue(point.value, dataset),
      })),
    [timeseries, dataset]
  );

  const chartPoints = useMemo(
    () =>
      (timeseries || []).filter(
        (point) => point?.date && point.value != null && !Number.isNaN(Number(point.value))
      ),
    [timeseries]
  );

  const chartDates = useMemo(
    () => chartPoints.map((point) => point.date),
    [chartPoints]
  );

  const datasetLabel = ENV_DATASET_LABELS[dataset] || dataset;

  useEffect(() => {
    if (!registerHighlightResolver) return undefined;
    registerHighlightResolver("env", (hoverDate) =>
      resolveChartHighlightDate({
        alertTimeMode,
        alertAnimationWeek,
        syncedHoverDate: hoverDate,
        chartDates,
      })
    );
    return () => registerHighlightResolver("env", null);
  }, [
    alertAnimationWeek,
    alertTimeMode,
    chartDates,
    registerHighlightResolver,
  ]);

  const layout = useMemo(
    () => ({
      uirevision: chartRangeUiRevision(
        "env",
        chartScopeKey,
        `-${dataset}-${selectedDistrict || "none"}`
      ),
      autosize: true,
      height: chartPanelHeight,
      margin: { l: 58, r: 24, t: 16, b: 60 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.5)",
      dragmode: "zoom",
      hovermode: "x unified",
      xaxis,
      yaxis: buildPlotlyValueYAxis(datasetLabel),
    }),
    [chartScopeKey, chartPanelHeight, dataset, datasetLabel, selectedDistrict, xaxis]
  );

  if (!selectedDistrict) {
    return <div className="chart-state">Select a district to view time series</div>;
  }

  if (loading) {
    return <div className="chart-state">Loading chart data...</div>;
  }

  if (error) {
    return <div className="chart-state chart-state-error">{error}</div>;
  }

  if (chartPoints.length === 0) {
    return <div className="chart-state">No data available for this period</div>;
  }

  return (
    <div className="time-series-wrap chart-panel-slot">
      <h4 className="panel-title">
        {selectedDistrict} - {datasetLabel}
      </h4>
      <Plot
        data={[
          {
            x: chartPoints.map((d) => d.date),
            y: chartPoints.map((d) => d.value),
            type: "scatter",
            mode: "lines+markers",
            name: datasetLabel,
            line: { color: "#7356d8", width: 2.5, shape: "linear" },
            marker: { color: "#7356d8", size: 5 },
            hovertemplate: `%{x}<br>${datasetLabel}: %{y:.3f}<extra></extra>`,
          },
        ]}
        layout={layout}
        config={{
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
        }}
        style={{ width: "100%", height: `${chartPanelHeight}px` }}
        useResizeHandler
        onInitialized={onPlotReady}
        onPurge={onPlotPurge}
        onHover={syncHoverDate}
        onUnhover={clearHoverDate}
      />
    </div>
  );
}
