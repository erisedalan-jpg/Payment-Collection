# tests/test_schema.py
import pytest
from pydantic import ValidationError
import schema


def _minimal_valid():
    return {
        "meta": {"lastUpdate": "2026-06-03 10:00", "totalProjects": 1, "totalPaymentNodes": 1},
        "followupRecords": {},
    }


def test_valid_data_parses():
    obj = schema.AnalysisData.model_validate(_minimal_valid())
    assert obj.meta.totalProjects == 1
    assert obj.meta.totalPaymentNodes == 1


def test_missing_top_level_key_fails():
    bad = _minimal_valid()
    del bad["meta"]
    with pytest.raises(ValidationError):
        schema.AnalysisData.model_validate(bad)


def test_wrong_type_on_core_field_fails():
    bad = _minimal_valid()
    bad["meta"]["totalProjects"] = "not-an-int"
    with pytest.raises(ValidationError):
        schema.AnalysisData.model_validate(bad)


def _minimal_analysis():
    return {
        "meta": {"lastUpdate": "2026-06-09 10:00", "totalProjects": 1, "totalPaymentNodes": 1},
    }


class TestPmisSchema:
    def test_backward_compatible_without_pmis(self):
        schema.AnalysisData.model_validate(_minimal_analysis())

    def test_with_pmis_and_quality(self):
        d = _minimal_analysis()
        d["projectPmis"] = {"SS-1": {"matched": True, "source": "在建",
                                     "cost": {"消耗比": 0.5, "项目超支": True, "交付超支": False},
                                     "progress": {"终验时间": "2026-07-01"},
                                     "risk": {},
                                     "status": {"关键动作": "已完成", "交付物": "3/3"},
                                     "customer": {"签约单位": "甲单位"},
                                     "team": {"L3部门": "三部", "L3_1部门": "三部一组", "AR": "a",
                                              "SR": "s", "CSR": "c", "CDR": "d", "Sponsor": "p"}}}
        d["dataQuality"] = {"summary": {"pmisProvided": True, "joinRate": 0.98,
                                        "matchedActive": 1, "matchedClosed": 0, "unmatched": 0,
                                        "lastPmisUpdate": "2026-06-09 10:00"},
                            "themes": [], "unmatched": [], "backfill": [],
                            "conflicts": [], "dirty": []}
        m = schema.AnalysisData.model_validate(d)
        assert m.dataQuality is not None
        assert "SS-1" in m.projectPmis
        # 字段值断言:更早捕获字段名/类型转换问题
        assert m.projectPmis["SS-1"].cost.消耗比 == 0.5
        assert m.dataQuality.summary.joinRate == pytest.approx(0.98)
        assert m.dataQuality.summary.matchedActive == 1
        assert m.dataQuality.summary.lastPmisUpdate == "2026-06-09 10:00"
        assert m.projectPmis["SS-1"].cost.项目超支 is True
        assert m.projectPmis["SS-1"].progress.终验时间 == "2026-07-01"
        assert m.projectPmis["SS-1"].customer.签约单位 == "甲单位"
        assert m.projectPmis["SS-1"].team.L3_1部门 == "三部一组"
        assert m.projectPmis["SS-1"].status.关键动作 == "已完成"

    def test_schema_field_declarations(self):
        """用 model_fields 做正向+负向断言，防止字段声明被误回退。
        extra="allow" 会让属性访问绕过声明检查，但 model_fields 只含显式声明字段。"""
        # -- PmisTeam 全 10 键 --
        for key in ("项目名称", "项目经理", "L4部门", "L3部门", "L3_1部门",
                    "AR", "SR", "CSR", "CDR", "Sponsor"):
            assert key in schema.PmisTeam.model_fields, f"PmisTeam 缺少字段: {key}"

        # -- PmisCost 新字段 --
        assert "项目超支" in schema.PmisCost.model_fields
        assert "交付超支" in schema.PmisCost.model_fields

        # -- PmisProgress 新字段 --
        assert "终验时间" in schema.PmisProgress.model_fields

        # -- PmisStatus 新字段 --
        assert "关键动作" in schema.PmisStatus.model_fields
        assert "交付物" in schema.PmisStatus.model_fields

        # -- PmisCustomer 新字段 --
        assert "签约单位" in schema.PmisCustomer.model_fields
        assert "合同编号" in schema.PmisCustomer.model_fields

        # -- Project 新字段 --
        assert "orgL3_1" in schema.Project.model_fields
        assert "合同编号" in schema.Project.model_fields

        # -- Meta 新字段 --
        assert "totalClosed" in schema.Meta.model_fields

        # -- 负向：旧键必须已删除 --
        assert "超支" not in schema.PmisCost.model_fields, \
            "PmisCost 旧键 '超支' 未删除"
        assert "计划终验" not in schema.PmisProgress.model_fields, \
            "PmisProgress 旧键 '计划终验' 未删除"
        assert "签约形式" not in schema.PmisCustomer.model_fields, \
            "PmisCustomer 旧键 '签约形式' 未删除"
        assert "orgL3" not in schema.Project.model_fields, \
            "Project 旧键 'orgL3' 未删除"
        assert "paymentRatio" not in schema.ProjectPaymentPmis.model_fields, \
            "ProjectPaymentPmis 旧键 'paymentRatio' 未删除（本任务删除项）"


