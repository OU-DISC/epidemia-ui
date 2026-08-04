"""
XGBoost + SHAP synthetic malaria generation for COD-AB v04 (1,148 woredas).

Train: 2014-2019 draft panel (exclude all-zero gap-only districts from fitting)
Predict: 2020-2025 drivers -> synthetic incidence/cases + beta_spatial

Species:
  --species pf  (default) uses cases_pf / incidence_pf
  --species pv              uses cases_pv / incidence_pv

Uses project venv: .venv-synthetic
"""
from __future__ import annotations

import argparse
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OrdinalEncoder

warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "synthetic_v2" / "outputs"
MODEL_DIR = ROOT / "data" / "synthetic_v2" / "models"
TRAIN_PATH = OUT / "train_panel_2014_2019_draft.csv"
PREDICT_PATH = OUT / "predict_drivers_2020_2025_draft.csv"
GAP_LIST = OUT / "gap_woredas_cod_ab_v04.csv"

EPS = 1e-6
LAGS = 4
RANDOM_STATE = 42
SHAP_SAMPLE = 40000


def add_calendar(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["week_start"] = pd.to_datetime(out["week_start"])
    out["month"] = out["week_start"].dt.month.astype(int)
    if "week_of_year" not in out.columns:
        out["week_of_year"] = out["week_start"].dt.isocalendar().week.astype(int)
    return out


def add_lags(df: pd.DataFrame, cols: list[str], lags: int = LAGS) -> pd.DataFrame:
    out = df.sort_values(["adm3_pcode", "week_start"]).copy()
    for col in cols:
        for lag in range(1, lags + 1):
            out[f"{col}_lag{lag}"] = out.groupby("adm3_pcode")[col].shift(lag)
    return out


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


def prepare_frame(df: pd.DataFrame, *, species: str, with_target: bool) -> pd.DataFrame:
    out = add_calendar(df)
    for col in ["rainfall_mm", "temperature_c", "ndvi", "population"]:
        out[col] = pd.to_numeric(out[col], errors="coerce")
    if with_target:
        case_col = "cases_pf" if species == "pf" else "cases_pv"
        if case_col in out.columns:
            out["cases"] = pd.to_numeric(out[case_col], errors="coerce").fillna(0.0)
        else:
            # Legacy panels: `cases` was Pf-only
            out["cases"] = pd.to_numeric(out.get("cases", 0.0), errors="coerce").fillna(0.0)
            if species == "pv":
                raise SystemExit(
                    "Train panel has no cases_pv column; rebuild train_panel first."
                )
        out["incidence"] = np.where(
            out["population"] > 0,
            out["cases"] / out["population"],
            0.0,
        )
        out["log_incidence"] = np.log(out["incidence"] + EPS)
    out["log_population"] = np.log(out["population"].clip(lower=1.0))
    out = add_lags(out, ["rainfall_mm", "temperature_c", "ndvi"], LAGS)
    return out


def output_paths(species: str) -> dict[str, Path]:
    """Species-specific paths. Pf keeps original filenames for compatibility."""
    if species == "pf":
        return {
            "synth": OUT / "synthetic_malaria_2020_2025_cod_ab_v04.csv",
            "beta": OUT / "beta_spatial_by_pcode.csv",
            "epi": OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pf.csv",
            "model": MODEL_DIR / "xgb_synthetic_cod_ab_v04.json",
            "encoder": MODEL_DIR / "pcode_encoder_categories.json",
            "qc": OUT / "synthetic_generation_qc_summary.json",
        }
    return {
        "synth": OUT / "synthetic_malaria_2020_2025_cod_ab_v04_pv.csv",
        "beta": OUT / "beta_spatial_by_pcode_pv.csv",
        "epi": OUT / "epi_data_synthetic_2020_2025_cod_ab_v04_pv.csv",
        "model": MODEL_DIR / "xgb_synthetic_cod_ab_v04_pv.json",
        "encoder": MODEL_DIR / "pcode_encoder_categories_pv.json",
        "qc": OUT / "synthetic_generation_qc_summary_pv.json",
    }


def run_species(species: str) -> None:
    import shap
    import xgboost as xgb

    paths = output_paths(species)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    print(f"=== Species: {species.upper()} ===")
    print("Loading panels...")
    train_raw = pd.read_csv(TRAIN_PATH)
    predict_raw = pd.read_csv(PREDICT_PATH)
    gap_pcodes = set()
    if GAP_LIST.exists():
        gap_pcodes = set(pd.read_csv(GAP_LIST, dtype=str)["adm3_pcode"].astype(str))

    train = prepare_frame(train_raw, species=species, with_target=True)
    predict = prepare_frame(predict_raw, species=species, with_target=False)

    feat_cols = feature_columns()
    train_fit = train.copy()
    if gap_pcodes:
        train_fit = train_fit[~train_fit["adm3_pcode"].astype(str).isin(gap_pcodes)].copy()

    needed = ["rainfall_mm", "temperature_c", "ndvi", "population", "log_incidence"] + [
        f"{b}_lag{i}" for b in ["rainfall_mm", "temperature_c", "ndvi"] for i in range(1, LAGS + 1)
    ]
    train_fit = train_fit.dropna(subset=needed)
    train_fit = train_fit[train_fit["population"] > 0].copy()
    print(
        f"Train rows after filters: {len(train_fit):,} across "
        f"{train_fit['adm3_pcode'].nunique()} pcodes"
    )

    encoder = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)
    train_fit["pcode_id"] = encoder.fit_transform(train_fit[["adm3_pcode"]])

    X = train_fit[feat_cols].to_numpy(dtype=np.float32)
    y = train_fit["log_incidence"].to_numpy(dtype=np.float32)

    X_tr, X_va, y_tr, y_va = train_test_split(
        X, y, test_size=0.15, random_state=RANDOM_STATE
    )

    model = xgb.XGBRegressor(
        n_estimators=350,
        max_depth=8,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        reg_lambda=1.0,
        objective="reg:squarederror",
        random_state=RANDOM_STATE,
        n_jobs=4,
        tree_method="hist",
    )
    print("Training XGBoost...")
    model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], verbose=False)

    va_pred = model.predict(X_va)
    y_va_inc = np.clip(np.exp(y_va) - EPS, 0, None)
    p_va_inc = np.clip(np.exp(va_pred) - EPS, 0, None)
    metrics = {
        "val_mae_log_incidence": float(mean_absolute_error(y_va, va_pred)),
        "val_r2_log_incidence": float(r2_score(y_va, va_pred)),
        "val_mae_incidence": float(mean_absolute_error(y_va_inc, p_va_inc)),
        "val_r2_incidence": float(r2_score(y_va_inc, p_va_inc)),
    }
    print("Validation:", metrics)

    print("Computing SHAP spatial effects...")
    rng = np.random.default_rng(RANDOM_STATE)
    if len(train_fit) > SHAP_SAMPLE:
        sample_idx = rng.choice(len(train_fit), size=SHAP_SAMPLE, replace=False)
        shap_X = X[sample_idx]
        shap_pcodes = train_fit.iloc[sample_idx]["adm3_pcode"].to_numpy()
    else:
        shap_X = X
        shap_pcodes = train_fit["adm3_pcode"].to_numpy()

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(shap_X)
    pcode_feature_idx = feat_cols.index("pcode_id")
    pcode_shap = shap_values[:, pcode_feature_idx]
    beta_df = (
        pd.DataFrame({"adm3_pcode": shap_pcodes, "beta_spatial": pcode_shap})
        .groupby("adm3_pcode", as_index=False)["beta_spatial"]
        .mean()
    )
    global_beta = float(beta_df["beta_spatial"].mean()) if len(beta_df) else 0.0

    region_map = (
        train_fit[["adm3_pcode", "adm1_name"]]
        .drop_duplicates()
        .merge(beta_df, on="adm3_pcode", how="left")
    )
    region_beta = region_map.groupby("adm1_name")["beta_spatial"].mean().to_dict()

    print("Predicting 2020-2025...")
    predict = predict.dropna(
        subset=["rainfall_mm", "temperature_c", "ndvi", "population"]
        + [f"{b}_lag{i}" for b in ["rainfall_mm", "temperature_c", "ndvi"] for i in range(1, LAGS + 1)]
    ).copy()
    predict = predict[predict["population"] > 0].copy()
    predict["pcode_id"] = encoder.transform(predict[["adm3_pcode"]])

    Xp = predict[feat_cols].to_numpy(dtype=np.float32)
    log_inc_hat = model.predict(Xp)

    predict = predict.merge(beta_df, on="adm3_pcode", how="left")
    predict["beta_spatial"] = predict["beta_spatial"].astype(float)
    region_series = predict["adm1_name"].map(region_beta)
    predict["beta_spatial"] = predict["beta_spatial"].fillna(region_series).fillna(global_beta)
    unknown = predict["pcode_id"].to_numpy().ravel() < 0
    adjust = np.zeros(len(predict), dtype=np.float32)
    adjust[unknown] = (
        predict.loc[unknown, "beta_spatial"].to_numpy(dtype=np.float32) - np.float32(global_beta)
    )
    log_inc_adj = log_inc_hat + adjust
    incidence = np.clip(np.exp(log_inc_adj) - EPS, 0, None)
    cases = incidence * predict["population"].to_numpy(dtype=np.float64)

    synth = predict[
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
    synth["synthetic_incidence"] = incidence
    synth["synthetic_cases"] = cases
    synth["model_log_incidence"] = log_inc_hat
    synth["adjusted_log_incidence"] = log_inc_adj
    synth["is_gap_district"] = synth["adm3_pcode"].astype(str).isin(gap_pcodes)
    synth["species"] = species

    synth.sort_values(["adm3_pcode", "week_start"]).to_csv(
        paths["synth"], index=False, float_format="%.8f"
    )
    print(f"Wrote {paths['synth']} ({len(synth):,} rows)")

    all_beta = synth.groupby("adm3_pcode", as_index=False).agg(
        adm3_name=("adm3_name", "first"),
        adm1_name=("adm1_name", "first"),
        beta_spatial=("beta_spatial", "first"),
        is_gap_district=("is_gap_district", "first"),
    )
    all_beta.to_csv(paths["beta"], index=False, float_format="%.8f")
    print(f"Wrote {paths['beta']}")

    model.save_model(paths["model"])
    cats = [str(x) for x in encoder.categories_[0].tolist()]
    paths["encoder"].write_text(json.dumps({"categories": cats}, indent=2), encoding="utf-8")

    case_col = "test_pf_tot" if species == "pf" else "test_pv_only"
    other_col = "test_pv_only" if species == "pf" else "test_pf_tot"
    epi_dash = synth.rename(
        columns={
            "week_start": "obs_date",
            "adm3_name": "woreda_name",
            "population": "pop_at_risk",
            "synthetic_cases": case_col,
        }
    )[["obs_date", "woreda_name", "pop_at_risk", case_col]].copy()
    epi_dash[other_col] = 0.0
    epi_dash = epi_dash[
        ["obs_date", "woreda_name", "pop_at_risk", "test_pf_tot", "test_pv_only"]
    ]
    epi_dash.to_csv(paths["epi"], index=False, float_format="%.6f")
    print(f"Wrote {paths['epi']}")

    summary = {
        "species": species,
        "case_source_column": "cases_pf" if species == "pf" else "cases_pv",
        "train_rows": int(len(train_fit)),
        "train_pcodes": int(train_fit["adm3_pcode"].nunique()),
        "predict_rows": int(len(synth)),
        "predict_pcodes": int(synth["adm3_pcode"].nunique()),
        "gap_pcodes_in_predict": int(
            synth.loc[synth["is_gap_district"], "adm3_pcode"].nunique()
        ),
        "metrics": metrics,
        "global_beta_spatial": global_beta,
        "feature_columns": feat_cols,
        "lags": LAGS,
        "eps": EPS,
        "shap_sample_rows": int(len(shap_X)),
        "outputs": [p.name for p in paths.values()],
        "notes": [
            "Target = log(incidence + eps); cases = incidence * population",
            "Gap districts excluded from training; predicted using env/pop + region/global beta adjustment",
        ],
    }
    paths["qc"].write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {paths['qc']}")
    print(json.dumps(summary, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic malaria (XGBoost+SHAP)")
    parser.add_argument(
        "--species",
        choices=["pf", "pv", "both"],
        default="both",
        help="Which species to generate (default: both)",
    )
    args = parser.parse_args()
    species_list = ["pf", "pv"] if args.species == "both" else [args.species]
    for sp in species_list:
        run_species(sp)


if __name__ == "__main__":
    main()
