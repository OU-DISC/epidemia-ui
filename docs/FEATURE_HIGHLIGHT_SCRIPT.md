# EPIDEMIA — Feature Highlight Script

Use this script for live demos, stakeholder briefings, training workshops, or recorded walkthroughs.

**Duration:** ~8 minutes (full) · ~2 minutes (short)  
**Audience:** Public health planners, epidemiologists, program managers, technical partners  
**Demo URL (production):** https://epidemia-ui.disc.ourcloud.ou.edu/  
**Demo URL (local):** http://localhost:3000 (with forecast + env APIs running)

---

## Before you start

1. Open the dashboard with forecast data loaded (map alerts visible).
2. Select **Ethiopia**, **P. falciparum malaria**, and a region with active alerts (e.g. Amhara or Oromia).
3. Confirm the **Charts** tab is visible on the right panel.
4. Optional: pre-select a high-priority district so charts load immediately.

---

## Short version (~2 minutes)

> **EPIDEMIA** is Ethiopia’s national malaria early warning dashboard. It brings together **851 districts**, **eight-week forecasts**, **environmental drivers**, and **actionable alerts** in one place.
>
> The map shows where **early warning** and **early detection** signals are active. Click any district to open its **transmission forecast** and **environmental time series** side by side.
>
> The **Forecast Table** ranks districts by priority so programs can focus limited resources. Compare up to three districts—or see the top ten as background context—in one chart.
>
> Forecasts refresh **by region**, custom projects can be uploaded through the **Project Wizard**, and a **PDF report** exports the current view for briefings.
>
> Under the hood: seasonal GAM thresholds, autoregressive forecasting, Google Earth Engine environmental layers, and a production stack deployed on OU DISC cloud infrastructure.

---

## Full walkthrough script

### 1. Opening — The problem (0:00–0:45)

**[ON SCREEN: Dashboard hero title and situation strip]**

> Malaria control in Ethiopia spans hundreds of districts, two parasite species, and strong seasonal and environmental drivers. Program staff need more than static reports—they need to know **where** risk is rising, **how far ahead** to plan, and **what environmental conditions** may be contributing.
>
> **EPIDEMIA**—the Ethiopia Malaria Early Warning Dashboard—answers those questions in a single national view built for EPHI and partner agencies.

**[Point to situation strip cards]**

> At a glance we see pipeline status, the count of **early warnings** nationwide, and how many **districts are modeled** in the current forecast run.

---

### 2. National map & alerts (0:45–2:00)

**[ON SCREEN: Map panel, zoomed to national view]**

> The heart of EPIDEMIA is an interactive map of **all reporting woredas**—roughly **851 districts** across Ethiopia.
>
> **Decision layers** place alert markers directly on the map:
> - **Early Warning** — forecast exceeds the higher seasonal threshold  
> - **Early Detection** — forecast exceeds the detection threshold  
>
> Toggle species with the **Disease** selector to switch between ***P. falciparum*** and ***P. vivax***.

**[Toggle Early Warning / Early Detection; click a flagged district]**

> Click a district to focus the right-hand panel. The map supports **region filtering** from the toolbar so teams can work at admin-1 scale without losing national context.

**[Optional: enable Alert History animation]**

> **Alert history** replays how warnings and detections evolved week by week—useful for after-action reviews and seasonal pattern discussions.

---

### 3. Health & environmental context on the map (2:00–2:45)

**[ON SCREEN: Health layer + environmental layer controls]**

> Beyond alerts, the map layers **health context** and **environment**:
>
> - **Population** or **malaria incident rate** choropleth  
> - **Rainfall**, **land surface temperature**, and **NDVI** overlays from satellite data  
>
> The **date range** controls filter map layers, charts, and alert replay together—so every view stays synchronized.

**[Change health layer; toggle rainfall or temperature overlay]**

> Environmental layers help explain *why* a district may be flagged—not just *that* it is flagged.

---

### 4. Charts — Environmental + transmission (2:45–4:15)

**[ON SCREEN: Charts tab, district selected]**

> Select the **Charts** tab to drill into one district.
>
> The **environmental time series** pulls live data from Google Earth Engine—precipitation, day/night/mean land surface temperature, vegetation indices, and more—scoped to the district boundary you clicked.

**[Switch weather dataset dropdown: e.g. Precipitation → LST Mean Temperature]**

> Below that, the **transmission forecast chart** shows:
> - **Observed cases** (history)  
> - **Forecast median** and **uncertainty band** (8 weeks ahead by default)  
> - **Seasonal detection and warning thresholds**  
> - An **alert marker** when the forecast crosses a threshold  
>
> Both charts share the same **date range pickers**. Zoom or pan one chart and the other **follows**. Hover either chart and a **vertical line** appears on both—so environmental conditions and transmission line up in time.

**[Demonstrate synced zoom and hover across env + forecast charts]**

