import React, { useEffect, useMemo, useState } from "react";
import HelpTip from "./HelpTip";
import { fetchEdiDeliberate, fetchEnvironmentalTimeseries } from "../api";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";
import { DECISION_ACTIONS } from "../utils/decisionActions";
import {
  buildClientBriefFallback,
  buildClientChallengeFallback,
  buildDistrictDeliberationEvidence,
} from "../utils/buildDeliberationEvidence";
import { summarizeDistrictEnvironmentalContext } from "../utils/summarizeDistrictEnvironmentalContext";
import "./EdiDeliberationPanel.css";

/** Prefer ~16 weeks ending at endDate (or last observed) for Decision env lookup. */
function decisionEnvDateWindow(endDate, observedHistory = []) {
  const end =
    (endDate && String(endDate).slice(0, 10)) ||
    (() => {
      const last = observedHistory?.[observedHistory.length - 1];
      const raw = last?.week_start || last?.date;
      return raw ? String(raw).slice(0, 10) : null;
    })();
  if (!end) return null;
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(endMs)) return null;
  const startMs = endMs - 16 * 7 * 24 * 60 * 60 * 1000;
  const start = new Date(startMs).toISOString().slice(0, 10);
  return { startDate: start, endDate: end };
}

function ensureRecommendedOption(brief, recommendation) {
  if (!brief || !recommendation?.actionId) return brief;
  const options = Array.isArray(brief.options) ? [...brief.options] : [];
  const hasRecommended = options.some((opt) => opt.id === recommendation.actionId);
  if (hasRecommended) return { ...brief, options };

  const catalog = DECISION_ACTIONS.find((a) => a.id === recommendation.actionId);
  options.unshift({
    id: recommendation.actionId,
    action: recommendation.label || catalog?.label || recommendation.actionId,
    label: recommendation.label || catalog?.label || recommendation.actionId,
    supporting_evidence: [
      recommendation.rationale || "Rule-based system recommendation.",
    ],
    tradeoffs: [
      "Still weigh uncertainty and local knowledge before committing.",
    ],
    rationale: recommendation.rationale || "Rule-based system recommendation.",
    risk: "Still weigh uncertainty and local knowledge before committing.",
  });
  return { ...brief, options: options.slice(0, 4) };
}

function normalizeBrief(payload, recommendation) {
  if (!payload) return null;

  const explRaw = payload.explanation;
  let why = "";
  let supporting = [];
  let contradicting = [];
  if (explRaw && typeof explRaw === "object") {
    why = explRaw.why_alert || "";
    supporting = explRaw.supporting_evidence || [];
    contradicting = explRaw.contradicting_evidence || [];
  } else {
    why = typeof explRaw === "string" ? explRaw : payload.summary || "";
    supporting = payload.supporting_evidence || payload.bullets || [];
    contradicting = payload.contradicting_evidence || [];
  }

  const change =
    payload.what_could_change_decision ||
    payload.what_would_change_decision ||
    payload.questions ||
    [];
  const gaps = payload.evidence_gaps || [];
  const unc = payload.uncertainty || {};
  const provenance = payload.provenance || {};

  const options = (payload.options || []).map((opt) => {
    const support =
      opt.supporting_evidence?.length
        ? opt.supporting_evidence
        : opt.pros?.length
        ? opt.pros
        : opt.rationale
        ? [opt.rationale]
        : [];
    const tradeoffs =
      opt.tradeoffs?.length
        ? opt.tradeoffs
        : opt.cons?.length
        ? opt.cons
        : opt.risk
        ? [opt.risk]
        : [];
    return {
      id: opt.id,
      action: opt.action || opt.label || opt.id,
      label: opt.label || opt.action || opt.id,
      supporting_evidence: support,
      tradeoffs,
      rationale: opt.rationale || support[0] || "",
      risk: opt.risk || tradeoffs[0] || "",
    };
  });

  return ensureRecommendedOption(
    {
      ...payload,
      district: payload.district || null,
      species: payload.species || null,
      explanation: {
        why_alert: why,
        supporting_evidence: supporting,
        contradicting_evidence: contradicting,
      },
      uncertainty: {
        level: unc.level || unc.band || "moderate",
        evidence: unc.evidence || unc.reason || "",
        decision_implication: unc.decision_implication || "",
        reason: unc.evidence || unc.reason || "",
      },
      options,
      what_could_change_decision: change,
      evidence_gaps: gaps,
      provenance,
      // legacy mirrors for any older UI bits
      summary: why,
      bullets: supporting,
      supporting_evidence: supporting,
      questions: change,
      what_would_change_decision: change,
    },
    recommendation
  );
}

/**
 * EDI Layer 3: one structured brief from the LLM (or fallback).
 * React renders fields; EPIDEMIA owns confirm/override.
 */
