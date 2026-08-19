# EPIDEMIA 2.0 — EDI study materials (Task A / B / C)

Baseline vs EDI contrast for CHI evaluation of **Explainable Decision Intelligence**.

## EDI layers (what the EDI arm exposes)

1. **Predictive intelligence** — forecasts, thresholds, EW/ED alerts (both arms)  
2. **Explainable evidence** — Why-this-alert, residual uncertainty chart  
3. **Deliberative intelligence** — grounded LLM (or deterministic fallback): Explain / Suggest / Explore / Compare  
4. **Human judgment** — confirm / override / annotate, approve/hold, priority commit  

The language model does **not** decide; officers commit judgments.

## Conditions

| Arm | URL | Surfaces |
|-----|-----|----------|
| **Baseline** | `http://localhost:3000/?condition=baseline` | Map, Charts, Forecast Table (no Decision, no Evaluate priority, no HITL, no Deliberate) |
| **EDI** | `http://localhost:3000/?condition=edi` | Decision (Explain + Suggest/Explore + HITL) + Evaluate priority (Compare + rank) |

Use the **same forecast cache / species** for both arms. Prefer between-subjects (one arm per participant).

**LLM note:** Configure `EDI_LLM_API_KEY` in `frontend/epidemia-ui/backend/.env` for grounded rewrites. Without a key, Suggest / Explore / Compare still appear via structured fallbacks — freeze whether the study run uses LLM-on or fallback-only and keep it constant within an arm.

## Session flow (~45–60 min)

1. Consent + role prompt (national/regional malaria officer) — 5 min  
2. Short tour (auto-skips Decision in Baseline) — 3 min  
3. **Task A** → **Task B** → **Task C**  
4. Optional SUS / short debrief (5 min)

## Files

| File | Audience |
|------|----------|
| [facilitator-sheet.md](./facilitator-sheet.md) | Experimenter (gold keys, procedure) |
| [participant-worksheet.md](./participant-worksheet.md) | Print / share with participant |
| [scoring-rubrics.md](./scoring-rubrics.md) | Raters (F1–F3) |
| [abstract-draft.md](./abstract-draft.md) | Paper abstract (soft claims until results) |

## Pre-flight (experimenter)

1. Restart forecast API so `/edi/status` and `/edi/deliberate` exist (`npm run api` from `frontend/epidemia-ui`).  
2. Optional: set `EDI_LLM_ENABLED=true` + `EDI_LLM_API_KEY` in `backend/.env`.  
3. Open EDI arm; confirm Decision shows **Deliberate** (Suggest/Explore) and priority shows **Compare**.  
4. Open Baseline arm; confirm those surfaces are absent.  
5. Fill S1–S3 in the facilitator sheet from the live dashboard; freeze species + date range.

## After the pilot

1. Run n=2–3 pilot; fix ambiguous gold answers.  
2. Score with rubrics; compute Baseline vs EDI contrasts for F1–F3.  
3. Swap the abstract evaluation sentence for measured results ([abstract-draft.md](./abstract-draft.md)).
