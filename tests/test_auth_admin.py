import importlib
import auth


def _fresh_accounts():
    # 一个超管 + 一个普通账号的内存 accounts dict
    data = {'version': 1, 'users': {}}
    data['users']['boss'] = auth._make_user('p1', '超管', is_super=True)
    data['users']['liu'] = auth._make_user('p2', '老刘', is_super=False,
                                            pages=['projects'], l4=['北京'])
    return data


def test_create_account_adds_normal_user():
    acc = _fresh_accounts()
    out = auth.create_account(acc, 'newbie', 'pw123', '新人',
                              ['projects', 'payment'], ['上海'])
    assert 'newbie' in out['users']
    u = out['users']['newbie']
    assert u['isSuper'] is False
    assert u['allowedPages'] == ['projects', 'payment']
    assert u['allowedL4'] == ['上海']
    assert u['hash'] != 'pw123' and u['salt']
    assert auth.verify_password('pw123', u['salt'], u['hash'])
    # 不改入参
    assert 'newbie' not in acc['users']


def test_create_account_duplicate_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(ValueError):
        auth.create_account(acc, 'liu', 'x', '撞名', ['projects'], ['北京'])


def test_create_account_invalid_name_raises():
    acc = _fresh_accounts()
    import pytest
    for bad in ['', '  ', 'has space', 'x' * 65, '中文名']:
        with pytest.raises(ValueError):
            auth.create_account(acc, bad, 'pw', 'n', ['projects'], ['北京'])


def test_create_account_empty_password_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(ValueError):
        auth.create_account(acc, 'newbie', '', 'n', ['projects'], ['北京'])


def test_update_account_changes_fields():
    acc = _fresh_accounts()
    out = auth.update_account(acc, 'liu', display_name='老刘改',
                              pages=['*'], l4=['*'])
    u = out['users']['liu']
    assert u['displayName'] == '老刘改'
    assert u['allowedPages'] == ['*'] and u['allowedL4'] == ['*']
    # 入参不变
    assert acc['users']['liu']['displayName'] == '老刘'


def test_update_account_password_rehash():
    acc = _fresh_accounts()
    old = acc['users']['liu']['hash']
    out = auth.update_account(acc, 'liu', password='brandnew')
    u = out['users']['liu']
    assert u['hash'] != old
    assert auth.verify_password('brandnew', u['salt'], u['hash'])
    assert not auth.verify_password('p2', u['salt'], u['hash'])


def test_update_account_super_target_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(ValueError):
        auth.update_account(acc, 'boss', display_name='x')


def test_update_account_missing_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(KeyError):
        auth.update_account(acc, 'ghost', display_name='x')


def test_update_account_partial_keeps_others():
    acc = _fresh_accounts()
    out = auth.update_account(acc, 'liu', display_name='仅改名')
    u = out['users']['liu']
    assert u['allowedPages'] == ['projects'] and u['allowedL4'] == ['北京']


def test_delete_account_removes_normal():
    acc = _fresh_accounts()
    out = auth.delete_account(acc, 'liu')
    assert 'liu' not in out['users']
    assert 'liu' in acc['users']  # 入参不变


def test_delete_account_super_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(ValueError):
        auth.delete_account(acc, 'boss')


def test_delete_account_missing_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(KeyError):
        auth.delete_account(acc, 'ghost')


def test_validate_str_list_dedup_and_bounds():
    import pytest
    assert auth._validate_str_list(['a', 'a', 'b'], 'pages') == ['a', 'b']
    assert auth._validate_str_list(['*'], 'pages') == ['*']
    assert auth._validate_str_list(['x' * 64], 'pages') == ['x' * 64]
    with pytest.raises(ValueError):
        auth._validate_str_list(['x' * 65], 'pages')
    with pytest.raises(ValueError):
        auth._validate_str_list(['ok', ''], 'pages')
    with pytest.raises(ValueError):
        auth._validate_str_list('notalist', 'pages')


def test_destroy_sessions_for_account(monkeypatch):
    monkeypatch.setattr(auth, '_sessions', {}, raising=False)
    t1 = auth.create_session('liu')
    t2 = auth.create_session('liu')
    t3 = auth.create_session('boss')
    auth.destroy_sessions_for_account('liu')
    assert auth.validate_session(t1) is None
    assert auth.validate_session(t2) is None
    assert auth.validate_session(t3) == 'boss'


