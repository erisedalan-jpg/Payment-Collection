import pytest
import auth


def _accounts():
    return {"version": 1, "users": {}}


def test_effective_scope_three_tier():
    rec = {"allowedL4": ["D0"], "allowedStaff": ["E0"],
           "domainScopes": {"project": {"l4": ["Ddom"], "staff": []}},
           "pageScopes": {"temp-followup": {"l4": ["Dpage"], "staff": []}}}
    assert auth.effective_scope(rec, "project", "temp-followup") == (["Dpage"], [])   # 页覆盖
    assert auth.effective_scope(rec, "project", "projects") == (["Ddom"], [])          # 域覆盖
    assert auth.effective_scope(rec, "yitian", "yitian") == (["D0"], ["E0"])           # 默认
    assert auth.effective_scope(rec, "project") == (["Ddom"], [])                      # 不传页=Phase2 兼容


def test_effective_scope_explicit_empty_page():
    rec = {"allowedL4": ["*"], "allowedStaff": [], "pageScopes": {"projects": {"l4": [], "staff": []}}}
    assert auth.effective_scope(rec, "project", "projects") == ([], [])
    assert auth.effective_scope(rec, "project", "overview") == (["*"], [])


def test_domain_union_scope():
    rec = {"allowedL4": ["D0"], "allowedStaff": [],
           "pageScopes": {"projects": {"l4": ["Da"], "staff": ["E1"]},
                          "payment": {"l4": ["Db"], "staff": []}}}
    # overview 无覆盖→默认 D0;projects→Da+E1;payment→Db;并集
    l4, staff = auth.domain_union_scope(rec, "project", ["overview", "projects", "payment"])
    assert set(l4) == {"D0", "Da", "Db"} and set(staff) == {"E1"}


def test_domain_union_star_short_circuit():
    rec = {"allowedL4": ["*"], "allowedStaff": []}
    assert auth.domain_union_scope(rec, "project", ["overview", "projects"]) == (["*"], [])


def test_create_with_page_scopes_and_public():
    a = auth.create_account(_accounts(), "u", "pw", "U", ["*"], ["*"], [], None,
                            {"temp-followup": {"l4": ["Dx"], "staff": []}})
    rec = a["users"]["u"]
    assert rec["pageScopes"] == {"temp-followup": {"l4": ["Dx"], "staff": []}}
    assert auth.public_user("u", rec)["pageScopes"] == {"temp-followup": {"l4": ["Dx"], "staff": []}}


def test_page_scopes_defaults_and_migration():
    a = auth.create_account(_accounts(), "u", "pw", "U", ["*"], ["*"], [])
    assert a["users"]["u"]["pageScopes"] == {}
    rec = {"displayName": "x", "isSuper": False, "allowedPages": [], "allowedL4": []}
    assert auth.public_user("x", rec)["pageScopes"] == {}


def test_page_scopes_validation():
    with pytest.raises(ValueError):    # 未知 pageKey
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [], None, {"nope": {"l4": [], "staff": []}})
    with pytest.raises(ValueError):    # 值非 dict
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [], None, {"projects": ["D"]})


def test_opportunity_page_staff_cleared():
    a = auth.create_account(_accounts(), "x", "pw", "x", [], [], [], None,
                            {"opportunities-progress": {"l4": ["D1"], "staff": ["E1"]}})
    assert a["users"]["x"]["pageScopes"]["opportunities-progress"] == {"l4": ["D1"], "staff": []}


def test_update_page_scopes_none_keeps():
    a = auth.create_account(_accounts(), "u", "pw", "U", ["*"], ["*"], [], None,
                            {"projects": {"l4": ["D1"], "staff": []}})
    a = auth.update_account(a, "u", display_name="新")
    assert a["users"]["u"]["pageScopes"] == {"projects": {"l4": ["D1"], "staff": []}}
    a = auth.update_account(a, "u", page_scopes={"payment": {"l4": ["D2"], "staff": []}})
    assert a["users"]["u"]["pageScopes"] == {"payment": {"l4": ["D2"], "staff": []}}
