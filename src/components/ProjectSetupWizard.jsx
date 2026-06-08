import React, { useMemo, useState } from "react";
import {
  fetchSampleEpiCsv,
  setupEpidemiaProject,
  validateEpiUpload,
} from "../api";
import {
  applyColumnMapping,
  needsColumnMapping,
  suggestColumnMapping,
  validateColumnMapping,
} from "../utils/mapEpiCsvColumns";
import {
  EPI_COLUMN_HELP,
  readFileAsText,
  parseCsvWoredaNames,
  REQUIRED_EPI_COLUMNS,
  validateEpiCsvClient,
} from "../utils/validateEpiCsv";
import "./ProjectSetupWizard.css";

const STEPS = [
  { id: "upload", label: "Upload CSV" },
  { id: "map", label: "Map columns" },
  { id: "validate", label: "Validate" },
  { id: "configure", label: "Configure" },
  { id: "run", label: "Run Forecast" },
];

const STEP_INDEX = Object.fromEntries(STEPS.map((step, index) => [step.id, index]));

const REGIONS = [
  "All Regions",
  "Addis Ababa",
  "Afar",
  "Amhara",
  "Benishangul Gumz",
  "Dire Dawa",
  "Gambela",
  "Harari",
  "Oromia",
  "SNNP",
  "Somali",
  "Tigray",
];

