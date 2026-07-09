# 本机 cookie 代理 + /data 网页驱动取 cookie 实现计划 · V2.7.1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员在 `/data` 网页点按钮，由本机常驻小代理静默取 PMIS/倚天 cookie，网页再传到服务器（PMIS 取→推→下载全链路；倚天仅取+存备用）。

**Architecture:** 新增本机 cookie 代理（`client/cookie_core.py` 取 cookie + `client/cookie_agent.py` 只监听 127.0.0.1 的 HTTP 服务，Origin 白名单）；服务端新增 `yitian_config.py` + `POST/GET /api/yitian/cookie`（超管专属，存 `data/yitian_config.json`）；前端 `lib/cookieAgent.ts` + `DataView.vue` 加「获取本机 cookie」按钮。PMIS 端点/脚本零改动。

**Tech Stack:** Python 标准库 `http.server` + requests（代理）；server.py + pydantic 风格纯函数模块；前端 Vue3 + TS + Vitest；pytest。

## Global Constraints

- 交流与文案用**简体中文**；代码/命令/文件名原文；**不使用任何 emoji**（需要符号用 `→ ↓ ❌ ✕ ▾`）。
- 版本单一来源 `frontend/src/version.ts`，本期 **V2.7.1**、日期 `2026-07-09`。
- **取 cookie 只能在装零信任的本机由原生进程做**；浏览器/服务器都取不到。代理**只取 cookie、不碰平台账号**（推送由浏览器超管会话做）。
- 本机代理**只绑 `127.0.0.1`** + 校验 `Origin` 在白名单（非白名单 403，不返回 cookie）+ `OPTIONS` 预检回 `Access-Control-Allow-Private-Network: true`。
- PMIS cookie 须含 `SESSION=`（复用现 `/api/pmis/cookie` 的校验）；**倚天 cookie 无 SESSION**，`yitian_config` 只校验非空。
- `yitian_config.py` **不依赖 server**（server 单向依赖它，仿 `pmis_config.py`）；`client/cookie_agent.py` 依赖 `client/cookie_core.py`，两者**不依赖平台代码**。
- 倚天写入纳入 V2.7.0 审计：`audit._ACTION_MAP` 加 `('POST','/api/yitian/cookie'): ('yitian.cookie_save','更新倚天 Cookie')`（GET 状态不审计）。
- `data/yitian_config.json`、`client/agent_config.json` 为 gitignored 运行期文件、不进发布包。PMIS pipeline（`pmisdata/*`）零改动。
- 完成定义：`bash verify.sh` 全绿（含新增 pytest 与前端 typecheck/vitest/build）+ `PROGRESS.md` 更新。
- 升级须**重启后端**（改 server.py + 新 yitian_config.py）；**不需点更新数据**。本机代理是客户端产物、单独装。

## File Structure

| 文件 | 职责 |
|---|---|
| `client/cookie_core.py`（新增） | 取 cookie 核心：`silent_fetch(target)`、`fetch_pmis()`、`fetch_yitian()`（复用现 `_silent_fetch` 逻辑，返回结构化 dict） |
| `client/cookie_agent.py`（新增） | 无界面本机 HTTP 代理：`127.0.0.1` + Origin 白名单 + `/ping`/`/pmis-cookie`/`/yitian-cookie` + `create_server` |
| `tests/test_cookie_agent.py`（新增） | 代理 HTTP 级测试（mock `cookie_core`） |
| `yitian_config.py`（新增，仓库根） | `data/yitian_config.json` 读写纯函数（仿 pmis_config，无 SESSION 校验） |
| `tests/test_yitian_config.py`（新增） | yitian_config 纯函数测试 |
| `server.py`（改） | `YITIAN_CONFIG` 常量 + `handle_yitian_cookie_get/save` + 两处 `_dispatch_*` 布线 + `_SUPER_ONLY_PATHS` 加项 |
| `audit.py`（改） | `_ACTION_MAP` 加 yitian.cookie_save |
| `tests/test_server_yitian.py`（新增） | 端点 HTTP 级测试（超管写/读、非超管 403、空拒绝、审计落一条） |
| `frontend/src/lib/cookieAgent.ts`（新增） | 封装对本机代理的 fetch（ping/pmis/yitian）+ 错误中文化 |
| `frontend/src/lib/cookieAgent.test.ts`（新增） | cookieAgent 单测 |
| `frontend/src/views/DataView.vue`（改） | 代理状态 + 「获取本机 PMIS cookie」按钮 + 倚天区 |
| `frontend/src/views/DataView.test.ts`（改） | 追加新按钮行为用例 |
| `frontend/src/version.ts`（改） | V2.7.1 |
| `client/README.md`（改） | 无界面代理用法 + 开机自启说明 |
| `.gitignore`（改） | 加 `data/yitian_config.json`、`client/agent_config.json` |

---

## Task 1: client/cookie_core.py 取 cookie 核心

**Files:**
- Create: `client/cookie_core.py`
- Test: `tests/test_cookie_agent.py`（本任务先建，含 core 部分；Task 2 再追加 agent 部分）

