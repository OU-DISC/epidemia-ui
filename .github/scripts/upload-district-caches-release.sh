#!/usr/bin/env bash
# Upload district_forecasts.tar.gz (and optional report_data.json.gz) to GitHub release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RELEASE_TAG="${EPIDEMIA_FORECAST_DATA_RELEASE:-epidemia-forecast-data}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

if [[ ! -f district_forecasts.tar.gz ]]; then
  echo "district_forecasts.tar.gz not found."
  exit 1
fi

assets=(district_forecasts.tar.gz)
if [[ -f report_data.json.gz ]]; then
  assets+=(report_data.json.gz)
fi

if ! gh release view "$RELEASE_TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release create "$RELEASE_TAG" \
    --repo "$REPO" \
    --title "EPIDEMIA forecast data" \
    --notes "Per-district chart caches and optional report_data.json.gz for CI refresh."
fi

gh release upload "$RELEASE_TAG" "${assets[@]}" --repo "$REPO" --clobber
echo "Uploaded ${assets[*]} to release '$RELEASE_TAG'."
