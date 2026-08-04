"""
Remap environmental and population data from old 851 woredas onto COD-AB v04 (1,148).

- Env (totprec, lst_mean, ndvi): area-weighted AVERAGE using intersection area
- Population: area-weighted SUM using normalized share_of_old (same as cases)

Then build draft panels:
  - train_panel_2014_2019_draft.csv
  - predict_drivers_2020_2025_draft.csv
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
SYN = ROOT / "data" / "synthetic_v2"
OUT_DIR = SYN / "outputs"
INPUTS = SYN / "inputs"

OLD_GEO = PUBLIC / "eth_admin3.geojson.bak-pre-cod-ab-v04"
NEW_GEO = PUBLIC / "eth_admin3.geojson"
OLD_CW = PUBLIC / "ethiopia_woreda_pcode.json.bak-pre-cod-ab-v04"
WEIGHTS = INPUTS / "old_to_new_area_weights.csv"
ENV = BACKEND_DATA / "env_data.csv"
POP = BACKEND_DATA / "population_weekly_2012-2030.csv"
MASTER = SYN / "woreda_master_cod_ab_v04.csv"
REMAPPED_CASES = OUT_DIR / "remapped_cases_weekly_cod_ab_v04.csv"

MIN_SHARE = 0.01
ENV_CODES = ("totprec", "lst_mean", "ndvi")


def norm_key(value: object) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s*\([^)]*\)\s*", " ", text)
    text = text.replace("&", "and")
    text = re.sub(r"\b(woreda|district|special|town|administration|adm)\b", " ", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def load_name_to_old_pcode() -> dict[str, str]:
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

    old = json.loads(OLD_GEO.read_text(encoding="utf-8"))
    for feat in old.get("features") or []:
        props = feat.get("properties") or {}
        pcode = str(props.get("adm3_pcode") or props.get("NewPCODE") or "").strip()
        name = str(props.get("adm3_name") or props.get("W_NAME") or "").strip()
        if pcode and name:
            mapping.setdefault(name, pcode)
            mapping.setdefault(norm_key(name), pcode)
    return mapping


def load_new_pcodes() -> set[str]:
    master = pd.read_csv(MASTER, dtype=str)
    return set(master["adm3_pcode"].dropna().astype(str).str.strip())


def build_weight_frames(new_pcodes: set[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Returns:
      extensive_df: old_pcode, adm3_pcode, weight  (share_of_old normalized; for counts/pop)
      intensive_df: old_pcode, adm3_pcode, weight  (intersection_km2; for env averages)
    """
    raw_ext: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    raw_int: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    if WEIGHTS.exists():
        wdf = pd.read_csv(WEIGHTS)
        for row in wdf.itertuples(index=False):
            old_p = str(getattr(row, "old_adm3_pcode", "") or "").strip()
            new_p = str(getattr(row, "new_adm3_pcode", "") or "").strip()
            if not old_p or not new_p or new_p not in new_pcodes:
                continue
            try:
                share = float(getattr(row, "share_of_old", 0) or 0)
            except (TypeError, ValueError):
                share = 0.0
            try:
                inter = float(getattr(row, "intersection_km2", 0) or 0)
            except (TypeError, ValueError):
                inter = 0.0
            if share >= MIN_SHARE:
                raw_ext[old_p][new_p] = max(raw_ext[old_p][new_p], share)
            if inter > 0 and share >= MIN_SHARE:
                raw_int[old_p][new_p] = max(raw_int[old_p][new_p], inter)

    old = json.loads(OLD_GEO.read_text(encoding="utf-8"))
    old_pcodes = set()
    for feat in old.get("features") or []:
        props = feat.get("properties") or {}
        pcode = str(props.get("adm3_pcode") or props.get("NewPCODE") or "").strip()
        if pcode:
            old_pcodes.add(pcode)

    for old_p in old_pcodes:
        if old_p in new_pcodes:
            if old_p not in raw_ext:
                raw_ext[old_p][old_p] = 1.0
            if old_p not in raw_int:
                raw_int[old_p][old_p] = 1.0

    ext_rows = []
    for old_p, targets in raw_ext.items():
        total = sum(targets.values())
        if total <= 0:
            continue
        for new_p, share in targets.items():
            ext_rows.append({"old_pcode": old_p, "adm3_pcode": new_p, "weight": share / total})

    int_rows = []
    for old_p, targets in raw_int.items():
        for new_p, inter in targets.items():
            int_rows.append({"old_pcode": old_p, "adm3_pcode": new_p, "weight": inter})

    return pd.DataFrame(ext_rows), pd.DataFrame(int_rows)


def resolve_old_pcode(series: pd.Series, name_map: dict[str, str]) -> pd.Series:
    direct = series.astype(str).str.strip().map(name_map)
    fallback = series.map(lambda x: name_map.get(norm_key(x)))
    return direct.fillna(fallback)


