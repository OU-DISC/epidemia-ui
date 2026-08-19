import { DECISION_ACTIONS } from "./decisionActions";
import { buildExplainEvidencePack } from "./buildExplainEvidencePack";

const UNAVAILABLE_FIELDS = [
  "local outbreak investigation report",
  "facility reporting completeness",
  "recent IRS / ITN campaign timing",
];

function actionCatalog() {
  return DECISION_ACTIONS.map((action) => ({
    id: action.id,
    label: action.label,
    short_label: action.shortLabel,
    description: action.description,
  }));
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round1(value) {
  const n = finiteNumber(value);
  return n == null ? null : Number(n.toFixed(1));
}

function weekLabel(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isoWeek(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/**
 * Grounded lookup over series already in EPIDEMIA.
 */
export function buildInvestigationLookup({
  observedHistory = [],
  forecastPoints = [],
} = {}) {
  const recent = (observedHistory || []).slice(-8);
  const recentRows = recent
    .map((point) => {
      const observed = finiteNumber(point?.observed);
      const expected = finiteNumber(
        point?.detection_threshold ?? point?.detectionThreshold ?? point?.expected
      );
      const warning = finiteNumber(
        point?.warning_threshold ?? point?.warningThreshold
      );
      if (observed == null && expected == null) return null;
      const residual =
        observed != null && expected != null ? observed - expected : null;
      return {
        week: point?.week_start || point?.date || null,
        week_label: weekLabel(point?.week_start || point?.date),
        observed,
        expected,
        warning,
        residual,
        above_expected: residual != null ? residual > 0 : null,
      };
    })
    .filter(Boolean);

  const residuals = recentRows
    .map((row) => row.residual)
    .filter((value) => value != null);
  const positiveWeeks = residuals.filter((value) => value > 0).length;
  const last = recentRows[recentRows.length - 1] || null;
  const meanResidual =
    residuals.length > 0
      ? residuals.reduce((sum, value) => sum + value, 0) / residuals.length
      : null;

  const forecastRows = (forecastPoints || []).slice(0, 6).map((point) => {
    const median = finiteNumber(point?.median);
    const lower = finiteNumber(point?.lower);
    const upper = finiteNumber(point?.upper);
    const detection = finiteNumber(
      point?.detection_threshold ?? point?.detectionThreshold
    );
    const warning = finiteNumber(
      point?.warning_threshold ?? point?.warningThreshold
    );
    return {
      week: point?.week_start || point?.date || null,
      week_label: weekLabel(point?.week_start || point?.date),
      median,
      lower,
      upper,
      expected: detection,
      warning,
      above_expected:
        median != null && detection != null ? median > detection : null,
    };
  });

  const forecastAbove = forecastRows.filter((row) => row.above_expected).length;
  const findings = [];

  if (last?.observed != null && last?.expected != null) {
    const obs = round1(last.observed);
    const exp = round1(last.expected);
    const res = round1(last.residual);
    findings.push(
      `Latest observed week (${last.week_label || "recent"}): ${obs} cases vs expected ${exp}` +
        (res != null ? ` (residual ${res > 0 ? "+" : ""}${res}).` : ".")
    );
  }
  if (residuals.length >= 2) {
    findings.push(
      `Of the last ${residuals.length} comparable weeks, ${positiveWeeks} were above expected` +
        (meanResidual != null
          ? `; mean residual ${meanResidual > 0 ? "+" : ""}${round1(meanResidual)} cases.`
          : ".")
    );
  }
  if (forecastRows.length) {
    findings.push(
      `Near-term forecast: ${forecastAbove} of ${forecastRows.length} weeks sit above expected (detection) level.`
    );
    const first = forecastRows[0];
    if (first?.median != null && first?.lower != null && first?.upper != null) {
      findings.push(
        `Next forecast week PI: median ${round1(first.median)} within [${round1(first.lower)}, ${round1(first.upper)}].`
      );
    }
  }
  if (!findings.length) {
    findings.push(
      "Limited series available for lookup; rely on alert status and recommendation fields."
    );
  }

  return {
    lookback_weeks: recentRows.length,
    recent_observed: recentRows,
    forecast_horizon: forecastRows,
    summary_stats: {
      weeks_above_expected: positiveWeeks,
      weeks_compared: residuals.length,
      mean_residual: meanResidual != null ? Number(meanResidual.toFixed(2)) : null,
      forecast_weeks_above_expected: forecastAbove,
      forecast_weeks: forecastRows.length,
    },
    findings,
  };
}

function buildHistoricalReliability(investigation, uncertainty) {
  const compared = investigation?.summary_stats?.weeks_compared || 0;
  const above = investigation?.summary_stats?.weeks_above_expected || 0;
  const relativeSd = finiteNumber(uncertainty?.relativeSd);
  // Share of recent weeks near/below expected as a simple stability cue.
  let score = null;
  if (compared >= 4) {
    score = Number((1 - above / compared).toFixed(2));
    score = Math.max(0, Math.min(1, score));
  }
  if (score == null && relativeSd != null) {
    score = Number(Math.max(0, Math.min(1, 1 - relativeSd / 2)).toFixed(2));
  }
  return {
    score,
    sample_weeks: compared,
    method:
      compared >= 4
        ? "share_of_recent_weeks_at_or_below_expected"
        : relativeSd != null
        ? "inverse_relative_residual_sd"
        : null,
    note:
      score == null
        ? "Insufficient recent history to estimate reliability."
        : "Heuristic stability score from recent observed−expected residuals (not a formal calibration metric).",
  };
}

function buildEnvironmentalContext(environmentalSummary = null) {
  if (
    environmentalSummary &&
    typeof environmentalSummary === "object" &&
    environmentalSummary.available
  ) {
    return {
      available: true,
      rainfall_change_percent:
        environmentalSummary.rainfall_change_percent ?? null,
      temperature_change_c: environmentalSummary.temperature_change_c ?? null,
      rainfall: environmentalSummary.rainfall || null,
      temperature: environmentalSummary.temperature || null,
      findings: environmentalSummary.findings || [],
      method: environmentalSummary.method || null,
      note:
        environmentalSummary.note ||
        "District GEE rainfall/temperature summary for grounded deliberation.",
    };
  }
  return {
    available: false,
    rainfall_change_percent: null,
    temperature_change_c: null,
    rainfall: null,
    temperature: null,
    findings: [],
    note:
      environmentalSummary?.note ||
      "District environmental timeseries not yet loaded or unavailable for this Decision pack.",
  };
}

function buildNeighboringContext(neighborSummary = null) {
  if (!neighborSummary) {
    return {
      available: false,
      region: null,
      alert_count: null,
      early_warning_count: null,
      early_detection_count: null,
      sample_districts: [],
      note: "Neighboring-district context was not supplied for this pack.",
    };
  }
  return {
    available: true,
    region: neighborSummary.region || null,
    alert_count: neighborSummary.alertCount ?? null,
    early_warning_count: neighborSummary.earlyWarningCount ?? null,
    early_detection_count: neighborSummary.earlyDetectionCount ?? null,
    sample_districts: neighborSummary.sampleDistricts || [],
    note: "Counts are other districts in the same admin region with EW/ED flags (not spatial adjacency).",
  };
}

function buildProvenance({
  observedHistory = [],
  forecastPoints = [],
  reportGeneratedAt = null,
  speciesLabel = null,
} = {}) {
  const lastObs = observedHistory?.[observedHistory.length - 1];
  const lastFc = forecastPoints?.[forecastPoints.length - 1];
  const dataThrough =
    isoWeek(lastObs?.week_start || lastObs?.date) ||
    isoWeek(lastFc?.week_start || lastFc?.date) ||
    null;
  const modelVersion = "seasonal_GAM + Farrington thresholds (EPIDEMIA pipeline)";
  return {
    data_through: dataThrough,
    report_generated_at: reportGeneratedAt || null,
    forecast_engine: modelVersion,
    model_version: modelVersion,
    deliberative_model: "ollama/llama3.2 (grounded brief) or structured fallback",
    geography_version: "COD-AB Ethiopia Admin3 (woreda)",
    species: speciesLabel || null,
  };
}

/**
 * Same-admin-region alert context for the Decision evidence pack.
 * Not spatial adjacency — peers sharing adm1 with EW/ED flags.
 */
export function buildNeighborSummaryFromTableRows({
  rows = [],
  regionName = null,
  districtName = null,
} = {}) {
  if (!regionName) return null;
  const peers = (rows || []).filter((row) => {
    if (!row?.region || row.region !== regionName) return false;
    if (
      districtName &&
      (row.mapDistrict === districtName || row.rawDistrict === districtName)
    ) {
      return false;
    }
    return true;
  });
  const ew = peers.filter((row) => row.earlyWarning || row.status === "Early Warning");
  const ed = peers.filter(
    (row) => row.earlyDetection || row.status === "Early Detection"
  );
  const alertPeers = peers.filter(
    (row) =>
      row.earlyWarning ||
      row.earlyDetection ||
      row.status === "Early Warning" ||
      row.status === "Early Detection"
  );
  if (!peers.length) return null;
  return {
    region: regionName,
    alertCount: alertPeers.length,
    earlyWarningCount: ew.length,
    earlyDetectionCount: ed.length,
    sampleDistricts: alertPeers
      .slice(0, 5)
      .map((row) => row.mapDistrict || row.rawDistrict)
      .filter(Boolean),
  };
}

/**
 * INPUT: Structured District Evidence Pack for grounded LLM deliberation.
 */
export function buildDistrictDeliberationEvidence({
  explanation,
  uncertainty = null,
  recommendation = null,
  districtName = null,
  regionName = null,
  speciesLabel = null,
  observedHistory = [],
  forecastPoints = [],
  reportGeneratedAt = null,
  neighborSummary = null,
  environmentalSummary = null,
  outcomeFeedback = null,
} = {}) {
  const base = buildExplainEvidencePack({
    explanation,
    uncertainty,
    districtName,
    regionName,
    speciesLabel,
  });
  if (!base) return null;

  const investigation = buildInvestigationLookup({
    observedHistory,
    forecastPoints,
  });
  const firstFc = (forecastPoints || []).find(
    (p) => finiteNumber(p?.median) != null
  );
  const historicalReliability = buildHistoricalReliability(
    investigation,
    uncertainty
  );
  const environmental = buildEnvironmentalContext(environmentalSummary);
  const neighboring = buildNeighboringContext(neighborSummary);
  const provenance = buildProvenance({
    observedHistory,
    forecastPoints,
    reportGeneratedAt,
    speciesLabel,
  });

  const evidenceGaps = [...UNAVAILABLE_FIELDS];
  if (!environmental.available) {
    evidenceGaps.push("district-level rainfall/temperature anomaly summary");
  }
  if (!neighboring.available) {
    evidenceGaps.push("spatial-neighbor alert context");
  }
  if (historicalReliability.score == null) {
    evidenceGaps.push("historical reliability score");
  }

  const localOutcome =
    outcomeFeedback &&
    (outcomeFeedback.falseAlarmCount > 0 ||
      outcomeFeedback.sampleCount > 0 ||
      outcomeFeedback.biasLabel)
      ? {
          false_alarm_count: outcomeFeedback.falseAlarmCount ?? 0,
          sample_count: outcomeFeedback.sampleCount ?? 0,
          caution: Boolean(outcomeFeedback.caution),
          bias_label: outcomeFeedback.biasLabel || null,
        }
      : null;

  return {
    ...base,
    local_outcome_feedback: localOutcome,
    prediction_interval:
      firstFc &&
      finiteNumber(firstFc.lower) != null &&
      finiteNumber(firstFc.upper) != null
        ? {
            lower: finiteNumber(firstFc.lower),
            upper: finiteNumber(firstFc.upper),
            median: finiteNumber(firstFc.median),
            week: firstFc.week_start || firstFc.date || null,
          }
        : null,
    historical_reliability: historicalReliability,
    environmental,
    neighboring_district_context: neighboring,
    action_catalog: actionCatalog(),
    recommendation: recommendation
      ? {
          action_id: recommendation.actionId,
          label: recommendation.label,
          short_label: recommendation.shortLabel,
          rationale: recommendation.rationale,
          evidence_strength: recommendation.evidenceStrength,
        }
      : null,
    investigation,
    unavailable_fields: UNAVAILABLE_FIELDS,
    evidence_gaps: evidenceGaps,
    provenance,
  };
}

/**
 * Compare pack: 2–3 candidate summaries only.
 */
export function buildCompareEvidencePack({ candidates = [], speciesLabel = null } = {}) {
  const rows = (candidates || []).slice(0, 3).map((item) => {
    const unc = item.uncertainty || {};
    const outcome = item.outcomeFeedback || {};
    const findings = item.investigation?.findings || [];
    return {
      district: item.districtName,
      region: item.regionName || null,
      status: item.status || item.explanation?.status || null,
      level: item.explanation?.level || null,
      alert_count: item.explanation?.alertCount ?? null,
      magnitude_percent: item.explanation?.magnitudePercent ?? null,
      persistence_weeks: item.explanation?.persistenceWeeks ?? null,
      deterministic_why: item.explanation?.why || item.explanation?.summary || null,
      investigation_findings: findings.slice(0, 3),
      uncertainty: {
        band: unc.level || unc.band || null,
        label: unc.label || null,
        detail: unc.detail || null,
      },
      recommendation: item.recommendation
        ? {
            action_id: item.recommendation.actionId,
            label: item.recommendation.label,
            rationale: item.recommendation.rationale,
          }
        : null,
      local_outcome_feedback:
        outcome.falseAlarmCount > 0 || outcome.sampleCount > 0
          ? {
              false_alarm_count: outcome.falseAlarmCount ?? 0,
              sample_count: outcome.sampleCount ?? 0,
              caution: Boolean(outcome.caution),
              bias_label: outcome.biasLabel || null,
            }
          : null,
    };
  });

  if (rows.length < 2) return null;

  return {
    interaction: "compare",
    species: speciesLabel || null,
    candidates: rows,
    unavailable_fields: UNAVAILABLE_FIELDS,
    evidence_gaps: UNAVAILABLE_FIELDS,
  };
}

export function buildClientSuggestFallback(evidence) {
  const recId = evidence?.recommendation?.action_id || "monitor";
  const order = ["monitor", "watch", "investigate", "escalate"];
  const catalog = DECISION_ACTIONS;
  const byId = Object.fromEntries(catalog.map((a) => [a.id, a]));
  const chosen = [recId];
  const idx = order.indexOf(recId);
  if (idx > 0) chosen.push(order[idx - 1]);
  if (idx >= 0 && idx < order.length - 1) chosen.push(order[idx + 1]);

  return {
    available: false,
    grounded: true,
    source: "fallback",
    interaction: "suggest",
    summary: "Decision alternatives from the action catalog and current evidence. You still choose.",
    options: chosen
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, 3)
      .map((id) => ({
        id,
        label: byId[id]?.label || id,
        pros:
          id === recId
            ? [evidence?.recommendation?.rationale || "Matches the rule-based recommendation."]
            : ["Consider if local context supports a different intensity of response."],
        cons: ["You must confirm or override — this is not an automatic decision."],
        evidence_refs: ["recommendation", "status"],
      })),
    questions: [],
    bullets: [],
    evidence_refs: ["recommendation", "action_catalog"],
  };
}

export function buildClientExploreFallback(evidence) {
  const recLabel = evidence?.recommendation?.label || "the recommendation";
  const status = evidence?.status || "Normal";
  const findings = evidence?.investigation?.findings || [];
  const questions = [
    `Given the looked-up series, would local case verification change confidence in ${recLabel}?`,
  ];
  if (status === "Early Warning") {
    questions.push(
      "If next week's observed cases stay below expected levels, would you step down from this action?"
    );
  }
  if (status === "Early Detection") {
    questions.push(
      "If a reporting backlog explains the exceedance, would you hold escalation?"
    );
  }
  questions.push(
    "Is any local context missing from EPIDEMIA (campaigns, movement, incomplete reporting) that should change this?"
  );

  return {
    available: false,
    grounded: true,
    source: "fallback",
    interaction: "explore",
    summary:
      "Looked up recent observed vs expected and the forecast horizon in EPIDEMIA. Open questions below still need your local judgment.",
    bullets: findings.slice(0, 4),
    questions: questions.slice(0, 4),
    options: [],
    evidence_refs: ["investigation", "recommendation", "status", "uncertainty"],
  };
}

/** Short officer-facing bullets for the structured brief (not raw pack dumps). */
function buildOfficerSupportingEvidence(evidence) {
  const stats = evidence?.investigation?.summary_stats || {};
  const recent = evidence?.investigation?.recent_observed || [];
  const last = recent[recent.length - 1];
  const bullets = [];

  if (last?.observed != null && last?.expected != null) {
    const obs = round1(last.observed);
    const exp = round1(last.expected);
    bullets.push(
      `Latest week (${last.week_label || "recent"}): ${obs} observed vs ${exp} expected.`
    );
  }
  if (stats.weeks_compared >= 2) {
    bullets.push(
      `${stats.weeks_above_expected} of last ${stats.weeks_compared} weeks were above expected.`
    );
  }
  if (stats.forecast_weeks > 0) {
    bullets.push(
      `Near-term forecast: ${stats.forecast_weeks_above_expected} of ${stats.forecast_weeks} weeks above detection.`
    );
  }

  const env = evidence?.environmental;
  if (env?.available) {
    const rain = env.rainfall_change_percent;
    const temp = env.temperature_change_c;
    if (rain != null && Math.abs(rain) >= 5) {
      bullets.push(
        `Recent rainfall ${rain > 0 ? "up" : "down"} ${Math.abs(rain)}% vs prior weeks.`
      );
    }
    if (temp != null && Math.abs(temp) >= 0.3) {
      bullets.push(
        `Recent LST mean ${temp > 0 ? "up" : "down"} ${Math.abs(temp)}°C vs prior weeks.`
      );
    }
  }

  if (!bullets.length && evidence?.deterministic_why) {
    bullets.push(evidence.deterministic_why);
  }
  return bullets.slice(0, 4);
}

/** Unified structured brief (OUTPUT contract). */
export function buildClientBriefFallback(evidence) {
  const suggest = buildClientSuggestFallback(evidence);
  const explore = buildClientExploreFallback(evidence);
  const unc = evidence?.uncertainty || {};
  const reliability = evidence?.historical_reliability || {};
  const why =
    evidence?.deterministic_why ||
    evidence?.recommendation?.rationale ||
    explore.summary ||
    "";

  const supporting = buildOfficerSupportingEvidence(evidence);
  const contradicting = [];
  if (String(unc.band || unc.level) === "high") {
    contradicting.push("High residual uncertainty weakens confidence in strong escalation.");
  }
  if (reliability.score != null && reliability.score < 0.45) {
    contradicting.push(
      reliability.score === 0
        ? "All recent comparable weeks were above expected — confirm reporting quality before escalating on residual history alone."
        : `Historical residual stability is low (${reliability.score}); recent exceedances may be noisy.`
    );
  }
  const env = evidence?.environmental;
  if (env?.available) {
    const rain = env.rainfall_change_percent;
    const temp = env.temperature_change_c;
    const envSupports =
      (rain != null && Math.abs(rain) >= 10) ||
      (temp != null && Math.abs(temp) >= 0.5);
    if (!envSupports) {
      contradicting.push(
        "Recent rainfall/temperature shifts are small, so environment alone does not strongly corroborate the alert."
      );
    }
  }

  const options = (suggest.options || []).map((opt) => ({
    id: opt.id,
    action: opt.label || opt.id,
    label: opt.label || opt.id,
    supporting_evidence: opt.pros?.length
      ? opt.pros
      : [opt.id === evidence?.recommendation?.action_id
          ? evidence?.recommendation?.rationale || "Aligned with rule-based recommendation."
          : "Nearby alternative intensity for deliberation."],
    tradeoffs: opt.cons?.length
      ? opt.cons
      : ["Requires human confirm/override before operational use."],
    rationale: opt.pros?.[0] || "",
    risk: opt.cons?.[0] || "",
  }));

  return {
    available: false,
    grounded: true,
    source: "fallback",
    interaction: "brief",
    district: evidence?.district || null,
    species: evidence?.species || null,
    explanation: {
      why_alert: why,
      supporting_evidence: supporting,
      contradicting_evidence: contradicting,
    },
    uncertainty: {
      level: unc.band || unc.level || "moderate",
      evidence: unc.detail || unc.label || "Residual uncertainty from recent history.",
      decision_implication:
        "Weigh local verification before strong action when uncertainty is not low.",
    },
    options,
    what_could_change_decision: (explore.questions || []).slice(0, 4),
    evidence_gaps: evidence?.evidence_gaps || UNAVAILABLE_FIELDS,
    provenance: evidence?.provenance || {
      data_through: null,
      model_version: null,
      geography_version: "COD-AB Ethiopia Admin3 (woreda)",
    },
    // legacy mirrors
    summary: why,
    bullets: supporting,
    questions: (explore.questions || []).slice(0, 4),
    supporting_evidence: supporting,
    what_would_change_decision: (explore.questions || []).slice(0, 4),
    evidence_refs: [
      "investigation",
      "uncertainty",
      "recommendation",
      "historical_reliability",
      "environmental",
      "provenance",
    ],
  };
}

/** Counter-reliance challenge (OUTPUT) — on-demand, not auto-shown. */
export function buildClientChallengeFallback(evidence) {
  const unc = evidence?.uncertainty || {};
  const level = String(unc.band || unc.level || "moderate");
  const reliability = evidence?.historical_reliability || {};
  const stats = evidence?.investigation?.summary_stats || {};
  const outcome = evidence?.local_outcome_feedback || {};
  const gaps = evidence?.evidence_gaps || UNAVAILABLE_FIELDS;
  const reasons = [];

  if (level === "high" || level === "moderate") {
    reasons.push(
      `${level.charAt(0).toUpperCase()}${level.slice(1)} residual uncertainty weakens confidence in strong action.`
    );
  }
  if (reliability.score != null && reliability.score < 0.45) {
    reasons.push(
      "Recent residual history is unstable or persistently elevated — confirm reporting quality before trusting escalation."
    );
  }
  if (
    (stats.forecast_weeks || 0) > 0 &&
    stats.forecast_weeks_above_expected === 0 &&
    (stats.weeks_above_expected || 0) > 0
  ) {
    reasons.push(
      "Recent observed exceedance is not matched by near-term forecast weeks above detection — the forward signal is weaker."
    );
  }
  const env = evidence?.environmental;
  if (env?.available) {
    const rain = env.rainfall_change_percent;
    const temp = env.temperature_change_c;
    const envSupports =
      (rain != null && Math.abs(rain) >= 10) ||
      (temp != null && Math.abs(temp) >= 0.5);
    if (!envSupports) {
      reasons.push(
        "Environmental co-occurrence is weak; climate context does not strongly corroborate the alert."
      );
    }
  }
  if (outcome.false_alarm_count > 0) {
    reasons.push(
      `Local feedback marks ${outcome.false_alarm_count} recent false alarm(s) for this district — treat escalation cautiously.`
    );
  } else if (outcome.bias_label) {
    reasons.push(outcome.bias_label);
  }
  if (gaps?.length) {
    reasons.push(`Key gap still missing: ${gaps[0]}.`);
  }
  if (!reasons.length) {
    reasons.push(
      "Even when signals align, local verification can still reverse this assessment."
    );
  }

  const reduce = [
    "Verify latest facility case counts and reporting completeness for the alert weeks.",
    "Check whether a reporting backlog or catch-up could explain the exceedance.",
    ...gaps.slice(0, 2).map((gap) => `Obtain: ${gap}.`),
  ].slice(0, 4);

  const strongest = reasons[0];
  let summary = `The strongest reason to question this assessment: ${strongest.charAt(0).toLowerCase()}${strongest.slice(1)}`;
  if (reasons[1]) {
    summary = `${summary} Also consider: ${reasons[1]}`;
  }

  return {
    available: false,
    grounded: true,
    source: "fallback",
    interaction: "challenge",
    challenge: {
      summary,
      reasons_to_question: reasons.slice(0, 4),
      what_would_reduce_uncertainty: reduce,
    },
    summary,
    bullets: reasons.slice(0, 4),
    questions: reduce,
    evidence_refs: [
      "uncertainty",
      "historical_reliability",
      "investigation",
      "evidence_gaps",
      "local_outcome_feedback",
    ],
  };
}

export function buildClientCompareFallback(evidence) {
  const candidates = evidence?.candidates || [];
  const names = candidates.map((c) => c.district).filter(Boolean);
  const contrasts = candidates.map((item) => {
    const unc = item.uncertainty?.label || item.uncertainty?.band || "uncertainty n/a";
    const action =
      item.recommendation?.label || item.recommendation?.action_id || "—";
    const mag =
      item.magnitude_percent != null
        ? `, ${Math.round(item.magnitude_percent)}% above threshold`
        : "";
    const finding = item.investigation_findings?.[0];
    return (
      `${item.district}: ${item.status || "—"}${mag}; ${unc}; suggested ${action}` +
      (finding ? ` — ${finding}` : ".")
    );
  });

  const tradeoffs = candidates.map((item) => {
    const band = item.uncertainty?.band || "moderate";
    return (
      `Attending ${item.district} first: aligns with ${item.status || "current status"}` +
      ` and ${item.recommendation?.label || "catalog action"}, but ${band} uncertainty` +
      ` may waste attention if verification fails.`
    );
  });

  const reasons = [];
  const highUnc = candidates.filter(
    (c) => String(c.uncertainty?.band) === "high"
  );
  if (highUnc.length) {
    reasons.push(
      `High uncertainty in ${highUnc.map((c) => c.district).join(", ")} can make an "obvious" first pick misleading.`
    );
  }
  const caution = candidates.filter((c) => c.local_outcome_feedback?.caution);
  if (caution.length) {
    reasons.push(
      `Local false-alarm feedback cautions escalation urgency for ${caution
        .map((c) => c.district)
        .join(", ")}.`
    );
  }
  if (!reasons.length) {
    reasons.push(
      "Even when exceedance looks clearer in one district, local verification can reverse relative priority."
    );
  }

  const rankingChecks = [
    "Would confirming reporting completeness reverse who looks most urgent?",
    "If next week's observed cases fall below expected in the current 1st pick, would you reprioritize?",
    "Does any district have missing local context (campaigns, movement) that the pack cannot see?",
  ];

  const summary = names.length
    ? `Contrast ${names.join(", ")} on alert status, exceedance, uncertainty, and suggested actions — without ranking them. You still assign priority.`
    : "Select 2–3 districts to contrast structured alert evidence.";

  return {
    available: false,
    grounded: true,
    source: "fallback",
    interaction: "compare",
    compare_interpret: {
      summary,
      contrasts,
    },
    compare_deliberate: {
      priority_tradeoffs: tradeoffs,
    },
    challenge: {
      summary: reasons[0],
      reasons_to_question: reasons.slice(0, 4),
      what_would_reduce_uncertainty: rankingChecks,
    },
    what_could_change_decision: rankingChecks,
    summary,
    bullets: contrasts,
    questions: rankingChecks,
    options: [],
    evidence_refs: ["candidates"],
  };
}
