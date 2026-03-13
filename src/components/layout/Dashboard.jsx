// Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import TopToolbar from "./TopToolbar";
import EthiopiaMap from "../EthiopiaMap";
import EnvironmentalDataControls from "../EnvironmentalDataControls";
import ForecastChart from "../ForecastChart";
import EnvironmentalTimeSeriesChart from "../EnvironmentalTimeSeriesChart";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { runEpidemiaPipeline } from "../../api";
import "./dashboard-theme.css";

function Dashboard() {
  const [disease, setDisease] = useState("Malaria");
  const [country, setCountry] = useState("Ethiopia");
  const [forecastWeeks, setForecastWeeks] = useState(4);
  const [selectedAdminRegion, setSelectedAdminRegion] = useState("All Regions"); // Admin region filter
  const [region, setRegion] = useState("All Regions");
  const [selectedGeometry, setSelectedGeometry] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [regions, setRegions] = useState([]); // List of available regions
  const [epidemiaData, setEpidemiaData] = useState(null);
  const [epidemiaLoading, setEpidemiaLoading] = useState(false);
  const [epidemiaError, setEpidemiaError] = useState("");

  // 🌱 Environmental data states
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-03-07");
  const [dataset, setDataset] = useState("totprec");
  const [geoData, setGeoData] = useState(null);
  const [envData, setEnvData] = useState({});
  const [syncedHoverDate, setSyncedHoverDate] = useState(null);

  const selectedSpecies = disease === "Malaria" ? "pfm" : "pv";

  const loadEpidemia = async () => {
    setEpidemiaLoading(true);
    setEpidemiaError("");
    try {
      const data = await runEpidemiaPipeline({
        horizonWeeks: forecastWeeks,
        dataDir: "data",
        outputDir: "report",
        createReport: false,
      });
      setEpidemiaData(data);
    } catch (err) {
      console.error("Failed to run EPIDEMIA pipeline:", err);
      if (err.code === "ERR_NETWORK") {
        setEpidemiaError("Cannot reach forecasting API at http://127.0.0.1:8000. Start backend server and try Refresh Forecast again.");
      } else {
        setEpidemiaError(err.response?.data?.detail || err.message || "Failed to run EPIDEMIA pipeline");
      }
    } finally {
      setEpidemiaLoading(false);
    }
  };

  useEffect(() => {
    loadEpidemia();
  }, [forecastWeeks]);

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
  };

  const selectedAlert = useMemo(() => {
    if (!epidemiaData?.alerts || region === "All Regions") return null;
    return (
      epidemiaData.alerts.find(
        (a) => a.district === region && a.species === selectedSpecies
      ) || null
    );
  }, [epidemiaData, region, selectedSpecies]);

  const selectedForecast = useMemo(() => {
    if (!epidemiaData?.forecasts || region === "All Regions") return null;
    const districtFc = epidemiaData.forecasts.find(
      (f) => f.district === region && f.species === selectedSpecies
    );
    if (!districtFc) return null;

    let observedRows = (districtFc.observed_history || []).map((point) => ({
      date: point.week_start,
      median: null,
      lower: null,
      upper: null,
      observed: point.observed,
    }));

    // Backward-compatible fallback for responses from older backend processes.
    if (observedRows.length === 0 && selectedAlert?.latest_observed != null && districtFc.forecast?.length) {
      observedRows = [
        {
          date: districtFc.forecast[0].week_start,
          median: null,
          lower: null,
          upper: null,
          observed: selectedAlert.latest_observed,
        },
      ];
    }

    const forecastRows = districtFc.forecast.map((point) => ({
      date: point.week_start,
      median: point.median,
      lower: point.lower,
      upper: point.upper,
      observed: null,
    }));

    return [...observedRows, ...forecastRows];
  }, [epidemiaData, region, selectedSpecies, selectedAlert]);

  const forecastSummary = useMemo(() => {
    const alerts = epidemiaData?.alerts || [];
    const speciesAlerts = alerts.filter((a) => a.species === selectedSpecies);
    const warningCount = speciesAlerts.filter((a) => a.early_warning).length;
    const detectionCount = speciesAlerts.filter(
      (a) => !a.early_warning && a.early_detection
    ).length;
    return {
      districts: speciesAlerts.length,
      warnings: warningCount,
      detections: detectionCount,
    };
  }, [epidemiaData, selectedSpecies]);

  const forecastDateWindow = useMemo(() => {
    if (!selectedForecast || selectedForecast.length === 0) return null;

    const dates = selectedForecast
      .map((point) => point.date)
      .filter(Boolean)
      .sort();

    if (dates.length === 0) return null;

    return {
      startDate: dates[0],
      endDate: dates[dates.length - 1],
    };
  }, [selectedForecast]);



  // PDF export function
  const handleExportPDF = () => {
    const element = document.getElementById("dashboard");
    if (!element) return window.alert("Dashboard content not found!");

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
        onRefreshForecast={loadEpidemia}
        refreshingForecast={epidemiaLoading}
        onExportPDF={handleExportPDF}
        exporting={exporting}
      />

      <main className="dashboard-content">
        <section className="dashboard-hero fade-in-up">
          <p className="dashboard-kicker">Real-Time Surveillance Platform</p>
          <h1 className="dashboard-title">{disease} Early Warning ({country})</h1>
        </section>

        <section className="forecast-cards fade-in-up delay-1">
          <article className="glass-card forecast-card">
            <h4>Pipeline</h4>
            <p>{epidemiaLoading ? "Running" : epidemiaError ? "Error" : "Ready"}</p>
          </article>
          <article className="glass-card forecast-card">
            <h4>Early Warnings</h4>
            <p>{forecastSummary.warnings}</p>
          </article>
          <article className="glass-card forecast-card">
            <h4>Early Detections</h4>
            <p>{forecastSummary.detections}</p>
          </article>
          <article className="glass-card forecast-card">
            <h4>Districts Modeled</h4>
            <p>{forecastSummary.districts}</p>
          </article>
        </section>

        {/* Environmental controls */}
        <section className="glass-card fade-in-up delay-2">
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

            {epidemiaError && (
              <div className="chart-state chart-state-error">{epidemiaError}</div>
            )}

            {selectedAlert && (
              <div className="alert-row">
                {selectedAlert.early_warning && (
                  <span className="alert-warning">Early Warning</span>
                )}
                {!selectedAlert.early_warning && selectedAlert.early_detection && (
                  <span className="alert-detection">Early Detection</span>
                )}
              </div>
            )}

            {epidemiaLoading && (
              <div className="chart-state">Updating district forecast...</div>
            )}

            {/* Time series chart for selected district */}
            <EnvironmentalTimeSeriesChart
              selectedDistrict={region !== "All Regions" ? region : null}
              districtGeometry={selectedGeometry}
              startDate={forecastDateWindow?.startDate || startDate}
              endDate={forecastDateWindow?.endDate || endDate}
              dataset={dataset}
              syncedHoverDate={syncedHoverDate}
              onHoverDateChange={setSyncedHoverDate}
            />

            {selectedForecast && (
              <section className="forecast-panel">
                <h4>Transmission Forecast ({selectedSpecies.toUpperCase()})</h4>
                <ForecastChart
                  data={selectedForecast}
                  alert={selectedAlert}
                  syncedHoverDate={syncedHoverDate}
                  onHoverDateChange={setSyncedHoverDate}
                />
              </section>
            )}

            {!epidemiaLoading && !selectedForecast && region !== "All Regions" && (
              <div className="chart-state">No district forecast available for this selection.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
