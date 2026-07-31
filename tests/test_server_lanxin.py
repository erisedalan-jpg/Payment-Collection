"""I-4:/api/lanxin/{preview,send} 此前没有 except,凭证错/花名册缺失时异常直穿
socketserver、连接直接断开,前端只看到 Failed to fetch。本文件用真实 HTTP 请求验证
两个端点现在把这些异常转成结构化的 400 响应。"""
import json
import http.client
import threading
from datetime import datetime, timedelta

import auth
import config as CFG
import lanxin
import lanxin_config as LC
import lanxin_inbox
import lanxin_recipients
import lanxin_unresponded
import server


def _srv(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    monkeypatch.setattr(server, "LANXIN_CONFIG_FILE", str(tmp_path / "lanxin_config.json"))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def _login(port, account="admin", password="wxtnb"):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": password}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = (r.getheader("Set-Cookie") or "").split(";")[0]
    r.read()
    return conn, cookie


def _enabled_cfg():
    cfg = LC.default_config()
    cfg["enabled"] = True
    cfg["credentials"].update({"appId": "app-1", "appSecret": "sec-1", "orgId": "1",
                               "apiGateway": "https://apigw.example.com"})
    return cfg


def test_preview_missing_org_file_degrades_gracefully_not_400(tmp_path, monkeypatch):
    """核实过一个容易想当然的假设:input/组织架构.xlsx 缺失时 read_org_tree 并不抛
    FileNotFoundError —— projects._open_workbook 对缺文件/坏文件统一 except Exception 返回 None,
    read_org_tree 因此优雅降级成空树({byId:{},byName:{}}),预览照常 200(全部落 unresolved)。
    这条测试锁住这个事实,防止将来有人对着 I-4 的旧描述重新引入一个已被验伪的假设。"""
    srv, port = _srv(tmp_path, monkeypatch)
    monkeypatch.setattr(CFG, "ORG_FILE", "不存在的花名册-测试专用.xlsx")
    try:
        conn, cookie = _login(port)
        items = [{"kind": "timesheet", "employId": "A006",
                  "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 1}]}]
        conn.request("POST", "/api/lanxin/preview", json.dumps({"items": items}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert body["plan"]["recipients"] == []
        assert body["plan"]["unresolved"][0]["reason"] == "工号不在花名册"
    finally:
        srv.shutdown()
        srv.server_close()


def test_preview_org_tree_read_error_returns_400_not_disconnect(tmp_path, monkeypatch):
    """即便今天的 read_org_tree 不会因缺文件抛 FileNotFoundError(见上一条),这条防线仍然
    值得留着 —— 直接注入该异常,验证 handler 的 except 分支本身是好的(而不是死代码从未跑过)。"""
    srv, port = _srv(tmp_path, monkeypatch)
    monkeypatch.setattr(lanxin_recipients, "read_org_tree",
                        lambda path: (_ for _ in ()).throw(FileNotFoundError(path)))
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/lanxin/preview", json.dumps({"items": []}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 400
        body = json.loads(r.read())
        assert body["success"] is False
        assert "组织架构" in body["message"]
    finally:
        srv.shutdown()
        srv.server_close()


def test_send_lanxin_error_returns_400_with_errcode_not_disconnect(tmp_path, monkeypatch):
    """appSecret 打错一个字符是「第一天」必然场景 —— 蓝信侧返回 LanxinError 时 send 必须转 400
    且带上 errCode(供超管看懂,而不是只看到网络错误),绝不能让连接被重置。"""
    srv, port = _srv(tmp_path, monkeypatch)
    LC.save_config(str(tmp_path / "lanxin_config.json"), _enabled_cfg())
    monkeypatch.setattr(lanxin_recipients, "read_org_tree",
                        lambda path: {"byId": {}, "byName": {}})

    def _boom(cfg):
        raise lanxin.LanxinError(52001, "密钥错误")
    monkeypatch.setattr(lanxin, "get_app_token", _boom)
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/lanxin/send", json.dumps({"items": []}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 400
        body = json.loads(r.read())
        assert body["success"] is False
        assert "52001" in body["message"]
        # 铁律:appSecret 绝不能进错误消息
        assert "sec-1" not in body["message"]
    finally:
        srv.shutdown()
        srv.server_close()


def test_send_org_tree_read_error_returns_400_not_disconnect(tmp_path, monkeypatch):
    """send 侧同款防线(见 preview 的两条 org_tree 测试的说明)。"""
    srv, port = _srv(tmp_path, monkeypatch)
    LC.save_config(str(tmp_path / "lanxin_config.json"), _enabled_cfg())
    monkeypatch.setattr(lanxin_recipients, "read_org_tree",
                        lambda path: (_ for _ in ()).throw(FileNotFoundError(path)))
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/lanxin/send", json.dumps({"items": []}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 400
        body = json.loads(r.read())
        assert body["success"] is False
        assert "组织架构" in body["message"]
    finally:
        srv.shutdown()
        srv.server_close()


def test_send_returns_400_when_another_send_already_in_progress(tmp_path, monkeypatch):
    """M-4:推送不可撤销,双击或两个超管同时点会重复触达全员 —— 服务端并发锁必须挡住第二次调用。
    非阻塞 acquire:抢不到锁立即 400,不排队等待(单线程排队 = 把全站堵死),也绝不能让
    第二次请求真的跑到 dispatch。"""
    srv, port = _srv(tmp_path, monkeypatch)
    LC.save_config(str(tmp_path / "lanxin_config.json"), _enabled_cfg())
    dispatched = []
    monkeypatch.setattr(lanxin, "dispatch",
                        lambda plan, cfg: dispatched.append(plan) or
                        {"sent": 0, "failed": [], "msgIds": []})
    # 模拟"上一次推送仍在进行中":测试线程直接把锁占住,不释放。
    server._lanxin_send_lock.acquire()
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/lanxin/send", json.dumps({"items": []}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 400
        body = json.loads(r.read())
        assert body["success"] is False
        assert "进行中" in body["message"]
        assert dispatched == []            # 第二次调用绝不能真的发送
    finally:
        server._lanxin_send_lock.release()
        srv.shutdown()
        srv.server_close()


def test_send_releases_lock_after_success_so_next_send_can_proceed(tmp_path, monkeypatch):
    """锁必须在 finally 里释放 —— 一次成功的推送结束后,后续正常推送不能被永久卡住。"""
    srv, port = _srv(tmp_path, monkeypatch)
    LC.save_config(str(tmp_path / "lanxin_config.json"), _enabled_cfg())
    monkeypatch.setattr(lanxin_recipients, "read_org_tree",
                        lambda path: {"byId": {}, "byName": {}})
    monkeypatch.setattr(lanxin, "dispatch",
                        lambda plan, cfg: {"sent": 0, "failed": [], "msgIds": []})
    try:
        conn, cookie = _login(port)
        for _ in range(2):
            conn.request("POST", "/api/lanxin/send", json.dumps({"items": []}),
                         {"Content-Type": "application/json", "Cookie": cookie})
            r = conn.getresponse()
            assert r.status == 200
            r.read()
        assert not server._lanxin_send_lock.locked()
    finally:
        srv.shutdown()
        srv.server_close()


def test_send_malformed_item_returns_400_not_disconnect(tmp_path, monkeypatch):
    """count 不是可转 int 的值(畸形/被篡改的前端请求)—— int(i["count"]) 会抛 ValueError,
    必须转 400,而不是让异常直穿把连接断掉。"""
    srv, port = _srv(tmp_path, monkeypatch)
    LC.save_config(str(tmp_path / "lanxin_config.json"), _enabled_cfg())
    monkeypatch.setattr(lanxin_recipients, "read_org_tree",
                        lambda path: {"byId": {"A006": {"name": "张三", "supId": None,
                                                        "l4": "", "l31": ""}},
                                     "byName": {"张三": ["A006"]}})
    try:
        conn, cookie = _login(port)
        items = [{"kind": "timesheet", "employId": "A006",
                  "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": "abc"}]}]
        conn.request("POST", "/api/lanxin/preview", json.dumps({"items": items}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 400
        body = json.loads(r.read())
        assert body["success"] is False
    finally:
        srv.shutdown()
        srv.server_close()


# ── Task 7:未响应清单端点 ────────────────────────────────────────────────

def test_unresponded_path_is_super_only():
    """未响应清单含全员推送台账,必须超管专属。_SUPER_ONLY_PATHS 按【精确 path】匹配。"""
    assert '/api/lanxin/unresponded' in server._SUPER_ONLY_PATHS


def test_unresponded_deadline_comes_from_config(tmp_path, monkeypatch):
    """【N 单一来源】端点返回的 deadlineHours 必须来自 cfg['reviewDeadlineHours'],
    与卡片文案同源。两处各自默认 = 「卡上写 24 小时、清单按别的算」。

    这里【故意不用 inspect.getsource 查字面量】:那种源码正则断言在本仓出过事
    (V4.5.3:解析失配 → 循环空跑 → 恒真通过)。行为断言才钉得住。

    _srv 已把 server.LANXIN_CONFIG_FILE 指到 tmp_path/lanxin_config.json,
    所以起服务【之后】往那个路径写配置即可生效(load_config 每次请求都重读)。"""
    srv, port = _srv(tmp_path, monkeypatch)
    monkeypatch.setattr(server, "LANXIN_INBOX_FILE", str(tmp_path / "lanxin_inbox.json"))
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = 72
    (tmp_path / "lanxin_config.json").write_text(
        json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
    try:
        conn, cookie = _login(port)
        conn.request("GET", "/api/lanxin/unresponded", headers={"Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert body["deadlineHours"] == 72
        assert body["rows"] == []          # 空收件箱 → 空清单
    finally:
        srv.shutdown()
        srv.server_close()


# ── review Important-2:preview/send 必须真的把 now 接到卡片上 ──────────────
#
# lib 层(tests/test_lanxin.py、tests/test_lanxin_recipients.py)只证明
# 「build_plan/build_*_card 若收到 now 会正确使用它」,从未证明 server 的 handler
# 真的传了这个实参 —— 变异实测实锤过:删掉 handle_lanxin_preview/handle_lanxin_send
# 里的 now= 实参,全仓 305 条蓝信测试无一变红(headTitle 静默退化成不带推送时间的
# 通用文案)。本仓 V4.0.5/V4.5.6/V4.5.7 都在这个模式上吃过亏(定义了却没接线)。
# 两条都直接断言响应体里的卡片 headTitle,而不是只断言"函数被调用了"。

_UNRESP_TREE = {"byId": {"A006": {"name": "张三", "supId": None, "l4": "", "l31": ""}},
                "byName": {"张三": ["A006"]}}
_UNRESP_ITEMS = [{"kind": "timesheet", "employId": "A006",
                  "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 1}]}]


def test_preview_now_reaches_card_head_title(tmp_path, monkeypatch):
    """preview 把 plan 原样放进响应体,不用另外造捕获手段 —— 直接读 headTitle 即可。"""
    srv, port = _srv(tmp_path, monkeypatch)
    monkeypatch.setattr(lanxin_recipients, "read_org_tree", lambda path: _UNRESP_TREE)
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/lanxin/preview", json.dumps({"items": _UNRESP_ITEMS}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        recipients = body["plan"]["recipients"]
        assert len(recipients) == 1
        # now= 缺省时会退化成不带推送时间的通用文案「工时填报提醒」——见 lanxin_recipients.py
        assert recipients[0]["card"]["headTitle"].startswith("推送时间：")
    finally:
        srv.shutdown()
        srv.server_close()


def test_send_now_reaches_card_head_title(tmp_path, monkeypatch):
    """send 侧同款验证:沿用本文件既有的 mock lanxin.dispatch 范式(不碰网络),
    但【不】mock build_plan —— 响应体里的 plan 就是 handler 真正传给 build_plan 的
    产物,直接证明"接线"这一层,而不只是证明 build_plan 被调用过。"""
    srv, port = _srv(tmp_path, monkeypatch)
    LC.save_config(str(tmp_path / "lanxin_config.json"), _enabled_cfg())
    monkeypatch.setattr(lanxin_recipients, "read_org_tree", lambda path: _UNRESP_TREE)
    monkeypatch.setattr(lanxin, "dispatch",
                        lambda plan, cfg: {"sent": 0, "failed": [], "msgIds": []})
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/lanxin/send", json.dumps({"items": _UNRESP_ITEMS}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        recipients = body["plan"]["recipients"]
        assert len(recipients) == 1
        assert recipients[0]["card"]["headTitle"].startswith("推送时间：")
    finally:
        srv.shutdown()
        srv.server_close()


# ── review Important-4:发送台账的时间戳格式是【跨三个模块的隐式契约】 ────────
#
# 写入方是 handle_lanxin_send,解析方是 lanxin_inbox(prune/candidate_projects)与
# lanxin_unresponded.compute。三处此前各写一份同值字面量、无 import 关系、无契约测试。
# 变异实测实锤过:把 handler 里的 strftime 改成 '%Y-%m-%d %H:%M'(就是同一个函数往上
# 十几行 build_plan(now=...) 用的那个格式,复制粘贴一步之遥),142 条测试零变红。
# 后果全是静默的:① sentAt 全部解析失败 → dueAt='' / overdue=False → 未响应清单的
# 默认「仅未响应」视图【永远空】,看上去像"大家都回了";② 台账 90 天清理失效;
# ③ 归入候选恒空。全程零报错。
#
# 格式已收敛到 lanxin_inbox.TS_FMT 单一来源,但那解决不了「handler 里重新写死一个
# 字面量」这一处 —— 只有端到端跑一次真实 POST /api/lanxin/send、把落盘结果喂给
# compute,才能证明 handler 真的用了那个格式。

def test_send_writes_sent_at_in_a_format_unresponded_can_parse(tmp_path, monkeypatch):
    """端到端契约:真打 /api/lanxin/send → 读回落盘的台账 → 喂给 compute,
    dueAt 必须【非空】、overdue 必须能算出来。

    沿用本文件既有的 mock lanxin.dispatch 范式(不碰网络),但让它返回一条 sentLog,
    这样 handler 的落盘分支才会真的跑到 —— 其余用例的 dispatch mock 都不带 sentLog,
    落盘那一步在它们那里是死代码。
    """
    srv, port = _srv(tmp_path, monkeypatch)
    monkeypatch.setattr(server, "LANXIN_INBOX_FILE", str(tmp_path / "lanxin_inbox.json"))
    LC.save_config(str(tmp_path / "lanxin_config.json"), _enabled_cfg())
    monkeypatch.setattr(lanxin_recipients, "read_org_tree", lambda path: _UNRESP_TREE)
    monkeypatch.setattr(lanxin, "dispatch", lambda plan, cfg: {
        "sent": 1, "failed": [], "msgIds": ["m1"],
        "sentLog": [{"staffId": "524288-aaa", "employId": "A006", "name": "张三",
                     "routeKey": "timesheet", "role": "primary",
                     "projectIds": [], "msgId": "m1"}]})
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/lanxin/send", json.dumps({"items": _UNRESP_ITEMS}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        r.read()

        store = server._load_lanxin_inbox()
        assert len(store["sent"]) == 1, "handler 必须把 sentLog 落进台账"

        # 用一个远未来的 now,让 overdue 必然为 True —— 这样 dueAt 与 overdue 两个
        # 派生值都被钉住,而不只是"字段存在"。
        far_future = (datetime.now() + timedelta(days=365)).strftime(lanxin_inbox.TS_FMT)
        rows = lanxin_unresponded.compute(store, 24, far_future)
        assert len(rows) == 1
        assert rows[0]["dueAt"] != "", \
            "sentAt 解析失败 —— handler 写入的时间戳格式与 lanxin_unresponded 对不上"
        assert rows[0]["overdue"] is True
        assert rows[0]["role"] == "primary", "role 必须一路从 sentLog 流到清单行"
    finally:
        srv.shutdown()
        srv.server_close()


# ── V4.5.10:只推送给选定的收件人 ──────────────────────────────────────────
#
# 起因:连通性自检只能证明网关通,要验一次真实数据此前只能往生产上全员真发。
# 这三条测的是【接线】—— 纯函数 lanxin.select_recipients 的语义已在
# tests/test_lanxin_select_and_unhandle.py 锁住,但 handler 若压根没把 only 传进去,
# 那边照样全绿(本仓 V4.0.5/V4.5.6/V4.5.7 反复吃过「定义了却没接线」的亏)。
# 故一律断言【dispatch 真正收到的 plan】,而不是只看响应码。

_TWO_TREE = {"byId": {"A006": {"name": "张三", "supId": None, "l4": "", "l31": ""},
                      "A007": {"name": "李四", "supId": None, "l4": "", "l31": ""}},
             "byName": {"张三": ["A006"], "李四": ["A007"]}}
_TWO_ITEMS = [{"kind": "timesheet", "employId": "A006",
               "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 1}]},
              {"kind": "timesheet", "employId": "A007",
               "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 2}]}]


def _send_capturing(tmp_path, monkeypatch, body):
    """发一次 /api/lanxin/send,把 dispatch 实际收到的 plan 捕获回来。
    返回 (status, 响应体, 捕获到的 plan 或 None)。"""
    srv, port = _srv(tmp_path, monkeypatch)
    LC.save_config(str(tmp_path / "lanxin_config.json"), _enabled_cfg())
    monkeypatch.setattr(lanxin_recipients, "read_org_tree", lambda path: _TWO_TREE)
    seen = {}

    def _fake_dispatch(plan, cfg):
        seen["plan"] = plan
        return {"sent": len(plan["recipients"]), "failed": [], "msgIds": [], "sentLog": []}

    monkeypatch.setattr(lanxin, "dispatch", _fake_dispatch)
    try:
        conn, cookie = _login(port)
        conn.request("POST", "/api/lanxin/send", json.dumps(body),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        return r.status, json.loads(r.read()), seen.get("plan")
    finally:
        srv.shutdown()
        srv.server_close()


def test_send_without_only_still_reaches_everyone(tmp_path, monkeypatch):
    """向后兼容基线:不带 only 的请求必须逐字保持原来的全发行为。
    这条同时是下一条测试的对照组 —— 没有它,"收窄成 1 人"可能只是本来就 1 人。"""
    status, body, plan = _send_capturing(tmp_path, monkeypatch, {"items": _TWO_ITEMS})
    assert status == 200
    assert sorted(r["employId"] for r in plan["recipients"]) == ["A006", "A007"]
    assert body["plan"]["totals"]["recipients"] == 2


def test_send_with_only_narrows_what_dispatch_actually_gets(tmp_path, monkeypatch):
    """核心断言:真正拿去发的那个 plan 只剩被勾选的人。
    只断言 200 或只断言响应体都不够 —— handler 完全可能把 only 读进来却没用上。"""
    status, body, plan = _send_capturing(
        tmp_path, monkeypatch,
        {"items": _TWO_ITEMS, "only": [{"role": "primary", "employId": "A007"}]})
    assert status == 200
    assert [r["employId"] for r in plan["recipients"]] == ["A007"]
    # 响应体也必须是收窄后的:前端拿它渲染「收件 N 人」与推送结果
    assert body["plan"]["totals"]["recipients"] == 1
    assert body["result"]["sent"] == 1


def test_send_with_only_that_matches_nobody_is_rejected_before_dispatch(tmp_path, monkeypatch):
    """全部落空 → 400,且【dispatch 一次都没被调用】。
    先发再报错 = 已经真实触达了员工,不可撤销。"""
    status, body, plan = _send_capturing(
        tmp_path, monkeypatch,
        {"items": _TWO_ITEMS, "only": [{"role": "primary", "employId": "A999"}]})
    assert status == 400
    assert body["success"] is False
    assert plan is None, "dispatch 不该被调用"


def test_send_with_empty_only_does_not_fall_back_to_sending_everyone(tmp_path, monkeypatch):
    """一个都没勾 ≠ 全发。退化成全发就是把"我只想试发给自己"变成全员触达。"""
    status, body, plan = _send_capturing(
        tmp_path, monkeypatch, {"items": _TWO_ITEMS, "only": []})
    assert status == 400
    assert plan is None
