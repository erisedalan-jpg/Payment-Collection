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