def test_list_public_accounts_strips_secrets(tmp_path, monkeypatch):
    f = tmp_path / 'accounts.json'
    monkeypatch.setattr(auth, 'ACCOUNTS_FILE', str(f))
    auth.add_account('zoe', 'pw', 'Zoe', ['projects'], ['北京'])
    auth.add_account('amy', 'pw', 'Amy', ['*'], ['*'])
    lst = auth.list_public_accounts()
    accounts = [a['account'] for a in lst]
    assert accounts == sorted(accounts)
    for a in lst:
        assert 'salt' not in a and 'hash' not in a
        assert set(a.keys()) == {'account', 'displayName', 'isSuper',
                                 'allowedPages', 'allowedL4', 'allowedStaff', 'mustChangePassword'}


def test_add_edit_remove_roundtrip(tmp_path, monkeypatch):
    f = tmp_path / 'accounts.json'
    monkeypatch.setattr(auth, 'ACCOUNTS_FILE', str(f))
    pub = auth.add_account('dan', 'pw', 'Dan', ['projects'], ['北京'])
    assert pub['isSuper'] is False and 'hash' not in pub
    auth.edit_account('dan', l4=['上海', '北京'])
    assert auth.load_accounts()['users']['dan']['allowedL4'] == ['上海', '北京']
    auth.remove_account('dan')
    assert 'dan' not in auth.load_accounts()['users']


def test_create_account_non_string_fields_raise():
    acc = _fresh_accounts()
    import pytest
    # 非字符串 account → ValueError(非 TypeError 逃逸)
    with pytest.raises(ValueError):
        auth.create_account(acc, ['a'], 'pw', 'n', ['projects'], ['北京'])
    # 非字符串 displayName(dict/list) → ValueError(非 KeyError(slice)/脏数据落盘)
    with pytest.raises(ValueError):
        auth.create_account(acc, 'newbie', 'pw', {'x': 1}, ['projects'], ['北京'])
    with pytest.raises(ValueError):
        auth.create_account(acc, 'newbie', 'pw', ['a', 'b'], ['projects'], ['北京'])


def test_update_delete_non_string_account_raise():
    acc = _fresh_accounts()
    import pytest
    # 非字符串 account 不再因 `in dict` 抛 TypeError,统一 ValueError
    with pytest.raises(ValueError):
        auth.update_account(acc, ['liu'], display_name='x')
    with pytest.raises(ValueError):
        auth.update_account(acc, 'liu', display_name={'x': 1})
    with pytest.raises(ValueError):
        auth.delete_account(acc, ['liu'])


def test_make_user_must_change_default_false():
    u = auth._make_user('p', '名', is_super=True)
    assert u['mustChangePassword'] is False
    u2 = auth._make_user('p', '名', is_super=False, pages=['projects'], l4=['北京'], must_change=True)
    assert u2['mustChangePassword'] is True


def test_create_account_sets_must_change_true():
    acc = _fresh_accounts()
    out = auth.create_account(acc, 'newbie', 'pw123', '新人', ['projects'], ['上海'])
    assert out['users']['newbie']['mustChangePassword'] is True


def test_seed_supers_not_must_change(tmp_path, monkeypatch):
    f = tmp_path / 'accounts.json'
    monkeypatch.setattr(auth, 'ACCOUNTS_FILE', str(f))
    auth.seed_default_accounts()
    users = auth.load_accounts()['users']
    for acc in users.values():
        assert acc['mustChangePassword'] is False


def test_public_user_exposes_must_change():
    rec = auth._make_user('p', '名', is_super=False, pages=['projects'], l4=['北京'], must_change=True)
    pub = auth.public_user('liu', rec)
    assert pub['mustChangePassword'] is True


def test_update_account_keeps_must_change():
    acc = _fresh_accounts()
    acc = auth.create_account(acc, 'newbie', 'pw123', '新人', ['projects'], ['上海'])
    assert acc['users']['newbie']['mustChangePassword'] is True
    out = auth.update_account(acc, 'newbie', password='reset999')
    assert out['users']['newbie']['mustChangePassword'] is True  # 重置不强制再改
