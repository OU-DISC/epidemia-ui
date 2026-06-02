function formatSparklineTitle(weeks, values) {
  if (!weeks?.length) return "No recent case history";
  return weeks
    .map((week, index) => {
      const value = values[index];
      const formatted =
        value == null || Number.isNaN(Number(value))
          ? "—"
          : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(value));
      return `${week}: ${formatted} cases`;
    })
    .join("\n");
}

function statusClassName(status) {
  if (status === "Early Warning") return "case-sparkline--warning";
  if (status === "Early Detection") return "case-sparkline--detection";
  return "case-sparkline--normal";
}

export default function CaseSparkline({
  values = [],
  weeks = [],
  status,
  width = 84,
  height = 26,
}) {
  if (!values.length) {
    return (
      <span className="case-sparkline-empty" title="No recent case history">
        —
      </span>
    );
  }

  const padding = 2;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || max || 1;

  const points = values
    .map((value, index) => {
      const x = padding + (index / Math.max(values.length - 1, 1)) * innerWidth;
      const normalized = (value - min) / range;
      const y = padding + innerHeight - normalized * innerHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className={`case-sparkline ${statusClassName(status)}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Last ${values.length} weeks of observed cases`}
    >
      <title>{formatSparklineTitle(weeks, values)}</title>
      {values.length === 1 ? (
        <circle
          cx={padding + innerWidth / 2}
          cy={padding + innerHeight / 2}
          r="2.5"
          fill="currentColor"
        />
      ) : (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
