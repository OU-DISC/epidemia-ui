from __future__ import annotations

from datetime import date
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


Species = Literal["pfm", "pv"]


class EpidemiaRunRequest(BaseModel):
    data_dir: str = Field(default="data", description="Folder containing epidemiology and environment input files")
    output_dir: str = Field(default="report", description="Folder where report artifacts are written")
    horizon_weeks: int = Field(default=8, ge=1, le=52)
    env_start_year: int = Field(default=2012, ge=1900)
    env_start_week: int = Field(default=1, ge=1, le=53)
    create_report: bool = Field(default=False, description="If true, writes a markdown summary report")
    force_refresh: bool = Field(
        default=False,
        description="If true, recompute even when a valid cached report exists",
    )
    region_filter: Optional[str] = Field(
        default=None,
        description="Admin-1 region name; when set, only districts in that region are forecast",
    )


class DistrictForecastPoint(BaseModel):
    week_start: date
    median: float
    lower: float
    upper: float
    detection_threshold: Optional[float] = None
    warning_threshold: Optional[float] = None


class DistrictObservedPoint(BaseModel):
    week_start: date
    observed: float
    detection_threshold: Optional[float] = None
    warning_threshold: Optional[float] = None


class DistrictAlert(BaseModel):
    district: str
    species: Species
    early_detection: bool
    early_warning: bool
    ed_alert_count: int = 0
    ew_alert_count: int = 0
    ed_level: Literal["Low", "Medium", "High"] = "Low"
    ew_level: Literal["Low", "Medium", "High"] = "Low"
    latest_observed: Optional[float] = None
    latest_forecast: Optional[float] = None
    detection_threshold: Optional[float] = None
    warning_threshold: Optional[float] = None
    population_at_risk: Optional[float] = None


class DistrictForecast(BaseModel):
    district: str
    species: Species
    history_points: int
    observed_history: List[DistrictObservedPoint]
    forecast: List[DistrictForecastPoint]


class EpidemiaRunResponse(BaseModel):
    message: str
    generated_at: str
    inputs_used: Dict[str, str]
    alerts: List[DistrictAlert]
    forecasts: List[DistrictForecast]
    artifacts: Dict[str, str]
