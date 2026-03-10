import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";

export async function fetchForecast(region, horizonWeeks = 8) {
  const response = await axios.post(`${API_BASE}/forecast`, {
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
  const response = await axios.post(`${API_BASE}/epidemia/run`, {
    data_dir: dataDir,
    output_dir: outputDir,
    horizon_weeks: horizonWeeks,
    create_report: createReport,
  });
  return response.data;
}
