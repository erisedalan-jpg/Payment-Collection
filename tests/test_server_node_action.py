# -*- coding: utf-8 -*-
import server as S


class TestNodeActionDateFromData:
    def test_finds_next_action_date(self):
        data = {"rawNodes": [
            {"projectId": "P-1", "nextActionDate": ""},
            {"projectId": "P-1", "nextActionDate": "2026-07-01"},
            {"projectId": "P-2", "nextActionDate": "2026-08-01"},
        ]}
        assert S.node_action_date_from_data(data, "P-1") == "2026-07-01"
    def test_missing_project_returns_empty(self):
        assert S.node_action_date_from_data({"rawNodes": []}, "P-9") == ""
    def test_bad_data_returns_empty(self):
        assert S.node_action_date_from_data({}, "P-1") == ""

    def test_integer_project_id_matches(self):
        # JSON 里 projectId 可能是整数,函数双向 str 化后应能匹配
        data = {"rawNodes": [{"projectId": 42, "nextActionDate": "2026-09-01"}]}
        assert S.node_action_date_from_data(data, "42") == "2026-09-01"
