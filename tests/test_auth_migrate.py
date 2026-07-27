import auth
import config


def _legacy_effective_scope(rec, domain, page_key=None):
    """V4.5.2 前的三层解析,仅供迁移等价性对拍。不得引用生产代码(它已被改)。"""
    if page_key is not None:
        ps = (rec.get('pageScopes') or {}).get(page_key)
        if isinstance(ps, dict):
            return list(ps.get('l4', []) or []), list(ps.get('staff', []) or [])
    ds = (rec.get('domainScopes') or {}).get(domain)
    if isinstance(ds, dict):
        return list(ds.get('l4', []) or []), list(ds.get('staff', []) or [])
    return list(rec.get('allowedL4', []) or []), list(rec.get('allowedStaff', []) or [])


def test_migrate_empty_domain_scopes_only_drops_field():
    a = {"version": 1, "users": {"u": {
        "isSuper": False, "allowedPages": ["*"], "allowedL4": ["D1"],
        "allowedStaff": [], "domainScopes": {}, "pageScopes": {}}}}
    out, changed = auth.migrate_domain_scopes(a)
    assert changed == 1
    assert "domainScopes" not in out["users"]["u"]
    assert out["users"]["u"]["pageScopes"] == {}
    assert a["users"]["u"]["domainScopes"] == {}          # 不改入参


def test_migrate_is_idempotent():
    a = {"version": 1, "users": {"u": {
        "isSuper": False, "allowedPages": ["*"], "allowedL4": ["D1"],
        "allowedStaff": [], "domainScopes": {"yitian": {"l4": ["Dy"], "staff": []}}}}}
    once, c1 = auth.migrate_domain_scopes(a)
    twice, c2 = auth.migrate_domain_scopes(once)
    assert c1 == 1 and c2 == 0
    assert once["users"]["u"] == twice["users"]["u"]


def test_migrate_materializes_and_preserves_every_page_scope():
    """承重:迁移前的三层解析 == 迁移后的两层解析,逐页比对。"""
    rec = {"isSuper": False, "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": ["E0"],
           "domainScopes": {"project": {"l4": ["Dp"], "staff": ["E1"]},
                            "yitian": {"l4": ["Dy"], "staff": ["E2"]}},
           "pageScopes": {"projects": {"l4": ["Dkeep"], "staff": []}}}
    a = {"version": 1, "users": {"u": dict(rec)}}
    out, _ = auth.migrate_domain_scopes(a)
    new_rec = out["users"]["u"]
    for page, dom in config.PAGE_DOMAINS.items():
        assert _legacy_effective_scope(rec, dom, page) == auth.effective_scope(new_rec, page), page


def test_migrate_does_not_overwrite_existing_page_scope():
    a = {"version": 1, "users": {"u": {
        "isSuper": False, "allowedPages": ["*"], "allowedL4": [], "allowedStaff": [],
        "domainScopes": {"project": {"l4": ["Ddom"], "staff": []}},
        "pageScopes": {"projects": {"l4": ["Dpage"], "staff": []}}}}}
    out, _ = auth.migrate_domain_scopes(a)
    assert out["users"]["u"]["pageScopes"]["projects"] == {"l4": ["Dpage"], "staff": []}


def test_migrate_skips_pages_account_cannot_access():
    """账号进不去的页不落 pageScopes —— 否则配置里堆一堆无意义条目。"""
    a = {"version": 1, "users": {"u": {
        "isSuper": False, "allowedPages": ["projects", "yitian"], "allowedL4": [], "allowedStaff": [],
        "domainScopes": {"project": {"l4": ["Dp"], "staff": []}}}}}
    out, _ = auth.migrate_domain_scopes(a)
    ps = out["users"]["u"]["pageScopes"]
    assert "projects" in ps
    assert "overview" not in ps and "activity" not in ps


def test_migrate_super_only_drops_field():
    a = {"version": 1, "users": {"boss": {
        "isSuper": True, "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
        "domainScopes": {"project": {"l4": ["Dp"], "staff": []}}, "pageScopes": {}}}}
    out, _ = auth.migrate_domain_scopes(a)
    assert "domainScopes" not in out["users"]["boss"]
    assert out["users"]["boss"]["pageScopes"] == {}       # 超管短路,不物化
