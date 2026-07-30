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
    """
    if not str(secret or "").strip():
        return None                       # 密钥没配 → 不放行任何 token
    if not isinstance(token, str):
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload_b64, exp_s, sig = parts
    if not exp_s.isdigit():
        return None
    exp = int(exp_s)
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
