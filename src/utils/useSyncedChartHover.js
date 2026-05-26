import { useCallback, useEffect, useRef } from "react";
import { normalizeHoverDate } from "./chartHighlightDate";

const CLEAR_HOVER_DELAY_MS = 120;

export function useSyncedChartHover(onHoverDateChange) {
  const clearTimerRef = useRef(null);

  useEffect(
    () => () => {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
      }
    },
    []
  );

  const syncHoverDate = useCallback(
    (event) => {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }

      const rawX =
        event?.points?.[0]?.x ??
        event?.xvals?.[0] ??
        event?.points?.[0]?.text;
      const normalized = normalizeHoverDate(rawX);
      if (normalized && onHoverDateChange) {
        onHoverDateChange(normalized);
      }
    },
    [onHoverDateChange]
  );

  const clearHoverDate = useCallback(() => {
    if (!onHoverDateChange) return;

    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
    }

    clearTimerRef.current = window.setTimeout(() => {
      onHoverDateChange(null);
      clearTimerRef.current = null;
    }, CLEAR_HOVER_DELAY_MS);
  }, [onHoverDateChange]);

  return { syncHoverDate, clearHoverDate };
}
