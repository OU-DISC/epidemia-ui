// Dashboard.jsx
import React, { useState } from "react";
import TopToolbar from "./TopToolbar";
import EthiopiaMap from "../EthiopiaMap";
import EnvironmentalDataControls from "../EnvironmentalDataControls";
import ForecastChart from "../ForecastChart";
import EnvironmentalTimeSeriesChart from "../EnvironmentalTimeSeriesChart";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function Dashboard() {
  const [disease, setDisease] = useState("Malaria");
  const [country, setCountry] = useState("Ethiopia");
  const [forecastWeeks, setForecastWeeks] = useState(4);
  const [selectedAdminRegion, setSelectedAdminRegion] = useState("All Regions"); // Admin region filter
  const [region, setRegion] = useState("All Regions");
  const [selectedGeometry, setSelectedGeometry] = useState(null);
  const [alert, setAlert] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [regions, setRegions] = useState([]); // List of available regions

  // 🌱 Environmental data states
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-01-07");
  const [dataset, setDataset] = useState("NDVI");
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
    <div id="dashboard" style={{ fontFamily: "Arial, sans-serif" }}>
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

      <div style={{ padding: "1rem" }}>
        <h2>{disease} Early Warning ({country})</h2>

        {/* Environmental controls */}
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


        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          {/* Map */}
          <EthiopiaMap
            onSelectRegion={updateRegion}
            startDate={startDate}
            endDate={endDate}
            dataset={dataset}
            envData={envData}
            setGeoData={setGeoData}
            filterRegion={selectedAdminRegion}
          />

          {/* Region info and environmental time series chart */}
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

            {/* Time series chart for selected district */}
            <EnvironmentalTimeSeriesChart
              selectedDistrict={region !== "All Regions" ? region : null}
              districtGeometry={selectedGeometry}
              startDate={startDate}
              endDate={endDate}
              dataset={dataset}
              geoData={geoData}
            />

            {forecast && <ForecastChart data={forecast} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
