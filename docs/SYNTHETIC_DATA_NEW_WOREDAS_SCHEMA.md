# Synthetic Data Generation for COD-AB v04 (1,148 woredas)

## Goal

Rebuild the malaria synthetic dataset so every weekly record is keyed to the **new** Ethiopia COD-AB Admin 3 geography (**1,148** woredas), not the old **851**-woreda map.

The modeling logic stays the same (XGBoost + lags + SHAP spatial effects).  
What changes is the **spatial unit** and therefore all inputs aggregated to that unit.

```text
Historical malaria (2014–2019) on NEW woredas
        + env (rain, temp, NDVI)
        + population
                │
                ▼
        Feature engineering (lags)
                │
                ▼
        XGBoost training (log incidence)
                │
                ▼
        SHAP → β_spatial per adm3_pcode
                │
                ▼
Real env + pop (2020–2025) on NEW woredas
                │
                ▼
Synthetic incidence → synthetic cases
```

---

## 0. District dimension (already created)

**File:** `data/synthetic_v2/woreda_master_cod_ab_v04.csv`

| Column | Description |
|--------|-------------|
| `adm3_pcode` | COD-AB v04 woreda PCODE (primary key) |
| `adm3_name` | Woreda name |
| `adm2_name` | Zone |
| `adm1_name` | Region |

**Rows:** 1,148  
**Source:** `public/eth_admin3.geojson`

Use `adm3_pcode` as the stable join key everywhere. Do **not** join only on woreda name.

---

## 1. Required input tables

All tables below should cover every `adm3_pcode` in the master list (unless a variable truly has no coverage).

### 1.1 Training panel — historical malaria + env + pop (2014–2019)

**Suggested file:** `data/synthetic_v2/inputs/train_panel_2014_2019.csv`

One row = one woreda × one epidemiological week.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `week_start` | date (YYYY-MM-DD) | yes | Monday (or consistent epidemiar week start) |
| `year` | int | yes | Calendar year |
| `week_of_year` | int | yes | ISO / epidemiar week 1–52/53 |
| `adm3_pcode` | string | yes | COD-AB v04 PCODE |
| `adm3_name` | string | no | Convenience label |
| `adm1_name` | string | no | Region |
| `rainfall_mm` | float | yes | Weekly rainfall |
| `temperature_c` | float | yes | Weekly mean LST / temperature |
| `ndvi` | float | yes | Weekly NDVI |
| `population` | float | yes | Population at risk (same week/year) |
| `cases` | float | yes | Historical malaria cases (`totmal` or equivalent) |
| `incidence` | float | yes | `cases / population` (protect zeros) |

**Notes**

- If historical cases exist only on the **old 851** map, first **remap** them to new PCODEs using area-overlap shares (`eth_admin3_split_merge_links.csv` / `eth_admin3_old_splits_to_new.csv`), then re-aggregate env/pop on new polygons.
- Prefer incidence for the model target; keep raw `cases` for auditing.

### 1.2 Prediction drivers — real env + pop (2020–2025)

**Suggested file:** `data/synthetic_v2/inputs/predict_drivers_2020_2025.csv`

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `week_start` | date | yes | Same week definition as training |
| `year` | int | yes | |
| `week_of_year` | int | yes | |
| `adm3_pcode` | string | yes | |
| `adm3_name` | string | no | |
| `adm1_name` | string | no | |
| `rainfall_mm` | float | yes | Observed weekly rainfall |
| `temperature_c` | float | yes | Observed weekly temperature |
| `ndvi` | float | yes | Observed weekly NDVI |
| `population` | float | yes | Annual/weekly population for that year |

No `cases` column here — those are generated.

### 1.3 Optional: remapping crosswalk (old → new)

**Suggested file:** `data/synthetic_v2/inputs/old_to_new_area_weights.csv`

Can be derived from `public/eth_admin3_split_merge_links.csv`:

| Column | Description |
|--------|-------------|
| `old_adm3_pcode` | Old map PCODE |
| `new_adm3_pcode` | New COD-AB PCODE |
| `share_of_old` | Fraction of old polygon area overlapping this new polygon |
| `share_of_new` | Fraction of new polygon area overlapping this old polygon |
| `intersection_km2` | Overlap area |

