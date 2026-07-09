#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""取 cookie 核心:纯 requests 静默访问,依赖本机零信任已登录。
返回结构化 dict 供本机代理(cookie_agent)使用。不依赖平台代码。"""
import requests

PMIS_TARGET = "https://pmis.qianxin-inc.cn"
YITIAN_TARGET = "https://yitian.b.qianxin-inc.cn/maintenance_work_orders"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0")
_LOGIN_MARKERS = ("zerotrust", "单点登录", "OA登录", "login")


def silent_fetch(target_url):
    """访问 target_url,零信任自动认证,收集 Session 全部 cookie 拼整行。
    成功返回 (cookie_str, names_list);失败返回 (None, error_str)。
    重要:禁用系统代理(trust_env=False + 空 proxies),否则零信任虚拟 IP 会被本机代理劫持。"""
    session = requests.Session()
    session.trust_env = False
    session.headers.update({"User-Agent": UA})
    session.proxies = {"http": None, "https": None}
    try:
        r = session.get(target_url, timeout=30, allow_redirects=True)
    except Exception as e:
        return None, f"访问失败: {e}（请确认零信任客户端已在本机登录）"
    final_url = r.url or ""
    if "zerotrust" in final_url or "/sso" in final_url or "login" in final_url.lower():
        return None, f"被重定向到登录页（零信任未登录）: {final_url}"
    if "html" in r.headers.get("Content-Type", "").lower():
        head = r.text[:2000]
        if any(m in head for m in _LOGIN_MARKERS):
            return None, "页面内容为登录页（零信任未认证）"
    if not session.cookies:
        return None, "未获取到任何 Cookie"
    names = [c.name for c in session.cookies]
    cookie = "; ".join(f"{c.name}={c.value}" for c in session.cookies)
    return cookie, names


def fetch_pmis():
    """取 PMIS cookie。返回 {ok, cookie, names, hasSession, error}。"""
    cookie, names_or_err = silent_fetch(PMIS_TARGET)
    if cookie is None:
        return {"ok": False, "cookie": "", "names": [], "hasSession": False, "error": names_or_err}
    return {"ok": True, "cookie": cookie, "names": names_or_err,
            "hasSession": "SESSION" in names_or_err, "error": ""}


def fetch_yitian():
    """取倚天 cookie。返回 {ok, cookie, names, error}(无 hasSession)。"""
    cookie, names_or_err = silent_fetch(YITIAN_TARGET)
    if cookie is None:
        return {"ok": False, "cookie": "", "names": [], "error": names_or_err}
    return {"ok": True, "cookie": cookie, "names": names_or_err, "error": ""}
