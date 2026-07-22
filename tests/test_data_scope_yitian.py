# -*- coding: utf-8 -*-
"""scope_yitian_data:按 allowedL4 裁数据 + issues 下标重映射。"""
import data_scope as DS


def _data():
    return {
        "meta": {"rows": 3, "employees": 2, "periodStart": "2026-06-01"},
        "roster": [
            {"id": "A1", "name": "张三", "l4": "银行服务组"},
            {"id": "B1", "name": "李四", "l4": "浙江服务组"},
        ],
        "days": [{"d": "2026-06-01", "workday": True, "isoWeek": "2026-W23", "calcWeek": "2026-CW23"}],
        "dims": {"types": ["项目类"]},
        "entries": [
            {"d": "2026-06-01", "e": "B1", "h": 8, "ok": 2, "iss": ["MISS_SUMMARY"]},   # 0 越权
            {"d": "2026-06-01", "e": "A1", "h": 6, "ok": 0, "iss": []},                  # 1 可见
            {"d": "2026-06-01", "e": "A1", "h": 2, "ok": 2, "iss": ["MISS_NEXT"]},       # 2 可见
        ],
        "issues": [
            {"i": 0, "codes": ["MISS_SUMMARY"], "msgs": ["缺少工作概述"], "snippet": "李四的正文"},
            {"i": 2, "codes": ["MISS_NEXT"], "msgs": ["缺少下一步工作计划"], "snippet": "张三的正文"},
        ],
    }


class TestScopeYitian:
    def test_star_returns_as_is(self):
        d = _data()
        assert DS.scope_yitian_data(d, ["*"]) is d

    def test_filters_roster_entries_issues(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"])
        assert [p["id"] for p in out["roster"]] == ["A1"]
        assert [e["e"] for e in out["entries"]] == ["A1", "A1"]
        assert len(out["issues"]) == 1
        assert out["issues"][0]["snippet"] == "张三的正文"

    def test_issue_index_remapped(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"])
        # 原 entries[2] 被裁成 entries[1];issues[].i 必须跟着改,否则指错行
        assert out["issues"][0]["i"] == 1
        assert out["entries"][out["issues"][0]["i"]]["iss"] == ["MISS_NEXT"]

    def test_other_l4_content_not_leaked(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"])
        blob = repr(out)
        assert "李四" not in blob and "李四的正文" not in blob

    def test_meta_recounted(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"])
        assert out["meta"]["rows"] == 2
        assert out["meta"]["employees"] == 1

    def test_input_not_mutated(self):
        d = _data()
        DS.scope_yitian_data(d, ["银行服务组"])
        assert len(d["entries"]) == 3 and d["issues"][0]["i"] == 0

    def test_empty_allow_yields_nothing(self):
        out = DS.scope_yitian_data(_data(), [])
        assert out["roster"] == [] and out["entries"] == [] and out["issues"] == []

    def test_staff_union_adds_employee(self):
        # allowedL4=[] 但按工号 B1 命中李四(浙江服务组)
        out = DS.scope_yitian_data(_data(), [], allowed_staff={"B1"})
        assert [p["id"] for p in out["roster"]] == ["B1"]
        assert [e["e"] for e in out["entries"]] == ["B1"]
        assert len(out["issues"]) == 1
        assert out["issues"][0]["i"] == 0
        assert out["issues"][0]["snippet"] == "李四的正文"

    def test_l4_and_staff_union(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"], allowed_staff={"B1"})
        assert {p["id"] for p in out["roster"]} == {"A1", "B1"}
        assert len(out["entries"]) == 3

    def test_staff_none_backcompat(self):
        assert DS.scope_yitian_data(_data(), ["银行服务组"]) == \
               DS.scope_yitian_data(_data(), ["银行服务组"], allowed_staff=None)

    def test_offroster_staff_yields_nothing(self):
        out = DS.scope_yitian_data(_data(), [], allowed_staff={"ZZZ"})   # 离册工号
        assert out["roster"] == [] and out["entries"] == []
