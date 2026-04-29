import axios from "axios";

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
} = {}) {
  const response = await axios.post(buildApiUrl(FORECAST_API_BASE, "/epidemia/run"), {
    data_dir: dataDir,
    output_dir: outputDir,
    horizon_weeks: horizonWeeks,
    create_report: createReport,
  });
  return response.data;
}

export async function fetchLatestEpidemiaReport({ outputDir = "report" } = {}) {
  const response = await axios.get(buildApiUrl(FORECAST_API_BASE, "/epidemia/latest"), {
    params: { output_dir: outputDir },
  });
  return response.data;
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
  return response.data;
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
  return response.data;
}
