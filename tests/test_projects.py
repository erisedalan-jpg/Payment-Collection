# -*- coding: utf-8 -*-
"""projects.py 纯函数单元测试。不依赖 input/ 真文件——用 tmp_path 生成的小 xlsx 或内存 dict。"""
import openpyxl
import pytest

import config
import projects as P


def _make_xlsx(dir_path, name, sheets):
    """造多 sheet xlsx。sheets = [(sheet名, rows[list[tuple]])]，首个 sheet 复用默认 active。"""
    wb = openpyxl.Workbook()
    for i, (title, rows) in enumerate(sheets):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = title
        for r in rows:
            ws.append(list(r))
    path = str(dir_path / name)
    wb.save(path)
    return path


class TestReadOrgNames:
    def test_picks_sheet_with_gonghao_header(self, tmp_path):
        path = _make_xlsx(tmp_path, "组织架构.xlsx", [
            ("Sheet2", [("行标签", "求和项:成本"), ("银行服务组", 100)]),  # 透视杂表在前
            ("Sheet1", [
                ("工号", "姓名", "员工类别", "新L2组织", "新L3组织", "新L3-1组织", "新L4组织",
                 "直接上级工号", "直接上级姓名", "是否项目经理", "成本"),
                ("A012804", "佘海龙", "正式员工", "交付中心", "交付实施三部", "服务二部",
                 "黑龙江服务组", "A001373", "于岩", None, 1500),
                ("A002338", "杨亮", "正式员工", "交付中心", "交付实施三部", "服务二部",
                 "黑龙江服务组", "A012804", "佘海龙", None, 1000),
            ]),
        ])
        names, l4s, rows = P.read_org_names(path)
        assert names == {"佘海龙", "杨亮"}
        assert l4s == {"黑龙江服务组"}
        assert rows == 2

    def test_missing_file_degrades(self, tmp_path):
        names, l4s, rows = P.read_org_names(str(tmp_path / "不存在.xlsx"))
        assert names == set() and l4s == set() and rows == 0


class TestReadMapping:
    def test_headerless_three_cols(self, tmp_path):
        path = _make_xlsx(tmp_path, "A.xlsx", [
            ("Sheet1", [
                ("WSGF-SF-202301100425", "于江", "WSGF-SS-202212229197"),
                ("WSGF-SF-202304190139", "于江", "WSGF-SS-202303289058"),
                (None, None, None),  # 空行跳过
                ("WSGF-SF-X", "某人", None),  # 缺已关闭号跳过
            ]),
        ])
        m = P.read_mapping(path)
        assert m == [
            {"current": "WSGF-SF-202301100425", "owner": "于江", "closed": "WSGF-SS-202212229197"},
            {"current": "WSGF-SF-202304190139", "owner": "于江", "closed": "WSGF-SS-202303289058"},
        ]

    def test_missing_file_degrades(self, tmp_path):
        assert P.read_mapping(str(tmp_path / "无.xlsx")) == []


class TestReadDelivery:
    def test_picks_sheet_with_pid_header_and_skips_pivot(self, tmp_path):
        path = _make_xlsx(tmp_path, "delivery_analysis.xlsx", [
            ("Sheet1", [(None, None), ("行标签", "求和项:x")]),  # 透视杂表
            ("delivery_analysis (1)", [
                ("项目编号", "项目名称", "项目经理", "L4组织", "差旅费_预算金额", "差旅费_消耗率"),
                ("WSGF-SS-1", "某项目", "佘海龙", "黑龙江服务组", 1000, "50%"),
            ]),
        ])
        rows = P.read_delivery(path)
        assert len(rows) == 1
        assert rows[0]["项目编号"] == "WSGF-SS-1"
        assert rows[0]["差旅费_预算金额"] == 1000


class TestReadDeliveryCsv:
    def test_csv_first_and_legacy_fallback(self, tmp_path):
        import projects as PJ
        csv_path = tmp_path / "delivery_analysis.csv"
        csv_path.write_text("项目编号,项目名称,交付外包服务成本_预算金额\nSS-1,甲,100.0\n", encoding="utf-8-sig")
        rows = PJ.read_delivery(str(csv_path))
        assert rows[0]["项目编号"] == "SS-1"
        # csv 缺失 → 回退 xlsx(不存在则空)
        assert PJ.read_delivery(str(tmp_path / "none" / "delivery_analysis.csv")) == []


class TestDeliveryCostsFor:
    def test_seven_categories_parsed(self):
        row = {"差旅费_预算金额": "1,000", "差旅费_实际发生": 600,
               "差旅费_剩余预算": 400, "差旅费_消耗率": "60%"}
        out = P.delivery_costs_for(row)
        assert len(out) == len(config.DELIVERY_COST_CATEGORIES)
        trip = next(i for i in out if i["类别"] == "差旅费")
        assert trip == {"类别": "差旅费", "预算金额": 1000.0, "实际发生": 600.0,
                        "剩余预算": 400.0, "消耗率": pytest.approx(0.6)}
        other = next(i for i in out if i["类别"] == "其他费用")
        assert other["预算金额"] is None  # 缺列降 None


