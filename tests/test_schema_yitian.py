# -*- coding: utf-8 -*-
"""YitianData 契约校验 + 落盘。"""
import json
import os

import pytest
from pydantic import ValidationError

import schema


def _minimal():
    return {
        "meta": {
            "periodStart": "2026-06-01", "periodEnd": "2026-06-01",
            "generatedAt": "2026-07-12 10:00", "rows": 1, "employees": 1,
            "droppedRows": 0, "calendarSource": "csv", "hoursPerDay": 8,
            "thisBgL2": ["交付中心"],
            "storeRows": 1, "storeStart": "2026-06-01", "storeEnd": "2026-06-01",
            # V4.5.4 就绪度指标(必填,本期护栏的载体)
            "dataReadiness": {
                "top1000": {"provided": True, "rows": 139, "matchedCustomers": 97,
                            "hasQuad": True, "hasBg": True},
                "productCategory": {"provided": True, "rows": 108,
                                    "coveredLines": 81, "totalLines": 81},
                "calibration": {"pending": 1439, "calibrated": 307,
                                "ambiguous": 931, "unmatched": 201},
                "unattributed": {"rows": 478, "hours": 2810.0},
                "roster": {"hasSupColumn": True, "managers": 14},
            },
        },
        "roster": [{"id": "A1", "name": "张三", "l2": "交付中心", "l3": "交付实施三部",
                    "l31": "服务二部", "l4": "银行服务组", "category": "正式员工",
                    "isMgr": False}],
        "days": [{"d": "2026-06-01", "workday": True, "isoWeek": "2026-W23", "calcWeek": "2026-CW23"}],
        "dims": {"types": ["项目类"], "workTypes": [], "customers": [], "products": [],
                 "productNames": [], "projectTypes": [], "salesL2": [], "serviceModes": [],
                 "custQuads": [], "custBgs": [], "prodCats": []},
        "entries": [{"d": "2026-06-01", "e": "A1", "t": 0, "h": 8.0, "wt": None, "cu": None,
                     "pl": None, "pn": None, "pt": None, "sm": None, "bg": None,
                     "wo": "", "top": False, "ok": 0, "iss": [], "ct": "",
                     "cq": None, "cbg": None, "el": None, "ls": 0, "ec": None,
                     "ch": False, "pm": False, "tr": 0}],
        "issues": [],
    }


class TestYitianSchema:
    def test_valid_minimal(self):
        schema.YitianData.model_validate(_minimal())

    def test_missing_meta_rejected(self):
        bad = _minimal()
        del bad["meta"]
        with pytest.raises(ValidationError):
            schema.YitianData.model_validate(bad)

    def test_entry_hours_must_be_number(self):
        bad = _minimal()
        bad["entries"][0]["h"] = "八小时"
        with pytest.raises(ValidationError):
            schema.YitianData.model_validate(bad)

    def test_write_json(self, tmp_path):
        out = schema.validate_and_write_yitian_json(_minimal(), str(tmp_path))
        assert os.path.basename(out) == "yitian_data.json"
        with open(out, encoding="utf-8") as f:
            back = json.load(f)
        assert back["meta"]["rows"] == 1

    def test_dump_schema(self, tmp_path):
        p = str(tmp_path / "yitian_schema.json")
        schema.dump_yitian_schema(p)
        with open(p, encoding="utf-8") as f:
            sch = json.load(f)
        assert "properties" in sch and "entries" in sch["properties"]


# ── V4.5.4 契约扩展:8 entry 字段 + 3 码表 + isMgr + dataReadiness ──

@pytest.fixture
def minimal_yitian():
    """复用本文件既有的 _minimal(),不另起第二份测试数据源(避免两份 fixture 漂移)。"""
    return _minimal()


def test_entry新增八字段与dims三码表(minimal_yitian):
    d = minimal_yitian
    e = d["entries"][0]
    for k in ("cq", "cbg", "el", "ls", "ec", "ch", "pm", "tr"):
        assert k in e, k
        # _Base 是 extra="allow",光靠 model_validate 通过证明不了契约真声明了这些字段,
        # 必须查 model_fields —— 否则本条测试是恒绿的。
        assert k in schema.YitianEntry.model_fields, k
    for k in ("custQuads", "custBgs", "prodCats"):
        assert k in d["dims"], k
        assert k in schema.YitianDims.model_fields, k
    assert "isMgr" in d["roster"][0]
    assert "isMgr" in schema.YitianRosterItem.model_fields
    assert "dataReadiness" in d["meta"]
    assert "dataReadiness" in schema.YitianMeta.model_fields
    schema.YitianData.model_validate(d)      # 不抛异常即通过


def test_缺dataReadiness必须报错(minimal_yitian):
    """就绪度是本期护栏的载体,缺它等于护栏没接上,必须硬失败而非静默默认。"""
    d = dict(minimal_yitian)
    d["meta"] = {k: v for k, v in d["meta"].items() if k != "dataReadiness"}
    with pytest.raises(ValidationError):
        schema.YitianData.model_validate(d)


def test_dataReadiness子结构缺段必须报错(minimal_yitian):
    """dataReadiness 若被声明成裸 dict,护栏就只是个占位符;子段缺失必须同样硬失败。"""
    d = dict(minimal_yitian)
    d["meta"]["dataReadiness"] = {k: v for k, v in d["meta"]["dataReadiness"].items()
                                  if k != "roster"}
    with pytest.raises(ValidationError):
        schema.YitianData.model_validate(d)
