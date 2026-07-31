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

# 台账/收件箱时间戳格式 —— 【单一来源,公开名】。写入端(server.py 的 handler)与解析端
# (本模块 prune/candidate_projects、lanxin_unresponded.compute)分处三个互不相识的模块,
# 此前各自写了一份同值字面量。这类隐式契约改坏后【全程零报错】:_parse 一律返回 None →
# 未响应清单的 dueAt 恒空、overdue 恒 False,默认「仅未响应」视图【永远是空的】
# (看上去像"大家都回了");同时 90 天台账清理失效、归入候选恒空。
# 三处必须 import 本常量,不许再各写一份。
TS_FMT = "%Y-%m-%d %H:%M:%S"


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
        return datetime.strptime(str(ts), TS_FMT)
    except (TypeError, ValueError):
        return None


def record_sent(store: Dict[str, Any], entries: List[Dict[str, Any]], now: str) -> None:
    """记录一批推送。sentAt 统一由调用方传入的 now 盖章,便于测试与批次一致。

    role 是白名单里唯一【可能缺失】的键:V4.5.8 之前的台账没有它。缺失 → 空串,
    未响应清单据此【不排除】该行 —— 老数据行为一字不变(宁可多列一行让人自己判断,
    也不能因为一个新字段把历史台账整段从清单上抹掉)。
    """
    for e in entries or []:
        store.setdefault("sent", []).append({
            "staffId": e.get("staffId") or "",
            "employId": e.get("employId") or "",
            "name": e.get("name") or "",
            "routeKey": e.get("routeKey") or "",
            "role": e.get("role") or "",
            # H5 反馈页的待办清单从这里读(口径在前端、后端无法实时重算,见 spec §4.5.1a)。
            # 老台账(V4.5.8 及以前)没有这个键 → 空列表(不是 None:下游直接 for 它)。
            "reviewItems": copy.deepcopy(e.get("reviewItems") or []),
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
            # 重新归入成功 → 上一次撤销的痕迹作废,否则界面会同时显示
            # 「已归入 A」和「上次归入 B 已撤销」两条,读的人分不清哪条是现状。
            it.pop("unhandledFrom", None)
            return True
    return False


def unmark_handled(store: Dict[str, Any], item_id: str,
                   at: str = "", by: str = "") -> bool:
    """撤销归入标记 —— 只动收件箱这一侧的记账,【不碰已写进跟进域的正文】。

    为什么不顺手把跟进正文删掉:归入是把回复【追加】进一个富文本字段
    (见 server._lanxin_append_reply),超管很可能已经在那条跟进里继续编辑过。
    按内容反向摘除既不可靠(要匹配一段可能已被改写的 HTML),失手就是删掉别人
    手写的跟进 —— 比留一段冗余文本严重得多。

    所以把上一次的去向留在 unhandledFrom 里:撤销之后正文仍躺在那个域里,
    人得知道去哪儿收拾。丢掉这个信息,撤销就成了"只解锁、不告诉你现场在哪"。
    """
    for it in store.get("items") or []:
        if it.get("id") == item_id:
            if not it.get("handled"):
                return False
            prev = it.get("handledInfo")
            it["handled"] = False
            it["handledInfo"] = None
            it["unhandledFrom"] = {"info": copy.deepcopy(prev) if prev else None,
                                   "at": at, "by": by}
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


def staff_id_of_employ(store: Dict[str, Any], employ_id: str) -> str:
    """按工号反查 staffId。查不到返回空串,【绝不编造】(同 resolve_identity 的纪律)。

    取【最近一条】:同一工号的 staffId 理论上不变,但蓝信侧若变更过,
    最近那条才是当前有效的。H5 落库时用它给条目补 staffId,让收件箱既有的
    身份反查与归因候选(都按 staffId 索引)对 H5 条目照样生效。
    """
    for e in reversed(store.get("sent") or []):
        if str(e.get("employId") or "") == str(employ_id or ""):
            return str(e.get("staffId") or "")
    return ""
