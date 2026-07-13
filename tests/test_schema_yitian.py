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
        },
        "roster": [{"id": "A1", "name": "张三", "l2": "交付中心", "l3": "交付实施三部",
                    "l31": "服务二部", "l4": "银行服务组", "category": "正式员工"}],
        "days": [{"d": "2026-06-01", "workday": True, "isoWeek": "2026-W23", "calcWeek": "2026-CW23"}],
        "dims": {"types": ["项目类"], "workTypes": [], "customers": [], "products": [],
                 "productNames": [], "projectTypes": [], "salesL2": [], "serviceModes": []},
        "entries": [{"d": "2026-06-01", "e": "A1", "t": 0, "h": 8.0, "wt": None, "cu": None,
                     "pl": None, "pn": None, "pt": None, "sm": None, "bg": None,
                     "wo": "", "top": False, "ok": 0, "iss": []}],
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
