# EPIDEMIA — Feature Highlight Script

Use this script for live demos, stakeholder briefings, training workshops, or recorded walkthroughs.

**Duration:** ~8 minutes (full) · ~2 minutes (short)  
**Audience:** Public health planners, epidemiologists, program managers, technical partners  
**Demo URL (production):** https://epidemia-ui.disc.ourcloud.ou.edu/  
**Demo URL (local):** http://localhost:3000 (use production build + forecast data for realistic load times)

---

## Before you start

1. Open the dashboard and wait until **“Loading forecast data…”** clears and map alerts appear (first visit may take 30–60 seconds on slow connections; repeat visits are faster).
2. Select **Ethiopia**, **P. falciparum malaria**, and a region with active alerts (e.g. Amhara or Oromia).
3. Confirm the **Evidence** tab is visible on the right panel.
4. Optional: pre-select a high-priority district so charts load immediately.

---

## Short version (~2 minutes)

> **EPIDEMIA** is Ethiopia’s national malaria early warning dashboard. It brings together **all reporting woredas**, **multi-week forecasts**, **environmental drivers**, and **actionable alerts** in one place.
>
> Above the map, **Current situation** shows alert status, recent evidence, and near-term forecast at a glance—including **four-week early-detection dots** on the Alert tile.
>
> The map shows where **Early Warning** and **Early Detection** signals are active. Click any district to open its **Evidence** tab: a transmission **forecast chart** and **weather time series** below.
>
> The **Forecast** tab ranks districts by priority so programs can focus limited resources. Compare up to three districts—or see the top ten as background context—in one chart.
>
> The optional **Action** tab supports confirm, override, and annotate workflows for study or operational deliberation.
>
> Forecasts refresh **by region**, custom projects can be uploaded through the **Project Wizard**, and a **PDF report** exports the current view for briefings.
>
> Under the hood: seasonal Poisson GAM forecasts and thresholds, Google Earth Engine environmental layers, and a production stack deployed on OU DISC cloud infrastructure.

---

## Full walkthrough script

### 1. Opening — The problem (0:00–0:45)

**[ON SCREEN: Dashboard toolbar and Current situation strip above map]**

> Malaria control in Ethiopia spans hundreds of districts, two parasite species, and strong seasonal and environmental drivers. Program staff need more than static reports—they need to know **where** risk is rising, **how far ahead** to plan, and **what environmental conditions** may be contributing.
>
> **EPIDEMIA**—the Ethiopia Malaria Early Warning Dashboard—answers those questions in a single national view built for EPHI and partner agencies.

**[Point to Current situation tiles: Alert · Evidence · Forecast]**

> **Current situation** gives a quick readout for the selected scope: alert status with **four dots** for the last four observed weeks in the early-detection window, a sparkline of recent cases, and observed vs projected cases for the near term.

---

### 2. National map & alerts (0:45–2:00)

**[ON SCREEN: Map panel, zoomed to national view]**

> The heart of EPIDEMIA is an interactive map of **all reporting woredas** across Ethiopia.
>
> **Alert controls** above the map place markers directly on flagged districts:
> - **Early Warning** (⚠️) — forecast weeks above the seasonal expected level  
> - **Early Detection** (🔍) — recent **observed** weeks above the Farrington detection threshold  
>
> These are separate signals—a district can have one, both, or neither. Hover a district or marker for a structured tooltip; click to focus the right panel.
>
> Toggle species with the **Disease** selector to switch between ***P. falciparum*** and ***P. vivax***.

**[Toggle Early Warning / Early Detection; click a flagged district]**

> The map supports **region filtering** from the toolbar so teams can work at admin-1 scale without losing national context.

**[Optional: enable Alert History animation]**

> **Alert history** replays how warnings and detections evolved week by week—useful for after-action reviews and seasonal pattern discussions.

---

### 3. Health & environmental context on the map (2:00–2:45)

**[ON SCREEN: Map layer picker + date range above map]**

> Beyond alerts, the map layers **health context** and **environment**:
>
> - **Incidence rate** or **population** choropleth  
> - **Rainfall**, **land surface temperature**, and **NDVI** overlays from satellite data  
>
> The **date range** slider above the map filters map layers, Evidence charts, and alert replay together—so every view stays synchronized.

**[Change health layer; toggle rainfall or temperature overlay]**

> Environmental layers help explain *why* a district may be flagged—not just *that* it is flagged.

---

### 4. Evidence tab — Forecast + environmental charts (2:45–4:15)

**[ON SCREEN: Evidence tab, district selected]**

> Open the **Evidence** tab to drill into one district.
>
> At the top, a compact **Alerts by region** chart shows elevated districts grouped by admin region when any are in scope.
>
> The **transmission forecast chart** shows:
> - **Observed cases** (history)  
> - **Forecast median** and **uncertainty band** (horizon selectable: 4–26 weeks)  
> - **Seasonal detection and warning thresholds**  
> - Alert markers when thresholds are crossed  
>
> Use the toolbar to switch **cases vs incidence** or change the forecast horizon.

**[Point to forecast chart; adjust horizon or value mode]**

> Below that, the **Weather time series** pulls data from Google Earth Engine—precipitation, day/night/mean land surface temperature, vegetation indices, and more—scoped to the district boundary you clicked.

**[Switch weather dataset dropdown: e.g. Precipitation → LST Mean Temperature]**

> Both charts share the **date range** above the map. Zoom or pan one chart and the other **follows**. Hover either chart and a **vertical line** appears on both—so environmental conditions and transmission line up in time.

**[Demonstrate synced zoom and hover across forecast + weather charts]**

