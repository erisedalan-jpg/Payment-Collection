"""字面量契约：collection_stages.stage_status 产出的"已回款" == snapshots 判定用的同一常量。
批1 opus 终审 minor：消除 config.STATUS_FULL_PAID 孤儿常量同类隐患（软耦合裸字面量）。"""
import config
import collection_stages as cs
import snapshots


def test_stage_status_paid_constant_shared():
    # collection_stages.stage_status 的"已回款"取值 == snapshots 判定用的同一常量
    assert config.STAGE_STATUS_PAID == "已回款"


def test_stage_status_returns_constant_for_full_actual_ratio():
    assert cs.stage_status("质保金", "2026-01-01", 1.0, "2026-06-01") == config.STAGE_STATUS_PAID


def test_paid_transition_emits_complete_event_via_constant():
    base = [{"projectId": "P-1", "projectName": "甲"}]
    a = {"P-1": [{"stage": "初验款", "planDate": "2026-03-31", "receivedAmount": 0,
                  "expectedPayment": 500000, "unpaidAmount": 500000, "status": "待回款"}]}
    b = {"P-1": [{"stage": "初验款", "planDate": "2026-03-31", "receivedAmount": 500000,
                  "expectedPayment": 500000, "unpaidAmount": 0, "status": config.STAGE_STATUS_PAID}]}
    evs = snapshots.diff_snapshots(snapshots.build_snapshot("2026-06-01", base, {}, a),
                                   snapshots.build_snapshot("2026-06-11", base, {}, b))
    assert any(e["type"] == "回款完成" for e in evs)