> On first load the dashboard uses a fast **16-week bootstrap**; full district history loads automatically when you need a wider span—so startup stays fast even at national scale.

---

### 5. Forecast Table & district comparison (4:15–5:30)

**[ON SCREEN: Forecast Table tab]**

> Switch to the **Forecast Table** for an operational priority list.
>
> Every district with a current forecast appears in a **sortable table**: status, magnitude above threshold, persistence, population at risk, and latest forecast.
>
> The **top three priority rows** are highlighted. Click a row to add that district to the **comparison chart**—up to **three districts** at once.

**[Click 2–3 table rows; scroll to comparison chart]**

> The comparison chart shows **solid lines** for your selected districts. Behind them, the **top ten priority districts** appear as **transparent background traces**—so you see national context without cluttering the main message.

**[Point out background vs foreground lines]**

---

### 6. Refresh, export & custom projects (5:30–6:30)

**[ON SCREEN: Top toolbar]**

> **Refresh Forecast** re-runs the EPIDEMIA pipeline for the **selected admin region**—not all 851 districts at once—so regional updates stay practical on a schedule teams can maintain.
>
> **Export PDF** generates a multi-page weekly report: summary, map snapshot, alert table, and charts—ready for a Monday briefing slide deck or email attachment.

**[Click New Project — optional, if time allows]**

> The **Project Setup Wizard** lets partners upload their own **epidemiological CSV**, validate columns against the national woreda registry, configure species and horizon, and run a **first forecast** in an isolated project space—useful for pilots, research, or sub-national trials.

---

### 7. Science & architecture (6:30–7:30) — technical audience

**[ON SCREEN: Can stay on dashboard or switch to architecture slide]**

> For technical partners, EPIDEMIA combines three services:
>
> | Layer | Role |
> |-------|------|
> | **React dashboard** | Map, charts, tables, PDF export |
> | **Forecast API** | Seasonal GAM thresholds + AutoReg forecasts, regional cache |
> | **Environmental API** | Google Earth Engine time series and map overlays |
>
> **Alert logic** uses seasonal Poisson GAM thresholds with rainfall and temperature covariates. When GAM fitting is unavailable, Farrington-style surveillance baselines provide a fallback.
>
> **Thresholds vary by calendar week**—malaria seasonality is built in, not flattened to a single static cutoff.
>
> Deployments run on **OU DISC Kubernetes** with CI/CD from GitHub; district-level cache files keep production charts fast without shipping 200 MB JSON files in git.

---

### 8. Closing (7:30–8:00)

**[ON SCREEN: Map with alerts + Forecast Table visible]**

> EPIDEMIA turns national surveillance data into **geographic alerts**, **quantified forecasts**, and **environmental context**—in one dashboard teams can use every week.
>
> From a flagged district on the map to a PDF for leadership, the workflow is designed for **real program decisions**, not just visualization.
>
> Questions?

---

## Feature checklist (for Q&A)

| Feature | One-line description |
|---------|---------------------|
| National scope | ~851 woredas, admin-1 region filter |
| Dual species | *P. falciparum* and *P. vivax* |
| 8-week forecast | AutoReg with uncertainty bands |
| Seasonal thresholds | GAM-based detection & warning lines |
| Early Warning / Early Detection | Map markers + table priority ranking |
| Alert history animation | Weekly replay on map + charts |
| Environmental chart | GEE: rain, LST, NDVI, etc. (°C for temperature) |
| Synced charts | Shared date range, zoom, hover line |
| Forecast Table | Sortable, top-3 highlight, row → compare |
| Comparison chart | 3 selected + top 10 background districts |
| Regional refresh | Re-run pipeline per admin region |
| PDF export | Map, table, charts in one report |
| Project Wizard | Upload CSV → validate → first forecast |
| Fast startup | Map bootstrap → deferred full load → lazy district history |
| Production deploy | UI + forecast-api + env-api on OU cloud |

---

## Demo troubleshooting

| Issue | What to say / do |
|-------|------------------|
| Map loads but charts show 16 weeks only | District detail still loading; wait or check forecast API / district caches in production |
| Environmental chart error | Ensure env API is running (`node server.js` in `backend/app`) with GEE credentials |
| Refresh Forecast fails | Region must be selected; server needs `env_data.csv` for full pipeline |
| No alerts on map | Switch species; try another region; confirm bootstrap JSON is deployed |

---

## Suggested recording shot list

1. Wide: full dashboard, national map  
2. Medium: click district → charts populate  
3. Close: hover sync line across both charts  
4. Medium: Forecast Table sort + comparison selection  
5. Wide: alert animation one full cycle  
6. Medium: PDF export download  
7. Optional: Project Wizard upload step  

---

*EPIDEMIA · OU DISC · EPHI partner dashboard · Ethiopia national malaria early warning*
