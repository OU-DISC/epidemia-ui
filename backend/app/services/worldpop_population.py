"""Load WorldPop district population surfaces for all Ethiopia admin3 districts."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

import pandas as pd

from app.services.district_name_match import (
    get_district_name_variants,
    normalize_district_key,
)

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _surface_candidates() -> list[Path]:
    return [
        BACKEND_ROOT / "data" / "ethiopia_admin3_population_surface_by_year.json",
        BACKEND_ROOT.parent / "frontend" / "epidemia-ui" / "public" / "ethiopia_admin3_population_surface_by_year.json",
        BACKEND_ROOT / "data" / "ethiopia_admin3_population_surface.json",
        BACKEND_ROOT.parent / "frontend" / "epidemia-ui" / "public" / "ethiopia_admin3_population_surface.json",
    ]


@lru_cache(maxsize=1)
def load_worldpop_surfaces_by_year() -> Dict[int, Dict[str, float]]:
    for path in _surface_candidates():
        if not path.exists():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            continue

        if path.name.endswith("_by_year.json"):
            out: Dict[int, Dict[str, float]] = {}
            for year_key, surface in payload.items():
                year = int(year_key)
                out[year] = {str(k): float(v) for k, v in (surface or {}).items()}
            if out:
                return out

        if path.name.endswith("_surface.json"):
            surface = {str(k): float(v) for k, v in payload.items()}
            default_year = max(2014, pd.Timestamp.utcnow().year)
            return {default_year: surface}

    return {}


def available_worldpop_years() -> list[int]:
    return sorted(load_worldpop_surfaces_by_year().keys())


def pick_worldpop_year(target_year: int, years: list[int]) -> Optional[int]:
    if not years:
        return None
    if target_year in years:
        return target_year
    earlier = [year for year in years if year <= target_year]
    if earlier:
        return max(earlier)
    return min(years)


def lookup_worldpop_population(
    district_name: object,
    year: int,
    surfaces_by_year: Optional[Dict[int, Dict[str, float]]] = None,
) -> Optional[float]:
    surfaces = surfaces_by_year or load_worldpop_surfaces_by_year()
    if not surfaces:
        return None

    surface_year = pick_worldpop_year(int(year), list(surfaces.keys()))
    if surface_year is None:
        return None

    surface = surfaces[surface_year]
    for candidate in get_district_name_variants(district_name):
        if candidate in surface:
            return float(surface[candidate])
        normalized = normalize_district_key(candidate)
        if normalized in surface:
            return float(surface[normalized])
    return None


def apply_worldpop_population(epi_data: pd.DataFrame) -> pd.DataFrame:
    """Replace ``pop_at_risk`` with WorldPop totals keyed by district name and year."""
    if epi_data.empty or "obs_date" not in epi_data.columns or "woreda_name" not in epi_data.columns:
        return epi_data

    surfaces = load_worldpop_surfaces_by_year()
    if not surfaces:
        return epi_data

    out = epi_data.copy()
    out["obs_date"] = pd.to_datetime(out["obs_date"], errors="coerce")
    out["pop_at_risk"] = pd.to_numeric(out.get("pop_at_risk"), errors="coerce")

    def _assign(row) -> float:
        year = int(pd.Timestamp(row["obs_date"]).year) if pd.notna(row["obs_date"]) else available_worldpop_years()[-1]
        population = lookup_worldpop_population(row["woreda_name"], year, surfaces)
        if population is not None and population > 0:
            return population
        existing = row.get("pop_at_risk")
        return float(existing) if pd.notna(existing) and float(existing) > 0 else float("nan")

    out["pop_at_risk"] = out.apply(_assign, axis=1)
    return out
