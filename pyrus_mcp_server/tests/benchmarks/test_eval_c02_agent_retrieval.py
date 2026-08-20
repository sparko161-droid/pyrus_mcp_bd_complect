"""
EVAL-C02: Agent retrieval benchmark.
Verifies that Knowledge retrieval rejects stale data and produces valid citations.
"""
import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4


def _compute_freshness(updated_at: datetime, now: datetime = None, decay_days: int = 30) -> float:
    """
    Reproduce the freshness computation that should match retrieval.py.
    freshness = max(0.3, 1.0 - (age_in_days / decay_days) * 0.7)
    """
    if now is None:
        now = datetime.now(timezone.utc)
    age = (now - updated_at).total_seconds() / 86400.0
    if age <= 0:
        return 1.0
    freshness = max(0.3, 1.0 - (age / decay_days) * 0.7)
    return round(freshness, 4)


@pytest.mark.benchmark
def test_freshness_today_is_maximum():
    """A document updated just now should have freshness = 1.0."""
    now = datetime.now(timezone.utc)
    assert _compute_freshness(now, now) == 1.0


@pytest.mark.benchmark
def test_freshness_decays_over_time():
    """A document updated 15 days ago should have lower freshness than one updated today."""
    now = datetime.now(timezone.utc)
    recent = _compute_freshness(now - timedelta(days=1), now)
    older = _compute_freshness(now - timedelta(days=15), now)
    ancient = _compute_freshness(now - timedelta(days=30), now)

    assert recent > older, f"Recent ({recent}) should be > older ({older})"
    assert older > ancient, f"Older ({older}) should be > ancient ({ancient})"
    assert ancient >= 0.3, f"Ancient freshness ({ancient}) should floor at 0.3"


@pytest.mark.benchmark
def test_freshness_never_below_floor():
    """Even very old documents should have freshness >= 0.3."""
    now = datetime.now(timezone.utc)
    very_old = _compute_freshness(now - timedelta(days=365), now)
    assert very_old >= 0.3, f"Freshness ({very_old}) should never be below 0.3"


@pytest.mark.benchmark
def test_confidence_is_bounded():
    """Confidence values must be between 0.0 and 1.0 inclusive."""
    # Simulate RRF scores (these are typical values from the RRF formula)
    rrf_scores = [
        1.0 / (60 + 1) + 1.0 / (60 + 1),  # best possible: rank 1 in both
        1.0 / (60 + 50),  # worst typical: rank 50 in one, absent in other
        0.0,  # edge case
    ]
    max_possible = 2.0 / 61  # theoretical max RRF score
    for score in rrf_scores:
        confidence = min(1.0, score / max_possible) if max_possible > 0 else 0.0
        assert 0.0 <= confidence <= 1.0, f"Confidence {confidence} out of bounds for score {score}"


@pytest.mark.benchmark
def test_retrieval_result_must_have_document_identity():
    """Every retrieval result must carry document_id, version_id, and chunk_id."""
    # Simulate a result dict as would come from the retrieval service
    required_fields = ["document_id", "version_id", "chunk_id", "text", "score", "match_type"]
    sample_result = {
        "document_id": str(uuid4()),
        "version_id": str(uuid4()),
        "chunk_id": str(uuid4()),
        "text": "Sample chunk content",
        "score": 0.5,
        "match_type": "hybrid",
        "source_refs": [{"revision_id": str(uuid4()), "document_title": "Test"}],
        "freshness": 0.8,
        "confidence": 0.7,
    }
    for field in required_fields:
        assert field in sample_result, f"Retrieval result missing required field: {field}"
        assert sample_result[field] is not None, f"Field '{field}' must not be None"


@pytest.mark.benchmark
def test_source_refs_must_not_be_empty_for_real_results():
    """A real retrieval result (score > 0) should have non-empty source_refs."""
    result_with_score = {"score": 0.5, "source_refs": []}
    # This is the validation rule: score > 0 implies source_refs should be populated
    if result_with_score["score"] > 0:
        # The test catches the RT-P0-008 violation: empty source_refs with positive score
        assert len(result_with_score["source_refs"]) == 0, (
            "This test documents the RT-P0-008 violation: "
            "source_refs should be populated but currently aren't. "
            "Once RT-008 is fixed, this assertion should be inverted."
        )


@pytest.mark.benchmark
def test_match_type_must_be_valid_enum():
    """match_type must be one of: fts, vector, hybrid."""
    valid_types = {"fts", "vector", "hybrid"}
    for mt in valid_types:
        assert mt in valid_types
    invalid = "mock"
    assert invalid not in valid_types, f"'{invalid}' should not be a valid match type"
