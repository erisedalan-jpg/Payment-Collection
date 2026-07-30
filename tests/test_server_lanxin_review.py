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
    """把 WEB_ROOT 指到 tmp_path 并放一份 review.html 替身 + 一份 index.html 替身。

    为什么用替身而不读真实产物:真实的 frontend/public/review.html 由【下一个任务】
    创建,且要经 vite build 才会出现在 WEB_ROOT(frontend/dist)下。本任务的职责是
    【路由】—— 「/review/<token> 有没有被正确分派、有没有被 SPA 回退吃掉」,
    与页面内容无关。用替身让这两条测试不依赖尚不存在的产物,也不依赖跑一次构建。
    真实产物是否被 vite 拷进 dist,由下一个任务自己验。

    【复审 M-2】index.html 替身是复审后补的:此前 WEB_ROOT 下没有 index.html,
    SPA 回退会先因"index.html 缺失"吐 503"前端尚未构建"提示,不是真的 Vue SPA
    内容 —— test_review_page_not_swallowed_by_spa_fallback 的 `id="app" not in body`
    断言在这种环境下【恒真】,删掉显式分支也测不出来(假绿)。补上含 id="app" 的
    index.html,让该断言真正具备区分力。
    """
    (tmp_path / "review.html").write_text(
        '<!DOCTYPE html><html><body><div id="review-root"></div></body></html>',
        encoding="utf-8")
    (tmp_path / "index.html").write_text(
        '<!DOCTYPE html><html><body><div id="app"></div></body></html>',
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
    且不会有任何报错。

    【复审 M-3】should_spa_fallback() 只看"末段有没有点":本测试用的 "tok"
    (无点)会被判 True、落 SPA 回退分支;而【真实 token】形如 <b64>.<exp>.<sig>
    (含两个点)会被判 False、落到 super().do_GET() 的"找文件"分支(找不到就
    404,不是 SPA index.html —— 见 test_review_page_served_for_real_token_shape)。
    两种输入都需要显式分支先接住,只是不接住时"坏掉的样子"不同;本测试钉的是
    "无点"这一种,"真实 token 形状"那一种由另一条测试单独钉。"""
    srv, port = _srv(tmp_path, monkeypatch)
    _stub_web_root(tmp_path, monkeypatch)
    try:
        _, body = _get(port, "/review/tok")
        assert b"review-root" in body
        assert b'id="app"' not in body, "吐的是 Vue SPA,说明被 SPA 回退吃掉了"
    finally:
        srv.shutdown(); srv.server_close()


def test_review_page_served_for_real_token_shape(tmp_path, monkeypatch):
    """【复审 M-3】真实 token 形如 <b64>.<exp>.<sig>,含两个点 —— 末段带点时
    should_spa_fallback() 判定为 False,请求不会落到 SPA 回退分支,而是会落到
    super().do_GET() 的"找文件"路(找不到就 404)。用真实形状的 token 验证显式
    分支在这种输入下依然生效、拿到的仍是 review.html,不是巧合地依赖 SPA 回退
    才通过上一条测试。"""
    srv, port = _srv(tmp_path, monkeypatch)
    _stub_web_root(tmp_path, monkeypatch)
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, body = _get(port, "/review/" + tok)
        assert st == 200
        assert b"review-root" in body
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
    它们走 /api/ 前缀,不豁免就会被鉴权闸拦成 401,H5 页永远白屏。

    【复审 M-1】上面两行只证明了常量本身【包含】这两个路径,证明不了鉴权闸
    【真的放行】了它们(若 _auth_gate 的判断逻辑本身有问题,常量对了也白搭)。
    下半段真起服务、不带任何 cookie 实测:两个端点必须不是 401;同时打一个
    对照路径(超管专属、未加豁免的 /api/lanxin/inbox)验证鉴权闸本身仍在正常
    工作 —— 两条互补,不是互相替代。"""
    assert "/api/lanxin/review/items" in server._AUTH_EXEMPT
    assert "/api/lanxin/review/submit" in server._AUTH_EXEMPT
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st_items, _ = _get(port, "/api/lanxin/review/items?token=" + tok)
        assert st_items != 401
        st_submit, _ = _post_json(port, "/api/lanxin/review/submit",
                                  {"token": tok, "projectId": "P1", "content": "x"})
        assert st_submit != 401
        st_control, _ = _get(port, "/api/lanxin/inbox")
        assert st_control == 401, "对照路径本就未豁免,鉴权闸若失效这里也测不出问题"
    finally:
        srv.shutdown(); srv.server_close()


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


def test_items_snapshot_disambiguated_by_route_key(tmp_path, monkeypatch):
    """【复审 I-3,第 1 条】同一 employId 同时有 project 与 timesheet 两条 sent ——
    project 的 token 必须拿到 project 那条的快照,timesheet 的 token 拿到
    timesheet 那条。钉住 routeKey 过滤这道判据本身(反向验证①:删掉它必须让
    本条变红)。"""
    ts = {"staffId": "sid-1", "employId": "A001", "name": "张三",
          "routeKey": "timesheet", "role": "primary", "projectIds": [],
          "reviewItems": [{"code": "MISS_SUMMARY", "label": "未填工作成果",
                           "count": 3, "lastDate": "2026-07-20"}]}
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001, ts])
    try:
        tok_p = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        _, body_p = _get(port, "/api/lanxin/review/items?token=" + tok_p)
        d_p = json.loads(body_p)
        assert d_p["kind"] == "project"
        assert [i["projectId"] for i in d_p["items"]] == ["P1", "P2"]

        tok_t = LRV.issue_token("A001", "timesheet", SECRET, int(__import__("time").time()))
        _, body_t = _get(port, "/api/lanxin/review/items?token=" + tok_t)
        d_t = json.loads(body_t)
        assert d_t["kind"] == "timesheet"
        assert [i["code"] for i in d_t["items"]] == ["MISS_SUMMARY"]
    finally:
        srv.shutdown(); srv.server_close()


