import { useMemo } from "react";

import HelpTip from "./HelpTip";
import { DASHBOARD_HELP } from "../utils/dashboardHelpText";
import { formatSeasonalDelta } from "../utils/buildSeasonalContext";

const SEGMENTS = 52;
const CX = 44;
const CY = 44;
const R_OUTER = 38;
const R_INNER = 26;
const GAP_DEG = 0.6;

function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function describeDonutSegment(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, rOuter, startAngle);
  const endOuter = polarToCartesian(cx, cy, rOuter, endAngle);
  const startInner = polarToCartesian(cx, cy, rInner, endAngle);
  const endInner = polarToCartesian(cx, cy, rInner, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

function ringSegmentColor(intensity, max) {
  const t = max > 0 ? Math.min(1, intensity / max) : 0;
  const start = { r: 214, g: 228, b: 226 };
  const end = { r: 217, g: 119, b: 6 };
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatCases(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function buildTooltip(context) {
  const lines = [
    `Epidemiological week ${context.week}`,
    `Week starting ${context.weekStart}`,
    `Observed: ${formatCases(context.observed)} cases`,
  ];

  if (context.hasGamBaseline) {
    lines.push(`Seasonal expectation (GAM): ${formatCases(context.expected)} cases`);
  }
  if (context.empiricalMedian != null) {
    lines.push(`Historical median (same week): ${formatCases(context.empiricalMedian)} cases`);
  }
  if (context.percentVsExpected != null && context.hasGamBaseline) {
    lines.push(`${formatSeasonalDelta(context.percentVsExpected)} vs seasonal expectation`);
  }

  return lines.join("\n");
}

export default function SeasonalContextRing({ context }) {
  const segments = useMemo(() => {
    if (!context?.ring?.length) return [];

    const step = 360 / SEGMENTS;
    return context.ring.map((value, index) => {
      const startAngle = index * step + GAP_DEG / 2;
      const endAngle = (index + 1) * step - GAP_DEG / 2;
      return {
        index,
        path: describeDonutSegment(CX, CY, R_OUTER, R_INNER, startAngle, endAngle),
        fill: ringSegmentColor(value, context.ringMax),
        isCurrent: index + 1 === context.week,
      };
    });
  }, [context]);

  if (!context) return null;

  const deltaLabel = formatSeasonalDelta(context.percentVsExpected);
  const tooltip = buildTooltip(context);

  return (
    <span className="seasonal-context-ring-wrap">
      <span
        className="seasonal-context-ring"
        title={tooltip}
        aria-label={tooltip.replace(/\n/g, ". ")}
        role="img"
      >
        <svg viewBox="0 0 88 88" aria-hidden="true">
          {segments.map((segment) => (
            <path
              key={segment.index}
              d={segment.path}
              fill={segment.fill}
              stroke={segment.isCurrent ? "var(--accent-strong)" : "rgba(255, 255, 255, 0.55)"}
              strokeWidth={segment.isCurrent ? 1.6 : 0.35}
            />
          ))}
          <text x={CX} y={CY - 2} textAnchor="middle" className="seasonal-context-ring-center">
            {deltaLabel}
          </text>
          <text x={CX} y={CY + 10} textAnchor="middle" className="seasonal-context-ring-week">
            Wk {context.week}
          </text>
        </svg>
      </span>
      <HelpTip text={DASHBOARD_HELP.seasonalContext} label="Seasonal context" />
    </span>
  );
}
