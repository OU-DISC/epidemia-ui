import React, { useCallback, useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { fetchEnvironmentalTimeseries } from "../api";
import {
  parseXAxisRangeFromRelayoutEvent,
  xAxisRangesEqual,
} from "../utils/plotlyXAxisSync";

export default function EnvironmentalTimeSeriesChart({
  selectedDistrict,
  districtGeometry,
  startDate,
  endDate,
  dataset,
  syncedHoverDate,
  onHoverDateChange,
  syncedXRange,
  onXRangeChange,
}) {
  const [timeseries, setTimeseries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
        setError(err.response?.data?.error || "Failed to load chart data");
      } finally {
        setLoading(false);
      }
    };

    fetchTimeseries();
  }, [selectedDistrict, districtGeometry, startDate, endDate, dataset]);

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

  const defaultXRange =
    startDate && endDate ? [startDate, endDate] : null;
  const xAxisRange =
    syncedXRange && syncedXRange.length === 2
      ? [syncedXRange[0], syncedXRange[1]]
      : defaultXRange;

  if (!selectedDistrict) {
    return <div className="chart-state">Select a district to view time series</div>;
  }

  if (loading) {
    return <div className="chart-state">Loading chart data...</div>;
  }

  if (error) {
    return <div className="chart-state chart-state-error">{error}</div>;
  }

  if (timeseries.length === 0) {
    return <div className="chart-state">No data available for this period</div>;
  }

  // Unit labels for each dataset
  const unitLabels = {
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

  const datasetLabel = unitLabels[dataset] || dataset;

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
    <div className="time-series-wrap">
      <h4 className="panel-title">{selectedDistrict} - {datasetLabel}</h4>
      <Plot
        data={[
          {
            x: timeseries.map((d) => d.date),
            y: timeseries.map((d) => d.value),
            type: "scatter",
            mode: "lines+markers",
            name: datasetLabel,
            line: { color: "#7356d8", width: 2.5, shape: "linear" },
            marker: { color: "#7356d8", size: 5 },
            hovertemplate: `%{x}<br>${datasetLabel}: %{y:.3f}<extra></extra>`,
          },
        ]}
        layout={{
          uirevision: syncedXRange
            ? `env-zoom-${syncedXRange[0]}-${syncedXRange[1]}`
            : `env-${startDate}-${endDate}-${dataset}`,
          autosize: true,
          height: 320,
          margin: { l: 58, r: 18, t: 10, b: 70 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(255,255,255,0.5)",
          dragmode: "zoom",
          hovermode: "x unified",
          xaxis: {
            title: "Date",
            tickangle: -35,
            range: xAxisRange || undefined,
            gridcolor: "#e2e8f1",
            zeroline: false,
            tickfont: { size: 11, color: "#495367" },
            titlefont: { color: "#495367" },
          },
          yaxis: {
            title: datasetLabel,
            gridcolor: "#e2e8f1",
            zeroline: false,
            tickfont: { color: "#495367" },
            titlefont: { color: "#495367" },
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
        }}
        config={{
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
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
