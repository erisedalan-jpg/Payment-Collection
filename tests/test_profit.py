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
    "SS-1,甲项目,1000.0,600.0,200.0,0.33,400.0,100.0,0.4,400.0,"
    "1000.0,0.0,1000.0,0.0,"
    "600.0,200.0,400.0,0.33,"
    "100.0,50.0,50.0,0.5,"
    "0.0,0.0,0.0,0.0,"
    "400.0,100.0,300.0,0.25\n"
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


class TestParseProfitRows:
    def test_tree_levels_and_zero_pruning(self):
        import csv, io
        row = next(csv.DictReader(io.StringIO(DIRECT_CSV)))
        rows = P.parse_profit_rows(row, "本项目_")
        codes = [r["code"] for r in rows]
        assert codes == ["1", "2", "2.3.2", "3"]   # 2.4.1 全 0 被剪,一级行保留
        r232 = next(r for r in rows if r["code"] == "2.3.2")
        assert r232 == {"code": "2.3.2", "name": "交付部门人工成本", "level": 3,
                        "budget": 100.0, "estimate": None, "final": None,
                        "actual": 50.0, "remaining": 50.0, "rate": 0.5}


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
