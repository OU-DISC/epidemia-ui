// Dashboard.jsx
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import TopToolbar from "./TopToolbar";
import EthiopiaMap from "../EthiopiaMap";
import EnvironmentalDataControls from "../EnvironmentalDataControls";
import ForecastAlertsTable from "../ForecastAlertsTable";
import MultiDistrictComparisonChart from "../MultiDistrictComparisonChart";
import SituationStrip from "../SituationStrip";
import MobileSummaryView from "../MobileSummaryView";
import HelpTip from "../HelpTip";
import AboutPanel from "../AboutPanel";
import { DASHBOARD_HELP } from "../../utils/dashboardHelpText";
import DecisionLayers from "../DecisionLayers";
import EnvironmentalLayers from "../EnvironmentalLayers";
import {
  fetchDistrictForecastDetail,
  fetchLatestEpidemiaReport,
  fetchMapEpidemiaReport,
  formatForecastApiError,
  runEpidemiaPipeline,
} from "../../api";
import {
  buildAdm3Lookup,
  findDistrictFromLookup,
  getDistrictNameVariants,
  normalizeDistrictKey,
  resolveAdminRegionByPcode,
  resolveAdminRegionForDistrict,
} from "../../utils/districtNameMatch";
import { buildAlertTooltipLookup } from "../../utils/buildAlertTooltipLookup";
import {
  buildAlertWeekDates,
  buildAlertsForWeek,
  buildAnimatedAlertTooltipLookup,
  countAlertTypes,
} from "../../utils/buildAlertHistory";
import { buildDistrictTooltipLookup } from "../../utils/buildDistrictTooltipLookup";
import { buildIncidentRateData } from "../../utils/buildIncidentRateData";
import { buildAlertLevelSurface } from "../../utils/buildAlertLevelSurface";
import { buildEpidemiaReportModel } from "../../utils/buildEpidemiaReportModel";
import { renderAllDistrictControlChartImages } from "../../utils/buildReportControlChartFigure";
import {
  buildComparisonDistrictOptions,
  buildDistrictForecastSeries,
  buildRegionalComparisonDistricts,
  COMPARISON_HIGHLIGHT_MODES,
} from "../../utils/buildDistrictForecastSeries";
import { filterForecastRowsByDateRange } from "../../utils/filterForecastByDateRange";
import { captureReportMap, exportEpidemiaReport } from "../../utils/exportEpidemiaReport";
import {
  canUseReportScope,
  filterAlertsByScope,
  REPORT_SCOPE_COUNTRY,
  REPORT_SCOPE_DISTRICT,
  REPORT_SCOPE_REGION,
} from "../../utils/reportScope";
import {
  defaultWoredaPageMode,
  filterWoredaDistrictRows,
  WOREDA_PAGE_MODES,
} from "../../utils/reportExportConfig";
import { speciesToDisease } from "../../utils/projectStorage";
import {
  CHART_DEFAULT_END_DATE,
  CHART_DEFAULT_START_DATE,
} from "../../utils/chartDateRange";
import {
  normalizeChartAxisDate,
  parseXAxisRangeFromRelayoutEvent,
} from "../../utils/plotlyXAxisSync";
import { useChartPlotRegistry } from "../../utils/useChartPlotRegistry";
import { useMediaQuery } from "../../utils/useMediaQuery";
import {
  findDistrictForecastRow,
  forecastHistoryCoversRange,
  mergeDistrictForecast,
  mergeForecastBootstrap,
  resolveReportDistrictForSelection,
} from "../../utils/epidemiaReportMerge";
import "./dashboard-theme.css";

const EnvironmentalTimeSeriesChart = lazy(() => import("../EnvironmentalTimeSeriesChart"));
const ForecastChart = lazy(() => import("../ForecastChart"));

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
  { label: "Incidence Rate", value: "incident_rate" },
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

