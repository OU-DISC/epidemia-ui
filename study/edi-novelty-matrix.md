# EDI novelty matrix (claim safety)

Companion to the live canvas `EDI-novelty-matrix.canvas.tsx`. Use before rewriting CHI Introduction / Related Work.

## Thesis

EDI shifts the focus of human–AI interaction from understanding or steering AI outputs to supporting accountable human decisions under uncertainty.

## What EDI is / is not

**Not:** XAI + uncertainty + LLM + dashboard.

**Is:** A decision-centered interaction paradigm in which AI evidence is interpreted, uncertainty is made actionable, alternatives are deliberated, AI assessments can be challenged, and the human retains accountable decision authority.

**EPIDEMIA 2.0** is the empirical vehicle for investigating that paradigm.

## Primary-object map

| Approach | Primary object | Core question |
|---|---|---|
| Explainable AI | Model / prediction output | Why did the model produce this? |
| Human-centered XAI | Output + user | How should we explain this to this user? |
| Mixed-initiative VA | Analytical process | How do human + agents collaboratively analyze? |
| Decision support (DSS/CDSS) | Recommended action | What should the user do next? |
| Uncertainty communication | Distribution / confidence | How uncertain is this estimate? |
| LLM deliberation / assistants | Dialogue / generated advice | How can an LLM help reason or advise? |
| **EDI** | **Accountable decision under uncertainty** | **When to trust, question, or override AI evidence?** |

MIVA anchors: Sperrle-Roth 2026 (co-adaptive guidance); [CGF 2026 MIVA scoping review](https://doi.org/10.1111/cgf.70434).

## SAFE to claim as novel

1. Decision-centered synthesis: Interpret → Deliberate → Challenge → Human judgment as the interaction unit.
2. First-class **Challenge** for counter-reliance / calibrated skepticism in an EWS decision workflow.
3. **Actionable uncertainty** coupled to alternatives and Challenge (not PI-only visualization).
4. Optional **grounded LLM under EDI** (mechanism, not decision maker) with deterministic fallbacks.

## CONDITIONAL

- Empirical effects on understanding, trust calibration, prioritization — after F1–F3.
- DP1–DP3 as design contributions of this paper (not proven universal laws).

## AVOID

- Framing EDI as “XAI + uncertainty + LLM + dashboard.”
- Inventing explanations, HITL, uncertainty viz, or mixed-initiative collaboration.
- “LLM suggests → human accepts/rejects” (collapses into MIVA guidance).
- “First ever AI + uncertainty + override DSS.”

## SHARED (cite)

- XAI / HCXAI techniques and over-reliance findings.
- MIVA guidance / co-adaptation.
- DSS accept–override lineages.
- Uncertainty visualization.
- LLM assistants as mechanisms.

## Related Work skeleton

Mixed-initiative VA coordinates human and computational agents during analysis. HCXAI improves how predictions are explained. EDI builds on both but shifts the primary object from analysis or model outputs to accountable decisions under uncertainty—organizing evidence interpretation, alternative evaluation, Challenge, and human commitment—without requiring an LLM.
