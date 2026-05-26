"""Resolve district registry and environmental reference files (Amhara or national)."""
from __future__ import annotations

from pathlib import Path
from typing import Literal

import pandas as pd

from app.services.pipeline_input_error import PipelineInputError

GeographyMode = Literal["auto", "amhara", "ethiopia"]

WOREDAS_ETHIOPIA = "ethiopia_woredas.csv"
WOREDAS_AMHARA = "amhara_woredas.csv"
ENV_REF_NATIONAL = "env_ref_data.csv"
ENV_REF_AMHARA = "env_ref_data_2002_2018.csv"
ENV_INFO = "environ_info.xlsx"


def resolve_woredas_path(data_dir: Path, geography: GeographyMode = "auto") -> Path:
    ethiopia = data_dir / WOREDAS_ETHIOPIA
    amhara = data_dir / WOREDAS_AMHARA

    if geography == "ethiopia":
        if ethiopia.exists():
            return ethiopia
        raise PipelineInputError(f"Missing national district list: {ethiopia}")

    if geography == "amhara":
        if amhara.exists():
            return amhara
        raise PipelineInputError(f"Missing Amhara district list: {amhara}")

    if ethiopia.exists():
        return ethiopia
    if amhara.exists():
        return amhara
    raise PipelineInputError(
        f"Missing district list. Expected {WOREDAS_ETHIOPIA} or {WOREDAS_AMHARA} in {data_dir}"
    )


def resolve_env_ref_path(data_dir: Path, geography: GeographyMode = "auto") -> Path:
    national = data_dir / ENV_REF_NATIONAL
    amhara = data_dir / ENV_REF_AMHARA

    if geography == "ethiopia":
        if national.exists():
            return national
        raise PipelineInputError(f"Missing national environmental reference: {national}")

    if geography == "amhara":
        if amhara.exists():
            return amhara
        raise PipelineInputError(f"Missing Amhara environmental reference: {amhara}")

    if national.exists():
        return national
    if amhara.exists():
        return amhara
    raise PipelineInputError(
        f"Missing environmental reference. Expected {ENV_REF_NATIONAL} or {ENV_REF_AMHARA} in {data_dir}"
    )


def has_required_base_files(data_dir: Path) -> bool:
    woredas_ok = (data_dir / WOREDAS_ETHIOPIA).exists() or (data_dir / WOREDAS_AMHARA).exists()
    env_ref_ok = (data_dir / ENV_REF_NATIONAL).exists() or (data_dir / ENV_REF_AMHARA).exists()
    return woredas_ok and (data_dir / ENV_INFO).exists() and env_ref_ok


def load_report_woredas(data_dir: Path, geography: GeographyMode = "auto") -> pd.DataFrame:
    path = resolve_woredas_path(data_dir, geography=geography)
    woredas = pd.read_csv(path)
    if "woreda_name" not in woredas.columns:
        raise PipelineInputError(f"{path.name} must include 'woreda_name'")
    if "report" in woredas.columns:
        woredas = woredas[woredas["report"] == 1]
    return woredas


def report_woreda_names(data_dir: Path, geography: GeographyMode = "auto") -> set[str]:
    woredas = load_report_woredas(data_dir, geography=geography)
    return set(woredas["woreda_name"].astype(str))
