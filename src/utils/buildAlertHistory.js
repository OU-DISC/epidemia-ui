import { assignTooltipKey } from "./buildAlertTooltipLookup";
import { formatAlertTooltipHtml } from "./alertExplainer";

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(value));
}

/**
 * Collect the last N week_start dates from observed_history for a species.
 */
export function buildAlertWeekDates(
  forecasts,
  selectedSpecies,
  maxWeeks = 8,
  startDate = null,
  endDate = null
) {
  const weekSet = new Set();

  (forecasts || [])
    .filter((fc) => fc.species === selectedSpecies)
    .forEach((fc) => {
      (fc.observed_history || []).forEach((point) => {
        if (point?.week_start) weekSet.add(point.week_start);
      });
    });

  let sorted = Array.from(weekSet).sort();
  if (startDate) {
    sorted = sorted.filter((week) => week >= startDate);
  }
  if (endDate) {
    sorted = sorted.filter((week) => week <= endDate);
  }

  const weeks = Math.max(1, Math.min(8, Number(maxWeeks) || 8));
  return sorted.slice(-weeks);
}

/**
 * Reconstruct early detection markers for a historical week using observed
 * cases vs the Farrington upper threshold for that week.
 */
export function buildAlertsForWeek(forecasts, alerts, selectedSpecies, weekStart) {
  if (!weekStart) return [];

  const alertByDistrict = new Map();
  (alerts || [])
    .filter((a) => a.species === selectedSpecies)
    .forEach((a) => alertByDistrict.set(a.district, a));

  const out = [];

  (forecasts || [])
    .filter((fc) => fc.species === selectedSpecies)
    .forEach((fc) => {
      const template = alertByDistrict.get(fc.district);
      if (!template) return;

      const point = (fc.observed_history || []).find((p) => p.week_start === weekStart);
      if (!point) return;

      const observed = finiteNumber(point.observed);
      const detectionThreshold = finiteNumber(
        point.detection_threshold ?? template.detection_threshold
      );
      const warningThreshold = finiteNumber(
        point.warning_threshold ?? template.warning_threshold
      );
      const alertThreshold = warningThreshold ?? detectionThreshold;

      const earlyDetection =
        observed != null && alertThreshold != null && observed > alertThreshold;
      if (!earlyDetection) return;

      out.push({
        district: fc.district,
        species: selectedSpecies,
        early_warning: false,
        early_detection: true,
        latest_observed: observed,
        latest_forecast: null,
        detection_threshold: detectionThreshold,
        warning_threshold: warningThreshold,
        population_at_risk: template.population_at_risk,
        history_week: weekStart,
      });
    });

  return out;
}

export function countAlertTypes(alerts) {
  let warnings = 0;
  let detections = 0;

  (alerts || []).forEach((alert) => {
    if (alert.early_warning) warnings += 1;
    if (alert.early_detection) detections += 1;
  });

  return { warnings, detections };
}

export function buildAnimatedAlertTooltipLookup(alerts, speciesLabel, weekStart) {
  const lookup = {};

  (alerts || []).forEach((alert) => {
    const status = alert.early_warning
      ? "Early Warning"
      : alert.early_detection
      ? "Early Detection"
      : null;
    if (!status) return;

    const threshold = alert.warning_threshold ?? alert.detection_threshold;

    const explanation = {
      status,
      summary:
        status === "Early Warning"
          ? "Forecast exceeded the Farrington alert threshold this week."
          : "Observed cases exceeded the Farrington alert threshold this week.",
      bullets: [
        `Week of ${weekStart}`,
        `Observed ${formatNumber(alert.latest_observed, 0)} · Threshold ${formatNumber(threshold)}`,
        `${speciesLabel} · historical replay`,
      ],
    };

    const insight = {
      latestObserved: alert.latest_observed,
      latestForecast: alert.latest_forecast,
      activeThreshold: threshold,
    };

    const html = formatAlertTooltipHtml(alert.district, explanation, insight);
    assignTooltipKey(lookup, alert.district, html);
  });

  return lookup;
}
