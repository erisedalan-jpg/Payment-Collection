# lanxin_review.py
"""蓝信 H5 反馈闭环:免登录 token 的签发与校验。纯函数,无 IO,可单测。

为什么需要 token 而不是会话:H5 页在蓝信内置 webview 里打开,那里没有本系统的
登录态、也不该要求员工先登录一遍(他要填的就是我们主动推给他的那几条)。token
是这个入口【唯一】的凭据,所以它的校验必须严:签名覆盖 payload 与 exp 两段,
任一被改动即失效。

为什么 payload 走 base64url 而不是明文:token 要拼进 URL path。明文中文
(工号可能是中文姓名场景、kind 未来可能扩展)进 URL 会让 http.client 在 ASCII
编码处崩掉 —— 这是「蓝信对接代码」副本记录的实测教训。

格式:<base64url(payload)>.<exp>.<sig>   三段,全 ASCII,URL 安全
  payload = JSON{"emp":…, "kind":…}
  exp     = 签发时刻 + ttl_hours*3600(epoch 秒)
  sig     = HMAC-SHA256(secret, "<payload_b64>|<exp>").hexdigest()
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any, Dict, Optional

TOKEN_TTL_HOURS = 48
KINDS = ("project", "timesheet")

_MAX_TOKEN_LEN = 4096      # token 长度上限。免登录入口,长度必须封顶;
                           # 顺带堵掉「超长纯数字 exp 段」撞上 Python 3.11+ 的
                           # int(str) 4300 位限制而抛 ValueError 那条路。
_MAX_EXP_DIGITS = 20       # epoch 秒 10 位,给到 20 位绰绰有余


def _b64url_encode(raw: bytes) -> str:
    """去掉 '=' 填充:'=' 在 URL 里需要转义,而我们要保证 token 原样可进 path。"""
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(secret: str, payload_b64: str, exp: int) -> str:
    return hmac.new(secret.encode("utf-8"),
                    ("%s|%d" % (payload_b64, exp)).encode("utf-8"),
                    hashlib.sha256).hexdigest()


def issue_token(emp: str, kind: str, secret: str, now_epoch: int,
                ttl_hours: int = TOKEN_TTL_HOURS) -> str:
    """签发。secret 为空或 kind 未知 → ValueError(调用方 bug,不该静默产出坏 token)。"""
    if not str(secret or "").strip():
        raise ValueError("reviewTokenSecret 未配置,不能签发 token")
    if kind not in KINDS:
        raise ValueError("kind 须为 %s 之一" % "/".join(KINDS))
    payload_b64 = _b64url_encode(json.dumps(
        {"emp": str(emp or ""), "kind": kind},
        ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    exp = int(now_epoch) + int(ttl_hours) * 3600
    return "%s.%d.%s" % (payload_b64, exp, _sign(secret, payload_b64, exp))


def verify_token(token: Any, secret: str, now_epoch: int) -> Optional[Dict[str, str]]:
    """校验。通过 → {"emp":…, "kind":…};任何问题 → None。

    【绝不抛错】—— 这是免登录入口,异常会变成 500,而 500 让人以为系统坏了;
    正确的用户体验是页面里显示「链接失效」。所以格式怪异、签名不符、过期、
    密钥未配,一律走同一个 None 出口。

    用 hmac.compare_digest 而非 == 比较签名:防时序攻击。

    两层防御:真正的校验逻辑在 _verify_impl 里,已知的具体成因(token 超长、
    exp 段非十进制数字或位数超限、sig 含非 ASCII——这三条都不需要知道密钥就能
    触发)在那一层逐条显式挡掉;这里再包一层 try/except 兜底未知输入 —— 只堵
    已知成因挡不住下一个没想到的输入,只兜底又会在排查时看不到真实根因,
    两层各司其职、缺一不可。
    """
    try:
        return _verify_impl(token, secret, now_epoch)
    except Exception:      # noqa: BLE001
        # 最后一道防线。第一层已逐个堵掉已知成因(长度/isdecimal/ASCII),
        # 这一层防的是【还没想到的那些】—— 这是免登录入口,任何未预料的异常都会
        # 变成 500,而 500 会让员工以为系统坏了。「看不懂」一律归到「链接失效」。
        # 之所以两层都要:只有兜底会掩盖真实 bug(排查时看不到根因),
        # 只堵已知成因则挡不住下一个未知输入。
        return None


def _verify_impl(token: Any, secret: str, now_epoch: int) -> Optional[Dict[str, str]]:
    """真正的校验逻辑,被 verify_token 包一层 try/except 兜底(见其 docstring)。"""
    if not str(secret or "").strip():
        return None                       # 密钥没配 → 不放行任何 token
    if not isinstance(token, str):
        return None
    if len(token) > _MAX_TOKEN_LEN:
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload_b64, exp_s, sig = parts
    # isdecimal 而非 isdigit:isdigit() 对 "²³" 这类上标数字返回 True,但
    # int() 解析不了会抛 ValueError —— isdigit() 的合法集合比 int() 更大,
    # 用它做前置校验等于隐含假设"isdigit 通过 ⇒ int() 能解析",这个假设不成立。
    if not exp_s.isdecimal() or len(exp_s) > _MAX_EXP_DIGITS:
        return None
    exp = int(exp_s)
    if not sig.isascii():
        return None                       # compare_digest 对 str 入参要求全 ASCII,否则抛 TypeError
    if not hmac.compare_digest(sig, _sign(secret, payload_b64, exp)):
        return None
    if int(now_epoch) > exp:
        return None
    try:
        obj = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, TypeError):
        return None
    if not isinstance(obj, dict):
        return None
    emp, kind = str(obj.get("emp") or ""), str(obj.get("kind") or "")
    if not emp or kind not in KINDS:
        return None
    return {"emp": emp, "kind": kind}
