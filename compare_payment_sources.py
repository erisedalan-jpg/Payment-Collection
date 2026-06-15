"""回款数据比对报告(第一期诊断,一次性离线脚本)。
逐项目比对"人工云文档(交付中心 xlsx) vs PMIS 系统",产出数据源归属清单+逐项目偏差+汇总。
只读,不接入管线、不改看板。依据 docs/superpowers/specs/2026-06-15-payment-compare-report-design.md。
"""
import csv  # noqa: F401
import os  # noqa: F401
import re
from datetime import datetime

# —— 阈值/常量(可调) ——
THRESH_NODE_RATIO = 0.01      # 节点级计划比例逐阶段差
THRESH_RATIO_PP = 0.10        # 项目级回款百分比差(10pp)
THRESH_AMOUNT = 50000.0       # 回款金额差(元)
THRESH_AMOUNT_REL = 0.20      # 回款金额相对差
THRESH_DAYS = 30              # 里程碑日期差(天)

CLOUD_XLSX = "input/交付中心-全量项目清单-交付实施三部.xlsx"
SHEET_MASTER = "数据源表_全量项目清单 (2)"
SHEET_NODES = "项目回款节点（里程碑）清单"
PMIS_DIR = "input/pmis"
INPUT_DIR = "input"
OUT_DIR = "report"
# PMIS 里程碑"关联回款阶段"列(阶段名→列名)
PMIS_STAGE_COLS = {"到货": "到货关联回款阶段", "初验": "初验关联回款阶段",
                   "终验": "终验关联回款阶段", "驻场": "驻场关联回款阶段"}


def parse_pay_stage_ratio(cell):
    """'到货款1，70.00%' → 0.70;空/无% → None。"""
    if not cell:
        return None
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*%", str(cell))
    return round(float(m.group(1)) / 100, 4) if m else None


def parse_ratio(v):
    """手填回款比例 → 0-1 小数。兼容 0.6 / '60%' / '60' / '' / None / '空值'。>1.5 视作百分数。"""
    if v is None or v == "" or v == "空值":
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 4)
    s = str(v).strip().replace("%", "")
    if not s or s == "空值":
        return None
    try:
        n = float(s)
    except ValueError:
        return None
    return round(n / 100, 4) if n > 1.5 else round(n, 4)


def diff_flag(a, b, thresh):
    """|a-b| > thresh → True;任一 None → False(无法比,不算异常)。"""
    if a is None or b is None:
        return False
    return abs(a - b) > thresh


def node_actual_amount(project_amount, plan_ratio, actual_ratio):
    """节点实际回款金额 = 项目金额 × 关联回款比例 × 实际回款比例;任一 None → 0。"""
    return round((project_amount or 0) * (plan_ratio or 0) * (actual_ratio or 0), 2)


def days_between(d1, d2):
    """两个 'YYYY-MM-DD…' 字符串相差天数(绝对值);任一空/不可解析 → None。"""
    try:
        a = datetime.strptime(str(d1)[:10], "%Y-%m-%d")
        b = datetime.strptime(str(d2)[:10], "%Y-%m-%d")
        return abs((a - b).days)
    except (TypeError, ValueError):
        return None


def classify_level(strong_anomaly_count):
    return "红" if strong_anomaly_count >= 2 else ("黄" if strong_anomaly_count == 1 else "绿")
