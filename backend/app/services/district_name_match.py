"""Match EPIDEMIA woreda names to admin3 district labels used in GeoJSON / WorldPop surfaces."""
from __future__ import annotations

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


def build_geojson_lookup(geojson: dict) -> Dict[str, dict]:
    lookup: Dict[str, dict] = {}
    for feature in geojson.get("features", []):
        name = feature.get("properties", {}).get("adm3_name")
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
    return lookup


def find_district_from_lookup(lookup: Dict[str, dict], district_name: object) -> Optional[dict]:
    if not lookup or district_name is None:
        return None

    raw = str(district_name)
    exact = lookup.get(raw) or lookup.get(normalize_district_key(raw))
    if exact:
        return exact

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
