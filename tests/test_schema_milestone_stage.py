import schema


def test_milestone_item_has_stage_field():
    m = schema.MilestoneItem(name="阶段验收款1（20.00%）", stage=True)
    assert m.stage is True
    assert schema.MilestoneItem(name="终验").stage is False    # 默认 False


def test_milestone_item_accepts_stage_payload():
    m = schema.MilestoneItem.model_validate({
        "name": "阶段验收款1（20.00%）", "planDate": "2026-11-30", "actualDate": "",
        "payStage": "阶段验收款1（20.00%）", "payRatio": 0.2, "pct": None,
        "priority": "high", "stage": True})
    assert m.stage is True and m.payRatio == 0.2
