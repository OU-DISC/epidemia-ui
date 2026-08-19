import React, { useEffect, useMemo, useState } from "react";
import HelpTip from "./HelpTip";
import AlertExplanationCard from "./AlertExplanationCard";
import DecisionUncertaintyChart from "./DecisionUncertaintyChart";
import EdiDeliberationPanel from "./EdiDeliberationPanel";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";
import { buildAlertExplanation } from "../utils/alertExplainer";
import {
  ALERT_APPROVAL,
  clearAlertApproval,
  loadAlertApproval,
  saveAlertApproval,
} from "../utils/alertApprovalStorage";
import {
  ALERT_OUTCOMES,
  clearAlertOutcomes,
  getAlertOutcomeMeta,
  loadLatestAlertOutcome,
  saveAlertOutcome,
  summarizeAlertOutcomeFeedback,
} from "../utils/alertOutcomeStorage";
import {
  DECISION_ACTIONS,
  buildDecisionRecommendation,
  buildUncertaintyActionCue,
  buildUncertaintyCue,
  getDecisionAction,
} from "../utils/decisionActions";
import {
  clearDecisionJudgment,
  formatJudgmentMemoryLine,
  loadDecisionJudgment,
  loadPriorDecisionJudgments,
  saveDecisionJudgment,
} from "../utils/decisionJudgmentStorage";
import "./DecisionPanel.css";

/**
 * EDI Decision Panel: recommend an action, then confirm / override / annotate.
 * Also: outcome feedback, judgment memory, and operational approval gate.
 */
