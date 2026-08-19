/** Operational actions offered in the Decision Panel. */
export const DECISION_ACTIONS = [
  {
    id: "monitor",
    label: "Continue routine monitoring",
    shortLabel: "Monitor",
    description: "No escalation needed; keep watching routine surveillance signals.",
  },
  {
    id: "watch",
    label: "Monitor closely",
    shortLabel: "Watch closely",
    description: "Increase attention this week; re-check next report before escalating.",
  },
  {
    id: "investigate",
    label: "Investigate locally",
    shortLabel: "Investigate",
    description: "Verify cases, reporting completeness, and local transmission context.",
  },
  {
    id: "escalate",
    label: "Escalate for intervention planning",
    shortLabel: "Escalate",
    description: "Prioritize for briefing and consider targeted response options.",
  },
];

const ACTION_BY_ID = Object.fromEntries(DECISION_ACTIONS.map((action) => [action.id, action]));

/** ~2 years of weekly history for residual estimation. */
const RESIDUAL_LOOKBACK_WEEKS = 104;
const MIN_RESIDUAL_SAMPLES = 8;
/** z for approximate two-sided 80% normal predictive interval. */
const Z_80 = 1.28;

export function getDecisionAction(actionId) {
  return ACTION_BY_ID[actionId] || null;
}

function levelRank(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "high") return 3;
  if (normalized === "medium") return 2;
  if (normalized === "low") return 1;
  return 0;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStd(values) {
  if (values.length < 2) return null;
  const avg = mean(values);
  if (avg == null) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(variance, 0));
}

