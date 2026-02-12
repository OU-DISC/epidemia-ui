import { useState } from "react";
import EthiopiaMap from "./components/EthiopiaMap";
import ForecastChart from "./components/ForecastChart";
import { fetchForecast } from "./api";
import TopToolbar from "./components/layout/TopToolbar";

function App() {
  const [region, setRegion] = useState("Gondar");
  const [forecast, setForecast] = useState(null);
  const [alert, setAlert] = useState(null);
  const [forecastWeeks, setForecastWeeks] = useState(8);


  async function updateRegion(regionName) {
  setRegion(regionName);
  const data = await fetchForecast(regionName, forecastWeeks);
  setForecast(data.forecast);
  setAlert(data.alerts);
}


  return (
  <div>
    <TopToolbar
      forecastWeeks={forecastWeeks}
      onChangeForecastWeeks={setForecastWeeks}
      onExportPDF={() => alert("PDF export coming soon")}
    />

    <div style={{ padding: "1rem" }}>
      <h2>Malaria Early Warning (Ethiopia)</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <EthiopiaMap onSelectRegion={updateRegion} />

        <div>
          <h4>{region}</h4>

          {alert && (
            <div>
              {alert.early_warning && <span style={{ color: "red" }}>⚠ Early Warning</span>}
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

export default App;
