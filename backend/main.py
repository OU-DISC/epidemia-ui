import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from app.schemas.forecast import ForecastRequest, ForecastResponse
from app.services.malaria_forecast import run_malaria_forecast
from app.schemas.epidemia import EpidemiaRunRequest, EpidemiaRunResponse
from app.schemas.project_setup import EpiValidationResponse, ProjectSetupRequest, ProjectSetupResponse
from app.services.epidemia_pipeline import (
    load_latest_epidemia_report,
    run_epidemia_pipeline,
    PipelineInputError,
)
from app.services.project_setup import build_sample_epi_csv, setup_project, validate_epi_csv


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


async def _read_uploaded_csv(file: UploadFile) -> str:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty")
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded") from exc


@app.post("/epidemia/validate/epi", response_model=EpiValidationResponse)
async def validate_epi_upload(file: UploadFile = File(...)):
    csv_text = await _read_uploaded_csv(file)
    return validate_epi_csv(csv_text)


@app.get("/epidemia/sample/epi")
def sample_epi_csv():
    try:
        csv_text = build_sample_epi_csv()
    except PipelineInputError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "filename": "sample_epi_data.csv",
        "content": csv_text,
    }


@app.post("/epidemia/project/setup", response_model=ProjectSetupResponse)
async def create_project(
    project_name: str = "EPIDEMIA Demo Project",
    horizon_weeks: int = 8,
    default_species: str = "pfm",
    default_region: str = "All Regions",
    geography: str = "amhara",
    file: UploadFile = File(...),
):
    csv_text = await _read_uploaded_csv(file)
    config = ProjectSetupRequest(
        project_name=project_name,
        horizon_weeks=horizon_weeks,
        default_species=default_species,
        default_region=default_region,
        geography=geography,
    )
    try:
        return setup_project(csv_text, config)
    except PipelineInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
    )