def remap_env(name_map: dict[str, str], intensive_w: pd.DataFrame) -> pd.DataFrame:
    print(f"Reading env: {ENV}")
    env = pd.read_csv(
        ENV,
        dtype={"woreda_name": "string", "environ_var_code": "string", "obs_value": "float64"},
        parse_dates=["obs_date"],
    )
    env = env[env["environ_var_code"].isin(ENV_CODES)].copy()
    print(f"  rows (filtered codes): {len(env):,}")

    env["old_pcode"] = resolve_old_pcode(env["woreda_name"], name_map)
    print(f"  matched rows: {env['old_pcode'].notna().sum():,}")
    env = env.dropna(subset=["old_pcode"])
    env["old_pcode"] = env["old_pcode"].astype(str)

    expanded = env.merge(intensive_w, on="old_pcode", how="inner")
    expanded["w_value"] = expanded["obs_value"].fillna(0.0) * expanded["weight"]
    grouped = (
        expanded.groupby(["obs_date", "adm3_pcode", "environ_var_code"], as_index=False)
        .agg(w_value=("w_value", "sum"), weight=("weight", "sum"))
    )
    grouped["obs_value"] = grouped["w_value"] / grouped["weight"]
    out = grouped[["obs_date", "adm3_pcode", "environ_var_code", "obs_value"]].dropna(subset=["obs_value"])
    print(f"  remapped env rows: {len(out):,}")
    return out


def remap_population(name_map: dict[str, str], extensive_w: pd.DataFrame) -> pd.DataFrame:
    print(f"Reading population: {POP}")
    pop = pd.read_csv(
        POP,
        dtype={"woreda_name": "string", "year": "int64", "week_of_year": "int64"},
    )
    # Prefer population, fall back to pop_at_risk.
    if "population" not in pop.columns and "pop_at_risk" in pop.columns:
        pop["population"] = pop["pop_at_risk"]
    pop["population"] = pd.to_numeric(pop["population"], errors="coerce")
    print(f"  rows: {len(pop):,}")

    pop["old_pcode"] = resolve_old_pcode(pop["woreda_name"], name_map)
    print(f"  matched rows: {pop['old_pcode'].notna().sum():,}")
    pop = pop.dropna(subset=["old_pcode"])
    pop["old_pcode"] = pop["old_pcode"].astype(str)

    expanded = pop.merge(extensive_w, on="old_pcode", how="inner")
    expanded["population"] = expanded["population"].fillna(0.0) * expanded["weight"]
    out = (
        expanded.groupby(["year", "week_of_year", "adm3_pcode"], as_index=False)["population"]
        .sum()
        .sort_values(["adm3_pcode", "year", "week_of_year"])
    )
    print(f"  remapped pop rows: {len(out):,}")
    return out


def env_to_wide(env_long: pd.DataFrame) -> pd.DataFrame:
    wide = (
        env_long.pivot_table(
            index=["obs_date", "adm3_pcode"],
            columns="environ_var_code",
            values="obs_value",
            aggfunc="mean",
        )
        .reset_index()
    )
    wide.columns.name = None
    rename = {"totprec": "rainfall_mm", "lst_mean": "temperature_c", "ndvi": "ndvi"}
    wide = wide.rename(columns=rename)
    return wide


