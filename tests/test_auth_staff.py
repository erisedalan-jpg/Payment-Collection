import pytest
import auth


def _accounts():
    return {"version": 1, "users": {}}


def test_create_with_staff_persists_and_public():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["yitian"], ["D1"], ["E001", "E002"])
    rec = a["users"]["liu"]
    assert rec["allowedStaff"] == ["E001", "E002"]
    pub = auth.public_user("liu", rec)
    assert pub["allowedStaff"] == ["E001", "E002"]
    assert "salt" not in pub and "hash" not in pub


def test_create_staff_defaults_empty():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["yitian"], ["D1"])
    assert a["users"]["liu"]["allowedStaff"] == []


def test_public_user_migration_default():
    # 旧账号无 allowedStaff 字段 → public_user 返 []
    rec = {"displayName": "x", "isSuper": False, "allowedPages": [], "allowedL4": []}
    assert auth.public_user("x", rec)["allowedStaff"] == []


def test_update_staff_and_none_keeps():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["yitian"], ["D1"], ["E001"])
    a = auth.update_account(a, "liu", staff=["E009"])
    assert a["users"]["liu"]["allowedStaff"] == ["E009"]
    a = auth.update_account(a, "liu", display_name="新名")   # staff=None 不改
    assert a["users"]["liu"]["allowedStaff"] == ["E009"]


def test_staff_validation_dedup_and_type():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", [], [], ["E1", "E1", "E2"])
    assert a["users"]["liu"]["allowedStaff"] == ["E1", "E2"]
    with pytest.raises(ValueError):
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [123])
