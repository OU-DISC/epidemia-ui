import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const MARGIN = 40;
const ROW_HEIGHT = 14;
const HEADER_HEIGHT = 18;

function formatReportDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

async function captureElement(element, scale = 2) {
  if (!element) return null;
  return html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });
}

function addImageFitWidth(pdf, canvas, x, y, maxWidth, maxHeight) {
  const ratio = canvas.width / canvas.height;
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, width, height);
  return y + height + 16;
}

function writePageHeader(pdf, title, subtitle) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(20, 20, 20);
  pdf.text(title, MARGIN, 52);
  if (subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(90, 90, 90);
    pdf.text(subtitle, MARGIN, 68);
    pdf.setTextColor(20, 20, 20);
  }
}

function drawTableHeader(pdf, y) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("District", MARGIN, y);
  pdf.text("Region", MARGIN + 150, y);
  pdf.text("Status", MARGIN + 250, y);
  pdf.text("Obs", MARGIN + 340, y);
  pdf.text("Fc", MARGIN + 385, y);
  pdf.text("Thr", MARGIN + 425, y);
  pdf.text("Mag %", MARGIN + 470, y);
  pdf.text("Pop", MARGIN + 520, y);
  pdf.setFont("helvetica", "normal");
  return y + HEADER_HEIGHT;
}

function drawTableRow(pdf, row, y) {
  pdf.setFontSize(8);
  pdf.text(String(row.mapDistrict || "—").slice(0, 28), MARGIN, y);
  pdf.text(String(row.region || "—").slice(0, 18), MARGIN + 150, y);
  pdf.text(String(row.status || "—").slice(0, 16), MARGIN + 250, y);
  pdf.text(formatNumber(row.latestObserved, 1), MARGIN + 340, y);
  pdf.text(formatNumber(row.latestForecast, 1), MARGIN + 385, y);
  pdf.text(formatNumber(row.activeThreshold, 1), MARGIN + 425, y);
  pdf.text(
    row.magnitudePercent != null ? `${formatNumber(row.magnitudePercent, 1)}%` : "—",
    MARGIN + 470,
    y
  );
  pdf.text(formatNumber(row.populationAtRisk, 0), MARGIN + 520, y);
  return y + ROW_HEIGHT;
}

function drawAlertsTablePages(pdf, rows) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxY = pageHeight - MARGIN;
  let y = drawTableHeader(pdf, 90);

  rows.forEach((row) => {
    if (y + ROW_HEIGHT > maxY) {
      pdf.addPage();
      writePageHeader(pdf, "District Forecast Alerts (continued)", "Sorted by priority");
      y = drawTableHeader(pdf, 90);
    }
    y = drawTableRow(pdf, row, y);
  });
}

export async function exportWeeklyReport({
  disease,
  country,
  speciesLabel,
  generatedAt,
  summary,
  topAlerts,
  tableRows,
  selectedDistrict,
  selectedDistrictInsight,
  dateRange,
}) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("EPIDEMIA Weekly Surveillance Report", MARGIN, 55);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  let y = 88;
  const metaLines = [
    `Disease: ${disease}`,
    `Country: ${country}`,
    `Species: ${speciesLabel}`,
    `Report generated: ${formatReportDate(new Date())}`,
    `Forecast updated: ${formatReportDate(generatedAt)}`,
    `Analysis period: ${dateRange?.startDate || "—"} to ${dateRange?.endDate || "—"}`,
  ];
  metaLines.forEach((line) => {
    pdf.text(line, MARGIN, y);
    y += 16;
  });

  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("Situation Summary", MARGIN, y);
  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  [
    `Early Warnings: ${summary?.warnings ?? 0}`,
    `Early Detections: ${summary?.detections ?? 0}`,
    `Districts Modeled: ${summary?.districts ?? 0}`,
  ].forEach((line) => {
    pdf.text(line, MARGIN, y);
    y += 16;
  });

  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("Top Priority Alerts", MARGIN, y);
  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  if (!topAlerts?.length) {
    pdf.text("No active early warning or detection alerts.", MARGIN, y);
  } else {
    topAlerts.forEach((row, index) => {
      const magnitude =
        row.magnitudePercent != null && row.magnitudePercent > 0
          ? ` · ${formatNumber(row.magnitudePercent, 1)}% above threshold`
          : "";
      pdf.text(
        `${index + 1}. ${row.mapDistrict} (${row.region || "Unknown region"}) — ${row.status}${magnitude}`,
        MARGIN,
        y
      );
      y += 14;
    });
  }

  pdf.addPage();
  writePageHeader(pdf, "District Map Snapshot", "Current map view with alerts and health layers");
  const mapCanvas = await captureElement(document.getElementById("epidemia-report-map"));
  if (mapCanvas) {
    addImageFitWidth(pdf, mapCanvas, MARGIN, 82, contentWidth, pageHeight - 110);
  } else {
    pdf.setFontSize(11);
    pdf.text("Map snapshot unavailable.", MARGIN, 100);
  }

  pdf.addPage();
  writePageHeader(
    pdf,
    "District Forecast Alerts",
    `Sorted by priority · ${tableRows?.length ?? 0} districts`
  );
  const sortedRows = [...(tableRows || [])].sort((a, b) => b.priority - a.priority);
  drawAlertsTablePages(pdf, sortedRows);

  if (selectedDistrict && selectedDistrict !== "All Regions") {
    pdf.addPage();
    writePageHeader(
      pdf,
      `District Focus: ${selectedDistrict}`,
      `${speciesLabel} · environmental and transmission charts`
    );

    if (selectedDistrictInsight) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(
        `Status: ${selectedDistrictInsight.status} · Observed ${formatNumber(selectedDistrictInsight.latestObserved, 1)} · Forecast ${formatNumber(selectedDistrictInsight.latestForecast, 1)} · Threshold ${formatNumber(selectedDistrictInsight.activeThreshold, 1)}`,
        MARGIN,
        86
      );
    }

    let chartY = 104;
    const envCanvas = await captureElement(document.getElementById("epidemia-report-env-chart"));
    if (envCanvas) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Environmental Time Series", MARGIN, chartY);
      chartY += 8;
      chartY = addImageFitWidth(
        pdf,
        envCanvas,
        MARGIN,
        chartY,
        contentWidth,
        (pageHeight - chartY) / 2 - 12
      );
    }

    const forecastCanvas = await captureElement(
      document.getElementById("epidemia-report-forecast-chart")
    );
    if (forecastCanvas) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Transmission Forecast", MARGIN, chartY);
      chartY += 8;
      addImageFitWidth(pdf, forecastCanvas, MARGIN, chartY, contentWidth, pageHeight - chartY - MARGIN);
    }

    if (!envCanvas && !forecastCanvas) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.text("Charts unavailable for the selected district.", MARGIN, 120);
    }
  }

  const fileDate = new Date().toISOString().slice(0, 10);
  pdf.save(`EPIDEMIA_Weekly_Report_${fileDate}.pdf`);
}
