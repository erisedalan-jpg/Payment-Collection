# -*- coding: utf-8 -*-
import json
import pytest
import pmis_config as pc


def _cfg(tmp_path, cookie='SESSION=abc12345-zzzz'):
    p = tmp_path / 'config.json'
    p.write_text(json.dumps({'session_cookie': cookie, 'base_url': 'https://x', 'page_size': 100},
                            ensure_ascii=False), encoding='utf-8')
    return str(p)


def test_write_replaces_and_keeps_other_keys(tmp_path):
    p = _cfg(tmp_path)
    preview = pc.write_session_cookie(p, 'a=1; SESSION=deadbeef-0000; b=2')
    cfg = json.loads(open(p, encoding='utf-8').read())
    assert cfg['session_cookie'] == 'a=1; SESSION=deadbeef-0000; b=2'
    assert cfg['base_url'] == 'https://x'   # 其余键保留
    assert cfg['page_size'] == 100
    assert preview == 'deadbeef'            # SESSION 前 8 位


def test_write_rejects_missing_session(tmp_path):
    p = _cfg(tmp_path)
    with pytest.raises(ValueError):
        pc.write_session_cookie(p, 'a=1; b=2')


def test_write_rejects_empty(tmp_path):
    p = _cfg(tmp_path)
    with pytest.raises(ValueError):
        pc.write_session_cookie(p, '   ')


def test_read_status(tmp_path):
    p = _cfg(tmp_path, cookie='x=1; SESSION=feedface-9999')
    st = pc.read_session_status(p)
    assert st['sessionPreview'] == 'feedface'
    assert st['updatedAt']                  # 非空时间串


def test_read_status_missing_file(tmp_path):
    st = pc.read_session_status(str(tmp_path / 'nope.json'))
    assert st == {'sessionPreview': '', 'updatedAt': ''}
