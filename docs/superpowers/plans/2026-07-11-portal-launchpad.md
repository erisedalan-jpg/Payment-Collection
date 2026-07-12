# 首页门户 / 快捷入口（Launchpad）Implementation Plan · V2.10.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首页顶部新增一套由超管在 /data 配置的门户（Launchpad）——url 跳转 + 文件下载两类项，支持分组/排序/置顶，并按账号设可见范围；普通账号只读展示后端已按其账号过滤的可见项。

**Architecture:** 后端新增纯函数模块 `portal.py`（校验/可见性/文件名）+ `server.py` 4 端点（GET config 按账号过滤 / POST config 超管整存 / POST upload 超管 / GET download 强制下载再校验可见性）+ `data/portal_links.json`（原子写+RLock，仿 project_tags）+ `data/portal_files/`（上传文件）。前端新增 `lib/portal.ts`（纯函数）+ `stores/portal.ts` + `PortalLaunchpad.vue`（首页）+ `PortalConfigCard.vue`/`PortalItemEditDialog.vue`（/data 超管）。首页 OverviewView 顶部内嵌，/data 并入 `dv-maint` 折叠区。

**Tech Stack:** Python 标准库（`http.server`）；Vue3 `<script setup lang=ts>` + Pinia + Element Plus + Vite；pytest + vitest(@vue/test-utils)。

## Global Constraints

- **版本**：Y 级 **V2.10.0**，`RELEASE_DATE = '2026-07-11'`（`frontend/src/version.ts` 单一来源）。**无新增路由/pageKey/授权**（首页在 `/`、配置在 `/data`，均现成）。
- **路径**：所有可写数据基于 `BASE_DIR`（`server.py:80-85` 已按 frozen 分支）——`PORTAL_LINKS_FILE = os.path.join(BASE_DIR,'data','portal_links.json')`、`PORTAL_FILES_DIR = os.path.join(BASE_DIR,'data','portal_files')`。**绝不用** `STATIC_DIR`/`sys._MEIPASS`。因全部派生自 `BASE_DIR` 且无 subprocess，**无需单独维护 frozen 代码分支**。
- **鉴权**：`GET /api/portal/config`、`GET /api/portal/download` 仅需登录（**不**入 `_SUPER_ONLY_PATHS`——否则 config 的 GET 也会被超管闸拦掉）；`POST /api/portal/config` 用 handler 首行 `if self._require_super() is None: return` 守（GET 共用该 path，不能进 `_SUPER_ONLY_PATHS`）；`POST /api/portal/upload` 加入 `_SUPER_ONLY_PATHS`（POST-only）。
- **可见性双重强制**：列表端点对非超管**不返回**越权项（连 name/url/文件名都不出现）；下载端点**独立**再校验 `item_visible_to`。越权/不存在/文件缺失一律 **404**（防探测）。
- **URL scheme 白名单**：仅 `http/https`（存储 `validate_portal_config` + 前端渲染 `isSafeUrl` 双校验）；url 项渲染 `target="_blank" rel="noopener noreferrer"`。
- **下载路径消毒**：只在 `PORTAL_FILES_DIR` 内取，`os.path.basename` 消毒；`storedName` 校验拒绝含 `/`、`\`、`..`、`\x00`。
- **上传上限**：`PORTAL_MAX_UPLOAD = 200*1024*1024`（单文件 200MB）。
- **审计**：`audit._ACTION_MAP` 注册 `('POST','/api/portal/config')` 与 `('POST','/api/portal/upload')`。
- **设计令牌**：前端只引用 `frontend/src/styles/theme.css` 令牌（色块用 `--chart-1..8`），**不手写散值、不加外链字体、不用 emoji 装饰 UI**（门户项的 `emoji` 字段是**用户数据**，不受此限）。金额挂 `.u-num`。
- **提交尾注**：每次 commit 结尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **验证**：完成后 `bash verify.sh` 全绿。

**数据契约（跨任务共享，逐字一致）**：
```
item   = {id:str(pl_+12hex), type:'url'|'file', name:str(1-60), group:str(∈groups),
          emoji:str(0-8), featured:bool, url:str(http/https,type=url), file:null|FileRef, visibility:Vis}
FileRef= {storedName:str, originalName:str, size:int>=0}
Vis    = {mode:'all'} | {mode:'accounts', accounts:str[]}
config = {version:1, groups:str[], items:item[]}
GET  /api/portal/config   -> {success, config}       (超管全量;普通账号 visible_for_account 过滤)
POST /api/portal/config   -> {success, config}       (超管;整存+清孤儿)
POST /api/portal/upload?name=<原名> (裸字节 body) -> {success, file:FileRef}   (超管;≤200MB)
GET  /api/portal/download?id=<itemId> -> 二进制附件   (登录;再校验可见性;404 防探测)
```

---

### Task 1: 后端纯函数模块 `portal.py`

**Files:**
- Create: `portal.py`
- Test: `tests/test_portal.py`

**Interfaces:**
- Consumes: 无（纯标准库）。
- Produces: `validate_portal_config(raw)->dict`（非法抛 `ValueError`）、`is_safe_url(url)->bool`、`sanitize_stored_name(name)->str`、`item_visible_to(item,account,is_super=False)->bool`、`visible_for_account(config,account)->dict`、`orphan_files(config,existing_names)->list`、`content_disposition(filename)->str`、`new_file_token()->str`、`empty_config()->dict`。

- [ ] **Step 1: Write the failing test**

Create `tests/test_portal.py`:
```python
import portal
import pytest


def _item(**over):
    base = {'id': 'pl_' + '0' * 12, 'type': 'url', 'name': '入口', 'group': 'G',
            'emoji': '', 'featured': False, 'url': 'https://x.com', 'file': None,
            'visibility': {'mode': 'all'}}
    base.update(over)
    return base


def _cfg(items, groups=('G',)):
    return {'version': 1, 'groups': list(groups), 'items': items}


def test_is_safe_url():
    assert portal.is_safe_url('https://a.com') is True
    assert portal.is_safe_url('http://a.com') is True
    assert portal.is_safe_url('javascript:alert(1)') is False
    assert portal.is_safe_url('data:text/html,x') is False
    assert portal.is_safe_url('') is False


def test_sanitize_stored_name_strips_path():
    assert portal.sanitize_stored_name('../../etc/passwd') == 'passwd'
    assert portal.sanitize_stored_name('a\\b\\c.xlsx') == 'c.xlsx'
    assert portal.sanitize_stored_name('') == 'file'


def test_validate_ok_url_item():
    out = portal.validate_portal_config(_cfg([_item()]))
    assert out['groups'] == ['G']
    assert out['items'][0]['type'] == 'url'
    assert out['items'][0]['file'] is None


def test_validate_ok_file_item():
    it = _item(type='file', url='', file={'storedName': 'pf_x__a.xlsx', 'originalName': 'a.xlsx', 'size': 10})
    out = portal.validate_portal_config(_cfg([it]))
    assert out['items'][0]['file']['storedName'] == 'pf_x__a.xlsx'
    assert out['items'][0]['url'] == ''


def test_validate_rejects_bad_scheme():
    with pytest.raises(ValueError):
        portal.validate_portal_config(_cfg([_item(url='javascript:1')]))


def test_validate_rejects_group_not_in_groups():
    with pytest.raises(ValueError):
        portal.validate_portal_config(_cfg([_item(group='OTHER')]))


def test_validate_rejects_stored_name_traversal():
    it = _item(type='file', url='', file={'storedName': '../evil', 'originalName': 'a', 'size': 1})
    with pytest.raises(ValueError):
        portal.validate_portal_config(_cfg([it]))


def test_validate_rejects_dup_id():
    with pytest.raises(ValueError):
        portal.validate_portal_config(_cfg([_item(), _item()]))


def test_item_visible_to():
    pub = _item(visibility={'mode': 'all'})
    priv = _item(visibility={'mode': 'accounts', 'accounts': ['zhangsan']})
    assert portal.item_visible_to(pub, 'anyone') is True
    assert portal.item_visible_to(priv, 'zhangsan') is True
    assert portal.item_visible_to(priv, 'lisi') is False
    assert portal.item_visible_to(priv, 'lisi', is_super=True) is True


def test_visible_for_account_filters_and_shrinks_groups():
    a = _item(id='pl_' + 'a' * 12, group='G', visibility={'mode': 'all'})
    b = _item(id='pl_' + 'b' * 12, group='H', visibility={'mode': 'accounts', 'accounts': ['zhangsan']})
    cfg = _cfg([a, b], groups=('G', 'H'))
    out = portal.visible_for_account(cfg, 'lisi')
    assert [it['id'] for it in out['items']] == ['pl_' + 'a' * 12]
    assert out['groups'] == ['G']   # H 无可见项被收敛


def test_orphan_files():
    it = _item(id='pl_' + 'a' * 12, type='file', url='', file={'storedName': 'pf_keep__a', 'originalName': 'a', 'size': 1})
    cfg = _cfg([it])
    assert portal.orphan_files(cfg, ['pf_keep__a', 'pf_orphan__b']) == ['pf_orphan__b']


def test_content_disposition_rfc5987_chinese():
    d = portal.content_disposition('周报模板.xlsx')
    assert d.startswith('attachment;')
    assert "filename*=UTF-8''" in d
    assert '%E5' in d  # 中文被百分号编码


