"""I-4:/api/lanxin/{preview,send} 此前没有 except,凭证错/花名册缺失时异常直穿
socketserver、连接直接断开,前端只看到 Failed to fetch。本文件用真实 HTTP 请求验证
两个端点现在把这些异常转成结构化的 400 响应。"""
import json
import http.client
import threading

import auth
import config as CFG
import lanxin
import lanxin_config as LC
import lanxin_recipients
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
