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
  casesLabel = "Avg weekly cases",
}) {
  const populationLabel = population != null ? formatPopulation(population) : "—";
  const casesValue = cases != null ? formatNumber(cases, 0) : "—";

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
        <span>${escapeHtml(casesLabel)}</span>
        <strong>${escapeHtml(casesValue)}</strong>
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
    bullets.push(`Population at risk: ${formatPopulation(population)}`);
  }

  if (incidentRate != null) {
    bullets.push(`Average incidence rate: ${formatNumber(incidentRate, 1)} per 100,000`);
  }

  return { status, summary, bullets };
}

function tooltipRow(label, value) {
  if (value == null || value === "" || value === "—") return "";
  return `
    <div class="district-info-tooltip-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

export function formatAlertTooltipHtml(districtName, explanation) {
  const rows = [];

  const regionBullet = explanation.bullets?.find((item) => item.startsWith("Region:"));
  if (regionBullet) {
    rows.push(tooltipRow("Region", regionBullet.replace(/^Region:\s*/, "")));
  }

  rows.push(tooltipRow("District", districtName));

  if (explanation.status) {
    rows.push(tooltipRow("Status", explanation.status));
  }

  const weekBullet = explanation.bullets?.find((item) => item.startsWith("Week of "));
  if (weekBullet) {
    rows.push(tooltipRow("Week", weekBullet.replace(/^Week of\s*/, "")));
  }

  const populationBullet = explanation.bullets?.find((item) =>
    item.startsWith("Population at risk:")
  );
  if (populationBullet) {
    rows.push(tooltipRow("Population", populationBullet.replace(/^Population at risk:\s*/, "")));
  }

  const incidenceBullet = explanation.bullets?.find((item) =>
    item.startsWith("Average incidence rate:")
  );
  if (incidenceBullet) {
    rows.push(tooltipRow("Incidence", incidenceBullet.replace(/^Average incidence rate:\s*/, "")));
  }

  const magnitudeBullet = explanation.bullets?.find((item) => item.includes("% above threshold"));
  if (magnitudeBullet) {
    rows.push(tooltipRow("Above threshold", magnitudeBullet));
  }

  return `<div class="district-info-tooltip">${rows.join("")}</div>`.trim();
}
