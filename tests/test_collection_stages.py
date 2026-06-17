import os

import collection_stages as CS


def test_ms_to_date_tz8():
    # 1782057600000 = 东八区 2026-06-22 00:00（UTC 为 06-21 16:00）；须按 +8 转换
    assert CS._ms_to_date("1782057600000") == "2026-06-22"
    assert CS._ms_to_date("") == ""
    assert CS._ms_to_date("abc") == ""
    assert CS._ms_to_date(None) == ""


def test_pct():
    assert CS._pct("70.00%") == 0.7
    assert CS._pct("15%") == 0.15
    assert CS._pct("") is None
    assert CS._pct("abc") is None


def test_num_and_int():
    assert CS._num("123.5") == 123.5
    assert CS._num("") == 0.0
    assert CS._num("x") == 0.0
    assert CS._int("365.0") == 365
    assert CS._int("") is None
    assert CS._int("x") is None


def test_stage_status_branches():
    today = "2026-06-16"
    assert CS.stage_status("终验款", "2026-01-01", 1.0, today) == "已回款"
    assert CS.stage_status("到货款", "2026-01-01", 0.5, today) == "部分回款"
    assert CS.stage_status("质保金", "", 0.0, today) == "质保期"
    assert CS.stage_status("终验款", "2020-01-01", 0.0, today) == "延期"      # 计划<今天且未收
    assert CS.stage_status("终验款", "2099-01-01", 0.0, today) == "待回款"
    assert CS.stage_status("终验款", "", 0.0, today) == "待回款"
    assert CS.stage_status("质保金", "2026-01-01", 1.0, today) == "已回款"    # 质保金已收→不再质保期


def _write_csv(path, rows):
    import csv
    cols = ["项目编号", "项目名称", "合同编号", "回款类型", "阶段名称", "回款比例", "回款金额",
            "关联日期", "计划回款时间", "实际回款时间", "实际比例", "已收金额", "收款条件", "未收金额", "调整原因"]
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


def test_load_groups_sorts_and_maps(tmp_path):
    p = str(tmp_path)
    _write_csv(os.path.join(p, "collection_stages.csv"), [
        {"项目编号": "X1", "回款类型": "终验款", "阶段名称": "终验款", "回款比例": "90.00%",
         "回款金额": "900000", "关联日期": "20", "计划回款时间": "1782057600000",
         "实际回款时间": "", "实际比例": "0.0", "已收金额": "0", "未收金额": "900000",
         "收款条件": "终验款，验收结束后20天内付款25%"},
        {"项目编号": "X1", "回款类型": "预付款", "阶段名称": "预付款", "回款比例": "10.00%",
         "回款金额": "100000", "关联日期": "0", "计划回款时间": "1765468800000",
         "实际回款时间": "1765468800000", "实际比例": "1.0", "已收金额": "100000", "未收金额": "0"},
        {"项目编号": "", "回款类型": "终验款", "阶段名称": "终验款", "回款比例": "100%",
         "回款金额": "1", "关联日期": "1", "计划回款时间": "", "实际回款时间": "",
         "实际比例": "0.0", "已收金额": "0", "未收金额": "1"},  # 空项目编号→跳过
    ])
    out = CS.load_collection_stages(p, "2026-06-16")
    assert set(out.keys()) == {"X1"}
    nodes = out["X1"]
    assert len(nodes) == 2
    # 按计划日升序：预付款(2025-12-12) 在 终验款(2026-06-22) 之前
    assert nodes[0]["stage"] == "预付款" and nodes[1]["stage"] == "终验款"
    pre = nodes[0]
    assert pre["category"] == "预付款" and pre["payRatio"] == 0.1
    assert pre["planDate"] == "2025-12-12" and pre["actualDate"] == "2025-12-12"
    assert pre["expectedPayment"] == 100000.0
    assert pre["receivedAmount"] == 100000.0 and pre["unpaidAmount"] == 0.0
    assert pre["actualRatio"] == 1.0 and pre["termDays"] == 0
    assert pre["reached"] is True and pre["status"] == "已回款"
    fin = nodes[1]
    assert fin["planDate"] == "2026-06-22" and fin["reached"] is False
    assert fin["status"] == "待回款"   # 计划 2026-06-22 在 today 之后
    assert fin["payTerm"] == "终验款，验收结束后20天内付款25%"
    assert pre["payTerm"] == ""   # 预付款行未填收款条件 → 空串


def test_load_missing_file_returns_empty(tmp_path):
    assert CS.load_collection_stages(str(tmp_path), "2026-06-16") == {}
