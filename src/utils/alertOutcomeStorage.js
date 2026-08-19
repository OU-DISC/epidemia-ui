import { judgmentStorageKey } from "./decisionJudgmentStorage";

const STORAGE_KEY = "epidemia.alertOutcomes.v1";
const MAX_HISTORY = 12;

export const ALERT_OUTCOMES = [
  {
    id: "true_alarm",
    label: "Useful / true alarm",
    shortLabel: "True alarm",
    description: "The alert correctly pointed to unusual risk worth attention.",
  },
  {
    id: "false_alarm",
    label: "False alarm",
    shortLabel: "False alarm",
    description: "The alert overstated risk relative to what unfolded locally.",
  },
  {
    id: "unclear",
    label: "Too early / unclear",
    shortLabel: "Unclear",
    description: "Not enough follow-up yet to judge the alert.",
  },
];

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadAll() {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(all) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function loadAlertOutcomes(districtKey, species) {
  const record = loadAll()[judgmentStorageKey(districtKey, species)];
  return Array.isArray(record?.history) ? record.history : [];
}

export function loadLatestAlertOutcome(districtKey, species) {
  const history = loadAlertOutcomes(districtKey, species);
  return history[0] || null;
}

/**
 * Summarize recent feedback for decision-layer caution (not model retraining).
 */
export function summarizeAlertOutcomeFeedback(districtKey, species, lookback = 5) {
  const recent = loadAlertOutcomes(districtKey, species).slice(0, lookback);
  const falseAlarms = recent.filter((item) => item.outcome === "false_alarm").length;
  const trueAlarms = recent.filter((item) => item.outcome === "true_alarm").length;
  const caution = falseAlarms >= 2 || (falseAlarms >= 1 && trueAlarms === 0 && recent.length >= 1);

  let biasLabel = null;
  if (caution) {
    biasLabel = `${falseAlarms} recent false-alarm mark${falseAlarms === 1 ? "" : "s"} — treat escalation cautiously`;
  } else if (trueAlarms >= 2) {
    biasLabel = `${trueAlarms} recent true-alarm marks — prior alerts were useful here`;
  }

  return {
    recent,
    falseAlarms,
    trueAlarms,
    caution,
    biasLabel,
    sampleCount: recent.length,
  };
}

export function saveAlertOutcome(districtKey, species, payload) {
  if (!canUseStorage() || !districtKey || !species || !payload?.outcome) return null;
  const key = judgmentStorageKey(districtKey, species);
  const all = loadAll();
  const prev = all[key]?.history || [];
  const entry = {
    outcome: payload.outcome,
    note: String(payload.note || "").trim(),
    status: payload.status || null,
    recommendedActionId: payload.recommendedActionId || null,
    updatedAt: new Date().toISOString(),
  };
  const history = [entry, ...prev].slice(0, MAX_HISTORY);
  all[key] = { districtKey, species, history, updatedAt: entry.updatedAt };
  saveAll(all);
  return entry;
}

export function clearAlertOutcomes(districtKey, species) {
  if (!canUseStorage() || !districtKey || !species) return;
  const key = judgmentStorageKey(districtKey, species);
  const all = loadAll();
  if (!(key in all)) return;
  delete all[key];
  saveAll(all);
}

export function getAlertOutcomeMeta(outcomeId) {
  return ALERT_OUTCOMES.find((item) => item.id === outcomeId) || null;
}
