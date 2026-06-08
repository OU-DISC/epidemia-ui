const STORAGE_KEY = "epidemia.project.config.v1";
const PREFER_DEFAULT_KEY = "epidemia.dataset.preferDefault.v1";

function prefersDefaultDataset() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PREFER_DEFAULT_KEY) === "1";
}

function setPreferDefaultDataset() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFER_DEFAULT_KEY, "1");
}

function clearPreferDefaultDataset() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PREFER_DEFAULT_KEY);
}

export function loadProjectConfig() {
  if (typeof window === "undefined") return null;
  if (prefersDefaultDataset()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function hasStoredProjectConfig() {
  if (typeof window === "undefined") return false;
  if (prefersDefaultDataset()) return false;
  return Boolean(window.localStorage.getItem(STORAGE_KEY));
}

export function saveProjectConfig(config) {
  if (typeof window === "undefined" || !config) return;
  clearPreferDefaultDataset();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearProjectConfig() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Switch back to the national default dataset and remember that choice across reloads. */
export function activateDefaultDataset() {
  clearProjectConfig();
  setPreferDefaultDataset();
}

export function speciesToDisease(species) {
  return species === "pv"
    ? "Plasmodium vivax malaria"
    : "Plasmodium falciparum malaria";
}

export function diseaseToSpecies(disease) {
  return disease === "Plasmodium vivax malaria" ? "pv" : "pfm";
}
