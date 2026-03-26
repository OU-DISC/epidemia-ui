from pydantic import BaseModel
from typing import List, Optional
from datetime import date

class ForecastRequest(BaseModel):
    region: str
    disease: str = "Malaria"
    horizon_weeks: int = 8

class ForecastPoint(BaseModel):
    date: date
    observed: Optional[float]
    median: float
    lower: float
    upper: float

class AlertStatus(BaseModel):
    early_detection: bool
    early_warning: bool

class ForecastResponse(BaseModel):
    region: str
    disease: str
    horizon_weeks: int
    forecast: List[ForecastPoint]
    alerts: AlertStatus
