# V2.6.8 后端健壮性 + FollowupStore 重构（批2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修后端并发/写盘/输入健壮性缺陷，抽泛型 `followup_store.py` 统一 4 套 followup 领域逻辑并用 `_followup_txn` 收敛写处理器（事务锁/原子写/错误状态一处生效），清理死代码，收尾批1 opus 两条 minor。

**Architecture:** 四阶段：A 独立健壮性修复（原子写/运行槽锁/body 上限/SSE 断连，互不依赖、先银行化正确性）→ B FollowupStore domain 泛型（4 领域模块变薄配置，公共 API 不变、既有单测绿）→ C 处理器统一（先给 risk/paykey 补 characterization 端点测试做安全网，再用 `_followup_txn` 收敛写处理器）→ D 解析告警 + 死代码 + 批1 minor + bump/verify。TDD、频繁提交、每任务独立可测。

**Tech Stack:** Python 标准库（http.server ThreadingHTTPServer）+ pytest。前端仅涉一处注释（批1 minor 2）。

## Global Constraints

- 版本单一来源：改版本只改 `frontend/src/version.ts`（本批收尾 bump 到 `V2.6.8`，非每任务改）。
- **打包模式 vs 开发模式双分支**：`server.py` 大量 `if getattr(sys,'frozen',False)`，改"调脚本/读写路径"逻辑须两条分支都改；本批的写盘/锁改动在两模式共用代码路径上，注意不破坏 frozen 分支。
- **server.py 改动须重启进程才生效**（历史踩坑）：真机冒烟前先重启 `python server.py`。
- 服务是 `ThreadingHTTPServer`（server.py:2519），并发请求真实存在——锁/原子写是并发正确性要求，非可选。
- followup 领域 5 套差异（重构须保持）：temp/paykey 有子表 group（project/paymentNode/milestone）、opportunity/risk 单表无 group；temp/opportunity 归档清空 current、risk/paykey 归档留存 current；opportunity 有非空 DEFAULT_SCOPE，其余默认空范围。progress 无 scope、逻辑内联 server.py（本批不强并入泛型，保持独立）。
- 不使用任何 emoji；符号用 `→ ↓ ❌ ✕ ▾`。
- 验收门：`bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。改计算/领域逻辑先补/改测试再改实现。
- 测试运行：后端 `python -m pytest <路径> -q`；单个 `-v`。
- 提交信息结尾附：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

## Phase A — 独立健壮性修复（互不依赖，先落地）

### Task 1: `_atomic_write_json` 助手 + 4 个直写 store 改原子

**背景**：server.py 里 8 个 JSON store，早期 4 个（followup_records / project_tags / progress / temp_followup）用 `open('w')+json.dump` 直写，写盘中途崩溃/并发会留截断坏 JSON（此后 `_load_*` 落 except 静默丢全部数据）；晚期 4 个（opportunity_followup/risk/paykey/opportunities）已用 `tmp+os.replace` 原子写。本任务补齐前 4 个。

**Files:**
- Modify: `server.py`（新增助手；改 `_save_followup_records:211-215`、`_save_project_tags:276-280`、`_save_progress:305-309`、`_save_temp_followup:361-365`）
- Test: `tests/test_server_atomic_write.py`（新建）

**Interfaces:**
- Produces: `server._atomic_write_json(path: str, data) -> None`（写 `path+'.tmp'` 后 `os.replace` 到 `path`，保证读者永不见半截文件；`ensure_ascii=False, indent=2`）。

- [ ] **Step 1: Write the failing test**

```python
# tests/test_server_atomic_write.py
import os
import json
import server


def test_atomic_write_roundtrip_no_tmp_left(tmp_path):
    p = str(tmp_path / "x.json")
    server._atomic_write_json(p, {"a": 1, "中文": "值"})
    assert json.load(open(p, encoding="utf-8")) == {"a": 1, "中文": "值"}
    assert not os.path.exists(p + ".tmp")   # 临时文件已 replace,无残留


def test_direct_store_save_uses_atomic(tmp_path, monkeypatch):
    f = str(tmp_path / "followup_records.json")
    monkeypatch.setattr(server, "FOLLOWUP_FILE", f)
    server._save_followup_records([{"id": 1}])
    assert json.load(open(f, encoding="utf-8")) == [{"id": 1}]
    assert not os.path.exists(f + ".tmp")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_server_atomic_write.py -q`
Expected: FAIL（`server._atomic_write_json` 未定义 / AttributeError）

- [ ] **Step 3: Write minimal implementation**

在 server.py 的 `_load_followup_records`（约 201 行）之前加助手：

```python
def _atomic_write_json(path, data):
    """原子写 JSON:先写 .tmp 再 os.replace,避免并发/崩溃留半截坏文件。"""
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
```

把 4 个直写 save 的函数体改为调用它（各保留原有 makedirs 语义即由助手内含）：

```python
def _save_followup_records(records):
    _atomic_write_json(FOLLOWUP_FILE, records)

def _save_project_tags(tags):
    _atomic_write_json(PROJECT_TAGS_FILE, tags)

def _save_progress(store):
    _atomic_write_json(PROGRESS_FILE, store)

def _save_temp_followup(store):
    _atomic_write_json(TEMP_FOLLOWUP_FILE, store)
```

（注意保留各函数原有的锁语义：若原函数体是 `with _x_lock: open(...)`，改为 `with _x_lock: _atomic_write_json(...)`，锁不动——Task 9 再统一事务锁。先按原样把"写"替换为原子写。）

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_server_atomic_write.py tests/test_server_temp_followup.py tests/test_server_tags.py tests/test_server_progress.py -q`
Expected: PASS（既有 store 读写测试不回归）

- [ ] **Step 5: Commit**

```bash
git add server.py tests/test_server_atomic_write.py
git commit -m "fix(server): 4个直写store改原子写tmp+os.replace(修崩溃留坏JSON) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `_acquire_run_slot` 提取 + reprocess/download 检查-置位加锁

**背景**：`handle_reprocess`（1815-1836）与 `handle_pmis_download`（1792-1813）用"先 `if state.get('running')` 再 `state = {...running True...}`"两步无锁，并发两请求可都过检查各起一条后台线程（TOCTOU）。提取原子"占用运行槽"纯逻辑并加锁。

**Files:**
- Modify: `server.py`（新增 `_run_state_lock` + `_acquire_run_slot`；改 `handle_reprocess`、`handle_pmis_download` 的检查-置位段）
- Test: `tests/test_run_slot.py`（新建）

**Interfaces:**
- Produces: `server._acquire_run_slot(state: dict, lock, payload: dict) -> bool`——`with lock:` 若 `state.get('running')` 返回 `False`（不改 state）；否则 `state.clear(); state.update(payload)` 并返回 `True`。`server._run_state_lock`（新的 `threading.Lock()`）。

- [ ] **Step 1: Write the failing test**

```python
# tests/test_run_slot.py
import threading
import server


def test_acquire_free_slot_sets_running():
    state = {"running": False}
    lock = threading.Lock()
    ok = server._acquire_run_slot(state, lock, {"running": True, "phase": "x"})
    assert ok is True and state["running"] is True and state["phase"] == "x"


