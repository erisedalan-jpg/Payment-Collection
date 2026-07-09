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
