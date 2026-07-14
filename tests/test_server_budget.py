"""概算工具 /api/budget/* 端点测试。

所有用例把 server 的两个文件常量 monkeypatch 到 tmp_path,绝不允许碰真实
data/budget_config.json 与 data/budget_estimates.json;auth/audit 的文件常量同样隔离
(否则登录会把 data/accounts.json 覆盖掉、审计会追写 data/audit_log.jsonl)。
跑完 git status --short data/ 必须无输出。

夹具形态:仓库里没有 tests/conftest.py,client/login_normal/login_super 都在本文件内自建,
起服务与登录带 cookie 的写法照抄 tests/test_server_yitian.py + tests/test_server_portal.py。
"""
import http.client
import json
import os
import threading
import time

import pytest

import auth
import audit
import server
import budget_config
import budget_store

PASSWORD = "p"


class _Resp:
    """把 http.client 的响应收敛成 .status / .json() 两件套。"""

    def __init__(self, status, raw):
        self.status = status
        self._raw = raw

    def json(self):
        return json.loads(self._raw.decode("utf-8"))


class _Client:
    """每次请求开一条新连接:避免 keep-alive 下 handler 实例状态串味,也免去连接复用的坑。"""

    def __init__(self, port):
        self.port = port
        self.cookie = ""

    def login(self, account):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        conn.request("POST", "/api/login",
                     json.dumps({"account": account, "password": PASSWORD}),
                     {"Content-Type": "application/json"})
        r = conn.getresponse()
        self.cookie = (r.getheader("Set-Cookie") or "").split(";")[0]
        r.read()
        conn.close()
        assert self.cookie, "登录失败,没拿到 Set-Cookie: %s" % account

    def _request(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        headers = {}
        if self.cookie:
            headers["Cookie"] = self.cookie
        payload = None
        if body is not None:
            payload = json.dumps(body)
            headers["Content-Type"] = "application/json"
        conn.request(method, path, payload, headers)
        r = conn.getresponse()
        raw = r.read()
        conn.close()
        return _Resp(r.status, raw)

    def get(self, path):
        return self._request("GET", path)

    def post(self, path, body=None):
        return self._request("POST", path, body if body is not None else {})


def _user(is_super, pages):
    salt = "s"
    return {"salt": salt, "hash": auth.hash_password(PASSWORD, salt),
            "isSuper": is_super, "allowedPages": list(pages),
            "allowedL4": ["*"], "displayName": "测试"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    """起一个真服务(随机端口),账号库/审计日志全部隔离到 tmp_path。"""
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    monkeypatch.setattr(audit, "AUDIT_LOG_FILE", str(tmp_path / "audit_log.jsonl"))
    monkeypatch.setattr(audit, "AUDIT_ARCHIVE_DIR", str(tmp_path / "audit_archive"))
    auth._sessions.clear()
    auth.save_accounts({"version": 1, "users": {"super": _user(True, ["*"])}})
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        yield _Client(port)
    finally:
        srv.shutdown()
        srv.server_close()


@pytest.fixture
def files(tmp_path, monkeypatch):
    """两个 budget 文件常量隔离到 tmp_path —— 真实 data/ 一个字节都不许动。"""
    cfg = str(tmp_path / "budget_config.json")
    est = str(tmp_path / "budget_estimates.json")
    monkeypatch.setattr(server, "BUDGET_CONFIG_FILE", cfg, raising=True)
    monkeypatch.setattr(server, "BUDGET_ESTIMATES_FILE", est, raising=True)
    return {"config": cfg, "estimates": est}


@pytest.fixture
def login_normal(client):
    """login_normal(pages=[...], account="normal") —— 按需建普通管理员账号并登录。"""
    def _do(pages=(), account="normal"):
        data = auth.load_accounts()
        data["users"][account] = _user(False, pages)
        auth.save_accounts(data)
        client.login(account)
        return account
    return _do


@pytest.fixture
def login_super(client):
    def _do(account="super"):
        client.login(account)
        return account
    return _do


def _payload(name="报价A"):
    return {"quoteName": name,
            "data": {"basic": {"quoteName": name}},
            "rateSnapshot": budget_config.default_config(),
            "summary": {"customerName": "某客户", "salesName": "张三",
                        "projectAmount": 100.0, "totalCost": 100000.0,
                        "salesAmount": 113000.0, "costRatio": 11.3,
                        "ratioStatus": "normal"}}


# —— 铁律:三条 path 一条都不许进 _SUPER_ONLY_PATHS ——
# 那个 frozenset 按 path 匹配、不分 method;GET 是全体授权账号要用的(页面拿不到配置就算不了),
# 一旦入闸普通管理员连读都 403、/budget 直接白板。超管校验写在 handler 内(_require_super)。

class TestBudgetPathsNotSuperOnly:
    def test_budget_paths_not_in_super_only_paths(self):
        assert '/api/budget/config' not in server._SUPER_ONLY_PATHS
        assert '/api/budget/estimates' not in server._SUPER_ONLY_PATHS
        assert '/api/budget/estimates/delete' not in server._SUPER_ONLY_PATHS

    def test_files_are_distinct_and_named(self):
        assert server.BUDGET_CONFIG_FILE.endswith('budget_config.json')
        assert server.BUDGET_ESTIMATES_FILE.endswith('budget_estimates.json')
        assert server.BUDGET_CONFIG_FILE != server.BUDGET_ESTIMATES_FILE


# —— 配置端点 ——

def test_config_get_未登录401(client, files):
    assert client.get("/api/budget/config").status == 401


def test_config_get_登录但无budget权限403(client, files, login_normal):
    login_normal(pages=["projects"])
    assert client.get("/api/budget/config").status == 403


def test_config_get_有budget权限_返回默认配置(client, files, login_normal):
    login_normal(pages=["budget"])
    r = client.get("/api/budget/config")
    assert r.status == 200
    cfg = r.json()["config"]
    assert cfg["fx"] == 6.8
    assert len(cfg["products"]) == 19


def test_config_post_未登录401(client, files):
    assert client.post("/api/budget/config", budget_config.default_config()).status == 401


def test_config_post_普通管理员403_且不落盘(client, files, login_normal):
    login_normal(pages=["budget"])
    body = budget_config.default_config()
    body["fx"] = 9.9
    assert client.post("/api/budget/config", body).status == 403
    assert not os.path.exists(files["config"])       # 越权请求不得留下任何痕迹


def test_config_post_超管可改_改完立即生效(client, files, login_super):
    login_super()
    body = budget_config.default_config()
    body["fx"] = 7.1
    r = client.post("/api/budget/config", body)
    assert r.status == 200 and r.json()["config"]["fx"] == 7.1
    assert client.get("/api/budget/config").json()["config"]["fx"] == 7.1


def test_config_post_非法值400_且磁盘原样不动(client, files, login_super):
    login_super()
    ok = budget_config.default_config()
    ok["fx"] = 7.1
    client.post("/api/budget/config", ok)
    bad = budget_config.default_config()
    bad["fx"] = -1
    assert client.post("/api/budget/config", bad).status == 400
    # 先算通再落盘:非法请求不能把已有配置写坏
    assert budget_config.load_config(files["config"])["fx"] == 7.1


# —— 存档端点 ——

def test_estimates_未登录401(client, files):
    assert client.get("/api/budget/estimates").status == 401
    assert client.post("/api/budget/estimates", _payload()).status == 401


def test_estimates_无budget权限403(client, files, login_normal):
    login_normal(pages=["projects"], account="zhangsan")
    assert client.get("/api/budget/estimates").status == 403
    assert client.post("/api/budget/estimates", _payload()).status == 403
    assert client.post("/api/budget/estimates/delete", {"id": "e_x"}).status == 403


def test_estimates_新建与列表(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    r = client.post("/api/budget/estimates", _payload())
    assert r.status == 200
    rid = r.json()["record"]["id"]
    items = client.get("/api/budget/estimates").json()["items"]
    assert [i["id"] for i in items] == [rid]
    # 列表不下发大字段(rateSnapshot 一条就十几 KB)
    assert "rateSnapshot" not in items[0] and "data" not in items[0]
    assert items[0]["costRatio"] == 11.3


def test_estimates_取整条带rateSnapshot(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload()).json()["record"]["id"]
    rec = client.get("/api/budget/estimates?id=%s" % rid).json()["record"]
    assert rec["rateSnapshot"]["fx"] == 6.8          # 快照随记录一起回来
    assert rec["data"]["basic"]["quoteName"] == "报价A"


def test_estimates_覆盖不新增条目(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload("原名")).json()["record"]["id"]
    body = _payload("改名")
    body["id"] = rid
    r = client.post("/api/budget/estimates", body)
    assert r.status == 200 and r.json()["record"]["id"] == rid
    items = client.get("/api/budget/estimates").json()["items"]
    assert len(items) == 1 and items[0]["quoteName"] == "改名"


def test_estimates_普通管理员只见自己的(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    client.post("/api/budget/estimates", _payload("张三的"))
    login_normal(pages=["budget"], account="lisi")
    client.post("/api/budget/estimates", _payload("李四的"))
    items = client.get("/api/budget/estimates").json()["items"]
    assert [i["quoteName"] for i in items] == ["李四的"]


def test_estimates_超管带all可见全部_普通带all仍只见自己(client, files, login_normal, login_super):
    login_normal(pages=["budget"], account="zhangsan")
    client.post("/api/budget/estimates", _payload("张三的"))
    # 普通管理员传 all=1 也突破不了隔离(前端传什么都不能改变后端的切分)
    got = client.get("/api/budget/estimates?all=1").json()["items"]
    assert [i["quoteName"] for i in got] == ["张三的"]
    login_super()
    client.post("/api/budget/estimates", _payload("超管的"))
    mine = client.get("/api/budget/estimates").json()["items"]
    assert [i["quoteName"] for i in mine] == ["超管的"]      # 超管默认也只看自己的
    allnames = sorted(i["quoteName"] for i in
                      client.get("/api/budget/estimates?all=1").json()["items"])
    assert allnames == ["张三的", "超管的"]


def test_estimates_越权覆盖他人存档403_原记录原样(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload("张三的")).json()["record"]["id"]
    login_normal(pages=["budget"], account="lisi")
    body = _payload("李四篡改")
    body["id"] = rid
    assert client.post("/api/budget/estimates", body).status == 403
    store = budget_store.load_store(files["estimates"])
    assert store["estimates"][0]["quoteName"] == "张三的"
    assert store["estimates"][0]["account"] == "zhangsan"


def test_estimates_越权读取他人整条403(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload()).json()["record"]["id"]
    login_normal(pages=["budget"], account="lisi")
    assert client.get("/api/budget/estimates?id=%s" % rid).status == 403


def test_estimates_越权删除他人403_超管可删(client, files, login_normal, login_super):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload()).json()["record"]["id"]
    login_normal(pages=["budget"], account="lisi")
    assert client.post("/api/budget/estimates/delete", {"id": rid}).status == 403
    assert len(budget_store.load_store(files["estimates"])["estimates"]) == 1   # 未被删
    login_super()
    assert client.post("/api/budget/estimates/delete", {"id": rid}).status == 200
    assert budget_store.load_store(files["estimates"])["estimates"] == []


def test_estimates_超管可覆盖他人存档_owner不变(client, files, login_normal, login_super):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload("张三的")).json()["record"]["id"]
    login_super()
    body = _payload("超管改的")
    body["id"] = rid
    assert client.post("/api/budget/estimates", body).status == 200
    rec = budget_store.load_store(files["estimates"])["estimates"][0]
    assert rec["quoteName"] == "超管改的"
    assert rec["account"] == "zhangsan"      # owner 不因超管代改而易主


def test_estimates_不存在的id_取与删都404(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    assert client.get("/api/budget/estimates?id=e_nope").status == 404
    assert client.post("/api/budget/estimates/delete", {"id": "e_nope"}).status == 404


def test_estimates_覆盖不存在的id_404(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    body = _payload()
    body["id"] = "e_nope"
    assert client.post("/api/budget/estimates", body).status == 404


def test_estimates_报价名为空400(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    assert client.post("/api/budget/estimates", _payload("")).status == 400


def test_estimates_删除缺id_400(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    assert client.post("/api/budget/estimates/delete", {}).status == 400


# —— 审计埋点 ——
# 设计文档 §3:配置变更与存档删除必须进 audit.py 埋点。光在 handler 里调 _audit_set 不够 ——
# _audit_request() 是 audit.map_action((method, path)) 未命中就直接 return,所以 _ACTION_MAP
# 里没有对应条目时,_audit_set 设的 target/detail 全是空转、一条记录都不会落。下面的用例证明
# 记录真的落盘了(而不只是"map 里有这一行")。

def _audit_rows(event_code, expect=1, timeout=2.0):
    """取某事件码的审计行(最新在前)。审计是在响应发出**之后**才落盘的
    (_audit_request 在 do_POST 的 finally 里跑),所以要等一下,不能拿到响应就断言。"""
    deadline = time.time() + timeout
    rows = audit.read({"event": [event_code]}, 1, 50)["rows"]
    while len(rows) < expect and time.time() < deadline:
        time.sleep(0.02)
        rows = audit.read({"event": [event_code]}, 1, 50)["rows"]
    return rows


def test_audit_超管改配置留痕_含汇率与产品数(client, files, login_super):
    login_super()
    body = budget_config.default_config()
    body["fx"] = 7.1
    assert client.post("/api/budget/config", body).status == 200
    rows = _audit_rows("budget.config")
    assert len(rows) == 1
    r = rows[0]
    assert r["action"] == "修改概算费率配置"
    assert r["account"] == "super" and r["success"] is True and r["status"] == 200
    assert r["target"] == "概算工具费率配置"
    assert "7.1" in r["detail"] and "19 条" in r["detail"]      # 汇率与产品数都在 detail 里


def test_audit_保存报价留痕_新建与更新可区分(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload("原名")).json()["record"]["id"]
    assert _audit_rows("budget.estimate.save")[0]["detail"] == "新建报价"
    body = _payload("改名")
    body["id"] = rid
    assert client.post("/api/budget/estimates", body).status == 200
    rows = _audit_rows("budget.estimate.save", expect=2)      # 最新在前
    assert len(rows) == 2
    assert rows[0]["detail"] == "更新报价" and rows[0]["target"] == "改名"
    assert rows[1]["detail"] == "新建报价" and rows[1]["target"] == "原名"
    assert rows[0]["account"] == "zhangsan" and rows[0]["success"] is True


def test_audit_删除报价留痕_target是被删报价名(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload("待删的报价")).json()["record"]["id"]
    assert client.post("/api/budget/estimates/delete", {"id": rid}).status == 200
    rows = _audit_rows("budget.estimate.delete")
    assert len(rows) == 1
    assert rows[0]["action"] == "删除概算报价"
    assert rows[0]["target"] == "待删的报价"          # 记的是名称,不是光秃秃一个 id
    assert rows[0]["detail"] == "删除报价" and rows[0]["success"] is True


def test_audit_越权改配置_不留成功记录_但留被拒痕迹(client, files, login_normal):
    """仓库既有行为:_audit_request 在 dispatch 的 finally 里跑,不管成功失败都记一条,
    用 status/success 区分(success = 200 <= status < 300)。所以越权请求**会**留痕(这正是
    审计想要的:谁在什么时候试图越权),但绝不能被记成一条成功的配置变更。"""
    login_normal(pages=["budget"], account="zhangsan")
    body = budget_config.default_config()
    body["fx"] = 9.9
    assert client.post("/api/budget/config", body).status == 403
    rows = _audit_rows("budget.config")
    assert all(r["success"] is False for r in rows)     # 没有任何一条成功的配置变更
    assert len(rows) == 1
    assert rows[0]["status"] == 403 and rows[0]["account"] == "zhangsan"
    assert rows[0]["target"] is None                   # handler 在 _audit_set 之前就 403 返回了
    assert not os.path.exists(files["config"])         # 越权请求也没在磁盘上留下配置


def test_audit_未登录请求不入审计(client, files):
    """401 由 _auth_gate 在 dispatch 之前拦下并 return,压根不进 _audit_request ——
    这是既有设计(未认证请求不入业务审计流),这里钉死它,免得后人误以为漏了埋点。"""
    assert client.post("/api/budget/config", budget_config.default_config()).status == 401
    time.sleep(0.1)
    assert audit.read({"event": ["budget.config"]}, 1, 50)["total"] == 0