def test_items_and_submit_use_primary_snapshot_not_supervisor(tmp_path, monkeypatch):
    """【复审 C-2 / I-3,第 2 条 —— C-2 的回归网】同一人既是自己那份问题的 primary、
    又是他人问题的 supervisor(汇总卡)时,build_plan 固定【先 primary 后汇总】,
    record_sent 按序 append;若不按 role 区分,items/submit 里 `reversed(...) +
    break` 命中的第一条会是汇总卡(reviewItems 恒为 []),快照被抹成空 ——
    页面空白、每一条都提交不了,且全程零报错。

    反向验证②:删掉 role == 'primary' 过滤,本条必须红。"""
    supervisor_entry = dict(SENT_A001, role="supervisor", reviewItems=[])
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001, supervisor_entry])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        _, body = _get(port, "/api/lanxin/review/items?token=" + tok)
        d = json.loads(body)
        assert d["items"] != [], "命中了排在后面的汇总卡快照(reviewItems 恒为空)"
        assert [i["projectId"] for i in d["items"]] == ["P1", "P2"]

        st, sd = _post_json(port, "/api/lanxin/review/submit",
                            {"token": tok, "projectId": "P1", "content": "能提交"})
        assert st == 200 and sd["success"] is True
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_timesheet_kind_clears_forged_project_id(tmp_path, monkeypatch):
    """【复审 C-1,第 1 条】落库时 projectId 与 issueCode 两个键都会写,但校验只查
    与 kind 匹配的那一个 —— timesheet 分支只查 code,任意 projectId 完全不在
    校验范围内、却会原样落库。必须在 kind=='timesheet' 时把 target_pid 就地清空。

    反向验证:去掉清空那一行,本条必须红(落库的 projectId 会变成 'P9-FORGED')。"""
    ts = {"staffId": "sid-3", "employId": "A003", "name": "王五",
          "routeKey": "timesheet", "role": "primary", "projectIds": [],
          "reviewItems": [{"code": "MISS_SUMMARY", "label": "未填工作成果",
                           "count": 5, "lastDate": "2026-07-25"}]}
    srv, port = _srv(tmp_path, monkeypatch, sent=[ts])
    try:
        tok = LRV.issue_token("A003", "timesheet", SECRET, int(__import__("time").time()))
        st, d = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "code": "MISS_SUMMARY",
                            "projectId": "P9-FORGED", "content": "已补填"})
        assert st == 200 and d["success"] is True
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        assert store["items"][0]["projectId"] is None, "伪造的 projectId 不许落库"
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_project_kind_clears_forged_issue_code(tmp_path, monkeypatch):
    """【复审 C-1,第 2 条】与上一条对称:project 分支只查 projectId,任意 code
    完全不在校验范围内、却会原样落库。必须在 kind=='project' 时把 target_code
    就地清空。

    反向验证:去掉清空那一行,本条必须红(落库的 issueCode 会变成 'FORGED_CODE')。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st, d = _post_json(port, "/api/lanxin/review/submit",
                           {"token": tok, "projectId": "P1", "code": "FORGED_CODE",
                            "content": "已协调"})
        assert st == 200 and d["success"] is True
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        assert store["items"][0]["issueCode"] is None, "伪造的 code 不许落库"
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_two_targets_same_second_get_distinct_ids(tmp_path, monkeypatch):
    """【复审 I-1】收件箱条目 id 此前只到秒 —— 同一员工同秒提交两条不同目标(逐条
    反馈连点)会撞车。归入(取首条)与删除(按 id 全删)都按 id 索引,撞车后
    "归入写错内容、删一条丢两条"。id 必须带上目标标识 + 微秒,同一员工连续提交
    两个不同目标时两条 id 必须不同。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        _post_json(port, "/api/lanxin/review/submit",
                  {"token": tok, "projectId": "P1", "content": "第一条"})
        _post_json(port, "/api/lanxin/review/submit",
                  {"token": tok, "projectId": "P2", "content": "第二条"})
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        ids = [it["id"] for it in store["items"]]
        assert len(ids) == 2
        assert ids[0] != ids[1], "同一员工同秒提交两个不同目标,id 撞车"
    finally:
        srv.shutdown(); srv.server_close()


