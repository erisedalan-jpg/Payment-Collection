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

import lanxin_config
import lanxin_review

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
    """GET /v1/apptoken/create。按 appId 缓存(expiresIn 7200s,提前 300s 视为过期)。
    errCode==0 但响应体没有 appToken(字段改名/网关裁剪/灰度返回空)时必须当失败处理 ——
    否则会缓存空 token 并在自检里显示「第①步通过」,后面的步骤无声中止,超管无从判断坏在哪(M-1)。"""
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
    if not token:
        raise LanxinError(-1, "响应未含 appToken")
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


ACCOUNT_MESSAGE_PATH = "/v1/messages/create"        # 应用号:回调事件 account_message
BOT_MESSAGE_PATH = "/v1/bot/messages/create"        # 智能机器人:回调 bot_private_message


def _send(cfg: Dict[str, Any], token: str, staff_ids: List[str],
          msg_data: Dict[str, Any], path: str) -> Dict[str, Any]:
    """两种发送身份的共用实现。msgType 由 msg_data 的唯一键推断(text/appCard/...)。
    56008 限流 → 退避重试;其余错误(如 10005 无权限)立即失败,重试无用。
    两个接口的请求体、收件上限、错误码完全一致,唯一差异是 path。"""
    if len(staff_ids) > MAX_RECIPIENTS:
        raise ValueError("userIdList 最多 %d 个,当前 %d" % (MAX_RECIPIENTS, len(staff_ids)))
    keys = list(msg_data.keys())
    if len(keys) != 1:
        raise ValueError("msgData 必须且只能含一个消息体键")
    body = json.dumps({"userIdList": list(staff_ids), "msgType": keys[0], "msgData": msg_data},
                      ensure_ascii=False).encode("utf-8")
    url = "%s%s?%s" % (_gateway(cfg), path,
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


def send_message(cfg: Dict[str, Any], token: str, staff_ids: List[str],
                 msg_data: Dict[str, Any]) -> Dict[str, Any]:
    """以【应用号】身份发送。"""
    return _send(cfg, token, staff_ids, msg_data, ACCOUNT_MESSAGE_PATH)


def send_bot_message(cfg: Dict[str, Any], token: str, staff_ids: List[str],
                     msg_data: Dict[str, Any]) -> Dict[str, Any]:
    """以【智能机器人】身份发送。须组织管理员已开通机器人能力。"""
    return _send(cfg, token, staff_ids, msg_data, BOT_MESSAGE_PATH)


# ── 编排:build_plan(纯计算) / dispatch(真发) ─────────────────────────────
#
# preview 与 send 必须走同一个 build_plan —— 「所见即所发」是结构保证,不是约定。
# 禁止为预览另写简化逻辑。

from lanxin_recipients import (           # noqa: E402  (置于此处以免与客户端段落交叉引用)
    build_action_hint, build_project_card, build_summary_card, build_timesheet_card,
    resolve_project_manager, short_issue, supervisor_chain,
)

# 汇总卡副标题:逐项配置后一张卡里的行可能来自不同级别,写「直接上级（+1）」会自相矛盾。
# 顺带清掉 V4.0.0 终审记的 M-2(_level_of 取全局最小值、探测深度写死 5)。
SUMMARY_SUBTITLE = "团队汇总"


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


def _merge_agg(dst: Dict[str, Dict[str, Dict[str, int]]],
               src: Dict[str, Dict[str, Dict[str, int]]]) -> None:
    """把一次 _rollup 的产出合并进累计结果(sup → owner → {标签: 计数} 三层就地相加)。

    注:当前调用方 _rollup_by_levels 给每个标签只分一个 levels 组,故同一个 (sup, owner)
    在不同组里携带的标签集合互斥,最内层的 `+` 实际恒等于赋值(终审 M-4 指出这一点)。
    仍写成累加而非覆盖:一是「合并」语义本就该累加,写成赋值会让人误以为可以安全覆盖;
    二是将来若改成一个标签可属多组(例如同时报本级与部门级),累加是唯一正确的行为,
    而覆盖会静默丢数。"""
    for sup, owners in src.items():
        d = dst.setdefault(sup, {})
        for owner, counts in owners.items():
            c = d.setdefault(owner, {})
            for label, n in counts.items():
                c[label] = c.get(label, 0) + n


def _rollup_by_levels(counts_by_emp: Dict[str, Dict[str, int]],
                      label_levels: Dict[str, int],
                      tree: Dict[str, Any]) -> Dict[str, Dict[str, Dict[str, int]]]:
    """逐项配置版聚合:不同标签可能配不同的 supervisorLevels,按 levels 分组各卷一次再合并。
    V4.0.1 及以前是「一次 _rollup 传单个 levels」,表达不了「回款延期报到 +1、数据异常报到 +3」。
    _rollup 与 _descend_owner 本身不用改 —— 阻碍只在调用方式。"""
    groups: Dict[int, List[str]] = {}
    for label, lv in label_levels.items():
        if lv > 0:
            groups.setdefault(lv, []).append(label)
    agg: Dict[str, Dict[str, Dict[str, int]]] = {}
    for lv, labels in sorted(groups.items()):
        allow = set(labels)
        subset: Dict[str, Dict[str, int]] = {}
        for emp, counts in counts_by_emp.items():
            sub = {k: v for k, v in counts.items() if k in allow}
            if sub:
                subset[emp] = sub
        if subset:
            _merge_agg(agg, _rollup(subset, lv, tree))
    return agg


def _items_of(route: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """route → {code: item}。route 为 None(未配置/未启用)时返回空表。"""
    if not route:
        return {}
    return {i["code"]: i for i in (route.get("items") or [])}


def _norm_reasons(raw: Any) -> List[Dict[str, str]]:
    """事项里的 reasons 归一化成 [{"category":…, "detail":…}]。

    两种形态都认:
      新(V4.5.8+): [{"category": "回款延期", "detail": "3 个延期节点"}]
      旧(≤V4.5.7): ["回款延期"]                     → detail 补空串

    保留旧形【不是】为了「以后还能用」,而是为了【浏览器缓存窗口】:
    升级同时替换 dist 与 .py,但用户浏览器里可能还留着旧 index.html,
    它 POST 上来的就是旧形。只认新形的话 r.get("category") 对字符串会抛
    AttributeError,那几分钟内的推送直接 400。

    形态不认的元素【丢弃】而非报错:事项是前端算出来的展示数据,
    一条畸形不该让整批推送失败(收件人解析仍全在后端,丢一条最多少推一个原因)。
    """
    out: List[Dict[str, str]] = []
    for r in raw or []:
        if isinstance(r, str) and r:
            out.append({"category": r, "detail": ""})
        elif isinstance(r, dict) and r.get("category"):
            out.append({"category": str(r["category"]),
                        "detail": str(r.get("detail") or "")})
    return out


def build_plan(items: List[Dict[str, Any]], cfg: Dict[str, Any],
               tree: Dict[str, Any], project_pmis: Dict[str, Any],
               now: str = "", review_secret: str = "") -> Dict[str, Any]:
    """事项 → 收件计划。纯计算,不发任何网络请求。
    项目侧:projectId → 项目经理(姓名) → 工号(后端自行推导,不信任前端);工时侧:employId 直连。
    V4.0.2 起每一项(问题码/关注原因)各自配 enabled/primary/supervisorLevels。

    V4.0.5:回调双凭证都配齐时,四种卡片一律附回复引导语 REPLY_HINT。
    这是入站半环唯一的「告知」环节 —— 不接线的话卡片上没有任何提示,
    没人知道这张卡能回,于是没人回、收件箱恒空,而链路本身完全正常,
    排查者会去查验签、查 nginx、查蓝信后台,什么都查不出来。"""
    unresolved: List[Dict[str, Any]] = []
    proj_by_emp: Dict[str, Dict[str, List[str]]] = {}
    # 与 proj_by_emp 并行的独立桶:proj_by_emp 存【项目名称】(卡片文案用,不可动);
    # 本桶只存【项目号】,供归入功能拿去当跟进域的 key(Task 6)。projectName 聚合过程
    # 会丢项目号(bucket.append 只存了名字),故必须另开一桶,不能从 proj_by_emp 反推。
    proj_ids_by_emp: Dict[str, List[str]] = {}
    # 第三个与 proj_by_emp 并行的桶:存【按项目聚合的原因明细】,供新版 primary 卡组行。
    # 【绝不重塑 proj_by_emp】—— 上级汇总卡的 proj_counts 依赖它的 {原因: [项目名]} 形状,
    # 改形会连带砸掉汇总卡。并行桶是本文件既有范式(proj_ids_by_emp 就是这么加的)。
    proj_detail_by_emp: Dict[str, Dict[str, List[Dict[str, str]]]] = {}
    # emp → 项目名 → 项目号。reviewItems 需要项目号(H5 越权写判据),而 proj_detail_by_emp
    # 是按项目名分组的(卡片文案用名字)。另开一份映射,不改并行桶形状 ——
    # 与 proj_ids_by_emp 同样是「并行桶」范式(见其上方注释)。
    # 【必须逐人分桶,不能是全局单层 name→pid】:proj_detail_by_emp 是 emp→name 两层,
    # 同名项目只在【同一个人内部】合并、跨人不合并 —— 现网不同项目起同名是真实可能的
    # (终审实测抓到)。若用全局单层映射,后处理到的人会把前一个人的项目号顶掉/读到,
    # 这不是"取错号"这么轻,reviewItems.projectId 是 H5 提交的【越权写判据】,
    # 串号直接变成跨人越权写。同一人内部仍是先到先得(与卡片行合并同一取舍)。
    name_to_pid: Dict[str, Dict[str, str]] = {}
    ts_by_emp: Dict[str, List[Dict[str, Any]]] = {}
    ts_range = {"start": "", "end": ""}
    # 工时 counts 按【中文 label】聚合,而配置按【英文 code】——分桶时顺手建映射,
    # 不去 import ISSUE_LABELS:本次数据没出现的 code 也不需要映射(counts 里没有它)。
    ts_label_to_code: Dict[str, str] = {}

    r_proj = _route(cfg, "project")
    r_ts = _route(cfg, "timesheet")
    proj_items = _items_of(r_proj)
    ts_items = _items_of(r_ts)

    # 回复引导语的开关:两个回调凭证【都】非空才算入站链路可用。
    # 只配一个 = 验签或解密必然失败,此时引导用户回复只会让回复石沉大海。
    _cred = cfg.get("credentials") or {}
    reply_hint = bool(str(_cred.get("callbackAesKey") or "").strip()) and \
        bool(str(_cred.get("callbackSignToken") or "").strip())

    review_base = str(cfg.get("reviewBaseUrl") or "").strip().rstrip("/")

    def _h5_url(emp: str, kind: str) -> str:
        """给某人某类推送签一个 H5 链接。base 或密钥缺一个就返回空串 ——
        此时 build_action_hint 自动退回「请直接回复本消息反馈」态或不输出动作要求,
        绝不因为签不出 token 让整批推送失败。
        """
        if not review_base or not review_secret:
            return ""
        try:
            tok = lanxin_review.issue_token(emp, kind, review_secret, int(time.time()))
        except ValueError:
            return ""          # kind 未知/密钥空:不发链接,不炸整批
        return "%s/review/%s" % (review_base, tok)

    # N 单一来源:cfg["reviewDeadlineHours"] —— 不能在这里另写一个字面量默认值,
    # 否则「卡上写 24 小时、清单按另一个数算」的事故(§4 已点名)会在这里复现。
    deadline_hours = int(cfg.get("reviewDeadlineHours")
                         or lanxin_config.DEFAULT_REVIEW_DEADLINE_HOURS)

    def _hint(h5: str) -> str:
        # N 单一来源:cfg["reviewDeadlineHours"],与未响应清单同源(见 V4.5.8)
        return build_action_hint(deadline_hours, h5_url=h5, reply_hint=reply_hint)

    for it in items:
        kind = it.get("kind")
        if kind == "project" and r_proj:
            reasons = [r for r in _norm_reasons(it.get("reasons"))
                       if (proj_items.get(r["category"]) or {}).get("enabled")]
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
            pname = str(pm.get("projectName") or pid)
            name_to_pid.setdefault(emp, {}).setdefault(pname, pid or "")
            for r in reasons:
                bucket.setdefault(r["category"], []).append(pname)
            proj_detail_by_emp.setdefault(emp, {}).setdefault(pname, []).extend(
                {"category": r["category"], "detail": str(r.get("detail") or "")}
                for r in reasons)
            ids = proj_ids_by_emp.setdefault(emp, [])
            if pid and pid not in ids:
                ids.append(pid)
        elif kind == "timesheet" and r_ts:
            issues = [i for i in (it.get("issues") or [])
                      if (ts_items.get(i.get("code")) or {}).get("enabled")]
            if not issues:
                continue
            emp = str(it.get("employId") or "").strip().upper()
            if emp not in tree["byId"]:
                unresolved.append({"kind": "timesheet", "id": emp, "name": "",
                                   "reason": "工号不在花名册"})
                continue
            ts_by_emp.setdefault(emp, []).extend(issues)
            for i in issues:
                ts_label_to_code[i["label"]] = i["code"]
            ts_range["start"] = it.get("start") or ts_range["start"]
            ts_range["end"] = it.get("end") or ts_range["end"]

    recipients: List[Dict[str, Any]] = []
    by_id = tree["byId"]

    # ① primary 卡:只放 primary=True 的项;过滤后为空则不出卡
    if r_ts:
        for emp in sorted(ts_by_emp):
            mine = [i for i in ts_by_emp[emp]
                    if (ts_items.get(i.get("code")) or {}).get("primary")]
            if not mine:
                continue
            h5 = _h5_url(emp, "timesheet")
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "routeKey": "timesheet", "projectIds": [],
                # 待办快照:H5 页从台账读它渲染表单(见 spec §4.5.1a)
                "reviewItems": [{"code": i.get("code") or "", "label": i["label"],
                                 "count": int(i["count"]),
                                 "lastDate": str(i.get("lastDate") or "")} for i in mine],
                "card": build_timesheet_card(by_id[emp]["name"], mine,
                                             ts_range["start"], ts_range["end"],
                                             action_hint=_hint(h5), sent_at=now,
                                             card_link=h5),
            })
    if r_proj:
        for emp in sorted(proj_by_emp):
            # primary 过滤语义不变:项目只要命中【任一】primary 原因就出现在卡上,
            # 且卡上只列它的 primary 原因。
            mine = []
            for pname, rs in (proj_detail_by_emp.get(emp) or {}).items():
                keep = [r for r in rs if (proj_items.get(r["category"]) or {}).get("primary")]
                if keep:
                    mine.append({"name": pname, "reasons": keep})
            if not mine:
                continue
            h5 = _h5_url(emp, "project")
            # reviewItems 要带 projectId(H5 提交时的越权写判据靠它),而 mine 只有项目名。
            # 从并行桶按【本人】名字取回项目号 —— name_to_pid 必须先按 emp 取子表再按
            # 名字取号,不能是全局单层映射(见 name_to_pid 声明处注释:同名跨人不合并)。
            recipients.append({
                "employId": emp, "name": by_id[emp]["name"], "role": "primary",
                "routeKey": "project", "projectIds": list(proj_ids_by_emp.get(emp) or []),
                "reviewItems": [{"projectId": (name_to_pid.get(emp) or {}).get(p["name"], ""),
                                 "name": p["name"], "reasons": list(p["reasons"])}
                                for p in mine],
                "card": build_project_card(by_id[emp]["name"], mine,
                                           action_hint=_hint(h5), sent_at=now,
                                           card_link=h5),
            })

    # ② 汇总卡:按 levels 分组多次卷、再按 sup/owner/标签三层合并。
    # 同一个 sup 被多项(可能不同级别)命中时只出【一张】卡 —— 「按人合并」在这里成立。
    # 副标题固定中性文案:一张卡里的行可能来自不同级别,写「直接上级」会自相矛盾。
    if r_ts:
        ts_counts = {emp: _sum_ts_counts(issues) for emp, issues in ts_by_emp.items()}
        ts_levels = {label: (ts_items.get(code) or {}).get("supervisorLevels", 0)
                     for label, code in ts_label_to_code.items()}
        agg = _rollup_by_levels(ts_counts, ts_levels, tree)
        for sup in sorted(agg):
            rows = [{"name": by_id[owner]["name"], "total": sum(counts.values()),
                     "reasons": list(counts.items())}
                    for owner, counts in agg[sup].items()]
            recipients.append({
                "employId": sup, "name": by_id[sup]["name"], "role": "supervisor",
                "routeKey": "timesheet", "projectIds": [], "reviewItems": [],
                "card": build_summary_card(by_id[sup]["name"], rows, SUMMARY_SUBTITLE,
                                           unit="条", head_title="工时填报提醒",
                                           title_fmt="你的团队工时填报存在 %d 条问题",
                                           label_fn=short_issue, reply_hint=reply_hint),
            })
    if r_proj:
        proj_counts = {emp: {reason: len(names) for reason, names in by_reason.items()}
                       for emp, by_reason in proj_by_emp.items()}
        proj_levels = {code: (item or {}).get("supervisorLevels", 0)
                       for code, item in proj_items.items()}
        agg = _rollup_by_levels(proj_counts, proj_levels, tree)
        for sup in sorted(agg):
            rows = [{"name": by_id[owner]["name"], "total": sum(counts.values()),
                     "reasons": list(counts.items())}
                    for owner, counts in agg[sup].items()]
            # 该 sup 名下所有 owner 的项目号并集,按首次出现顺序去重(owner 顺序 → owner 内顺序)。
            sup_ids: List[str] = []
            seen_ids: set = set()
            for owner in agg[sup]:
                for pid2 in proj_ids_by_emp.get(owner) or []:
                    if pid2 not in seen_ids:
                        seen_ids.add(pid2)
                        sup_ids.append(pid2)
            recipients.append({
                "employId": sup, "name": by_id[sup]["name"], "role": "supervisor",
                "routeKey": "project", "projectIds": sup_ids, "reviewItems": [],
                "card": build_summary_card(by_id[sup]["name"], rows, SUMMARY_SUBTITLE,
                                           reply_hint=reply_hint),
            })

    return {"recipients": recipients, "unresolved": unresolved,
            "totals": {"recipients": len(recipients), "unresolved": len(unresolved)}}


