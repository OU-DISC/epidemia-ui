import { useCallback, useRef } from "react";
import {
  normalizeChartAxisDate,
  parseXAxisRangeFromRelayoutEvent,
  xAxisRangesEqual,
} from "./plotlyXAxisSync";

/**
 * Publish x-axis zoom from one chart to shared dashboard state.
 * Ignores relayout echoes that match the range already applied from a peer chart.
 */
export function useSyncedChartRelayout(syncedXRange, onXRangeChange, chartId) {
  const lastEmittedRef = useRef(null);

  return useCallback(
    (ev) => {
      if (!onXRangeChange) return;

      const parsed = parseXAxisRangeFromRelayoutEvent(ev);
      if (parsed == null) return;

      if (parsed === "autorange") {
        lastEmittedRef.current = null;
        onXRangeChange(null, chartId);
        return;
      }

      const normalized = [
        normalizeChartAxisDate(parsed[0]),
        normalizeChartAxisDate(parsed[1]),
      ];

      if (xAxisRangesEqual(normalized, syncedXRange)) {
        lastEmittedRef.current = normalized;
        return;
      }

      if (xAxisRangesEqual(normalized, lastEmittedRef.current)) {
        return;
      }

      lastEmittedRef.current = normalized;
      onXRangeChange(normalized, chartId);
    },
    [chartId, onXRangeChange, syncedXRange]
  );
}
