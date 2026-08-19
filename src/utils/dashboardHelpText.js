export const DASHBOARD_HELP = {
  disease:
    "Switch between P. falciparum and P. vivax forecasts, alerts, and map markers.",
  country: "Select the country context for the dashboard view.",
  region:
    "Filter the map and district lists to one admin region, or show all of Ethiopia.",
  district:
    "Focus charts and map selection on one district, or view all districts.",
  forecastWeeks: "Number of future weeks shown in forecasts. After Refresh Forecast, a long horizon (e.g. 26 weeks) is cached; shorter selections (4–20 weeks) load from that cache without re-running the pipeline.",
  forecastValueMode:
    "Show weekly case counts or incidence per 100,000 population on the forecast chart, table, comparison chart, and PDF control charts. Alerts still use the underlying count-based pipeline.",
  seasonalContext:
    "Shows where the latest observed week sits in the district's seasonal cycle. The ring colors typical transmission by epidemiological week (1–52). Center text compares observed cases to the seasonal GAM expectation for this week.",
  refreshForecast:
    "Re-run the EPIDEMIA pipeline for the selected district's region (toolbar region is set automatically when you pick a district), then merge into the cached national report.",
  exportReport:
    "Download the EPIDEMIA PDF report. Use Report scope to limit geography; use Woreda pages to skip or reduce per-district chart pages for faster exports.",
  newProject:
    "Upload epidemiology CSV data, validate columns, and run your first forecast.",

  pipeline:
    "Forecast data status: loading, ready, running, or error. Shows when the cache was last generated, district count, and background pipeline progress when a refresh is running on the server.",
  earlyWarnings:
    "Districts with one or more forecast weeks above the seasonal expected level (early warning period).",
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
    "Early Warning (⚠️) = forecast weeks exceeding the seasonal GAM expected level — future risk signal. Early Detection (🔍) = observed weeks exceeding the Farrington threshold — confirmed outbreak signal. These are separate; a district can have one, both, or neither. Use 'Active' to see the current week, or 'Historical' to replay how alerts evolved. The map choropleth shows incidence rate (cases per 100k population) — a separate measure from alert status.",
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
    "Start and end epiweeks (ISO week labels as used in PHEM surveillance) filter map layers, environmental charts, transmission forecast charts, and alert history replay. Calendar week-start dates are shown under each selector.",
  envTime:
    "Animate environmental layers week by week, or average them over the date range.",

  chartsTab:
    "Environmental and transmission charts for the selected district.",
  tableTab:
    "Sortable district alerts with 8-week case sparklines and priority highlighting. Click rows to compare up to three districts in the chart below. In the EDI study arm, use Evaluate priority under the chart to rank districts and justify who gets attention first.",
  comparisonPriority:
    "Evaluative comparison: after selecting 2–3 districts, read Interpret / Deliberate / Challenge (contrast and caveats — the system does not rank), then set priority (1st/2nd/3rd) and justify who gets attention first. Hidden in the Baseline study arm.",
  ediDeliberation:
    "Structured deliberative brief over a district evidence pack: options, evidence, what could change, and Challenge (on-demand counter-arguments for when to question or override). Recommended is marked from the rule-based policy. You still Confirm or Save override.",
  decisionTab:
    "Review alert rationale, residual uncertainty, and deliberative Options/Evidence/Challenge. Confirm, override, or annotate—judgments are saved in this browser. Hidden in the study Baseline arm (?condition=baseline).",
  aboutTab:
    "Plain-language overview of EPIDEMIA, how alerts work, and how to use the dashboard.",

  districtInsight:
    "Charts and metrics for the district selected in the toolbar or on the map.",
  currentSituation:
    "Visual readout of alert status, recent case evidence, and near-term forecast for the current map and toolbar selection. Alert dots = last 4 observed weeks in the early-detection window: red when cases exceeded the detection threshold that week. Forecast shows observed vs projected cases only.",
  decisionPanel:
    "Review why an alert was raised, residual uncertainty, and deliberative options—including Challenge this assessment for calibrated skepticism. Confirm, override, or annotate. Outcome feedback and operational approval keep humans in the loop.",
  decisionOutcome:
    "Mark whether this alert was a true alarm, false alarm, or still unclear. Feedback is stored locally and can dampen later escalation recommendations for this district—it does not retrain the forecast model.",
  decisionApproval:
    "Operational release gate: Approve before confirming stronger actions, or Hold to keep the alert from operational use. Pending alerts are not treated as released for intervention planning.",
  alertExplanationCard:
    "Structured evidence for why this district is Early Warning, Early Detection, or Normal (weeks over threshold, magnitude, persistence). When deliberative explain is on, a grounded LLM rewrites that evidence for readability—it does not decide; confirm/override remains yours.",
  decisionUncertaintyChart:
    "Shows recent observed cases versus expected (detection) levels—the seasonal baseline—plus residuals on the right axis and the near-term forecast with an approximate 80% residual PI. This is not the warning threshold line on the Charts tab.",
  decisionAnnotate:
    "Optional note for context the model cannot see (reporting delays, recent campaigns, population movement). Saved with your confirm or override judgment.",
};
