"""
Structured run metadata for investigation telemetry and audit trails.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class RunMetadata(BaseModel):
    """Captures key metrics and metadata for a single investigation run."""

    run_id: str = ""
    subject: str = ""
    started_at: datetime = Field(default_factory=_now_utc)
    completed_at: Optional[datetime] = None
    duration_seconds: float = 0.0
    total_cost_usd: float = 0.0
    iterations: int = 0
    phases_executed: list[str] = Field(default_factory=list)
    entities_found: int = 0
    connections_found: int = 0
    risk_flags_count: int = 0
    sources_accessed: int = 0
    sources_failed: int = 0
    termination_reason: str = ""
    error_count: int = 0
