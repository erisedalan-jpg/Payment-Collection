# budget_store.py
"""概算工具:报价存档(服务端持久化)。纯标准库 + 原子写,可单测。

为什么要有这个文件:原工具把存档写在浏览器 localStorage —— 单机 HTML 里够用,搬到多人
服务器上就意味着换台电脑看不到、清缓存全丢、同事之间无法共享、无法审计。本模块把存档
落到服务端,按账号隔离(普通管理员只见自己的;超管可看全部)。

每条记录冻结当时的完整费率快照(rateSnapshot):费率可配之后,"同一份报价什么时候打开都是
同一个数"不再是白捡的保证 —— 报价是对外正式产物(要拿去 CRM 上单),必须可复现。

本模块只管数据形状与存取,不判权:upsert_estimate/delete_estimate 的调用方(server 端
handler)必须先用 can_touch() 做权限校验(owner 或超管)——职责分离,判权逻辑与调用上下文
(如何拿到当前登录账号/是否超管)绑得更紧,放在 server 层更合适。
"""
from __future__ import annotations

import json
import os
import secrets
from typing import Any, Dict, List, Optional

STORE_VERSION = 1

MAX_ESTIMATES = 2000          # 防呆上限:一份报价一条,2000 条远超实际用量
MAX_QUOTE_NAME_LEN = 200

_REQUIRED_KEYS = ("id", "account", "quoteName", "createdAt", "updatedAt",
                  "data", "rateSnapshot", "summary")


def new_store() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "estimates": []}


def _is_clean_record(e: Any) -> bool:
    return isinstance(e, dict) and all(k in e for k in _REQUIRED_KEYS)


def load_store(path: str) -> Dict[str, Any]:
    """读存档库;文件缺失/损坏 → 空库(降级不阻断)。脏条目静默剔除。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError):
        return new_store()
    if not isinstance(raw, dict):
        return new_store()
    items = raw.get("estimates")
    if not isinstance(items, list):
        return new_store()
    return {"version": STORE_VERSION,
            "estimates": [e for e in items if _is_clean_record(e)]}


def save_store(path: str, store: Dict[str, Any]) -> None:
    """原子写:先写 .tmp 再 os.replace,避免并发/崩溃留半截坏文件。"""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def validate_estimate(rec: Any) -> Dict[str, Any]:
    """校验一条待存记录(前端提交的)。非法 → ValueError。

    data / rateSnapshot / summary 的**内部结构不做深校验** —— 它们是前端表单与配置的
    原样快照,后端做深校验等于把口径复制一份到后端,两边必然漂移。这里只保证类型正确、
    体量可控;真正的口径由前端纯函数层(有 vitest)负责。
    """
    if not isinstance(rec, dict):
        raise ValueError("记录必须是对象")

    name = rec.get("quoteName")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("报价名称不能为空")
    if len(name) > MAX_QUOTE_NAME_LEN:
        raise ValueError("报价名称过长(上限 %d)" % MAX_QUOTE_NAME_LEN)

    for key, label in (("data", "表单数据"),
                       ("rateSnapshot", "费率快照"),
                       ("summary", "计算摘要")):
        if not isinstance(rec.get(key), dict):
            raise ValueError("%s 必须是对象" % label)

    return {
        "id": str(rec.get("id") or "").strip(),   # 空 → 新建;非空但不存在 → 也当新建
        "quoteName": name.strip(),
        "data": rec["data"],
        "rateSnapshot": rec["rateSnapshot"],
        "summary": rec["summary"],
    }


def _new_id() -> str:
    return "e_" + secrets.token_hex(8)


def find_estimate(store: Dict[str, Any], eid: str) -> Optional[Dict[str, Any]]:
    return next((e for e in store.get("estimates", []) if e.get("id") == eid), None)


def can_touch(rec: Dict[str, Any], account: str, is_super: bool) -> bool:
    """owner 或超管才能覆盖/删除/读取整条记录。"""
    return bool(is_super) or rec.get("account") == account


def upsert_estimate(store: Dict[str, Any], rec: Any,
                    account: str, now_iso: str) -> Dict[str, Any]:
    """有 id 且库中存在 → 覆盖(**owner 与 createdAt 保持不变**);否则新建。

    调用方(server)负责在覆盖前用 can_touch 判权 —— 本函数不判权,只管数据。
    """
    clean = validate_estimate(rec)
    eid = clean.pop("id")
    existing = find_estimate(store, eid) if eid else None

    if existing is not None:
        existing.update(clean)
        existing["updatedAt"] = now_iso        # owner/createdAt 刻意不动
        return existing

    if len(store.get("estimates", [])) >= MAX_ESTIMATES:
        raise ValueError("存档数量已达上限 %d,请先删除一些旧报价" % MAX_ESTIMATES)

    row = dict(clean)
    row["id"] = _new_id()
    row["account"] = account
    row["createdAt"] = now_iso
    row["updatedAt"] = now_iso
    store.setdefault("estimates", []).append(row)
    return row


def delete_estimate(store: Dict[str, Any], eid: str) -> bool:
    items = store.get("estimates", [])
    for i, e in enumerate(items):
        if e.get("id") == eid:
            items.pop(i)
            return True
    return False


def meta_of(rec: Dict[str, Any]) -> Dict[str, Any]:
    """列表用的轻量元信息:**不含 data / rateSnapshot**。

    rateSnapshot 是整份配置(含 19 个产品的长说明),一条就十几 KB;列表若把它一起下发,
    几十条就是几 MB。列表只给摘要(把 summary 展平进 meta),打开某一条时再单独取整条。
    """
    s = rec.get("summary") or {}
    return {
        "id": rec.get("id"),
        "account": rec.get("account"),
        "quoteName": rec.get("quoteName"),
        "createdAt": rec.get("createdAt"),
        "updatedAt": rec.get("updatedAt"),
        "customerName": s.get("customerName", ""),
        "salesName": s.get("salesName", ""),
        "projectAmount": s.get("projectAmount"),
        "totalCost": s.get("totalCost"),
        "salesAmount": s.get("salesAmount"),
        "costRatio": s.get("costRatio"),
        "ratioStatus": s.get("ratioStatus"),
    }


def list_meta(store: Dict[str, Any], account: str, is_super: bool,
              all_accounts: bool = False) -> List[Dict[str, Any]]:
    """按 updatedAt 倒序。all_accounts 只对超管生效 —— 普通管理员传 True 也只拿自己的
    (前端传什么都不能突破后端的隔离)。"""
    items = store.get("estimates", [])
    if not (is_super and all_accounts):
        items = [e for e in items if e.get("account") == account]
    rows = [meta_of(e) for e in items]
    rows.sort(key=lambda r: r.get("updatedAt") or "", reverse=True)
    return rows
