# tests/test_server_progress.py
import server


def test_classify_levels():
    assert server.classify_progress_line("[OK] 提取完成") == ("ok", "[OK] 提取完成")
    assert server.classify_progress_line("[INFO] 正在连接") == ("info", "正在连接")
    assert server.classify_progress_line("[WARN] 慢") == ("warn", "慢")
    assert server.classify_progress_line("[ERROR] 失败了") == ("error", "失败了")
    assert server.classify_progress_line("普通输出") == ("other", "普通输出")


def test_classify_blank_returns_none():
    assert server.classify_progress_line("   ") is None
    assert server.classify_progress_line("") is None