class TestAggregatePayment:
    def test_sums_and_delayed(self):
        nodes = [
            {"isPaymentRelated": True, "expectedPayment": 100.0, "actualPayment": 40.0,
             "nodeStatus": config.STATUS_DELAYED},
            {"isPaymentRelated": True, "expectedPayment": 50.0, "actualPayment": 50.0,
             "nodeStatus": config.STATUS_FULL_PAID},
            {"isPaymentRelated": False, "expectedPayment": 999.0, "actualPayment": 0.0,
             "nodeStatus": ""},  # 非回款节点不计
        ]
        agg = P.aggregate_payment(nodes)
        assert agg == {"relatedNodeCount": 2, "expectedTotal": 150.0, "actualTotal": 90.0,
                       "remainingTotal": 60.0, "paymentRatio": 0.6, "delayedCount": 1}

    def test_zero_expected_ratio_none(self):
        assert P.aggregate_payment([])["paymentRatio"] is None


class TestComputeHealth:
    def _pm(self, **over):
        pm = {"progress": {"里程碑进度状态": "正常"},
              "risk": {"最高等级": "低", "未关闭风险数": 0},
              "cost": {"超支": False, "消耗比": 0.5}}
        pm.update(over)
        return pm

    def test_all_ok(self):
        h = P.compute_health(self._pm(), delayed_count=0)
        assert h["overall"] == "健康"
        assert not any([h["progressAbnormal"], h["riskAbnormal"],
                        h["costAbnormal"], h["paymentAbnormal"]])

    def test_one_abnormal_is_warn(self):
        h = P.compute_health(self._pm(progress={"里程碑进度状态": "严重延期"}), 0)
        assert h["progressAbnormal"] is True and h["overall"] == "关注"

    def test_progress_abnormal_overdue_unpublished(self):
        h = P.compute_health(self._pm(progress={"里程碑进度状态": "超期未发布"}), 0)
        assert h["progressAbnormal"] is True

    def test_empty_pm_degrades_to_healthy(self):
        h = P.compute_health({}, 0)
        assert h["overall"] == "健康"
        assert not any([h["progressAbnormal"], h["riskAbnormal"],
                        h["costAbnormal"], h["paymentAbnormal"]])

    def test_two_abnormal_is_risk(self):
        h = P.compute_health(self._pm(risk={"最高等级": "高", "未关闭风险数": 2}), 1)
        assert h["riskAbnormal"] and h["paymentAbnormal"] and h["overall"] == "风险"

    def test_cost_abnormal_by_ratio_or_overrun(self):
        assert P.compute_health(self._pm(cost={"超支": True, "消耗比": 0.2}), 0)["costAbnormal"]
        assert P.compute_health(self._pm(cost={"超支": None, "消耗比": 1.2}), 0)["costAbnormal"]
        assert not P.compute_health(self._pm(cost={"超支": None, "消耗比": None}), 0)["costAbnormal"]


def _pm_active(name, manager, l4="黑龙江服务组", **over):
    pm = {"matched": True, "source": "在建",
          "team": {"项目名称": name, "项目经理": manager, "L4部门": l4},
          "progress": {"里程碑进度状态": "正常"},
          "risk": {"最高等级": None, "未关闭风险数": 0},
          "cost": {"超支": None, "消耗比": None}}
    pm.update(over)
    return pm


