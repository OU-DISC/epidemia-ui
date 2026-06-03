import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import HelpTip from "./HelpTip";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";
import { buildRegionalAlertSummary } from "../utils/buildRegionalAlertSummary";

const ED_COLOR = "#4682b4";
const EW_COLOR = "#9932cc";

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="regional-alert-tooltip">
      <strong>{label}</strong>
      <div>Early Detection (Medium/High): {row.edElevated}</div>
      <div>Early Warning (Medium/High): {row.ewElevated}</div>
      <div>Both elevated: {row.bothElevated}</div>
      <div>Districts modeled: {row.districts}</div>
    </div>
  );
}

function RegionalAlertLegend({ className = "regional-alert-inline-legend", short = true }) {
  return (
    <div className={className}>
      <span>
        <i style={{ background: ED_COLOR }} />
        {short ? "Detection" : "Early Detection"}
      </span>
      <span>
        <i style={{ background: EW_COLOR }} />
        {short ? "Warning" : "Early Warning"}
      </span>
    </div>
  );
}

export default function RegionalAlertSummaryChart({
  rows = [],
  selectedAdminRegion,
  speciesLabel,
  compact = false,
  inChartsPanel = false,
}) {
  const barData = useMemo(
    () => buildRegionalAlertSummary(rows, selectedAdminRegion),
    [rows, selectedAdminRegion]
  );

  const elevatedBarData = useMemo(
    () => barData.filter((row) => row.anyElevated > 0),
    [barData]
  );

  const scopeLabel =
    selectedAdminRegion && selectedAdminRegion !== "All Regions"
      ? selectedAdminRegion
      : "All regions";

  const chartHeight = inChartsPanel
    ? Math.min(64, Math.max(48, elevatedBarData.length * 16 + 12))
    : compact
      ? Math.max(220, barData.length * 26)
      : Math.max(280, barData.length * 32);

  const elevatedTotal = inChartsPanel
    ? elevatedBarData.reduce((sum, row) => sum + row.anyElevated, 0)
    : barData.reduce((sum, row) => sum + row.anyElevated, 0);

  const chartData = inChartsPanel ? elevatedBarData : barData;

  const panelChart = elevatedTotal === 0 ? (
    <p className="regional-alert-panel-empty">No districts with Medium or High alerts in this scope.</p>
  ) : (
    <div className="regional-alert-panel-chart" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 2, right: 8, left: 4, bottom: 2 }}
          barGap={2}
        >
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 9 }} height={16} />
          <YAxis
            type="category"
            dataKey="region"
            width={76}
            tick={{ fontSize: 9 }}
            tickFormatter={(value) => {
              const label = String(value);
              return label.length > 11 ? `${label.slice(0, 10)}…` : label;
            }}
          />
          <Tooltip content={<BarTooltip />} />
          <Bar
            dataKey="edElevated"
            name="Early Detection (Medium/High)"
            fill={ED_COLOR}
            barSize={7}
            radius={[0, 3, 3, 0]}
          />
          <Bar
            dataKey="ewElevated"
            name="Early Warning (Medium/High)"
            fill={EW_COLOR}
            barSize={7}
            radius={[0, 3, 3, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  if (inChartsPanel) {
    return (
      <section className="regional-alert-panel" aria-label="Alerts by region">
        <div className="regional-alert-panel-header">
          <h4 className="regional-alert-panel-title">
            <span className="panel-header-label">
              Alerts by region
              <HelpTip text={DASHBOARD_HELP.regionalAlertSummary} label="Regional alert summary" />
            </span>
          </h4>
          <RegionalAlertLegend />
        </div>
        {panelChart}
      </section>
    );
  }

  return (
    <section
      className={[
        "regional-alert-summary",
        "glass-card fade-in-up delay-1",
        compact ? "regional-alert-summary--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="regional-alert-summary-header">
        <div>
          <h3>
            <span className="panel-header-label">
              Alerts by region
              <HelpTip text={DASHBOARD_HELP.regionalAlertSummary} label="Regional alert summary" />
            </span>
          </h3>
          <p className="regional-alert-summary-subtitle">
            {speciesLabel} · {scopeLabel} · districts with Medium or High alert levels
          </p>
        </div>
      </div>

      {elevatedTotal === 0 ? (
        <p className="regional-alert-empty">
          No districts with Medium or High Early Detection or Early Warning levels in this scope.
        </p>
      ) : (
        <div className="regional-alert-chart-wrap" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="region"
                width={compact ? 88 : 108}
                tick={{ fontSize: 11 }}
              />
              <Tooltip content={<BarTooltip />} />
              <Bar dataKey="edElevated" name="Early Detection (Medium/High)" fill={ED_COLOR} radius={[0, 4, 4, 0]} />
              <Bar dataKey="ewElevated" name="Early Warning (Medium/High)" fill={EW_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <RegionalAlertLegend className="regional-alert-legend" short={false} />
        </div>
      )}
    </section>
  );
}
