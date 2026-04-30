import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.schemas.forecast import ForecastRequest, ForecastResponse
from app.services.malaria_forecast import run_malaria_forecast
from app.schemas.epidemia import EpidemiaRunRequest, EpidemiaRunResponse
from app.services.epidemia_pipeline import (
    load_latest_epidemia_report,
    run_epidemia_pipeline,
    PipelineInputError,
)


DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://epidemia-ui.disc.ourcloud.ou.edu",
]


def get_allowed_origins() -> list[str]:
    configured = os.getenv("CORS_ALLOW_ORIGINS", "")
    if not configured.strip():
        return DEFAULT_ALLOWED_ORIGINS
    return [origin.strip() for origin in configured.split(",") if origin.strip()]

app = FastAPI(
    title="EPIDEMIA API",
    description="Malaria Early Warning System (Ethiopia)",
    version="0.1.0"
)


@app.get("/health")
def health_check():
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/forecast", response_model=ForecastResponse)
def forecast_malaria(request: ForecastRequest):
    return run_malaria_forecast(
        region=request.region,
        horizon_weeks=request.horizon_weeks
    )


@app.post("/epidemia/run", response_model=EpidemiaRunResponse)
def run_epidemia(request: EpidemiaRunRequest):
    try:
        return run_epidemia_pipeline(request)
    except PipelineInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/epidemia/latest", response_model=EpidemiaRunResponse)
def latest_epidemia(output_dir: str = "report"):
    try:
        return load_latest_epidemia_report(output_dir=output_dir)
    except PipelineInputError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
    )
