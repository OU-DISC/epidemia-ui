"""Read/write EPIDEMIA forecast cache metadata and serve cached pipeline results."""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Optional

from app.schemas.epidemia import EpidemiaRunRequest, EpidemiaRunResponse
from app.services.district_data import resolve_env_ref_path, resolve_woredas_path
from app.services.pipeline_input_error import PipelineInputError

CACHE_META_NAME = "cache_meta.json"
REPORT_NAME = "report_data.json"
BOOTSTRAP_NAME = "report_bootstrap.json"
MAP_BOOTSTRAP_NAME = "report_map_bootstrap.json"
DISTRICT_CACHE_DIR = "district_forecasts"
BACKEND_ROOT = Path(__file__).resolve().parents[2]

_REPORT_PAYLOAD_CACHE: dict[str, tuple[float, int, dict]] = {}


def _resolve_runtime_path(path_str: str, must_exist: bool = False) -> Path:
    path = Path(path_str)
    if path.is_absolute():
        return path
    cwd_candidate = (Path.cwd() / path).resolve()
    if not must_exist or cwd_candidate.exists():
        return cwd_candidate
    return (BACKEND_ROOT / path).resolve()


def _has_env_source(data_dir: Path) -> bool:
    return (data_dir / "env_data.csv").exists() or (data_dir / "data_environmental").exists()


def _has_epi_source(data_dir: Path) -> bool:
    return (data_dir / "epi_data.csv").exists() or (data_dir / "data_epidemiological").exists()

def _fingerprint_file(path: Path) -> str:
    if not path.exists():
        return f"missing:{path.name}"
    stat = path.stat()
    return f"{path.name}:{stat.st_size}:{int(stat.st_mtime)}"


def compute_data_fingerprint(req: EpidemiaRunRequest) -> str:
    data_dir = _resolve_runtime_path(req.data_dir)
    parts = [
        _fingerprint_file(resolve_woredas_path(data_dir)),
        _fingerprint_file(resolve_env_ref_path(data_dir)),
        _fingerprint_file(data_dir / "epi_data.csv"),
        _fingerprint_file(data_dir / "env_data.csv"),
        f"horizon:{req.horizon_weeks}",
        f"env_start:{req.env_start_year}-W{req.env_start_week}",
    ]
    if not (data_dir / "epi_data.csv").exists():
        parts.append(f"epi_dir:{_has_epi_source(data_dir)}")
    if not (data_dir / "env_data.csv").exists():
        parts.append(f"env_dir:{_has_env_source(data_dir)}")
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return digest[:16]


def cache_meta_path(req: EpidemiaRunRequest) -> Path:
    return _resolve_runtime_path(req.output_dir) / CACHE_META_NAME


def report_json_path(req: EpidemiaRunRequest) -> Path:
    return _resolve_runtime_path(req.output_dir) / REPORT_NAME


