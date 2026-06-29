"""风险跟进(/risk)领域纯函数:范围条件规整 + 跟进编辑/归档。
单表(风险行)范围,条件无子表 group;匹配在前端做(数据已按 L4 裁剪),本模块只规整与存储。
与 temp/opportunity 的关键差异:apply_archive 只追加快照、不清空 current(跟进留存)。"""
from __future__ import annotations
from typing import Any, Dict, List

PROGRESS_FIELDS = ('followAction', 'revConclusion', 'nextRevDate')
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
    field = c.get('field')
    if not isinstance(field, str) or not field:
        return None
    op = c.get('op') if c.get('op') in _OPS else 'in'
    out: Dict[str, Any] = {"field": field, "op": op}
    if isinstance(c.get('values'), list):
        out['values'] = [str(x) for x in c['values']]
    if c.get('min') is not None:
        out['min'] = c['min']
    if c.get('max') is not None:
        out['max'] = c['max']
    return out


def normalize_scope(scope: Any) -> Dict[str, Any]:
    """宽容规整;结构非法 → 空范围 {combinator:'AND', groups:[]}。单表:条件无 group。"""
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


def apply_update(store, risk_key, field, content, account, now) -> Dict[str, Any]:
    if field not in PROGRESS_FIELDS:
        raise ValueError("invalid field: %s" % field)
    rec = store.setdefault('current', {}).setdefault(risk_key, {})
    rec[field] = content
    rec[field + 'EditTime'] = now
    rec[field + 'EditBy'] = account
    return rec


def apply_archive(store, rows, now) -> None:
    """只追加历史快照;不清空 current(跟进动作/rev结论/下次rev时间 留存)。"""
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
