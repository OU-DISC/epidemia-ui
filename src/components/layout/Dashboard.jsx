// Dashboard.jsx
import React, { useState } from "react";
import TopToolbar from "./TopToolbar";
import EthiopiaMap from "../EthiopiaMap";
import ForecastChart from "../ForecastChart";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function Dashboard() {
  const [disease, setDisease] = useState("Malaria");
  const [country, setCountry] = useState("Ethiopia");
  const [forecastWeeks, setForecastWeeks] = useState(4);
  const [region, setRegion] = useState("All Regions");
  const [alert, setAlert] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [exporting, setExporting] = useState(false);

  const updateRegion = (selectedRegion) => {
    setRegion(selectedRegion);
    // TODO: Fetch new alert/forecast for this region if needed
  };

  // 🔹 PDF export function
  const handleExportPDF = () => {
    const element = document.getElementById("dashboard");
    if (!element) return alert("Dashboard content not found!");

    setExporting(true);

    html2canvas(element, { scale: 2, useCORS: true }).then((canvas) => {
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("landscape", "pt", "a4");

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save("EPIDEMIA_Report.pdf");

      setExporting(false);
    });
  };

  return (
    <div id="dashboard" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Top toolbar with dropdowns and export button */}
      <TopToolbar
        disease={disease}
        onChangeDisease={setDisease}
        country={country}
        onChangeCountry={setCountry}
        forecastWeeks={forecastWeeks}
        onChangeForecastWeeks={setForecastWeeks}
        onExportPDF={handleExportPDF}
        exporting={exporting}
      />

      <div style={{ padding: "1rem" }}>
        <h2>{disease} Early Warning ({country})</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          {/* Map */}
          <EthiopiaMap onSelectRegion={updateRegion} />

          {/* Region info and forecast chart */}
          <div>
            <h4>{region}</h4>

            {alert && (
              <div style={{ marginBottom: "1rem" }}>
                {alert.early_warning && (
                  <span style={{ color: "red" }}>⚠ Early Warning</span>
                )}
                {!alert.early_warning && alert.early_detection && (
                  <span style={{ color: "orange" }}>▲ Early Detection</span>
                )}
              </div>
            )}

            {forecast && <ForecastChart data={forecast} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