def test_new_file_token_prefix():
    t = portal.new_file_token()
    assert t.startswith('pf_') and len(t) >= 9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_portal.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'portal'`）

- [ ] **Step 3: Write minimal implementation**

Create `portal.py`:
```python
"""首页门户/快捷入口(Launchpad)纯函数:配置校验 + 可见性过滤 + 文件名消毒 + 下载头。
纯标准库,不依赖 server(server 单向依赖 portal),便于 pytest。
data/portal_links.json 为本地配置;data/portal_files/ 存超管上传的可下载文件。"""
from __future__ import annotations

import re
import secrets
from urllib.parse import urlparse, quote

MAX_GROUPS = 50
MAX_ITEMS = 200
NAME_MAX = 60
EMOJI_MAX = 8
_ID_RE = re.compile(r'^pl_[A-Za-z0-9]{6,32}$')
_ILLEGAL_STORED = ('/', '\\', '..', '\x00')


def empty_config() -> dict:
    return {'version': 1, 'groups': [], 'items': []}


def new_file_token() -> str:
    """上传文件 storedName 的唯一前缀(与 item.id 无关)。"""
    return 'pf_' + secrets.token_hex(6)


def is_safe_url(url: str) -> bool:
    """仅 http/https 视为安全(挡 javascript:/data: 等点击 XSS)。"""
    try:
        return urlparse(url).scheme in ('http', 'https')
    except Exception:
        return False


def sanitize_stored_name(name: str) -> str:
    """取 basename + 去路径分隔/控制符;空则占位 'file'。用于 storedName 的原名部分。"""
    base = (name or '').replace('\\', '/').split('/')[-1]
    base = base.replace('\x00', '')
    base = re.sub(r'[\r\n\t]', '', base).strip()
    return base or 'file'


def _valid_stored_name(name) -> bool:
    return bool(name) and isinstance(name, str) and not any(bad in name for bad in _ILLEGAL_STORED)


def item_visible_to(item: dict, account: str, is_super: bool = False) -> bool:
    if is_super:
        return True
    vis = item.get('visibility') or {}
    if vis.get('mode') == 'all':
        return True
    if vis.get('mode') == 'accounts':
        return account in (vis.get('accounts') or [])
    return False


def visible_for_account(config: dict, account: str) -> dict:
    """非超管视图:仅保留 visibility 命中该账号的 items,groups 收敛到仍有可见项的组。"""
    items = [it for it in config.get('items', []) if item_visible_to(it, account)]
    live = {it.get('group') for it in items}
    groups = [g for g in config.get('groups', []) if g in live]
    return {'version': config.get('version', 1), 'groups': groups, 'items': items}


def orphan_files(config: dict, existing_names: list) -> list:
    """existing_names 中不再被任何 file 项引用的文件名(可删)。"""
    ref = {(it.get('file') or {}).get('storedName')
           for it in config.get('items', []) if it.get('type') == 'file'}
    ref.discard(None)
    return [n for n in existing_names if n not in ref]


def content_disposition(filename: str) -> str:
    """RFC 5987:ascii 回退 filename= + UTF-8 filename*=,支持中文名下载。"""
    fallback = re.sub(r'[^A-Za-z0-9._-]', '_', filename) or 'download'
    return "attachment; filename=\"%s\"; filename*=UTF-8''%s" % (fallback, quote(filename, safe=''))


def _validate_visibility(vis) -> dict:
    if not isinstance(vis, dict):
        raise ValueError('visibility 须为对象')
    mode = vis.get('mode')
    if mode == 'all':
        return {'mode': 'all'}
    if mode == 'accounts':
        accounts = vis.get('accounts')
        if not isinstance(accounts, list) or not all(isinstance(a, str) for a in accounts):
            raise ValueError('visibility.accounts 须为字符串数组')
        return {'mode': 'accounts', 'accounts': list(dict.fromkeys(accounts))}
    raise ValueError('visibility.mode 须为 all 或 accounts')


def _validate_file(f) -> dict:
    if not isinstance(f, dict):
        raise ValueError('file 须为对象')
    stored, orig, size = f.get('storedName'), f.get('originalName'), f.get('size')
    if not _valid_stored_name(stored):
        raise ValueError('file.storedName 非法')
    if not isinstance(orig, str) or not orig:
        raise ValueError('file.originalName 须为非空字符串')
    if not isinstance(size, int) or isinstance(size, bool) or size < 0:
        raise ValueError('file.size 须为非负整数')
    return {'storedName': stored, 'originalName': orig, 'size': size}


def _validate_item(raw, groups) -> dict:
    if not isinstance(raw, dict):
        raise ValueError('item 须为对象')
    iid = raw.get('id')
    if not (isinstance(iid, str) and _ID_RE.match(iid)):
        raise ValueError('item.id 非法')
    typ = raw.get('type')
    if typ not in ('url', 'file'):
        raise ValueError('item.type 须为 url 或 file')
    name = raw.get('name')
    if not isinstance(name, str) or not (1 <= len(name) <= NAME_MAX):
        raise ValueError('item.name 须为 1-%d 字符' % NAME_MAX)
    if raw.get('group') not in groups:
        raise ValueError('item.group 不在 groups 内')
    emoji = raw.get('emoji', '')
    if not isinstance(emoji, str) or len(emoji) > EMOJI_MAX:
        raise ValueError('item.emoji 非法')
    out = {'id': iid, 'type': typ, 'name': name, 'group': raw['group'],
           'emoji': emoji, 'featured': bool(raw.get('featured', False)),
           'visibility': _validate_visibility(raw.get('visibility'))}
    if typ == 'url':
        url = raw.get('url', '')
        if not isinstance(url, str) or not is_safe_url(url):
            raise ValueError('item.url 须为 http/https')
        out['url'], out['file'] = url, None
    else:
        out['url'], out['file'] = '', _validate_file(raw.get('file'))
    return out


def validate_portal_config(raw) -> dict:
    """校验整份配置;非法抛 ValueError。返回规范化 {version:1, groups, items}。"""
    if not isinstance(raw, dict):
        raise ValueError('配置须为对象')
    groups_raw = raw.get('groups', [])
    if not isinstance(groups_raw, list) or not all(isinstance(g, str) and g for g in groups_raw):
        raise ValueError('groups 须为非空字符串数组')
    groups = list(dict.fromkeys(groups_raw))
    if len(groups) > MAX_GROUPS:
        raise ValueError('分组过多(上限 %d)' % MAX_GROUPS)
    items_raw = raw.get('items', [])
    if not isinstance(items_raw, list):
        raise ValueError('items 须为数组')
    if len(items_raw) > MAX_ITEMS:
        raise ValueError('门户项过多(上限 %d)' % MAX_ITEMS)
    seen, items = set(), []
    for r in items_raw:
        it = _validate_item(r, groups)
        if it['id'] in seen:
            raise ValueError('item.id 重复: %s' % it['id'])
        seen.add(it['id'])
        items.append(it)
    return {'version': 1, 'groups': groups, 'items': items}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_portal.py -q`
Expected: PASS（13 passed）

- [ ] **Step 5: Commit**

```bash
git add portal.py tests/test_portal.py
git commit -m "feat(portal): 门户纯函数模块(校验/可见性/文件名/下载头)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 后端端点 + 审计（`server.py` + `audit.py`）

**Files:**
- Modify: `server.py`（import portal；常量与 load/save；4 handlers；`_dispatch_get`/`_dispatch_post` 路由；`_SUPER_ONLY_PATHS` 加 upload）
- Modify: `audit.py:76`（`_ACTION_MAP` 加两行）
- Test: `tests/test_server_portal.py`

**Interfaces:**
- Consumes: `portal.*`（Task 1）；`server` 既有 `_atomic_write_json`、`_require_super`、`_read_json_body`、`_read_body_bytes`、`_json_response`、`_send_json`、`_audit_set`、`_error_payload`、`auth.*`。
- Produces: 端点 `GET/POST /api/portal/config`、`POST /api/portal/upload`、`GET /api/portal/download`；模块级 `PORTAL_LINKS_FILE`、`PORTAL_FILES_DIR`、`PORTAL_MAX_UPLOAD`、`_load_portal_config`、`_save_portal_config`。

- [ ] **Step 1: Write the failing test**

