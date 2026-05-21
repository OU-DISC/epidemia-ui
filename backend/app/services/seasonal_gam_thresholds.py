"""
Seasonal Poisson GAM thresholds for EPIDEMIA.

Model (log link):
    log(mu_t) = s_cyclic(doy) + s(time) + beta1 * rainfall + beta2 * temperature + log(pop)

Detection threshold at week t: T_detect(t) = mu(t)
Warning threshold at week t:     T_warn(t)  = mu(t) + z * sqrt(phi * mu(t))
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats
from statsmodels.genmod.families import Poisson
from statsmodels.genmod.families.links import log as log_link

try:
    from pygam import PoissonGAM, l, s

    HAS_PYGAM = True
except ImportError:  # pragma: no cover - optional dependency
    HAS_PYGAM = False


RAINFALL_CODE = "totprec"
TEMPERATURE_CODE = "lst_mean"


@dataclass(frozen=True)
class SeasonalGamControl:
    past_weeks_not_included: int = 4
    upper_prob: float = 0.99
    min_fit_weeks: int = 26
    max_fit_weeks: int = 624
    doy_splines: int = 10
    time_splines: int = 8


def epidemiar_week(ts: pd.Timestamp) -> int:
    doy = int(pd.Timestamp(ts).dayofyear)
    return min(52, max(1, (doy - 1) // 7 + 1))


def build_env_climatology(env_ref_data: pd.DataFrame) -> Dict[str, Dict[str, Dict[int, float]]]:
    """woreda -> environ_var_code -> epidemiar week -> ref_median."""
    out: Dict[str, Dict[str, Dict[int, float]]] = {}
    if env_ref_data is None or env_ref_data.empty:
        return out

    value_col = "ref_median" if "ref_median" in env_ref_data.columns else "ref_value"
    for row in env_ref_data.itertuples(index=False):
        woreda = str(getattr(row, "woreda_name"))
        var = str(getattr(row, "environ_var_code"))
        week = int(getattr(row, "week_epidemiar"))
        value = float(getattr(row, value_col))
        out.setdefault(woreda, {}).setdefault(var, {})[week] = value
    return out


def weekly_env_features(env_data: pd.DataFrame) -> pd.DataFrame:
    subset = env_data[
        env_data["environ_var_code"].isin([RAINFALL_CODE, TEMPERATURE_CODE])
    ].copy()
    if subset.empty:
        return pd.DataFrame(columns=["woreda_name", "week_start", "rainfall", "temperature"])

    subset["week_start"] = subset["obs_date"] - pd.to_timedelta(
        subset["obs_date"].dt.weekday, unit="D"
    )
    weekly = (
        subset.groupby(["woreda_name", "week_start", "environ_var_code"], as_index=False)[
            "obs_value"
        ]
        .mean()
    )
    wide = weekly.pivot(
        index=["woreda_name", "week_start"],
        columns="environ_var_code",
        values="obs_value",
    ).reset_index()
    wide.columns.name = None
    if RAINFALL_CODE not in wide.columns:
        wide[RAINFALL_CODE] = np.nan
    if TEMPERATURE_CODE not in wide.columns:
        wide[TEMPERATURE_CODE] = np.nan
    return wide.rename(
        columns={RAINFALL_CODE: "rainfall", TEMPERATURE_CODE: "temperature"}
    )


def _z_one_sided(upper_prob: float) -> float:
    return float(stats.norm.ppf(upper_prob))


def _lookup_climatology(
    clim: Dict[str, Dict[str, Dict[int, float]]],
    woreda_name: str,
    var_code: str,
    week_start: pd.Timestamp,
    fallback: float,
) -> float:
    week = epidemiar_week(week_start)
    value = clim.get(woreda_name, {}).get(var_code, {}).get(week)
    if value is None or not np.isfinite(value):
        return fallback
    return float(value)


def _fill_env_column(
    values: np.ndarray,
    week_starts: np.ndarray,
    clim: Dict[str, Dict[str, Dict[int, float]]],
    woreda_name: str,
    var_code: str,
    fallback: float,
) -> np.ndarray:
    filled = values.astype(float).copy()
    for idx, raw in enumerate(filled):
        if np.isfinite(raw):
            continue
        filled[idx] = _lookup_climatology(
            clim, woreda_name, var_code, pd.Timestamp(week_starts[idx]), fallback
        )
    if not np.isfinite(filled).any():
        filled[:] = fallback
    return filled


def _build_features(
    week_starts: np.ndarray,
    rainfall: np.ndarray,
    temperature: np.ndarray,
    time_origin: pd.Timestamp,
) -> np.ndarray:
    ts = pd.to_datetime(week_starts)
    doy = ts.dayofyear.to_numpy(dtype=float)
    origin = pd.Timestamp(time_origin)
    time_idx = np.array([(pd.Timestamp(t) - origin).days / 7.0 for t in ts], dtype=float)
    return np.column_stack([doy, time_idx, rainfall, temperature])


def _warning_from_mu(mu: np.ndarray, phi: float, z: float) -> np.ndarray:
    mu = np.maximum(mu, 0.0)
    return mu + z * np.sqrt(np.maximum(phi * mu, 0.0))


def _estimate_phi(y: np.ndarray, mu: np.ndarray, df: float) -> float:
    mu = np.clip(mu, 1e-9, None)
    pearson = (y - mu) / np.sqrt(mu)
    phi = float(np.sum(pearson**2) / max(df, 1.0))
    return max(1.0, phi)


def _fit_poisson_gam(
    X: np.ndarray,
    y: np.ndarray,
    offset: np.ndarray,
    ctrl: SeasonalGamControl,
) -> Tuple[Optional[object], Optional[sm.genmod.generalized_linear_model.GLMResultsWrapper], str]:
    if HAS_PYGAM:
        try:
            gam = PoissonGAM(
                s(0, n_splines=ctrl.doy_splines, spline_order=3, basis="cp", constraints="circular")
                + s(1, n_splines=ctrl.time_splines, spline_order=3)
                + l(2)
                + l(3)
            )
            gam.fit(X, y, offset=offset)
            return gam, None, "pygam"
        except Exception:
            pass

    # Fallback: Fourier seasonality + linear covariates (statsmodels Poisson GLM).
    doy = X[:, 0]
    harmonics = []
    for k in range(1, 4):
        harmonics.append(np.sin(2.0 * np.pi * k * doy / 365.25))
        harmonics.append(np.cos(2.0 * np.pi * k * doy / 365.25))
    design = np.column_stack(
        [np.ones(len(y)), X[:, 1], X[:, 2], X[:, 3], *harmonics]
    )
    try:
        glm = sm.GLM(
            y,
            design,
            family=Poisson(link=log_link()),
            offset=offset,
        ).fit()
        return None, glm, "glm"
    except Exception:
        return None, None, "none"


def _predict_mu(
    model_kind: str,
    model: object,
    X: np.ndarray,
    offset: np.ndarray,
) -> Optional[np.ndarray]:
    if model_kind == "pygam" and model is not None:
        try:
            return np.maximum(np.asarray(model.predict_mu(X, offset=offset), dtype=float), 0.0)
        except Exception:
            return None

    if model_kind == "glm" and model is not None:
        doy = X[:, 0]
        harmonics = []
        for k in range(1, 4):
            harmonics.append(np.sin(2.0 * np.pi * k * doy / 365.25))
            harmonics.append(np.cos(2.0 * np.pi * k * doy / 365.25))
        design = np.column_stack(
            [np.ones(len(X)), X[:, 1], X[:, 2], X[:, 3], *harmonics]
        )
        try:
            lin = np.asarray(design @ model.params + offset, dtype=float)
            return np.maximum(np.exp(lin), 0.0)
        except Exception:
            return None
    return None


def compute_seasonal_thresholds(
    district_df: pd.DataFrame,
    predict_weeks: pd.Series,
    env_clim: Dict[str, Dict[str, Dict[int, float]]],
    woreda_name: str,
    species: str,
    ctrl: Optional[SeasonalGamControl] = None,
) -> Optional[pd.DataFrame]:
    """
    Fit a seasonal GAM on district history and return detection/warning thresholds
    for each requested week in ``predict_weeks``.
    """
    _ = species  # reserved for future species-specific controls
    ctrl = ctrl or SeasonalGamControl()

    if district_df.empty or predict_weeks.empty:
        return None

    work = district_df.sort_values("week_start").copy()
    work["week_start"] = pd.to_datetime(work["week_start"])
    work["cases"] = pd.to_numeric(work["cases"], errors="coerce")
    work["pop_at_risk"] = pd.to_numeric(work.get("pop_at_risk"), errors="coerce")
    work["rainfall"] = pd.to_numeric(work.get("rainfall"), errors="coerce")
    work["temperature"] = pd.to_numeric(work.get("temperature"), errors="coerce")
    work = work.dropna(subset=["week_start", "cases"])
    if work.empty:
        return None

    m = int(ctrl.past_weeks_not_included)
    if len(work) <= m + ctrl.min_fit_weeks:
        return None

    fit_df = work.iloc[:-m].copy()
    if len(fit_df) > ctrl.max_fit_weeks:
        fit_df = fit_df.iloc[-ctrl.max_fit_weeks :].copy()
    if len(fit_df) < ctrl.min_fit_weeks:
        return None

    rain_fallback = float(np.nanmedian(fit_df["rainfall"])) if fit_df["rainfall"].notna().any() else 0.0
    temp_fallback = (
        float(np.nanmedian(fit_df["temperature"])) if fit_df["temperature"].notna().any() else 20.0
    )

    fit_weeks = fit_df["week_start"].to_numpy()
    fit_rain = _fill_env_column(
        fit_df["rainfall"].to_numpy(dtype=float),
        fit_weeks,
        env_clim,
        woreda_name,
        RAINFALL_CODE,
        rain_fallback,
    )
    fit_temp = _fill_env_column(
        fit_df["temperature"].to_numpy(dtype=float),
        fit_weeks,
        env_clim,
        woreda_name,
        TEMPERATURE_CODE,
        temp_fallback,
    )
    fit_pop = fit_df["pop_at_risk"].to_numpy(dtype=float)
    fit_pop = np.where(np.isfinite(fit_pop) & (fit_pop > 0.0), fit_pop, 1.0)
    fit_cases = np.maximum(fit_df["cases"].to_numpy(dtype=float), 0.0)

    time_origin = pd.Timestamp(fit_weeks.min())
    X_fit = _build_features(fit_weeks, fit_rain, fit_temp, time_origin)
    offset_fit = np.log(fit_pop)

    model, glm, model_kind = _fit_poisson_gam(X_fit, fit_cases, offset_fit, ctrl)
    if model_kind == "none":
        return None

    mu_fit = _predict_mu(model_kind, model if model_kind == "pygam" else glm, X_fit, offset_fit)
    if mu_fit is None:
        return None

    df = max(len(fit_cases) - X_fit.shape[1], 1.0)
    phi = _estimate_phi(fit_cases, mu_fit, df)
    z = _z_one_sided(ctrl.upper_prob)

    pred_weeks = pd.to_datetime(predict_weeks).to_numpy()
    pred_rain = _fill_env_column(
        np.full(len(pred_weeks), np.nan),
        pred_weeks,
        env_clim,
        woreda_name,
        RAINFALL_CODE,
        rain_fallback,
    )
    pred_temp = _fill_env_column(
        np.full(len(pred_weeks), np.nan),
        pred_weeks,
        env_clim,
        woreda_name,
        TEMPERATURE_CODE,
        temp_fallback,
    )

    # Use latest known population for forecast-week offsets unless a row exists in work.
    latest_pop = float(fit_pop[-1])
    pop_by_week = {
        pd.Timestamp(row.week_start): float(row.pop_at_risk)
        for row in work.itertuples(index=False)
        if np.isfinite(getattr(row, "pop_at_risk", np.nan)) and row.pop_at_risk > 0
    }
    pred_pop = np.array(
        [pop_by_week.get(pd.Timestamp(w), latest_pop) for w in pred_weeks], dtype=float
    )
    pred_pop = np.where(np.isfinite(pred_pop) & (pred_pop > 0.0), pred_pop, latest_pop)

    X_pred = _build_features(pred_weeks, pred_rain, pred_temp, time_origin)
    offset_pred = np.log(pred_pop)
    mu_pred = _predict_mu(model_kind, model if model_kind == "pygam" else glm, X_pred, offset_pred)
    if mu_pred is None:
        return None

    warn_pred = _warning_from_mu(mu_pred, phi, z)
    detection = np.maximum(mu_pred, 0.0)
    warning = np.maximum(warn_pred, detection + 1e-6)

    return pd.DataFrame(
        {
            "week_start": pd.to_datetime(pred_weeks),
            "detection_threshold": detection,
            "warning_threshold": warning,
        }
    )


def thresholds_for_week(
    threshold_df: Optional[pd.DataFrame],
    week_start,
) -> Tuple[Optional[float], Optional[float]]:
    if threshold_df is None or threshold_df.empty:
        return None, None
    target = pd.Timestamp(week_start)
    row = threshold_df.loc[threshold_df["week_start"] == target]
    if row.empty:
        return None, None
    item = row.iloc[0]
    return float(item["detection_threshold"]), float(item["warning_threshold"])
