"""通用重点跟进 store 领域逻辑:范围规整 + 进展/跟进编辑 + 归档。
5 套(temp/opportunity/risk/paykey)差异参数化为 FollowupConfig。progress 无 scope,不并入。"""
from __future__ import annotations
import copy
from typing import Any, Dict, List, Optional, Tuple

_COMBINATORS = ('AND', 'OR')
_OPS = ('in', 'notIn', 'between', 'notBetween', 'contains', 'notContains')


class FollowupConfig:
    def __init__(self, progress_fields: Tuple[str, ...],
                 scope_groups: Optional[Tuple[str, ...]] = None,
                 clear_on_archive: bool = True,
                 default_scope: Optional[Dict[str, Any]] = None):
        self.progress_fields = tuple(progress_fields)
        self.scope_groups = tuple(scope_groups) if scope_groups is not None else None
        self.clear_on_archive = clear_on_archive
        self.default_scope = default_scope if default_scope is not None else {"combinator": "AND", "groups": []}


def new_store(cfg: FollowupConfig) -> Dict[str, Any]:
    return {"version": 1, "scope": copy.deepcopy(cfg.default_scope), "current": {}, "archives": []}


def _norm_combinator(v: Any) -> str:
    return v if v in _COMBINATORS else 'AND'


def _norm_condition(cfg: FollowupConfig, c: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(c, dict):
        return None
    if cfg.scope_groups is not None and c.get('group') not in cfg.scope_groups:
        return None
    field = c.get('field')
    if not isinstance(field, str) or not field:
        return None
    op = c.get('op') if c.get('op') in _OPS else 'in'
    out: Dict[str, Any] = ({"group": c['group'], "field": field, "op": op}
                           if cfg.scope_groups is not None else {"field": field, "op": op})
    if isinstance(c.get('values'), list):
        out['values'] = [str(x) for x in c['values']]
    if c.get('min') is not None:
        out['min'] = c['min']
    if c.get('max') is not None:
        out['max'] = c['max']
    return out


def normalize_scope(cfg: FollowupConfig, scope: Any) -> Dict[str, Any]:
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
        conds = [nc for nc in (_norm_condition(cfg, c) for c in conds_raw) if nc] if isinstance(conds_raw, list) else []
        groups.append({"combinator": _norm_combinator(g.get('combinator')), "conditions": conds})
    return {"combinator": _norm_combinator(scope.get('combinator')), "groups": groups}


def apply_update(cfg: FollowupConfig, store, key, field, content, account, now, extra_fields=()) -> Dict[str, Any]:
    if field not in cfg.progress_fields and field not in extra_fields:
        raise ValueError("invalid field: %s" % field)
    rec = store.setdefault('current', {}).setdefault(key, {})
    rec[field] = content
    rec[field + 'EditTime'] = now
    rec[field + 'EditBy'] = account
    return rec


def apply_archive(cfg: FollowupConfig, store, rows, now, clear_fields=None) -> None:
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
    if clear_fields is None:
        # 向后兼容:无自定义列时退化为原表级行为
        if cfg.clear_on_archive:
            store['current'] = {}
        return
    current = store.setdefault('current', {})
    for rec in current.values():
        for f in clear_fields:
            rec.pop(f, None)
            rec.pop(f + 'EditTime', None)
            rec.pop(f + 'EditBy', None)
    store['current'] = {k: v for k, v in current.items() if v}   # 丢弃清空后为空的记录


def apply_archive_delete(store, idx) -> bool:
    archives = store.setdefault('archives', [])
    if not isinstance(idx, int) or idx < 0 or idx >= len(archives):
        return False
    del archives[idx]
    return True
