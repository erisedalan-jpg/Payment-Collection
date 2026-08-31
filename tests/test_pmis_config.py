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


class Test首次部署时配置文件不存在:
    """V4.5.17 交付实测:新机器上 pmisdata/ 整个目录都不存在,点「获取 PMIS Cookie」
    报 `写入失败: [Errno 2] No such file or directory: ...pmisdata/config.json`。
    write_session_cookie 第一步就 open(...,'r') —— 它的「保留其余键」是对的,
    但「一台新机器上没有其余键」是正常状态,不该让首次取 cookie 直接失败。
    """

    def test_文件不存在时创建并写入(self, tmp_path):
        p = str(tmp_path / 'config.json')
        preview = pc.write_session_cookie(p, 'a=1; SESSION=newmach1-xyz')
        cfg = json.loads(open(p, encoding='utf-8').read())
        assert cfg['session_cookie'] == 'a=1; SESSION=newmach1-xyz'
        assert preview == 'newmach1'

    def test_创建出来的必须是完整模板而非只有cookie一个键(self, tmp_path):
        """只写 {"session_cookie": ...} 不够:下载脚本(fetch_pmis_tables /
        fetch_all_projects / delivery_analysis)读的是同一个文件里的十几个配置项,
        缺了它们下载会另一种方式失败。"""
        p = str(tmp_path / 'config.json')
        pc.write_session_cookie(p, 'SESSION=abcdefgh-1')
        cfg = json.loads(open(p, encoding='utf-8').read())
        for k in ('base_url', 'page_size', 'max_workers', 'max_retries',
                  'output_dir', 'phases', 'fetch_payment', 'fetch_collection_stages'):
            assert k in cfg, '默认模板缺键: %s' % k
        assert cfg['base_url'].startswith('https://')
        assert isinstance(cfg['phases'], dict)

    def test_父目录不存在时一并创建(self, tmp_path):
        """交付机上 pmisdata/ 这个目录本身也不存在。"""
        p = str(tmp_path / 'pmisdata' / 'config.json')
        pc.write_session_cookie(p, 'SESSION=mkdir123-x')
        assert json.loads(open(p, encoding='utf-8').read())['session_cookie'] == 'SESSION=mkdir123-x'

    def test_已有文件仍然只改cookie不动其余键(self, tmp_path):
        """回归安全网:加了「不存在就建」之后,已存在的那条路径必须一字不变。"""
        p = _cfg(tmp_path)
        pc.write_session_cookie(p, 'SESSION=keep0000-y')
        cfg = json.loads(open(p, encoding='utf-8').read())
        assert cfg['base_url'] == 'https://x'      # 用户自己的值,不能被模板覆盖
        assert cfg['page_size'] == 100
        assert 'max_workers' not in cfg            # 也不该把模板的键塞进来

    def test_文件存在但坏JSON时抛错绝不用模板覆盖(self, tmp_path):
        """坏 JSON 与「文件不存在」必须区别对待:前者说明用户有一份配置只是坏了,
        静默套模板会把他改过的并发数、阶段开关等一起抹掉。宁可报错让人来看。"""
        p = tmp_path / 'config.json'
        p.write_text('{ 这不是合法 JSON', encoding='utf-8')
        with pytest.raises(ValueError):
            pc.write_session_cookie(str(p), 'SESSION=shouldnt-write')
        assert '这不是合法 JSON' in p.read_text(encoding='utf-8')   # 原文未被动过