**Interfaces:**
- Produces:
  - `PMIS_TARGET`、`YITIAN_TARGET`、`UA`（模块常量）
  - `silent_fetch(target_url) -> tuple`：成功 `(cookie_str, names_list)`；失败 `(None, error_str)`
  - `fetch_pmis() -> dict`：`{ok, cookie, names, hasSession, error}`
  - `fetch_yitian() -> dict`：`{ok, cookie, names, error}`

- [ ] **Step 1: 写失败测试**

创建 `tests/test_cookie_agent.py`：

```python
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'client'))
import cookie_core  # noqa: E402


def test_fetch_pmis_ok_and_hassession(monkeypatch):
    monkeypatch.setattr(cookie_core, 'silent_fetch',
                        lambda url: ('SESSION=abc; foo=bar', ['SESSION', 'foo']))
    r = cookie_core.fetch_pmis()
    assert r['ok'] is True and r['hasSession'] is True
    assert r['cookie'] == 'SESSION=abc; foo=bar'
    assert r['names'] == ['SESSION', 'foo'] and r['error'] == ''


def test_fetch_pmis_no_session(monkeypatch):
    monkeypatch.setattr(cookie_core, 'silent_fetch',
                        lambda url: ('foo=bar', ['foo']))
    r = cookie_core.fetch_pmis()
    assert r['ok'] is True and r['hasSession'] is False


def test_fetch_pmis_error_passthrough(monkeypatch):
    monkeypatch.setattr(cookie_core, 'silent_fetch',
                        lambda url: (None, '被重定向到登录页（零信任未登录）'))
    r = cookie_core.fetch_pmis()
    assert r['ok'] is False and r['cookie'] == '' and '零信任' in r['error']


def test_fetch_yitian_ok(monkeypatch):
    monkeypatch.setattr(cookie_core, 'silent_fetch',
                        lambda url: ('XSRF-TOKEN=x; PHPSESSID=y', ['XSRF-TOKEN', 'PHPSESSID']))
    r = cookie_core.fetch_yitian()
    assert r['ok'] is True and r['cookie'].startswith('XSRF-TOKEN=')
    assert 'hasSession' not in r


def test_silent_fetch_detects_login_redirect(monkeypatch):
    class _Resp:
        url = 'https://zerotrust.example/sso/login'
        headers = {'Content-Type': 'text/html'}
        text = ''
    class _Sess:
        cookies = []
        headers = {}
        proxies = {}
        trust_env = True
        def get(self, *a, **k):
            return _Resp()
    monkeypatch.setattr(cookie_core.requests, 'Session', lambda: _Sess())
    cookie, err = cookie_core.silent_fetch(cookie_core.PMIS_TARGET)
    assert cookie is None and '登录页' in err
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_cookie_agent.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'cookie_core'`）

- [ ] **Step 3: 写实现**

创建 `client/cookie_core.py`：

```python
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
    """取倚天 cookie。返回 {ok, cookie, names, error}（无 hasSession）。"""
    cookie, names_or_err = silent_fetch(YITIAN_TARGET)
    if cookie is None:
        return {"ok": False, "cookie": "", "names": [], "error": names_or_err}
    return {"ok": True, "cookie": cookie, "names": names_or_err, "error": ""}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_cookie_agent.py -q`
Expected: PASS（5 passed）

- [ ] **Step 5: 提交**

```bash
git add client/cookie_core.py tests/test_cookie_agent.py
git commit -m "feat(agent): cookie_core 取 cookie 核心(silent_fetch/fetch_pmis/fetch_yitian) (V2.7.1)"
```

---

## Task 2: client/cookie_agent.py 无界面本机 HTTP 代理

**Files:**
- Create: `client/cookie_agent.py`
- Modify: `tests/test_cookie_agent.py`（追加 agent 测试）
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `cookie_core.fetch_pmis`/`fetch_yitian`
- Produces:
  - `DEFAULT_PORT=8765`、`DEFAULT_ALLOWED_ORIGINS`、`AGENT_VERSION`
  - `create_server(host='127.0.0.1', port=DEFAULT_PORT, allowed_origins=None) -> Agent`（`Agent(HTTPServer)`，带 `.allowed_origins`）
  - HTTP 端点：`GET /ping` → `{ok, service, version}`；`GET /pmis-cookie` → cookie_core.fetch_pmis()；`GET /yitian-cookie` → cookie_core.fetch_yitian()；非白名单 `Origin` → 403；`OPTIONS` → 204 + CORS 头

- [ ] **Step 1: 写失败测试**

在 `tests/test_cookie_agent.py` 追加：

