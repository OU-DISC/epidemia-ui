/**
 * Layer-2 evidence pack for grounded EDI Explain.
 * Only these facts may be sent to the LLM — never free-form model dumps.
 */

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} params
 * @param {object} params.explanation - from buildAlertExplanation
 * @param {object} [params.uncertainty] - from buildUncertaintyCue
 * @param {string} [params.districtName]
 * @param {string} [params.regionName]
 * @param {string} [params.speciesLabel]
 */
export function buildExplainEvidencePack({
  explanation,
  uncertainty = null,
  districtName = null,
  regionName = null,
  speciesLabel = null,
} = {}) {
  if (!explanation) return null;

  const triggered = (explanation.triggeredWeeks || []).slice(0, 8).map((week) => ({
    kind: week.kind,
    week: week.week,
    week_label: week.weekLabel,
    value: finiteNumber(week.value),
    threshold_type: week.thresholdType,
    threshold_value: finiteNumber(week.thresholdValue),
    excess: finiteNumber(week.excess),
  }));

  const pack = {
    interaction: "explain",
    district: districtName || null,
    region: regionName || explanation.contextLine || null,
    species: speciesLabel || null,
    status: explanation.status || null,
    level: explanation.level || null,
    alert_count: explanation.alertCount ?? 0,
    magnitude_percent:
      explanation.magnitudePercent != null
        ? finiteNumber(explanation.magnitudePercent)
        : null,
    persistence_weeks: explanation.persistenceWeeks || 0,
    latest_observed: finiteNumber(explanation.latestObserved),
    latest_forecast: finiteNumber(explanation.latestForecast),
    active_threshold: finiteNumber(explanation.activeThreshold),
    triggered_weeks: triggered,
    deterministic_why: explanation.why || explanation.summary || "",
    bullets: Array.isArray(explanation.bullets) ? explanation.bullets.slice(0, 8) : [],
  };

  if (uncertainty) {
    pack.uncertainty = {
      band: uncertainty.level || null,
      label: uncertainty.label || null,
      detail: uncertainty.detail || null,
      residual_sd: finiteNumber(uncertainty.residualSd),
      relative_sd: finiteNumber(uncertainty.relativeSd),
      half_width_80: finiteNumber(uncertainty.halfWidth80),
      sample_count: uncertainty.sampleCount ?? null,
    };
  }

  return pack;
}
