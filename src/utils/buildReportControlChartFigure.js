import Plotly from "./plotly";
import { buildForecastChartLayers } from "./buildForecastChartLayers";
import { buildDistrictForecastSeries } from "./buildDistrictForecastSeries";
import { REPORT_EXPORT_CONFIG, runPool } from "./reportExportConfig";

function buildSpeciesPanelTraces(rows, subplotIndex) {
  const chartLayers = buildForecastChartLayers(rows);
  const forecastPoints = rows.filter((point) => point.median != null);
  const observedPoints = rows.filter((point) => point.observed != null);

  const xAxis = subplotIndex === 1 ? "x" : `x${subplotIndex}`;
  const yAxis = subplotIndex === 1 ? "y" : `y${subplotIndex}`;

  const traces = [];

  if (forecastPoints.length > 0) {
    traces.push({
      x: forecastPoints.map((point) => point.date),
      y: forecastPoints.map((point) => point.upper),
      type: "scatter",
      mode: "lines",
      line: { width: 0 },
      hoverinfo: "skip",
      showlegend: false,
      xaxis: xAxis,
      yaxis: yAxis,
    });
    traces.push({
      x: forecastPoints.map((point) => point.date),
      y: forecastPoints.map((point) => point.lower),
      type: "scatter",
      mode: "lines",
      line: { width: 0 },
      fill: "tonexty",
      fillcolor: "rgba(126, 201, 189, 0.18)",
      name: subplotIndex === 1 ? "Uncertainty" : undefined,
      showlegend: subplotIndex === 1,
      xaxis: xAxis,
      yaxis: yAxis,
    });
  }

  if (chartLayers.thresholdTrace) {
    traces.push({
      ...chartLayers.thresholdTrace,
      showlegend: subplotIndex === 1,
      xaxis: xAxis,
      yaxis: yAxis,
    });
  }

  if (forecastPoints.length > 0) {
    traces.push({
      x: forecastPoints.map((point) => point.date),
      y: forecastPoints.map((point) => point.median),
      type: "scatter",
      mode: "lines+markers",
      name: subplotIndex === 1 ? "Forecast Trend" : undefined,
      showlegend: subplotIndex === 1,
      line: { color: "#9b59b6", width: 2 },
      marker: { size: 4, color: "#9b59b6" },
      xaxis: xAxis,
      yaxis: yAxis,
    });
  }

  if (observedPoints.length > 0) {
    traces.push({
      x: observedPoints.map((point) => point.date),
      y: observedPoints.map((point) => point.observed),
      type: "scatter",
      mode: "lines+markers",
      name: subplotIndex === 1 ? "Observed" : undefined,
      showlegend: subplotIndex === 1,
      line: { color: "#1f5b9b", width: 2 },
      marker: { size: 4, color: "#1f5b9b" },
      xaxis: xAxis,
      yaxis: yAxis,
    });
  }

  if (chartLayers.edAlertTrace) {
    traces.push({
      ...chartLayers.edAlertTrace,
      showlegend: subplotIndex === 1,
      xaxis: xAxis,
      yaxis: yAxis,
    });
  }

  if (chartLayers.ewAlertTrace) {
    traces.push({
      ...chartLayers.ewAlertTrace,
      showlegend: subplotIndex === 1,
      xaxis: xAxis,
      yaxis: yAxis,
    });
  }

  const shapes = (chartLayers.shapes || []).map((shape) => ({
    ...shape,
    xref: xAxis,
    yref: shape.yref === "paper" ? `${yAxis} domain` : yAxis,
  }));

  const annotations = (chartLayers.annotations || []).map((annotation) => ({
    ...annotation,
    xref: xAxis,
    yref: `${yAxis} domain`,
  }));

  return { traces, shapes, annotations, yAxis };
}

export function buildDistrictControlChartFigure({
  epidemiaData,
  adm3Lookup,
  districtName,
  startDate,
  endDate,
  speciesPanels = [
    { code: "pfm", title: "P. falciparum and mixed" },
    { code: "pv", title: "P. vivax" },
  ],
}) {
  const allTraces = [];
  const allShapes = [];
  const allAnnotations = [];
  const layout = {
    width: REPORT_EXPORT_CONFIG.chartWidth,
    height: REPORT_EXPORT_CONFIG.chartHeight,
    margin: { l: 58, r: 24, t: 48, b: 48 },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    showlegend: true,
    legend: { orientation: "h", y: 1.12, x: 0, font: { size: 10 } },
    grid: { rows: speciesPanels.length, columns: 1, pattern: "independent", roworder: "top to bottom" },
  };

  speciesPanels.forEach((panel, index) => {
    const series = buildDistrictForecastSeries(
      epidemiaData,
      adm3Lookup,
      districtName,
      panel.code,
      startDate,
      endDate
    );
    const rows = series?.rows || [];
    const { traces, shapes, annotations, yAxis } = buildSpeciesPanelTraces(rows, index + 1);

    allTraces.push(...traces);
    allShapes.push(...shapes);
    allAnnotations.push(...annotations);

    layout[yAxis] = {
      title: { text: panel.title, font: { size: 11 } },
      rangemode: "tozero",
      gridcolor: "#e5e7eb",
      zeroline: false,
    };
    layout[`xaxis${index === 0 ? "" : index + 1}`] = {
      title: index === speciesPanels.length - 1 ? { text: "Week", font: { size: 10 } } : undefined,
      showticklabels: true,
      tickfont: { size: 9 },
    };
  });

  layout.shapes = allShapes;
  layout.annotations = allAnnotations;

  return { data: allTraces, layout };
}

export async function renderDistrictControlChartImage(options) {
  const figure = buildDistrictControlChartFigure(options);
  if (!figure.data.length) return null;

  return Plotly.toImage(figure, {
    format: "jpeg",
    width: figure.layout.width,
    height: figure.layout.height,
    scale: 1,
  });
}

export async function renderAllDistrictControlChartImages({
  epidemiaData,
  adm3Lookup,
  districtRows,
  startDate,
  endDate,
  onProgress,
  concurrency = REPORT_EXPORT_CONFIG.chartConcurrency,
}) {
  const total = districtRows.length;
  let completed = 0;

  return runPool(districtRows, concurrency, async (row) => {
    const dataUrl = await renderDistrictControlChartImage({
      epidemiaData,
      adm3Lookup,
      districtName: row.mapDistrict,
      startDate,
      endDate,
    });

    completed += 1;
    onProgress?.({
      phase: "woreda-charts",
      current: completed,
      total,
      district: row.mapDistrict,
    });

    if (!dataUrl) return null;
    return { key: row.mapDistrict, value: dataUrl };
  });
}