def test_acquire_busy_slot_rejected_and_unchanged():
    state = {"running": True, "phase": "old"}
    lock = threading.Lock()
    ok = server._acquire_run_slot(state, lock, {"running": True, "phase": "new"})
    assert ok is False and state["phase"] == "old"   # 忙时不改 state
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_run_slot.py -q`
Expected: FAIL（`_acquire_run_slot` / `_run_state_lock` 未定义）

- [ ] **Step 3: Write minimal implementation**

在 `reprocess_state`（约 127 行）附近加：

```python
_run_state_lock = threading.Lock()


def _acquire_run_slot(state, lock, payload):
    """原子占用运行槽:忙→False(不动 state);空→置位 payload 并 True。防 reprocess/download TOCTOU。"""
    with lock:
        if state.get("running"):
            return False
        state.clear()
        state.update(payload)
        return True
```

`handle_reprocess`（1817-1824）把"检查 reprocess_state.running 再置位"改为：

```python
        if history_state.get("running") or download_state.get("running"):
            self._json_response(_error_payload(ERR_BUSY, "其他数据操作进行中,请稍后")); return
        payload = {"running": True, "progress": [], "done": False, "error": None}  # 保持原 payload 字段
        if not _acquire_run_slot(reprocess_state, _run_state_lock, payload):
            self._json_response(reprocess_state); return
        threading.Thread(target=run_reprocess, daemon=True).start()
```

`handle_pmis_download`（1794-1801）同构改用 `_acquire_run_slot(download_state, _run_state_lock, {...原 payload...})`。**实现时先读这两处的原 payload 字段照抄进 `{...}`，勿臆造字段。**

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_run_slot.py tests/test_server_download.py -q`
Expected: PASS（download 既有测试不回归）

- [ ] **Step 5: Commit**

```bash
git add server.py tests/test_run_slot.py
git commit -m "fix(server): reprocess/download 运行槽原子占用(修TOCTOU并发双触发) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `_read_json_body` 大小上限 + 上传字节读护栏

**背景**：`_read_json_body`（1977-1983）`int(Content-Length)` 后 `rfile.read(n)` 无上限，恶意大 body 撑爆内存；上传端点（pmis_upload:1717、inputs_upload:1748）读裸字节同样无上限。

**Files:**
- Modify: `server.py`（`_read_json_body` 加上限；新增 `_read_body_bytes` 助手，pmis_upload/inputs_upload 接入）
- Test: `tests/test_body_limit.py`（新建）

**Interfaces:**
- Produces: 常量 `MAX_JSON_BODY = 16 * 1024 * 1024`（16MB）、`MAX_UPLOAD_BODY = 512 * 1024 * 1024`（512MB，xlsx 上传留余量）；`_read_body_bytes(self, max_bytes) -> bytes | None`（Content-Length 非法/超限/负数 → None）。`_read_json_body` Content-Length 超 `MAX_JSON_BODY` → 返回 None（handler 已把 None 当 400 处理）。

- [ ] **Step 1: Write the failing test**

```python
# tests/test_body_limit.py
import io
import server


class _FakeReq:
    def __init__(self, content_length, body=b""):
        self.headers = {"Content-Length": str(content_length)}
        self.rfile = io.BytesIO(body)


def test_read_json_body_rejects_oversize():
    req = _FakeReq(server.MAX_JSON_BODY + 1, b"{}")
    assert server.CustomHandler._read_json_body(req) is None   # 超限→None,未读大 body


def test_read_json_body_ok_small():
    body = b'{"a": 1}'
    req = _FakeReq(len(body), body)
    assert server.CustomHandler._read_json_body(req) == {"a": 1}


def test_read_body_bytes_rejects_negative_and_oversize():
    assert server.CustomHandler._read_body_bytes(_FakeReq(-5), server.MAX_UPLOAD_BODY) is None
    assert server.CustomHandler._read_body_bytes(_FakeReq(server.MAX_UPLOAD_BODY + 1), server.MAX_UPLOAD_BODY) is None
```

（`_FakeReq` 用 dict 当 `headers`——`self.headers.get('Content-Length',0)` 对 dict 成立。）

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_body_limit.py -q`
Expected: FAIL（`MAX_JSON_BODY` / `_read_body_bytes` 未定义；`_read_json_body` 当前无上限，超限用例读到空 body 走 except 返回 None 可能"意外通过"——见 Step 3 后确证行为）

- [ ] **Step 3: Write minimal implementation**

在文件常量区（约 138 行 `_AUTH_EXEMPT` 附近）加：

```python
MAX_JSON_BODY = 16 * 1024 * 1024
MAX_UPLOAD_BODY = 512 * 1024 * 1024
```

`_read_json_body`（1977-1983）改为：

```python
    def _read_json_body(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            if n < 0 or n > MAX_JSON_BODY:
                return None
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return None
```

新增上传字节助手（放 `_read_json_body` 旁）：

```python
    def _read_body_bytes(self, max_bytes):
        """读裸 body 字节;Content-Length 非法/负/超 max_bytes → None。"""
        try:
            n = int(self.headers.get('Content-Length', 0))
        except (TypeError, ValueError):
            return None
        if n < 0 or n > max_bytes:
            return None
        return self.rfile.read(n)
```

`handle_pmis_upload`（1717 附近）与 `handle_inputs_upload`（1748 附近）把手写 `length = int(...); data = self.rfile.read(length)` 改为：

```python
        data = self._read_body_bytes(MAX_UPLOAD_BODY)
        if data is None:
            self._send_json(413, _error_payload(ERR_VALIDATION, "请求体缺失或超出大小上限")); return
```

**实现时先读这两处上传 handler 的原变量名/后续用法，保持一致。**

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_body_limit.py tests/test_server_pmis_upload.py tests/test_server_inputs_upload.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.py tests/test_body_limit.py
git commit -m "fix(server): JSON/上传 body 大小上限护栏(防超大body撑爆内存) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `_sse_write` 断连守卫 + 2 个 SSE 循环接入

**背景**：`handle_pmis_download`（write 在 1809）与 `handle_reprocess`（write 在 1832）的 SSE 推送循环里 `self.wfile.write(...)` 未捕获 `BrokenPipeError`/`ConnectionResetError`，客户端提前断开会抛未捕获异常、handler 线程异常退出、日志留 traceback。

**Files:**
- Modify: `server.py`（新增 `_sse_write`；2 个 SSE 循环接入）
- Test: `tests/test_sse_write.py`（新建）

**Interfaces:**
- Produces: `_sse_write(self, text: str) -> bool`——把 `text` 编码写 `self.wfile` 并 flush；遇 `BrokenPipeError`/`ConnectionResetError`/`OSError` 返回 `False`（不抛），正常返回 `True`。

- [ ] **Step 1: Write the failing test**