def test_submit_rejects_oversized_body(tmp_path, monkeypatch):
    """【复审 I-2】免登录写入口的【报文】上限必须在 token 校验之前就卡住 ——
    否则无 token 者也能让服务端先把 body 吃满内存再拒。

    只【声明】超限 Content-Length、不实际发送那么多字节:_read_body_bytes 只看
    头部声明的长度就拒绝,不会碰 rfile.read()。这样测试不需要真在网络上传输
    1MB+,避免了"服务端提前回 400、关闭连接,客户端还在发送大 body"在 Windows
    下引发的 ConnectionAbortedError(与被测逻辑无关的网络时序噪音,曾在写这条
    测试时实际踩到)。timeout=5 是为了反向验证时(退回 _read_json_body 会真的
    去 rfile.read() 一个客户端永远不会发来的 body 而卡住)让测试在有限时间内
    失败,而不是无限期挂起 ——发生超时也是一种"未按预期在读 body 之前拒绝"
    的红,不影响反向验证的结论。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        c.putrequest("POST", "/api/lanxin/review/submit")
        c.putheader("Content-Type", "application/json")
        c.putheader("Content-Length", str(server.LANXIN_H5_MAX_BODY_BYTES + 1000))
        c.endheaders()
        r = c.getresponse()
        assert r.status == 400
        r.read()
        c.close()
        store = json.loads((tmp_path / "lanxin_inbox.json").read_text(encoding="utf-8"))
        assert store["items"] == [], "超限报文绝不许落库"
    finally:
        srv.shutdown(); srv.server_close()


def test_items_with_empty_secret_does_not_write_config(tmp_path, monkeypatch):
    """【复审 M-7】reviewTokenSecret 未配置时,免登录 items 端点绝不能触发配置
    写盘 —— 未鉴权请求不该有任何副作用;且 load_config 遇到损坏文件会静默退回
    默认配置,那一写会把 appSecret/回调双密钥一并抹掉。密钥的生成时机只在
    【已鉴权的】预览/发送两处。

    反向验证:把 _review_secret 改回调 ensure_review_token_secret,本条必须红
    (配置文件内容会被改写、多出一个新生成的 reviewTokenSecret)。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    cfgp = tmp_path / "lanxin_config.json"
    cfg = json.loads(cfgp.read_text(encoding="utf-8"))
    cfg["credentials"]["reviewTokenSecret"] = ""
    cfgp.write_text(json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
    before = cfgp.read_bytes()
    try:
        st, body = _get(port, "/api/lanxin/review/items?token=anything")
        assert st == 200
        assert json.loads(body)["success"] is False
        assert cfgp.read_bytes() == before, "免登录端点绝不能触发配置写盘"
    finally:
        srv.shutdown(); srv.server_close()


def test_no_secret_leaks_in_any_response(tmp_path, monkeypatch):
    """reviewTokenSecret 绝不下发。

    【复审 M-4】此前用 _st/_st2 丢弃了状态码 —— 401/500 的错误响应体天然也不含
    密钥,会被判"通过",这条测试因此在红阶段就意外绿了。必须先钉住两次请求确实
    【成功】(200),这条测试才是在验证"成功响应里没有密钥",而不是"随便什么
    响应里都没有密钥"这种对本测试意图而言恒真的弱命题。"""
    srv, port = _srv(tmp_path, monkeypatch, sent=[SENT_A001])
    try:
        tok = LRV.issue_token("A001", "project", SECRET, int(__import__("time").time()))
        st1, b1 = _get(port, "/api/lanxin/review/items?token=" + tok)
        st2, d2 = _post_json(port, "/api/lanxin/review/submit",
                             {"token": tok, "projectId": "P1", "content": "ok"})
        assert st1 == 200
        assert st2 == 200
        assert SECRET not in b1.decode("utf-8")
        assert SECRET not in json.dumps(d2, ensure_ascii=False)
    finally:
        srv.shutdown(); srv.server_close()
