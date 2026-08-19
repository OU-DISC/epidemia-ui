import React from "react";
import { ALERT_MARKER_KINDS } from "../utils/alertMarkerKinds";

/**
 * Early warning / early detection badges — same emoji + colors as map pins.
 */
export default function AlertStatusIcons({
  earlyWarning = false,
  earlyDetection = false,
  className = "table-status-icons",
}) {
  if (!earlyWarning && !earlyDetection) {
    return null;
  }

  const warning = ALERT_MARKER_KINDS.ew;
  const detection = ALERT_MARKER_KINDS.ed;

  return (
    <span className={className}>
      {earlyWarning ? (
        <span
          className="table-alert-icon table-alert-icon--warning"
          title={`${warning.label} — forecast exceeds the seasonal expected level (future risk)`}
          aria-label={`${warning.label}: forecast above expected`}
        >
          {warning.icon}
        </span>
      ) : null}
      {earlyDetection ? (
        <span
          className="table-alert-icon table-alert-icon--detection"
          title={`${detection.label} — observed cases exceed the Farrington threshold (confirmed now)`}
          aria-label={`${detection.label}: observed cases above threshold`}
        >
          {detection.icon}
        </span>
      ) : null}
    </span>
  );
}
