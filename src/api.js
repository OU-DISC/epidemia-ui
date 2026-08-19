import axios from "axios";
import { buildSampleEpiCsvFromReport } from "./utils/buildSampleEpiCsv";
import { normalizeDistrictKey, districtForecastCacheUrl } from "./utils/districtNameMatch";
import {
  normalizeEnvironmentalSummaryValues,
  normalizeEnvironmentalTimeseries,
} from "./utils/temperatureUnits";

const isBrowser = typeof window !== "undefined";
const isLocalhost =
  isBrowser &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const normalizeBase = (value) => {
  if (!value) return "";
  return String(value).replace(/\/$/, "");
};

const defaultForecastApiBase = isLocalhost ? "http://127.0.0.1:8000" : "";
const defaultEnvApiBase = isLocalhost ? "http://localhost:5000" : "";

export const FORECAST_API_BASE = normalizeBase(
  process.env.REACT_APP_FORECAST_API_BASE || defaultForecastApiBase
);

export const ENV_API_BASE = normalizeBase(
  process.env.REACT_APP_ENV_API_BASE || defaultEnvApiBase
);

const buildApiUrl = (base, path) => `${base}${path}`;

/** Don't block static bootstrap when the forecast API is slow or offline. */
const BOOTSTRAP_API_TIMEOUT_MS = 8000;

const STATIC_BOOTSTRAP_MISSING_ERROR =
  "Forecast bootstrap files were not found. Deploy report_bootstrap.json in public/ or run the EPIDEMIA pipeline, then reload.";

function isDefaultReportOutputDir(outputDir) {
  const normalized = String(outputDir || "report")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  return normalized === "report";
}

function reportGeneratedAtMs(payload) {
  const parsed = Date.parse(payload?.generated_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Prefer the newest report when API and static caches disagree (avoids date-range flash). */
function pickFreshestReport(...candidates) {
  return candidates
    .filter(Boolean)
    .sort((a, b) => reportGeneratedAtMs(b) - reportGeneratedAtMs(a))[0] || null;
}

function nationalBootstrapDistrictCount(payload) {
  const districts = new Set();
  for (const alert of payload?.alerts || []) {
    if (alert?.district) districts.add(String(alert.district));
  }
  for (const forecast of payload?.forecasts || []) {
    if (forecast?.district) districts.add(String(forecast.district));
  }
  return districts.size;
}

function isLikelyNationalBootstrap(payload) {
  return nationalBootstrapDistrictCount(payload) >= 50;
}

function acceptStaticNationalBootstrap(payload) {
  if (!payload) return null;
  return isLikelyNationalBootstrap(payload) ? payload : null;
}

function resolveStaticBootstrapUrls(horizonWeeks = 8) {
  const horizon = Number(horizonWeeks);
  const candidates = [];
  if (horizon === 4) candidates.push("/report_bootstrap_h4.json");
  else if (horizon === 8) candidates.push("/report_bootstrap_h8.json");
  else if (horizon === 12) candidates.push("/report_bootstrap_h12.json");
  candidates.push("/report_bootstrap.json");
  return [...new Set(candidates)];
}

async function fetchStaticMapBootstrapReportDirect() {
  if (!isBrowser) return null;

  const response = await fetch("/report_map_bootstrap.json", { cache: "no-store" });
  if (!response.ok) return null;

  const data = await response.json();
  if (data?.alerts) return acceptStaticNationalBootstrap(data);
  return null;
}

async function fetchStaticBootstrapReportDirect(horizonWeeks = 8) {
  if (!isBrowser) return null;

  for (const url of resolveStaticBootstrapUrls(horizonWeeks)) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;

      const data = await response.json();
      if (!data?.forecasts?.length) continue;

      const accepted = acceptStaticNationalBootstrap(data);
      if (accepted) return accepted;
    } catch {
      // Try the next bundled bootstrap variant.
    }
  }

  return null;
}

