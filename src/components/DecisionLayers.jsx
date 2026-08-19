import React from "react";
import HelpTip from "./HelpTip";
import AlertStatusIcons from "./AlertStatusIcons";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";

function DecisionLayers({
  showEarlyWarning,
  onToggleEarlyWarning,
  showEarlyDetection = true,
  onToggleEarlyDetection,
  alertTimeMode = "current",
  onChangeAlertTimeMode,
  alertWeekDates = [],
  alertWeekIndex = 0,
  onChangeAlertWeekIndex,
  alertPlaying = false,
  onToggleAlertPlaying,
  alertHistoryWeeks = 8,
  onChangeAlertHistoryWeeks,
  alertWeekCounts = { warnings: 0, detections: 0 },
}) {
  const canAnimate = alertWeekDates.length >= 2;
  const currentWeek = alertWeekDates.length ? alertWeekDates[alertWeekIndex] : "";

  return (
    <div className="decision-layers decision-layers-compact alert-layers-panel">
      <div className="alert-layers-row">
        <h3>
          <span className="panel-header-label">
            Alert layers
            <HelpTip text={DASHBOARD_HELP.alertLayers} label="Alert layers" />
          </span>
        </h3>

        <div className="layer-item">
          <input
            type="checkbox"
            id="early-warning"
            className="layer-checkbox"
            checked={showEarlyWarning}
            onChange={onToggleEarlyWarning}
          />
          <label htmlFor="early-warning" className="layer-label">
            <AlertStatusIcons
              earlyWarning
              className="alert-type-status-icons"
            />
            <span>
              <strong>Early Warning</strong>
              <span className="alert-type-def"> — forecast exceeds expected level</span>
            </span>
          </label>
        </div>

        <div className="layer-item">
          <input
            type="checkbox"
            id="early-detection"
            className="layer-checkbox"
            checked={showEarlyDetection}
            onChange={onToggleEarlyDetection}
          />
          <label htmlFor="early-detection" className="layer-label">
            <AlertStatusIcons
              earlyDetection
              className="alert-type-status-icons"
            />
            <span>
              <strong>Early Detection</strong>
              <span className="alert-type-def"> — observed cases exceed Farrington threshold</span>
            </span>
          </label>
        </div>

        <label className="alert-inline-field">
          <span>Time period</span>
          <select
            className="toolbar-select alert-inline-select alert-inline-select--time-mode"
            value={alertTimeMode}
            onChange={(e) => onChangeAlertTimeMode?.(e.target.value)}
          >
            <option value="current">Active (current week)</option>
            <option value="animate" disabled={!canAnimate}>
              Historical (week by week)
            </option>
          </select>
        </label>

        {alertTimeMode === "animate" && (
          <>
            <label className="alert-inline-field">
              <span>Weeks</span>
              <select
                className="toolbar-select alert-inline-select"
                value={alertHistoryWeeks}
                onChange={(e) => onChangeAlertHistoryWeeks?.(Number(e.target.value))}
              >
                <option value={4}>Last 4</option>
                <option value={6}>Last 6</option>
                <option value={8}>Last 8</option>
              </select>
            </label>

            <span className="alert-inline-field">
              <span>Week</span>
              <strong>{currentWeek || "—"}</strong>
            </span>

            <span className="alert-inline-counts">
              {alertWeekCounts.warnings} warning
              {alertWeekCounts.warnings === 1 ? "" : "s"}
              {" · "}
              {alertWeekCounts.detections} detection
              {alertWeekCounts.detections === 1 ? "" : "s"}
            </span>

            <input
              type="range"
              min={0}
              max={Math.max(0, alertWeekDates.length - 1)}
              value={alertWeekIndex}
              onChange={(e) => onChangeAlertWeekIndex?.(Number(e.target.value))}
              className="alert-inline-slider"
              aria-label="Alert history week"
            />

            <button
              type="button"
              className="toolbar-button alert-inline-play"
              onClick={onToggleAlertPlaying}
            >
              {alertPlaying ? "Pause" : "Play"}
            </button>
          </>
        )}

        {alertTimeMode === "current" && !canAnimate && (
          <span className="alert-inline-note">Not enough weekly history.</span>
        )}
      </div>
    </div>
  );
}

export default DecisionLayers;