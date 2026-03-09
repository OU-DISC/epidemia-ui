import Plot from "react-plotly.js";

export default function ForecastChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="chart-state">No forecast data available</div>;
  }

  const dates = data.map((d) => d.date);
  const upper = data.map((d) => d.upper);
  const lower = data.map((d) => d.lower);
  const median = data.map((d) => d.median);
  const observed = data.map((d) => d.observed);

  return (
    <div className="forecast-chart-wrap">
      <Plot
        data={[
          {
            x: dates,
            y: upper,
            type: "scatter",
            mode: "lines",
            line: { width: 0 },
            hoverinfo: "skip",
            showlegend: false,
            name: "Upper",
          },
          {
            x: dates,
            y: lower,
            type: "scatter",
            mode: "lines",
            line: { width: 0 },
            fill: "tonexty",
            fillcolor: "rgba(126, 201, 189, 0.22)",
            name: "Uncertainty",
            hovertemplate: "Lower: %{y:.2f}<extra></extra>",
          },
          {
            x: dates,
            y: median,
            type: "scatter",
            mode: "lines",
            name: "Forecast Median",
            line: { color: "#e04848", width: 2.5 },
            hovertemplate: "Median: %{y:.2f}<extra></extra>",
          },
          {
            x: dates,
            y: observed,
            type: "scatter",
            mode: "lines+markers",
            name: "Observed",
            line: { color: "#1f5b9b", width: 2 },
            marker: { size: 5, color: "#1f5b9b" },
            hovertemplate: "Observed: %{y:.2f}<extra></extra>",
          },
        ]}
        layout={{
          autosize: true,
          height: 350,
          margin: { l: 52, r: 24, t: 16, b: 52 },
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(255,255,255,0.5)",
          xaxis: {
            title: "Date",
            gridcolor: "#e2e8f1",
            zeroline: false,
            tickfont: { color: "#495367" },
            titlefont: { color: "#495367" },
          },
          yaxis: {
            title: "Cases",
            gridcolor: "#e2e8f1",
            zeroline: false,
            tickfont: { color: "#495367" },
            titlefont: { color: "#495367" },
          },
          legend: {
            orientation: "h",
            y: 1.12,
            x: 0,
            font: { size: 11 },
          },
          hovermode: "x unified",
        }}
        config={{
          responsive: true,
          displaylogo: false,
          scrollZoom: true,
          modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d"],
        }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
