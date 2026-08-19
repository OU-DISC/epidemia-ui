const STORAGE_KEY = "epidemia.decisionJudgments.v1";
const MAX_HISTORY = 12;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function judgmentStorageKey(districtKey, species) {
  const district = String(districtKey || "")
    .trim()
    .toLowerCase();
  const sp = String(species || "")
    .trim()
    .toLowerCase();
  return `${sp}::${district}`;
}

export function loadAllDecisionJudgments() {
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

function normalizeRecord(record) {
  if (!record || typeof record !== "object") return null;
  const history = Array.isArray(record.history)
    ? record.history
    : record.updatedAt
    ? [
        {
          judgment: record.judgment,
          recommendedActionId: record.recommendedActionId,
          chosenActionId: record.chosenActionId,
          annotation: record.annotation || "",
          status: record.status,
          evidenceStrength: record.evidenceStrength,
          updatedAt: record.updatedAt,
        },
      ]
    : [];
  return { ...record, history };
}

export function loadDecisionJudgment(districtKey, species) {
  const all = loadAllDecisionJudgments();
  return normalizeRecord(all[judgmentStorageKey(districtKey, species)]);
}

/** Prior judgments newest-first (excludes the current/latest entry at index 0). */
export function loadPriorDecisionJudgments(districtKey, species) {
  const record = loadDecisionJudgment(districtKey, species);
  if (!record?.history?.length) return [];
  return record.history.slice(1);
}

export function formatJudgmentMemoryLine(entry, actionLabel = null) {
  if (!entry) return null;
  const action = actionLabel || entry.chosenActionId || "an alternate action";
  const when = entry.updatedAt
    ? new Date(entry.updatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "previously";
  if (entry.judgment === "overridden") {
    const note = entry.annotation ? ` because “${entry.annotation}”` : "";
    return `You overrode to ${action} (${when})${note}.`;
  }
  if (entry.judgment === "confirmed") {
    const note = entry.annotation ? ` — “${entry.annotation}”` : "";
    return `You confirmed ${action} (${when})${note}.`;
  }
  return `Prior judgment: ${action} (${when}).`;
}

export function saveDecisionJudgment(districtKey, species, judgment) {
  if (!canUseStorage() || !districtKey || !species) return null;
  const key = judgmentStorageKey(districtKey, species);
  const all = loadAllDecisionJudgments();
  const existing = normalizeRecord(all[key]) || { history: [] };
  const entry = {
    judgment: judgment.judgment,
    recommendedActionId: judgment.recommendedActionId,
    chosenActionId: judgment.chosenActionId,
    annotation: judgment.annotation || "",
    status: judgment.status,
    evidenceStrength: judgment.evidenceStrength,
    updatedAt: new Date().toISOString(),
  };
  const history = [entry, ...(existing.history || [])].slice(0, MAX_HISTORY);
  const record = {
    ...judgment,
    ...entry,
    districtKey,
    species,
    history,
    updatedAt: entry.updatedAt,
  };
  all[key] = record;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return record;
}

export function clearDecisionJudgment(districtKey, species) {
  if (!canUseStorage() || !districtKey || !species) return;
  const key = judgmentStorageKey(districtKey, species);
  const all = loadAllDecisionJudgments();
  if (!(key in all)) return;
  delete all[key];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