```python
# tests/test_sse_write.py
import server


class _DeadPipe:
    def write(self, *_):
        raise BrokenPipeError("client gone")
    def flush(self):
        pass


class _OkPipe:
    def __init__(self):
        self.buf = b""
    def write(self, b):
        self.buf += b
    def flush(self):
        pass


class _Req:
    def __init__(self, wfile):
        self.wfile = wfile


def test_sse_write_swallows_broken_pipe():
    req = _Req(_DeadPipe())
    assert server.CustomHandler._sse_write(req, "data: x\n\n") is False   # 不抛


def test_sse_write_ok_returns_true():
    ok_pipe = _OkPipe()
    req = _Req(ok_pipe)
    assert server.CustomHandler._sse_write(req, "data: x\n\n") is True
    assert b"data: x" in ok_pipe.buf
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_sse_write.py -q`
Expected: FAIL（`_sse_write` 未定义）

- [ ] **Step 3: Write minimal implementation**

新增助手（放 SSE 相关 handler 附近）：

```python
    def _sse_write(self, text):
        """SSE 推送一段文本;客户端断开→返回 False 不抛(供循环 break)。"""
        try:
            self.wfile.write(text.encode('utf-8'))
            self.wfile.flush()
            return True
        except (BrokenPipeError, ConnectionResetError, OSError):
            return False
```

把 `handle_pmis_download`（1808-1813 循环）与 `handle_reprocess`（1831-1836 循环）里的 `self.wfile.write(...)`（+紧邻的 flush）替换为 `if not self._sse_write(<原文本>): break`。**实现时先读两处原 write 拼的 SSE 文本格式（`data: {...}\n\n` 之类），照原样传入 `_sse_write`，勿改协议格式。**

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_sse_write.py tests/test_server_download.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.py tests/test_sse_write.py
git commit -m "fix(server): SSE 推送断连守卫(客户端断开不再抛未捕获异常) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Phase B — FollowupStore domain 泛型（公共 API 不变,既有单测绿）

### Task 5: 新建 `followup_store.py` 泛型模块 + 单测

**背景**：temp/opportunity/risk/payment_key 四个领域模块约 90% 逐字相同，差异 = 进展字段 / 有无子表 group / 归档是否清 current / 默认范围。抽泛型承载共同逻辑。

**Files:**
- Create: `followup_store.py`
- Test: `tests/test_followup_store.py`（新建）

**Interfaces:**
- Produces:
  - `class FollowupConfig(progress_fields: tuple, scope_groups: tuple | None = None, clear_on_archive: bool = True, default_scope: dict | None = None)`
  - `new_store(cfg) -> dict`、`normalize_scope(cfg, scope) -> dict`、`apply_update(cfg, store, key, field, content, account, now) -> dict`、`apply_archive(cfg, store, rows, now) -> None`、`apply_archive_delete(store, idx) -> bool`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_followup_store.py
import followup_store as fs


def _grouped():
    return fs.FollowupConfig(progress_fields=('weekProgress', 'nextPlan'),
                             scope_groups=('project', 'paymentNode', 'milestone'), clear_on_archive=True)


def _single_retain():
    return fs.FollowupConfig(progress_fields=('followAction', 'revConclusion', 'nextRevDate'),
                             scope_groups=None, clear_on_archive=False)


def test_new_store_default_scope_empty():
    assert fs.new_store(_grouped())["scope"] == {"combinator": "AND", "groups": []}


def test_new_store_custom_default_scope_deepcopied():
    ds = {"combinator": "AND", "groups": [{"combinator": "AND", "conditions": []}]}
    cfg = fs.FollowupConfig(progress_fields=('x',), default_scope=ds)
    s = fs.new_store(cfg)
    s["scope"]["groups"].append("mutate")
    assert ds["groups"] == [{"combinator": "AND", "conditions": []}]   # 深拷贝,原对象不被改


def test_normalize_grouped_drops_condition_without_valid_group():
    cfg = _grouped()
    scope = {"combinator": "AND", "groups": [{"combinator": "AND", "conditions": [
        {"group": "project", "field": "customer", "op": "in", "values": [1, 2]},
        {"group": "BAD", "field": "x", "op": "in"},        # 无效 group → 丢
        {"field": "noGroup", "op": "in"},                  # 缺 group → 丢
    ]}]}
    out = fs.normalize_scope(cfg, scope)
    conds = out["groups"][0]["conditions"]
    assert len(conds) == 1 and conds[0]["group"] == "project" and conds[0]["values"] == ["1", "2"]


def test_normalize_single_table_keeps_condition_without_group():
    cfg = _single_retain()
    scope = {"combinator": "OR", "groups": [{"combinator": "AND", "conditions": [
        {"field": "riskLevel", "op": "in", "values": ["高"]},
    ]}]}
    out = fs.normalize_scope(cfg, scope)
    c = out["groups"][0]["conditions"][0]
    assert "group" not in c and c["field"] == "riskLevel" and out["combinator"] == "OR"


def test_apply_update_stamps_and_rejects_bad_field():
    cfg = _grouped()
    store = fs.new_store(cfg)
    rec = fs.apply_update(cfg, store, "P1", "weekProgress", "内容", "admin", "2026-07-03")
    assert rec["weekProgress"] == "内容" and rec["weekProgressEditBy"] == "admin" and rec["weekProgressEditTime"] == "2026-07-03"
    import pytest
    with pytest.raises(ValueError):
        fs.apply_update(cfg, store, "P1", "badField", "x", "admin", "t")


def test_apply_archive_clear_vs_retain():
    grouped = _grouped()          # clear
    s1 = fs.new_store(grouped); s1["current"] = {"P1": {"weekProgress": "a"}}
    fs.apply_archive(grouped, s1, [{"row": 1}], "t")
    assert s1["current"] == {} and len(s1["archives"]) == 1

    retain = _single_retain()     # retain
    s2 = fs.new_store(retain); s2["current"] = {"K1": {"followAction": "b"}}
    fs.apply_archive(retain, s2, [{"row": 1}], "t")
    assert s2["current"] == {"K1": {"followAction": "b"}} and len(s2["archives"]) == 1


def test_apply_archive_delete_bounds():
    cfg = _grouped()
    store = fs.new_store(cfg); store["archives"] = [{"a": 1}, {"a": 2}]
    assert fs.apply_archive_delete(store, 5) is False and len(store["archives"]) == 2
    assert fs.apply_archive_delete(store, 0) is True and store["archives"] == [{"a": 2}]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_followup_store.py -q`
Expected: FAIL（`followup_store` 模块不存在）

- [ ] **Step 3: Write minimal implementation**

创建 `followup_store.py`：

```python
"""通用重点跟进 store 领域逻辑:范围规整 + 进展/跟进编辑 + 归档。
5 套(temp/opportunity/risk/paykey)差异参数化为 FollowupConfig。progress 无 scope,不并入。"""
from __future__ import annotations
import copy
from typing import Any, Dict, List, Optional, Tuple

_COMBINATORS = ('AND', 'OR')
_OPS = ('in', 'notIn', 'between', 'notBetween', 'contains', 'notContains')


