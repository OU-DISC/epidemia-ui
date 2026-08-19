/**
 * Summarize district GEE timeseries into Decision evidence pack fields.
 * Method: recent half vs earlier half of finite points (or last N vs prior N).
 */

const LOOKBACK_POINTS = 8;

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function meanOf(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function splitRecentPrior(timeseries = [], lookback = LOOKBACK_POINTS) {
  const points = (timeseries || [])
    .map((p) => ({
      date: p?.date || null,
      value: finiteNumber(p?.value),
    }))
    .filter((p) => p.value != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (points.length < 4) {
    return { recent: [], prior: [], points };
  }

  const n = Math.min(lookback, Math.floor(points.length / 2));
  const recent = points.slice(-n);
  const prior = points.slice(-(2 * n), -n);
  return { recent, prior, points };
}

function seriesSummary(timeseries, { unitLabel, asPercentChange = false } = {}) {
  const { recent, prior } = splitRecentPrior(timeseries);
  const recentValues = recent.map((p) => p.value);
  const priorValues = prior.map((p) => p.value);
  const recentMean = meanOf(recentValues);
  const priorMean = meanOf(priorValues);

  let change = null;
  if (recentMean != null && priorMean != null) {
    if (asPercentChange) {
      change =
        Math.abs(priorMean) > 1e-6
          ? Number((((recentMean - priorMean) / priorMean) * 100).toFixed(1))
          : null;
    } else {
      change = Number((recentMean - priorMean).toFixed(2));
    }
  }

  return {
    recent_mean: recentMean != null ? Number(recentMean.toFixed(2)) : null,
    prior_mean: priorMean != null ? Number(priorMean.toFixed(2)) : null,
    change,
    recent_weeks: recent.length,
    prior_weeks: prior.length,
    recent_start: recent[0]?.date || null,
    recent_end: recent[recent.length - 1]?.date || null,
    prior_start: prior[0]?.date || null,
    prior_end: prior[prior.length - 1]?.date || null,
    unit: unitLabel,
  };
}

/**
 * Build environmental block for the district evidence pack.
 * @returns {{ available: boolean, ... }}
 */
export function summarizeDistrictEnvironmentalContext({
  rainfallTimeseries = null,
  temperatureTimeseries = null,
  districtName = null,
  error = null,
} = {}) {
  if (error) {
    return {
      available: false,
      rainfall_change_percent: null,
      temperature_change_c: null,
      rainfall: null,
      temperature: null,
      findings: [],
      note: `Environmental lookup failed: ${error}`,
    };
  }

  const rainfall = rainfallTimeseries
    ? seriesSummary(rainfallTimeseries, {
        unitLabel: "mm/day",
        asPercentChange: true,
      })
    : null;
  const temperature = temperatureTimeseries
    ? seriesSummary(temperatureTimeseries, {
        unitLabel: "°C",
        asPercentChange: false,
      })
    : null;

  const rainfallChange =
    rainfall?.change != null ? rainfall.change : null;
  const temperatureChange =
    temperature?.change != null ? temperature.change : null;

  const available =
    rainfallChange != null ||
    temperatureChange != null ||
    rainfall?.recent_mean != null ||
    temperature?.recent_mean != null;

  if (!available) {
    return {
      available: false,
      rainfall_change_percent: null,
      temperature_change_c: null,
      rainfall: null,
      temperature: null,
      findings: [],
      note: "Insufficient district environmental timeseries to summarize.",
    };
  }

  const findings = [];
  if (rainfall?.recent_mean != null && rainfall?.prior_mean != null) {
    findings.push(
      `Rainfall (totprec): recent mean ${rainfall.recent_mean} mm/day vs prior ${rainfall.prior_mean} mm/day` +
        (rainfallChange != null
          ? ` (${rainfallChange > 0 ? "+" : ""}${rainfallChange}%).`
          : ".")
    );
  }
  if (temperature?.recent_mean != null && temperature?.prior_mean != null) {
    findings.push(
      `LST mean: recent ${temperature.recent_mean}°C vs prior ${temperature.prior_mean}°C` +
        (temperatureChange != null
          ? ` (Δ ${temperatureChange > 0 ? "+" : ""}${temperatureChange}°C).`
          : ".")
    );
  }
  return {
    available: true,
    district: districtName || null,
    rainfall_change_percent: rainfallChange,
    temperature_change_c: temperatureChange,
    rainfall,
    temperature,
    method:
      "recent_vs_prior_mean_of_district_GEE_timeseries (totprec + lst_mean; last N vs prior N weeks)",
    findings,
    // Instruction for the LLM only (not shown in Decision UI).
    note: "Relate rainfall/temperature shifts to case exceedance only as co-occurrence — not proven causation.",
  };
}
