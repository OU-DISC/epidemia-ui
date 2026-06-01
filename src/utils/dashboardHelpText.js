export const DASHBOARD_HELP = {
  disease:
    "Switch between P. falciparum and P. vivax forecasts, alerts, and map markers.",
  country: "Select the country context for the dashboard view.",
  region:
    "Filter the map and district lists to one admin region, or show all of Ethiopia.",
  district:
    "Focus charts and map selection on one district, or view all districts.",
  forecastWeeks: "Number of future weeks included in the transmission forecast.",
  refreshForecast:
    "Re-run the EPIDEMIA pipeline for the selected district's region (toolbar region is set automatically when you pick a district), then merge into the cached national report.",
  exportReport:
    "Download a multi-page PDF with summary, map snapshot, alert table, and charts.",
  newProject:
    "Upload epidemiology CSV data, validate columns, and run your first forecast.",

  pipeline:
    "Shows whether forecast data is loading, ready, running, or encountered an error.",
  earlyWarnings:
    "Districts with one or more forecast weeks above the Farrington alert threshold (early warning period).",
  earlyDetections:
    "Districts with one or more observed weeks above the Farrington alert threshold in the last 4 epidemiology weeks.",
  districtsModeled: "Number of districts included in the current forecast run.",

  decisionLayers:
    "Toggle alert markers on the map and replay how warnings and detections changed over time.",
  earlyWarningLayer:
    "Show high-priority warning markers on districts with elevated forecast risk.",
  alertHistory:
    "Replay how alerts changed over recent weeks using observed case history.",

  districtLayers:
    "Map controls for health choropleth shading, weather context, and alert overlays.",
  weatherDataset:
    "Environmental variable used in the district time-series chart on the right.",
  healthLayer:
    "Choropleth shading on the map: population or malaria incidence rate.",

  envLayers:
    "Overlay rainfall, temperature, or vegetation rasters on the map for context.",
  envDateRange:
    "Start and end dates filter map layers, environmental charts, transmission forecast charts, and alert history replay.",
  envTime:
    "Animate environmental layers week by week, or average them over the date range.",

  chartsTab:
    "Environmental and transmission charts for the selected district.",
  tableTab:
    "Sortable district alerts with priority highlighting. Click rows to compare up to three districts in the chart below.",

  districtInsight:
    "Charts and metrics for the district selected in the toolbar or on the map.",
};
