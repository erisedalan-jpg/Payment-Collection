# tests/test_assign_tier.py
import preprocess_data as P


def test_above_1m_inclusive():
    assert P.assign_tier(1_500_000) == "100万以上"
    assert P.assign_tier(1_000_000) == "100万以上"


def test_mid_inclusive():
    assert P.assign_tier(800_000) == "50-100万"
    assert P.assign_tier(500_000) == "50-100万"


def test_below_500k():
    assert P.assign_tier(300_000) == "50万以下"
    assert P.assign_tier(0) == "50万以下"


def test_none_treated_as_zero():
    assert P.assign_tier(None) == "50万以下"
