"""长任务互斥的 HTTP 契约(2026-08-03):抢不到 → 400 + 结构化错误体,绝不排队。

背景:CLAUDE.md §8 写的是「抢不到立即 400」,而实际 7 处全局拒绝里有 6 处回 200,
按状态码判忙的客户端会把「忙」当成「成功」。另有 4 处的互斥是【阻塞获取】
(with _history_lock),第二个请求会静静排在锁上几十秒,与非阻塞语义相反。
"""
import json
import http.client
import threading

import pytest

import auth
import server


@pytest.fixture()
def live(tmp_path, monkeypatch):
    """起一个真服务 + 一个超管会话(这些端点都在 _SUPER_ONLY_PATHS 里)。"""
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {"super": {
        "salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
        "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"}}})
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=8)
    conn.request("POST", "/api/login", json.dumps({"account": "super", "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    try:
        yield port, cookie
    finally:
        conn.close()
        srv.shutdown(); srv.server_close()


@pytest.fixture(autouse=True)
def _clean_run_state():
    """每条用例后把三个全局运行标志复位 —— 它们是模块级可变状态,漏一次会污染整轮。"""
    yield
    server.reprocess_state.update({"running": False, "progress": 0, "message": ""})
    server.download_state.update({"running": False, "progress": 0, "message": ""})
    server.history_state["running"] = False


def _req(port, cookie, method, path, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=8)
    headers = {"Cookie": cookie, "Content-Type": "application/json"}
    conn.request(method, path, json.dumps(body or {}) if method == "POST" else None, headers)
    r = conn.getresponse()
    status = r.status
    raw = r.read()
    conn.close()
    try:
        return status, json.loads(raw)
    except Exception:
        return status, {}


def _assert_busy(status, body):
    assert status == server.HTTP_BUSY == 400, f"忙必须是 400,实际 {status}"
    assert body.get("success") is False
    assert body.get("code") == server.ERR_BUSY
    assert body.get("message")


def test_reprocess_busy_when_download_running(live):
    port, cookie = live
    server.download_state.update({"running": True, "progress": 42, "message": "下载中"})
    status, body = _req(port, cookie, "GET", "/api/reprocess")
    _assert_busy(status, body)


def test_reprocess_busy_when_slot_taken_keeps_progress_fields(live):
    """槽被占:除结构化错误外还要带 running/progress/currentMessage,
    否则前端 useReprocess 的忙提示会退化成一句干巴巴的错误(V4.4.2/4.4.3 修过两次的老坑)。"""
    port, cookie = live
    server.reprocess_state.update({"running": True, "progress": 66, "message": "正在算回款"})
    status, body = _req(port, cookie, "GET", "/api/reprocess")
    _assert_busy(status, body)
    assert body["running"] is True
    assert body["progress"] == 66
    assert body["currentMessage"] == "正在算回款"


def test_pmis_download_busy_returns_400(live):
    port, cookie = live
    server.download_state.update({"running": True, "progress": 5, "message": "下载中"})
    status, body = _req(port, cookie, "GET", "/api/pmis/download")
    _assert_busy(status, body)
    assert body["running"] is True and body["progress"] == 5


def test_pmis_download_busy_when_reprocess_running(live):
    port, cookie = live
    server.reprocess_state.update({"running": True, "progress": 1, "message": "更新中"})
    status, body = _req(port, cookie, "GET", "/api/pmis/download")
    _assert_busy(status, body)


def test_manual_import_busy_returns_400(live):
    port, cookie = live
    server.reprocess_state.update({"running": True, "progress": 1, "message": "更新中"})
    status, body = _req(port, cookie, "POST", "/api/manual/import", {"sheets": {}})
    _assert_busy(status, body)


def test_manual_rollback_busy_returns_400(live):
    port, cookie = live
    server.download_state.update({"running": True, "progress": 1, "message": "下载中"})
    status, body = _req(port, cookie, "POST", "/api/manual/rollback", {"id": "x"})
    _assert_busy(status, body)


def test_data_history_rollback_busy_returns_400(live):
    port, cookie = live
    server.reprocess_state.update({"running": True, "progress": 1, "message": "更新中"})
    status, body = _req(port, cookie, "POST", "/api/data-history/rollback", {"id": "x"})
    _assert_busy(status, body)


def test_data_history_undo_busy_returns_400(live):
    port, cookie = live
    server.reprocess_state.update({"running": True, "progress": 1, "message": "更新中"})
    status, body = _req(port, cookie, "POST", "/api/data-history/undo-rollback")
    _assert_busy(status, body)


def test_history_lock_is_non_blocking(live):
    """锁被别人拿着时必须【立即】400,而不是排队等 —— 这条用例是本次「阻塞→非阻塞」
    改动的唯一守卫。旧实现会卡在 with _history_lock 上直到 socket 超时,这里就会失败。
    (history_state 标志此时是 False,所以只有锁本身能拦住它,恰好只测锁。)"""
    port, cookie = live
    assert server._history_lock.acquire(blocking=False)
    try:
        status, body = _req(port, cookie, "POST", "/api/data-history/undo-rollback")
        _assert_busy(status, body)
    finally:
        server._history_lock.release()


def test_history_slot_released_after_normal_failure(live):
    """槽必须在 finally 里还回去:回滚因为没有版本而抛 FileNotFoundError 之后,
    下一次请求还得能拿到锁(否则一次失败就把整台服务的历史操作永久锁死)。"""
    port, cookie = live
    status1, _ = _req(port, cookie, "POST", "/api/data-history/rollback", {"id": "不存在的版本"})
    assert status1 != server.HTTP_BUSY          # 是业务失败,不是忙
    assert server._history_lock.acquire(blocking=False), "锁没有被释放"
    server._history_lock.release()
    assert server.history_state["running"] is False