class FollowupConfig:
    def __init__(self, progress_fields: Tuple[str, ...],
                 scope_groups: Optional[Tuple[str, ...]] = None,
                 clear_on_archive: bool = True,
                 default_scope: Optional[Dict[str, Any]] = None):
        self.progress_fields = tuple(progress_fields)
        self.scope_groups = tuple(scope_groups) if scope_groups is not None else None
        self.clear_on_archive = clear_on_archive
        self.default_scope = default_scope if default_scope is not None else {"combinator": "AND", "groups": []}


def new_store(cfg: FollowupConfig) -> Dict[str, Any]:
    return {"version": 1, "scope": copy.deepcopy(cfg.default_scope), "current": {}, "archives": []}


def _norm_combinator(v: Any) -> str:
    return v if v in _COMBINATORS else 'AND'


def _norm_condition(cfg: FollowupConfig, c: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(c, dict):
        return None
    if cfg.scope_groups is not None and c.get('group') not in cfg.scope_groups:
        return None
    field = c.get('field')
    if not isinstance(field, str) or not field:
        return None
    op = c.get('op') if c.get('op') in _OPS else 'in'
    out: Dict[str, Any] = ({"group": c['group'], "field": field, "op": op}
                           if cfg.scope_groups is not None else {"field": field, "op": op})
    if isinstance(c.get('values'), list):
        out['values'] = [str(x) for x in c['values']]
    if c.get('min') is not None:
        out['min'] = c['min']
    if c.get('max') is not None:
        out['max'] = c['max']
    return out


def normalize_scope(cfg: FollowupConfig, scope: Any) -> Dict[str, Any]:
    default = {"combinator": "AND", "groups": []}
    if not isinstance(scope, dict):
        return default
    groups_raw = scope.get('groups')
    if not isinstance(groups_raw, list):
        return default
    groups: List[Dict[str, Any]] = []
    for g in groups_raw:
        if not isinstance(g, dict):
            continue
        conds_raw = g.get('conditions')
        conds = [nc for nc in (_norm_condition(cfg, c) for c in conds_raw) if nc] if isinstance(conds_raw, list) else []
        groups.append({"combinator": _norm_combinator(g.get('combinator')), "conditions": conds})
    return {"combinator": _norm_combinator(scope.get('combinator')), "groups": groups}


def apply_update(cfg: FollowupConfig, store, key, field, content, account, now) -> Dict[str, Any]:
    if field not in cfg.progress_fields:
        raise ValueError("invalid field: %s" % field)
    rec = store.setdefault('current', {}).setdefault(key, {})
    rec[field] = content
    rec[field + 'EditTime'] = now
    rec[field + 'EditBy'] = account
    return rec


def apply_archive(cfg: FollowupConfig, store, rows, now) -> None:
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
    if cfg.clear_on_archive:
        store['current'] = {}


def apply_archive_delete(store, idx) -> bool:
    archives = store.setdefault('archives', [])
    if not isinstance(idx, int) or idx < 0 or idx >= len(archives):
        return False
    del archives[idx]
    return True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_followup_store.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add followup_store.py tests/test_followup_store.py
git commit -m "feat(followup): 新增 followup_store.py 泛型(配置化5套差异) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 迁移 temp_followup + opportunity_followup 为薄配置

**背景**：把两个"归档清 current"的领域模块（temp 有 group、opportunity 单表 + 非空 DEFAULT_SCOPE）改为薄封装 followup_store，公共 API（`normalize_scope(scope)`/`apply_update(store,key,field,content,account,now)`/`apply_archive(store,rows,now)`/`apply_archive_delete(store,idx)`/`new_store()`/`PROGRESS_FIELDS`/`SCOPE_GROUPS`）字节不变 → server.py 与既有单测不动。

**Files:**
- Modify: `temp_followup.py`（整体重写为薄配置）、`opportunity_followup.py`（同）
- Test: 既有 `tests/test_temp_followup.py`、`tests/test_opportunity_followup.py`（不改，必须仍绿）

**Interfaces:**
- Consumes: `followup_store`（Task 5）。
- Produces: 两模块公共符号不变。`temp_followup`：`PROGRESS_FIELDS=('weekProgress','nextPlan')`、`SCOPE_GROUPS=('project','paymentNode','milestone')`。`opportunity_followup`：`PROGRESS_FIELDS=('weekProgress','nextPlan')`、`DEFAULT_SCOPE`（原 12-20 行内容不变）、单表无 SCOPE_GROUPS。

- [ ] **Step 1: Run existing tests to establish green baseline**

Run: `python -m pytest tests/test_temp_followup.py tests/test_opportunity_followup.py -q`
Expected: PASS（迁移前基线；迁移后必须仍全 PASS——这两文件是本任务的回归网，不修改它们）

- [ ] **Step 2: 重写 temp_followup.py 为薄配置**

```python
"""临时重点跟进(/projects/temp)领域:薄封装 followup_store(分组 scope,归档清 current)。"""
from __future__ import annotations
from typing import Any, Dict
import followup_store as _fs

PROGRESS_FIELDS = ('weekProgress', 'nextPlan')
SCOPE_GROUPS = ('project', 'paymentNode', 'milestone')
_CFG = _fs.FollowupConfig(progress_fields=PROGRESS_FIELDS, scope_groups=SCOPE_GROUPS, clear_on_archive=True)


def new_store() -> Dict[str, Any]:
    return _fs.new_store(_CFG)


def normalize_scope(scope: Any) -> Dict[str, Any]:
    return _fs.normalize_scope(_CFG, scope)


def apply_update(store, project_id, field, content, account, now) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, store, project_id, field, content, account, now)


def apply_archive(store, rows, now) -> None:
    _fs.apply_archive(_CFG, store, rows, now)


def apply_archive_delete(store, idx) -> bool:
    return _fs.apply_archive_delete(store, idx)
```

- [ ] **Step 3: 重写 opportunity_followup.py 为薄配置**（保留原 DEFAULT_SCOPE 内容）

```python
"""重点商机跟进(/opportunities/key)领域:薄封装 followup_store(单表,归档清 current,非空默认范围)。"""
from __future__ import annotations
from typing import Any, Dict
import followup_store as _fs

PROGRESS_FIELDS = ('weekProgress', 'nextPlan')

# 默认范围:TOP1000 & 提前介入 & 重点商机 & 状态非赢单(单组四条 AND) —— 原内容不变
DEFAULT_SCOPE: Dict[str, Any] = {
    "combinator": "AND",
    "groups": [{"combinator": "AND", "conditions": [
        {"field": "top1000", "op": "in", "values": ["TOP1000"]},
        {"field": "earlyIntervene", "op": "in", "values": ["是"]},
        {"field": "keyOpp", "op": "in", "values": ["是"]},
        {"field": "status", "op": "notIn", "values": ["赢单"]},
    ]}],
}
_CFG = _fs.FollowupConfig(progress_fields=PROGRESS_FIELDS, scope_groups=None,
                          clear_on_archive=True, default_scope=DEFAULT_SCOPE)


def new_store() -> Dict[str, Any]:
    return _fs.new_store(_CFG)


def normalize_scope(scope: Any) -> Dict[str, Any]:
    return _fs.normalize_scope(_CFG, scope)


def apply_update(store, opp_id, field, content, account, now) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, store, opp_id, field, content, account, now)


def apply_archive(store, rows, now) -> None:
    _fs.apply_archive(_CFG, store, rows, now)


def apply_archive_delete(store, idx) -> bool:
    return _fs.apply_archive_delete(store, idx)
```

- [ ] **Step 4: Run tests to verify no regression**

Run: `python -m pytest tests/test_temp_followup.py tests/test_opportunity_followup.py tests/test_server_temp_followup.py tests/test_server_opportunity_followup.py -q`
Expected: PASS（公共 API 不变,既有单测 + server 读写测试全绿）

- [ ] **Step 5: Commit**

```bash
git add temp_followup.py opportunity_followup.py
git commit -m "refactor(followup): temp/opportunity 领域改薄封装 followup_store(公共API不变) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 迁移 risk_followup + payment_key_followup 为薄配置（归档留存）

**背景**：两个"归档不清 current（跟进留存）"的领域模块——risk 单表、paykey 有 group——同样改薄封装。`clear_on_archive=False` 是与 Task 6 的关键差异。

**Files:**
- Modify: `risk_followup.py`（整体重写）、`payment_key_followup.py`（同）
- Test: 既有 `tests/test_risk_followup.py`、`tests/test_payment_key_followup.py`（不改,必须仍绿）

**Interfaces:**
- Produces：`risk_followup`：`PROGRESS_FIELDS=('followAction','revConclusion','nextRevDate')`、单表无 SCOPE_GROUPS、`clear_on_archive=False`。`payment_key_followup`：同 PROGRESS_FIELDS、`SCOPE_GROUPS=('project','paymentNode','milestone')`、`clear_on_archive=False`。

- [ ] **Step 1: Run existing tests to establish green baseline**

Run: `python -m pytest tests/test_risk_followup.py tests/test_payment_key_followup.py -q`
Expected: PASS（迁移前基线）

- [ ] **Step 2: 重写 risk_followup.py**

```python
"""风险跟进(/risk)领域:薄封装 followup_store(单表,归档留存 current)。"""
from __future__ import annotations
from typing import Any, Dict
import followup_store as _fs

PROGRESS_FIELDS = ('followAction', 'revConclusion', 'nextRevDate')
_CFG = _fs.FollowupConfig(progress_fields=PROGRESS_FIELDS, scope_groups=None, clear_on_archive=False)


def new_store() -> Dict[str, Any]:
    return _fs.new_store(_CFG)


def normalize_scope(scope: Any) -> Dict[str, Any]:
    return _fs.normalize_scope(_CFG, scope)


def apply_update(store, risk_key, field, content, account, now) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, store, risk_key, field, content, account, now)


