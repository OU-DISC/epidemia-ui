// Dashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopToolbar from "./TopToolbar";
import EthiopiaMap from "../EthiopiaMap";
import EnvironmentalDataControls from "../EnvironmentalDataControls";
import ForecastChart from "../ForecastChart";
import ForecastAlertsTable from "../ForecastAlertsTable";
import MultiDistrictComparisonChart from "../MultiDistrictComparisonChart";
import SituationStrip from "../SituationStrip";
import HelpTip from "../HelpTip";
import { DASHBOARD_HELP } from "../../utils/dashboardHelpText";
import EnvironmentalTimeSeriesChart from "../EnvironmentalTimeSeriesChart";
import DecisionLayers from "../DecisionLayers";
import EnvironmentalLayers from "../EnvironmentalLayers";
import {
  FORECAST_API_BASE,
  fetchLatestEpidemiaReport,
  runEpidemiaPipeline,
} from "../../api";
import {
  buildAdm3Lookup,
  findDistrictFromLookup,
  getDistrictNameVariants,
  normalizeDistrictKey,
} from "../../utils/districtNameMatch";
import { buildAlertTooltipLookup } from "../../utils/buildAlertTooltipLookup";
import {
  buildAlertWeekDates,
  buildAlertsForWeek,
  buildAnimatedAlertTooltipLookup,
  countAlertTypes,
} from "../../utils/buildAlertHistory";
import { buildDistrictTooltipLookup } from "../../utils/buildDistrictTooltipLookup";
import { buildComparisonDistrictOptions, buildDistrictForecastSeries } from "../../utils/buildDistrictForecastSeries";
import { exportWeeklyReport } from "../../utils/exportWeeklyReport";
import { speciesToDisease } from "../../utils/projectStorage";
import "./dashboard-theme.css";

/** District choropleth fetch (Earth Engine). Set to true to show the panel again. */
const SHOW_FETCH_ENVIRONMENTAL_DATA_PANEL = false;

const WEATHER_DATASET_OPTIONS = [
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

const HEALTH_LAYER_OPTIONS = [
  { label: "Population", value: "population" },
  { label: "Incident Rate", value: "incident_rate" },
];

function formatPopulation(value) {
  if (value == null || Number.isNaN(Number(value))) return "No population data";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value));
}

