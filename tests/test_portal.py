import portal
import pytest


def _item(**over):
    base = {'id': 'pl_' + '0' * 12, 'type': 'url', 'name': '入口', 'group': 'G',
            'emoji': '', 'featured': False, 'url': 'https://x.com', 'file': None,
            'visibility': {'mode': 'all'}}
    base.update(over)
    return base


def _cfg(items, groups=('G',)):
    return {'version': 1, 'groups': list(groups), 'items': items}


def test_is_safe_url():
    assert portal.is_safe_url('https://a.com') is True
    assert portal.is_safe_url('http://a.com') is True
    assert portal.is_safe_url('javascript:alert(1)') is False
    assert portal.is_safe_url('data:text/html,x') is False
    assert portal.is_safe_url('') is False


def test_sanitize_stored_name_strips_path():
    assert portal.sanitize_stored_name('../../etc/passwd') == 'passwd'
    assert portal.sanitize_stored_name('a\\b\\c.xlsx') == 'c.xlsx'
    assert portal.sanitize_stored_name('') == 'file'


def test_sanitize_collapses_double_dots():
    out = portal.sanitize_stored_name('report..2024.txt')
    assert '..' not in out
    assert out == 'report.2024.txt'
    assert portal._valid_stored_name(out) is True
    # 既有断言不回归
    assert portal.sanitize_stored_name('../../etc/passwd') == 'passwd'


def test_validate_ok_url_item():
    out = portal.validate_portal_config(_cfg([_item()]))
    assert out['groups'] == ['G']
    assert out['items'][0]['type'] == 'url'
    assert out['items'][0]['file'] is None


def test_validate_ok_file_item():
    it = _item(type='file', url='', file={'storedName': 'pf_x__a.xlsx', 'originalName': 'a.xlsx', 'size': 10})
    out = portal.validate_portal_config(_cfg([it]))
    assert out['items'][0]['file']['storedName'] == 'pf_x__a.xlsx'
    assert out['items'][0]['url'] == ''


def test_validate_rejects_bad_scheme():
    with pytest.raises(ValueError):
        portal.validate_portal_config(_cfg([_item(url='javascript:1')]))


def test_validate_rejects_group_not_in_groups():
    with pytest.raises(ValueError):
        portal.validate_portal_config(_cfg([_item(group='OTHER')]))


def test_validate_rejects_stored_name_traversal():
    it = _item(type='file', url='', file={'storedName': '../evil', 'originalName': 'a', 'size': 1})
    with pytest.raises(ValueError):
        portal.validate_portal_config(_cfg([it]))


def test_validate_rejects_dup_id():
    with pytest.raises(ValueError):
        portal.validate_portal_config(_cfg([_item(), _item()]))


def test_item_visible_to():
    pub = _item(visibility={'mode': 'all'})
    priv = _item(visibility={'mode': 'accounts', 'accounts': ['zhangsan']})
    assert portal.item_visible_to(pub, 'anyone') is True
    assert portal.item_visible_to(priv, 'zhangsan') is True
    assert portal.item_visible_to(priv, 'lisi') is False
    assert portal.item_visible_to(priv, 'lisi', is_super=True) is True


def test_visible_for_account_filters_and_shrinks_groups():
    a = _item(id='pl_' + 'a' * 12, group='G', visibility={'mode': 'all'})
    b = _item(id='pl_' + 'b' * 12, group='H', visibility={'mode': 'accounts', 'accounts': ['zhangsan']})
    cfg = _cfg([a, b], groups=('G', 'H'))
    out = portal.visible_for_account(cfg, 'lisi')
    assert [it['id'] for it in out['items']] == ['pl_' + 'a' * 12]
    assert out['groups'] == ['G']   # H 无可见项被收敛


def test_orphan_files():
    it = _item(id='pl_' + 'a' * 12, type='file', url='', file={'storedName': 'pf_keep__a', 'originalName': 'a', 'size': 1})
    cfg = _cfg([it])
    assert portal.orphan_files(cfg, ['pf_keep__a', 'pf_orphan__b']) == ['pf_orphan__b']


def test_content_disposition_rfc5987_chinese():
    d = portal.content_disposition('周报模板.xlsx')
    assert d.startswith('attachment;')
    assert "filename*=UTF-8''" in d
    assert '%E5' in d  # 中文被百分号编码


def test_new_file_token_prefix():
    t = portal.new_file_token()
    assert t.startswith('pf_') and len(t) >= 9
