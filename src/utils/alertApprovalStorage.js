import { judgmentStorageKey } from "./decisionJudgmentStorage";

const STORAGE_KEY = "epidemia.alertApprovals.v1";

export const ALERT_APPROVAL = {
  PENDING: "pending",
  APPROVED: "approved",
  HELD: "held",
};

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

export function loadAlertApproval(districtKey, species) {
  const record = loadAll()[judgmentStorageKey(districtKey, species)];
  if (!record) {
    return {
      status: ALERT_APPROVAL.PENDING,
      note: "",
      updatedAt: null,
      isDefault: true,
    };
  }
  return { ...record, isDefault: false };
}

export function saveAlertApproval(districtKey, species, payload) {
  if (!canUseStorage() || !districtKey || !species || !payload?.status) return null;
  const key = judgmentStorageKey(districtKey, species);
  const all = loadAll();
  const record = {
    status: payload.status,
    note: String(payload.note || "").trim(),
    districtKey,
    species,
    updatedAt: new Date().toISOString(),
  };
  all[key] = record;
  saveAll(all);
  return record;
}

export function clearAlertApproval(districtKey, species) {
  if (!canUseStorage() || !districtKey || !species) return;
  const key = judgmentStorageKey(districtKey, species);
  const all = loadAll();
  if (!(key in all)) return;
  delete all[key];
  saveAll(all);
}

export function isOperationallyApproved(districtKey, species) {
  return loadAlertApproval(districtKey, species).status === ALERT_APPROVAL.APPROVED;
}