function ProjectSetupWizard({ onComplete, onSkip }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [rawCsvText, setRawCsvText] = useState("");
  const [columnMapping, setColumnMapping] = useState({});
  const [mappingWasUsed, setMappingWasUsed] = useState(false);
  const [clientValidation, setClientValidation] = useState(null);
  const [serverValidation, setServerValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [loadingSample, setLoadingSample] = useState(false);

  const [projectName, setProjectName] = useState("EPIDEMIA Demo Project");
  const [horizonWeeks, setHorizonWeeks] = useState(8);
  const [defaultSpecies, setDefaultSpecies] = useState("pfm");
  const [defaultRegion, setDefaultRegion] = useState("All Regions");
  const [geography, setGeography] = useState("ethiopia");

  const currentStep = STEPS[stepIndex]?.id;
  const sourceHeaders = clientValidation?.headers || [];

  const validationReady = Boolean(serverValidation?.ok);

  const columnChecks = useMemo(() => {
    const headers = clientValidation?.headers || [];
    return REQUIRED_EPI_COLUMNS.map((column) => ({
      column,
      present: headers.includes(column),
      help: EPI_COLUMN_HELP[column],
    }));
  }, [clientValidation]);

  const mappingValidation = useMemo(
    () => validateColumnMapping(columnMapping, sourceHeaders),
    [columnMapping, sourceHeaders]
  );

  const loadCsvText = (text, selectedName) => {
    const validation = validateEpiCsvClient(text);
    setRawCsvText(text);
    setFileName(selectedName);
    setClientValidation(validation);
    setServerValidation(null);
    setMappingWasUsed(false);
    setColumnMapping(suggestColumnMapping(validation.headers));

    if (needsColumnMapping(validation)) {
      setStepIndex(STEP_INDEX.map);
      return;
    }

    const blob = new Blob([text], { type: "text/csv" });
    setFile(new File([blob], selectedName, { type: "text/csv" }));
    setStepIndex(STEP_INDEX.validate);
  };

  const handleSelectFile = async (selectedFile) => {
    if (!selectedFile) return;
    setError("");

    try {
      const text = await readFileAsText(selectedFile);
      loadCsvText(text, selectedFile.name);
    } catch (err) {
      setError(err.message || "Could not read CSV file");
    }
  };

  const handleUseSample = async () => {
    setError("");
    setLoadingSample(true);
    try {
      const sample = await fetchSampleEpiCsv();
      loadCsvText(sample.content, sample.filename || "sample_epi_data.csv");
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.message ||
          "Could not load sample dataset. Start the backend API and try again."
      );
    } finally {
      setLoadingSample(false);
    }
  };

  const handleApplyMapping = () => {
    setError("");
    if (!mappingValidation.ok) {
      setError(mappingValidation.errors[0]);
      return;
    }

    try {
      const mappedText = applyColumnMapping(rawCsvText, columnMapping);
      const validation = validateEpiCsvClient(mappedText);
      if (!validation.ok) {
        setError("Mapped CSV is still missing required columns. Check your mapping.");
        return;
      }

      const mappedName = fileName.endsWith(".csv")
        ? fileName.replace(/\.csv$/i, "_mapped.csv")
        : `${fileName || "upload"}_mapped.csv`;
      const blob = new Blob([mappedText], { type: "text/csv" });
      setFile(new File([blob], mappedName, { type: "text/csv" }));
      setClientValidation(validation);
      setMappingWasUsed(true);
      setServerValidation(null);
      setStepIndex(STEP_INDEX.validate);
    } catch (err) {
      setError(err.message || "Could not apply column mapping");
    }
  };

  const handleValidate = async () => {
    if (!file) return;
    setValidating(true);
    setError("");
    try {
      const result = await validateEpiUpload(file);
      setServerValidation(result);
      if (result.ok) {
        setStepIndex(STEP_INDEX.configure);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const handleRun = async () => {
    if (!file || !validationReady) return;
    setRunning(true);
    setError("");
    setStepIndex(STEP_INDEX.run);
    try {
      const result = await setupEpidemiaProject({
        file,
        projectName,
        horizonWeeks,
        defaultSpecies,
        defaultRegion,
        geography,
      });
      const csvText = await readFileAsText(file);
      const woredaNames = parseCsvWoredaNames(csvText);
      onComplete?.({
        projectId: result.project_id,
        projectName: result.project_name,
        dataDir: result.data_dir,
        outputDir: result.output_dir,
        horizonWeeks: result.horizon_weeks,
        defaultSpecies: result.default_species,
        defaultRegion: result.default_region,
        defaultDistrict: woredaNames.length === 1 ? woredaNames[0] : null,
        geography: geography,
      }, result.run);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Project setup failed");
      setStepIndex(STEP_INDEX.configure);
    } finally {
      setRunning(false);
    }
  };

  const downloadTemplate = () => {
    const header = REQUIRED_EPI_COLUMNS.join(",");
    const example = "2018-11-26,Ankesha,152817,33,4";
    const content = `${header}\n${example}\n`;
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "epidemia_epi_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="project-wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="project-wizard-title">
      <div className="project-wizard-card">
        <div className="project-wizard-header">
          <div>
            <h2 id="project-wizard-title">Create an EPIDEMIA Project</h2>
            <p className="project-wizard-subtitle">
              Upload epidemiology CSV data, map columns if needed, validate woreda names, then run your first forecast.
            </p>
          </div>
          <button type="button" className="project-wizard-skip" onClick={onSkip}>
            Close
          </button>
        </div>

        <ol className="project-wizard-steps">
          {STEPS.map((step, index) => (
            <li
              key={step.id}
              className={
                index === stepIndex
                  ? "project-wizard-step active"
                  : index < stepIndex
                    ? "project-wizard-step done"
                    : "project-wizard-step"
              }
            >
              <span>{index + 1}</span>
              {step.label}
            </li>
          ))}
        </ol>

        {error && <div className="project-wizard-error">{error}</div>}

        {currentStep === "upload" && (
          <section className="project-wizard-panel">
            <div className="project-wizard-upload">
              <label className="project-wizard-dropzone">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleSelectFile(e.target.files?.[0])}
                />
                <strong>Drop epidemiology CSV here</strong>
                <span>or click to browse</span>
                <span className="project-wizard-dropzone-note">
                  Expected data: date, district, population, Pf cases, Pv cases. Different column names are OK — you can map them in the next step.
                </span>
              </label>

              <div className="project-wizard-upload-actions">
                <button type="button" className="toolbar-button" onClick={downloadTemplate}>
                  Download template
                </button>
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={handleUseSample}
                  disabled={loadingSample}
                >
                  {loadingSample ? "Loading sample..." : "Use sample dataset"}
                </button>
              </div>
            </div>
          </section>
        )}

        {currentStep === "map" && (
          <section className="project-wizard-panel">
            <div className="project-wizard-file-summary">
              <strong>{fileName || "Selected CSV"}</strong>
              <span>{clientValidation?.row_count ?? 0} rows · {sourceHeaders.length} columns detected</span>
            </div>

            <p className="project-wizard-note">
              Match each EPIDEMIA field to a column in your file. Common names like <code>date</code> or <code>pf_cases</code> are suggested automatically.
            </p>

            <div className="project-wizard-mapping-grid">
              {REQUIRED_EPI_COLUMNS.map((targetColumn) => (
                <label key={targetColumn} className="project-wizard-mapping-row">
                  <div className="project-wizard-mapping-target">
                    <strong>{targetColumn}</strong>
                    <span>{EPI_COLUMN_HELP[targetColumn]}</span>
                  </div>
                  <select
                    className="toolbar-select"
                    value={columnMapping[targetColumn] || ""}
                    onChange={(e) =>
                      setColumnMapping((current) => ({
                        ...current,
                        [targetColumn]: e.target.value,
                      }))
                    }
                    aria-label={`Source column for ${targetColumn}`}
                  >
                    <option value="">Select column…</option>
                    {sourceHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {!mappingValidation.ok && (
              <div className="project-wizard-mapping-errors">
                {mappingValidation.errors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}

            <div className="project-wizard-actions">
              <button type="button" className="toolbar-button ghost" onClick={() => setStepIndex(STEP_INDEX.upload)}>
                Back
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleApplyMapping}
                disabled={!mappingValidation.ok}
              >
                Continue to validation
              </button>
            </div>
          </section>
        )}

        {currentStep === "validate" && (
          <section className="project-wizard-panel">
            <div className="project-wizard-file-summary">
              <strong>{file?.name || fileName || "Selected CSV"}</strong>
              <span>{clientValidation?.row_count ?? 0} rows detected</span>
            </div>

            {mappingWasUsed && (
              <p className="project-wizard-note">
                Column mapping applied. The uploaded file uses standard EPIDEMIA column names.
              </p>
            )}

            <ul className="project-wizard-checklist">
              {columnChecks.map((item) => (
                <li key={item.column} className={item.present ? "ok" : "missing"}>
                  <span>{item.present ? "✓" : "✕"}</span>
                  <div>
                    <strong>{item.column}</strong>
                    <p>{item.help}</p>
                  </div>
                </li>
              ))}
            </ul>

            {serverValidation && (
              <div className={`project-wizard-validation ${serverValidation.ok ? "ok" : "bad"}`}>
                <strong>{serverValidation.message}</strong>
                <div className="project-wizard-validation-grid">
                  <span>Matched districts: {serverValidation.matched_districts}</span>
                  <span>Unique districts: {serverValidation.district_count}</span>
                  <span>
                    Date range: {serverValidation.date_min || "—"} → {serverValidation.date_max || "—"}
                  </span>
                </div>
                {serverValidation.unmatched_districts?.length > 0 && (
                  <p className="project-wizard-unmatched">
                    Unmatched examples: {serverValidation.unmatched_districts.join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="project-wizard-actions">
              <button
                type="button"
                className="toolbar-button ghost"
                onClick={() =>
                  setStepIndex(
                    needsColumnMapping(validateEpiCsvClient(rawCsvText))
                      ? STEP_INDEX.map
                      : STEP_INDEX.upload
                  )
                }
              >
                Back
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleValidate}
                disabled={validating || !clientValidation?.ok}
              >
                {validating ? "Validating..." : "Validate with server"}
              </button>
            </div>
          </section>
        )}

        {currentStep === "configure" && (
          <section className="project-wizard-panel">
            <div className="project-wizard-form-grid">
              <label className="project-wizard-field">
                Project name
                <input
                  className="toolbar-input"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </label>

              <label className="project-wizard-field">
                Geography
                <select
                  className="toolbar-select"
                  value={geography}
                  onChange={(e) => setGeography(e.target.value)}
                >
                  <option value="ethiopia">Ethiopia · National (admin-3 woredas)</option>
                  <option value="amhara">Ethiopia · Amhara Region (legacy list)</option>
                </select>
              </label>

              <label className="project-wizard-field">
                Default map region
                <select
                  className="toolbar-select"
                  value={defaultRegion}
                  onChange={(e) => setDefaultRegion(e.target.value)}
                >
                  {REGIONS.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
                <span className="project-wizard-field-hint">
                  Zooms the map to this admin region. Your CSV woreda (e.g. Enemay) is selected
                  automatically when the project has one district.
                </span>
              </label>

              <label className="project-wizard-field">
                Default species view
                <select
                  className="toolbar-select"
                  value={defaultSpecies}
                  onChange={(e) => setDefaultSpecies(e.target.value)}
                >
                  <option value="pfm">P. falciparum (pfm)</option>
                  <option value="pv">P. vivax (pv)</option>
                </select>
              </label>

              <label className="project-wizard-field">
                Forecast horizon
                <select
                  className="toolbar-select"
                  value={horizonWeeks}
                  onChange={(e) => setHorizonWeeks(Number(e.target.value))}
                >
                  <option value={4}>4 weeks</option>
                  <option value={8}>8 weeks</option>
                  <option value={12}>12 weeks</option>
                </select>
              </label>
            </div>

            <p className="project-wizard-note">
              The pipeline forecasts both species. These settings choose your initial dashboard view after setup.
            </p>

            <div className="project-wizard-actions">
              <button type="button" className="toolbar-button ghost" onClick={() => setStepIndex(STEP_INDEX.validate)}>
                Back
              </button>
              <button type="button" className="toolbar-button" onClick={handleRun}>
                Run first forecast
              </button>
            </div>
          </section>
        )}

        {currentStep === "run" && (
          <section className="project-wizard-panel project-wizard-run-panel">
            <div className="project-wizard-spinner" aria-hidden="true" />
            <h3>{running ? "Running forecast pipeline..." : "Finalizing project..."}</h3>
            <p>
              Creating project workspace, validating woreda overlap, and generating the first alert map and charts.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

export default ProjectSetupWizard;