Create `tests/test_server_portal.py`:
```python
import json
import http.client
import threading
import auth
import portal
import server


def _write_accounts(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "super": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
                  "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"},
        "u1": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
               "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "普通"},
    }})


def _isolate_portal(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "PORTAL_LINKS_FILE", str(tmp_path / "portal_links.json"))
    monkeypatch.setattr(server, "PORTAL_FILES_DIR", str(tmp_path / "portal_files"))


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    return conn, cookie


def _req(conn, method, path, cookie, body=None, ctype="application/json"):
    headers = {"Cookie": cookie}
    if body is not None:
        headers["Content-Type"] = ctype
    conn.request(method, path, body, headers)
    r = conn.getresponse()
    data = r.read()
    return r, data


def _mk_url_item(iid, group, vis):
    return {"id": iid, "type": "url", "name": iid, "group": group, "emoji": "",
            "featured": False, "url": "https://x.com", "file": None, "visibility": vis}


def _serve(monkeypatch, tmp_path):
    _write_accounts(tmp_path, monkeypatch)
    _isolate_portal(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def test_get_config_filters_for_normal_user(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "super")
        cfg = {"version": 1, "groups": ["G", "H"], "items": [
            _mk_url_item("pl_" + "a" * 12, "G", {"mode": "all"}),
            _mk_url_item("pl_" + "b" * 12, "H", {"mode": "accounts", "accounts": ["zhangsan"]}),
        ]}
        r, _ = _req(conn, "POST", "/api/portal/config", ck, json.dumps(cfg))
        assert r.status == 200
        # 普通用户只见 all 项、H 组被收敛
        conn2, ck2 = _login(port, "u1")
        r2, d2 = _req(conn2, "GET", "/api/portal/config", ck2)
        out = json.loads(d2)["config"]
        assert [it["id"] for it in out["items"]] == ["pl_" + "a" * 12]
        assert out["groups"] == ["G"]
        # 超管见全量
        r3, d3 = _req(conn, "GET", "/api/portal/config", ck)
        assert len(json.loads(d3)["config"]["items"]) == 2
    finally:
        srv.shutdown()


def test_post_config_nonsuper_403(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "u1")
        r, _ = _req(conn, "POST", "/api/portal/config", ck, json.dumps(portal.empty_config()))
        assert r.status == 403
    finally:
        srv.shutdown()


def test_post_config_bad_scheme_400(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "super")
        bad = {"version": 1, "groups": ["G"], "items": [
            {"id": "pl_" + "a" * 12, "type": "url", "name": "x", "group": "G", "emoji": "",
             "featured": False, "url": "javascript:alert(1)", "file": None, "visibility": {"mode": "all"}}]}
        r, _ = _req(conn, "POST", "/api/portal/config", ck, json.dumps(bad))
        assert r.status == 400
    finally:
        srv.shutdown()


def test_upload_then_download_and_visibility(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "super")
        # 上传(裸字节)
        r, d = _req(conn, "POST", "/api/portal/upload?name=%E5%91%A8%E6%8A%A5.txt", ck,
                    b"hello-bytes", ctype="application/octet-stream")
        assert r.status == 200
        fref = json.loads(d)["file"]
        assert fref["originalName"] == "周报.txt" and fref["size"] == 11
        # 存为 accounts-限定给 zhangsan(u1 不含)的文件项
        iid = "pl_" + "f" * 12
        cfg = {"version": 1, "groups": ["D"], "items": [
            {"id": iid, "type": "file", "name": "周报", "group": "D", "emoji": "", "featured": False,
             "url": "", "file": fref, "visibility": {"mode": "accounts", "accounts": ["zhangsan"]}}]}
        r, _ = _req(conn, "POST", "/api/portal/config", ck, json.dumps(cfg))
        assert r.status == 200
        # 超管下载 200 + Content-Disposition 中文名
        r, d = _req(conn, "GET", "/api/portal/download?id=" + iid, ck)
        assert r.status == 200 and d == b"hello-bytes"
        assert "filename*=UTF-8''" in r.getheader("Content-Disposition")
        # 越权账号 u1 下载 → 404(防探测)
        conn2, ck2 = _login(port, "u1")
        r2, _ = _req(conn2, "GET", "/api/portal/download?id=" + iid, ck2)
        assert r2.status == 404
        # 不存在 id → 404
        r3, _ = _req(conn, "GET", "/api/portal/download?id=pl_" + "0" * 12, ck)
        assert r3.status == 404
    finally:
        srv.shutdown()


def test_upload_nonsuper_403(tmp_path, monkeypatch):
    srv, port = _serve(monkeypatch, tmp_path)
    try:
        conn, ck = _login(port, "u1")
        r, _ = _req(conn, "POST", "/api/portal/upload?name=a.txt", ck, b"x", ctype="application/octet-stream")
        assert r.status == 403
    finally:
        srv.shutdown()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_server_portal.py -q`
Expected: FAIL（404 on `/api/portal/config`——路由未加）

- [ ] **Step 3: Write minimal implementation**

**3a.** `server.py` 顶部 import 区加 `import portal`（与 `import auth`、`import audit` 同处）。

**3b.** `server.py` 在 `_save_project_tags`（约 line 312）之后加常量与 load/save：
```python
# ── 首页门户/快捷入口(Launchpad,本地 JSON 配置 + 上传文件) ──
PORTAL_LINKS_FILE = os.path.join(BASE_DIR, 'data', 'portal_links.json')
PORTAL_FILES_DIR = os.path.join(BASE_DIR, 'data', 'portal_files')
PORTAL_MAX_UPLOAD = 200 * 1024 * 1024   # 单文件上传上限 200MB
_portal_lock = threading.RLock()


def _load_portal_config():
    with _portal_lock:
        if os.path.exists(PORTAL_LINKS_FILE):
            try:
                with open(PORTAL_LINKS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    data.setdefault('version', 1)
                    data.setdefault('groups', [])
                    data.setdefault('items', [])
                    return data
            except Exception:
                pass
        return portal.empty_config()


def _save_portal_config(store):
    with _portal_lock:
        _atomic_write_json(PORTAL_LINKS_FILE, store)
```

**3c.** `server.py` `_SUPER_ONLY_PATHS`（line 181）集合内加一行（在 `'/api/yitian/cookie',` 附近）：
```python
    '/api/portal/upload',
```
（**注意**：不要加 `/api/portal/config`——其 GET 供全员，加入会被超管闸拦掉。）

**3d.** `server.py` `_dispatch_get`（line 679 `/data/analysis_data.json` 分支前）加：
```python
        elif parsed.path == '/api/portal/config':
            self.handle_portal_config_get()
        elif parsed.path == '/api/portal/download':
            self.handle_portal_download()
```

**3e.** `server.py` `_dispatch_post`（line 813 `/api/inputs/upload` 分支后）加：
```python
        elif parsed.path == '/api/portal/config':
            self.handle_portal_config_save()
        elif parsed.path == '/api/portal/upload':
            self.handle_portal_upload()
```

**3f.** `server.py` 在 `handle_tags_save`（约 line 1227）之后加四个 handler：
```python
    def handle_portal_config_get(self):
        """GET /api/portal/config — 全员登录;超管返回全量,普通账号仅其可见项。"""
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        cfg = _load_portal_config()
        if rec.get('isSuper'):
            self._json_response({"success": True, "config": cfg})
        else:
            self._json_response({"success": True, "config": portal.visible_for_account(cfg, account)})

    def handle_portal_config_save(self):
        """POST /api/portal/config — 仅超管整存 + 清孤儿文件。"""
        if self._require_super() is None:
            return
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        try:
            cfg = portal.validate_portal_config(data)
        except ValueError as e:
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        n_url = sum(1 for it in cfg['items'] if it['type'] == 'url')
        n_file = sum(1 for it in cfg['items'] if it['type'] == 'file')
        self._audit_set(detail='跳转 %d 项 · 文件 %d 项 · 分组 %d' % (n_url, n_file, len(cfg['groups'])))
        with _portal_lock:
            _save_portal_config(cfg)
            self._cleanup_portal_orphans(cfg)
        self._json_response({"success": True, "config": cfg})

    def _cleanup_portal_orphans(self, cfg):
        """删 portal_files/ 下不再被引用的文件;绝不抛(清理失败不影响保存)。"""
        try:
            if not os.path.isdir(PORTAL_FILES_DIR):
                return
            existing = [n for n in os.listdir(PORTAL_FILES_DIR)
                        if os.path.isfile(os.path.join(PORTAL_FILES_DIR, n))]
            for name in portal.orphan_files(cfg, existing):
                try:
                    os.remove(os.path.join(PORTAL_FILES_DIR, name))
                except OSError:
                    pass
        except Exception:
            logger.error('portal 孤儿文件清理失败', exc_info=True)

    def handle_portal_upload(self):
        """POST /api/portal/upload?name=<原名> — 仅超管;裸字节 body 落 portal_files/。"""
        if self._require_super() is None:
            return
        qs = parse_qs(urlparse(self.path).query)
        original = (qs.get('name', [''])[0] or '').strip()
        if not original:
            self._send_json(400, _error_payload(ERR_VALIDATION, "缺少文件名"))
            return
        body = self._read_body_bytes(PORTAL_MAX_UPLOAD)
        if body is None:
            self._send_json(413, _error_payload(ERR_VALIDATION, "请求体缺失或超出 200MB 上限"))
            return
        if len(body) == 0:
            self._send_json(400, _error_payload(ERR_VALIDATION, "缺少文件内容"))
            return
        stored = '%s__%s' % (portal.new_file_token(), portal.sanitize_stored_name(original))
        os.makedirs(PORTAL_FILES_DIR, exist_ok=True)
        with open(os.path.join(PORTAL_FILES_DIR, stored), 'wb') as f:
            f.write(body)
        self._audit_set(target=original, detail='上传门户文件 · %d 字节' % len(body))
        self._json_response({"success": True,
                             "file": {"storedName": stored, "originalName": original, "size": len(body)}})

    def handle_portal_download(self):
        """GET /api/portal/download?id=<itemId> — 登录;再校验可见性 → 强制下载。
        项不存在 / 无权 / 文件缺失 一律 404,避免据响应差异探测他人可见文件。"""
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        iid = (parse_qs(urlparse(self.path).query).get('id', [''])[0] or '').strip()
        cfg = _load_portal_config()
        item = next((it for it in cfg.get('items', [])
                     if it.get('id') == iid and it.get('type') == 'file'), None)
        if not item or not portal.item_visible_to(item, account, bool(rec.get('isSuper'))):
            self._send_json(404, _error_payload(ERR_NOT_FOUND, "文件不存在"))
            return
        stored = os.path.basename((item.get('file') or {}).get('storedName', ''))
        path = os.path.join(PORTAL_FILES_DIR, stored)
        if not stored or not os.path.isfile(path):
            self._send_json(404, _error_payload(ERR_NOT_FOUND, "文件不存在"))
            return
        with open(path, 'rb') as f:
            body = f.read()
        original = (item.get('file') or {}).get('originalName', stored)
        self.send_response(200)
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Disposition', portal.content_disposition(original))
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)
```

