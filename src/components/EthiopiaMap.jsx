// EthiopiaMap.jsx
import { MapContainer, TileLayer, GeoJSON, Pane, useMap } from "react-leaflet";
import { useEffect, useMemo, useState, useRef } from "react";
import union from "@turf/union";
import { featureCollection } from "@turf/helpers";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Woreda (district) lines stay thinner than the merged admin1 (region) ring drawn on top.
const WEIGHT_WOREDA = 0.6;
const WEIGHT_WOREDA_IN_FILTER = 0.9;
const WEIGHT_WOREDA_SELECTED = 1.5;
const WEIGHT_REGION_OUTLINE = 2.3;

/** One merged polygon per adm1; outer ring is the true regional boundary. */
function buildAdmin1Outlines(geo) {
  if (!geo?.features?.length) {
    return { type: "FeatureCollection", features: [] };
  }
  const byRegion = new Map();
  for (const f of geo.features) {
    const adm1 = f?.properties?.adm1_name;
    const g = f?.geometry;
    if (!adm1 || !g) continue;
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;
    if (!byRegion.has(adm1)) byRegion.set(adm1, []);
    byRegion.get(adm1).push({ type: "Feature", properties: {}, geometry: g });
  }
  const out = [];
  for (const [adm1_name, parts] of byRegion) {
    if (!parts.length) continue;
    const merged = union(featureCollection(parts), { properties: { adm1_name } });
    if (merged) out.push(merged);
  }
  return { type: "FeatureCollection", features: out };
}

const GIBS_OVERLAY_CONFIG = {
  rainfall: {
    layerId: "IMERG_Precipitation_Rate",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
  },
  temperature: {
    layerId: "MODIS_Terra_Land_Surface_Temp_Day",
    tileMatrixSet: "GoogleMapsCompatible_Level7",
  },
  ndvi: {
    layerId: "MODIS_Terra_NDVI_8Day",
    tileMatrixSet: "GoogleMapsCompatible_Level9",
  },
};

// Approximate interpretive scales for GIBS raster overlays (tiles use NASA color ramps).
const ENV_LAYER_LEGEND = {
  rainfall: {
    title: "Rainfall (IMERG)",
    subtitle: "Precipitation rate · NASA GIBS",
    grades: [0, 2, 8, 20],
    unit: "mm/hr",
    colors: ["#f7fcf5", "#c7e9c0", "#41b6c4", "#2c7fb8", "#253494"],
  },
  temperature: {
    title: "Land surface temp (MODIS)",
    subtitle: "Day LST · NASA GIBS",
    grades: [-10, 10, 25, 40],
    unit: "°C (approx.)",
    colors: ["#313695", "#74add1", "#fee090", "#f46d43", "#a50026"],
  },
  ndvi: {
    title: "NDVI (MODIS)",
    subtitle: "8-day composite · NASA GIBS",
    grades: [0, 0.2, 0.4, 0.6],
    unit: "index",
    colors: ["#d9d9d9", "#c2e699", "#78c679", "#238443", "#004529"],
  },
};

function legendColorForGrade(grades, colors, value) {
  if (value == null || Number.isNaN(Number(value))) return "#e5e5e5";
  const v = Number(value);
  if (v > grades[3]) return colors[4];
  if (v > grades[2]) return colors[3];
  if (v > grades[1]) return colors[2];
  if (v > grades[0]) return colors[1];
  return colors[0];
}

