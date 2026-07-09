import datetime
import audit


def _iso(days_ago):
    dt = datetime.datetime.now().astimezone() - datetime.timedelta(days=days_ago)
    return dt.isoformat(timespec='seconds')


def test_map_action_hits_and_misses():
    assert audit.map_action('POST', '/api/admin/accounts/create') == ('account.create', '创建账号')
    assert audit.map_action('POST', '/api/tags') == ('tags.save', '保存标签')
    assert audit.map_action('GET', '/api/reprocess') == ('data.reprocess', '数据更新')
    # 登录/登出不入表(由 handler 显式补录)
    assert audit.map_action('POST', '/api/login') is None
    assert audit.map_action('POST', '/api/logout') is None
    # 读端点/未知路径不审计
    assert audit.map_action('GET', '/api/auth/me') is None
    assert audit.map_action('GET', '/data/analysis_data.json') is None


def test_client_ip_prefers_xff_then_xreal_then_addr():
    assert audit.client_ip({'X-Forwarded-For': '1.2.3.4, 5.6.7.8'}, ('127.0.0.1', 9)) == '1.2.3.4'
    assert audit.client_ip({'X-Real-IP': '9.9.9.9'}, ('127.0.0.1', 9)) == '9.9.9.9'
    assert audit.client_ip({}, ('10.0.0.1', 9)) == '10.0.0.1'
    assert audit.client_ip({}, None) == ''


def test_trim_by_row_count():
    events = [{'ts': _iso(0), 'i': i} for i in range(5)]
    kept, overflow = audit._trim_and_archive(events, max_rows=3, max_days=365, now=_now())
    assert [e['i'] for e in kept] == [2, 3, 4]
    assert [e['i'] for e in overflow] == [0, 1]


def test_trim_by_age():
    events = [
        {'ts': _iso(400), 'i': 0},   # 早于 365 天 → 溢出
        {'ts': _iso(10), 'i': 1},
        {'ts': _iso(1), 'i': 2},
    ]
    kept, overflow = audit._trim_and_archive(events, max_rows=100, max_days=365, now=_now())
    assert [e['i'] for e in kept] == [1, 2]
    assert [e['i'] for e in overflow] == [0]


def test_trim_nothing_when_within_limits():
    events = [{'ts': _iso(1), 'i': i} for i in range(3)]
    kept, overflow = audit._trim_and_archive(events, max_rows=10, max_days=365, now=_now())
    assert overflow == [] and len(kept) == 3


def _now():
    import time
    return time.time()
