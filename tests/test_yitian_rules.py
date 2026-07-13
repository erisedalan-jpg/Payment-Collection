# -*- coding: utf-8 -*-
"""yitian_rules.py 规则常量的结构性校验:防迁移过程中漏表/错型/码不齐。"""
import re

import yitian_rules as R


class TestTypes:
    def test_checked_types(self):
        assert R.CHECKED_TYPES == ("项目类", "售前类", "售后类")

    def test_mgmt_type(self):
        assert R.MGMT_TYPE == "管理类"

    def test_excluded_types_not_defined_here(self):
        # M-1:「剔除哪些类型」是超管可配项(yitian_settings.DEFAULT_EXCLUDED_TYPES),
        # 不在 yitian_rules 里重复定义——曾经的 R.EXCLUDED_TYPES(2 项)与
        # yitian_settings.DEFAULT_EXCLUDED_TYPES(3 项)同名不同义,是个维护陷阱,已删除。
        assert not hasattr(R, "EXCLUDED_TYPES")


class TestRequiredPatterns:
    def test_summary_synonyms(self):
        for w in ["工作概述", "工作概况", "工作总结", "工作汇报", "工作总述", "工作述职"]:
            assert re.search(R.SUMMARY_RE, w), w

    def test_progress_includes_typo_and_yongshi(self):
        for w in ["工作进展", "工资进展", "已完成工作", "用时"]:
            assert re.search(R.PROGRESS_RE, w), w

    def test_next_synonyms(self):
        for w in ["下一步工作计划", "后续计划", "明日计划", "下期计划"]:
            assert re.search(R.NEXT_RE, w), w


class TestServiceMode:
    def test_effective_date_is_constant_string(self):
        assert R.SERVICE_MODE_EFFECTIVE_DATE == "2026-05-09"


class TestTypeMismatch:
    def test_presale_forbids_acceptance(self):
        pairs = dict(R.TYPE_MISMATCH_RULES["售前类"])
        assert pairs["项目验收"] == "项目类"
        assert pairs["投标书"] == "业务类"

    def test_aftersale_forbids_demo(self):
        pairs = dict(R.TYPE_MISMATCH_RULES["售后类"])
        assert pairs["方案演示"] == "售前类"
        assert pairs["安装部署"] == "项目类"

    def test_only_two_types_ruled(self):
        assert set(R.TYPE_MISMATCH_RULES) == {"售前类", "售后类"}


class TestProductTables:
    def test_line_table_has_21_entries(self):
        assert len(R.PRODUCT_LINE_KEYWORDS) == 21

    def test_ngsoc_keywords(self):
        pats, kws = R.PRODUCT_LINE_KEYWORDS[0]
        assert pats == ["NGSOC"]
        assert "SOAR" in kws and "探针" in kws

    def test_cloud_platform_has_exclusive_words(self):
        for pats, kws in R.PRODUCT_LINE_KEYWORDS:
            if "云安全管理平台" in pats:
                assert "组件" in kws and "租户" in kws
                break
        else:
            raise AssertionError("缺少云安全管理平台条目")

    def test_exclusive_kws(self):
        assert R.EXCLUSIVE_KWS == {"组件", "租户"}

    def test_name_table_level2(self):
        pats, kws = R.PRODUCT_NAME_KEYWORDS[0]
        assert "奇安信网神SSL编排控制网关系统V6.0" in pats
        assert "SSLO" in kws


class TestPresaleHint:
    def test_skip_worktypes(self):
        assert R.PRESALE_SKIP_WORKTYPES == {"文档编写与汇报", "项目管理", "项目验收"}

    def test_project_type_key(self):
        assert R.PRESALE_PROJECT_TYPE_KEY == "售前服务"


class TestBg:
    def test_this_bg_orgs(self):
        assert "交付中心" in R.THIS_BG_L2_ORGS
        assert len(R.THIS_BG_L2_ORGS) == 6


class TestIssueLabels:
    def test_all_eight_codes_labeled(self):
        assert set(R.ISSUE_LABELS) == {
            "MISS_SUMMARY", "MISS_PROGRESS", "MISS_NEXT", "MISS_SERVICE_MODE",
            "TYPE_MISMATCH", "PRODUCT_MISMATCH", "MISS_CUSTOMER", "HINT_PRESALE_PRODUCT",
        }

    def test_hint_code_prefix(self):
        # 提示码必须以 HINT_ 开头——yitian_check.ok 三态判定依赖这个前缀
        assert [c for c in R.ISSUE_LABELS if c.startswith("HINT_")] == ["HINT_PRESALE_PRODUCT"]
