/** Tunables for client-side PDF export performance. */
export const REPORT_EXPORT_CONFIG = {
  /** Parallel Plotly chart exports (keep modest to avoid browser memory spikes). */
  chartConcurrency: 8,
  /** JPEG control chart size for export (smaller = faster). */
  chartWidth: 680,
  chartHeight: 520,
  /** html2canvas scale for map snapshots (1.25 is enough for landscape A4). */
  mapCaptureScale: 1.25,
  /** Delay after map layer swap before screenshot (ms). */
  mapCaptureDelayMs: 320,
};

export const WOREDA_PAGE_MODES = {
  all: { value: "all", label: "All woreda charts" },
  alerts: { value: "alerts", label: "Alert districts only" },
  none: { value: "none", label: "Summary only (no woreda pages)" },
};

export function defaultWoredaPageMode(scope) {
  return scope === "country" ? WOREDA_PAGE_MODES.alerts.value : WOREDA_PAGE_MODES.all.value;
}

export function filterWoredaDistrictRows(districtRows, scopedAlerts, adm3Lookup, mode, findDistrictFromLookup) {
  if (mode === WOREDA_PAGE_MODES.none.value) return [];
  if (mode === WOREDA_PAGE_MODES.all.value) return districtRows;

  const alertDistricts = new Set();
  (scopedAlerts || []).forEach((alert) => {
    if (alert.ed_level === "Low" && alert.ew_level === "Low") return;
    const feature = findDistrictFromLookup(adm3Lookup, alert.district);
    alertDistricts.add(feature?.properties?.adm3_name || alert.district);
  });

  return districtRows.filter((row) => alertDistricts.has(row.mapDistrict));
}

export async function waitForPaint(extraDelayMs = 0) {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  if (extraDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, extraDelayMs));
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Map();
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      const entry = await worker(item, index);
      if (entry) {
        results.set(entry.key, entry.value);
      }
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
  return results;
}

export { runPool };
