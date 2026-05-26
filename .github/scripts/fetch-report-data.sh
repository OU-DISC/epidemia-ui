#!/usr/bin/env bash
# Fetch report_data.json for regenerating district caches in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RELEASE_TAG="${EPIDEMIA_FORECAST_DATA_RELEASE:-epidemia-forecast-data}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
REPORT_PATH="backend/report/report_data.json"

mkdir -p backend/report

if [[ -f "$REPORT_PATH" ]]; then
  echo "Using existing $REPORT_PATH"
  exit 0
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

if gh release view "$RELEASE_TAG" --repo "$REPO" >/dev/null 2>&1; then
  if gh release download "$RELEASE_TAG" \
    --repo "$REPO" \
    --pattern 'report_data.json.gz' \
    --dir "$tmpdir" 2>/dev/null; then
    gunzip -c "$tmpdir/report_data.json.gz" > "$REPORT_PATH"
    echo "Downloaded report_data.json from release '$RELEASE_TAG'."
    exit 0
  fi
fi

echo "No report_data.json found locally or in release '$RELEASE_TAG'."
echo "Upload report_data.json.gz to that release, then re-run this workflow."
exit 1
