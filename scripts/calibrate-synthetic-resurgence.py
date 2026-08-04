"""
National resurgence calibration for 2020–2025 synthetic malaria cases.

Preserves woreda-level spatial and within-year seasonal structure from the
XGBoost+SHAP generator, while rescaling each calendar year so national
annual totals follow a U-shaped / post-2020 resurgence path.

Target construction (national annual cases for the chosen species):
  2020–2023  match remapped historical/synthetic totals on COD-AB v04
  2024       = target_2023 * 1.268  (WHO WMR 2025: ~26.8% rise 2023→2024)
  2025       = target_2024 * 1.10   (continued rise; synthetic extension)

Usage:
  python scripts/calibrate-synthetic-resurgence.py --species pf
  python scripts/calibrate-synthetic-resurgence.py --species pv
  python scripts/calibrate-synthetic-resurgence.py --species both
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "synthetic_v2" / "outputs"
REMAP_PATH = OUT / "remapped_cases_weekly_cod_ab_v04.csv"

WHO_2023_TO_2024 = 1.268
EXTEND_2024_TO_2025 = 1.10


def paths_for(species: str) -> dict[str, Path]:
    if species == "pf":
        return {
            "synth": OUT / "synthetic_malaria_2020_2025_cod_ab_v04.csv",
            "synth_raw": OUT / "synthetic_malaria_2020_2025_cod_ab_v04_uncalibrated.csv",
            "epi": OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pf.csv",
            "epi_raw": OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pf_uncalibrated.csv",
            "annual": OUT / "synthetic_resurgence_calibration_annual.csv",
            "qc": OUT / "synthetic_resurgence_calibration_qc.json",
            "u_series": OUT / "national_pf_annual_u_shape_series.csv",
            "remap_col": "cases_pf",
            "epi_case_col": "test_pf_tot",
        }
    return {
        "synth": OUT / "synthetic_malaria_2020_2025_cod_ab_v04_pv.csv",
        "synth_raw": OUT / "synthetic_malaria_2020_2025_cod_ab_v04_pv_uncalibrated.csv",
        "epi": OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pv.csv",
        "epi_raw": OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pv_uncalibrated.csv",
        "annual": OUT / "synthetic_resurgence_calibration_annual_pv.csv",
        "qc": OUT / "synthetic_resurgence_calibration_qc_pv.json",
        "u_series": OUT / "national_pv_annual_u_shape_series.csv",
        "remap_col": "cases_pv",
        "epi_case_col": "test_pv_only",
    }


def annual_remap(remapped: pd.DataFrame, col: str) -> pd.Series:
    remapped = remapped.copy()
    remapped["week_start"] = pd.to_datetime(remapped["week_start"])
    remapped["year"] = remapped["week_start"].dt.year
    return remapped.groupby("year")[col].sum()


def build_targets(ann_remap: pd.Series) -> dict[int, float]:
    targets: dict[int, float] = {}
    for y in range(2020, 2024):
        if y not in ann_remap.index:
            raise SystemExit(f"Missing remapped annual total for {y}")
        targets[y] = float(ann_remap.loc[y])
    targets[2024] = targets[2023] * WHO_2023_TO_2024
    targets[2025] = targets[2024] * EXTEND_2024_TO_2025
    return targets


def calibrate_species(species: str) -> None:
    p = paths_for(species)
    if not p["synth"].exists() and not p["synth_raw"].exists():
        raise SystemExit(f"Missing synthetic file for {species}: {p['synth']}")
    if not REMAP_PATH.exists():
        raise SystemExit(f"Missing remapped cases: {REMAP_PATH}")

    print(f"=== Calibrate {species.upper()} ===")

    # Prefer existing raw snapshot; else snapshot current synth once
    if not p["synth_raw"].exists():
        if not p["synth"].exists():
            raise SystemExit(f"Missing {p['synth']}")
        p["synth_raw"].write_bytes(p["synth"].read_bytes())
        print(f"Saved uncalibrated snapshot -> {p['synth_raw'].name}")
    else:
        print(f"Using existing uncalibrated snapshot -> {p['synth_raw'].name}")

    if p["epi"].exists() and not p["epi_raw"].exists():
        p["epi_raw"].write_bytes(p["epi"].read_bytes())
        print(f"Saved uncalibrated epi snapshot -> {p['epi_raw'].name}")

    syn = pd.read_csv(p["synth_raw"])
    syn["week_start"] = pd.to_datetime(syn["week_start"])
    syn["year"] = syn["week_start"].dt.year
    syn["population"] = pd.to_numeric(syn["population"], errors="coerce")
    syn["synthetic_cases"] = pd.to_numeric(syn["synthetic_cases"], errors="coerce")
    if "synthetic_incidence" not in syn.columns:
        syn["synthetic_incidence"] = np.where(
            syn["population"] > 0,
            syn["synthetic_cases"] / syn["population"],
            0.0,
        )

    rem = pd.read_csv(REMAP_PATH, usecols=["week_start", p["remap_col"]])
    ann_remap = annual_remap(rem, p["remap_col"])
    targets = build_targets(ann_remap)

    before = syn.groupby("year")["synthetic_cases"].sum()
    scales: dict[int, float] = {}
    for y, target in targets.items():
        cur = float(before.get(y, 0.0))
        if cur <= 0:
            raise SystemExit(f"No synthetic {species} cases for year {y}")
        scales[y] = target / cur

    syn["synthetic_cases_uncalibrated"] = syn["synthetic_cases"]
    syn["synthetic_incidence_uncalibrated"] = syn["synthetic_incidence"]
    syn["resurgence_scale"] = syn["year"].map(scales).astype(float)
    syn["synthetic_cases"] = syn["synthetic_cases_uncalibrated"] * syn["resurgence_scale"]
    syn["synthetic_incidence"] = np.where(
        syn["population"] > 0,
        syn["synthetic_cases"] / syn["population"],
        0.0,
    )
    after = syn.groupby("year")["synthetic_cases"].sum()

    out_cols = [
        "week_start",
        "adm3_pcode",
        "adm3_name",
        "adm1_name",
        "rainfall_mm",
        "temperature_c",
        "ndvi",
        "population",
        "beta_spatial",
        "synthetic_incidence",
        "synthetic_cases",
        "model_log_incidence",
        "adjusted_log_incidence",
        "is_gap_district",
        "synthetic_incidence_uncalibrated",
        "synthetic_cases_uncalibrated",
        "resurgence_scale",
    ]
    if "species" in syn.columns:
        out_cols.append("species")
    syn_out = syn[[c for c in out_cols if c in syn.columns]].sort_values(
        ["adm3_pcode", "week_start"]
    )
    syn_out.to_csv(p["synth"], index=False, float_format="%.8f")
    print(f"Wrote calibrated synthetic -> {p['synth'].name}")

    case_col = p["epi_case_col"]
    other = "test_pv_only" if species == "pf" else "test_pf_tot"
    epi = (
        syn_out.rename(
            columns={
                "week_start": "obs_date",
                "adm3_name": "woreda_name",
                "population": "pop_at_risk",
                "synthetic_cases": case_col,
            }
        )[["obs_date", "woreda_name", "pop_at_risk", case_col]]
        .copy()
    )
    epi[other] = 0.0
    epi = epi[["obs_date", "woreda_name", "pop_at_risk", "test_pf_tot", "test_pv_only"]]
    epi.to_csv(p["epi"], index=False, float_format="%.6f")
    print(f"Wrote calibrated epi extract -> {p['epi'].name}")

    rows = []
    for y in range(2020, 2026):
        rows.append(
            {
                "year": y,
                "species": species,
                "remapped": float(ann_remap.get(y, np.nan)),
                "synthetic_before": float(before.get(y, np.nan)),
                "target": targets[y],
                "scale": scales[y],
                "synthetic_after": float(after.get(y, np.nan)),
                "method": (
                    "match_remapped"
                    if y <= 2023
                    else (
                        f"target_2023*{WHO_2023_TO_2024}"
                        if y == 2024
                        else f"target_2024*{EXTEND_2024_TO_2025}"
                    )
                ),
            }
        )
    ann_df = pd.DataFrame(rows)
    ann_df.to_csv(p["annual"], index=False, float_format="%.6f")

    hist = (
        rem.assign(week_start=lambda d: pd.to_datetime(d["week_start"]))
        .assign(year=lambda d: d["week_start"].dt.year)
        .groupby("year", as_index=False)
        .agg(cases=(p["remap_col"], "sum"))
    )
    hist = hist[hist["year"].between(2014, 2019)].copy()
    hist["series"] = "remapped_history"
    cal = ann_df[["year", "synthetic_after"]].rename(columns={"synthetic_after": "cases"})
    cal["series"] = "synthetic_calibrated"
    u_series = pd.concat([hist, cal], ignore_index=True).sort_values("year")
    u_series.to_csv(p["u_series"], index=False, float_format="%.6f")

    summary = {
        "species": species,
        "method": {
            "2020_2023": "scale synthetic national annual totals to remapped",
            "2024": f"target_2023 * {WHO_2023_TO_2024}",
            "2025": f"target_2024 * {EXTEND_2024_TO_2025}",
            "within_year": "uniform scale per calendar year",
        },
        "scales": {str(k): v for k, v in scales.items()},
        "annual": rows,
        "yoy_calibrated": {
            str(y): float(after.loc[y] / after.loc[y - 1] - 1.0)
            for y in range(2021, 2026)
            if y in after.index and (y - 1) in after.index
        },
        "outputs": [str(x.name) for x in p.values() if isinstance(x, Path)],
    }
    p["qc"].write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(ann_df.to_string(index=False, float_format=lambda x: f"{x:,.1f}"))
    print(f"QC -> {p['qc'].name}")


def merge_combined_epi() -> None:
    """Merge calibrated Pf + Pv into one dashboard extract."""
    pf_path = OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pf.csv"
    pv_path = OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pv.csv"
    out_path = OUT / "epi_data_synthetic_2020_2025_cod_ab_v04.csv"
    if not pf_path.exists() or not pv_path.exists():
        print("Skip combined epi merge (need both species extracts)")
        return
    pf = pd.read_csv(pf_path)
    pv = pd.read_csv(pv_path)[["obs_date", "woreda_name", "test_pv_only"]]
    merged = pf.drop(columns=["test_pv_only"]).merge(
        pv, on=["obs_date", "woreda_name"], how="outer"
    )
    merged["test_pf_tot"] = merged["test_pf_tot"].fillna(0.0)
    merged["test_pv_only"] = merged["test_pv_only"].fillna(0.0)
    # Prefer Pf population when both present
    if "pop_at_risk" not in merged.columns:
        merged = merged.merge(
            pf[["obs_date", "woreda_name", "pop_at_risk"]],
            on=["obs_date", "woreda_name"],
            how="left",
        )
    merged = merged[
        ["obs_date", "woreda_name", "pop_at_risk", "test_pf_tot", "test_pv_only"]
    ].sort_values(["woreda_name", "obs_date"])
    merged.to_csv(out_path, index=False, float_format="%.6f")
    print(
        f"Wrote combined epi -> {out_path.name} "
        f"({len(merged):,} rows, {merged['woreda_name'].nunique()} woredas)"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate synthetic resurgence")
    parser.add_argument(
        "--species",
        choices=["pf", "pv", "both"],
        default="both",
    )
    args = parser.parse_args()
    species_list = ["pf", "pv"] if args.species == "both" else [args.species]
    for sp in species_list:
        calibrate_species(sp)
    if "pv" in species_list or args.species == "both":
        # Always refresh combined when Pv is involved; also if both
        merge_combined_epi()
    elif Path(OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pv.csv").exists():
        merge_combined_epi()


if __name__ == "__main__":
    main()
