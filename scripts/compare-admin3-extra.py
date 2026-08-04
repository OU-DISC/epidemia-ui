"""Extra old-vs-new Admin3 comparisons for EPIDEMIA.

Outputs (in public/):
  1) eth_admin3_shared_pcode_geometry_compare.csv
       - IoU, intersection/union areas, centroid shift for shared PCODEs
  2) eth_admin3_split_merge_links.csv
       - old↔new overlap links (candidate splits/merges)
  3) eth_admin3_forecast_coverage_new_map.csv
       - each forecast district vs new COD map match status
  4) eth_admin3_region_rollup_old_vs_new.csv
       - district count + total area by adm1 for old and new
  5) eth_admin3_extra_comparisons_summary.json
"""
from __future__ import annotations

import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path

from pyproj import Geod, Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OLD_GEO = PUBLIC / "eth_admin3.geojson.bak-pre-cod-ab-v04"
NEW_GEO = PUBLIC / "eth_admin3.geojson"
CROSSWALK = PUBLIC / "ethiopia_woreda_pcode.json"
BOOTSTRAP = PUBLIC / "report_bootstrap.json"

OUT_SHARED = PUBLIC / "eth_admin3_shared_pcode_geometry_compare.csv"
OUT_LINKS = PUBLIC / "eth_admin3_split_merge_links.csv"
OUT_FORECAST = PUBLIC / "eth_admin3_forecast_coverage_new_map.csv"
OUT_REGION = PUBLIC / "eth_admin3_region_rollup_old_vs_new.csv"
OUT_SUMMARY = PUBLIC / "eth_admin3_extra_comparisons_summary.json"

GEOD = Geod(ellps="WGS84")

# Africa Albers Equal Area Conic (recommended for COD-AB Ethiopia cartography).
AFRICA_ALBERS = (
    "+proj=aea +lat_1=20 +lat_2=-23 +lat_0=0 +lon_0=25 "
    "+x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
)
TO_AEA = Transformer.from_crs("EPSG:4326", AFRICA_ALBERS, always_xy=True)


def norm_name(value: object) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s*\([^)]*\)\s*", " ", text)
    text = text.replace("&", "and")
    text = re.sub(r"\b(woreda|district|special|town|administration|adm)\b", " ", text)
    return re.sub(r"[^a-z0-9]+", "", text)


def fmt(value: float | None, digits: int = 6) -> str:
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return ""
    return f"{value:.{digits}f}"


def project_geom(geom):
    if geom is None or geom.is_empty:
        return None
    if not geom.is_valid:
        geom = geom.buffer(0)
    if geom.is_empty:
        return None
    return transform(TO_AEA.transform, geom)


def geodesic_area_km2(geom) -> float | None:
    if geom is None or geom.is_empty:
        return None
    try:
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            return None
        if geom.geom_type == "GeometryCollection":
            parts = [g for g in geom.geoms if not g.is_empty]
            if not parts:
                return None
            geom = unary_union(parts)
        area_m2, _ = GEOD.geometry_area_perimeter(geom)
        return abs(float(area_m2)) / 1_000_000.0
    except Exception:
        return None


def projected_area_km2(proj_geom) -> float | None:
    if proj_geom is None or proj_geom.is_empty:
        return None
    try:
        return abs(float(proj_geom.area)) / 1_000_000.0
    except Exception:
        return None


def centroid_lonlat(geom):
    if geom is None or geom.is_empty:
        return None, None
    try:
        if not geom.is_valid:
            geom = geom.buffer(0)
        c = geom.centroid
        return float(c.x), float(c.y)
    except Exception:
        return None, None


