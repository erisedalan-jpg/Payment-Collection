# tests/test_schema.py
import pytest
from pydantic import ValidationError
import schema


def _minimal_valid():
    return {
        "meta": {"lastUpdate": "2026-06-03 10:00", "totalProjects": 1, "totalPaymentNodes": 1},
        "dashboard": {
            "totalProjectCount": 1, "totalPaymentNodes": 1, "totalPaidNodes": 0,
        },
        "summary": {"100万以上": {"projectCount": 1}},
        "rawNodes": [
            {"projectId": "P1", "projectName": "测试", "tier": "100万以上",
             "isPaymentRelated": True, "nodeStatus": "延期"}
        ],
        "projectOverview": {"projects": [], "columns": []},
        "naguanMap": {}, "naguanExclude": {},
        "displayColumns": {}, "followupRecords": {},
    }


def test_valid_data_parses():
    obj = schema.AnalysisData.model_validate(_minimal_valid())
    assert obj.meta.totalProjects == 1
    assert obj.rawNodes[0].projectId == "P1"


def test_missing_top_level_key_fails():
    bad = _minimal_valid()
    del bad["dashboard"]
    with pytest.raises(ValidationError):
        schema.AnalysisData.model_validate(bad)


def test_wrong_type_on_core_field_fails():
    bad = _minimal_valid()
    bad["rawNodes"][0]["isPaymentRelated"] = "not-a-bool-like"
    with pytest.raises(ValidationError):
        schema.AnalysisData.model_validate(bad)


def test_extra_node_fields_allowed():
    data = _minimal_valid()
    data["rawNodes"][0]["someFutureField"] = "x"
    obj = schema.AnalysisData.model_validate(data)
    assert obj.rawNodes[0].projectId == "P1"


def _minimal_analysis():
    return {
        "meta": {"lastUpdate": "2026-06-09 10:00", "totalProjects": 1, "totalPaymentNodes": 1},
        "dashboard": {"totalProjectCount": 1, "totalPaymentNodes": 1, "totalPaidNodes": 0},
        "summary": {}, "rawNodes": [],
        "projectOverview": {"projects": [], "columns": []},
    }


class TestPmisSchema:
    def test_backward_compatible_without_pmis(self):
        schema.AnalysisData.model_validate(_minimal_analysis())

    def test_with_pmis_and_quality(self):
        d = _minimal_analysis()
        d["projectPmis"] = {"SS-1": {"matched": True, "source": "在建",
                                     "cost": {"消耗比": 0.5}, "progress": {}, "risk": {},
                                     "status": {}, "customer": {}}}
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


class TestProjectsContract:
    def test_minimal_project_validates(self):
        import schema as S
        proj = {
            "projectId": "SF-1", "projectName": "售前服务A", "projectManager": "佘海龙",
            "orgL4": "黑龙江服务组", "isPresale": True, "relatedClosedId": "SS-99",
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
        "dashboard": {"totalProjectCount": 1, "totalPaymentNodes": 1, "totalPaidNodes": 0},
        "summary": {}, "rawNodes": [],
        "projectOverview": {"projects": [], "columns": []},
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
