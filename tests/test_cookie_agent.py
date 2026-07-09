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
