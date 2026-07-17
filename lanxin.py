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