```python
import json
import http.client
import threading
import cookie_agent  # noqa: E402


def _start(allowed_origins):
    srv = cookie_agent.create_server(host='127.0.0.1', port=0, allowed_origins=allowed_origins)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, port


def test_ping_ok():
    srv, port = _start(['http://plat'])
    try:
        conn = http.client.HTTPConnection('127.0.0.1', port)
        conn.request('GET', '/ping')
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert body['ok'] is True and body['service'] == 'pmp-cookie-agent'
    finally:
        srv.shutdown(); srv.server_close()


def test_pmis_cookie_allowed_origin(monkeypatch):
    monkeypatch.setattr(cookie_agent.cookie_core, 'fetch_pmis',
                        lambda: {'ok': True, 'cookie': 'SESSION=z', 'names': ['SESSION'],
                                 'hasSession': True, 'error': ''})
    srv, port = _start(['http://plat'])
    try:
        conn = http.client.HTTPConnection('127.0.0.1', port)
        conn.request('GET', '/pmis-cookie', headers={'Origin': 'http://plat'})
        r = conn.getresponse()
        assert r.status == 200
        assert r.getheader('Access-Control-Allow-Origin') == 'http://plat'
        assert json.loads(r.read())['cookie'] == 'SESSION=z'
    finally:
        srv.shutdown(); srv.server_close()


def test_bad_origin_rejected(monkeypatch):
    called = {'n': 0}
    def _boom():
        called['n'] += 1
        return {'ok': True, 'cookie': 'SESSION=leak', 'names': ['SESSION'], 'hasSession': True, 'error': ''}
    monkeypatch.setattr(cookie_agent.cookie_core, 'fetch_pmis', _boom)
    srv, port = _start(['http://plat'])
    try:
        conn = http.client.HTTPConnection('127.0.0.1', port)
        conn.request('GET', '/pmis-cookie', headers={'Origin': 'http://evil.com'})
        r = conn.getresponse()
        assert r.status == 403
        assert 'leak' not in r.read().decode('utf-8')   # 未泄露 cookie
        assert called['n'] == 0                          # 未调用取 cookie
    finally:
        srv.shutdown(); srv.server_close()


def test_options_preflight_headers():
    srv, port = _start(['http://plat'])
    try:
        conn = http.client.HTTPConnection('127.0.0.1', port)
        conn.request('OPTIONS', '/pmis-cookie', headers={'Origin': 'http://plat'})
        r = conn.getresponse()
        assert r.status == 204
        assert r.getheader('Access-Control-Allow-Origin') == 'http://plat'
        assert r.getheader('Access-Control-Allow-Private-Network') == 'true'
        r.read()
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_cookie_agent.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'cookie_agent'`）

- [ ] **Step 3: 写实现**

创建 `client/cookie_agent.py`：

```python
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""无界面本机 cookie 代理:只监听 127.0.0.1,浏览器经它取 PMIS/倚天 cookie。
安全:只绑 127.0.0.1 + Origin 白名单(非白名单 403,不返回 cookie)。
配置:同目录 agent_config.json 可覆盖 {port, allowed_origins};缺省用内置默认。
用法:python cookie_agent.py  (或 PyInstaller 打成 exe 开机自启)。"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import cookie_core  # noqa: E402

DEFAULT_PORT = 8765
DEFAULT_ALLOWED_ORIGINS = [
    "http://10.248.105.95", "http://localhost:8080", "http://localhost:5173",
]
AGENT_VERSION = "1.0.0"
CONFIG_PATH = os.path.join(SCRIPT_DIR, "agent_config.json")


class Agent(HTTPServer):
    def __init__(self, addr, allowed_origins):
        super().__init__(addr, _Handler)
        self.allowed_origins = allowed_origins


class _Handler(BaseHTTPRequestHandler):
    def _origin_allowed(self, origin):
        # 无 Origin(如本机 curl)放行读健康/cookie;有 Origin 必须在白名单
        return (not origin) or (origin in self.server.allowed_origins)

    def _cors_headers(self, origin):
        h = {}
        if origin and origin in self.server.allowed_origins:
            h['Access-Control-Allow-Origin'] = origin
            h['Access-Control-Allow-Private-Network'] = 'true'
            h['Vary'] = 'Origin'
        return h

    def _send(self, code, payload, origin):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        for k, v in self._cors_headers(origin).items():
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        origin = self.headers.get('Origin')
        self.send_response(204)
        for k, v in self._cors_headers(origin).items():
            self.send_header(k, v)
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        origin = self.headers.get('Origin')
        path = self.path.split('?')[0]
        if not self._origin_allowed(origin):
            self._send(403, {"ok": False, "error": "origin not allowed"}, None)
            return
        if path == '/ping':
            self._send(200, {"ok": True, "service": "pmp-cookie-agent", "version": AGENT_VERSION}, origin)
        elif path == '/pmis-cookie':
            self._send(200, cookie_core.fetch_pmis(), origin)
        elif path == '/yitian-cookie':
            self._send(200, cookie_core.fetch_yitian(), origin)
        else:
            self._send(404, {"ok": False, "error": "not found"}, origin)

    def log_message(self, *args):
        pass  # 静默,不打访问日志


def _load_config():
    port, origins = DEFAULT_PORT, list(DEFAULT_ALLOWED_ORIGINS)
    try:
        if os.path.isfile(CONFIG_PATH):
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            port = int(cfg.get('port', port))
            if isinstance(cfg.get('allowed_origins'), list) and cfg['allowed_origins']:
                origins = cfg['allowed_origins']
    except Exception:
        pass
    return port, origins


def create_server(host='127.0.0.1', port=DEFAULT_PORT, allowed_origins=None):
    return Agent((host, port), allowed_origins if allowed_origins is not None else list(DEFAULT_ALLOWED_ORIGINS))


def main():
    port, origins = _load_config()
    srv = create_server(port=port, allowed_origins=origins)
    print(f"[cookie-agent] 监听 127.0.0.1:{port} 允许来源 {origins}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main() or 0)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_cookie_agent.py -q`