def apply_archive(store, rows, now) -> None:
    _fs.apply_archive(_CFG, store, rows, now)


def apply_archive_delete(store, idx) -> bool:
    return _fs.apply_archive_delete(store, idx)
```

- [ ] **Step 3: 重写 payment_key_followup.py**（与 risk 同,仅 SCOPE_GROUPS 有值）

```python
"""回款重点跟进(/payment/key)领域:薄封装 followup_store(分组 scope,归档留存 current)。"""
from __future__ import annotations
from typing import Any, Dict
import followup_store as _fs

PROGRESS_FIELDS = ('followAction', 'revConclusion', 'nextRevDate')
SCOPE_GROUPS = ('project', 'paymentNode', 'milestone')
_CFG = _fs.FollowupConfig(progress_fields=PROGRESS_FIELDS, scope_groups=SCOPE_GROUPS, clear_on_archive=False)


def new_store() -> Dict[str, Any]:
    return _fs.new_store(_CFG)


def normalize_scope(scope: Any) -> Dict[str, Any]:
    return _fs.normalize_scope(_CFG, scope)


def apply_update(store, project_id, field, content, account, now) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, store, project_id, field, content, account, now)


def apply_archive(store, rows, now) -> None:
    _fs.apply_archive(_CFG, store, rows, now)


def apply_archive_delete(store, idx) -> bool:
    return _fs.apply_archive_delete(store, idx)
```

- [ ] **Step 4: Run tests to verify no regression**

Run: `python -m pytest tests/test_risk_followup.py tests/test_payment_key_followup.py -q && python -m pytest -q`
Expected: PASS（两领域单测 + 全仓不回归——确认归档留存语义未变）

- [ ] **Step 5: Commit**

```bash
git add risk_followup.py payment_key_followup.py
git commit -m "refactor(followup): risk/paykey 领域改薄封装 followup_store(归档留存,公共API不变) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Phase C — 处理器统一（先补安全网,再收敛写处理器）

### Task 8: 补 risk/paykey 处理器族 characterization 端点测试（安全网）

**背景**：Phase C 要动 followup 写处理器。现有 server 端点测试覆盖 temp/opportunity/progress，但 **risk/paykey 缺处理器层端点测试**。用 `test_server_authz.py` 的 live-HTTP 脚手架（起真实 ThreadingHTTPServer + http.client + 登录 cookie）补 risk/paykey 的 get/update/archive 往返 characterization 测试，作为 Task 9 的回归网。

**Files:**
- Create: `tests/test_server_risk_paykey_followup.py`
- 参考脚手架：`tests/test_server_authz.py:1-40`（`_write_accounts`/`_login`/`_status`）、`tests/test_server_download.py`（起 server fixture 的写法）

**Interfaces:**
- Consumes: 现有 `server.create_server` / `test_server_authz` 的登录 helper 模式。

- [ ] **Step 1: 读脚手架确认起 server 的确切写法**

Run: `python -m pytest tests/test_server_authz.py -q`（确认脚手架可用）
读 `tests/test_server_authz.py` 与 `tests/test_server_download.py` 顶部，抄它们起 server（`ThreadingHTTPServer` 在后台线程 + 取端口）+ 登录取 cookie 的 fixture 写法。

- [ ] **Step 2: 写 characterization 测试（先跑绿——刻画现状,不是 red）**

对 risk 与 paykey 各写：登录超管 → POST `/api/{risk-followup,payment-key-followup}/update`（单格编辑，body `{riskKey|projectId, field, content}`）→ GET 同资源断言 current 里有该编辑 → POST `/api/.../archive`（body `{rows:[...]}`）→ GET 断言 archives 增加且 **current 仍保留**（risk/paykey 归档不清空，与 Task 7 语义一致）。用 `monkeypatch` 把 `RISK_FOLLOWUP_FILE`/`PAYKEY_FOLLOWUP_FILE` 指向 tmp。

示例骨架（按脚手架补全起 server 部分）：

```python
import json, http.client
import server, auth
# ...(照 test_server_authz 起 server + _write_accounts + _login + _status)...

def test_risk_followup_update_then_archive_retains_current(tmp_path, monkeypatch, running_server):
    port, _ = running_server
    monkeypatch.setattr(server, "RISK_FOLLOWUP_FILE", str(tmp_path / "risk.json"))
    conn, cookie = _login(port, "super")
    # update
    st = _status(conn, "POST", "/api/risk-followup/update", cookie,
                 json.dumps({"riskKey": "R1", "field": "followAction", "content": "推进"}))
    assert st == 200
    # get 断言 current 有编辑
    body = _get_json(conn, "/api/risk-followup", cookie)
    assert body["current"]["R1"]["followAction"] == "推进"
    # archive 后 current 仍在(留存)
    _status(conn, "POST", "/api/risk-followup/archive", cookie, json.dumps({"rows": [{"r": 1}]}))
    body2 = _get_json(conn, "/api/risk-followup", cookie)
    assert len(body2["archives"]) == 1 and body2["current"]["R1"]["followAction"] == "推进"
```

