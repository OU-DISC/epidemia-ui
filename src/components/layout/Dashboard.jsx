// Dashboard.jsx
import React, { useState } from "react";
import TopToolbar from "./TopToolbar";
import EthiopiaMap from "../EthiopiaMap";
import EnvironmentalDataControls from "../EnvironmentalDataControls";
import ForecastChart from "../ForecastChart";
import EnvironmentalTimeSeriesChart from "../EnvironmentalTimeSeriesChart";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "./dashboard-theme.css";

function Dashboard() {
  const [disease, setDisease] = useState("Malaria");
  const [country, setCountry] = useState("Ethiopia");
  const [forecastWeeks, setForecastWeeks] = useState(4);
  const [selectedAdminRegion, setSelectedAdminRegion] = useState("All Regions"); // Admin region filter
  const [region, setRegion] = useState("All Regions");
  const [selectedGeometry, setSelectedGeometry] = useState(null);
  const [alert] = useState(null);
  const [forecast] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [regions, setRegions] = useState([]); // List of available regions

  // 🌱 Environmental data states
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-03-07");
  const [dataset, setDataset] = useState("Precipitation");
  const [geoData, setGeoData] = useState(null);
  const [envData, setEnvData] = useState({});

  // Extract unique regions from geoData when it loads
  React.useEffect(() => {
    if (geoData && geoData.features) {
      const uniqueRegions = [
        "All Regions",
        ...new Set(geoData.features.map(f => f.properties.adm1_name).filter(Boolean))
      ].sort();
      setRegions(uniqueRegions);
    }
  }, [geoData]);

  // Update region when a district is clicked on the map
  const updateRegion = (selectedRegion) => {
    setRegion(selectedRegion);
    // Find and set the geometry for this district
    if (geoData) {
      const feature = geoData.features.find((f) => f.properties.adm3_name === selectedRegion);
      if (feature) {
        setSelectedGeometry(feature.geometry.coordinates);
      }
    }
    // TODO: Fetch new alert/forecast for this region if needed
  };



  // PDF export function
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
    <div id="dashboard" className="dashboard-shell">
      {/* Top toolbar */}
      <TopToolbar
        disease={disease}
        onChangeDisease={setDisease}
        country={country}
        onChangeCountry={setCountry}
        forecastWeeks={forecastWeeks}
        onChangeForecastWeeks={setForecastWeeks}
        selectedAdminRegion={selectedAdminRegion}
        onChangeAdminRegion={setSelectedAdminRegion}
        availableRegions={regions}
        onExportPDF={handleExportPDF}
        exporting={exporting}
      />

      <main className="dashboard-content">
        <section className="dashboard-hero fade-in-up">
          <p className="dashboard-kicker">Real-Time Surveillance Platform</p>
          <h1 className="dashboard-title">{disease} Early Warning ({country})</h1>
        </section>

        {/* Environmental controls */}
        <section className="glass-card fade-in-up delay-1">
          <EnvironmentalDataControls
            geoData={geoData}
            startDate={startDate}
            endDate={endDate}
            dataset={dataset}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            setDataset={setDataset}
            onDataFetched={setEnvData}
          />
        </section>


        <section className="dashboard-grid fade-in-up delay-2">
          {/* Map */}
          <div className="glass-card map-panel">
            <div className="panel-header">
              <h3>District Risk Surface</h3>
              <span>{dataset}</span>
            </div>

            <EthiopiaMap
              onSelectRegion={updateRegion}
              startDate={startDate}
              endDate={endDate}
              dataset={dataset}
              envData={envData}
              setGeoData={setGeoData}
              filterRegion={selectedAdminRegion}
            />
          </div>

          {/* Region info and environmental time series chart */}
          <div className="glass-card insights-panel">
            <div className="panel-header">
              <h3>{region}</h3>
              <span>District Insight</span>
            </div>

            {alert && (
              <div className="alert-row">
                {alert.early_warning && (
                  <span className="alert-warning">Early Warning</span>
                )}
                {!alert.early_warning && alert.early_detection && (
                  <span className="alert-detection">Early Detection</span>
                )}
              </div>
            )}

            {/* Time series chart for selected district */}
            <EnvironmentalTimeSeriesChart
              selectedDistrict={region !== "All Regions" ? region : null}
              districtGeometry={selectedGeometry}
              startDate={startDate}
              endDate={endDate}
              dataset={dataset}
            />

            {forecast && (
              <section className="forecast-panel">
                <h4>Transmission Forecast</h4>
                <ForecastChart data={forecast} />
              </section>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