export default function EdiDeliberationPanel({
  explanation,
  uncertainty = null,
  recommendation = null,
  uncertaintyActionCue = null,
  chosenActionId = null,
  districtName = null,
  regionName = null,
  speciesLabel = null,
  observedHistory = [],
  forecastPoints = [],
  reportGeneratedAt = null,
  neighborSummary = null,
  districtGeometry = null,
  chartEndDate = null,
  outcomeFeedback = null,
  onSelectOption = null,
}) {
  const [tab, setTab] = useState("options");
  const [brief, setBrief] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [environmentalSummary, setEnvironmentalSummary] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeRequested, setChallengeRequested] = useState(false);

  useEffect(() => {
    if (!districtName || !districtGeometry) {
      setEnvironmentalSummary(null);
      return undefined;
    }
    const window = decisionEnvDateWindow(chartEndDate, observedHistory);
    if (!window) {
      setEnvironmentalSummary({
        available: false,
        note: "No date window available for environmental lookup.",
      });
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const [rainRes, tempRes] = await Promise.all([
          fetchEnvironmentalTimeseries({
            districtName,
            districtGeometry,
            startDate: window.startDate,
            endDate: window.endDate,
            dataset: "totprec",
          }),
          fetchEnvironmentalTimeseries({
            districtName,
            districtGeometry,
            startDate: window.startDate,
            endDate: window.endDate,
            dataset: "lst_mean",
          }),
        ]);
        if (cancelled) return;
        setEnvironmentalSummary(
          summarizeDistrictEnvironmentalContext({
            rainfallTimeseries: rainRes?.timeseries || [],
            temperatureTimeseries: tempRes?.timeseries || [],
            districtName,
          })
        );
      } catch (err) {
        if (cancelled) return;
        const detail =
          err?.response?.data?.error ||
          err?.message ||
          "Environmental API unavailable";
        setEnvironmentalSummary(
          summarizeDistrictEnvironmentalContext({
            districtName,
            error: detail,
          })
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chartEndDate, districtGeometry, districtName, observedHistory]);

  const evidence = useMemo(
    () =>
      buildDistrictDeliberationEvidence({
        explanation,
        uncertainty,
        recommendation,
        districtName,
        regionName,
        speciesLabel,
        observedHistory,
        forecastPoints,
        reportGeneratedAt,
        neighborSummary,
        environmentalSummary,
        outcomeFeedback: outcomeFeedback
          ? {
              falseAlarmCount: outcomeFeedback.falseAlarms,
              sampleCount: outcomeFeedback.sampleCount,
              caution: outcomeFeedback.caution,
              biasLabel: outcomeFeedback.biasLabel,
            }
          : null,
      }),
    [
      districtName,
      environmentalSummary,
      explanation,
      forecastPoints,
      neighborSummary,
      observedHistory,
      outcomeFeedback,
      recommendation,
      regionName,
      reportGeneratedAt,
      speciesLabel,
      uncertainty,
    ]
  );

  const evidenceKey = useMemo(() => {
    if (!evidence) return "";
    return JSON.stringify({
      d: evidence.district,
      s: evidence.status,
      a: evidence.recommendation?.action_id,
      u: evidence.uncertainty?.band,
      m: evidence.magnitude_percent,
      n: evidence.neighboring_district_context?.alert_count,
      p: evidence.provenance?.data_through,
      e: evidence.environmental?.available
        ? [
            evidence.environmental.rainfall_change_percent,
            evidence.environmental.temperature_change_c,
          ]
        : false,
    });
  }, [evidence]);

  useEffect(() => {
    if (!evidence) {
      setBrief(null);
      setRefreshing(false);
      return undefined;
    }

    let cancelled = false;
    const instant = normalizeBrief(
      buildClientBriefFallback(evidence),
      recommendation
    );
    setBrief(instant);
    setRefreshing(true);
    setTab("options");
    setChallenge(null);
    setChallengeRequested(false);
    setChallengeLoading(false);

    (async () => {
      try {
        const result = await fetchEdiDeliberate(evidence, "brief");
        if (cancelled) return;
        setBrief(normalizeBrief(result, recommendation));
      } catch {
        if (!cancelled) {
          setBrief(instant);
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [evidence, evidenceKey, recommendation]);

  useEffect(() => {
    if (!evidence || !challengeRequested || challenge) return undefined;

    let cancelled = false;
    const instant = buildClientChallengeFallback(evidence);
    setChallenge(instant.challenge || instant);
    setChallengeLoading(true);

    (async () => {
      try {
        const result = await fetchEdiDeliberate(evidence, "challenge");
        if (cancelled) return;
        const block = result?.challenge || {
          summary: result?.summary || "",
          reasons_to_question: result?.bullets || [],
          what_would_reduce_uncertainty: result?.questions || [],
        };
        setChallenge(block);
      } catch {
        if (!cancelled) {
          setChallenge(instant.challenge || instant);
        }
      } finally {
        if (!cancelled) setChallengeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [challenge, challengeRequested, evidence, evidenceKey]);

  if (!evidence || !recommendation || !brief) return null;

  const selectedId = chosenActionId || recommendation.actionId;
  const cueLevel =
    brief.uncertainty?.level ||
    uncertaintyActionCue?.level ||
    uncertainty?.level ||
    "moderate";
  const sourceLabel =
    brief.source === "llm"
      ? "Grounded deliberative"
      : brief.source === "fallback"
      ? "Structured deliberative"
      : null;
  const whyAlert = brief.explanation?.why_alert || "";
  const uncLine =
    brief.uncertainty?.evidence ||
    brief.uncertainty?.reason ||
    uncertaintyActionCue?.implication ||
    "";
  const uncImplication = brief.uncertainty?.decision_implication || "";

  return (
    <section className="edi-deliberation" data-tour="edi-deliberation" aria-label="EDI deliberation">
      <div className="edi-deliberation-header">
        <h5 className="edi-deliberation-title">
          Deliberate
          <HelpTip text={DASHBOARD_HELP.ediDeliberation} label="EDI deliberation" />
        </h5>
        <div className="edi-deliberation-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "options"}
            className={
              tab === "options"
                ? "edi-deliberation-tab is-active"
                : "edi-deliberation-tab"
            }
            onClick={() => setTab("options")}
          >
            Options
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "evidence"}
            className={
              tab === "evidence"
                ? "edi-deliberation-tab is-active"
                : "edi-deliberation-tab"
            }
            onClick={() => setTab("evidence")}
          >
            Evidence
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "change"}
            className={
              tab === "change"
                ? "edi-deliberation-tab is-active"
                : "edi-deliberation-tab"
            }
            onClick={() => setTab("change")}
          >
            What could change
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "challenge"}
            className={
              tab === "challenge"
                ? "edi-deliberation-tab is-active"
                : "edi-deliberation-tab"
            }
            onClick={() => {
              setTab("challenge");
              setChallengeRequested(true);
            }}
          >
            Challenge
          </button>
        </div>
        <span
          className={`edi-deliberation-uncertainty edi-deliberation-uncertainty--${cueLevel}`}
          title={uncLine || undefined}
        >
          {brief.uncertainty?.level || uncertaintyActionCue?.label || "Uncertainty"}
          {recommendation.evidenceStrength
            ? ` · ${recommendation.evidenceStrength}`
            : ""}
        </span>
        {sourceLabel ? (
          <span className="edi-deliberation-source" title={brief.detail || undefined}>
            {sourceLabel}
            {refreshing ? "…" : ""}
          </span>
        ) : null}
      </div>

      {whyAlert ? (
        <p className="edi-deliberation-policy">
          <span>Why this alert:</span> {whyAlert}
        </p>
      ) : null}

      {uncLine || uncImplication ? (
        <p className={`edi-deliberation-cue edi-deliberation-cue--${cueLevel}`}>
          {uncLine}
          {uncImplication ? (
            <>
              {uncLine ? " " : null}
              <em>{uncImplication}</em>
            </>
          ) : null}
        </p>
      ) : null}

      {refreshing ? (
        <p className="edi-deliberation-loading">
          Refining structured brief with deliberative model…
        </p>
      ) : null}

      {tab === "options" && brief.options?.length ? (
        <ul className="edi-deliberation-options">
          {brief.options.map((option) => {
            const isRecommended = option.id === recommendation.actionId;
            const isSelected = option.id === selectedId;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  className={[
                    "edi-deliberation-option",
                    isRecommended ? "edi-deliberation-option--recommended" : "",
                    isSelected ? "edi-deliberation-option--selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelectOption?.(option.id)}
                >
                  <div className="edi-deliberation-option-top">
                    <strong>{option.action || option.label || option.id}</strong>
                    <span>
                      {isRecommended ? "Recommended" : "Alternative"}
                      {isSelected ? " · selected" : ""}
                    </span>
                  </div>
                  {option.supporting_evidence?.length ? (
                    <ul className="edi-deliberation-pros">
                      {option.supporting_evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : option.rationale ? (
                    <p className="edi-deliberation-option-rationale">
                      <span>Support:</span> {option.rationale}
                    </p>
                  ) : null}
                  {option.tradeoffs?.length ? (
                    <ul className="edi-deliberation-cons">
                      {option.tradeoffs.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : option.risk ? (
                    <p className="edi-deliberation-option-risk">
                      <span>Tradeoff:</span> {option.risk}
                    </p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {tab === "evidence" ? (
        <ul className="edi-deliberation-options">
          {whyAlert ? (
            <li>
              <div className="edi-deliberation-card edi-deliberation-card--support">
                <div className="edi-deliberation-option-top">
                  <strong>Why this alert</strong>
                  <span>Summary</span>
                </div>
                <p className="edi-deliberation-card-body">{whyAlert}</p>
              </div>
            </li>
          ) : null}
          {brief.explanation?.supporting_evidence?.length ? (
            <li>
              <div className="edi-deliberation-card edi-deliberation-card--support">
                <div className="edi-deliberation-option-top">
                  <strong>Supporting evidence</strong>
                  <span>Support</span>
                </div>
                <ul className="edi-deliberation-pros">
                  {brief.explanation.supporting_evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </li>
          ) : null}
          {brief.explanation?.contradicting_evidence?.length ? (
            <li>
              <div className="edi-deliberation-card edi-deliberation-card--weaken">
                <div className="edi-deliberation-option-top">
                  <strong>What weakens this</strong>
                  <span>Caveats</span>
                </div>
                <ul className="edi-deliberation-cons">
                  {brief.explanation.contradicting_evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </li>
          ) : null}
          {brief.evidence_gaps?.length ? (
            <li>
              <div className="edi-deliberation-card edi-deliberation-card--gap">
                <div className="edi-deliberation-option-top">
                  <strong>Still missing</strong>
                  <span>Gaps</span>
                </div>
                <ul className="edi-deliberation-cons">
                  {brief.evidence_gaps.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </li>
          ) : null}
          {!whyAlert &&
          !brief.explanation?.supporting_evidence?.length &&
          !brief.explanation?.contradicting_evidence?.length &&
          !brief.evidence_gaps?.length ? (
            <li>
              <div className="edi-deliberation-card">
                <div className="edi-deliberation-option-top">
                  <strong>No evidence points in brief yet.</strong>
                  <span>Empty</span>
                </div>
              </div>
            </li>
          ) : null}
        </ul>
      ) : null}

      {tab === "change" ? (
        <>
          <ul className="edi-deliberation-options">
            <li>
              <div className="edi-deliberation-card edi-deliberation-card--check">
                <div className="edi-deliberation-option-top">
                  <strong>What could change this decision</strong>
                  <span>Checks</span>
                </div>
                {brief.what_could_change_decision?.length ? (
                  <ul className="edi-deliberation-pros">
                    {brief.what_could_change_decision.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="edi-deliberation-card-body">
                    No change factors in brief yet.
                  </p>
                )}
              </div>
            </li>
          </ul>
          <p className="edi-deliberation-footnote">
            Annotate local knowledge below; you still confirm or override.
          </p>
        </>
      ) : null}

      {tab === "challenge" ? (
        <>
          {challengeLoading ? (
            <p className="edi-deliberation-loading">
              Building counter-arguments from the evidence pack…
            </p>
          ) : null}
          <ul className="edi-deliberation-options">
            {challenge?.summary ? (
              <li>
                <div className="edi-deliberation-card edi-deliberation-card--challenge">
                  <div className="edi-deliberation-option-top">
                    <strong>Challenge this assessment</strong>
                    <span>Summary</span>
                  </div>
                  <p className="edi-deliberation-card-body">{challenge.summary}</p>
                </div>
              </li>
            ) : null}
            {challenge?.reasons_to_question?.length ? (
              <li>
                <div className="edi-deliberation-card edi-deliberation-card--weaken">
                  <div className="edi-deliberation-option-top">
                    <strong>Reasons to question</strong>
                    <span>{challenge.reasons_to_question.length}</span>
                  </div>
                  <ul className="edi-deliberation-card-list">
                    {challenge.reasons_to_question.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ) : null}
            {challenge?.what_would_reduce_uncertainty?.length ? (
              <li>
                <div className="edi-deliberation-card edi-deliberation-card--check">
                  <div className="edi-deliberation-option-top">
                    <strong>What would reduce uncertainty</strong>
                    <span>{challenge.what_would_reduce_uncertainty.length}</span>
                  </div>
                  <ul className="edi-deliberation-card-list">
                    {challenge.what_would_reduce_uncertainty.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ) : null}
            {challengeRequested &&
            !challengeLoading &&
            !challenge?.summary &&
            !challenge?.reasons_to_question?.length ? (
              <li>
                <div className="edi-deliberation-card">
                  <div className="edi-deliberation-option-top">
                    <strong>No challenge points available yet.</strong>
                    <span>Empty</span>
                  </div>
                </div>
              </li>
            ) : null}
          </ul>
          <p className="edi-deliberation-footnote">
            Challenge supports calibrated skepticism — when to trust, question, or override.
          </p>
        </>
      ) : null}

      <p className="edi-deliberation-footnote">
        Structured deliberative output — select an option, then Confirm or Save override. The
        system does not decide.
      </p>
    </section>
  );
}
