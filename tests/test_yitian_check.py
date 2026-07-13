# -*- coding: utf-8 -*-
"""yitian_check.py 合规判定纯函数单测。"""
import yitian_check as K


def _row(**kw):
    base = {
        "work_type": "项目类", "content": "", "date": "2026-06-01",
        "service_mode": "远程", "customer": "某客户", "product_line": "",
        "product_name": "", "project_type": "交付实施", "work_type3": "安装部署",
        "work_order": "",
    }
    base.update(kw)
    return base


# 一份四段俱全的合格正文(避免各用例被必填项干扰)
GOOD = "工作概述:巡检。工作进展:已完成部署。下一步工作计划:回访。"


class TestCorrection:
    def test_presale_service_becomes_project_type(self):
        assert K.corrected_work_type("售前服务类", "售前类") == "项目类"

    def test_other_types_untouched(self):
        assert K.corrected_work_type("交付实施", "售后类") == "售后类"


class TestIsChecked:
    def test_project_with_hours(self):
        assert K.is_checked("项目类", 6) is True

    def test_management_counts_in_denominator(self):
        assert K.is_checked("管理类", 8) is True

    def test_business_and_holiday_excluded(self):
        assert K.is_checked("业务类", 8) is False
        assert K.is_checked("假期类", 8) is False

    def test_zero_hours_excluded(self):
        assert K.is_checked("项目类", 0) is False


class TestRequiredFields:
    def test_all_missing(self):
        codes, msgs = K.check_row(_row(content="今天干了点活"))
        assert "MISS_SUMMARY" in codes and "MISS_PROGRESS" in codes and "MISS_NEXT" in codes
        assert len(msgs) == len(codes)

    def test_all_present(self):
        codes, _ = K.check_row(_row(content=GOOD))
        assert codes == []

    def test_management_type_skips_all_checks(self):
        codes, _ = K.check_row(_row(work_type="管理类", content="开会", service_mode="", customer=""))
        assert codes == []


class TestServiceMode:
    def test_empty_column_after_effective_date_is_issue(self):
        codes, _ = K.check_row(_row(content=GOOD, service_mode="", date="2026-06-01"))
        assert "MISS_SERVICE_MODE" in codes

    def test_empty_column_before_effective_date_exempt(self):
        codes, _ = K.check_row(_row(content=GOOD, service_mode="", date="2026-04-17"))
        assert "MISS_SERVICE_MODE" not in codes

    def test_filled_column_ok_even_if_text_lacks_the_word(self):
        # 关键:正文里没有"服务方式"四个字,但列填了 → 合规(这是本次口径修正)
        codes, _ = K.check_row(_row(content=GOOD, service_mode="客户现场", date="2026-06-01"))
        assert "MISS_SERVICE_MODE" not in codes


class TestTypeMismatch:
    def test_presale_with_acceptance_word(self):
        codes, msgs = K.check_row(_row(work_type="售前类", content=GOOD + "完成项目验收"))
        assert "TYPE_MISMATCH" in codes
        assert "项目类" in msgs[-1]

    def test_project_type_not_ruled(self):
        codes, _ = K.check_row(_row(work_type="项目类", content=GOOD + "完成项目验收"))
        assert "TYPE_MISMATCH" not in codes


class TestCustomer:
    def test_empty_customer_but_text_mentions(self):
        codes, _ = K.check_row(_row(content=GOOD + "与客户沟通", customer=""))
        assert "MISS_CUSTOMER" in codes

    def test_empty_customer_and_no_mention(self):
        codes, _ = K.check_row(_row(content=GOOD, customer=""))
        assert "MISS_CUSTOMER" not in codes


class TestProductCategory:
    def test_own_keyword_hit_is_ok(self):
        codes, _ = K.check_row(_row(content=GOOD + "处理SOAR告警", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_other_product_keyword_only_is_mismatch(self):
        codes, msgs = K.check_row(_row(content=GOOD + "更换防火墙策略", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" in codes
        assert "NGSOC" in msgs[-1]

    def test_no_keyword_at_all_is_undecidable(self):
        codes, _ = K.check_row(_row(content=GOOD, product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_same_workorder_peer_content_rescues(self):
        codes, _ = K.check_row(
            _row(content=GOOD + "更换防火墙策略", product_line="NGSOC", work_order="WO1"),
            peer="另一条工时里写了SOAR告警处理",
        )
        assert "PRODUCT_MISMATCH" not in codes

    def test_level2_product_name_overrides(self):
        codes, _ = K.check_row(_row(
            content=GOOD + "完成流量编排配置,顺带看了防火墙",
            product_line="NGSOC",
            product_name="奇安信网神SSL编排控制网关系统V6.0",
        ))
        assert "PRODUCT_MISMATCH" not in codes

    def test_level2_miss_keeps_level1_error(self):
        codes, _ = K.check_row(_row(
            content=GOOD + "更换防火墙策略",
            product_line="NGSOC",
            product_name="奇安信网神SSL编排控制网关系统V6.0",
        ))
        assert "PRODUCT_MISMATCH" in codes

    def test_project_management_text_skips_check(self):
        codes, _ = K.check_row(_row(content=GOOD + "项目管理:更换防火墙策略", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_tianqing_special_case(self):
        # 天擎产品线,正文含"天擎"即命中本产品词 → 合格(即使同时出现天眼等他家词)
        codes, _ = K.check_row(_row(
            content=GOOD + "天擎升级,顺带查了天眼告警", product_line="一体化终端管理（天擎）"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_exclusive_words_dont_trigger_others(self):
        # "组件"是云安全专属词,出现在 NGSOC 的正文里不算"含他家产品词"
        codes, _ = K.check_row(_row(content=GOOD + "更新了组件", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_case_insensitive(self):
        codes, _ = K.check_row(_row(content=GOOD + "处理soar告警", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_unknown_product_line_skipped(self):
        codes, _ = K.check_row(_row(content=GOOD + "更换防火墙", product_line="不在表里的产品线"))
        assert "PRODUCT_MISMATCH" not in codes


class TestPresaleHint:
    def test_hint_when_product_line_is_other(self):
        codes, _ = K.check_row(_row(
            work_type="项目类", content=GOOD, project_type="售前服务类",
            work_type3="环境调研", product_line="其他"))
        assert codes == ["HINT_PRESALE_PRODUCT"]

    def test_no_hint_for_skip_worktypes(self):
        codes, _ = K.check_row(_row(
            work_type="项目类", content=GOOD, project_type="售前服务类",
            work_type3="项目管理", product_line="其他"))
        assert "HINT_PRESALE_PRODUCT" not in codes


class TestPeerContents:
    def test_groups_by_workorder(self):
        rows = [
            {"work_order": "WO1", "content": "甲"},
            {"work_order": "WO1", "content": "乙"},
            {"work_order": "WO2", "content": "丙"},
            {"work_order": "", "content": "无工单"},
        ]
        peers = K.peer_contents(rows)
        assert "甲" in peers["WO1"] and "乙" in peers["WO1"]
        assert "" not in peers


class TestOkOf:
    def test_clean(self):
        assert K.ok_of([]) == 0

    def test_hint_only(self):
        assert K.ok_of(["HINT_PRESALE_PRODUCT"]) == 1

    def test_issue_wins(self):
        assert K.ok_of(["HINT_PRESALE_PRODUCT", "MISS_SUMMARY"]) == 2