function buildGibsUrl(layerId, time, tileMatrixSet = "GoogleMapsCompatible_Level9") {
  // NASA GIBS WMTS (Web Mercator / Google Maps compatible).
  // Docs: https://nasa-gibs.github.io/gibs-api-docs/
  const safeTime = time || "2020-01-01";
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layerId}/default/${safeTime}/${tileMatrixSet}/{z}/{y}/{x}.png`;
}

function toGibsTime(dateStr) {
  // GIBS expects YYYY-MM-DD.
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function dateRangeSamples(startDateStr, endDateStr, count = 7) {
  const start = toGibsTime(startDateStr);
  const end = toGibsTime(endDateStr);
  if (!start || !end) return [];

  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return [];

  const minMs = Math.min(startMs, endMs);
  const maxMs = Math.max(startMs, endMs);

  const n = Math.max(1, Math.min(21, Number(count) || 7));
  if (n === 1 || minMs === maxMs) {
    return [new Date(maxMs).toISOString().slice(0, 10)];
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ms = Math.round(minMs + t * (maxMs - minMs));
    out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return Array.from(new Set(out));
}

function AveragedGibsLayer({
  layerId,
  tileMatrixSet,
  startDate,
  endDate,
  opacity = 0.4,
  pane,
  onStats,
}) {
  const map = useMap();

  const sampleDates = useMemo(
    () => dateRangeSamples(startDate, endDate, 7),
    [startDate, endDate]
  );

  useEffect(() => {
    if (!layerId) return undefined;
    if (!sampleDates.length) return undefined;

    // Track average loaded sample tiles across visible tiles.
    const statsRef = { tiles: 0, loaded: 0, attempted: sampleDates.length };
    let lastEmit = 0;
    const emit = () => {
      if (!onStats) return;
      const now = Date.now();
      if (now - lastEmit < 600) return;
      lastEmit = now;
      const loadedAverage = statsRef.tiles ? statsRef.loaded / statsRef.tiles : null;
      onStats({
        attempted: statsRef.attempted,
        loadedAverage: loadedAverage == null ? null : Number(loadedAverage.toFixed(2)),
        tiles: statsRef.tiles,
      });
    };

    const tileLayer = L.gridLayer({
      pane,
      opacity,
      tileSize: 256,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
      crossOrigin: "anonymous",
    });

    tileLayer.createTile = (coords, done) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        done(null, canvas);
        return canvas;
      }

      const urlFor = (dateStr) => {
        const url = buildGibsUrl(layerId, dateStr, tileMatrixSet)
          .replace("{z}", String(coords.z))
          .replace("{y}", String(coords.y))
          .replace("{x}", String(coords.x));
        return url;
      };

      let loaded = 0;
      let completed = false;
      const loadedImages = [];

      const finalize = () => {
        if (completed) return;
        completed = true;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (loadedImages.length) {
          // Average only across tiles that actually loaded (date coverage varies by layer).
          const drawAlpha = 1 / loadedImages.length;
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = drawAlpha;
          for (const img of loadedImages) {
            try {
              ctx.drawImage(img, 0, 0, 256, 256);
            } catch (e) {
              // ignore
            }
          }
        }

        statsRef.tiles += 1;
        statsRef.loaded += loadedImages.length;
        emit();
        done(null, canvas);
      };

      const maxTiles = sampleDates.length;

      sampleDates.forEach((dateStr) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.referrerPolicy = "no-referrer";
        img.onload = () => {
          loaded += 1;
          loadedImages.push(img);
          if (loaded === maxTiles) finalize();
        };
        img.onerror = () => {
          loaded += 1;
          if (loaded === maxTiles) finalize();
        };
        img.src = urlFor(dateStr);
      });

      // Safety timeout so a stuck tile doesn't block rendering.
      window.setTimeout(finalize, 8000);
      return canvas;
    };

    tileLayer.addTo(map);
    return () => {
      tileLayer.remove();
      if (onStats) {
        onStats({ attempted: sampleDates.length, loadedAverage: null, tiles: 0 });
      }
    };
  }, [map, layerId, sampleDates, opacity, pane]);

  return null;
}

function TimedGibsLayer({ layerId, tileMatrixSet, time, opacity = 0.4, pane }) {
  const t = toGibsTime(time) || "2020-01-01";
  // `key` forces a refresh when time changes.
  return (
    <TileLayer
      key={`${layerId}:${t}`}
      url={buildGibsUrl(layerId, t, tileMatrixSet)}
      opacity={opacity}
      pane={pane}
    />
  );
}

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
        const isEarlyWarning = Boolean(alert?.early_warning);
        // Treat early detection as a separate class from early warning.
        // Many records may have early_detection=true for warning cases, but the UI
        // expects the toggles to control the two icons independently.
        const isEarlyDetectionOnly = Boolean(alert?.early_detection) && !isEarlyWarning;

        // If it doesn't belong to either layer, skip.
        if (!isEarlyWarning && !isEarlyDetectionOnly) return;

        // Apply layer toggles.
        if (isEarlyWarning && !showEarlyWarning) return;
        if (isEarlyDetectionOnly && !showEarlyDetection) return;

        // Find the district geometry
        const district = geoData.features.find(f => f.properties.adm3_name === alert.district);
        if (district && district.geometry) {
          // Calculate centroid of the district
          const centroid = L.geoJSON(district).getBounds().getCenter();

          // Create marker with appropriate icon and color
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

function buildChoroplethLegendRows(getColor, grades) {
  const rows = [];
  for (let i = 0; i < grades.length; i++) {
    const from = grades[i];
    const to = grades[i + 1];
    rows.push({
      color: getColor(from + 0.01),
      label: `${from}${to != null ? ` – ${to}` : "+"}`,
    });
  }
  return rows;
}

function buildOverlayLegendRows(config) {
  const { grades, colors } = config;
  return buildChoroplethLegendRows(
    (v) => legendColorForGrade(grades, colors, v),
    grades
  );
}

// Legend for NASA GIBS environmental raster layer(s) when toggled on.
function MapLegend({ showRainfallLayer, showTemperatureLayer, showNdviLayer }) {
  const map = useMap();

  useEffect(() => {
    const overlaySections = [];
    if (showRainfallLayer) {
      const cfg = ENV_LAYER_LEGEND.rainfall;
      overlaySections.push({
        title: cfg.title,
        subtitle: cfg.subtitle,
        unit: cfg.unit,
        rows: buildOverlayLegendRows(cfg),
      });
    }
    if (showTemperatureLayer) {
      const cfg = ENV_LAYER_LEGEND.temperature;
      overlaySections.push({
        title: cfg.title,
        subtitle: cfg.subtitle,
        unit: cfg.unit,
        rows: buildOverlayLegendRows(cfg),
      });
    }
    if (showNdviLayer) {
      const cfg = ENV_LAYER_LEGEND.ndvi;
      overlaySections.push({
        title: cfg.title,
        subtitle: cfg.subtitle,
        unit: cfg.unit,
        rows: buildOverlayLegendRows(cfg),
      });
    }

    if (overlaySections.length === 0) {
      return undefined;
    }

    const legend = L.control({ position: "topright" });

    legend.onAdd = function () {
      const div = L.DomUtil.create("div", "info legend map-legend-stack");
      div.style.padding = "8px";
      div.style.background = "white";
      div.style.borderRadius = "6px";
      div.style.boxShadow = "0 0 6px rgba(0,0,0,0.3)";
      div.style.maxWidth = "220px";
      div.style.fontSize = "12px";
      div.style.lineHeight = "1.35";

      const parts = [];

      overlaySections.forEach((sec, idx) => {
        if (idx > 0) {
          parts.push(`<div style="margin:8px 0;border-top:1px solid #e5e7eb"></div>`);
        }
        parts.push(
          `<div style="font-weight:700">${sec.title}</div>` +
            `<div style="color:#64748b;font-size:11px;margin-bottom:4px">${sec.subtitle} · ${sec.unit}</div>`
        );
        sec.rows.forEach((r) => {
          parts.push(
            `<div style="margin:2px 0">` +
              `<i style="background:${r.color};width:16px;height:16px;display:inline-block;margin-right:6px;vertical-align:middle;border-radius:2px"></i>` +
              `<span style="vertical-align:middle">${r.label}</span>` +
              `</div>`
          );
        });
      });

      div.innerHTML = parts.join("");
      return div;
    };

    legend.addTo(map);
    return () => {
      legend.remove();
    };
  }, [map, showRainfallLayer, showTemperatureLayer, showNdviLayer]);

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
  showEarlyDetection = true,
  showRainfallLayer = false,
  showTemperatureLayer = false,
  showNdviLayer = false,
  envTimeMode = "average",
  envTimeDate = null,
  onEnvAverageStats = null,
}) {
  const [geoData, setGeo] = useState(null);
  const [admin1Outlines, setAdmin1Outlines] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const paneIdRef = useRef(null);
  if (paneIdRef.current == null) {
    const c = typeof window !== "undefined" ? window.crypto : null;
    paneIdRef.current = c?.randomUUID?.() ?? `p${String(Math.random()).slice(2, 12)}`;
  }
  const pDistrict = `ep-districts-${paneIdRef.current}`;
  const pAdmin1 = `ep-admin1-${paneIdRef.current}`;

  // "No Selection" means: remove boundaries/background fills, but keep overlays working.
  const hideBoundaries = filterRegion === "No Selection";

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

  useEffect(() => {
    if (!geoData) {
      setAdmin1Outlines(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      try {
        const built = buildAdmin1Outlines(geoData);
        if (!cancelled) setAdmin1Outlines(built);
      } catch (e) {
        console.error("Failed to build admin1 outlines", e);
        if (!cancelled) setAdmin1Outlines(null);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [geoData]);

  // dataset-specific breakpoints, units, and color ramps.
  // Legend swatches use the same getColor() so the map and legend stay aligned.
  const gradeConfig = {
    // Rainfall: muted tan -> teal/blue (more rain).
    totprec: {
      grades: [0, 5, 15, 30],
      unit: "mm/day",
      colors: ["#f1e8d4", "#c7e9c0", "#7fcdbb", "#41b6c4", "#1d91c0"],
    },

    // Temperature: cool -> warm.
    lst_day: {
      grades: [10, 20, 30, 40],
      unit: "°C",
      colors: ["#2b83ba", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"],
    },
    lst_night: {
      grades: [0, 10, 20, 30],
      unit: "°C",
      colors: ["#2b83ba", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"],
    },
    lst_mean: {
      grades: [5, 15, 25, 35],
      unit: "°C",
      colors: ["#2b83ba", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"],
    },

    // Vegetation: brown/gray -> green.
    ndvi: {
      grades: [0, 0.2, 0.4, 0.6],
      unit: "index",
      colors: ["#d9d9d9", "#ccebc5", "#a8ddb5", "#7bccc4", "#2ca25f"],
    },
    savi: {
      grades: [0, 0.2, 0.4, 0.6],
      unit: "index",
      colors: ["#d9d9d9", "#ccebc5", "#a8ddb5", "#7bccc4", "#2ca25f"],
    },
    evi: {
      grades: [0, 0.2, 0.4, 0.6],
      unit: "index",
      colors: ["#d9d9d9", "#ccebc5", "#a8ddb5", "#7bccc4", "#2ca25f"],
    },

    // Moisture/water indices: dry/negative -> wet/positive.
    ndwi5: {
      grades: [-0.4, -0.1, 0.1, 0.3],
      unit: "index",
      colors: ["#f7f7f7", "#d9d9d9", "#a6bddb", "#67a9cf", "#1c9099"],
    },
    ndwi6: {
      grades: [-0.4, -0.1, 0.1, 0.3],
      unit: "index",
      colors: ["#f7f7f7", "#d9d9d9", "#a6bddb", "#67a9cf", "#1c9099"],
    },
  };

  const activeScale = gradeConfig[dataset] || {
    grades: [0, 1],
    unit: "",
    colors: ["#f3f4f6", "#d1d5db", "#9ca3af", "#6b7280", "#374151"],
  };

  const { grades, unit, colors } = activeScale;

  const getColor = (value) => {
    if (value == null || Number.isNaN(Number(value))) return "#e5e5e5";
    const v = Number(value);
    if (v > grades[3]) return colors[4];
    if (v > grades[2]) return colors[3];
    if (v > grades[1]) return colors[2];
    if (v > grades[0]) return colors[1];
    return colors[0];
  };

  const filterKey = (filterRegion || "").trim();

  const admin1DataForView = useMemo(() => {
    if (!admin1Outlines?.features?.length) return null;
    if (filterRegion === "All Regions") return admin1Outlines;
    if (filterRegion === "No Selection") return null;
    return {
      type: "FeatureCollection",
      features: admin1Outlines.features.filter(
        (f) => (f?.properties?.adm1_name || "").trim() === filterKey
      ),
    };
  }, [admin1Outlines, filterRegion, filterKey]);

  const districtDataForView = useMemo(() => {
    if (!geoData) return null;
    if (filterRegion === "No Selection") return null;
    if (filterRegion === "All Regions") return geoData;
    return {
      type: "FeatureCollection",
      features: geoData.features.filter(
        (f) => (f.properties.adm1_name || "").trim() === filterKey
      ),
    };
  }, [geoData, filterRegion, filterKey]);

  // Woreda strokes (thin). Regional ring is a separate admin1 layer on top, thicker.
  const style = (feature) => {
    const districtName = feature?.properties?.adm3_name;
    const value = envData && districtName ? envData[districtName] : undefined;
    const isSelectedDistrict = districtName === selectedDistrict;
    const isInSelectedRegion =
      filterRegion !== "All Regions" && (feature?.properties?.adm1_name || "").trim() === filterKey;

    let borderWeight = WEIGHT_WOREDA;
    if (isSelectedDistrict) borderWeight = WEIGHT_WOREDA_SELECTED;
    else if (isInSelectedRegion) borderWeight = WEIGHT_WOREDA_IN_FILTER;

    return {
      fillColor: value !== undefined ? getColor(value) : "#e5e5e5",
      weight: borderWeight,
      color: "#000000",
      fillOpacity: 0.7,
    };
  };

  const admin1OutlineStyle = () => ({
    color: "#000000",
    weight: WEIGHT_REGION_OUTLINE,
    fillOpacity: 0,
    fill: false,
    interactive: false,
  });

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

        {/* Semi-transparent raster overlays (explanatory variables). */}
        {/* Put rasters ABOVE district polygons (overlayPane defaults ~400). */}
        <Pane name="env-raster-overlays" style={{ zIndex: 450 }}>
          {showRainfallLayer && (
            envTimeMode === "animate" ? (
              <TimedGibsLayer
                layerId={GIBS_OVERLAY_CONFIG.rainfall.layerId}
                tileMatrixSet={GIBS_OVERLAY_CONFIG.rainfall.tileMatrixSet}
                time={envTimeDate || endDate || startDate}
                opacity={0.42}
                pane="env-raster-overlays"
              />
            ) : (
              <AveragedGibsLayer
                layerId={GIBS_OVERLAY_CONFIG.rainfall.layerId}
                tileMatrixSet={GIBS_OVERLAY_CONFIG.rainfall.tileMatrixSet}
                startDate={startDate}
                endDate={endDate}
                opacity={0.42}
                pane="env-raster-overlays"
                onStats={onEnvAverageStats}
              />
            )
          )}

          {showTemperatureLayer && (
            envTimeMode === "animate" ? (
              <TimedGibsLayer
                layerId={GIBS_OVERLAY_CONFIG.temperature.layerId}
                tileMatrixSet={GIBS_OVERLAY_CONFIG.temperature.tileMatrixSet}
                time={envTimeDate || endDate || startDate}
                opacity={0.38}
                pane="env-raster-overlays"
              />
            ) : (
              <AveragedGibsLayer
                layerId={GIBS_OVERLAY_CONFIG.temperature.layerId}
                tileMatrixSet={GIBS_OVERLAY_CONFIG.temperature.tileMatrixSet}
                startDate={startDate}
                endDate={endDate}
                opacity={0.38}
                pane="env-raster-overlays"
                onStats={onEnvAverageStats}
              />
            )
          )}

          {showNdviLayer && (
            envTimeMode === "animate" ? (
              <TimedGibsLayer
                layerId={GIBS_OVERLAY_CONFIG.ndvi.layerId}
                tileMatrixSet={GIBS_OVERLAY_CONFIG.ndvi.tileMatrixSet}
                time={envTimeDate || endDate || startDate}
                opacity={0.38}
                pane="env-raster-overlays"
              />
            ) : (
              <AveragedGibsLayer
                layerId={GIBS_OVERLAY_CONFIG.ndvi.layerId}
                tileMatrixSet={GIBS_OVERLAY_CONFIG.ndvi.tileMatrixSet}
                startDate={startDate}
                endDate={endDate}
                opacity={0.38}
                pane="env-raster-overlays"
                onStats={onEnvAverageStats}
              />
            )
          )}
        </Pane>

        {!hideBoundaries && districtDataForView && (
          <Pane name={pDistrict} style={{ zIndex: 420 }}>
            <GeoJSON
              data={districtDataForView}
              style={style}
              onEachFeature={onEachFeature}
            />
          </Pane>
        )}

        {!hideBoundaries && admin1DataForView?.features?.length > 0 && (
          <Pane name={pAdmin1} style={{ zIndex: 430 }}>
            <GeoJSON data={admin1DataForView} style={admin1OutlineStyle} />
          </Pane>
        )}

        {(showRainfallLayer || showTemperatureLayer || showNdviLayer) && (
          <MapLegend
            showRainfallLayer={showRainfallLayer}
            showTemperatureLayer={showTemperatureLayer}
            showNdviLayer={showNdviLayer}
          />
        )}

        {/* Alert markers are independent of boundaries; keep enabled. */}
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
