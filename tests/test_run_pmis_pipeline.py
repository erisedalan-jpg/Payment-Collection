# -*- coding: utf-8 -*-
"""pmisdata/run_pmis_pipeline.py —— 下载流水线的跨平台实现（Windows 单机 exe 版走它）。

真正的下载依赖 PMIS 网络与零信任，端到端测不了。但**最容易静默失效的那部分可以测**：
它与 `server.classify_download_line` 的文本契约。两者分别在 .py 脚本和 server.py 里，
没有任何编译期约束把它们绑在一起 —— 改一句文案就会让进度条永远停在 0%，而所有
既有测试照样绿。
"""
import os
import sys

import pytest

import server as S

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                'pmisdata'))
pipeline = pytest.importorskip('run_pmis_pipeline')


PRODUCTS = pipeline.PMIS_FILES + pipeline.INPUT_FILES

# 探针模块源码。刻意用三引号 + 真实换行写:含 \n 转义的字符串在本仓的工具链里
# 反复被降解成真换行、把文件写成语法错误(踩过六次),能不写转义就不写。
PROBE_SRC = '''import os

with open(os.environ['PROBE_LOG'], 'a', encoding='utf-8') as _f:
    _f.write('x')


def main():
    pass
'''


def _fake_steps(monkeypatch, script_dir, produce=True, fail_on=None):
    """把三个抓数脚本换成替身:不联网,只按需造出产物文件。"""
    calls = []

    def _fake(module_name):
        calls.append(module_name)
        if fail_on == module_name:
            return 1
        if produce and module_name == 'fetch_pmis_tables':
            for f in PRODUCTS:
                open(os.path.join(script_dir, f), 'w', encoding='utf-8').write('x')
        return 0

    monkeypatch.setattr(pipeline, '_run_step', _fake)
    return calls


def _run(tmp_path, monkeypatch, capsys, **kw):
    script_dir = tmp_path / 'pmisdata'
    script_dir.mkdir()
    plat = tmp_path / 'plat'
    plat.mkdir()
    monkeypatch.setenv('PMISDATA_DIR', str(script_dir))
    monkeypatch.setenv('PMPLATFORM_DIR', str(plat))
    calls = _fake_steps(monkeypatch, str(script_dir), **kw)
    rc = pipeline.main()
    out = capsys.readouterr().out.splitlines()
    return rc, out, str(script_dir), str(plat), calls


def test_进度标记能被server逐条解析出完整进度(tmp_path, monkeypatch, capsys):
    """★ 跨文件契约:py 脚本的步骤文案 与 server._DOWNLOAD_MARKERS 必须对得上。

    只断言「跑通了」是不够的 —— 进度条失灵时流水线照样跑完。这里真的把每一行
    喂给 server 的解析函数，要求 8 个进度点一个不少。
    """
    rc, out, _sd, _pl, _calls = _run(tmp_path, monkeypatch, capsys)
    assert rc == 0
    got = set()
    for line in out:
        parsed = S.classify_download_line(line)
        if parsed and parsed[0] is not None:
            got.add(parsed[0])
    expected = {prog for _n, prog, _m in S._DOWNLOAD_MARKERS}
    assert got == expected, '缺失的进度点: %s' % sorted(expected - got)
    assert 100 in got, '没有「流水线完成」→ 前端进度条永远到不了 100%'


def test_三步按顺序执行(tmp_path, monkeypatch, capsys):
    _rc, _out, _sd, _pl, calls = _run(tmp_path, monkeypatch, capsys)
    assert calls == ['fetch_pmis_tables', 'fetch_all_projects', 'delivery_analysis']


def test_产物齐全才拷贝到平台input(tmp_path, monkeypatch, capsys):
    rc, _out, _sd, plat, _calls = _run(tmp_path, monkeypatch, capsys)
    assert rc == 0
    for f in pipeline.PMIS_FILES:
        assert os.path.isfile(os.path.join(plat, 'input', 'pmis', f)), f
    for f in pipeline.INPUT_FILES:
        assert os.path.isfile(os.path.join(plat, 'input', f)), f


def test_产物缺失时绝不拷贝(tmp_path, monkeypatch, capsys):
    """半份数据覆盖上去比不覆盖更难查:平台会拿着新旧混合的数据算指标,
    而「更新数据」不会报任何错。"""
    rc, out, _sd, plat, _calls = _run(tmp_path, monkeypatch, capsys, produce=False)
    assert rc == 1
    assert not os.path.exists(os.path.join(plat, 'input')), '产物缺失却拷贝了'
    assert any('缺失' in ln for ln in out)