function DiseaseTitle({ disease, country }) {
  const speciesName = disease.replace(/\s+malaria$/i, "");
  return (
    <>
      <em>{speciesName}</em> malaria Early Warning ({country})
    </>
  );
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function surfaceValueForDistrict(surface, districtName) {
  if (!surface || !districtName) return null;
  const exact = finiteNumber(surface[districtName]);
  if (exact != null) return exact;

  const normalized = finiteNumber(surface[normalizeDistrictKey(districtName)]);
  if (normalized != null) return normalized;

  for (const variant of getDistrictNameVariants(districtName)) {
    const value = finiteNumber(surface[variant] ?? surface[normalizeDistrictKey(variant)]);
    if (value != null) return value;
  }

  return null;
}

function yearFromDate(value) {
  const match = String(value || "").match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

function nearestAvailableYear(targetYear, years) {
  if (!targetYear || years.length === 0) return null;
  if (years.includes(targetYear)) return targetYear;

  return years.reduce((nearest, year) => {
    if (nearest == null) return year;
    return Math.abs(year - targetYear) < Math.abs(nearest - targetYear) ? year : nearest;
  }, null);
}

function isObjectRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

async function fetchJsonIfAvailable(url) {
  const res = await fetch(url);
  if (!res.ok) return null;

  const text = await res.text();
  if (!text.trim() || text.trimStart().startsWith("<")) return null;

  return JSON.parse(text);
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

function Dashboard({
  projectConfig = null,
  bootstrapEpidemiaData = null,
  onBootstrapConsumed,
  onOpenProjectWizard,
}) {
  const [disease, setDisease] = useState(
    () => speciesToDisease(projectConfig?.defaultSpecies) || "Plasmodium falciparum malaria"
  );
  const [country, setCountry] = useState("Ethiopia");
  const [forecastWeeks, setForecastWeeks] = useState(projectConfig?.horizonWeeks || 4);
  const [selectedAdminRegion, setSelectedAdminRegion] = useState(
    projectConfig?.defaultRegion || "All Regions"
  );
  /** What the map draws: matches toolbar except a named region is briefly "No Selection" to clear, then the region. */
  const [mapFilterRegion, setMapFilterRegion] = useState(
    projectConfig?.defaultRegion || "All Regions"
  );
  const mapRegionStepTimerRef = useRef(null);
  const [region, setRegion] = useState(projectConfig?.defaultRegion || "All Regions");
  const [selectedGeometry, setSelectedGeometry] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [regions, setRegions] = useState([]); // List of available regions
  const [districts, setDistricts] = useState(["All Regions"]);
  const [epidemiaData, setEpidemiaData] = useState(null);
  const [epidemiaLoading, setEpidemiaLoading] = useState(false);
  const [epidemiaRefreshing, setEpidemiaRefreshing] = useState(false);
  const [epidemiaError, setEpidemiaError] = useState("");
  const forecastRequestIdRef = useRef(0);
  const userPrefersAllDistrictsRef = useRef(false);
  const projectDataDir = projectConfig?.dataDir || "data";
  const projectOutputDir = projectConfig?.outputDir || "report";

  //  Environmental data states
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-03-07");
  const [dataset, setDataset] = useState("totprec");
  const [healthLayer, setHealthLayer] = useState("population");
  const [geoData, setGeoData] = useState(null);
  const [, setEnvData] = useState({});
  const [populationSurfacesByYear, setPopulationSurfacesByYear] = useState({});
  const [legacyPopulationSurface, setLegacyPopulationSurface] = useState({});
  const [syncedHoverDate, setSyncedHoverDate] = useState(null);
  /** [start, end] date strings; null = each chart uses its own default x span */
  const [syncedXRange, setSyncedXRange] = useState(null);
  const [rightPanelView, setRightPanelView] = useState("charts");
  const [comparisonDistricts, setComparisonDistricts] = useState(["", "", ""]);

  // Decision layers states
  const [showEarlyWarning, setShowEarlyWarning] = useState(true);
  const [showEarlyDetection, setShowEarlyDetection] = useState(true);

  // Alert history animation (last 4–8 weeks from observed case history)
  const [alertTimeMode, setAlertTimeMode] = useState("current"); // "current" | "animate"
  const [alertHistoryWeeks, setAlertHistoryWeeks] = useState(8);
  const [alertWeekIndex, setAlertWeekIndex] = useState(0);
  const [alertPlaying, setAlertPlaying] = useState(false);

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

  const alertWeekDates = useMemo(
    () =>
      buildAlertWeekDates(
        epidemiaData?.forecasts,
        selectedSpecies,
        alertHistoryWeeks,
        endDate
      ),
    [epidemiaData?.forecasts, selectedSpecies, alertHistoryWeeks, endDate]
  );

  useEffect(() => {
    setAlertWeekIndex((idx) => {
      const max = Math.max(0, alertWeekDates.length - 1);
      return Math.min(Math.max(0, idx), max);
    });
  }, [alertWeekDates]);

  useEffect(() => {
    if (alertTimeMode !== "animate" || alertWeekDates.length < 2) {
      setAlertPlaying(false);
    }
  }, [alertTimeMode, alertWeekDates]);

  useEffect(() => {
    if (!alertPlaying) return undefined;
    if (alertTimeMode !== "animate") return undefined;
    if (alertWeekDates.length < 2) return undefined;

    const interval = window.setInterval(() => {
      setAlertWeekIndex((idx) => (idx + 1) % alertWeekDates.length);
    }, 900);

    return () => window.clearInterval(interval);
  }, [alertPlaying, alertTimeMode, alertWeekDates]);

  const alertAnimationWeek =
    alertTimeMode === "animate" && alertWeekDates.length
      ? alertWeekDates[alertWeekIndex]
      : null;

  const mapAlerts = useMemo(() => {
    if (alertTimeMode !== "animate" || !alertAnimationWeek) {
      return epidemiaData?.alerts || [];
    }
    return buildAlertsForWeek(
      epidemiaData?.forecasts,
      epidemiaData?.alerts,
      selectedSpecies,
      alertAnimationWeek
    );
  }, [
    alertTimeMode,
    alertAnimationWeek,
    epidemiaData?.forecasts,
    epidemiaData?.alerts,
    selectedSpecies,
  ]);

  const alertWeekCounts = useMemo(() => countAlertTypes(mapAlerts), [mapAlerts]);

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

  const loadLatestEpidemia = useCallback(async () => {
    const requestId = forecastRequestIdRef.current + 1;
    forecastRequestIdRef.current = requestId;
    setEpidemiaLoading(true);
    setEpidemiaError("");
    try {
      const data = await fetchLatestEpidemiaReport({ outputDir: projectOutputDir });
      if (forecastRequestIdRef.current === requestId) {
        setEpidemiaData(data);
      }
    } catch (err) {
      console.error("Failed to load latest EPIDEMIA report:", err);
      if (forecastRequestIdRef.current === requestId) {
        if (err.code === "ERR_NETWORK") {
          const endpointHint = FORECAST_API_BASE || "same origin";
          setEpidemiaError(
            `Cannot reach forecasting API at ${endpointHint}. Start backend server and try Refresh Forecast again.`
          );
        } else {
          setEpidemiaError(
            err.response?.data?.detail || err.message || "Failed to load latest forecast report"
          );
        }
      }
    } finally {
      setEpidemiaLoading(false);
    }
  }, [projectOutputDir]);

  const refreshEpidemia = useCallback(async () => {
    const requestId = forecastRequestIdRef.current + 1;
    forecastRequestIdRef.current = requestId;
    setEpidemiaRefreshing(true);
    setEpidemiaError("");
    try {
      const data = await runEpidemiaPipeline({
        horizonWeeks: forecastWeeks,
        dataDir: projectDataDir,
        outputDir: projectOutputDir,
        createReport: false,
      });
      if (forecastRequestIdRef.current === requestId) {
        setEpidemiaData(data);
      }
    } catch (err) {
      console.error("Failed to run EPIDEMIA pipeline:", err);
      if (forecastRequestIdRef.current === requestId) {
        if (err.code === "ERR_NETWORK") {
          const endpointHint = FORECAST_API_BASE || "same origin";
          setEpidemiaError(
            `Cannot reach forecasting API at ${endpointHint}. Start backend server and try again.`
          );
        } else {
          setEpidemiaError(
            err.response?.data?.detail || err.message || "Failed to refresh forecast"
          );
        }
      }
    } finally {
      setEpidemiaRefreshing(false);
    }
  }, [forecastWeeks, projectDataDir, projectOutputDir]);

  useEffect(() => {
    if (!bootstrapEpidemiaData) return;
    setEpidemiaData(bootstrapEpidemiaData);
    setEpidemiaError("");
    onBootstrapConsumed?.();
  }, [bootstrapEpidemiaData, onBootstrapConsumed]);

  useEffect(() => {
    loadLatestEpidemia();
  }, [loadLatestEpidemia]);

  useEffect(() => {
    let cancelled = false;
    const loadPopulationSurface = async () => {
      try {
        const byYear = await fetchJsonIfAvailable("/ethiopia_admin3_population_surface_by_year.json");
        if (isObjectRecord(byYear) && Object.values(byYear).some(isObjectRecord)) {
          if (!cancelled) {
            setPopulationSurfacesByYear(byYear);
            setLegacyPopulationSurface({});
          }
          return;
        }

        const surface = await fetchJsonIfAvailable("/ethiopia_admin3_population_surface.json");
        if (cancelled) return;
        setPopulationSurfacesByYear({});
        setLegacyPopulationSurface(isObjectRecord(surface) ? surface : {});
      } catch (err) {
        console.error("Failed to load population data", err);
        if (!cancelled) {
          setPopulationSurfacesByYear({});
          setLegacyPopulationSurface({});
        }
      }
    };

    loadPopulationSurface();

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

  const updateRegion = useCallback((selectedRegion) => {
    userPrefersAllDistrictsRef.current = selectedRegion === "All Regions";
    setRegion(selectedRegion);
    if (selectedRegion === "All Regions") {
      setSelectedGeometry(null);
      return;
    }

    if (geoData) {
      const feature = geoData.features.find((f) => f.properties.adm3_name === selectedRegion);
      if (feature) {
        setSelectedGeometry(feature.geometry.coordinates);
      }
    }
  }, [geoData]);

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
      detection_threshold: point.detection_threshold ?? null,
      warning_threshold: point.warning_threshold ?? null,
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
      detection_threshold: point.detection_threshold ?? null,
      warning_threshold: point.warning_threshold ?? null,
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

  const populationSurfaceYears = useMemo(
    () =>
      Object.keys(populationSurfacesByYear)
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b),
    [populationSurfacesByYear]
  );

  const populationYear = useMemo(
    () => nearestAvailableYear(yearFromDate(endDate), populationSurfaceYears),
    [endDate, populationSurfaceYears]
  );

  const populationSurface = useMemo(() => {
    if (populationYear != null) {
      return populationSurfacesByYear[String(populationYear)] || {};
    }
    return legacyPopulationSurface;
  }, [legacyPopulationSurface, populationSurfacesByYear, populationYear]);

  const populationData = useMemo(() => {
    const out = { ...populationSurface };

    const assignIfMissing = (name, population) => {
      if (!name || !Number.isFinite(population)) return;
      const variants = [name, ...getDistrictNameVariants(name)];
      variants.forEach((variant) => {
        const normalized = normalizeDistrictKey(variant);
        if (out[variant] == null && out[normalized] == null) {
          out[variant] = population;
          out[normalized] = population;
        }
      });
    };

    // WorldPop is the primary population source for the map. Only fill gaps when a
    // district is missing from the WorldPop surface (legacy name mismatches).
    (epidemiaData?.alerts || []).forEach((alert) => {
      const population = Number(alert.population_at_risk);
      if (!Number.isFinite(population)) return;

      const district = findDistrictFromLookup(adm3Lookup, alert.district);
      const mapName = district?.properties?.adm3_name || alert.district;
      assignIfMissing(mapName, population);
      assignIfMissing(alert.district, population);
    });

    return out;
  }, [adm3Lookup, epidemiaData, populationSurface]);

  const incidentRateData = useMemo(() => {
    const out = {};
    const assignRate = (name, rate) => {
      if (!name || !Number.isFinite(rate)) return;
      const variants = [name, ...getDistrictNameVariants(name)];
      variants.forEach((variant) => {
        out[variant] = rate;
        out[normalizeDistrictKey(variant)] = rate;
      });
    };

    (epidemiaData?.alerts || [])
      .filter((alert) => alert.species === selectedSpecies)
      .forEach((alert) => {
        const observed = finiteNumber(alert.latest_observed);
        if (observed == null) return;

        const district = findDistrictFromLookup(adm3Lookup, alert.district);
        const mapName = district?.properties?.adm3_name || alert.district;
        const population =
          surfaceValueForDistrict(populationData, mapName) ??
          finiteNumber(alert.population_at_risk);
        if (population == null || population <= 0) return;

        const rate = (observed / population) * 100000;
        assignRate(mapName, rate);
        assignRate(alert.district, rate);
      });

    return out;
  }, [adm3Lookup, epidemiaData, populationData, selectedSpecies]);

  const healthLayerData = healthLayer === "incident_rate" ? incidentRateData : populationData;

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
        const warningThreshold = finiteNumber(point.warning_threshold);
        const detectionThreshold = finiteNumber(point.detection_threshold);
        if (median == null) return false;
        if (warningThreshold != null && median > warningThreshold) return true;
        if (detectionThreshold != null && median > detectionThreshold) return true;
        return false;
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

  const topPriorityDistrict = useMemo(() => {
    const options = buildComparisonDistrictOptions(forecastTableRows, selectedAdminRegion);
    return options[0]?.value || null;
  }, [forecastTableRows, selectedAdminRegion]);

  React.useEffect(() => {
    if (districts.includes(region)) return;

    userPrefersAllDistrictsRef.current = false;
    if (topPriorityDistrict && districts.includes(topPriorityDistrict)) {
      updateRegion(topPriorityDistrict);
      return;
    }

    setRegion("All Regions");
    setSelectedGeometry(null);
  }, [districts, region, topPriorityDistrict, updateRegion]);

  React.useEffect(() => {
    if (userPrefersAllDistrictsRef.current) return;
    if (!topPriorityDistrict || region !== "All Regions") return;
    updateRegion(topPriorityDistrict);
  }, [topPriorityDistrict, region, updateRegion]);

  const defaultComparisonDistricts = useMemo(() => {
    const options = buildComparisonDistrictOptions(forecastTableRows, selectedAdminRegion);
    return [
      options[0]?.value || "",
      options[1]?.value || "",
      options[2]?.value || "",
    ];
  }, [forecastTableRows, selectedAdminRegion]);

  React.useEffect(() => {
    setComparisonDistricts(defaultComparisonDistricts);
  }, [defaultComparisonDistricts]);

  const comparisonSeries = useMemo(() => {
    const uniqueDistricts = [...new Set(comparisonDistricts.filter(Boolean))].slice(0, 3);
    return uniqueDistricts
      .map((districtName) =>
        buildDistrictForecastSeries(
          epidemiaData,
          adm3Lookup,
          districtName,
          selectedSpecies
        )
      )
      .filter(Boolean);
  }, [adm3Lookup, comparisonDistricts, epidemiaData, selectedSpecies]);

  const toggleComparisonDistrict = useCallback(
    (districtName) => {
      setComparisonDistricts((current) => {
        const isSelected = current.includes(districtName);
        let next;

        if (isSelected) {
          const remaining = current.filter((district) => district !== districtName);
          next = [remaining[0] || "", remaining[1] || "", remaining[2] || ""];
          if (region === districtName) {
            const fallback = next.find(Boolean);
            updateRegion(fallback || topPriorityDistrict || "All Regions");
          }
        } else {
          const active = current.filter(Boolean);
          if (active.length < 3) {
            next = [...current];
            const slot = next.findIndex((district) => !district);
            next[slot] = districtName;
          } else {
            next = [current[0], current[1], districtName];
          }
          updateRegion(districtName);
        }

        return next;
      });
    },
    [region, topPriorityDistrict, updateRegion]
  );

  const pipelineStatus = useMemo(() => {
    if (epidemiaRefreshing) return { kind: "running", label: "Running" };
    if (epidemiaLoading) return { kind: "loading", label: "Loading latest" };
    if (epidemiaError) return { kind: "error", label: "Error" };
    return { kind: "ready", label: "Ready" };
  }, [epidemiaLoading, epidemiaRefreshing, epidemiaError]);

  const speciesLabel = selectedSpecies === "pv" ? "P. vivax" : "P. falciparum";

  const currentAlertTooltipByDistrict = useMemo(
    () =>
      buildAlertTooltipLookup({
        forecastTableRows,
        alerts: epidemiaData?.alerts || [],
        selectedSpecies,
        speciesLabel,
        populationData,
        incidentRateData,
        populationYear,
        surfaceValueForDistrict,
      }),
    [
      forecastTableRows,
      epidemiaData?.alerts,
      selectedSpecies,
      speciesLabel,
      populationData,
      incidentRateData,
      populationYear,
    ]
  );

  const alertTooltipByDistrict = useMemo(() => {
    if (alertTimeMode !== "animate" || !alertAnimationWeek) {
      return currentAlertTooltipByDistrict;
    }
    return buildAnimatedAlertTooltipLookup(mapAlerts, speciesLabel, alertAnimationWeek);
  }, [
    alertTimeMode,
    alertAnimationWeek,
    currentAlertTooltipByDistrict,
    mapAlerts,
    speciesLabel,
  ]);

  const districtTooltipByDistrict = useMemo(
    () =>
      buildDistrictTooltipLookup({
        forecastTableRows,
        populationData,
        populationYear,
        surfaceValueForDistrict,
      }),
    [forecastTableRows, populationData, populationYear]
  );

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
    healthLayer,
    startDate,
    endDate,
    disease,
    forecastDateWindow?.startDate,
    forecastDateWindow?.endDate,
  ]);

  // Weekly report export
  const handleExportPDF = async () => {
    setExporting(true);
    const previousView = rightPanelView;

    try {
      if (region !== "All Regions") {
        setRightPanelView("charts");
        await new Promise((resolve) => setTimeout(resolve, 700));
      }

      const topAlerts = [...forecastTableRows]
        .filter((row) => row.statusRank > 1)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 5);

      await exportWeeklyReport({
        disease,
        country,
        speciesLabel,
        generatedAt: epidemiaData?.generated_at,
        summary: forecastSummary,
        topAlerts,
        tableRows: forecastTableRows,
        selectedDistrict: region,
        selectedDistrictInsight:
          region !== "All Regions"
            ? forecastTableRows.find((row) => row.mapDistrict === region) || null
            : null,
        dateRange: {
          startDate: forecastDateWindow?.startDate || startDate,
          endDate: forecastDateWindow?.endDate || endDate,
        },
      });
    } catch (err) {
      console.error("Failed to export weekly report:", err);
      window.alert(err?.message || "Failed to export weekly report.");
    } finally {
      setRightPanelView(previousView);
      setExporting(false);
    }
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
        onRefreshForecast={refreshEpidemia}
        refreshingForecast={epidemiaRefreshing}
        onExportPDF={handleExportPDF}
        exporting={exporting}
        projectName={projectConfig?.projectName}
        onNewProject={onOpenProjectWizard}
      />

      <div className="dashboard-layout">
        <main className="main-content">
          <section className="dashboard-hero fade-in-up">
            <p className="dashboard-kicker">Real-Time Surveillance Platform</p>
            <h1 className="dashboard-title">
              <DiseaseTitle disease={disease} country={country} />
            </h1>
          </section>

        <SituationStrip summary={forecastSummary} pipelineStatus={pipelineStatus} />

        <section className="dashboard-grid fade-in-up delay-2">
          {/* Map */}
          <div className="glass-card map-panel">
            <div className="panel-header">
              <h3>
                <span className="panel-header-label">
                  District Layers
                  <HelpTip text={DASHBOARD_HELP.districtLayers} label="District layers" placement="below" />
                </span>
              </h3>
              <div className="map-layer-controls">
                <label className="map-surface-control">
                  <span className="toolbar-field-label">
                    Weather Dataset
                    <HelpTip text={DASHBOARD_HELP.weatherDataset} label="Weather dataset" />
                  </span>
                  <select
                    className="toolbar-select"
                    value={dataset}
                    onChange={(e) => setDataset(e.target.value)}
                  >
                    {WEATHER_DATASET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-surface-control">
                  <span className="toolbar-field-label">
                    Health Layer
                    <HelpTip text={DASHBOARD_HELP.healthLayer} label="Health layer" />
                  </span>
                  <select
                    className="toolbar-select"
                    value={healthLayer}
                    onChange={(e) => setHealthLayer(e.target.value)}
                  >
                    {HEALTH_LAYER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <DecisionLayers
              showEarlyWarning={showEarlyWarning}
              showEarlyDetection={showEarlyDetection}
              onToggleEarlyWarning={() => setShowEarlyWarning(!showEarlyWarning)}
              onToggleEarlyDetection={() => setShowEarlyDetection(!showEarlyDetection)}
              alertTimeMode={alertTimeMode}
              onChangeAlertTimeMode={setAlertTimeMode}
              alertWeekDates={alertWeekDates}
              alertWeekIndex={alertWeekIndex}
              onChangeAlertWeekIndex={setAlertWeekIndex}
              alertPlaying={alertPlaying}
              onToggleAlertPlaying={() => setAlertPlaying((v) => !v)}
              alertHistoryWeeks={alertHistoryWeeks}
              onChangeAlertHistoryWeeks={setAlertHistoryWeeks}
              alertWeekCounts={alertWeekCounts}
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

            <EthiopiaMap
              onSelectRegion={updateRegion}
              startDate={startDate}
              endDate={endDate}
              dataset={healthLayer}
              envData={healthLayerData}
              populationYear={populationYear}
              setGeoData={setGeoData}
              filterRegion={mapFilterRegion}
              alerts={mapAlerts}
              alertTooltipByDistrict={alertTooltipByDistrict}
              districtTooltipByDistrict={districtTooltipByDistrict}
              selectedSpecies={selectedSpecies}
              showEarlyWarning={showEarlyWarning}
              showEarlyDetection={showEarlyDetection}
              alertTimeMode={alertTimeMode}
              alertAnimationWeek={alertAnimationWeek}
              selectedDistrictName={region !== "All Regions" ? region : null}
              showRainfallLayer={showRainfallLayer}
              showTemperatureLayer={showTemperatureLayer}
              showNdviLayer={showNdviLayer}
              envTimeMode={envTimeMode}
              envTimeDate={weekDates[weekIndex]}
              gibsPrefetchTime={gibsPrefetchTime}
              onEnvAverageStats={setEnvAverageStats}
            />

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

          {/* Charts / table tabs */}
          <div className="glass-card insights-panel side-panel">
            <div className="panel-header">
              <h3>{region}</h3>
              <span className="panel-header-meta">
                {selectedAlert
                  ? `Population: ${formatPopulation(selectedAlert.population_at_risk)}`
                  : "District Insight"}
                <HelpTip text={DASHBOARD_HELP.districtInsight} label="District insight" />
              </span>
            </div>

            <div className="side-panel-tabs" role="tablist" aria-label="Insights views">
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelView === "charts"}
                className={rightPanelView === "charts" ? "side-panel-tab active" : "side-panel-tab"}
                onClick={() => setRightPanelView("charts")}
              >
                <span className="side-panel-tab-label">
                  Charts
                  <HelpTip text={DASHBOARD_HELP.chartsTab} label="Charts tab" />
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelView === "table"}
                className={rightPanelView === "table" ? "side-panel-tab active" : "side-panel-tab"}
                onClick={() => setRightPanelView("table")}
              >
                <span className="side-panel-tab-label">
                  Forecast Table
                  <HelpTip text={DASHBOARD_HELP.tableTab} label="Forecast table tab" />
                </span>
              </button>
            </div>

            {rightPanelView === "charts" && (
              <div className="side-panel-body charts-view" role="tabpanel">
                {epidemiaError && (
                  <div className="chart-state chart-state-error">{epidemiaError}</div>
                )}

                {epidemiaLoading && (
                  <div className="chart-state">Loading latest district forecast...</div>
                )}

                {epidemiaRefreshing && (
                  <div className="chart-state">Updating district forecast...</div>
                )}

                <div id="epidemia-report-env-chart">
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
                    alertTimeMode={alertTimeMode}
                    alertAnimationWeek={alertAnimationWeek}
                  />
                </div>

                {selectedForecast && (
                  <section className="forecast-panel">
                    <h4>Transmission Forecast ({selectedSpecies.toUpperCase()})</h4>
                    <div id="epidemia-report-forecast-chart">
                      <ForecastChart
                        data={selectedForecast}
                        alert={selectedAlert}
                        syncedHoverDate={syncedHoverDate}
                        onHoverDateChange={setSyncedHoverDate}
                        syncedXRange={syncedXRange}
                        onXRangeChange={setSyncedXRange}
                        alertTimeMode={alertTimeMode}
                        alertAnimationWeek={alertAnimationWeek}
                      />
                    </div>
                  </section>
                )}

                {!epidemiaLoading && !epidemiaRefreshing && !selectedForecast && region !== "All Regions" && (
                  <div className="chart-state">No district forecast available for this selection.</div>
                )}
              </div>
            )}

            {rightPanelView === "table" && (
              <div className="side-panel-body table-view" role="tabpanel">
                <ForecastAlertsTable
                  embedded
                  rows={forecastTableRows}
                  selectedDistrict={region}
                  comparisonDistricts={comparisonDistricts}
                  onToggleComparisonDistrict={toggleComparisonDistrict}
                />

                {!epidemiaLoading && !epidemiaRefreshing && (
                  <div className="table-view-comparison">
                    <div className="table-view-comparison-intro">
                      <h4>District comparison</h4>
                      <p>
                        Click table rows to add or remove districts (up to 3). Solid lines =
                        observed, dotted = forecast.
                      </p>
                    </div>
                    <MultiDistrictComparisonChart
                      series={comparisonSeries}
                      height={220}
                      syncedHoverDate={syncedHoverDate}
                      onHoverDateChange={setSyncedHoverDate}
                      syncedXRange={syncedXRange}
                      onXRangeChange={setSyncedXRange}
                      alertTimeMode={alertTimeMode}
                      alertAnimationWeek={alertAnimationWeek}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
