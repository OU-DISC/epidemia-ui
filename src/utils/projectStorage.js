const STORAGE_KEY = "epidemia.project.config.v1";

export function loadProjectConfig() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProjectConfig(config) {
  if (typeof window === "undefined" || !config) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearProjectConfig() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function speciesToDisease(species) {
  return species === "pv"
    ? "Plasmodium vivax malaria"
    : "Plasmodium falciparum malaria";
}

export function diseaseToSpecies(disease) {
  return disease === "Plasmodium vivax malaria" ? "pv" : "pfm";
}
