// TopToolbar.jsx
import React from "react";

function TopToolbar({
  disease,
  onChangeDisease,
  country,
  onChangeCountry,
  forecastWeeks,
  onChangeForecastWeeks,
  selectedAdminRegion,
  onChangeAdminRegion,
  availableRegions = [],
  onExportPDF,
  exporting,
}) {
  const diseases = ["Malaria", "West Nile"];
  const countries = ["Ethiopia", "USA"];

  return (
    <header className="top-toolbar fade-in-up">
      <strong className="brand-mark">EPIDEMIA</strong>

      <label className="toolbar-field">
        Disease:
        <select
          value={disease}
          onChange={(e) => onChangeDisease(e.target.value)}
          className="toolbar-select"
        >
          {diseases.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>

      <label className="toolbar-field">
        Country:
        <select
          value={country}
          onChange={(e) => onChangeCountry(e.target.value)}
          className="toolbar-select"
        >
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      {country === "Ethiopia" && (
        <label className="toolbar-field">
          Region:
          <select
            value={selectedAdminRegion}
            onChange={(e) => onChangeAdminRegion(e.target.value)}
            className="toolbar-select"
          >
            {availableRegions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      )}

      <div className="toolbar-actions">
        <label className="toolbar-field">
          Forecast:
          <select
            value={forecastWeeks}
            onChange={(e) => onChangeForecastWeeks(Number(e.target.value))}
            className="toolbar-select"
          >
            <option value={4}>4 weeks</option>
            <option value={8}>8 weeks</option>
            <option value={12}>12 weeks</option>
          </select>
        </label>

        <button onClick={onExportPDF} className="toolbar-button" disabled={exporting}>
          {exporting ? "Exporting..." : "Export PDF"}
        </button>
      </div>
    </header>
  );
}

export default TopToolbar;
