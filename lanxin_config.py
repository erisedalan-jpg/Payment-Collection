# lanxin_config.py
"""蓝信推送域:凭证与路由配置(超管可配)。纯函数 + 原子读写,可单测。

为什么要有这个文件:推送给谁、推哪些原因,是随组织习惯变的策略,不是代码常量。
本模块把它提升为服务端配置,超管在 /data 可见可改,改完立即生效(本域不进数据管线)。
appSecret / callbackAesKey / callbackSignToken 均存于此,故 data/lanxin_config.json 必须 gitignore。
"""
from __future__ import annotations

import json
import os
import secrets
from typing import Any, Dict, List

from yitian_rules import ISSUE_LABELS

# ISSUE_LABELS 实测共 8 项,其中 HINT_ 前缀的是「合规(提示)」而不是问题 ——
# yitian_check.ok_of 的原话:「0=合规 / 1=合规(提示) / 2=问题。含任一非 HINT_ 码即为问题」。
# 默认只推真问题:实测 HINT_PRESALE_PRODUCT 有 96 条,比全部真问题(63 条)还多;
# 默认推它 = 给系统判定为「合规」的人发一张写着「你有 N 条工时填报存在问题」的卡,
# 一次就会砸掉功能信任。超管想推可在页面自行勾选。
# 用 startswith 派生而非硬编码 7 项:将来若新增 HINT_ 码,自动排除、无需改这里。
DEFAULT_ISSUE_CODES = [k for k in ISSUE_LABELS if not k.startswith("HINT_")]

# 前端 lib/riskReasons.ts 的 RiskCategory 八类。
# 注意:这里只用于「校验超管勾选的取值是否合法」,不做任何判定 —— 判定口径的单一来源仍是前端。
REASON_WHITELIST = [
    "回款延期", "里程碑滞后", "总成本超支大于5000", "总成本超支小于5000",
    "交付成本超支", "风险未闭环", "数据异常", "未获取原项目预算",
]

MAX_SUPERVISOR_LEVELS = 5      # 用户钦定:预留 5 级(推广到整个团队后,张英哲之上仍有两级)
MIN_SEND_INTERVAL_MS = 0
MAX_SEND_INTERVAL_MS = 10000
# 蓝信 id_mapping 支持的 id_type 枚举。此处仅校验取值合法。
# 注意:切到 mobile/mail 并不能兜底「蓝信人员编号 ≠ 我方工号」——
# 组织架构.xlsx 无手机号/邮箱列,拿不到 id_value。该情形的应对是「花名册加一列人员编号 + 出 V4.0.1」,
# 不是改这里的配置。详见 spec §10.1。
_ID_TYPES = ("employ_id", "mobile", "mail", "login", "external_id")

# 发送身份。account=应用号(回调事件 account_message);bot=智能机器人
# (回调事件 bot_private_message / bot_group_message,须组织管理员额外开通机器人能力)。
# 默认 account:机器人能力是第二道审批,可能批不下来,应用号是安全落点。
SEND_AS_VALUES = ("account", "bot")

# 反馈时限(小时)。卡片文案「N 小时内未反馈将列入《未响应清单》」与未响应清单的判定
# 【共用这一个值】—— 卡上写 24 小时、清单按 48 小时算,是必然会出的事故。
DEFAULT_REVIEW_DEADLINE_HOURS = 24
MIN_REVIEW_DEADLINE_HOURS = 1
MAX_REVIEW_DEADLINE_HOURS = 720        # 30 天


