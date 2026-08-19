/**
 * EDI JSON contracts
 *
 * INPUT  — Structured District Evidence Pack (built by EPIDEMIA; LLM may only read this)
 * OUTPUT — Unified Structured Brief (LLM returns; React renders; humans decide)
 *
 * Provenance / district / species on the brief are always overwritten from the
 * evidence pack (not LLM-authored).
 */

export const EDI_ACTION_CATALOG_IDS = ["monitor", "watch", "investigate", "escalate"];

/** Shape documentation for the district evidence pack (input). */
export const EDI_EVIDENCE_PACK_EXAMPLE = {
  district: "Example Woreda",
  region: "Example Region",
  species: "P. falciparum",
  status: "Early Warning",
  level: "High",
  alert_count: 2,
  magnitude_percent: 18,
  persistence_weeks: 2,
  deterministic_why: "...",
  prediction_interval: {
    lower: 10,
    upper: 40,
    median: 22,
    week: "2026-07-06",
  },
  historical_reliability: {
    score: 0.62,
    sample_weeks: 8,
    method: "share_of_recent_weeks_at_or_below_expected",
    note: "...",
  },
  environmental: {
    available: true,
    rainfall_change_percent: 12.5,
    temperature_change_c: 0.4,
    findings: [
      "Rainfall (totprec): recent mean … vs prior …",
      "LST mean: recent … vs prior …",
    ],
    note: "District GEE timeseries; relate as co-occurrence, not causation.",
  },
  neighboring_district_context: {
    available: true,
    region: "Example Region",
    alert_count: 3,
    early_warning_count: 2,
    early_detection_count: 1,
    sample_districts: ["A", "B"],
    note: "Same admin region EW/ED counts (not spatial adjacency).",
  },
  investigation: {
    findings: ["..."],
    recent_observed: [],
    forecast_horizon: [],
  },
  uncertainty: { band: "high", label: "...", detail: "..." },
  recommendation: { action_id: "investigate", label: "...", rationale: "..." },
  action_catalog: [
    { id: "monitor", label: "..." },
    { id: "watch", label: "..." },
    { id: "investigate", label: "..." },
    { id: "escalate", label: "..." },
  ],
  evidence_gaps: ["..."],
  provenance: {
    data_through: "2026-07-06",
    model_version: "seasonal_GAM + Farrington thresholds (EPIDEMIA pipeline)",
    geography_version: "COD-AB Ethiopia Admin3 (woreda)",
  },
};

/** On-demand challenge interaction (counter-reliance). */
export const EDI_CHALLENGE_OUTPUT_EXAMPLE = {
  challenge: {
    summary:
      "The strongest reason to question this alert is high forecast uncertainty…",
    reasons_to_question: ["...", "..."],
    what_would_reduce_uncertainty: ["Additional observed case verification…"],
  },
};

/** Shape documentation for the LLM brief (output). */
export const EDI_BRIEF_OUTPUT_EXAMPLE = {
  district: "Example Woreda",
  species: "P. falciparum",
  explanation: {
    why_alert: "...",
    supporting_evidence: ["..."],
    contradicting_evidence: ["..."],
  },
  uncertainty: {
    level: "high",
    evidence: "...",
    decision_implication: "...",
  },
  options: [
    {
      id: "monitor",
      action: "Continue routine monitoring",
      supporting_evidence: ["..."],
      tradeoffs: ["..."],
    },
    {
      id: "investigate",
      action: "Investigate locally",
      supporting_evidence: ["..."],
      tradeoffs: ["..."],
    },
    {
      id: "escalate",
      action: "Escalate response",
      supporting_evidence: ["..."],
      tradeoffs: ["..."],
    },
  ],
  what_could_change_decision: ["..."],
  evidence_gaps: ["..."],
  provenance: {
    data_through: "...",
    model_version: "...",
    geography_version: "...",
  },
};
