# -*- coding: utf-8 -*-
import profit as P


def _write(tmp_path, name, text):
    (tmp_path / name).write_text(text, encoding="utf-8-sig")


DIRECT_CSV = (
    "项目编号,项目名称,预算收入,预算成本,实际成本,成本消耗率,预算毛利,实际毛利,预算毛利率,剩余预算,"
    "本项目_1_项目收入_预算金额,本项目_1_项目收入_实际发生,本项目_1_项目收入_剩余预算,本项目_1_项目收入_消耗率,"
    "本项目_2_项目成本_预算金额,本项目_2_项目成本_实际发生,本项目_2_项目成本_剩余预算,本项目_2_项目成本_消耗率,"
    "本项目_2.3.2_交付部门人工成本_预算金额,本项目_2.3.2_交付部门人工成本_实际发生,本项目_2.3.2_交付部门人工成本_剩余预算,本项目_2.3.2_交付部门人工成本_消耗率,"
    "本项目_2.4.1_差旅费_预算金额,本项目_2.4.1_差旅费_实际发生,本项目_2.4.1_差旅费_剩余预算,本项目_2.4.1_差旅费_消耗率,"
    "本项目_3_项目毛利_预算金额,本项目_3_项目毛利_实际发生,本项目_3_项目毛利_剩余预算,本项目_3_项目毛利_消耗率\n"
    # 消耗率列为百分点量级(实测=actual/budget*100),毛利率列为 0-1——CSV 内量纲混用是数据源现实
    "SS-1,甲项目,1000.0,600.0,200.0,33.0,400.0,100.0,0.4,400.0,"
    "1000.0,0.0,1000.0,0.0,"
    "600.0,200.0,400.0,33.0,"
    "100.0,50.0,50.0,50.0,"
    "0.0,0.0,0.0,0.0,"
    "400.0,100.0,300.0,184.52\n"
)

BUDGET_CSV = (
    "项目编号,项目名称,预算_1_项目收入_预算金额,预算_1_项目收入_概算金额,预算_1_项目收入_核算金额,"
    "预算_2.3.2_服务体系人工成本_预算金额,预算_2.3.2_服务体系人工成本_概算金额,预算_2.3.2_服务体系人工成本_核算金额,"
    "预算_3.1_项目毛利_预算金额,预算_3.1_项目毛利_概算金额,预算_3.1_项目毛利_核算金额\n"
    "SS-1,甲项目,0.0,900.0,950.0,0.0,80.0,85.0,0.0,350.0,360.0\n"
)

BRIDGE_CSV = (
    "项目编号,项目名称,桥接SS项目编码,桥接SS预算收入,桥接SS预算成本,桥接SS预算毛利,桥接SS预算毛利率,桥接SS实际成本,"
    "桥接_1_项目收入_预算金额,桥接_1_项目收入_实际发生,桥接_1_项目收入_剩余预算,桥接_1_项目收入_消耗率\n"
    "SF-1,售前服务-某行,SS-9,500.0,300.0,200.0,0.4,250.0,500.0,0.0,500.0,0.0\n"
)

PAY_CSV = (
    "项目编号,项目名称,合同编号,回款类型,收款流水号,回款单位,付款金额,回款确认日期,认领人,备注,订单号,币种,汇率,票据_互抵协议号\n"
    "SS-1,甲项目,C-1,实际回款,BANK-1,某公司,2250.0,2026-06-04,马春艳,,N-1,CNY,1.0,\n"
    "SS-1,甲项目,C-1,实际回款,BANK-2,某公司,1000.0,2026-05-27,赵岩,,N-2,USD,7.1,\n"
    "SS-99,乙项目,C-9,实际回款,BANK-9,别家,5.0,2026-01-01,张三,,N-9,CNY,1.0,\n"
)

PAY_BILL_CSV = (
    "项目编号,回款类型,收款流水号,付款金额,回款确认日期,票据_互抵协议号,票据_到期日期,票据_调整类型\n"
    "SS-1,实际回款,B-1,100.0,2026-06-04,,2026-03-10,背书\n"   # 有调整类型+到期日
    "SS-1,实际回款,B-2,200.0,2026-06-05,PROT-9,,\n"           # 仅互抵协议号
    "SS-1,实际回款,B-3,300.0,2026-06-06,,,\n"                 # 无票据信息
)


class TestParseProfitRows:
    def test_tree_levels_and_all_none_pruning(self):
        import csv, io
        row = next(csv.DictReader(io.StringIO(DIRECT_CSV)))
        rows = P.parse_profit_rows(row, "本项目_")
        codes = [r["code"] for r in rows]
        assert codes == ["1", "2", "2.3.2", "2.4.1", "3"]   # 2.4.1 全 0 保留(S1),一级行保留
        r232 = next(r for r in rows if r["code"] == "2.3.2")
        assert r232 == {"code": "2.3.2", "name": "交付部门人工成本", "level": 3,
                        "budget": 100.0, "estimate": None, "final": None,
                        "actual": 50.0, "remaining": 50.0, "rate": 0.5}   # 50.0 百分点 → 0.5
        r3 = next(r for r in rows if r["code"] == "3")
        assert r3["rate"] == 1.8452   # 超支 184.52% 归一,真实量级用例(R2 终审修正)


