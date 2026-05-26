import { useCallback, useEffect, useRef } from "react";
import { parseXAxisRangeFromRelayoutEvent } from "./plotlyXAxisSync";
import {
  applyPlotlyDateRange,
  applyPlotlyHighlightShapes,
  syncPlotlyDateRange,
} from "./plotlyDateAxisSync";

function detachRelayoutHandler(graphDiv) {
  const handler = graphDiv?._epidemiaRelayoutHandler;
  if (!graphDiv || !handler) return;
  graphDiv.removeListener("plotly_relayout", handler);
  delete graphDiv._epidemiaRelayoutHandler;
}

function detachAfterPlotHandler(graphDiv) {
  const handler = graphDiv?._epidemiaAfterPlotHandler;
  if (!graphDiv || !handler) return;
  graphDiv.removeListener("plotly_afterplot", handler);
  delete graphDiv._epidemiaAfterPlotHandler;
}

function runWithRelayoutSuppressed(suppressRef, task) {
  suppressRef.current = true;
  return Promise.resolve(task()).finally(() => {
    suppressRef.current = false;
  });
}

function applyHighlightForChart(
  plotRegistryRef,
  highlightResolversRef,
  syncedHoverDateRef,
  chartId
) {
  const graphDiv = plotRegistryRef.current.get(chartId);
  if (!graphDiv) return Promise.resolve();

  const resolver = highlightResolversRef.current.get(chartId);
  const highlightDate = resolver ? resolver(syncedHoverDateRef.current) : null;
  return applyPlotlyHighlightShapes(graphDiv, highlightDate);
}

function applyAllHighlights(
  plotRegistryRef,
  highlightResolversRef,
  syncedHoverDateRef
) {
  const jobs = [];
  plotRegistryRef.current.forEach((_graphDiv, chartId) => {
    jobs.push(
      applyHighlightForChart(
        plotRegistryRef,
        highlightResolversRef,
        syncedHoverDateRef,
        chartId
      )
    );
  });
  return Promise.all(jobs);
}

/**
 * Register Plotly graph divs, keep x-axis aligned with chart date pickers,
 * and push synced hover markers after every plot redraw.
 */
export function useChartPlotRegistry(
  startDate,
  endDate,
  onDateRelayout,
  syncedHoverDate
) {
  const plotRegistryRef = useRef(new Map());
  const highlightResolversRef = useRef(new Map());
  const suppressRelayoutRef = useRef(false);
  const datesRef = useRef({ startDate, endDate });
  const onDateRelayoutRef = useRef(onDateRelayout);
  const syncedHoverDateRef = useRef(syncedHoverDate);

  datesRef.current = { startDate, endDate };
  onDateRelayoutRef.current = onDateRelayout;
  syncedHoverDateRef.current = syncedHoverDate;

  const registerHighlightResolver = useCallback((chartId, resolver) => {
    if (resolver) {
      highlightResolversRef.current.set(chartId, resolver);
      applyHighlightForChart(
        plotRegistryRef,
        highlightResolversRef,
        syncedHoverDateRef,
        chartId
      );
      return;
    }
    highlightResolversRef.current.delete(chartId);
  }, []);

  const registerPlot = useCallback((chartId, _figure, graphDiv) => {
    if (!graphDiv) return;

    const previous = plotRegistryRef.current.get(chartId);
    if (previous && previous !== graphDiv) {
      detachRelayoutHandler(previous);
      detachAfterPlotHandler(previous);
    }

    const relayoutHandler = (ev) => {
      if (suppressRelayoutRef.current) return;

      let payload = ev;
      if (parseXAxisRangeFromRelayoutEvent(ev) == null) {
        const layoutRange = graphDiv._fullLayout?.xaxis?.range;
        const axisTouched =
          ev &&
          typeof ev === "object" &&
          Object.keys(ev).some((key) => key === "xaxis" || key.startsWith("xaxis."));
        if (axisTouched && Array.isArray(layoutRange) && layoutRange.length >= 2) {
          payload = {
            "xaxis.range[0]": layoutRange[0],
            "xaxis.range[1]": layoutRange[1],
          };
        }
      }

      onDateRelayoutRef.current?.(payload);
    };

    const afterPlotHandler = () => {
      applyHighlightForChart(
        plotRegistryRef,
        highlightResolversRef,
        syncedHoverDateRef,
        chartId
      );
    };

    graphDiv.on("plotly_relayout", relayoutHandler);
    graphDiv._epidemiaRelayoutHandler = relayoutHandler;
    graphDiv.on("plotly_afterplot", afterPlotHandler);
    graphDiv._epidemiaAfterPlotHandler = afterPlotHandler;
    plotRegistryRef.current.set(chartId, graphDiv);

    runWithRelayoutSuppressed(suppressRelayoutRef, () =>
      applyPlotlyDateRange(
        graphDiv,
        datesRef.current.startDate,
        datesRef.current.endDate
      )
    ).finally(() =>
      applyHighlightForChart(
        plotRegistryRef,
        highlightResolversRef,
        syncedHoverDateRef,
        chartId
      )
    );
  }, []);

  const makePlotReadyHandler = useCallback(
    (chartId) => (figure, graphDiv) => registerPlot(chartId, figure, graphDiv),
    [registerPlot]
  );

  const makePlotPurgeHandler = useCallback(
    (chartId) => () => {
      const graphDiv = plotRegistryRef.current.get(chartId);
      if (graphDiv) {
        detachRelayoutHandler(graphDiv);
        detachAfterPlotHandler(graphDiv);
        plotRegistryRef.current.delete(chartId);
      }
    },
    []
  );

  useEffect(() => {
    let innerRaf = 0;
    const outerRaf = window.requestAnimationFrame(() => {
      innerRaf = window.requestAnimationFrame(() => {
        applyAllHighlights(
          plotRegistryRef,
          highlightResolversRef,
          syncedHoverDateRef
        );
      });
    });
    return () => {
      window.cancelAnimationFrame(outerRaf);
      if (innerRaf) window.cancelAnimationFrame(innerRaf);
    };
  }, [syncedHoverDate]);

  useEffect(() => {
    return () => {
      plotRegistryRef.current.forEach((graphDiv) => {
        detachRelayoutHandler(graphDiv);
        detachAfterPlotHandler(graphDiv);
      });
      plotRegistryRef.current.clear();
      highlightResolversRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    runWithRelayoutSuppressed(suppressRelayoutRef, () =>
      syncPlotlyDateRange(plotRegistryRef.current, startDate, endDate)
    ).finally(() => {
      if (cancelled) return;
      applyAllHighlights(
        plotRegistryRef,
        highlightResolversRef,
        syncedHoverDateRef
      );
    });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  return { makePlotReadyHandler, makePlotPurgeHandler, registerHighlightResolver };
}
