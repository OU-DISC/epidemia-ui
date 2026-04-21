// EthiopiaMap.jsx
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Alert Markers component
function AlertMarkers({ alerts, showEarlyWarning, showEarlyDetection, geoData }) {
  const map = useMap();
  const currentMarkersRef = useRef([]);

  useEffect(() => {
    // Clear all previously added markers
    currentMarkersRef.current.forEach(marker => {
      if (map.hasLayer(marker)) {
        map.removeLayer(marker);
      }
    });
    currentMarkersRef.current = [];

    const markers = [];

    if (alerts && geoData) {
      alerts.forEach(alert => {
        // Skip early warning alerts if layer is disabled
        if (alert.early_warning && !showEarlyWarning) {
          return;
        }
        
        // Skip early detection alerts if layer is disabled
        if (alert.early_detection && !showEarlyDetection) {
          return;
        }

        // Find the district geometry
        const district = geoData.features.find(f => f.properties.adm3_name === alert.district);
        if (district && district.geometry) {
          // Calculate centroid of the district
          const centroid = L.geoJSON(district).getBounds().getCenter();

          // Create marker with appropriate icon and color
          const isEarlyWarning = alert.early_warning;
          const iconHtml = isEarlyWarning ? '⚠️' : '🔍';
          const iconColor = isEarlyWarning ? '#dc2626' : '#ea580c';

          const alertIcon = L.divIcon({
            html: `<div style="
              background: ${iconColor};
              border-radius: 50%;
              width: 24px;
              height: 24px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              color: white;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">${iconHtml}</div>`,
            className: 'custom-alert-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          const marker = L.marker([centroid.lat, centroid.lng], { icon: alertIcon })
            .bindTooltip(`${alert.district}<br>${isEarlyWarning ? 'Early Warning' : 'Early Detection'}`, {
              permanent: false,
              direction: 'top'
            });

          markers.push(marker);
        }
      });
    }

    // Add all markers to map
    markers.forEach(marker => marker.addTo(map));
    
    // Store reference to current markers for cleanup
    currentMarkersRef.current = markers;

    // Cleanup function
    return () => {
      markers.forEach(marker => {
        if (map.hasLayer(marker)) {
          map.removeLayer(marker);
        }
      });
    };
  }, [map, alerts, showEarlyWarning, showEarlyDetection, geoData]);

  return null;
}

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
  filterRegion = "All Regions",
  alerts = [],
  showEarlyWarning = true,
  showEarlyDetection = true
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
    totprec: { grades: [0, 5, 15, 30], unit: "mm/day" },
    lst_day: { grades: [10, 20, 30, 40], unit: "°C" },
    lst_night: { grades: [0, 10, 20, 30], unit: "°C" },
    lst_mean: { grades: [5, 15, 25, 35], unit: "°C" },
    ndvi: { grades: [0, 0.2, 0.4, 0.6], unit: "index" },
    savi: { grades: [0, 0.2, 0.4, 0.6], unit: "index" },
    evi: { grades: [0, 0.2, 0.4, 0.6], unit: "index" },
    ndwi5: { grades: [-0.4, -0.1, 0.1, 0.3], unit: "index" },
    ndwi6: { grades: [-0.4, -0.1, 0.1, 0.3], unit: "index" }
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
    <div className="map-wrap">
      <MapContainer
        center={[9.0, 40.5]}
        zoom={6}
        className="district-map"
      >
        <TileLayer
          attribution="© OpenStreetMap, © CARTO"
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
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

        {/* Alert Markers */}
        <AlertMarkers
          alerts={alerts}
          showEarlyWarning={showEarlyWarning}
          showEarlyDetection={showEarlyDetection}
          geoData={geoData}
        />
      </MapContainer>
    </div>
  );
}
