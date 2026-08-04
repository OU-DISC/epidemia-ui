# How the Old vs New Admin3 Comparison CSV Was Calculated

This document describes the step-by-step method used to create:

- `public/eth_admin3_old_vs_new_cod_ab_v04.csv`
- `public/eth_admin3_old_vs_new_cod_ab_v04_summary.json`

**Script:** `scripts/compare-admin3-old-vs-new.py`  
**Re-run:**

```bash
python scripts/compare-admin3-old-vs-new.py
```

---

## 1. Inputs

| Role | File |
|------|------|
| Old boundaries | `public/eth_admin3.geojson.bak-pre-cod-ab-v04` |
| New boundaries | `public/eth_admin3.geojson` (HDX COD-AB Ethiopia Admin 3, v04) |

Both files are GeoJSON `FeatureCollection`s of woreda (admin level 3) polygons with attributes such as:

- `adm3_pcode` (or `NewPCODE`)
- `adm3_name` (or `W_NAME`)
- `adm2_name` (or `Z_NAME`)
- `adm1_name` (or `R_NAME`)
- polygon `geometry` (WGS84 longitude/latitude)

---

## 2. Index each layer by PCODE

For **each** of the old and new files:

1. Read all features.
2. Take the district code from `adm3_pcode`, falling back to `NewPCODE`.
3. Skip features with no PCODE.
4. Store one record per PCODE with:
   - district name (`adm3_name` / `W_NAME`)
   - zone name (`adm2_name` / `Z_NAME`)
   - region name (`adm1_name` / `R_NAME`)
   - geometry type
   - coordinate-point count (see step 4)
   - area in km² (see step 3)

Resulting counts from the latest run:

- Old: **851** PCODEs  
- New: **1,148** PCODEs  

---

## 3. Calculate polygon area (`old_area_km2`, `new_area_km2`)

Areas are **not** computed in square degrees. Because coordinates are lon/lat, area is computed on the Earth ellipsoid.

### Method

1. Convert the GeoJSON geometry to a Shapely geometry.
2. If the geometry is invalid, repair with `buffer(0)`.
3. If it is a geometry collection, union the non-empty parts.
4. Compute geodesic area with **`pyproj.Geod(ellps="WGS84")`**:
   - `Geod.geometry_area_perimeter(geom)` returns area in **m²**
5. Convert to km²:
   - `area_km2 = abs(area_m2) / 1,000,000`
6. Absolute value is used so orientation (clockwise / counterclockwise rings) does not produce negative area.

### Derived area columns

When the **same PCODE** exists in both old and new:

- `area_delta_km2 = new_area_km2 − old_area_km2`
- `area_pct_change = 100 × (new − old) / old`  
  (only if old area > 0)

### Totals (latest run)

| Measure | Value (km²) |
|---------|------------:|
| Sum of all old polygon areas | 1,126,025 |
| Sum of all new polygon areas | 1,129,938 |
| Sum of old areas for shared PCODEs (606) | 761,912 |
| Sum of new areas for shared PCODEs (606) | 725,664 |

Note: shared-PCODE area often decreases because many old woredas were **split** in the new layer; the split pieces appear as separate new PCODEs.

---

## 4. Calculate coordinate-point counts (`old_coord_points`, `new_coord_points`)

This is a **geometry complexity** measure, not an area.

1. Walk the nested GeoJSON `coordinates` array.
2. Count every numeric `[lon, lat]` vertex.
3. Store:
   - `old_coord_points` for the old polygon
   - `new_coord_points` for the new polygon
   - `coord_points_delta = new − old` when both exist

Higher values mean a denser / more detailed boundary outline.

---

## 5. Build the union of all PCODEs

Create the set:

```text
all_pcodes = old_pcodes ∪ new_pcodes
```

Latest run: **1,393** unique PCODEs.

The CSV has **one row per unique PCODE**.

---

## 6. Assign a match status to each row

For each PCODE in the union:

### A. Present in both old and new

Compare names / admin attributes:

| Condition | `status` |
|-----------|----------|
| Same district, zone, and region names | `matched_same_attributes` |
| Same district name, but zone and/or region changed | `matched_name_same_admin_changed` |
| Same PCODE, but district name changed | `matched_pcode_name_changed` |

### B. Only in old

| Condition | `status` |
|-----------|----------|
| Name does not appear in new under any PCODE | `only_in_old` |
| Same normalized name exists in new under a **different** PCODE | `only_in_old_name_exists_under_other_pcode` |

### C. Only in new

