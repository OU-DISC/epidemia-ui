#!/usr/bin/env bash
# Restore per-district forecast JSON caches for Docker builds.
# Used when the Actions cache misses; downloads from the epidemia-forecast-data release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RELEASE_TAG="${EPIDEMIA_FORECAST_DATA_RELEASE:-epidemia-forecast-data}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

mkdir -p public/district_forecasts backend/report/district_forecasts

count_caches() {
  find public/district_forecasts backend/report/district_forecasts -name '*.json' 2>/dev/null | wc -l | tr -d ' '
}

existing="$(count_caches)"
if [[ "$existing" -gt 0 ]]; then
  echo "District forecast caches already present ($existing files)."
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not available; skipping release download."
  exit 0
fi

if ! gh release view "$RELEASE_TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release '$RELEASE_TAG' not found on $REPO."
  echo "Run the 'Refresh District Forecast Caches' workflow or upload district_forecasts.tar.gz manually."
  exit 0
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

if ! gh release download "$RELEASE_TAG" \
  --repo "$REPO" \
  --pattern 'district_forecasts.tar.gz' \
  --dir "$tmpdir" 2>/dev/null; then
  echo "Release '$RELEASE_TAG' exists but district_forecasts.tar.gz is missing."
  exit 0
fi

tar -xzf "$tmpdir/district_forecasts.tar.gz" -C "$ROOT"
loaded="$(count_caches)"
echo "Loaded $loaded district forecast cache files from release '$RELEASE_TAG'."

if [[ "$loaded" -eq 0 ]]; then
  echo "Warning: archive extracted but no JSON files were found."
  exit 0
fi
