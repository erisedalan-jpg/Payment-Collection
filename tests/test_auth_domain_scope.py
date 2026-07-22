import pytest
import auth


def _accounts():
    return {"version": 1, "users": {}}


def test_effective_scope_fallback_to_default():
    rec = {"allowedL4": ["D1"], "allowedStaff": ["E1"]}
    assert auth.effective_scope(rec, "project") == (["D1"], ["E1"])
    assert auth.effective_scope(rec, "yitian") == (["D1"], ["E1"])
    assert auth.effective_scope(rec, "opportunity") == (["D1"], ["E1"])


def test_effective_scope_override_wins():
    rec = {"allowedL4": ["*"], "allowedStaff": [],
           "domainScopes": {"yitian": {"l4": ["Dx"], "staff": ["E9"]}}}
    assert auth.effective_scope(rec, "project") == (["*"], [])       # 缺省回退默认
    assert auth.effective_scope(rec, "yitian") == (["Dx"], ["E9"])   # 覆盖生效


def test_effective_scope_explicit_empty_sees_nothing():
    rec = {"allowedL4": ["*"], "allowedStaff": [],
           "domainScopes": {"project": {"l4": [], "staff": []}}}
    assert auth.effective_scope(rec, "project") == ([], [])          # 显式空≠缺省


def test_create_with_domain_scopes_and_public():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["*"], ["*"], [],
                            {"yitian": {"l4": ["Dx"], "staff": ["E1"]}})
    rec = a["users"]["liu"]
    assert rec["domainScopes"] == {"yitian": {"l4": ["Dx"], "staff": ["E1"]}}
    assert auth.public_user("liu", rec)["domainScopes"] == {"yitian": {"l4": ["Dx"], "staff": ["E1"]}}


def test_domain_scopes_defaults_empty_and_migration():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["*"], ["*"], [])
    assert a["users"]["liu"]["domainScopes"] == {}
    rec = {"displayName": "x", "isSuper": False, "allowedPages": [], "allowedL4": []}
    assert auth.public_user("x", rec)["domainScopes"] == {}          # 旧账号迁移默认


def test_update_domain_scopes_and_none_keeps():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["*"], ["*"], [],
                            {"project": {"l4": ["D1"], "staff": []}})
    a = auth.update_account(a, "liu", domain_scopes={"yitian": {"l4": ["Dy"], "staff": []}})
    assert a["users"]["liu"]["domainScopes"] == {"yitian": {"l4": ["Dy"], "staff": []}}
    a = auth.update_account(a, "liu", display_name="新名")   # domain_scopes=None 不改
    assert a["users"]["liu"]["domainScopes"] == {"yitian": {"l4": ["Dy"], "staff": []}}


def test_domain_scopes_validation():
    with pytest.raises(ValueError):     # 未知域键
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [], {"bogus": {"l4": [], "staff": []}})
    with pytest.raises(ValueError):     # 域值非 dict
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [], {"project": ["D1"]})


def test_opportunity_staff_forced_empty():
    a = auth.create_account(_accounts(), "x", "pw", "x", [], [], [],
                            {"opportunity": {"l4": ["D1"], "staff": ["E1"]}})
    assert a["users"]["x"]["domainScopes"]["opportunity"] == {"l4": ["D1"], "staff": []}
