// TopToolbar.jsx
import React from "react";

function TopToolbar({
  disease,
  onChangeDisease,
  country,
  onChangeCountry,
  forecastWeeks,
  onChangeForecastWeeks,
  onExportPDF
}) {
  const diseases = ["Malaria", "West Nile"];
  const countries = ["Ethiopia", "USA"];

  const selectStyle = {
    marginLeft: "0.5rem",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    border: "1px solid #ccc",
    background: "#fff",
  };

  const labelStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    fontWeight: "500"
  };

  const buttonStyle = {
    padding: "0.4rem 0.8rem",
    borderRadius: "4px",
    border: "none",
    background: "#007bff",
    color: "#fff",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.75rem 1rem",
        background: "#f5f7fa",
        borderBottom: "1px solid #ddd"
      }}
    >
      <strong>EPIDEMIA</strong>

      <label style={labelStyle}>
        Disease:
        <select
          value={disease}
          onChange={(e) => onChangeDisease(e.target.value)}
          style={selectStyle}
        >
          {diseases.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Country:
        <select
          value={country}
          onChange={(e) => onChangeCountry(e.target.value)}
          style={selectStyle}
        >
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <div style={{ marginLeft: "auto", display: "flex", gap: "0.75rem" }}>
        <label style={labelStyle}>
          Forecast:
          <select
            value={forecastWeeks}
            onChange={(e) => onChangeForecastWeeks(Number(e.target.value))}
            style={selectStyle}
          >
            <option value={4}>4 weeks</option>
            <option value={8}>8 weeks</option>
            <option value={12}>12 weeks</option>
          </select>
        </label>

        <button onClick={onExportPDF} style={buttonStyle}>
          Export PDF
        </button>
      </div>
    </div>
  );
}

export default TopToolbar;