def default_config() -> Dict[str, Any]:
    return {
        "enabled": False,
        "sendIntervalMs": 200,
        "reviewDeadlineHours": DEFAULT_REVIEW_DEADLINE_HOURS,
        # H5 反馈页的对外基地址(如 http://10.248.105.95/pm)。留空 = 不发 H5 链接,
        # 卡片文案自动退回「请直接回复本消息反馈」态(build_action_hint 三态已就绪)。
        # 为什么必须配而不能由服务端自推:nginx 把 /pm 前缀剥掉后 app 只看到 /api/...,
        # 服务端【不知道】自己的公网前缀。配置界面按部署前缀自动推导预填(见 T7)。
        "reviewBaseUrl": "",
        "sendAs": "account",
        "credentials": {
            "appId": "", "appSecret": "", "orgId": "",
            "apiGateway": "", "idType": "employ_id",
            # 回调密钥与回调签名令牌,取自开发者中心「回调事件」页 ——
            # 与 AppId/AppSecret 是【另外两个】凭证,不要混。
            "callbackAesKey": "", "callbackSignToken": "",
            "reviewTokenSecret": "",
        },
        "routes": [
            {
                "key": "timesheet", "label": "倚天工时问题", "enabled": True,
                # 只含真问题;HINT_(合规提示)默认不勾,但仍在白名单里、页面可自行勾选
                # 默认不发汇总:工时问题是本人可自纠的,先不惊动上级
                "items": [_default_item(c, c in DEFAULT_ISSUE_CODES, True, 0)
                          for c in ISSUE_LABELS],
            },
            {
                "key": "project", "label": "项目关注原因", "enabled": True,
                # 默认到直接上级即止:+3 意味着一人收覆盖全部员工的卡,应由人显式开启
                "items": [_default_item(c, True, True, 1) for c in REASON_WHITELIST],
            },
        ],
    }


def _validate_recipients(r: Any) -> Dict[str, Any]:
    if not isinstance(r, dict):
        raise ValueError("recipients 必须是对象")
    primary = r.get("primary", True)
    if not isinstance(primary, bool):
        raise ValueError("recipients.primary 必须是布尔")
    lv = r.get("supervisorLevels", 0)
    # 布尔是 int 的子类,必须显式排除,否则 True 会被当成 1
    if isinstance(lv, bool) or not isinstance(lv, int):
        raise ValueError("recipients.supervisorLevels 必须是整数")
    if not (0 <= lv <= MAX_SUPERVISOR_LEVELS):
        raise ValueError("recipients.supervisorLevels 须在 0..%d" % MAX_SUPERVISOR_LEVELS)
    return {"primary": primary, "supervisorLevels": lv}


def _validate_subset(raw: Any, whitelist: List[str], field: str) -> List[str]:
    if not isinstance(raw, list):
        raise ValueError("%s 必须是数组" % field)
    out: List[str] = []
    for x in raw:
        if not isinstance(x, str):
            raise ValueError("%s 只能含字符串" % field)
        if x not in whitelist:
            raise ValueError("%s 含未知取值:%s" % (field, x))
        if x not in out:
            out.append(x)
    return out


def _default_item(code: str, enabled: bool, primary: bool = True, levels: int = 0) -> Dict[str, Any]:
    return {"code": code, "enabled": enabled, "primary": primary, "supervisorLevels": levels}


def _validate_items(raw: Any, whitelist: List[str], field: str) -> List[Dict[str, Any]]:
    """校验 items 并【按白名单顺序补齐】:白名单里没出现的 code 补 enabled=False。
    补齐而不是报错,是为了将来新增问题码时旧配置仍能通过校验(V4.0.0 吃过
    ISSUE_LABELS 从 7 项变 8 项的亏)。"""
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise ValueError("%s 必须是数组" % field)
    got: Dict[str, Dict[str, Any]] = {}
    for it in raw:
        if not isinstance(it, dict):
            raise ValueError("%s 的元素必须是对象" % field)
        code = it.get("code")
        if code not in whitelist:
            raise ValueError("%s 含非法 code:%s" % (field, code))
        if code in got:
            raise ValueError("%s 含重复 code:%s" % (field, code))
        for b in ("enabled", "primary"):
            v = it.get(b, True)
            if not isinstance(v, bool):
                raise ValueError("%s.%s 必须是布尔" % (field, b))
        lv = it.get("supervisorLevels", 0)
        if isinstance(lv, bool) or not isinstance(lv, int):
            raise ValueError("%s.supervisorLevels 必须是整数" % field)
        if not (0 <= lv <= MAX_SUPERVISOR_LEVELS):
            raise ValueError("%s.supervisorLevels 须在 0..%d" % (field, MAX_SUPERVISOR_LEVELS))
        got[code] = _default_item(code, bool(it.get("enabled", True)),
                                  bool(it.get("primary", True)), lv)
    return [got.get(c) or _default_item(c, False) for c in whitelist]


