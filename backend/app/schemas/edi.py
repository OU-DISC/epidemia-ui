"""Schemas for grounded LLM-mediated EDI deliberation."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class EdiDeliberateRequest(BaseModel):
    """INPUT: Structured District Evidence Pack — the only facts the LLM may use."""

    evidence: Dict[str, Any] = Field(
        ...,
        description="Deterministic evidence from the client (Layer 2).",
    )
    interaction: str = Field(
        default="brief",
        description="brief | explain | compare | explore | suggest | challenge",
    )


class EdiExplainRequest(EdiDeliberateRequest):
    pass


class EdiExplanationBlock(BaseModel):
    why_alert: str = ""
    supporting_evidence: List[str] = Field(default_factory=list)
    contradicting_evidence: List[str] = Field(default_factory=list)


class EdiUncertaintyView(BaseModel):
    level: str = ""
    evidence: str = ""
    decision_implication: str = ""
    # legacy aliases
    reason: str = ""


class EdiOption(BaseModel):
    id: str
    action: str = ""
    label: str = ""
    supporting_evidence: List[str] = Field(default_factory=list)
    tradeoffs: List[str] = Field(default_factory=list)
    # legacy
    rationale: str = ""
    risk: str = ""
    pros: List[str] = Field(default_factory=list)
    cons: List[str] = Field(default_factory=list)
    evidence_refs: List[str] = Field(default_factory=list)


class EdiProvenance(BaseModel):
    data_through: Optional[str] = None
    report_generated_at: Optional[str] = None
    forecast_engine: Optional[str] = None
    deliberative_model: Optional[str] = None
    model_version: Optional[str] = None
    geography_version: Optional[str] = None
    species: Optional[str] = None


class EdiChallengeBlock(BaseModel):
    """Counter-reliance: reasons to question the assessment (not a decision)."""

    summary: str = ""
    reasons_to_question: List[str] = Field(default_factory=list)
    what_would_reduce_uncertainty: List[str] = Field(default_factory=list)


class EdiCompareInterpret(BaseModel):
    summary: str = ""
    contrasts: List[str] = Field(default_factory=list)


class EdiCompareDeliberate(BaseModel):
    priority_tradeoffs: List[str] = Field(default_factory=list)


class EdiDeliberateResponse(BaseModel):
    """OUTPUT: Unified Structured Brief (React renders; humans decide)."""

    available: bool = True
    grounded: bool = True
    source: str = Field(default="llm", description="llm | fallback | unavailable")
    interaction: str = "brief"
    district: Optional[str] = None
    species: Optional[str] = None
    explanation: EdiExplanationBlock = Field(default_factory=EdiExplanationBlock)
    uncertainty: EdiUncertaintyView = Field(default_factory=EdiUncertaintyView)
    options: List[EdiOption] = Field(default_factory=list)
    what_could_change_decision: List[str] = Field(default_factory=list)
    evidence_gaps: List[str] = Field(default_factory=list)
    challenge: EdiChallengeBlock = Field(default_factory=EdiChallengeBlock)
    compare_interpret: EdiCompareInterpret = Field(default_factory=EdiCompareInterpret)
    compare_deliberate: EdiCompareDeliberate = Field(default_factory=EdiCompareDeliberate)
    provenance: EdiProvenance = Field(default_factory=EdiProvenance)
    # legacy mirrors for older callers
    summary: str = ""
    bullets: List[str] = Field(default_factory=list)
    questions: List[str] = Field(default_factory=list)
    supporting_evidence: List[str] = Field(default_factory=list)
    what_would_change_decision: List[str] = Field(default_factory=list)
    evidence_refs: List[str] = Field(default_factory=list)
    model: Optional[str] = None
    detail: Optional[str] = None


class EdiExplainResponse(EdiDeliberateResponse):
    pass


class EdiStatusResponse(BaseModel):
    available: bool
    enabled: bool
    model: Optional[str] = None
    detail: Optional[str] = None
