#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
静默获取倚天（奇安信）零信任 Cookie —— 纯 requests，无浏览器

原理：
  零信任客户端在本机已登录，会以系统级网络代理/VPN 方式自动注入认证。
  本脚本用 requests 静默访问倚天平台工单页，零信任客户端自动完成认证，
  服务器返回 Set-Cookie，Session 自动收集后拼成整行 Cookie 头。
  全程不启动任何浏览器，不弹窗，完全静默。

  - 前提：零信任客户端已在本机登录（正常办公状态）
  - Cookie 过期后：零信任客户端保持登录即可，本脚本每次重新静默获取

输出：把整行 Cookie 头（name=value; name2=value2）写入同目录 config.json 的
      session_cookie 字段，同时打印 COOKIE_START...COOKIE_END 供调用方提取。

依赖：requests（pip install requests）
"""

import os
import sys
import json
import requests

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")
TARGET_URL = "https://yitian.b.qianxin-inc.cn/maintenance_work_orders"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"


def fetch_cookie():
    """用 requests 静默访问倚天平台，零信任客户端自动认证，返回整行 Cookie 头字符串。
    返回 (cookie_header, session) 或 (None, None)。"""
    session = requests.Session()
    session.headers.update({"User-Agent": UA})

    try:
        r = session.get(TARGET_URL, timeout=30, allow_redirects=True)
    except Exception as e:
        print(f"  [错误] 访问倚天平台失败: {e}")
        print("  请确认零信任客户端已在本机登录并正常运行。")
        return None, None

    final_url = r.url or ""
    # 检查是否被重定向到登录页（零信任未登录）
    if "zerotrust" in final_url or "/sso" in final_url or "login" in final_url.lower():
        print(f"  [警告] 被重定向到登录页: {final_url}")
        print("  请确认零信任客户端已登录。")
        return None, None

    # 检查 HTML 内容是否为登录页
    if "html" in r.headers.get("Content-Type", "").lower():
        head = r.text[:2000]
        if "zerotrust" in head or "单点登录" in head or "OA登录" in head:
            print("  [警告] 页面内容为登录页，零信任未认证。")
            return None, None

    # 从 Session 收集所有 cookie
    if not session.cookies:
        print("  [警告] 未获取到任何 Cookie。")
        return None, None

    # 拼成整行 Cookie 头
    cookie_parts = []
    for cookie in session.cookies:
        cookie_parts.append(f"{cookie.name}={cookie.value}")
    cookie_header = "; ".join(cookie_parts)

    print(f"  ✓ 静默获取成功，共 {len(session.cookies)} 个 cookie")
    return cookie_header, session


def write_config(cookie_header):
    """把 cookie 写入 config.json 的 session_cookie 字段（保留其它字段）"""
    cfg = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}
    cfg["session_cookie"] = cookie_header
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    print(f"[OK] Cookie 已写入 {CONFIG_PATH} 的 session_cookie 字段")


def main():
    print("=" * 60)
    print("  静默获取倚天零信任 Cookie（纯 requests，无浏览器）")
    print("=" * 60)
    print(f"  目标: {TARGET_URL}")
    print("  正在静默访问（零信任客户端自动认证）...")

    cookie_header, session = fetch_cookie()
    if not cookie_header:
        print("  ❌ 获取 Cookie 失败。")
        return 2

    # 验证：用刚获取的 cookie 再次访问，确认已认证
    print("  验证 Cookie 有效性...")
    try:
        r2 = session.get(
            "https://yitian.b.qianxin-inc.cn/maintenance_work_orders/get_work_order_list",
            params={"page": 1, "pageSize": 1},
            timeout=20, allow_redirects=True
        )
        ct = r2.headers.get("Content-Type", "")
        if "json" in ct.lower():
            print("  ✓ Cookie 有效，已通过零信任认证（API 返回 JSON）。")
        else:
            print(f"  ⚠ Cookie 可能无效（API 返回 Content-Type: {ct}）")
    except Exception as e:
        print(f"  ⚠ 验证时异常（Cookie 可能仍有效）: {e}")

    print()
    print("COOKIE_START")
    print(cookie_header)
    print("COOKIE_END")
    write_config(cookie_header)
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)