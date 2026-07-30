import http.client
import json
import threading

import auth
import lanxin_config as LC
import lanxin_inbox as LI
import lanxin_review as LRV
import server

SECRET = "s" * 43
NOW_EPOCH = 1785296160


def _srv(tmp_path, monkeypatch, sent=()):
    """起服务 + 预置一份含 reviewItems 的发送台账。"""
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    cfgp = tmp_path / "lanxin_config.json"
    cfg = LC.default_config()
    cfg["credentials"]["reviewTokenSecret"] = SECRET
    cfg["reviewDeadlineHours"] = 24
    cfgp.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "LANXIN_CONFIG_FILE", str(cfgp))
    inboxp = tmp_path / "lanxin_inbox.json"
    store = LI.new_store()
    LI.record_sent(store, list(sent), "2026-07-29 09:00:00")
    inboxp.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "LANXIN_INBOX_FILE", str(inboxp))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


SENT_A001 = {"staffId": "sid-1", "employId": "A001", "name": "张三",
             "routeKey": "project", "role": "primary", "projectIds": ["P1", "P2"],
             "reviewItems": [
                 {"projectId": "P1", "name": "XX智慧园区",
                  "reasons": [{"category": "回款延期", "detail": "3 个延期节点"}]},
                 {"projectId": "P2", "name": "YY数据中心",
                  "reasons": [{"category": "风险未闭环", "detail": "2 个未关闭风险"}]}]}


def _get(port, path):
    c = http.client.HTTPConnection("127.0.0.1", port)
    c.request("GET", path)
    r = c.getresponse()
    body = r.read()
    return r.status, body


def _post_json(port, path, obj):
    c = http.client.HTTPConnection("127.0.0.1", port)
    # 【与简报逐字稿的唯一偏差,见 task-5-report.md】http.client 对 str body 按
    # RFC 2616 默认用 latin-1 编码(与 Content-Type 头无关,是标准库固定行为)——
    # 简报原文传 str,凡请求体含中文当场在客户端 UnicodeEncodeError,连服务器都
    # 连不上,与被测实现是否正确无关。显式编码 utf-8 字节是最小修复,不改动任何断言。
    c.request("POST", path, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
              {"Content-Type": "application/json"})
    r = c.getresponse()
    body = r.read()
    return r.status, (json.loads(body) if body else {})


def _stub_web_root(tmp_path, monkeypatch):
    """把 WEB_ROOT 指到 tmp_path 并放一份 review.html 替身。

    为什么用替身而不读真实产物:真实的 frontend/public/review.html 由【下一个任务】
    创建,且要经 vite build 才会出现在 WEB_ROOT(frontend/dist)下。本任务的职责是
    【路由】—— 「/review/<token> 有没有被正确分派、有没有被 SPA 回退吃掉」,
    与页面内容无关。用替身让这两条测试不依赖尚不存在的产物,也不依赖跑一次构建。
    真实产物是否被 vite 拷进 dist,由下一个任务自己验。
    """
    (tmp_path / "review.html").write_text(
        '<!DOCTYPE html><html><body><div id="review-root"></div></body></html>',
        encoding="utf-8")
    monkeypatch.setattr(server, "WEB_ROOT", str(tmp_path))


def test_review_page_served_without_login(tmp_path, monkeypatch):
    """【承重】H5 页必须免登录。它在蓝信内置 webview 里打开,那里没有本系统会话。"""
    srv, port = _srv(tmp_path, monkeypatch)
    _stub_web_root(tmp_path, monkeypatch)
    try:
        st, body = _get(port, "/review/anything")
        assert st == 200
        assert b"review-root" in body, "应当是 review.html 而不是 Vue SPA 的 index.html"
    finally:
        srv.shutdown(); srv.server_close()


def test_review_page_not_swallowed_by_spa_fallback(tmp_path, monkeypatch):
    """【承重】should_spa_fallback('/review/xxx') 返回 True(无 /api 前缀、末段无点),
    不加显式分支就会吐 Vue SPA 的 index.html —— 页面能打开、但完全不是那个页面,
    且不会有任何报错。"""
    srv, port = _srv(tmp_path, monkeypatch)
    _stub_web_root(tmp_path, monkeypatch)
    try:
        _, body = _get(port, "/review/tok")
        assert b"review-root" in body
        assert b'id="app"' not in body, "吐的是 Vue SPA,说明被 SPA 回退吃掉了"
    finally:
        srv.shutdown(); srv.server_close()


def test_review_page_missing_file_returns_404_not_spa(tmp_path, monkeypatch):
    """review.html 没部署时给明确 404,【不要】静默回退到 SPA ——
    回退会让「前端没构建」这个部署事故伪装成「页面打开了但功能不对」。"""
    srv, port = _srv(tmp_path, monkeypatch)
    monkeypatch.setattr(server, "WEB_ROOT", str(tmp_path / "empty"))
    try:
        st, _body = _get(port, "/review/tok")
        assert st == 404
    finally:
        srv.shutdown(); srv.server_close()


