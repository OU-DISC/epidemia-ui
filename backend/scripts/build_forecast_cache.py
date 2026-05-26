#!/usr/bin/env python3
"""Pre-compute the national EPIDEMIA forecast and write cached report artifacts."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.schemas.epidemia import EpidemiaRunRequest  # noqa: E402
from app.services.epidemia_pipeline import run_epidemia_pipeline  # noqa: E402
from app.services.forecast_cache import cache_status  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Build and cache EPIDEMIA forecast report")
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--output-dir", default="report")
    parser.add_argument("--horizon-weeks", type=int, default=8)
    parser.add_argument("--force", action="store_true", help="Recompute even if cache is valid")
    args = parser.parse_args()

    req = EpidemiaRunRequest(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        horizon_weeks=args.horizon_weeks,
        force_refresh=args.force,
        create_report=False,
    )

    if not args.force:
        status = cache_status(req)
        if status["valid"]:
            print("Valid cache already exists:")
            print(f"  generated_at: {status['generated_at']}")
            print(f"  districts: {status['district_count']}")
            print(f"  forecasts: {status['forecast_count']}")
            print(f"  report: {status['report_path']}")
            print("Use --force to recompute.")
            return

    print(
        f"Running EPIDEMIA pipeline (horizon={args.horizon_weeks}, workers from EPIDEMIA_WORKERS)..."
    )
    response = run_epidemia_pipeline(req)
    status = cache_status(req)
    print(response.message)
    print(f"  generated_at: {response.generated_at}")
    print(f"  forecasts: {len(response.forecasts)}")
    print(f"  alerts: {len(response.alerts)}")
    print(f"  elapsed_seconds: {status.get('elapsed_seconds')}")
    print(f"  report: {response.artifacts.get('report_data')}")
    if response.artifacts.get("report_data_public"):
        print(f"  public copy: {response.artifacts['report_data_public']}")


if __name__ == "__main__":
    main()
