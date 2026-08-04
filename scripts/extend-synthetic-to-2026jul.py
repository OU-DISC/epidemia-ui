"""
Extend calibrated synthetic malaria series through end of July 2026.

No observed 2026 env exists yet, so drivers are constructed as:
  - env: woreda × week_of_year mean over 2020–2025 (climatology)
  - population: 2025 weekly pop grown by each woreda's 2024→2025 ratio
  - lags: computed after stitching late-2025 + 2026 weeks

Predictions reuse trained XGBoost models + β_spatial from synthetic_v2/models.
Partial-year calibration: scale Jan–Jul 2026 national totals to
  Jan–Jul 2025 calibrated × CONT_2025_TO_2026 (default 1.05).

Also appends rows to backend epi_data.csv and env_data.csv.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.preprocessing import OrdinalEncoder

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "synthetic_v2" / "outputs"
MODEL_DIR = ROOT / "data" / "synthetic_v2" / "models"
BACKEND_DATA = ROOT / "backend" / "data"
MASTER = ROOT / "data" / "synthetic_v2" / "woreda_master_cod_ab_v04.csv"

EPS = 1e-6
LAGS = 4
CONT_2025_TO_2026 = 1.05  # continued mild rise into 2026
END_2026 = pd.Timestamp("2026-07-31")


def feature_columns() -> list[str]:
    cols = [
        "rainfall_mm",
        "temperature_c",
        "ndvi",
        "log_population",
        "week_of_year",
        "month",
        "pcode_id",
    ]
    for base in ["rainfall_mm", "temperature_c", "ndvi"]:
        for lag in range(1, LAGS + 1):
            cols.append(f"{base}_lag{lag}")
    return cols


def add_lags(df: pd.DataFrame, cols: list[str], lags: int = LAGS) -> pd.DataFrame:
    out = df.sort_values(["adm3_pcode", "week_start"]).copy()
    for col in cols:
        for lag in range(1, lags + 1):
            out[f"{col}_lag{lag}"] = out.groupby("adm3_pcode")[col].shift(lag)
    return out


def monday_weeks(start: pd.Timestamp, end: pd.Timestamp) -> pd.DatetimeIndex:
    # Align to Monday (panel convention)
    s = start - pd.Timedelta(days=start.weekday())
    e = end - pd.Timedelta(days=end.weekday())
    return pd.date_range(s, e, freq="W-MON")


def build_2026_drivers(hist: pd.DataFrame) -> pd.DataFrame:
    hist = hist.copy()
    hist["week_start"] = pd.to_datetime(hist["week_start"])
    for c in ["rainfall_mm", "temperature_c", "ndvi", "population"]:
        hist[c] = pd.to_numeric(hist[c], errors="coerce")

    # Climatology by woreda × ISO week
    clim = (
        hist.groupby(["adm3_pcode", "week_of_year"], as_index=False)
        .agg(
            rainfall_mm=("rainfall_mm", "mean"),
            temperature_c=("temperature_c", "mean"),
            ndvi=("ndvi", "mean"),
            adm3_name=("adm3_name", "first"),
            adm1_name=("adm1_name", "first"),
        )
    )

    # Population growth 2024 → 2025 per woreda
    h24 = hist[hist["week_start"].dt.year == 2024].groupby("adm3_pcode")["population"].mean()
    h25 = hist[hist["week_start"].dt.year == 2025].groupby("adm3_pcode")["population"].mean()
    growth = (h25 / h24.replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(1.025)
    growth = growth.clip(0.98, 1.08)  # keep growth sane

    # Last available 2025 pop by woreda × week_of_year (fallback mean)
    pop25 = hist[hist["week_start"].dt.year == 2025][
        ["adm3_pcode", "week_of_year", "population"]
    ].copy()
    pop25_mean = hist[hist["week_start"].dt.year == 2025].groupby("adm3_pcode")[
        "population"
    ].mean()

    weeks = monday_weeks(pd.Timestamp("2026-01-01"), END_2026)
    # Drop any week still in 2025 (safety)
    weeks = weeks[weeks >= pd.Timestamp("2026-01-01")]
    print(f"2026 weeks: {len(weeks)} ({weeks.min().date()} -> {weeks.max().date()})")

    master = pd.read_csv(MASTER)
    rows = []
    for ws in weeks:
        woy = int(ws.isocalendar().week)
        month = int(ws.month)
        year = int(ws.year)
        base = clim[clim["week_of_year"] == woy].copy()
        if base.empty:
            # rare ISO week 53: reuse week 52
            base = clim[clim["week_of_year"] == 52].copy()
            base["week_of_year"] = woy
        base["week_start"] = ws
        base["year"] = year
        base["month"] = month
        # population
        pmerge = pop25[pop25["week_of_year"] == woy][["adm3_pcode", "population"]]
        base = base.merge(pmerge, on="adm3_pcode", how="left")
        base["population"] = base["population"].fillna(base["adm3_pcode"].map(pop25_mean))
        g = base["adm3_pcode"].map(growth).fillna(1.025)
        base["population"] = base["population"] * g
        rows.append(base)

    drivers = pd.concat(rows, ignore_index=True)
    # Ensure all master pcodes present
    missing = set(master["adm3_pcode"]) - set(drivers["adm3_pcode"].unique())
    if missing:
        print(f"WARNING: {len(missing)} pcodes missing from clim; filling from nearest week mean")
    drivers = drivers.sort_values(["adm3_pcode", "week_start"]).reset_index(drop=True)
    return drivers[
        [
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
    ]


def load_encoder(path: Path) -> OrdinalEncoder:
    cats = json.loads(path.read_text(encoding="utf-8"))["categories"]
    enc = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
    enc.fit(np.array(cats, dtype=object).reshape(-1, 1))
    return enc


def predict_species(
    species: str,
    panel_for_lags: pd.DataFrame,
    drivers_2026: pd.DataFrame,
) -> pd.DataFrame:
    model_path = (
        MODEL_DIR / "xgb_synthetic_cod_ab_v04.json"
        if species == "pf"
        else MODEL_DIR / "xgb_synthetic_cod_ab_v04_pv.json"
    )
    enc_path = (
        MODEL_DIR / "pcode_encoder_categories.json"
        if species == "pf"
        else MODEL_DIR / "pcode_encoder_categories_pv.json"
    )
    beta_path = (
        OUT / "beta_spatial_by_pcode.csv"
        if species == "pf"
        else OUT / "beta_spatial_by_pcode_pv.csv"
    )

    model = xgb.XGBRegressor()
    model.load_model(model_path)
    encoder = load_encoder(enc_path)
    beta = pd.read_csv(beta_path)
    global_beta = float(beta["beta_spatial"].mean())
    if "adm1_name" in beta.columns:
        region_beta = beta.groupby("adm1_name")["beta_spatial"].mean().to_dict()
    else:
        region_beta = (
            beta.merge(
                drivers_2026[["adm3_pcode", "adm1_name"]].drop_duplicates(),
                on="adm3_pcode",
                how="left",
            )
            .groupby("adm1_name")["beta_spatial"]
            .mean()
            .to_dict()
        )

    # Stitch late 2025 for lags
    hist_tail = panel_for_lags[panel_for_lags["week_start"] >= "2025-11-01"].copy()
    hist_tail["week_start"] = pd.to_datetime(hist_tail["week_start"])
    combo = pd.concat([hist_tail, drivers_2026], ignore_index=True)
    combo["week_start"] = pd.to_datetime(combo["week_start"])
    combo["month"] = combo["week_start"].dt.month.astype(int)
    if "week_of_year" not in combo.columns:
        combo["week_of_year"] = combo["week_start"].dt.isocalendar().week.astype(int)
    for c in ["rainfall_mm", "temperature_c", "ndvi", "population"]:
        combo[c] = pd.to_numeric(combo[c], errors="coerce")
    combo["log_population"] = np.log(combo["population"].clip(lower=1.0))
    combo = add_lags(combo, ["rainfall_mm", "temperature_c", "ndvi"], LAGS)

    pred = combo[combo["week_start"] >= "2026-01-01"].copy()
    lag_cols = [
        f"{b}_lag{i}"
        for b in ["rainfall_mm", "temperature_c", "ndvi"]
        for i in range(1, LAGS + 1)
    ]
    pred = pred.dropna(
        subset=["rainfall_mm", "temperature_c", "ndvi", "population"] + lag_cols
    )
    pred = pred[pred["population"] > 0].copy()
    pred["pcode_id"] = encoder.transform(pred[["adm3_pcode"]])

    feat_cols = feature_columns()
    Xp = pred[feat_cols].to_numpy(dtype=np.float32)
    log_inc_hat = model.predict(Xp)

    pred = pred.merge(
        beta[["adm3_pcode", "beta_spatial"]], on="adm3_pcode", how="left"
    )
    pred["beta_spatial"] = pred["beta_spatial"].astype(float)
    pred["beta_spatial"] = (
        pred["beta_spatial"]
        .fillna(pred["adm1_name"].map(region_beta))
        .fillna(global_beta)
    )
    unknown = pred["pcode_id"].to_numpy().ravel() < 0
    adjust = np.zeros(len(pred), dtype=np.float32)
    adjust[unknown] = (
        pred.loc[unknown, "beta_spatial"].to_numpy(dtype=np.float32)
        - np.float32(global_beta)
    )
    log_inc_adj = log_inc_hat + adjust
    incidence = np.clip(np.exp(log_inc_adj) - EPS, 0, None)
    cases = incidence * pred["population"].to_numpy(dtype=np.float64)

    out = pred[
        [
            "week_start",
            "adm3_pcode",
            "adm3_name",
            "adm1_name",
            "rainfall_mm",
            "temperature_c",
            "ndvi",
            "population",
            "beta_spatial",
        ]
    ].copy()
    out["synthetic_incidence"] = incidence
    out["synthetic_cases"] = cases
    out["model_log_incidence"] = log_inc_hat
    out["adjusted_log_incidence"] = log_inc_adj
    out["is_gap_district"] = False
    out["species"] = species
    out["synthetic_cases_uncalibrated"] = cases
    out["synthetic_incidence_uncalibrated"] = incidence
    return out.sort_values(["adm3_pcode", "week_start"]).reset_index(drop=True)


def calibrate_partial(
    raw_2026: pd.DataFrame,
    calibrated_hist_path: Path,
    *,
    species: str,
) -> pd.DataFrame:
    """Scale Jan–Jul 2026 to Jan–Jul 2025 calibrated × CONT_2025_TO_2026."""
    hist = pd.read_csv(calibrated_hist_path)
    hist["week_start"] = pd.to_datetime(hist["week_start"])
    h1_2025 = hist[
        (hist["week_start"] >= "2025-01-01") & (hist["week_start"] <= "2025-07-31")
    ]
    target = float(h1_2025["synthetic_cases"].sum()) * CONT_2025_TO_2026
    cur = float(raw_2026["synthetic_cases"].sum())
    if cur <= 0:
        raise SystemExit(f"No raw {species} cases for 2026 H1")
    scale = target / cur
    out = raw_2026.copy()
    out["resurgence_scale"] = scale
    out["synthetic_cases"] = out["synthetic_cases_uncalibrated"] * scale
    out["synthetic_incidence"] = np.where(
        out["population"] > 0,
        out["synthetic_cases"] / out["population"],
        0.0,
    )
    print(
        f"{species.upper()} 2026 H1: raw={cur:,.0f} target={target:,.0f} "
        f"scale={scale:.4f} (vs 2025 H1×{CONT_2025_TO_2026})"
    )
    return out


def append_synthetic(species: str, new_rows: pd.DataFrame) -> Path:
    path = (
        OUT / "synthetic_malaria_2020_2025_cod_ab_v04.csv"
        if species == "pf"
        else OUT / "synthetic_malaria_2020_2025_cod_ab_v04_pv.csv"
    )
    # Rename files conceptually to through-2026 but keep path for compatibility;
    # also write dated extended copy.
    old = pd.read_csv(path)
    old["week_start"] = pd.to_datetime(old["week_start"])
    old = old[old["week_start"] < "2026-01-01"]
    cols = [
        c
        for c in [
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
            "species",
        ]
        if c in new_rows.columns or c in old.columns
    ]
    for c in cols:
        if c not in old.columns:
            old[c] = np.nan if c != "species" else species
        if c not in new_rows.columns:
            new_rows[c] = np.nan if c != "species" else species
    merged = pd.concat([old[cols], new_rows[cols]], ignore_index=True)
    merged = merged.sort_values(["adm3_pcode", "week_start"])
    merged.to_csv(path, index=False, float_format="%.8f")

    ext_path = (
        OUT / "synthetic_malaria_2020_2026jul_cod_ab_v04.csv"
        if species == "pf"
        else OUT / "synthetic_malaria_2020_2026jul_cod_ab_v04_pv.csv"
    )
    merged.to_csv(ext_path, index=False, float_format="%.8f")
    print(f"Wrote {path.name} and {ext_path.name} through {merged['week_start'].max().date()}")
    return path


def write_epi_extracts() -> None:
    pf = pd.read_csv(OUT / "synthetic_malaria_2020_2025_cod_ab_v04.csv")
    pv = pd.read_csv(OUT / "synthetic_malaria_2020_2025_cod_ab_v04_pv.csv")
    pf["week_start"] = pd.to_datetime(pf["week_start"])
    pv["week_start"] = pd.to_datetime(pv["week_start"])

    def to_epi(df: pd.DataFrame, case_col: str, other: str) -> pd.DataFrame:
        e = df.rename(
            columns={
                "week_start": "obs_date",
                "adm3_name": "woreda_name",
                "population": "pop_at_risk",
                "synthetic_cases": case_col,
            }
        )[["obs_date", "woreda_name", "pop_at_risk", case_col]].copy()
        e[other] = 0.0
        return e[["obs_date", "woreda_name", "pop_at_risk", "test_pf_tot", "test_pv_only"]]

    epi_pf = to_epi(pf, "test_pf_tot", "test_pv_only")
    epi_pv = to_epi(pv, "test_pv_only", "test_pf_tot")
    epi_pf.to_csv(
        OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pf.csv",
        index=False,
        float_format="%.6f",
    )
    epi_pv.to_csv(
        OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pv.csv",
        index=False,
        float_format="%.6f",
    )

    merged = epi_pf.drop(columns=["test_pv_only"]).merge(
        epi_pv[["obs_date", "woreda_name", "test_pv_only"]],
        on=["obs_date", "woreda_name"],
        how="outer",
    )
    merged["test_pf_tot"] = merged["test_pf_tot"].fillna(0.0)
    merged["test_pv_only"] = merged["test_pv_only"].fillna(0.0)
    merged = merged.sort_values(["woreda_name", "obs_date"])
    out = OUT / "epi_data_synthetic_2020_2025_cod_ab_v04.csv"
    merged.to_csv(out, index=False, float_format="%.6f")
    # also dated alias
    merged.to_csv(
        OUT / "epi_data_synthetic_2020_2026jul_cod_ab_v04.csv",
        index=False,
        float_format="%.6f",
    )
    print(
        f"Combined epi through {pd.to_datetime(merged['obs_date']).max().date()} "
        f"({len(merged):,} rows)"
    )


def update_backend(drivers_2026: pd.DataFrame, epi_future: pd.DataFrame) -> None:
    # --- epi ---
    epi_path = BACKEND_DATA / "epi_data.csv"
    epi = pd.read_csv(epi_path)
    epi["obs_date"] = pd.to_datetime(epi["obs_date"])
    epi = epi[epi["obs_date"] < "2026-01-01"]
    fut = epi_future.copy()
    fut["obs_date"] = pd.to_datetime(fut["obs_date"])
    # Bui stub from Butajira if needed
    if "Bui town" not in set(fut["woreda_name"]) and "Butajira town" in set(fut["woreda_name"]):
        proxy = fut[fut["woreda_name"] == "Butajira town"].copy()
        proxy["woreda_name"] = "Bui town"
        proxy["test_pf_tot"] = 0.0
        proxy["test_pv_only"] = 0.0
        fut = pd.concat([fut, proxy], ignore_index=True)
    epi2 = pd.concat([epi, fut], ignore_index=True).sort_values(
        ["woreda_name", "obs_date"]
    )
    epi2["obs_date"] = epi2["obs_date"].dt.strftime("%Y-%m-%d")
    epi2.to_csv(epi_path, index=False, float_format="%.6f")
    print(f"Updated {epi_path.name}: {epi2['obs_date'].min()} -> {epi2['obs_date'].max()}")

    # --- env ---
    env_path = BACKEND_DATA / "env_data.csv"
    env = pd.read_csv(env_path)
    env["obs_date"] = pd.to_datetime(env["obs_date"])
    env = env[env["obs_date"] < "2026-01-01"]

    long_parts = []
    for code, src in [
        ("totprec", "rainfall_mm"),
        ("lst_mean", "temperature_c"),
        ("ndvi", "ndvi"),
    ]:
        part = drivers_2026[["week_start", "adm3_name", src]].rename(
            columns={"week_start": "obs_date", "adm3_name": "woreda_name", src: "obs_value"}
        )
        part["environ_var_code"] = code
        long_parts.append(part)
    env_new = pd.concat(long_parts, ignore_index=True)
    # Bui from Butajira
    if "Bui town" not in set(env_new["woreda_name"]) and "Butajira town" in set(
        env_new["woreda_name"]
    ):
        proxy = env_new[env_new["woreda_name"] == "Butajira town"].copy()
        proxy["woreda_name"] = "Bui town"
        env_new = pd.concat([env_new, proxy], ignore_index=True)

    env2 = pd.concat(
        [env[["obs_date", "woreda_name", "environ_var_code", "obs_value"]], env_new],
        ignore_index=True,
    ).sort_values(["woreda_name", "obs_date", "environ_var_code"])
    env2["obs_date"] = pd.to_datetime(env2["obs_date"]).dt.strftime("%Y-%m-%d")
    env2.to_csv(env_path, index=False, float_format="%.8f")
    print(f"Updated {env_path.name}: through {env2['obs_date'].max()}")


def main() -> None:
    print("Loading 2020-2025 predict drivers for climatology...")
    hist = pd.read_csv(OUT / "predict_drivers_2020_2025_draft.csv")
    drivers_2026 = build_2026_drivers(hist)
    drivers_out = OUT / "predict_drivers_2026_jan_jul_draft.csv"
    drivers_2026.to_csv(drivers_out, index=False, float_format="%.8f")
    print(f"Wrote {drivers_out.name} ({len(drivers_2026):,} rows)")

    # Also save extended drivers panel for QC
    hist["week_start"] = pd.to_datetime(hist["week_start"])
    ext_drivers = pd.concat(
        [
            hist[
                [
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
            ],
            drivers_2026,
        ],
        ignore_index=True,
    )
    ext_drivers.to_csv(
        OUT / "predict_drivers_2020_2026jul_draft.csv", index=False, float_format="%.8f"
    )

    results = {}
    for species in ["pf", "pv"]:
        print(f"\n=== Predict {species.upper()} Jan–Jul 2026 ===")
        raw = predict_species(species, hist, drivers_2026)
        hist_path = (
            OUT / "synthetic_malaria_2020_2025_cod_ab_v04.csv"
            if species == "pf"
            else OUT / "synthetic_malaria_2020_2025_cod_ab_v04_pv.csv"
        )
        cal = calibrate_partial(raw, hist_path, species=species)
        append_synthetic(species, cal)
        results[species] = {
            "rows": int(len(cal)),
            "pcodes": int(cal["adm3_pcode"].nunique()),
            "cases_sum": float(cal["synthetic_cases"].sum()),
            "scale": float(cal["resurgence_scale"].iloc[0]),
            "date_min": str(cal["week_start"].min().date()),
            "date_max": str(cal["week_start"].max().date()),
        }

    write_epi_extracts()
    epi_comb = pd.read_csv(OUT / "epi_data_synthetic_2020_2025_cod_ab_v04.csv")
    epi_2026 = epi_comb[pd.to_datetime(epi_comb["obs_date"]) >= "2026-01-01"].copy()
    update_backend(drivers_2026, epi_2026)

    summary = {
        "method": {
            "env": "woreda x week_of_year mean over 2020-2025",
            "population": "2025 pop x woreda 2024->2025 growth (clipped 0.98-1.08)",
            "calibration": f"Jan-Jul 2026 national = Jan-Jul 2025 calibrated x {CONT_2025_TO_2026}",
            "end_date": str(END_2026.date()),
        },
        "species": results,
    }
    qc = OUT / "extend_synthetic_2026jul_qc.json"
    qc.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nQC -> {qc}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
