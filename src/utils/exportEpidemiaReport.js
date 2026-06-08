import jsPDF from "jspdf";
import { REPORT_SPECIES } from "./buildEpidemiaReportModel";
import { buildReportFilename } from "./reportScope";
import { REPORT_EXPORT_CONFIG, waitForPaint } from "./reportExportConfig";

const MARGIN = 40;
const ROW_HEIGHT = 14;
const HEADER_HEIGHT = 18;
const FOOTER_Y_OFFSET = 24;

function formatReportDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatCompiledDate() {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

async function captureElement(element, scale = REPORT_EXPORT_CONFIG.mapCaptureScale) {
  if (!element) return null;
  const html2canvas = (await import("html2canvas")).default;
  return html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });
}

/** Wait for map repaint then capture (faster than a fixed long delay). */
export async function captureReportMap(element) {
  await waitForPaint(REPORT_EXPORT_CONFIG.mapCaptureDelayMs);
  return captureElement(element);
}

function addImageFitWidth(pdf, imageData, x, y, maxWidth, maxHeight) {
  const props = pdf.getImageProperties(imageData);
  const ratio = props.width / props.height;
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  const format = String(imageData).startsWith("data:image/png") ? "PNG" : "JPEG";
  pdf.addImage(imageData, format, x, y, width, height);
  return y + height + 16;
}

function addCanvasFitWidth(pdf, canvas, x, y, maxWidth, maxHeight) {
  return addImageFitWidth(pdf, canvas.toDataURL("image/png"), x, y, maxWidth, maxHeight);
}

function writePageHeader(pdf, title, subtitle, headerLine) {
  if (headerLine) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(110, 110, 110);
    pdf.text(headerLine, pdf.internal.pageSize.getWidth() - MARGIN, 28, { align: "right" });
  }

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

function writeFooter(pdf) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    `Report compiled on ${formatCompiledDate()}`,
    pdf.internal.pageSize.getWidth() - MARGIN,
    pdf.internal.pageSize.getHeight() - FOOTER_Y_OFFSET,
    { align: "right" }
  );
}

function writeWrappedText(pdf, text, x, y, maxWidth, lineHeight = 12) {
  const lines = pdf.splitTextToSize(text, maxWidth);
  lines.forEach((line) => {
    pdf.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function drawAlertListingTable(pdf, rows, yStart) {
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxY = pageHeight - MARGIN - 80;
  let y = yStart;

  const drawHeader = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("Region", MARGIN, y);
    pdf.text("District", MARGIN + 120, y);
    pdf.text("Early Detection", MARGIN + 300, y);
    pdf.text("Early Warning", MARGIN + 410, y);
    pdf.text("Both", MARGIN + 520, y);
    pdf.setFont("helvetica", "normal");
    y += HEADER_HEIGHT;
  };

  drawHeader();

  if (!rows.length) {
    pdf.setFontSize(10);
    pdf.text("No districts with Medium or High alert levels.", MARGIN, y);
    return y + 16;
  }

  rows.forEach((row) => {
    if (y + ROW_HEIGHT > maxY) {
      pdf.addPage();
      writePageHeader(pdf, "Alert Listing (continued)", "", null);
      y = 90;
      drawHeader();
    }
    pdf.setFontSize(8);
    pdf.text(String(row.region || "—").slice(0, 22), MARGIN, y);
    pdf.text(String(row.mapDistrict || "—").slice(0, 28), MARGIN + 120, y);
    pdf.text(String(row.edLevel || "—"), MARGIN + 300, y);
    pdf.text(String(row.ewLevel || "—"), MARGIN + 410, y);
    pdf.text(String(row.both || "—"), MARGIN + 520, y);
    y += ROW_HEIGHT;
  });

  return y;
}

function writeAlertListingCaptions(pdf, y) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const width = pageWidth - MARGIN * 2;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(50, 50, 50);

  y = writeWrappedText(
    pdf,
    "Early Detection Alerts are alerts generated during the early detection period, based on reported incidence in those weeks. High indicates two or more weeks above threshold, Medium one week, and Low no alert weeks.",
    MARGIN,
    y,
    width
  );
  y += 6;
  y = writeWrappedText(
    pdf,
    "Early Warning Alerts are alerts generated during the forecast period, based on forecast values relative to alert thresholds. High indicates two or more weeks, Medium one week, and Low zero alert weeks.",
    MARGIN,
    y,
    width
  );
  y += 6;
  return writeWrappedText(
    pdf,
    "The Both column indicates districts with Medium or High levels for both Early Detection and Early Warning.",
    MARGIN,
    y,
    width
  );
}

function writeBackgroundSection(pdf, reportModel) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const width = pageWidth - MARGIN * 2;
  let y = 90;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Background", MARGIN, 52);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(20, 20, 20);

  y = writeWrappedText(
    pdf,
    "The EPIDEMIA platform integrates malaria surveillance with environmental data to support monitoring and forecasting of malaria risk.",
    MARGIN,
    y,
    width
  );
  y += 10;
  y = writeWrappedText(
    pdf,
    `This report presents environmental and epidemiological surveillance and forecasting results for ${reportModel.districtRows.length} districts across ${reportModel.observedWeekCount || "the available"} observed weeks and ${reportModel.periods.earlyWarning.weeks} forecast weeks.`,
    MARGIN,
    y,
    width
  );
  y += 12;

  const bullets = [
    `Alerts are generated using a Farrington-style anomaly detection algorithm over observed and forecast incidence adjusted for population.`,
    `Early Detection Alerts summarize the last ${reportModel.periods.earlyDetection.weeks} observed weeks (${reportModel.periods.earlyDetection.startLabel} through ${reportModel.periods.earlyDetection.endLabel}).`,
    `Early Warning Alerts summarize the forecast period (${reportModel.periods.earlyWarning.startLabel} through ${reportModel.periods.earlyWarning.endLabel}).`,
    "Individual woreda control charts show observed incidence, forecast trend, alert thresholds, and early detection / early warning periods aligned with the R EPIDEMIA demo report.",
    "Environmental anomaly maps and daily-resolution environmental panels from the R demo are available in the interactive dashboard; this export focuses on alert summaries and district control charts.",
  ];

  bullets.forEach((bullet) => {
    y = writeWrappedText(pdf, `• ${bullet}`, MARGIN, y, width);
    y += 4;
  });

  writeFooter(pdf);
}

