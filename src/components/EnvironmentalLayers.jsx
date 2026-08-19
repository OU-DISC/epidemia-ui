import React, { useCallback, useMemo, useRef } from "react";
import HelpTip from "./HelpTip";
import MapSurfaceLayerPicker from "./MapSurfaceLayerPicker";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";
import {
  buildEpiweekOptions,
  buildSyntheticWeekDates,
  ensureWeekInOptions,
  formatEpiweekLabel,
} from "../utils/epiweekUtils";

/* ── dual-thumb epiweek range slider ─────────────────────────── */

function EpiweekRangeSlider({ weekOptions, startDate, endDate, onChangeStart, onChangeEnd }) {
  const count = weekOptions.length;
  const trackRef = useRef(null);

  const startIdx = useMemo(() => {
    const idx = weekOptions.indexOf(startDate);
    return idx >= 0 ? idx : 0;
  }, [weekOptions, startDate]);

  const endIdx = useMemo(() => {
    const idx = weekOptions.indexOf(endDate);
    return idx >= 0 ? idx : Math.max(0, count - 1);
  }, [weekOptions, endDate, count]);

  const handleStartChange = useCallback(
    (e) => {
      let idx = Number(e.target.value);
      if (idx > endIdx) idx = endIdx;
      if (weekOptions[idx]) onChangeStart(weekOptions[idx]);
    },
    [weekOptions, endIdx, onChangeStart]
  );

  const handleEndChange = useCallback(
    (e) => {
      let idx = Number(e.target.value);
      if (idx < startIdx) idx = startIdx;
      if (weekOptions[idx]) onChangeEnd(weekOptions[idx]);
    },
    [weekOptions, startIdx, onChangeEnd]
  );

  if (count < 2) return null;

  const maxIdx = count - 1;
  const leftPct = (startIdx / maxIdx) * 100;
  const rightPct = ((maxIdx - endIdx) / maxIdx) * 100;

  return (
    <div className="epiweek-slicer" ref={trackRef}>
      <div className="epiweek-slicer-track-wrap">
        <div
          className="epiweek-slicer-track-fill"
          style={{ left: `${leftPct}%`, right: `${rightPct}%` }}
        />
        <input
          type="range"
          className="epiweek-slicer-thumb epiweek-slicer-thumb--start"
          min={0}
          max={maxIdx}
          value={startIdx}
          onChange={handleStartChange}
          aria-label="Start epiweek"
        />
        <input
          type="range"
          className="epiweek-slicer-thumb epiweek-slicer-thumb--end"
          min={0}
          max={maxIdx}
          value={endIdx}
          onChange={handleEndChange}
          aria-label="End epiweek"
        />
      </div>
      <div className="epiweek-slicer-labels">
        <span className="epiweek-slicer-label">
          <span className="epiweek-slicer-week">{formatEpiweekLabel(weekOptions[startIdx])}</span>
          <span className="epiweek-slicer-date">{weekOptions[startIdx]}</span>
        </span>
        <span className="epiweek-slicer-label epiweek-slicer-label--end">
          <span className="epiweek-slicer-week">{formatEpiweekLabel(weekOptions[endIdx])}</span>
          <span className="epiweek-slicer-date">{weekOptions[endIdx]}</span>
        </span>
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────────────── */

function EnvironmentalLayers({
  startDate,
  endDate,
  onChangeStartDate,
  onChangeEndDate,
  availableWeeks = [],
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
  const currentEpiweek = formatEpiweekLabel(currentDate);

  const weekOptions = useMemo(() => {
    let options = buildEpiweekOptions(availableWeeks);
    if (!options.length) {
      options = buildEpiweekOptions(buildSyntheticWeekDates(startDate, endDate));
    }
    options = ensureWeekInOptions(options, startDate);
    options = ensureWeekInOptions(options, endDate);
    return options;
  }, [availableWeeks, startDate, endDate]);

  return (
    <div className="decision-layers env-layers env-layers-compact">
      {/* ── single compact row: label | start | end | slider | map picker ── */}
      <div className="env-layers-date-range">
        <span className="toolbar-field-label env-layers-date-heading">
          Epiweek range
          <HelpTip text={DASHBOARD_HELP.envDateRange} label="Epiweek range" />
        </span>

        <label className="toolbar-field env-date-field">
          <span className="env-date-field-label">From</span>
          <input
            className="toolbar-input"
            type="date"
            value={startDate}
            onChange={(e) => onChangeStartDate(e.target.value)}
          />
        </label>

        <label className="toolbar-field env-date-field">
          <span className="env-date-field-label">To</span>
          <input
            className="toolbar-input"
            type="date"
            value={endDate}
            onChange={(e) => onChangeEndDate(e.target.value)}
          />
        </label>

        <EpiweekRangeSlider
          weekOptions={weekOptions}
          startDate={startDate}
          endDate={endDate}
          onChangeStart={onChangeStartDate}
          onChangeEnd={onChangeEndDate}
        />

        {onChangeMapSurfaceLayer ? (
          <MapSurfaceLayerPicker
            value={mapSurfaceLayer}
            onChange={onChangeMapSurfaceLayer}
          />
        ) : null}
      </div>

      {/* ── env satellite time controls (only when a raster layer is active) ── */}
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
                <span>Epiweek</span>
                <span title={currentDate || undefined}>
                  {currentEpiweek}
                  {currentDate ? ` · ${currentDate}` : ""}
                </span>
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
              {averageSampleInfo || "Averaging over selected epiweek range."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EnvironmentalLayers;
