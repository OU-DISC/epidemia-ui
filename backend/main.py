import os
from pathlib import Path


def _load_dotenv_file() -> None:
    """Load backend/.env into os.environ if present (does not override existing vars)."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv_file()

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from app.schemas.forecast import ForecastRequest, ForecastResponse
from app.services.malaria_forecast import run_malaria_forecast
from app.schemas.epidemia import DistrictForecast, EpidemiaRunRequest, EpidemiaRunResponse, Species
from app.schemas.edi import (
    EdiDeliberateRequest,
    EdiDeliberateResponse,
    EdiExplainRequest,
    EdiExplainResponse,
    EdiStatusResponse,
)
from app.schemas.project_setup import EpiValidationResponse, ProjectSetupRequest, ProjectSetupResponse
from app.services.epidemia_pipeline import (
    load_bootstrap_epidemia_report,
    load_district_epidemia_forecast,
    load_latest_epidemia_report,
    load_map_epidemia_report,
    run_epidemia_pipeline,
)
from app.services.edi_grounded_llm import get_edi_status, grounded_deliberate, grounded_explain
from app.services.pipeline_input_error import PipelineInputError
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

app.add_middleware(GZipMiddleware, minimum_size=1000)
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
    except Exception as exc:
        # Ensure errors are returned through FastAPI (and CORS middleware)
        # instead of bubbling up to the ASGI server.
        raise HTTPException(status_code=500, detail=f"EPIDEMIA pipeline failed: {exc}") from exc


@app.get("/epidemia/latest", response_model=EpidemiaRunResponse)
def latest_epidemia(output_dir: str = "report"):
    try:
        return load_latest_epidemia_report(output_dir=output_dir)
    except PipelineInputError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/epidemia/latest/map", response_model=EpidemiaRunResponse)
def latest_epidemia_map(output_dir: str = "report"):
    try:
        return load_map_epidemia_report(output_dir=output_dir)
    except PipelineInputError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/epidemia/latest/bootstrap", response_model=EpidemiaRunResponse)
def latest_epidemia_bootstrap(output_dir: str = "report", history_weeks: int = 16):
    try:
        return load_bootstrap_epidemia_report(
            output_dir=output_dir,
            history_weeks=history_weeks,
        )
    except PipelineInputError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/epidemia/latest/district", response_model=DistrictForecast)
def latest_district_forecast(
    district: str,
    species: Species = "pfm",
    output_dir: str = "report",
    start_date: str | None = None,
    end_date: str | None = None,
):
    try:
        return load_district_epidemia_forecast(
            output_dir=output_dir,
            district=district,
            species=species,
            start_date=start_date,
            end_date=end_date,
        )
    except PipelineInputError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/epidemia/cache/status")
def epidemia_cache_status(
    data_dir: str = "data",
    output_dir: str = "report",
    horizon_weeks: int = 8,
):
    from app.services.forecast_cache import cache_status

    req = EpidemiaRunRequest(
        data_dir=data_dir,
        output_dir=output_dir,
        horizon_weeks=horizon_weeks,
    )
    return cache_status(req)


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
    geography: str = "ethiopia",
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


@app.get("/edi/status", response_model=EdiStatusResponse)
def edi_status():
    """Whether grounded LLM deliberation (Layer 3) is configured."""
    return get_edi_status()


@app.post("/edi/explain", response_model=EdiExplainResponse)
def edi_explain(request: EdiExplainRequest):
    """
    Grounded rewrite of alert evidence (EDI Explain interaction).
    The LLM may only use the provided evidence pack; humans still decide.
    """
    return grounded_explain(
        evidence=request.evidence,
        interaction=request.interaction or "explain",
    )


@app.post("/edi/deliberate", response_model=EdiDeliberateResponse)
def edi_deliberate(request: EdiDeliberateRequest):
    """
    Grounded EDI deliberation. Prefer interaction=brief (unified structured schema).
    Also: explain | suggest | explore | compare. Humans still decide.
    """
    return grounded_deliberate(
        evidence=request.evidence,
        interaction=request.interaction or "brief",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
    )
