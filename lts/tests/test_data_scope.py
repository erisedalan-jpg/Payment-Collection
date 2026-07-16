import json
import data_scope


def _fixture():
    return {
        "meta": {"lastUpdate": "2026-06-20", "totalProjects": 3, "totalClosed": 1, "totalPaymentNodes": 3},
        "projects": [
            {"projectId": "P1", "orgL4": "D1"},
            {"projectId": "P2", "orgL4": "D2"},
            {"projectId": "P3", "orgL4": "D1", "relatedClosedId": "C9"},
            {"projectId": "PX", "orgL4": ""},
        ],
        "closedProjects": [{"projectId": "C1", "orgL4": "D1"}, {"projectId": "C2", "orgL4": "D2"}],
        "projectPmis": {"P1": {}, "P2": {}, "P3": {}, "C9": {}},
        "paymentNodes": {"P1": [{}, {}], "P2": [{}], "C9": [{}]},
        "paymentRecords": {"P1": {}, "P2": {}},
        "followupRecords": {"P1": {}, "P2": {}},
        "tagSeed": {"P1": ["t"], "P2": ["t"]},
        "events": [{"projectId": "P1"}, {"projectId": "P2"}, {"projectId": "C9"}],
        "dataQuality": {"summary": {"matchRate": 0.9}},
        "periodCompare": {"lastSync": {}},
    }


def test_allowed_project_ids():
    f = _fixture()
    keep = data_scope.allowed_project_ids(f["projects"], ["D1"])
    assert keep == {"P1", "P3", "C9"}          # D1 项目 + relatedClosedId C9;D2/异常 PX 不入
    assert data_scope.allowed_project_ids(f["projects"], ["*"]) >= {"P1", "P2", "P3", "C9"}


def test_filter_star_passthrough():
    f = _fixture()
    out = data_scope.filter_analysis_data(f, ["*"])
    assert len(out["projects"]) == 4           # 不过滤


def test_filter_by_l4():
    f = _fixture()
    out = data_scope.filter_analysis_data(f, ["D1"])
    assert [p["projectId"] for p in out["projects"]] == ["P1", "P3"]   # 仅 D1(PX 异常排除)
    assert [c["projectId"] for c in out["closedProjects"]] == ["C1"]
    assert set(out["projectPmis"].keys()) == {"P1", "P3", "C9"}        # 含 relatedClosedId
    assert set(out["paymentNodes"].keys()) == {"P1", "C9"}            # P2(D2) 剔除
    assert set(out["paymentRecords"].keys()) == {"P1"}
    assert set(out["followupRecords"].keys()) == {"P1"}
    assert [e["projectId"] for e in out["events"]] == ["P1", "C9"]
    # meta 重算
    assert out["meta"]["totalProjects"] == 2
    assert out["meta"]["totalClosed"] == 1
    assert out["meta"]["totalPaymentNodes"] == 3                       # P1:2 + C9:1
    assert out["meta"]["lastUpdate"] == "2026-06-20"                   # 不变
    # 系统统计透传
    assert out["dataQuality"] == f["dataQuality"]
    assert out["periodCompare"] == f["periodCompare"]
    # tagSeed 按 projectId 裁切
    assert set(out["tagSeed"].keys()) == {"P1"}
    # 不改入参
    assert len(f["projects"]) == 4


def test_filter_not_mutate_input():
    f = _fixture()
    data_scope.filter_analysis_data(f, ["D1"])
    assert set(f["paymentNodes"].keys()) == {"P1", "P2", "C9"}


def test_no_foreign_projectid_leak():
    """深层结构守卫：D2 的 projectId P2 不得出现在 D1 用户收到的任何字段中。"""
    f = _fixture()
    out = data_scope.filter_analysis_data(f, ["D1"])
    blob = json.dumps(out, ensure_ascii=False)
    assert "P2" not in blob
