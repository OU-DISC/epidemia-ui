import { findDistrictFromLookup } from "./districtNameMatch";

/** R overview map colors map to numeric levels for choropleth encoding. */
export const ALERT_LEVEL_COLORS = {
  High: "#d7301f",
  Medium: "#fc8d59",
  Low: "#b8d6fd",
  none: "#f5f5f5",
};

const LEVEL_TO_VALUE = {
  High: 3,
  Medium: 2,
  Low: 1,
};

function levelValue(level) {
  return LEVEL_TO_VALUE[level] ?? 0;
}

/**
 * Build a district-name keyed surface for ED or EW summary alert levels.
 * Values: 3=High, 2=Medium, 1=Low, 0=No data (not modeled).
 */
export function buildAlertLevelSurface(alerts, adm3Lookup, species, levelField) {
  const surface = {};
  if (!alerts?.length) return surface;

  alerts
    .filter((alert) => alert.species === species)
    .forEach((alert) => {
      const feature = findDistrictFromLookup(adm3Lookup, alert.district);
      const mapName = feature?.properties?.adm3_name || alert.district;
      const value = levelValue(alert[levelField]);
      surface[mapName] = value;
      surface[alert.district] = value;
    });

  return surface;
}

export function alertLevelLabel(value) {
  if (value >= 3) return "High";
  if (value >= 2) return "Medium";
  if (value >= 1) return "Low";
  return "No Data";
}
