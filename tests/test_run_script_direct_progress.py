"""frozen 路径的逐行进度捕获(2026-08-03)。

原实现靠 `hasattr(mod, '_output_lines')` 取输出,而全仓没有任何模块定义过 _output_lines
(preprocess_data.py 通篇用 print),于是打包版的「更新数据」进度条永远停在 10%。
现在 tee 住 stdout/stderr 逐行解析,与 dev 分支的 subprocess 逐行读等价。

注:_run_script_direct 本身与 frozen 无关(只是 importlib 执行一个文件),
所以这些用例在开发机上就能真正跑到那条代码,不是「照着 frozen 分支念一遍」。
"""
import io
import sys

import pytest

import server


def _write_module(tmp_path, body, name="fakepipeline.py"):
    p = tmp_path / name
    p.write_text(body, encoding="utf-8")
    return str(p)


def test_captures_lines_and_calls_back_in_order(tmp_path):
    mod = _write_module(tmp_path, (
        "print('[INFO] 读取 PMIS')\n"
        "print('[OK] 项目域完成')\n"
        "def main():\n"
        "    print('[WARN] 缺少倚天源')\n"
        "    print('[ERROR] 某表读失败')\n"
    ))
    seen = []
    out = server._run_script_direct(mod, "fakepipeline", on_line=seen.append)
    # 模块初始化期与 main() 里的输出都要拿到(初始化期报错被吞是原实现最怕的事)
    assert seen == ['[INFO] 读取 PMIS', '[OK] 项目域完成',
                    '[WARN] 缺少倚天源', '[ERROR] 某表读失败']
    assert '[OK] 项目域完成' in out and '[ERROR] 某表读失败' in out


def test_flushes_trailing_line_without_newline(tmp_path):
    """最后一句不带换行时也必须回调 —— 管线的收尾提示恰恰常用 end='' 打。"""
    mod = _write_module(tmp_path, "import sys\nsys.stdout.write('[INFO] 收尾中')\n")
    seen = []
    server._run_script_direct(mod, "fakepipeline", on_line=seen.append)
    assert seen == ['[INFO] 收尾中']


def test_stderr_is_teed_too(tmp_path):
    mod = _write_module(tmp_path, "import sys\nprint('[ERROR] 崩了', file=sys.stderr)\n")
    seen = []
    server._run_script_direct(mod, "fakepipeline", on_line=seen.append)
    assert seen == ['[ERROR] 崩了']


def test_streams_restored_even_when_module_raises(tmp_path):
    """异常路径也必须还原 sys.stdout/stderr。原实现在 sys.stdout 为 None 时换成
    io.StringIO 且从不还原、从不清空,每跑一次更新就再堆一整轮输出。"""
    before_out, before_err = sys.stdout, sys.stderr
    mod = _write_module(tmp_path, "raise RuntimeError('模块初始化就炸了')\n")
    with pytest.raises(RuntimeError):
        server._run_script_direct(mod, "fakepipeline", on_line=lambda _l: None)
    assert sys.stdout is before_out and sys.stderr is before_err


def test_passes_through_to_underlying_stream(tmp_path, monkeypatch):
    """tee 的另一头:原文必须照旧流向底层流,否则控制台/日志里什么都看不到。"""
    sink = io.StringIO()
    monkeypatch.setattr(sys, "stdout", sink)
    mod = _write_module(tmp_path, "print('[INFO] 透传检查')\n")
    server._run_script_direct(mod, "fakepipeline", on_line=lambda _l: None)
    assert '[INFO] 透传检查' in sink.getvalue()


