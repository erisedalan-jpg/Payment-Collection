# lanxin_callback.py
"""蓝信回调报文 → 收件箱条目 的纯转换。

为什么两套键名都认:蓝信文档的字段表写 eventType/appId/orgId/length,
文档自己的 JSON 示例写 type/orgId/appId/len,而【真实密文解出来】是
type/app_id/org_id/len。三者互不一致 —— 赌任何一套都是错的。

本模块不做文件 IO、不做存证、不发 HTTP 响应,只做纯转换,因而完全可单测。
存证与响应由 server.py 负责(见 spec §5)。
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import lanxin_inbox

EVENT_TYPES = ("account_message", "bot_private_message", "bot_group_message")

_MAX_TEXT = 20000        # 单条回复的存储上限,防止异常长文本撑爆 store


def _pick(d: Dict[str, Any], *names: str) -> Any:
    """按顺序取第一个存在的键。用于吸收文档与实现的键名分歧。"""
    for n in names:
        if n in d:
            return d[n]
    return None


def parse_envelope(plain: str) -> Dict[str, Any]:
    """解析解密后的明文信封。失败抛 ValueError,由上层落「未解析」。"""
    try:
        obj = json.loads(plain)
    except (TypeError, ValueError) as e:
        raise ValueError("信封不是合法 JSON: %s" % e)
    if not isinstance(obj, dict):
        raise ValueError("信封顶层不是对象")
    events = obj.get("events")
    if not isinstance(events, list):
        raise ValueError("events 缺失或不是数组")

    norm: List[Dict[str, Any]] = []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        norm.append({
            "id": ev.get("id") or "",
            "type": _pick(ev, "type", "eventType") or "",
            "data": ev.get("data") if isinstance(ev.get("data"), dict) else {},
        })
    return {
        "appId": _pick(obj, "app_id", "appId") or "",
        "orgId": _pick(obj, "org_id", "orgId") or "",
        "events": norm,
    }


def _extract_text(data: Dict[str, Any]) -> Optional[str]:
    """取回复正文。两种已知形态:
      ① {"msgData": {"text": {"content": "..."}}}   —— 事件列表文档
      ② {"msg_text": "..."}                          —— 官方密文样本
    取不到返回 None,由调用方落「未解析」。"""
    flat = _pick(data, "msg_text", "msgText")
    if isinstance(flat, str) and flat:
        return flat
    msg_data = data.get("msgData")
    if isinstance(msg_data, dict):
        text = msg_data.get("text")
        if isinstance(text, dict):
            content = text.get("content")
            if isinstance(content, str) and content:
                return content
    return None


def event_to_item(event: Dict[str, Any], store: Dict[str, Any],
                  received_at: str) -> Dict[str, Any]:
    """把一个规整后的事件转成收件箱条目。

    【绝不抛错、绝不丢弃】—— 看不懂的一律落 status="unparsed" 并保留原始 data,
    让超管在收件箱里看得见(仓库既有约定:不静默丢弃)。
    """
    ev_id = event.get("id") or ""
    ev_type = event.get("type") or ""
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    staff_id = _pick(data, "from", "staff_id", "staffId") or ""
    ident = lanxin_inbox.resolve_identity(store, staff_id)
    msg_type = _pick(data, "msgType", "msg_type") or ""
    text = _extract_text(data)

    unparsed_reason = None
    if ev_type not in EVENT_TYPES:
        unparsed_reason = "未订阅或未知的事件类型"
    elif text is None:
        unparsed_reason = "非文本消息或正文字段缺失"

    return {
        # 无 id 的事件无法去重,但绝不能丢 —— 用接收时间兜底
        "id": ("evt-%s" % ev_id) if ev_id else ("raw-%s" % received_at),
        "receivedAt": received_at,
        "status": "unparsed" if unparsed_reason else "parsed",
        "unparsedReason": unparsed_reason,
        "eventType": ev_type,
        "staffId": staff_id,
        "employId": ident["employId"],
        "name": ident["name"],
        "msgType": msg_type,
        "text": (text or "")[:_MAX_TEXT],
        "rawMsgData": data.get("msgData") if isinstance(data.get("msgData"), dict) else {},
        "groupId": _pick(data, "groupId", "group_id"),
        "groupName": _pick(data, "groupName", "group_name"),
        "handled": False,
        "handledInfo": None,
    }
