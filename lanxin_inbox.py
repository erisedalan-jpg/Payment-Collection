# lanxin_inbox.py
"""蓝信收件箱与发送台账的纯数据操作。

为什么把「发送台账」和「收件箱」放同一个 store:它们是同一场对话的两端。
台账一物两用 ——
① 反查身份:回调只给 staffId,而发送时做过 employId → staffId 的 id_mapping,
   不留台账就只能拿一串 524288-xxx 给超管看;
② 归因候选:按 staffId 找最近推给他的卡片,取其中项目作归入下拉的默认值。
   注意这只是【推测】—— 蓝信回调不带任何原卡标识,referenceMsg 连 msgId 都没有。

本模块【不做文件 IO】。读写由 server.py 用既有的 _atomic_write_json /
_followup_txn 完成,与其它域保持一致。
"""
from __future__ import annotations

import copy
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

STORE_VERSION = 1
SEEN_RETENTION_DAYS = 7      # 蓝信最长重推间隔 6 小时,7 天绰绰有余
SENT_RETENTION_DAYS = 90

_TS_FMT = "%Y-%m-%d %H:%M:%S"


def new_store() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "sent": [], "items": [], "seenEventIds": []}


def migrate(store: Any) -> Dict[str, Any]:
    """把任意读到的内容规整成合法 store。绝不抛错 —— 读到损坏内容时
    上层需要一个能用的默认值,而不是 500。"""
    if not isinstance(store, dict):
        return new_store()
    out = new_store()
    for key in ("sent", "items", "seenEventIds"):
        val = store.get(key)
        if isinstance(val, list):
            out[key] = copy.deepcopy(val)
    return out


def _parse(ts: Any) -> Optional[datetime]:
    try:
        return datetime.strptime(str(ts), _TS_FMT)
    except (TypeError, ValueError):
        return None


def record_sent(store: Dict[str, Any], entries: List[Dict[str, Any]], now: str) -> None:
    """记录一批推送。sentAt 统一由调用方传入的 now 盖章,便于测试与批次一致。"""
    for e in entries or []:
        store.setdefault("sent", []).append({
            "staffId": e.get("staffId") or "",
            "employId": e.get("employId") or "",
            "name": e.get("name") or "",
            "routeKey": e.get("routeKey") or "",
            "projectIds": list(e.get("projectIds") or []),
            "msgId": e.get("msgId") or "",
            "sentAt": now,
        })


def is_seen(store: Dict[str, Any], event_id: str) -> bool:
    return any(x.get("id") == event_id for x in store.get("seenEventIds") or [])


def mark_seen(store: Dict[str, Any], event_id: str, now: str) -> None:
    store.setdefault("seenEventIds", []).append({"id": event_id, "ts": now})


def add_item(store: Dict[str, Any], item: Dict[str, Any]) -> Dict[str, Any]:
    """最新的排最前 —— 收件箱是给人读的。"""
    rec = copy.deepcopy(item)
    store.setdefault("items", []).insert(0, rec)
    return rec


def resolve_identity(store: Dict[str, Any], staff_id: str) -> Dict[str, Any]:
    """按 staffId 反查工号与姓名。查不到返回 None,【绝不编造】——
    收件箱要如实显示「未知」,让超管知道这人不在我们推送过的名单里。"""
    for e in reversed(store.get("sent") or []):
        if e.get("staffId") == staff_id:
            return {"employId": e.get("employId") or None, "name": e.get("name") or None}
    return {"employId": None, "name": None}


def candidate_projects(store: Dict[str, Any], staff_id: str, days: int = 30) -> List[str]:
    """归因候选:窗口内推给此人的卡片涉及的项目,按首次出现顺序去重。
    这是【建议不是结论】,调用方须在 UI 上标明。"""
    cutoff = datetime.now() - timedelta(days=days)
    out: List[str] = []
    for e in store.get("sent") or []:
        if e.get("staffId") != staff_id:
            continue
        ts = _parse(e.get("sentAt"))
        if ts is None or ts < cutoff:
            continue
        for pid in e.get("projectIds") or []:
            if pid not in out:
                out.append(pid)
    return out


def mark_handled(store: Dict[str, Any], item_id: str, info: Dict[str, Any]) -> bool:
    for it in store.get("items") or []:
        if it.get("id") == item_id:
            it["handled"] = True
            it["handledInfo"] = copy.deepcopy(info)
            return True
    return False


def prune(store: Dict[str, Any], now: str) -> None:
    """滚动清理去重表与发送台账。【items 永不自动删】——
    收件箱是人要读的东西,自动删会让人错过。"""
    ref = _parse(now) or datetime.now()
    seen_cut = ref - timedelta(days=SEEN_RETENTION_DAYS)
    sent_cut = ref - timedelta(days=SENT_RETENTION_DAYS)
    store["seenEventIds"] = [x for x in store.get("seenEventIds") or []
                             if (_parse(x.get("ts")) or ref) >= seen_cut]
    store["sent"] = [x for x in store.get("sent") or []
                     if (_parse(x.get("sentAt")) or ref) >= sent_cut]
