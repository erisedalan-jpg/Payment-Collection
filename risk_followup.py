"""风险跟进(/risk)领域:薄封装 followup_store(单表,归档留存 current)。"""
from __future__ import annotations
from typing import Any, Dict
import followup_store as _fs

PROGRESS_FIELDS = ('followAction', 'revConclusion', 'nextRevDate')
_CFG = _fs.FollowupConfig(progress_fields=PROGRESS_FIELDS, scope_groups=None, clear_on_archive=False)


def new_store() -> Dict[str, Any]:
    return _fs.new_store(_CFG)


def normalize_scope(scope: Any) -> Dict[str, Any]:
    return _fs.normalize_scope(_CFG, scope)


def apply_update(store, risk_key, field, content, account, now, extra_fields=()) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, store, risk_key, field, content, account, now, extra_fields=extra_fields)


def apply_archive(store, rows, now, clear_fields=None) -> None:
    _fs.apply_archive(_CFG, store, rows, now, clear_fields=clear_fields)


def apply_archive_delete(store, idx) -> bool:
    return _fs.apply_archive_delete(store, idx)