class TestProjectsContract:
    def test_minimal_project_validates(self):
        import schema as S
        proj = {
            "projectId": "SF-1", "projectName": "售前服务A", "projectManager": "佘海龙",
            "orgL4": "黑龙江服务组", "orgL3_1": "三部一组", "合同编号": "HT-1",
            "isPresale": True, "relatedClosedId": "SS-99",
            "payment": {"relatedNodeCount": 1, "expectedTotal": 10.0, "actualTotal": 0.0,
                        "remainingTotal": 10.0, "paymentRatio": 0.0, "delayedCount": 1},
            "deliveryCosts": [{"类别": "差旅费", "预算金额": 100.0, "实际发生": None,
                               "剩余预算": None, "消耗率": None}],
            "health": {"progressAbnormal": False, "riskAbnormal": False, "costAbnormal": False,
                       "paymentAbnormal": True, "overall": "关注"},
        }
        S.Project.model_validate(proj)

    def test_projects_quality_validates(self):
        import schema as S
        S.ProjectsQuality.model_validate({
            "deptProjectCount": 1,
            "orgFile": {"provided": True, "rows": 2, "matched": 1, "matchRate": 0.5},
            "mappingFile": {"provided": False, "rows": 0, "matched": 0, "matchRate": 0.0},
            "deliveryFile": {"provided": False, "rows": 0, "matched": 0, "matchRate": 0.0},
            "staffNoProject": [{"name": "杨亮"}],
            "managerNotInOrg": [], "presaleTotal": 1, "presaleMapped": 1, "presaleUnmapped": [],
        })


def _minimal_analysis_data():
    return {
        "meta": {"lastUpdate": "2026-06-11 10:00", "totalProjects": 1, "totalPaymentNodes": 1},
    }


class TestEventsContract:
    def test_analysis_data_accepts_events_and_period_compare(self):
        data = _minimal_analysis_data()
        data["events"] = [{
            "date": "2026-06-11", "type": "到账", "domain": "payment",
            "projectId": "P-1", "projectName": "甲", "summary": "初验款 到账 50.0万",
            "prev": 0, "curr": 500000.0, "amount": 500000.0,
        }]
        data["periodCompare"] = {
            "lastSync": {"baseDate": "2026-06-10", "advancedProjects": 1, "newDelayedNodes": 2,
                         "paymentGained": 500000.0, "riskNetChange": -1, "newOverspendProjects": 0,
                         "paymentRatioChange": 1.5},
            "lastWeek": None, "lastMonth": None,
        }
        m = schema.AnalysisData.model_validate(data)
        assert m.events[0].type == "到账"
        assert m.periodCompare.lastSync.paymentGained == 500000.0
        assert m.periodCompare.lastWeek is None

    def test_events_default_empty(self):
        m = schema.AnalysisData.model_validate(_minimal_analysis_data())
        assert m.events == [] and m.periodCompare is None


