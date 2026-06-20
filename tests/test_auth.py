import json
import os
import time
import auth


def _fresh(tmp_path, monkeypatch):
    f = tmp_path / "accounts.json"
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(f))
    auth._sessions.clear()
    return f


def test_hash_verify(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    h = auth.hash_password("pw", "salt1")
    assert auth.hash_password("pw", "salt1") == h
    assert auth.hash_password("pw", "salt2") != h
    assert auth.verify_password("pw", "salt1", h) is True
    assert auth.verify_password("bad", "salt1", h) is False


def test_seed_then_authenticate(tmp_path, monkeypatch):
    f = _fresh(tmp_path, monkeypatch)
    assert auth.seed_default_accounts() is True
    assert os.path.exists(str(f))
    data = json.loads(f.read_text(encoding="utf-8"))
    assert "admin" in data["users"] and "wangxutong" in data["users"]
    assert data["users"]["admin"]["isSuper"] is True
    raw = f.read_text(encoding="utf-8")
    assert "wxtnb" not in raw and "niubi" not in raw      # 明文不落盘
    u = auth.authenticate("admin", "wxtnb")
    assert u is not None and u["account"] == "admin" and u["isSuper"] is True
    assert "salt" not in u and "hash" not in u            # public_user 无哈希材料
    assert auth.authenticate("admin", "wrong") is None
    assert auth.authenticate("nobody", "x") is None
    assert auth.authenticate("wangxutong", "niubi") is not None
    assert auth.seed_default_accounts() is False           # 已存在不覆盖


def test_sessions(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    t = auth.create_session("admin")
    assert auth.validate_session(t) == "admin"
    assert auth.validate_session("bad") is None
    assert auth.validate_session(None) is None
    auth.destroy_session(t)
    assert auth.validate_session(t) is None


def test_session_expiry(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    t = auth.create_session("admin")
    auth._sessions[t]["expiry"] = time.time() - 1
    assert auth.validate_session(t) is None


def test_cookie_helpers(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    assert auth.parse_cookie_token("a=1; pmp_session=abc123; b=2") == "abc123"
    assert auth.parse_cookie_token("a=1; b=2") is None
    assert auth.parse_cookie_token(None) is None
    assert auth.parse_cookie_token("") is None
    sc = auth.build_set_cookie("xyz")
    assert "pmp_session=xyz" in sc
    assert "HttpOnly" in sc
    assert "SameSite=Lax" in sc
    assert "Path=/" in sc
    cc = auth.build_clear_cookie()
    assert "Max-Age=0" in cc
    assert "HttpOnly" in cc
    assert "SameSite=Lax" in cc