（`_get_json` 为读 GET 响应 JSON 的小助手，按脚手架补。paykey 同构一份。）

- [ ] **Step 3: Run to verify green (刻画现状)**

Run: `python -m pytest tests/test_server_risk_paykey_followup.py -q`
Expected: PASS（刻画当前正确行为；Task 9 重构后必须仍 PASS）

- [ ] **Step 4: Commit**

```bash
git add tests/test_server_risk_paykey_followup.py
git commit -m "test(server): 补 risk/paykey followup 处理器族 characterization 端点测试(Phase C 安全网) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: `_followup_txn` 事务助手 + 写处理器收敛（事务锁 + 原子写 + 错误状态一处生效）

**背景**：4 套 followup + progress + tags 的写处理器都是 `store=_load(); mutate; _save(store)`，读-改-写未被锁包住（并发丢更新），且内部异常分支用 `_json_response`（恒 200）而非 `_send_json(500)`。抽 `_followup_txn` 把"锁 + load + mutate + 原子 save + 统一错误状态"收敛到一处，写处理器改为委派。

**Files:**
- Modify: `server.py`（新增 `_followup_txn`；改 followup/progress/tags 的 update/archive/archive-delete/scope 写处理器；4 个直写 `_save_*` 去掉自身锁，锁交由 `_followup_txn` 持有）
- Test: `tests/test_followup_txn.py`（新建，测助手）;回归网 = Task 8 + 既有 server 读写测试

**Interfaces:**
- Produces: `CustomHandler._followup_txn(self, lock, load_fn, mutate_fn, save_fn) -> tuple[bool, Any]`——`with lock: store=load_fn(); result=mutate_fn(store); save_fn(store)`；成功返回 `(True, result)`；`mutate_fn` 抛 `ValueError` 返回 `(False, <校验错误消息>)`（handler 转 400），其它异常返回 `(False, <内部错误>)`（handler 转 500）。**注意**：所有 store 的 `_save_*` 在本任务改为不自持锁（锁由 `_followup_txn` 的 `with lock` 统一持有，避免非重入 Lock 死锁）。

- [ ] **Step 1: Write the failing test（测助手）**

```python
# tests/test_followup_txn.py
import threading
import server


class _H:  # 借用 CustomHandler 未绑定方法,构造最小 self
    pass


def test_followup_txn_success_saves_and_returns():
    saved = {}
    lock = threading.Lock()
    ok, res = server.CustomHandler._followup_txn(
        _H(), lock,
        load_fn=lambda: {"current": {}},
        mutate_fn=lambda s: s.setdefault("current", {}).setdefault("K", {"x": 1}),
        save_fn=lambda s: saved.update(s))
    assert ok is True and res == {"x": 1} and saved["current"]["K"] == {"x": 1}


def test_followup_txn_valueerror_is_validation():
    def boom(_s):
        raise ValueError("bad field")
    ok, msg = server.CustomHandler._followup_txn(_H(), threading.Lock(),
                                                 lambda: {}, boom, lambda _s: None)
    assert ok is False and "bad field" in str(msg)


def test_followup_txn_other_error_is_internal():
    def boom(_s):
        raise RuntimeError("disk full")
    ok, msg = server.CustomHandler._followup_txn(_H(), threading.Lock(),
                                                 lambda: {}, boom, lambda _s: None)
    assert ok is False and msg is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_followup_txn.py -q`
Expected: FAIL（`_followup_txn` 未定义）

- [ ] **Step 3: Write minimal implementation + 迁移写处理器**

新增助手（放 `_read_json_body` 附近），并区分 ValueError（校验）与其它（内部）：

```python
    def _followup_txn(self, lock, load_fn, mutate_fn, save_fn):
        """事务:锁内 load→mutate→原子 save。ValueError→(False,校验消息);其它→(False,内部错)。"""
        try:
            with lock:
                store = load_fn()
                result = mutate_fn(store)
                save_fn(store)
            return True, result
        except ValueError as e:
            return False, str(e)
        except Exception as e:  # noqa: BLE001
            logger.error("followup txn 失败: %s", e, exc_info=True)
            return False, None
```

把 followup/progress 的 update 处理器改为委派。以 `handle_progress_update`（1150-1172）为模板：

```python
    def handle_progress_update(self):
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        pid = str(data.get('projectId') or '').strip()
        field = data.get('field')
        if not pid or field not in PROGRESS_FIELDS:
            self._send_json(400, _error_payload(ERR_VALIDATION, "projectId 必填、field 须为 weekProgress/nextPlan")); return
        account = auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))
        if not account:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期")); return
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ok, res = self._followup_txn(
            _progress_lock, _load_progress,
            lambda s: _progress_apply_update(s, pid, field, str(data.get('content') or ''), account, now),
            _save_progress)
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL, res or "保存进展失败")); return
        self._json_response({"success": True, "record": res})
```

按同一模式迁移这些**写**处理器（各用自己的 lock/load/apply/save 与 key 字段）：
- temp：`handle_temp_followup_update`(1236)、`handle_temp_followup_archive`(1260)、`handle_temp_followup_archive_delete`(1278)、`handle_temp_followup_scope`(1222) → 用 `_temp_lock`/`_load_temp_followup`/`_temp.apply_*`/`_save_temp_followup`
- opportunity：`handle_opportunity_followup_update`(1322)、archive(1346)、archive_delete(1364)、scope(1308) → `_opp_followup_lock`/`_load_opportunity_followup`/`_oppf.*`/`_save_opportunity_followup`
- risk：update(1408)、archive(1432)、archive_delete(1450)、scope(1394) → `_risk_lock`/`_load_risk_followup`/`_riskfu.*`/`_save_risk_followup`
- paykey：update(1494)、archive(1518)、archive_delete(1536)、scope(1480) → `_paykey_lock`/`_load_paykey_followup`/`_paykey.*`/`_save_paykey_followup`
- progress：update(1150,上例)、archive(1174)、archive_delete(1192) → `_progress_lock`/`_load_progress`/`_progress_apply_*`/`_save_progress`
- tags：`handle_tags_save`（约 1125） → `_tags_lock`/`_load_project_tags`/`_save_project_tags`

**关键：去掉 4 个直写 `_save_*`（followup_records/tags/progress/temp）里可能残留的 `with _x_lock`**（若 Task 1 改后仍在函数内自锁）——锁改由 `_followup_txn` 的 `with lock` 统一持有，避免非重入 Lock 死锁。晚期 4 个原子 `_save_*`（opp/risk/paykey/opportunities）同样确认其内部**不再**自持对应 lock（把自持锁移除，锁语义上移到事务层）。逐个迁移后即时跑该套的测试。

**archive_delete 特例**：`apply_archive_delete` 返回 `bool`（越界 False）。迁移时 mutate_fn 返回该 bool，`res is False` 时 handler 回 400「archiveIdx 超出范围」（非 500）——保持原语义，实现时对 archive_delete 处理器单独判 `res`。

- [ ] **Step 4: Run tests to verify it passes**

Run: `python -m pytest tests/test_followup_txn.py tests/test_server_risk_paykey_followup.py tests/test_server_temp_followup.py tests/test_server_opportunity_followup.py tests/test_server_progress.py tests/test_server_tags.py tests/test_archive_delete.py tests/test_server_key_progress.py -q && python -m pytest -q`
Expected: PASS（Task 8 安全网 + 所有既有 followup/progress/tags 端点测试 + 全仓不回归）

- [ ] **Step 5: Commit**

```bash
git add server.py tests/test_followup_txn.py
git commit -m "refactor(server): _followup_txn 收敛写处理器(事务锁+原子写+错误状态一处生效) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **Phase C 风险提示（执行者/控制者注意）**：本任务是全批最高风险改动（触碰 6 个域的写处理器 + 锁语义上移）。逐套迁移、每套迁完即跑该套端点测试再迁下一套，不要一次性替换全部。若某套迁移后端点测试红，回退该套、单独排查。控制者内联审查须逐套核对 lock/load/save/key 字段配对无错位。