Use `share_of_old` to allocate old weekly cases to children (splits).  
Use overlap-weighted averages for env when reallocating from parents.

---

## 2. Feature engineering schema (model matrix)

Built from the panels above; not necessarily saved permanently, but this is the intended feature set.

| Feature group | Columns |
|---------------|---------|
| Identity | `adm3_pcode` (as categorical / encoded spatial ID) |
| Current env | `rainfall_mm`, `temperature_c`, `ndvi` |
| Rain lags | `rainfall_lag1` … `rainfall_lag4` |
| Temp lags | `temperature_lag1` … `temperature_lag4` |
| NDVI lags | `ndvi_lag1` … `ndvi_lag4` |
| Population | `population` or `log_population` |
| Target (train only) | `log_incidence` = `log(incidence + ε)` |

Lag window: **0–4 weeks** (current + previous four), matching your existing pipeline.

---

## 3. Intermediate outputs

### 3.1 Spatial effects

**Suggested file:** `data/synthetic_v2/outputs/beta_spatial_by_pcode.csv`

| Column | Description |
|--------|-------------|
| `adm3_pcode` | New woreda PCODE |
| `adm3_name` | Name |
| `beta_spatial` | Mean SHAP spatial effect for that district |
| `n_train_weeks` | Weeks used in the SHAP average |

### 3.2 Model artifacts (for reproducibility)

Store outside git if large:

- trained XGBoost model file
- feature list / encoding map for `adm3_pcode`
- training config (years, ε, lag length, random seed)

---

## 4. Final synthetic dataset (2020–2025)

**Suggested file:** `data/synthetic_v2/outputs/synthetic_malaria_2020_2025_cod_ab_v04.csv`

| Column | Description |
|--------|-------------|
| `week_start` | Epidemiological week start date |
| `adm3_pcode` | New district identifier (**join key for dashboard**) |
| `adm3_name` | District name |
| `adm1_name` | Region |
| `rainfall_mm` | Observed weekly rainfall |
| `temperature_c` | Observed weekly temperature |
| `ndvi` | Observed NDVI |
| `population` | Population used for scaling |
| `synthetic_incidence` | ML-predicted incidence (after spatial adjustment) |
| `synthetic_cases` | `synthetic_incidence × population` |
| `beta_spatial` | SHAP spatial effect used |

Expected rough size:

- 1,148 woredas × ~313 weeks (2020–2025) ≈ **360k rows** per species/series  
- If Pf and Pv are separate, produce two files or add `species`.

---

## 5. EPIDEMIA dashboard ingest format

After synthetic generation, convert to the formats the current pipeline expects:

### 5.1 `epi_data.csv`

| Column | Mapping |
|--------|---------|
| `obs_date` | `week_start` (or week end, consistent with current file) |
| `woreda_name` | `adm3_name` (must match map/crosswalk aliases) |
| `pop_at_risk` | `population` |
| `test_pf_tot` | Pf synthetic cases (or historical+synthetic policy) |
| `test_pv_only` | Pv synthetic cases |

Also maintain `ethiopia_woreda_pcode.json` so names resolve to new `adm3_pcode`.

### 5.2 `env_data.csv` (long format)

| Column | Mapping |
|--------|---------|
| `obs_date` | week date |
| `woreda_name` | `adm3_name` |
| `environ_var_code` | e.g. `totprec`, `lst_mean`, NDVI code used by epidemiar |
| `obs_value` | weekly value |

### 5.3 `ethiopia_woredas.csv`

Rebuild from `woreda_master_cod_ab_v04.csv`:

| Column | Source |
|--------|--------|
| `pcode` | `adm3_pcode` |
| `region` | `adm1_name` |
| `zone` | `adm2_name` |
| `woreda_name` | `adm3_name` |
| `report` | `1` for included woredas |

---

## 6. Generation checklist