def attach_week_parts(df: pd.DataFrame, date_col: str = "week_start") -> pd.DataFrame:
    out = df.copy()
    out[date_col] = pd.to_datetime(out[date_col])
    out["year"] = out[date_col].dt.isocalendar().year.astype(int)
    out["week_of_year"] = out[date_col].dt.isocalendar().week.astype(int)
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    name_map = load_name_to_old_pcode()
    new_pcodes = load_new_pcodes()
    extensive_w, intensive_w = build_weight_frames(new_pcodes)
    print(f"extensive weight links: {len(extensive_w):,}")
    print(f"intensive weight links: {len(intensive_w):,}")

    env_long = remap_env(name_map, intensive_w)
    master = pd.read_csv(MASTER, dtype=str)
    env_long = env_long.merge(master[["adm3_pcode", "adm3_name", "adm1_name"]], on="adm3_pcode", how="left")
    env_out = OUT_DIR / "remapped_env_long_cod_ab_v04.csv"
    env_long.to_csv(env_out, index=False, float_format="%.6f")
    print(f"Wrote {env_out}")

    pop = remap_population(name_map, extensive_w)
    pop = pop.merge(master[["adm3_pcode", "adm3_name", "adm1_name"]], on="adm3_pcode", how="left")
    pop_out = OUT_DIR / "remapped_population_weekly_cod_ab_v04.csv"
    pop.to_csv(pop_out, index=False, float_format="%.6f")
    print(f"Wrote {pop_out}")

    print("Building wide env + panels...")
    env_wide = env_to_wide(env_long)
    env_wide = env_wide.rename(columns={"obs_date": "week_start"})
    env_wide = attach_week_parts(env_wide, "week_start")

    # Population join on year + ISO week + pcode
    pop_key = pop.rename(columns={"population": "population_from_popfile"})

    # Cases remapped file
    if not REMAPPED_CASES.exists():
        raise SystemExit(f"Missing remapped cases file: {REMAPPED_CASES}. Run remap-epi-to-cod-ab-v04.py first.")
    cases = pd.read_csv(REMAPPED_CASES, parse_dates=["week_start"])
    cases = attach_week_parts(cases, "week_start")

    panel = cases.merge(
        env_wide[
            ["week_start", "adm3_pcode", "rainfall_mm", "temperature_c", "ndvi"]
        ],
        on=["week_start", "adm3_pcode"],
        how="left",
    )
    panel = panel.merge(
        pop_key[["year", "week_of_year", "adm3_pcode", "population_from_popfile"]],
        on=["year", "week_of_year", "adm3_pcode"],
        how="left",
    )
    # Prefer dedicated pop file when present; else remapped epi population.
    panel["population"] = panel["population_from_popfile"].fillna(panel["population"])
    panel["cases"] = panel["cases_pf"]  # primary series for synthetic training draft
    panel["incidence"] = 0.0
    valid = panel["population"] > 0
    panel.loc[valid, "incidence"] = panel.loc[valid, "cases"] / panel.loc[valid, "population"]

    keep_cols = [
        "week_start",
        "year",
        "week_of_year",
        "adm3_pcode",
        "adm3_name",
        "adm1_name",
        "rainfall_mm",
        "temperature_c",
        "ndvi",
        "population",
        "cases",
        "incidence",
        "cases_pf",
        "cases_pv",
        "incidence_pf",
        "incidence_pv",
    ]
    for col in keep_cols:
        if col not in panel.columns:
            panel[col] = pd.NA
    panel = panel[keep_cols].sort_values(["adm3_pcode", "week_start"])

    train = panel[(panel["week_start"] >= "2014-01-01") & (panel["week_start"] <= "2019-12-31")].copy()
    predict = panel[(panel["week_start"] >= "2020-01-01") & (panel["week_start"] <= "2025-12-31")].copy()
    predict_drivers = predict.drop(columns=["cases", "incidence", "cases_pf", "cases_pv", "incidence_pf", "incidence_pv"])

    train_out = OUT_DIR / "train_panel_2014_2019_draft.csv"
    predict_out = OUT_DIR / "predict_drivers_2020_2025_draft.csv"
    train.to_csv(train_out, index=False, float_format="%.6f")
    predict_drivers.to_csv(predict_out, index=False, float_format="%.6f")
    print(f"Wrote {train_out} ({len(train):,} rows)")
    print(f"Wrote {predict_out} ({len(predict_drivers):,} rows)")

    # QC
    def coverage(df: pd.DataFrame, cols: list[str]) -> dict:
        out = {"rows": int(len(df)), "pcodes": int(df["adm3_pcode"].nunique())}
        for c in cols:
            out[f"non_null_{c}"] = int(df[c].notna().sum())
            out[f"pct_non_null_{c}"] = round(100.0 * df[c].notna().mean(), 2) if len(df) else 0.0
        return out

    summary = {
        "method": {
            "env": "area-weighted average using intersection_km2 weights",
            "population": "area-weighted sum using normalized share_of_old",
            "cases": "from remapped_cases_weekly_cod_ab_v04.csv",
        },
        "new_pcodes_master": int(len(new_pcodes)),
        "env_long_rows": int(len(env_long)),
        "env_pcodes": int(env_long["adm3_pcode"].nunique()),
        "pop_rows": int(len(pop)),
        "pop_pcodes": int(pop["adm3_pcode"].nunique()),
        "train_panel": coverage(train, ["rainfall_mm", "temperature_c", "ndvi", "population", "cases"]),
        "predict_drivers": coverage(predict_drivers, ["rainfall_mm", "temperature_c", "ndvi", "population"]),
        "pcodes_missing_all_env_in_train": int(
            train.groupby("adm3_pcode")[["rainfall_mm", "temperature_c", "ndvi"]]
            .apply(lambda g: g.isna().all().all())
            .sum()
        ),
        "outputs": [
            env_out.name,
            pop_out.name,
            train_out.name,
            predict_out.name,
        ],
        "note": (
            "Draft panels for XGBoost re-training/generation on COD-AB v04. "
            "97+ new polygons with no old overlap may still lack env/cases until raster extraction."
        ),
    }
    summary_path = OUT_DIR / "env_pop_panel_qc_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {summary_path}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
