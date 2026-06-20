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
    assert auth.seed_default_accounts() is False           # 已存在且无缺失→不动


def test_seed_reconciles_missing_super(tmp_path, monkeypatch):
    """已存在的账号库缺某个种子超管时,再次 seed 应补齐(不动既有账号/密码/权限)。"""
    f = _fresh(tmp_path, monkeypatch)
    assert auth.seed_default_accounts() is True
    # 删掉一个种子超管,模拟新增配置超管前的旧库
    data = auth.load_accounts()
    removed = auth._SEED_SUPERS[-1][0]
    data["users"].pop(removed)
    # 改一个既有超管的显示名,验证 reconcile 不覆盖既有
    data["users"]["admin"]["displayName"] = "改过的名字"
    auth.save_accounts(data)
    assert removed not in auth.load_accounts()["users"]
    # 再次 seed:补回缺失的,返回 True;既有不动
    assert auth.seed_default_accounts() is True
    after = auth.load_accounts()["users"]
    assert removed in after and after[removed]["isSuper"] is True
    assert after["admin"]["displayName"] == "改过的名字"   # 既有账号未被覆盖
    assert auth.seed_default_accounts() is False            # 再次无缺失


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
