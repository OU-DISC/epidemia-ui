/**
 * Parse Plotly `relayout` / `onRelayout` event into a date x-axis range, or "autorange" when the user resets zoom.
 * @param {Readonly<Record<string, unknown>>} ev
 * @returns {readonly [string, string] | "autorange" | null}
 */
export function parseXAxisRangeFromRelayoutEvent(ev) {
  if (!ev || typeof ev !== "object") return null;

  if (ev["xaxis.autorange"] === true) {
    return "autorange";
  }

  const nestedAxis = ev.xaxis;
  if (nestedAxis && typeof nestedAxis === "object") {
    if (nestedAxis.autorange === true) return "autorange";
    if (Array.isArray(nestedAxis.range) && nestedAxis.range.length >= 2) {
      const a = toDateStringForAxis(nestedAxis.range[0]);
      const b = toDateStringForAxis(nestedAxis.range[1]);
      return orderRangeChronological(a, b);
    }
  }

  if (Object.keys(ev).length === 0) return null;

  let r0 = ev["xaxis.range[0]"];
  let r1 = ev["xaxis.range[1]"];
  if (r0 == null && r1 == null) {
    const r = ev["xaxis.range"];
    if (Array.isArray(r) && r.length >= 2) {
      r0 = r[0];
      r1 = r[1];
    }
  }

  if (r0 == null && r1 == null) {
    if (!Object.keys(ev).some((k) => k === "xaxis" || k.startsWith("xaxis."))) {
      return null;
    }
    return null;
  }
  if (r0 == null || r1 == null) return null;

  const a = toDateStringForAxis(r0);
  const b = toDateStringForAxis(r1);
  return orderRangeChronological(a, b);
}

/** @returns {readonly [string, string]} */
function orderRangeChronological(a, b) {
  const t0 = Date.parse(a);
  const t1 = Date.parse(b);
  if (!Number.isNaN(t0) && !Number.isNaN(t1) && t0 > t1) {
    return [b, a];
  }
  return [a, b];
}

function toDateStringForAxis(v) {
  if (v == null) return "";
  if (typeof v === "number" && !Number.isNaN(v)) {
    return msToChartDay(v);
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? s : msToChartDay(parsed);
}

/** Convert Plotly ms timestamp to YYYY-MM-DD (UTC). */
export function msToChartDay(ms) {
  if (typeof ms !== "number" || Number.isNaN(ms)) {
    if (ms == null || ms === "") return "";
    const text = String(ms);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    return text;
  }
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Normalize axis values to YYYY-MM-DD for shared zoom state. */
export function normalizeChartAxisDate(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && !Number.isNaN(value)) {
    return msToChartDay(value);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? text : msToChartDay(parsed);
}

/**
 * @param {readonly [string, string] | null} a
 * @param {readonly [string, string] | null} b
 */
export function xAxisRangesEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a[0] === b[0] && a[1] === b[1];
}
