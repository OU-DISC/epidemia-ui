export const DASHBOARD_HELP = {
  disease:
    "Switch between P. falciparum and P. vivax forecasts, alerts, and map markers.",
  country: "Select the country context for the dashboard view.",
  region:
    "Filter the map and district lists to one admin region, or show all of Amhara.",
  district:
    "Focus charts and map selection on one district, or view all districts.",
  forecastWeeks: "Number of future weeks included in the transmission forecast.",
  refreshForecast:
    "Re-run the EPIDEMIA pipeline with the latest project data and refresh alerts.",
  exportReport:
    "Download a multi-page PDF with summary, map snapshot, alert table, and charts.",
  newProject:
    "Upload epidemiology CSV data, validate columns, and run your first forecast.",

  pipeline:
    "Shows whether forecast data is loading, ready, running, or encountered an error.",
  earlyWarnings:
    "Districts where the latest forecast exceeds the early warning threshold.",
  earlyDetections:
    "Districts where the forecast exceeds the detection threshold but not warning.",
  districtsModeled: "Number of districts included in the current forecast run.",

  decisionLayers:
    "Toggle alert markers on the map and replay how warnings and detections changed over time.",
  earlyWarningLayer:
    "Show high-priority warning markers on districts with elevated forecast risk.",
  earlyDetectionLayer:
    "Show detection markers for districts above the lower alert threshold.",
  alertHistory:
    "Replay how alerts changed over recent weeks using observed case history.",

  districtLayers:
    "Map controls for health choropleth shading, weather context, and alert overlays.",
  weatherDataset:
    "Environmental variable used in the district time-series chart on the right.",
  healthLayer:
    "Choropleth shading on the map: population or malaria incident rate.",

  envLayers:
    "Overlay rainfall, temperature, or vegetation rasters on the map for context.",
  envTime:
    "Animate environmental layers week by week, or average them over the date range.",

  chartsTab:
    "Environmental and transmission charts for the selected district.",
  tableTab:
    "Sortable district alerts with priority highlighting. Click rows to compare up to three districts in the chart below.",

  districtInsight:
    "Charts and metrics for the district selected in the toolbar or on the map.",
};