**3g.** `audit.py` `_ACTION_MAP`（业务写入段，line 75 `opportunities.import` 之后）加：
```python
    ('POST', '/api/portal/config'): ('portal.save', '保存门户配置'),
    ('POST', '/api/portal/upload'): ('portal.upload', '上传门户文件'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_server_portal.py tests/test_portal.py -q`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add server.py audit.py tests/test_server_portal.py
git commit -m "feat(portal): 后端 4 端点(config/upload/download)+可见性双重强制+审计

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 前端纯函数 `lib/portal.ts`

**Files:**
- Create: `frontend/src/lib/portal.ts`
- Test: `frontend/src/lib/portal.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: 类型 `PortalVisibility`/`PortalFileRef`/`PortalItem`/`PortalConfig`/`PortalSection`；`emptyConfig()`、`isSafeUrl(url)`、`newItemId()`、`initials(name)`、`avatarColor(name)`、`buildSections(config)`。

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/portal.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { isSafeUrl, initials, avatarColor, buildSections, newItemId, emptyConfig, type PortalConfig, type PortalItem } from './portal'

function item(over: Partial<PortalItem>): PortalItem {
  return { id: 'pl_' + '0'.repeat(12), type: 'url', name: '入口', group: 'G', emoji: '',
    featured: false, url: 'https://x.com', file: null, visibility: { mode: 'all' }, ...over }
}

describe('portal lib', () => {
  it('isSafeUrl 仅放 http/https', () => {
    expect(isSafeUrl('https://a.com')).toBe(true)
    expect(isSafeUrl('http://a.com')).toBe(true)
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('data:text/html,x')).toBe(false)
    expect(isSafeUrl('nonsense')).toBe(false)
  })

  it('initials 汉字取首字/拉丁取大写首字母/空占位', () => {
    expect(initials('周报模板')).toBe('周')
    expect(initials('pmis')).toBe('P')
    expect(initials('')).toBe('·')
  })

  it('avatarColor 确定性且落在 --chart 令牌集', () => {
    const c = avatarColor('PMIS')
    expect(c).toBe(avatarColor('PMIS'))
    expect(c).toMatch(/^var\(--chart-[1-8]\)$/)
  })

  it('newItemId 前缀 pl_ 且唯一', () => {
    expect(newItemId()).toMatch(/^pl_[0-9a-f]{12}$/)
    expect(newItemId()).not.toBe(newItemId())
  })

  it('buildSections 置顶区在前、按 groups 顺序、featured 不在原组重复', () => {
    const cfg: PortalConfig = {
      version: 1, groups: ['G', 'H'], items: [
        item({ id: 'pl_' + 'a'.repeat(12), group: 'G', featured: true, name: '顶A' }),
        item({ id: 'pl_' + 'b'.repeat(12), group: 'G', name: 'G1' }),
        item({ id: 'pl_' + 'c'.repeat(12), group: 'H', name: 'H1' }),
      ],
    }
    const secs = buildSections(cfg)
    expect(secs.map((s) => s.key)).toEqual(['__featured__', 'G', 'H'])
    expect(secs[0].items.map((i) => i.name)).toEqual(['顶A'])
    expect(secs[1].items.map((i) => i.name)).toEqual(['G1'])  // 顶A 不重复出现在 G
    expect(secs[2].items.map((i) => i.name)).toEqual(['H1'])
  })

  it('buildSections 无置顶则无 featured 段;空组不出段', () => {
    const cfg: PortalConfig = { version: 1, groups: ['G', 'H'], items: [item({ group: 'G' })] }
    const secs = buildSections(cfg)
    expect(secs.map((s) => s.key)).toEqual(['G'])
  })

  it('emptyConfig', () => {
    expect(emptyConfig()).toEqual({ version: 1, groups: [], items: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/portal.test.ts`
Expected: FAIL（`Cannot find module './portal'`）

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/portal.ts`:
```typescript
// 首页门户/快捷入口(Launchpad)类型 + 纯函数:分组分段、首字母、取色、URL 安全校验、id 生成。
export type PortalVisibility = { mode: 'all' } | { mode: 'accounts'; accounts: string[] }
export interface PortalFileRef { storedName: string; originalName: string; size: number }
export interface PortalItem {
  id: string
  type: 'url' | 'file'
  name: string
  group: string
  emoji: string
  featured: boolean
  url: string
  file: PortalFileRef | null
  visibility: PortalVisibility
}
export interface PortalConfig { version: number; groups: string[]; items: PortalItem[] }
export interface PortalSection { key: string; label: string; featured: boolean; items: PortalItem[] }

export function emptyConfig(): PortalConfig {
  return { version: 1, groups: [], items: [] }
}

export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function newItemId(): string {
  const a = new Uint8Array(6)
  crypto.getRandomValues(a)
  return 'pl_' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function initials(name: string): string {
  const s = (name || '').trim()
  if (!s) return '·'
  const ch = s[0]
  return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : ch
}

const PALETTE = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--chart-7', '--chart-8']
export function avatarColor(name: string): string {
  let h = 0
  const s = name || ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `var(${PALETTE[h % PALETTE.length]})`
}

export function buildSections(config: PortalConfig): PortalSection[] {
  const items = config.items ?? []
  const sections: PortalSection[] = []
  const featured = items.filter((it) => it.featured)
  if (featured.length) sections.push({ key: '__featured__', label: '置顶', featured: true, items: featured })
  for (const g of config.groups ?? []) {
    const gi = items.filter((it) => !it.featured && it.group === g)
    if (gi.length) sections.push({ key: g, label: g, featured: false, items: gi })
  }
  return sections
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/portal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/portal.ts frontend/src/lib/portal.test.ts
git commit -m "feat(portal): 前端纯函数 lib/portal(类型+分段+首字母+取色+scheme校验)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 前端数据层 `lib/portalApi.ts` + `stores/portal.ts`

**Files:**
- Create: `frontend/src/lib/portalApi.ts`
- Create: `frontend/src/stores/portal.ts`
- Test: `frontend/src/stores/portal.test.ts`

**Interfaces:**
- Consumes: `api`（`@/api/client`）、`apiUrl`（`@/lib/baseUrl`）、`PortalConfig`/`PortalFileRef`/`emptyConfig`（Task 3）。
- Produces: `getPortalConfig()`、`savePortalConfig(config)`、`uploadPortalFile(file)`、`downloadUrl(id)`；store `usePortalStore` → `{ config, loaded, saving, load(), save(next), reset() }`。

- [ ] **Step 1: Write the failing test**

Create `frontend/src/stores/portal.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/portalApi', () => ({
  getPortalConfig: vi.fn(async () => ({ version: 1, groups: ['G'], items: [] })),
  savePortalConfig: vi.fn(async (c: any) => c),
}))

import { usePortalStore } from './portal'
import { getPortalConfig, savePortalConfig } from '@/lib/portalApi'

describe('portal store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load 拉取并置 loaded', async () => {
    const s = usePortalStore()
    expect(s.loaded).toBe(false)
    await s.load()
    expect(getPortalConfig).toHaveBeenCalled()
    expect(s.config.groups).toEqual(['G'])
    expect(s.loaded).toBe(true)
  })

  it('save 写回并刷新 config', async () => {
    const s = usePortalStore()
    const next = { version: 1, groups: ['X'], items: [] }
    await s.save(next)
    expect(savePortalConfig).toHaveBeenCalledWith(next)
    expect(s.config.groups).toEqual(['X'])
  })

  it('reset 归零', async () => {
    const s = usePortalStore()
    await s.load()
    s.reset()
    expect(s.config).toEqual({ version: 1, groups: [], items: [] })
    expect(s.loaded).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/stores/portal.test.ts`
Expected: FAIL（`Cannot find module './portal'`）

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/portalApi.ts`:
```typescript
import { api } from '@/api/client'
import { apiUrl } from '@/lib/baseUrl'
import type { PortalConfig, PortalFileRef } from '@/lib/portal'

export async function getPortalConfig(): Promise<PortalConfig> {
  const r = await api.get<{ success: boolean; config: PortalConfig }>('/api/portal/config')
  return r.config
}

export async function savePortalConfig(config: PortalConfig): Promise<PortalConfig> {
  const r = await api.post<{ success: boolean; config: PortalConfig }>('/api/portal/config', config)
  return r.config
}

export async function uploadPortalFile(file: File): Promise<PortalFileRef> {
  const url = apiUrl('/api/portal/upload?name=' + encodeURIComponent(file.name))
  const res = await fetch(url, { method: 'POST', credentials: 'same-origin', body: file })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.success === false) throw new Error(data.message || '上传失败')
  return data.file as PortalFileRef
}

export function downloadUrl(id: string): string {
  return apiUrl('/api/portal/download?id=' + encodeURIComponent(id))
}
```

Create `frontend/src/stores/portal.ts`:
```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPortalConfig, savePortalConfig } from '@/lib/portalApi'
import { emptyConfig, type PortalConfig } from '@/lib/portal'

