import React, { useEffect, useMemo, useState } from "react";
import HelpTip from "./HelpTip";
import AlertStatusIcons from "./AlertStatusIcons";
import { fetchEdiExplain, fetchEdiStatus } from "../api";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";
import { buildExplainEvidencePack } from "../utils/buildExplainEvidencePack";
import "./AlertExplanationCard.css";

function formatNumber(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function statusTone(status) {
  if (status === "Early Warning") return "warning";
  if (status === "Early Detection") return "detection";
  return "normal";
}

function thresholdLabel(type) {
  if (type === "warning") return "warning";
  if (type === "detection") return "expected (detection)";
  return "threshold";
}

let ediStatusCache = null;
let ediStatusPromise = null;

async function getEdiStatusCached() {
  if (ediStatusCache) return ediStatusCache;
  if (!ediStatusPromise) {
    ediStatusPromise = fetchEdiStatus()
      .then((status) => {
        ediStatusCache = status;
        return status;
      })
      .catch(() => {
        ediStatusCache = { available: false, enabled: false };
        return ediStatusCache;
      })
      .finally(() => {
        ediStatusPromise = null;
      });
  }
  return ediStatusPromise;
}

/**
 * Persistent explainable-alert surface (DG1 / EDI Layer 2),
 * with optional grounded LLM rewrite (EDI Layer 3 — Explain).
 * Deterministic facts always remain visible; the LLM never decides.
 */
export default function AlertExplanationCard({
  explanation,
  earlyWarning = false,
  earlyDetection = false,
  compact = false,
  uncertainty = null,
  districtName = null,
  regionName = null,
  speciesLabel = null,
  enableGroundedExplain = true,
}) {
  const [deliberation, setDeliberation] = useState(null);
  const [deliberationState, setDeliberationState] = useState("idle"); // idle | loading | ready | error
  const [showStructured, setShowStructured] = useState(false);

  const evidencePack = useMemo(
    () =>
      buildExplainEvidencePack({
        explanation,
        uncertainty,
        districtName,
        regionName,
        speciesLabel,
      }),
    [districtName, explanation, regionName, speciesLabel, uncertainty]
  );

  const evidenceKey = useMemo(() => {
    if (!evidencePack) return "";
    return JSON.stringify({
      d: evidencePack.district,
      s: evidencePack.status,
      a: evidencePack.alert_count,
      m: evidencePack.magnitude_percent,
      p: evidencePack.persistence_weeks,
      w: (evidencePack.triggered_weeks || []).map((x) => x.week),
      u: evidencePack.uncertainty?.band,
    });
  }, [evidencePack]);

  useEffect(() => {
    if (!enableGroundedExplain || !evidencePack) {
      setDeliberation(null);
      setDeliberationState("idle");
      return undefined;
    }

    let cancelled = false;
    setDeliberationState("loading");
    setDeliberation(null);

    (async () => {
      const status = await getEdiStatusCached();
      if (cancelled) return;
      if (!status?.available) {
        setDeliberationState("idle");
        return;
      }
      try {
        const result = await fetchEdiExplain(evidencePack, "explain");
        if (cancelled) return;
        if (result?.summary && result.source === "llm" && result.grounded) {
          setDeliberation(result);
          setDeliberationState("ready");
        } else {
          // Keep Layer-2 copy; do not replace with fallback duplicate.
          setDeliberation(null);
          setDeliberationState("idle");
        }
      } catch {
        if (!cancelled) {
          setDeliberation(null);
          setDeliberationState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enableGroundedExplain, evidenceKey, evidencePack]);

  if (!explanation) return null;

  const status = explanation.status || "Normal";
  const triggered = explanation.triggeredWeeks || [];
  const maxTriggered = compact ? 2 : 6;
  const showTriggered = !compact && triggered.length > 0;
  const magnitude =
    explanation.magnitudePercent != null && explanation.magnitudePercent > 0
      ? explanation.magnitudePercent
      : null;
  const persistence =
    explanation.persistenceWeeks != null && explanation.persistenceWeeks > 0
      ? explanation.persistenceWeeks
      : null;

  const whyText =
    deliberation?.summary || explanation.why || explanation.summary;
  const deliberativeBullets =
    deliberation?.bullets?.length > 0 ? deliberation.bullets : null;

  return (
    <section
      className={`alert-explanation-card alert-explanation-card--${statusTone(status)}${
        compact ? " alert-explanation-card--compact" : ""
      }`}
      aria-label="Alert explanation"
    >
      <div className="alert-explanation-card-header">
        <div className="alert-explanation-card-title-row">
          <h5 className="alert-explanation-card-title">
            Why this alert
            <HelpTip
              text={DASHBOARD_HELP.alertExplanationCard}
              label="Alert explanation"
            />
          </h5>
          <div className="alert-explanation-card-badges">
            <span
              className={`alert-explanation-card-status alert-explanation-card-status--${statusTone(status)}`}
            >
              {status}
              {explanation.level ? ` · ${explanation.level}` : ""}
              <AlertStatusIcons
                earlyWarning={earlyWarning}
                earlyDetection={earlyDetection}
                className="alert-explanation-card-icons"
              />
            </span>
            {explanation.alertCount > 0 ? (
              <span className="alert-explanation-card-alert-weeks">
                Alert weeks <strong>{explanation.alertCount}</strong>
              </span>
            ) : null}
            {compact && magnitude != null ? (
              <span className="alert-explanation-card-alert-weeks">
                Above <strong>{formatNumber(magnitude, 0)}%</strong>
              </span>
            ) : null}
            {compact && persistence != null ? (
              <span className="alert-explanation-card-alert-weeks">
                Persist <strong>{persistence} wk</strong>
              </span>
            ) : null}
            {deliberationState === "ready" ? (
              <span
                className="alert-explanation-card-deliberative"
                title="Grounded LLM rewrite of structured evidence; not a decision"
              >
                Deliberative
              </span>
            ) : null}
            {deliberationState === "loading" ? (
              <span className="alert-explanation-card-deliberative alert-explanation-card-deliberative--loading">
                Deliberating…
              </span>
            ) : null}
          </div>
        </div>
        {!compact && explanation.contextLine ? (
          <p className="alert-explanation-card-context">{explanation.contextLine}</p>
        ) : null}
      </div>

      {!compact && (
        <p className="alert-explanation-card-type-def">
          {status === "Early Warning"
            ? "Forecast cases are projected to exceed the seasonal expected level — future risk, not yet observed."
            : status === "Early Detection"
            ? "Observed cases have already exceeded the Farrington statistical threshold — confirmed signal now."
            : null}
        </p>
      )}

      <p className="alert-explanation-card-why">{whyText}</p>

      {!compact && deliberativeBullets ? (
        <ul className="alert-explanation-card-deliberative-bullets">
          {deliberativeBullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}

      {!compact && deliberationState === "ready" ? (
        <div className="alert-explanation-card-deliberative-meta">
          <span>Grounded on structured evidence — human still decides.</span>
          <button
            type="button"
            className="alert-explanation-card-toggle"
            onClick={() => setShowStructured((value) => !value)}
          >
            {showStructured ? "Hide evidence" : "Show evidence"}
          </button>
        </div>
      ) : null}

      {!compact && (magnitude != null || persistence != null) && (
        <ul className="alert-explanation-card-metrics">
          {magnitude != null ? (
            <li>
              <span>Above threshold</span>
              <strong>{formatNumber(magnitude, 1)}%</strong>
            </li>
          ) : null}
          {persistence != null ? (
            <li>
              <span>Persistence</span>
              <strong>
                {persistence} wk{persistence === 1 ? "" : "s"}
              </strong>
            </li>
          ) : null}
        </ul>
      )}

      {showTriggered || (showStructured && triggered.length > 0) ? (
        <div className="alert-explanation-card-weeks">
          <div className="alert-explanation-card-weeks-label">
            {status === "Early Detection"
              ? "Observed weeks that crossed threshold"
              : status === "Early Warning"
              ? "Forecast weeks that crossed threshold"
              : "Weeks that crossed threshold"}
          </div>
          <ul className="alert-explanation-card-week-list">
            {triggered.slice(0, maxTriggered).map((week) => (
              <li key={`${week.kind}-${week.week}`}>
                <span className="alert-explanation-card-week-date">{week.weekLabel}</span>
                <span className="alert-explanation-card-week-detail">
                  {week.kind === "forecast" ? "Forecast" : "Observed"}{" "}
                  {formatNumber(week.value, 0)}
                  {" > "}
                  {thresholdLabel(week.thresholdType)}{" "}
                  {formatNumber(week.thresholdValue, 0)}
                </span>
              </li>
            ))}
          </ul>
          {triggered.length > maxTriggered ? (
            <p className="alert-explanation-card-weeks-more">
              +{triggered.length - maxTriggered} more week
              {triggered.length - maxTriggered === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ) : null}

      {showStructured && explanation.why && deliberation?.summary ? (
        <p className="alert-explanation-card-deterministic">
          <span>Deterministic rationale:</span> {explanation.why}
        </p>
      ) : null}
    </section>
  );
}
