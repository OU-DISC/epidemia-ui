function formatGeneratedAt(iso) {
  if (!iso) return null;
  const ms = Date.parse(String(iso));
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function formatHorizons(cachedHorizons = [], selectedHorizon) {
  const horizons = [...new Set(cachedHorizons.map(Number).filter(Number.isFinite))].sort(
    (a, b) => a - b
  );
  if (horizons.length >= 2) {
    return `${horizons[0]}–${horizons[horizons.length - 1]} wk horizons`;
  }
  if (horizons.length === 1) {
    return `${horizons[0]}-week horizon`;
  }
  if (selectedHorizon) {
    return `${selectedHorizon}-week horizon`;
  }
  return null;
}

function formatReadyDetail({ generatedAt, cacheStatus, forecastWeeks }) {
  const parts = [];
  const updated = formatGeneratedAt(generatedAt || cacheStatus?.generated_at);
  if (updated) parts.push(`Updated ${updated}`);

  const districtCount = cacheStatus?.district_count;
  if (districtCount) {
    parts.push(`${districtCount} districts`);
  }

  const horizonLabel = formatHorizons(cacheStatus?.cached_horizons, forecastWeeks);
  if (horizonLabel) parts.push(horizonLabel);

  if (cacheStatus?.region_filter) {
    parts.push(`${cacheStatus.region_filter} regional refresh`);
  }

  if (cacheStatus?.cache_stale) {
    parts.push("input data changed — refresh recommended");
  }

  return parts.join(" · ") || "Forecast cache loaded";
}

function formatRunningDetail({ cacheStatus, epidemiaRefreshing, localMessage }) {
  const pipeline = cacheStatus?.pipeline;
  const progress = pipeline?.progress;
  const parts = [];

  if (!epidemiaRefreshing && pipeline?.status === "running") {
    parts.push("Background refresh");
  }

  if (progress?.total) {
    parts.push(`${progress.current}/${progress.total} districts`);
    if (progress.percent != null) {
      parts.push(`${progress.percent}%`);
    }
  } else if (pipeline?.message) {
    parts.push(pipeline.message);
  } else if (localMessage) {
    parts.push(localMessage);
  } else {
    parts.push("Forecast pipeline running");
  }

  if (pipeline?.current_species) {
    parts.push(String(pipeline.current_species).toUpperCase());
  }
  if (pipeline?.current_district) {
    parts.push(pipeline.current_district);
  }
  if (pipeline?.region_filter) {
    parts.push(pipeline.region_filter);
  }

  return parts.join(" · ");
}

export function buildPipelineStatus({
  epidemiaLoading = false,
  epidemiaRefreshing = false,
  epidemiaError = "",
  generatedAt = "",
  cacheStatus = null,
  forecastWeeks = 8,
}) {
  const pipeline = cacheStatus?.pipeline;
  const serverRunning = pipeline?.status === "running";
  const serverStale = pipeline?.status === "stale";
  const progress =
    pipeline?.progress?.percent != null ? pipeline.progress : null;

  if (epidemiaRefreshing || serverRunning) {
    return {
      kind: "running",
      label: "Running",
      detail: formatRunningDetail({
        cacheStatus,
        epidemiaRefreshing,
        localMessage: epidemiaRefreshing ? "Refresh Forecast in progress" : null,
      }),
      progress,
    };
  }

  if (serverStale) {
    return {
      kind: "error",
      label: "Stale",
      detail:
        pipeline?.message ||
        "A pipeline run may have stopped unexpectedly. Try Refresh Forecast.",
      progress: null,
    };
  }

  if (epidemiaLoading) {
    return {
      kind: "loading",
      label: "Loading",
      detail: "Fetching forecast cache…",
      progress: null,
    };
  }

  if (epidemiaError) {
    return {
      kind: "error",
      label: "Error",
      detail: epidemiaError,
      progress: null,
    };
  }

  if (pipeline?.status === "failed") {
    return {
      kind: "error",
      label: "Error",
      detail: pipeline.error || pipeline.message || "Last forecast run failed",
      progress: null,
    };
  }

  return {
    kind: "ready",
    label: "Ready",
    detail: formatReadyDetail({ generatedAt, cacheStatus, forecastWeeks }),
    progress: null,
  };
}
