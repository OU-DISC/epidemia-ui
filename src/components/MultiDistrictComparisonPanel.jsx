import React, { useEffect, useMemo, useState } from "react";
import MultiDistrictComparisonChart from "./MultiDistrictComparisonChart";
import {
  buildComparisonDistrictOptions,
  buildDistrictForecastSeries,
} from "../utils/buildDistrictForecastSeries";

function MultiDistrictComparisonPanel({
  epidemiaData,
  adm3Lookup,
  selectedSpecies,
  selectedAdminRegion,
  forecastTableRows,
  selectedDistricts: controlledDistricts,
  onSelectedDistrictsChange,
  syncedHoverDate,
  onHoverDateChange,
  syncedXRange,
  onXRangeChange,
  alertTimeMode,
  alertAnimationWeek,
}) {
  const districtOptions = useMemo(
    () => buildComparisonDistrictOptions(forecastTableRows, selectedAdminRegion),
    [forecastTableRows, selectedAdminRegion]
  );

  const defaultDistricts = useMemo(
    () => districtOptions.slice(0, 3).map((option) => option.value),
    [districtOptions]
  );

  const isControlled = controlledDistricts != null;
  const [internalDistricts, setInternalDistricts] = useState(["", "", ""]);
  const selectedDistricts = isControlled ? controlledDistricts : internalDistricts;

  useEffect(() => {
    if (isControlled) return;
    setInternalDistricts([
      defaultDistricts[0] || "",
      defaultDistricts[1] || "",
      defaultDistricts[2] || "",
    ]);
  }, [defaultDistricts, isControlled]);

  const comparisonSeries = useMemo(() => {
    const uniqueDistricts = [...new Set(selectedDistricts.filter(Boolean))].slice(0, 3);
    return uniqueDistricts
      .map((districtName) =>
        buildDistrictForecastSeries(
          epidemiaData,
          adm3Lookup,
          districtName,
          selectedSpecies
        )
      )
      .filter(Boolean);
  }, [adm3Lookup, epidemiaData, selectedDistricts, selectedSpecies]);

  const updateDistrict = (index, value) => {
    const next = [...selectedDistricts];
    next[index] = value;
    if (isControlled) {
      onSelectedDistrictsChange?.(next);
      return;
    }
    setInternalDistricts(next);
  };

  if (!districtOptions.length) {
    return (
      <div className="chart-state">
        No districts available for comparison. Load forecast data or change the region filter.
      </div>
    );
  }

  return (
    <div className="comparison-panel">
      <div className="comparison-panel-intro">
        <h4>Regional district comparison</h4>
        <p>Overlay observed and forecast case curves for up to three districts.</p>
      </div>

      <div className="comparison-panel-selectors">
        {[0, 1, 2].map((index) => (
          <label key={index} className="comparison-panel-field">
            <span>District {index + 1}</span>
            <select
              className="toolbar-select"
              value={selectedDistricts[index] || ""}
              onChange={(e) => updateDistrict(index, e.target.value)}
            >
              <option value="">None</option>
              {districtOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.status && option.status !== "Normal" ? ` · ${option.status}` : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <MultiDistrictComparisonChart
        series={comparisonSeries}
        syncedHoverDate={syncedHoverDate}
        onHoverDateChange={onHoverDateChange}
        syncedXRange={syncedXRange}
        onXRangeChange={onXRangeChange}
        alertTimeMode={alertTimeMode}
        alertAnimationWeek={alertAnimationWeek}
      />
    </div>
  );
}

export default MultiDistrictComparisonPanel;