1. Confirm master list = **1,148** PCODEs from COD-AB v04.  
2. Build / remap **2014–2019** cases onto new PCODEs.  
3. Extract **rain / temp / NDVI / pop** on new polygons for **2014–2025**.  
4. Create lag features (0–4 weeks).  
5. Train XGBoost on **2014–2019** (`log_incidence`).  
6. Compute SHAP → `beta_spatial` per `adm3_pcode`.  
7. Predict **2020–2025** incidence from real env + pop; apply spatial adjustment.  
8. Convert incidence → cases with population.  
9. QC:
   - every new PCODE has a complete weekly series (or documented gaps)
   - no negative cases
   - national weekly totals are plausible vs old synthetic
   - split children sum ≈ parent where remapped
10. Export dashboard `epi_data.csv` / `env_data.csv` / woreda registry.  
11. Re-run EPIDEMIA forecast cache for national report.

---

## 7. Folder layout

```text
data/synthetic_v2/
  woreda_master_cod_ab_v04.csv          ← created
  templates/
    train_panel_2014_2019.header.csv
    predict_drivers_2020_2025.header.csv
    synthetic_malaria_2020_2025.header.csv
  inputs/                               ← you populate
  outputs/                              ← model writes here
```

---

## 8. Scientific note (keep in papers / docs)

This remains a **data-driven spatiotemporal simulation**, not an SIR/SEIR model:

- relationships learned from **2014–2019**
- driven by **real 2020–2025** environment and population
- spatially adjusted with SHAP district effects
- then used downstream by EPIDEMIA GAM / Farrington early warning

The geographic change (851 → 1,148) requires rebuilding inputs and outputs on the new PCODE system before operational forecasting.

---

## 9. Interim remapped cases (area-weighted)

Before a full XGBoost re-run, an interim remap of the existing 851-woreda epi series onto COD-AB v04 is available:

```bash
python scripts/remap-epi-to-cod-ab-v04.py
python scripts/remap-env-pop-to-cod-ab-v04.py
```

| Output | Description |
|--------|-------------|
| `outputs/remapped_cases_weekly_cod_ab_v04.csv` | Full 2014–2025 remapped Pf/Pv cases + population |
| `outputs/train_cases_remapped_2014_2019_cod_ab_v04.csv` | 2014–2019 cases extract |
| `outputs/remapped_env_long_cod_ab_v04.csv` | Remapped `totprec` / `lst_mean` / `ndvi` (long) |
| `outputs/remapped_population_weekly_cod_ab_v04.csv` | Remapped weekly population |
| `outputs/train_panel_2014_2019_draft.csv` | Draft XGBoost training panel |
| `outputs/predict_drivers_2020_2025_draft.csv` | Draft 2020–2025 env+pop drivers |
| `outputs/*_qc_summary.json` | Conservation / coverage QC |

**Methods**

- Cases & population (extensive): allocate with normalized `share_of_old`
- Rain / temp / NDVI (intensive): area-weighted average with `intersection_km2`
- National case totals are conserved (ratio ≈ 1.0)
- Some brand-new COD polygons with no sufficient overlap remain empty until raster extraction / full regeneration

### Gap fill (97 new woredas)

```bash
python scripts/fill-gap-woredas-worldpop-env.py
```

| Source | Method |
|--------|--------|
| Population | WorldPop constrained 100 m GeoTIFF zonal sum (`rasterio.mask`) for 2014–2025 |
| Environment | Proxy from **containing / nearest old woreda** env series (95 contained, 2 nearest). Direct GEE zonal extract can replace this when Earth Engine Python is configured. |
| Cases | Set to 0 for gaps in the draft train panel (to be predicted by XGBoost) |

After fill, `predict_drivers_2020_2025_draft.csv` covers **all 1,148** PCODEs.

### XGBoost + SHAP generation

```bash
# one-time venv (already created locally as .venv-synthetic)
.\.venv-synthetic\Scripts\python scripts\generate-synthetic-xgb-shap.py --species both
# or one species: --species pf | --species pv
```

