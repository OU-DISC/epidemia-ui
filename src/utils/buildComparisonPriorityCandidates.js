import { buildAlertExplanation } from "./alertExplainer";
import {
  buildDecisionRecommendation,
  buildUncertaintyCue,
} from "./decisionActions";
import { buildInvestigationLookup } from "./buildDeliberationEvidence";
import { findDistrictFromLookup } from "./districtNameMatch";
import { findDistrictForecastRow } from "./epidemiaReportMerge";
import { summarizeAlertOutcomeFeedback } from "./alertOutcomeStorage";

function resolveInsightRow(forecastTableRows, adm3Lookup, districtName) {
  return (
    (forecastTableRows || []).find(
      (row) =>
        row.mapDistrict === districtName ||
        row.rawDistrict === districtName ||
        findDistrictFromLookup(adm3Lookup, row.rawDistrict)?.properties?.adm3_name ===
          districtName
    ) || null
  );
}

/**
 * Build side-by-side evaluative cards for 2–3 comparison districts.
 */
export function buildComparisonPriorityCandidates({
  comparisonDistricts = [],
  forecastTableRows = [],
  epidemiaData = null,
  adm3Lookup = null,
  selectedSpecies,
  speciesLabel = "",
} = {}) {
  const names = [...new Set((comparisonDistricts || []).filter(Boolean))].slice(0, 3);
  if (names.length < 2) return [];

  return names.map((districtName) => {
    const insight = resolveInsightRow(forecastTableRows, adm3Lookup, districtName);
    const districtFc = findDistrictForecastRow(
      epidemiaData,
      adm3Lookup,
      districtName,
      selectedSpecies
    );
    const forecastPoints = (districtFc?.forecast || []).filter(
      (point) => point?.median != null && Number.isFinite(Number(point.median))
    );
    const observedHistory = districtFc?.observed_history || [];

    const alert = insight
      ? {
          early_warning: Boolean(insight.earlyWarning),
          early_detection: Boolean(insight.earlyDetection),
          ew_level: insight.ewLevel,
          ed_level: insight.edLevel,
          ew_alert_count: insight.ewAlertCount,
          ed_alert_count: insight.edAlertCount,
          latest_observed: insight.latestObserved,
          latest_forecast: insight.latestForecast,
          warning_threshold: insight.warningThreshold,
          detection_threshold: insight.detectionThreshold,
          population_at_risk: insight.populationAtRisk,
        }
      : (epidemiaData?.alerts || []).find(
          (item) =>
            item.species === selectedSpecies &&
            (item.district === districtName ||
              findDistrictFromLookup(adm3Lookup, item.district)?.properties
                ?.adm3_name === districtName)
        ) || null;

    const uncertainty = buildUncertaintyCue({
      forecastPoints,
      observedHistory,
    });

    const explanation = buildAlertExplanation({
      districtName,
      regionName: insight?.region || "",
      speciesLabel,
      alert,
      insight,
      population: insight?.populationAtRisk ?? alert?.population_at_risk ?? null,
      observedHistory,
      forecastPoints,
    });

    const recommendation = buildDecisionRecommendation({
      status: explanation.status || insight?.status || "Normal",
      ewLevel: alert?.ew_level || insight?.ewLevel || "Low",
      edLevel: alert?.ed_level || insight?.edLevel || "Low",
      ewAlertCount: alert?.ew_alert_count ?? insight?.ewAlertCount ?? 0,
      edAlertCount: alert?.ed_alert_count ?? insight?.edAlertCount ?? 0,
      magnitudePercent: insight?.magnitudePercent,
      persistenceWeeks: insight?.persistenceWeeks ?? 0,
      uncertaintyLevel: uncertainty.level,
    });

    const investigation = buildInvestigationLookup({
      observedHistory,
      forecastPoints,
    });
    const outcomeSummary = summarizeAlertOutcomeFeedback(
      districtName,
      selectedSpecies
    );

    return {
      districtName,
      regionName: insight?.region || "",
      status: explanation.status || insight?.status || "Normal",
      explanation,
      uncertainty,
      recommendation,
      investigation,
      outcomeFeedback: {
        falseAlarmCount: outcomeSummary.falseAlarms,
        sampleCount: outcomeSummary.sampleCount,
        caution: outcomeSummary.caution,
        biasLabel: outcomeSummary.biasLabel,
      },
      insight,
      alert,
    };
  });
}
