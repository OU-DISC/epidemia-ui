/**
 * ISO epiweek helpers matching PHEM / pipeline intake
 * (year + week → Sunday via date.fromisocalendar).
 */

function parseIsoDay(isoDate) {
  const text = String(isoDate || "").slice(0, 10);
  const ms = Date.parse(`${text}T12:00:00Z`);
  if (!text || Number.isNaN(ms)) return null;
  return { text, date: new Date(ms) };
}

/**
 * ISO week-year and week number for a YYYY-MM-DD (UTC noon).
 * @returns {{ year: number, week: number } | null}
 */
export function isoWeekParts(isoDate) {
  const parsed = parseIsoDay(isoDate);
  if (!parsed) return null;

  // Work in UTC midnights so day diffs stay integer (avoid noon vs midnight skew).
  const y = parsed.date.getUTCFullYear();
  const m = parsed.date.getUTCMonth();
  const d = parsed.date.getUTCDate();
  const date = new Date(Date.UTC(y, m, d));

  // Thursday of this week determines the ISO week-year.
  const day = date.getUTCDay() || 7; // Mon=1 … Sun=7
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();

  // Monday of ISO week 1: week containing Jan 4.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const diffDays = Math.floor((date - week1Monday) / 86400000);
  const isoWeek = Math.floor(diffDays / 7) + 1;
  return { year: isoYear, week: isoWeek };
}

/** Primary label, e.g. 2025-W12 */
export function formatEpiweekLabel(isoDate) {
  const parts = isoWeekParts(isoDate);
  if (!parts) return "—";
  return `${parts.year}-W${String(parts.week).padStart(2, "0")}`;
}

/** Select option text, e.g. 2025-W12 · 2025-03-16 */
export function formatEpiweekOption(isoDate) {
  const text = String(isoDate || "").slice(0, 10);
  const label = formatEpiweekLabel(text);
  if (!text || label === "—") return label;
  return `${label} · ${text}`;
}

/**
 * Sorted unique week_start strings suitable for epiweek selects.
 * @param {string[]} dates
 * @returns {string[]}
 */
export function buildEpiweekOptions(dates = []) {
  const unique = new Set();
  for (const value of dates) {
    const text = String(value || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) unique.add(text);
  }
  return Array.from(unique).sort();
}

/**
 * Weekly dates spanning start→end (inclusive), stepping 7 days.
 * Fallback when the report has not yet supplied week_start values.
 */
export function buildSyntheticWeekDates(startDate, endDate) {
  const start = Date.parse(`${String(startDate || "").slice(0, 10)}T12:00:00Z`);
  const end = Date.parse(`${String(endDate || "").slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return [];

  const min = Math.min(start, end);
  const max = Math.max(start, end);
  const out = [];
  for (let t = min; t <= max; t += 7 * 24 * 60 * 60 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  if (!out.length) out.push(new Date(max).toISOString().slice(0, 10));
  return out;
}

/** Ensure value is in options; otherwise insert and re-sort. */
export function ensureWeekInOptions(options, value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return options;
  if (options.includes(text)) return options;
  return [...options, text].sort();
}
