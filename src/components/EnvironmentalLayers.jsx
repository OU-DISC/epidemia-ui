import React from "react";
import HelpTip from "./HelpTip";
import MapSurfaceLayerPicker from "./MapSurfaceLayerPicker";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";

function EnvironmentalLayers({
  startDate,
  endDate,
  onChangeStartDate,
  onChangeEndDate,
  mapSurfaceLayer,
  onChangeMapSurfaceLayer,
  showEnvTimeControls = false,
  timeMode,
  onChangeTimeMode,
  weekIndex,
  weekDates,
  onChangeWeekIndex,
  playing,
  onTogglePlaying,
  averageSampleInfo,
}) {
  const currentDate = weekDates && weekDates.length ? weekDates[weekIndex] : "";

  return (
    <div className="decision-layers env-layers env-layers-compact">
      <div className="env-layers-date-range">
        <span className="toolbar-field-label env-layers-date-heading">
          Chart date range
          <HelpTip text={DASHBOARD_HELP.envDateRange} label="Chart date range" />
        </span>
        <label className="toolbar-field">
          Start date
          <input
            className="toolbar-input"
            type="date"
            value={startDate}
            onChange={(e) => onChangeStartDate(e.target.value)}
          />
        </label>
        <label className="toolbar-field">
          End date
          <input
            className="toolbar-input"
            type="date"
            value={endDate}
            onChange={(e) => onChangeEndDate(e.target.value)}
          />
        </label>
        {onChangeMapSurfaceLayer ? (
          <MapSurfaceLayerPicker
            value={mapSurfaceLayer}
            onChange={onChangeMapSurfaceLayer}
          />
        ) : null}
      </div>

      {showEnvTimeControls && (
        <div className="env-layers-time-controls">
          <div className="toolbar-field env-layers-time-mode">
            <span className="toolbar-field-label">
              Satellite time
              <HelpTip text={DASHBOARD_HELP.envTime} label="Environmental time mode" />
            </span>
            <select
              className="toolbar-select"
              value={timeMode}
              onChange={(e) => onChangeTimeMode(e.target.value)}
            >
              <option value="animate">Animate (weekly)</option>
              <option value="average">Average (range)</option>
            </select>
          </div>

          {timeMode === "animate" && (
            <>
              <div className="toolbar-field env-layers-week-label">
                <span>Week</span>
                <span>{currentDate || "—"}</span>
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(0, (weekDates?.length || 1) - 1)}
                value={weekIndex}
                onChange={(e) => onChangeWeekIndex(Number(e.target.value))}
                className="env-layers-week-slider"
              />

              <button type="button" className="toolbar-button" onClick={onTogglePlaying}>
                {playing ? "Pause" : "Play"}
              </button>
            </>
          )}

          {timeMode === "average" && (
            <div className="env-layers-average-note">
              {averageSampleInfo || "Averaging over selected date range."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EnvironmentalLayers;
