import React from "react";

/**
 * Early warning / early detection badges (map pins and table use the same icons).
 */
export default function AlertStatusIcons({
  earlyWarning = false,
  earlyDetection = false,
  className = "table-status-icons",
}) {
  if (!earlyWarning && !earlyDetection) {
    return null;
  }

  return (
    <span className={className}>
      {earlyWarning ? (
        <span
          className="table-alert-icon table-alert-icon--warning"
          title="Early Warning alert"
          aria-label="Early Warning alert"
        >
          ⚠️
        </span>
      ) : null}
      {earlyDetection ? (
        <span
          className="table-alert-icon table-alert-icon--detection"
          title="Early Detection alert"
          aria-label="Early Detection alert"
        >
          🔍
        </span>
      ) : null}
    </span>
  );
}
