"""Tests for search tools — NormalizedResult, SearchResponse, domain extraction."""

from src.tools.search import NormalizedResult, SearchResponse


class TestNormalizedResult:
    def test_domain_extraction(self) -> None:
        result = NormalizedResult(
            title="Test",
            url="https://www.sec.gov/filings/123",
            snippet="test",
        )
        assert "sec.gov" in result.domain

    def test_empty_url(self) -> None:
        result = NormalizedResult(title="Test", url="", snippet="test")
        assert result.domain == ""

    def test_raw_content_optional(self) -> None:
        result = NormalizedResult(title="T", url="https://a.com", snippet="s", raw_content="full text")
        assert result.raw_content == "full text"


class TestSearchResponse:
    def test_empty_response(self) -> None:
        resp = SearchResponse(query="test", provider="tavily")
        assert len(resp.results) == 0
        assert resp.total_results == 0

    def test_with_results(self) -> None:
        resp = SearchResponse(
            query="test",
            provider="tavily",
            results=[
                NormalizedResult(title="A", url="https://a.com", snippet="s1"),
                NormalizedResult(title="B", url="https://b.com", snippet="s2"),
            ],
            total_results=2,
        )
        assert len(resp.results) == 2
        assert resp.results[0].title == "A"
        assert resp.results[1].url == "https://b.com"
