# Abstract draft (CHI) — freeze claims until study results

## Core thesis (everything reinforces this)

EDI shifts the focus of human–AI interaction from understanding or steering AI outputs to supporting accountable human decisions under uncertainty.

## What EDI is / is not (freeze)

**EDI is not:** XAI + uncertainty + LLM + dashboard.

**EDI is:** A decision-centered interaction paradigm in which AI evidence is interpreted, uncertainty is made actionable, alternatives are deliberated, AI assessments can be challenged, and the human retains accountable decision authority.

**EPIDEMIA 2.0** is the empirical vehicle through which we investigate that paradigm.

## Frozen distinctions

| Approach | Primary object | Human–AI interaction |
|---|---|---|
| Explainable AI | AI output/model | Understand why the AI produced an output |
| Human-centered XAI | AI output + user | Make explanations understandable/useful |
| Mixed-initiative VA | Analytical process | Human and computational agents collaboratively analyze |
| **EDI** | **Decision under uncertainty** | **Interpret → Deliberate → Challenge → Human judgment** |

LLMs are optional: one mechanism for Interpret / Deliberate / Challenge — not required for EDI, and never above human judgment.

## Design principles

- **DP1 — Explain decisions, not only predictions:** answer evidentiary questions for the decision at hand.
- **DP2 — Make uncertainty actionable:** uncertainty shapes evidence, alternatives, and trade-offs — not only a PI band.
- **DP3 — Preserve human judgment through challenge:** support questioning, counter-evidence, override, and justification.

## Novelty statement (working)

We introduce Explainable Decision Intelligence (EDI), a decision-centered interaction paradigm in which AI evidence is interpreted, uncertainty is made actionable, alternatives are deliberated, AI assessments can be challenged, and the human retains accountable decision authority. We investigate EDI through EPIDEMIA~2.0, an epidemic early-warning system, evaluating effects on understanding, trust calibration, and intervention decisions.

```latex
\begin{abstract}
  Epidemic early-warning systems often surface forecasts and alerts without adequately supporting the accountable decisions officers must make under uncertainty. We introduce Explainable Decision Intelligence (EDI), a human-centered interaction paradigm that organizes AI-generated evidence around Interpret, Deliberate, and Challenge interactions culminating in human judgment (confirm, override, annotate). Unlike explainable AI, which primarily seeks to make model outputs understandable, and unlike mixed-initiative visual analytics, which primarily coordinates human and computational agents during analysis, EDI centers the decision itself---the evidence, uncertainty, alternatives, trade-offs, and accountability surrounding that decision. We operationalize EDI in EPIDEMIA~2.0, a malaria early-warning system for Ethiopia. A grounded language model is one optional mechanism for evidence-grounded deliberation; it does not decide. Options remain constrained to an operational action catalog, Challenge supports calibrated skepticism, and officers retain commitment. In a task-based user study comparing EDI with a prediction-centric baseline, we evaluate alert understanding, trust calibration, and intervention prioritization. We contribute design principles for decision-centered human--AI systems in public health and related high-stakes domains.
\end{abstract}
```

## After results (swap one sentence)

Replace:

> In a task-based user study comparing EDI with a prediction-centric baseline, we evaluate alert understanding, trust calibration, and intervention prioritization.

With measured outcomes only, e.g.:

> In a task-based user study (N=__), EDI improved \_\_\_ relative to a prediction-centric baseline on alert understanding (F1), trust calibration (F2), and priority justification (F3).

## Study arm note (methods, not abstract)

- **Baseline** (`?condition=baseline`): Prediction-centric surfaces (map / charts / table); no Decision, priority, or deliberative panels.
- **EDI** (`?condition=edi`): Interpret / Deliberate / Challenge + human judgment. LLM optional: deterministic fallbacks still expose Options, Evidence, What could change, Challenge, and Compare.
