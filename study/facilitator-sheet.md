# Facilitator sheet — EDI study

**Study ID:** ____________  
**Date:** ____________  
**Experimenter:** ____________  

## Participant

| Field | Value |
|-------|-------|
| Participant ID | |
| Condition | ☐ Baseline ☐ EDI |
| URL used | |
| Role framing given | National / regional malaria early-warning officer |
| Species locked | ☐ Pf ☐ Pv |
| Notes | |

## Scenario gold keys (fill once from live dashboard, then freeze)

Open EDI (`?condition=edi`), Forecast Table + Decision. Pick three districts and record:

### S1 — Strong early warning / clearer signal

| Field | Value |
|-------|-------|
| District name | |
| Status (EW/ED/Normal) | |
| Level (Low/Med/High) | |
| Alert weeks | |
| Uncertainty label | |
| System recommended action | |
| Expected Task A points | Alert type EW; threshold/forecast relation; magnitude or persistence |
| Expected Task C priority | Usually **1st** among S1–S3 |

### S2 — Alert with higher uncertainty / weaker evidence

| Field | Value |
|-------|-------|
| District name | |
| Status | |
| Level | |
| Alert weeks | |
| Uncertainty label | |
| System recommended action | |
| Expected Task B pattern | Weaker / more cautious action than S1; cite uncertainty |
| Expected Task C priority | Usually **2nd** (or 1st only if justified) |

### S3 — Early detection or Normal / lower priority

| Field | Value |
|-------|-------|
| District name | |
| Status | |
| Level | |
| Uncertainty label | |
| System recommended action | |
| Expected Task C priority | Usually **not 1st** |

## API / deliberation pre-flight

| Check | Result |
|-------|--------|
| `/health` ok | ☐ |
| `/edi/status` available (LLM) or fallback-only | ☐ LLM ☐ Fallback-only (freeze for this study run) |
| EDI: Decision shows Deliberate Suggest/Explore | ☐ |
| EDI: Evaluate priority shows Compare (no auto-rank) | ☐ |
| Baseline: no Decision / priority / Deliberate | ☐ |

## Procedure checklist

- [ ] Clear site data if reusing a browser (or use a fresh profile) so prior judgments do not leak  
- [ ] Open correct condition URL; confirm study banner  
- [ ] Lock species + region if needed  
- [ ] Give participant worksheet; do not coach on answers  
- [ ] Task A (S1 only) — time: ______  
- [ ] Task B (S1 vs S2) — time: ______  
- [ ] Task C (S1–S3 priority) — time: ______  
- [ ] EDI only: note use of Deliberate (Suggest/Explore), Confirm/Override/Annotate, Approve/Hold, Evaluate priority + Compare  
- [ ] Debrief quotes (one for understanding, one for uncertainty, one for decision)

## Debrief probes

1. What made you trust or distrust the alert?  
2. What information was missing?  
3. (EDI) Did Suggest/Explore or Compare change how you thought—without deciding for you?  
4. (EDI) Did approval / feedback / override change what you would do?

## Logs to capture (optional)

| Source | What |
|--------|------|
| Browser localStorage | `epidemia.decisionJudgments.v1`, `epidemia.priorityJudgments.v1`, `epidemia.alertOutcomes.v1`, `epidemia.alertApprovals.v1` |
| Screen / notes | Districts opened, time on task, whether Deliberative badge / Compare appeared |
| Worksheet | Written answers for scoring |