Expected: PASS（9 passed：Task 1 的 5 + 本任务 4）

- [ ] **Step 5: 改 .gitignore**

在 `.gitignore` 末尾追加：

```
client/agent_config.json
data/yitian_config.json
data/yitian_config.json.tmp
```

- [ ] **Step 6: 提交**

```bash
git add client/cookie_agent.py tests/test_cookie_agent.py .gitignore
git commit -m "feat(agent): 无界面本机 cookie 代理(127.0.0.1+Origin白名单+预检) (V2.7.1)"
```

---

## Task 3: yitian_config.py 倚天 cookie 读写纯函数

**Files:**
- Create: `yitian_config.py`
- Test: `tests/test_yitian_config.py`

**Interfaces:**
- Produces（仿 `pmis_config.py`，无 SESSION 校验）：
  - `session_preview(cookie) -> str`（前 8 位）
  - `write_session_cookie(config_path, cookie) -> str`（非空校验；文件不存在则新建；返回预览）
  - `read_session_status(config_path) -> dict`（`{sessionPreview, updatedAt}`）

- [ ] **Step 1: 写失败测试**

创建 `tests/test_yitian_config.py`：

```python
import json
import os
import pytest
import yitian_config


def test_write_and_read_roundtrip(tmp_path):
    p = str(tmp_path / 'yitian_config.json')
    preview = yitian_config.write_session_cookie(p, 'XSRF-TOKEN=abcdefgh; PHPSESSID=xyz')
    assert preview == 'XSRF-TOK'                    # 前 8 位
    status = yitian_config.read_session_status(p)
    assert status['sessionPreview'] == 'XSRF-TOK' and status['updatedAt']
    # 落盘保留其它键
    with open(p, encoding='utf-8') as f:
        assert json.load(f)['session_cookie'].startswith('XSRF-TOKEN=')


def test_write_creates_missing_file_and_keeps_other_keys(tmp_path):
    p = str(tmp_path / 'sub' / 'yitian_config.json')   # 目录不存在
    yitian_config.write_session_cookie(p, 'a=1')
    assert os.path.exists(p)
    # 再写保留已存在的其它键
    with open(p, encoding='utf-8') as f:
        d = json.load(f)
    d['note'] = 'keep'
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f)
    yitian_config.write_session_cookie(p, 'b=2')
    with open(p, encoding='utf-8') as f:
        d2 = json.load(f)
    assert d2['session_cookie'] == 'b=2' and d2['note'] == 'keep'


def test_empty_cookie_rejected(tmp_path):
    p = str(tmp_path / 'yitian_config.json')
    with pytest.raises(ValueError):
        yitian_config.write_session_cookie(p, '   ')


def test_read_missing_file_returns_blank(tmp_path):
    status = yitian_config.read_session_status(str(tmp_path / 'nope.json'))
    assert status == {'sessionPreview': '', 'updatedAt': ''}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_config.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'yitian_config'`）

- [ ] **Step 3: 写实现**

创建 `yitian_config.py`：

```python
"""data/yitian_config.json 的 session_cookie 读写(独立纯函数,供 server 端点与测试复用)。
仿 pmis_config.py,但倚天 cookie 无固定 SESSION 键,故只校验非空。不依赖 server。"""
import json
import os
import time


def session_preview(cookie):
    """取 cookie 串前 8 位;空则空串(倚天无固定 SESSION 键)。"""
    return (cookie or '').strip()[:8]


def write_session_cookie(config_path, cookie):
    """把 session_cookie 写 config.json(不存在则新建,保留其余键),原子替换。
    cookie 必须非空。返回前 8 位预览。"""
    cookie = (cookie or '').strip()
    if not cookie:
        raise ValueError('cookie 为空')
    config = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except (OSError, ValueError):
            config = {}
    config['session_cookie'] = cookie
    os.makedirs(os.path.dirname(config_path) or '.', exist_ok=True)
    tmp = config_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    os.replace(tmp, config_path)
    return session_preview(cookie)


def read_session_status(config_path):
    """返回 {sessionPreview, updatedAt}。文件不存在/坏 JSON 返回空串。"""
    try:
        mtime = os.path.getmtime(config_path)
        with open(config_path, 'r', encoding='utf-8') as f:
            cookie = json.load(f).get('session_cookie', '')
    except (OSError, ValueError):
        return {'sessionPreview': '', 'updatedAt': ''}
    return {
        'sessionPreview': session_preview(cookie),
        'updatedAt': time.strftime('%Y-%m-%d %H:%M', time.localtime(mtime)),
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian_config.py -q`
Expected: PASS（4 passed）

- [ ] **Step 5: 提交**

