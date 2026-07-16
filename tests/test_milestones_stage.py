import milestones as M


def test_parse_stage_entries_multiline_and_no_date():
    plan = "阶段验收款1（20.00%）：2026-11-30\n\n阶段验收款2（5.00%）：2027-01-29"
    actual = "阶段验收款1（20.00%）：2026-06-12\n\n阶段验收款2（5.00%）"
    ep = M._parse_stage_entries(plan)
    ea = M._parse_stage_entries(actual)
    assert ep["阶段验收款1（20.00%）"] == "2026-11-30"
    assert ep["阶段验收款2（5.00%）"] == "2027-01-29"
    assert ea["阶段验收款1（20.00%）"] == "2026-06-12"
    assert ea["阶段验收款2（5.00%）"] == ""            # 无「：日期」→ 未完成


def test_stage_milestones_pairs_and_fields():
    row = {
        "阶段计划完成时间": "阶段验收款1（20.00%）：2026-11-30\n阶段验收款2（5.00%）：2027-01-29",
        "阶段实际完成时间": "阶段验收款1（20.00%）：2026-06-12\n阶段验收款2（5.00%）",
    }
    items = M.stage_milestones(row)
    assert [i["name"] for i in items] == ["阶段验收款1（20.00%）", "阶段验收款2（5.00%）"]
    i0 = items[0]
    assert i0["planDate"] == "2026-11-30" and i0["actualDate"] == "2026-06-12"
    assert i0["payStage"] == "阶段验收款1（20.00%）"
    assert i0["payRatio"] == 0.2                       # 20.00% → 0.2
    assert i0["priority"] == "high"                    # payStage 非空 → 高
    assert i0["stage"] is True
    assert items[1]["actualDate"] == ""                # 未完成


def test_stage_milestones_empty():
    assert M.stage_milestones({}) == []
    assert M.stage_milestones({"阶段计划完成时间": "", "阶段实际完成时间": ""}) == []


def test_row_to_milestones_marks_stage_flag():
    row = {"计划终验时间": "2026-05-01", "实际终验时间": "",
           "阶段计划完成时间": "阶段验收款1（30.00%）：2026-09-30", "阶段实际完成时间": ""}
    items = M.row_to_milestones(row)
    reg = [i for i in items if not i["stage"]]
    stg = [i for i in items if i["stage"]]
    assert any(i["name"] == "终验" for i in reg)       # 常规项 stage=False
    assert len(stg) == 1 and stg[0]["name"] == "阶段验收款1（30.00%）"
