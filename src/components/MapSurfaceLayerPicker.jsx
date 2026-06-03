import React from "react";
import HelpTip from "./HelpTip";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";

export const MAP_SURFACE_LAYER_GROUPS = [
  {
    label: "Health data",
    options: [
      { value: "incident_rate", label: "Incidence rate" },
      { value: "population", label: "Population" },
    ],
  },
  {
    label: "Satellite imagery",
    options: [
      { value: "rainfall", label: "Rainfall" },
      { value: "temperature", label: "Temperature" },
      { value: "ndvi", label: "NDVI / Vegetation" },
    ],
  },
];

export const ENV_MAP_SURFACE_LAYERS = new Set(["rainfall", "temperature", "ndvi"]);
export const HEALTH_MAP_SURFACE_LAYERS = new Set(["population", "incident_rate"]);

export function isEnvMapSurfaceLayer(layer) {
  return ENV_MAP_SURFACE_LAYERS.has(layer);
}

export default function MapSurfaceLayerPicker({ value, onChange }) {
  return (
    <label className="map-surface-control map-surface-layer-picker">
      <span className="toolbar-field-label">
        Map layer
        <HelpTip text={DASHBOARD_HELP.mapSurfaceLayer} label="Map layer" />
      </span>
      <select
        className="toolbar-select map-surface-layer-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Map layer (one at a time)"
      >
        {MAP_SURFACE_LAYER_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
