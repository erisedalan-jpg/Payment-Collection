"""跟进表超管自定义列:配置模型 + CRUD + 校验(纯逻辑 + 原子读写)。

值不在这里 —— 列的【值】内联在各跟进 store 的 current 记录里(server 侧写)。本模块只管
「有哪些列」及其属性(列名/类型/归档清空)。参照 budget_config/followup_store 的薄封装风格。
"""
from __future__ import annotations

import json
import os
import re
import secrets
from typing import Any, Dict, List, Optional, Set, Tuple

TABLE_IDS: Tuple[str, ...] = ('temp', 'risk', 'payment_key', 'opportunity')
COL_TYPES: Tuple[str, ...] = ('text', 'date', 'diff')
ANCHOR_KINDS: Tuple[str, ...] = ('today', 'fixed', 'column')
_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
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


def _check_diff(spec: Any) -> Dict[str, Any]:
    """校验并规整 diff 配置(anchor + target);非法一律抛 ValueError。
    不校验 target/anchor.key 指向的列是否存在——后端不认识前端列模型,
    引用失效在前端表现为显示 '-'(见 spec §5)。"""
    if not isinstance(spec, dict):
        raise ValueError("时间差列必须提供 diff 配置")
    anchor = spec.get("anchor")
    if not isinstance(anchor, dict):
        raise ValueError("diff.anchor 必须是对象")
    kind = anchor.get("kind")
    if kind not in ANCHOR_KINDS:
        raise ValueError("diff.anchor.kind 须为 today/fixed/column")
    out_anchor: Dict[str, Any] = {"kind": kind}
    if kind == "fixed":
        d = anchor.get("date")
        if not isinstance(d, str) or not _DATE_RE.match(d):
            raise ValueError("diff.anchor.date 须为 YYYY-MM-DD")
        out_anchor["date"] = d
    elif kind == "column":
        k = anchor.get("key")
        if not isinstance(k, str) or not k.strip():
            raise ValueError("diff.anchor.key 必填")
        out_anchor["key"] = k.strip()
    target = spec.get("target")
    if not isinstance(target, str) or not target.strip():
        raise ValueError("diff.target 必填")
    return {"anchor": out_anchor, "target": target.strip()}


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


def writable_keys(cfg: Dict[str, Any], table: str) -> Set[str]:
    """可由管理员【填写】的自定义列 key —— 排除 diff 计算列。
    server 的 apply_update extra_fields 必须用本函数而非 custom_keys:
    diff 是派生列,一旦放行写入,存储值会在前端 decorate 时压过计算值。"""
    return {c["key"] for c in cfg["tables"].get(table, [])
            if c.get("key") and c.get("type") != 'diff'}


def _new_key() -> str:
    return KEY_PREFIX + secrets.token_hex(4)


def add_column(cfg, table, label, type_, clear_on_archive, diff=None) -> Dict[str, Any]:
    _check_table(table)
    lbl = _clean_label(label)
    typ = _check_type(type_)
    cols = cfg["tables"].setdefault(table, [])
    if len(cols) >= MAX_COLS_PER_TABLE:
        raise ValueError("每张表最多 %d 个自定义列" % MAX_COLS_PER_TABLE)
    if any(c.get("label") == lbl for c in cols):
        raise ValueError("该表已有同名列: %s" % lbl)
    col = {"key": _new_key(), "label": lbl, "type": typ,
           # diff 是派生列,无值可清 —— clearOnArchive 恒 False,不接受传入值
           "clearOnArchive": False if typ == 'diff' else bool(clear_on_archive)}
    if typ == 'diff':
        col["diff"] = _check_diff(diff)
    cols.append(col)
    return dict(col)


def update_column(cfg, table, key, *, label=None, type_=None, clear_on_archive=None, diff=None) -> Dict[str, Any]:
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
    # 以【最终类型】为准:类型可能刚被改掉
    if col["type"] == 'diff':
        if diff is not None:
            col["diff"] = _check_diff(diff)
        elif "diff" not in col:
            raise ValueError("时间差列必须提供 diff 配置")
        col["clearOnArchive"] = False
    else:
        col.pop("diff", None)      # 改成非 diff 类型 → 丢弃孤儿配置
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
        if c.get("type") == 'diff':
            continue                      # 计算列无值可清(即便 JSON 被手改成 true)
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
            entry = {"key": k, "label": lbl, "type": typ,
                     "clearOnArchive": False if typ == 'diff' else bool(c.get("clearOnArchive"))}
            if typ == 'diff':
                try:
                    entry["diff"] = _check_diff(c.get("diff"))
                except ValueError:
                    continue              # 形状损坏的 diff 列整条丢弃,不留半截配置
            seen.add(k)
            clean.append(entry)
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
