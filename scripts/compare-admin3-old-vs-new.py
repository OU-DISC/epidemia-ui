"""Compare old EPIDEMIA admin3 boundaries with new COD-AB v04 admin3.

Writes a CSV with one row per unique PCODE (union of old + new), including
geodesic polygon areas (km²) for old and new geometries.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

from pyproj import Geod
from shapely.geometry import shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OLD_GEO = PUBLIC / "eth_admin3.geojson.bak-pre-cod-ab-v04"
NEW_GEO = PUBLIC / "eth_admin3.geojson"
OUT_CSV = PUBLIC / "eth_admin3_old_vs_new_cod_ab_v04.csv"
OUT_SUMMARY = PUBLIC / "eth_admin3_old_vs_new_cod_ab_v04_summary.json"

# WGS84 geodesic area — appropriate for lon/lat GeoJSON polygons.
GEOD = Geod(ellps="WGS84")


def _count_points(coords) -> int:
    if not coords:
        return 0
    if isinstance(coords[0], (int, float)):
        return 1
    total = 0
    for item in coords:
        total += _count_points(item)
    return total


def polygon_area_km2(geometry: dict | None) -> float | None:
    """Return absolute geodesic area in km² for a GeoJSON geometry."""
    if not geometry:
        return None
    try:
        geom = shape(geometry)
        if geom.is_empty:
            return None
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            return None
        # Multi-part: sum absolute areas of parts.
        if geom.geom_type == "GeometryCollection":
            parts = [g for g in geom.geoms if not g.is_empty]
            if not parts:
                return None
            geom = unary_union(parts)
        area_m2, _perimeter_m = GEOD.geometry_area_perimeter(geom)
        return abs(float(area_m2)) / 1_000_000.0
    except Exception:
        return None


def load_index(path: Path) -> dict[str, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    by_pcode: dict[str, dict] = {}
    for feat in data.get("features") or []:
        props = feat.get("properties") or {}
        pcode = str(props.get("adm3_pcode") or props.get("NewPCODE") or "").strip()
        if not pcode:
            continue
        geom = feat.get("geometry") or {}
        area_km2 = polygon_area_km2(geom)
        by_pcode[pcode] = {
            "adm3_name": str(props.get("adm3_name") or props.get("W_NAME") or "").strip(),
            "adm2_name": str(props.get("adm2_name") or props.get("Z_NAME") or "").strip(),
            "adm1_name": str(props.get("adm1_name") or props.get("R_NAME") or "").strip(),
            "geometry_type": geom.get("type") or "",
            "coord_points": _count_points(geom.get("coordinates") or []),
            "area_km2": area_km2,
        }
    return by_pcode


def norm_name(value: str) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def fmt_area(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.6f}"


def main() -> None:
    if not OLD_GEO.exists():
        raise SystemExit(f"Old geojson not found: {OLD_GEO}")
    if not NEW_GEO.exists():
        raise SystemExit(f"New geojson not found: {NEW_GEO}")

    print("Loading old polygons and computing areas...")
    old = load_index(OLD_GEO)
    print(f"  old features with pcode: {len(old)}")
    print("Loading new polygons and computing areas...")
    new = load_index(NEW_GEO)
    print(f"  new features with pcode: {len(new)}")

    all_pcodes = sorted(set(old) | set(new))

    old_by_name = defaultdict(list)
    new_by_name = defaultdict(list)
    for pcode, row in old.items():
        old_by_name[norm_name(row["adm3_name"])].append(pcode)
    for pcode, row in new.items():
        new_by_name[norm_name(row["adm3_name"])].append(pcode)

    rows = []
    status_counts = defaultdict(int)

    for pcode in all_pcodes:
        o = old.get(pcode)
        n = new.get(pcode)
        if o and n:
            name_same = o["adm3_name"] == n["adm3_name"]
            region_same = o["adm1_name"] == n["adm1_name"]
            zone_same = o["adm2_name"] == n["adm2_name"]
            if name_same and region_same and zone_same:
                status = "matched_same_attributes"
            elif name_same:
                status = "matched_name_same_admin_changed"
            else:
                status = "matched_pcode_name_changed"
        elif o and not n:
            candidates = new_by_name.get(norm_name(o["adm3_name"]), [])
            status = "only_in_old"
            if candidates:
                status = "only_in_old_name_exists_under_other_pcode"
        else:
            candidates = old_by_name.get(norm_name(n["adm3_name"]), [])
            status = "only_in_new"
            if candidates:
                status = "only_in_new_name_existed_under_other_pcode"

        status_counts[status] += 1

        other_pcodes = ""
        if status.startswith("only_in_old"):
            other_pcodes = ";".join(new_by_name.get(norm_name(o["adm3_name"]), []))
        elif status.startswith("only_in_new"):
            other_pcodes = ";".join(old_by_name.get(norm_name(n["adm3_name"]), []))

        old_area = (o or {}).get("area_km2")
        new_area = (n or {}).get("area_km2")
        area_delta = ""
        area_pct_change = ""
        if isinstance(old_area, (int, float)) and isinstance(new_area, (int, float)):
            area_delta = new_area - old_area
            if old_area > 0:
                area_pct_change = 100.0 * (new_area - old_area) / old_area

        rows.append(
            {
                "status": status,
                "adm3_pcode": pcode,
                "old_adm3_name": (o or {}).get("adm3_name", ""),
                "new_adm3_name": (n or {}).get("adm3_name", ""),
                "name_changed": (
                    "yes"
                    if o and n and o["adm3_name"] != n["adm3_name"]
                    else ("no" if o and n else "")
                ),
                "old_adm2_name": (o or {}).get("adm2_name", ""),
                "new_adm2_name": (n or {}).get("adm2_name", ""),
                "old_adm1_name": (o or {}).get("adm1_name", ""),
                "new_adm1_name": (n or {}).get("adm1_name", ""),
                "region_changed": (
                    "yes"
                    if o and n and o["adm1_name"] != n["adm1_name"]
                    else ("no" if o and n else "")
                ),
                "old_area_km2": fmt_area(old_area if isinstance(old_area, (int, float)) else None),
                "new_area_km2": fmt_area(new_area if isinstance(new_area, (int, float)) else None),
                "area_delta_km2": (
                    f"{area_delta:.6f}" if isinstance(area_delta, float) else ""
                ),
                "area_pct_change": (
                    f"{area_pct_change:.4f}" if isinstance(area_pct_change, float) else ""
                ),
                "old_coord_points": (o or {}).get("coord_points", ""),
                "new_coord_points": (n or {}).get("coord_points", ""),
                "coord_points_delta": (
                    (n["coord_points"] - o["coord_points"]) if o and n else ""
                ),
                "other_pcodes_same_name": other_pcodes,
                "in_old": "yes" if o else "no",
                "in_new": "yes" if n else "no",
            }
        )

    fieldnames = [
        "status",
        "adm3_pcode",
        "old_adm3_name",
        "new_adm3_name",
        "name_changed",
        "old_adm2_name",
        "new_adm2_name",
        "old_adm1_name",
        "new_adm1_name",
        "region_changed",
        "old_area_km2",
        "new_area_km2",
        "area_delta_km2",
        "area_pct_change",
        "old_coord_points",
        "new_coord_points",
        "coord_points_delta",
        "other_pcodes_same_name",
        "in_old",
        "in_new",
    ]

    priority = {
        "matched_pcode_name_changed": 0,
        "matched_name_same_admin_changed": 1,
        "only_in_old_name_exists_under_other_pcode": 2,
        "only_in_new_name_existed_under_other_pcode": 3,
        "only_in_old": 4,
        "only_in_new": 5,
        "matched_same_attributes": 6,
    }
    rows.sort(key=lambda r: (priority.get(r["status"], 99), r["adm3_pcode"]))

    with OUT_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    old_total = sum(r["area_km2"] for r in old.values() if isinstance(r["area_km2"], (int, float)))
    new_total = sum(r["area_km2"] for r in new.values() if isinstance(r["area_km2"], (int, float)))
    matched_both = [
        p
        for p in all_pcodes
        if isinstance((old.get(p) or {}).get("area_km2"), (int, float))
        and isinstance((new.get(p) or {}).get("area_km2"), (int, float))
    ]
    matched_old_area = sum(old[p]["area_km2"] for p in matched_both)
    matched_new_area = sum(new[p]["area_km2"] for p in matched_both)

    summary = {
        "old_file": str(OLD_GEO.name),
        "new_file": str(NEW_GEO.name),
        "area_method": "WGS84 geodesic (pyproj.Geod), absolute area in km^2",
        "old_feature_count": len(old),
        "new_feature_count": len(new),
        "union_pcode_count": len(all_pcodes),
        "old_total_area_km2": round(old_total, 3),
        "new_total_area_km2": round(new_total, 3),
        "matched_pcode_count_with_area": len(matched_both),
        "matched_old_area_km2": round(matched_old_area, 3),
        "matched_new_area_km2": round(matched_new_area, 3),
        "matched_area_delta_km2": round(matched_new_area - matched_old_area, 3),
        "status_counts": dict(sorted(status_counts.items())),
        "output_csv": str(OUT_CSV.name),
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Wrote {OUT_CSV}")
    print(f"Wrote {OUT_SUMMARY}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