export const usePortalStore = defineStore('portal', () => {
  const config = ref<PortalConfig>(emptyConfig())
  const loaded = ref(false)
  const saving = ref(false)

  async function load(): Promise<void> {
    config.value = await getPortalConfig()
    loaded.value = true
  }
  async function save(next: PortalConfig): Promise<void> {
    saving.value = true
    try {
      config.value = await savePortalConfig(next)
    } finally {
      saving.value = false
    }
  }
  function reset(): void {
    config.value = emptyConfig()
    loaded.value = false
  }
  return { config, loaded, saving, load, save, reset }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/stores/portal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/portalApi.ts frontend/src/stores/portal.ts frontend/src/stores/portal.test.ts
git commit -m "feat(portal): 前端数据层 portalApi + portal store

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 首页展示组件 `PortalLaunchpad.vue`

**Files:**
- Create: `frontend/src/components/PortalLaunchpad.vue`
- Test: `frontend/src/components/PortalLaunchpad.test.ts`

**Interfaces:**
- Consumes: `PortalSection`/`PortalItem`/`initials`/`avatarColor`/`isSafeUrl`（Task 3）；`downloadUrl`（Task 4）。
- Produces: 表现型组件 `PortalLaunchpad`，props `{ sections: PortalSection[] }`，无 emit。

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/PortalLaunchpad.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalLaunchpad from './PortalLaunchpad.vue'
import type { PortalSection } from '@/lib/portal'

const sections: PortalSection[] = [
  { key: '__featured__', label: '置顶', featured: true, items: [
    { id: 'pl_a', type: 'url', name: 'PMIS', group: 'G', emoji: '', featured: true,
      url: 'https://pmis.example.com', file: null, visibility: { mode: 'all' } },
  ] },
  { key: 'D', label: '文档下载', featured: false, items: [
    { id: 'pl_b', type: 'file', name: '周报', group: 'D', emoji: '📄', featured: false,
      url: '', file: { storedName: 'pf_x__z.txt', originalName: 'z.txt', size: 5 }, visibility: { mode: 'all' } },
  ] },
]

describe('PortalLaunchpad', () => {
  it('渲染置顶段与分组段', () => {
    const w = mount(PortalLaunchpad, { props: { sections } })
    expect(w.text()).toContain('置顶')
    expect(w.text()).toContain('文档下载')
    expect(w.findAll('.pl-tile')).toHaveLength(2)
  })

  it('url 项 target=_blank + rel=noopener + href', () => {
    const w = mount(PortalLaunchpad, { props: { sections } })
    const a = w.find('[data-test="portal-item-pl_a"]')
    expect(a.attributes('href')).toBe('https://pmis.example.com')
    expect(a.attributes('target')).toBe('_blank')
    expect(a.attributes('rel')).toBe('noopener noreferrer')
  })

  it('file 项 href 指向下载端点、无 target', () => {
    const w = mount(PortalLaunchpad, { props: { sections } })
    const a = w.find('[data-test="portal-item-pl_b"]')
    expect(a.attributes('href')).toContain('/api/portal/download?id=pl_b')
    expect(a.attributes('target')).toBeUndefined()
  })

  it('emoji 有值显 emoji、无值显首字母', () => {
    const w = mount(PortalLaunchpad, { props: { sections } })
    expect(w.find('[data-test="portal-item-pl_b"]').text()).toContain('📄')
    expect(w.find('[data-test="portal-item-pl_a"] .pl-initial').text()).toBe('P')
  })

  it('不安全 url → href 降级为 #', () => {
    const bad: PortalSection[] = [{ key: 'G', label: 'G', featured: false, items: [
      { id: 'pl_c', type: 'url', name: 'x', group: 'G', emoji: '', featured: false,
        url: 'javascript:alert(1)', file: null, visibility: { mode: 'all' } }] }]
    const w = mount(PortalLaunchpad, { props: { sections: bad } })
    expect(w.find('[data-test="portal-item-pl_c"]').attributes('href')).toBe('#')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/PortalLaunchpad.test.ts`
Expected: FAIL（`Cannot find module './PortalLaunchpad.vue'`）

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/PortalLaunchpad.vue`:
```vue
<script setup lang="ts">
import type { PortalSection, PortalItem } from '@/lib/portal'
import { initials, avatarColor, isSafeUrl } from '@/lib/portal'
import { downloadUrl } from '@/lib/portalApi'

defineProps<{ sections: PortalSection[] }>()

function linkAttrs(item: PortalItem): Record<string, string> {
  if (item.type === 'file') return { href: downloadUrl(item.id) }
  return { href: isSafeUrl(item.url) ? item.url : '#', target: '_blank', rel: 'noopener noreferrer' }
}
</script>

<template>
  <div class="pl-wrap" data-test="portal-launchpad">
    <section v-for="sec in sections" :key="sec.key" class="pl-sec">
      <div class="pl-sec-label">
        <span v-if="sec.featured" class="pl-star" aria-hidden="true">★</span>{{ sec.label }}
      </div>
      <div class="pl-grid">
        <a v-for="item in sec.items" :key="item.id" class="pl-tile" v-bind="linkAttrs(item)"
           :title="item.name" :data-test="'portal-item-' + item.id">
          <span class="pl-icon" :style="item.emoji ? {} : { background: avatarColor(item.name) }">
            <span v-if="item.emoji" class="pl-emoji">{{ item.emoji }}</span>
            <span v-else class="pl-initial">{{ initials(item.name) }}</span>
          </span>
          <span class="pl-name">{{ item.name }}</span>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pl-wrap { display: flex; flex-direction: column; gap: var(--gap-stack); }
.pl-sec { display: flex; flex-direction: column; gap: var(--sp-2); }
.pl-sec-label {
  font-size: var(--fs-1); font-weight: 700; color: var(--mut);
  letter-spacing: var(--ls-wide); display: flex; align-items: center; gap: var(--sp-1);
}
.pl-star { color: var(--warn-text); font-size: var(--fs-2); }
.pl-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: var(--sp-3) var(--sp-2);
}
.pl-tile {
  display: flex; flex-direction: column; align-items: center; gap: var(--sp-1);
  text-decoration: none; color: inherit; padding: var(--sp-1);
  border-radius: var(--r-md); transition: background var(--dur-1) var(--ease);
}
.pl-tile:hover { background: var(--hover-tint); }
.pl-icon {
  width: 48px; height: 48px; border-radius: var(--r-md);
  display: grid; place-items: center; box-shadow: var(--shadow-1);
  color: var(--on-accent); overflow: hidden;
}
.pl-emoji { font-size: 24px; line-height: 1; }
.pl-initial { font-size: var(--fs-4); font-weight: 700; color: var(--on-accent); }
.pl-name {
  font-size: var(--fs-1); color: var(--txt); text-align: center;
  max-width: 76px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/PortalLaunchpad.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PortalLaunchpad.vue frontend/src/components/PortalLaunchpad.test.ts
git commit -m "feat(portal): PortalLaunchpad 首页展示组件(置顶段+分组瓦片+url/file链接)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 编辑弹窗 `PortalItemEditDialog.vue`

**Files:**
- Create: `frontend/src/components/PortalItemEditDialog.vue`
- Test: `frontend/src/components/PortalItemEditDialog.test.ts`

**Interfaces:**
- Consumes: `PortalItem`/`isSafeUrl`/`newItemId`（Task 3）；`uploadPortalFile`（Task 4）；`AdminAccount`/`listAccounts`（`@/lib/admin`）；Element Plus。
- Produces: 组件 `PortalItemEditDialog`，props `{ modelValue: boolean; item: PortalItem | null; groups: string[] }`，emits `update:modelValue`（boolean）、`save`（PortalItem）。`item=null` 表示新建（内部用 `newItemId()` 生成 id）。

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/PortalItemEditDialog.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PortalItemEditDialog from './PortalItemEditDialog.vue'
import type { PortalItem } from '@/lib/portal'

vi.mock('@/lib/admin', () => ({
  listAccounts: vi.fn(async () => [
    { account: 'zhangsan', displayName: '张三', isSuper: false, allowedPages: [], allowedL4: [] },
    { account: 'lisi', displayName: '李四', isSuper: false, allowedPages: [], allowedL4: [] },
  ]),
}))
vi.mock('@/lib/portalApi', () => ({
  uploadPortalFile: vi.fn(async () => ({ storedName: 'pf_x__a.txt', originalName: 'a.txt', size: 3 })),
}))

function mountD(item: PortalItem | null = null) {
  return mount(PortalItemEditDialog, {
    props: { modelValue: true, item, groups: ['常用系统'] },
    attachTo: document.body,
  })
}

describe('PortalItemEditDialog', () => {
  it('新建时保存 url 项发出完整 item(含 pl_ id)', async () => {
    const w = mountD(null)
    await flushPromises()
    w.vm.form.name = 'PMIS'
    w.vm.form.group = '常用系统'
    w.vm.form.url = 'https://pmis.example.com'
    await w.vm.onSave()
    const ev = w.emitted('save')
    expect(ev).toBeTruthy()
    const saved = ev![0][0] as PortalItem
    expect(saved.id).toMatch(/^pl_[0-9a-f]{12}$/)
    expect(saved.type).toBe('url')
    expect(saved.url).toBe('https://pmis.example.com')
    expect(saved.file).toBeNull()
  })

  it('url scheme 非法则拒绝保存并置错误', async () => {
    const w = mountD(null)
    await flushPromises()
    w.vm.form.name = 'x'
    w.vm.form.group = '常用系统'
    w.vm.form.url = 'javascript:alert(1)'
    await w.vm.onSave()
    expect(w.emitted('save')).toBeFalsy()
    expect(w.vm.error).toContain('http')
  })

  it('切到 file 类型清空 url;可见范围 accounts 携带勾选账号', async () => {
    const w = mountD(null)
    await flushPromises()
    w.vm.form.type = 'file'
    w.vm.form.name = '周报'
    w.vm.form.group = '常用系统'
    w.vm.form.file = { storedName: 'pf_x__a.txt', originalName: 'a.txt', size: 3 }
    w.vm.form.visMode = 'accounts'
    w.vm.form.visAccounts = ['zhangsan']
    await w.vm.onSave()
    const saved = w.emitted('save')![0][0] as PortalItem
    expect(saved.type).toBe('file')
    expect(saved.url).toBe('')
    expect(saved.file?.storedName).toBe('pf_x__a.txt')
    expect(saved.visibility).toEqual({ mode: 'accounts', accounts: ['zhangsan'] })
  })

  it('file 类型但未上传文件则拒绝保存', async () => {
    const w = mountD(null)
    await flushPromises()
    w.vm.form.type = 'file'
    w.vm.form.name = '周报'
    w.vm.form.group = '常用系统'
    await w.vm.onSave()
    expect(w.emitted('save')).toBeFalsy()
    expect(w.vm.error).toContain('文件')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/PortalItemEditDialog.test.ts`
Expected: FAIL（`Cannot find module './PortalItemEditDialog.vue'`）

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/PortalItemEditDialog.vue`:
```vue
<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue'
import { isSafeUrl, newItemId, type PortalItem, type PortalFileRef, type PortalVisibility } from '@/lib/portal'
import { uploadPortalFile } from '@/lib/portalApi'
import { listAccounts, type AdminAccount } from '@/lib/admin'

const props = defineProps<{ modelValue: boolean; item: PortalItem | null; groups: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'save', item: PortalItem): void }>()

const accounts = ref<AdminAccount[]>([])
onMounted(async () => { try { accounts.value = await listAccounts() } catch { accounts.value = [] } })

const form = reactive({
  id: '', type: 'url' as 'url' | 'file', name: '', group: '', emoji: '', featured: false,
  url: '', file: null as PortalFileRef | null,
  visMode: 'all' as 'all' | 'accounts', visAccounts: [] as string[],
})
const error = ref('')
const uploading = ref(false)

function loadFromProps() {
  const it = props.item
  error.value = ''
  if (it) {
    form.id = it.id; form.type = it.type; form.name = it.name; form.group = it.group
    form.emoji = it.emoji; form.featured = it.featured; form.url = it.url; form.file = it.file
    form.visMode = it.visibility.mode
    form.visAccounts = it.visibility.mode === 'accounts' ? [...it.visibility.accounts] : []
  } else {
    form.id = newItemId(); form.type = 'url'; form.name = ''; form.group = props.groups[0] ?? ''
    form.emoji = ''; form.featured = false; form.url = ''; form.file = null
    form.visMode = 'all'; form.visAccounts = []
  }
}
watch(() => props.modelValue, (v) => { if (v) loadFromProps() }, { immediate: true })

async function onPickFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  uploading.value = true; error.value = ''
  try {
    form.file = await uploadPortalFile(f)
  } catch (err) {
    error.value = '上传失败：' + (err instanceof Error ? err.message : String(err))
  } finally {
    uploading.value = false
  }
}

async function onSave() {
  error.value = ''
  if (!form.name.trim()) { error.value = '请填写名称'; return }
  if (!form.group) { error.value = '请选择或新建分组'; return }
  if (form.type === 'url' && !isSafeUrl(form.url)) { error.value = '链接须为 http/https 开头'; return }
  if (form.type === 'file' && !form.file) { error.value = '请先上传文件'; return }
  const visibility: PortalVisibility = form.visMode === 'accounts'
    ? { mode: 'accounts', accounts: [...form.visAccounts] }
    : { mode: 'all' }
  const out: PortalItem = {
    id: form.id, type: form.type, name: form.name.trim(), group: form.group,
    emoji: form.emoji.trim(), featured: form.featured,
    url: form.type === 'url' ? form.url.trim() : '',
    file: form.type === 'file' ? form.file : null,
    visibility,
  }
  emit('save', out)
  emit('update:modelValue', false)
}
function onClose() { emit('update:modelValue', false) }

defineExpose({ form, error, onSave })
</script>

<template>
  <el-dialog :model-value="modelValue" :title="item ? '编辑门户项' : '新建门户项'" width="440px"
             @update:model-value="onClose" append-to-body>
    <div class="pe-form">
      <div class="pe-row">
        <span class="pe-label">类型</span>
        <el-radio-group v-model="form.type">
          <el-radio value="url">url 跳转</el-radio>
          <el-radio value="file">文件下载</el-radio>
        </el-radio-group>
      </div>
      <div class="pe-row">
        <span class="pe-label">名称</span>
        <el-input v-model="form.name" maxlength="60" placeholder="如 PMIS 系统" style="width: 260px" />
      </div>
      <div class="pe-row">
        <span class="pe-label">分组</span>
        <el-select v-model="form.group" filterable allow-create default-first-option
                   placeholder="选择或新建分组" style="width: 260px">
          <el-option v-for="g in groups" :key="g" :value="g" :label="g" />
        </el-select>
      </div>
      <div class="pe-row">
        <span class="pe-label">图标</span>
        <el-input v-model="form.emoji" maxlength="8" placeholder="可选 emoji，留空用首字母" style="width: 160px" />
        <el-checkbox v-model="form.featured">置顶 ★</el-checkbox>
      </div>
      <div v-if="form.type === 'url'" class="pe-row">
        <span class="pe-label">链接</span>
        <el-input v-model="form.url" placeholder="https://..." style="width: 260px" />
      </div>
      <div v-else class="pe-row">
        <span class="pe-label">文件</span>
        <input type="file" data-test="pe-file" :disabled="uploading" @change="onPickFile" />
        <span v-if="form.file" class="pe-file-name u-num">{{ form.file.originalName }}</span>
      </div>
      <div class="pe-row">
        <span class="pe-label">可见</span>
        <el-radio-group v-model="form.visMode">
          <el-radio value="all">全部账号</el-radio>
          <el-radio value="accounts">指定账号</el-radio>
        </el-radio-group>
      </div>
      <div v-if="form.visMode === 'accounts'" class="pe-row">
        <span class="pe-label"></span>
        <el-select v-model="form.visAccounts" multiple filterable collapse-tags
                   placeholder="勾选可见账号" style="width: 260px">
          <el-option v-for="a in accounts" :key="a.account" :value="a.account"
                     :label="a.displayName + '（' + a.account + '）'" />
        </el-select>
      </div>
      <div v-if="error" class="pe-error">{{ error }}</div>
    </div>
    <template #footer>
      <el-button @click="onClose">取消</el-button>
      <el-button type="primary" :loading="uploading" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.pe-form { display: flex; flex-direction: column; gap: var(--sp-3); }
.pe-row { display: flex; align-items: center; gap: var(--sp-2); }
.pe-label { width: 44px; font-size: var(--fs-2); color: var(--sub); flex-shrink: 0; }
.pe-file-name { font-size: var(--fs-1); color: var(--sub); }
.pe-error { color: var(--danger-text); font-size: var(--fs-1); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/PortalItemEditDialog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PortalItemEditDialog.vue frontend/src/components/PortalItemEditDialog.test.ts
git commit -m "feat(portal): PortalItemEditDialog 新建/编辑弹窗(类型切换+上传+可见范围)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 配置卡 `PortalConfigCard.vue`（/data 内，超管）

**Files:**
- Create: `frontend/src/components/PortalConfigCard.vue`
- Test: `frontend/src/components/PortalConfigCard.test.ts`

**Interfaces:**
- Consumes: `usePortalStore`（Task 4）；`buildSections`/`PortalItem`/`PortalConfig`（Task 3）；`PortalItemEditDialog`（Task 6）；Element Plus。
- Produces: 组件 `PortalConfigCard`，无 props（自持 store 与本地 draft）。内部维护 `draft: PortalConfig`，编辑后 `保存` 调 `store.save(draft)`。

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/PortalConfigCard.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const saveSpy = vi.fn(async (c: any) => c)
vi.mock('@/lib/portalApi', () => ({
  getPortalConfig: vi.fn(async () => ({ version: 1, groups: ['G'], items: [
    { id: 'pl_' + 'a'.repeat(12), type: 'url', name: 'A', group: 'G', emoji: '', featured: false,
      url: 'https://a.com', file: null, visibility: { mode: 'all' } },
    { id: 'pl_' + 'b'.repeat(12), type: 'url', name: 'B', group: 'G', emoji: '', featured: false,
      url: 'https://b.com', file: null, visibility: { mode: 'all' } },
  ] })),
  savePortalConfig: saveSpy,
  uploadPortalFile: vi.fn(),
}))
vi.mock('@/lib/admin', () => ({ listAccounts: vi.fn(async () => []) }))

import PortalConfigCard from './PortalConfigCard.vue'

function mountCard() {
  return mount(PortalConfigCard, { global: { stubs: { PortalItemEditDialog: true } } })
}

describe('PortalConfigCard', () => {
  beforeEach(() => { setActivePinia(createPinia()); saveSpy.mockClear() })

  it('挂载后展示 store 现有项', async () => {
    const w = mountCard()
    await flushPromises()
    expect(w.findAll('[data-test="pc-item-row"]')).toHaveLength(2)
  })

  it('删除项后保存写回缺该项的 config', async () => {
    const w = mountCard()
    await flushPromises()
    await w.findAll('[data-test="pc-del"]')[0].trigger('click')
    await w.find('[data-test="pc-save"]').trigger('click')
    await flushPromises()
    expect(saveSpy).toHaveBeenCalled()
    const saved = saveSpy.mock.calls[0][0]
    expect(saved.items.map((i: any) => i.name)).toEqual(['B'])
  })

  it('下移首项后保存,顺序变为 B,A', async () => {
    const w = mountCard()
    await flushPromises()
    await w.findAll('[data-test="pc-down"]')[0].trigger('click')
    await w.find('[data-test="pc-save"]').trigger('click')
    await flushPromises()
    const saved = saveSpy.mock.calls[0][0]
    expect(saved.items.map((i: any) => i.name)).toEqual(['B', 'A'])
  })

  it('接收 dialog 的 save 事件后新增项进入 draft 且组被登记', async () => {
    const w = mountCard()
    await flushPromises()
    const newItem = { id: 'pl_' + 'c'.repeat(12), type: 'url', name: 'C', group: '新组', emoji: '',
      featured: false, url: 'https://c.com', file: null, visibility: { mode: 'all' } }
    w.vm.onDialogSave(newItem as any)
    await flushPromises()
    expect(w.vm.draft.items.map((i: any) => i.name)).toContain('C')
    expect(w.vm.draft.groups).toContain('新组')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/PortalConfigCard.test.ts`
Expected: FAIL（`Cannot find module './PortalConfigCard.vue'`）

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/PortalConfigCard.vue`:
```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortalStore } from '@/stores/portal'
import { buildSections, type PortalConfig, type PortalItem } from '@/lib/portal'
import PortalItemEditDialog from './PortalItemEditDialog.vue'

const store = usePortalStore()
const draft = ref<PortalConfig>({ version: 1, groups: [], items: [] })
const dialogOpen = ref(false)
const editing = ref<PortalItem | null>(null)

function cloneConfig(c: PortalConfig): PortalConfig {
  return JSON.parse(JSON.stringify(c))
}
async function reload() {
  if (!store.loaded) await store.load().catch(() => {})
  draft.value = cloneConfig(store.config)
}
onMounted(reload)

const sections = computed(() => buildSections(draft.value))

function openNew() { editing.value = null; dialogOpen.value = true }
function openEdit(it: PortalItem) { editing.value = it; dialogOpen.value = true }

function onDialogSave(it: PortalItem) {
  if (it.group && !draft.value.groups.includes(it.group)) draft.value.groups.push(it.group)
  const idx = draft.value.items.findIndex((x) => x.id === it.id)
  if (idx >= 0) draft.value.items[idx] = it
  else draft.value.items.push(it)
}
function removeItem(it: PortalItem) {
  draft.value.items = draft.value.items.filter((x) => x.id !== it.id)
}
function moveItem(it: PortalItem, dir: -1 | 1, secItems: PortalItem[]) {
  const local = secItems.findIndex((x) => x.id === it.id)
  const target = local + dir
  if (target < 0 || target >= secItems.length) return
  const gi = draft.value.items.findIndex((x) => x.id === it.id)
  const gj = draft.value.items.findIndex((x) => x.id === secItems[target].id)
  const arr = draft.value.items
  ;[arr[gi], arr[gj]] = [arr[gj], arr[gi]]
  draft.value.items = [...arr]
}
function moveGroup(g: string, dir: -1 | 1) {
  const i = draft.value.groups.indexOf(g)
  const j = i + dir
  if (j < 0 || j >= draft.value.groups.length) return
  const gs = draft.value.groups
  ;[gs[i], gs[j]] = [gs[j], gs[i]]
  draft.value.groups = [...gs]
}

async function onSave() {
  try {
    await store.save(cloneConfig(draft.value))
    draft.value = cloneConfig(store.config)
    ElMessage.success('门户配置已保存')
  } catch (e) {
    ElMessage.error('保存失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

function visLabel(it: PortalItem): string {
  return it.visibility.mode === 'all' ? '全部' : `${it.visibility.accounts.length} 个账号`
}

defineExpose({ draft, onDialogSave })
</script>

<template>
  <div class="pc-card" data-test="portal-config-card">
    <div class="pc-head">
      <button class="dv-btn primary" data-test="pc-add" @click="openNew">＋ 新建门户项</button>
      <button class="dv-btn" data-test="pc-save" :disabled="store.saving" @click="onSave">保存</button>
      <span class="dv-hint">在首页顶部「快捷入口」按分组展示；置顶项汇入顶部区。</span>
    </div>

    <div v-if="!sections.length" class="dv-hint">还没有门户项，点「新建门户项」添加。</div>

    <div v-for="sec in sections" :key="sec.key" class="pc-sec">
      <div class="pc-sec-head">
        <span class="pc-sec-title">
          <span v-if="sec.featured">★ </span>{{ sec.label }}
        </span>
        <template v-if="!sec.featured">
          <button class="pc-mini" title="上移组" @click="moveGroup(sec.key, -1)">▲</button>
          <button class="pc-mini" title="下移组" @click="moveGroup(sec.key, 1)">▼</button>
        </template>
      </div>
      <div v-for="it in sec.items" :key="it.id" class="pc-item" data-test="pc-item-row">
        <span class="pc-type" :class="it.type">{{ it.type === 'url' ? '跳转' : '文件' }}</span>
        <span class="pc-name">{{ it.emoji || '' }} {{ it.name }}</span>
        <span class="pc-vis">{{ visLabel(it) }}</span>
        <button class="pc-mini" data-test="pc-up" title="上移" @click="moveItem(it, -1, sec.items)">▲</button>
        <button class="pc-mini" data-test="pc-down" title="下移" @click="moveItem(it, 1, sec.items)">▼</button>
        <button class="pc-mini" data-test="pc-edit" @click="openEdit(it)">编辑</button>
        <button class="pc-mini danger" data-test="pc-del" @click="removeItem(it)">删除</button>
      </div>
    </div>

    <PortalItemEditDialog v-model="dialogOpen" :item="editing" :groups="draft.groups" @save="onDialogSave" />
  </div>
</template>

<style scoped>
.pc-card { display: flex; flex-direction: column; gap: var(--sp-3); }
.pc-head { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.pc-sec { display: flex; flex-direction: column; gap: var(--sp-1); }
.pc-sec-head { display: flex; align-items: center; gap: var(--sp-1); }
.pc-sec-title { font-size: var(--fs-2); font-weight: 700; color: var(--txt); }
.pc-item {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2); border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--card2);
}
.pc-type {
  font-size: var(--fs-1); padding: 0 var(--sp-1); border-radius: var(--r-sm);
  background: var(--hover-tint); color: var(--sub);
}
.pc-type.file { background: var(--ok-bg); color: var(--ok-text); }
.pc-name { flex: 1; font-size: var(--fs-2); color: var(--txt); }
.pc-vis { font-size: var(--fs-1); color: var(--sub); }
.pc-mini {
  font-size: var(--fs-1); padding: 2px var(--sp-1); border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer;
}
.pc-mini:hover { color: var(--txt); border-color: var(--accent); }
.pc-mini.danger:hover { color: var(--danger-text); border-color: var(--danger-text); }
</style>
```

> 令牌均已按 `theme.css` 实际名核对：卡面 `--card`/`--card2`、边框 `--line`/`--hairline`、强调 `--accent`（无 `-text`/`-bg` 变体）、强调色上文字 `--on-accent`、状态三态 `--ok-bg`/`--ok-text`/`--danger-text`/`--warn-text`、`--hover-tint`/`--selected-tint`。若后续 `theme.css` 增补 accent 淡底令牌可替换，但**不得手写散值**。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/PortalConfigCard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PortalConfigCard.vue frontend/src/components/PortalConfigCard.test.ts
git commit -m "feat(portal): PortalConfigCard /data 超管配置(增删改+组/项排序+保存)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 装配（首页 + /data + 登出复位 + 版本）+ 验证

**Files:**
- Modify: `frontend/src/views/OverviewView.vue`（顶部插入 PortalLaunchpad + 折叠 + 空态）
- Modify: `frontend/src/views/DataView.vue`（`dv-maint` 加超管折叠项）
- Modify: `frontend/src/stores/auth.ts`（login/logout 的 reset 批加 portal）
- Modify: `frontend/src/version.ts`（V2.10.0）
- Test: `frontend/src/views/OverviewView.portal.test.ts`

**Interfaces:**
- Consumes: `usePortalStore`（Task 4）、`buildSections`（Task 3）、`PortalLaunchpad`（Task 5）、`PortalConfigCard`（Task 7）、`useAuthStore`、`userScopedKey`。
- Produces: 集成后的可运行功能。

- [ ] **Step 1: Write the failing test**

Create `frontend/src/views/OverviewView.portal.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import OverviewView from './OverviewView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { getPortalConfig } from '@/lib/portalApi'

// portalApi 被 portal store 引用;mock 掉网络。默认返回空配置,单测用 mockResolvedValueOnce 覆盖。
// 注意:OverviewView onMounted 会调 portal.load() 覆盖 store,故必须用 mock 返回值驱动可见项,
// 不能直接 seed store.config(会被 load 覆盖)。
vi.mock('@/lib/portalApi', () => ({
  getPortalConfig: vi.fn(async () => ({ version: 1, groups: [], items: [] })),
  savePortalConfig: vi.fn(),
  downloadUrl: (id: string) => '/api/portal/download?id=' + id,
}))

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: OverviewView },
    { path: '/data', component: { template: '<div/>' } },
    { path: '/project/:id', component: { template: '<div/>' } },
  ] })
  // 让 OverviewView 跳过 data.load()
  useDataStore().data = { projects: [], projectPmis: {}, paymentNodes: {}, events: [] } as any
})

async function mountView() {
  await router.push('/'); await router.isReady()
  const w = mount(OverviewView, { global: { plugins: [router] } })
  await flushPromises()
  return w
}

describe('OverviewView 门户装配', () => {
  it('有可见项时渲染 PortalLaunchpad', async () => {
    vi.mocked(getPortalConfig).mockResolvedValueOnce({ version: 1, groups: ['G'], items: [
      { id: 'pl_a', type: 'url', name: 'PMIS', group: 'G', emoji: '', featured: false,
        url: 'https://a.com', file: null, visibility: { mode: 'all' } }] } as any)
    const w = await mountView()
    expect(w.find('[data-test="portal-launchpad"]').exists()).toBe(true)
  })

  it('无可见项且非超管 → 整块不渲染', async () => {
    // 默认 mock 返回空配置
    const w = await mountView()
    expect(w.find('.ov-portal').exists()).toBe(false)
  })

  it('无可见项且超管 → 显配置入口', async () => {
    const auth = useAuthStore()
    auth.user = { account: 'admin', displayName: '超管', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] } as any
    const w = await mountView()
    expect(w.find('.ov-portal').exists()).toBe(true)
    expect(w.text()).toContain('配置')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/OverviewView.portal.test.ts`
Expected: FAIL（`.ov-portal` 不存在——尚未装配）

- [ ] **Step 3: Write minimal implementation**

**3a.** `frontend/src/views/OverviewView.vue` `<script setup>` 增加导入与状态（在现有 imports/`onMounted` 附近）：
```typescript
import PortalLaunchpad from '@/components/PortalLaunchpad.vue'
import { usePortalStore } from '@/stores/portal'
import { buildSections } from '@/lib/portal'
import { useAuthStore } from '@/stores/auth'
import { userScopedKey } from '@/lib/userScopedKey'
```
在 `onMounted(() => { if (!data.data) data.load() })` 之后追加：
```typescript
const auth = useAuthStore()
const portal = usePortalStore()
const portalSections = computed(() => buildSections(portal.config))
const PORTAL_COLLAPSE_KEY = 'portal_collapsed'
const portalCollapsed = ref(false)
onMounted(() => {
  portal.load().catch(() => {})
  try { portalCollapsed.value = localStorage.getItem(userScopedKey(PORTAL_COLLAPSE_KEY)) === '1' } catch { /* ignore */ }
})
function togglePortal() {
  portalCollapsed.value = !portalCollapsed.value
  try { localStorage.setItem(userScopedKey(PORTAL_COLLAPSE_KEY), portalCollapsed.value ? '1' : '0') } catch { /* ignore */ }
}
```

**3b.** `OverviewView.vue` `<template>` 在 `<div class="overview-view">` 之后、`<!-- 体检带 -->` 之前插入：
```html
    <!-- 快捷入口 / 门户 -->
    <section v-if="portalSections.length || auth.isSuper" class="ov-portal">
      <div class="ov-portal-head">
        <span class="ov-portal-title">快捷入口</span>
        <button v-if="portalSections.length" class="ov-portal-toggle" @click="togglePortal">
          {{ portalCollapsed ? '展开' : '收起' }}
        </button>
        <RouterLink v-if="auth.isSuper" class="ov-portal-cfg" to="/data">＋ 配置</RouterLink>
      </div>
      <template v-if="portalSections.length">
        <PortalLaunchpad v-show="!portalCollapsed" :sections="portalSections" />
      </template>
      <div v-else-if="auth.isSuper" class="ov-portal-empty">还没有快捷入口，去数据管理页配置 →</div>
    </section>
```

**3c.** `OverviewView.vue` `<style scoped>` 末尾追加：
```css
.ov-portal {
  display: flex; flex-direction: column; gap: var(--sp-2);
  padding: var(--card-pad); background: var(--card);
  border: 1px solid var(--line); border-radius: var(--r-lg);
  box-shadow: var(--shadow-1); margin-bottom: var(--gap-card);
}
.ov-portal-head { display: flex; align-items: center; gap: var(--sp-2); }
.ov-portal-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
.ov-portal-toggle, .ov-portal-cfg {
  font-size: var(--fs-1); color: var(--sub); background: none; border: none;
  cursor: pointer; text-decoration: none; padding: 0 var(--sp-1);
}
.ov-portal-cfg { margin-left: auto; }
.ov-portal-toggle:hover, .ov-portal-cfg:hover { color: var(--txt); }
.ov-portal-empty { font-size: var(--fs-1); color: var(--mut); }
```
（令牌名以 `theme.css` 实际为准。）

**3d.** `frontend/src/views/DataView.vue`：`<script setup>` 加 `import PortalConfigCard from '@/components/PortalConfigCard.vue'` 与 `import { useAuthStore } from '@/stores/auth'`，并 `const auth = useAuthStore()`（若已存在则复用）。`<template>` 的 `dv-maint` `el-collapse` 内、`clear` 项之前插入：
```html
      <el-collapse-item v-if="auth.isSuper" name="portal" title="首页门户 / 快捷入口">
        <PortalConfigCard />
      </el-collapse-item>
```

**3e.** `frontend/src/stores/auth.ts`：顶部加 `import { usePortalStore } from './portal'`；在 `login` 成功分支的 reset 批与 `logout` 的 reset 批各加一行 `usePortalStore().reset()`（与 `useTempFollowupStore().reset()` 并列）。

**3f.** `frontend/src/version.ts`：
```typescript
export const APP_VERSION = 'V2.10.0'
export const RELEASE_DATE = '2026-07-11'
```

**3g.** 既有 `frontend/src/views/OverviewView.test.ts` 装配后会触发 `portal.load()` 真实网络请求（虽被 `.catch(()=>{})` 吞掉，但属测试卫生问题）。在该文件顶部 import 之后加一段 mock（该文件已 `import { ..., vi } from 'vitest'`），让 `load()` 解析为空配置、`.ov-portal` 不渲染，不影响既有 12 断言：
```typescript
vi.mock('@/lib/portalApi', () => ({
  getPortalConfig: vi.fn(async () => ({ version: 1, groups: [], items: [] })),
  savePortalConfig: vi.fn(),
  downloadUrl: (id: string) => '/api/portal/download?id=' + id,
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/OverviewView.portal.test.ts src/views/OverviewView.test.ts`
Expected: PASS（新 3 测 + 既有 12 测全过；既有测试无 portal store 时 `portalSections` 为空、非超管，`.ov-portal` 不渲染，不影响原断言）

- [ ] **Step 5: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（后端 `python -m pytest -q` 含 test_portal + test_server_portal；前端 `npm run typecheck` + `npm run test:run` + `npm run build`）。

（el-radio 已按 EP 2.9 用 `value=`；令牌已按 theme.css 核对。若个别令牌/API 仍有出入，以仓库实际为准修正后再跑，勿手写散值。）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/OverviewView.vue frontend/src/views/OverviewView.portal.test.ts frontend/src/views/OverviewView.test.ts frontend/src/views/DataView.vue frontend/src/stores/auth.ts frontend/src/version.ts
git commit -m "feat(portal): 装配首页快捷入口+/data配置入口+登出复位+版本V2.10.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 手动冒烟（Task 8 后，声称完成前）

1. `python server.py` + `cd frontend && npm run dev`，超管登录（admin/wxtnb）。
2. 首页顶部见「快捷入口」块（初始空，超管显「＋ 配置」）。
3. /data →「首页门户 / 快捷入口」：新建一个 url 项（https://…，全部可见）+ 一个文件项（上传一个文件，可见范围勾选某普通账号）→ 保存成功。
4. 回首页：url 项点开新标签；文件项点击浏览器下载（文件名正确，含中文）。
5. 用该普通账号登录：首页只见其可见项；越权文件项直连 `/api/portal/download?id=<越权id>` 应 404。
6. 无 console 报错。

## 完成定义

- 8 任务全绿 + `verify.sh` 全绿 + 冒烟通过。
- 更新 `PROGRESS.md`（V2.10.0 条目）。
- 打包/部署与升级手册在 finishing 阶段处理（非纯前端：换 dist + 重启后端；`data/portal_links.json`、`data/portal_files/` 首次自动建）。