def dispatch(plan: Dict[str, Any], cfg: Dict[str, Any]) -> Dict[str, Any]:
    """按 plan 真发。串行 + 间隔(控速,限流阈值未知);
    单人失败不中断整批,如实计入 failed。
    发送身份由 cfg["sendAs"] 决定("bot" → 智能机器人,其余(含未配置)→ 应用号默认)。
    sentLog 只记成功项 —— 它是回调侧反查 staffId↔employId 身份的唯一依据,
    记入失败项会让人被错误地当成"推送过"去反查身份和推荐归入项目。"""
    token = get_app_token(cfg)
    interval = int(cfg.get("sendIntervalMs") or 0) / 1000.0
    sender = send_bot_message if cfg.get("sendAs") == "bot" else send_message
    sent_log: List[Dict[str, Any]] = []
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
            data = sender(cfg, token, [sid], {"appCard": r["card"]})
            if data.get("invalidStaff"):
                raise LanxinError(-1, "蓝信侧认为该人员ID无效")
            sent += 1
            if data.get("msgId"):
                msg_ids.append(data["msgId"])
            sent_log.append({
                "staffId": sid,
                "employId": emp,
                "name": r["name"],
                "routeKey": r.get("routeKey") or "",
                # role 决定这次推送要不要进《未响应清单》的待催视图:primary 卡带
                # 「N 小时内未反馈将列入《未响应清单》」的动作要求,supervisor 汇总卡
                # 【没有任何反馈时限承诺】。不记 role,上级会被清单当成"该催的人"。
                "role": r.get("role") or "",
                # 待办快照 → H5 页从台账读它渲染表单(spec §4.5.1a)。
                # 也是 H5 提交的【越权写判据】:提交的 projectId 必须落在这里面。
                "reviewItems": list(r.get("reviewItems") or []),
                "projectIds": list(r.get("projectIds") or []),
                "msgId": data.get("msgId") or "",
            })
        except LanxinError as e:
            failed.append({"employId": emp, "name": r["name"],
                           "errCode": e.err_code, "errMsg": e.err_msg})
        except Exception as e:                      # 兜底:绝不让单人异常炸掉整批
            failed.append({"employId": emp, "name": r["name"],
                           "errCode": -1, "errMsg": type(e).__name__})
        if interval:
            time.sleep(interval)

    return {"sent": sent, "failed": failed, "msgIds": msg_ids, "sentLog": sent_log}
