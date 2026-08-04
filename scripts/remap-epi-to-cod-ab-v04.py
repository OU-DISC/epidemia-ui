"""
Area-weighted remap of old (851-woreda) weekly epi data onto COD-AB v04 (1,148 woredas).

Uses overlap shares from eth_admin3_split_merge_links / old_to_new_area_weights:
  new_value += old_value * normalized_share_of_old

Outputs under data/synthetic_v2/outputs/:
  - remapped_cases_weekly_cod_ab_v04.csv
  - remapped_cases_qc_summary.json
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
BACKEND_DATA = ROOT / "backend" / "data"
OUT_DIR = ROOT / "data" / "synthetic_v2" / "outputs"
INPUTS = ROOT / "data" / "synthetic_v2" / "inputs"

OLD_GEO = PUBLIC / "eth_admin3.geojson.bak-pre-cod-ab-v04"
NEW_GEO = PUBLIC / "eth_admin3.geojson"
OLD_CW = PUBLIC / "ethiopia_woreda_pcode.json.bak-pre-cod-ab-v04"
WEIGHTS = INPUTS / "old_to_new_area_weights.csv"
EPI = BACKEND_DATA / "epi_data.csv"
MASTER = ROOT / "data" / "synthetic_v2" / "woreda_master_cod_ab_v04.csv"

MIN_SHARE = 0.01  # drop tiny overlaps before normalizing


def norm_key(value: object) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s*\([^)]*\)\s*", " ", text)
    text = text.replace("&", "and")
    text = re.sub(r"\b(woreda|district|special|town|administration|adm)\b", " ", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def load_old_name_to_pcode() -> dict[str, str]:
    """Map woreda display names / normalized keys → old adm3_pcode."""
    mapping: dict[str, str] = {}

    if OLD_CW.exists():
        cw = json.loads(OLD_CW.read_text(encoding="utf-8"))
        for name, pcode in (cw.get("byName") or {}).items():
            if name and pcode:
                mapping[str(name).strip()] = str(pcode).strip()
                mapping[norm_key(name)] = str(pcode).strip()
        for key, pcode in (cw.get("byKey") or {}).items():
            if key and pcode:
                mapping[str(key).strip()] = str(pcode).strip()

    # Ensure every old geo name is present.
    old = json.loads(OLD_GEO.read_text(encoding="utf-8"))
    for feat in old.get("features") or []:
        props = feat.get("properties") or {}
        pcode = str(props.get("adm3_pcode") or props.get("NewPCODE") or "").strip()
        name = str(props.get("adm3_name") or props.get("W_NAME") or "").strip()
        if not pcode:
            continue
        if name:
            mapping.setdefault(name, pcode)
            mapping.setdefault(norm_key(name), pcode)
    return mapping


def load_new_pcodes() -> set[str]:
    master = pd.read_csv(MASTER, dtype=str)
    return set(master["adm3_pcode"].dropna().astype(str).str.strip())


def build_weight_table(new_pcodes: set[str]) -> dict[str, list[tuple[str, float]]]:
    """
    old_pcode -> list[(new_pcode, weight)] with weights summing to 1.
    Prefer share_of_old from overlap links; fall back to identity if old pcode still exists.
    """
    raw: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    if WEIGHTS.exists():
        wdf = pd.read_csv(WEIGHTS, dtype=str)
        for row in wdf.itertuples(index=False):
            old_p = str(getattr(row, "old_adm3_pcode", "") or "").strip()
            new_p = str(getattr(row, "new_adm3_pcode", "") or "").strip()
            if not old_p or not new_p or new_p not in new_pcodes:
                continue
            try:
                share = float(getattr(row, "share_of_old", 0) or 0)
            except (TypeError, ValueError):
                share = 0.0
            if share < MIN_SHARE:
                continue
            raw[old_p][new_p] = max(raw[old_p][new_p], share)

    # Identity fallback for old pcodes that still exist in the new map and have no/weak links.
    old = json.loads(OLD_GEO.read_text(encoding="utf-8"))
    old_pcodes = set()
    for feat in old.get("features") or []:
        props = feat.get("properties") or {}
        pcode = str(props.get("adm3_pcode") or props.get("NewPCODE") or "").strip()
        if pcode:
            old_pcodes.add(pcode)

    for old_p in old_pcodes:
        if old_p in new_pcodes and old_p not in raw:
            raw[old_p][old_p] = 1.0
        elif old_p in new_pcodes and old_p in raw:
            # Ensure self-link exists if this pcode still exists.
            raw[old_p].setdefault(old_p, 0.0)
            # If all mass is on other codes, keep as-is; if empty after filter, identity.
            if sum(raw[old_p].values()) <= 0:
                raw[old_p][old_p] = 1.0

    normalized: dict[str, list[tuple[str, float]]] = {}
    for old_p, targets in raw.items():
        total = sum(targets.values())
        if total <= 0:
            if old_p in new_pcodes:
                normalized[old_p] = [(old_p, 1.0)]
            continue
        normalized[old_p] = [(new_p, share / total) for new_p, share in sorted(targets.items())]
    return normalized


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Loading PCODE maps and weights...")
    name_to_old = load_old_name_to_pcode()
    new_pcodes = load_new_pcodes()
    weights = build_weight_table(new_pcodes)
    print(f"  name->old_pcode keys: {len(name_to_old)}")
    print(f"  new pcodes: {len(new_pcodes)}")
    print(f"  old pcodes with remap weights: {len(weights)}")

    print(f"Reading epi data: {EPI}")
    epi = pd.read_csv(
        EPI,
        dtype={
            "woreda_name": "string",
            "pop_at_risk": "float64",
            "test_pf_tot": "float64",
            "test_pv_only": "float64",
        },
        parse_dates=["obs_date"],
    )
    print(f"  rows: {len(epi):,}")

    # Resolve old pcode for each row.
    epi["old_pcode"] = epi["woreda_name"].map(lambda x: name_to_old.get(str(x).strip()) or name_to_old.get(norm_key(x)))
    matched = epi["old_pcode"].notna().sum()
    unmatched_names = sorted(epi.loc[epi["old_pcode"].isna(), "woreda_name"].dropna().astype(str).unique())
    print(f"  rows with old_pcode: {matched:,} / {len(epi):,}")
    print(f"  unmatched woreda names: {len(unmatched_names)}")

    epi_m = epi.dropna(subset=["old_pcode"]).copy()
    epi_m["old_pcode"] = epi_m["old_pcode"].astype(str)

    weight_rows = [
        {"old_pcode": old_p, "adm3_pcode": new_p, "weight": w}
        for old_p, targets in weights.items()
        for new_p, w in targets
    ]
    weight_df = pd.DataFrame(weight_rows)
    old_with_weights = set(weight_df["old_pcode"].unique())
    skipped_no_weight = int(epi_m.loc[~epi_m["old_pcode"].isin(old_with_weights), "old_pcode"].nunique())

    print("Applying area weights...")
    expanded = epi_m.merge(weight_df, on="old_pcode", how="inner")
    if expanded.empty:
        raise SystemExit("No remapped rows produced. Check weights and name→pcode mapping.")
    expanded["pop_at_risk"] = expanded["pop_at_risk"].fillna(0.0) * expanded["weight"]
    expanded["test_pf_tot"] = expanded["test_pf_tot"].fillna(0.0) * expanded["weight"]
    expanded["test_pv_only"] = expanded["test_pv_only"].fillna(0.0) * expanded["weight"]
    print(f"  expanded rows before aggregate: {len(expanded):,}")
    print(f"  old pcodes skipped (no weights): {skipped_no_weight}")

    remapped = (
        expanded.groupby(["obs_date", "adm3_pcode"], as_index=False)[
            ["pop_at_risk", "test_pf_tot", "test_pv_only"]
        ]
        .sum()
        .sort_values(["adm3_pcode", "obs_date"])
    )

    # Attach names from master.
    master = pd.read_csv(MASTER, dtype=str)
    remapped = remapped.merge(
        master[["adm3_pcode", "adm3_name", "adm1_name"]],
        on="adm3_pcode",
        how="left",
    )

    pop = remapped["pop_at_risk"]
    remapped["incidence_pf"] = 0.0
    remapped["incidence_pv"] = 0.0
    valid_pop = pop > 0
    remapped.loc[valid_pop, "incidence_pf"] = remapped.loc[valid_pop, "test_pf_tot"] / pop[valid_pop]
    remapped.loc[valid_pop, "incidence_pv"] = remapped.loc[valid_pop, "test_pv_only"] / pop[valid_pop]

    out_csv = OUT_DIR / "remapped_cases_weekly_cod_ab_v04.csv"
    remapped.rename(
        columns={
            "obs_date": "week_start",
            "pop_at_risk": "population",
            "test_pf_tot": "cases_pf",
            "test_pv_only": "cases_pv",
        }
    ).to_csv(out_csv, index=False, float_format="%.6f")
    print(f"Wrote {out_csv} ({len(remapped):,} rows)")

    # QC
    old_pf = float(epi["test_pf_tot"].fillna(0).sum())
    old_pv = float(epi["test_pv_only"].fillna(0).sum())
    new_pf = float(remapped["test_pf_tot"].sum())
    new_pv = float(remapped["test_pv_only"].sum())
    covered_new = remapped["adm3_pcode"].nunique()
    weeks = remapped["obs_date"].nunique()

    # Per-week conservation check (mean abs relative error).
    old_weekly = epi.groupby("obs_date", as_index=False)["test_pf_tot"].sum().rename(columns={"test_pf_tot": "old_pf"})
    new_weekly = remapped.groupby("obs_date", as_index=False)["test_pf_tot"].sum().rename(columns={"test_pf_tot": "new_pf"})
    weekly = old_weekly.merge(new_weekly, on="obs_date", how="outer").fillna(0.0)
    weekly["abs_rel_err"] = weekly.apply(
        lambda r: abs(r["new_pf"] - r["old_pf"]) / r["old_pf"] if r["old_pf"] > 0 else (0.0 if r["new_pf"] == 0 else 1.0),
        axis=1,
    )

    summary = {
        "method": "area-weighted remap using share_of_old (normalized per old_pcode)",
        "source_epi": str(EPI.as_posix()),
        "output_csv": str(out_csv.as_posix()),
        "old_rows": int(len(epi)),
        "remapped_rows": int(len(remapped)),
        "new_pcodes_in_master": int(len(new_pcodes)),
        "new_pcodes_with_data": int(covered_new),
        "new_pcodes_without_data": int(len(new_pcodes) - covered_new),
        "n_weeks": int(weeks),
        "date_min": str(remapped["obs_date"].min().date()),
        "date_max": str(remapped["obs_date"].max().date()),
        "old_total_cases_pf": round(old_pf, 3),
        "new_total_cases_pf": round(new_pf, 3),
        "pf_total_ratio_new_over_old": round(new_pf / old_pf, 6) if old_pf else None,
        "old_total_cases_pv": round(old_pv, 3),
        "new_total_cases_pv": round(new_pv, 3),
        "pv_total_ratio_new_over_old": round(new_pv / old_pv, 6) if old_pv else None,
        "weekly_pf_mean_abs_rel_err": round(float(weekly["abs_rel_err"].mean()), 6),
        "unmatched_woreda_name_count": int(len(unmatched_names)),
        "unmatched_woreda_names_sample": unmatched_names[:30],
        "old_pcodes_without_weights": int(skipped_no_weight),
        "note": (
            "This is an interim geometry remap of existing epi/synthetic cases onto new boundaries. "
            "It is not a full XGBoost re-generation. Use as draft train/history panel inputs."
        ),
    }
    out_summary = OUT_DIR / "remapped_cases_qc_summary.json"
    out_summary.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {out_summary}")
    print(json.dumps(summary, indent=2))

    # Also write a compact 2014–2019 train-cases extract for the schema.
    train = remapped[(remapped["obs_date"] >= "2014-01-01") & (remapped["obs_date"] <= "2019-12-31")].copy()
    train_out = OUT_DIR / "train_cases_remapped_2014_2019_cod_ab_v04.csv"
    train.rename(
        columns={
            "obs_date": "week_start",
            "pop_at_risk": "population",
            "test_pf_tot": "cases_pf",
            "test_pv_only": "cases_pv",
        }
    ).to_csv(train_out, index=False, float_format="%.6f")
    print(f"Wrote {train_out} ({len(train):,} rows)")


if __name__ == "__main__":
    main()
