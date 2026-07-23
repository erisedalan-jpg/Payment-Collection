"""跟进表超管自定义列:配置模型 + CRUD + 校验(纯逻辑 + 原子读写)。

值不在这里 —— 列的【值】内联在各跟进 store 的 current 记录里(server 侧写)。本模块只管
「有哪些列」及其属性(列名/类型/归档清空)。参照 budget_config/followup_store 的薄封装风格。
"""
from __future__ import annotations

import json
import os
import secrets
from typing import Any, Dict, List, Optional, Set, Tuple

TABLE_IDS: Tuple[str, ...] = ('temp', 'risk', 'payment_key', 'opportunity')
COL_TYPES: Tuple[str, ...] = ('text', 'date')
MAX_COLS_PER_TABLE = 8
LABEL_MAX = 20
KEY_PREFIX = 'cf-'
STORE_VERSION = 1


def _empty() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "tables": {t: [] for t in TABLE_IDS}}


def _check_table(table: str) -> None:
    if table not in TABLE_IDS:
        raise ValueError("未知跟进表: %s" % table)


def _clean_label(label: Any) -> str:
    if not isinstance(label, str):
        raise ValueError("列名必须是字符串")
    s = label.strip()
    if not s or len(s) > LABEL_MAX:
        raise ValueError("列名须为 1..%d 个字符" % LABEL_MAX)
    return s


def _check_type(type_: Any) -> str:
    if type_ not in COL_TYPES:
        raise ValueError("列类型须为 text 或 date")
    return type_


def _find(cfg: Dict[str, Any], table: str, key: str) -> Optional[Dict[str, Any]]:
    for c in cfg["tables"].get(table, []):
        if c.get("key") == key:
            return c
    return None


def columns_for(cfg: Dict[str, Any], table: str) -> List[Dict[str, Any]]:
    _check_table(table)
    return [dict(c) for c in cfg["tables"].get(table, [])]


def custom_keys(cfg: Dict[str, Any], table: str) -> Set[str]:
    return {c["key"] for c in cfg["tables"].get(table, []) if c.get("key")}


def _new_key() -> str:
    return KEY_PREFIX + secrets.token_hex(4)


def add_column(cfg, table, label, type_, clear_on_archive) -> Dict[str, Any]:
    _check_table(table)
    lbl = _clean_label(label)
    typ = _check_type(type_)
    cols = cfg["tables"].setdefault(table, [])
    if len(cols) >= MAX_COLS_PER_TABLE:
        raise ValueError("每张表最多 %d 个自定义列" % MAX_COLS_PER_TABLE)
    if any(c.get("label") == lbl for c in cols):
        raise ValueError("该表已有同名列: %s" % lbl)
    col = {"key": _new_key(), "label": lbl, "type": typ, "clearOnArchive": bool(clear_on_archive)}
    cols.append(col)
    return dict(col)


def update_column(cfg, table, key, *, label=None, type_=None, clear_on_archive=None) -> Dict[str, Any]:
    _check_table(table)
    col = _find(cfg, table, key)
    if col is None:
        raise ValueError("列不存在: %s" % key)
    if label is not None:
        lbl = _clean_label(label)
        if any(c.get("label") == lbl and c.get("key") != key for c in cfg["tables"][table]):
            raise ValueError("该表已有同名列: %s" % lbl)
        col["label"] = lbl
    if type_ is not None:
        col["type"] = _check_type(type_)
    if clear_on_archive is not None:
        col["clearOnArchive"] = bool(clear_on_archive)
    return dict(col)


def reorder_columns(cfg, table, ordered_keys) -> List[Dict[str, Any]]:
    _check_table(table)
    cols = cfg["tables"].get(table, [])
    if not isinstance(ordered_keys, list) or set(ordered_keys) != {c["key"] for c in cols}:
        raise ValueError("重排 keys 必须与现有列 key 集合完全一致")
    by_key = {c["key"]: c for c in cols}
    cfg["tables"][table] = [by_key[k] for k in ordered_keys]
    return columns_for(cfg, table)


def delete_column(cfg, table, key) -> Dict[str, Any]:
    _check_table(table)
    col = _find(cfg, table, key)
    if col is None:
        raise ValueError("列不存在: %s" % key)
    cfg["tables"][table] = [c for c in cfg["tables"][table] if c.get("key") != key]
    return dict(col)


def clear_field_keys(cfg, table, builtin_fields, table_level_clear) -> Set[str]:
    """归档时该表待清字段集:表级清空 → 全部内置;每个自定义列按自己的 clearOnArchive。"""
    _check_table(table)
    out: Set[str] = set(builtin_fields) if table_level_clear else set()
    for c in cfg["tables"].get(table, []):
        if c.get("clearOnArchive"):
            out.add(c["key"])
    return out


def _normalize(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict) or not isinstance(raw.get("tables"), dict):
        return _empty()
    out = _empty()
    for t in TABLE_IDS:
        items = raw["tables"].get(t)
        if not isinstance(items, list):
            continue
        clean: List[Dict[str, Any]] = []
        seen: Set[str] = set()
        for c in items:
            if not isinstance(c, dict):
                continue
            k, lbl, typ = c.get("key"), c.get("label"), c.get("type")
            if not (isinstance(k, str) and k and isinstance(lbl, str) and lbl
                    and typ in COL_TYPES and k not in seen):
                continue
            seen.add(k)
            clean.append({"key": k, "label": lbl, "type": typ, "clearOnArchive": bool(c.get("clearOnArchive"))})
        out["tables"][t] = clean
    return out


def load(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return _normalize(json.load(f))
    except (OSError, ValueError):
        return _empty()


def save(path: str, cfg: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
