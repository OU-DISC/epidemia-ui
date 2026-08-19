import { useMemo } from "react";
import AlertStatusIcons from "./AlertStatusIcons";
import CaseSparkline from "./CaseSparkline";
import HelpTip from "./HelpTip";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";
import { buildCurrentSituationSummary } from "../utils/buildCurrentSituationSummary";
import { formatForecastMetric, FORECAST_VALUE_MODE } from "../utils/forecastValueMode";

function formatMetric(value, valueMode = FORECAST_VALUE_MODE.CASES, digits) {
  const resolvedDigits =
    digits ?? (valueMode === FORECAST_VALUE_MODE.INCIDENCE ? 1 : 0);
  return formatForecastMetric(value, valueMode, resolvedDigits);
}

function levelTone(level) {
  if (level === "High") return "situation-level--high";
  if (level === "Medium") return "situation-level--medium";
  if (level === "Low") return "situation-level--low";
  return "situation-level--none";
}

function statusTone(status) {
  if (status === "Early Warning" || status === "Mixed alerts") return "situation-status--warning";
  if (status === "Early Detection") return "situation-status--detection";
  return "situation-status--normal";
}

function DetectionWindowDots({ summary }) {
  const weekStates = summary.detectionWeekStates || [];
  const windowWeeks = summary.detectionWindowWeeks || weekStates.length || 4;
  const activeCount = summary.detectionWeeksActive ?? weekStates.filter(Boolean).length;
  const label = `${activeCount}/${windowWeeks} wks above threshold`;

  return (
    <div className="situation-persistence situation-detection-window" title={summary.detectionWindowTooltip}>
      <div className="situation-persistence-dots" aria-hidden="true">
        {weekStates.map((isActive, index) => (
          <span
            key={index}
            className={`situation-persistence-dot situation-detection-window-dot${isActive ? " is-active" : ""}`}
            title={
              summary.detectionWeekLabels?.[index]
                ? `${summary.detectionWeekLabels[index]}: ${isActive ? "above detection threshold" : "at or below threshold"}`
                : `Week ${index + 1} of ${windowWeeks}`
            }
          />
        ))}
      </div>
      <span className="situation-persistence-label">{label}</span>
    </div>
  );
}

function SituationAlertVisual({ summary }) {
  if (summary.isDistrictFocus) {
    return (
      <div
        className={`situation-visual-card situation-alert-visual ${statusTone(summary.alertStatus)}`}
        title={`Alert status: ${summary.alertStatus}${summary.alertLevel ? ` (${summary.alertLevel})` : ""}`}
      >
        <span className="situation-visual-label">Alert</span>
        <div className="situation-alert-visual__body">
          <AlertStatusIcons
            earlyWarning={summary.earlyWarning}
            earlyDetection={summary.earlyDetection}
            className="alert-type-status-icons"
          />
          <span className="situation-alert-visual__status">{summary.alertStatus}</span>
          {summary.alertLevel ? (
            <span className={`situation-level-pill ${levelTone(summary.alertLevel)}`}>
              {summary.alertLevel}
            </span>
          ) : null}
        </div>
        <DetectionWindowDots summary={summary} />
      </div>
    );
  }

  return (
    <div className="situation-visual-card situation-alert-visual" title="Elevated alerts in scope">
      <span className="situation-visual-label">Alerts</span>
      <div className="situation-alert-visual__counts">
        <span
          className={`situation-count-chip situation-count-chip--warning${summary.warningCount ? "" : " is-zero"}`}
          title={`${summary.warningCount} Early Warning district${summary.warningCount === 1 ? "" : "s"}`}
        >
          <AlertStatusIcons earlyWarning className="alert-type-status-icons" />
          <strong>{summary.warningCount}</strong>
        </span>
        <span
          className={`situation-count-chip situation-count-chip--detection${summary.detectionCount ? "" : " is-zero"}`}
          title={`${summary.detectionCount} Early Detection district${summary.detectionCount === 1 ? "" : "s"}`}
        >
          <AlertStatusIcons earlyDetection className="alert-type-status-icons" />
          <strong>{summary.detectionCount}</strong>
        </span>
      </div>
      {!summary.isDistrictFocus && summary.topDistrict ? (
        <DetectionWindowDots summary={summary} />
      ) : null}
    </div>
  );
}

