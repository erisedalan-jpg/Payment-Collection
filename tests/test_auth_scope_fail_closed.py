"""domain_union_scope 的空 page_keys 分支 fail-closed(2026-08-03)。

旧行为:空 page_keys → 回退默认范围;而 _make_user 的 allowedL4 缺省是 ['*'],
于是「该域一页都进不去 + 建号时没收窄默认范围」的普通账号能 curl 到未切分全量。
新行为:空 page_keys → ([], []),该域什么都看不到。

本文件同时钉住【没变的那一半】(非空 page_keys 的并集/'*' 短路),
以免今后把 fail-closed 改过头、连正常账号也一起收干净。
"""
import json
import http.client
import threading

import auth
import config
import server


def _rec(pages, l4, staff=None, page_scopes=None):
    return {"allowedPages": list(pages), "allowedL4": list(l4),
            "allowedStaff": list(staff or []), "pageScopes": dict(page_scopes or {})}


# ── 纯函数层 ──

def test_empty_page_keys_is_fail_closed_even_when_default_is_star():
    # 这正是可利用的那条:默认范围 ['*'],该域零可访问页 → 必须收敛到空,不能回退成 '*'
    assert auth.domain_union_scope(_rec(["yitian"], ["*"]), "project", []) == ([], [])


def test_empty_page_keys_is_fail_closed_for_narrow_default_too():
    rec = _rec(["yitian"], ["D1"], ["E1"])
    assert auth.domain_union_scope(rec, "project", []) == ([], [])


def test_empty_page_keys_from_none_is_fail_closed():
    # 调用点传的是列表推导,不会是 None;但 None 与 [] 语义必须一致,免得有人日后传 None 绕开
    assert auth.domain_union_scope(_rec([], ["*"]), "project", None) == ([], [])


def test_non_empty_page_keys_behaviour_unchanged_union():
    # 回归安全网:这条断言变红说明 fail-closed 改过头了(正常账号的并集不该受影响)
    rec = _rec(["*"], ["D0"], [], {"projects": {"l4": ["Da"], "staff": ["E1"]},
                                   "payment": {"l4": ["Db"], "staff": []}})
    l4, staff = auth.domain_union_scope(rec, "project", ["overview", "projects", "payment"])
    assert set(l4) == {"D0", "Da", "Db"} and set(staff) == {"E1"}


def test_non_empty_page_keys_star_short_circuit_unchanged():
    assert auth.domain_union_scope(_rec(["*"], ["*"]), "project", ["overview"]) == (["*"], [])


# ── 端到端:/data/analysis_data.json ──

def _seed_accounts(tmp_path, monkeypatch, users):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        acc: {**spec, "salt": salt, "hash": auth.hash_password("p", salt),
              "displayName": acc}
        for acc, spec in users.items()}})


def _seed_analysis(tmp_path, monkeypatch):
    f = tmp_path / "analysis_data.json"
    f.write_text(json.dumps({
        "meta": {"lastUpdate": "x", "totalProjects": 2, "totalClosed": 0, "totalPaymentNodes": 0},
        "projects": [{"projectId": "P1", "orgL4": "D1"}, {"projectId": "P2", "orgL4": "D2"}],
        "closedProjects": [], "projectPmis": {"P1": {}, "P2": {}}, "paymentNodes": {},
        "events": [], "dataQuality": {"summary": {}},
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(f))
    server._analysis_cache["mtime"] = None


def _get_data(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    conn.request("GET", "/data/analysis_data.json", headers={"Cookie": cookie})
    r2 = conn.getresponse()
    body = json.loads(r2.read())
    conn.close()
    return r2.status, body


def test_account_with_zero_project_pages_gets_nothing(tmp_path, monkeypatch):
    """核心回归:只有倚天页、默认 L4 是 ['*'] 的普通账号,直连 /data 必须拿不到任何项目。
    修复前这里会拿到 P1+P2 全量(走 handle_data_json 的 "'*' in allowed" 原文件分支)。"""
    _seed_accounts(tmp_path, monkeypatch, {
        "onlyyitian": {"isSuper": False, "allowedPages": ["yitian"], "allowedL4": ["*"],
                       "allowedStaff": [], "pageScopes": {}},
        "hasproject": {"isSuper": False, "allowedPages": ["projects"], "allowedL4": ["*"],
                       "allowedStaff": [], "pageScopes": {}},
        "super": {"isSuper": True, "allowedPages": ["*"], "allowedL4": ["*"],
                  "allowedStaff": [], "pageScopes": {}},
    })
    _seed_analysis(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        status, body = _get_data(port, "onlyyitian")
        assert status == 200
        assert body["projects"] == []                 # fail-closed
        assert body["projectPmis"] == {}
        assert body["meta"]["totalProjects"] == 0

        # 同样默认 ['*']、但确实持有一个 project 域页面的账号 → 行为不变(仍是全量)
        status2, body2 = _get_data(port, "hasproject")
        assert status2 == 200
        assert {p["projectId"] for p in body2["projects"]} == {"P1", "P2"}

        # 超管不受影响(6 处调用点都在用本函数结果前先判 isSuper)
        status3, body3 = _get_data(port, "super")
        assert status3 == 200
        assert {p["projectId"] for p in body3["projects"]} == {"P1", "P2"}
    finally:
        srv.shutdown(); srv.server_close()


def test_project_domain_pages_still_cover_the_real_page_set():
    """自证规模:上面的用例靠「allowedPages=['yitian'] ⇒ project 域零可访问页」成立。
    若哪天有人把某个 project 页挪进别的域、或 DOMAIN_PAGES 被裁空,这条会先红。"""
    assert len(config.DOMAIN_PAGES["project"]) >= 15
    assert "projects" in config.DOMAIN_PAGES["project"]
    assert "yitian" not in config.DOMAIN_PAGES["project"]