export default function DecisionPanel({
  districtName,
  regionName = "",
  species,
  speciesLabel,
  alert = null,
  insight = null,
  forecastPoints = [],
  observedHistory = [],
  population = null,
  incidentRate = null,
  reportGeneratedAt = null,
  neighborSummary = null,
  districtGeometry = null,
  chartEndDate = null,
}) {
  const resolvedAlert = useMemo(() => {
    if (alert) return alert;
    if (!insight) return null;
    return {
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
    };
  }, [alert, insight]);

  const explanation = useMemo(
    () =>
      buildAlertExplanation({
        districtName,
        regionName,
        speciesLabel,
        alert: resolvedAlert,
        insight,
        population,
        incidentRate,
        observedHistory,
        forecastPoints,
      }),
    [
      districtName,
      forecastPoints,
      incidentRate,
      insight,
      observedHistory,
      population,
      regionName,
      resolvedAlert,
      speciesLabel,
    ]
  );

  const uncertainty = useMemo(
    () =>
      buildUncertaintyCue({
        forecastPoints,
        observedHistory,
      }),
    [forecastPoints, observedHistory]
  );

  const [outcomeVersion, setOutcomeVersion] = useState(0);
  const [approvalVersion, setApprovalVersion] = useState(0);

  const outcomeSummary = useMemo(() => {
    if (!districtName || !species) {
      return { caution: false, biasLabel: null, sampleCount: 0 };
    }
    return summarizeAlertOutcomeFeedback(districtName, species);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtName, species, outcomeVersion]);

  const approval = useMemo(() => {
    if (!districtName || !species) {
      return { status: ALERT_APPROVAL.PENDING, isDefault: true };
    }
    return loadAlertApproval(districtName, species);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtName, species, approvalVersion]);

  const isAlertActive =
    explanation.status === "Early Warning" || explanation.status === "Early Detection";

  const recommendation = useMemo(
    () =>
      buildDecisionRecommendation({
        status: explanation.status || "Normal",
        ewLevel: resolvedAlert?.ew_level || insight?.ewLevel || "Low",
        edLevel: resolvedAlert?.ed_level || insight?.edLevel || "Low",
        ewAlertCount: resolvedAlert?.ew_alert_count ?? insight?.ewAlertCount ?? 0,
        edAlertCount: resolvedAlert?.ed_alert_count ?? insight?.edAlertCount ?? 0,
        magnitudePercent: insight?.magnitudePercent,
        persistenceWeeks: insight?.persistenceWeeks ?? 0,
        uncertaintyLevel: uncertainty.level,
        outcomeCaution: Boolean(outcomeSummary.caution),
        operationalApproved:
          !isAlertActive || approval.status === ALERT_APPROVAL.APPROVED,
      }),
    [
      approval.status,
      explanation.status,
      insight,
      isAlertActive,
      outcomeSummary.caution,
      resolvedAlert,
      uncertainty.level,
    ]
  );

  const uncertaintyActionCue = useMemo(
    () => buildUncertaintyActionCue(uncertainty, recommendation),
    [recommendation, uncertainty]
  );

  const [mode, setMode] = useState("recommend"); // recommend | override
  const [chosenActionId, setChosenActionId] = useState(recommendation.actionId);
  const [annotation, setAnnotation] = useState("");
  const [saved, setSaved] = useState(null);
  const [priorMemory, setPriorMemory] = useState(null);
  const [latestOutcome, setLatestOutcome] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (!districtName || !species) {
      setSaved(null);
      setPriorMemory(null);
      setLatestOutcome(null);
      setMode("recommend");
      setChosenActionId(recommendation.actionId);
      setAnnotation("");
      setSaveMessage("");
      return;
    }

    const existing = loadDecisionJudgment(districtName, species);
    setSaved(existing);
    const priors = loadPriorDecisionJudgments(districtName, species);
    const prior = priors[0] || null;
    if (prior) {
      const actionLabel = getDecisionAction(prior.chosenActionId)?.label || prior.chosenActionId;
      setPriorMemory(formatJudgmentMemoryLine(prior, actionLabel));
    } else {
      setPriorMemory(null);
    }
    setLatestOutcome(loadLatestAlertOutcome(districtName, species));

    if (existing) {
      setChosenActionId(existing.chosenActionId || recommendation.actionId);
      setAnnotation(existing.annotation || "");
      setMode(
        existing.judgment === "overridden" ||
          existing.chosenActionId !== existing.recommendedActionId
          ? "override"
          : "recommend"
      );
    } else {
      setChosenActionId(recommendation.actionId);
      setAnnotation("");
      setMode("recommend");
    }
    setSaveMessage("");
  }, [districtName, species, recommendation.actionId, outcomeVersion, approvalVersion]);

  const staleRecommendation =
    saved &&
    saved.recommendedActionId &&
    saved.recommendedActionId !== recommendation.actionId;

  const chosenAction = getDecisionAction(chosenActionId);

  const persistJudgment = (judgment) => {
    const record = saveDecisionJudgment(districtName, species, {
      judgment,
      recommendedActionId: recommendation.actionId,
      chosenActionId,
      annotation: annotation.trim(),
      status: explanation.status || "Normal",
      evidenceStrength: recommendation.evidenceStrength,
    });
    setSaved(record);
    const priors = loadPriorDecisionJudgments(districtName, species);
    const prior = priors[0] || null;
    if (prior) {
      const actionLabel = getDecisionAction(prior.chosenActionId)?.label || prior.chosenActionId;
      setPriorMemory(formatJudgmentMemoryLine(prior, actionLabel));
    }
    setSaveMessage(
      judgment === "confirmed"
        ? "Recommendation confirmed and saved."
        : "Override saved with your selected action."
    );
  };

  const handleConfirm = () => {
    if (isAlertActive && approval.status !== ALERT_APPROVAL.APPROVED) {
      setSaveMessage(
        "Approve this alert for operational release before confirming an action, or hold it."
      );
      return;
    }
    setMode("recommend");
    setChosenActionId(recommendation.actionId);
    persistJudgment("confirmed");
  };

  const handleOverrideSave = () => {
    if (!chosenActionId || chosenActionId === recommendation.actionId) {
      setSaveMessage("Choose a different action to override, or confirm the recommendation.");
      return;
    }
    if (
      isAlertActive &&
      approval.status !== ALERT_APPROVAL.APPROVED &&
      (chosenActionId === "escalate" || chosenActionId === "investigate")
    ) {
      setSaveMessage(
        "Stronger actions need operational approval first. Approve the alert, or choose monitor/watch."
      );
      return;
    }
    persistJudgment("overridden");
  };

  const handleSaveAnnotation = () => {
    const judgment =
      chosenActionId === recommendation.actionId ? "confirmed" : "overridden";
    if (mode === "override" && chosenActionId === recommendation.actionId) {
      setMode("recommend");
    }
    persistJudgment(judgment);
    if (!annotation.trim() && !saved) {
      setSaveMessage("Saved decision without annotation.");
    }
  };

  const handleClear = () => {
    clearDecisionJudgment(districtName, species);
    setSaved(null);
    setPriorMemory(null);
    setMode("recommend");
    setChosenActionId(recommendation.actionId);
    setAnnotation("");
    setSaveMessage("Cleared saved judgment for this district.");
  };

  const handleOutcome = (outcomeId) => {
    const entry = saveAlertOutcome(districtName, species, {
      outcome: outcomeId,
      note: annotation.trim(),
      status: explanation.status || "Normal",
      recommendedActionId: recommendation.actionId,
    });
    setLatestOutcome(entry);
    setOutcomeVersion((value) => value + 1);
    setSaveMessage(
      `Outcome feedback saved: ${getAlertOutcomeMeta(outcomeId)?.shortLabel || outcomeId}. This adjusts decision caution here (not the forecast model).`
    );
  };

  const handleClearOutcomes = () => {
    clearAlertOutcomes(districtName, species);
    setLatestOutcome(null);
    setOutcomeVersion((value) => value + 1);
    setSaveMessage("Cleared outcome feedback for this district.");
  };

  const handleApproval = (status) => {
    saveAlertApproval(districtName, species, {
      status,
      note: annotation.trim(),
    });
    setApprovalVersion((value) => value + 1);
    setSaveMessage(
      status === ALERT_APPROVAL.APPROVED
        ? "Alert approved for operational release."
        : status === ALERT_APPROVAL.HELD
        ? "Alert held — not released for operational action."
        : "Alert set back to pending approval."
    );
  };

  const handleClearApproval = () => {
    clearAlertApproval(districtName, species);
    setApprovalVersion((value) => value + 1);
    setSaveMessage("Cleared operational approval (back to pending).");
  };

  if (!districtName || districtName === "All Regions") {
    return (
      <section className="decision-panel decision-panel--empty" data-tour="decision-panel">
        <div className="decision-panel-header">
          <h4 className="decision-panel-title">
            Decision Panel
            <HelpTip text={DASHBOARD_HELP.decisionPanel} label="Decision panel" />
          </h4>
        </div>
        <p className="decision-panel-empty-copy">
          Select a district to review alert rationale, uncertainty, and deliberative options.
          You can confirm, override, annotate, give outcome feedback, and approve operational release.
        </p>
      </section>
    );
  }

  return (
    <section className="decision-panel decision-panel--fit" data-tour="decision-panel">
      {priorMemory ? (
        <p className="decision-panel-memory" role="status">
          <strong>Judgment memory:</strong> {priorMemory}
        </p>
      ) : null}

      <AlertExplanationCard
        explanation={explanation}
        earlyWarning={Boolean(resolvedAlert?.early_warning)}
        earlyDetection={Boolean(resolvedAlert?.early_detection)}
        uncertainty={uncertainty}
        districtName={districtName}
        regionName={regionName}
        speciesLabel={speciesLabel}
        compact
      />

      <DecisionUncertaintyChart
        districtName={districtName}
        observedHistory={observedHistory}
        forecastPoints={forecastPoints}
        uncertainty={uncertainty}
        compact
      />

      {isAlertActive ? (
        <div className="decision-panel-approval">
          <div className="decision-panel-approval-top">
            <span className="decision-panel-hitl-label">
              Operational release
              <HelpTip
                text={DASHBOARD_HELP.decisionApproval}
                label="Operational approval"
              />
            </span>
            <span
              className={`decision-panel-approval-badge decision-panel-approval-badge--${approval.status}`}
            >
              {approval.status === ALERT_APPROVAL.APPROVED
                ? "Approved"
                : approval.status === ALERT_APPROVAL.HELD
                ? "Held"
                : "Pending approval"}
            </span>
          </div>
          <div className="decision-panel-approval-actions">
            <button
              type="button"
              className="decision-panel-btn decision-panel-btn--confirm"
              onClick={() => handleApproval(ALERT_APPROVAL.APPROVED)}
            >
              Approve
            </button>
            <button
              type="button"
              className="decision-panel-btn decision-panel-btn--override"
              onClick={() => handleApproval(ALERT_APPROVAL.HELD)}
            >
              Hold
            </button>
            {!approval.isDefault ? (
              <button
                type="button"
                className="decision-panel-btn decision-panel-btn--ghost"
                onClick={handleClearApproval}
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <EdiDeliberationPanel
        explanation={explanation}
        uncertainty={uncertainty}
        recommendation={recommendation}
        uncertaintyActionCue={uncertaintyActionCue}
        chosenActionId={chosenActionId}
        districtName={districtName}
        regionName={regionName}
        speciesLabel={speciesLabel}
        observedHistory={observedHistory}
        forecastPoints={forecastPoints}
        reportGeneratedAt={reportGeneratedAt}
        neighborSummary={neighborSummary}
        districtGeometry={districtGeometry}
        chartEndDate={chartEndDate}
        outcomeFeedback={outcomeSummary}
        onSelectOption={(actionId) => {
          setChosenActionId(actionId);
          setMode(actionId === recommendation.actionId ? "recommend" : "override");
          setSaveMessage(
            actionId === recommendation.actionId
              ? "Selected recommended action — press Confirm to commit."
              : "Selected alternative — press Save override to commit."
          );
        }}
      />

      {outcomeSummary.biasLabel ? (
        <p className="decision-panel-outcome-bias" role="status">
          Feedback loop: {outcomeSummary.biasLabel}
        </p>
      ) : null}

      {staleRecommendation ? (
        <p className="decision-panel-stale" role="status">
          Alert evidence changed since your last judgment. Review the new recommendation before
          keeping the previous decision.
        </p>
      ) : null}

      <div className="decision-panel-actions" role="group" aria-label="Decision actions">
        <button
          type="button"
          className="decision-panel-btn decision-panel-btn--confirm"
          onClick={handleConfirm}
        >
          Confirm
        </button>
        <button
          type="button"
          className={
            mode === "override"
              ? "decision-panel-btn decision-panel-btn--override is-active"
              : "decision-panel-btn decision-panel-btn--override"
          }
          onClick={() => {
            setMode("override");
            setSaveMessage("");
          }}
        >
          Override
        </button>
        <button
          type="button"
          className="decision-panel-btn decision-panel-btn--secondary"
          onClick={handleSaveAnnotation}
        >
          Save annotation
        </button>
        {saved ? (
          <button
            type="button"
            className="decision-panel-btn decision-panel-btn--ghost"
            onClick={handleClear}
          >
            Clear
          </button>
        ) : null}
      </div>

      {mode === "override" ? (
        <label className="decision-panel-override">
          <span className="decision-panel-override-label">Choose alternate action</span>
          <select
            className="toolbar-select decision-panel-override-select"
            value={chosenActionId}
            onChange={(event) => setChosenActionId(event.target.value)}
            aria-label="Override action"
          >
            {DECISION_ACTIONS.map((action) => (
              <option key={action.id} value={action.id}>
                {action.label}
                {action.id === recommendation.actionId ? " (recommended)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="decision-panel-btn decision-panel-btn--confirm"
            onClick={handleOverrideSave}
          >
            Save override
          </button>
        </label>
      ) : null}

      <label className="decision-panel-annotate">
        <span className="decision-panel-annotate-label">
          Annotate local knowledge
          <HelpTip text={DASHBOARD_HELP.decisionAnnotate} label="Decision annotation" />
        </span>
        <textarea
          className="decision-panel-annotate-input"
          rows={1}
          value={annotation}
          onChange={(event) => setAnnotation(event.target.value)}
          placeholder="e.g. delayed reporting, recent IRS campaign, population movement…"
        />
      </label>

      {isAlertActive ? (
        <div className="decision-panel-outcome">
          <div className="decision-panel-outcome-top">
            <span className="decision-panel-hitl-label">
              Was this alert right?
              <HelpTip text={DASHBOARD_HELP.decisionOutcome} label="Alert outcome feedback" />
            </span>
            {latestOutcome ? (
              <span className="decision-panel-outcome-latest">
                Last: {getAlertOutcomeMeta(latestOutcome.outcome)?.shortLabel || latestOutcome.outcome}
              </span>
            ) : null}
          </div>
          <div className="decision-panel-outcome-actions" role="group" aria-label="Alert outcome">
            {ALERT_OUTCOMES.map((outcome) => (
              <button
                key={outcome.id}
                type="button"
                className={
                  latestOutcome?.outcome === outcome.id
                    ? "decision-panel-btn decision-panel-btn--secondary is-active"
                    : "decision-panel-btn decision-panel-btn--secondary"
                }
                title={outcome.description}
                onClick={() => handleOutcome(outcome.id)}
              >
                {outcome.shortLabel}
              </button>
            ))}
            {latestOutcome ? (
              <button
                type="button"
                className="decision-panel-btn decision-panel-btn--ghost"
                onClick={handleClearOutcomes}
              >
                Clear feedback
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {saved ? (
        <div className="decision-panel-saved" role="status">
          <strong>
            {saved.judgment === "overridden" ? "Overridden" : "Confirmed"}
          </strong>
          {": "}
          {getDecisionAction(saved.chosenActionId)?.label || saved.chosenActionId}
          {saved.annotation ? (
            <span className="decision-panel-saved-note"> — {saved.annotation}</span>
          ) : null}
          <span className="decision-panel-saved-time">
            {" "}
            ({new Date(saved.updatedAt).toLocaleString()})
          </span>
        </div>
      ) : null}

      {saveMessage ? (
        <p className="decision-panel-toast" role="status">
          {saveMessage}
        </p>
      ) : null}

      {chosenAction && mode === "override" && chosenActionId !== recommendation.actionId ? (
        <p className="decision-panel-chosen-hint">{chosenAction.description}</p>
      ) : null}
    </section>
  );
}
