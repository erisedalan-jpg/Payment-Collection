# tests/test_compute_node_status.py
from datetime import datetime
import preprocess_data as P

NOW = datetime(2026, 6, 3)


def call(**kw):
    base = dict(
        is_payment_related=True, can_advance=False, completion_pct=None,
        actual_ratio=None, is_milestone_achieved="", plan_date="", now=NOW,
    )
    base.update(kw)
    return P.compute_node_status(**base)


def test_not_payment_related_returns_empty():
    assert call(is_payment_related=False) == ("", 0)


def test_can_advance():
    assert call(can_advance=True, completion_pct=0.5, actual_ratio=0.5) == ("加资源可提前", 0)


def test_reached_condition():
    assert call(completion_pct=1.0, is_milestone_achieved="是", actual_ratio=0.5) == ("达到回款条件", 0)


def test_advance_paid_future_plan_fully_paid():
    assert call(plan_date="2026-12-01", actual_ratio=1.0) == ("已提前回款", 0)


def test_full_paid_when_not_future():
    assert call(plan_date="2026-01-01", actual_ratio=1.0) == ("已全额回款", 0)


def test_delayed_with_delay_days():
    status, delay = call(plan_date="2026-01-01", completion_pct=0.5, actual_ratio=0.0)
    assert status == "延期"
    assert delay == 153  # 2026-01-01 → 2026-06-03


def test_on_time_default():
    assert call(plan_date="2026-12-01", completion_pct=0.5, actual_ratio=0.0) == ("正常实施中", 0)