def test_某一步失败则终止且不拷贝(tmp_path, monkeypatch, capsys):
    rc, out, _sd, plat, calls = _run(tmp_path, monkeypatch, capsys,
                                     fail_on='fetch_all_projects')
    assert rc == 1
    assert calls == ['fetch_pmis_tables', 'fetch_all_projects']   # 第三步不该再跑
    assert not os.path.exists(os.path.join(plat, 'input'))
    assert any('✗' in ln for ln in out), 'server.run_download 靠 ✗ 收集失败原因'


def test_备份保留跨运行缓存但清掉旧产物(tmp_path, monkeypatch, capsys):
    """_wbs_id_map.json 是跨运行缓存,清了下次要重建整张映射表;
    其余旧产物必须清掉,否则某步失败时会拿上一轮的文件冒充这一轮的成果。"""
    script_dir = tmp_path / 'pmisdata'
    script_dir.mkdir()
    plat = tmp_path / 'plat'
    plat.mkdir()
    (script_dir / '_wbs_id_map.json').write_text('cache', encoding='utf-8')
    (script_dir / 'payment_records.csv').write_text('old', encoding='utf-8')
    monkeypatch.setenv('PMISDATA_DIR', str(script_dir))
    monkeypatch.setenv('PMPLATFORM_DIR', str(plat))
    _fake_steps(monkeypatch, str(script_dir), produce=False)
    pipeline.main()
    assert (script_dir / '_wbs_id_map.json').read_text(encoding='utf-8') == 'cache'
    assert not (script_dir / 'payment_records.csv').exists(), '旧产物没被清掉'
    stamps = [d for d in os.listdir(script_dir) if os.path.isdir(script_dir / d)]
    assert len(stamps) == 1, '应有且仅有一个时间戳备份目录'
    assert (script_dir / stamps[0] / 'payment_records.csv').read_text(encoding='utf-8') == 'old'


def test_run_step每次都清import缓存(tmp_path, monkeypatch):
    """同一个 server 进程里点第二次「下载数据」时,若命中 import 缓存,抓数脚本的
    模块级代码(读 config、算 OUTPUT_DIR)不会重跑 —— 用户刚更新的 cookie 不生效,
    却看不出任何异常。

    这里【不能】monkeypatch importlib.import_module:缓存检查恰恰在它内部,换掉它
    等于把被测行为本身换掉,替身无论清不清缓存都会被调两次 —— 实测过,那样写是条
    彻底测不出问题的假绿。改用真实 import 机制,观察模块级代码有没有重新执行。
    """
    (tmp_path / '_probe_reload.py').write_text(PROBE_SRC, encoding='utf-8')
    log = tmp_path / 'probe.log'
    monkeypatch.setenv('PROBE_LOG', str(log))
    monkeypatch.syspath_prepend(str(tmp_path))
    sys.modules.pop('_probe_reload', None)
    try:
        pipeline._run_step('_probe_reload')
        pipeline._run_step('_probe_reload')
        assert log.read_text(encoding='utf-8') == 'xx', \
            '模块级代码只执行了一次 → import 缓存没被清,第二次下载会沿用旧 config'
    finally:
        sys.modules.pop('_probe_reload', None)


def test_子脚本sys_exit被当作退出码而非崩溃(monkeypatch):
    """抓数脚本用 sys.exit(1) 报错(如 config 里没 cookie)。进程内执行时那是
    SystemExit 异常,不接住会把整个 server 线程带走。"""
    import types

    def _fake_import(name):
        m = types.ModuleType(name)

        def _main():
            raise SystemExit(3)
        m.main = _main
        sys.modules[name] = m
        return m

    monkeypatch.setattr(pipeline.importlib, 'import_module', _fake_import)
    assert pipeline._run_step('_probe_exit') == 3
    sys.modules.pop('_probe_exit', None)


def test_模块级sys_exit也被接住(monkeypatch):
    """load_config() 是在【模块级】调的,配置缺失时 import 这一步就 SystemExit。"""
    def _fake_import(name):
        raise SystemExit(1)

    monkeypatch.setattr(pipeline.importlib, 'import_module', _fake_import)
    assert pipeline._run_step('_probe_modlevel') == 1
