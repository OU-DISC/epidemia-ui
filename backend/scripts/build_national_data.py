#!/usr/bin/env python3
"""
Build national EPIDEMIA data files from weekly_malaria_with_admin_geo_2014_2025.csv.

Outputs (in backend data dir):
  - ethiopia_woredas.csv
  - env_ref_data.csv
  - epi_data.csv
  - env_data.csv
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.seasonal_gam_thresholds import epidemiar_week  # noqa: E402

ENV_VARS = (
    ("rainfall_mm", "totprec"),
    ("temperature_c", "lst_mean"),
    ("ndvi", "ndvi"),
)


def load_pcode_name_lookup(geojson_path: Path) -> dict[str, str]:
    if not geojson_path.exists():
        return {}
    geojson = json.loads(geojson_path.read_text(encoding="utf-8"))
    lookup: dict[str, str] = {}
    for feature in geojson.get("features", []):
        props = feature.get("properties", {})
        pcode = str(props.get("adm3_pcode", "")).strip()
        name = str(props.get("adm3_name", "")).strip()
        if pcode and name:
            lookup[pcode] = name
    return lookup


def canonical_woreda_name(pcode: str, w_name: str, lookup: dict[str, str]) -> str:
    mapped = lookup.get(str(pcode).strip())
    if mapped:
        return mapped
    return str(w_name).strip()


def build_district_registry(df: pd.DataFrame, lookup: dict[str, str]) -> pd.DataFrame:
    districts = (
        df.sort_values("date")
        .groupby("NewPCODE", as_index=False)
        .agg(
            region=("R_NAME", "first"),
            zone=("Z_NAME", "first"),
            w_name=("W_NAME", "first"),
        )
    )
    districts["woreda_name"] = districts.apply(
        lambda row: canonical_woreda_name(row["NewPCODE"], row["w_name"], lookup),
        axis=1,
    )
    districts["pcode"] = districts["NewPCODE"].astype(str)
    districts["report"] = 1
    return districts[
        ["pcode", "region", "zone", "woreda_name", "report"]
    ].sort_values(["region", "zone", "woreda_name"])


def build_epi_data(df: pd.DataFrame, lookup: dict[str, str]) -> pd.DataFrame:
    work = df.copy()
    work["woreda_name"] = work.apply(
        lambda row: canonical_woreda_name(row["NewPCODE"], row["W_NAME"], lookup),
        axis=1,
    )
    epi = work.rename(
        columns={
            "date": "obs_date",
            "population": "pop_at_risk",
            "pospf_cases": "test_pf_tot",
            "pospv_cases": "test_pv_only",
        }
    )
    return epi[
        ["obs_date", "woreda_name", "pop_at_risk", "test_pf_tot", "test_pv_only"]
    ].sort_values(["woreda_name", "obs_date"])


def build_env_data(df: pd.DataFrame, lookup: dict[str, str]) -> pd.DataFrame:
    work = df.copy()
    work["woreda_name"] = work.apply(
        lambda row: canonical_woreda_name(row["NewPCODE"], row["W_NAME"], lookup),
        axis=1,
    )
    parts: list[pd.DataFrame] = []
    for source_col, code in ENV_VARS:
        part = work[["date", "woreda_name", source_col]].copy()
        part = part.rename(columns={"date": "obs_date", source_col: "obs_value"})
        part["environ_var_code"] = code
        parts.append(part[["obs_date", "woreda_name", "environ_var_code", "obs_value"]])
    env = pd.concat(parts, ignore_index=True)
    return env.sort_values(["woreda_name", "obs_date", "environ_var_code"])


def build_env_ref(df: pd.DataFrame, lookup: dict[str, str]) -> pd.DataFrame:
    work = df.copy()
    work["woreda_name"] = work.apply(
        lambda row: canonical_woreda_name(row["NewPCODE"], row["W_NAME"], lookup),
        axis=1,
    )
    work["week_epidemiar"] = work["date"].map(lambda ts: epidemiar_week(ts))

    rows: list[dict] = []
    for source_col, code in ENV_VARS:
        for (woreda_name, week), values in work.groupby(["woreda_name", "week_epidemiar"])[source_col]:
            clean = pd.to_numeric(values, errors="coerce").dropna()
            if clean.empty:
                continue
            ref_value = float(clean.mean())
            ref_sd = float(clean.std(ddof=1)) if len(clean) > 1 else 0.0
            ref_median = float(clean.median())
            ref_min = float(clean.min())
            ref_max = float(clean.max())
            ref_lq = float(clean.quantile(0.25))
            ref_uq = float(clean.quantile(0.75))
            rows.append(
                {
                    "woreda_name": woreda_name,
                    "environ_var_code": code,
                    "week_epidemiar": int(week),
                    "ref_value": ref_value,
                    "ref_sd": ref_sd,
                    "ref_yrcount": int(clean.count()),
                    "ref_max": ref_max,
                    "ref_uq": ref_uq,
                    "ref_median": ref_median,
                    "ref_lq": ref_lq,
                    "ref_min": ref_min,
                }
            )

    ref = pd.DataFrame(rows)
    if ref.empty:
        raise RuntimeError("Environmental reference table is empty")
    return ref.sort_values(["woreda_name", "environ_var_code", "week_epidemiar"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Build national EPIDEMIA data files")
    parser.add_argument(
        "--source",
        type=Path,
        default=BACKEND_ROOT / "app" / "data" / "weekly_malaria_with_admin_geo_2014_2025.csv",
    )
    parser.add_argument(
        "--geojson",
        type=Path,
        default=BACKEND_ROOT.parent / "public" / "eth_admin3.geojson",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BACKEND_ROOT / "data",
    )
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(f"Source CSV not found: {args.source}")

    print(f"Reading {args.source} ...")
    df = pd.read_csv(args.source, parse_dates=["date"], dayfirst=False)
    if df["date"].isna().all():
        df = pd.read_csv(args.source)
        df["date"] = pd.to_datetime(df["date"], format="%m/%d/%Y", errors="coerce")
    if df["date"].isna().any():
        bad = int(df["date"].isna().sum())
        raise SystemExit(f"Could not parse {bad} date values")

    lookup = load_pcode_name_lookup(args.geojson)
    print(f"Loaded {len(lookup)} pcode -> district names from geojson")

    args.output_dir.mkdir(parents=True, exist_ok=True)

    districts = build_district_registry(df, lookup)
    epi = build_epi_data(df, lookup)
    env = build_env_data(df, lookup)
    env_ref = build_env_ref(df, lookup)

    district_path = args.output_dir / "ethiopia_woredas.csv"
    epi_path = args.output_dir / "epi_data.csv"
    env_path = args.output_dir / "env_data.csv"
    ref_path = args.output_dir / "env_ref_data.csv"

    districts.to_csv(district_path, index=False)
    epi.to_csv(epi_path, index=False)
    env.to_csv(env_path, index=False)
    env_ref.to_csv(ref_path, index=False)

    app_data = BACKEND_ROOT / "app" / "data"
    if app_data.resolve() != args.output_dir.resolve():
        app_data.mkdir(parents=True, exist_ok=True)
        for path in (district_path, epi_path, env_path, ref_path):
            target = app_data / path.name
            target.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

    print("Wrote:")
    print(f"  {district_path} ({len(districts)} districts)")
    print(f"  {epi_path} ({len(epi)} rows)")
    print(f"  {env_path} ({len(env)} rows)")
    print(f"  {ref_path} ({len(env_ref)} rows)")
    print(
        "Districts with geojson pcode match:",
        int(districts["pcode"].isin(lookup).sum()),
        "/",
        len(districts),
    )


if __name__ == "__main__":
    main()