def test_items_returns_snapshot_for_valid_token(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, body = _get(port, "/api/lanxin/review/items?token=" + tok)
        assert st == 200
        d = json.loads(body)
        assert d["success"] is True
        assert d["kind"] == "project"
        assert d["name"] == "张三"
        assert d["deadlineHours"] == 24
        assert [i["projectId"] for i in d["items"]] == ["P1", "P2"]
        assert d["items"][0]["reasons"][0]["category"] == "回款延期"
    finally:
        srv.shutdown(); srv.server_close()


def test_items_no_login_required(tmp_path, monkeypatch):
    """两个 /api/lanxin/review/* 端点必须进 _AUTH_EXEMPT ——
    它们走 /api/ 前缀,不豁免就会被鉴权闸拦成 401,H5 页永远白屏。"""
    assert "/api/lanxin/review/items" in server._AUTH_EXEMPT
    assert "/api/lanxin/review/submit" in server._AUTH_EXEMPT


def test_items_invalid_token_returns_200_with_reason(tmp_path, monkeypatch):
    """token 失效不是 500、也不是 401 —— 返回 200 + success:false,
    让页面显示「链接失效」。500/401 会让员工以为系统坏了。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        for bad in ("", "garbage", "a.b.c"):
            st, body = _get(port, "/api/lanxin/review/items?token=" + bad)
            assert st == 200
            assert json.loads(body)["success"] is False
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_accepts_project_in_snapshot(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, d = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P1", "content": "已协调客户，本周付"})
        assert st == 200 and d["success"] is True
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        it = store["items"][0]
        assert it["source"] == "h5"
        assert it["projectId"] == "P1"
        assert it["employId"] == "A001"
        assert it["staffId"] == "sid-1", "应从台账按工号反查补上"
        assert it["text"] == "已协调客户，本周付"
        assert it["handled"] is False
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rejects_project_not_in_snapshot(tmp_path, monkeypatch):
    """★★★【本期最容易漏的一条:越权写】提交的 projectId 必须落在该工号的推送快照里。
    不校验 → 任何人拿自己的 token 就能往【任意】项目写反馈。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, d = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P999", "content": "越权尝试"})
        assert st == 400
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        assert store["items"] == [], "越权提交绝不许落库"
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rejects_other_persons_project(tmp_path, monkeypatch):
    """B 的项目在台账里存在,但不属于 A —— A 的 token 提交它也必须拒。
    上一条只证明了「不存在的项目号被拒」,这条才证明「别人的项目号被拒」。"""
    other = dict(SENT_A001, staffId="sid-2", employId="A002", name="李四",
                 projectIds=["P9"],
                 reviewItems=[{"projectId": "P9", "name": "ZZ", "reasons": []}])
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001, other])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, _ = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P9", "content": "越权"})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rejects_invalid_token(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        st, _ = _post_json(port, "/api/lanxin/review/submit",
                           {"token": "a.b.c", "projectId": "P1", "content": "x"})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rejects_empty_content(tmp_path, monkeypatch):
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, _ = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P1", "content": "   "})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_truncates_overlong_content(tmp_path, monkeypatch):
    """免登录写入口,长度必须封顶。沿用回调条目同一个上限。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, d = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P1", "content": "x" * 50000})
        assert st == 200 and d["success"] is True
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        assert len(store["items"][0]["text"]) == server.LANXIN_H5_MAX_TEXT
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_stores_raw_text_not_escaped(tmp_path, monkeypatch):
    """【承重】入库存【原文】,不在这里 html.escape。
    归入跟进域那一步(/api/lanxin/inbox/handle)已经会转义 + 换行只用 <br>;
    这里再转一次 → '&' 变 '&amp;amp;',页面上是可见的乱码。
    既有回调条目也是存原文的(event_to_item 的 text 未转义),保持一致。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        _post_json(port, "/api/lanxin/review/submit",
                   {"token": tok, "projectId": "P1", "content": "A & B <b>粗</b>"})
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        assert store["items"][0]["text"] == "A & B <b>粗</b>"
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rate_limited_per_employ_per_day(tmp_path, monkeypatch):
    """免登录写入口的频率闸:单工号单日上限,防止被当成写盘放大器。
    计数【从收件箱现有条目得出】,不新增状态(与「零新数据文件」一致)。"""
    monkeypatch.setattr(server, "LANXIN_H5_MAX_PER_DAY", 2)
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        for _ in range(2):
            st, _d = _post_json(port, "/api/lanxin/review/submit",
                                {"token": tok, "projectId": "P1", "content": "ok"})
            assert st == 200
        st, _d = _post_json(port, "/api/lanxin/review/submit",
                            {"token": tok, "projectId": "P1", "content": "third"})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_timesheet_kind_needs_code_not_project(tmp_path, monkeypatch):
    """工时侧提交用 code(问题码),没有 projectId。快照里 code 不存在同样要拒。"""
    ts = {"staffId": "sid-3", "employId": "A003", "name": "王五",
          "routeKey": "timesheet", "role": "primary", "projectIds": [],
          "reviewItems": [{"code": "MISS_SUMMARY", "label": "未填工作成果",
                           "count": 5, "lastDate": "2026-07-25"}]}
    srv, port = _srv(tmp_path, monkeypatch, sent=[ts])
    try:
        tok = LRV.issue_token("A003", "timesheet", SECRET, int(__import__("time").time()))
        st, _d = _post_json(port, "/api/lanxin/review/submit",
                            {"token": tok, "code": "MISS_SUMMARY", "content": "已补填"})
        assert st == 200
        st, _d = _post_json(port, "/api/lanxin/review/submit",
                            {"token": tok, "code": "NOT_IN_SNAPSHOT", "content": "x"})
        assert st == 400
    finally:
        srv.shutdown(); srv.server_close()


def test_no_secret_leaks_in_any_response(tmp_path, monkeypatch):
    """reviewTokenSecret 绝不下发。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        _st, b1 = _get(port, "/api/lanxin/review/items?token=" + tok)
        _st2, d2 = _post_json(port, "/api/lanxin/review/submit",
                              {"token": tok, "projectId": "P1", "content": "ok"})
        assert SECRET not in b1.decode("utf-8")
        assert SECRET not in json.dumps(d2, ensure_ascii=False)
    finally:
        srv.shutdown(); srv.server_close()