def _migrate_route_items(r: Dict[str, Any], whitelist: List[str], legacy_field: str) -> Any:
    """V4.0.1 及以前:一条路由一组 recipients + 一个 code 数组。
    → 逐项 items,勾选项 enabled=True、其余 False,primary/levels 一律继承原 recipients。
    这样迁移后行为与迁移前【逐字节等价】,管理员不动配置就没有任何变化。
    判据是【缺 items 键】而非版本号比较。"""
    if isinstance(r.get("items"), list):
        return r["items"]
    rec = _validate_recipients(r.get("recipients") or {})
    on = set(_validate_subset(r.get(legacy_field, []), whitelist, legacy_field))
    return [_default_item(c, c in on, rec["primary"], rec["supervisorLevels"]) for c in whitelist]


def validate_config(cfg: Any) -> Dict[str, Any]:
    """校验并归一化。非法 → ValueError。返回全新 dict,不就地改入参。"""
    if not isinstance(cfg, dict):
        raise ValueError("配置必须是对象")

    enabled = cfg.get("enabled", False)
    if not isinstance(enabled, bool):
        raise ValueError("enabled 必须是布尔")

    interval = cfg.get("sendIntervalMs", 200)
    if isinstance(interval, bool) or not isinstance(interval, int):
        raise ValueError("sendIntervalMs 必须是整数")
    if not (MIN_SEND_INTERVAL_MS <= interval <= MAX_SEND_INTERVAL_MS):
        raise ValueError("sendIntervalMs 须在 %d..%d" % (MIN_SEND_INTERVAL_MS, MAX_SEND_INTERVAL_MS))

    cred_in = cfg.get("credentials") or {}
    if not isinstance(cred_in, dict):
        raise ValueError("credentials 必须是对象")
    cred: Dict[str, Any] = {}
    for k in ("appId", "appSecret", "orgId", "apiGateway",
              "callbackAesKey", "callbackSignToken", "reviewTokenSecret"):
        v = cred_in.get(k, "")
        if not isinstance(v, str):
            raise ValueError("credentials.%s 必须是字符串" % k)
        cred[k] = v.strip()
    # 凭证尚未申请下来时允许留空,否则超管连路由都没法先配好
    if cred["apiGateway"]:
        if not cred["apiGateway"].startswith("https://"):
            raise ValueError("credentials.apiGateway 必须以 https:// 开头")
        cred["apiGateway"] = cred["apiGateway"].rstrip("/")
    id_type = cred_in.get("idType", "employ_id")
    if id_type not in _ID_TYPES:
        raise ValueError("credentials.idType 只能是 %s" % (_ID_TYPES,))
    cred["idType"] = id_type

    routes_in = cfg.get("routes")
    if not isinstance(routes_in, list) or not routes_in:
        raise ValueError("routes 必须是非空数组")
    known = {r["key"]: r for r in default_config()["routes"]}
    routes: List[Dict[str, Any]] = []
    seen = set()
    for r in routes_in:
        if not isinstance(r, dict):
            raise ValueError("route 必须是对象")
        key = r.get("key")
        if key not in known:
            raise ValueError("未知 route.key:%s" % key)
        if key in seen:
            raise ValueError("route.key 重复:%s" % key)
        seen.add(key)
        whitelist = list(ISSUE_LABELS.keys()) if key == "timesheet" else list(REASON_WHITELIST)
        legacy_field = "issueCodes" if key == "timesheet" else "reasons"
        item: Dict[str, Any] = {
            "key": key,
            "label": known[key]["label"],
            "enabled": bool(r.get("enabled", True)),
            "items": _validate_items(_migrate_route_items(r, whitelist, legacy_field),
                                     whitelist, "items"),
        }
        routes.append(item)
    if seen != set(known):
        raise ValueError("routes 必须包含且仅包含:%s" % sorted(known))

    send_as = cfg.get("sendAs", "account")
    if send_as not in SEND_AS_VALUES:
        raise ValueError("sendAs 须为 %s 之一" % "/".join(SEND_AS_VALUES))

    base = cfg.get("reviewBaseUrl", "")
    if not isinstance(base, str):
        raise ValueError("reviewBaseUrl 必须是字符串")
    base = base.strip().rstrip("/")
    # 这个值会被拼进【推给员工的卡片】的 cardLink,放行任意 scheme 等于把它变成钓鱼跳板
    if base and not base.startswith(("http://", "https://")):
        raise ValueError("reviewBaseUrl 必须以 http:// 或 https:// 开头")

    deadline = cfg.get("reviewDeadlineHours", DEFAULT_REVIEW_DEADLINE_HOURS)
    # bool 是 int 的子类,True 会被当成 1 混过去 —— 显式排掉
    if isinstance(deadline, bool) or not isinstance(deadline, int):
        raise ValueError("reviewDeadlineHours 必须是整数")
    if not (MIN_REVIEW_DEADLINE_HOURS <= deadline <= MAX_REVIEW_DEADLINE_HOURS):
        raise ValueError("reviewDeadlineHours 须在 %d~%d 之间"
                         % (MIN_REVIEW_DEADLINE_HOURS, MAX_REVIEW_DEADLINE_HOURS))

    return {"enabled": enabled, "sendIntervalMs": interval, "sendAs": send_as,
            "reviewDeadlineHours": deadline, "reviewBaseUrl": base,
            "credentials": cred, "routes": routes}


