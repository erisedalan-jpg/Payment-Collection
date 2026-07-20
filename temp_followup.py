"""临时重点跟进(/projects/temp)领域:多实例包装 + 薄封装 followup_store。

多实例为什么不下沉进 followup_store:那是 temp/risk/opportunity/payment_key
四个域共用的引擎,只有 temp 需要「并行多轮跟进」。所幸「实例」的形状
{scope, current, archives} 与旧 store 顶层完全同构 —— apply_update/apply_archive/
apply_archive_delete 传 instance 进去即可直接工作,引擎一行都不用改。
"""
from __future__ import annotations

import copy
import uuid
from typing import Any, Dict, Optional

import followup_store as _fs

PROGRESS_FIELDS = ('weekProgress', 'nextPlan')
SCOPE_GROUPS = ('project', 'paymentNode', 'milestone')
_CFG = _fs.FollowupConfig(progress_fields=PROGRESS_FIELDS, scope_groups=SCOPE_GROUPS, clear_on_archive=True)

DEFAULT_INSTANCE_NAME = "默认跟进"
NAME_MAX = 20
STORE_VERSION = 2


def _new_id() -> str:
    return "inst-" + uuid.uuid4().hex[:8]


def _clean_name(name: Any) -> str:
    """非空、strip 后 1..20 字符。允许重名(靠 id 区分,强制查重只会挡路)。"""
    if not isinstance(name, str):
        raise ValueError("实例名必须是字符串")
    n = name.strip()
    if not n or len(n) > NAME_MAX:
        raise ValueError("实例名须为 1..%d 个字符" % NAME_MAX)
    return n


def _new_instance(name: str, scope: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {"id": _new_id(), "name": name,
            "scope": copy.deepcopy(scope) if scope is not None else copy.deepcopy(_CFG.default_scope),
            "current": {}, "archives": []}


def new_store() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "instances": [_new_instance(DEFAULT_INSTANCE_NAME)]}


def migrate(store: Any) -> Dict[str, Any]:
    """V4.0.1 及以前的单实例结构 → 多实例。判据是【缺 instances 键】,不是版本号比较
    —— 写 version != 2 会让将来的 v3 被当旧版回迁。幂等:已是新结构则原样返回。"""
    if not isinstance(store, dict):
        return new_store()
    if isinstance(store.get("instances"), list) and store["instances"]:
        return store
    inst = {"id": _new_id(), "name": DEFAULT_INSTANCE_NAME,
            "scope": store.get("scope") if isinstance(store.get("scope"), dict)
                     else copy.deepcopy(_CFG.default_scope),
            "current": store.get("current") if isinstance(store.get("current"), dict) else {},
            "archives": store.get("archives") if isinstance(store.get("archives"), list) else []}
    return {"version": STORE_VERSION, "instances": [inst]}


def find_instance(store: Dict[str, Any], instance_id: Any) -> Optional[Dict[str, Any]]:
    for inst in store.get("instances") or []:
        if inst.get("id") == instance_id:
            return inst
    return None


def create_instance(store: Dict[str, Any], name: Any,
                    copy_from: Optional[str] = None) -> Dict[str, Any]:
    """copy_from 只复制 scope,不复制 current/archives。"""
    n = _clean_name(name)
    scope = None
    if copy_from:
        src = find_instance(store, copy_from)
        if src is None:
            raise ValueError("copyFrom 指向的实例不存在")
        scope = src.get("scope")
    inst = _new_instance(n, scope)
    store.setdefault("instances", []).append(inst)
    return inst


def rename_instance(store: Dict[str, Any], instance_id: str, name: Any) -> bool:
    n = _clean_name(name)          # 先校验名字,再找实例:名字非法就该抛,与实例存不存在无关
    inst = find_instance(store, instance_id)
    if inst is None:
        return False
    inst["name"] = n
    return True


def delete_instance(store: Dict[str, Any], instance_id: str) -> bool:
    """连同该实例的 current 与 archives 一并删除。不允许删到零实例。"""
    insts = store.get("instances") or []
    idx = next((i for i, x in enumerate(insts) if x.get("id") == instance_id), -1)
    if idx < 0:
        return False
    if len(insts) <= 1:
        raise ValueError("至少保留一个跟进事项")
    del insts[idx]
    return True


def normalize_scope(scope: Any) -> Dict[str, Any]:
    return _fs.normalize_scope(_CFG, scope)


def apply_update(instance, project_id, field, content, account, now) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, instance, project_id, field, content, account, now)


def apply_archive(instance, rows, now) -> None:
    _fs.apply_archive(_CFG, instance, rows, now)


def apply_archive_delete(instance, idx) -> bool:
    return _fs.apply_archive_delete(instance, idx)
