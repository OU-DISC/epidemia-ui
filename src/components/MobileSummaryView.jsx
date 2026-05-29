import { useMemo } from "react";

function formatNumber(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(value));
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)}%`;
}

function statusClass(status) {
  if (status === "Early Warning") return "summary-alert-status summary-alert-status-warning";
  return "summary-alert-status summary-alert-status-normal";
}

export default function MobileSummaryView({
  rows = [],
  selectedAdminRegion,
  selectedDistrict,
  speciesLabel,
  startDate,
  endDate,
  generatedAt,
  onSelectDistrict,
}) {
  const scopedRows = useMemo(() => {
    let next = [...rows].sort((a, b) => b.priority - a.priority);
    if (
      selectedAdminRegion &&
      selectedAdminRegion !== "All Regions" &&
      selectedAdminRegion !== "No Selection"
    ) {
      next = next.filter((row) => row.region === selectedAdminRegion);
    }
    return next;
  }, [rows, selectedAdminRegion]);

  const topAlerts = useMemo(() => scopedRows.slice(0, 8), [scopedRows]);
  const warningCount = useMemo(
    () => scopedRows.filter((row) => row.status === "Early Warning").length,
    [scopedRows]
  );

  const selectedRow = useMemo(
    () => scopedRows.find((row) => row.mapDistrict === selectedDistrict) || null,
    [scopedRows, selectedDistrict]
  );

  const scopeLabel =
    selectedAdminRegion && selectedAdminRegion !== "All Regions"
      ? selectedAdminRegion
      : "All regions";

  return (
    <section className="mobile-summary-view glass-card fade-in-up delay-2">
      <div className="mobile-summary-header">
        <div>
          <h3>Field summary</h3>
          <p className="mobile-summary-subtitle">
            {speciesLabel} · {scopeLabel} · {startDate} to {endDate}
          </p>
        </div>
        {generatedAt ? (
          <span className="mobile-summary-updated">
            Updated {new Date(generatedAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      <div className="mobile-summary-stats">
        <article className="mobile-summary-stat">
          <span>Districts</span>
          <strong>{scopedRows.length}</strong>
        </article>
        <article className="mobile-summary-stat mobile-summary-stat-warning">
          <span>Early warnings</span>
          <strong>{warningCount}</strong>
        </article>
        <article className="mobile-summary-stat">
          <span>Selected</span>
          <strong>{selectedDistrict && selectedDistrict !== "All Regions" ? "1" : "0"}</strong>
        </article>
      </div>

      {selectedRow ? (
        <button
          type="button"
          className="mobile-summary-selected"
          onClick={() => onSelectDistrict?.(selectedRow.mapDistrict)}
        >
          <span className="mobile-summary-selected-label">Focused district</span>
          <strong>{selectedRow.mapDistrict}</strong>
          <span className={statusClass(selectedRow.status)}>{selectedRow.status}</span>
          <span className="mobile-summary-selected-meta">
            Forecast {formatNumber(selectedRow.latestForecast)} · Observed{" "}
            {formatNumber(selectedRow.latestObserved)}
          </span>
        </button>
      ) : null}

      <div className="mobile-summary-list-header">
        <h4>Priority alerts</h4>
        <span>{topAlerts.length} shown</span>
      </div>

      <div className="mobile-summary-alert-list">
        {topAlerts.length === 0 ? (
          <p className="mobile-summary-empty">No forecast alerts available for this scope.</p>
        ) : (
          topAlerts.map((row, index) => {
            const isSelected = row.mapDistrict === selectedDistrict;
            return (
              <button
                key={`${row.species}-${row.rawDistrict}`}
                type="button"
                className={`mobile-summary-alert-card${isSelected ? " is-selected" : ""}`}
                onClick={() => onSelectDistrict?.(row.mapDistrict)}
              >
                <div className="mobile-summary-alert-card-top">
                  <span className="mobile-summary-alert-rank">#{index + 1}</span>
                  <span className={statusClass(row.status)}>{row.status}</span>
                </div>
                <strong>{row.mapDistrict}</strong>
                <span className="mobile-summary-alert-region">{row.region || "Unknown region"}</span>
                <div className="mobile-summary-alert-metrics">
                  <span>
                    Observed <strong>{formatNumber(row.latestObserved)}</strong>
                  </span>
                  <span>
                    Forecast <strong>{formatNumber(row.latestForecast)}</strong>
                  </span>
                  <span>
                    Magnitude <strong>{formatPercent(row.magnitudePercent)}</strong>
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
