"""
Farrington-style baselines (Python) aligned with R surveillance/EPIDEMIAR intent.

- Fits GLM( Poisson, log ) on weekly case counts with optional log(pop) offset
  and optional linear time trend, with iterative reweighting (outliers downweighted).
- Excludes the last `pastWeeksNotIncluded` weeks from the fit (R-style recent window).
- `detection_threshold` = expected count at the first forecast time (time index t = n).
- `warning_threshold`  = mean + z * sqrt(phi * mean) (quasi / plugin; phi from Pearson X²/df).

This is a practical port, not a byte-identical copy of R `farringtonFlexible`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np
import statsmodels.api as sm
from scipy import stats
from statsmodels.genmod.families import Poisson
from statsmodels.genmod.families.links import Log


@dataclass(frozen=True)
class FarringtonControl:
    w: int
    reweight: bool
    weights_threshold: float
    trend: bool
    population_offset: bool
    no_periods: int
    past_weeks_not_included: int
    upper_prob: float = 0.99


FARRINGTON_PFM = FarringtonControl(
    w=3,
    reweight=True,
    weights_threshold=2.58,
    trend=True,
    population_offset=True,
    no_periods=12,
    past_weeks_not_included=4,
)
FARRINGTON_PV = FarringtonControl(
    w=4,
    reweight=True,
    weights_threshold=2.58,
    trend=True,
    population_offset=True,
    no_periods=10,
    past_weeks_not_included=4,
)


def _z_one_sided(upper_prob: float) -> float:
    return float(stats.norm.ppf(upper_prob))


def _iterative_poisson_glm(
    y: np.ndarray,
    X: np.ndarray,
    offset: Optional[np.ndarray],
    reweight: bool,
    weights_threshold: float,
) -> Optional[sm.genmod.generalized_linear_model.GLMResultsWrapper]:
    n = y.size
    wts = np.ones(n, dtype=float)
    if not reweight:
        if offset is not None:
            return sm.GLM(
                y, X, family=Poisson(link=Log()), offset=offset
            ).fit()
        return sm.GLM(y, X, family=Poisson(link=Log())).fit()

    for _ in range(12):
        if offset is not None:
            mod = sm.GLM(
                y,
                X,
                family=Poisson(link=Log()),
                offset=offset,
                var_weights=wts,
            )
        else:
            mod = sm.GLM(
                y, X, family=Poisson(link=Log()), var_weights=wts
            )
        try:
            fit = mod.fit()
        except Exception:
            return None
        mu = np.clip(fit.fittedvalues, 1e-9, None)
        pearson = (y - mu) / np.sqrt(mu)
        scale = max(float(np.std(pearson, ddof=1)) if n > 2 else 1.0, 1e-9)
        new_w = np.where(np.abs(pearson) > weights_threshold * scale, 0.0, 1.0)
        if int(np.sum(new_w)) < 2:
            break
        if np.allclose(new_w, wts):
            break
        wts = new_w

    if int(np.sum(wts)) < 2:
        wts = np.ones(n, dtype=float)
    if offset is not None:
        mod = sm.GLM(
            y, X, family=Poisson(link=Log()), offset=offset, var_weights=wts
        )
    else:
        mod = sm.GLM(y, X, family=Poisson(link=Log()), var_weights=wts)
    try:
        return mod.fit()
    except Exception:
        return None


def farrington_thresholds_for_horizon(
    case_history: np.ndarray,
    pop_history: Optional[np.ndarray],
    species: str,
) -> Optional[Tuple[float, float]]:
    """
    :param case_history: weekly non-negative counts, oldest -> newest, length n
    :param pop_history: same length as cases, or None; uses last week for offset at prediction
    :return: (detection_threshold, warning_threshold) for the *first forecast* week, or None
    """
    y_all = np.asarray(case_history, dtype=float)
    n = y_all.size
    if n < 3:
        return None
    return farrington_bounds_at_index(y_all, pop_history, n, species)


def farrington_bounds_at_index(
    case_history: np.ndarray,
    pop_history: Optional[np.ndarray],
    eval_index: int,
    species: str,
) -> Optional[Tuple[float, float]]:
    """
    Farrington-style expected count (mu) and upper alert bound at week `eval_index`.
    Matches epidemiar/surveillance intent for per-week alarm evaluation.
    """
    y_all = np.asarray(case_history, dtype=float)
    n = y_all.size
    if eval_index < 0 or eval_index >= n:
        return None

    ctrl = FARRINGTON_PFM if species == "pfm" else FARRINGTON_PV
    m = int(ctrl.past_weeks_not_included)
    if eval_index < m + 2:
        return None

    end_fit = eval_index - m + 1
    if end_fit < 3:
        return None

    y_fit = y_all[:end_fit]
    pop_fit = None
    if pop_history is not None and len(pop_history) >= end_fit:
        pop_fit = np.asarray(pop_history[:end_fit], dtype=float)

    max_weeks = max(8, int(ctrl.no_periods) * 52)
    t_global_start = 0
    if end_fit > max_weeks:
        y_fit = y_fit[-max_weeks:]
        if pop_fit is not None:
            pop_fit = pop_fit[-max_weeks:]
        t_global_start = end_fit - y_fit.size

    t_pred = float(eval_index)
    return _farrington_mu_upper(y_fit, pop_fit, t_pred, ctrl, t_global_start)


def _farrington_mu_upper(
    y_fit: np.ndarray,
    pop_fit: Optional[np.ndarray],
    t_pred: float,
    ctrl: FarringtonControl,
    t_global_start: float,
) -> Optional[Tuple[float, float]]:
    n_fit = y_fit.size
    if n_fit < 3:
        return None

    if ctrl.trend:
        t_vals = t_global_start + np.arange(n_fit, dtype=float)
        X = np.column_stack([np.ones(n_fit, dtype=float), t_vals])
        X_pred = np.array([[1.0, t_pred]], dtype=float)
    else:
        X = np.ones((n_fit, 1), dtype=float)
        X_pred = np.array([[1.0]], dtype=float)

    offset_fit: Optional[np.ndarray] = None
    offset_pred = 0.0
    if ctrl.population_offset and pop_fit is not None and pop_fit.size == n_fit:
        p = np.asarray(pop_fit, dtype=float)
        p = np.where(np.isfinite(p) & (p > 0.0), p, 1.0)
        offset_fit = np.log(p)
        p_last = float(p[-1])
        offset_pred = float(np.log(max(p_last, 1.0)))

    fit = _iterative_poisson_glm(
        y_fit,
        X,
        offset_fit,
        reweight=ctrl.reweight,
        weights_threshold=ctrl.weights_threshold,
    )
    if fit is None:
        return None

    lin = float(np.asarray(X_pred @ fit.params + offset_pred).ravel()[0])
    mu = float(max(np.exp(lin), 0.0))

    resid_p = np.asarray(fit.resid_pearson)
    df_r = max(float(fit.df_resid), 1.0)
    phi = max(1.0, float(np.sum(resid_p**2) / df_r))
    if np.isfinite(fit.scale) and float(fit.scale) > 0:
        phi = max(phi, float(fit.scale))

    z = _z_one_sided(ctrl.upper_prob)
    upper = float(mu + z * np.sqrt(max(phi * mu, 0.0)))

    return (mu, max(upper, mu + 1e-6))
