// TopToolbar.jsx
import React from "react";

function TopToolbar({
  disease,
  onChangeDisease,
  country,
  onChangeCountry,
  selectedAdminRegion,
  onChangeAdminRegion,
  availableRegions = [],
  selectedDistrict,
  onChangeDistrict,
  availableDistricts = [],
  onExportPDF,
  exporting,
  exportLabel = "Export EPIDEMIA Report",
  reportScope = "country",
  onChangeReportScope,
  reportScopeAvailability = { canRegion: false, canDistrict: false },
  woredaPageMode = "alerts",
  onChangeWoredaPageMode,
  projectName,
  onNewProject,
  onUseDefaultDataset,
  usingCustomProject = false,
  showDefaultDatasetButton = false,
}) {
  const diseases = ["Plasmodium falciparum malaria", "Plasmodium vivax malaria"];
  const countries = ["Ethiopia", "USA"];

  return (
    <header className="top-toolbar fade-in-up">
      <strong className="brand-mark">EPIDEMIA</strong>

      <div className="toolbar-cluster toolbar-cluster--context" role="group" aria-label="Analysis context">
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
          <>
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

            <label className="toolbar-field">
              District:
              <select
                value={selectedDistrict}
                onChange={(e) => onChangeDistrict(e.target.value)}
                className="toolbar-select"
              >
                {availableDistricts.map((d) => (
                  <option key={d} value={d}>{d === "All Regions" ? "All Districts" : d}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="toolbar-cluster toolbar-cluster--project" role="group" aria-label="Project">
        {showDefaultDatasetButton && (
          <button
            type="button"
            className="toolbar-button ghost"
            onClick={onUseDefaultDataset}
            title="Return to the national Ethiopia dataset (backend/data and backend/report)"
          >
            Default dataset
          </button>
        )}

        <button
          type="button"
          className="toolbar-button"
          onClick={onNewProject}
          title="Upload CSV and run your first forecast"
        >
          New Project
        </button>

        {projectName && (
          <span className="toolbar-project-name" title="Active project">
            {projectName}
          </span>
        )}
      </div>

      <div
        className="toolbar-cluster toolbar-cluster--output toolbar-actions"
        role="group"
        aria-label="Report export"
      >
        <label className="toolbar-field">
          Report scope:
          <select
            value={reportScope}
            onChange={(e) => onChangeReportScope?.(e.target.value)}
            className="toolbar-select"
            disabled={exporting}
            title="Limit the PDF to the whole country, selected region, or selected district"
          >
            <option value="country">Whole country</option>
            <option value="region" disabled={!reportScopeAvailability.canRegion}>
              Selected region
            </option>
            <option value="district" disabled={!reportScopeAvailability.canDistrict}>
              Selected district
            </option>
          </select>
        </label>

        <label className="toolbar-field">
          Woreda pages:
          <select
            value={woredaPageMode}
            onChange={(e) => onChangeWoredaPageMode?.(e.target.value)}
            className="toolbar-select"
            disabled={exporting}
            title="Control chart pages per district — fewer pages export much faster"
          >
            <option value="alerts">Alert districts only</option>
            <option value="all">All woreda charts</option>
            <option value="none">Summary only</option>
          </select>
        </label>

        <button type="button" onClick={onExportPDF} className="toolbar-button" disabled={exporting}>
          {exportLabel}
        </button>
      </div>
    </header>
  );
}

export default TopToolbar;
