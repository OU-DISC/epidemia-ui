"""
Assemble COD-AB v04 pipeline inputs for the live EPIDEMIA forecast backend.

Writes (after backing up existing files):
  backend/data/ethiopia_woredas.csv
  backend/data/epi_data.csv
  backend/data/env_data.csv
  backend/data/env_ref_data.csv

Sources:
  - woreda_master_cod_ab_v04.csv
  - train_cases_remapped_2014_2019 + gap panel (history)
  - calibrated epi_data_synthetic_2020_2025 (Pf + Pv)
  - remapped_env_long + gap_env_long
  - Bui town (ET070402) proxied from Butajira town (ET070401)
"""
from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DATA = ROOT / "backend" / "data"
SYN_OUT = ROOT / "data" / "synthetic_v2" / "outputs"
MASTER = ROOT / "data" / "synthetic_v2" / "woreda_master_cod_ab_v04.csv"

BUI = "ET070402"
BUI_PROXY = "ET070401"  # Butajira town

def epidemiar_week(ts: pd.Timestamp) -> int:
    """Match backend seasonal_gam_thresholds.epidemiar_week (1–52)."""
    doy = int(pd.Timestamp(ts).dayofyear)
    return min(52, max(1, (doy - 1) // 7 + 1))


def backup_existing(paths: list[Path], stamp: str) -> Path:
    bak_dir = BACKEND_DATA / f"_bak_pre_cod_ab_v04_{stamp}"
    bak_dir.mkdir(parents=True, exist_ok=True)
    for p in paths:
        if p.exists():
            shutil.copy2(p, bak_dir / p.name)
            print(f"  backed up {p.name}")
    return bak_dir


def build_registry(master: pd.DataFrame) -> pd.DataFrame:
    reg = master.rename(
        columns={
            "adm3_pcode": "pcode",
            "adm1_name": "region",
            "adm2_name": "zone",
            "adm3_name": "woreda_name",
        }
    )[["pcode", "region", "zone", "woreda_name"]].copy()
    reg["report"] = 1
    return reg.sort_values(["region", "zone", "woreda_name"]).reset_index(drop=True)


def _epi_from_cases(
    df: pd.DataFrame,
    *,
    date_col: str,
    name_col: str,
    pop_col: str,
    pf_col: str,
    pv_col: str,
) -> pd.DataFrame:
    out = pd.DataFrame(
        {
            "obs_date": pd.to_datetime(df[date_col]).dt.strftime("%Y-%m-%d"),
            "woreda_name": df[name_col].astype(str),
            "pop_at_risk": pd.to_numeric(df[pop_col], errors="coerce"),
            "test_pf_tot": pd.to_numeric(df[pf_col], errors="coerce").fillna(0.0),
            "test_pv_only": pd.to_numeric(df[pv_col], errors="coerce").fillna(0.0),
        }
    )
    return out


def assemble_epi(master: pd.DataFrame) -> pd.DataFrame:
    train = pd.read_csv(SYN_OUT / "train_cases_remapped_2014_2019_cod_ab_v04.csv")
    gap = pd.read_csv(SYN_OUT / "gap_weekly_panel_filled.csv")
    gap = gap[pd.to_datetime(gap["week_start"]).dt.year <= 2019].copy()

    hist_parts = [
        _epi_from_cases(
            train,
            date_col="week_start",
            name_col="adm3_name",
            pop_col="population",
            pf_col="cases_pf",
            pv_col="cases_pv",
        )
    ]
    if not gap.empty:
        hist_parts.append(
            _epi_from_cases(
                gap,
                date_col="week_start",
                name_col="adm3_name",
                pop_col="population",
                pf_col="cases_pf",
                pv_col="cases_pv",
            )
        )
    hist = pd.concat(hist_parts, ignore_index=True)
    hist = hist.drop_duplicates(["obs_date", "woreda_name"], keep="first")

    # 2020–2025: calibrated synthetic Pf + Pv (combined preferred)
    combined = SYN_OUT / "epi_data_synthetic_2020_2025_cod_ab_v04.csv"
    pf_only = SYN_OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pf.csv"
    pv_only = SYN_OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pv.csv"
    if combined.exists():
        syn = pd.read_csv(combined)
        print("  using combined calibrated Pf+Pv synthetic epi")
    elif pf_only.exists() and pv_only.exists():
        pf = pd.read_csv(pf_only)
        pv = pd.read_csv(pv_only)[["obs_date", "woreda_name", "test_pv_only"]]
        syn = pf.drop(columns=["test_pv_only"]).merge(
            pv, on=["obs_date", "woreda_name"], how="left"
        )
        syn["test_pv_only"] = syn["test_pv_only"].fillna(0.0)
        print("  merged separate Pf + Pv synthetic epi extracts")
    elif pf_only.exists():
        syn = pd.read_csv(pf_only)
        syn["test_pv_only"] = 0.0
        print("  WARNING: Pv synthetic missing; test_pv_only=0 for 2020-2025")
    else:
        raise SystemExit("Missing synthetic epi extract for 2020-2025")

    syn["obs_date"] = pd.to_datetime(syn["obs_date"]).dt.strftime("%Y-%m-%d")
    future = syn[
        ["obs_date", "woreda_name", "pop_at_risk", "test_pf_tot", "test_pv_only"]
    ].copy()

    epi = pd.concat([hist, future], ignore_index=True)
    epi = epi.drop_duplicates(["obs_date", "woreda_name"], keep="last")

    # Bui town: always rebuild full series from Butajira (env/pop proxy; cases=0)
    bui_name = master.loc[master["adm3_pcode"] == BUI, "adm3_name"].iloc[0]
    proxy_name = master.loc[master["adm3_pcode"] == BUI_PROXY, "adm3_name"].iloc[0]
    proxy = epi[epi["woreda_name"] == proxy_name].copy()
    if proxy.empty:
        raise SystemExit(f"Proxy {proxy_name} missing from epi")
    proxy["woreda_name"] = bui_name
    proxy["test_pf_tot"] = 0.0
    proxy["test_pv_only"] = 0.0
    epi = epi[epi["woreda_name"] != bui_name]
    epi = pd.concat([epi, proxy], ignore_index=True)
    print(f"  rebuilt Bui town epi from {proxy_name} (cases=0, full date span)")

    epi["pop_at_risk"] = pd.to_numeric(epi["pop_at_risk"], errors="coerce").fillna(0.0)
    return epi.sort_values(["woreda_name", "obs_date"]).reset_index(drop=True)


def assemble_env(master: pd.DataFrame) -> pd.DataFrame:
    rem = pd.read_csv(SYN_OUT / "remapped_env_long_cod_ab_v04.csv")
    gap = pd.read_csv(SYN_OUT / "gap_env_long_from_parent.csv")
    env = pd.concat([rem, gap], ignore_index=True)
    env["obs_date"] = pd.to_datetime(env["obs_date"]).dt.strftime("%Y-%m-%d")
    env = env.rename(columns={"adm3_name": "woreda_name"})
    env = env[["obs_date", "woreda_name", "environ_var_code", "obs_value", "adm3_pcode"]]
    env = env.drop_duplicates(
        ["obs_date", "woreda_name", "environ_var_code"], keep="first"
    )

    bui_name = master.loc[master["adm3_pcode"] == BUI, "adm3_name"].iloc[0]
    proxy_name = master.loc[master["adm3_pcode"] == BUI_PROXY, "adm3_name"].iloc[0]
    proxy = env[env["woreda_name"] == proxy_name].copy()
    proxy["woreda_name"] = bui_name
    proxy["adm3_pcode"] = BUI
    env = env[env["woreda_name"] != bui_name]
    env = pd.concat([env, proxy], ignore_index=True)
    print(f"  rebuilt Bui town env from {proxy_name}")

    out = env[["obs_date", "woreda_name", "environ_var_code", "obs_value"]].copy()
    out["obs_value"] = pd.to_numeric(out["obs_value"], errors="coerce")
    return out.sort_values(
        ["woreda_name", "obs_date", "environ_var_code"]
    ).reset_index(drop=True)


def build_env_ref_long(env: pd.DataFrame) -> pd.DataFrame:
    work = env.copy()
    work["obs_date"] = pd.to_datetime(work["obs_date"])
    work["week_epidemiar"] = work["obs_date"].map(epidemiar_week)
    work["obs_value"] = pd.to_numeric(work["obs_value"], errors="coerce")

    rows: list[dict] = []
    grouped = work.groupby(
        ["woreda_name", "environ_var_code", "week_epidemiar"], sort=False
    )["obs_value"]
    for (woreda, code, week), values in grouped:
        clean = values.dropna()
        if clean.empty:
            continue
        rows.append(
            {
                "woreda_name": woreda,
                "environ_var_code": code,
                "week_epidemiar": int(week),
                "ref_value": float(clean.mean()),
                "ref_sd": float(clean.std(ddof=1)) if len(clean) > 1 else 0.0,
                "ref_yrcount": int(clean.count()),
                "ref_max": float(clean.max()),
                "ref_uq": float(clean.quantile(0.75)),
                "ref_median": float(clean.median()),
                "ref_lq": float(clean.quantile(0.25)),
                "ref_min": float(clean.min()),
            }
        )
    ref = pd.DataFrame(rows)
    if ref.empty:
        raise RuntimeError("env_ref empty")
    return ref.sort_values(
        ["woreda_name", "environ_var_code", "week_epidemiar"]
    ).reset_index(drop=True)


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    master = pd.read_csv(MASTER)
    print(f"Master woredas: {len(master)}")

    targets = [
        BACKEND_DATA / "ethiopia_woredas.csv",
        BACKEND_DATA / "epi_data.csv",
        BACKEND_DATA / "env_data.csv",
        BACKEND_DATA / "env_ref_data.csv",
    ]
    print("Backing up existing backend/data files...")
    bak = backup_existing(targets, stamp)

    print("Building registry...")
    registry = build_registry(master)
    registry.to_csv(BACKEND_DATA / "ethiopia_woredas.csv", index=False)

    print("Assembling epi_data...")
    epi = assemble_epi(master)
    epi.to_csv(BACKEND_DATA / "epi_data.csv", index=False, float_format="%.6f")

    print("Assembling env_data...")
    env = assemble_env(master)
    env.to_csv(BACKEND_DATA / "env_data.csv", index=False, float_format="%.8f")

    print("Building env_ref_data...")
    env_ref = build_env_ref_long(env)
    env_ref.to_csv(BACKEND_DATA / "env_ref_data.csv", index=False, float_format="%.8f")

    # QC
    report_names = set(registry.loc[registry["report"] == 1, "woreda_name"])
    epi_names = set(epi["woreda_name"])
    env_names = set(env["woreda_name"])
    summary = {
        "generated_at": stamp,
        "backup_dir": str(bak),
        "registry_rows": int(len(registry)),
        "epi_rows": int(len(epi)),
        "epi_woredas": int(epi["woreda_name"].nunique()),
        "epi_date_min": str(epi["obs_date"].min()),
        "epi_date_max": str(epi["obs_date"].max()),
        "env_rows": int(len(env)),
        "env_woredas": int(env["woreda_name"].nunique()),
        "env_ref_rows": int(len(env_ref)),
        "missing_epi_vs_registry": sorted(report_names - epi_names),
        "missing_env_vs_registry": sorted(report_names - env_names),
        "extra_epi_not_in_registry": sorted(epi_names - report_names)[:20],
        "notes": [
            "Pf 2020-2025 from calibrated synthetic",
            "Pv 2020-2025 from calibrated synthetic (combined epi preferred)",
            "Bui town (ET070402) env/pop proxied from Butajira; cases set to 0",
        ],
    }
    qc_path = SYN_OUT / "assemble_cod_ab_v04_pipeline_qc.json"
    qc_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\n=== QC ===")
    print(json.dumps(summary, indent=2))
    print(f"\nWrote backend/data inputs. Backup: {bak}")
    print(f"QC: {qc_path}")


if __name__ == "__main__":
    main()
