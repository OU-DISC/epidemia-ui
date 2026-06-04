import React, { useEffect, useMemo, useState } from "react";
import CaseSparkline from "./CaseSparkline";
import { buildTableTopPriorityRankByKey } from "../utils/buildDistrictForecastSeries";
import {
  FORECAST_VALUE_MODE,
  formatForecastMetric,
  getForecastMetricLabel,
} from "../utils/forecastValueMode";

const ROWS_PER_PAGE = 10;

const SORT_LABELS = {
  priority: "Priority",
  statusRank: "Status",
  magnitudePercent: "Magnitude %",
  persistenceWeeks: "Persistence",
  populationAtRisk: "Population",
  latestForecast: "Forecast",
  district: "District",
  region: "Region",
};

function formatNumber(value, digits = 1, valueMode = FORECAST_VALUE_MODE.CASES) {
  return formatForecastMetric(value, valueMode, digits);
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)}%`;
}

function AlertStatusCell({ earlyWarning, earlyDetection }) {
  if (!earlyWarning && !earlyDetection) {
    return <span className="table-status table-status-normal">—</span>;
  }

  return (
    <span className="table-status-icons">
      {earlyWarning ? (
        <span className="table-alert-icon table-alert-icon--warning" title="Early Warning">
          ⚠️
        </span>
      ) : null}
      {earlyDetection ? (
        <span className="table-alert-icon table-alert-icon--detection" title="Early Detection">
          🔍
        </span>
      ) : null}
    </span>
  );
}

export default function ForecastAlertsTable({
  rows,
  valueMode = FORECAST_VALUE_MODE.CASES,
  selectedDistrict,
  comparisonDistricts = [],
  onToggleComparisonDistrict,
  embedded = false,
}) {
  const metricLabel = getForecastMetricLabel(valueMode);
  const [sortKey, setSortKey] = useState("priority");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);

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

  const topPriorityRankByKey = useMemo(
    () => buildTableTopPriorityRankByKey(rows, 3),
    [rows]
  );

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * ROWS_PER_PAGE;
  const pageRows = sortedRows.slice(pageStart, pageStart + ROWS_PER_PAGE);

  useEffect(() => {
    setPage(0);
  }, [rows.length, sortKey, sortDir]);

  useEffect(() => {
    if (!selectedDistrict || selectedDistrict === "All Regions") return;
    const index = sortedRows.findIndex((row) => row.mapDistrict === selectedDistrict);
    if (index >= 0) {
      setPage(Math.floor(index / ROWS_PER_PAGE));
    }
  }, [selectedDistrict, sortedRows]);

  const pageOptions = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount]
  );

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "district" || key === "region" ? "asc" : "desc");
  };

  const sortMark = (key) => {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const panelClassName = embedded
    ? "alerts-table-panel alerts-table-embedded"
    : "glass-card alerts-table-panel fade-in-up delay-2";

  return (
    <section className={panelClassName}>
      <div className="panel-header">
        <div>
          <h3>Tabular Forecast View</h3>
          <p className="panel-subtitle">
            Alerts and forecasts by district with an 8-week case trend sparkline. Click rows to
            compare up to three districts in the chart below. Top 3 priority alerts are highlighted.
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
              <th>8-wk trend</th>
              <th>Region</th>
              <th>Alerts</th>
              <th>Observed ({metricLabel})</th>
              <th>Forecast ({metricLabel})</th>
              <th>Threshold ({metricLabel})</th>
              <th>Magnitude ({metricLabel})</th>
              <th>Magnitude %</th>
              <th>Persistence</th>
              <th>Population</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const rowKey = `${row.species}-${row.rawDistrict}`;
              const topRank = topPriorityRankByKey.get(rowKey);
              const compareSlot = comparisonDistricts.findIndex(
                (district) => district === row.mapDistrict
              );
              const rowClassName = [
                row.mapDistrict === selectedDistrict ? "selected" : "",
                compareSlot >= 0 ? `compare-selected compare-selected-${compareSlot + 1}` : "",
                topRank ? "top-priority-row" : "",
                topRank ? `top-priority-row-${topRank}` : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
              <tr
                key={rowKey}
                className={rowClassName}
                onClick={() => onToggleComparisonDistrict?.(row.mapDistrict)}
              >
                <td>
                  {compareSlot >= 0 ? (
                    <span
                      className={`compare-slot-badge compare-slot-badge-${compareSlot + 1}`}
                      title={`Comparison slot ${compareSlot + 1}`}
                    >
                      C{compareSlot + 1}
                    </span>
                  ) : null}
                  {topRank ? (
                    <span className="top-priority-badge" title={`Top priority #${topRank}`}>
                      #{topRank}
                    </span>
                  ) : null}
                  {formatNumber(row.priority, 0)}
                </td>
                <td>
                  <strong>{row.mapDistrict}</strong>
                </td>
                <td className="alerts-table-sparkline-cell">
                  <CaseSparkline
                    values={row.caseSparkline}
                    weeks={row.caseSparklineWeeks}
                    status={row.status}
                  />
                </td>
                <td>{row.region || "-"}</td>
                <td>
                  <AlertStatusCell
                    earlyWarning={row.earlyWarning}
                    earlyDetection={row.earlyDetection}
                  />
                </td>
                <td>{formatNumber(row.latestObserved, 1, valueMode)}</td>
                <td>{formatNumber(row.latestForecast, 1, valueMode)}</td>
                <td>{formatNumber(row.activeThreshold, 1, valueMode)}</td>
                <td className={row.magnitude > 0 ? "positive-magnitude" : ""}>
                  {formatNumber(row.magnitude, 1, valueMode)}
                </td>
                <td className={row.magnitudePercent > 0 ? "positive-magnitude" : ""}>
                  {formatPercent(row.magnitudePercent)}
                </td>
                <td>{row.persistenceWeeks} wk</td>
                <td>{formatNumber(row.populationAtRisk, 0)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedRows.length > ROWS_PER_PAGE && (
        <div className="alerts-table-pagination">
          <span className="alerts-table-page-info">
            Showing {pageStart + 1}-{Math.min(pageStart + ROWS_PER_PAGE, sortedRows.length)} of{" "}
            {sortedRows.length}
          </span>
          <div className="alerts-table-page-controls">
            <button
              type="button"
              className="table-page-button"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              Previous
            </button>
            <span className="alerts-table-page-number">
              Page{" "}
              <label className="alerts-table-page-jump">
                <span className="sr-only">Go to page</span>
                <select
                  className="alerts-table-page-select"
                  value={safePage + 1}
                  onChange={(event) => setPage(Number(event.target.value) - 1)}
                  aria-label={`Go to page, ${pageCount} pages total`}
                >
                  {pageOptions.map((pageNumber) => (
                    <option key={pageNumber} value={pageNumber}>
                      {pageNumber}
                    </option>
                  ))}
                </select>
              </label>{" "}
              of {pageCount}
            </span>
            <button
              type="button"
              className="table-page-button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