async function fetchStaticBootstrapReport(historyWeeks = 16, horizonWeeks = 8) {
  const cached = await fetchStaticBootstrapReportDirect(horizonWeeks).catch(() => null);
  if (cached) return cached;

  throw new Error(STATIC_BOOTSTRAP_MISSING_ERROR);
}

export function formatForecastApiError(err, action = "load forecast data") {
  if (err?.code === "ERR_NETWORK") {
    const base = FORECAST_API_BASE || "the forecasting API";
    return `Cannot reach forecasting API at ${base}. Check that the epidemia-forecast-api service is running, then try again.`;
  }

  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  if (status === 404) {
    return (
      detail ||
      "No forecast cache found on the server. Deploy report bootstrap files or run the EPIDEMIA pipeline on the forecast API."
    );
  }
  if (status === 502 || status === 503) {
    return "Forecast API is running but the pipeline failed. Ensure backend data files (including env_data.csv) are on the server, then try Refresh Forecast again.";
  }

  return detail || err?.message || `Failed to ${action}.`;
}

export async function fetchForecast(region, horizonWeeks = 8) {
  const response = await axios.post(buildApiUrl(FORECAST_API_BASE, "/forecast"), {
    region: region,
    horizon_weeks: horizonWeeks
  });
  return response.data;
}

export async function fetchEpidemiaCacheStatus({
  dataDir = "data",
  outputDir = "report",
  horizonWeeks = 8,
} = {}) {
  if (!FORECAST_API_BASE) {
    return null;
  }

  try {
    const response = await axios.get(buildApiUrl(FORECAST_API_BASE, "/epidemia/cache/status"), {
      params: {
        data_dir: dataDir,
        output_dir: outputDir,
        horizon_weeks: horizonWeeks,
      },
      timeout: 15000,
    });
    return response.data;
  } catch (err) {
    if (err?.code === "ERR_NETWORK") {
      return null;
    }
    throw err;
  }
}

export async function runEpidemiaPipeline({
  dataDir = "data",
  outputDir = "report",
  horizonWeeks = 8,
  createReport = false,
  forceRefresh = false,
  regionFilter = null,
  runInBackground = false,
} = {}) {
  const response = await axios.post(buildApiUrl(FORECAST_API_BASE, "/epidemia/run"), {
    data_dir: dataDir,
    output_dir: outputDir,
    horizon_weeks: horizonWeeks,
    create_report: createReport,
    force_refresh: forceRefresh,
    region_filter: regionFilter,
    run_in_background: runInBackground,
  });
  return response.data;
}

const PIPELINE_POLL_INTERVAL_MS = 3000;
const PIPELINE_MAX_WAIT_MS = 3 * 60 * 60 * 1000;

export async function waitForPipelineIdle(
  {
    dataDir = "data",
    outputDir = "report",
    horizonWeeks = 8,
    onProgress = null,
  } = {},
  { maxWaitMs = PIPELINE_MAX_WAIT_MS, pollIntervalMs = PIPELINE_POLL_INTERVAL_MS } = {}
) {
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    const status = await fetchEpidemiaCacheStatus({ dataDir, outputDir, horizonWeeks });
    onProgress?.(status);

    const pipelineStatus = status?.pipeline?.status;
    if (pipelineStatus !== "running") {
      return status;
    }

    await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("Forecast refresh timed out before the pipeline finished.");
}

