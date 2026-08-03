"""静态资源与 /data 的缓存契约(2026-08-03)。

修复前:end_headers 对所有 .js/.css/.html 无条件下发 no-cache/no-store,而 vite 产物是
【内容哈希文件名】,本该 immutable 长缓存;/data/analysis_data.json 又没有任何校验头。
合计每次刷新重下约 4.5 MiB,零字节可复用。
"""
import json
import http.client
import os
import threading

import pytest

import auth
import server

HASHED_JS = "index-VsmAVMn1.js"          # 与真实 dist 产物同形(name-<8位哈希>.ext)
HASHED_CSS = "RiskFollowupView-CwBFOCQ3.css"


@pytest.fixture()
def live(tmp_path, monkeypatch):
    """真服务 + 一份最小 dist(assets/ 下两个哈希文件 + 根 index.html)+ 超管会话。"""
    web = tmp_path / "dist"
    (web / "assets").mkdir(parents=True)
    (web / "assets" / HASHED_JS).write_text("console.log(1)", encoding="utf-8")
    (web / "assets" / HASHED_CSS).write_text("body{}", encoding="utf-8")
    (web / "index.html").write_text("<html></html>", encoding="utf-8")
    (web / "legacy.js").write_text("// 无哈希", encoding="utf-8")
    monkeypatch.setattr(server, "WEB_ROOT", str(web))

    af = tmp_path / "analysis_data.json"
    af.write_text(json.dumps({
        "meta": {"lastUpdate": "x", "totalProjects": 1, "totalClosed": 0, "totalPaymentNodes": 0},
        "projects": [{"projectId": "P1", "orgL4": "D1"}], "closedProjects": [],
        "projectPmis": {"P1": {}}, "paymentNodes": {}, "events": [], "dataQuality": {"summary": {}},
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(af))
    server._analysis_cache["mtime"] = None

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
    conn.close()
    try:
        yield port, cookie, str(af)
    finally:
        srv.shutdown(); srv.server_close()


def _get(port, path, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=8)
    conn.request("GET", path, headers=headers or {})
    r = conn.getresponse()
    status, hdrs, body = r.status, dict(r.getheaders()), r.read()
    conn.close()
    return status, hdrs, body


# ── 纯函数:哈希文件名识别 ──

@pytest.mark.parametrize("path", [
    "/assets/" + HASHED_JS,
    "/assets/" + HASHED_CSS,
    "/pm/assets/" + HASHED_JS,               # 子路径部署(--base=/pm/)
    "/assets/index-VsmAVMn1.js.map",
    "/assets/logo-AbCd1234.svg",
])
def test_hashed_asset_pattern_matches(path):
    assert server._HASHED_ASSET_RE.search(path)


@pytest.mark.parametrize("path", [
    "/index.html",                            # SPA 入口:内容会变而 URL 不变
    "/review.html",
    "/legacy.js",                             # 无哈希段
    "/assets/index.js",                       # 无哈希段
    "/assets/index-Vsm.js",                   # 哈希段不足 8 位
    "/data/analysis_data.json",
])
def test_hashed_asset_pattern_rejects(path):
    assert not server._HASHED_ASSET_RE.search(path)


# ── 端到端:静态资源头 ──

def test_hashed_assets_get_immutable_long_cache(live):
    port, _, _ = live
    for p in ("/assets/" + HASHED_JS, "/assets/" + HASHED_CSS):
        status, hdrs, _ = _get(port, p)
        assert status == 200, p
        cc = hdrs.get("Cache-Control", "")
        assert "immutable" in cc and "max-age=31536000" in cc, (p, cc)
        assert "no-store" not in cc, (p, cc)
        # Pragma/Expires 是给 no-store 配的,长缓存下必须一并消失,否则老代理会当不缓存处理
        assert "Pragma" not in hdrs and "Expires" not in hdrs, (p, hdrs)


def test_spa_entry_and_unhashed_js_stay_no_store(live):
    """回归安全网:入口与无哈希脚本【必须】保持每次校验。
    这条变红说明 immutable 规则放得太宽,改版后浏览器会抱着旧 index.html 不放。"""
    port, _, _ = live
    for p in ("/index.html", "/legacy.js"):
        status, hdrs, _ = _get(port, p)
        assert status == 200, p
        assert "no-store" in hdrs.get("Cache-Control", ""), (p, hdrs)


# ── 端到端:/data/analysis_data.json 的条件请求 ──

def test_analysis_data_has_validators_and_304_on_revalidate(live):
    port, cookie, _ = live
    status, hdrs, body = _get(port, "/data/analysis_data.json", {"Cookie": cookie})
    assert status == 200
    etag = hdrs.get("ETag")
    last_mod = hdrs.get("Last-Modified")
    assert etag and last_mod
    assert json.loads(body)["projects"][0]["projectId"] == "P1"
    # Cache-Control 必须是 no-cache(可存但每次回源校验),绝不能是长缓存 ——
    # 这个 URL 是固定的,长缓存会让「更新数据」之后的新数据看不见。
    assert hdrs.get("Cache-Control") == "no-cache"

    s2, h2, b2 = _get(port, "/data/analysis_data.json",
                      {"Cookie": cookie, "If-None-Match": etag})
    assert s2 == 304 and b2 == b""
    assert h2.get("ETag") == etag

    s3, _, b3 = _get(port, "/data/analysis_data.json",
                     {"Cookie": cookie, "If-Modified-Since": last_mod})
    assert s3 == 304 and b3 == b""


def test_analysis_data_etag_changes_after_file_rewrite(live):
    """文件一变 ETag 必须变,否则「更新数据」后浏览器会一直吃 304 拿旧数据 ——
    这正是给 /data 加缓存最危险的失败模式。"""
    port, cookie, af = live
    _, hdrs, _ = _get(port, "/data/analysis_data.json", {"Cookie": cookie})
    old_etag = hdrs["ETag"]

    data = json.loads(open(af, encoding="utf-8").read())
    data["projects"].append({"projectId": "P2", "orgL4": "D2"})
    with open(af, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.utime(af, None)
    server._analysis_cache["mtime"] = None

    s2, h2, b2 = _get(port, "/data/analysis_data.json",
                      {"Cookie": cookie, "If-None-Match": old_etag})
    assert s2 == 200, "内容变了却回了 304"
    assert h2["ETag"] != old_etag
    assert len(json.loads(b2)["projects"]) == 2


def test_stale_if_none_match_wins_over_matching_if_modified_since(live):
    """两个条件头同时在场时以 ETag 为准(RFC 9110)。若反过来让 If-Modified-Since
    也能放行,一个 ETag 不匹配的请求会被判成「没变」,数据就此卡死在旧版本。"""
    port, cookie, _ = live
    _, hdrs, _ = _get(port, "/data/analysis_data.json", {"Cookie": cookie})
    s, _, b = _get(port, "/data/analysis_data.json",
                   {"Cookie": cookie, "If-None-Match": '"stale-etag"',
                    "If-Modified-Since": hdrs["Last-Modified"]})
    assert s == 200 and b != b""
