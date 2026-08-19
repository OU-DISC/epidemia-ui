from app.services.edi_grounded_llm import grounded_deliberate, grounded_explain, get_edi_status


def test_status_without_key_is_unavailable(monkeypatch):
    monkeypatch.delenv("EDI_LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("EDI_LLM_ENABLED", "true")
    status = get_edi_status()
    assert status.available is False


def test_explain_falls_back_without_llm(monkeypatch):
    monkeypatch.delenv("EDI_LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("EDI_LLM_ENABLED", "false")
    evidence = {
        "status": "Early Warning",
        "level": "High",
        "alert_count": 2,
        "deterministic_why": "Early warning (High): 2 forecast weeks above the expected level.",
        "triggered_weeks": [{"week": "2026-01-05", "value": 40, "threshold_value": 30}],
        "bullets": ["2 weeks above threshold"],
    }
    result = grounded_explain(evidence, interaction="explain")
    assert result.grounded is True
    assert result.source == "fallback"
    assert "Early warning" in result.summary


def test_suggest_fallback_uses_catalog_ids(monkeypatch):
    monkeypatch.setenv("EDI_LLM_ENABLED", "false")
    evidence = {
        "status": "Early Warning",
        "recommendation": {
            "action_id": "investigate",
            "label": "Investigate locally",
            "rationale": "Rising risk warrants investigation.",
        },
        "action_catalog": [
            {"id": "monitor", "label": "Monitor"},
            {"id": "watch", "label": "Watch"},
            {"id": "investigate", "label": "Investigate"},
            {"id": "escalate", "label": "Escalate"},
        ],
        "uncertainty": {"band": "high", "label": "High uncertainty"},
    }
    result = grounded_deliberate(evidence, interaction="suggest")
    assert result.interaction == "suggest"
    assert len(result.options) >= 2
    ids = {opt.id for opt in result.options}
    assert "investigate" in ids
    assert ids.issubset({"monitor", "watch", "investigate", "escalate"})


def test_brief_fallback_has_unified_schema(monkeypatch):
    monkeypatch.setenv("EDI_LLM_ENABLED", "false")
    evidence = {
        "district": "Example Woreda",
        "species": "P. falciparum",
        "status": "Early Warning",
        "deterministic_why": "Early warning (High): 2 forecast weeks above expected.",
        "recommendation": {
            "action_id": "investigate",
            "label": "Investigate locally",
            "rationale": "Rising risk warrants investigation.",
        },
        "action_catalog": [
            {"id": "monitor", "label": "Monitor"},
            {"id": "watch", "label": "Watch"},
            {"id": "investigate", "label": "Investigate"},
            {"id": "escalate", "label": "Escalate"},
        ],
        "uncertainty": {
            "band": "moderate",
            "label": "Moderate uncertainty",
            "detail": "historical residual SD",
        },
        "investigation": {
            "findings": ["Latest observed week above expected."],
        },
        "historical_reliability": {"score": 0.5, "sample_weeks": 6},
        "environmental": {"available": False},
        "evidence_gaps": ["facility reporting completeness"],
        "provenance": {
            "data_through": "2026-07-06",
            "model_version": "seasonal_GAM + Farrington",
            "geography_version": "COD-AB Ethiopia Admin3 (woreda)",
        },
    }
    result = grounded_deliberate(evidence, interaction="brief")
    assert result.interaction == "brief"
    assert result.district == "Example Woreda"
    assert result.species == "P. falciparum"
    assert result.explanation.why_alert
    assert len(result.explanation.supporting_evidence) >= 1
    assert result.uncertainty.level
    assert result.uncertainty.evidence
    assert result.uncertainty.decision_implication
    assert len(result.options) >= 2
    assert all(opt.id in {"monitor", "watch", "investigate", "escalate"} for opt in result.options)
    assert all(opt.supporting_evidence or opt.tradeoffs for opt in result.options)
    assert len(result.what_could_change_decision) >= 1
    assert result.provenance.data_through == "2026-07-06"
    assert "facility reporting completeness" in result.evidence_gaps
    # legacy mirrors still populated
    assert len(result.supporting_evidence) >= 1
    assert len(result.what_would_change_decision) >= 1


def test_challenge_fallback_supports_counter_reliance(monkeypatch):
    monkeypatch.setenv("EDI_LLM_ENABLED", "false")
    evidence = {
        "district": "Example Woreda",
        "status": "Early Warning",
        "uncertainty": {"band": "high", "detail": "wide residual spread"},
        "historical_reliability": {"score": 0.2},
        "investigation": {
            "summary_stats": {
                "weeks_compared": 8,
                "weeks_above_expected": 8,
                "forecast_weeks": 6,
                "forecast_weeks_above_expected": 0,
            }
        },
        "local_outcome_feedback": {"false_alarm_count": 2, "sample_count": 3},
        "evidence_gaps": ["facility reporting completeness"],
    }
    result = grounded_deliberate(evidence, interaction="challenge")
    assert result.interaction == "challenge"
    assert result.challenge.summary
    assert len(result.challenge.reasons_to_question) >= 1
    assert len(result.challenge.what_would_reduce_uncertainty) >= 1
    assert any("false alarm" in r.lower() for r in result.challenge.reasons_to_question)


def test_compare_fallback_does_not_rank(monkeypatch):
    monkeypatch.setenv("EDI_LLM_ENABLED", "false")
    evidence = {
        "candidates": [
            {
                "district": "A",
                "status": "Early Warning",
                "magnitude_percent": 20,
                "uncertainty": {"band": "low", "label": "Lower uncertainty"},
                "recommendation": {"action_id": "investigate", "label": "Investigate locally"},
                "investigation_findings": ["Latest week above expected."],
            },
            {
                "district": "B",
                "status": "Early Detection",
                "magnitude_percent": 10,
                "uncertainty": {"band": "high", "label": "High uncertainty"},
                "recommendation": {"action_id": "watch", "label": "Monitor closely"},
                "local_outcome_feedback": {"caution": True, "false_alarm_count": 2},
            },
        ]
    }
    result = grounded_deliberate(evidence, interaction="compare")
    assert result.interaction == "compare"
    assert result.compare_interpret.summary
    assert len(result.compare_interpret.contrasts) >= 1
    assert len(result.compare_deliberate.priority_tradeoffs) >= 1
    assert result.challenge.reasons_to_question
    assert result.challenge.what_would_reduce_uncertainty
    assert "priority yourself" in result.summary.lower() or "without ranking" in result.summary.lower() or "assign priority" in result.summary.lower()
    assert result.options == []
