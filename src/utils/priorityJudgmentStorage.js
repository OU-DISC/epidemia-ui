const STORAGE_KEY = "epidemia.priorityJudgments.v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Stable key for a ranked set of districts + species. */
export function priorityStorageKey(districtNames = [], species = "") {
  const districts = [...districtNames]
    .map((name) => String(name || "").trim().toLowerCase())
    .filter(Boolean)
    .sort();
  const sp = String(species || "")
    .trim()
    .toLowerCase();
  return `${sp}::${districts.join("|")}`;
}

export function loadAllPriorityJudgments() {
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

export function loadPriorityJudgment(districtNames, species) {
  const all = loadAllPriorityJudgments();
  return all[priorityStorageKey(districtNames, species)] || null;
}

export function savePriorityJudgment(districtNames, species, judgment) {
  if (!canUseStorage() || !species) return null;
  const names = [...districtNames].filter(Boolean);
  if (names.length < 2) return null;
  const key = priorityStorageKey(names, species);
  const all = loadAllPriorityJudgments();
  const record = {
    ...judgment,
    districtNames: names,
    species,
    updatedAt: new Date().toISOString(),
  };
  all[key] = record;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return record;
}

export function clearPriorityJudgment(districtNames, species) {
  if (!canUseStorage() || !species) return;
  const key = priorityStorageKey(districtNames, species);
  const all = loadAllPriorityJudgments();
  if (!(key in all)) return;
  delete all[key];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
