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


def _reset_paths(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, 'AUDIT_LOG_FILE', str(tmp_path / 'audit_log.jsonl'))
    monkeypatch.setattr(audit, 'AUDIT_ARCHIVE_DIR', str(tmp_path / 'audit_archive'))


def test_record_read_roundtrip(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)
    audit.record({'event': 'login.success', 'action': '登录成功', 'account': 'admin',
                  'ip': '1.2.3.4', 'success': True})
    res = audit.read({}, 1, 50)
    assert res['total'] == 1
    row = res['rows'][0]
    assert row['event'] == 'login.success' and row['account'] == 'admin'
    assert 'ts' in row and row['ts']                 # record 自动补 ts
    assert res['facets']['accounts'] == ['admin']
    assert res['facets']['events'] == [{'code': 'login.success', 'label': '登录成功'}]


def test_read_newest_first_and_filters(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)
    audit.record({'event': 'login.success', 'action': '登录成功', 'account': 'a', 'success': True})
    audit.record({'event': 'login.failure', 'action': '登录失败', 'account': 'b', 'success': False})
    # 最新在前
    assert audit.read({}, 1, 50)['rows'][0]['account'] == 'b'
    # 账号筛选
    assert [r['account'] for r in audit.read({'account': 'a'}, 1, 50)['rows']] == ['a']
    # 结果筛选
    assert [r['account'] for r in audit.read({'result': 'failure'}, 1, 50)['rows']] == ['b']
    # 事件筛选
    assert [r['account'] for r in audit.read({'event': ['login.success']}, 1, 50)['rows']] == ['a']
    # 关键字(命中 action/account)
    assert audit.read({'kw': '失败'}, 1, 50)['total'] == 1


def test_read_pagination(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)
    for i in range(5):
        audit.record({'event': 'x', 'action': 'X', 'account': 'a%d' % i, 'success': True})
    p1 = audit.read({}, 1, 2)
    assert p1['total'] == 5 and len(p1['rows']) == 2 and p1['rows'][0]['account'] == 'a4'
    p3 = audit.read({}, 3, 2)
    assert len(p3['rows']) == 1 and p3['rows'][0]['account'] == 'a0'


def test_rotation_moves_overflow_to_archive(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(audit, 'MAX_ROWS', 3)
    monkeypatch.setattr(audit, 'TRIM_MARGIN', 1)
    # 写 10 条:反复触发滚动(> MAX_ROWS+TRIM_MARGIN=4 才滚)。断言不变量,不断言精确计数。
    for i in range(10):
        audit.record({'event': 'x', 'action': 'X', 'account': 'a%d' % i, 'success': True})
    res = audit.read({}, 1, 50)
    assert res['rows'][0]['account'] == 'a9'                       # 最新在前
    assert res['total'] <= audit.MAX_ROWS + audit.TRIM_MARGIN      # 活动日志有界
    # 归档文件已生成
    import os
    year = __import__('datetime').datetime.now().astimezone().year
    archive = os.path.join(str(tmp_path / 'audit_archive'), 'audit-%d.jsonl' % year)
    assert os.path.exists(archive)
    with open(archive, encoding='utf-8') as f:
        archived = [__import__('json').loads(l) for l in f if l.strip()]
    live_accts = {r['account'] for r in res['rows']}
    arch_accts = {r['account'] for r in archived}
    assert 'a0' in arch_accts                                      # 最旧已滚入归档
    assert live_accts | arch_accts == {'a%d' % i for i in range(10)}  # 无丢失
    assert not (live_accts & arch_accts)                          # 不重复


def test_record_never_raises_on_write_failure(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)

    def boom(*a, **k):
        raise OSError('disk full')

    monkeypatch.setattr('builtins.open', boom)
    # 不应抛出
    audit.record({'event': 'x', 'action': 'X', 'account': 'a', 'success': True})