/**
 * Export a PDF aligned with epidemia_report_demo.Rnw section structure.
 */
export async function exportEpidemiaReport({
  reportModel,
  mapCaptures = {},
  districtChartImages = new Map(),
  generatedAt,
  country,
}) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const headerLine = reportModel.headerLine;

  // Title page
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(reportModel.title, MARGIN, 70);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(reportModel.subtitle, MARGIN, 96);
  pdf.setFontSize(11);
  let y = 130;
  [
    `Country: ${country}`,
    `Report scope: ${reportModel.scopeDescription || country}`,
    `Districts in report: ${reportModel.districtRows.length}`,
    `Forecast updated: ${formatReportDate(generatedAt)}`,
    `Control chart values: ${reportModel.chartValueModeLabel || "Cases"}`,
    `Early detection period: ${reportModel.periods.earlyDetection.startLabel} – ${reportModel.periods.earlyDetection.endLabel}`,
    `Early warning period: ${reportModel.periods.earlyWarning.startLabel} – ${reportModel.periods.earlyWarning.endLabel}`,
  ].forEach((line) => {
    pdf.text(line, MARGIN, y);
    y += 16;
  });
  writeFooter(pdf);

  // Section 1 — Alert Summaries
  for (const species of REPORT_SPECIES) {
    pdf.addPage();
    writePageHeader(
      pdf,
      "Alert Summaries",
      `${species.label} · Early Detection and Early Warning maps`,
      headerLine
    );

    let mapY = 82;
    const edCanvas = mapCaptures[`${species.code}-ed`];
    const ewCanvas = mapCaptures[`${species.code}-ew`];

    if (edCanvas) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Early Detection Alerts", MARGIN, mapY);
      mapY += 8;
      mapY = addCanvasFitWidth(pdf, edCanvas, MARGIN, mapY, contentWidth, (pageHeight - mapY) / 2 - 20);
    }

    if (ewCanvas) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text("Early Warning Alerts", MARGIN, mapY);
      mapY += 8;
      addCanvasFitWidth(pdf, ewCanvas, MARGIN, mapY, contentWidth, pageHeight - mapY - MARGIN);
    }

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(
      `Early Detection: last ${reportModel.periods.earlyDetection.weeks} weeks · Early Warning: ${reportModel.periods.earlyWarning.weeks} forecast weeks`,
      pageWidth - MARGIN,
      pageHeight - 52,
      { align: "right" }
    );
    writeFooter(pdf);

    pdf.addPage();
    writePageHeader(pdf, "Alert Listing", species.label, headerLine);
    const listingY = drawAlertListingTable(
      pdf,
      reportModel.alertListings[species.code] || [],
      90
    );
    writeAlertListingCaptions(pdf, Math.min(listingY + 12, pageHeight - 120));
    writeFooter(pdf);
  }

  // Section 2 — Woreda Reports
  if (reportModel.woredaPageMode !== "none" && reportModel.districtRows.length > 0) {
    pdf.addPage();
    writePageHeader(
      pdf,
      "Woreda Reports",
      `${reportModel.woredaDistrictCount ?? reportModel.districtRows.length} districts · dual-species control charts`,
      headerLine
    );
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    writeWrappedText(
      pdf,
      reportModel.woredaPageMode === "alerts"
        ? "Includes control charts for districts with Medium or High early detection or early warning levels."
        : "Each district page shows P. falciparum (and mixed) and P. vivax control charts with early detection and early warning periods, alert thresholds, and alert markers.",
      MARGIN,
      88,
      contentWidth
    );
    writeFooter(pdf);

    const woredaRows =
      reportModel.woredaDistrictRows?.length > 0
        ? reportModel.woredaDistrictRows
        : reportModel.districtRows;

    for (const row of woredaRows) {
      const chartImage = districtChartImages.get(row.mapDistrict);
      if (!chartImage) continue;

      pdf.addPage();
      writePageHeader(
        pdf,
        `${row.region}: ${row.mapDistrict}`,
        "Control charts · incidence and forecast",
        headerLine
      );
      addImageFitWidth(pdf, chartImage, MARGIN, 82, contentWidth, pageHeight - 110);
      writeFooter(pdf);
    }
  }

  // Section 3 — Maps (incidence by species)
  for (const species of REPORT_SPECIES) {
    const incidenceCanvas = mapCaptures[`${species.code}-incidence`];
    if (!incidenceCanvas) continue;
    pdf.addPage();
    writePageHeader(
      pdf,
      "Maps",
      `${species.label} · average weekly incidence in selected period`,
      headerLine
    );
    addCanvasFitWidth(pdf, incidenceCanvas, MARGIN, 82, contentWidth, pageHeight - 110);
    writeFooter(pdf);
  }

  // Section 4 — Background
  pdf.addPage();
  writeBackgroundSection(pdf, reportModel);

  const fileDate = new Date().toISOString().slice(0, 10);
  const filename =
    reportModel.scopeContext != null
      ? buildReportFilename(reportModel.scopeContext)
      : `EPIDEMIA_Report_Ethiopia_${fileDate}.pdf`;
  pdf.save(filename);
}

export { captureElement };
