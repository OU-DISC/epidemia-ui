"""Match EPIDEMIA woreda names to admin3 district labels used in GeoJSON / WorldPop surfaces."""
from __future__ import annotations

import csv
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Optional

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def normalize_district_key(value: object) -> str:
    if value is None or value == "":
        return ""
    text = str(value).strip().lower()
    text = re.sub(r"\s*\([^)]*\)\s*", " ", text)
    text = text.replace("&", "and")
    text = re.sub(r"[^a-z0-9]+", "", text)
    return text


def normalize_pcode(value: object) -> str:
    if value is None or value == "":
        return ""
    return str(value).strip().upper()


def district_pcode_from_properties(properties: Optional[dict]) -> Optional[str]:
    if not properties:
        return None
    code = properties.get("NewPCODE") or properties.get("adm3_pcode")
    if code is None or str(code).strip() == "":
        return None
    return str(code).strip()


def _replace_word(value: str, source: str, target: str) -> str:
    return re.sub(rf"\b{re.escape(source)}\b", target, value, flags=re.IGNORECASE)


def get_district_name_variants(value: object) -> List[str]:
    if value is None or value == "":
        return []

    raw = str(value).strip()
    variants = {raw}

    for item in list(variants):
        variants.add(re.sub(r"\s*\([^)]*\)\s*", " ", item).strip())

    for item in list(variants):
        variants.add(re.sub(r"\s+town\s+administration$", "", item, flags=re.IGNORECASE).strip())
        variants.add(re.sub(r"\s+town$", "", item, flags=re.IGNORECASE).strip())
        variants.add(re.sub(r"\s+zuriya$", " Zuria", item, flags=re.IGNORECASE).strip())
        variants.add(re.sub(r"\s+zuria$", " Zuriya", item, flags=re.IGNORECASE).strip())

    swaps = [
        ("Semen", "North"),
        ("Debub", "South"),
        ("Misrak", "East"),
        ("Mirab", "West"),
        ("Mekele", "Mekelle"),
        ("Bahirdar", "Bahir Dar"),
        ("Wemberma", "Womberma"),
        ("Sahila", "Sehela"),
        ("Denbecha", "Dembecha"),
        ("Adiss", "Addis"),
        ("Wereilu", "Were Ilu"),
        ("Debresina", "Debre Sina"),
        ("Legehida", "Lege Hida"),
        ("Dehena", "Dehana"),
        ("Gazgibla", "Gaz Gibla"),
    ]

    for source, target in swaps:
        for item in list(variants):
            variants.add(_replace_word(item, source, target).strip())
            variants.add(_replace_word(item, target, source).strip())

    return [item for item in variants if item]


@lru_cache(maxsize=1)
def load_woreda_pcode_crosswalk() -> Dict[str, str]:
    """Map woreda names and normalized keys to NewPCODE."""
    candidates = [
        BACKEND_ROOT / "data" / "ethiopia_woreda_pcode.json",
        BACKEND_ROOT.parent
        / "frontend"
        / "epidemia-ui"
        / "public"
        / "ethiopia_woreda_pcode.json",
        BACKEND_ROOT / "data" / "ethiopia_woredas.csv",
    ]

    json_path = next((p for p in candidates[:2] if p.exists()), None)
    if json_path is not None:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        merged: Dict[str, str] = {}
        for name, pcode in (payload.get("byName") or {}).items():
            merged[str(name)] = normalize_pcode(pcode)
        for key, pcode in (payload.get("byKey") or {}).items():
            merged[str(key)] = normalize_pcode(pcode)
        return merged

    csv_path = candidates[2]
    if not csv_path.exists():
        return {}

    merged = {}
    with csv_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            pcode = normalize_pcode(row.get("pcode") or row.get("NewPCODE"))
            name = str(row.get("woreda_name") or row.get("W_NAME") or "").strip()
            if not pcode or not name:
                continue
            merged[name] = pcode
            merged[normalize_district_key(name)] = pcode
            for variant in get_district_name_variants(name):
                merged[variant] = pcode
                key = normalize_district_key(variant)
                if key:
                    merged[key] = pcode
    return merged


def resolve_woreda_pcode(district_name: object) -> Optional[str]:
    crosswalk = load_woreda_pcode_crosswalk()
    if not crosswalk or district_name is None:
        return None
    raw = str(district_name).strip()
    if not raw:
        return None
    if raw in crosswalk:
        return crosswalk[raw]
    key = normalize_district_key(raw)
    if key in crosswalk:
        return crosswalk[key]
    for variant in get_district_name_variants(raw):
        if variant in crosswalk:
            return crosswalk[variant]
        variant_key = normalize_district_key(variant)
        if variant_key in crosswalk:
            return crosswalk[variant_key]
    return None


def build_geojson_lookup(geojson: dict) -> Dict[str, dict]:
    lookup: Dict[str, dict] = {}
    by_pcode: Dict[str, dict] = {}

    for feature in geojson.get("features", []):
        props = feature.get("properties", {})
        name = props.get("adm3_name")
        if not name:
            continue
        lookup[name] = feature
        lookup[normalize_district_key(name)] = feature
        for variant in get_district_name_variants(name):
            key = normalize_district_key(variant)
            if key and key not in lookup:
                lookup[key] = feature
            if variant and variant not in lookup:
                lookup[variant] = feature

        pcode = district_pcode_from_properties(props)
        if pcode:
            norm = normalize_pcode(pcode)
            by_pcode[norm] = feature
            lookup[norm] = feature
            lookup[pcode] = feature

    crosswalk = load_woreda_pcode_crosswalk()
    for name, pcode in crosswalk.items():
        if name.startswith("ET"):
            continue
        feature = by_pcode.get(normalize_pcode(pcode))
        if not feature:
            continue
        if name not in lookup:
            lookup[name] = feature
        key = normalize_district_key(name)
        if key and key not in lookup:
            lookup[key] = feature

    return lookup


def find_district_from_lookup(lookup: Dict[str, dict], district_name: object) -> Optional[dict]:
    if not lookup or district_name is None:
        return None

    raw = str(district_name)
    exact = lookup.get(raw) or lookup.get(normalize_district_key(raw))
    if exact:
        return exact

    maybe_pcode = normalize_pcode(raw)
    if maybe_pcode.startswith("ET") and maybe_pcode in lookup:
        return lookup[maybe_pcode]

    for variant in get_district_name_variants(raw):
        match = lookup.get(variant) or lookup.get(normalize_district_key(variant))
        if match:
            return match
    return None


@lru_cache(maxsize=1)
def load_geojson_lookup() -> Dict[str, dict]:
    candidates = [
        BACKEND_ROOT / "data" / "eth_admin3.geojson",
        BACKEND_ROOT.parent / "frontend" / "epidemia-ui" / "public" / "eth_admin3.geojson",
    ]
    for path in candidates:
        if not path.exists():
            continue
        geojson = json.loads(path.read_text(encoding="utf-8"))
        return build_geojson_lookup(geojson)
    return {}


def resolve_geojson_district_name(district_name: object) -> Optional[str]:
    feature = find_district_from_lookup(load_geojson_lookup(), district_name)
    if not feature:
        return None
    return feature.get("properties", {}).get("adm3_name")
