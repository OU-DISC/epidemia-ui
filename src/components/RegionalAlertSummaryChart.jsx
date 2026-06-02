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

export default function RegionalAlertSummaryChart({
  rows = [],
  selectedAdminRegion,
  speciesLabel,
  compact = false,
  embedded = false,
}) {
  const barData = useMemo(
    () => buildRegionalAlertSummary(rows, selectedAdminRegion),
    [rows, selectedAdminRegion]
  );

  const embeddedBarData = useMemo(
    () => barData.filter((row) => row.anyElevated > 0),
    [barData]
  );

  const scopeLabel =
    selectedAdminRegion && selectedAdminRegion !== "All Regions"
      ? selectedAdminRegion
      : "All regions";

  const chartHeight = embedded
    ? Math.min(220, Math.max(88, embeddedBarData.length * 22 + 12))
    : compact
      ? Math.max(220, barData.length * 26)
      : Math.max(280, barData.length * 32);

  const elevatedTotal = embedded
    ? embeddedBarData.reduce((sum, row) => sum + row.anyElevated, 0)
    : barData.reduce((sum, row) => sum + row.anyElevated, 0);

  const sectionClassName = [
    "regional-alert-summary",
    embedded ? "regional-alert-summary--embedded" : "glass-card fade-in-up delay-1",
    compact ? "regional-alert-summary--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (embedded) {
    return (
      <section className={sectionClassName} aria-label="Alerts by region">
        <span className="regional-alert-inline-label">
          By region
          <HelpTip text={DASHBOARD_HELP.regionalAlertSummary} label="Regional alert summary" />
        </span>
        <div className="regional-alert-inline-legend">
          <span>
            <i style={{ background: ED_COLOR }} />
            Detection
          </span>
          <span>
            <i style={{ background: EW_COLOR }} />
            Warning
          </span>
        </div>
        {elevatedTotal === 0 ? (
          <span className="regional-alert-inline-empty">No Medium/High alerts</span>
        ) : (
          <div className="regional-alert-inline-chart" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={embeddedBarData}
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
        )}
      </section>
    );
  }

  return (
    <section className={sectionClassName}>
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
          <div className="regional-alert-legend">
            <span>
              <i style={{ background: ED_COLOR }} /> Early Detection
            </span>
            <span>
              <i style={{ background: EW_COLOR }} /> Early Warning
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
