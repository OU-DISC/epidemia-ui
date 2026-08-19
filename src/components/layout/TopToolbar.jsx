// TopToolbar.jsx
import React from "react";

function DiseaseSubtitle({ disease, country }) {
  const speciesName = disease.replace(/\s+malaria$/i, "");
  return (
    <span className="toolbar-subtitle">
      <em>{speciesName}</em> malaria · {country}
    </span>
  );
}

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
  onStartTour,
}) {
  const diseases = ["Plasmodium falciparum malaria", "Plasmodium vivax malaria"];
  const countries = ["Ethiopia", "USA"];

  return (
    <header className="top-toolbar fade-in-up" data-tour="toolbar">
      {/* ── Brand + workspace controls (far left) ── */}
      <div className="toolbar-cluster toolbar-cluster--workspace" role="group" aria-label="Workspace">
        <div className="toolbar-brand-block">
          <strong className="brand-mark">EPIDEMIA <span className="brand-version">2.0</span></strong>
          <DiseaseSubtitle disease={disease} country={country} />
        </div>

        <button
          type="button"
          className="toolbar-button toolbar-button--upload"
          onClick={onNewProject}
          title="Upload CSV and run your first forecast"
        >
          <svg className="toolbar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 14V4m0 0L6.5 7.5M10 4l3.5 3.5" />
            <path d="M3 13v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
          </svg>
          New Project
        </button>

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

        {projectName && (
          <span className="toolbar-project-name" title="Active project">
            {projectName}
          </span>
        )}

        {typeof onStartTour === "function" && (
          <button
            type="button"
            className="toolbar-button toolbar-button--help"
            onClick={onStartTour}
            title="Highlight each part of the dashboard with a short explanation"
            aria-label="Take a tour"
          >
            ?
          </button>
        )}
      </div>

      {/* ── Analysis context (center) ── */}
      <div
        className="toolbar-cluster toolbar-cluster--context"
        role="group"
        aria-label="Analysis context"
        data-tour="toolbar-context"
      >
        <label className="toolbar-field">
          <span className="toolbar-field-label" title="Disease">Pathogen</span>
          <select
            value={disease}
            onChange={(e) => onChangeDisease(e.target.value)}
            className="toolbar-select toolbar-select--disease"
            title={disease}
          >
            {diseases.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label className="toolbar-field">
          <span className="toolbar-field-label" title="Country">Country</span>
          <select
            value={country}
            onChange={(e) => onChangeCountry(e.target.value)}
            className="toolbar-select toolbar-select--country"
          >
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        {country === "Ethiopia" && (
          <>
            <label className="toolbar-field">
              <span className="toolbar-field-label">Region</span>
              <select
                value={selectedAdminRegion}
                onChange={(e) => onChangeAdminRegion(e.target.value)}
                className="toolbar-select toolbar-select--region"
              >
                {availableRegions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>

            <label className="toolbar-field">
              <span className="toolbar-field-label">District</span>
              <select
                value={selectedDistrict}
                onChange={(e) => onChangeDistrict(e.target.value)}
                className="toolbar-select toolbar-select--district"
              >
                {availableDistricts.map((d) => (
                  <option key={d} value={d}>{d === "All Regions" ? "All Districts" : d}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {/* ── Report export (far right) ── */}
      <div
        className="toolbar-cluster toolbar-cluster--output toolbar-actions"
        role="group"
        aria-label="Report export"
        data-tour="toolbar-actions"
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
