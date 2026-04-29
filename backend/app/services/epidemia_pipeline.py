from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from statsmodels.tsa.ar_model import AutoReg

from app.schemas.epidemia import (
    DistrictAlert,
    DistrictForecast,
    DistrictForecastPoint,
    DistrictObservedPoint,
    EpidemiaRunRequest,
    EpidemiaRunResponse,
)
from app.services.farrington_thresholds import farrington_thresholds_for_horizon


@dataclass
class SpeciesConfig:
    species: str
    case_column: str


SPECIES_CONFIGS = (
    SpeciesConfig(species="pfm", case_column="test_pf_tot"),
    SpeciesConfig(species="pv", case_column="test_pv_only"),
)


REQUIRED_EPI_COLUMNS = {
    "obs_date",
    "woreda_name",
    "pop_at_risk",
    "test_pf_tot",
    "test_pv_only",
}

REQUIRED_ENV_COLUMNS = {
    "obs_date",
    "woreda_name",
    "environ_var_code",
    "obs_value",
}


class PipelineInputError(ValueError):
    pass


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _has_required_base_files(data_dir: Path) -> bool:
    required = [
        data_dir / "amhara_woredas.csv",
        data_dir / "env_ref_data_2002_2018.csv",
        data_dir / "environ_info.xlsx",
    ]
    return all(path.exists() for path in required)


def _has_env_source(data_dir: Path) -> bool:
    return (data_dir / "env_data.csv").exists() or (data_dir / "data_environmental").exists()


def _has_epi_source(data_dir: Path) -> bool:
    return (data_dir / "epi_data.csv").exists() or (data_dir / "data_epidemiological").exists()


