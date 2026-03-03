// EnvironmentalDataControls.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";

export default function EnvironmentalDataControls({
  geoData,
  startDate,
  endDate,
  dataset,
  setStartDate,
  setEndDate,
  setDataset,
  onDataFetched,
}) {
  const [loading, setLoading] = useState(false);

  // Example: available datasets
  const datasets = ["NDVI", "NET", "Precipitation", "LST"];

  // Handle fetch button click
  const fetchEnvData = async () => {
    if (!geoData || geoData.features.length === 0) {
      return alert("GeoJSON data not loaded yet!");
    }

    setLoading(true);

    try {
      // Prepare districts array with geometry coordinates
      // GeoJSON has geometry.type and geometry.coordinates
      // We need to send just the coordinates for Earth Engine
      const districts = geoData.features.map((f) => {
        // Get coordinates - handle both Polygon and MultiPolygon
        let coords = f.geometry.coordinates;
        if (f.geometry.type === "MultiPolygon") {
          // For MultiPolygon, take the first polygon
          coords = coords[0];
        }
        
        return {
          name: f.properties.adm3_name,
          geometry: coords, // This should be [[[lng, lat], [lng, lat], ...]]
        };
      });

      console.log("Sending districts:", districts.length);
      if (districts.length > 0) {
        console.log("First district:", districts[0].name);
        console.log("Coordinates:", JSON.stringify(districts[0].geometry).substring(0, 300));
      }

      const res = await axios.post("http://localhost:5000/api/get_env_data_all", {
        startDate,
        endDate,
        dataset,
        districts,
      });

      console.log("Response:", res.data);
      // res.data = { "District1": 0.42, ... }
      if (onDataFetched) onDataFetched(res.data);
    } catch (err) {
      console.error("Full error:", err);
      alert("Failed to fetch environmental data: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: "1rem",
        marginBottom: "1rem",
        border: "1px solid #ccc",
        borderRadius: "6px",
        background: "#f9f9f9",
      }}
    >
      <h3>Fetch Environmental Data</h3>

      {/* Start / End Date Inputs */}
      <label>
        Start Date:{" "}
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </label>

      <label style={{ marginLeft: "1rem" }}>
        End Date:{" "}
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </label>

      {/* Dataset Selector */}
      <label style={{ marginLeft: "1rem" }}>
        Dataset:{" "}
        <select value={dataset} onChange={(e) => setDataset(e.target.value)}>
          {datasets.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>

      {/* Fetch Button */}
      <button
        onClick={fetchEnvData}
        disabled={loading}
        style={{ marginLeft: "1rem", padding: "0.3rem 0.8rem" }}
      >
        {loading ? "Fetching..." : "Fetch Data"}
      </button>
    </div>
  );
}
