// Dashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopToolbar from "./TopToolbar";
import EthiopiaMap from "../EthiopiaMap";
import EnvironmentalDataControls from "../EnvironmentalDataControls";
import ForecastChart from "../ForecastChart";
import ForecastAlertsTable from "../ForecastAlertsTable";
import EnvironmentalTimeSeriesChart from "../EnvironmentalTimeSeriesChart";
import DecisionLayers from "../DecisionLayers";
import EnvironmentalLayers from "../EnvironmentalLayers";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { FORECAST_API_BASE, runEpidemiaPipeline } from "../../api";
import {
  buildAdm3Lookup,
  findDistrictFromLookup,
  getDistrictNameVariants,
  normalizeDistrictKey,
} from "../../utils/districtNameMatch";
import "./dashboard-theme.css";

/** District choropleth fetch (Earth Engine). Set to true to show the panel again. */
const SHOW_FETCH_ENVIRONMENTAL_DATA_PANEL = false;

const MAP_SURFACE_OPTIONS = [
  { label: "Population", value: "population" },
  { label: "Precipitation", value: "totprec" },
  { label: "LST Day Temperature", value: "lst_day" },
  { label: "LST Night Temperature", value: "lst_night" },
  { label: "LST Mean Temperature", value: "lst_mean" },
  { label: "NDVI", value: "ndvi" },
  { label: "SAVI", value: "savi" },
  { label: "EVI", value: "evi" },
  { label: "NDWI5", value: "ndwi5" },
  { label: "NDWI6", value: "ndwi6" },
];

function formatPopulation(value) {
  if (value == null || Number.isNaN(Number(value))) return "No population data";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value));
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function alertStatus(alert) {
  if (alert?.early_warning) return "Early Warning";
  if (alert?.early_detection) return "Early Detection";
  return "Normal";
}