> On first load the dashboard prioritizes map alerts, then loads the full forecast bootstrap; cached data makes return visits much faster. Extended district history may load in the background when you widen the date range.

---

### 5. Forecast tab — Priority table & comparison (4:15–5:30)

**[ON SCREEN: Forecast tab]**

> Switch to the **Forecast** tab for an operational priority list.
>
> Every district with a current forecast appears in a **sortable table**: status, magnitude above threshold, persistence, population at risk, and latest forecast.
>
> The **top priority rows** are highlighted. Click a row to add that district to the **comparison chart**—up to **three districts** at once.

**[Click 2–3 table rows; scroll to comparison chart]**

> The comparison chart shows **solid lines** for your selected districts. Behind them, the **top ten priority districts** appear as **transparent background traces**—so you see national context without cluttering the main message.

**[Point out background vs foreground lines]**

---

### 6. Action, refresh, export & custom projects (5:30–6:45)

**[ON SCREEN: Action tab — if shown in your study arm]**

> The **Action** tab (when enabled) walks through alert rationale, uncertainty, and a recommended response. Users can **Confirm**, **Override**, annotate local knowledge, give outcome feedback, and gate operational release—judgments are saved in the browser for deliberation studies.

**[ON SCREEN: Top toolbar]**

> **Refresh Forecast** re-runs the EPIDEMIA pipeline for the **selected admin region**—not the entire country at once—so regional updates stay practical on a schedule teams can maintain.
>
> **Export PDF** generates a multi-page weekly report: summary, map snapshot, alert table, and charts—ready for a Monday briefing slide deck or email attachment.

**[Click New Project — optional, if time allows]**

> The **Project Setup Wizard** lets partners upload their own **epidemiological CSV**, validate columns against the national woreda registry, configure species and horizon, and run a **first forecast** in an isolated project space—useful for pilots, research, or sub-national trials.

---

### 7. Science & architecture (6:45–7:30) — technical audience

**[ON SCREEN: Can stay on dashboard or switch to architecture slide]**

> For technical partners, EPIDEMIA combines three services:
>
> | Layer | Role |
> |-------|------|
> | **React dashboard** | Map, Evidence/Forecast/Action panels, PDF export |
> | **Forecast API** | Seasonal GAM forecasts/thresholds (epidemiar-aligned), regional cache |
> | **Environmental API** | Google Earth Engine time series and map overlays |
>
> **Alert logic** uses seasonal Poisson GAM thresholds with rainfall and temperature covariates. When GAM fitting is unavailable, Farrington-style surveillance baselines provide a fallback.
>
> **Thresholds vary by calendar week**—malaria seasonality is built in, not flattened to a single static cutoff.
>
> Deployments run on **OU DISC Kubernetes** with CI/CD from GitHub; horizon-specific bootstrap files and browser caching keep production charts responsive without shipping multi-hundred-MB JSON in git.

---

### 8. Closing (7:30–8:00)

**[ON SCREEN: Map with alerts + Forecast tab visible]**

> EPIDEMIA turns national surveillance data into **geographic alerts**, **quantified forecasts**, and **environmental context**—in one dashboard teams can use every week.
>
> From a flagged district on the map to a PDF for leadership, the workflow is designed for **real program decisions**, not just visualization.
>
> Questions?

---

## Feature checklist (for Q&A)

| Feature | One-line description |
|---------|---------------------|
| National scope | All reporting woredas, admin-1 region filter |
| Dual species | *P. falciparum* and *P. vivax* |
| Current situation | Alert · Evidence · Forecast tiles above map; 4-week detection dots |
| Multi-week forecast | Seasonal GAM expected cases with detection/warning bands |
| Seasonal thresholds | Same GAM model (mu + quasi-Poisson upper bound) |
| Early Warning / Early Detection | Map markers + Forecast tab priority ranking |
| Alert history animation | Weekly replay on map + charts |
| Evidence tab | Regional alert mini-chart + forecast + weather time series |
| Weather chart | GEE: rain, LST, NDVI, etc. (°C for temperature) |
| Synced charts | Shared date range (above map), zoom, hover line |
| Forecast tab | Sortable table, priority highlight, row → compare |
| Comparison chart | 3 selected + top 10 background districts |
| Action tab | Confirm / override / annotate (study or EDI arm) |
| Regional refresh | Re-run pipeline per admin region |
| PDF export | Map, table, charts in one report |
| Project Wizard | Upload CSV → validate → first forecast |
| Fast startup | Map bootstrap first, cached repeat visits, lazy chart chunks |
| Production deploy | UI + forecast-api + env-api on OU cloud |

---

## Demo troubleshooting

| Issue | What to say / do |
|-------|------------------|
| “Loading forecast data…” stays a long time | Normal on first visit over slow mobile data; wait or refresh once; repeat visits use local cache |
| Map loads but charts empty | Click a district; open **Evidence** tab |
| Charts show limited history only | District detail still loading; widen date range or wait for background fetch |
| Environmental chart error | Ensure env API is running with GEE credentials (local demos only) |
| Refresh Forecast fails | Region must be selected; server needs data files for full pipeline |
| No alerts on map | Switch species; try another region; confirm bootstrap JSON is deployed |
| Tooltip stuck on map | Move cursor away or pan/zoom the map |

---

## Suggested recording shot list

1. Wide: full dashboard, national map + Current situation strip  
2. Medium: click district → Evidence tab populates  
3. Close: hover sync line across forecast + weather charts  
4. Medium: Forecast tab sort + comparison selection  
5. Wide: alert animation one full cycle  
6. Medium: PDF export download  
7. Optional: Action tab or Project Wizard upload step  

---

*EPIDEMIA · OU DISC · EPHI partner dashboard · Ethiopia national malaria early warning*
