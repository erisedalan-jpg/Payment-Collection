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
