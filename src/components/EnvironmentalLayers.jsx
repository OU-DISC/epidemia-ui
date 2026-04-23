import React from "react";

function EnvironmentalLayers({
  showRainfall,
  showTemperature,
  showNdvi,
  onToggleRainfall,
  onToggleTemperature,
  onToggleNdvi,
  timeMode,
  onChangeTimeMode,
  weekIndex,
  weekDates,
  onChangeWeekIndex,
  playing,
  onTogglePlaying,
  averageSampleInfo,
}) {
  const anyLayer = showRainfall || showTemperature || showNdvi;
  const currentDate = weekDates && weekDates.length ? weekDates[weekIndex] : "";

  return (
    <div className="decision-layers env-layers">
      <h3>Environmental Layers</h3>

      <div className="layer-item">
        <input
          type="checkbox"
          id="env-rainfall"
          className="layer-checkbox"
          checked={showRainfall}
          onChange={onToggleRainfall}
        />
        <label htmlFor="env-rainfall" className="layer-label">
          <div className="layer-icon">🌧️</div>
          Rainfall
        </label>
      </div>

      <div className="layer-item">
        <input
          type="checkbox"
          id="env-temperature"
          className="layer-checkbox"
          checked={showTemperature}
          onChange={onToggleTemperature}
        />
        <label htmlFor="env-temperature" className="layer-label">
          <div className="layer-icon">🌡️</div>
          Temperature
        </label>
      </div>

      <div className="layer-item">
        <input
          type="checkbox"
          id="env-ndvi"
          className="layer-checkbox"
          checked={showNdvi}
          onChange={onToggleNdvi}
        />
        <label htmlFor="env-ndvi" className="layer-label">
          <div className="layer-icon">🌿</div>
          NDVI / Vegetation
        </label>
      </div>

      {anyLayer && (
        <div style={{ marginTop: 14 }}>
          <div className="toolbar-field" style={{ width: "100%", justifyContent: "space-between" }}>
            <span>Time</span>
            <select
              className="toolbar-select"
              value={timeMode}
              onChange={(e) => onChangeTimeMode(e.target.value)}
              style={{ width: "56%" }}
            >
              <option value="animate">Animate (weekly)</option>
              <option value="average">Average (range)</option>
            </select>
          </div>

          {timeMode === "animate" && (
            <>
              <div className="toolbar-field" style={{ width: "100%", justifyContent: "space-between", marginTop: 10 }}>
                <span>Week</span>
                <span style={{ color: "var(--ink-soft)", fontWeight: 600 }}>{currentDate || "—"}</span>
              </div>

              <input
                type="range"
                min={0}
                max={Math.max(0, (weekDates?.length || 1) - 1)}
                value={weekIndex}
                onChange={(e) => onChangeWeekIndex(Number(e.target.value))}
                style={{ width: "100%", marginTop: 6 }}
              />

              <button
                type="button"
                className="toolbar-button"
                onClick={onTogglePlaying}
                style={{ width: "100%", marginTop: 10 }}
              >
                {playing ? "Pause" : "Play"}
              </button>
            </>
          )}

          {timeMode === "average" && (
            <div style={{ marginTop: 10, color: "var(--ink-soft)", fontSize: "0.86rem", lineHeight: 1.25 }}>
              {averageSampleInfo || "Averaging over selected date range."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EnvironmentalLayers;

