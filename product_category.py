# product_category.py
"""产品分类源表(V4.5.4):产品线 → 产品大类 / 是否渠道商可交付。

源表 input/产品分类.xlsx 三列:产品线 | 产品大类 | 是否渠道商可交付。
仅倚天域消费(校准后产品大类、渠道可交付判定)。缺文件/无表头 → {} 降级,
由调用方记入就绪度指标并打 [WARN],绝不阻断管线。
"""
from __future__ import annotations

from typing import Any, Dict

from projects import read_sheet_by_header

COL_LINE = "产研侧产品线"     # 兼容用:部分导出把首列写成全称
COL_LINE_SHORT = "产品线"
COL_CATEGORY = "产品大类"
COL_CHANNEL = "是否渠道商可交付"

CHANNEL_YES = "渠道商可交付产品"   # 精确值,其余一律 False

# 展示顺序(业务指定),"其他" 恒末位。未在此列中的大类按字典序排在 "其他" 之前。
CATEGORY_ORDER = [
    "传统等保", "终端安全", "云与服务器安全", "态势感知", "天眼",
    "工控安全", "数据安全", "电子取证", "AI等新方向", "其他",
]


def read_product_categories(path: str) -> Dict[str, Dict[str, Any]]:
    """产品分类.xlsx → {产品线: {"category": 产品大类, "channel": 是否渠道商可交付}}。
    按"表头含产品线"自动选 sheet;产品线为空的行跳过;重复产品线后者覆盖前者。
    缺文件/无表头 → {}。"""
    rows = read_sheet_by_header(path, COL_LINE_SHORT)
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        line = str(r.get(COL_LINE_SHORT) or r.get(COL_LINE) or "").strip()
        if not line:
            continue
        out[line] = {
            "category": str(r.get(COL_CATEGORY) or "").strip(),
            "channel": str(r.get(COL_CHANNEL) or "").strip() == CHANNEL_YES,
        }
    return out