class TestLoadProfit:
    def test_merge_budget_and_bridge(self, tmp_path):
        _write(tmp_path, "profit_loss_direct.csv", DIRECT_CSV)
        _write(tmp_path, "budget_data.csv", BUDGET_CSV)
        _write(tmp_path, "profit_loss_bridge.csv", BRIDGE_CSV)
        pp, stats = P.load_profit(str(tmp_path), {"SS-1", "SF-1"})
        rows = pp["SS-1"]["rows"]
        r1 = next(r for r in rows if r["code"] == "1")
        assert r1["estimate"] == 900.0 and r1["final"] == 950.0      # code+name 一致 → 合并
        r232 = next(r for r in rows if r["code"] == "2.3.2")
        assert r232["estimate"] is None                               # 同 code 名不同(服务体系≠交付部门) → 不合并
        r3 = next(r for r in rows if r["code"] == "3")
        assert r3["estimate"] == 350.0 and r3["final"] == 360.0      # 毛利别名 3.1→3
        assert pp["SS-1"]["summary"]["预算收入"] == 1000.0
        assert pp["SS-1"]["summary"]["成本消耗率"] == 0.33
        assert pp["SS-1"]["bridge"] is None
        br = pp["SF-1"]["bridge"]
        assert br["ssId"] == "SS-9" and br["summary"]["实际成本"] == 250.0
        assert br["rows"][0]["code"] == "1"
        assert stats["direct"] == {"provided": True, "rows": 1, "matched": 1, "matchRate": 1.0}
        assert stats["budget"]["provided"] is True
        assert stats["bridge"]["matched"] == 1

    def test_missing_files(self, tmp_path):
        pp, stats = P.load_profit(str(tmp_path), {"SS-1"})
        assert pp == {}
        assert stats["direct"]["provided"] is False


class TestPaymentRecords:
    def test_group_and_summary(self, tmp_path):
        _write(tmp_path, "payment_records.csv", PAY_CSV)
        recs, stat = P.load_payment_records(str(tmp_path), {"SS-1"})
        e = recs["SS-1"]
        assert e["count"] == 2 and e["total"] == 3250.0 and e["lastDate"] == "2026-06-04"
        assert e["records"][0]["date"] == "2026-06-04"   # 新→旧排序
        assert e["records"][1]["currency"] == "USD" and e["records"][1]["rate"] == 7.1
        assert "SS-99" not in recs                        # keep_ids 过滤
        assert stat == {"provided": True, "rows": 3, "matched": 2, "matchRate": 0.6667}

    def test_missing(self, tmp_path):
        recs, stat = P.load_payment_records(str(tmp_path), {"SS-1"})
        assert recs == {} and stat["provided"] is False

    def test_bill_fields(self, tmp_path):
        _write(tmp_path, "payment_records.csv", PAY_BILL_CSV)
        recs, _ = P.load_payment_records(str(tmp_path), {"SS-1"})
        rs = {r["serial"]: r for r in recs["SS-1"]["records"]}
        assert rs["B-1"]["billType"] == "背书"
        assert rs["B-1"]["billDueDate"] == "2026-03-10"
        assert rs["B-1"]["billProtocol"] == ""
        assert rs["B-2"]["billProtocol"] == "PROT-9"
        assert rs["B-2"]["billType"] == "" and rs["B-2"]["billDueDate"] == ""
        assert rs["B-3"]["billType"] == "" and rs["B-3"]["billDueDate"] == ""
        assert rs["B-3"]["billProtocol"] == ""


class TestOverspendAmount:
    def _entry(self, actual, budget, bridge_remaining=None):
        e = {"summary": {"实际成本": actual, "预算成本": budget}, "rows": [], "bridge": None}
        if bridge_remaining is not None:
            e["bridge"] = {"ssId": "SS-X", "summary": {},
                           "rows": [{"code": "2", "name": "项目成本", "level": 1,
                                     "remaining": bridge_remaining}]}
        return e

    def test_normal_actual_minus_budget(self):
        assert P.overspend_amount(self._entry(7000.0, 1000.0)) == 6000.0
        assert P.overspend_amount(self._entry(500.0, 1000.0)) == -500.0   # 未超支为负

    def test_presale_uses_bridge_remaining(self):
        # 售前:当前消耗 - 原剩余预算
        assert P.overspend_amount(self._entry(8000.0, 1.0, bridge_remaining=2000.0)) == 6000.0

    def test_presale_without_bridge_falls_back(self):
        e = self._entry(7000.0, 1000.0)
        e["bridge"] = {"ssId": "SS-X", "summary": {}, "rows": []}   # 有桥但无科目2 → 退非售前式
        assert P.overspend_amount(e) == 6000.0

    def test_missing_data_none(self):
        assert P.overspend_amount(None) is None
        assert P.overspend_amount({"summary": {}, "rows": [], "bridge": None}) is None


class TestZeroRowsKept:
    def test_all_zero_kept_all_none_pruned(self):
        row = {
            "本项目_2.2.1_自有产品外包服务成本_预算金额": "0.0",
            "本项目_2.2.1_自有产品外包服务成本_实际发生": "0.0",
            "本项目_2.2.1_自有产品外包服务成本_剩余预算": "0.0",
            "本项目_2.2.1_自有产品外包服务成本_消耗率": "0.0",
            "本项目_2.9.9_幽灵科目_预算金额": "",
            "本项目_2.9.9_幽灵科目_实际发生": "",
            "本项目_2.9.9_幽灵科目_剩余预算": "",
            "本项目_2.9.9_幽灵科目_消耗率": "",
        }
        codes = [r["code"] for r in P.parse_profit_rows(row, "本项目_")]
        assert "2.2.1" in codes      # 全零保留(S1:科目全量展示)
        assert "2.9.9" not in codes  # 全 None 仍剪