function formatCases(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Derive a recommended action + rationale from alert status and evidence strength.
 */
export function buildDecisionRecommendation({
  status = "Normal",
  ewLevel = "Low",
  edLevel = "Low",
  ewAlertCount = 0,
  edAlertCount = 0,
  magnitudePercent = null,
  persistenceWeeks = 0,
  uncertaintyLevel = "moderate",
  /** From human outcome feedback — dampens escalation; does not retrain the forecast model. */
  outcomeCaution = false,
  /** Operational release gate: unapproved alerts should not auto-escalate. */
  operationalApproved = true,
} = {}) {
  const mag = Number.isFinite(Number(magnitudePercent)) ? Number(magnitudePercent) : 0;
  const persist = Number.isFinite(Number(persistenceWeeks)) ? Number(persistenceWeeks) : 0;
  const strongEvidence =
    uncertaintyLevel === "low" && (mag >= 15 || persist >= 3 || levelRank(ewLevel) >= 3);
  const weakEvidence = uncertaintyLevel === "high";

  let actionId = "monitor";
  let rationale = "Transmission appears within expected levels.";

  if (status === "Early Warning") {
    if (levelRank(ewLevel) >= 3 || ewAlertCount >= 3 || mag >= 25 || persist >= 4) {
      actionId = weakEvidence ? "investigate" : "escalate";
      rationale = weakEvidence
        ? "Early warning is elevated, but forecast uncertainty is high—verify before full escalation."
        : "Early warning shows a sustained exceedance of expected levels.";
    } else if (levelRank(ewLevel) >= 2 || ewAlertCount >= 2 || mag >= 10 || persist >= 2) {
      actionId = weakEvidence ? "watch" : "investigate";
      rationale = "Early warning suggests rising risk that warrants local investigation.";
    } else {
      actionId = "watch";
      rationale = "Early warning is present at a modest level; monitor closely this week.";
    }
  } else if (status === "Early Detection") {
    if (levelRank(edLevel) >= 3 || edAlertCount >= 3) {
      actionId = "investigate";
      rationale =
        "Recent observed weeks exceeded the detection threshold; verify surveillance and local context.";
    } else {
      actionId = weakEvidence ? "watch" : "investigate";
      rationale =
        "Early detection indicates unusual recent observations that should be checked locally.";
    }
  } else if (strongEvidence && mag > 0) {
    actionId = "watch";
    rationale = "No alert, but nearby threshold pressure suggests continued close monitoring.";
  }

  if (outcomeCaution && (actionId === "escalate" || actionId === "investigate")) {
    if (actionId === "escalate") actionId = "investigate";
    else if (actionId === "investigate") actionId = "watch";
    rationale = `${rationale} Human feedback recently marked alerts here as false alarms—verify before stronger action.`;
  }

  if (
    !operationalApproved &&
    status !== "Normal" &&
    (actionId === "escalate" || actionId === "investigate")
  ) {
    actionId = actionId === "escalate" ? "investigate" : "watch";
    rationale = `${rationale} This alert is not yet approved for operational release.`;
  }

  const action = getDecisionAction(actionId);
  return {
    actionId,
    label: action?.label || actionId,
    shortLabel: action?.shortLabel || actionId,
    description: action?.description || "",
    rationale,
    evidenceStrength:
      uncertaintyLevel === "high" || outcomeCaution
        ? "weak"
        : uncertaintyLevel === "low"
        ? "strong"
        : "moderate",
    outcomeCaution: Boolean(outcomeCaution),
    operationalApproved: Boolean(operationalApproved),
  };
}

/**
 * Tie residual uncertainty to the recommended action (DG2 / F2).
 * Returns a short implication officers can use when confirming or overriding.
 */
export function buildUncertaintyActionCue(uncertainty = {}, recommendation = {}) {
  const level = uncertainty?.level || "moderate";
  const label = uncertainty?.label || "Uncertainty";
  const unavailable =
    !uncertainty?.method ||
    label === "Uncertainty unavailable" ||
    uncertainty?.residualSd == null;
  const actionId = recommendation?.actionId || "monitor";

  let implication;
  if (unavailable) {
    implication =
      "Uncertainty could not be estimated from recent history—confirm with local knowledge before acting.";
  } else if (level === "high") {
    if (actionId === "escalate") {
      implication =
        "High uncertainty: verify the signal locally before full escalation.";
    } else if (actionId === "investigate") {
      implication =
        "High uncertainty: use investigation to confirm the signal before intervening.";
    } else if (actionId === "watch") {
      implication =
        "High uncertainty: keep close watch; avoid escalating on the forecast alone.";
    } else {
      implication =
        "High uncertainty: routine monitoring is appropriate until the signal is clearer.";
    }
  } else if (level === "low") {
    if (actionId === "escalate" || actionId === "investigate") {
      implication =
        "Lower uncertainty: residual history supports acting on this recommendation.";
    } else {
      implication =
        "Lower uncertainty: the forecast band is relatively tight around the recommendation.";
    }
  } else if (actionId === "escalate") {
    implication =
      "Moderate uncertainty: escalate with a check on reporting completeness and local context.";
  } else if (actionId === "investigate" || actionId === "watch") {
    implication =
      "Moderate uncertainty: weigh this recommendation with local knowledge before intervening.";
  } else {
    implication =
      "Moderate uncertainty: continue routine monitoring and re-check next week.";
  }

  return {
    level: unavailable ? "unavailable" : level,
    label: unavailable ? "Uncertainty unavailable" : label,
    implication,
    detail: uncertainty?.detail || "",
    halfWidth80: uncertainty?.halfWidth80 ?? null,
  };
}

/**
 * Real uncertainty cue from historical forecast residuals.
 *
 * residual = observed − expected (detection / seasonal expected level)
 * relativeSd = residualSd / max(mean near-term forecast, mean recent observed, 1)
 * Approximate 80% half-width = 1.28 × residualSd
 *
 * Accepts either:
 *   buildUncertaintyCue({ forecastPoints, observedHistory })
 *   buildUncertaintyCue(forecastPoints) // legacy; returns unavailable without history
 */
export function buildUncertaintyCue(forecastPointsOrOptions = [], maybeObserved) {
  const options = Array.isArray(forecastPointsOrOptions)
    ? {
        forecastPoints: forecastPointsOrOptions,
        observedHistory: maybeObserved || [],
      }
    : forecastPointsOrOptions || {};

  const forecastPoints = options.forecastPoints || [];
  const observedHistory = options.observedHistory || [];

  const recentHistory = observedHistory.slice(-RESIDUAL_LOOKBACK_WEEKS);
  const residuals = [];
  const recentObserved = [];

  recentHistory.forEach((point) => {
    const observed = finiteNumber(point?.observed);
    const expected = finiteNumber(
      point?.detection_threshold ?? point?.detectionThreshold ?? point?.expected
    );
    if (observed != null) recentObserved.push(observed);
    if (observed != null && expected != null) {
      residuals.push(observed - expected);
    }
  });

  let residualSd = sampleStd(residuals);
  let method = "historical_residual_sd";
  let sampleCount = residuals.length;

  // Fallback: dispersion of recent observed counts when expected levels are missing.
  if ((residualSd == null || sampleCount < MIN_RESIDUAL_SAMPLES) && recentObserved.length >= MIN_RESIDUAL_SAMPLES) {
    residualSd = sampleStd(recentObserved);
    method = "historical_observed_sd";
    sampleCount = recentObserved.length;
  }

  if (residualSd == null || sampleCount < MIN_RESIDUAL_SAMPLES) {
    return {
      level: "moderate",
      label: "Uncertainty unavailable",
      detail:
        "Not enough recent history to estimate forecast residual uncertainty for this district.",
      residualSd: null,
      relativeSd: null,
      halfWidth80: null,
      method: null,
      sampleCount: sampleCount || 0,
    };
  }

  const forecastMedians = (forecastPoints || [])
    .map((point) => finiteNumber(point?.median))
    .filter((value) => value != null);
  const meanForecast = mean(forecastMedians);
  const meanRecentObserved = mean(recentObserved);
  const scale = Math.max(meanForecast ?? 0, meanRecentObserved ?? 0, 1);
  const relativeSd = residualSd / scale;
  const halfWidth80 = Z_80 * residualSd;

  // Calibrated on current national cache: ~p25 / ~p60 of residual CV.
  let level = "moderate";
  let label = "Moderate uncertainty";
  if (relativeSd >= 1.5) {
    level = "high";
    label = "High uncertainty";
  } else if (relativeSd <= 0.45) {
    level = "low";
    label = "Lower uncertainty";
  }

  const sourceLabel =
    method === "historical_residual_sd"
      ? "historical residual SD (observed − expected)"
      : "historical SD of observed cases";

  return {
    level,
    label,
    detail: `${sourceLabel}: ${formatCases(residualSd, 1)} cases (~±${formatCases(
      halfWidth80,
      1
    )} at 80%). About ${(relativeSd * 100).toFixed(0)}% of recent case/forecast level (n=${sampleCount}).`,
    residualSd,
    relativeSd,
    halfWidth80,
    method,
    sampleCount,
    scale,
  };
}