| Condition | `status` |
|-----------|----------|
| Name did not exist in old under any PCODE | `only_in_new` |
| Same normalized name existed in old under a **different** PCODE | `only_in_new_name_existed_under_other_pcode` |

### Name normalization used for “same name” checks

Before comparing names across different PCODEs:

1. Convert to lowercase.
2. Keep only letters and digits (remove spaces, punctuation, symbols).

Example: `"Bahir Dar"` and `"Bahirdar"` both normalize to `bahirdar`.

When a name is found under another PCODE, that other code is written to `other_pcodes_same_name`.

### Latest status counts

| Status | Count |
|--------|------:|
| `matched_same_attributes` | 352 |
| `matched_pcode_name_changed` | 166 |
| `matched_name_same_admin_changed` | 88 |
| `only_in_new` | 365 |
| `only_in_new_name_existed_under_other_pcode` | 177 |
| `only_in_old` | 73 |
| `only_in_old_name_exists_under_other_pcode` | 172 |

---

## 7. Write CSV columns

Each row includes:

| Column | Meaning |
|--------|---------|
| `status` | Match category from step 6 |
| `adm3_pcode` | Woreda PCODE key for the row |
| `old_adm3_name` / `new_adm3_name` | District names |
| `name_changed` | `yes` / `no` if both exist and names differ |
| `old_adm2_name` / `new_adm2_name` | Zone names |
| `old_adm1_name` / `new_adm1_name` | Region names |
| `region_changed` | `yes` / `no` if both exist and region names differ |
| `old_area_km2` / `new_area_km2` | Geodesic areas |
| `area_delta_km2` / `area_pct_change` | Area difference for shared PCODEs |
| `old_coord_points` / `new_coord_points` | Vertex counts |
| `coord_points_delta` | Vertex-count difference |
| `other_pcodes_same_name` | Alternate PCODE(s) with the same normalized name |
| `in_old` / `in_new` | Whether the PCODE exists in that layer |

Rows are sorted so mismatches appear before exact matches.

---

## 8. Write summary JSON

`eth_admin3_old_vs_new_cod_ab_v04_summary.json` stores:

- input file names
- area method description
- feature counts
- total old/new areas
- shared-PCODE area totals and delta
- status counts

---

## 9. Important interpretation notes

1. **Primary key is PCODE**, not district name. Name spelling can change even when the code stays the same.
2. **Splits and merges** show up as `only_in_old` / `only_in_new` rows, often with `other_pcodes_same_name` filled.
3. **`coord_points` is not area.** Use `*_area_km2` for size comparisons.
4. Area is geodesic on WGS84. It is suitable for comparing old vs new polygons; it may differ slightly from GIS software using a projected CRS (for example Africa Albers Equal Area).
5. The old backup used for this CSV is the pre–COD-AB-v04 EPIDEMIA map (`eth_admin3.geojson.bak-pre-cod-ab-v04`).

---

## Workflow diagram

```text
Old GeoJSON                          New GeoJSON (COD-AB v04)
     |                                      |
     v                                      v
Index by adm3_pcode                    Index by adm3_pcode
 + name / zone / region                 + name / zone / region
 + geodesic area_km2                    + geodesic area_km2
 + coord_points                         + coord_points
     |                                      |
     +------------------+-------------------+
                        |
                        v
              Union of all PCODEs
                        |
                        v
         Assign status + fill old/new fields
                        |
          +-------------+-------------+
          |                           |
          v                           v
   Comparison CSV              Summary JSON
```

---

## Extra comparison CSVs

Generated by:

```bash
python scripts/compare-admin3-extra.py
```

| Output file | What it adds |
|-------------|--------------|
| `eth_admin3_shared_pcode_geometry_compare.csv` | For **shared PCODEs**: IoU, intersection/union area, centroid shift (km), bearing |
| `eth_admin3_split_merge_links.csv` | Old↔new overlap links (≥5% of either polygon), with likely split/merge labels |
| `eth_admin3_forecast_coverage_new_map.csv` | Each forecast district → matched new PCODE / unmatched |
| `eth_admin3_region_rollup_old_vs_new.csv` | District count + total area by admin-1 region |
| `eth_admin3_extra_comparisons_summary.json` | Summary stats (mean IoU, shift, match counts) |

### Methods used in the extras

1. **IoU / overlap areas** — polygons projected to **Africa Albers Equal Area Conic**, then `intersection.area / union.area`.
2. **Centroid shift** — WGS84 geodesic distance between old and new polygon centroids.
3. **Split/merge links** — spatial index query + overlap share of old and new; labeled using how many partners each polygon has.
4. **Forecast coverage** — match via `ethiopia_woreda_pcode.json`, else normalized name.