```bash
git add yitian_config.py tests/test_yitian_config.py
git commit -m "feat(yitian): yitian_config 倚天 cookie 读写纯函数(无SESSION校验) (V2.7.1)"
```

---

## Task 4: 服务端 /api/yitian/cookie 端点 + 审计

**Files:**
- Modify: `server.py`
- Modify: `audit.py`
- Test: `tests/test_server_yitian.py`

**Interfaces:**
- Consumes: `yitian_config.write_session_cookie`/`read_session_status`；Task 3 之后可用
- Produces: `POST /api/yitian/cookie {cookie}`（超管，存 `data/yitian_config.json`，审计 yitian.cookie_save）；`GET /api/yitian/cookie`（超管，状态）

- [ ] **Step 1: 写失败测试**

创建 `tests/test_server_yitian.py`：

```python
import json
import http.client
import threading
import auth
import audit
import server


def _wait_for(predicate, timeout=1.0, interval=0.02):
    import time
    deadline = time.time() + timeout
    r = predicate()
    while not r and time.time() < deadline:
        time.sleep(interval)
        r = predicate()
    return r


def _start(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    monkeypatch.setattr(audit, "AUDIT_LOG_FILE", str(tmp_path / "audit_log.jsonl"))
    monkeypatch.setattr(audit, "AUDIT_ARCHIVE_DIR", str(tmp_path / "audit_archive"))
    monkeypatch.setattr(server, "YITIAN_CONFIG", str(tmp_path / "yitian_config.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, port


def _login(port, account="admin", password="wxtnb"):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": password}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = (r.getheader("Set-Cookie") or "").split(";")[0]
    r.read()
    return conn, cookie


def test_super_save_and_get_yitian_cookie(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port)
        conn.request("POST", "/api/yitian/cookie", json.dumps({"cookie": "XSRF-TOKEN=abcdefgh; PHPSESSID=y"}),
                     {"Content-Type": "application/json", "Cookie": ck})
        r = conn.getresponse()
        assert r.status == 200
        assert json.loads(r.read())["sessionPreview"] == "XSRF-TOK"
        conn.request("GET", "/api/yitian/cookie", headers={"Cookie": ck})
        r2 = conn.getresponse()
        assert r2.status == 200 and json.loads(r2.read())["sessionPreview"] == "XSRF-TOK"
        # 审计落一条 yitian.cookie_save
        assert _wait_for(lambda: audit.read({"event": ["yitian.cookie_save"]}, 1, 50)["total"] >= 1)
    finally:
        srv.shutdown(); srv.server_close()


def test_empty_cookie_rejected(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port)
        conn.request("POST", "/api/yitian/cookie", json.dumps({"cookie": ""}),
                     {"Content-Type": "application/json", "Cookie": ck})
        r = conn.getresponse()
        body = json.loads(r.read())
        assert body.get("success") is False
    finally:
        srv.shutdown(); srv.server_close()


def test_non_super_forbidden(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, ck = _login(port)
        conn.request("POST", "/api/admin/accounts/create",
                     json.dumps({"account": "pu", "password": "Pw123456", "displayName": "p",
                                 "allowedPages": ["projects"], "allowedL4": ["交付一部"]}),
                     {"Content-Type": "application/json", "Cookie": ck})
        conn.getresponse().read()
        conn2, ck2 = _login(port, "pu", "Pw123456")
        conn2.request("GET", "/api/yitian/cookie", headers={"Cookie": ck2})
        assert conn2.getresponse().status == 403
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_yitian.py -q`
Expected: FAIL（端点不存在/`YITIAN_CONFIG` 未定义）

- [ ] **Step 3a: audit.py 加动作**

在 `audit.py` 的 `_ACTION_MAP` 中，`('POST', '/api/pmis/cookie'): ('pmis.cookie_save', '更新PMIS Cookie'),` 一行之后追加：

```python
    ('POST', '/api/yitian/cookie'): ('yitian.cookie_save', '更新倚天 Cookie'),
```

- [ ] **Step 3b: server.py 加常量、处理器、布线、超管化**

在 `server.py` 中 `PMISDATA_CONFIG = os.path.join(PMISDATA_DIR, 'config.json')` 一行之后追加：

```python
YITIAN_CONFIG = os.path.join(BASE_DIR, 'data', 'yitian_config.json')
```

在 `_SUPER_ONLY_PATHS` 集合里，`'/api/pmis/cookie', '/api/pmis/download',` 一行改为：

```python
    '/api/pmis/cookie', '/api/pmis/download',
    '/api/yitian/cookie',
```

在 `handle_pmis_cookie_save` 方法之后新增两个处理器：

```python
    def handle_yitian_cookie_get(self):
        """GET /api/yitian/cookie - 当前倚天 cookie 状态。超管专属。"""
        import yitian_config
        self._json_response(yitian_config.read_session_status(YITIAN_CONFIG))

    def handle_yitian_cookie_save(self):
        """POST /api/yitian/cookie {cookie} - 写 data/yitian_config.json。超管专属。"""
        import yitian_config
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求体解析失败: {e}"))
            return
        try:
            preview = yitian_config.write_session_cookie(YITIAN_CONFIG, body.get('cookie') or '')
        except ValueError as e:
            self._json_response(_error_payload(ERR_VALIDATION, str(e)))
            return
        except OSError as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"写入失败: {e}"))
            return
        self._json_response({"success": True, "sessionPreview": preview, "message": "倚天 Cookie 已更新"})
```

