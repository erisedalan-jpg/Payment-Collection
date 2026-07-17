# lanxin.py
"""蓝信开放平台客户端。纯标准库(urllib),无第三方依赖。

铁律:appSecret / appToken 绝不进异常消息、日志、审计。本模块所有错误只带 errCode/errMsg。
接口事实(官方文档):所有返回含 errCode/errMsg,errCode==0 才是成功;appToken 有效期 7200s。
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

HTTP_TIMEOUT = 15
TOKEN_EARLY_EXPIRE = 300          # 提前 5 分钟视为过期,避免边界失败
MAX_RECIPIENTS = 1000             # 蓝信文档:userIdList 最多 1000
RATE_LIMIT_CODE = 56008
NO_PERMISSION_CODE = 10005
RETRY_BACKOFF = (1, 2, 4)         # 仅用于 56008

_token_cache: Dict[str, Any] = {}
_token_lock = threading.Lock()


class LanxinError(Exception):
    def __init__(self, err_code: int, err_msg: str):
        self.err_code = err_code
        self.err_msg = err_msg
        super().__init__("蓝信接口错误 %s: %s" % (err_code, err_msg))


def _reset_token_cache() -> None:
    """测试用:清空 appToken 缓存。"""
    with _token_lock:
        _token_cache.clear()


def _http(url: str, data: Optional[bytes] = None,
          headers: Optional[Dict[str, str]] = None, timeout: int = HTTP_TIMEOUT) -> Dict[str, Any]:
    """单次 HTTP 调用 → 解析后的 JSON。测试通过 monkeypatch 替换本函数。"""
    req = urllib.request.Request(url, data=data, headers=headers or {},
                                 method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise LanxinError(-1, "HTTP %s" % e.code)
    except urllib.error.URLError as e:
        raise LanxinError(-1, "网络不可达:%s" % type(e.reason).__name__)
    except json.JSONDecodeError:
        raise LanxinError(-1, "响应不是合法 JSON")


def _gateway(cfg: Dict[str, Any]) -> str:
    gw = ((cfg.get("credentials") or {}).get("apiGateway") or "").rstrip("/")
    if not gw:
        raise LanxinError(-1, "未配置开放平台网关地址")
    return gw


def _unwrap(resp: Dict[str, Any]) -> Dict[str, Any]:
    """errCode==0 → data;否则抛 LanxinError。errMsg 原样透传(蓝信自己的文案,不含我方密钥)。"""
    code = resp.get("errCode")
    if code != 0:
        raise LanxinError(int(code) if isinstance(code, int) else -1,
                          str(resp.get("errMsg") or "未知错误"))
    return resp.get("data") or {}


def get_app_token(cfg: Dict[str, Any]) -> str:
    """GET /v1/apptoken/create。按 appId 缓存(expiresIn 7200s,提前 300s 视为过期)。"""
    cred = cfg.get("credentials") or {}
    app_id = cred.get("appId") or ""
    with _token_lock:
        hit = _token_cache.get(app_id)
        if hit and hit["exp"] > time.time():
            return hit["token"]
    gw = _gateway(cfg)
    q = urllib.parse.urlencode({"grant_type": "client_credential",
                                "appid": app_id, "secret": cred.get("appSecret") or ""})
    data = _unwrap(_http("%s/v1/apptoken/create?%s" % (gw, q)))
    token = data.get("appToken") or ""
    expires = int(data.get("expiresIn") or 7200)
    with _token_lock:
        _token_cache[app_id] = {"token": token, "exp": time.time() + expires - TOKEN_EARLY_EXPIRE}
    return token


def id_mapping(cfg: Dict[str, Any], token: str, emp_id: str) -> str:
    """GET /v2/staffs/id_mapping/fetch → staffId。id_type 取自配置(默认 employ_id)。"""
    cred = cfg.get("credentials") or {}
    q = urllib.parse.urlencode({
        "app_token": token, "org_id": cred.get("orgId") or "",
        "id_type": cred.get("idType") or "employ_id", "id_value": emp_id,
    })
    data = _unwrap(_http("%s/v2/staffs/id_mapping/fetch?%s" % (_gateway(cfg), q)))
    return data.get("staffId") or ""


def send_message(cfg: Dict[str, Any], token: str, staff_ids: List[str],
                 msg_data: Dict[str, Any]) -> Dict[str, Any]:
    """POST /v1/messages/create。msgType 由 msg_data 的唯一键推断(text/appCard/...)。
    56008 限流 → 退避重试;10005 无权限 → 立即失败(重试无用)。"""
    if len(staff_ids) > MAX_RECIPIENTS:
        raise ValueError("userIdList 最多 %d 个,当前 %d" % (MAX_RECIPIENTS, len(staff_ids)))
    keys = list(msg_data.keys())
    if len(keys) != 1:
        raise ValueError("msgData 必须且只能含一个消息体键")
    body = json.dumps({"userIdList": list(staff_ids), "msgType": keys[0], "msgData": msg_data},
                      ensure_ascii=False).encode("utf-8")
    url = "%s/v1/messages/create?%s" % (_gateway(cfg),
                                        urllib.parse.urlencode({"app_token": token}))
    headers = {"Content-Type": "application/json"}

    last: Optional[LanxinError] = None
    for attempt in range(len(RETRY_BACKOFF) + 1):
        try:
            return _unwrap(_http(url, data=body, headers=headers))
        except LanxinError as e:
            if e.err_code != RATE_LIMIT_CODE:
                raise
            last = e
            if attempt < len(RETRY_BACKOFF):
                time.sleep(RETRY_BACKOFF[attempt])
    raise last            # type: ignore[misc]


# ── 编排:build_plan(纯计算) / dispatch(真发) ─────────────────────────────
#
# preview 与 send 必须走同一个 build_plan —— 「所见即所发」是结构保证,不是约定。
# 禁止为预览另写简化逻辑。

from lanxin_recipients import (           # noqa: E402  (置于此处以免与客户端段落交叉引用)
    build_project_card, build_summary_card, build_timesheet_card,
    resolve_project_manager, short_issue, supervisor_chain,
)

_LEVEL_LABELS = {1: "直接上级（+1）", 2: "隔级上级（+2）", 3: "部门级（+3）",
                 4: "上级（+4）", 5: "上级（+5）"}


def _route(cfg: Dict[str, Any], key: str) -> Optional[Dict[str, Any]]:
    for r in cfg.get("routes") or []:
        if r.get("key") == key and r.get("enabled"):
            return r
    return None


def _descend_owner(tree: Dict[str, Any], sup_id: str, emp_id: str) -> Optional[str]:
    """emp_id 向上走,找到 sup_id 的那个【直接下属】 —— 汇总卡按直接下属聚合、逐层卷上去。
    emp_id 本身就是 sup_id 的直接下属时返回自己。"""
    by_id = tree["byId"]
    cur = emp_id
    seen = set()
    while cur and cur not in seen and cur in by_id:
        seen.add(cur)
        nxt = by_id[cur].get("supId")
        if nxt == sup_id:
            return cur
        cur = nxt
    return None


def _sum_ts_counts(issues: List[Dict[str, Any]]) -> Dict[str, int]:
    """工时 issues 列表([{'label','count',...}, ...]) → {label: 合计条数}(同 label 合并)。"""
    out: Dict[str, int] = {}
    for i in issues:
        out[i["label"]] = out.get(i["label"], 0) + int(i["count"])
    return out


def _rollup(counts_by_emp: Dict[str, Dict[str, int]], levels: int,
           tree: Dict[str, Any]) -> Dict[str, Dict[str, Dict[str, int]]]:
    """{emp: {标签: 计数}} → {sup: {直接下属: {标签: 计数}}}(逐层卷上去)。
    项目路由与工时路由共用此聚合 —— 两者都是「primary 工号 → {标签: 计数}」的形状,
    只是标签含义不同(原因 vs 问题码),数值对聚合逻辑而言无差别。"""
    agg: Dict[str, Dict[str, Dict[str, int]]] = {}
    for emp, counts in counts_by_emp.items():
        for sup in supervisor_chain(tree, emp, levels):
            owner = _descend_owner(tree, sup, emp)
            if not owner:
                continue
            slot = agg.setdefault(sup, {}).setdefault(owner, {})
            for label, n in counts.items():
                slot[label] = slot.get(label, 0) + n
    return agg


def build_plan(items: List[Dict[str, Any]], cfg: Dict[str, Any],
               tree: Dict[str, Any], project_pmis: Dict[str, Any]) -> Dict[str, Any]:
    """事项 → 收件计划。纯计算,不发任何网络请求。
    项目侧:projectId → 项目经理(姓名) → 工号(后端自行推导,不信任前端);工时侧:employId 直连。"""
    unresolved: List[Dict[str, Any]] = []
    # primary 工号 → {原因: [项目名/条数]}
    proj_by_emp: Dict[str, Dict[str, List[str]]] = {}
    ts_by_emp: Dict[str, List[Dict[str, Any]]] = {}
    ts_range = {"start": "", "end": ""}

    r_proj = _route(cfg, "project")
    r_ts = _route(cfg, "timesheet")

    for it in items:
        kind = it.get("kind")
        if kind == "project" and r_proj:
            allowed = set(r_proj.get("reasons") or [])
            reasons = [x for x in (it.get("reasons") or []) if x in allowed]
            if not reasons:
                continue
            pid = it.get("projectId")
            pm = project_pmis.get(pid)
            if pm is None:
                unresolved.append({"kind": "project", "id": pid, "name": "", "reason": "项目不存在"})
                continue
            team = pm.get("team") or {}
            emp, why = resolve_project_manager(tree, team)
            if not emp:
                unresolved.append({"kind": "project", "id": pid,
                                   "name": str(team.get("项目经理") or ""), "reason": why})
                continue
            bucket = proj_by_emp.setdefault(emp, {})
            for r in reasons:
                bucket.setdefault(r, []).append(str(pm.get("projectName") or pid))
        elif kind == "timesheet" and r_ts:
            allowed = set(r_ts.get("issueCodes") or [])
            issues = [i for i in (it.get("issues") or []) if i.get("code") in allowed]
            if not issues:
                continue
            emp = str(it.get("employId") or "").strip().upper()
            if emp not in tree["byId"]:
                unresolved.append({"kind": "timesheet", "id": emp, "name": "",
                                   "reason": "工号不在花名册"})
                continue
            ts_by_emp.setdefault(emp, []).extend(issues)
            ts_range["start"] = it.get("start") or ts_range["start"]
            ts_range["end"] = it.get("end") or ts_range["end"]

    recipients: List[Dict[str, Any]] = []
    by_id = tree["byId"]

    # ① primary 卡
    if r_ts and r_ts["recipients"]["primary"]:
        for emp in sorted(ts_by_emp):
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "card": build_timesheet_card(by_id[emp]["name"], ts_by_emp[emp],
                                             ts_range["start"], ts_range["end"]),
            })
    if r_proj and r_proj["recipients"]["primary"]:
        for emp in sorted(proj_by_emp):
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "card": build_project_card(by_id[emp]["name"], proj_by_emp[emp]),
            })

    # ② 汇总卡:按【直接下属】聚合,数字是该下属整棵子树的合计。
    # 两条路由都支持:spec §4.1「任一 → supervisor」——之前只认 project,timesheet 的
    # supervisorLevels 控件存了个不生效的值(I-1)。levels<=0 时 supervisor_chain 恒空,
    # agg 自然为空、不出汇总卡,故此处两路由写法对称、无需分支判空。
    if r_ts:
        ts_levels = r_ts["recipients"]["supervisorLevels"]
        ts_counts = {emp: _sum_ts_counts(issues) for emp, issues in ts_by_emp.items()}
        agg = _rollup(ts_counts, ts_levels, tree)
        for sup in sorted(agg):
            rows = []
            for owner, counts in agg[sup].items():
                rows.append({"name": by_id[owner]["name"],
                             "total": sum(counts.values()),
                             "reasons": list(counts.items())})
            label = _LEVEL_LABELS.get(_level_of(tree, sup, ts_by_emp), "上级汇总")
            recipients.append({
                "employId": sup, "name": by_id[sup]["name"], "role": "supervisor",
                "card": build_summary_card(by_id[sup]["name"], rows, label,
                                           unit="条", head_title="工时填报提醒",
                                           title_fmt="你的团队工时填报存在 %d 条问题",
                                           label_fn=short_issue),
            })
    if r_proj:
        levels = r_proj["recipients"]["supervisorLevels"]
        proj_counts = {emp: {reason: len(names) for reason, names in by_reason.items()}
                       for emp, by_reason in proj_by_emp.items()}
        agg = _rollup(proj_counts, levels, tree)
        for sup in sorted(agg):
            rows = []
            for owner, counts in agg[sup].items():
                rows.append({"name": by_id[owner]["name"],
                             "total": sum(counts.values()),
                             "reasons": list(counts.items())})
            label = _LEVEL_LABELS.get(_level_of(tree, sup, proj_by_emp), "上级汇总")
            recipients.append({
                "employId": sup, "name": by_id[sup]["name"], "role": "supervisor",
                "card": build_summary_card(by_id[sup]["name"], rows, label),
            })

    return {"recipients": recipients, "unresolved": unresolved,
            "totals": {"recipients": len(recipients), "unresolved": len(unresolved)}}


MAX_LEVELS_PROBE = 5


def _level_of(tree: Dict[str, Any], sup_id: str, by_emp: Dict[str, Any]) -> int:
    """sup 相对于命中他的 primary 的最小级差(用于卡片副标题文案)。
    by_emp 只用其 key(primary 工号集合)——project/timesheet 两路由共用,值形状无关。"""
    best = 99
    for emp in by_emp:
        ch = supervisor_chain(tree, emp, MAX_LEVELS_PROBE)
        if sup_id in ch:
            best = min(best, ch.index(sup_id) + 1)
    return best if best != 99 else 1


def dispatch(plan: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """按 plan 真发。串行 + 间隔(单线程 HTTPServer,且限流阈值未知);
    单人失败不中断整批,如实计入 failed。"""
    token = get_app_token(cfg)
    interval = int(cfg.get("sendIntervalMs") or 0) / 1000.0
    staff_cache: Dict[str, str] = {}
    sent = 0
    failed: List[Dict[str, Any]] = []
    msg_ids: List[str] = []

    for r in plan["recipients"]:
        emp = r["employId"]
        try:
            sid = staff_cache.get(emp)
            if not sid:
                sid = id_mapping(cfg, token, emp)
                if not sid:
                    raise LanxinError(-1, "未换到 staffId")
                staff_cache[emp] = sid
            data = send_message(cfg, token, [sid], {"appCard": r["card"]})
            if data.get("invalidStaff"):
                raise LanxinError(-1, "蓝信侧认为该人员ID无效")
            sent += 1
            if data.get("msgId"):
                msg_ids.append(data["msgId"])
        except LanxinError as e:
            failed.append({"employId": emp, "name": r["name"],
                           "errCode": e.err_code, "errMsg": e.err_msg})
        except Exception as e:                      # 兜底:绝不让单人异常炸掉整批
            failed.append({"employId": emp, "name": r["name"],
                           "errCode": -1, "errMsg": type(e).__name__})
        if interval:
            time.sleep(interval)

    return {"sent": sent, "failed": failed, "msgIds": msg_ids}
