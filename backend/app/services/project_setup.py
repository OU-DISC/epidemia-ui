from __future__ import annotations

import io
import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Iterable

import pandas as pd

from app.schemas.epidemia import EpidemiaRunRequest, EpidemiaRunResponse
from app.schemas.project_setup import EpiValidationResponse, ProjectSetupRequest, ProjectSetupResponse
from app.services.epidemia_pipeline import (
    BACKEND_ROOT,
    PipelineInputError,
    REQUIRED_EPI_COLUMNS,
    _candidate_data_dirs,
    _ensure_datetime,
    _validate_columns,
    run_epidemia_pipeline,
)

PROJECTS_ROOT = BACKEND_ROOT / "projects"
BASE_DATA_CANDIDATES = _candidate_data_dirs("data")


def _resolve_base_data_dir() -> Path:
    for candidate in BASE_DATA_CANDIDATES:
        if not candidate.exists():
            continue
        if (candidate / "amhara_woredas.csv").exists() and (
            (candidate / "env_data.csv").exists() or (candidate / "data_environmental").exists()
        ):
            return candidate
    raise PipelineInputError(
        "Base data directory not found. Expected backend/data with woredas and environmental files."
    )


def _report_woreda_names(base_data_dir: Path) -> set[str]:
    woredas = pd.read_csv(base_data_dir / "amhara_woredas.csv")
    if "report" in woredas.columns:
        woredas = woredas[woredas["report"] == 1]
    if "woreda_name" not in woredas.columns:
        raise PipelineInputError("amhara_woredas.csv must include 'woreda_name'")
    return set(woredas["woreda_name"].astype(str))


def _read_epi_dataframe(csv_text: str) -> pd.DataFrame:
    if not csv_text or not csv_text.strip():
        raise PipelineInputError("Uploaded CSV is empty")
    return pd.read_csv(io.StringIO(csv_text))


def validate_epi_csv(csv_text: str, base_data_dir: Path | None = None) -> EpiValidationResponse:
    try:
        base_dir = base_data_dir or _resolve_base_data_dir()
        report_names = _report_woreda_names(base_dir)
    except PipelineInputError as exc:
        return EpiValidationResponse(ok=False, message=str(exc))

    try:
        df = _read_epi_dataframe(csv_text)
    except Exception as exc:
        return EpiValidationResponse(ok=False, message=f"Could not parse CSV: {exc}")

    missing = sorted(REQUIRED_EPI_COLUMNS.difference(df.columns))
    if missing:
        return EpiValidationResponse(
            ok=False,
            missing_columns=missing,
            row_count=len(df),
            message=f"Missing required columns: {', '.join(missing)}",
        )

    invalid_date_rows = 0
    date_min = None
    date_max = None
    try:
        dates = pd.to_datetime(df["obs_date"], errors="coerce")
        invalid_date_rows = int(dates.isna().sum())
        valid_dates = dates.dropna()
        if not valid_dates.empty:
            date_min = valid_dates.min().date().isoformat()
            date_max = valid_dates.max().date().isoformat()
    except Exception:
        invalid_date_rows = len(df)

    district_names = df["woreda_name"].astype(str).str.strip()
    district_count = int(district_names.nunique())
    csv_districts = set(district_names)
    matched = sorted(csv_districts.intersection(report_names))
    unmatched = sorted(csv_districts.difference(report_names))[:12]

    ok = (
        invalid_date_rows == 0
        and len(df) > 0
        and len(matched) > 0
    )

    message = "CSV looks good." if ok else "Fix the issues below before running the forecast."
    if len(matched) == 0:
        message = "No uploaded woreda names match the Amhara reporting districts list."

    return EpiValidationResponse(
        ok=ok,
        row_count=len(df),
        district_count=district_count,
        matched_districts=len(matched),
        unmatched_districts=unmatched,
        date_min=date_min,
        date_max=date_max,
        invalid_date_rows=invalid_date_rows,
        message=message,
    )


def _copy_tree(source: Path, destination: Path, names: Iterable[str]) -> None:
    for name in names:
        src = source / name
        dst = destination / name
        if not src.exists():
            continue
        if src.is_dir():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)


