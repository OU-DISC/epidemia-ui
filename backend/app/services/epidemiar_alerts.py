"""
Early detection / early warning alert logic aligned with epidemiar R package.

- Early detection (ED): Farrington alarms on *observed* cases during the last
  `ed_summary_weeks` (default 4) of known epidemiology.
- Early warning (EW): Farrington alarms on *forecast* values during the forecast horizon.
- Summary levels: Low (0 weeks), Medium (1 week), High (2+ weeks) — same as
  epidemiar::create_summary_data().
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional, Sequence, Tuple

import numpy as np

from app.services.farrington_thresholds import (
    FARRINGTON_PFM,
    FARRINGTON_PV,
    FarringtonControl,
    farrington_bounds_at_index,
)

AlertLevel = Literal["Low", "Medium", "High"]
EARLY_DETECTION_SUMMARY_WEEKS = 4


def alert_level_from_count(count: int) -> AlertLevel:
    if count > 1:
        return "High"
    if count == 1:
        return "Medium"
    return "Low"


def _species_control(species: str) -> FarringtonControl:
    return FARRINGTON_PFM if species == "pfm" else FARRINGTON_PV


def _week_alarm(
    series: np.ndarray,
    pop: Optional[np.ndarray],
    week_index: int,
    species: str,
) -> Tuple[Optional[float], Optional[float], bool]:
    pop_slice = pop[: week_index + 1] if pop is not None else None
    bounds = farrington_bounds_at_index(series[: week_index + 1], pop_slice, week_index, species)
    if bounds is None:
        return None, None, False
    mu, upper = bounds
    observed = float(series[week_index])
    alarm = bool(np.isfinite(observed) and np.isfinite(upper) and observed > upper)
    return mu, upper, alarm


@dataclass(frozen=True)
class EpidemiarAlertSummary:
    early_detection: bool
    early_warning: bool
    ed_alert_count: int
    ew_alert_count: int
    ed_level: AlertLevel
    ew_level: AlertLevel
    observed_thresholds: List[Tuple[Optional[float], Optional[float]]]
    forecast_thresholds: List[Tuple[Optional[float], Optional[float]]]
    latest_detection_threshold: Optional[float]
    latest_warning_threshold: Optional[float]


def compute_epidemiar_alert_summary(
    observed_values: Sequence[float],
    forecast_values: Sequence[float],
    pop_observed: Optional[Sequence[float]] = None,
    species: str = "pfm",
    ed_summary_weeks: int = EARLY_DETECTION_SUMMARY_WEEKS,
) -> EpidemiarAlertSummary:
    obs = np.asarray(observed_values, dtype=float)
    fc = np.asarray(forecast_values, dtype=float)
    pop = np.asarray(pop_observed, dtype=float) if pop_observed is not None else None
    n_obs = int(obs.size)

    observed_thresholds: List[Tuple[Optional[float], Optional[float]]] = []
    ed_count = 0
    ed_start = max(0, n_obs - max(1, int(ed_summary_weeks)))

    for t in range(n_obs):
        mu, upper, alarm = _week_alarm(obs, pop, t, species)
        observed_thresholds.append((mu, upper))
        if t >= ed_start and alarm:
            ed_count += 1

    forecast_thresholds: List[Tuple[Optional[float], Optional[float]]] = []
    ew_count = 0
    last_pop = float(pop[n_obs - 1]) if pop is not None and n_obs > 0 and np.isfinite(pop[n_obs - 1]) else None

    for i in range(int(fc.size)):
        combined = np.concatenate([obs, fc[: i + 1]])
        if last_pop is not None:
            combined_pop = np.concatenate(
                [pop[:n_obs], np.full(i + 1, last_pop, dtype=float)]
            )
        else:
            combined_pop = None
        week_index = n_obs + i
        mu, upper, alarm = _week_alarm(combined, combined_pop, week_index, species)
        forecast_thresholds.append((mu, upper))
        if alarm:
            ew_count += 1

    latest_mu = None
    latest_upper = None
    if forecast_thresholds:
        latest_mu, latest_upper = forecast_thresholds[0]
    elif observed_thresholds:
        latest_mu, latest_upper = observed_thresholds[-1]

    return EpidemiarAlertSummary(
        early_detection=ed_count >= 1,
        early_warning=ew_count >= 1,
        ed_alert_count=int(ed_count),
        ew_alert_count=int(ew_count),
        ed_level=alert_level_from_count(ed_count),
        ew_level=alert_level_from_count(ew_count),
        observed_thresholds=observed_thresholds,
        forecast_thresholds=forecast_thresholds,
        latest_detection_threshold=latest_mu,
        latest_warning_threshold=latest_upper,
    )
