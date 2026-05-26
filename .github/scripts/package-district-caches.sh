#!/usr/bin/env bash
# Create district_forecasts.tar.gz for GitHub release upload and CI restore.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

count="$(find public/district_forecasts backend/report/district_forecasts -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$count" -eq 0 ]]; then
  echo "No district cache files found. Run backend/scripts/prepare_district_caches.py first."
  exit 1
fi

tar -czf district_forecasts.tar.gz public/district_forecasts backend/report/district_forecasts
echo "Packaged $count cache files into district_forecasts.tar.gz ($(du -h district_forecasts.tar.gz | cut -f1))."
