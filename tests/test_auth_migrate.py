import time
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


# -- migrate_accounts_file(IO 包装):本分支唯一会改写生产 accounts.json 的代码路径,每次
# 服务启动都跑,以下补齐落盘行为(备份/幂等/no-op)的测试覆盖 --

def _account_with_domain_scope(pages: list) -> dict:
    """单账号 fixture:非超管、project 域有一条非空覆盖,allowedPages 由调用方指定
    (决定该域是否至少有一页可访问,即是否触发 migrate_domain_scopes 的「账号进不去的页不落」分支)。"""
    salt = "s"
    return {"version": 1, "users": {"u": {
        "salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
        "displayName": "u", "allowedPages": pages, "allowedL4": ["*"], "allowedStaff": [],
        "domainScopes": {"project": {"l4": ["D1"], "staff": []}}, "pageScopes": {}}}}


def test_migrate_accounts_file_backs_up_and_rewrites_when_domain_scope_present(tmp_path, monkeypatch):
    f = tmp_path / "accounts.json"
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(f))
    auth.save_accounts(_account_with_domain_scope(["projects"]))
    changed, materialized, unmaterialized = auth.migrate_accounts_file()
    assert (changed, materialized, unmaterialized) == (1, 1, 0)
    stamp = time.strftime("%Y%m%d")
    bak = tmp_path / f"accounts.json.bak-{stamp}"
    assert bak.exists()
    assert "domainScopes" in bak.read_text(encoding="utf-8")   # 备份是迁移前的原始快照
    rec = auth.load_accounts()["users"]["u"]
    assert "domainScopes" not in rec                            # 正文确实被改写
    assert rec["pageScopes"]["projects"] == {"l4": ["D1"], "staff": []}


def test_migrate_accounts_file_does_not_overwrite_existing_same_day_backup(tmp_path, monkeypatch):
    f = tmp_path / "accounts.json"
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(f))
    auth.save_accounts(_account_with_domain_scope(["projects"]))
    stamp = time.strftime("%Y%m%d")
    bak = tmp_path / f"accounts.json.bak-{stamp}"
    bak.write_text("PRESERVE_ME", encoding="utf-8")             # 假装当日已有一份备份
    auth.migrate_accounts_file()
    assert bak.read_text(encoding="utf-8") == "PRESERVE_ME"      # 已存在的当日备份不被覆盖
    assert "domainScopes" not in auth.load_accounts()["users"]["u"]  # 但正文照常被改写


def test_migrate_accounts_file_second_run_is_idempotent_no_new_backup(tmp_path, monkeypatch):
    f = tmp_path / "accounts.json"
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(f))
    auth.save_accounts(_account_with_domain_scope(["projects"]))
    auth.migrate_accounts_file()
    backups_once = list(tmp_path.glob("accounts.json.bak-*"))
    assert len(backups_once) == 1
    changed2, materialized2, unmaterialized2 = auth.migrate_accounts_file()
    assert (changed2, materialized2, unmaterialized2) == (0, 0, 0)   # 二次运行:字段已删,无改动
    assert list(tmp_path.glob("accounts.json.bak-*")) == backups_once  # 未新增备份


def test_migrate_accounts_file_no_domain_scopes_field_is_pure_noop(tmp_path, monkeypatch):
    f = tmp_path / "accounts.json"
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(f))
    auth.save_accounts({"version": 1, "users": {"u": {
        "salt": "s", "hash": auth.hash_password("p", "s"), "isSuper": False,
        "displayName": "u", "allowedPages": ["projects"], "allowedL4": ["*"], "allowedStaff": [],
        "pageScopes": {}}}})
    before = f.read_bytes()
    changed, materialized, unmaterialized = auth.migrate_accounts_file()
    assert (changed, materialized, unmaterialized) == (0, 0, 0)
    assert f.read_bytes() == before                              # 文件字节未变,未被重写
    assert list(tmp_path.glob("accounts.json.bak-*")) == []       # 未建任何备份


def test_migrate_accounts_file_zero_accessible_pages_is_known_gap_recorded_not_fixed(tmp_path, monkeypatch):
    """记录性测试(非期望行为的断言,而是钉住已知缺口不被误当作已修复):
    账号有 project 域覆盖,但 allowedPages 为空 —— 该域一页都进不去,域范围无处物化。
    见 auth.migrate_domain_scopes 文档「已知缺口」与 PROGRESS backlog L-35:
    domain_union_scope 的空 page_keys 分支会回退默认范围、可能比原域覆盖更宽,
    本次修复只做「如实报告」(unmaterialized 计数 + server.py 启动 warning),不改这条行为。"""
    f = tmp_path / "accounts.json"
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(f))
    auth.save_accounts(_account_with_domain_scope([]))   # allowedPages=[] → 锁定账号,该域零可访问页
    changed, materialized, unmaterialized = auth.migrate_accounts_file()
    assert (changed, materialized, unmaterialized) == (1, 0, 1)
    assert auth.load_accounts()["users"]["u"]["pageScopes"] == {}   # 域范围确实一条都没落地
