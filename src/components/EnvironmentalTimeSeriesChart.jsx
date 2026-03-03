import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import axios from "axios";

export default function EnvironmentalTimeSeriesChart({
  selectedDistrict,
  districtGeometry,
  startDate,
  endDate,
  dataset,
  geoData,
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
        setError("Failed to load chart data");
      } finally {
        setLoading(false);
      }
    };

    fetchTimeseries();
  }, [selectedDistrict, districtGeometry, startDate, endDate, dataset]);

  if (!selectedDistrict) {
    return <div style={{ padding: "1rem", color: "#999" }}>Select a district to view time series</div>;
  }

  if (loading) {
    return <div style={{ padding: "1rem" }}>Loading chart data...</div>;
  }

  if (error) {
    return <div style={{ padding: "1rem", color: "red" }}>{error}</div>;
  }

  if (timeseries.length === 0) {
    return <div style={{ padding: "1rem", color: "#999" }}>No data available for this period</div>;
  }

  // Unit labels for each dataset
  const unitLabels = {
    NDVI: "NDVI Index (0-1)",
    NET: "Temperature (°C)",
    Precipitation: "Precipitation (mm)",
    LST: "Land Surface Temp (°C)",
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h4>{selectedDistrict} - {dataset}</h4>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={timeseries}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            label={{ value: unitLabels[dataset] || dataset, angle: -90, position: "insideLeft" }}
          />
          <Tooltip 
            formatter={(value) => value?.toFixed(3) || "N/A"}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#8884d8"
            dot={false}
            isAnimationActive={false}
            name={dataset}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