function runAfterFirstPaint(task) {
  if (typeof window === "undefined") {
    task();
    return () => {};
  }
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(() => task(), { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 0);
  return () => window.clearTimeout(id);
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
  const [exportProgressMessage, setExportProgressMessage] = useState("");
  const [reportExportConfig, setReportExportConfig] = useState(null);
  const [reportScope, setReportScope] = useState(REPORT_SCOPE_COUNTRY);
  const [woredaPageMode, setWoredaPageMode] = useState(WOREDA_PAGE_MODES.alerts.value);
  const [regions, setRegions] = useState([]); // List of available regions
  const [districts, setDistricts] = useState(["All Regions"]);
  const [epidemiaData, setEpidemiaData] = useState(null);
  const [epidemiaLoading, setEpidemiaLoading] = useState(false);
  const [epidemiaRefreshing, setEpidemiaRefreshing] = useState(false);
  const [epidemiaError, setEpidemiaError] = useState("");
  const [districtDetailLoading, setDistrictDetailLoading] = useState(false);
  const forecastRequestIdRef = useRef(0);
  const mapRequestIdRef = useRef(0);
  const districtDetailRequestRef = useRef(0);
  const skipInitialForecastLoadRef = useRef(false);
  const userPrefersAllDistrictsRef = useRef(false);
  const lastAutoExtendedDistrictRef = useRef(null);
  const projectDataDir = projectConfig?.dataDir || "data";
  const projectOutputDir = projectConfig?.outputDir || "report";

  //  Environmental data states
  const [startDate, setStartDate] = useState(CHART_DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(CHART_DEFAULT_END_DATE);
  const [dataset, setDataset] = useState("totprec");
  const [healthLayer, setHealthLayer] = useState("incident_rate");
  const [geoData, setGeoData] = useState(null);
  const [woredaPcodeCrosswalk, setWoredaPcodeCrosswalk] = useState(null);
  const [, setEnvData] = useState({});
  const [populationSurfacesByYear, setPopulationSurfacesByYear] = useState({});
  const [legacyPopulationSurface, setLegacyPopulationSurface] = useState({});
  const [syncedHoverDate, setSyncedHoverDate] = useState(null);
  const chartScopeKey = `${region}|${dataset}|${healthLayer}|${disease}`;
  const chartDatesRef = useRef({ startDate, endDate });
  chartDatesRef.current = { startDate, endDate };

  const handleChartDateRelayout = useCallback((ev) => {
    const parsed = parseXAxisRangeFromRelayoutEvent(ev);
    if (parsed == null) return;
    if (parsed === "autorange") {
      setStartDate(CHART_DEFAULT_START_DATE);
      setEndDate(CHART_DEFAULT_END_DATE);
      return;
    }
    const nextStart = normalizeChartAxisDate(parsed[0]);
    const nextEnd = normalizeChartAxisDate(parsed[1]);
    const { startDate: curStart, endDate: curEnd } = chartDatesRef.current;
    if (nextStart === curStart && nextEnd === curEnd) return;
    setStartDate(nextStart);
    setEndDate(nextEnd);
  }, []);

  const { makePlotReadyHandler, makePlotPurgeHandler, registerHighlightResolver } =
    useChartPlotRegistry(startDate, endDate, handleChartDateRelayout, syncedHoverDate);

  useEffect(() => {
    setStartDate(CHART_DEFAULT_START_DATE);
    setEndDate(CHART_DEFAULT_END_DATE);
    lastAutoExtendedDistrictRef.current = null;
  }, [chartScopeKey]);
  const [rightPanelView, setRightPanelView] = useState("charts");
  const [comparisonDistricts, setComparisonDistricts] = useState(["", "", ""]);
  const [comparisonHighlightMode, setComparisonHighlightMode] = useState("alert-priority");
  const isCompactLayout = useMediaQuery("(max-width: 1100px)");
  const [mobileMainView, setMobileMainView] = useState("summary");

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
  const adm3Lookup = useMemo(
    () => buildAdm3Lookup(geoData, woredaPcodeCrosswalk),
    [geoData, woredaPcodeCrosswalk]
  );

  const alertWeekDates = useMemo(
    () =>
      buildAlertWeekDates(
        epidemiaData?.forecasts,
        selectedSpecies,
        alertHistoryWeeks,
        startDate,
        endDate
      ),
    [epidemiaData?.forecasts, selectedSpecies, alertHistoryWeeks, startDate, endDate]
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

  const loadMapEpidemia = useCallback(async () => {
    const requestId = mapRequestIdRef.current + 1;
    mapRequestIdRef.current = requestId;
    try {
      const data = await fetchMapEpidemiaReport({ outputDir: projectOutputDir });
      if (mapRequestIdRef.current === requestId) {
        setEpidemiaData((current) => mergeForecastBootstrap(current, data));
        setEpidemiaError("");
      }
    } catch (err) {
      console.error("Failed to load map EPIDEMIA report:", err);
      if (mapRequestIdRef.current === requestId) {
        setEpidemiaError(formatForecastApiError(err, "load map forecast report"));
      }
    }
  }, [projectOutputDir]);

  const loadForecastBootstrap = useCallback(async () => {
    const requestId = forecastRequestIdRef.current + 1;
    forecastRequestIdRef.current = requestId;
    setEpidemiaLoading(true);
    setEpidemiaError("");
    try {
      const data = await fetchLatestEpidemiaReport({ outputDir: projectOutputDir });
      if (forecastRequestIdRef.current === requestId) {
        setEpidemiaData((current) => mergeForecastBootstrap(current, data));
      }
    } catch (err) {
      console.error("Failed to load latest EPIDEMIA report:", err);
      if (forecastRequestIdRef.current === requestId) {
        setEpidemiaError(formatForecastApiError(err, "load latest forecast report"));
      }
    } finally {
      if (forecastRequestIdRef.current === requestId) {
        setEpidemiaLoading(false);
      }
    }
  }, [projectOutputDir]);

  const refreshEpidemia = useCallback(async () => {
    let regionFilter = null;
    if (
      selectedAdminRegion &&
      selectedAdminRegion !== "All Regions" &&
      selectedAdminRegion !== "No Selection"
    ) {
      regionFilter = selectedAdminRegion;
    } else if (region && region !== "All Regions") {
      regionFilter = resolveAdminRegionForDistrict(adm3Lookup, region, geoData);
      if (!regionFilter) {
        const feature =
          findDistrictFromLookup(adm3Lookup, region) ||
          geoData?.features?.find((f) => f?.properties?.adm3_name === region);
        const pcode = feature?.properties?.adm3_pcode;
        if (pcode) {
          regionFilter = resolveAdminRegionByPcode(geoData, pcode);
        }
      }
    }

    // Allow refreshing for all regions. When no region is selected, run the full pipeline.
    // (This can take longer than a single-region refresh.)

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
        forceRefresh: true,
        regionFilter,
      });
      if (forecastRequestIdRef.current === requestId) {
        setEpidemiaData(data);
      }
    } catch (err) {
      console.error("Failed to run EPIDEMIA pipeline:", err);
      if (forecastRequestIdRef.current === requestId) {
        setEpidemiaError(formatForecastApiError(err, "refresh forecast"));
      }
    } finally {
      setEpidemiaRefreshing(false);
    }
  }, [
    forecastWeeks,
    projectDataDir,
    projectOutputDir,
    selectedAdminRegion,
    region,
    adm3Lookup,
    geoData,
  ]);

  useEffect(() => {
    if (!bootstrapEpidemiaData) return;
    setEpidemiaData(bootstrapEpidemiaData);
    setEpidemiaError("");
    skipInitialForecastLoadRef.current = true;
    onBootstrapConsumed?.();
  }, [bootstrapEpidemiaData, onBootstrapConsumed]);

  useEffect(() => {
    if (skipInitialForecastLoadRef.current) {
      skipInitialForecastLoadRef.current = false;
      return undefined;
    }

    let cancelled = false;
    loadMapEpidemia().finally(() => {
      if (cancelled) return;
      return runAfterFirstPaint(() => {
        if (!cancelled) loadForecastBootstrap();
      });
    });

    return () => {
      cancelled = true;
    };
  }, [loadForecastBootstrap, loadMapEpidemia]);

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

  useEffect(() => {
    let cancelled = false;
    const loadWoredaPcodeCrosswalk = async () => {
      try {
        const crosswalk = await fetchJsonIfAvailable("/ethiopia_woreda_pcode.json");
        if (!cancelled) {
          setWoredaPcodeCrosswalk(
            crosswalk?.byName && crosswalk?.byKey ? crosswalk : null
          );
        }
      } catch (err) {
        console.error("Failed to load woreda pcode crosswalk", err);
        if (!cancelled) setWoredaPcodeCrosswalk(null);
      }
    };

    loadWoredaPcodeCrosswalk();

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

    let feature = null;
    if (geoData) {
      feature =
        geoData.features.find((f) => f.properties.adm3_name === selectedRegion) ||
        findDistrictFromLookup(adm3Lookup, selectedRegion);
      if (feature) {
        setSelectedGeometry(feature.geometry.coordinates);
      }
    }

    const adm1 =
      feature?.properties?.adm1_name ||
      resolveAdminRegionForDistrict(adm3Lookup, selectedRegion, geoData);
    if (adm1 && adm1 !== selectedAdminRegion) {
      setSelectedAdminRegion(adm1);
      setMapFilterRegion(adm1);
    }
  }, [geoData, adm3Lookup, selectedAdminRegion]);

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
    const districtFc = findDistrictForecastRow(
      epidemiaData,
      adm3Lookup,
      region,
      selectedSpecies
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

    return filterForecastRowsByDateRange(
      [...observedRows, ...forecastRows],
      startDate,
      endDate
    );
  }, [adm3Lookup, epidemiaData, region, selectedSpecies, selectedAlert, startDate, endDate]);

  // When a district is first selected, extend the end date to include its forecast horizon.
  // Do not re-run when the user manually changes the date picker afterward.
  useEffect(() => {
    if (region === "All Regions") {
      lastAutoExtendedDistrictRef.current = null;
      return;
    }
    if (!selectedForecast?.length) return;

    const districtKey = `${region}|${selectedSpecies}`;
    if (lastAutoExtendedDistrictRef.current === districtKey) return;

    const maxForecastDate = selectedForecast
      .filter((row) => row?.median !== null && row?.median !== undefined && row?.date)
      .map((row) => String(row.date))
      .sort()
      .slice(-1)[0];
    if (!maxForecastDate) return;

    const { endDate: currentEndDate } = chartDatesRef.current;
    const currentEnd = Date.parse(`${currentEndDate}T00:00:00Z`);
    const nextEnd = Date.parse(`${maxForecastDate}T00:00:00Z`);
    if (Number.isNaN(currentEnd) || Number.isNaN(nextEnd)) return;
    if (nextEnd > currentEnd) {
      setEndDate(maxForecastDate);
    }
    lastAutoExtendedDistrictRef.current = districtKey;
  }, [region, selectedSpecies, selectedForecast]);

  const forecastSummary = useMemo(() => {
    const alerts = epidemiaData?.alerts || [];
    const speciesAlerts = alerts.filter((a) => a.species === selectedSpecies);
    const warningCount = speciesAlerts.filter((a) => a.early_warning).length;
    const detectionCount = speciesAlerts.filter((a) => a.early_detection).length;
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

  const incidentRateData = useMemo(
    () =>
      buildIncidentRateData({
        epidemiaData,
        adm3Lookup,
        populationData,
        selectedSpecies,
        startDate,
        endDate,
        surfaceValueForDistrict,
      }),
    [adm3Lookup, epidemiaData, populationData, selectedSpecies, startDate, endDate]
  );

  const healthLayerData = healthLayer === "incident_rate" ? incidentRateData : populationData;
  const reportExportActive = Boolean(reportExportConfig);
  const mapDataset = reportExportConfig?.dataset ?? healthLayer;
  const mapEnvData = reportExportConfig?.envData ?? healthLayerData;
  const mapSpecies = reportExportConfig?.species ?? selectedSpecies;
  const mapFilterForView = reportExportActive
    ? reportExportConfig?.mapFilter ?? "All Regions"
    : mapFilterRegion;
  const mapSelectedDistrict = reportExportActive
    ? reportExportConfig?.selectedDistrict ?? null
    : region !== "All Regions"
      ? region
      : null;

  const reportScopeAvailability = useMemo(
    () => ({
      canRegion: canUseReportScope(REPORT_SCOPE_REGION, {
        region,
        selectedAdminRegion,
      }),
      canDistrict: canUseReportScope(REPORT_SCOPE_DISTRICT, {
        region,
        selectedAdminRegion,
      }),
    }),
    [region, selectedAdminRegion]
  );

  useEffect(() => {
    if (reportScope === REPORT_SCOPE_DISTRICT && !reportScopeAvailability.canDistrict) {
      setReportScope(REPORT_SCOPE_COUNTRY);
    } else if (reportScope === REPORT_SCOPE_REGION && !reportScopeAvailability.canRegion) {
      setReportScope(REPORT_SCOPE_COUNTRY);
    }
  }, [reportScope, reportScopeAvailability]);

  useEffect(() => {
    setWoredaPageMode(defaultWoredaPageMode(reportScope));
  }, [reportScope]);

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
      const activeThreshold = warningThreshold;
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
        edLevel: alert.ed_level || "Low",
        ewLevel: alert.ew_level || "Low",
        edAlertCount: alert.ed_alert_count ?? 0,
        ewAlertCount: alert.ew_alert_count ?? 0,
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

  const defaultStartupDistrict = useMemo(() => {
    if (topPriorityDistrict && districts.includes(topPriorityDistrict)) {
      return topPriorityDistrict;
    }
    const firstAlertDistrict = forecastTableRows[0]?.mapDistrict;
    if (firstAlertDistrict && districts.includes(firstAlertDistrict)) {
      return firstAlertDistrict;
    }
    return districts.find((name) => name !== "All Regions") || null;
  }, [districts, forecastTableRows, topPriorityDistrict]);

  // Pick a default district on startup so charts show data (highest-priority alert).
  React.useEffect(() => {
    if (userPrefersAllDistrictsRef.current) return;
    if (region !== "All Regions") return;
    if (!defaultStartupDistrict) return;
    updateRegion(defaultStartupDistrict);
  }, [defaultStartupDistrict, region, updateRegion]);

  // If the current district name is missing from the dropdown, recover or reset.
  React.useEffect(() => {
    if (districts.includes(region)) return;

    userPrefersAllDistrictsRef.current = false;
    if (topPriorityDistrict && districts.includes(topPriorityDistrict)) {
      updateRegion(topPriorityDistrict);
      return;
    }

    setRegion("All Regions");
    setSelectedGeometry(null);
    // Stop auto-select from fighting this fallback when the priority district
    // is not present in the dropdown (name mismatch before geo loads, etc.).
    userPrefersAllDistrictsRef.current = true;
  }, [districts, region, topPriorityDistrict, updateRegion]);

  const defaultComparisonDistricts = useMemo(
    () =>
      buildRegionalComparisonDistricts(
        forecastTableRows,
        selectedAdminRegion,
        comparisonHighlightMode,
        {
          epidemiaData,
          adm3Lookup,
          selectedSpecies,
          startDate,
          endDate,
          count: 3,
        }
      ),
    [
      adm3Lookup,
      comparisonHighlightMode,
      endDate,
      epidemiaData,
      forecastTableRows,
      selectedAdminRegion,
      selectedSpecies,
      startDate,
    ]
  );

  const comparisonDefaultsKey = useMemo(
    () =>
      [
        comparisonHighlightMode,
        selectedAdminRegion,
        selectedSpecies,
        startDate,
        endDate,
        chartScopeKey,
        epidemiaData?.generated_at || "",
      ].join("|"),
    [
      chartScopeKey,
      comparisonHighlightMode,
      endDate,
      epidemiaData?.generated_at,
      selectedAdminRegion,
      selectedSpecies,
      startDate,
    ]
  );

  React.useEffect(() => {
    setComparisonDistricts(defaultComparisonDistricts);
    // Reset only when highlight scope changes, not when district detail merges into epidemiaData.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by comparisonDefaultsKey
  }, [comparisonDefaultsKey]);

  const comparisonBackgroundDistricts = useMemo(() => {
    const selected = new Set(comparisonDistricts.filter(Boolean));
    const hasRegionalFilter =
      selectedAdminRegion &&
      selectedAdminRegion !== "All Regions" &&
      selectedAdminRegion !== "No Selection";

    const options = buildComparisonDistrictOptions(forecastTableRows, selectedAdminRegion);
    const candidates = (hasRegionalFilter ? options : options.slice(0, 10))
      .map((option) => option.value)
      .filter(Boolean);

    return candidates.filter((districtName) => !selected.has(districtName));
  }, [comparisonDistricts, forecastTableRows, selectedAdminRegion]);

  const districtsNeedingDetail = useMemo(() => {
    const names = new Set();

    const addIfNeeded = (selectedDistrict) => {
      const reportDistrict = resolveReportDistrictForSelection(
        epidemiaData,
        adm3Lookup,
        selectedDistrict,
        selectedSpecies
      );
      if (!reportDistrict) return;

      const row = findDistrictForecastRow(
        epidemiaData,
        adm3Lookup,
        selectedDistrict,
        selectedSpecies
      );
      if (!row) return;
      if (forecastHistoryCoversRange(row, startDate, endDate)) return;

      names.add(reportDistrict);
    };

    if (region && region !== "All Regions") {
      addIfNeeded(region);
    }
    comparisonDistricts.filter(Boolean).forEach(addIfNeeded);
    return [...names];
  }, [
    adm3Lookup,
    comparisonDistricts,
    endDate,
    epidemiaData,
    region,
    selectedSpecies,
    startDate,
  ]);

  const selectedDistrictNeedsDetail = useMemo(() => {
    if (region === "All Regions") return false;
    const reportDistrict = resolveReportDistrictForSelection(
      epidemiaData,
      adm3Lookup,
      region,
      selectedSpecies
    );
    return Boolean(reportDistrict && districtsNeedingDetail.includes(reportDistrict));
  }, [
    adm3Lookup,
    districtsNeedingDetail,
    epidemiaData,
    region,
    selectedSpecies,
  ]);

  const districtsNeedingDetailKey = districtsNeedingDetail.join("|");
  const epidemiaDataReady = Boolean(epidemiaData?.forecasts?.length);

  useEffect(() => {
    if (districtsNeedingDetail.length === 0) {
      setDistrictDetailLoading(false);
      return undefined;
    }
    if (!epidemiaDataReady) {
      return undefined;
    }

    const requestId = districtDetailRequestRef.current + 1;
    districtDetailRequestRef.current = requestId;
    setDistrictDetailLoading(true);

    Promise.all(
      districtsNeedingDetail.map((district) =>
        fetchDistrictForecastDetail({
          outputDir: projectOutputDir,
          district,
          species: selectedSpecies,
          startDate,
          endDate,
        }).catch((err) => {
          console.warn(`Failed to load forecast detail for ${district}:`, err);
          return null;
        })
      )
    )
      .then((details) => {
        if (districtDetailRequestRef.current !== requestId) return;
        setEpidemiaData((current) => {
          if (!current) return current;
          return details.reduce(
            (report, detail) => (detail ? mergeDistrictForecast(report, detail) : report),
            current
          );
        });
      })
      .finally(() => {
        if (districtDetailRequestRef.current === requestId) {
          setDistrictDetailLoading(false);
        }
      });

    return undefined;
  }, [
    districtsNeedingDetailKey,
    endDate,
    epidemiaDataReady,
    projectOutputDir,
    selectedSpecies,
    startDate,
  ]);

  const comparisonSeries = useMemo(() => {
    const uniqueDistricts = [...new Set(comparisonDistricts.filter(Boolean))].slice(0, 3);
    return uniqueDistricts
      .map((districtName) =>
        buildDistrictForecastSeries(
          epidemiaData,
          adm3Lookup,
          districtName,
          selectedSpecies,
          startDate,
          endDate
        )
      )
      .filter(Boolean);
  }, [adm3Lookup, comparisonDistricts, epidemiaData, selectedSpecies, startDate, endDate]);

  const comparisonBackgroundSeries = useMemo(() => {
    return comparisonBackgroundDistricts
      .map((districtName) =>
        buildDistrictForecastSeries(
          epidemiaData,
          adm3Lookup,
          districtName,
          selectedSpecies,
          startDate,
          endDate
        )
      )
      .filter(Boolean);
  }, [
    adm3Lookup,
    comparisonBackgroundDistricts,
    epidemiaData,
    selectedSpecies,
    startDate,
    endDate,
  ]);

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

  const handleSummaryDistrictSelect = useCallback(
    (districtName) => {
      if (!districtName) return;
      updateRegion(districtName);
      setMobileMainView("details");
      setRightPanelView("charts");
    },
    [updateRegion]
  );

  const handleMapDistrictSelect = useCallback(
    (districtName) => {
      updateRegion(districtName);
      if (isCompactLayout) {
        setMobileMainView("details");
        setRightPanelView("charts");
      }
    },
    [isCompactLayout, updateRegion]
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
    return buildAnimatedAlertTooltipLookup(
      mapAlerts,
      speciesLabel,
      alertAnimationWeek,
      adm3Lookup
    );
  }, [
    alertTimeMode,
    alertAnimationWeek,
    currentAlertTooltipByDistrict,
    mapAlerts,
    speciesLabel,
    adm3Lookup,
  ]);

  const districtTooltipByDistrict = useMemo(
    () =>
      buildDistrictTooltipLookup({
        forecastTableRows,
        populationData,
        populationYear,
        surfaceValueForDistrict,
        epidemiaData,
        selectedSpecies,
        startDate,
        endDate,
      }),
    [
      forecastTableRows,
      populationData,
      populationYear,
      epidemiaData,
      selectedSpecies,
      startDate,
      endDate,
    ]
  );


  // R-style EPIDEMIA report export (epidemia_report_demo.Rnw parity)
  const handleExportPDF = async () => {
    if (!epidemiaData?.alerts?.length || !adm3Lookup?.size) {
      window.alert("Forecast data is not loaded yet.");
      return;
    }

    setExporting(true);
    setExportProgressMessage("Preparing report…");

    const reportModel = buildEpidemiaReportModel({
      epidemiaData,
      adm3Lookup,
      horizonWeeks: forecastWeeks,
      country,
      scope: reportScope,
      selectedDistrict: region,
      selectedRegion: selectedAdminRegion,
    });

    const scopedAlerts = filterAlertsByScope(
      epidemiaData.alerts,
      adm3Lookup,
      reportModel.scopeContext
    );

    if (reportModel.districtRows.length === 0) {
      window.alert("No districts match the selected report scope.");
      setExporting(false);
      setExportProgressMessage("");
      return;
    }

    const woredaDistrictRows = filterWoredaDistrictRows(
      reportModel.districtRows,
      scopedAlerts,
      adm3Lookup,
      woredaPageMode,
      findDistrictFromLookup
    );

    reportModel.woredaPageMode = woredaPageMode;
    reportModel.woredaDistrictRows = woredaDistrictRows;
    reportModel.woredaDistrictCount = woredaDistrictRows.length;

    const mapCaptures = {};
    const captureModes = [
      { key: "pfm-ed", species: "pfm", dataset: "ed_alert_level", levelField: "ed_level" },
      { key: "pfm-ew", species: "pfm", dataset: "ew_alert_level", levelField: "ew_level" },
      { key: "pv-ed", species: "pv", dataset: "ed_alert_level", levelField: "ed_level" },
      { key: "pv-ew", species: "pv", dataset: "ew_alert_level", levelField: "ew_level" },
      { key: "pfm-incidence", species: "pfm", dataset: "incident_rate", incidence: true },
      { key: "pv-incidence", species: "pv", dataset: "incident_rate", incidence: true },
    ];

    try {
      for (const mode of captureModes) {
        setExportProgressMessage(`Capturing map (${mode.key})…`);
        const envData = mode.incidence
          ? buildIncidentRateData({
              epidemiaData,
              adm3Lookup,
              populationData,
              selectedSpecies: mode.species,
              startDate,
              endDate,
              surfaceValueForDistrict,
            })
          : buildAlertLevelSurface(
              scopedAlerts,
              adm3Lookup,
              mode.species,
              mode.levelField
            );

        setReportExportConfig({
          dataset: mode.dataset,
          envData,
          species: mode.species,
          mapFilter: reportModel.scopeContext.mapFilter,
          selectedDistrict: reportModel.scopeContext.selectedDistrict,
        });

        const canvas = await captureReportMap(document.getElementById("epidemia-report-map"));
        if (canvas) {
          mapCaptures[mode.key] = canvas;
        }
      }

      setReportExportConfig(null);

      const districtChartImages =
        woredaPageMode === WOREDA_PAGE_MODES.none.value
          ? new Map()
          : await renderAllDistrictControlChartImages({
              epidemiaData,
              adm3Lookup,
              districtRows: woredaDistrictRows,
              startDate,
              endDate,
              onProgress: ({ current, total, district }) => {
                setExportProgressMessage(
                  `Rendering control charts (${current}/${total}): ${district}`
                );
              },
            });

      setExportProgressMessage("Writing PDF…");
      await exportEpidemiaReport({
        reportModel,
        mapCaptures,
        districtChartImages,
        generatedAt: epidemiaData.generated_at,
        country,
      });
    } catch (err) {
      console.error("Failed to export EPIDEMIA report:", err);
      window.alert(err?.message || "Failed to export EPIDEMIA report.");
    } finally {
      setReportExportConfig(null);
      setExportProgressMessage("");
      setExporting(false);
    }
  };

  return (
    <div
      id="dashboard"
      className={`dashboard-shell${isCompactLayout ? " dashboard-shell--compact" : ""}`}
    >
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
        exportLabel={exportProgressMessage || (exporting ? "Exporting…" : "Export EPIDEMIA Report")}
        reportScope={reportScope}
        onChangeReportScope={setReportScope}
        reportScopeAvailability={reportScopeAvailability}
        woredaPageMode={woredaPageMode}
        onChangeWoredaPageMode={setWoredaPageMode}
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

        {(!isCompactLayout || mobileMainView !== "summary") && (
          <SituationStrip summary={forecastSummary} pipelineStatus={pipelineStatus} />
        )}

        {isCompactLayout ? (
          <nav className="mobile-view-switcher fade-in-up delay-1" role="tablist" aria-label="Dashboard views">
            <button
              type="button"
              role="tab"
              aria-selected={mobileMainView === "summary"}
              className={mobileMainView === "summary" ? "mobile-view-tab active" : "mobile-view-tab"}
              onClick={() => setMobileMainView("summary")}
            >
              Summary
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileMainView === "map"}
              className={mobileMainView === "map" ? "mobile-view-tab active" : "mobile-view-tab"}
              onClick={() => setMobileMainView("map")}
            >
              Map
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileMainView === "details" && rightPanelView !== "about"}
              className={
                mobileMainView === "details" && rightPanelView !== "about"
                  ? "mobile-view-tab active"
                  : "mobile-view-tab"
              }
              onClick={() => {
                setMobileMainView("details");
                setRightPanelView("charts");
              }}
            >
              Details
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileMainView === "details" && rightPanelView === "about"}
              className={
                mobileMainView === "details" && rightPanelView === "about"
                  ? "mobile-view-tab active"
                  : "mobile-view-tab"
              }
              onClick={() => {
                setMobileMainView("details");
                setRightPanelView("about");
              }}
            >
              About
            </button>
          </nav>
        ) : null}

        {isCompactLayout && mobileMainView === "summary" ? (
          <MobileSummaryView
            rows={forecastTableRows}
            selectedAdminRegion={selectedAdminRegion}
            selectedDistrict={region}
            speciesLabel={speciesLabel}
            startDate={startDate}
            endDate={endDate}
            generatedAt={epidemiaData?.generated_at}
            onSelectDistrict={handleSummaryDistrictSelect}
          />
        ) : (
        <section className="dashboard-grid fade-in-up delay-2">
          {/* Map */}
          {(!isCompactLayout || mobileMainView === "map") && (
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
              onToggleEarlyWarning={() => setShowEarlyWarning(!showEarlyWarning)}
              showEarlyDetection={showEarlyDetection}
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
              onSelectRegion={handleMapDistrictSelect}
              startDate={startDate}
              endDate={endDate}
              dataset={mapDataset}
              envData={mapEnvData}
              populationYear={populationYear}
              setGeoData={setGeoData}
              woredaPcodeCrosswalk={woredaPcodeCrosswalk}
              filterRegion={mapFilterForView}
              alerts={mapAlerts}
              alertTooltipByDistrict={alertTooltipByDistrict}
              districtTooltipByDistrict={districtTooltipByDistrict}
              selectedSpecies={mapSpecies}
              showEarlyWarning={reportExportActive ? false : showEarlyWarning}
              showEarlyDetection={reportExportActive ? false : showEarlyDetection}
              alertTimeMode={alertTimeMode}
              alertAnimationWeek={alertAnimationWeek}
              selectedDistrictName={mapSelectedDistrict}
              showRainfallLayer={reportExportActive ? false : showRainfallLayer}
              showTemperatureLayer={reportExportActive ? false : showTemperatureLayer}
              showNdviLayer={reportExportActive ? false : showNdviLayer}
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
          )}

          {/* Charts / table tabs */}
          {(!isCompactLayout || mobileMainView === "details") && (
          <div className="glass-card insights-panel side-panel">
            <div className="panel-header">
              <h3>{rightPanelView === "about" ? "About EPIDEMIA" : region}</h3>
              <span className="panel-header-meta">
                {rightPanelView === "about" ? (
                  "Project overview"
                ) : selectedAlert ? (
                  `Population: ${formatPopulation(selectedAlert.population_at_risk)}`
                ) : (
                  <>
                    District Insight
                    <HelpTip text={DASHBOARD_HELP.districtInsight} label="District insight" />
                  </>
                )}
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
              <button
                type="button"
                role="tab"
                aria-selected={rightPanelView === "about"}
                className={rightPanelView === "about" ? "side-panel-tab active" : "side-panel-tab"}
                onClick={() => setRightPanelView("about")}
              >
                <span className="side-panel-tab-label">
                  About
                  <HelpTip text={DASHBOARD_HELP.aboutTab} label="About tab" />
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

                <Suspense fallback={<div className="chart-state">Loading charts...</div>}>
                  <div id="epidemia-report-env-chart">
                    <EnvironmentalTimeSeriesChart
                      selectedDistrict={region !== "All Regions" ? region : null}
                      districtGeometry={selectedGeometry}
                      startDate={startDate}
                      endDate={endDate}
                      dataset={dataset}
                      onPlotReady={makePlotReadyHandler("env")}
                      onPlotPurge={makePlotPurgeHandler("env")}
                      registerHighlightResolver={registerHighlightResolver}
                      chartScopeKey={chartScopeKey}
                      syncedHoverDate={syncedHoverDate}
                      onHoverDateChange={setSyncedHoverDate}
                      alertTimeMode={alertTimeMode}
                      alertAnimationWeek={alertAnimationWeek}
                    />
                  </div>

                  {selectedForecast && (
                    <section className="forecast-panel">
                      <h4>
                        Transmission Forecast ({selectedSpecies.toUpperCase()})
                        {districtDetailLoading && (
                          <span className="forecast-panel-loading-note">
                            Loading full history…
                          </span>
                        )}
                        {!districtDetailLoading && selectedDistrictNeedsDetail && (
                          <span className="forecast-panel-loading-note forecast-panel-loading-note--muted">
                            Showing recent history only. Start the forecast API on port 8000 or run
                            npm run sync:district-caches for the full chart range.
                          </span>
                        )}
                      </h4>
                      <div id="epidemia-report-forecast-chart">
                        <ForecastChart
                          data={selectedForecast}
                          alert={selectedAlert}
                          startDate={startDate}
                          endDate={endDate}
                          onPlotReady={makePlotReadyHandler("forecast")}
                          onPlotPurge={makePlotPurgeHandler("forecast")}
                          registerHighlightResolver={registerHighlightResolver}
                          chartScopeKey={chartScopeKey}
                          districtKey={region !== "All Regions" ? region : ""}
                          syncedHoverDate={syncedHoverDate}
                          onHoverDateChange={setSyncedHoverDate}
                          alertTimeMode={alertTimeMode}
                          alertAnimationWeek={alertAnimationWeek}
                        />
                      </div>
                    </section>
                  )}
                </Suspense>

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
                      <div className="table-view-comparison-intro-header">
                        <h4>District comparison</h4>
                        <label className="comparison-highlight-mode">
                          <span>Highlight by</span>
                          <select
                            className="toolbar-select"
                            value={comparisonHighlightMode}
                            onChange={(event) => setComparisonHighlightMode(event.target.value)}
                          >
                            {COMPARISON_HIGHLIGHT_MODES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p>
                        When a region is selected, other districts in that region appear as grey
                        background lines; nationally, the top 10 priority districts are shown.
                        Use the selector above to compare highlight strategies. Click table rows or
                        grey chart lines to pick up to 3 districts manually. Solid lines = observed,
                        dotted = forecast.
                      </p>
                    </div>
                    <MultiDistrictComparisonChart
                      series={comparisonSeries}
                      backgroundSeries={comparisonBackgroundSeries}
                      startDate={startDate}
                      endDate={endDate}
                      chartScopeKey={chartScopeKey}
                      height={300}
                      syncedHoverDate={syncedHoverDate}
                      onHoverDateChange={setSyncedHoverDate}
                      onPlotReady={makePlotReadyHandler("compare")}
                      onPlotPurge={makePlotPurgeHandler("compare")}
                      registerHighlightResolver={registerHighlightResolver}
                      alertTimeMode={alertTimeMode}
                      alertAnimationWeek={alertAnimationWeek}
                      onSelectDistrict={toggleComparisonDistrict}
                    />
                  </div>
                )}
              </div>
            )}

            {rightPanelView === "about" && (
              <div className="side-panel-body about-view" role="tabpanel">
                <AboutPanel />
              </div>
            )}
          </div>
          )}
        </section>
        )}
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
