# tests/test_pipeline_integration.py
import json
import os
from datetime import datetime

import preprocess_data as P

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "payment_nodes_sample.json")


def _load_fixture():
    with open(FIX, encoding="utf-8") as f:
        return json.load(f)


def test_process_nodes_assigns_tier_and_status():
    nodes = P.process_below100_nodes(_load_fixture(), "__temp__")
    # main() 会按金额重分配 tier，这里手动复用 assign_tier 验证
    for n in nodes:
        n["tier"] = P.assign_tier(n["projectAmount"])
    by_id = {n["projectId"]: n for n in nodes}

    assert by_id["P1"]["tier"] == "100万以上"
    assert by_id["P1"]["nodeStatus"] == "已全额回款"
    assert by_id["P2"]["tier"] == "50-100万"
    assert by_id["P2"]["nodeStatus"] == "延期"
    # 不关联回款：状态为空、金额为 0
    assert by_id["P3"]["isPaymentRelated"] is False
    assert by_id["P3"]["nodeStatus"] == ""
    assert by_id["P3"]["expectedPayment"] == 0


def test_process_nodes_now_injection_deterministic():
    nodes = P.process_below100_nodes(_load_fixture(), "__temp__", now=datetime(2026, 6, 3))
    by_id = {n["projectId"]: n for n in nodes}
    # P2 plan_date 2025-01-10 → 2026-06-03 固定延期天数
    assert by_id["P2"]["delayDays"] == 509
