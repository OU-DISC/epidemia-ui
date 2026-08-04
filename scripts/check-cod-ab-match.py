"""Quick match check: forecast districts vs new COD-AB admin3 map."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"


def norm(value: str) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def main() -> None:
    geo = json.loads((PUBLIC / "eth_admin3.geojson").read_text(encoding="utf-8"))
    by_pcode = {}
    by_name = {}
    for feat in geo["features"]:
        props = feat["properties"]
        pcode = props.get("adm3_pcode")
        name = props.get("adm3_name")
        if pcode:
            by_pcode[str(pcode)] = name
        if name:
            by_name[norm(name)] = props

    crosswalk = None
    cw_path = PUBLIC / "ethiopia_woreda_pcode.json"
    if cw_path.exists():
        crosswalk = json.loads(cw_path.read_text(encoding="utf-8"))

    bootstrap = json.loads((PUBLIC / "report_bootstrap.json").read_text(encoding="utf-8"))
    alerts = bootstrap.get("alerts") or []
    districts = sorted({a.get("district") for a in alerts if a.get("district")})
    print(f"Forecast districts: {len(districts)}")
    print(f"Map polygons: {len(geo['features'])}")

    matched_name = 0
    matched_pcode = 0
    unmatched = []
    for district in districts:
        hit = by_name.get(norm(district))
        pcode = None
        if crosswalk:
            pcode = (crosswalk.get("byName") or {}).get(district) or (crosswalk.get("byKey") or {}).get(
                norm(district)
            )
        if pcode and pcode in by_pcode:
            matched_pcode += 1
            continue
        if hit:
            matched_name += 1
            continue
        unmatched.append(district)

    print(f"Matched by pcode crosswalk: {matched_pcode}")
    print(f"Matched by name only: {matched_name}")
    print(f"Unmatched: {len(unmatched)}")
    print("Sample unmatched:", unmatched[:25])


if __name__ == "__main__":
    main()
