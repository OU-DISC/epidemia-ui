import { useEffect, useState } from "react";

/**
 * Study condition for Baseline vs EDI (Explainable Decision Intelligence).
 *
 * URL:
 *   ?condition=baseline  — prediction-centric UI (no Decision / EDI surfaces)
 *   ?condition=edi       — full EDI UI (explicit study arm)
 *
 * No param → product default (EDI features on, no study banner).
 *
 * Aliases: study=…, baseline|base|control, edi|treatment|full
 */

export const STUDY_CONDITION = {
  BASELINE: "baseline",
  EDI: "edi",
};

function normalizeCondition(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "baseline" || value === "base" || value === "control") {
    return STUDY_CONDITION.BASELINE;
  }
  if (value === "edi" || value === "treatment" || value === "full") {
    return STUDY_CONDITION.EDI;
  }
  return null;
}

export function readStudyConditionFromSearch(search = "") {
  if (typeof window !== "undefined" && !search) {
    search = window.location.search || "";
  }
  const params = new URLSearchParams(search);
  return normalizeCondition(params.get("condition") || params.get("study"));
}

/** EDI surfaces (Decision tab, explanation card, uncertainty-as-action) are shown. */
export function isEdiEnabled(condition = readStudyConditionFromSearch()) {
  return condition !== STUDY_CONDITION.BASELINE;
}

export function getStudyConditionLabel(condition) {
  if (condition === STUDY_CONDITION.BASELINE) return "Baseline";
  if (condition === STUDY_CONDITION.EDI) return "EDI";
  return null;
}

/**
 * Tracks ?condition= from the URL (including back/forward).
 */
export function useStudyCondition() {
  const [condition, setCondition] = useState(() => readStudyConditionFromSearch());

  useEffect(() => {
    const sync = () => setCondition(readStudyConditionFromSearch());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return {
    condition,
    ediEnabled: isEdiEnabled(condition),
    studyLabel: getStudyConditionLabel(condition),
    isStudyArm: condition === STUDY_CONDITION.BASELINE || condition === STUDY_CONDITION.EDI,
  };
}
