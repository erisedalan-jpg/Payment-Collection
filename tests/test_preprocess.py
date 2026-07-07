# -*- coding: utf-8 -*-
"""
preprocess_data.py 纯函数单元测试（harness 验证层）。

只覆盖当前 main() 管线仍在用的函数。yundocs 退役后的历史解析函数
（parse_amount/parse_ratio/parse_ratio_raw/excel_serial_to_date/_clean_text/
is_yes/get_month/is_past/is_future/_format_completion_display/_get_ratio_num/
_parse_completion_pct/parse_header_and_data/assign_tier/compute_node_status）
已确认无活引用，随函数体一并删除（V2.6.8 批2 Task11）。
"""
import preprocess_data as P


# _overview_or_empty / process_project_overview 已在 Task 3 删除；TestOverviewOrEmpty 随之移除。


class TestCollectionNodesFor:
    STAGES = {'P-SELF': [{'expectedPayment': 100}], 'P-ORIG': [{'expectedPayment': 200}]}

    def test_self_first(self):
        assert P._collection_nodes_for('P-SELF', 'P-ORIG', self.STAGES) == [{'expectedPayment': 100}]

    def test_fallback_to_origin_when_self_missing(self):
        assert P._collection_nodes_for('P-NONE', 'P-ORIG', self.STAGES) == [{'expectedPayment': 200}]

    def test_empty_when_both_missing(self):
        assert P._collection_nodes_for('P-NONE', 'P-NIL', self.STAGES) == []

    def test_empty_when_no_rid(self):
        assert P._collection_nodes_for('P-NONE', '', self.STAGES) == []


def test_backfill_final_acceptance():
    import preprocess_data as P
    project_pmis = {
        "A": {"status": {"项目类型": "实施项目"}, "progress": {"项目阶段": "执行"}},
        "B": {"status": {"项目类型": "售前服务类"}, "progress": {}},
        "C": {"status": {"项目类型": "实施项目"}},  # 无 progress 键
    }
    project_milestones = {
        "A": [{"name": "终验", "planDate": "2026-07-01"}],
        "B": [{"name": "服务完成", "planDate": "2026-08-01"}],
    }
    P.backfill_final_acceptance(project_pmis, project_milestones)
    assert project_pmis["A"]["progress"]["终验时间"] == "2026-07-01"
    assert project_pmis["B"]["progress"]["终验时间"] == "2026-08-01"
    assert project_pmis["C"]["progress"]["终验时间"] is None  # 无里程碑 + 自动建 progress 键


def test_derive_sign_unit_tag_seed():
    from preprocess_data import derive_sign_unit_tag_seed
    rows = [
        {"projectId": "A", "signUnit": "上海伟仕佳杰科技有限公司"},
        {"projectId": "B", "signUnit": "别家公司"},
        {"projectId": "C", "signUnit": ""},
        {"projectId": "D"},  # 无 signUnit 键
        {"projectId": "E", "signUnit": " 上海伟仕佳杰科技有限公司 "},  # 前后空格 trim 后命中
    ]
    seed = derive_sign_unit_tag_seed(rows)
    assert seed == {"A": ["佳杰"], "E": ["佳杰"]}
