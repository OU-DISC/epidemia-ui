"""
Grounded LLM-mediated EDI deliberation (Layer 3).

Interactions: explain | suggest | explore | compare
The model deliberates over structured evidence only — humans still decide.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Set, Tuple

from app.schemas.edi import (
    EdiChallengeBlock,
    EdiCompareDeliberate,
    EdiCompareInterpret,
    EdiDeliberateResponse,
    EdiExplanationBlock,
    EdiOption,
    EdiProvenance,
    EdiStatusResponse,
    EdiUncertaintyView,
)

ALLOWED_INTERACTIONS = frozenset(
    {"brief", "explain", "compare", "explore", "suggest", "challenge"}
)

BASE_RULES = """You are an evidence-grounded decision-support assistant inside EPIDEMIA (malaria early warning, Ethiopia).
You support Explainable Decision Intelligence (EDI) Layer 3: deliberative intelligence.

Rules (non-negotiable):
1. Use ONLY facts present in the evidence JSON. Do not invent epidemiological facts, cases, weeks, thresholds, or causes.
2. Distinguish observed data, model predictions, and uncertainty when the evidence provides them.
3. Do not make the final decision. Do not approve, override, rank, or commit an action for the officer.
4. Environmental claims: ONLY when evidence.environmental.available is true. Then RELATE rainfall/temperature fields (and environmental.findings) to the alert as co-occurrence context — never invent values, and never claim proven causation.
5. If evidence.environmental.available is false, do not invent rainfall, temperature, or climate drivers; you may note the gap.
6. Prefer clear operational language for surveillance officers.
7. If evidence is insufficient for a claim, omit the claim.
"""

PROMPTS = {
    "brief": BASE_RULES
    + """
Task: Produce ONE structured deliberative brief for the officer.

Return JSON only with EXACTLY this schema (no extra prose outside JSON):
{
  "explanation": {
    "why_alert": "2-3 sentences: why the alert status applies",
    "supporting_evidence": ["point grounded in evidence", "..."],
    "contradicting_evidence": ["what weakens confidence", "..."]
  },
  "uncertainty": {
    "level": "low|moderate|high",
    "evidence": "grounded in evidence.uncertainty / investigation / historical_reliability",
    "decision_implication": "how uncertainty should affect action intensity"
  },
  "options": [
    {
      "id": "investigate",
      "action": "Investigate locally",
      "supporting_evidence": ["why this option is supported"],
      "tradeoffs": ["risk or downside"]
    }
  ],
  "what_could_change_decision": ["open question / verification check", "..."],
  "evidence_gaps": ["gap already listed in evidence.evidence_gaps or unavailable_fields"],
  "evidence_refs": ["status", "investigation", "uncertainty", "recommendation", "historical_reliability", "environmental"]
}

Option rules:
- Include 2-3 options.
- Each options[].id MUST be one of evidence.action_catalog[].id (monitor|watch|investigate|escalate).
- Include evidence.recommendation.action_id.
- Do not declare a single winner.
- When evidence.environmental.available is true, include at least one supporting or contradicting point that relates environmental.findings / rainfall_change_percent / temperature_change_c to case exceedance (co-occurrence only).
- Do NOT invent provenance, rainfall, temperature, or neighbor counts — use only evidence fields.
- Do NOT invent district/species; the server attaches those.
""",
    "challenge": BASE_RULES
    + """
Task: CHALLENGE this assessment to support calibrated skepticism (counter-reliance).
Argue the strongest grounded reasons an officer might QUESTION or OVERRIDE the alert/recommendation.
Do NOT invent false-positive history unless evidence.local_outcome_feedback mentions false alarms.
Do NOT decide for the officer. Do NOT simply restate the recommendation as if settled.

Return JSON only with EXACTLY this schema:
{
  "challenge": {
    "summary": "2-3 sentences: strongest reason(s) to question this assessment",
    "reasons_to_question": ["grounded caveat", "..."],
    "what_would_reduce_uncertainty": ["concrete verification or data that would help", "..."]
  },
  "evidence_refs": ["uncertainty", "historical_reliability", "investigation", "evidence_gaps", "local_outcome_feedback"]
}

Rules:
- Prefer uncertainty, residual history, forecast vs observed mismatch, weak environmental co-occurrence, evidence_gaps, and local_outcome_feedback when present.
- If evidence is strong and little counters it, say so honestly but still list what would still be worth verifying.
- Keep language operational and brief.
""",
    "explain": BASE_RULES
    + """
Task: Explain why the alert status applies.

Return JSON only:
{
  "summary": "2-3 sentences",
  "bullets": ["short factual bullet", "..."],
  "questions": [],
  "options": [],
  "evidence_refs": ["key", "..."]
}
""",
    "suggest": BASE_RULES
    + """
Task: Suggest 2-3 decision alternatives supported by the evidence.
You MUST only use action ids from evidence.action_catalog[].id.
Do not invent new action ids. Do not declare a single winner; the officer decides.
Include the catalog-recommended action and 1-2 nearby alternatives when evidence supports debate.

Return JSON only:
{
  "summary": "1-2 sentences on how to read the options (not a decision)",
  "bullets": [],
  "questions": [],
  "options": [
    {
      "id": "investigate",
      "label": "Investigate locally",
      "pros": ["evidence-backed pro"],
      "cons": ["evidence-backed con or uncertainty caveat"],
      "evidence_refs": ["status"]
    }
  ],
  "evidence_refs": ["action_catalog", "recommendation", "status"]
}
""",
    "explore": BASE_RULES
    + """
Task: Investigate using evidence.investigation, then ask what could still change the recommendation.

Return JSON only:
{
  "summary": "1-2 sentences: what the lookup shows and what remains open",
  "bullets": ["looked-up finding…", "..."],
  "questions": ["open judgment question…", "..."],
  "options": [],
  "evidence_refs": ["investigation", "recommendation", "uncertainty"]
}
""",
    "compare": BASE_RULES
    + """
Task: Multi-district priority deliberation for 2-3 candidates.
Do NOT assign a priority ranking. Do NOT declare a winner or order (1st/2nd/3rd).
Organize contrast as INTERPRET / DELIBERATE / CHALLENGE for priority — the officer ranks.

Return JSON only with EXACTLY this schema:
{
  "compare_interpret": {
    "summary": "2-3 sentences contrasting candidates without ranking",
    "contrasts": ["District A vs B grounded distinction", "..."]
  },
  "compare_deliberate": {
    "priority_tradeoffs": [
      "Attending District X first: benefit vs risk grounded in evidence",
      "..."
    ]
  },
  "challenge": {
    "summary": "Strongest reason the obvious first pick might be wrong",
    "reasons_to_question": ["grounded caveat about relative priority", "..."],
    "what_would_reduce_uncertainty": ["check that could reverse ranking", "..."]
  },
  "evidence_refs": ["candidates"]
}

