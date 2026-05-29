import React from "react";

function DecisionLayers({
  showEarlyWarning,
  onToggleEarlyWarning,
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
    <div className="decision-layers decision-layers-compact">
      <h3>Decision Layers:</h3>

      <div className="layer-item">
        <input
          type="checkbox"
          id="early-warning"
          className="layer-checkbox"
          checked={showEarlyWarning}
          onChange={onToggleEarlyWarning}
        />
        <label htmlFor="early-warning" className="layer-label">
          <div className="layer-icon">⚠️</div>
          Early Warning Alerts
        </label>
      </div>

      <div className="alert-layers-time-controls">
        <label className="alert-inline-field">
          <span>Alert history</span>
          <select
            className="toolbar-select alert-inline-select"
            value={alertTimeMode}
            onChange={(e) => onChangeAlertTimeMode?.(e.target.value)}
          >
            <option value="current">Current</option>
            <option value="animate" disabled={!canAnimate}>
              Animate (weekly)
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