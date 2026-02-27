"""Shared pytest fixtures for Deep Research Agent tests."""

from __future__ import annotations

import pytest

from src.models import SubjectProfile


@pytest.fixture
def sample_subject_profile() -> SubjectProfile:
    """Minimal subject profile for graph/agent tests."""
    return SubjectProfile(
        full_name="Test Person",
        current_role="CEO",
        current_organization="Test Corp",
    )
