from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class EpiValidationResponse(BaseModel):
    ok: bool
    missing_columns: List[str] = Field(default_factory=list)
    row_count: int = 0
    district_count: int = 0
    matched_districts: int = 0
    unmatched_districts: List[str] = Field(default_factory=list)
    date_min: Optional[str] = None
    date_max: Optional[str] = None
    invalid_date_rows: int = 0
    message: str = ""


class ProjectSetupRequest(BaseModel):
    project_name: str = Field(default="EPIDEMIA Demo Project", min_length=1, max_length=120)
    horizon_weeks: int = Field(default=8, ge=1, le=52)
    default_species: Literal["pfm", "pv"] = Field(default="pfm")
    default_region: str = Field(default="All Regions")
    geography: Literal["amhara"] = Field(default="amhara")


class ProjectSetupResponse(BaseModel):
    project_id: str
    project_name: str
    data_dir: str
    output_dir: str
    default_species: Literal["pfm", "pv"]
    default_region: str
    horizon_weeks: int
    validation: EpiValidationResponse
    run: dict
