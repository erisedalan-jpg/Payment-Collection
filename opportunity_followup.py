"""重点商机跟进(/opportunities/key)领域:薄封装 followup_store(单表,归档清 current,非空默认范围)。"""
from __future__ import annotations
from typing import Any, Dict
import followup_store as _fs

PROGRESS_FIELDS = ('weekProgress', 'nextPlan')

# 默认范围:TOP1000 & 提前介入 & 重点商机 & 状态非赢单(单组四条 AND) —— 原内容不变
DEFAULT_SCOPE: Dict[str, Any] = {
    "combinator": "AND",
    "groups": [{"combinator": "AND", "conditions": [
        {"field": "top1000", "op": "in", "values": ["TOP1000"]},
        {"field": "earlyIntervene", "op": "in", "values": ["是"]},
        {"field": "keyOpp", "op": "in", "values": ["是"]},
        {"field": "status", "op": "notIn", "values": ["赢单"]},
    ]}],
}
_CFG = _fs.FollowupConfig(progress_fields=PROGRESS_FIELDS, scope_groups=None,
                          clear_on_archive=True, default_scope=DEFAULT_SCOPE)


def new_store() -> Dict[str, Any]:
    return _fs.new_store(_CFG)


def normalize_scope(scope: Any) -> Dict[str, Any]:
    return _fs.normalize_scope(_CFG, scope)


def apply_update(store, opp_id, field, content, account, now) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, store, opp_id, field, content, account, now)


def apply_archive(store, rows, now) -> None:
    _fs.apply_archive(_CFG, store, rows, now)


def apply_archive_delete(store, idx) -> bool:
    return _fs.apply_archive_delete(store, idx)
