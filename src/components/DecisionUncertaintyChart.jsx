import React, { useMemo } from "react";
import HelpTip from "./HelpTip";
import { Plot } from "../utils/plotly";
import { toPlotlyDateMs, useChartSlotHeight } from "../utils/chartDateRange";
import {
  buildPlotlyDateXAxis,
  buildPlotlyValueYAxis,
  CHART_PLOT_CONFIG,
  CHART_PLOT_SURFACE,
} from "../utils/plotlyDateAxisSync";
import { buildDecisionUncertaintyChartData } from "../utils/buildDecisionUncertaintyChartData";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";

const LEVEL_BAND = {
  low: "rgba(15, 123, 108, 0.22)",
  moderate: "rgba(209, 127, 34, 0.22)",
  high: "rgba(201, 62, 62, 0.2)",
};

/**
 * Visualizes residual-based uncertainty used by the Decision Panel.
 * Plot height matches Charts-tab slots via useChartSlotHeight / --dash-chart-height.
 */
export default function DecisionUncertaintyChart({
  observedHistory = [],
  forecastPoints = [],
  uncertainty = null,
  districtName = "",
  height: heightProp = null,
  compact = false,
}) {
  const { height: slotHeight, slotRef: chartSlotRef } = useChartSlotHeight();
  const height = heightProp != null ? heightProp : slotHeight;

  const series = useMemo(
    () =>
      buildDecisionUncertaintyChartData({
        observedHistory,
        forecastPoints,
        uncertainty,
      }),
    [forecastPoints, observedHistory, uncertainty]
  );

  const plotData = useMemo(() => {
    const history = series.history || [];
    const forecast = series.forecast || [];
    if (!history.length && !forecast.length) return [];

    const histX = history.map((point) => toPlotlyDateMs(point.date));
    const forecastX = forecast.map((point) => toPlotlyDateMs(point.date));
    const fillColor = LEVEL_BAND[series.level] || LEVEL_BAND.moderate;

    const traces = [];

    if (forecast.length && forecast.every((point) => point.piUpper != null)) {
      traces.push(
        {
          x: forecastX,
          y: forecast.map((point) => point.piUpper),
          type: "scatter",
          mode: "lines",
          line: { width: 0 },
          hoverinfo: "skip",
          showlegend: false,
          name: "PI upper",
        },
        {
          x: forecastX,
          y: forecast.map((point) => point.piLower),
          type: "scatter",
          mode: "lines",
          line: { width: 0 },
          fill: "tonexty",
          fillcolor: fillColor,
          name: "~80% residual PI",
          hovertemplate: "PI lower: %{y:.1f}<extra></extra>",
        }
      );
    }

    if (history.some((point) => point.expected != null)) {
      traces.push({
        x: histX,
        y: history.map((point) => point.expected),
        type: "scatter",
        mode: "lines",
        name: "Expected (detection)",
        line: { color: "#7a8799", width: 1.8, dash: "dot" },
        hovertemplate: "Expected (detection): %{y:.1f}<extra></extra>",
      });
    }

    if (history.length) {
      traces.push({
        x: histX,
        y: history.map((point) => point.observed),
        type: "scatter",
        mode: "lines",
        name: "Observed",
        line: { color: "#1f5b9b", width: 2.2 },
        hovertemplate: "Observed: %{y:.1f}<extra></extra>",
      });
    }

    if (forecast.length) {
      traces.push({
        x: forecastX,
        y: forecast.map((point) => point.median),
        type: "scatter",
        mode: "lines+markers",
        name: "Forecast",
        line: { color: "#0f7b6c", width: 2.4 },
        marker: { size: 5, color: "#0f7b6c" },
        hovertemplate: "Forecast: %{y:.1f}<extra></extra>",
      });
    }

    // Residual markers on recent history (secondary cue).
    const residualPoints = history.filter((point) => point.residual != null);
    if (residualPoints.length) {
      traces.push({
        x: residualPoints.map((point) => toPlotlyDateMs(point.date)),
        y: residualPoints.map((point) => point.residual),
        type: "scatter",
        mode: "markers",
        name: "Residual",
        yaxis: "y2",
        marker: {
          size: 4,
          color: "rgba(76, 90, 112, 0.55)",
        },
        hovertemplate: "Residual: %{y:.1f}<extra></extra>",
      });
    }

    return traces;
  }, [series]);

  const layout = useMemo(() => {
    const allDates = [
      ...(series.history || []).map((point) => point.date),
      ...(series.forecast || []).map((point) => point.date),
    ]
      .map((value) => String(value || "").slice(0, 10))
      .filter(Boolean)
      .sort();
    const xRange =
      allDates.length >= 2 ? [allDates[0], allDates[allDates.length - 1]] : null;

    return {
      autosize: true,
      height,
      margin: compact
        ? { l: 38, r: 38, b: 32, t: 42 }
        : { l: 42, r: 48, b: 36, t: 36 },
      ...CHART_PLOT_SURFACE,
      dragmode: "zoom",
      hovermode: "x unified",
      xaxis: buildPlotlyDateXAxis("", xRange),
      yaxis: buildPlotlyValueYAxis(compact ? "" : "Weekly cases", {
        nonnegative: true,
      }),
      yaxis2: {
        title: compact
          ? undefined
          : {
              text: "Residual",
              font: { size: 10, color: "#6b778a" },
            },
        overlaying: "y",
        side: "right",
        showgrid: false,
        zeroline: true,
        zerolinecolor: "rgba(76, 90, 112, 0.35)",
        tickfont: { size: 9, color: "#6b778a" },
        titlefont: { size: 10, color: "#6b778a" },
        fixedrange: true,
        showticklabels: !compact,
      },
      legend: {
        orientation: "h",
        y: compact ? 1.18 : 1.14,
        yanchor: "bottom",
        x: 0,
        xanchor: "left",
        font: { size: compact ? 9 : 10 },
        bgcolor: "rgba(0,0,0,0)",
      },
      annotations:
        !compact && series.residualSd != null
          ? [
              {
                xref: "paper",
                yref: "paper",
                x: 1,
                y: 1.02,
                xanchor: "right",
                yanchor: "bottom",
                showarrow: false,
                align: "right",
                text: `SD ${series.residualSd.toFixed(1)} · ±${(
                  series.halfWidth80 || 0
                ).toFixed(1)} (80%) · ${(
                  (series.relativeSd || 0) * 100
                ).toFixed(0)}% of level`,
                font: { size: 10, color: "#4c5a70" },
              },
            ]
          : [],
    };
  }, [compact, height, series]);

  if (!plotData.length) {
    return (
      <section className="decision-uncertainty-chart decision-uncertainty-chart--empty">
        <div className="decision-uncertainty-chart-header">
          <h5>
            Residual uncertainty
            <HelpTip
              text={DASHBOARD_HELP.decisionUncertaintyChart}
              label="Residual uncertainty chart"
            />
          </h5>
        </div>
        <p className="decision-uncertainty-chart-empty">
          Not enough history to chart residual uncertainty
          {districtName ? ` for ${districtName}` : ""}.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`decision-uncertainty-chart${compact ? " decision-uncertainty-chart--compact" : ""}`}
      data-tour="decision-uncertainty-chart"
    >
      <div className="decision-uncertainty-chart-header">
        <h5>
          Residual uncertainty
          <HelpTip
            text={DASHBOARD_HELP.decisionUncertaintyChart}
            label="Residual uncertainty chart"
          />
        </h5>
        {!compact ? (
          <span
            className={`decision-uncertainty-chart-level decision-uncertainty-chart-level--${series.level}`}
          >
            {series.label}
          </span>
        ) : null}
      </div>
      {!compact ? (
        <p className="decision-uncertainty-chart-caption">
          observed vs expected (detection / seasonal baseline). Forecast band uses
          historical residual SD (~80% interval).
        </p>
      ) : null}
      <div
        ref={chartSlotRef}
        className="decision-uncertainty-chart-plot chart-panel-slot"
      >
        <Plot
          data={plotData}
          layout={layout}
          config={CHART_PLOT_CONFIG}
          useResizeHandler
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </section>
  );
}