---

## Phase D — 解析告警 + 死代码 + 批1 minor + 收尾

### Task 10: 收款台账 / PMIS 解析失败计数告警

**背景**：`collection_stages.py:15-51` 三个解析器（`_num`/`_ms_to_date`/`_pct`）静默降级（失败→0/''/None），PMIS 导出格式漂移会整体静默错数；`pmis.py:75-77` `read_pmis_sheet` 损坏文件 `except: return []` 不区分"没给文件"与"文件坏了"。给解析失败计数并上报到 `dataQuality`（治理告警）。

**Files:**
- Modify: `collection_stages.py`（解析失败计数）、`preprocess_data.py`（把计数并入 `dataQuality`）、`pmis.py:75-77`（损坏文件告警日志）
- Test: `tests/test_collection_stages.py`（若无则新建）

**Interfaces:**
- Produces: `collection_stages` 解析入口返回值附带 `parse_errors: {amount:int, date:int, ratio:int}`（或经模块级计数器暴露）；`preprocess_data` 把它写进 `analysis_data.json` 的 `dataQuality.collectionParseErrors`。**具体形状实现时对齐 `collection_stages` 现有解析入口函数签名**（先 `grep -n "def " collection_stages.py` 看主入口是 `load_*` 还是逐行 map）。

- [ ] **Step 1: 读 collection_stages 主入口确定接口点**

Run: `grep -n "def \|_num\|_ms_to_date\|_pct" collection_stages.py`
据此决定计数挂在哪个函数返回值（保持纯函数,计数随返回值出，不用全局可变状态）。

- [ ] **Step 2: Write the failing test**

```python
# tests/test_collection_stages.py (新增或追加)
import collection_stages as cs

def test_num_parse_failure_counted():
    # 千分位/非数字应计为一次金额解析失败(不再静默→0)
    # 依据 Step 1 的实际入口调整:此处示意计数可见
    assert cs._num("1,234.5") == 0.0        # 现状:失败→0(本任务不改数值语义,仅加可见计数)
    # 若引入计数器 API,断言其 +1;否则测主入口返回的 parse_errors
```

（Step 1 后据实把断言指向真实计数出口——若决定最小改动=仅在主入口累计并入 dataQuality，则测主入口返回的 `parse_errors` 字典。）

- [ ] **Step 3: Run test to verify it fails / Step 4: 实现并通过**

实现：在 `collection_stages` 主解析入口累计三类失败次数并随返回值返回；`preprocess_data` 主管线把它并入 `dataQuality.collectionParseErrors`（`dataQuality` 是 `extra=allow`，加键不改 schema）；`pmis.read_pmis_sheet` 的 `except` 分支加 `logger.warning("PMIS 表读取失败(可能损坏/加密): %s", path)` 区分空文件与坏文件。
Run: `python -m pytest tests/test_collection_stages.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add collection_stages.py preprocess_data.py pmis.py tests/test_collection_stages.py
git commit -m "feat(pipeline): 收款台账/PMIS解析失败计数告警(dataQuality.collectionParseErrors) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **注**：`dataQuality` 加告警字段属 `extra=allow`、不改 pydantic schema 结构，故本批**升级仍不需点更新数据**（除非实现时改了 preprocess 主口径——不应改）。执行时确认未触碰 schema.py。

---

### Task 11: 死代码清理（compare_payment_sources + preprocess_data 退役半文件）

**背景**：`compare_payment_sources.py` 是一次性诊断脚本（硬依赖已退役 xlsx，`main()` 必 FileNotFoundError），仍进 make_deploy_zip 清单、被 `tests/test_payment_compare.py` 保活；`preprocess_data.py:34-297` 是 yundocs 退役后的死代码（`parse_header_and_data`/`assign_tier`/`parse_amount`/`compute_node_status` 等，活 `main()` 不调用，仅测试保活；`compute_node_status:285` 还引用死常量 `STATUS_FULL_PAID`）。

**Files:**
- Delete: `compare_payment_sources.py`、`tests/test_payment_compare.py`
- Modify: `preprocess_data.py`（删 34-297 段确认无 `main()` 引用的函数）、删对应测试 `tests/test_assign_tier.py`/`tests/test_compute_node_status.py`（及 `tests/test_preprocess.py` 中仅测这些死函数的用例）
- Modify: `make_deploy_zip.py`（TOP_FILES 去掉 `compare_payment_sources.py`）

- [ ] **Step 1: 逐个确证"活 main() 不引用"**

Run: `grep -n "def main\|compare_payment\|parse_header_and_data\|assign_tier\|compute_node_status\|parse_amount\|excel_serial_to_date\|is_yes\|get_month\|_parse_completion" preprocess_data.py`
对每个候选死函数：`grep -rn "<name>" *.py | grep -v test_ | grep -v "def <name>"` 确认只有定义、无活代码调用（`.claude/worktrees/` 命中不算——是陈旧副本）。**只删确证无活引用的**；有任何活引用的保留并在报告说明。

- [ ] **Step 2: 删除死代码 + 对应测试**

删 `compare_payment_sources.py` 与 `tests/test_payment_compare.py`；删 preprocess_data.py 中 Step 1 确证的死函数；删仅覆盖这些死函数的测试文件/用例。

- [ ] **Step 3: Run full suite**

Run: `python -m pytest -q`
Expected: PASS（删除后无 import 错、无遗留引用）

- [ ] **Step 4: 改打包清单**

`make_deploy_zip.py` 的 `TOP_FILES` 去掉 `"compare_payment_sources.py"`。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 清理死代码(compare_payment_sources+preprocess退役函数)及其测试 (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: 批1 opus 两条 minor（collection_stages 状态常量 + snapshots 契约 + paymentBand 注释）

**背景**：批1 opus 终审留 2 条——(1) `snapshots.py:217` 硬编码裸字面量 `"已回款"` 与 `collection_stages.stage_status` 软耦合（与批1 修的 `STATUS_FULL_PAID` 孤儿常量同类隐患），建议建 config 常量共享 + status 字面量契约测试；(2) `overview.ts` paymentBand 注释"与 computeKpis 同源"易误解为全时，需澄清"共享项目集/异常排除,年度分子仍按本年过滤"。

**Files:**
- Modify: `config.py`（新增 `collection_stages.stage_status` 的状态常量）、`collection_stages.py`（stage_status 用常量）、`snapshots.py:217`（用常量）、`frontend/src/lib/overview.ts`（注释澄清）
- Test: `tests/test_status_contract.py`（新建，字面量契约）

**Interfaces:**
- Produces: `config.STAGE_STATUS_PAID = "已回款"`（及其余 4 态常量：部分回款/质保期/延期/待回款，若一并规整）。

- [ ] **Step 1: Write the failing test（字面量契约）**

```python
# tests/test_status_contract.py
import config
import collection_stages as cs
import snapshots