export async function fetchMapEpidemiaReport({ outputDir = "report", horizonWeeks = 8 } = {}) {
  const useStaticFallback = isBrowser && isDefaultReportOutputDir(outputDir);

  const apiPromise = FORECAST_API_BASE
    ? axios
        .get(buildApiUrl(FORECAST_API_BASE, "/epidemia/latest/map"), {
          params: { output_dir: outputDir, horizon_weeks: horizonWeeks },
          timeout: BOOTSTRAP_API_TIMEOUT_MS,
        })
        .then((response) => response.data || null)
        .catch(() => null)
    : Promise.resolve(null);

  const staticPromise = useStaticFallback
    ? fetchStaticMapBootstrapReportDirect()
        .catch(() => null)
        .then(async (mapBootstrap) => {
          if (mapBootstrap) return mapBootstrap;
          const fullBootstrap = await fetchStaticBootstrapReportDirect(horizonWeeks).catch(
            () => null
          );
          if (fullBootstrap?.alerts) {
            return { ...fullBootstrap, forecasts: [] };
          }
          return null;
        })
    : Promise.resolve(null);

  const [apiData, staticData] = await Promise.all([apiPromise, staticPromise]);
  const picked = pickFreshestReport(apiData, staticData);
  if (picked) return picked;

  throw new Error("Map forecast report not found");
}

export async function fetchLatestEpidemiaReport({
  outputDir = "report",
  historyWeeks = 16,
  horizonWeeks = 8,
} = {}) {
  const useStaticFallback = isBrowser && isDefaultReportOutputDir(outputDir);

  // Fetch API + static in parallel and keep the newer generated_at.
  // Localhost API often still serves the old root backend/report (max ~2026-03-23)
  // while public/ has the current 1148-district bootstrap (max ~2026-10-19).
  const apiPromise = FORECAST_API_BASE
    ? axios
        .get(buildApiUrl(FORECAST_API_BASE, "/epidemia/latest/bootstrap"), {
          params: {
            output_dir: outputDir,
            history_weeks: historyWeeks,
            horizon_weeks: horizonWeeks,
          },
          timeout: BOOTSTRAP_API_TIMEOUT_MS,
        })
        .then((response) => response.data || null)
        .catch(() => null)
    : Promise.resolve(null);

  const staticPromise = useStaticFallback
    ? fetchStaticBootstrapReportDirect(horizonWeeks).catch(() => null)
    : Promise.resolve(null);

  const [apiData, staticData] = await Promise.all([apiPromise, staticPromise]);
  const picked = pickFreshestReport(apiData, staticData);
  if (picked) return picked;

  return fetchStaticBootstrapReport(historyWeeks, horizonWeeks);
}

function trimDistrictDetailClientSide(detail, startDate, endDate) {
  if (!detail) return detail;
  const filteredHistory = (detail.observed_history || []).filter((point) => {
    const week = point?.week_start;
    if (!week) return false;
    if (startDate && week < startDate) return false;
    if (endDate && week > endDate) return false;
    return true;
  });
  return { ...detail, observed_history: filteredHistory };
}

async function fetchStaticDistrictForecastDetail(district, species, startDate, endDate) {
  if (!isBrowser) return null;

  const url = districtForecastCacheUrl(district, species);
  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  if (!data?.district) return null;
  return trimDistrictDetailClientSide(data, startDate, endDate);
}

export async function fetchDistrictForecastDetail({
  outputDir = "report",
  district,
  species = "pfm",
  startDate,
  endDate,
  horizonWeeks = 8,
} = {}) {
  if (!district) {
    throw new Error("district is required");
  }

  const useStaticDetail = isBrowser && isDefaultReportOutputDir(outputDir);

  if (useStaticDetail) {
    const staticDetail = await fetchStaticDistrictForecastDetail(
      district,
      species,
      startDate,
      endDate
    ).catch(() => null);
    if (staticDetail) return staticDetail;
  }

  if (FORECAST_API_BASE) {
    try {
      const response = await axios.get(buildApiUrl(FORECAST_API_BASE, "/epidemia/latest/district"), {
        params: {
          output_dir: outputDir,
          district,
          species,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          horizon_weeks: horizonWeeks,
        },
        timeout: 120000,
      });
      return response.data;
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 404 && err?.code !== "ERR_NETWORK") {
        throw err;
      }

      if (useStaticDetail) {
        const retryStatic = await fetchStaticDistrictForecastDetail(
          district,
          species,
          startDate,
          endDate
        ).catch(() => null);
        if (retryStatic) return retryStatic;
      }
    }
  }

  throw new Error(
    `No forecast detail found for district '${district}'. Sync district forecast caches or run Refresh Forecast.`
  );
}