在 `_dispatch_get` 的分发链里，`elif parsed.path == '/api/pmis/cookie':` 分支（`self.handle_pmis_cookie_get()`）之后追加：

```python
        elif parsed.path == '/api/yitian/cookie':
            self.handle_yitian_cookie_get()
```

在 `_dispatch_post` 的分发链里，`elif parsed.path == '/api/pmis/cookie':` 分支（`self.handle_pmis_cookie_save()`）之后追加：

```python
        elif parsed.path == '/api/yitian/cookie':
            self.handle_yitian_cookie_save()
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_server_yitian.py tests/test_server_audit.py -q`
Expected: PASS（新端点 3 + 既有审计测试均通过）

- [ ] **Step 5: 后端全量回归**

Run: `python -m pytest -q`
Expected: PASS（全绿）

- [ ] **Step 6: 提交**

```bash
git add server.py audit.py tests/test_server_yitian.py
git commit -m "feat(yitian): GET/POST /api/yitian/cookie 超管端点 + 审计 (V2.7.1)"
```

---

## Task 5: 前端 lib/cookieAgent.ts

**Files:**
- Create: `frontend/src/lib/cookieAgent.ts`
- Test: `frontend/src/lib/cookieAgent.test.ts`

**Interfaces:**
- Produces:
  - `interface AgentCookieResult { ok: boolean; cookie: string; names: string[]; hasSession?: boolean; error: string }`
  - `pingAgent(): Promise<boolean>`
  - `fetchPmisCookie(): Promise<AgentCookieResult>`
  - `fetchYitianCookie(): Promise<AgentCookieResult>`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/cookieAgent.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { pingAgent, fetchPmisCookie } from './cookieAgent'

afterEach(() => { vi.restoreAllMocks() })

