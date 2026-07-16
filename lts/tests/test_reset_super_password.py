"""部署期口令重置助手测试。超管口令无法经 /admin UI 改,部署上线前须用本助手改掉种子弱口令。"""
import pytest
import auth
import reset_super_password as rsp


def test_reset_password_updates_hash(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth.seed_default_accounts()              # 建种子超管 admin/admin123!
    assert auth.authenticate("admin", "admin123!") is not None
    rsp.reset_password("admin", "NewStr0ngPass!")
    # 旧口令失效、新口令生效;盐已轮换
    assert auth.authenticate("admin", "admin123!") is None
    assert auth.authenticate("admin", "NewStr0ngPass!") is not None


def test_reset_preserves_other_fields(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth.seed_default_accounts()
    rsp.reset_password("admin", "AnotherPass9")
    rec = auth.load_accounts()["users"]["admin"]
    assert rec["isSuper"] is True
    assert rec["allowedL4"] == ["*"]


def test_reset_unknown_account_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth.seed_default_accounts()
    with pytest.raises(KeyError):
        rsp.reset_password("does_not_exist", "x123456")


def test_reset_invalid_password_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth.seed_default_accounts()
    with pytest.raises(ValueError):
        rsp.reset_password("admin", "")        # 空口令非法
