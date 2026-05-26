#!/usr/bin/env bash
# One-time local seed: build district caches and upload to GitHub release for CI.
# Requires: gh CLI authenticated, backend/report/report_data.json present.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python backend/scripts/prepare_district_caches.py
bash .github/scripts/package-district-caches.sh
gzip -c backend/report/report_data.json > report_data.json.gz

export GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
bash .github/scripts/upload-district-caches-release.sh

echo ""
echo "Done. Next: run 'Refresh District Forecast Caches' in GitHub Actions,"
echo "or push to master so CI restores caches from the release."