def _candidate_data_dirs(path_str: str) -> List[Path]:
    candidates: List[Path] = []

    preferred = _resolve_runtime_path(path_str, must_exist=False)
    candidates.append(preferred)

    override = os.getenv("EPIDEMIA_DATA_DIR", "").strip()
    if override:
        candidates.append(_resolve_runtime_path(override, must_exist=False))

    candidates.extend(
        [
            BACKEND_ROOT / "data",
            BACKEND_ROOT.parent / "data",
            Path.cwd() / "data",
            Path("/app/backend/data"),
            Path("/app/data"),
        ]
    )

    unique: List[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(resolved)
    return unique


def _resolve_data_dir(path_str: str) -> Path:
    candidates = _candidate_data_dirs(path_str)

    for candidate in candidates:
        if not candidate.exists():
            continue
        if _has_required_base_files(candidate) and _has_env_source(candidate) and _has_epi_source(candidate):
            return candidate

    preferred = _resolve_runtime_path(path_str, must_exist=True)
    if _has_required_base_files(preferred):
        # Keep compatibility with existing workflows and preserve downstream, specific errors.
        return preferred

    checked = ", ".join(str(path) for path in candidates)
    raise PipelineInputError(
        "Could not locate a complete data directory. Checked: " + checked
    )


def _year_week_to_sunday(year: int, week: int) -> date:
    # ISO week day: Monday=1 ... Sunday=7.
    return date.fromisocalendar(year, week, 7)


def _resolve_runtime_path(path_str: str, must_exist: bool = False) -> Path:
    path = Path(path_str)
    if path.is_absolute():
        return path

    # Prefer caller-provided relative path when it exists from current cwd.
    cwd_candidate = (Path.cwd() / path).resolve()
    if not must_exist or cwd_candidate.exists():
        return cwd_candidate

    # Fallback to backend root so API works no matter where uvicorn was started.
    backend_candidate = (BACKEND_ROOT / path).resolve()
    return backend_candidate


def _validate_columns(df: pd.DataFrame, required: set[str], label: str) -> None:
    missing = sorted(required.difference(df.columns))
    if missing:
        raise PipelineInputError(f"{label} is missing required columns: {', '.join(missing)}")


def _ensure_datetime(df: pd.DataFrame, col: str) -> pd.DataFrame:
    df = df.copy()
    df[col] = pd.to_datetime(df[col], errors="coerce")
    if df[col].isna().any():
        raise PipelineInputError(f"Column '{col}' contains invalid dates")
    return df


def _empty_like_env() -> pd.DataFrame:
    return pd.DataFrame(columns=["WID", "woreda_name", "environ_var_code", "obs_date", "obs_value"])


def _read_nonempty_csvs(folder: Path) -> List[Path]:
    csv_files = sorted(folder.glob("*.csv"))
    valid_files: List[Path] = []
    for file_path in csv_files:
        try:
            header = pd.read_csv(file_path, nrows=0)
            if len(header.columns) > 1:
                valid_files.append(file_path)
        except Exception:
            continue
    return valid_files


def _corral_environment(report_woredas: pd.DataFrame, data_dir: Path) -> pd.DataFrame:
    env_dir = data_dir / "data_environmental"
    if not env_dir.exists():
        raise PipelineInputError(f"Missing environmental folder: {env_dir}")

    csv_files = _read_nonempty_csvs(env_dir)
    if not csv_files:
        raise PipelineInputError(f"No usable environmental CSV files found in {env_dir}")

    env_parts: List[pd.DataFrame] = []
    for file_path in csv_files:
        df = pd.read_csv(file_path)
        if "woreda" in df.columns:
            df = df.drop(columns=["woreda"])

        required = {"wid", "doy", "year"}
        missing = required.difference(df.columns)
        if missing:
            raise PipelineInputError(
                f"{file_path.name} missing required environmental columns: {', '.join(sorted(missing))}"
            )

        value_cols = [c for c in df.columns if c not in {"wid", "doy", "year"}]
        long_df = df.melt(
            id_vars=["wid", "doy", "year"],
            value_vars=value_cols,
            var_name="environ_var_code",
            value_name="obs_value",
        )

        long_df["year"] = pd.to_numeric(long_df["year"], errors="coerce")
        long_df["doy"] = pd.to_numeric(long_df["doy"], errors="coerce")
        if long_df[["year", "doy"]].isna().any().any():
            raise PipelineInputError(f"Invalid year/doy values in {file_path.name}")

        long_df["year"] = long_df["year"].astype(int)
        long_df["doy"] = long_df["doy"].astype(int)
        long_df["obs_date"] = pd.to_datetime(
            long_df["year"].astype(str) + long_df["doy"].astype(str).str.zfill(3),
            format="%Y%j",
            errors="coerce",
        )
        if long_df["obs_date"].isna().any():
            raise PipelineInputError(f"Could not parse obs_date from year/doy in {file_path.name}")

        long_df["data_time"] = pd.Timestamp(file_path.stat().st_mtime, unit="s")
        long_df = long_df.rename(columns={"wid": "WID"})
        env_parts.append(long_df[["WID", "environ_var_code", "obs_date", "obs_value", "data_time"]])

    env_data = pd.concat(env_parts, ignore_index=True) if env_parts else _empty_like_env()
    env_data["WID"] = pd.to_numeric(env_data["WID"], errors="coerce")

    report_wids = pd.to_numeric(report_woredas["WID"], errors="coerce").dropna().astype(int)
    env_data = env_data[env_data["WID"].isin(report_wids)]

    env_data = (
        env_data.sort_values("data_time", ascending=False)
        .drop_duplicates(subset=["WID", "environ_var_code", "obs_date"], keep="first")
        .drop(columns=["data_time"])
    )

    missing_rows: List[Dict[str, object]] = []
    for var_name, var_df in env_data.groupby("environ_var_code"):
        min_dt = pd.Timestamp(var_df["obs_date"].min())
        max_dt = pd.Timestamp(var_df["obs_date"].max())
        full_dates = pd.date_range(min_dt, max_dt, freq="D")
        present = pd.to_datetime(var_df["obs_date"].unique())
        missing = sorted(set(full_dates.date).difference(set(pd.DatetimeIndex(present).date)))
        for miss_dt in missing:
            missing_rows.append({"environ_var_code": var_name, "missing": miss_dt})

    if missing_rows:
        pd.DataFrame(missing_rows).to_csv("log_missing_environ.csv", index=False)
        raise PipelineInputError(
            "Some dates in environmental data are missing. Check 'log_missing_environ.csv'."
        )

    env_data = env_data.merge(
        report_woredas[["WID", "woreda_name"]],
        on="WID",
        how="left",
    )

    return env_data[["WID", "woreda_name", "environ_var_code", "obs_date", "obs_value"]]


def _iso_sunday_series(year_series: pd.Series, week_series: pd.Series) -> pd.Series:
    out: List[pd.Timestamp] = []
    for year, week in zip(year_series.astype(int), week_series.astype(int)):
        out.append(pd.Timestamp(_year_week_to_sunday(year, week)))
    return pd.Series(out)


def _corral_epidemiological(report_woredas: pd.DataFrame, data_dir: Path) -> pd.DataFrame:
    epi_dir = data_dir / "data_epidemiological"
    if not epi_dir.exists():
        raise PipelineInputError(f"Missing epidemiological folder: {epi_dir}")

    report_woreda_names = set(report_woredas["woreda_name"].astype(str))

    spell_path = data_dir / "woreda_spellings.xlsx"
    split_path = data_dir / "woredas_split.xlsx"
    pop_path = data_dir / "population_weekly_2012-2030.csv"
    past_epi_path = epi_dir / "epi_data_20120712_20170708.xlsx"

    spell = pd.read_excel(spell_path) if spell_path.exists() else pd.DataFrame()
    split = pd.read_excel(split_path) if split_path.exists() else pd.DataFrame()

    pop = pd.DataFrame()
    if pop_path.exists():
        pop = pd.read_csv(pop_path)
        required_pop_cols = {"woreda_name", "year", "week_of_year", "pop_at_risk"}
        if required_pop_cols.issubset(pop.columns):
            pop["obs_date"] = _iso_sunday_series(pop["year"], pop["week_of_year"])
        else:
            pop = pd.DataFrame()

    parts: List[pd.DataFrame] = []
    if past_epi_path.exists():
        past = pd.read_excel(past_epi_path)
        drop_cols = [c for c in ["WID", "tot_case", "mal_case"] if c in past.columns]
        if drop_cols:
            past = past.drop(columns=drop_cols)
        if "obs_date" in past.columns:
            past["obs_date"] = pd.to_datetime(past["obs_date"], errors="coerce")
            past["data_time"] = pd.Timestamp("2001-01-01")
            parts.append(past)

    raw_files = []
    for f in sorted(epi_dir.glob("*.xlsx")):
        name = f.name
        if name.startswith("~$"):
            continue
        if name == "epi_data_20120712_20170708.xlsx":
            continue
        raw_files.append(f)

    if not raw_files and not parts:
        raise PipelineInputError(f"No epidemiological Excel files found in {epi_dir}")

    for file_path in raw_files:
        this_data = pd.read_excel(file_path)
        if this_data.empty:
            continue

        required_cols = {
            "Woreda/Hospital",
            "Budget Year",
            "Epi- Week",
            "Blood film P. falciparum",
            "RDT P. falciparum",
            "Blood film P. vivax",
            "RDT P. vivax",
        }
        missing = required_cols.difference(this_data.columns)
        if missing:
            raise PipelineInputError(
                f"{file_path.name} missing epidemiological columns: {', '.join(sorted(missing))}"
            )

        df = pd.DataFrame()
        df["woreda_name"] = this_data["Woreda/Hospital"].astype(str)
        epi_week = pd.to_numeric(this_data["Epi- Week"], errors="coerce")
        budget_year = pd.to_numeric(this_data["Budget Year"], errors="coerce")
        years_to_add = np.where(epi_week >= 28, 7, 8)
        greg_year = budget_year + years_to_add
        if pd.Series(greg_year).isna().any() or epi_week.isna().any():
            raise PipelineInputError(f"Invalid Budget Year / Epi- Week values in {file_path.name}")

        df["obs_date"] = _iso_sunday_series(pd.Series(greg_year), epi_week)
        df["test_pf_tot"] = pd.to_numeric(this_data["Blood film P. falciparum"], errors="coerce") + pd.to_numeric(
            this_data["RDT P. falciparum"], errors="coerce"
        )
        df["test_pv_only"] = pd.to_numeric(this_data["Blood film P. vivax"], errors="coerce") + pd.to_numeric(
            this_data["RDT P. vivax"], errors="coerce"
        )
        df["data_time"] = pd.Timestamp(file_path.stat().st_mtime, unit="s")
        parts.append(df)

    epi_data = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()
    if epi_data.empty:
        raise PipelineInputError("Epidemiological data could not be assembled from input files")

    if not spell.empty and {"to_replace", "woreda_name"}.issubset(spell.columns):
        spell_map = dict(zip(spell["to_replace"].astype(str), spell["woreda_name"].astype(str)))
        epi_data["woreda_name"] = epi_data["woreda_name"].replace(spell_map)

    epi_data = (
        epi_data.sort_values("data_time", ascending=False)
        .drop_duplicates(subset=["woreda_name", "obs_date"], keep="first")
        .drop(columns=["data_time"])
    )

    split_names: set[str] = set()
    if not split.empty and {"woreda_name", "split_1", "split_2"}.issubset(split.columns):
        split_names = set(split["split_1"].astype(str)).union(set(split["split_2"].astype(str)))
        split_map: Dict[str, str] = {}
        for _, row in split.iterrows():
            split_map[str(row["split_1"])] = str(row["woreda_name"])
            split_map[str(row["split_2"])] = str(row["woreda_name"])

        epi_data["woreda_master"] = epi_data["woreda_name"].replace(split_map)
        entries = (
            epi_data.groupby(["woreda_master", "obs_date"], as_index=False)
            .size()
            .rename(columns={"size": "entries"})
        )
        epi_data = epi_data.merge(entries, on=["woreda_master", "obs_date"], how="left")
        epi_data = epi_data[~((epi_data["entries"] == 3) & (epi_data["woreda_name"] == epi_data["woreda_master"]))]

        # Preserve NA behavior like R summarize(sum(...)) without na.rm.
        epi_data = (
            epi_data.rename(columns={"woreda_name": "woreda_prev", "woreda_master": "woreda_name"})
            .groupby(["woreda_name", "obs_date"], as_index=False)
            .agg(
                test_pf_tot=("test_pf_tot", lambda s: s.sum(min_count=len(s))),
                test_pv_only=("test_pv_only", lambda s: s.sum(min_count=len(s))),
            )
        )

    # Missing-week check for report and split-important woredas.
    important = set(report_woreda_names).union(split_names)
    miss_rows: List[Dict[str, object]] = []
    for w_name, grp in epi_data.groupby("woreda_name"):
        if w_name not in important:
            continue
        min_dt = pd.Timestamp(grp["obs_date"].min())
        max_dt = pd.Timestamp(grp["obs_date"].max())
        full_dates = pd.date_range(min_dt, max_dt, freq="W-SUN")
        present = pd.to_datetime(grp["obs_date"].unique())
        missing = sorted(set(full_dates.date).difference(set(pd.DatetimeIndex(present).date)))
        for miss_dt in missing:
            miss_rows.append({"woreda_name": w_name, "missing": miss_dt})
    if miss_rows:
        pd.DataFrame(miss_rows).to_csv("log_missing_report_epidemiology.csv", index=False)

    if not pop.empty:
        join_cols = ["woreda_name", "obs_date", "pop_at_risk"]
        extra = [c for c in ["WID"] if c in pop.columns]
        epi_data = epi_data.merge(pop[join_cols + extra], on=["woreda_name", "obs_date"], how="left")
    else:
        epi_data["pop_at_risk"] = np.nan

    if "WID" not in epi_data.columns:
        epi_data = epi_data.merge(report_woredas[["WID", "woreda_name"]], on="woreda_name", how="left")

    epi_data = epi_data[epi_data["woreda_name"].isin(report_woreda_names)]
    front_cols = ["WID", "woreda_name"]
    rest_cols = [c for c in epi_data.columns if c not in front_cols]
    epi_data = epi_data[front_cols + rest_cols]

    return epi_data


def _load_inputs(req: EpidemiaRunRequest) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    data_dir = _resolve_data_dir(req.data_dir)

    woredas_path = data_dir / "amhara_woredas.csv"
    epi_path = data_dir / "epi_data.csv"
    env_path = data_dir / "env_data.csv"
    env_ref_path = data_dir / "env_ref_data_2002_2018.csv"
    env_info_path = data_dir / "environ_info.xlsx"

    missing = [str(path) for path in (woredas_path, env_ref_path, env_info_path) if not path.exists()]
    if missing:
        raise PipelineInputError(
            "Missing input files. Expected: " + ", ".join(missing)
        )

    report_woredas = pd.read_csv(woredas_path)
    if "report" in report_woredas.columns:
        report_woredas = report_woredas[report_woredas["report"] == 1]

    if epi_path.exists():
        epi_data = pd.read_csv(epi_path)
    else:
        epi_data = _corral_epidemiological(report_woredas=report_woredas, data_dir=data_dir)

    if env_path.exists():
        env_data = pd.read_csv(env_path)
    else:
        env_data = _corral_environment(report_woredas=report_woredas, data_dir=data_dir)
    env_ref_data = pd.read_csv(env_ref_path)
    env_info = pd.read_excel(env_info_path)

    _validate_columns(epi_data, REQUIRED_EPI_COLUMNS, "epi_data")
    _validate_columns(env_data, REQUIRED_ENV_COLUMNS, "env_data")

    if "woreda_name" not in report_woredas.columns:
        raise PipelineInputError("amhara_woredas.csv must include 'woreda_name'")

    report_names = set(report_woredas["woreda_name"].astype(str))
    epi_data = epi_data[epi_data["woreda_name"].astype(str).isin(report_names)]
    env_data = env_data[env_data["woreda_name"].astype(str).isin(report_names)]

    epi_data = _ensure_datetime(epi_data, "obs_date")
    env_data = _ensure_datetime(env_data, "obs_date")

    env_start_date = pd.Timestamp(_year_week_to_sunday(req.env_start_year, req.env_start_week))
    env_data = env_data[env_data["obs_date"] >= env_start_date]

    return report_woredas, epi_data, env_data, env_ref_data, env_info


def _weekly_env_signal(env_data: pd.DataFrame) -> pd.DataFrame:
    grouped = (
        env_data.assign(week_start=lambda d: d["obs_date"] - pd.to_timedelta(d["obs_date"].dt.weekday, unit="D"))
        .groupby(["woreda_name", "week_start"], as_index=False)["obs_value"]
        .mean()
        .rename(columns={"obs_value": "env_mean"})
    )
    return grouped


def _fit_and_forecast(series: pd.Series, horizon: int) -> np.ndarray:
    clean = series.dropna().astype(float)
    if clean.empty:
        return np.zeros(horizon)

    y = clean.values
    if y.size < 3:
        return np.repeat(y[-1], horizon)

    # Prefer an autoregressive forecast so the horizon can evolve over time
    # rather than collapsing to a near-flat linear fit.
    try:
        max_lags = min(8, max(1, y.size // 3))
        model = AutoReg(y, lags=max_lags, trend="c", old_names=False)
        fit = model.fit()
        preds = fit.predict(start=y.size, end=y.size + horizon - 1)
    except Exception:
        # Fallback keeps pipeline resilient when AR fitting fails on edge cases.
        x = np.arange(y.size)
        slope, intercept = np.polyfit(x, y, 1)
        future_x = np.arange(y.size, y.size + horizon)
        preds = intercept + slope * future_x

    return np.maximum(np.asarray(preds, dtype=float), 0.0)


def _species_pipeline(
    species: SpeciesConfig,
    epi_data: pd.DataFrame,
    env_weekly: pd.DataFrame,
    horizon_weeks: int,
) -> Tuple[List[DistrictForecast], List[DistrictAlert]]:
    forecasts: List[DistrictForecast] = []
    alerts: List[DistrictAlert] = []

    epi_weekly = (
        epi_data.assign(week_start=lambda d: d["obs_date"] - pd.to_timedelta(d["obs_date"].dt.weekday, unit="D"))
        .groupby(["woreda_name", "week_start"], as_index=False)
        .agg(
            cases=(species.case_column, "sum"),
            pop_at_risk=("pop_at_risk", "max"),
        )
    )

    merged = epi_weekly.merge(env_weekly, on=["woreda_name", "week_start"], how="left")

    for woreda_name, district_df in merged.groupby("woreda_name"):
        district_df = district_df.sort_values("week_start")
        history = district_df["cases"].astype(float)

        # Keep a recent observed window to display a meaningful observed line in UI.
        observed_window = district_df[["week_start", "cases"]].tail(16)
        observed_history = [
            DistrictObservedPoint(
                week_start=pd.Timestamp(row["week_start"]).date(),
                observed=float(row["cases"]),
            )
            for _, row in observed_window.iterrows()
            if pd.notna(row["cases"])
        ]

        preds = _fit_and_forecast(history, horizon=horizon_weeks)
        hist_std = float(np.nanstd(history.values)) if len(history) > 1 else 0.0
        hist_std = max(hist_std, 1.0)

        last_week = pd.Timestamp(district_df["week_start"].max())
        points: List[DistrictForecastPoint] = []
        for i, pred in enumerate(preds, start=1):
            week_date = (last_week + timedelta(weeks=i)).date()
            points.append(
                DistrictForecastPoint(
                    week_start=week_date,
                    median=float(pred),
                    lower=float(max(pred - 1.28 * hist_std, 0.0)),
                    upper=float(pred + 1.28 * hist_std),
                )
            )

        latest_obs = float(history.iloc[-1]) if not history.empty else None
        latest_fc = float(preds[0]) if len(preds) else None
        baseline_pct = float(np.nanpercentile(history.values, 75)) if len(history) else 0.0
        warn_pct = baseline_pct * 1.25

        pop_series = None
        if "pop_at_risk" in district_df.columns and district_df["pop_at_risk"].notna().any():
            pop_series = district_df["pop_at_risk"].to_numpy(dtype=float)

        farr = farrington_thresholds_for_horizon(
            history.values.astype(float),
            pop_series,
            str(species.species),
        )
        if farr is not None:
            detection_threshold, warning_threshold = farr
        else:
            detection_threshold, warning_threshold = baseline_pct, warn_pct

        alerts.append(
            DistrictAlert(
                district=str(woreda_name),
                species=species.species,  # type: ignore[arg-type]
                early_detection=bool(
                    latest_fc is not None and latest_fc > detection_threshold
                ),
                early_warning=bool(
                    latest_fc is not None and latest_fc > warning_threshold
                ),
                latest_observed=latest_obs,
                latest_forecast=latest_fc,
                detection_threshold=detection_threshold,
                warning_threshold=warning_threshold,
            )
        )

        forecasts.append(
            DistrictForecast(
                district=str(woreda_name),
                species=species.species,  # type: ignore[arg-type]
                history_points=int(len(history)),
                observed_history=observed_history,
                forecast=points,
            )
        )

    return forecasts, alerts


def _save_artifacts(
    req: EpidemiaRunRequest,
    response_payload: Dict,
) -> Dict[str, str]:
    out_dir = _resolve_runtime_path(req.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    report_json = out_dir / "report_data.json"
    report_versioned = out_dir / f"report_data_{timestamp}.json"

    with report_json.open("w", encoding="utf-8") as f:
        json.dump(response_payload, f, indent=2, default=str)
    with report_versioned.open("w", encoding="utf-8") as f:
        json.dump(response_payload, f, indent=2, default=str)

    artifacts: Dict[str, str] = {
        "report_data": str(report_json),
        "report_data_versioned": str(report_versioned),
    }

    if req.create_report:
        report_md = out_dir / f"epidemia_report_{timestamp}.md"
        lines = [
            "# EPIDEMIA Python Report",
            "",
            f"Generated: {response_payload['generated_at']}",
            "",
            f"District forecasts: {len(response_payload['forecasts'])}",
            f"Alerts: {len(response_payload['alerts'])}",
        ]
        report_md.write_text("\n".join(lines), encoding="utf-8")
        artifacts["report_markdown"] = str(report_md)

    return artifacts


def run_epidemia_pipeline(req: EpidemiaRunRequest) -> EpidemiaRunResponse:
    report_woredas, epi_data, env_data, env_ref_data, env_info = _load_inputs(req)

    # Variables are loaded for parity with the original R orchestration, even if not
    # all are consumed in this first Python implementation pass.
    _ = report_woredas, env_ref_data, env_info

    env_weekly = _weekly_env_signal(env_data)

    all_forecasts: List[DistrictForecast] = []
    all_alerts: List[DistrictAlert] = []

    for species in SPECIES_CONFIGS:
        species_forecasts, species_alerts = _species_pipeline(
            species=species,
            epi_data=epi_data,
            env_weekly=env_weekly,
            horizon_weeks=req.horizon_weeks,
        )
        all_forecasts.extend(species_forecasts)
        all_alerts.extend(species_alerts)

    generated_at = datetime.utcnow().isoformat() + "Z"
    response_payload = {
        "message": "EPIDEMIA Python pipeline completed",
        "generated_at": generated_at,
        "inputs_used": {
            "data_dir": req.data_dir,
            "output_dir": req.output_dir,
            "horizon_weeks": str(req.horizon_weeks),
        },
        "alerts": [item.model_dump() for item in all_alerts],
        "forecasts": [item.model_dump() for item in all_forecasts],
    }

    artifacts = _save_artifacts(req, response_payload)

    return EpidemiaRunResponse(
        message=response_payload["message"],
        generated_at=generated_at,
        inputs_used=response_payload["inputs_used"],
        alerts=all_alerts,
        forecasts=all_forecasts,
        artifacts=artifacts,
    )