def load_config(path: str) -> Dict[str, Any]:
    """读配置。文件不存在/坏 JSON → 默认配置(不抛,避免整页打不开)。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return validate_config(json.load(f))
    except (OSError, ValueError):
        return default_config()


# 「密钥字段留空回传 = 沿用旧值」的保护名单。public_config 把密钥抹成空串下发,
# 前端原样 PUT 回来时若不认识某个密钥字段,就会把空串照写落盘、覆盖真实密钥。
# reviewTokenSecret 尤其危险:它是【服务端自己生成】的,超管界面上压根没有这个输入框,
# 一旦被清空,已发出去的 H5 链接(TTL 48 小时)集体静默失效,且无任何报错线索。
_SECRET_FIELDS = ("appSecret", "callbackAesKey", "callbackSignToken", "reviewTokenSecret")


def save_config(path: str, cfg: Any) -> Dict[str, Any]:
    """校验后原子写。四个密钥(appSecret/callbackAesKey/callbackSignToken/
    reviewTokenSecret)为空串 = 沿用旧值(前端读到的是脱敏值,回传空串不应清空)。"""
    clean = validate_config(cfg)
    # M-1:循环变量名不得与文件句柄同名(原先两处都叫 f,功能虽对但极易读错)。
    if any(not clean["credentials"][name] for name in _SECRET_FIELDS):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                old = json.load(fh)
            old_cred = old.get("credentials") or {}
            for name in _SECRET_FIELDS:
                if not clean["credentials"][name]:
                    clean["credentials"][name] = old_cred.get(name, "")
        except (OSError, ValueError):
            pass
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return clean


def public_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """下发给前端的脱敏配置:三个密钥一律抹成空串,只透出 has* 布尔。
    绝不回显明文 —— 前端拿不到,就不会被日志/截图/导出带出去。"""
    out = json.loads(json.dumps(cfg, ensure_ascii=False))
    cred = out.setdefault("credentials", {})
    for field, flag in (("appSecret", "hasSecret"),
                        ("callbackAesKey", "hasCallbackAesKey"),
                        ("callbackSignToken", "hasCallbackSignToken"),
                        ("reviewTokenSecret", "hasReviewTokenSecret")):
        cred[flag] = bool(cred.get(field, ""))
        cred[field] = ""
    return out


def ensure_review_token_secret(path: str, cfg: Dict[str, Any]) -> str:
    """取 H5 token 的签名密钥;缺失则生成并【立刻落盘】后返回。

    为什么不在 default_config()/validate_config() 里生成:那两个函数每次 load
    都会跑,在那里生成等于「每次读配置都换一个密钥」—— 服务一重启,此前签发的
    token 全部失效。TTL 是 48 小时,重启很可能落在窗口内。密钥必须持久。

    绝不记密钥:本函数不打日志、不进审计,返回值只在进程内用于 HMAC 计算;
    public_config 只透 hasReviewTokenSecret 布尔。
    """
    cred = cfg.setdefault("credentials", {})
    sec = str(cred.get("reviewTokenSecret") or "").strip()
    if sec:
        return sec
    sec = secrets.token_urlsafe(32)
    cred["reviewTokenSecret"] = sec
    save_config(path, cfg)
    return sec