Rules:
- Use only evidence.candidates fields (status, magnitude, uncertainty, recommendation, investigation_findings, local_outcome_feedback).
- Prefer operational language for who might need attention — never output a ranked list.
- Include at least 2 contrasts, 2 priority_tradeoffs, 1 challenge reason, and 2 ranking-reversal checks.
""",
}


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def llm_config() -> Dict[str, Any]:
    api_key = (
        os.getenv("EDI_LLM_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or ""
    ).strip()
    base_url = (
        os.getenv("EDI_LLM_BASE_URL") or "https://api.openai.com/v1"
    ).rstrip("/")
    model = (os.getenv("EDI_LLM_MODEL") or "gpt-4o-mini").strip()
    local_ollama = "11434" in base_url.lower() or "ollama" in base_url.lower()
    # Local Ollama needs no secret; cloud providers need a real API key.
    if local_ollama and not api_key:
        api_key = "ollama"
    enabled = _env_flag("EDI_LLM_ENABLED", default=bool(api_key) or local_ollama)
    return {
        "api_key": api_key,
        "base_url": base_url,
        "model": model,
        "enabled": enabled and (bool(api_key) or local_ollama),
    }


def get_edi_status() -> EdiStatusResponse:
    cfg = llm_config()
    if not cfg["enabled"]:
        return EdiStatusResponse(
            available=False,
            enabled=False,
            model=cfg["model"],
            detail="Set EDI_LLM_API_KEY (or OPENAI_API_KEY) and EDI_LLM_ENABLED=true.",
        )
    return EdiStatusResponse(
        available=True,
        enabled=True,
        model=cfg["model"],
        detail="Grounded LLM deliberation is available (brief/explain/suggest/explore/compare).",
    )


def _numbers_in_text(text: str) -> Set[str]:
    return set(re.findall(r"(?<![A-Za-z])\d+(?:\.\d+)?", text or ""))


def _evidence_number_vocab(evidence: Dict[str, Any]) -> Set[str]:
    blob = json.dumps(evidence, ensure_ascii=True, default=str)
    vocab = _numbers_in_text(blob)
    extra: Set[str] = set()
    for token in list(vocab):
        try:
            value = float(token)
        except ValueError:
            continue
        extra.add(str(int(round(value))))
        if value.is_integer():
            extra.add(str(int(value)))
    vocab.update(extra)
    vocab.update({"0", "1", "2", "3", "4"})
    return vocab


def _collect_keys(value: Any, into: Set[str]) -> None:
    """Allow evidence_refs to cite nested JSON keys (common with local LLMs)."""
    if isinstance(value, dict):
        for key, child in value.items():
            into.add(str(key))
            _collect_keys(child, into)
    elif isinstance(value, list):
        for child in value[:12]:
            _collect_keys(child, into)


def _allowed_ref_keys(evidence: Dict[str, Any]) -> Set[str]:
    keys: Set[str] = set()
    _collect_keys(evidence, keys)
    keys.update(
        {
            "status",
            "level",
            "alert_count",
            "magnitude_percent",
            "persistence_weeks",
            "triggered_weeks",
            "uncertainty",
            "deterministic_why",
            "district",
            "region",
            "species",
            "recommendation",
            "action_catalog",
            "unavailable_fields",
            "candidates",
            "interaction",
            "investigation",
            "findings",
            "recent_observed",
            "forecast_horizon",
            "summary_stats",
            "prediction_interval",
            "historical_reliability",
            "environmental",
            "neighboring_district_context",
            "evidence_gaps",
            "local_outcome_feedback",
            "provenance",
        }
    )
    return keys


def _extract_json_object(text: str) -> Dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("Empty model response")
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise ValueError("No JSON object in model response")
    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("Model JSON was not an object")
    return parsed


def _catalog_ids(evidence: Dict[str, Any]) -> Set[str]:
    catalog = evidence.get("action_catalog") or []
    ids: Set[str] = set()
    if isinstance(catalog, list):
        for item in catalog:
            if isinstance(item, dict) and item.get("id"):
                ids.add(str(item["id"]))
    rec = evidence.get("recommendation") or {}
    if isinstance(rec, dict) and rec.get("action_id"):
        ids.add(str(rec["action_id"]))
    return ids


def _catalog_label(evidence: Dict[str, Any], action_id: str) -> str:
    catalog = evidence.get("action_catalog") or []
    if isinstance(catalog, list):
        for item in catalog:
            if isinstance(item, dict) and str(item.get("id")) == action_id:
                return str(item.get("label") or action_id)
    return action_id


def _fallback_explain(evidence: Dict[str, Any]) -> EdiDeliberateResponse:
    why = str(evidence.get("deterministic_why") or evidence.get("why") or "").strip()
    bullets = evidence.get("bullets") or []
    if not isinstance(bullets, list):
        bullets = []
    return EdiDeliberateResponse(
        available=False,
        grounded=True,
        source="fallback",
        interaction="explain",
        summary=why
        or "Structured alert evidence is shown below; deliberative rewrite is unavailable.",
        bullets=[str(b) for b in bullets[:6]],
        evidence_refs=["deterministic_why", "status"],
        detail="LLM unavailable; using deterministic Layer-2 explanation.",
    )


def _fallback_suggest(evidence: Dict[str, Any]) -> EdiDeliberateResponse:
    rec = evidence.get("recommendation") or {}
    rec_id = str(rec.get("action_id") or "monitor")
    status = str(evidence.get("status") or "Normal")
    unc = evidence.get("uncertainty") or {}
    unc_label = str(unc.get("label") or unc.get("band") or "uncertainty")
    catalog = evidence.get("action_catalog") or []
    ids = [str(item.get("id")) for item in catalog if isinstance(item, dict) and item.get("id")]
    if rec_id not in ids:
        ids = [rec_id, *ids]

    # Recommended + one step softer + one step stronger when present
    order = ["monitor", "watch", "investigate", "escalate"]
    chosen = [rec_id]
    if rec_id in order:
        idx = order.index(rec_id)
        if idx > 0:
            chosen.append(order[idx - 1])
        if idx < len(order) - 1:
            chosen.append(order[idx + 1])
    chosen = [cid for cid in chosen if cid in set(ids) or cid == rec_id][:3]

    options: List[EdiOption] = []
    for action_id in chosen:
        label = _catalog_label(evidence, action_id)
        if action_id == rec_id:
            pros = [
                str(rec.get("rationale") or f"Matches the rule-based recommendation for {status}.")
            ]
            cons = [f"Still weigh {unc_label} and local knowledge before committing."]
        elif order.index(action_id) < order.index(rec_id) if rec_id in order and action_id in order else False:
            pros = ["More conservative if local verification is incomplete."]
            cons = ["May under-respond if the exceedance is sustained."]
        else:
            pros = ["Stronger response if local checks confirm the signal."]
            cons = ["Higher cost of escalation if the alert is a false alarm."]
        options.append(
            EdiOption(
                id=action_id,
                label=label,
                pros=pros,
                cons=cons,
                evidence_refs=["recommendation", "status", "uncertainty"],
            )
        )

    return EdiDeliberateResponse(
        available=False,
        grounded=True,
        source="fallback",
        interaction="suggest",
        summary="Decision alternatives from the action catalog and current evidence. You still choose.",
        options=options,
        evidence_refs=["recommendation", "action_catalog", "status", "uncertainty"],
        detail="LLM unavailable; using catalog-constrained deterministic options.",
    )


def _fallback_explore(evidence: Dict[str, Any]) -> EdiDeliberateResponse:
    status = str(evidence.get("status") or "Normal")
    rec = evidence.get("recommendation") or {}
    rec_label = str(rec.get("label") or rec.get("action_id") or "the recommendation")
    investigation = evidence.get("investigation") or {}
    findings = investigation.get("findings") if isinstance(investigation, dict) else None
    if not isinstance(findings, list):
        findings = []
    unc = evidence.get("uncertainty") or {}

    bullets = [str(item) for item in findings[:4] if str(item).strip()]
    if not bullets:
        bullets = [
            f"Current recommendation: {rec_label}.",
            f"Status: {status}.",
        ]
        if unc.get("label"):
            bullets.append(f"Uncertainty: {unc.get('label')}.")

    questions = [
        f"Given this lookup, would local case verification change confidence in {rec_label}?",
    ]
    if status == "Early Warning":
        questions.append(
            "If next week's observed cases stay below expected levels, would you step down from this action?"
        )
    if status == "Early Detection":
        questions.append(
            "If a reporting backlog explains the exceedance, would you hold escalation?"
        )
    if str(unc.get("band") or unc.get("level") or "") == "high":
        questions.append(
            "What local evidence would resolve the high residual uncertainty enough to escalate or de-escalate?"
        )
    questions.append(
        "Is any local context missing from EPIDEMIA (campaigns, movement, incomplete reporting) that should change this?"
    )

    return EdiDeliberateResponse(
        available=False,
        grounded=True,
        source="fallback",
        interaction="explore",
        summary=(
            "Looked up recent observed vs expected and the forecast horizon in EPIDEMIA. "
            "Open questions below still need your local judgment."
        ),
        bullets=bullets,
        questions=questions[:4],
        evidence_refs=["investigation", "recommendation", "status", "uncertainty"],
        detail="LLM unavailable; using deterministic investigation + explore prompts.",
    )


def _fallback_compare(evidence: Dict[str, Any]) -> EdiDeliberateResponse:
    candidates = evidence.get("candidates") or []
    if not isinstance(candidates, list):
        candidates = []

    contrasts: List[str] = []
    tradeoffs: List[str] = []
    for item in candidates[:3]:
        if not isinstance(item, dict):
            continue
        name = item.get("district") or "District"
        status = item.get("status") or "—"
        unc_obj = item.get("uncertainty") or {}
        unc = unc_obj.get("label") or unc_obj.get("band") or "uncertainty n/a"
        band = str(unc_obj.get("band") or "moderate")
        action = (item.get("recommendation") or {}).get("label") or (
            item.get("recommendation") or {}
        ).get("action_id") or "—"
        mag = item.get("magnitude_percent")
        mag_bit = f", {mag}% above threshold" if mag is not None else ""
        findings = item.get("investigation_findings") or []
        finding_bit = f" — {findings[0]}" if findings else "."
        contrasts.append(f"{name}: {status}{mag_bit}; {unc}; suggested {action}{finding_bit}")
        tradeoffs.append(
            f"Attending {name} first: aligns with {status} and {action}, "
            f"but {band} uncertainty may waste attention if verification fails."
        )

    names = [
        str(item.get("district"))
        for item in candidates
        if isinstance(item, dict) and item.get("district")
    ]
    summary = (
        f"Contrast {', '.join(names)} on alert status, exceedance, uncertainty, "
        "and suggested actions — without ranking them. You still assign priority."
        if names
        else "Select 2–3 districts to contrast structured alert evidence."
    )

    reasons: List[str] = []
    high = [
        str(item.get("district"))
        for item in candidates
        if isinstance(item, dict)
        and str((item.get("uncertainty") or {}).get("band") or "") == "high"
        and item.get("district")
    ]
    if high:
        reasons.append(
            f"High uncertainty in {', '.join(high)} can make an obvious first pick misleading."
        )
    caution = [
        str(item.get("district"))
        for item in candidates
        if isinstance(item, dict)
        and (item.get("local_outcome_feedback") or {}).get("caution")
        and item.get("district")
    ]
    if caution:
        reasons.append(
            f"Local false-alarm feedback cautions urgency for {', '.join(caution)}."
        )
    if not reasons:
        reasons.append(
            "Even when exceedance looks clearer in one district, local verification can reverse relative priority."
        )

    ranking_checks = [
        "Would confirming reporting completeness reverse who looks most urgent?",
        "If next week's observed cases fall below expected in the current 1st pick, would you reprioritize?",
        "Does any district have missing local context that the pack cannot see?",
    ]

    result = EdiDeliberateResponse(
        available=False,
        grounded=True,
        source="fallback",
        interaction="compare",
        compare_interpret=EdiCompareInterpret(summary=summary, contrasts=contrasts),
        compare_deliberate=EdiCompareDeliberate(priority_tradeoffs=tradeoffs),
        challenge=EdiChallengeBlock(
            summary=reasons[0],
            reasons_to_question=reasons[:4],
            what_would_reduce_uncertainty=ranking_checks,
        ),
        what_could_change_decision=ranking_checks,
        summary=summary,
        bullets=contrasts,
        questions=ranking_checks,
        evidence_refs=["candidates"],
        detail="LLM unavailable; using deterministic priority contrast.",
    )
    return _stamp_identity(result, evidence)


def _looks_like_ranking(text: str) -> bool:
    lower = text.lower()
    banned = (
        "priority order is",
        "rank order is",
        "should be ranked",
        "rank them as",
        "ranking:",
        "assign ranks",
        "1st place",
        "2nd place",
        "3rd place",
        "priority ranking",
        "recommended order:",
    )
    return any(token in lower for token in banned)


def _validate_compare(
    payload: Dict[str, Any], evidence: Dict[str, Any]
) -> Tuple[bool, str, EdiDeliberateResponse]:
    interpret_raw = payload.get("compare_interpret") or {}
    deliberate_raw = payload.get("compare_deliberate") or {}
    challenge_raw = payload.get("challenge") or {}
    if not isinstance(interpret_raw, dict):
        interpret_raw = {
            "summary": payload.get("summary") or "",
            "contrasts": payload.get("bullets") or [],
        }
    if not isinstance(deliberate_raw, dict):
        deliberate_raw = {"priority_tradeoffs": []}
    if not isinstance(challenge_raw, dict):
        challenge_raw = {
            "summary": "",
            "reasons_to_question": [],
            "what_would_reduce_uncertainty": payload.get("questions") or [],
        }

    summary = str(interpret_raw.get("summary") or payload.get("summary") or "").strip()
    contrasts_raw = interpret_raw.get("contrasts") or payload.get("bullets") or []
    tradeoffs_raw = deliberate_raw.get("priority_tradeoffs") or []
    reasons_raw = challenge_raw.get("reasons_to_question") or []
    checks_raw = (
        challenge_raw.get("what_would_reduce_uncertainty")
        or payload.get("what_could_change_decision")
        or payload.get("questions")
        or []
    )
    refs_raw = payload.get("evidence_refs") or []
    if not isinstance(contrasts_raw, list):
        contrasts_raw = []
    if not isinstance(tradeoffs_raw, list):
        tradeoffs_raw = []
    if not isinstance(reasons_raw, list):
        reasons_raw = []
    if not isinstance(checks_raw, list):
        checks_raw = []
    if not isinstance(refs_raw, list):
        refs_raw = []

    contrasts = [str(x).strip() for x in contrasts_raw if str(x).strip()][:8]
    tradeoffs = [str(x).strip() for x in tradeoffs_raw if str(x).strip()][:8]
    reasons = [str(x).strip() for x in reasons_raw if str(x).strip()][:6]
    checks = [str(x).strip() for x in checks_raw if str(x).strip()][:6]
    refs = [str(r).strip() for r in refs_raw if str(r).strip()]
    challenge_summary = str(challenge_raw.get("summary") or "").strip()
    if not challenge_summary and reasons:
        challenge_summary = reasons[0]

    if not summary:
        return False, "Missing compare_interpret.summary", EdiDeliberateResponse(
            interaction="compare"
        )
    if len(contrasts) < 1:
        return False, "Missing compare_interpret.contrasts", EdiDeliberateResponse(
            interaction="compare"
        )
    if len(tradeoffs) < 1:
        return False, "Missing compare_deliberate.priority_tradeoffs", EdiDeliberateResponse(
            interaction="compare"
        )
    if len(reasons) < 1:
        return False, "Missing challenge.reasons_to_question", EdiDeliberateResponse(
            interaction="compare"
        )
    if len(checks) < 1:
        return False, "Missing ranking-reversal checks", EdiDeliberateResponse(
            interaction="compare"
        )

    combined = " ".join([summary, challenge_summary, *contrasts, *tradeoffs, *reasons, *checks])
    if _looks_like_ranking(combined):
        return False, "Compare must not assign a priority ranking", EdiDeliberateResponse(
            interaction="compare"
        )

    allowed = _allowed_ref_keys(evidence)
    bad_refs = [r for r in refs if r not in allowed]
    if bad_refs:
        return False, f"Unknown evidence_refs: {bad_refs}", EdiDeliberateResponse(
            interaction="compare"
        )

    vocab = _evidence_number_vocab(evidence)
    novel = [num for num in _numbers_in_text(combined) if num not in vocab]
    if novel:
        return False, f"Ungrounded numbers: {novel}", EdiDeliberateResponse(
            interaction="compare"
        )

    if not refs:
        refs = ["candidates"]

    result = EdiDeliberateResponse(
        available=True,
        grounded=True,
        source="llm",
        interaction="compare",
        compare_interpret=EdiCompareInterpret(summary=summary, contrasts=contrasts),
        compare_deliberate=EdiCompareDeliberate(priority_tradeoffs=tradeoffs),
        challenge=EdiChallengeBlock(
            summary=challenge_summary,
            reasons_to_question=reasons,
            what_would_reduce_uncertainty=checks,
        ),
        explanation=EdiExplanationBlock(
            why_alert=summary,
            supporting_evidence=contrasts,
            contradicting_evidence=reasons,
        ),
        what_could_change_decision=checks,
        what_would_change_decision=checks,
        summary=summary,
        bullets=contrasts,
        questions=checks,
        supporting_evidence=contrasts,
        evidence_refs=refs,
    )
    return True, "", _stamp_identity(result, evidence)


def _stamp_identity(result: EdiDeliberateResponse, evidence: Dict[str, Any]) -> EdiDeliberateResponse:
    """District/species/provenance are EPIDEMIA-authored, never LLM-invented."""
    result.district = evidence.get("district")
    result.species = evidence.get("species")
    prov = evidence.get("provenance") or {}
    if isinstance(prov, dict):
        result.provenance = EdiProvenance(
            data_through=prov.get("data_through"),
            report_generated_at=prov.get("report_generated_at"),
            forecast_engine=prov.get("forecast_engine"),
            deliberative_model=prov.get("deliberative_model"),
            model_version=prov.get("model_version") or prov.get("forecast_engine"),
            geography_version=prov.get("geography_version"),
            species=prov.get("species") or evidence.get("species"),
        )
    gaps = evidence.get("evidence_gaps") or evidence.get("unavailable_fields") or []
    if isinstance(gaps, list) and not result.evidence_gaps:
        result.evidence_gaps = [str(g) for g in gaps if str(g).strip()][:8]
    return result


def _round1(value: Any) -> Optional[float]:
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None


def _officer_supporting_evidence(evidence: Dict[str, Any]) -> List[str]:
    """Short officer-facing bullets — not raw investigation dumps."""
    investigation = evidence.get("investigation") or {}
    stats = investigation.get("summary_stats") or {}
    recent = investigation.get("recent_observed") or []
    last = recent[-1] if isinstance(recent, list) and recent else None
    bullets: List[str] = []

    if isinstance(last, dict) and last.get("observed") is not None and last.get("expected") is not None:
        obs = _round1(last.get("observed"))
        exp = _round1(last.get("expected"))
        label = last.get("week_label") or "recent"
        bullets.append(f"Latest week ({label}): {obs} observed vs {exp} expected.")

    compared = stats.get("weeks_compared") or 0
    above = stats.get("weeks_above_expected")
    if isinstance(compared, int) and compared >= 2 and above is not None:
        bullets.append(f"{above} of last {compared} weeks were above expected.")

    fc_weeks = stats.get("forecast_weeks") or 0
    fc_above = stats.get("forecast_weeks_above_expected")
    if isinstance(fc_weeks, int) and fc_weeks > 0 and fc_above is not None:
        bullets.append(
            f"Near-term forecast: {fc_above} of {fc_weeks} weeks above detection."
        )

    environmental = evidence.get("environmental") or {}
    if isinstance(environmental, dict) and environmental.get("available"):
        rain = environmental.get("rainfall_change_percent")
        temp = environmental.get("temperature_change_c")
        if isinstance(rain, (int, float)) and abs(rain) >= 5:
            bullets.append(
                f"Recent rainfall {'up' if rain > 0 else 'down'} {abs(rain)}% vs prior weeks."
            )
        if isinstance(temp, (int, float)) and abs(temp) >= 0.3:
            bullets.append(
                f"Recent LST mean {'up' if temp > 0 else 'down'} {abs(temp)}°C vs prior weeks."
            )

    if not bullets and evidence.get("deterministic_why"):
        bullets.append(str(evidence.get("deterministic_why")))
    return bullets[:4]


def _fallback_brief(evidence: Dict[str, Any]) -> EdiDeliberateResponse:
    suggest = _fallback_suggest(evidence)
    explore = _fallback_explore(evidence)
    unc = evidence.get("uncertainty") or {}
    level = str(unc.get("band") or unc.get("level") or "moderate")
    unc_evidence = str(
        unc.get("detail") or unc.get("label") or "Residual uncertainty from recent history."
    )
    why = str(
        evidence.get("deterministic_why")
        or (evidence.get("recommendation") or {}).get("rationale")
        or explore.summary
        or ""
    ).strip()
    supporting = _officer_supporting_evidence(evidence)
    if not supporting and evidence.get("bullets"):
        supporting = [str(b) for b in evidence.get("bullets")[:4]]

    contradicting: List[str] = []
    if level == "high":
        contradicting.append(
            "High residual uncertainty weakens confidence in strong escalation."
        )
    reliability = evidence.get("historical_reliability") or {}
    if isinstance(reliability, dict) and reliability.get("score") is not None:
        try:
            score = float(reliability["score"])
            if score < 0.45:
                contradicting.append(
                    "All recent comparable weeks were above expected — confirm reporting quality before escalating on residual history alone."
                    if score == 0
                    else f"Historical residual stability is low ({score}); recent exceedances may be noisy."
                )
        except (TypeError, ValueError):
            pass
    environmental = evidence.get("environmental") or {}
    if isinstance(environmental, dict) and environmental.get("available"):
        rain = environmental.get("rainfall_change_percent")
        temp = environmental.get("temperature_change_c")
        env_supports = (
            (isinstance(rain, (int, float)) and abs(rain) >= 10)
            or (isinstance(temp, (int, float)) and abs(temp) >= 0.5)
        )
        if not env_supports:
            contradicting.append(
                "Recent rainfall/temperature shifts are small, so environment alone does not strongly corroborate the alert."
            )

    options: List[EdiOption] = []
    for opt in suggest.options:
        support = list(opt.pros) if opt.pros else [
            "Aligned with rule-based recommendation."
            if opt.id == (evidence.get("recommendation") or {}).get("action_id")
            else "Nearby alternative intensity for deliberation."
        ]
        tradeoffs = list(opt.cons) if opt.cons else [
            "Requires human confirm/override before operational use."
        ]
        options.append(
            EdiOption(
                id=opt.id,
                label=opt.label,
                action=opt.label,
                supporting_evidence=support,
                tradeoffs=tradeoffs,
                rationale=support[0] if support else "",
                risk=tradeoffs[0] if tradeoffs else "",
                pros=support,
                cons=tradeoffs,
                evidence_refs=opt.evidence_refs,
            )
        )

    change = list(explore.questions[:4]) if explore.questions else []
    gaps = evidence.get("evidence_gaps") or evidence.get("unavailable_fields") or []
    if not isinstance(gaps, list):
        gaps = []

    result = EdiDeliberateResponse(
        available=False,
        grounded=True,
        source="fallback",
        interaction="brief",
        explanation=EdiExplanationBlock(
            why_alert=why,
            supporting_evidence=supporting,
            contradicting_evidence=contradicting,
        ),
        uncertainty=EdiUncertaintyView(
            level=level,
            evidence=unc_evidence,
            decision_implication=(
                "Weigh local verification before strong action when uncertainty is not low."
            ),
            reason=unc_evidence,
        ),
        options=options,
        what_could_change_decision=change,
        evidence_gaps=[str(g) for g in gaps if str(g).strip()][:8],
        summary=why,
        bullets=supporting,
        questions=change,
        supporting_evidence=supporting,
        what_would_change_decision=change,
        evidence_refs=[
            "recommendation",
            "investigation",
            "uncertainty",
            "historical_reliability",
            "action_catalog",
            "provenance",
        ],
        detail="LLM unavailable; using structured deterministic brief.",
    )
    return _stamp_identity(result, evidence)


def _fallback_challenge(evidence: Dict[str, Any]) -> EdiDeliberateResponse:
    unc = evidence.get("uncertainty") or {}
    level = str(unc.get("band") or unc.get("level") or "moderate")
    reliability = evidence.get("historical_reliability") or {}
    stats = (evidence.get("investigation") or {}).get("summary_stats") or {}
    outcome = evidence.get("local_outcome_feedback") or {}
    gaps = evidence.get("evidence_gaps") or evidence.get("unavailable_fields") or []

    reasons: List[str] = []
    if level in {"high", "moderate"}:
        reasons.append(
            f"{level.capitalize()} residual uncertainty weakens confidence in strong action."
        )
    try:
        score = float(reliability["score"]) if reliability.get("score") is not None else None
    except (TypeError, ValueError):
        score = None
    if score is not None and score < 0.45:
        reasons.append(
            "Recent residual history is unstable or persistently elevated — confirm reporting quality before trusting escalation."
        )

    fc_weeks = stats.get("forecast_weeks") or 0
    fc_above = stats.get("forecast_weeks_above_expected")
    if (
        isinstance(fc_weeks, int)
        and fc_weeks > 0
        and fc_above == 0
        and (stats.get("weeks_above_expected") or 0) > 0
    ):
        reasons.append(
            "Recent observed exceedance is not matched by near-term forecast weeks above detection — the forward signal is weaker."
        )

    environmental = evidence.get("environmental") or {}
    if isinstance(environmental, dict) and environmental.get("available"):
        rain = environmental.get("rainfall_change_percent")
        temp = environmental.get("temperature_change_c")
        if not (
            (isinstance(rain, (int, float)) and abs(rain) >= 10)
            or (isinstance(temp, (int, float)) and abs(temp) >= 0.5)
        ):
            reasons.append(
                "Environmental co-occurrence is weak; climate context does not strongly corroborate the alert."
            )

    if isinstance(outcome, dict) and outcome.get("false_alarm_count"):
        count = outcome.get("false_alarm_count")
        reasons.append(
            f"Local feedback marks {count} recent false alarm(s) for this district — treat escalation cautiously."
        )

    if isinstance(gaps, list) and gaps:
        reasons.append(f"Key gap still missing: {gaps[0]}.")

    if not reasons:
        reasons.append(
            "Even when signals align, local verification can still reverse this assessment."
        )

    reduce = [
        "Verify latest facility case counts and reporting completeness for the alert weeks.",
        "Check whether a reporting backlog or catch-up could explain the exceedance.",
    ]
    if isinstance(gaps, list):
        for gap in gaps[:2]:
            text = str(gap).strip()
            if text:
                reduce.append(f"Obtain: {text}.")

    strongest = reasons[0]
    summary = (
        f"The strongest reason to question this assessment: {strongest[0].lower() + strongest[1:]}"
        if strongest
        else "Question this assessment until local verification reduces uncertainty."
    )
    if len(reasons) > 1:
        summary = f"{summary} Also consider: {reasons[1]}"

    result = EdiDeliberateResponse(
        available=False,
        grounded=True,
        source="fallback",
        interaction="challenge",
        challenge=EdiChallengeBlock(
            summary=summary,
            reasons_to_question=reasons[:4],
            what_would_reduce_uncertainty=reduce[:4],
        ),
        summary=summary,
        bullets=reasons[:4],
        questions=reduce[:4],
        evidence_refs=[
            "uncertainty",
            "historical_reliability",
            "investigation",
            "evidence_gaps",
            "local_outcome_feedback",
        ],
        detail="LLM unavailable; using structured challenge fallback.",
    )
    return _stamp_identity(result, evidence)


def _fallback(evidence: Dict[str, Any], interaction: str) -> EdiDeliberateResponse:
    if interaction == "brief":
        return _fallback_brief(evidence)
    if interaction == "challenge":
        return _fallback_challenge(evidence)
    if interaction == "suggest":
        return _fallback_suggest(evidence)
    if interaction == "explore":
        return _fallback_explore(evidence)
    if interaction == "compare":
        return _fallback_compare(evidence)
    return _fallback_explain(evidence)


def _resolve_option_id(item: Dict[str, Any], allowed: Set[str], evidence: Dict[str, Any]) -> str:
    action_id = str(item.get("id") or "").strip()
    if action_id in allowed:
        return action_id
    text = str(item.get("action") or item.get("label") or "").strip().lower()
    if not text:
        return ""
    if text in allowed:
        return text
    for cid in allowed:
        label = _catalog_label(evidence, cid).lower()
        if text == label or text in label or label in text:
            return cid
    for cid in ("monitor", "watch", "investigate", "escalate"):
        if cid in text and cid in allowed:
            return cid
    return ""


def _parse_options(
    raw_options: Any, evidence: Dict[str, Any], *, brief_mode: bool = False
) -> Tuple[bool, str, List[EdiOption]]:
    if not isinstance(raw_options, list):
        return False, "options must be a list", []
    allowed = _catalog_ids(evidence)
    if not allowed:
        return False, "evidence.action_catalog missing", []
    options: List[EdiOption] = []
    for item in raw_options[:4]:
        if not isinstance(item, dict):
            continue
        action_id = _resolve_option_id(item, allowed, evidence)
        if action_id not in allowed:
            return False, f"option id not in catalog: {item.get('id') or item.get('action')}", []
        label = str(
            item.get("action")
            or item.get("label")
            or _catalog_label(evidence, action_id)
        ).strip()
        support_raw = item.get("supporting_evidence") or item.get("pros") or []
        trade_raw = item.get("tradeoffs") or item.get("cons") or []
        if not isinstance(support_raw, list):
            support_raw = [support_raw] if support_raw else []
        if not isinstance(trade_raw, list):
            trade_raw = [trade_raw] if trade_raw else []
        rationale = str(item.get("rationale") or "").strip()
        risk = str(item.get("risk") or "").strip()
        if rationale and not support_raw:
            support_raw = [rationale]
        if risk and not trade_raw:
            trade_raw = [risk]
        support = [str(p).strip() for p in support_raw if str(p).strip()][:3]
        tradeoffs = [str(c).strip() for c in trade_raw if str(c).strip()][:3]
        if brief_mode:
            if not rationale and support:
                rationale = support[0]
            if not risk and tradeoffs:
                risk = tradeoffs[0]
        refs = item.get("evidence_refs") or []
        if not isinstance(refs, list):
            refs = []
        options.append(
            EdiOption(
                id=action_id,
                label=label,
                action=label,
                supporting_evidence=support,
                tradeoffs=tradeoffs,
                rationale=rationale,
                risk=risk,
                pros=support,
                cons=tradeoffs,
                evidence_refs=[str(r).strip() for r in refs if str(r).strip()][:6],
            )
        )
    if len(options) < 2:
        return False, "need at least 2 catalog options", []
    return True, "", options


def _sync_aliases(result: EdiDeliberateResponse) -> EdiDeliberateResponse:
    """Keep legacy summary/bullets/questions populated from brief fields."""
    why = ""
    supporting: List[str] = []
    if isinstance(result.explanation, EdiExplanationBlock):
        why = result.explanation.why_alert or ""
        supporting = list(result.explanation.supporting_evidence or [])
    change = list(result.what_could_change_decision or result.what_would_change_decision or [])
    if why and not result.summary:
        result.summary = why
    if supporting and not result.bullets:
        result.bullets = supporting
    if supporting and not result.supporting_evidence:
        result.supporting_evidence = supporting
    if change and not result.questions:
        result.questions = change
    if change and not result.what_could_change_decision:
        result.what_could_change_decision = change
    if change and not result.what_would_change_decision:
        result.what_would_change_decision = change
    if result.uncertainty and result.uncertainty.evidence and not result.uncertainty.reason:
        result.uncertainty.reason = result.uncertainty.evidence
    if result.uncertainty and result.uncertainty.reason and not result.uncertainty.evidence:
        result.uncertainty.evidence = result.uncertainty.reason
    return result


def _validate_challenge(
    payload: Dict[str, Any], evidence: Dict[str, Any]
) -> Tuple[bool, str, EdiDeliberateResponse]:
    raw = payload.get("challenge")
    if isinstance(raw, dict):
        challenge_obj = raw
    else:
        challenge_obj = {
            "summary": payload.get("summary") or "",
            "reasons_to_question": payload.get("reasons_to_question")
            or payload.get("bullets")
            or [],
            "what_would_reduce_uncertainty": payload.get("what_would_reduce_uncertainty")
            or payload.get("questions")
            or [],
        }

    summary = str(challenge_obj.get("summary") or "").strip()
    reasons_raw = challenge_obj.get("reasons_to_question") or []
    reduce_raw = challenge_obj.get("what_would_reduce_uncertainty") or []
    refs_raw = payload.get("evidence_refs") or []
    if not isinstance(reasons_raw, list):
        reasons_raw = []
    if not isinstance(reduce_raw, list):
        reduce_raw = []
    if not isinstance(refs_raw, list):
        refs_raw = []

    reasons = [str(x).strip() for x in reasons_raw if str(x).strip()][:5]
    reduce = [str(x).strip() for x in reduce_raw if str(x).strip()][:5]
    refs = [str(r).strip() for r in refs_raw if str(r).strip()]

    if not summary:
        return False, "Missing challenge.summary", EdiDeliberateResponse(
            interaction="challenge"
        )
    if len(reasons) < 1:
        return False, "Missing challenge.reasons_to_question", EdiDeliberateResponse(
            interaction="challenge"
        )
    if len(reduce) < 1:
        return False, "Missing challenge.what_would_reduce_uncertainty", EdiDeliberateResponse(
            interaction="challenge"
        )

    allowed = _allowed_ref_keys(evidence)
    bad_refs = [r for r in refs if r not in allowed]
    if bad_refs:
        return False, f"Unknown evidence_refs: {bad_refs}", EdiDeliberateResponse(
            interaction="challenge"
        )

    combined = " ".join([summary, *reasons, *reduce])
    vocab = _evidence_number_vocab(evidence)
    novel = [num for num in _numbers_in_text(combined) if num not in vocab]
    if novel:
        return False, f"Ungrounded numbers: {novel}", EdiDeliberateResponse(
            interaction="challenge"
        )

    if not refs:
        refs = [
            "uncertainty",
            "historical_reliability",
            "investigation",
            "evidence_gaps",
            "local_outcome_feedback",
        ]

    result = EdiDeliberateResponse(
        available=True,
        grounded=True,
        source="llm",
        interaction="challenge",
        challenge=EdiChallengeBlock(
            summary=summary,
            reasons_to_question=reasons,
            what_would_reduce_uncertainty=reduce,
        ),
        summary=summary,
        bullets=reasons,
        questions=reduce,
        evidence_refs=refs,
    )
    return True, "", _stamp_identity(result, evidence)


def _validate_payload(
    payload: Dict[str, Any], evidence: Dict[str, Any], interaction: str
) -> Tuple[bool, str, EdiDeliberateResponse]:
    if interaction == "brief":
        return _validate_brief(payload, evidence)
    if interaction == "challenge":
        return _validate_challenge(payload, evidence)
    if interaction == "compare":
        return _validate_compare(payload, evidence)

    summary = str(payload.get("summary") or "").strip()
    bullets_raw = payload.get("bullets") or []
    questions_raw = payload.get("questions") or []
    refs_raw = payload.get("evidence_refs") or []
    if not isinstance(bullets_raw, list):
        bullets_raw = []
    if not isinstance(questions_raw, list):
        questions_raw = []
    if not isinstance(refs_raw, list):
        refs_raw = []

    bullets = [str(b).strip() for b in bullets_raw if str(b).strip()][:8]
    questions = [str(q).strip() for q in questions_raw if str(q).strip()][:6]
    refs = [str(r).strip() for r in refs_raw if str(r).strip()]

    if not summary:
        return False, "Missing summary", EdiDeliberateResponse(interaction=interaction)

    allowed = _allowed_ref_keys(evidence)
    bad_refs = [r for r in refs if r not in allowed]
    if bad_refs:
        return False, f"Unknown evidence_refs: {bad_refs}", EdiDeliberateResponse(
            interaction=interaction
        )

    option_text_parts: List[str] = []
    options: List[EdiOption] = []
    if interaction == "suggest":
        ok, reason, options = _parse_options(payload.get("options"), evidence)
        if not ok:
            return False, reason, EdiDeliberateResponse(interaction=interaction)
        for opt in options:
            option_text_parts.extend(opt.pros)
            option_text_parts.extend(opt.cons)
            option_text_parts.append(opt.label)

    combined = " ".join([summary, *bullets, *questions, *option_text_parts])
    vocab = _evidence_number_vocab(evidence)
    novel = [num for num in _numbers_in_text(combined) if num not in vocab]
    if novel:
        return False, f"Ungrounded numbers: {novel}", EdiDeliberateResponse(
            interaction=interaction
        )

    if not refs:
        refs = ["status"]
        if interaction == "compare":
            refs = ["candidates"]
        elif interaction == "suggest":
            refs = ["recommendation", "action_catalog"]
        elif interaction == "explore":
            refs = ["recommendation", "uncertainty"]

    if interaction == "explore" and len(questions) < 2:
        return False, "explore needs at least 2 questions", EdiDeliberateResponse(
            interaction=interaction
        )

    if interaction == "compare" and len(bullets) < 1 and len(questions) < 1:
        return False, "compare needs contrast bullets or questions", EdiDeliberateResponse(
            interaction=interaction
        )

    result = _sync_aliases(
        EdiDeliberateResponse(
            available=True,
            grounded=True,
            source="llm",
            interaction=interaction,
            explanation=EdiExplanationBlock(
                why_alert=summary,
                supporting_evidence=bullets,
                contradicting_evidence=[],
            ),
            supporting_evidence=bullets,
            what_could_change_decision=questions,
            what_would_change_decision=questions,
            summary=summary,
            bullets=bullets,
            questions=questions,
            options=options,
            evidence_refs=refs,
        )
    )
    return True, "", _stamp_identity(result, evidence)


def _validate_brief(
    payload: Dict[str, Any], evidence: Dict[str, Any]
) -> Tuple[bool, str, EdiDeliberateResponse]:
    expl_raw = payload.get("explanation")
    if isinstance(expl_raw, str):
        expl_obj = {
            "why_alert": expl_raw,
            "supporting_evidence": payload.get("supporting_evidence")
            or payload.get("bullets")
            or [],
            "contradicting_evidence": payload.get("contradicting_evidence") or [],
        }
    elif isinstance(expl_raw, dict):
        expl_obj = expl_raw
    else:
        expl_obj = {
            "why_alert": str(payload.get("summary") or ""),
            "supporting_evidence": payload.get("supporting_evidence")
            or payload.get("bullets")
            or [],
            "contradicting_evidence": payload.get("contradicting_evidence") or [],
        }

    why = str(expl_obj.get("why_alert") or "").strip()
    support_raw = expl_obj.get("supporting_evidence") or []
    contra_raw = expl_obj.get("contradicting_evidence") or []
    change_raw = (
        payload.get("what_could_change_decision")
        or payload.get("what_would_change_decision")
        or payload.get("questions")
        or []
    )
    gaps_raw = payload.get("evidence_gaps") or []
    refs_raw = payload.get("evidence_refs") or []
    unc_raw = payload.get("uncertainty") or {}
    if not isinstance(support_raw, list):
        support_raw = []
    if not isinstance(contra_raw, list):
        contra_raw = []
    if not isinstance(change_raw, list):
        change_raw = []
    if not isinstance(gaps_raw, list):
        gaps_raw = []
    if not isinstance(refs_raw, list):
        refs_raw = []
    if not isinstance(unc_raw, dict):
        unc_raw = {}

    supporting = [str(x).strip() for x in support_raw if str(x).strip()][:6]
    contradicting = [str(x).strip() for x in contra_raw if str(x).strip()][:6]
    change = [str(x).strip() for x in change_raw if str(x).strip()][:5]
    gaps = [str(x).strip() for x in gaps_raw if str(x).strip()][:8]
    refs = [str(r).strip() for r in refs_raw if str(r).strip()]

    if not why:
        return False, "Missing explanation.why_alert", EdiDeliberateResponse(
            interaction="brief"
        )
    if len(supporting) < 1:
        return False, "Missing explanation.supporting_evidence", EdiDeliberateResponse(
            interaction="brief"
        )
    if len(change) < 1:
        return False, "Missing what_could_change_decision", EdiDeliberateResponse(
            interaction="brief"
        )

    allowed = _allowed_ref_keys(evidence)
    bad_refs = [r for r in refs if r not in allowed]
    if bad_refs:
        return False, f"Unknown evidence_refs: {bad_refs}", EdiDeliberateResponse(
            interaction="brief"
        )

    ok, reason, options = _parse_options(
        payload.get("options"), evidence, brief_mode=True
    )
    if not ok:
        return False, reason, EdiDeliberateResponse(interaction="brief")

    unc_level = str(unc_raw.get("level") or "").strip().lower()
    evidence_unc = evidence.get("uncertainty") or {}
    if unc_level not in {"low", "moderate", "high"}:
        unc_level = str(
            evidence_unc.get("band") or evidence_unc.get("level") or "moderate"
        ).lower()
    unc_evidence = str(
        unc_raw.get("evidence")
        or unc_raw.get("reason")
        or evidence_unc.get("detail")
        or ""
    ).strip()
    if not unc_evidence:
        unc_evidence = str(
            evidence_unc.get("label") or "Uncertainty from residual history."
        )
    unc_implication = str(unc_raw.get("decision_implication") or "").strip()
    if not unc_implication:
        unc_implication = (
            "Weigh local verification before strong action when uncertainty is not low."
        )

    if not gaps:
        pack_gaps = evidence.get("evidence_gaps") or evidence.get("unavailable_fields") or []
        if isinstance(pack_gaps, list):
            gaps = [str(g) for g in pack_gaps if str(g).strip()][:8]

    option_text: List[str] = []
    for opt in options:
        option_text.extend(
            [
                opt.action,
                opt.rationale,
                opt.risk,
                *opt.supporting_evidence,
                *opt.tradeoffs,
                *opt.pros,
                *opt.cons,
            ]
        )

    combined = " ".join(
        [why, *supporting, *contradicting, *change, *gaps, unc_evidence, unc_implication, *option_text]
    )
    vocab = _evidence_number_vocab(evidence)
    novel = [num for num in _numbers_in_text(combined) if num not in vocab]
    if novel:
        return False, f"Ungrounded numbers: {novel}", EdiDeliberateResponse(
            interaction="brief"
        )

    if not refs:
        refs = [
            "status",
            "recommendation",
            "uncertainty",
            "investigation",
            "historical_reliability",
        ]

    result = _sync_aliases(
        EdiDeliberateResponse(
            available=True,
            grounded=True,
            source="llm",
            interaction="brief",
            explanation=EdiExplanationBlock(
                why_alert=why,
                supporting_evidence=supporting,
                contradicting_evidence=contradicting,
            ),
            uncertainty=EdiUncertaintyView(
                level=unc_level,
                evidence=unc_evidence,
                decision_implication=unc_implication,
                reason=unc_evidence,
            ),
            options=options,
            what_could_change_decision=change,
            evidence_gaps=gaps,
            summary=why,
            bullets=supporting,
            questions=change,
            supporting_evidence=supporting,
            what_would_change_decision=change,
            evidence_refs=refs,
        )
    )
    return True, "", _stamp_identity(result, evidence)


def _uses_json_response_format(cfg: Dict[str, Any]) -> bool:
    """OpenAI supports json_object; Ollama/local servers often do not."""
    base = str(cfg.get("base_url") or "").lower()
    if "11434" in base or "ollama" in base:
        return False
    flag = os.getenv("EDI_LLM_JSON_FORMAT")
    if flag is None:
        return True
    return str(flag).strip().lower() in {"1", "true", "yes", "on"}


def _chat_completion(messages: List[Dict[str, str]], cfg: Dict[str, Any]) -> str:
    url = f"{cfg['base_url']}/chat/completions"
    body: Dict[str, Any] = {
        "model": cfg["model"],
        "temperature": 0.2,
        "messages": messages,
    }
    if _uses_json_response_format(cfg):
        body["response_format"] = {"type": "json_object"}
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
        },
        method="POST",
    )
    # Local models can be slower on first load.
    timeout = 180 if not _uses_json_response_format(cfg) else 60
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"LLM HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"LLM connection failed: {exc.reason}") from exc

    try:
        return payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Unexpected LLM response shape") from exc


def grounded_deliberate(
    evidence: Dict[str, Any],
    interaction: str = "brief",
) -> EdiDeliberateResponse:
    if not isinstance(evidence, dict) or not evidence:
        return EdiDeliberateResponse(
            available=False,
            grounded=False,
            source="unavailable",
            interaction=interaction or "brief",
            summary="",
            detail="Evidence pack is empty.",
        )

    interaction = (interaction or "brief").strip().lower()
    if interaction not in ALLOWED_INTERACTIONS:
        interaction = "brief"

    cfg = llm_config()
    if not cfg["enabled"]:
        return _fallback(evidence, interaction)

    user_prompt = (
        f"Interaction: {interaction}\n"
        "Evidence JSON:\n"
        f"{json.dumps(evidence, ensure_ascii=True, default=str)}"
    )

    try:
        content = _chat_completion(
            [
                {"role": "system", "content": PROMPTS[interaction]},
                {"role": "user", "content": user_prompt},
            ],
            cfg,
        )
        parsed = _extract_json_object(content)
        ok, reason, result = _validate_payload(parsed, evidence, interaction)
        if not ok:
            fallback = _fallback(evidence, interaction)
            fallback.detail = f"Grounding check failed ({reason}); using deterministic deliberation."
            return fallback
        result.model = cfg["model"]
        return _stamp_identity(result, evidence)
    except Exception as exc:  # noqa: BLE001
        fallback = _fallback(evidence, interaction)
        fallback.detail = f"LLM error: {exc}"
        return fallback


def grounded_explain(
    evidence: Dict[str, Any],
    interaction: str = "explain",
) -> EdiDeliberateResponse:
    """Backward-compatible entry point for /edi/explain."""
    return grounded_deliberate(evidence, interaction=interaction or "explain")
