import React, { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import axios from "axios";

export default function EnvironmentalTimeSeriesChart({
  selectedDistrict,
  districtGeometry,
  startDate,
  endDate,
  dataset,
  syncedHoverDate,
  onHoverDateChange,
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
        const res = await axios.post("http://localhost:5000/api/get_timeseries", {
          districtName: selectedDistrict,
          districtGeometry: districtGeometry,
          startDate,
          endDate,
          dataset,
        });

        setTimeseries(res.data.timeseries || []);
      } catch (err) {
        console.error("Error fetching timeseries:", err);
        setError(err.response?.data?.error || "Failed to load chart data");
      } finally {
        setLoading(false);
      }
    };

    fetchTimeseries();
  }, [selectedDistrict, districtGeometry, startDate, endDate, dataset]);

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
    ndvi: "NDVI Index",
    savi: "SAVI Index",
    evi: "EVI Index",
    ndwi5: "NDWI5 Index",
    ndwi6: "NDWI6 Index",
  };

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
      <h4 className="panel-title">{selectedDistrict} - {dataset}</h4>
      <Plot
        data={[
          {
            x: timeseries.map((d) => d.date),
            y: timeseries.map((d) => d.value),
            type: "scatter",
            mode: "lines+markers",
            name: dataset,
            line: { color: "#7356d8", width: 2.5, shape: "linear" },
            marker: { color: "#7356d8", size: 5 },
            hovertemplate: `%{x}<br>${dataset}: %{y:.3f}<extra></extra>`,
          },
        ]}
        layout={{
          autosize: true,
          height: 320,
          margin: { l: 58, r: 18, t: 10, b: 70 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(255,255,255,0.5)",
          hovermode: "x unified",
          xaxis: {
            title: "Date",
            tickangle: -35,
            range: startDate && endDate ? [startDate, endDate] : undefined,
            gridcolor: "#e2e8f1",
            zeroline: false,
            tickfont: { size: 11, color: "#495367" },
            titlefont: { color: "#495367" },
          },
          yaxis: {
            title: unitLabels[dataset] || dataset,
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
      />
    </div>
  );
}