class TestR1DataSourcesContract:
    def test_milestones_payments_profit_round_trip(self):
        data = _minimal_analysis_data()
        data["projectMilestones"] = {
            "SS-1": [{"name": "终验", "planDate": "2026-07-01", "actualDate": "",
                      "payStage": "终验款，100.00%", "pct": 50.0, "priority": "high"}]
        }
        data["paymentRecords"] = {
            "SS-1": {"total": 3250.0, "count": 2, "lastDate": "2026-06-04",
                     "records": [{"type": "实际回款", "serial": "BANK-1", "payer": "某公司",
                                  "amount": 2250.0, "date": "2026-06-04", "claimer": "马春艳",
                                  "orderNo": "N-1", "currency": "CNY", "rate": 1.0, "note": ""}]}
        }
        data["projectProfit"] = {
            "SS-1": {"summary": {"预算收入": 1000.0, "实际成本": 200.0},
                     "rows": [{"code": "1", "name": "项目收入", "level": 1, "budget": 1000.0,
                               "estimate": 900.0, "final": 950.0, "actual": 0.0,
                               "remaining": 1000.0, "rate": 0.0}],
                     "bridge": {"ssId": "SS-9",
                                "summary": {"实际成本": 250.0},
                                "rows": [{"code": "1", "name": "项目收入", "level": 1}]}}
        }
        m = schema.AnalysisData.model_validate(data)
        assert m.projectMilestones["SS-1"][0].priority == "high"
        assert m.projectMilestones["SS-1"][0].pct == 50.0
        assert m.paymentRecords["SS-1"].total == 3250.0
        assert m.paymentRecords["SS-1"].records[0].currency == "CNY"
        assert m.projectProfit["SS-1"].rows[0].final == 950.0
        assert m.projectProfit["SS-1"].bridge.ssId == "SS-9"

    def test_r1_sources_default_empty(self):
        m = schema.AnalysisData.model_validate(_minimal_analysis_data())
        assert m.projectMilestones == {} and m.paymentRecords == {} and m.projectProfit == {}


def test_closed_projects_schema():
    import schema
    base = {"meta": {"lastUpdate": "2026-06-18 10:00", "totalProjects": 1, "totalClosed": 1, "totalPaymentNodes": 0},
            "closedProjects": [{
                "projectId": "C-1", "projectName": "甲", "projectManager": "张三",
                "orgL4": "安全A组", "orgL3_1": "三部一组", "合同编号": "HT-1",
                "team": {"L3_1部门": "三部一组", "AR": "AR张"},
                "customer": {"最终客户": "客A", "签约单位": "甲单位", "合同总额": 1000000.0, "行业": "金融"},
                "status": {"项目状态": "已验收", "项目级别": "B", "项目类型": "实施项目", "评级": "A"},
                "progress": {"完工进展": 1.0, "项目阶段": "项目收尾"},
                "cost": {"剩余预算": -200.0, "项目超支": True, "交付超支": True, "消耗比": 1.2},
                "closeInfo": {"关闭时间": "2025-08-15", "是否正常关闭": "是", "关闭说明": "正常结项", "计划终验时间": "2025-07-01"},
            }]}
    m = schema.AnalysisData.model_validate(base)
    cp = m.closedProjects[0]
    assert cp.projectId == "C-1" and cp.合同编号 == "HT-1"
    assert cp.team.L3_1部门 == "三部一组"
    assert cp.cost.项目超支 is True and cp.cost.交付超支 is True
    assert cp.closeInfo.关闭时间 == "2025-08-15" and cp.closeInfo.计划终验时间 == "2025-07-01"
    assert cp.status.项目状态 == "已验收"
    # 声明完整性(防字段被误删)
    assert "closedProjects" in schema.AnalysisData.model_fields
    assert {"关闭时间", "计划终验时间", "是否正常关闭", "关闭说明"} <= set(schema.ClosedProjectCloseInfo.model_fields)
    assert "closeInfo" in schema.ClosedProject.model_fields
    assert {"team", "customer", "status", "progress", "cost", "projectId", "合同编号"} <= set(schema.ClosedProject.model_fields)


def test_closed_projects_default_empty():
    import schema
    base = {"meta": {"lastUpdate": "x", "totalProjects": 0, "totalPaymentNodes": 0}}
    m = schema.AnalysisData.model_validate(base)
    assert m.closedProjects == []   # 默认空(不传不报错)


def test_project_has_sign_unit_field():
    import schema
    assert "signUnit" in schema.Project.model_fields