def load_features(path: Path) -> dict[str, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for feat in data.get("features") or []:
        props = feat.get("properties") or {}
        pcode = str(props.get("adm3_pcode") or props.get("NewPCODE") or "").strip()
        if not pcode:
            continue
        geom = shape(feat.get("geometry"))
        if geom.is_empty:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        proj = project_geom(geom)
        out[pcode] = {
            "pcode": pcode,
            "adm3_name": str(props.get("adm3_name") or props.get("W_NAME") or "").strip(),
            "adm2_name": str(props.get("adm2_name") or props.get("Z_NAME") or "").strip(),
            "adm1_name": str(props.get("adm1_name") or props.get("R_NAME") or "").strip(),
            "geom": geom,
            "proj": proj,
            "area_km2_geodesic": geodesic_area_km2(geom),
            "area_km2_albers": projected_area_km2(proj),
            "centroid_lon": centroid_lonlat(geom)[0],
            "centroid_lat": centroid_lonlat(geom)[1],
        }
    return out


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def shared_pcode_geometry_compare(old: dict, new: dict) -> list[dict]:
    rows = []
    shared = sorted(set(old) & set(new))
    for pcode in shared:
        o = old[pcode]
        n = new[pcode]
        oi = o["proj"]
        ni = n["proj"]
        iou = None
        inter_km2 = None
        union_km2 = None
        if oi is not None and ni is not None and not oi.is_empty and not ni.is_empty:
            try:
                inter = oi.intersection(ni)
                union = oi.union(ni)
                inter_km2 = abs(float(inter.area)) / 1_000_000.0 if inter and not inter.is_empty else 0.0
                union_km2 = abs(float(union.area)) / 1_000_000.0 if union and not union.is_empty else None
                if union_km2 and union_km2 > 0:
                    iou = inter_km2 / union_km2
            except Exception:
                pass

        shift_km = None
        bearing = None
        if None not in (o["centroid_lon"], o["centroid_lat"], n["centroid_lon"], n["centroid_lat"]):
            try:
                az12, _az21, dist_m = GEOD.inv(
                    o["centroid_lon"], o["centroid_lat"], n["centroid_lon"], n["centroid_lat"]
                )
                shift_km = abs(float(dist_m)) / 1000.0
                bearing = float(az12)
            except Exception:
                pass

        old_a = o["area_km2_albers"]
        new_a = n["area_km2_albers"]
        area_delta = None
        area_pct = None
        if isinstance(old_a, (int, float)) and isinstance(new_a, (int, float)):
            area_delta = new_a - old_a
            if old_a > 0:
                area_pct = 100.0 * area_delta / old_a

        rows.append(
            {
                "adm3_pcode": pcode,
                "old_adm3_name": o["adm3_name"],
                "new_adm3_name": n["adm3_name"],
                "name_changed": "yes" if o["adm3_name"] != n["adm3_name"] else "no",
                "old_adm1_name": o["adm1_name"],
                "new_adm1_name": n["adm1_name"],
                "old_area_km2": fmt(o["area_km2_albers"]),
                "new_area_km2": fmt(n["area_km2_albers"]),
                "area_delta_km2": fmt(area_delta),
                "area_pct_change": fmt(area_pct, 4),
                "intersection_km2": fmt(inter_km2),
                "union_km2": fmt(union_km2),
                "iou": fmt(iou, 6),
                "centroid_shift_km": fmt(shift_km, 4),
                "centroid_shift_bearing_deg": fmt(bearing, 2),
                "old_centroid_lon": fmt(o["centroid_lon"], 6),
                "old_centroid_lat": fmt(o["centroid_lat"], 6),
                "new_centroid_lon": fmt(n["centroid_lon"], 6),
                "new_centroid_lat": fmt(n["centroid_lat"], 6),
            }
        )

    rows.sort(key=lambda r: (float(r["iou"]) if r["iou"] else 999.0, r["adm3_pcode"]))
    return rows


def split_merge_links(old: dict, new: dict, min_overlap_share: float = 0.05) -> list[dict]:
    """Build old↔new overlap links using projected geometries + spatial index."""
    new_items = [item for item in new.values() if item.get("proj") is not None and not item["proj"].is_empty]
    new_geoms = [item["proj"] for item in new_items]
    tree = STRtree(new_geoms)

    rows = []
    for o in old.values():
        oi = o["proj"]
        if oi is None or oi.is_empty:
            continue
        old_area = float(oi.area)
        if old_area <= 0:
            continue
        # Query candidates by bounding box, then precise intersection.
        try:
            idxs = tree.query(oi)
        except Exception:
            idxs = []
        for idx in idxs:
            n = new_items[int(idx)]
            ni = n["proj"]
            if ni is None or ni.is_empty:
                continue
            try:
                inter = oi.intersection(ni)
            except Exception:
                continue
            if inter is None or inter.is_empty:
                continue
            inter_area = abs(float(inter.area))
            if inter_area <= 0:
                continue
            new_area = abs(float(ni.area))
            share_of_old = inter_area / old_area
            share_of_new = inter_area / new_area if new_area > 0 else None
            if share_of_old < min_overlap_share and (
                share_of_new is None or share_of_new < min_overlap_share
            ):
                continue

            same_pcode = o["pcode"] == n["pcode"]
            relation = "same_pcode_overlap"
            if not same_pcode:
                # Heuristic labels; full split/merge inferred from degree later.
                relation = "cross_pcode_overlap"

            rows.append(
                {
                    "relation": relation,
                    "old_adm3_pcode": o["pcode"],
                    "old_adm3_name": o["adm3_name"],
                    "old_adm1_name": o["adm1_name"],
                    "new_adm3_pcode": n["pcode"],
                    "new_adm3_name": n["adm3_name"],
                    "new_adm1_name": n["adm1_name"],
                    "intersection_km2": fmt(inter_area / 1_000_000.0),
                    "share_of_old": fmt(share_of_old, 6),
                    "share_of_new": fmt(share_of_new, 6) if share_of_new is not None else "",
                    "old_area_km2": fmt(old_area / 1_000_000.0),
                    "new_area_km2": fmt(new_area / 1_000_000.0),
                }
            )

    # Annotate likely split / merge using degree of cross-pcode links.
    cross = [r for r in rows if r["relation"] == "cross_pcode_overlap"]
    old_degree = defaultdict(int)
    new_degree = defaultdict(int)
    for r in cross:
        old_degree[r["old_adm3_pcode"]] += 1
        new_degree[r["new_adm3_pcode"]] += 1

    for r in rows:
        if r["relation"] != "cross_pcode_overlap":
            r["likely_change_type"] = "same_pcode"
            continue
        od = old_degree[r["old_adm3_pcode"]]
        nd = new_degree[r["new_adm3_pcode"]]
        if od >= 2 and nd == 1:
            r["likely_change_type"] = "likely_split_old_to_many_new"
        elif od == 1 and nd >= 2:
            r["likely_change_type"] = "likely_merge_many_old_to_new"
        elif od >= 2 and nd >= 2:
            r["likely_change_type"] = "complex_many_to_many"
        else:
            r["likely_change_type"] = "one_to_one_redraw_or_recode"

    rows.sort(
        key=lambda r: (
            0 if r["relation"] == "cross_pcode_overlap" else 1,
            -float(r["share_of_old"] or 0),
            r["old_adm3_pcode"],
            r["new_adm3_pcode"],
        )
    )
    return rows


def forecast_coverage(new: dict) -> list[dict]:
    bootstrap = json.loads(BOOTSTRAP.read_text(encoding="utf-8"))
    alerts = bootstrap.get("alerts") or []
    districts = sorted({a.get("district") for a in alerts if a.get("district")})

    crosswalk = {"byName": {}, "byKey": {}}
    if CROSSWALK.exists():
        crosswalk = json.loads(CROSSWALK.read_text(encoding="utf-8"))

    by_name = {norm_name(v["adm3_name"]): v for v in new.values() if v.get("adm3_name")}
    rows = []
    for district in districts:
        pcode = (crosswalk.get("byName") or {}).get(district)
        if not pcode:
            pcode = (crosswalk.get("byKey") or {}).get(norm_name(district))

        matched = None
        match_method = "unmatched"
        if pcode and pcode in new:
            matched = new[pcode]
            match_method = "pcode_crosswalk"
        else:
            hit = by_name.get(norm_name(district))
            if hit:
                matched = hit
                match_method = "normalized_name"
                pcode = hit["pcode"]

        rows.append(
            {
                "forecast_district": district,
                "match_method": match_method,
                "matched_adm3_pcode": matched["pcode"] if matched else "",
                "matched_adm3_name": matched["adm3_name"] if matched else "",
                "matched_adm1_name": matched["adm1_name"] if matched else "",
                "matched_area_km2": fmt(matched["area_km2_albers"]) if matched else "",
                "matched_centroid_lon": fmt(matched["centroid_lon"], 6) if matched else "",
                "matched_centroid_lat": fmt(matched["centroid_lat"], 6) if matched else "",
            }
        )

    rows.sort(key=lambda r: (0 if r["match_method"] == "unmatched" else 1, r["forecast_district"]))
    return rows


def region_rollup(old: dict, new: dict) -> list[dict]:
    def agg(index: dict, source: str) -> dict[str, dict]:
        out = defaultdict(lambda: {"district_count": 0, "area_km2": 0.0})
        for item in index.values():
            region = item["adm1_name"] or "(blank)"
            out[region]["district_count"] += 1
            area = item.get("area_km2_albers")
            if isinstance(area, (int, float)):
                out[region]["area_km2"] += area
        return {k: {"source": source, **v} for k, v in out.items()}

    old_agg = agg(old, "old")
    new_agg = agg(new, "new")
    regions = sorted(set(old_agg) | set(new_agg))
    rows = []
    for region in regions:
        o = old_agg.get(region)
        n = new_agg.get(region)
        rows.append(
            {
                "adm1_name": region,
                "old_district_count": o["district_count"] if o else 0,
                "new_district_count": n["district_count"] if n else 0,
                "district_count_delta": (n["district_count"] if n else 0) - (o["district_count"] if o else 0),
                "old_area_km2": fmt(o["area_km2"]) if o else "",
                "new_area_km2": fmt(n["area_km2"]) if n else "",
                "area_delta_km2": fmt(
                    ((n["area_km2"] if n else 0.0) - (o["area_km2"] if o else 0.0))
                ),
                "in_old": "yes" if o else "no",
                "in_new": "yes" if n else "no",
            }
        )
    rows.sort(key=lambda r: (-abs(int(r["district_count_delta"])), r["adm1_name"]))
    return rows


def main() -> None:
    print("Loading and projecting old polygons...")
    old = load_features(OLD_GEO)
    print(f"  old: {len(old)}")
    print("Loading and projecting new polygons...")
    new = load_features(NEW_GEO)
    print(f"  new: {len(new)}")

    print("Shared PCODE geometry compare (IoU + centroid shift)...")
    shared_rows = shared_pcode_geometry_compare(old, new)
    write_csv(
        OUT_SHARED,
        [
            "adm3_pcode",
            "old_adm3_name",
            "new_adm3_name",
            "name_changed",
            "old_adm1_name",
            "new_adm1_name",
            "old_area_km2",
            "new_area_km2",
            "area_delta_km2",
            "area_pct_change",
            "intersection_km2",
            "union_km2",
            "iou",
            "centroid_shift_km",
            "centroid_shift_bearing_deg",
            "old_centroid_lon",
            "old_centroid_lat",
            "new_centroid_lon",
            "new_centroid_lat",
        ],
        shared_rows,
    )
    print(f"  wrote {OUT_SHARED.name} ({len(shared_rows)} rows)")

    print("Split/merge overlap links...")
    link_rows = split_merge_links(old, new)
    write_csv(
        OUT_LINKS,
        [
            "relation",
            "likely_change_type",
            "old_adm3_pcode",
            "old_adm3_name",
            "old_adm1_name",
            "new_adm3_pcode",
            "new_adm3_name",
            "new_adm1_name",
            "intersection_km2",
            "share_of_old",
            "share_of_new",
            "old_area_km2",
            "new_area_km2",
        ],
        link_rows,
    )
    print(f"  wrote {OUT_LINKS.name} ({len(link_rows)} rows)")

    print("Forecast coverage vs new map...")
    forecast_rows = forecast_coverage(new)
    write_csv(
        OUT_FORECAST,
        [
            "forecast_district",
            "match_method",
            "matched_adm3_pcode",
            "matched_adm3_name",
            "matched_adm1_name",
            "matched_area_km2",
            "matched_centroid_lon",
            "matched_centroid_lat",
        ],
        forecast_rows,
    )
    print(f"  wrote {OUT_FORECAST.name} ({len(forecast_rows)} rows)")

    print("Region rollup...")
    region_rows = region_rollup(old, new)
    write_csv(
        OUT_REGION,
        [
            "adm1_name",
            "old_district_count",
            "new_district_count",
            "district_count_delta",
            "old_area_km2",
            "new_area_km2",
            "area_delta_km2",
            "in_old",
            "in_new",
        ],
        region_rows,
    )
    print(f"  wrote {OUT_REGION.name} ({len(region_rows)} rows)")

    ious = [float(r["iou"]) for r in shared_rows if r["iou"]]
    shifts = [float(r["centroid_shift_km"]) for r in shared_rows if r["centroid_shift_km"]]
    forecast_methods = defaultdict(int)
    for r in forecast_rows:
        forecast_methods[r["match_method"]] += 1
    change_types = defaultdict(int)
    for r in link_rows:
        change_types[r["likely_change_type"]] += 1

    summary = {
        "projection_for_iou_and_overlap": "Africa Albers Equal Area Conic",
        "centroid_shift_method": "WGS84 geodesic distance between polygon centroids",
        "shared_pcode_count": len(shared_rows),
        "iou_mean": round(sum(ious) / len(ious), 6) if ious else None,
        "iou_median": round(sorted(ious)[len(ious) // 2], 6) if ious else None,
        "iou_lt_0_5_count": sum(1 for x in ious if x < 0.5),
        "iou_lt_0_9_count": sum(1 for x in ious if x < 0.9),
        "centroid_shift_km_mean": round(sum(shifts) / len(shifts), 4) if shifts else None,
        "centroid_shift_km_median": round(sorted(shifts)[len(shifts) // 2], 4) if shifts else None,
        "centroid_shift_km_gt_5_count": sum(1 for x in shifts if x > 5),
        "split_merge_link_count": len(link_rows),
        "likely_change_type_counts": dict(sorted(change_types.items())),
        "forecast_district_count": len(forecast_rows),
        "forecast_match_method_counts": dict(sorted(forecast_methods.items())),
        "outputs": [
            OUT_SHARED.name,
            OUT_LINKS.name,
            OUT_FORECAST.name,
            OUT_REGION.name,
        ],
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_SUMMARY.name}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