function ThresholdBar({ observed, threshold, status, valueMode, tooltip }) {
  const obs = Number(observed);
  const thresh = Number(threshold);
  if (!Number.isFinite(obs) || !Number.isFinite(thresh)) {
    return <span className="situation-visual-empty" title={tooltip}>—</span>;
  }

  const max = Math.max(obs, thresh, 1) * 1.12;
  const obsPct = Math.min(100, (obs / max) * 100);
  const threshPct = Math.min(100, (thresh / max) * 100);

  return (
    <div className="situation-threshold-bar" title={tooltip}>
      <div className="situation-threshold-bar__track">
        <div
          className={`situation-threshold-bar__fill ${statusTone(status)}`}
          style={{ width: `${obsPct}%` }}
        />
        <div
          className="situation-threshold-bar__marker"
          style={{ left: `${threshPct}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="situation-threshold-bar__labels">
        <span>{formatMetric(obs, valueMode)}</span>
        <span className="situation-threshold-bar__threshold-label">
          threshold {formatMetric(thresh, valueMode)}
        </span>
      </div>
    </div>
  );
}

function SituationEvidenceVisual({ summary }) {
  return (
    <div className="situation-visual-card situation-evidence-visual" title={summary.evidenceTooltip}>
      <span className="situation-visual-label">Evidence</span>
      <div className="situation-evidence-visual__body">
        <CaseSparkline
          values={summary.caseSparkline}
          weeks={summary.caseSparklineWeeks}
          status={summary.alertStatus}
          width={92}
          height={28}
        />
        <ThresholdBar
          observed={summary.latestObserved}
          threshold={summary.activeThreshold}
          status={summary.alertStatus}
          valueMode={summary.valueMode}
          tooltip={summary.evidenceTooltip}
        />
      </div>
      {!summary.isDistrictFocus && summary.topDistrict ? (
        <span className="situation-district-chip" title={summary.evidenceTooltip}>
          {summary.topDistrict}
        </span>
      ) : null}
    </div>
  );
}

function SituationForecastVisual({ summary }) {
  const obs = summary.latestObserved;
  const fcst = summary.latestForecast;
  const hasValues = obs != null || fcst != null;
  const max = Math.max(Number(obs) || 0, Number(fcst) || 0, 1) * 1.12;
  const obsPct = obs != null ? Math.min(100, (Number(obs) / max) * 100) : 0;
  const fcstPct = fcst != null ? Math.min(100, (Number(fcst) / max) * 100) : 0;

  return (
    <div className="situation-visual-card situation-forecast-visual" title={summary.forecastTooltip}>
      <span className="situation-visual-label">Forecast</span>
      {hasValues ? (
        <div className="situation-forecast-visual__body">
          <div className="situation-forecast-bars">
            <div className="situation-forecast-bar-row">
              <span>Obs</span>
              <div className="situation-forecast-bar-track">
                <div
                  className="situation-forecast-bar-fill situation-forecast-bar-fill--observed"
                  style={{ width: `${obsPct}%` }}
                />
              </div>
              <strong>{formatMetric(obs, summary.valueMode, 1)}</strong>
            </div>
            <div className="situation-forecast-bar-row">
              <span>Fcst</span>
              <div className="situation-forecast-bar-track">
                <div
                  className={`situation-forecast-bar-fill situation-forecast-bar-fill--forecast ${statusTone(summary.alertStatus)}`}
                  style={{ width: `${fcstPct}%` }}
                />
              </div>
              <strong>{formatMetric(fcst, summary.valueMode, 1)}</strong>
            </div>
          </div>
        </div>
      ) : (
        <span className="situation-visual-empty" title={summary.forecastTooltip}>—</span>
      )}
    </div>
  );
}

export default function CurrentSituationSummary({
  rows = [],
  dataLoading = false,
  selectedAdminRegion,
  selectedDistrict,
  speciesLabel,
  valueMode,
  insight = null,
  alert = null,
  weekAlerts = null,
  alertAnimationWeek = null,
  weekObservedPoint = null,
  observedHistory = [],
  forecastPoints = [],
  population = null,
  incidentRate = null,
  startDate,
  endDate,
  forecastHorizonWeeks = 12,
}) {
  const summary = useMemo(
    () =>
      buildCurrentSituationSummary({
        rows,
        selectedAdminRegion,
        selectedDistrict,
        speciesLabel,
        valueMode,
        insight,
        alert,
        weekAlerts,
        alertAnimationWeek,
        weekObservedPoint,
        observedHistory,
        forecastPoints,
        population,
        incidentRate,
        startDate,
        endDate,
        forecastHorizonWeeks,
      }),
    [
      alert,
      alertAnimationWeek,
      endDate,
      forecastHorizonWeeks,
      forecastPoints,
      incidentRate,
      insight,
      observedHistory,
      population,
      rows,
      selectedAdminRegion,
      selectedDistrict,
      speciesLabel,
      startDate,
      valueMode,
      weekAlerts,
      weekObservedPoint,
    ]
  );

  if (!rows.length) {
    if (!dataLoading) return null;

    return (
      <div
        className="decision-layers decision-layers-compact current-situation-layers current-situation-layers--loading"
        aria-label="Current situation"
        aria-busy="true"
      >
        <div className="current-situation-header-row">
          <h3>
            <span className="panel-header-label">Current situation</span>
          </h3>
          <span className="alert-inline-counts current-situation-scope">Loading…</span>
        </div>
        <div className="current-situation-visuals current-situation-visuals--loading">
          <span className="situation-visual-skeleton" />
          <span className="situation-visual-skeleton" />
          <span className="situation-visual-skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="decision-layers decision-layers-compact current-situation-layers" aria-label="Current situation">
      <div className="current-situation-header-row">
        <h3>
          <span className="panel-header-label">
            Current situation
            <HelpTip text={DASHBOARD_HELP.currentSituation} label="Current situation" />
          </span>
        </h3>
        <span className="alert-inline-counts current-situation-scope">
          {summary.scopeLabel}
          {summary.dateRange ? ` · ${summary.dateRange}` : ""}
        </span>
      </div>

      <div className="current-situation-visuals">
        <SituationAlertVisual summary={summary} />
        <SituationEvidenceVisual summary={summary} />
        <SituationForecastVisual summary={summary} />
      </div>
    </div>
  );
}