export async function fetchEnvironmentalDataAll({
  startDate,
  endDate,
  dataset,
  districts,
}) {
  const response = await axios.post(
    buildApiUrl(ENV_API_BASE, "/api/get_env_data_all"),
    {
      startDate,
      endDate,
      dataset,
      districts,
    }
  );
  return normalizeEnvironmentalSummaryValues(response.data, dataset);
}

export async function fetchEnvironmentalTimeseries({
  districtName,
  districtGeometry,
  startDate,
  endDate,
  dataset,
}) {
  const response = await axios.post(
    buildApiUrl(ENV_API_BASE, "/api/get_timeseries"),
    {
      districtName,
      districtGeometry,
      startDate,
      endDate,
      dataset,
    }
  );
  return normalizeEnvironmentalTimeseries(response.data, dataset);
}

export async function validateEpiUpload(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await axios.post(
    buildApiUrl(FORECAST_API_BASE, "/epidemia/validate/epi"),
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
}

export async function fetchSampleEpiCsv() {
  if (FORECAST_API_BASE) {
    try {
      const response = await axios.get(buildApiUrl(FORECAST_API_BASE, "/epidemia/sample/epi"));
      return response.data;
    } catch (err) {
      const status = err.response?.status;
      if (status !== 404 && err.code !== "ERR_NETWORK") {
        throw err;
      }
    }
  }

  return buildSampleEpiCsvFromReport();
}

export async function setupEpidemiaProject({
  file,
  projectName,
  horizonWeeks = 8,
  defaultSpecies = "pfm",
  defaultRegion = "All Regions",
  geography = "ethiopia",
}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("project_name", projectName);
  formData.append("horizon_weeks", String(horizonWeeks));
  formData.append("default_species", defaultSpecies);
  formData.append("default_region", defaultRegion);
  formData.append("geography", geography);

  const response = await axios.post(
    buildApiUrl(FORECAST_API_BASE, "/epidemia/project/setup"),
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
}

/** Whether grounded LLM deliberation (EDI Layer 3) is configured on the forecast API. */
export async function fetchEdiStatus() {
  if (!FORECAST_API_BASE) {
    return { available: false, enabled: false, detail: "Forecast API base not set" };
  }
  const response = await axios.get(buildApiUrl(FORECAST_API_BASE, "/edi/status"), {
    timeout: 8000,
  });
  return response.data;
}

/**
 * Grounded EDI Explain: LLM rewrite over a structured evidence pack only.
 * Returns source=fallback when LLM is off or grounding fails.
 */
export async function fetchEdiExplain(evidence, interaction = "explain") {
  if (!FORECAST_API_BASE) {
    throw new Error("Forecast API base not set");
  }
  const response = await axios.post(
    buildApiUrl(FORECAST_API_BASE, "/edi/explain"),
    { evidence, interaction },
    { timeout: 60000 }
  );
  return response.data;
}

/**
 * Grounded EDI deliberation: brief | explain | suggest | explore | compare | challenge.
 * Always returns a payload (LLM or deterministic fallback).
 */
export async function fetchEdiDeliberate(evidence, interaction = "explain") {
  if (!FORECAST_API_BASE) {
    throw new Error("Forecast API base not set");
  }
  try {
    const response = await axios.post(
      buildApiUrl(FORECAST_API_BASE, "/edi/deliberate"),
      { evidence, interaction },
      { timeout: 60000 }
    );
    return response.data;
  } catch (err) {
    // Older API process without /edi/deliberate — fall back to /edi/explain for explain only.
    if (interaction === "explain") {
      return fetchEdiExplain(evidence, "explain");
    }
    throw err;
  }
}
