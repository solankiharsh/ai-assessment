"""
PII detection and redaction for investigation reports.

Scans entities and text fields for common PII patterns
(SSN, phone, email, address, DOB, financial accounts) and
produces redacted versions.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Any

from pydantic import BaseModel


class PIITag(str, Enum):
    """Types of PII that can be detected."""

    SSN = "ssn"
    PHONE = "phone"
    EMAIL = "email"
    ADDRESS = "address"
    DOB = "dob"
    FINANCIAL_ACCOUNT = "financial_account"


class PIIAnnotation(BaseModel):
    """A detected PII occurrence."""

    entity_id: str = ""
    field_name: str = ""
    pii_type: PIITag
    original_value: str
    redacted_value: str


# Regex patterns for common PII types
_PII_PATTERNS: list[tuple[PIITag, re.Pattern[str], str]] = [
    # SSN: 123-45-6789 or 123456789
    (PIITag.SSN, re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN REDACTED]"),
    (PIITag.SSN, re.compile(r"\b\d{9}\b"), "[SSN REDACTED]"),
    # Phone: various formats
    (PIITag.PHONE, re.compile(r"\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[PHONE REDACTED]"),
    # Email
    (PIITag.EMAIL, re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"), "[EMAIL REDACTED]"),
    # DOB: MM/DD/YYYY or YYYY-MM-DD
    (PIITag.DOB, re.compile(r"\b\d{1,2}/\d{1,2}/\d{4}\b"), "[DOB REDACTED]"),
    (PIITag.DOB, re.compile(r"\b\d{4}-\d{2}-\d{2}\b"), "[DOB REDACTED]"),
    # Financial account numbers (generic: 8-17 digits)
    (PIITag.FINANCIAL_ACCOUNT, re.compile(r"\baccount\s*#?\s*\d{8,17}\b", re.IGNORECASE), "[ACCOUNT REDACTED]"),
]


class PIIRedactor:
    """Scans text and state for PII and produces redacted versions."""

    def scan_text(self, text: str) -> list[PIIAnnotation]:
        """Scan a text string for PII patterns."""
        annotations: list[PIIAnnotation] = []
        for pii_type, pattern, replacement in _PII_PATTERNS:
            for match in pattern.finditer(text):
                annotations.append(PIIAnnotation(
                    pii_type=pii_type,
                    original_value=match.group(),
                    redacted_value=replacement,
                ))
        return annotations

    def scan_state(self, state: Any) -> list[PIIAnnotation]:
        """Scan a ResearchState for PII in entities and text fields."""
        annotations: list[PIIAnnotation] = []
        for entity in getattr(state, "entities", []):
            # Scan entity attributes
            for key, value in entity.attributes.items():
                if isinstance(value, str):
                    for ann in self.scan_text(value):
                        ann.entity_id = entity.id
                        ann.field_name = f"attributes.{key}"
                        annotations.append(ann)
            # Scan description
            if entity.description:
                for ann in self.scan_text(entity.description):
                    ann.entity_id = entity.id
                    ann.field_name = "description"
                    annotations.append(ann)
        # Scan report
        report = getattr(state, "final_report", "")
        if report:
            for ann in self.scan_text(report):
                ann.field_name = "final_report"
                annotations.append(ann)
        return annotations

    def redact_report(self, report: str, annotations: list[PIIAnnotation] | None = None) -> str:
        """Produce a redacted version of the report."""
        if annotations is None:
            annotations = self.scan_text(report)
        redacted = report
        # Sort by length descending to avoid overlapping replacements
        for ann in sorted(annotations, key=lambda a: len(a.original_value), reverse=True):
            if ann.original_value in redacted:
                redacted = redacted.replace(ann.original_value, ann.redacted_value)
        return redacted
