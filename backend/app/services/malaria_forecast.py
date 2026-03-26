from datetime import date, timedelta
from app.schemas.forecast import ForecastResponse, ForecastPoint, AlertStatus

def run_malaria_forecast(region: str, horizon_weeks: int) -> ForecastResponse:
    start_date = date(2024, 5, 12)

    forecast = []
    base = 95  # placeholder observed cases

    for i in range(horizon_weeks):
        projected = base + i * 6  # simple upward trend
        forecast.append(
            ForecastPoint(
                date=start_date + timedelta(weeks=i),
                observed=base if i == 0 else None,
                median=projected,
                lower=projected - 25,
                upper=projected + 32,
            )
        )

    alerts = AlertStatus(
        early_detection=projected > 120,
        early_warning=projected > 150
    )

    return ForecastResponse(
        region=region,
        disease="Malaria",
        horizon_weeks=horizon_weeks,
        forecast=forecast,
        alerts=alerts
    )
