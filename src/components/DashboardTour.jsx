import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  DASHBOARD_TOUR_STEPS,
  DASHBOARD_TOUR_STORAGE_KEY,
} from "../utils/dashboardTourSteps";

const PAD = 8;
const TOOLTIP_GAP = 12;

const TOUR_ATTEMPTED_SESSION_KEY = "epidemia.dashboardTour.attempted.v1";

function readTourCompleted() {
  try {
    return window.localStorage.getItem(DASHBOARD_TOUR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTourCompleted() {
  try {
    window.localStorage.setItem(DASHBOARD_TOUR_STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

function readTourAttemptedThisSession() {
  try {
    return window.sessionStorage.getItem(TOUR_ATTEMPTED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTourAttemptedThisSession() {
  try {
    window.sessionStorage.setItem(TOUR_ATTEMPTED_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

function measureTarget(selector) {
  if (!selector || typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 && rect.height < 2) return null;
  return {
    top: Math.max(0, rect.top - PAD),
    left: Math.max(0, rect.left - PAD),
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
    bottom: rect.bottom,
    right: rect.right,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onPrepareStep?: (step: object) => void,
 * }} props
 */
function DashboardTour({ open, onClose, onPrepareStep }) {
  const steps = DASHBOARD_TOUR_STEPS;
  const [index, setIndex] = useState(0);
  const [targetBox, setTargetBox] = useState(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 320, height: 180 });
  const tooltipRef = React.useRef(null);

  const step = steps[index] || steps[0];
  const isFirst = index <= 0;
  const isLast = index >= steps.length - 1;

  const refreshTarget = useCallback(() => {
    setTargetBox(measureTarget(step?.target));
  }, [step?.target]);

  useEffect(() => {
    if (!open) return undefined;
    setIndex(0);
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open || !step) return undefined;
    onPrepareStep?.(step);

    const timers = [
      window.setTimeout(refreshTarget, 50),
      window.setTimeout(refreshTarget, 280),
      window.setTimeout(refreshTarget, 600),
    ];

    if (step.target) {
      const el = document.querySelector(step.target);
      el?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [open, step, index, onPrepareStep, refreshTarget]);

  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => refreshTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, refreshTarget]);

  useLayoutEffect(() => {
    if (!open || !tooltipRef.current) return;
    const rect = tooltipRef.current.getBoundingClientRect();
    setTooltipSize({ width: rect.width, height: rect.height });
  }, [open, index, step, targetBox]);

  const finish = useCallback(() => {
    writeTourCompleted();
    onClose?.();
  }, [onClose]);

  const goNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [finish, isLast, steps.length]);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const tooltipStyle = useMemo(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const tw = tooltipSize.width || 320;
    const th = tooltipSize.height || 180;

    if (!targetBox || step?.placement === "center") {
      return {
        position: "fixed",
        top: Math.max(24, (vh - th) / 2),
        left: clamp((vw - tw) / 2, 16, vw - tw - 16),
        zIndex: 10002,
      };
    }

    const preferBelow = targetBox.bottom + TOOLTIP_GAP + th < vh - 16;
    const top = preferBelow
      ? targetBox.top + targetBox.height + TOOLTIP_GAP
      : Math.max(16, targetBox.top - th - TOOLTIP_GAP);
    const left = clamp(targetBox.left, 16, vw - tw - 16);

    return {
      position: "fixed",
      top,
      left,
      zIndex: 10002,
    };
  }, [step?.placement, targetBox, tooltipSize]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        goNext();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish, goNext, goBack]);

  if (!open || !step) return null;

  return (
    <div className="dashboard-tour" role="dialog" aria-modal="true" aria-labelledby="dashboard-tour-title">
      <div className="dashboard-tour-backdrop" onClick={finish} aria-hidden="true" />

      {targetBox ? (
        <div
          className="dashboard-tour-spotlight"
          style={{
            top: targetBox.top,
            left: targetBox.left,
            width: targetBox.width,
            height: targetBox.height,
          }}
          aria-hidden="true"
        />
      ) : null}

      <div className="dashboard-tour-tooltip" ref={tooltipRef} style={tooltipStyle}>
        <div className="dashboard-tour-progress">
          Step {index + 1} of {steps.length}
        </div>
        <h2 id="dashboard-tour-title" className="dashboard-tour-title">
          {step.title}
        </h2>
        <p className="dashboard-tour-body">{step.body}</p>
        <div className="dashboard-tour-actions">
          <button type="button" className="dashboard-tour-btn ghost" onClick={finish}>
            Skip
          </button>
          <div className="dashboard-tour-actions-right">
            <button
              type="button"
              className="dashboard-tour-btn ghost"
              onClick={goBack}
              disabled={isFirst}
            >
              Back
            </button>
            <button type="button" className="dashboard-tour-btn primary" onClick={goNext}>
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function shouldAutoStartDashboardTour() {
  // Completed tours never auto-start again. Also skip if we already tried this
  // browser session (prevents remount / media-query loops from reopening it).
  if (readTourCompleted() || readTourAttemptedThisSession()) return false;
  return true;
}

/** Call when auto-start is about to open the tour. */
export function markDashboardTourAutoStartAttempted() {
  writeTourAttemptedThisSession();
}

export default DashboardTour;
