import { EARLY_DETECTION_SUMMARY_WEEKS } from "./buildForecastChartLayers";
import { findDistrictFromLookup } from "./districtNameMatch";
import { getForecastMetricLabel } from "./forecastValueMode";
import {
  REPORT_SCOPE_COUNTRY,
  buildReportTitle,
  filterAlertsByScope,
  filterDistrictRowsByScope,
  resolveReportScopeContext,
  scopeDescription,
} from "./reportScope";

export const REPORT_SPECIES = [
  { code: "pfm", label: "P. falciparum and mixed malaria" },
  { code: "pv", label: "P. vivax" },
];

function parseDate(value) {
  const ms = Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function formatLongDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function isoWeekLabel(date) {
  if (!date) return "—";
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()} Week ${week}`;
}

function shiftDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function collectObservedWeeks(epidemiaData) {
  const weeks = new Set();
  (epidemiaData?.forecasts || []).forEach((forecast) => {
    (forecast.observed_history || []).forEach((point) => {
      if (point?.week_start) weeks.add(String(point.week_start).slice(0, 10));
    });
  });
  return Array.from(weeks).sort();
}

function collectForecastWeeks(epidemiaData, species) {
  const weeks = new Set();
  (epidemiaData?.forecasts || [])
    .filter((forecast) => forecast.species === species)
    .forEach((forecast) => {
      (forecast.forecast || []).forEach((point) => {
        if (point?.week_start) weeks.add(String(point.week_start).slice(0, 10));
      });
    });
  return Array.from(weeks).sort();
}

export function buildEpidemiaReportModel({
  epidemiaData,
  adm3Lookup,
  horizonWeeks = 8,
  country = "Ethiopia",
  scope = REPORT_SCOPE_COUNTRY,
  selectedDistrict = null,
  selectedRegion = null,
  forecastValueMode = "cases",
}) {
  const scopeContext = resolveReportScopeContext(scope, {
    region: selectedDistrict,
    selectedAdminRegion: selectedRegion,
    adm3Lookup,
    country,
  });

  const scopedAlerts = filterAlertsByScope(epidemiaData?.alerts, adm3Lookup, scopeContext);
  const observedWeeks = collectObservedWeeks(epidemiaData);
  const lastObservedStr = observedWeeks[observedWeeks.length - 1] || null;
  const lastObserved = parseDate(lastObservedStr);
  const prevWeekStart = lastObserved ? shiftDays(lastObserved, -6) : null;

  const edStartIndex = Math.max(0, observedWeeks.length - EARLY_DETECTION_SUMMARY_WEEKS);
  const edWeeks = observedWeeks.slice(edStartIndex);
  const edStart = parseDate(edWeeks[0]);
  const edEnd = parseDate(edWeeks[edWeeks.length - 1]);

  const forecastWeeks = collectForecastWeeks(epidemiaData, "pfm");
  const ewStart = parseDate(forecastWeeks[0]);
  const ewEnd = parseDate(forecastWeeks[forecastWeeks.length - 1]);

  const reportWeekDates = lastObserved
    ? `${isoWeekLabel(lastObserved)}: ${formatLongDate(prevWeekStart)} - ${formatLongDate(lastObserved)}`
    : "Latest surveillance week";

  const alertsBySpecies = {};
  REPORT_SPECIES.forEach(({ code }) => {
    alertsBySpecies[code] = scopedAlerts.filter((alert) => alert.species === code);
  });

  const districtRows = [];
  const districtKeys = new Set();

  scopedAlerts.forEach((alert) => {
    const feature = findDistrictFromLookup(adm3Lookup, alert.district);
    const mapDistrict = feature?.properties?.adm3_name || alert.district;
    const region = feature?.properties?.adm1_name || "";
    const key = `${mapDistrict}`;
    if (districtKeys.has(key)) return;
    districtKeys.add(key);
    districtRows.push({
      mapDistrict,
      rawDistrict: alert.district,
      region,
    });
  });

  districtRows.sort((a, b) => {
    const regionCmp = a.region.localeCompare(b.region);
    if (regionCmp !== 0) return regionCmp;
    return a.mapDistrict.localeCompare(b.mapDistrict);
  });

  const alertListings = {};
  REPORT_SPECIES.forEach(({ code }) => {
    alertListings[code] = alertsBySpecies[code]
      .map((alert) => {
        const feature = findDistrictFromLookup(adm3Lookup, alert.district);
        const mapDistrict = feature?.properties?.adm3_name || alert.district;
        const region = feature?.properties?.adm1_name || "";
        const edLevel = alert.ed_level || "Low";
        const ewLevel = alert.ew_level || "Low";
        return {
          region,
          mapDistrict,
          edLevel,
          ewLevel,
          both: edLevel !== "Low" && ewLevel !== "Low" ? "Yes" : "-",
          includeInListing: edLevel !== "Low" || ewLevel !== "Low",
        };
      })
      .filter((row) => row.includeInListing)
      .sort((a, b) => {
        const regionCmp = a.region.localeCompare(b.region);
        if (regionCmp !== 0) return regionCmp;
        return a.mapDistrict.localeCompare(b.mapDistrict);
      });
  });

  const summaryCounts = REPORT_SPECIES.reduce((acc, { code }) => {
    const rows = alertsBySpecies[code] || [];
    acc[code] = {
      districts: rows.length,
      warnings: rows.filter((row) => row.early_warning).length,
      detections: rows.filter((row) => row.early_detection).length,
    };
    return acc;
  }, {});

  const scopedDistrictRows = filterDistrictRowsByScope(districtRows, scopeContext);
  const scopedAlertListings = {};
  REPORT_SPECIES.forEach(({ code }) => {
    scopedAlertListings[code] = filterDistrictRowsByScope(alertListings[code] || [], scopeContext);
  });

  return {
    title: buildReportTitle(scopeContext),
    subtitle: reportWeekDates,
    shortName: "EPIDEMIA Surveillance Report",
    headerLine: `${isoWeekLabel(lastObserved)} · ${scopeDescription(scopeContext)}`,
    scope: scopeContext.scope,
    scopeContext,
    scopeDescription: scopeDescription(scopeContext),
    generatedAt: epidemiaData?.generated_at || null,
    horizonWeeks,
    chartValueMode: forecastValueMode,
    chartValueModeLabel: getForecastMetricLabel(forecastValueMode),
    periods: {
      earlyDetection: {
        weeks: EARLY_DETECTION_SUMMARY_WEEKS,
        start: edStart,
        end: edEnd,
        startLabel: formatLongDate(edStart),
        endLabel: formatLongDate(edEnd),
      },
      earlyWarning: {
        weeks: forecastWeeks.length || horizonWeeks,
        start: ewStart,
        end: ewEnd,
        startLabel: formatLongDate(ewStart),
        endLabel: formatLongDate(ewEnd),
      },
      lastObserved,
      lastObservedLabel: formatLongDate(lastObserved),
    },
    districtRows: scopedDistrictRows,
    alertListings: scopedAlertListings,
    summaryCounts,
    observedWeekCount: observedWeeks.length,
  };
}