def _ensure_environ_info(project_dir: Path, base_data_dir: Path) -> None:
    target = project_dir / "environ_info.xlsx"
    source = base_data_dir / "environ_info.xlsx"
    if source.exists():
        shutil.copy2(source, target)
        return

    pd.DataFrame(
        {
            "environ_var_code": ["totprec", "ndvi", "lst_mean"],
            "description": ["Precipitation", "Vegetation index", "Land surface temperature"],
        }
    ).to_excel(target, index=False)


def _bootstrap_project_dir(project_dir: Path, csv_text: str, base_data_dir: Path) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "report").mkdir(parents=True, exist_ok=True)

    _copy_tree(
        base_data_dir,
        project_dir,
        [
            "amhara_woredas.csv",
            "env_ref_data_2002_2018.csv",
            "data_environmental",
            "env_data.csv",
            "ethiopia_admin3_population_surface.json",
            "ethiopia_admin3_population_surface_by_year.json",
        ],
    )
    _ensure_environ_info(project_dir, base_data_dir)

    epi_path = project_dir / "epi_data.csv"
    epi_path.write_text(csv_text if csv_text.endswith("\n") else csv_text + "\n", encoding="utf-8")

    df = pd.read_csv(epi_path)
    _validate_columns(df, REQUIRED_EPI_COLUMNS, "epi_data")
    _ensure_datetime(df, "obs_date")


def build_sample_epi_csv() -> str:
    report_candidates = [
        BACKEND_ROOT / "report" / "report_data.json",
        BACKEND_ROOT.parent / "public" / "report_data.json",
        BACKEND_ROOT.parent / "frontend" / "epidemia-ui" / "public" / "report_data.json",
    ]
    report_path = next((path for path in report_candidates if path.exists()), None)
    if report_path is None:
        raise PipelineInputError("No report_data.json available to build a sample epidemiology CSV.")

    payload = json.loads(report_path.read_text(encoding="utf-8"))
    alerts_by_district = {
        alert["district"]: alert for alert in payload.get("alerts", []) if alert.get("district")
    }

    rows: dict[tuple[str, str], dict] = {}
    for forecast in payload.get("forecasts", []):
        district = forecast.get("district")
        species = forecast.get("species")
        if not district or not species:
            continue

        population = alerts_by_district.get(district, {}).get("population_at_risk", 100000)
        case_column = "test_pf_tot" if species == "pfm" else "test_pv_only"

        for point in forecast.get("observed_history", []):
            week_start = point.get("week_start")
            observed = point.get("observed")
            if week_start is None or observed is None:
                continue

            key = (district, week_start)
            if key not in rows:
                rows[key] = {
                    "obs_date": week_start,
                    "woreda_name": district,
                    "pop_at_risk": population,
                    "test_pf_tot": 0.0,
                    "test_pv_only": 0.0,
                }
            rows[key][case_column] = float(observed)

    if not rows:
        raise PipelineInputError("Report data did not contain observed history for sample CSV generation.")

    df = pd.DataFrame(list(rows.values()))
    df = df.sort_values(["woreda_name", "obs_date"])
    buffer = io.StringIO()
    df.to_csv(buffer, index=False)
    return buffer.getvalue()


def setup_project(csv_text: str, config: ProjectSetupRequest) -> ProjectSetupResponse:
    base_data_dir = _resolve_base_data_dir()
    validation = validate_epi_csv(csv_text, base_data_dir=base_data_dir)
    if not validation.ok:
        raise PipelineInputError(validation.message)

    project_id = datetime.utcnow().strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:8]
    project_dir = PROJECTS_ROOT / project_id
    if project_dir.exists():
        raise PipelineInputError(f"Project directory already exists: {project_dir}")

    _bootstrap_project_dir(project_dir, csv_text, base_data_dir)

    data_dir = f"projects/{project_id}"
    output_dir = f"projects/{project_id}/report"
    run_request = EpidemiaRunRequest(
        data_dir=data_dir,
        output_dir=output_dir,
        horizon_weeks=config.horizon_weeks,
        create_report=False,
    )
    run_response: EpidemiaRunResponse = run_epidemia_pipeline(run_request)

    return ProjectSetupResponse(
        project_id=project_id,
        project_name=config.project_name,
        data_dir=data_dir,
        output_dir=output_dir,
        default_species=config.default_species,
        default_region=config.default_region,
        horizon_weeks=config.horizon_weeks,
        validation=validation,
        run=run_response.model_dump(mode="json"),
    )
