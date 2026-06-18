# -*- coding: utf-8 -*-
import openpyxl
import milestones as M


def _mk_xlsx(path, rows):
    """造 PMIS 风格小表:第1行合并标题,第2行表头,数据从第3行起。"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["里程碑计划"])
    ws.append(M.MILESTONE_HEADER)
    for r in rows:
        ws.append(r)
    wb.save(path)


def _row(pid, **kw):
    """按表头生成一行,kw 用列名赋值。"""
    d = {h: "" for h in M.MILESTONE_HEADER}
    d["项目编号"] = pid
    d["项目名称"] = f"项目{pid}"
    d.update(kw)
    return [d[h] for h in M.MILESTONE_HEADER]


class TestPriority:
    def test_high_mid_low(self):
        assert M.milestone_priority("终验", "") == "high"
        assert M.milestone_priority("服务完成", None) == "high"
        assert M.milestone_priority("到货", "到货款1，70.00%") == "high"  # 关联回款
        assert M.milestone_priority("项目关闭", "") == "mid"
        assert M.milestone_priority("到货", "") == "low"
        assert M.milestone_priority("预检", "  ") == "low"


class TestRowToMilestones:
    def test_wide_to_long_skip_empty_and_order(self):
        raw = {h: "" for h in M.MILESTONE_HEADER}
        raw["计划终验时间"] = "2026-07-01"
        raw["终验关联回款阶段"] = "终验款，100.00%"
        raw["计划项目启动时间"] = "2026-01-01"
        raw["实际项目启动时间"] = "2026-01-02"
        items = M.row_to_milestones(raw)
        # 全空类目被丢弃,只剩 启动/终验,且按业务顺序
        assert [i["name"] for i in items] == ["项目启动", "终验"]
        assert items[0] == {"name": "项目启动", "planDate": "2026-01-01",
                            "actualDate": "2026-01-02", "payStage": "", "pct": None,
                            "payRatio": None, "priority": "low"}
        assert items[1]["priority"] == "high"

    def test_paystage_newline_normalized_and_pct(self):
        raw = {h: "" for h in M.MILESTONE_HEADER}
        raw["计划终验时间"] = "2026-07-01"
        raw["终验关联回款阶段"] = "终验款，95.00%\n\n质保金1，5.00%"
        raw["计划服务完成时间"] = "2026-08-01"
        raw["服务完成百分比"] = "50"
        items = M.row_to_milestones(raw)
        zy = next(i for i in items if i["name"] == "终验")
        assert zy["payStage"] == "终验款，95.00%；质保金1，5.00%"
        fw = next(i for i in items if i["name"] == "服务完成")
        assert fw["pct"] == 50.0

    def test_datetime_normalized(self):
        import datetime
        raw = {h: "" for h in M.MILESTONE_HEADER}
        raw["计划到货时间"] = datetime.datetime(2026, 6, 19, 0, 0)
        items = M.row_to_milestones(raw)
        assert items[0]["planDate"] == "2026-06-19"


class TestLoadMilestones:
    def test_filter_merge_and_stats(self, tmp_path):
        _mk_xlsx(str(tmp_path / "在建项目里程碑计划数据.xlsx"), [
            _row("SS-1", **{"计划终验时间": "2026-07-01"}),
            _row("SS-99", **{"计划终验时间": "2026-07-02"}),   # 不在 keep_ids,过滤
        ])
        _mk_xlsx(str(tmp_path / "已结项里程碑计划数据.xlsx"), [
            _row("SS-1", **{"计划项目关闭时间": "2025-12-01"}),  # 与在建重复,在建优先
            _row("OLD-1", **{"计划项目关闭时间": "2025-01-01"}),  # relatedClosedId 命中
        ])
        ms, sa, sc = M.load_milestones(str(tmp_path), {"SS-1", "OLD-1"})
        assert set(ms.keys()) == {"SS-1", "OLD-1"}
        assert ms["SS-1"][0]["name"] == "终验"            # 在建版本胜出
        assert ms["OLD-1"][0]["name"] == "项目关闭"
        assert sa == {"provided": True, "rows": 2, "matched": 1, "matchRate": 0.5}
        assert sc == {"provided": True, "rows": 2, "matched": 1, "matchRate": 0.5}

    def test_missing_files(self, tmp_path):
        ms, sa, sc = M.load_milestones(str(tmp_path), {"SS-1"})
        assert ms == {}
        assert sa["provided"] is False and sc["provided"] is False


def test_parse_pay_stage_ratio():
    import milestones as M
    assert M.parse_pay_stage_ratio("到货款1，70.00%") == 0.70
    assert M.parse_pay_stage_ratio("到货款1，70%；到货款2，30%") == 1.0   # 多期累加
    assert M.parse_pay_stage_ratio("终验款，100.00%") == 1.0
    assert M.parse_pay_stage_ratio("") is None
    assert M.parse_pay_stage_ratio("无比例") is None


def test_row_to_milestones_has_payratio():
    import milestones as M
    rows = M.row_to_milestones({"项目编号": "P1", "计划到货时间": "2026-06-01",
                                "到货关联回款阶段": "到货款1，70.00%"})
    arrival = next(x for x in rows if x["name"] == "到货")
    assert arrival["payRatio"] == 0.70


def test_final_acceptance_date():
    import milestones as M
    items = [{"name": "终验", "planDate": "2026-07-01"},
             {"name": "服务完成", "planDate": "2026-08-01"}]
    assert M.final_acceptance_date(items, "实施项目") == "2026-07-01"      # 非售前→终验
    assert M.final_acceptance_date(items, "售前服务类") == "2026-08-01"    # 售前→服务完成
    assert M.final_acceptance_date([{"name": "初验", "planDate": "2026-06-01"}], "实施项目") is None
    assert M.final_acceptance_date([{"name": "终验", "planDate": ""}], "实施项目") is None
    assert M.final_acceptance_date([], "售前服务类") is None