function buildWeekDates(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return [];

  const min = Math.min(start, end);
  const max = Math.max(start, end);

  const out = [];
  for (let t = min; t <= max; t += 7 * 24 * 60 * 60 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  if (out.length === 0) out.push(new Date(max).toISOString().slice(0, 10));
  return out;
}

function Dashboard() {
  const [disease, setDisease] = useState("Plasmodium falciparum malaria");
  const [country, setCountry] = useState("Ethiopia");
  const [forecastWeeks, setForecastWeeks] = useState(4);
  const [selectedAdminRegion, setSelectedAdminRegion] = useState("All Regions"); // Admin region filter (toolbar)
  /** What the map draws: matches toolbar except a named region is briefly "No Selection" to clear, then the region. */
  const [mapFilterRegion, setMapFilterRegion] = useState("All Regions");
  const mapRegionStepTimerRef = useRef(null);
  const [region, setRegion] = useState("All Regions");
  const [selectedGeometry, setSelectedGeometry] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [regions, setRegions] = useState([]); // List of available regions
  const [districts, setDistricts] = useState(["All Regions"]);
  const [epidemiaData, setEpidemiaData] = useState(null);
  const [epidemiaLoading, setEpidemiaLoading] = useState(false);
  const [epidemiaError, setEpidemiaError] = useState("");

  //  Environmental data states
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-03-07");
  const [dataset, setDataset] = useState("totprec");
  const [mapDataset, setMapDataset] = useState("population");
  const [geoData, setGeoData] = useState(null);
  const [envData, setEnvData] = useState({});
  const [populationSurface, setPopulationSurface] = useState({});
  const [generalPopulation, setGeneralPopulation] = useState([]);
  const [syncedHoverDate, setSyncedHoverDate] = useState(null);
  /** [start, end] date strings; null = each chart uses its own default x span */
  const [syncedXRange, setSyncedXRange] = useState(null);

  // Decision layers states
  const [showEarlyWarning, setShowEarlyWarning] = useState(true);
  const [showEarlyDetection, setShowEarlyDetection] = useState(true);

  // Environmental raster layers (explanatory variables)
  const [showRainfallLayer, setShowRainfallLayer] = useState(false);
  const [showTemperatureLayer, setShowTemperatureLayer] = useState(false);
  const [showNdviLayer, setShowNdviLayer] = useState(false);

  // Raster time controls
  const [envTimeMode, setEnvTimeMode] = useState("average"); // "average" | "animate"
  const weekDates = useMemo(() => buildWeekDates(startDate, endDate), [startDate, endDate]);
  const [weekIndex, setWeekIndex] = useState(0);
  const [envPlaying, setEnvPlaying] = useState(false);
  const [envAverageStats, setEnvAverageStats] = useState(null);

  // Keep slider index valid when date range changes.
  useEffect(() => {
    setWeekIndex((idx) => {
      const max = Math.max(0, weekDates.length - 1);
      return Math.min(Math.max(0, idx), max);
    });
  }, [weekDates]);

  // Stop playback when leaving animate mode or no dates.
  useEffect(() => {
    if (envTimeMode !== "animate" || weekDates.length < 2) {
      setEnvPlaying(false);
    }
  }, [envTimeMode, weekDates]);

  useEffect(() => {
    if (!envPlaying) return undefined;
    if (envTimeMode !== "animate") return undefined;
    if (weekDates.length < 2) return undefined;

    const interval = window.setInterval(() => {
      setWeekIndex((idx) => (idx + 1) % weekDates.length);
    }, 800);

    return () => window.clearInterval(interval);
  }, [envPlaying, envTimeMode, weekDates]);

  const gibsPrefetchTime = useMemo(() => {
    if (envTimeMode !== "animate" || !envPlaying || weekDates.length < 2) {
      return null;
    }
    return weekDates[(weekIndex + 1) % weekDates.length];
  }, [envTimeMode, envPlaying, weekDates, weekIndex]);

  const averageSampleInfo = useMemo(() => {
    if (envTimeMode !== "average") return "";
    if (!envAverageStats) return `Sampling 7 dates across ${startDate} → ${endDate}.`;
    const attempted = envAverageStats?.attempted ?? 7;
    const loaded = envAverageStats?.loadedAverage ?? null;
    if (loaded == null) return `Sampling ${attempted} dates across ${startDate} → ${endDate}.`;
    return `Sampling ${attempted} dates across ${startDate} → ${endDate}. Loaded ~${loaded} / ${attempted} on average (visible tiles).`;
  }, [envTimeMode, envAverageStats, startDate, endDate]);

  const selectedSpecies = disease === "Plasmodium falciparum malaria" ? "pfm" : 
                          disease === "Plasmodium vivax malaria" ? "pv" : "pv";
  const adm3Lookup = useMemo(() => buildAdm3Lookup(geoData), [geoData]);

  // Map clears to basemap-only ("No Selection") briefly, then shows the chosen view. Toolbar updates immediately.
  // "No Selection" alone applies immediately with no second step.
  const handleChangeAdminRegion = useCallback((value) => {
    if (mapRegionStepTimerRef.current) {
      clearTimeout(mapRegionStepTimerRef.current);
      mapRegionStepTimerRef.current = null;
    }
    setSelectedAdminRegion(value);
    if (value === "No Selection") {
      setMapFilterRegion("No Selection");
      return;
    }
    setMapFilterRegion("No Selection");
    mapRegionStepTimerRef.current = window.setTimeout(() => {
      mapRegionStepTimerRef.current = null;
      setMapFilterRegion(value);
    }, 150);
  }, []);

  useEffect(
    () => () => {
      if (mapRegionStepTimerRef.current) {
        clearTimeout(mapRegionStepTimerRef.current);
      }
    },
    []
  );

  const loadEpidemia = useCallback(async () => {
    setEpidemiaLoading(true);
    setEpidemiaError("");
    try {
      const data = await runEpidemiaPipeline({
        horizonWeeks: forecastWeeks,
        dataDir: "data",
        outputDir: "report",
        createReport: false,
      });
      setEpidemiaData(data);
    } catch (err) {
      console.error("Failed to run EPIDEMIA pipeline:", err);
      if (err.code === "ERR_NETWORK") {
        const endpointHint = FORECAST_API_BASE || "same origin";
        setEpidemiaError(`Cannot reach forecasting API at ${endpointHint}. Start backend server and try Refresh Forecast again.`);
      } else {
        setEpidemiaError(err.response?.data?.detail || err.message || "Failed to run EPIDEMIA pipeline");
      }
    } finally {
      setEpidemiaLoading(false);
    }
  }, [forecastWeeks]);

  useEffect(() => {
    loadEpidemia();
  }, [loadEpidemia]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/ethiopia_population_2022.json").then((res) => (res.ok ? res.json() : [])),
      fetch("/ethiopia_admin3_population_surface.json").then((res) => (res.ok ? res.json() : {})),
    ])
      .then(([populationRows, surface]) => {
        if (cancelled) return;
        setGeneralPopulation(Array.isArray(populationRows) ? populationRows : []);
        setPopulationSurface(surface && typeof surface === "object" ? surface : {});
      })
      .catch((err) => {
        console.error("Failed to load population data", err);
        if (!cancelled) {
          setGeneralPopulation([]);
          setPopulationSurface({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Extract unique regions from geoData when it loads
  React.useEffect(() => {
    if (geoData && geoData.features) {
      const regionSet = new Set(geoData.features.map((f) => f.properties.adm1_name).filter(Boolean));
      const regionList = Array.from(regionSet).sort();
      setRegions(["No Selection", "All Regions", ...regionList]);
    }
  }, [geoData]);

  // Basemap-only mode: clear overlays + district fills + selections.
  React.useEffect(() => {
    if (selectedAdminRegion !== "No Selection") return;
    // Basemap-only should *hide* layers, not reset user choices.
    // We still stop animation to avoid unnecessary tile churn.
    setEnvPlaying(false);
    setRegion("All Regions");
    setSelectedGeometry(null);
  }, [selectedAdminRegion]);

  // Build district dropdown list from selected region.
  React.useEffect(() => {
    if (!geoData?.features) {
      setDistricts(["All Regions"]);
      return;
    }

    const selectedRegionDistricts = geoData.features
      .filter((f) => {
        const adm1 = f?.properties?.adm1_name;
        return selectedAdminRegion === "All Regions" || adm1 === selectedAdminRegion;
      })
      .map((f) => f?.properties?.adm3_name)
      .filter(Boolean);

    const uniqueDistricts = ["All Regions", ...new Set(selectedRegionDistricts)].sort();
    setDistricts(uniqueDistricts);
  }, [geoData, selectedAdminRegion]);

  React.useEffect(() => {
    if (!districts.includes(region)) {
      setRegion("All Regions");
      setSelectedGeometry(null);
    }
  }, [districts, region]);

  // Update region when a district is clicked on the map
  const updateRegion = (selectedRegion) => {
    setRegion(selectedRegion);
    if (selectedRegion === "All Regions") {
      setSelectedGeometry(null);
      return;
    }

    // Find and set the geometry for this district
    if (geoData) {
      const feature = geoData.features.find((f) => f.properties.adm3_name === selectedRegion);
      if (feature) {
        setSelectedGeometry(feature.geometry.coordinates);
      }
    }
  };

  const selectedAlert = useMemo(() => {
    if (!epidemiaData?.alerts || region === "All Regions") return null;
    return (
      epidemiaData.alerts.find(
        (a) =>
          a.species === selectedSpecies &&
          (a.district === region ||
            findDistrictFromLookup(adm3Lookup, a.district)?.properties?.adm3_name === region)
      ) || null
    );
  }, [adm3Lookup, epidemiaData, region, selectedSpecies]);

  const selectedForecast = useMemo(() => {
    if (!epidemiaData?.forecasts || region === "All Regions") return null;
    const districtFc = epidemiaData.forecasts.find(
      (f) =>
        f.species === selectedSpecies &&
        (f.district === region ||
          findDistrictFromLookup(adm3Lookup, f.district)?.properties?.adm3_name === region)
    );
    if (!districtFc) return null;

    let observedRows = (districtFc.observed_history || []).map((point) => ({
      date: point.week_start,
      median: null,
      lower: null,
      upper: null,
      observed: point.observed,
    }));

    // Backward-compatible fallback for responses from older backend processes.
    if (observedRows.length === 0 && selectedAlert?.latest_observed != null && districtFc.forecast?.length) {
      observedRows = [
        {
          date: districtFc.forecast[0].week_start,
          median: null,
          lower: null,
          upper: null,
          observed: selectedAlert.latest_observed,
        },
      ];
    }

    const forecastRows = districtFc.forecast.map((point) => ({
      date: point.week_start,
      median: point.median,
      lower: point.lower,
      upper: point.upper,
      observed: null,
    }));

    return [...observedRows, ...forecastRows];
  }, [adm3Lookup, epidemiaData, region, selectedSpecies, selectedAlert]);

  const forecastSummary = useMemo(() => {
    const alerts = epidemiaData?.alerts || [];
    const speciesAlerts = alerts.filter((a) => a.species === selectedSpecies);
    const warningCount = speciesAlerts.filter((a) => a.early_warning).length;
    const detectionCount = speciesAlerts.filter(
      (a) => !a.early_warning && a.early_detection
    ).length;
    return {
      districts: speciesAlerts.length,
      warnings: warningCount,
      detections: detectionCount,
    };
  }, [epidemiaData, selectedSpecies]);

  const populationData = useMemo(() => {
    const out = { ...populationSurface };
    const featureByPcode = new Map();
    (geoData?.features || []).forEach((feature) => {
      const pcode = feature?.properties?.adm3_pcode;
      if (pcode) featureByPcode.set(String(pcode), feature);
    });

    generalPopulation.forEach((record) => {
      const population = Number(record.population_projection_2022);
      if (!Number.isFinite(population)) return;

      const codedFeature = record.admin_code
        ? featureByPcode.get(String(record.admin_code))
        : null;
      const codedName = codedFeature?.properties?.adm3_name;
      if (codedName) {
        out[codedName] = population;
        getDistrictNameVariants(codedName).forEach((variant) => {
          out[variant] = population;
          out[normalizeDistrictKey(variant)] = population;
        });
      }

      const names = [record.name, ...(record.aliases || [])].filter(Boolean);
      names.forEach((name) => {
        getDistrictNameVariants(name).forEach((variant) => {
          out[variant] = population;
          out[normalizeDistrictKey(variant)] = population;
        });

        const district = findDistrictFromLookup(adm3Lookup, name);
        const mapName = district?.properties?.adm3_name;
        if (mapName) {
          out[mapName] = population;
          getDistrictNameVariants(mapName).forEach((variant) => {
            out[variant] = population;
            out[normalizeDistrictKey(variant)] = population;
          });
        }
      });
    });

    const alerts = epidemiaData?.alerts || [];

    alerts
      .forEach((alert) => {
        const population = Number(alert.population_at_risk);
        if (!Number.isFinite(population)) return;

        const district = findDistrictFromLookup(adm3Lookup, alert.district);
        const mapName = district?.properties?.adm3_name || alert.district;
        if (mapName) {
          out[mapName] = population;
          getDistrictNameVariants(mapName).forEach((variant) => {
            out[variant] = population;
            out[normalizeDistrictKey(variant)] = population;
          });
        }
        out[alert.district] = population;
        getDistrictNameVariants(alert.district).forEach((variant) => {
          out[variant] = population;
          out[normalizeDistrictKey(variant)] = population;
        });
      });

    return out;
  }, [adm3Lookup, epidemiaData, generalPopulation, geoData, populationSurface]);

  const mapData = mapDataset === "population" ? populationData : envData;

  const forecastTableRows = useMemo(() => {
    const alerts = (epidemiaData?.alerts || []).filter((a) => a.species === selectedSpecies);
    const forecasts = (epidemiaData?.forecasts || []).filter((f) => f.species === selectedSpecies);
    const forecastByDistrict = new Map(forecasts.map((f) => [f.district, f]));

    return alerts.map((alert) => {
      const forecast = forecastByDistrict.get(alert.district);
      const feature = findDistrictFromLookup(adm3Lookup, alert.district);
      const mapDistrict = feature?.properties?.adm3_name || alert.district;
      const status = alertStatus(alert);
      const statusRank = status === "Early Warning" ? 3 : status === "Early Detection" ? 2 : 1;
      const latestForecast = finiteNumber(alert.latest_forecast);
      const detectionThreshold = finiteNumber(alert.detection_threshold);
      const warningThreshold = finiteNumber(alert.warning_threshold);
      const activeThreshold =
        status === "Early Warning" ? warningThreshold : detectionThreshold;
      const magnitude =
        latestForecast != null && activeThreshold != null ? latestForecast - activeThreshold : null;
      const magnitudePercent =
        magnitude != null && activeThreshold > 0 ? (magnitude / activeThreshold) * 100 : null;
      const persistenceWeeks = (forecast?.forecast || []).filter((point) => {
        const median = finiteNumber(point.median);
        return median != null && activeThreshold != null && median > activeThreshold;
      }).length;
      const populationAtRisk = finiteNumber(alert.population_at_risk);
      const positiveMagnitudePercent = Math.max(0, magnitudePercent || 0);
      const priority =
        (status === "Early Warning" ? 1000 : status === "Early Detection" ? 500 : 0) +
        positiveMagnitudePercent +
        persistenceWeeks * 10 +
        Math.log10(Math.max(populationAtRisk || 1, 1));

      return {
        rawDistrict: alert.district,
        mapDistrict,
        region: feature?.properties?.adm1_name || "",
        species: alert.species,
        status,
        statusRank,
        latestObserved: finiteNumber(alert.latest_observed),
        latestForecast,
        detectionThreshold,
        warningThreshold,
        activeThreshold,
        magnitude,
        magnitudePercent,
        persistenceWeeks,
        populationAtRisk,
        priority,
      };
    });
  }, [adm3Lookup, epidemiaData, selectedSpecies]);

  const forecastDateWindow = useMemo(() => {
    if (!selectedForecast || selectedForecast.length === 0) return null;

    const dates = selectedForecast
      .map((point) => point.date)
      .filter(Boolean)
      .sort();

    if (dates.length === 0) return null;

    return {
      startDate: dates[0],
      endDate: dates[dates.length - 1],
    };
  }, [selectedForecast]);

  useEffect(() => {
    setSyncedXRange(null);
  }, [
    region,
    dataset,
    mapDataset,
    startDate,
    endDate,
    disease,
    forecastDateWindow?.startDate,
    forecastDateWindow?.endDate,
  ]);

  // PDF export function
  const handleExportPDF = () => {
    const element = document.getElementById("dashboard");
    if (!element) return window.alert("Dashboard content not found!");

    setExporting(true);

    html2canvas(element, { scale: 2, useCORS: true }).then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("landscape", "pt", "a4");

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save("EPIDEMIA_Report.pdf");

      setExporting(false);
    });
  };

  return (
    <div id="dashboard" className="dashboard-shell">
      <TopToolbar
        disease={disease}
        onChangeDisease={setDisease}
        country={country}
        onChangeCountry={setCountry}
        forecastWeeks={forecastWeeks}
        onChangeForecastWeeks={setForecastWeeks}
        selectedAdminRegion={selectedAdminRegion}
        onChangeAdminRegion={handleChangeAdminRegion}
        availableRegions={regions}
        selectedDistrict={region}
        onChangeDistrict={updateRegion}
        availableDistricts={districts}
        onRefreshForecast={loadEpidemia}
        refreshingForecast={epidemiaLoading}
        onExportPDF={handleExportPDF}
        exporting={exporting}
      />

      <div className="dashboard-layout">
        <main className="main-content">
          <section className="dashboard-hero fade-in-up">
            <p className="dashboard-kicker">Real-Time Surveillance Platform</p>
            <h1 className="dashboard-title">{disease} Early Warning ({country})</h1>
          </section>

        <section className="forecast-cards fade-in-up delay-1">
          <article className="glass-card forecast-card">
            <h4>Pipeline</h4>
            <p>{epidemiaLoading ? "Running" : epidemiaError ? "Error" : "Ready"}</p>
          </article>
          <article className="glass-card forecast-card">
            <h4>Early Warnings</h4>
            <p>{forecastSummary.warnings}</p>
          </article>
          <article className="glass-card forecast-card">
            <h4>Early Detections</h4>
            <p>{forecastSummary.detections}</p>
          </article>
          <article className="glass-card forecast-card">
            <h4>Districts Modeled</h4>
            <p>{forecastSummary.districts}</p>
          </article>
        </section>

        <section className="dashboard-grid fade-in-up delay-2">
          {/* Map */}
          <div className="glass-card map-panel">
            <div className="panel-header">
              <h3>District Risk Surface</h3>
              <label className="map-surface-control">
                <span>Surface</span>
                <select
                  className="toolbar-select"
                  value={mapDataset}
                  onChange={(e) => setMapDataset(e.target.value)}
                >
                  {MAP_SURFACE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <EthiopiaMap
              onSelectRegion={updateRegion}
              startDate={startDate}
              endDate={endDate}
              dataset={mapDataset}
              envData={mapData}
              setGeoData={setGeoData}
              filterRegion={mapFilterRegion}
              alerts={epidemiaData?.alerts || []}
              selectedSpecies={selectedSpecies}
              showEarlyWarning={showEarlyWarning}
              showEarlyDetection={showEarlyDetection}
              selectedDistrictName={region !== "All Regions" ? region : null}
              showRainfallLayer={showRainfallLayer}
              showTemperatureLayer={showTemperatureLayer}
              showNdviLayer={showNdviLayer}
              envTimeMode={envTimeMode}
              envTimeDate={weekDates[weekIndex]}
              gibsPrefetchTime={gibsPrefetchTime}
              onEnvAverageStats={setEnvAverageStats}
            />

            <div className="map-layer-controls">
              <DecisionLayers
                showEarlyWarning={showEarlyWarning}
                showEarlyDetection={showEarlyDetection}
                onToggleEarlyWarning={() => setShowEarlyWarning(!showEarlyWarning)}
                onToggleEarlyDetection={() => setShowEarlyDetection(!showEarlyDetection)}
              />

              <EnvironmentalLayers
                startDate={startDate}
                endDate={endDate}
                onChangeStartDate={setStartDate}
                onChangeEndDate={setEndDate}
                showRainfall={showRainfallLayer}
                showTemperature={showTemperatureLayer}
                showNdvi={showNdviLayer}
                onToggleRainfall={() => setShowRainfallLayer((v) => !v)}
                onToggleTemperature={() => setShowTemperatureLayer((v) => !v)}
                onToggleNdvi={() => setShowNdviLayer((v) => !v)}
                timeMode={envTimeMode}
                onChangeTimeMode={setEnvTimeMode}
                weekDates={weekDates}
                weekIndex={weekIndex}
                onChangeWeekIndex={setWeekIndex}
                playing={envPlaying}
                onTogglePlaying={() => setEnvPlaying((v) => !v)}
                averageSampleInfo={averageSampleInfo}
              />
            </div>

            {SHOW_FETCH_ENVIRONMENTAL_DATA_PANEL && (
              <div className="glass-card fade-in-up delay-2 env-fetch-sidebar">
                <EnvironmentalDataControls
                  geoData={geoData}
                  startDate={startDate}
                  endDate={endDate}
                  dataset={dataset}
                  setDataset={setDataset}
                  onDataFetched={setEnvData}
                />
              </div>
            )}
          </div>

          {/* Region info and environmental time series chart */}
          <div className="glass-card insights-panel">
            <div className="panel-header">
              <h3>{region}</h3>
              <span>District Insight</span>
            </div>

            {epidemiaError && (
              <div className="chart-state chart-state-error">{epidemiaError}</div>
            )}

            {selectedAlert && (
              <>
                <div className="alert-row">
                  {selectedAlert.early_warning && (
                    <span className="alert-warning">Early Warning</span>
                  )}
                  {!selectedAlert.early_warning && selectedAlert.early_detection && (
                    <span className="alert-detection">Early Detection</span>
                  )}
                </div>
                <div className="population-row">
                  <span>Population at risk</span>
                  <strong>{formatPopulation(selectedAlert.population_at_risk)}</strong>
                </div>
              </>
            )}

            {epidemiaLoading && (
              <div className="chart-state">Updating district forecast...</div>
            )}

            {/* Time series chart for selected district */}
            <EnvironmentalTimeSeriesChart
              selectedDistrict={region !== "All Regions" ? region : null}
              districtGeometry={selectedGeometry}
              startDate={forecastDateWindow?.startDate || startDate}
              endDate={forecastDateWindow?.endDate || endDate}
              dataset={dataset}
              syncedHoverDate={syncedHoverDate}
              onHoverDateChange={setSyncedHoverDate}
              syncedXRange={syncedXRange}
              onXRangeChange={setSyncedXRange}
            />

            {selectedForecast && (
              <section className="forecast-panel">
                <h4>Transmission Forecast ({selectedSpecies.toUpperCase()})</h4>
                <ForecastChart
                  data={selectedForecast}
                  alert={selectedAlert}
                  syncedHoverDate={syncedHoverDate}
                  onHoverDateChange={setSyncedHoverDate}
                  syncedXRange={syncedXRange}
                  onXRangeChange={setSyncedXRange}
                />
              </section>
            )}

            {!epidemiaLoading && !selectedForecast && region !== "All Regions" && (
              <div className="chart-state">No district forecast available for this selection.</div>
            )}
          </div>
        </section>

        <ForecastAlertsTable
          rows={forecastTableRows}
          selectedDistrict={region}
          onSelectDistrict={updateRegion}
        />
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
