export const DASHBOARD_HELP = {
  disease:
    "Switch between P. falciparum and P. vivax forecasts, alerts, and map markers.",
  country: "Select the country context for the dashboard view.",
  region:
    "Filter the map and district lists to one admin region, or show all of Ethiopia.",
  district:
    "Focus charts and map selection on one district, or view all districts.",
  forecastWeeks: "Number of future weeks shown in forecasts. After Refresh Forecast, 4-, 8-, and 12-week results are cached; switching here loads instantly without re-running the pipeline.",
  refreshForecast:
    "Re-run the EPIDEMIA pipeline for the selected district's region (toolbar region is set automatically when you pick a district), then merge into the cached national report.",
  exportReport:
    "Download the EPIDEMIA PDF report. Use Report scope to limit geography; use Woreda pages to skip or reduce per-district chart pages for faster exports.",
  newProject:
    "Upload epidemiology CSV data, validate columns, and run your first forecast.",

  pipeline:
    "Shows whether forecast data is loading, ready, running, or encountered an error.",
  earlyWarnings:
    "Districts with one or more forecast weeks above the Farrington alert threshold (early warning period).",
  earlyDetections:
    "Districts with one or more observed weeks above the Farrington alert threshold in the last 4 epidemiology weeks.",
  districtsModeled: "Number of districts included in the current forecast run.",
  regionalAlertSummary:
    "Districts with Medium or High Early Detection or Early Warning levels, grouped by admin region.",

  decisionLayers:
    "Toggle alert markers on the map and replay how warnings and detections changed over time.",
  earlyWarningLayer:
    "Show high-priority warning markers on districts with elevated forecast risk.",
  alertHistory:
    "Replay how alerts changed over recent weeks using observed case history.",

  alertLayers:
    "Toggle Early Warning and Early Detection overlays on the map. Use alert history to replay how alerts changed week by week.",
  districtLayers:
    "Map controls for choropleth or satellite base layers, plus alert overlays.",
  mapSurfaceLayer:
    "Choose one map base layer: health data (incidence or population) or satellite imagery (rainfall, temperature, or vegetation). Only one is shown at a time.",
  weatherDataset:
    "Environmental variable for the weather time series chart. Choose precipitation, temperature, vegetation, or moisture indices.",
  healthLayer:
    "Population or average weekly malaria incidence over the selected date range.",
  envLayers:
    "Satellite time controls when a rainfall, temperature, or vegetation map layer is selected.",
  envDateRange:
    "Start and end dates filter map layers, environmental charts, transmission forecast charts, and alert history replay.",
  envTime:
    "Animate environmental layers week by week, or average them over the date range.",

  chartsTab:
    "Environmental and transmission charts for the selected district.",
  tableTab:
    "Sortable district alerts with 8-week case sparklines and priority highlighting. Click rows to compare up to three districts in the chart below.",
  aboutTab:
    "Plain-language overview of EPIDEMIA, how alerts work, and how to use the dashboard.",

  districtInsight:
    "Charts and metrics for the district selected in the toolbar or on the map.",
};
