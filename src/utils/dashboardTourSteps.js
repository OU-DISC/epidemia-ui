/** Interactive dashboard walkthrough steps (highlight + Next / Back / Skip). */

export const DASHBOARD_TOUR_STORAGE_KEY = "epidemia.dashboardTour.v1.completed";

/**
 * @typedef {object} TourStep
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {string} [target] CSS selector for the highlighted element
 * @property {"charts"|"table"|"decision"|"about"|null} [panel] Right-panel tab to open before highlighting
 * @property {"summary"|"map"|"details"|null} [mobileView] Compact-layout view to open
 * @property {"center"|"auto"} [placement] Tooltip placement preference
 */

/** @type {TourStep[]} */
export const DASHBOARD_TOUR_STEPS = [
  {
    id: "welcome",
    title: "Welcome to EPIDEMIA",
    body:
      "This short tour highlights the main parts of the malaria early warning dashboard. Use Next to continue, or Skip anytime to exit.",
    placement: "center",
    panel: "charts",
    mobileView: "map",
  },
  {
    id: "toolbar",
    title: "Choose disease, region, and district",
    body:
      "Use these controls to switch between P. falciparum and P. vivax, filter by admin region, and focus on one district. The map and charts follow your selection.",
    target: '[data-tour="toolbar-context"]',
    placement: "auto",
    mobileView: "map",
  },
  {
    id: "map",
    title: "National map",
    body:
      "The map shows districts across Ethiopia. Click a district to open its charts and details in the right panel. Alert markers help you spot priority areas.",
    target: '[data-tour="map-panel"]',
    placement: "auto",
    mobileView: "map",
  },
  {
    id: "alerts",
    title: "Early Warning and Early Detection",
    body:
      "Toggle Early Warning (forecast above the Farrington alert threshold) and Early Detection (recent observed weeks above the Farrington alert threshold). You can also replay alert history week by week.",
    target: '[data-tour="decision-layers"]',
    placement: "auto",
    mobileView: "map",
  },
  {
    id: "env-layers",
    title: "Map layers and date range",
    body:
      "Choose a health or satellite map layer (incidence, population, rainfall, temperature, vegetation). The date range filters the map, charts, and alert replay together.",
    target: '[data-tour="env-layers"]',
    placement: "auto",
    mobileView: "map",
  },
  {
    id: "charts-tab",
    title: "Charts tab",
    body:
      "Open Charts for the selected district. You will see a transmission forecast and an environmental time series side by side.",
    target: '[data-tour="tab-charts"]',
    panel: "charts",
    placement: "auto",
    mobileView: "details",
  },
  {
    id: "forecast-chart",
    title: "Transmission forecast",
    body:
      "Observed cases, the forecast line and uncertainty band, and the warning threshold appear here. Change the horizon (4–26 weeks) or switch between counts and incidence.",
    target: '[data-tour="forecast-panel"]',
    panel: "charts",
    placement: "auto",
    mobileView: "details",
  },
  {
    id: "env-chart",
    title: "Environmental time series",
    body:
      "Explore rainfall, temperature, vegetation, and related drivers for the selected district. Zoom or change dates—the forecast chart stays in sync.",
    target: '[data-tour="env-chart-panel"]',
    panel: "charts",
    placement: "auto",
    mobileView: "details",
  },
  {
    id: "table-tab",
    title: "Forecast Table",
    body:
      "The table ranks districts by alert priority. Click up to three rows to compare them in the chart below—useful for deciding where to focus first.",
    target: '[data-tour="tab-table"]',
    panel: "table",
    placement: "auto",
    mobileView: "details",
  },
  {
    id: "decision-panel",
    title: "Decision tab",
    body:
      "Open Decision to review alert rationale, uncertainty, and a recommended action. Confirm it, override with another action, or annotate local knowledge—your judgment is saved in this browser.",
    target: '[data-tour="tab-decision"]',
    panel: "decision",
    placement: "auto",
    mobileView: "details",
    /** Hidden when ?condition=baseline (study control arm). */
    ediOnly: true,
  },
  {
    id: "export",
    title: "Export and projects",
    body:
      "Export an EPIDEMIA PDF report for briefings, or start a New Project to upload your own epidemiology data. You can restart this tour anytime from Take a tour.",
    target: '[data-tour="toolbar-actions"]',
    placement: "auto",
    mobileView: "map",
  },
  {
    id: "finish",
    title: "You are ready to explore",
    body:
      "Try selecting a flagged district on the map, then review its forecast and the priority table. Restart the tour anytime with Take a tour in the toolbar.",
    placement: "center",
    panel: "charts",
    mobileView: "map",
  },
];

/** @param {{ ediEnabled?: boolean }} [options] */
export function getDashboardTourSteps({ ediEnabled = true } = {}) {
  return DASHBOARD_TOUR_STEPS.filter((step) => ediEnabled || !step.ediOnly);
}