| Output | Description |
|--------|-------------|
| `outputs/synthetic_malaria_2020_2025_cod_ab_v04.csv` | Weekly **Pf** synthetic incidence/cases + β_spatial |
| `outputs/synthetic_malaria_2020_2025_cod_ab_v04_pv.csv` | Weekly **Pv** synthetic incidence/cases + β_spatial |
| `outputs/beta_spatial_by_pcode.csv` / `_pv.csv` | SHAP spatial effects |
| `outputs/epi_data_synthetic_2020_2025_cod_ab_v04_pf.csv` | Pf epi extract |
| `outputs/epi_data_synthetic_2020_2025_cod_ab_v04_pv.csv` | Pv epi extract |
| `outputs/epi_data_synthetic_2020_2025_cod_ab_v04.csv` | Combined Pf+Pv extract (after calibration) |
| `models/xgb_synthetic_cod_ab_v04.json` / `_pv.json` | Trained models |
| `outputs/synthetic_generation_qc_summary.json` / `_pv.json` | Validation metrics / counts |

Training uses remapped 2014–2019 `cases_pf` / `cases_pv` (gap-only zero placeholders excluded). Predictions cover 2020–2025 for new PCODEs, with region/global β adjustment for unseen gap districts.

### National resurgence calibration (U-shape / post-2020 rise)

Raw XGBoost output under-states the documented post-2020 / 2023–24 resurgence (env+pop drivers alone do not encode conflict, *An. stephensi*, resistance, or service disruption). Apply a **year-level national scale** that preserves woreda spatial and within-year seasonal shares:

```bash
.\.venv-synthetic\Scripts\python scripts\calibrate-synthetic-resurgence.py --species both
```

| Years | Target |
|-------|--------|
| 2020–2023 | Match remapped national annual totals for that species |
| 2024 | `target_2023 × 1.268` ([WHO WMR 2025](https://www.severemalaria.org/countries/ethiopia) ~26.8% incidence rise 2023→2024) |
| 2025 | `target_2024 × 1.10` (continued rise; synthetic extension toward 2026) |

Absolute level stays in the remapped surveillance-style magnitude (**not** WHO estimated ~12.4M cases).

| Output | Description |
|--------|-------------|
| `outputs/synthetic_malaria_2020_2025_cod_ab_v04.csv` (+ `_pv.csv`) | Calibrated series (+ `*_uncalibrated`, `resurgence_scale`) |
| `outputs/*_uncalibrated.csv` | Pre-calibration snapshots |
| `outputs/synthetic_resurgence_calibration_annual.csv` (+ `_pv.csv`) | Before/after annual totals + scales |
| `outputs/national_pf_annual_u_shape_series.csv` / `national_pv_...` | 2014–2019 remapped + 2020–2025 calibrated |
| `outputs/synthetic_resurgence_calibration_qc.json` (+ `_pv.json`) | Method + YoY QC |
| `outputs/epi_data_synthetic_2020_2025_cod_ab_v04.csv` | Combined calibrated Pf+Pv dashboard extract |

### Wire into live forecast pipeline

```bash
.\.venv-synthetic\Scripts\python scripts\assemble-cod-ab-v04-pipeline-inputs.py
cd backend
# full national rebuild (~hours for 1,148 districts)
set EPIDEMIA_WORKERS=8
python scripts/build_forecast_cache.py --force --horizon-weeks 12
python scripts/prepare_district_caches.py
```

This overwrites `backend/data/{ethiopia_woredas,epi_data,env_data,env_ref_data}.csv` (old files backed up under `backend/data/_bak_pre_cod_ab_v04_*`). Canonical `woreda_name` = COD-AB `adm3_name` (matches map geojson).

### Extend through July 2026

Observed env stops at end-2025. To add **Jan–Jul 2026**:

```bash
.\.venv-synthetic\Scripts\python scripts\extend-synthetic-to-2026jul.py
```

| Piece | Method |
|-------|--------|
| Env | Woreda × week-of-year mean over 2020–2025 |
| Population | 2025 weekly pop × woreda 2024→2025 growth |
| Cases | Existing XGBoost Pf/Pv models + β_spatial |
| Calibration | Jan–Jul 2026 national = Jan–Jul 2025 calibrated × 1.05 |

Updates synthetic CSVs and appends to `backend/data/epi_data.csv` + `env_data.csv` through **2026-07-27** (last Monday in July).
