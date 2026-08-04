"""Merge COD-AB v04 admin3 names into ethiopia_woreda_pcode.json while keeping valid aliases."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
GEO = PUBLIC / "eth_admin3.geojson"
OUT = PUBLIC / "ethiopia_woreda_pcode.json"
BACKUP = PUBLIC / "ethiopia_woreda_pcode.json.bak-pre-cod-ab-v04"


def normalize_key(value: object) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s*\([^)]*\)\s*", " ", text)
    text = text.replace("&", "and")
    text = re.sub(r"\b(woreda|district|special|town|administration|adm)\b", " ", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def variants(value: str) -> list[str]:
    raw = str(value or "").strip()
    if not raw:
        return []
    out = {raw}
    for item in list(out):
        out.add(re.sub(r"\s*\([^)]*\)\s*", " ", item).strip())
        out.add(re.sub(r"\s+town\s+administration$", "", item, flags=re.I).strip())
        out.add(re.sub(r"\s+town$", "", item, flags=re.I).strip())
        out.add(re.sub(r"\s+zuriya$", " Zuria", item, flags=re.I).strip())
        out.add(re.sub(r"\s+zuria$", " Zuriya", item, flags=re.I).strip())
        out.add(item.replace("/", " ").replace("-", " ").strip())
    swaps = [
        ("Semen", "North"),
        ("Debub", "South"),
        ("Misrak", "East"),
        ("Mirab", "West"),
        ("Mekele", "Mekelle"),
        ("Bahirdar", "Bahir Dar"),
        ("Adiss", "Addis"),
    ]
    for a, b in swaps:
        for item in list(out):
            out.add(re.sub(rf"\b{a}\b", b, item, flags=re.I).strip())
            out.add(re.sub(rf"\b{b}\b", a, item, flags=re.I).strip())
    return [x for x in out if x]


def main() -> None:
    geo = json.loads(GEO.read_text(encoding="utf-8"))
    valid_pcodes = {}
    by_name: dict[str, str] = {}
    by_key: dict[str, str] = {}

    for feat in geo["features"]:
        props = feat["properties"]
        pcode = str(props.get("adm3_pcode") or "").strip()
        name = str(props.get("adm3_name") or "").strip()
        if not pcode or not name:
            continue
        valid_pcodes[pcode] = name
        by_name[name] = pcode
        by_key[normalize_key(name)] = pcode
        for variant in variants(name):
            by_name.setdefault(variant, pcode)
            key = normalize_key(variant)
            if key:
                by_key.setdefault(key, pcode)

    old = {}
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8"))
        if not BACKUP.exists():
            BACKUP.write_text(OUT.read_text(encoding="utf-8"), encoding="utf-8")
            print(f"Backed up previous crosswalk to {BACKUP.name}")

    kept_aliases = 0
    dropped_aliases = 0
    for name, pcode in (old.get("byName") or {}).items():
        pcode = str(pcode or "").strip()
        if pcode in valid_pcodes:
            if name not in by_name:
                by_name[name] = pcode
                kept_aliases += 1
        else:
            dropped_aliases += 1

    for key, pcode in (old.get("byKey") or {}).items():
        pcode = str(pcode or "").strip()
        if pcode in valid_pcodes:
            by_key.setdefault(key, pcode)
        else:
            dropped_aliases += 1

    payload = {"byName": by_name, "byKey": by_key}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Valid COD pcodes: {len(valid_pcodes)}")
    print(f"byName entries: {len(by_name)}")
    print(f"byKey entries: {len(by_key)}")
    print(f"Kept old aliases: {kept_aliases}")
    print(f"Dropped stale aliases: {dropped_aliases}")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
