# lanxin_unresponded.py
"""未响应清单 —— 纯派生视图,不新增任何数据文件。

数据全部来自 lanxin_inbox 的 store:
  sent[]  = 推了谁 / 何时 / 涉及哪些项目(record_sent 写入,留存 90 天,【只记成功项】)
  items[] = 谁回了(一期 = 文本回复;二期 H5 反馈也进这里 → 清单自动变准,代码零改动)

【精度边界 —— 调用方 UI 必须标明】
一期判定是「人级」不是「项目级」:一期唯一的回流是文本回复,而回复正文里【没有
项目信息】—— 某人在推送后回了任意一条,该批次即算已响应。二期 H5 反馈携带
projectId 后方可下钻到项目级。行模型(一行 = 一条 sent 记录)一期二期通用,
二期只增下钻,不推倒重来。

本模块无 IO、无全局状态,完全可单测。
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

# 时间戳格式【不在本模块声明】,一律用台账写入方的单一来源。此前这里是第二份同值
# 拷贝,而写入端(server.py 的 handler)还有第三份字面量 —— 三处无 import 关系、
# 无契约测试,任一处漂移都会让本模块的 _parse 全部返回 None:dueAt 恒空、overdue 恒 False,
# 默认「仅未响应」视图【永远空着】,看上去像"大家都回了",全程零报错。
from lanxin_inbox import TS_FMT


def _parse(ts: Any) -> Optional[datetime]:
    try:
        return datetime.strptime(str(ts), TS_FMT)
    except (TypeError, ValueError):
        return None


def compute(store: Dict[str, Any], deadline_hours: int, now: str) -> List[Dict[str, Any]]:
    """→ 每条推送一行,按 sentAt 倒序(最新在前)。

    overdue   = now >= sentAt + deadline_hours(【>=】:恰好到点即算超时)
    responded = 存在 item 满足 staffId 相同 且 receivedAt >= sentAt
                (【>=】:同秒相等算响应 —— 时间戳精度只到秒,卡在相等判未响应会冤枉人)
                (【方向】:推送【之前】的旧回复不算 —— 否则三个月前回过一次的人永远显示已响应)

    sentAt 解析失败的记录【保留】,dueAt='' / overdue=False;绝不丢弃 ——
    丢掉的话「推了但时间戳坏了」的人会从清单上凭空消失,比显示不全更糟。

    role 原样透出('primary' 本人明细卡 / 'supervisor' 上级汇总卡 / '' 老台账)。
    【为什么必须带上】:汇总卡上【没有】动作要求、没有任何 N 小时反馈承诺
    (build_summary_card 本期零改动,已核实),上级压根没被要求反馈 —— 不区分角色的话,
    超管打开默认的「仅未响应」视图会看到一片上级,去催得到的回答是「我这张卡没让我反馈」。
    本模块只如实透出,【不在此处过滤】:清单同时还要当完整台账用,过滤是展示端的选择。
    """
    now_dt = _parse(now)
    # 按 staffId 归拢回复时间,避免逐条 sent 都全表扫 items
    replies: Dict[str, List[datetime]] = {}
    for it in store.get("items") or []:
        ts = _parse(it.get("receivedAt"))
        if ts is not None:
            replies.setdefault(str(it.get("staffId") or ""), []).append(ts)

    out: List[Dict[str, Any]] = []
    for s in store.get("sent") or []:
        sent_dt = _parse(s.get("sentAt"))
        staff = str(s.get("staffId") or "")
        after = sorted(t for t in replies.get(staff, [])
                       if sent_dt is not None and t >= sent_dt)
        due_dt = (sent_dt + timedelta(hours=deadline_hours)) if sent_dt else None
        out.append({
            "sentAt": str(s.get("sentAt") or ""),
            "employId": str(s.get("employId") or ""),
            "name": str(s.get("name") or ""),
            "routeKey": str(s.get("routeKey") or ""),
            # 老台账(V4.5.8 之前)没有 role → 空串,不被展示端排除、不丢行
            "role": str(s.get("role") or ""),
            "projectCount": len(s.get("projectIds") or []),
            "dueAt": due_dt.strftime(TS_FMT) if due_dt else "",
            "overdue": bool(due_dt and now_dt and now_dt >= due_dt),
            "responded": bool(after),
            "firstResponseAt": after[0].strftime(TS_FMT) if after else "",
        })
    out.sort(key=lambda r: r["sentAt"], reverse=True)
    return out
