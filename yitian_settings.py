# yitian_settings.py
"""倚天工时域:合规检查范围配置(超管可配)。纯函数 + 原子读写,可单测。

为什么要有这个文件:原工具把「剔除哪些工时类型不参与合规检查」硬编码成
exclude_types = ['管理类','业务类','假期类'] 埋在脚本里。这条口径直接决定合规率,
却对使用者不可见——接手的管理员根本不知道分母里少了 71 条管理类。
本模块把它提升为服务端配置,超管在 /data 可见可改,改完立即生效(前端按配置现算,不必重跑管线)。
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List

# 默认值 = 原工具的 exclude_types,保证开箱即用时口径与历史报告一致
DEFAULT_EXCLUDED_TYPES = ["管理类", "业务类", "假期类"]

MAX_TYPES = 20          # 工时类型总共就 6 种,20 是防呆上限
MAX_TYPE_LEN = 20


def default_settings() -> Dict[str, Any]:
    return {"excludedTypes": list(DEFAULT_EXCLUDED_TYPES)}


def validate_settings(cfg: Any) -> Dict[str, Any]:
    """校验并归一化配置。非法 → ValueError。缺键 → 回落默认。
    归一化:strip、去空串、去重(保序)。空列表是合法的(= 不剔除任何类型)。"""
    if not isinstance(cfg, dict):
        raise ValueError("配置必须是对象")
    if "excludedTypes" not in cfg:
        return default_settings()

    raw = cfg["excludedTypes"]
    if not isinstance(raw, list):
        raise ValueError("excludedTypes 必须是数组")
    if len(raw) > MAX_TYPES:
        raise ValueError("excludedTypes 最多 %d 项" % MAX_TYPES)

    out: List[str] = []
    for item in raw:
        if not isinstance(item, str):
            raise ValueError("excludedTypes 只能含字符串")
        s = item.strip()
        if not s:
            continue
        if len(s) > MAX_TYPE_LEN:
            raise ValueError("工时类型名过长")
        if s not in out:
            out.append(s)
    return {"excludedTypes": out}


def load_settings(path: str) -> Dict[str, Any]:
    """读配置;文件缺失/损坏/非法 → 静默回落默认(降级不阻断)。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return validate_settings(json.load(f))
    except (OSError, ValueError):
        return default_settings()


def save_settings(path: str, cfg: Any) -> Dict[str, Any]:
    """校验后原子写(先写 .tmp 再 replace,避免并发/崩溃留半截坏文件)。返回落盘后的配置。"""
    clean = validate_settings(cfg)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return clean
