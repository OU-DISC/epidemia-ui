#!/usr/bin/env python3
"""Write per-district forecast cache files from an existing report_data.json.

Use this before building Docker images for production so chart loads can fetch
full district history without the 196 MB report on every request.

Example:
  python scripts/prepare_district_caches.py
  python scripts/prepare_district_caches.py --report report/report_data.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.forecast_cache import (  # noqa: E402
    REPORT_NAME,
    candidate_report_paths,
    write_all_district_forecast_caches,
)


def resolve_report_path(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit)
        if not path.is_absolute():
            path = (BACKEND_ROOT / path).resolve()
        if not path.exists():
            raise FileNotFoundError(f"Report not found: {path}")
        return path

    for candidate in candidate_report_paths("report"):
        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        f"No {REPORT_NAME} found. Run scripts/build_forecast_cache.py first."
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract per-district JSON caches from report_data.json"
    )
    parser.add_argument(
        "--report",
        help="Path to report_data.json (default: first existing report under report/ or public/)",
    )
    args = parser.parse_args()

    report_path = resolve_report_path(args.report)
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    forecast_count = len(payload.get("forecasts") or [])
    if forecast_count == 0:
        raise SystemExit(f"No forecasts in {report_path}")

    written = write_all_district_forecast_caches(
        output_dir="report",
        payload=payload,
        report_json=report_path,
    )
    print(f"Wrote {written} district cache files from {report_path}")
    print(f"  backend/report/district_forecasts/")
    print(f"  public/district_forecasts/  (for nginx static fallback)")


if __name__ == "__main__":
    main()
