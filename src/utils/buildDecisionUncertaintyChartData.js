import { buildUncertaintyCue } from "./decisionActions";

const HISTORY_WEEKS_DISPLAY = 52;

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pointDate(point) {
  return point?.week_start || point?.date || null;
}

/**
 * Build series for the Decision-tab uncertainty chart:
 * recent observed vs expected, plus forecast with residual-based ~80% PI.
 */
export function buildDecisionUncertaintyChartData({
  observedHistory = [],
  forecastPoints = [],
  uncertainty = null,
  historyWeeks = HISTORY_WEEKS_DISPLAY,
} = {}) {
  const cue =
    uncertainty ||
    buildUncertaintyCue({
      forecastPoints,
      observedHistory,
    });

  const halfWidth80 = finiteNumber(cue.halfWidth80);
  const residualSd = finiteNumber(cue.residualSd);

  const history = (observedHistory || [])
    .slice(-Math.max(8, historyWeeks))
    .map((point) => {
      const date = pointDate(point);
      const observed = finiteNumber(point?.observed);
      const expected = finiteNumber(
        point?.detection_threshold ?? point?.detectionThreshold ?? point?.expected
      );
      if (!date || observed == null) return null;
      const residual = expected != null ? observed - expected : null;
      return { date, observed, expected, residual };
    })
    .filter(Boolean);

  const forecast = (forecastPoints || [])
    .map((point) => {
      const date = pointDate(point);
      const median = finiteNumber(point?.median);
      if (!date || median == null) return null;
      const piLower =
        halfWidth80 != null ? Math.max(0, median - halfWidth80) : null;
      const piUpper = halfWidth80 != null ? median + halfWidth80 : null;
      return { date, median, piLower, piUpper };
    })
    .filter(Boolean);

  return {
    history,
    forecast,
    residualSd,
    halfWidth80,
    relativeSd: finiteNumber(cue.relativeSd),
    level: cue.level || "moderate",
    label: cue.label || "Uncertainty",
    detail: cue.detail || "",
    method: cue.method,
    sampleCount: cue.sampleCount || 0,
  };
}
