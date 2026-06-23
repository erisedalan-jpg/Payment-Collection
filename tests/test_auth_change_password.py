import pytest
import auth


def _flagged_user_dict():
    # 一个 mustChangePassword=True 的非超管 + 一个超管
    data = {'version': 1, 'users': {}}
    data['users']['boss'] = auth._make_user('bosspw', '超管', is_super=True)
    data = auth.create_account(data, 'liu', 'temp123', '老刘', ['projects'], ['北京'])
    return data


def test_change_own_password_success_clears_flag():
    acc = _flagged_user_dict()
    out = auth.change_own_password_dict(acc, 'liu', 'temp123', 'newpass456')
    rec = out['users']['liu']
    assert rec['mustChangePassword'] is False
    assert auth.verify_password('newpass456', rec['salt'], rec['hash'])
    assert not auth.verify_password('temp123', rec['salt'], rec['hash'])
    # 入参不变
    assert acc['users']['liu']['mustChangePassword'] is True


def test_change_own_password_wrong_old_raises():
    acc = _flagged_user_dict()
    with pytest.raises(ValueError, match='原密码错误'):
        auth.change_own_password_dict(acc, 'liu', 'WRONG', 'newpass456')
    assert acc['users']['liu']['mustChangePassword'] is True  # 未改


def test_change_own_password_same_as_old_raises():
    acc = _flagged_user_dict()
    with pytest.raises(ValueError):
        auth.change_own_password_dict(acc, 'liu', 'temp123', 'temp123')


def test_change_own_password_empty_new_raises():
    acc = _flagged_user_dict()
    with pytest.raises(ValueError):
        auth.change_own_password_dict(acc, 'liu', 'temp123', '')


def test_change_own_password_missing_account_raises():
    acc = _flagged_user_dict()
    with pytest.raises(KeyError):
        auth.change_own_password_dict(acc, 'ghost', 'x', 'y')


def test_change_own_password_wrapper_persists(tmp_path, monkeypatch):
    f = tmp_path / 'accounts.json'
    monkeypatch.setattr(auth, 'ACCOUNTS_FILE', str(f))
    auth.add_account('dan', 'temp123', 'Dan', ['projects'], ['北京'])
    pub = auth.change_own_password('dan', 'temp123', 'fresh789')
    assert pub['mustChangePassword'] is False and 'hash' not in pub
    # 落盘生效:新密码可认证,旧密码失效
    assert auth.authenticate('dan', 'fresh789') is not None
    assert auth.authenticate('dan', 'temp123') is None