def test_reconfigure_is_forwarded_to_underlying_stream(tmp_path, monkeypatch):
    """preprocess_data.py 开头会 sys.stdout.reconfigure(encoding='utf-8'):
    那句必须真的作用在底层流上,否则 GBK 控制台遇到中文会抛 UnicodeEncodeError。"""
    calls = []

    class _Fake(io.StringIO):
        def reconfigure(self, *a, **kw):
            calls.append(kw)

    monkeypatch.setattr(sys, "stdout", _Fake())
    mod = _write_module(tmp_path, (
        "import sys\n"
        "if sys.stdout and hasattr(sys.stdout, 'reconfigure'):\n"
        "    sys.stdout.reconfigure(encoding='utf-8', errors='replace')\n"
        "print('[OK] ok')\n"
    ))
    server._run_script_direct(mod, "fakepipeline", on_line=lambda _l: None)
    assert calls == [{'encoding': 'utf-8', 'errors': 'replace'}]


def test_underlying_stream_none_is_tolerated(tmp_path, monkeypatch):
    """PyInstaller --noconsole 下 sys.stdout 就是 None,不能因此崩掉整条管线。"""
    monkeypatch.setattr(sys, "stdout", None)
    mod = _write_module(tmp_path, "print('[INFO] 无控制台')\n")
    seen = []
    server._run_script_direct(mod, "fakepipeline", on_line=seen.append)
    assert seen == ['[INFO] 无控制台']


def test_callback_exception_does_not_break_pipeline(tmp_path):
    """进度回调出错不能连累数据管线本身 —— 进度只是给人看的。"""
    mod = _write_module(tmp_path, "print('[INFO] a')\nprint('[INFO] b')\n")

    def _boom(_line):
        raise ValueError("回调自己炸了")

    out = server._run_script_direct(mod, "fakepipeline", on_line=_boom)
    assert '[INFO] a' in out and '[INFO] b' in out


# ── frozen 与 dev 共用同一个进度解析(apply_reprocess_line) ──

def test_apply_reprocess_line_advances_progress_and_reports_errors():
    saved = dict(server.reprocess_state)
    try:
        server.reprocess_state = {"running": True, "progress": 10, "message": ""}
        assert server.apply_reprocess_line("[INFO] 读取 PMIS\n") == ('info', '读取 PMIS')
        assert server.reprocess_state["progress"] == 15
        assert server.reprocess_state["message"] == '读取 PMIS'
        assert server.apply_reprocess_line("\n") is None            # 空行不推进
        assert server.reprocess_state["progress"] == 15
        assert server.apply_reprocess_line("[ERROR] 崩了\n") == ('error', '崩了')
        assert server.reprocess_state["progress"] == 15             # 错误不推进进度
        for _ in range(50):                                          # 封顶 95
            server.apply_reprocess_line("[OK] step\n")
        assert server.reprocess_state["progress"] == 95
    finally:
        server.reprocess_state = saved


def test_run_script_direct_progress_drives_reprocess_state(tmp_path):
    """把两半接起来:tee 出来的行喂给 apply_reprocess_line,状态确实动了。
    这条守的是「定义了却没接线」—— 光有解析函数、frozen 分支不传 on_line 也照样绿。"""
    saved = dict(server.reprocess_state)
    try:
        server.reprocess_state = {"running": True, "progress": 10, "message": ""}
        mod = _write_module(tmp_path, "print('[INFO] 正在算回款')\n")
        server._run_script_direct(mod, "fakepipeline", on_line=server.apply_reprocess_line)
        assert server.reprocess_state["progress"] == 15
        assert server.reprocess_state["message"] == '正在算回款'
    finally:
        server.reprocess_state = saved


def test_frozen_branch_actually_passes_on_line():
    """接线守卫(源码级):run_reprocess 的 frozen 分支必须把 on_line 传下去。
    这条断言是为了防「函数写好了、调用点忘了传」—— 本仓出过 3 次同款。
    frozen 分支在开发机上跑不到,只能从源码上钉。"""
    import inspect
    src = inspect.getsource(server.run_reprocess)
    assert 'on_line=_on_line' in src
    assert '_run_script_direct(preprocess_script' in src
    # 自证规模:上面两条靠的是这段源码确实存在且成规模,不是在一段空字符串上恒真
    assert len(src.splitlines()) > 30
