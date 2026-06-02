import axios from "axios";
import { buildSampleEpiCsvFromReport } from "./utils/buildSampleEpiCsv";
import { normalizeDistrictKey, districtForecastCacheUrl } from "./utils/districtNameMatch";
import { forecastDistrictKey } from "./utils/epidemiaReportMerge";
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

async function fetchStaticLatestEpidemiaReport() {
  if (!isBrowser) {
    throw new Error("Static latest report is only available in the browser");
  }

  const response = await fetch("/report_data.json");
  if (!response.ok) {
    throw new Error(`Static latest forecast report not found (${response.status})`);
  }
  return response.json();
}

function trimReportClientSide(report, historyWeeks = 16) {
  if (!report?.forecasts) return report;
  return {
    ...report,
    forecasts: report.forecasts.map((forecast) => {
      const history = [...(forecast.observed_history || [])].sort((a, b) =>
        String(a.week_start).localeCompare(String(b.week_start))
      );
      return {
        ...forecast,
        observed_history: history.slice(-historyWeeks),
      };
    }),
  };
}

async function fetchStaticMapBootstrapReportDirect() {
  if (!isBrowser) return null;

  const response = await fetch("/report_map_bootstrap.json");
  if (!response.ok) return null;

  const data = await response.json();
  if (data?.alerts) return data;
  return null;
}

async function fetchStaticBootstrapReportDirect() {
  if (!isBrowser) return null;

  const response = await fetch("/report_bootstrap.json");
  if (!response.ok) return null;

  const data = await response.json();
  if (data?.forecasts?.length) return data;
  return null;
}

async function fetchStaticBootstrapReport(historyWeeks = 16) {
  const cached = await fetchStaticBootstrapReportDirect().catch(() => null);
  if (cached) return cached;

  const report = await fetchStaticLatestEpidemiaReport();
  return trimReportClientSide(report, historyWeeks);
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

export async function runEpidemiaPipeline({
  dataDir = "data",
  outputDir = "report",
  horizonWeeks = 8,
  createReport = false,
  forceRefresh = false,
  regionFilter = null,
} = {}) {
  const response = await axios.post(buildApiUrl(FORECAST_API_BASE, "/epidemia/run"), {
    data_dir: dataDir,
    output_dir: outputDir,
    horizon_weeks: horizonWeeks,
    create_report: createReport,
    force_refresh: forceRefresh,
    region_filter: regionFilter,
  });
  return response.data;
}

export async function fetchMapEpidemiaReport({ outputDir = "report" } = {}) {
  if (isBrowser) {
    const staticMapBootstrap = await fetchStaticMapBootstrapReportDirect().catch(() => null);
    if (staticMapBootstrap) return staticMapBootstrap;
  }

  if (FORECAST_API_BASE) {
    try {
      const response = await axios.get(buildApiUrl(FORECAST_API_BASE, "/epidemia/latest/map"), {
        params: { output_dir: outputDir },
      });
      if (response.data) return response.data;
    } catch (err) {
      if (isBrowser) {
        const staticBootstrap = await fetchStaticBootstrapReportDirect().catch(() => null);
        if (staticBootstrap?.alerts) {
          return {
            ...staticBootstrap,
            forecasts: [],
          };
        }
      }
      throw err;
    }
  }

  const staticBootstrap = await fetchStaticBootstrapReportDirect().catch(() => null);
  if (staticBootstrap?.alerts) {
    return { ...staticBootstrap, forecasts: [] };
  }

  throw new Error("Map forecast report not found");
}

export async function fetchLatestEpidemiaReport({ outputDir = "report", historyWeeks = 16 } = {}) {
  if (isBrowser) {
    const staticBootstrap = await fetchStaticBootstrapReportDirect().catch(() => null);
    if (staticBootstrap) return staticBootstrap;
  }

  if (!isLocalhost && !FORECAST_API_BASE) {
    return fetchStaticBootstrapReport(historyWeeks);
  }

  if (FORECAST_API_BASE) {
    try {
      const response = await axios.get(
        buildApiUrl(FORECAST_API_BASE, "/epidemia/latest/bootstrap"),
        {
          params: { output_dir: outputDir, history_weeks: historyWeeks },
        }
      );
      if (response.data) {
        return response.data;
      }
    } catch (err) {
      if (isBrowser) {
        const staticData = await fetchStaticBootstrapReport(historyWeeks).catch(() => null);
        if (staticData) return staticData;
      }
      throw err;
    }
  }

  return fetchStaticBootstrapReport(historyWeeks);
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
} = {}) {
  if (!district) {
    throw new Error("district is required");
  }

  const staticDetail = await fetchStaticDistrictForecastDetail(
    district,
    species,
    startDate,
    endDate
  ).catch(() => null);
  if (staticDetail) return staticDetail;

  if (FORECAST_API_BASE) {
    try {
      const response = await axios.get(buildApiUrl(FORECAST_API_BASE, "/epidemia/latest/district"), {
        params: {
          output_dir: outputDir,
          district,
          species,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        },
        timeout: 120000,
      });
      return response.data;
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 404 && err?.code !== "ERR_NETWORK") {
        throw err;
      }

      const retryStatic = await fetchStaticDistrictForecastDetail(
        district,
        species,
        startDate,
        endDate
      ).catch(() => null);
      if (retryStatic) return retryStatic;
    }
  }

  const report = await fetchStaticLatestEpidemiaReport();
  const targetKey = forecastDistrictKey(district);
  const match = (report.forecasts || []).find(
    (forecast) =>
      forecast.species === species &&
      (String(forecast.district || "") === String(district) ||
        forecastDistrictKey(forecast.district) === targetKey)
  );
  if (!match) {
    throw new Error(`No forecast found for district '${district}'`);
  }

  const filteredHistory = (match.observed_history || []).filter((point) => {
    const week = point?.week_start;
    if (!week) return false;
    if (startDate && week < startDate) return false;
    if (endDate && week > endDate) return false;
    return true;
  });

  return trimDistrictDetailClientSide(
    { ...match, observed_history: filteredHistory },
    startDate,
    endDate
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
