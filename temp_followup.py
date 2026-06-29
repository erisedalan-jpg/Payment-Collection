"""临时重点跟进(/projects/temp)领域纯函数:范围条件规整 + 进展编辑/归档。
可单测,不依赖 server。范围匹配在前端做(数据已按 L4 裁剪),本模块只规整与存储进展。"""
from __future__ import annotations
from typing import Any, Dict, List

PROGRESS_FIELDS = ('weekProgress', 'nextPlan')
SCOPE_GROUPS = ('project', 'paymentNode', 'milestone')
_COMBINATORS = ('AND', 'OR')
_OPS = ('in', 'notIn', 'between', 'notBetween', 'contains', 'notContains')


def new_store() -> Dict[str, Any]:
    return {"version": 1, "scope": {"combinator": "AND", "groups": []},
            "current": {}, "archives": []}


def _norm_combinator(v: Any) -> str:
    return v if v in _COMBINATORS else 'AND'


def _norm_condition(c: Any) -> Dict[str, Any] | None:
    if not isinstance(c, dict):
        return None
    if c.get('group') not in SCOPE_GROUPS:
        return None
    field = c.get('field')
    if not isinstance(field, str) or not field:
        return None
    op = c.get('op') if c.get('op') in _OPS else 'in'
    out: Dict[str, Any] = {"group": c['group'], "field": field, "op": op}
    if isinstance(c.get('values'), list):
        out['values'] = [str(x) for x in c['values']]
    if c.get('min') is not None:
        out['min'] = c['min']
    if c.get('max') is not None:
        out['max'] = c['max']
    return out


def normalize_scope(scope: Any) -> Dict[str, Any]:
    """宽容规整范围;结构非法 → 默认空范围 {combinator:'AND', groups:[]}。"""
    default = {"combinator": "AND", "groups": []}
    if not isinstance(scope, dict):
        return default
    groups_raw = scope.get('groups')
    if not isinstance(groups_raw, list):
        return default
    groups: List[Dict[str, Any]] = []
    for g in groups_raw:
        if not isinstance(g, dict):
            continue
        conds_raw = g.get('conditions')
        conds = [nc for nc in (_norm_condition(c) for c in conds_raw) if nc] if isinstance(conds_raw, list) else []
        groups.append({"combinator": _norm_combinator(g.get('combinator')), "conditions": conds})
    return {"combinator": _norm_combinator(scope.get('combinator')), "groups": groups}


def apply_update(store, project_id, field, content, account, now) -> Dict[str, Any]:
    if field not in PROGRESS_FIELDS:
        raise ValueError("invalid field: %s" % field)
    rec = store.setdefault('current', {}).setdefault(project_id, {})
    rec[field] = content
    rec[field + 'EditTime'] = now
    rec[field + 'EditBy'] = account
    return rec


def apply_archive(store, rows, now) -> None:
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
    store['current'] = {}


def apply_archive_delete(store, idx) -> bool:
    """删除第 idx 条历史快照;越界/非法 idx → False(不动 store)。"""
    archives = store.setdefault('archives', [])
    if not isinstance(idx, int) or idx < 0 or idx >= len(archives):
        return False
    del archives[idx]
    return True