def test_stage_status_paid_constant_shared():
    # collection_stages.stage_status 的"已回款"取值 == snapshots 判定用的同一常量
    assert config.STAGE_STATUS_PAID == "已回款"


def test_paid_transition_emits_complete_event_via_constant():
    base = [{"projectId": "P-1", "projectName": "甲"}]
    a = {"P-1": [{"stage": "初验款", "planDate": "2026-03-31", "receivedAmount": 0,
                  "expectedPayment": 500000, "unpaidAmount": 500000, "status": "待回款"}]}
    b = {"P-1": [{"stage": "初验款", "planDate": "2026-03-31", "receivedAmount": 500000,
                  "expectedPayment": 500000, "unpaidAmount": 0, "status": config.STAGE_STATUS_PAID}]}
    evs = snapshots.diff_snapshots(snapshots.build_snapshot("2026-06-01", base, {}, a),
                                   snapshots.build_snapshot("2026-06-11", base, {}, b))
    assert any(e["type"] == "回款完成" for e in evs)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_status_contract.py -q`
Expected: FAIL（`config.STAGE_STATUS_PAID` 未定义）

- [ ] **Step 3: Write minimal implementation**

`config.py` 加：`STAGE_STATUS_PAID = "已回款"`（若一并规整 5 态：`STAGE_STATUS_PARTIAL="部分回款"` 等）。`collection_stages.py` 的 `stage_status`（58-65）返回值改用常量。`snapshots.py:217` 的 `elif sb == "已回款":` 改 `elif sb == config.STAGE_STATUS_PAID:`。前端 `overview.ts` paymentBand 注释（约 92-94/115 行）把"与 computeKpis 同源"改为"共享项目集与异常排除;年度分子仍按本年(startsWith(year))过滤,与 /payment 已回款(全时)口径不同"。

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_status_contract.py tests/test_snapshots.py tests/test_collection_stages.py -q && cd frontend && npm run typecheck`
Expected: PASS + typecheck 干净（注释改动无功能影响）

- [ ] **Step 5: Commit**

```bash
git add config.py collection_stages.py snapshots.py frontend/src/lib/overview.ts tests/test_status_contract.py
git commit -m "refactor: stage_status 建 config 常量共享+字面量契约测试;paymentBand 注释澄清(批1 opus minor) (V2.6.8 批2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: bump V2.6.8 + 全量验收 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: bump 版本**

`version.ts`：`APP_VERSION = 'V2.6.8'`、`RELEASE_DATE`（实现时用实际日期，勿用占位）。

- [ ] **Step 2: 全量验收**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 3: 真机冒烟（server.py 改动须先重启进程）**

`python server.py`（重启）后：五跟进页（temp/opportunity/risk/paykey + progress）get/update/archive/删除全通、risk/paykey 归档后 current 留存、reprocess 期间二次触发被拒、上传超大 body 被 413 拒、台账解析失败告警可见于 dataQuality。

- [ ] **Step 4: 更新 PROGRESS.md**

顶部与版本史记录 V2.6.8（批2 后端健壮性 + FollowupStore 重构，零 schema/preprocess 结构改动 → 升级不需点更新数据；本批不打包，随批3 V2.6.9 累积包上线）。旧"当前版本 V2.6.7"降级为"上一版本"。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "docs(progress): V2.6.8 后端健壮性+FollowupStore重构(批2)收官+bump (未打包,随V2.6.9累积)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review（作者已核对）

- **Spec 覆盖**（roadmap 第 4 节）：FollowupStore 重构=T5-T7(domain 泛型)+T9(处理器收敛)；原子写=T1；事务锁=T9；reprocess/download 互斥=T2；错误状态一致=T9；输入护栏(Content-Length+body 上限)=T3；SSE 断连=T4；collection_stages/pmis 解析告警=T10；死代码清理=T11。批1 opus 两 minor=T12。全部有对应任务。
- **降级/取舍声明**：roadmap 提"表驱动路由",本 plan 落为 `_followup_txn` 事务助手 + 写处理器委派（收敛 load-modify-save+锁+原子写+错误状态"一处生效"），**不做**完整路由表重写——因 handler 层仅有 live-HTTP 测试网、全路由重写风险高于收益；T8 先补 risk/paykey 安全网降低 T9 风险。progress 不并入 followup_store 泛型（无 scope,语义不同），保持独立但同享 `_followup_txn`。若后续要更彻底的表驱动 dispatch,单独立项。
- **Placeholder 扫描**：核心逻辑(T1-T9,T12)均有实际代码;T2/T3/T4 明确要求"先读原 payload/变量名/SSE 格式再照抄",T10/T11 明确要求"先 grep 确证入口/无活引用"——这些是对现网代码的必要二次核对(防漂移),非占位符。T10 的解析计数出口形状依赖 collection_stages 现有入口,已要求 Step 1 先勘定。
- **类型/命名一致性**：`_followup_txn(self, lock, load_fn, mutate_fn, save_fn)->(bool,Any)` 在 T9 定义、被 6 域写处理器统一消费；`FollowupConfig(progress_fields, scope_groups, clear_on_archive, default_scope)` 在 T5 定义、T6/T7 四模块统一构造；`_atomic_write_json`(T1) 被 `_save_*` 复用、T9 事务的 save_fn 即这些 `_save_*`；`config.STAGE_STATUS_PAID`(T12) 被 collection_stages+snapshots 共享。
- **风险排序**：T9(处理器收敛,锁语义上移)最高风险,已加 T8 安全网 + 逐套迁移 + 控制者内联核对提示;T11(删死代码)次之,已要求逐个确证无活引用。T1-T7 低风险(助手/公共API不变)。
- **执行顺序**：A(T1-4,独立)→B(T5-7,泛型+迁移)→C(T8 网→T9 收敛)→D(T10-13)。同文件 server.py 多任务顺序执行(T1→T2→T3→T4→T9),避免并行冲突。
