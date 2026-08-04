"""
Fill COD-AB v04 gap woredas (no old-map overlap) with:
  1) WorldPop zonal population (local GeoTIFFs)
  2) Environmental series from the containing/nearest OLD woreda
     (proxy for small town splits; full GEE zonal extract optional later)

Then merge gap rows into draft train/predict panels.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio.mask import mask as rio_mask
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
BACKEND_DATA = ROOT / "backend" / "data"
SYN = ROOT / "data" / "synthetic_v2"
OUT = SYN / "outputs"
WORLDPOP_DIR = SYN.parent / "worldpop"
if not WORLDPOP_DIR.exists():
    WORLDPOP_DIR = ROOT / "data" / "worldpop"

OLD_GEO = PUBLIC / "eth_admin3.geojson.bak-pre-cod-ab-v04"
NEW_GEO = PUBLIC / "eth_admin3.geojson"
OLD_CW = PUBLIC / "ethiopia_woreda_pcode.json.bak-pre-cod-ab-v04"
MASTER = SYN / "woreda_master_cod_ab_v04.csv"
ENV = BACKEND_DATA / "env_data.csv"
CASES = OUT / "remapped_cases_weekly_cod_ab_v04.csv"
TRAIN = OUT / "train_panel_2014_2019_draft.csv"
PREDICT = OUT / "predict_drivers_2020_2025_draft.csv"

YEARS = list(range(2014, 2026))


def load_geo_index(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    items = []
    for feat in data.get("features") or []:
        props = feat.get("properties") or {}
        pcode = str(props.get("adm3_pcode") or props.get("NewPCODE") or "").strip()
        name = str(props.get("adm3_name") or props.get("W_NAME") or "").strip()
        geom = shape(feat.get("geometry"))
        if not pcode or geom.is_empty:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        items.append({"pcode": pcode, "name": name, "geom": geom, "centroid": geom.centroid})
    return items


def find_gaps(master: pd.DataFrame, cases: pd.DataFrame) -> pd.DataFrame:
    have = set(cases["adm3_pcode"].astype(str))
    gap = master[~master["adm3_pcode"].isin(have)].copy()
    return gap.reset_index(drop=True)


def worldpop_path(year: int) -> Path | None:
    candidates = [
        WORLDPOP_DIR / f"eth_pop_{year}_CN_100m_R2025A_v1.tif",
        WORLDPOP_DIR / f"eth_pop_{year}_CN_100m_R2024B_v1.tif",
    ]
    for path in candidates:
        if path.exists():
            return path
    # fuzzy
    matches = list(WORLDPOP_DIR.glob(f"*_{year}_*.tif")) if WORLDPOP_DIR.exists() else []
    return matches[0] if matches else None


def zonal_population(geom, tif_path: Path) -> float:
    try:
        with rasterio.open(tif_path) as src:
            geoms = [mapping(geom)]
            out_image, _ = rio_mask(src, geoms, crop=True, filled=True)
            data = out_image[0].astype("float64")
            nodata = src.nodata
            if nodata is not None:
                data = np.where(data == nodata, np.nan, data)
            data = np.where(data < 0, np.nan, data)
            total = np.nansum(data)
            if not np.isfinite(total) or total < 0:
                return 0.0
            return float(total)
    except Exception:
        return 0.0


def extract_worldpop_for_gaps(gap_features: list[dict]) -> pd.DataFrame:
    rows = []
    available_years = []
    for year in YEARS:
        path = worldpop_path(year)
        if path is None:
            print(f"  WorldPop missing for {year}")
            continue
        available_years.append(year)
        print(f"  Aggregating WorldPop {year} for {len(gap_features)} gap woredas...")
        for item in gap_features:
            pop = zonal_population(item["geom"], path)
            rows.append(
                {
                    "adm3_pcode": item["pcode"],
                    "adm3_name": item["name"],
                    "year": year,
                    "population": pop,
                    "source": f"worldpop:{path.name}",
                }
            )
    print(f"  years used: {available_years}")
    return pd.DataFrame(rows)


def old_name_lookup() -> dict[str, str]:
    """pcode -> woreda_name used in env_data."""
    mapping = {}
    if OLD_CW.exists():
        cw = json.loads(OLD_CW.read_text(encoding="utf-8"))
        # invert byName preferentially keeping a canonical name
        for name, pcode in (cw.get("byName") or {}).items():
            pcode = str(pcode).strip()
            if pcode and pcode not in mapping:
                mapping[pcode] = str(name).strip()
    old_items = load_geo_index(OLD_GEO)
    for item in old_items:
        mapping.setdefault(item["pcode"], item["name"])
    return mapping


def assign_env_parents(gap_features: list[dict], old_items: list[dict]) -> pd.DataFrame:
    geoms = [i["geom"] for i in old_items]
    tree = STRtree(geoms)
    rows = []
    for gap in gap_features:
        c = gap["centroid"]
        parent = None
        method = "none"
        # 1) containing old polygon
        try:
            idxs = tree.query(c)
        except Exception:
            idxs = []
        for idx in idxs:
            item = old_items[int(idx)]
            try:
                if item["geom"].covers(c) or item["geom"].intersects(c):
                    parent = item
                    method = "centroid_in_old_polygon"
                    break
            except Exception:
                continue
        # 2) nearest centroid
        if parent is None:
            best = None
            best_d = math.inf
            for item in old_items:
                d = c.distance(item["centroid"])
                if d < best_d:
                    best_d = d
                    best = item
            parent = best
            method = "nearest_old_centroid"
        rows.append(
            {
                "adm3_pcode": gap["pcode"],
                "adm3_name": gap["name"],
                "parent_old_pcode": parent["pcode"] if parent else "",
                "parent_old_name": parent["name"] if parent else "",
                "env_assign_method": method,
            }
        )
    return pd.DataFrame(rows)


def build_gap_env(assignments: pd.DataFrame, pcode_to_old_name: dict[str, str]) -> pd.DataFrame:
    print("Loading env_data for parent assignment...")
    env = pd.read_csv(
        ENV,
        dtype={"woreda_name": "string", "environ_var_code": "string", "obs_value": "float64"},
        parse_dates=["obs_date"],
    )
    env = env[env["environ_var_code"].isin(["totprec", "lst_mean", "ndvi"])].copy()

    # Map parent old pcode -> one or more names present in env
    names_needed = set()
    parent_names = {}
    for row in assignments.itertuples(index=False):
        old_p = str(row.parent_old_pcode)
        name = pcode_to_old_name.get(old_p) or str(row.parent_old_name)
        parent_names[str(row.adm3_pcode)] = name
        names_needed.add(name)

    env = env[env["woreda_name"].isin(names_needed)].copy()
    print(f"  parent env rows: {len(env):,}")

    pieces = []
    for gap_p, parent_name in parent_names.items():
        part = env[env["woreda_name"] == parent_name][["obs_date", "environ_var_code", "obs_value"]].copy()
        if part.empty:
            continue
        part["adm3_pcode"] = gap_p
        pieces.append(part)
    if not pieces:
        return pd.DataFrame(columns=["obs_date", "adm3_pcode", "environ_var_code", "obs_value"])
    out = pd.concat(pieces, ignore_index=True)
    print(f"  gap env rows: {len(out):,}")
    return out


def weekly_pop_from_annual(gap_pop: pd.DataFrame, week_starts: pd.DatetimeIndex) -> pd.DataFrame:
    """Expand annual WorldPop to weekly rows for requested dates."""
    if gap_pop.empty:
        return pd.DataFrame(columns=["week_start", "adm3_pcode", "population"])
    # For each date, use that calendar year's population; fallback nearest year.
    years = sorted(gap_pop["year"].unique())
    pop_by = {(r.adm3_pcode, int(r.year)): float(r.population) for r in gap_pop.itertuples(index=False)}
    pcodes = sorted(gap_pop["adm3_pcode"].unique())
    rows = []
    for pcode in pcodes:
        for ws in week_starts:
            y = int(ws.year)
            if (pcode, y) in pop_by:
                pop = pop_by[(pcode, y)]
            else:
                # nearest available year
                nearest = min(years, key=lambda yy: abs(int(yy) - y))
                pop = pop_by.get((pcode, int(nearest)), 0.0)
            rows.append({"week_start": ws, "adm3_pcode": pcode, "population": pop})
    return pd.DataFrame(rows)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    master = pd.read_csv(MASTER, dtype=str)
    cases = pd.read_csv(CASES, usecols=["adm3_pcode", "week_start"], dtype={"adm3_pcode": str}, parse_dates=["week_start"])
    gaps = find_gaps(master, cases)
    print(f"Gap woredas: {len(gaps)}")
    gaps.to_csv(OUT / "gap_woredas_cod_ab_v04.csv", index=False)

    new_items = load_geo_index(NEW_GEO)
    new_by_pcode = {i["pcode"]: i for i in new_items}
    gap_features = []
    for row in gaps.itertuples(index=False):
        item = new_by_pcode.get(str(row.adm3_pcode))
        if item:
            gap_features.append(item)
        else:
            print(f"  missing geometry for {row.adm3_pcode}")
    print(f"Gap features with geometry: {len(gap_features)}")

    if not WORLDPOP_DIR.exists():
        raise SystemExit(f"WorldPop directory not found: {WORLDPOP_DIR}")

    print("WorldPop zonal population...")
    gap_pop = extract_worldpop_for_gaps(gap_features)
    gap_pop = gap_pop.merge(master[["adm3_pcode", "adm1_name"]], on="adm3_pcode", how="left")
    gap_pop_path = OUT / "gap_worldpop_population_by_year.csv"
    gap_pop.to_csv(gap_pop_path, index=False, float_format="%.3f")
    print(f"Wrote {gap_pop_path}")

    print("Assigning env parents (containing/nearest old woreda)...")
    old_items = load_geo_index(OLD_GEO)
    assignments = assign_env_parents(gap_features, old_items)
    assignments = assignments.merge(master[["adm3_pcode", "adm1_name"]], on="adm3_pcode", how="left")
    assign_path = OUT / "gap_env_parent_assignments.csv"
    assignments.to_csv(assign_path, index=False)
    print(f"Wrote {assign_path}")
    print(assignments["env_assign_method"].value_counts().to_dict())

    pcode_to_old_name = old_name_lookup()
    gap_env = build_gap_env(assignments, pcode_to_old_name)
    gap_env = gap_env.merge(master[["adm3_pcode", "adm3_name", "adm1_name"]], on="adm3_pcode", how="left")
    gap_env_path = OUT / "gap_env_long_from_parent.csv"
    gap_env.to_csv(gap_env_path, index=False, float_format="%.6f")
    print(f"Wrote {gap_env_path}")

    # Build weekly panel rows for gaps
    print("Building gap weekly panel rows...")
    env_wide = (
        gap_env.pivot_table(
            index=["obs_date", "adm3_pcode"],
            columns="environ_var_code",
            values="obs_value",
            aggfunc="mean",
        )
        .reset_index()
        .rename_axis(None, axis=1)
        .rename(columns={"obs_date": "week_start", "totprec": "rainfall_mm", "lst_mean": "temperature_c"})
    )
    env_wide["week_start"] = pd.to_datetime(env_wide["week_start"])
    week_starts = pd.DatetimeIndex(sorted(env_wide["week_start"].unique()))
    gap_weekly_pop = weekly_pop_from_annual(gap_pop, week_starts)

    gap_panel = env_wide.merge(gap_weekly_pop, on=["week_start", "adm3_pcode"], how="left")
    gap_panel = gap_panel.merge(master[["adm3_pcode", "adm3_name", "adm1_name"]], on="adm3_pcode", how="left")
    gap_panel["year"] = gap_panel["week_start"].dt.isocalendar().year.astype(int)
    gap_panel["week_of_year"] = gap_panel["week_start"].dt.isocalendar().week.astype(int)
    # No historical cases for pure gaps yet (filled later by model); keep zeros for structure.
    gap_panel["cases"] = 0.0
    gap_panel["incidence"] = 0.0
    gap_panel["cases_pf"] = 0.0
    gap_panel["cases_pv"] = 0.0
    gap_panel["incidence_pf"] = 0.0
    gap_panel["incidence_pv"] = 0.0

    gap_panel_path = OUT / "gap_weekly_panel_filled.csv"
    gap_panel.to_csv(gap_panel_path, index=False, float_format="%.6f")
    print(f"Wrote {gap_panel_path} ({len(gap_panel):,} rows)")

    # Merge into draft panels
    train_cols = [
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
    predict_cols = [
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
    ]

    train = pd.read_csv(TRAIN, parse_dates=["week_start"])
    predict = pd.read_csv(PREDICT, parse_dates=["week_start"])
    gap_train = gap_panel[(gap_panel["week_start"] >= "2014-01-01") & (gap_panel["week_start"] <= "2019-12-31")][train_cols]
    gap_predict = gap_panel[(gap_panel["week_start"] >= "2020-01-01") & (gap_panel["week_start"] <= "2025-12-31")][predict_cols]

    # Drop any existing gap pcodes then append
    gap_pcodes = set(gaps["adm3_pcode"])
    train2 = pd.concat([train[~train["adm3_pcode"].isin(gap_pcodes)], gap_train], ignore_index=True)
    predict2 = pd.concat([predict[~predict["adm3_pcode"].isin(gap_pcodes)], gap_predict], ignore_index=True)
    train2 = train2.sort_values(["adm3_pcode", "week_start"])
    predict2 = predict2.sort_values(["adm3_pcode", "week_start"])

    train_out = OUT / "train_panel_2014_2019_draft.csv"
    predict_out = OUT / "predict_drivers_2020_2025_draft.csv"
    train2.to_csv(train_out, index=False, float_format="%.6f")
    predict2.to_csv(predict_out, index=False, float_format="%.6f")

    summary = {
        "gap_woreda_count": int(len(gaps)),
        "gap_features_with_geometry": int(len(gap_features)),
        "worldpop_dir": str(WORLDPOP_DIR),
        "worldpop_years": sorted(gap_pop["year"].unique().tolist()) if not gap_pop.empty else [],
        "gap_pop_mean": float(gap_pop["population"].mean()) if not gap_pop.empty else None,
        "gap_pop_zero_count": int((gap_pop["population"] <= 0).sum()) if not gap_pop.empty else None,
        "env_assign_methods": assignments["env_assign_method"].value_counts().to_dict(),
        "gap_env_rows": int(len(gap_env)),
        "gap_panel_rows": int(len(gap_panel)),
        "train_rows_after": int(len(train2)),
        "predict_rows_after": int(len(predict2)),
        "train_pcodes_after": int(train2["adm3_pcode"].nunique()),
        "predict_pcodes_after": int(predict2["adm3_pcode"].nunique()),
        "env_method": (
            "Proxy from containing/nearest OLD woreda env series "
            "(GEE Python API not installed; use Node/GEE later for direct zonal extract)."
        ),
        "population_method": "WorldPop constrained 100m zonal sum via rasterio.mask",
        "outputs": [
            "gap_woredas_cod_ab_v04.csv",
            "gap_worldpop_population_by_year.csv",
            "gap_env_parent_assignments.csv",
            "gap_env_long_from_parent.csv",
            "gap_weekly_panel_filled.csv",
            train_out.name,
            predict_out.name,
        ],
    }
    summary_path = OUT / "gap_fill_qc_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {summary_path}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
