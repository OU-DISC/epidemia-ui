"""Convert HDX COD-AB eth_admin3.geojson into EPIDEMIA public map schema."""
from __future__ import annotations

import json
import shutil
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "boundaries" / "cod-ab-eth" / "extracted" / "geojson" / "eth_admin3.geojson"
PUBLIC = ROOT / "public"
OUT_GEO = PUBLIC / "eth_admin3.geojson"
BACKUP = PUBLIC / "eth_admin3.geojson.bak-pre-cod-ab-v04"


def pick(props: dict, *keys: str, default: str = "") -> str:
    for key in keys:
        value = props.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return default


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Source not found: {SRC}")

    print(f"Reading {SRC} ({SRC.stat().st_size / 1024 / 1024:.1f} MB)...")
    data = json.loads(SRC.read_text(encoding="utf-8"))
    features_in = data.get("features") or []
    print(f"Input features: {len(features_in)}")
    if not features_in:
        raise SystemExit("No features in source GeoJSON")

    sample = features_in[0].get("properties") or {}
    print("Sample property keys:", sorted(sample.keys()))
    print("Sample properties:", sample)

    features_out = []
    missing_pcode = 0
    for feat in features_in:
        props = feat.get("properties") or {}
        adm3_pcode = pick(props, "ADM3_PCODE", "adm3_pcode", "PCode", "pcode")
        adm3_name = pick(props, "ADM3_EN", "ADM3_NAME", "adm3_name", "W_NAME")
        adm2_name = pick(props, "ADM2_EN", "ADM2_NAME", "adm2_name", "Z_NAME")
        adm1_name = pick(props, "ADM1_EN", "ADM1_NAME", "adm1_name", "R_NAME")
        if not adm3_pcode:
            missing_pcode += 1
        features_out.append(
            {
                "type": "Feature",
                "properties": {
                    "NewPCODE": adm3_pcode,
                    "R_NAME": adm1_name,
                    "Z_NAME": adm2_name,
                    "W_NAME": adm3_name,
                    "adm3_pcode": adm3_pcode,
                    "adm1_name": adm1_name,
                    "adm2_name": adm2_name,
                    "adm3_name": adm3_name,
                },
                "geometry": feat.get("geometry"),
            }
        )

    out = {"type": "FeatureCollection", "features": features_out}
    if OUT_GEO.exists() and not BACKUP.exists():
        shutil.copy2(OUT_GEO, BACKUP)
        print(f"Backed up previous map to {BACKUP.name}")

    OUT_GEO.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_GEO} ({OUT_GEO.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"Output features: {len(features_out)}")
    print(f"Missing PCODE: {missing_pcode}")

    by_region = Counter(f["properties"]["adm1_name"] for f in features_out)
    print("By region:")
    for name, count in sorted(by_region.items(), key=lambda item: (-item[1], item[0])):
        print(f"  {name}: {count}")


if __name__ == "__main__":
    main()
