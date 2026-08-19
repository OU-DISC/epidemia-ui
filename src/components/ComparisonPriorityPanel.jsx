import React, { useEffect, useMemo, useState } from "react";
import HelpTip from "./HelpTip";
import AlertStatusIcons from "./AlertStatusIcons";
import { fetchEdiDeliberate } from "../api";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";
import {
  buildClientCompareFallback,
  buildCompareEvidencePack,
} from "../utils/buildDeliberationEvidence";
import {
  clearPriorityJudgment,
  loadPriorityJudgment,
  savePriorityJudgment,
} from "../utils/priorityJudgmentStorage";
import "./ComparisonPriorityPanel.css";

function statusTone(status) {
  if (status === "Early Warning") return "warning";
  if (status === "Early Detection") return "detection";
  return "normal";
}

function uncertaintyTone(level) {
  if (level === "low") return "low";
  if (level === "high" || level === "unavailable") return "high";
  return "moderate";
}

/**
 * Evaluative AI strip: compare 2–3 districts on why + uncertainty,
 * then commit a priority order (EDI / F3).
 */
export default function ComparisonPriorityPanel({
  candidates = [],
  species,
  speciesLabel = "",
}) {
  const districtNames = useMemo(
    () => candidates.map((item) => item.districtName),
    [candidates]
  );
  const districtSetKey = districtNames.slice().sort().join("|");

  const [ranks, setRanks] = useState({});
  const [justification, setJustification] = useState("");
  const [saved, setSaved] = useState(null);
  const [message, setMessage] = useState("");
  const [compare, setCompare] = useState(null);

  const compareEvidence = useMemo(
    () => buildCompareEvidencePack({ candidates, speciesLabel }),
    [candidates, speciesLabel]
  );

  useEffect(() => {
    if (districtNames.length < 2 || !species) {
      setRanks({});
      setJustification("");
      setSaved(null);
      setMessage("");
      return;
    }

    const existing = loadPriorityJudgment(districtNames, species);
    if (existing?.ranking) {
      const nextRanks = {};
      existing.ranking.forEach((entry) => {
        if (entry?.districtName && entry?.rank != null) {
          nextRanks[entry.districtName] = String(entry.rank);
        }
      });
      setRanks(nextRanks);
      setJustification(existing.justification || "");
      setSaved(existing);
    } else {
      setRanks({});
      setJustification("");
      setSaved(null);
    }
    setMessage("");
    // districtSetKey tracks membership; districtNames is derived from the same candidates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtSetKey, species]);

  useEffect(() => {
    if (!compareEvidence) {
      setCompare(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchEdiDeliberate(compareEvidence, "compare");
        if (!cancelled) setCompare(result);
      } catch {
        if (!cancelled) setCompare(buildClientCompareFallback(compareEvidence));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compareEvidence, districtSetKey]);

  if (!candidates.length) {
    return (
      <section className="comparison-priority" data-tour="comparison-priority">
        <div className="comparison-priority-header">
          <h5>
            Evaluate priority
            <HelpTip
              text={DASHBOARD_HELP.comparisonPriority}
              label="Evaluate priority"
            />
          </h5>
        </div>
        <p className="comparison-priority-empty">
          Select 2–3 districts in the table (or on the comparison chart) to contrast alert
          rationale and uncertainty, then set this week’s priority order.
        </p>
      </section>
    );
  }

  const rankOptions = candidates.map((_, index) => String(index + 1));

  const handleRankChange = (districtName, value) => {
    setRanks((prev) => {
      const next = { ...prev, [districtName]: value };
      // Keep ranks unique: clear duplicates.
      if (value) {
        Object.keys(next).forEach((key) => {
          if (key !== districtName && next[key] === value) {
            next[key] = "";
          }
        });
      }
      return next;
    });
    setMessage("");
  };

  const handleSave = () => {
    const ranking = candidates.map((item) => ({
      districtName: item.districtName,
      rank: ranks[item.districtName] ? Number(ranks[item.districtName]) : null,
      status: item.status,
      recommendedActionId: item.recommendation?.actionId || null,
      uncertaintyLevel: item.uncertainty?.level || null,
    }));

    const assigned = ranking.filter((entry) => entry.rank != null);
    if (assigned.length < 2) {
      setMessage("Assign priority ranks to at least two districts before saving.");
      return;
    }

    const record = savePriorityJudgment(districtNames, species, {
      ranking,
      justification: justification.trim(),
      speciesLabel,
    });
    setSaved(record);
    setMessage("Priority judgment saved for this comparison set.");
  };

  const handleClear = () => {
    clearPriorityJudgment(districtNames, species);
    setRanks({});
    setJustification("");
    setSaved(null);
    setMessage("Cleared saved priority judgment.");
  };

  return (
    <section className="comparison-priority" data-tour="comparison-priority">
      <div className="comparison-priority-header">
        <h5>
          Evaluate priority
          <HelpTip
            text={DASHBOARD_HELP.comparisonPriority}
            label="Evaluate priority"
          />
        </h5>
        <span className="comparison-priority-meta">
          Who gets attention first this week?
        </span>
      </div>

      {compare?.summary ? (
        <div className="comparison-priority-deliberate" data-tour="edi-compare">
          <div className="comparison-priority-deliberate-label">
            Compare
            <span>
              {compare.source === "llm" ? "Grounded deliberative" : "Structured deliberative"}
            </span>
          </div>
          <p className="comparison-priority-deliberate-summary">{compare.summary}</p>
          {compare.bullets?.length ? (
            <ul className="comparison-priority-deliberate-bullets">
              {compare.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {compare.questions?.length ? (
            <ul className="comparison-priority-deliberate-questions">
              {compare.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : null}
          <p className="comparison-priority-deliberate-note">
            Contrast only — you still assign the priority order below.
          </p>
        </div>
      ) : null}

      <div
        className="comparison-priority-grid"
        style={{ "--comparison-cols": candidates.length }}
      >
        {candidates.map((item) => {
          const why = item.explanation?.why || item.explanation?.summary || "";
          const tip = [why, item.uncertainty?.detail].filter(Boolean).join(" · ");
          return (
            <article
              key={item.districtName}
              className={`comparison-priority-card comparison-priority-card--${statusTone(
                item.status
              )}`}
              title={tip || undefined}
            >
              <div className="comparison-priority-card-top">
                <h6 className="comparison-priority-district">{item.districtName}</h6>
                <label className="comparison-priority-rank">
                  <span className="comparison-priority-rank-label">Priority</span>
                  <select
                    className="toolbar-select"
                    value={ranks[item.districtName] || ""}
                    onChange={(event) =>
                      handleRankChange(item.districtName, event.target.value)
                    }
                    aria-label={`Priority rank for ${item.districtName}`}
                  >
                    <option value="">—</option>
                    {rankOptions.map((rank) => (
                      <option key={rank} value={rank}>
                        {rank === "1" ? "1st" : rank === "2" ? "2nd" : "3rd"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="comparison-priority-cues">
                <span
                  className={`comparison-priority-status comparison-priority-status--${statusTone(
                    item.status
                  )}`}
                >
                  {item.status}
                  {item.explanation?.level ? ` · ${item.explanation.level}` : ""}
                  <AlertStatusIcons
                    earlyWarning={Boolean(
                      item.alert?.early_warning ?? item.insight?.earlyWarning
                    )}
                    earlyDetection={Boolean(
                      item.alert?.early_detection ?? item.insight?.earlyDetection
                    )}
                    className="comparison-priority-icons"
                  />
                </span>
                <span
                  className={`comparison-priority-uncertainty comparison-priority-uncertainty--${uncertaintyTone(
                    item.uncertainty?.level
                  )}`}
                >
                  {item.uncertainty?.label || "Uncertainty"}
                </span>
              </div>

              <div
                className="comparison-priority-action"
                title={item.recommendation?.rationale || item.recommendation?.description || undefined}
              >
                {item.recommendation?.label || item.recommendation?.shortLabel || "—"}
              </div>
            </article>
          );
        })}
      </div>

      <label className="comparison-priority-justify">
        <span>Justify this priority order</span>
        <textarea
          rows={1}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          placeholder="e.g. clearer exceedance + lower uncertainty first; verify the uncertain district next…"
        />
      </label>

      <div className="comparison-priority-actions">
        <button
          type="button"
          className="decision-panel-btn decision-panel-btn--confirm"
          onClick={handleSave}
        >
          Save priority
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

      {saved ? (
        <p className="comparison-priority-saved" role="status">
          Saved ranking:{" "}
          {saved.ranking
            .filter((entry) => entry.rank != null)
            .sort((a, b) => a.rank - b.rank)
            .map((entry) => `${entry.rank}. ${entry.districtName}`)
            .join(" · ")}
          {saved.justification ? ` — ${saved.justification}` : ""}
          <span className="comparison-priority-saved-time">
            {" "}
            ({new Date(saved.updatedAt).toLocaleString()})
          </span>
        </p>
      ) : null}

      {message ? (
        <p className="comparison-priority-toast" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