class TestBuildProjects:
    def test_filters_active_and_dept(self):
        ppm = {
            "SF-1": _pm_active("售前服务A", "佘海龙"),
            "SS-9": _pm_active("外部项目", "外部人"),       # 经理不在清单 → 排除
            "SS-8": {**_pm_active("已关闭项目", "佘海龙"), "source": "已关闭"},  # 非在建 → 排除
        }
        out = P.build_projects(ppm, {"佘海龙"}, {"黑龙江服务组"}, [], [], [])
        assert [p["projectId"] for p in out] == ["SF-1"]

    def test_org_missing_degrades_to_all_active(self):
        ppm = {"SS-1": _pm_active("某项目", "任意人")}
        out = P.build_projects(ppm, set(), set(), [], [], [])
        assert len(out) == 1  # 空人员清单=不过滤(spec 3.4 降级)

    def test_presale_mapping_and_payment(self):
        ppm = {"SF-1": _pm_active("售前服务A", "佘海龙")}
        mapping = [{"current": "SF-1", "owner": "于江", "closed": "SS-99"}]
        nodes = [{"projectId": "SF-1", "isPaymentRelated": True, "expectedPayment": 10.0,
                  "actualPayment": 0.0, "nodeStatus": config.STATUS_DELAYED}]
        delivery = [{"项目编号": "SF-1", "项目名称": "售前服务A", "差旅费_预算金额": 100}]
        out = P.build_projects(ppm, {"佘海龙"}, {"黑龙江服务组"}, mapping, delivery, nodes)
        p = out[0]
        assert p["isPresale"] is True
        assert p["relatedClosedId"] == "SS-99"
        assert p["payment"]["delayedCount"] == 1
        assert p["health"]["paymentAbnormal"] is True
        assert next(i for i in p["deliveryCosts"] if i["类别"] == "差旅费")["预算金额"] == 100.0

    def test_name_falls_back_to_nodes(self):
        ppm = {"SS-1": _pm_active(None, "佘海龙")}
        nodes = [{"projectId": "SS-1", "projectName": "节点名",
                  "isPaymentRelated": True, "expectedPayment": 1, "actualPayment": 0,
                  "nodeStatus": ""}]
        out = P.build_projects(ppm, {"佘海龙"}, set(), [], [], nodes)
        assert out[0]["projectName"] == "节点名"

    def test_unmatched_pm_health_no_data(self):
        ppm = {"SS-1": {**_pm_active("某项目", "佘海龙"), "matched": False}}
        out = P.build_projects(ppm, {"佘海龙"}, set(), [], [], [])
        assert out[0]["health"]["overall"] == "无数据"
        assert out[0]["health"]["paymentAbnormal"] is False


class TestProjectsQuality:
    def test_quality_counts_and_alerts(self):
        ppm = {
            "SF-1": _pm_active("售前服务A", "佘海龙"),
            "SS-2": _pm_active("漏网项目", "王漏网", l4="黑龙江服务组"),  # L4 命中但经理不在清单 → 告警
        }
        projects = P.build_projects(ppm, {"佘海龙", "杨亮"}, {"黑龙江服务组"},
                                    [{"current": "SF-1", "owner": "x", "closed": "SS-99"}],
                                    [{"项目编号": "SF-1"}], [])
        q = P.compute_projects_quality(projects, ppm, {"佘海龙", "杨亮"}, {"黑龙江服务组"}, 2,
                                       [{"current": "SF-1", "owner": "x", "closed": "SS-99"}],
                                       [{"项目编号": "SF-1"}, {"项目编号": "SS-外部"}])
        assert q["deptProjectCount"] == 1
        assert q["staffNoProject"] == [{"name": "杨亮"}]
        assert q["managerNotInOrg"] == [{"projectId": "SS-2", "projectName": "漏网项目",
                                         "manager": "王漏网"}]
        assert q["presaleTotal"] == 1 and q["presaleMapped"] == 1 and q["presaleUnmapped"] == []
        assert q["mappingFile"] == {"provided": True, "rows": 1, "matched": 1, "matchRate": 1.0}
        assert q["deliveryFile"]["matched"] == 1 and q["deliveryFile"]["rows"] == 2


class TestReadOrgNamesEnhanced:
    def test_whitespace_name_skipped_and_other_dept_filtered(self, tmp_path):
        path = _make_xlsx(tmp_path, "组织架构.xlsx", [
            ("Sheet1", [
                ("工号", "姓名", "新L3组织", "新L4组织"),
                ("A1", "佘海龙", "交付实施三部", "黑龙江服务组"),
                ("A2", " ", "交付实施三部", "黑龙江服务组"),      # 空白姓名跳过
                ("A3", "外部门人", "交付实施一部", "别的组"),      # 非三部行过滤
            ]),
        ])
        names, l4s, rows = P.read_org_names(path)
        assert names == {"佘海龙"}
        assert l4s == {"黑龙江服务组"}
        assert rows == 2  # 三部行数(含空白姓名行)

    def test_no_l3_column_no_filter(self, tmp_path):
        path = _make_xlsx(tmp_path, "组织架构.xlsx", [
            ("Sheet1", [("工号", "姓名", "新L4组织"), ("A1", "某人", "某组")]),
        ])
        names, _, rows = P.read_org_names(path)
        assert names == {"某人"} and rows == 1


class TestReadDegradation:
    def test_header_not_found_in_any_sheet(self, tmp_path):
        path = _make_xlsx(tmp_path, "x.xlsx", [("Sheet1", [("无关", "列"), ("a", 1)])])
        assert P.read_delivery(path) == []

    def test_corrupt_file_degrades(self, tmp_path):
        bad = tmp_path / "坏.xlsx"
        bad.write_bytes(b"not an xlsx at all")
        assert P.read_delivery(str(bad)) == []
        names, l4s, rows = P.read_org_names(str(bad))
        assert names == set() and rows == 0