describe('cookieAgent', () => {
  it('pingAgent 连通返回 true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await pingAgent()).toBe(true)
  })

  it('pingAgent 连不上返回 false（不抛）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('conn refused')))
    expect(await pingAgent()).toBe(false)
  })

  it('fetchPmisCookie 透传代理 JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true, cookie: 'SESSION=z', names: ['SESSION'], hasSession: true, error: '' }),
    }))
    const r = await fetchPmisCookie()
    expect(r.ok).toBe(true)
    expect(r.hasSession).toBe(true)
    expect(r.cookie).toBe('SESSION=z')
  })

  it('fetchPmisCookie 代理未运行返回中文错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('failed')))
    const r = await fetchPmisCookie()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('本机代理')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/cookieAgent.test.ts`
Expected: FAIL（`Cannot find module './cookieAgent'`）

- [ ] **Step 3: 写实现**

创建 `frontend/src/lib/cookieAgent.ts`：

```ts
// 本机 cookie 代理(cookie_agent.py)客户端。代理只监听 127.0.0.1:8765。
const AGENT_BASE = 'http://127.0.0.1:8765'

export interface AgentCookieResult {
  ok: boolean
  cookie: string
  names: string[]
  hasSession?: boolean
  error: string
}

export async function pingAgent(): Promise<boolean> {
  try {
    const r = await fetch(AGENT_BASE + '/ping', { credentials: 'omit' })
    return r.ok
  } catch {
    return false
  }
}

async function agentGet(path: string): Promise<AgentCookieResult> {
  try {
    const r = await fetch(AGENT_BASE + path, { credentials: 'omit' })
    if (!r.ok) return { ok: false, cookie: '', names: [], error: `本机代理返回 ${r.status}` }
    return (await r.json()) as AgentCookieResult
  } catch {
    return { ok: false, cookie: '', names: [], error: '本机代理未运行或无法连接（请确认已启动 cookie 代理）' }
  }
}

export function fetchPmisCookie(): Promise<AgentCookieResult> {
  return agentGet('/pmis-cookie')
}

export function fetchYitianCookie(): Promise<AgentCookieResult> {
  return agentGet('/yitian-cookie')
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/cookieAgent.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/cookieAgent.ts frontend/src/lib/cookieAgent.test.ts
git commit -m "feat(agent): 前端 lib/cookieAgent 封装本机代理调用 (V2.7.1)"
```

---

## Task 6: DataView 接入本机取 cookie + 倚天区 + 版本号

**Files:**
- Modify: `frontend/src/views/DataView.vue`
- Modify: `frontend/src/views/DataView.test.ts`
- Modify: `frontend/src/version.ts`

**Interfaces:**
- Consumes: `@/lib/cookieAgent` 的 `pingAgent`/`fetchPmisCookie`/`fetchYitianCookie`；`@/api/client` 的 `api`
- Produces: DataView 暴露 `onFetchPmisCookie`/`onFetchYitianCookie`/`checkAgent`（供测试）

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/DataView.test.ts` 顶部的 `vi.mock` 区追加对 cookieAgent 的 mock（若文件已有 `vi.mock('@/api/client', ...)` 则保留），并追加用例。新增 mock 与用例：

```ts
import * as cookieAgent from '@/lib/cookieAgent'

vi.mock('@/lib/cookieAgent', () => ({
  pingAgent: vi.fn().mockResolvedValue(true),
  fetchPmisCookie: vi.fn(),
  fetchYitianCookie: vi.fn(),
}))

describe('DataView 本机取 cookie', () => {
  it('获取本机 PMIS cookie(含 SESSION) → 推送到 /api/pmis/cookie', async () => {
    const { api } = await import('@/api/client')
    vi.spyOn(api, 'post').mockResolvedValue({ sessionPreview: 'SESSION1' } as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'SESSION=z; a=b', names: ['SESSION', 'a'], hasSession: true, error: '',
    })
    const w = mountDataView()   // 复用本文件既有挂载工具(见文件内 helper)
    await flushPromises()
    await (w.vm as unknown as { onFetchPmisCookie: () => Promise<void> }).onFetchPmisCookie()
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/api/pmis/cookie', { cookie: 'SESSION=z; a=b' })
  })

  it('取到无 SESSION → 告警且不推送', async () => {
    const { api } = await import('@/api/client')
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({} as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'a=b', names: ['a'], hasSession: false, error: '',
    })
    const w = mountDataView()
    await flushPromises()
    await (w.vm as unknown as { onFetchPmisCookie: () => Promise<void> }).onFetchPmisCookie()
    await flushPromises()
    expect(postSpy).not.toHaveBeenCalledWith('/api/pmis/cookie', expect.anything())
  })
})
```

> 注：**先 Read `DataView.test.ts` 全文**，对齐它现有的挂载方式（该文件已能挂载 DataView，含 pinia/composable/api 的 mock 脚手架）。上面用例里的 `mountDataView()` 是占位——实际请用该文件既有的挂载调用（内联 `mount(DataView, {...})` 或其 helper）替换，`vi.mock('@/lib/cookieAgent', ...)` 放到文件顶层 mock 区，仅新增上面两个「断言块」用例（断言内容照抄，挂载沿用现有）。若现有文件对 `@/api/client` 已有 mock，则复用；否则按上面 `vi.spyOn(api,'post')` 方式。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: FAIL（`onFetchPmisCookie` 未定义 / cookieAgent 未接入）

- [ ] **Step 3a: DataView 脚本接入**

在 `frontend/src/views/DataView.vue` 的 `<script setup>` 里，`import { api } from '@/api/client'` 之后追加：

```ts
import { pingAgent, fetchPmisCookie, fetchYitianCookie } from '@/lib/cookieAgent'
```

在 `// —— PMIS 在线下载 ——` 相关 ref 之后（`cookieErr` 定义附近）追加：

```ts
const agentOnline = ref(false)
const yitianStatus = ref<{ sessionPreview: string; updatedAt: string }>({ sessionPreview: '', updatedAt: '' })
const yitianMsg = ref('')
const yitianErr = ref(false)

async function checkAgent() {
  agentOnline.value = await pingAgent()
}
async function loadYitianStatus() {
  try { yitianStatus.value = await api.get('/api/yitian/cookie') } catch { /* 未登录/缺接口静默 */ }
}

async function onFetchPmisCookie() {
  cookieMsg.value = ''; cookieErr.value = false
  const res = await fetchPmisCookie()
  if (!res.ok) { cookieErr.value = true; cookieMsg.value = 'PMIS cookie 获取失败：' + res.error; return }
  if (!res.hasSession) {
    cookieErr.value = true
    cookieMsg.value = '未检测到 PMIS 登录态（cookie 无 SESSION），请先在零信任内登录 PMIS'
    return
  }
  try {
    const r = await api.post<{ sessionPreview: string }>('/api/pmis/cookie', { cookie: res.cookie })
    cookieStatus.value = { sessionPreview: r.sessionPreview, updatedAt: '刚刚' }
    cookieMsg.value = `已获取并推送 PMIS cookie（${res.names.length} 项）`
  } catch (e) {
    cookieErr.value = true; cookieMsg.value = '推送失败：' + (e instanceof Error ? e.message : String(e))
  }
}

async function onFetchYitianCookie() {
  yitianMsg.value = ''; yitianErr.value = false
  const res = await fetchYitianCookie()
  if (!res.ok) { yitianErr.value = true; yitianMsg.value = '倚天 cookie 获取失败：' + res.error; return }
  try {
    const r = await api.post<{ sessionPreview: string }>('/api/yitian/cookie', { cookie: res.cookie })
    yitianStatus.value = { sessionPreview: r.sessionPreview, updatedAt: '刚刚' }
    yitianMsg.value = `已获取并存储倚天 cookie（${res.names.length} 项，备用）`
  } catch (e) {
    yitianErr.value = true; yitianMsg.value = '存储失败：' + (e instanceof Error ? e.message : String(e))
  }
}
```

在 `<script setup>` 末尾追加（新增独立 onMounted 与暴露，多个 onMounted 合法、不改既有那个）：

```ts
onMounted(() => { checkAgent(); loadYitianStatus() })
defineExpose({ onFetchPmisCookie, onFetchYitianCookie, checkAgent })
```

> 若 `onMounted` 尚未从 vue 导入，则在顶部 `import { ... } from 'vue'` 里补 `onMounted`。若文件已有 `defineExpose`，把上面三个方法并入其对象。

- [ ] **Step 3b: DataView 模板接入**

在「数据下载 / 更新数据」卡片中，把现有 PMIS Cookie 行（`<div class="dv-row dv-cookie">...</div>`）之后紧接着追加一行「本机代理」按钮与状态：

```html
      <div class="dv-row">
        <button class="dv-btn primary" data-test="btn-fetch-pmis-cookie" @click="onFetchPmisCookie">获取本机 PMIS cookie 并推送</button>
        <span class="dv-hint">本机代理：{{ agentOnline ? '已连接' : '未运行（请启动 cookie 代理）' }}</span>
      </div>
```

在该卡片 `</div>`（`dv-card` 结束）之后，新增一个倚天卡片：

```html
    <div class="dv-card">
      <div class="dv-card-head">倚天 Cookie（取到备用，暂无下载）</div>
      <div class="dv-row">
        <button class="dv-btn" data-test="btn-fetch-yitian-cookie" @click="onFetchYitianCookie">获取本机倚天 cookie 并存储</button>
        <span class="dv-hint">当前 {{ yitianStatus.sessionPreview || '-' }} · 更新于 {{ yitianStatus.updatedAt || '-' }} · 本机代理：{{ agentOnline ? '已连接' : '未运行' }}</span>
      </div>
      <div v-if="yitianMsg" class="dv-row dv-hint" :class="yitianErr ? '' : 'ok'">{{ yitianMsg }}</div>
    </div>
```

- [ ] **Step 3c: 版本号 V2.7.1**

改 `frontend/src/version.ts`：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V2.7.1'
export const RELEASE_DATE = '2026-07-09'
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts src/lib/cookieAgent.test.ts`
Expected: PASS

- [ ] **Step 5: 前端校验**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: typecheck 通过、build 成功

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts frontend/src/version.ts
git commit -m "feat(agent): DataView 本机取 cookie 按钮 + 倚天区 + V2.7.1"
```

---

## Task 7: client/README 更新 + 全量 verify + PROGRESS（控制者直接做）

**Files:**
- Modify: `client/README.md`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 更新 client/README.md**

在 `client/README.md` 增补「无界面本机代理」用法段：说明 `python cookie_agent.py` 启动（或 PyInstaller 出 exe），常驻监听 `127.0.0.1:8765`，开机自启建议（Windows 启动目录放快捷方式），`/data` 网页点「获取本机 PMIS/倚天 cookie」即用；`agent_config.json` 可配 `port`/`allowed_origins`（默认含平台 IP）。保留原 GUI 说明作为手动兜底。

- [ ] **Step 2: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md` 顶部版本日志把 V2.7.0 降为「上一版本」，新增 V2.7.1「当前版本」条目：本机 cookie 代理（`client/cookie_agent.py`，127.0.0.1+Origin 白名单）+ `/data` 网页「获取本机 cookie」按钮 + 新增 `/api/yitian/cookie`（超管，存 `data/yitian_config.json`，审计 yitian.cookie_save）；PMIS 全链路复用、脚本零改动；倚天仅取+存备用；升级须重启后端、不需点更新数据；本机代理单独装。

- [ ] **Step 4: 提交**

```bash
git add client/README.md PROGRESS.md
git commit -m "docs: V2.7.1 本机 cookie 代理集成收官(README+PROGRESS)"
```

---

## Self-Review 检查（已随计划完成）

- **Spec 覆盖**：本机代理(3.1)→Task 1/2；服务端 yitian 端点(3.3)→Task 4 + yitian_config Task 3；前端(3.2)→Task 5/6；安全护栏(4)→Task 2（Origin/预检）+ Task 4（超管）；错误处理(5)→Task 5/6（未运行/无 SESSION）；审计→Task 4；测试(6)→各任务 TDD；版本/交付(7)→Task 6/7。PMIS pipeline 零改动（无任务改 `pmisdata/*`，符合 spec）。无遗漏。
- **占位符**：无 TBD/TODO；每个改代码步骤含完整代码或精确 Edit 前后串。DataView 测试沿用现有脚手架处已注明如何对齐（非占位）。
- **类型/命名一致**：`AgentCookieResult`/`pingAgent`/`fetchPmisCookie`/`fetchYitianCookie`（Task 5→6 一致）；`silent_fetch`/`fetch_pmis`/`fetch_yitian`（Task 1→2 一致）；`yitian_config.write_session_cookie`/`read_session_status`（Task 3→4 一致）；`YITIAN_CONFIG`、`/api/yitian/cookie`、审计 `yitian.cookie_save` 全计划一致；代理端点 `/ping`/`/pmis-cookie`/`/yitian-cookie` 与前端 `AGENT_BASE=127.0.0.1:8765` 一致。
