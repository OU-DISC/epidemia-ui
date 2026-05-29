const TEMPERATURE_DATASETS = new Set(["lst_day", "lst_night", "lst_mean", "lst", "net"]);

const KELVIN_TO_CELSIUS = 273.15;
const LST_DN_SCALE = 0.02;

export function coerceNumeric(value) {
  if (value == null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && value.value != null) {
    return coerceNumeric(value.value);
  }
  return null;
}

export function isTemperatureDataset(dataset) {
  return TEMPERATURE_DATASETS.has(String(dataset || "").toLowerCase());
}

/** Convert env API temperature values to Celsius when still in Kelvin or DN form. */
export function kelvinToCelsiusValue(value, dataset) {
  if (!isTemperatureDataset(dataset)) return value;

  const raw = coerceNumeric(value);
  if (raw == null) return value;

  // VIIRS uint16 DN counts (typical range ~7500-16000).
  if (raw > 1000) return raw * LST_DN_SCALE - KELVIN_TO_CELSIUS;
  // Physical Kelvin from Earth Engine (typical LST ~250-350 K).
  if (raw >= 200) return raw - KELVIN_TO_CELSIUS;
  return raw;
}

export function extractTimeseriesValue(point, dataset) {
  if (!point || typeof point !== "object") return null;

  const direct = coerceNumeric(point.value);
  if (direct != null) return direct;

  const datasetKey = String(dataset || "").toLowerCase();
  const named = coerceNumeric(point[datasetKey]);
  if (named != null) return named;

  for (const [key, candidate] of Object.entries(point)) {
    if (key === "date") continue;
    const numeric = coerceNumeric(candidate);
    if (numeric != null) return numeric;
  }

  return null;
}

export function normalizeEnvironmentalTimeseries(payload, dataset) {
  if (!payload) return payload;
  const series = Array.isArray(payload.timeseries) ? payload.timeseries : [];

  return {
    ...payload,
    timeseries: series.map((point) => {
      const raw = extractTimeseriesValue(point, dataset);
      return {
        ...point,
        date: point.date,
        value: kelvinToCelsiusValue(raw, dataset),
      };
    }),
  };
}

export function normalizeEnvironmentalSummaryValues(values, dataset) {
  if (!values || typeof values !== "object" || !isTemperatureDataset(dataset)) {
    return values;
  }

  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, kelvinToCelsiusValue(value, dataset)])
  );
}
