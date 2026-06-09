#!/usr/bin/env python3
"""Trim cached report history to a year range before publishing to GitHub.

Keeps forecasts and alerts unchanged; only observed_history is filtered.
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
    BOOTSTRAP_NAME,
    MAP_BOOTSTRAP_NAME,
    REPORT_NAME,
    build_bootstrap_payload,
    build_map_bootstrap_payload,
    write_all_district_forecast_caches,
)


def _week_in_range(week_start: str, start_date: str, end_date: str) -> bool:
    value = str(week_start)[:10]
    return start_date <= value <= end_date


def trim_report_payload(payload: dict, start_year: int, end_year: int) -> dict:
    start_date = f"{start_year}-01-01"
    end_date = f"{end_year}-12-31"
    trimmed = dict(payload)
    forecasts = []

    for forecast in payload.get("forecasts") or []:
        row = dict(forecast)
        history = [
            point
            for point in (forecast.get("observed_history") or [])
            if _week_in_range(point.get("week_start", ""), start_date, end_date)
        ]
        row["observed_history"] = history
        row["history_points"] = len(history)
        forecasts.append(row)

    trimmed["forecasts"] = forecasts
    inputs_used = dict(trimmed.get("inputs_used") or {})
    inputs_used["published_history_years"] = f"{start_year}-{end_year}"
    trimmed["inputs_used"] = inputs_used
    return trimmed


def resolve_source_report(explicit: str | None) -> Path:
    if explicit:
        path = Path(explicit)
        if not path.is_absolute():
            path = (BACKEND_ROOT / path).resolve()
        if not path.exists():
            raise FileNotFoundError(f"Report not found: {path}")
        return path

    candidates = [
        BACKEND_ROOT.parent.parent.parent / "backend" / "report" / "report_data_h12.json",
        BACKEND_ROOT / "report" / REPORT_NAME,
        BACKEND_ROOT.parent / "public" / REPORT_NAME,
    ]
    for path in candidates:
        if path.exists():
            return path.resolve()
    raise FileNotFoundError(
        "No report_data source found. Pass --report or copy report_data_h12.json first."
    )


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Trim observed history to a year range for GitHub publish"
    )
    parser.add_argument("--report", help="Source report JSON (default: national cache)")
    parser.add_argument("--start-year", type=int, default=2020)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--output-dir", default="report")
    args = parser.parse_args()

    if args.start_year > args.end_year:
        raise SystemExit("--start-year must be <= --end-year")

    source = resolve_source_report(args.report)
    payload = json.loads(source.read_text(encoding="utf-8"))
    trimmed = trim_report_payload(payload, args.start_year, args.end_year)

    report_dir = (BACKEND_ROOT / args.output_dir).resolve()
    report_json = report_dir / REPORT_NAME
    write_json(report_json, trimmed)

    cache_count = write_all_district_forecast_caches(
        output_dir=args.output_dir,
        payload=trimmed,
        report_json=report_json,
    )

    bootstrap = build_bootstrap_payload(trimmed)
    map_bootstrap = build_map_bootstrap_payload(trimmed)
    write_json(report_dir / BOOTSTRAP_NAME, bootstrap)
    write_json(report_dir / MAP_BOOTSTRAP_NAME, map_bootstrap)
    write_json(BACKEND_ROOT.parent / "public" / BOOTSTRAP_NAME, bootstrap)
    write_json(BACKEND_ROOT.parent / "public" / MAP_BOOTSTRAP_NAME, map_bootstrap)

    sample = next((f for f in trimmed["forecasts"] if f.get("observed_history")), None)
    sample_weeks = len(sample["observed_history"]) if sample else 0
    print(f"Source: {source}")
    print(f"Wrote trimmed report: {report_json}")
    print(f"History years: {args.start_year}-{args.end_year}")
    print(f"Forecasts: {len(trimmed['forecasts'])}")
    print(f"District cache files: {cache_count}")
    print(f"Sample observed weeks per district: {sample_weeks}")
    print("Next: run scripts/seed-forecast-release.ps1, then commit and push.")


if __name__ == "__main__":
    main()
