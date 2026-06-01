function formatNumber(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function formatPopulation(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatDistrictTooltipHtml({
  region,
  district,
  population,
  cases,
  populationYear,
}) {
  const populationLabel =
    population != null
      ? `${formatPopulation(population)}${populationYear ? ` (WorldPop ${populationYear})` : ""}`
      : "—";
  const casesLabel = cases != null ? formatNumber(cases, 0) : "—";

  return `
    <div class="district-info-tooltip">
      <div class="district-info-tooltip-row">
        <span>Region</span>
        <strong>${escapeHtml(region || "—")}</strong>
      </div>
      <div class="district-info-tooltip-row">
        <span>District</span>
        <strong>${escapeHtml(district || "—")}</strong>
      </div>
      <div class="district-info-tooltip-row">
        <span>Population</span>
        <strong>${escapeHtml(populationLabel)}</strong>
      </div>
      <div class="district-info-tooltip-row">
        <span>Cases</span>
        <strong>${escapeHtml(casesLabel)}</strong>
      </div>
    </div>
  `.trim();
}

export function buildAlertExplanation({
  districtName,
  regionName,
  speciesLabel,
  alert,
  insight,
  population,
  populationYear,
  incidentRate,
}) {
  if (!alert) {
    return {
      status: null,
      summary: `No forecast alert is available for ${districtName} (${speciesLabel}).`,
      bullets: [],
    };
  }

  const status = alert.early_warning
    ? "Early Warning"
    : alert.early_detection
    ? "Early Detection"
    : "Normal";

  const activeThreshold =
    insight?.warningThreshold ?? alert.warning_threshold ?? alert.detection_threshold;
  const latestObserved = insight?.latestObserved ?? alert.latest_observed;
  const latestForecast = insight?.latestForecast ?? alert.latest_forecast;
  const magnitudePercent = insight?.magnitudePercent;
  const persistenceWeeks = insight?.persistenceWeeks ?? 0;
  const edLevel = alert.ed_level;
  const ewLevel = alert.ew_level;

  let summary;
  if (status === "Early Warning") {
    summary = `Early warning: ${alert.ew_alert_count ?? 0} forecast week(s) above threshold (${ewLevel || "Low"}).`;
  } else if (status === "Early Detection") {
    summary = `Early detection: ${alert.ed_alert_count ?? 0} observed week(s) above threshold in the last 4 weeks (${edLevel || "Low"}).`;
  } else {
    summary = "District is within normal transmission levels.";
  }

  const bullets = [];

  if (regionName) {
    bullets.push(`Region: ${regionName}`);
  }

  if (latestObserved != null || latestForecast != null || activeThreshold != null) {
    bullets.push(
      `Observed ${formatNumber(latestObserved)} · Forecast ${formatNumber(latestForecast)} · Threshold ${formatNumber(activeThreshold)}`
    );
  }

  if (magnitudePercent != null && magnitudePercent > 0) {
    bullets.push(`${formatNumber(magnitudePercent, 1)}% above threshold`);
  }

  if (persistenceWeeks > 0) {
    bullets.push(`Above threshold for ${persistenceWeeks} projected week${persistenceWeeks === 1 ? "" : "s"}`);
  }

  if (population != null) {
    bullets.push(
      `Population at risk: ${formatPopulation(population)}${populationYear ? ` (WorldPop ${populationYear})` : ""}`
    );
  }

  if (incidentRate != null) {
    bullets.push(`Incidence rate: ${formatNumber(incidentRate, 1)} per 100,000`);
  }

  return { status, summary, bullets };
}

export function formatAlertTooltipHtml(districtName, explanation, insight) {
  const statusClass =
    explanation.status === "Early Warning"
      ? "alert-map-tooltip-status alert-map-tooltip-status-warning"
      : explanation.status === "Early Detection"
      ? "alert-map-tooltip-status alert-map-tooltip-status-detection"
      : "alert-map-tooltip-status";

  const bullets = explanation.bullets
    .slice(0, 4)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `
    <div class="alert-map-tooltip">
      <div class="alert-map-tooltip-kicker">Why this alert?</div>
      <strong>${escapeHtml(districtName)}</strong>
      ${explanation.status ? `<span class="${statusClass}">${escapeHtml(explanation.status)}</span>` : ""}
      <p>${escapeHtml(explanation.summary)}</p>
      ${
        insight
          ? `<div class="alert-map-tooltip-metrics">Obs ${formatNumber(insight.latestObserved)} · Fc ${formatNumber(insight.latestForecast)} · Thr ${formatNumber(insight.activeThreshold)}</div>`
          : ""
      }
      ${bullets ? `<ul>${bullets}</ul>` : ""}
    </div>
  `.trim();
}
