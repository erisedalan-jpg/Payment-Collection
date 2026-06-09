# pmis.py
"""PMIS 项目域数据摄取:解析七表 → 按 projectId join → 派生维度 + 数据质量。
纯函数为主(解析/join/派生/质量),文件读取(openpyxl)集中在 read_pmis_sheet/load_project_pmis。
PMIS 缺失要优雅降级,不抛错、不阻断回款主流程。"""
from __future__ import annotations
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import config


def parse_pmis_money(val) -> Optional[float]:
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip().replace(",", "").replace("，", "")
    m = re.search(r"-?[\d.]+", s)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def parse_pmis_pct(val) -> Optional[float]:
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip().rstrip("%")
    try:
        num = float(s)
    except ValueError:
        return None
    return num if num <= 1 else num / 100


def parse_close_fraction(val) -> Optional[int]:
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip()
    m = re.match(r"\s*(\d+)", s)
    return int(m.group(1)) if m else None
