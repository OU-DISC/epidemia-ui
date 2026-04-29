import React, { useMemo, useState } from "react";

const SORT_LABELS = {
  priority: "Priority",
  statusRank: "Status",
  magnitudePercent: "Magnitude %",
  persistenceWeeks: "Persistence",
  populationAtRisk: "Population",
  latestForecast: "Forecast",
  district: "District",
};

function formatNumber(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)}%`;
}

function statusClass(status) {
  if (status === "Early Warning") return "table-status table-status-warning";
  if (status === "Early Detection") return "table-status table-status-detection";
  return "table-status table-status-normal";
}

export default function ForecastAlertsTable({
  rows,
  selectedDistrict,
  onSelectDistrict,
}) {
  const [sortKey, setSortKey] = useState("priority");
  const [sortDir, setSortDir] = useState("desc");

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" || typeof bv === "string") {
        return String(av || "").localeCompare(String(bv || ""));
      }
      const an = Number.isFinite(Number(av)) ? Number(av) : -Infinity;
      const bn = Number.isFinite(Number(bv)) ? Number(bv) : -Infinity;
      return an - bn;
    });
    if (sortDir === "desc") copy.reverse();
    return copy;
  }, [rows, sortDir, sortKey]);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "district" ? "asc" : "desc");
  };

  const sortMark = (key) => {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    <section className="glass-card alerts-table-panel fade-in-up delay-2">
      <div className="panel-header">
        <div>
          <h3>Tabular Forecast View</h3>
          <p className="panel-subtitle">
            Alerts and forecasts by district, prioritized by status, magnitude, persistence, and population.
          </p>
        </div>
        <span>{rows.length} districts</span>
      </div>

      <div className="alerts-table-sort">
        <span>Sort by</span>
        {Object.entries(SORT_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={key === sortKey ? "table-sort-button active" : "table-sort-button"}
            onClick={() => handleSort(key)}
          >
            {label}{sortMark(key)}
          </button>
        ))}
      </div>

      <div className="alerts-table-wrap">
        <table className="alerts-table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>District</th>
              <th>Region</th>
              <th>Status</th>
              <th>Observed</th>
              <th>Forecast</th>
              <th>Threshold</th>
              <th>Magnitude</th>
              <th>Magnitude %</th>
              <th>Persistence</th>
              <th>Population</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={`${row.species}-${row.rawDistrict}`}
                className={row.mapDistrict === selectedDistrict ? "selected" : ""}
                onClick={() => onSelectDistrict?.(row.mapDistrict)}
              >
                <td>{formatNumber(row.priority, 0)}</td>
                <td>
                  <strong>{row.mapDistrict}</strong>
                </td>
                <td>{row.region || "-"}</td>
                <td>
                  <span className={statusClass(row.status)}>{row.status}</span>
                </td>
                <td>{formatNumber(row.latestObserved)}</td>
                <td>{formatNumber(row.latestForecast)}</td>
                <td>{formatNumber(row.activeThreshold)}</td>
                <td className={row.magnitude > 0 ? "positive-magnitude" : ""}>
                  {formatNumber(row.magnitude)}
                </td>
                <td className={row.magnitudePercent > 0 ? "positive-magnitude" : ""}>
                  {formatPercent(row.magnitudePercent)}
                </td>
                <td>{row.persistenceWeeks} wk</td>
                <td>{formatNumber(row.populationAtRisk, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
