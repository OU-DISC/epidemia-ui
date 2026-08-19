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

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pointDate(point) {
  return point?.week_start || point?.date || null;
}

function formatWeekLabel(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function exceedsThreshold(value, warningThreshold, detectionThreshold) {
  if (value == null) return null;
  if (warningThreshold != null && value > warningThreshold) {
    return { type: "warning", threshold: warningThreshold };
  }
  if (detectionThreshold != null && value > detectionThreshold) {
    return { type: "detection", threshold: detectionThreshold };
  }
  return null;
}

/**
 * Weeks that contribute to the alert rationale (for the explainable-alert card).
 * ED: last 4 observed weeks above threshold.
 * EW: forecast weeks above threshold.
 */
export function buildTriggeredWeeks({
  observedHistory = [],
  forecastPoints = [],
  status = "Normal",
} = {}) {
  const weeks = [];

  if (status === "Early Detection" || status === "Normal") {
    const recent = (observedHistory || []).slice(-4);
    recent.forEach((point) => {
      const observed = finiteNumber(point?.observed);
      const warning = finiteNumber(
        point?.warning_threshold ?? point?.warningThreshold
      );
      const detection = finiteNumber(
        point?.detection_threshold ?? point?.detectionThreshold ?? point?.expected
      );
      const hit = exceedsThreshold(observed, warning, detection);
      if (!hit) return;
      weeks.push({
        kind: "observed",
        week: pointDate(point),
        weekLabel: formatWeekLabel(pointDate(point)),
        value: observed,
        thresholdType: hit.type,
        thresholdValue: hit.threshold,
        excess: observed - hit.threshold,
      });
    });
  }

  if (status === "Early Warning" || status === "Normal") {
    (forecastPoints || []).forEach((point) => {
      const median = finiteNumber(point?.median);
      const warning = finiteNumber(
        point?.warning_threshold ?? point?.warningThreshold
      );
      const detection = finiteNumber(
        point?.detection_threshold ?? point?.detectionThreshold
      );
      const hit = exceedsThreshold(median, warning, detection);
      if (!hit) return;
      weeks.push({
        kind: "forecast",
        week: pointDate(point),
        weekLabel: formatWeekLabel(pointDate(point)),
        value: median,
        thresholdType: hit.type,
        thresholdValue: hit.threshold,
        excess: median - hit.threshold,
      });
    });
  }

  // For Normal with no crossings, leave empty.
  // For alert statuses, prefer the matching kind when both were scanned.
  if (status === "Early Detection") {
    return weeks.filter((w) => w.kind === "observed");
  }
  if (status === "Early Warning") {
    return weeks.filter((w) => w.kind === "forecast");
  }
  return weeks;
}

export function formatDistrictTooltipHtml({
  region,
  district,
  population,
  cases,
  casesFormatted,
  populationYear,
  casesLabel = "Avg weekly cases",
  status = null,
}) {
  const populationLabel = population != null ? formatPopulation(population) : "—";
  // casesFormatted lets callers pass a pre-formatted string (e.g. "High — ≥3 alarm weeks")
  // without going through the numeric formatter.
  const casesValue = casesFormatted ?? (cases != null ? formatNumber(cases, 0) : "—");

  const statusRow = status
    ? `
      <div class="district-info-tooltip-row">
        <span>Status</span>
        <strong>${escapeHtml(status)}</strong>
      </div>`
    : "";

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
      ${statusRow}
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
  observedHistory = [],
  forecastPoints = [],
}) {
  if (!alert) {
    return {
      status: null,
      level: null,
      alertCount: 0,
      summary: `No forecast alert is available for ${districtName} (${speciesLabel}).`,
      why: `No forecast alert is available for ${districtName} (${speciesLabel}).`,
      bullets: [],
      magnitudePercent: null,
      persistenceWeeks: 0,
      triggeredWeeks: [],
      contextLine: null,
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
  const level = status === "Early Warning" ? ewLevel || "Low" : status === "Early Detection" ? edLevel || "Low" : null;
  const alertCount =
    status === "Early Warning"
      ? alert.ew_alert_count ?? 0
      : status === "Early Detection"
      ? alert.ed_alert_count ?? 0
      : 0;

  const triggeredWeeks = buildTriggeredWeeks({
    observedHistory,
    forecastPoints,
    status,
  });

  let why;
  if (status === "Early Warning") {
    const weekBit =
      triggeredWeeks.length > 0
        ? `${triggeredWeeks.length} forecast week${triggeredWeeks.length === 1 ? "" : "s"} above the warning or expected level`
        : `${alert.ew_alert_count ?? 0} forecast week(s) above the expected level`;
    why = `Early warning (${level}): ${weekBit}. The near-term forecast sits above the seasonal baseline used for warning.`;
  } else if (status === "Early Detection") {
    const weekBit =
      triggeredWeeks.length > 0
        ? `${triggeredWeeks.length} of the last 4 observed week${triggeredWeeks.length === 1 ? "" : "s"} exceeded threshold`
        : `${alert.ed_alert_count ?? 0} observed week(s) above threshold in the last 4 weeks`;
    why = `Early detection (${level}): ${weekBit}. Recent reported cases are above the expected (detection) level.`;
  } else {
    why = "District is within normal transmission levels—no observed or forecast week currently exceeds alert thresholds.";
  }

  // Keep summary as the primary one-line why (card + legacy callers).
  const summary = why;

  const bullets = [];

  if (regionName) {
    bullets.push(`Region: ${regionName}`);
  }

  if (latestObserved != null || latestForecast != null || activeThreshold != null) {
    bullets.push(
      `Observed ${formatNumber(latestObserved)} · Forecast ${formatNumber(latestForecast)} · Warning threshold ${formatNumber(activeThreshold)}`
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

  const contextParts = [];
  if (regionName) contextParts.push(regionName);
  if (speciesLabel) contextParts.push(speciesLabel);
  if (population != null) contextParts.push(`pop. ${formatPopulation(population)}`);
  if (incidentRate != null) {
    contextParts.push(`${formatNumber(incidentRate, 1)} /100k incidence`);
  }
  const contextLine = contextParts.length ? contextParts.join(" · ") : null;

  return {
    status,
    level,
    alertCount,
    summary,
    why,
    bullets,
    magnitudePercent:
      magnitudePercent != null && magnitudePercent > 0 ? magnitudePercent : null,
    persistenceWeeks: persistenceWeeks > 0 ? persistenceWeeks : 0,
    triggeredWeeks,
    contextLine,
    latestObserved,
    latestForecast,
    activeThreshold,
  };
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

  // One-line why for map hover; full rationale lives in the Decision card.
  if (explanation.why || explanation.summary) {
    const shortWhy = String(explanation.why || explanation.summary).split(".")[0];
    rows.push(tooltipRow("Why", shortWhy));
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

  if (!rows.length) {
    rows.push(tooltipRow("District", districtName || "—"));
    if (explanation?.status) {
      rows.push(tooltipRow("Status", explanation.status));
    }
    const fallbackWhy = explanation?.why || explanation?.summary;
    if (fallbackWhy) {
      rows.push(tooltipRow("Why", String(fallbackWhy).split(".")[0]));
    }
  }

  return `<div class="district-info-tooltip">${rows.join("")}</div>`.trim();
}
