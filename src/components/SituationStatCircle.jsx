import React from "react";
import HelpTip from "./HelpTip";

function SituationStatCircle({
  label,
  helpText,
  helpLabel,
  value,
  valueClassName = "",
  kind = "metric",
  pipelineKind,
  detail,
  progressPercent,
  showLabel = true,
  showCaption = true,
  compact = false,
}) {
  const ringClass = pipelineKind ? `situation-stat-ring--${pipelineKind}` : "";
  const showProgress = progressPercent != null && Number.isFinite(Number(progressPercent));
  const progress = showProgress ? Math.min(100, Math.max(0, Number(progressPercent))) : 0;
  const radius = compact ? 34 : 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (progress / 100) * circumference;
  const viewBox = compact ? "0 0 80 80" : "0 0 96 96";
  const center = compact ? 40 : 48;

  return (
    <article
      className={[
        "situation-stat",
        `situation-stat--${kind}`,
        compact ? "situation-stat--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={detail || helpText || undefined}
      aria-label={detail ? `${label}: ${detail}` : `${label}: ${helpText}`}
    >
      <div className={`situation-stat-ring ${ringClass}`.trim()}>
        {showProgress ? (
          <svg className="situation-stat-progress" viewBox={viewBox} aria-hidden="true">
            <circle className="situation-stat-progress-track" cx={center} cy={center} r={radius} />
            <circle
              className="situation-stat-progress-fill"
              cx={center}
              cy={center}
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
        ) : null}
        <div className={`situation-stat-core ${pipelineKind ? `situation-pipeline-${pipelineKind}` : ""}`}>
          <span className={`situation-stat-value ${valueClassName}`.trim()}>{value}</span>
        </div>
      </div>
      {showLabel ? (
        <span className="situation-stat-label">
          {label}
          <HelpTip text={helpText} label={helpLabel} placement="below" />
        </span>
      ) : (
        <HelpTip text={helpText} label={helpLabel} placement="below" />
      )}
      {showCaption && detail && kind === "pipeline" ? (
        <span className="situation-stat-caption" title={detail}>
          {detail}
        </span>
      ) : null}
    </article>
  );
}

export default SituationStatCircle;
