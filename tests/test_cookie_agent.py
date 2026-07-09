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
