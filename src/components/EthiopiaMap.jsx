// EthiopiaMap.jsx
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Legend component
function Legend({ getColor, grades, unit, dataset }) {
  const map = useMap();

  useEffect(() => {
    const legend = L.control({ position: "topright" });

    legend.onAdd = function () {
      const div = L.DomUtil.create("div", "info legend");
      // grades provided by parent based on dataset
      const labels = [];

      div.style.padding = "6px";
      div.style.background = "white";
      div.style.borderRadius = "6px";
      div.style.boxShadow = "0 0 6px rgba(0,0,0,0.3)";

      div.innerHTML = `<b>${dataset} (${unit})</b><br>`;

      for (let i = 0; i < grades.length; i++) {
        const from = grades[i];
        const to = grades[i + 1];
        labels.push(
          `<i style="background:${getColor(from + 0.01)}; width:18px; height:18px; display:inline-block; margin-right:4px;"></i> ` +
          `${from}${to ? " – " + to : "+"}`
        );
      }

      div.innerHTML += labels.join("<br>");
      return div;
    };

    legend.addTo(map);

    return () => {
      legend.remove();
    };
  }, [map, getColor, grades, unit, dataset]);

  return null;
}

export default function EthiopiaMap({
  onSelectRegion,
  startDate,
  endDate,
  dataset,
  envData = {},
  setGeoData,
  filterRegion = "All Regions"
}) {
  const [geoData, setGeo] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);

  // Load GeoJSON
  useEffect(() => {
    const loadGeo = async () => {
      try {
        const res = await fetch("/eth_admin3.geojson");
        const geojson = await res.json();
        setGeo(geojson);
        if (setGeoData) setGeoData(geojson); // pass back to dashboard for controls
      } catch (err) {
        console.error("Failed to load GeoJSON", err);
      }
    };

    loadGeo();
  }, [setGeoData]);

  // dataset-specific breakpoints and units
  const gradeConfig = {
    NDVI: { grades: [0, 0.2, 0.4, 0.6], unit: "NDVI" },
    Precipitation: { grades: [0, 50, 100, 200], unit: "mm" },
    NET: { grades: [0, 15, 25, 35], unit: "°C" },
    LST: { grades: [0, 15, 25, 35], unit: "°C" }
  };
  const { grades, unit } = gradeConfig[dataset] || { grades: [0, 1], unit: "" };

  const getColor = (value) => {
    if (value == null) return "#e5e5e5";
    if (value > grades[3]) return "#1a9641";
    if (value > grades[2]) return "#a6d96a";
    if (value > grades[1]) return "#fdae61";
    return "#d7191c";
  };

  // Color palette for regions
  const regionColors = [
    "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
    "#ffff33", "#a65628", "#f781bf", "#999999", "#66c2a5",
    "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f"
  ];

  // Get consistent color for each region
  const getRegionColor = (regionName) => {
    if (!regionName) return "#555";
    const hash = regionName.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return regionColors[hash % regionColors.length];
  };

  // Style each district safely
  const style = (feature) => {
    const districtName = feature?.properties?.adm3_name;
    const regionName = feature?.properties?.adm1_name;
    const value = envData && districtName ? envData[districtName] : undefined;
    const isSelectedDistrict = districtName === selectedDistrict;
    const isInSelectedRegion = filterRegion !== "All Regions" && regionName === filterRegion;
    const showAllRegions = filterRegion === "All Regions";

    // Determine border styling
    let borderWeight = 1;
    let borderColor = "#555";

    if (isSelectedDistrict) {
      borderWeight = 4;
      borderColor = "#000";
    } else if (isInSelectedRegion) {
      borderWeight = 3;
      borderColor = "#222";
    } else if (showAllRegions) {
      borderWeight = 2.5;
      borderColor = getRegionColor(regionName);
    }

    return {
      fillColor: value !== undefined ? getColor(value) : "#e5e5e5",
      weight: borderWeight,
      color: borderColor,
      fillOpacity: 0.7
    };
  };

  // Tooltip & click callback
  const onEachFeature = (feature, layer) => {
    const districtName = feature?.properties?.adm3_name;
    const value = envData && districtName ? envData[districtName] : undefined;

    layer.on({ 
      click: () => {
        setSelectedDistrict(districtName);
        onSelectRegion(districtName);
      }
    });
    layer.bindTooltip(
      `${districtName}: ${value !== undefined ? value.toFixed(2) : "Loading..."}`,
      { sticky: true }
    );
  };

  return (
    <div style={{ position: "relative" }}>
      <MapContainer
        center={[9.0, 40.5]}
        zoom={6}
        style={{ height: "500px", width: "100%" }}
      >
        <TileLayer
          attribution="© OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {geoData && (
          <GeoJSON
            data={
              filterRegion === "All Regions"
                ? geoData
                : {
                    ...geoData,
                    features: geoData.features.filter(
                      (f) => f.properties.adm1_name === filterRegion
                    ),
                  }
            }
            style={style}
            onEachFeature={onEachFeature}
          />
        )}

        {/* Legend */}
        <Legend
          getColor={getColor}
          grades={grades}
          unit={unit}
          dataset={dataset}
        />
      </MapContainer>
    </div>
  );
}