def read_cache_meta(req: EpidemiaRunRequest) -> Optional[dict]:
    path = cache_meta_path(req)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def write_cache_meta(req: EpidemiaRunRequest, meta: dict) -> Path:
    out_dir = _resolve_runtime_path(req.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / CACHE_META_NAME
    path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return path


def cache_is_valid(req: EpidemiaRunRequest) -> bool:
    report_path = report_json_path(req)
    if not report_path.exists():
        return False
    meta = read_cache_meta(req)
    if not meta:
        return False
    expected = compute_data_fingerprint(req)
    # Fingerprint match is enough to serve. Horizon may be longer or shorter than
    # requested; load_cached_response truncates when the cache is longer.
    return meta.get("data_fingerprint") == expected


def _truncate_payload_horizon(payload: dict, horizon_weeks: int) -> dict:
    """Trim forecast points when the cache was built with a longer horizon."""
    horizon_weeks = int(horizon_weeks)
    for forecast in payload.get("forecasts") or []:
        points = forecast.get("forecast") or []
        if len(points) > horizon_weeks:
            forecast["forecast"] = points[:horizon_weeks]
    return payload


def load_cached_response(req: EpidemiaRunRequest) -> Optional[EpidemiaRunResponse]:
    if not cache_is_valid(req):
        return None
    report_path = report_json_path(req)
    with report_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    payload = _truncate_payload_horizon(payload, req.horizon_weeks)
    payload.setdefault("artifacts", {"report_data": str(report_path)})
    payload["message"] = "Loaded cached EPIDEMIA forecast"
    return EpidemiaRunResponse.model_validate(payload)


def report_history_depth(payload: dict) -> int:
    forecasts = payload.get("forecasts") or []
    if not forecasts:
        return 0
    return max(len(forecast.get("observed_history") or []) for forecast in forecasts)


def candidate_report_paths(output_dir: str = "report") -> list[Path]:
    primary = _resolve_runtime_path(output_dir) / REPORT_NAME
    candidates = [primary]
    for extra in (
        BACKEND_ROOT.parent / "public" / REPORT_NAME,
        BACKEND_ROOT.parent / "frontend" / "epidemia-ui" / "public" / REPORT_NAME,
    ):
        if extra not in candidates:
            candidates.append(extra)
    return candidates


def resolve_best_report_json(output_dir: str = "report") -> Path:
    """Pick the richest cached report without parsing large JSON on every request."""
    candidates = [path for path in candidate_report_paths(output_dir) if path.exists()]
    if not candidates:
        primary = _resolve_runtime_path(output_dir) / REPORT_NAME
        raise PipelineInputError(
            f"No cached EPIDEMIA report found for {output_dir}. Run the pipeline first."
        )

    primary = _resolve_runtime_path(output_dir) / REPORT_NAME
    if primary.exists():
        return primary

    return max(candidates, key=lambda path: path.stat().st_size)


def _read_report_payload(report_json: Path) -> dict:
    stat = report_json.stat()
    cache_key = str(report_json.resolve())
    cached = _REPORT_PAYLOAD_CACHE.get(cache_key)
    if cached and cached[0] == stat.st_mtime and cached[1] == stat.st_size:
        return cached[2]

    with report_json.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    _REPORT_PAYLOAD_CACHE[cache_key] = (stat.st_mtime, stat.st_size, payload)
    return payload


def load_latest_report_payload(output_dir: str = "report") -> tuple[dict, Path]:
    report_json = resolve_best_report_json(output_dir)
    return _read_report_payload(report_json), report_json


def _trim_observed_history(
    history: list,
    *,
    max_weeks: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list:
    rows = [row for row in (history or []) if row.get("week_start")]
    rows.sort(key=lambda row: str(row["week_start"]))
    if start_date:
        rows = [row for row in rows if str(row["week_start"]) >= start_date]
    if end_date:
        rows = [row for row in rows if str(row["week_start"]) <= end_date]
    if max_weeks is not None and max_weeks > 0:
        rows = rows[-max_weeks:]
    return rows


def build_map_bootstrap_payload(payload: dict) -> dict:
    """Minimal startup payload for the map: alerts and metadata only."""
    return {
        "message": payload.get("message") or "Loaded map EPIDEMIA forecast",
        "generated_at": payload.get("generated_at") or "",
        "inputs_used": payload.get("inputs_used") or {},
        "alerts": payload.get("alerts") or [],
        "forecasts": [],
        "artifacts": payload.get("artifacts") or {},
    }


def build_bootstrap_payload(payload: dict, history_weeks: int = 16) -> dict:
    """Small startup payload: alerts, forecast horizon, and recent observed history only."""
    forecasts = []
    for forecast in payload.get("forecasts") or []:
        forecasts.append(
            {
                "district": forecast.get("district"),
                "species": forecast.get("species"),
                "history_points": forecast.get("history_points"),
                "forecast": forecast.get("forecast") or [],
                "observed_history": _trim_observed_history(
                    forecast.get("observed_history") or [],
                    max_weeks=history_weeks,
                ),
            }
        )

    return {
        "message": payload.get("message") or "Loaded bootstrap EPIDEMIA forecast",
        "generated_at": payload.get("generated_at") or "",
        "inputs_used": payload.get("inputs_used") or {},
        "alerts": payload.get("alerts") or [],
        "forecasts": forecasts,
        "artifacts": payload.get("artifacts") or {},
    }


def map_bootstrap_json_paths(output_dir: str = "report") -> list[Path]:
    primary = _resolve_runtime_path(output_dir) / MAP_BOOTSTRAP_NAME
    paths = [primary]
    for extra in (
        BACKEND_ROOT.parent / "public" / MAP_BOOTSTRAP_NAME,
        BACKEND_ROOT.parent / "frontend" / "epidemia-ui" / "public" / MAP_BOOTSTRAP_NAME,
    ):
        if extra not in paths:
            paths.append(extra)
    return paths


def _write_map_bootstrap_copies(bootstrap: dict, report_json: Path) -> None:
    payload = json.dumps(bootstrap, separators=(",", ":"))
    for path in map_bootstrap_json_paths("report"):
        try:
            if path.parent.exists():
                path.write_text(payload, encoding="utf-8")
        except OSError:
            continue

    report_dir = report_json.parent / MAP_BOOTSTRAP_NAME
    try:
        report_dir.write_text(payload, encoding="utf-8")
    except OSError:
        pass


def bootstrap_json_paths(output_dir: str = "report") -> list[Path]:
    primary = _resolve_runtime_path(output_dir) / BOOTSTRAP_NAME
    paths = [primary]
    for extra in (
        BACKEND_ROOT.parent / "public" / BOOTSTRAP_NAME,
        BACKEND_ROOT.parent / "frontend" / "epidemia-ui" / "public" / BOOTSTRAP_NAME,
    ):
        if extra not in paths:
            paths.append(extra)
    return paths


def _write_bootstrap_copies(bootstrap: dict, report_json: Path) -> None:
    payload = json.dumps(bootstrap, separators=(",", ":"))
    for path in bootstrap_json_paths("report"):
        try:
            if path.parent.exists():
                path.write_text(payload, encoding="utf-8")
        except OSError:
            continue

    report_dir = report_json.parent / BOOTSTRAP_NAME
    try:
        report_dir.write_text(payload, encoding="utf-8")
    except OSError:
        pass


def _read_json_file(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _load_standalone_bootstrap(
    paths: list[Path],
    *,
    is_valid,
) -> tuple[dict, Path] | None:
    for bootstrap_path in paths:
        if not bootstrap_path.exists():
            continue
        payload = _read_json_file(bootstrap_path)
        if payload and is_valid(payload):
            return payload, bootstrap_path
    return None


def load_map_bootstrap_report_payload(output_dir: str = "report") -> tuple[dict, Path]:
    standalone = _load_standalone_bootstrap(
        map_bootstrap_json_paths(output_dir),
        is_valid=lambda payload: payload.get("alerts") is not None,
    )
    if standalone:
        return standalone

    report_json = resolve_best_report_json(output_dir)
    report_stat = report_json.stat()

    for bootstrap_path in map_bootstrap_json_paths(output_dir):
        if not bootstrap_path.exists():
            continue
        bootstrap_stat = bootstrap_path.stat()
        if bootstrap_stat.st_mtime >= report_stat.st_mtime:
            payload = _read_json_file(bootstrap_path)
            if payload and payload.get("alerts") is not None:
                return payload, report_json

    payload = _read_report_payload(report_json)
    bootstrap = build_map_bootstrap_payload(payload)
    _write_map_bootstrap_copies(bootstrap, report_json)
    return bootstrap, report_json


def load_bootstrap_report_payload(
    output_dir: str = "report", history_weeks: int = 16
) -> tuple[dict, Path]:
    standalone = _load_standalone_bootstrap(
        bootstrap_json_paths(output_dir),
        is_valid=lambda payload: bool(payload.get("forecasts")),
    )
    if standalone:
        return standalone

    report_json = resolve_best_report_json(output_dir)
    report_stat = report_json.stat()

    for bootstrap_path in bootstrap_json_paths(output_dir):
        if not bootstrap_path.exists():
            continue
        bootstrap_stat = bootstrap_path.stat()
        if bootstrap_stat.st_mtime >= report_stat.st_mtime:
            try:
                payload = json.loads(bootstrap_path.read_text(encoding="utf-8"))
                if payload.get("forecasts"):
                    return payload, report_json
            except (OSError, json.JSONDecodeError):
                continue

    payload = _read_report_payload(report_json)
    bootstrap = build_bootstrap_payload(payload, history_weeks=history_weeks)
    _write_bootstrap_copies(bootstrap, report_json)
    return bootstrap, report_json


def _normalize_district_label(value: str) -> str:
    import re

    text = str(value or "").strip().lower()
    text = re.sub(r"\s*/\s*", "/", text)
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_district_key(value: str) -> str:
    """Match frontend normalizeDistrictKey for cache file names."""
    import re

    text = str(value or "").strip().lower()
    text = re.sub(r"\s*\([^)]*\)\s*", " ", text)
    text = text.replace("&", "and")
    text = re.sub(r"[^a-z0-9]+", "", text)
    return text


def district_forecast_cache_path_for_report(
    report_json: Path, district: str, species: str
) -> Path:
    species_norm = str(species or "pfm").strip().lower()
    cache_key = normalize_district_key(district)
    return report_json.parent / DISTRICT_CACHE_DIR / species_norm / f"{cache_key}.json"


def district_forecast_cache_path(
    output_dir: str, district: str, species: str
) -> Path:
    report_json = resolve_best_report_json(output_dir)
    return district_forecast_cache_path_for_report(report_json, district, species)


def district_forecast_cache_paths_public(species: str, district: str) -> list[Path]:
    species_norm = str(species or "pfm").strip().lower()
    cache_key = normalize_district_key(district)
    rel = Path(DISTRICT_CACHE_DIR) / species_norm / f"{cache_key}.json"
    paths = [
        BACKEND_ROOT.parent / "public" / rel,
        BACKEND_ROOT.parent / "frontend" / "epidemia-ui" / "public" / rel,
    ]
    return paths


def district_forecast_cache_search_paths(
    output_dir: str, district: str, species: str
) -> list[Path]:
    """All candidate on-disk district cache files for a district/species pair."""
    species_norm = str(species or "pfm").strip().lower()
    cache_key = normalize_district_key(district)
    rel = Path(DISTRICT_CACHE_DIR) / species_norm / f"{cache_key}.json"
    report_dir = _resolve_runtime_path(output_dir)
    paths = [
        report_dir / rel,
        BACKEND_ROOT / "report" / rel,
    ]
    for public_path in district_forecast_cache_paths_public(species, district):
        if public_path not in paths:
            paths.append(public_path)
    return paths


def _try_load_district_cache_file(
    district: str, species: str, output_dir: str = "report"
) -> dict | None:
    """Load a per-district cache file without requiring report_data.json."""
    for cache_path in district_forecast_cache_search_paths(output_dir, district, species):
        if not cache_path.exists():
            continue
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not cached.get("district"):
            continue
        cached_name = str(cached.get("district") or "")
        if cached_name == district.strip():
            return cached
        if _normalize_district_label(cached_name) == _normalize_district_label(district):
            return cached
    return None


def district_forecast_payload_from_row(forecast: dict) -> dict:
    return {
        "district": forecast.get("district"),
        "species": forecast.get("species"),
        "history_points": forecast.get("history_points"),
        "forecast": forecast.get("forecast") or [],
        "observed_history": forecast.get("observed_history") or [],
    }


def _write_district_forecast_cache(
    report_json: Path, forecast: dict
) -> Path:
    district = str(forecast.get("district") or "")
    species = str(forecast.get("species") or "pfm")
    cache_path = district_forecast_cache_path_for_report(report_json, district, species)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        district_forecast_payload_from_row(forecast),
        separators=(",", ":"),
    )
    cache_path.write_text(payload, encoding="utf-8")

    for public_path in district_forecast_cache_paths_public(species, district):
        try:
            public_path.parent.mkdir(parents=True, exist_ok=True)
            public_path.write_text(payload, encoding="utf-8")
        except OSError:
            continue

    return cache_path


def write_all_district_forecast_caches(
    output_dir: str = "report", payload: dict | None = None, report_json: Path | None = None
) -> int:
    """Write one small JSON file per district/species for fast chart loads."""
    if report_json is None:
        report_json = resolve_best_report_json(output_dir)
    if payload is None:
        payload = _read_report_payload(report_json)

    written = 0
    for forecast in payload.get("forecasts") or []:
        district = forecast.get("district")
        species = forecast.get("species")
        if not district or not species:
            continue
        _write_district_forecast_cache(report_json, forecast)
        written += 1
    return written


def _load_district_forecast_row(
    report_json: Path,
    district: str,
    species: str,
) -> dict:
    cache_path = district_forecast_cache_path_for_report(report_json, district, species)
    report_stat = report_json.stat()

    if cache_path.exists() and cache_path.stat().st_mtime >= report_stat.st_mtime:
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            if cached.get("district"):
                return cached
        except (OSError, json.JSONDecodeError):
            pass

    for public_path in district_forecast_cache_paths_public(species, district):
        if not public_path.exists():
            continue
        public_stat = public_path.stat()
        if public_stat.st_mtime >= report_stat.st_mtime:
            try:
                cached = json.loads(public_path.read_text(encoding="utf-8"))
                if cached.get("district"):
                    _write_district_forecast_cache(report_json, cached)
                    return cached
            except (OSError, json.JSONDecodeError):
                continue

    payload = _read_report_payload(report_json)
    forecast = _find_district_forecast(payload.get("forecasts") or [], district, species)
    if forecast is None:
        raise PipelineInputError(
            f"No forecast found for district '{district.strip()}' and species '{species}'."
        )

    row = district_forecast_payload_from_row(forecast)
    _write_district_forecast_cache(report_json, forecast)
    return row


def _find_district_forecast(
    forecasts: list,
    district: str,
    species: str,
) -> dict | None:
    species_norm = str(species or "pfm").strip().lower()
    target_norm = _normalize_district_label(district)

    for forecast in forecasts or []:
        if str(forecast.get("species") or "").lower() != species_norm:
            continue
        report_name = str(forecast.get("district") or "")
        if report_name == district.strip():
            return forecast
        if _normalize_district_label(report_name) == target_norm:
            return forecast

    return None


def load_district_forecast_payload(
    output_dir: str = "report",
    district: str = "",
    species: str = "pfm",
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    if not district.strip():
        raise PipelineInputError("district is required")

    forecast = _try_load_district_cache_file(district, species, output_dir)
    if forecast is None:
        report_json = resolve_best_report_json(output_dir)
        forecast = _load_district_forecast_row(report_json, district, species)

    observed_history = forecast.get("observed_history") or []
    if start_date or end_date:
        observed_history = _trim_observed_history(
            observed_history,
            start_date=start_date,
            end_date=end_date,
        )
    else:
        observed_history = _trim_observed_history(observed_history, max_weeks=104)

    return {
        "district": forecast.get("district"),
        "species": forecast.get("species"),
        "history_points": forecast.get("history_points"),
        "forecast": forecast.get("forecast") or [],
        "observed_history": observed_history,
    }


def publish_report_copy(report_json: Path, backend_root: Path) -> list[str]:
    """Copy report JSON to frontend public folders for static fallback."""
    targets = [
        backend_root.parent / "public" / REPORT_NAME,
        backend_root.parent / "frontend" / "epidemia-ui" / "public" / REPORT_NAME,
    ]
    copied: list[str] = []
    for target in targets:
        if not target.parent.exists():
            continue
        shutil.copy2(report_json, target)
        copied.append(str(target))

    try:
        payload = _read_report_payload(report_json)
        map_bootstrap = build_map_bootstrap_payload(payload)
        bootstrap = build_bootstrap_payload(payload, history_weeks=16)
        _write_map_bootstrap_copies(map_bootstrap, report_json)
        _write_bootstrap_copies(bootstrap, report_json)
        write_all_district_forecast_caches(payload=payload, report_json=report_json)
    except (OSError, json.JSONDecodeError, PipelineInputError):
        pass

    return copied


def cache_status(req: EpidemiaRunRequest) -> dict:
    report_path = report_json_path(req)
    meta = read_cache_meta(req) or {}
    valid = cache_is_valid(req)
    return {
        "valid": valid,
        "report_path": str(report_path),
        "report_exists": report_path.exists(),
        "data_fingerprint": compute_data_fingerprint(req),
        "cached_fingerprint": meta.get("data_fingerprint"),
        "generated_at": meta.get("generated_at"),
        "horizon_weeks": meta.get("horizon_weeks"),
        "district_count": meta.get("district_count"),
        "forecast_count": meta.get("forecast_count"),
        "elapsed_seconds": meta.get("elapsed_seconds"),
    }
