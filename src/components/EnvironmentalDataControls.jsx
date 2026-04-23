// EnvironmentalDataControls.jsx
import React, { useState } from "react";
import { fetchEnvironmentalDataAll } from "../api";

export default function EnvironmentalDataControls({
  geoData,
  startDate,
  endDate,
  dataset,
  setDataset,
  onDataFetched,
}) {
  const [loading, setLoading] = useState(false);

  // Example: available datasets
  const datasets = [
  { label: "Precipitation (totprec)", value: "totprec" },
  { label: "LST Day Temperature (°C)", value: "lst_day" },
  { label: "LST Night Temperature (°C)", value: "lst_night" },
  { label: "LST Mean Temperature (°C)", value: "lst_mean" },
  { label: "NDVI (Vegetation)", value: "ndvi" },
  { label: "SAVI", value: "savi" },
  { label: "EVI", value: "evi" },
  { label: "NDWI5 (Moisture)", value: "ndwi5" },
  { label: "NDWI6 (Water Index)", value: "ndwi6" }
];

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

      const data = await fetchEnvironmentalDataAll({
        startDate,
        endDate,
        dataset,
        districts,
      });

      console.log("Response:", data);
      // res.data = { "District1": 0.42, ... }
      if (onDataFetched) onDataFetched(data);
    } catch (err) {
      console.error("Full error:", err);
      alert("Failed to fetch environmental data: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="env-controls">
      <h3 className="panel-title">Fetch Environmental Data</h3>

      {/* Dataset Selector */}
      <label className="toolbar-field">
        Dataset:{" "}
        <select
          className="toolbar-select"
          value={dataset}
          onChange={(e) => setDataset(e.target.value)}
        >
          {datasets.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      {/* Fetch Button */}
      <button
        onClick={fetchEnvData}
        disabled={loading}
        className="toolbar-button"
      >
        {loading ? "Fetching..." : "Fetch Data"}
      </button>
    </div>
  );
}
