import json
import threading
import http.client
import pytest
import auth
import server


@pytest.fixture
def admin_server(tmp_path, monkeypatch):
    # 独立 accounts.json: 1 超管 boss + 1 普通 liu
    accounts_file = tmp_path / "accounts.json"
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(accounts_file))
    auth._sessions.clear()
    data = {"version": 1, "users": {}}
    data["users"]["boss"] = auth._make_user("bosspw", "超管", is_super=True)
    data["users"]["liu"] = auth._make_user(
        "liupw", "老刘", is_super=False, pages=["projects"], l4=["北京"]
    )
    auth.save_accounts(data)

    httpd = server.create_server(host="127.0.0.1", port=0)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield port
    httpd.shutdown()
    httpd.server_close()


def _login(port, account, password):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request(
        "POST",
        "/api/login",
        json.dumps({"account": account, "password": password}),
        {"Content-Type": "application/json"},
    )
    r = conn.getresponse()
    body = r.read()
    cookie = r.getheader("Set-Cookie")
    conn.close()
    return r.status, cookie, json.loads(body or b"{}")


def _req(port, method, path, cookie=None, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie.split(";")[0]
    conn.request(method, path, json.dumps(body) if body is not None else None, headers)
    r = conn.getresponse()
    data = json.loads(r.read() or b"{}")
    conn.close()
    return r.status, data


def test_super_lists_accounts_without_secrets(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(port, "GET", "/api/admin/accounts", cookie)
    assert status == 200 and data["success"]
    accs = data["accounts"]
    assert {a["account"] for a in accs} == {"boss", "liu"}
    for a in accs:
        assert "salt" not in a and "hash" not in a


def test_normal_user_forbidden(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "liu", "liupw")
    assert _req(port, "GET", "/api/admin/accounts", cookie)[0] == 403
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/create",
            cookie,
            {
                "account": "x",
                "password": "p",
                "displayName": "X",
                "allowedPages": ["projects"],
                "allowedL4": ["北京"],
            },
        )[0]
        == 403
    )
    assert (
        _req(port, "POST", "/api/admin/accounts/delete", cookie, {"account": "boss"})[0]
        == 403
    )


def test_unauthenticated_401(admin_server):
    port = admin_server
    assert _req(port, "GET", "/api/admin/accounts")[0] == 401


def test_super_create_then_list(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(
        port,
        "POST",
        "/api/admin/accounts/create",
        cookie,
        {
            "account": "newbie",
            "password": "pw12345",
            "displayName": "新人",
            "allowedPages": ["projects"],
            "allowedL4": ["上海"],
        },
    )
    assert status == 200 and data["user"]["isSuper"] is False
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    assert "newbie" in {a["account"] for a in lst["accounts"]}
    # 撞名 400
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/create",
            cookie,
            {
                "account": "newbie",
                "password": "p",
                "displayName": "x",
                "allowedPages": ["projects"],
                "allowedL4": ["上海"],
            },
        )[0]
        == 400
    )


def test_super_update_normal(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, _ = _req(
        port,
        "POST",
        "/api/admin/accounts/update",
        cookie,
        {"account": "liu", "allowedL4": ["上海", "广州"]},
    )
    assert status == 200
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    liu = next(a for a in lst["accounts"] if a["account"] == "liu")
    assert liu["allowedL4"] == ["上海", "广州"]


def test_super_cannot_update_or_delete_super(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/update",
            cookie,
            {"account": "boss", "displayName": "x"},
        )[0]
        == 400
    )
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/delete",
            cookie,
            {"account": "boss"},
        )[0]
        == 400
    )


def test_super_cannot_delete_self(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    assert (
        _req(port, "POST", "/api/admin/accounts/delete", cookie, {"account": "boss"})[0]
        == 400
    )


def test_super_delete_normal_revokes_session(admin_server):
    port = admin_server
    _, boss_cookie, _ = _login(port, "boss", "bosspw")
    _, liu_cookie, _ = _login(port, "liu", "liupw")
    assert _req(port, "GET", "/api/auth/me", liu_cookie)[0] == 200
    assert (
        _req(
            port,
            "POST",
            "/api/admin/accounts/delete",
            boss_cookie,
            {"account": "liu"},
        )[0]
        == 200
    )
    assert _req(port, "GET", "/api/auth/me", liu_cookie)[0] == 401


def test_super_create_non_string_displayname_400_not_500(admin_server):
    """I-1 回归:非字符串 displayName 须受控 400(ERR_VALIDATION),不得逃逸成 500/断连。"""
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(
        port, "POST", "/api/admin/accounts/create", cookie,
        {"account": "newbie", "password": "pw12345", "displayName": {"x": 1},
         "allowedPages": ["projects"], "allowedL4": ["北京"]},
    )
    assert status == 400 and data.get("code") == "validation_error"
    # 账号不应因异常逃逸而被部分写入
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    assert "newbie" not in {a["account"] for a in lst["accounts"]}


def test_super_update_non_string_account_400(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, _ = _req(
        port, "POST", "/api/admin/accounts/update", cookie,
        {"account": ["liu"], "displayName": "x"},
    )
    assert status == 400


def test_super_create_with_staff_persists(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(
        port, "POST", "/api/admin/accounts/create", cookie,
        {"account": "emp", "password": "pw12345", "displayName": "员工范围",
         "allowedPages": ["yitian"], "allowedL4": [], "allowedStaff": ["E001", "E002"]},
    )
    assert status == 200
    assert data["user"]["allowedStaff"] == ["E001", "E002"]
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    emp = next(a for a in lst["accounts"] if a["account"] == "emp")
    assert emp["allowedStaff"] == ["E001", "E002"]


def test_super_update_staff(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    assert _req(port, "POST", "/api/admin/accounts/update", cookie,
                {"account": "liu", "allowedStaff": ["E9"]})[0] == 200
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    liu = next(a for a in lst["accounts"] if a["account"] == "liu")
    assert liu["allowedStaff"] == ["E9"]


def test_roster_endpoint_super_only(admin_server, monkeypatch):
    port = admin_server
    monkeypatch.setattr(
        server, "_load_roster_cached",
        lambda: [{"id": "E001", "name": "张三", "l4": "银行组", "category": "正式"}],
    )
    _, boss_cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(port, "GET", "/api/admin/roster", boss_cookie)
    assert status == 200 and data["success"]
    assert data["roster"] == [{"id": "E001", "name": "张三", "l4": "银行组"}]   # 无 category 隐私列
    _, liu_cookie, _ = _login(port, "liu", "liupw")
    assert _req(port, "GET", "/api/admin/roster", liu_cookie)[0] == 403
    assert _req(port, "GET", "/api/admin/roster")[0] == 401


def test_super_create_with_domain_scopes(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(
        port, "POST", "/api/admin/accounts/create", cookie,
        {"account": "dm", "password": "pw12345", "displayName": "分域",
         "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
         "domainScopes": {"yitian": {"l4": ["Dx"], "staff": ["E1"]},
                          "opportunity": {"l4": ["D2"], "staff": ["E9"]}}},
    )
    assert status == 200
    assert data["user"]["domainScopes"]["yitian"] == {"l4": ["Dx"], "staff": ["E1"]}
    assert data["user"]["domainScopes"]["opportunity"] == {"l4": ["D2"], "staff": []}   # 商机 staff 清空
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    dm = next(a for a in lst["accounts"] if a["account"] == "dm")
    assert dm["domainScopes"]["yitian"]["l4"] == ["Dx"]
