# Plan A2：后端服务加固与 A2-debt 清理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `server.py` 的并发/安全/崩溃缺陷（B-1/B-2/B-3、H-5/H-6），并清理 A1 遗留的硬编码（A2-debt：`compute_*` 状态字符串与 tier 迭代改用 `config.*`、`process_below100_nodes` 时间可注入），全部带测试护栏。

**Architecture:** 行为保持式加固现有 Python 后端。把不可直接 TDD 的结构性改动（服务创建、绑定地址）重构为可测的小函数（`create_server`、`_check_browser_available`、`_set_followup_state`），再加单元测试。是整体重构的 A2 块，自成闭环、可独立测试。

**Tech Stack:** Python 3.8+、pytest、ruff、pydantic（已装）。

参考：spec `docs/superpowers/specs/2026-06-03-payment-platform-refactor-design.md`；前序 `docs/superpowers/plans/2026-06-03-A1-data-contract-foundation.md`。

**不在本计划（拆到 A3）：** `fetch_yundocs_full.py`/`write_followup.py` 的 Playwright 健壮性（抓取性能、并发队列、转义）；结构化进度协议（退出码/JSON 替代 `[OK]/[ERROR]` 关键字解析）；结构化错误响应的 `code` 字段统一。B-4（前端本地字体）随旧前端废弃，由 Phase B 处理。

---

## File Structure

- Modify: `preprocess_data.py` — A2-debt：状态/ tier 去硬编码；`process_below100_nodes` 增加 `now` 注入
- Modify: `server.py` — `_check_browser_available` 修复+可测；新增 `create_server`（ThreadingHTTPServer + 127.0.0.1）；新增 `_set_followup_state`（锁 + 限容）；替换 `followup_sync_state` 直接读写
- Modify: `tests/test_pipeline_integration.py` — 用注入的 `now` 做确定性断言；新增 tier_summary 回归断言
- Create: `tests/test_server_browser.py`、`tests/test_server_create.py`、`tests/test_server_followup_state.py`
- Modify: `PROGRESS.md`

约定：根目录运行命令；`conftest.py` 已把根目录加入 `sys.path`，可 `import server` / `preprocess_data` / `config`。Windows，用 Bash 工具跑 git/pytest。提交信息末尾附：
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: A2-debt — compute_* 状态/ tier 去硬编码

**Files:**
- Modify: `preprocess_data.py`（`compute_dashboard` 行 558/562/566；`compute_tier_summary` 行 645-648/695-700/722；tier 字面量 行 842/1049/1085）
- Modify: `tests/test_pipeline_integration.py`（新增 tier_summary 回归断言）

说明：行为保持。把散落的中文状态字符串与 tier 列表字面量替换为 `config.*` 常量（`import config` 已存在）。先加保护测试，确保替换不改变计数。

- [ ] **Step 1: 先加保护测试（覆盖 compute_tier_summary 的状态匹配）**

在 `tests/test_pipeline_integration.py` 末尾追加：

```python
def test_tier_summary_status_counts():
    nodes = P.process_below100_nodes(_load_fixture(), "__temp__")
    for n in nodes:
        n["tier"] = P.assign_tier(n["projectAmount"])
    s100 = P.compute_tier_summary(nodes, "100万以上")
    s50 = P.compute_tier_summary(nodes, "50-100万")
    assert s100["fullPaidCount"] == 1      # P1 已全额回款
    assert s100["delayedCount"] == 0
    assert s50["delayedCount"] == 1        # P2 延期
    assert s50["fullPaidCount"] == 0
```

- [ ] **Step 2: 运行确认现状通过（基线）**

Run: `python -m pytest tests/test_pipeline_integration.py -q`
Expected: PASS（含新增 test_tier_summary_status_counts；这是替换前的基线）。

- [ ] **Step 3: 替换状态字符串字面量为 config 常量**

在 `preprocess_data.py` 中，用 Edit 的 replace_all 逐个替换以下**字符串字面量**为对应常量（仅在 `preprocess_data.py`，`config.py` 自身不动）：

| 字面量 | 替换为 |
|---|---|
| `"加资源可提前"` | `config.STATUS_CAN_ADVANCE` |
| `"达到回款条件"` | `config.STATUS_REACHED` |
| `"已提前回款"` | `config.STATUS_ADVANCE_PAID` |
| `"已全额回款"` | `config.STATUS_FULL_PAID` |
| `"正常实施中"` | `config.STATUS_ON_TIME` |
| `"延期"` | `config.STATUS_DELAYED` |

注意：
- 这些字面量当前仅出现在 `compute_dashboard`（行 558/562/566）与 `compute_tier_summary`（行 645-648/695-700/722）的比较表达式中（`compute_node_status` 已在 A1 用常量）。replace_all 是安全的。
- 替换后 `n["nodeStatus"] in ("已全额回款", "已提前回款")`（行 558）应变为 `n["nodeStatus"] in (config.STATUS_FULL_PAID, config.STATUS_ADVANCE_PAID)`。
- 替换前先 Grep 确认这些字面量没有出现在注释/print 文案里被误改；若某处出现在注释中（如 `# 步骤...`）请勿替换注释，只替换代码比较表达式。逐一核对 Grep 结果。

- [ ] **Step 4: 替换 tier 列表字面量**

- 行 1049、1085：`for tier in ["100万以上", "50-100万", "50万以下"]:` → `for tier in config.TIER_LABELS:`（两处）
- 行 842：`if sheet_tier and sheet_tier in ("100万以上", "50-100万", "50万以下"):` → `if sheet_tier and sheet_tier in config.TIER_LABELS:`

- [ ] **Step 5: 全量测试 + 真实数据回归**

Run: `python -m pytest -q`
Expected: 全绿（含新增 tier_summary 断言）。

Run（真实数据回归，本机有 yundocs_data）: `python preprocess_data.py` 然后
`python -c "import json; d=json.load(open('data/analysis_data.json',encoding='utf-8'))['dashboard']; print(d['totalPaidNodes'], d['totalDelayed'])"`
Expected: 打印 `230 35`（与 A1 真实运行一致 → 证明去硬编码行为不变）。
若数字不是 230/35，说明替换破坏了某处匹配，必须排查修正后再继续。

- [ ] **Step 6: 提交**

```bash
git add preprocess_data.py tests/test_pipeline_integration.py
git commit -m "refactor(preprocess): compute_* 状态/tier 改用 config 常量（A2-debt）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: A2-debt — process_below100_nodes 时间可注入

**Files:**
- Modify: `preprocess_data.py`（`process_below100_nodes` 签名 + 调用 `compute_node_status` 处）
- Modify: `tests/test_pipeline_integration.py`

说明：当前 `process_below100_nodes` 内部用 `datetime.now()`，集成测试的延期天数随运行日期漂移。增加可选 `now` 参数（默认 `datetime.now()`），向后兼容。

- [ ] **Step 1: 写失败测试（确定性 delayDays）**

在 `tests/test_pipeline_integration.py` 顶部已 `import` 的基础上，新增（文件顶部补 `from datetime import datetime`）：

```python
def test_process_nodes_now_injection_deterministic():
    from datetime import datetime
    nodes = P.process_below100_nodes(_load_fixture(), "__temp__", now=datetime(2026, 6, 3))
    by_id = {n["projectId"]: n for n in nodes}
    # P2 plan_date 2025-01-10 → 2026-06-03 固定延期天数
    assert by_id["P2"]["delayDays"] == 509
```

（509 = 2025-01-10 到 2026-06-03 的天数；若实现正确该值固定。）

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_pipeline_integration.py::test_process_nodes_now_injection_deterministic -q`
Expected: FAIL（`process_below100_nodes() got an unexpected keyword argument 'now'`）。

- [ ] **Step 3: 修改 process_below100_nodes 签名与调用**

将函数定义：
```python
def process_below100_nodes(sheet_json, tier_name):
```
改为：
```python
def process_below100_nodes(sheet_json, tier_name, now=None):
```
在函数体开头（`headers, rows = parse_header_and_data(sheet_json)` 之前或之后）加入：
```python
    if now is None:
        now = datetime.now()
```
然后把该函数内调用 `compute_node_status(..., now=datetime.now())` 改为 `now=now`。

- [ ] **Step 4: 校正断言数值**

Run: `python -m pytest tests/test_pipeline_integration.py::test_process_nodes_now_injection_deterministic -q`
若失败信息显示实际 delayDays 与 509 不符，用实际值更新断言（用 `python -c "from datetime import datetime; print((datetime(2026,6,3)-datetime(2025,1,10)).days)"` 确认正确天数并写入断言）。预期为 509。

- [ ] **Step 5: 全量测试**

Run: `python -m pytest -q`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add preprocess_data.py tests/test_pipeline_integration.py
git commit -m "refactor(preprocess): process_below100_nodes 支持注入 now（A2-debt）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: B-3 — 浏览器检测修复崩溃点 + 可测

**Files:**
- Modify: `server.py`（`_check_browser_available` 行 739-759；新增 `_browser_candidate_paths`）
- Test: `tests/test_server_browser.py`

说明：当前 `os.environ.get('PROGRAMFILES(X86)')`（行 751）无默认值，缺该环境变量时 `os.path.join(None, ...)` 抛 TypeError。修复并拆出可测的路径构造函数。

- [ ] **Step 1: 写失败测试**

```python
# tests/test_server_browser.py
import os
import server


def test_browser_check_no_crash_when_env_missing(monkeypatch):
    monkeypatch.delenv("PROGRAMFILES(X86)", raising=False)
    monkeypatch.delenv("PROGRAMFILES", raising=False)
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    monkeypatch.setattr(os.path, "isfile", lambda p: False)
    # 不得抛 TypeError
    assert server._check_browser_available() == (False, "")


def test_browser_check_detects_chrome(monkeypatch):
    monkeypatch.setenv("PROGRAMFILES", r"C:\PF")
    monkeypatch.setenv("PROGRAMFILES(X86)", r"C:\PF86")
    monkeypatch.setenv("LOCALAPPDATA", r"C:\Local")
    chrome = os.path.join(r"C:\PF", "Google", "Chrome", "Application", "chrome.exe")
    monkeypatch.setattr(os.path, "isfile", lambda p: p == chrome)
    assert server._check_browser_available() == (True, "Google Chrome")


def test_browser_check_detects_edge(monkeypatch):
    monkeypatch.setenv("PROGRAMFILES", r"C:\PF")
    monkeypatch.setenv("PROGRAMFILES(X86)", r"C:\PF86")
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    edge = os.path.join(r"C:\PF", "Microsoft", "Edge", "Application", "msedge.exe")
    monkeypatch.setattr(os.path, "isfile", lambda p: p == edge)
    assert server._check_browser_available() == (True, "Microsoft Edge")
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_browser.py -q`
Expected: FAIL（`test_browser_check_no_crash_when_env_missing` 抛 TypeError，因为当前 `PROGRAMFILES(X86)` 无默认值）。

- [ ] **Step 3: 重写 _check_browser_available（修复 + 可测）**

将 `server.py` 当前的 `_check_browser_available`（行 739-759）整体替换为：

```python
def _browser_candidate_paths():
    """返回 (chrome 路径列表, edge 路径列表)。所有环境变量取值带 '' 默认，避免缺失时崩溃。"""
    pf = os.environ.get('PROGRAMFILES', '')
    pf86 = os.environ.get('PROGRAMFILES(X86)', '')
    local = os.environ.get('LOCALAPPDATA', '')
    chrome = [
        os.path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        os.path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ]
    edge = [
        os.path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        os.path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]
    return chrome, edge


def _check_browser_available():
    """检测系统是否安装了可用浏览器（Chrome 或 Edge）
    返回 (可用: bool, 浏览器名称: str)
    """
    chrome_paths, edge_paths = _browser_candidate_paths()
    for p in chrome_paths:
        if p and os.path.isfile(p):
            return True, 'Google Chrome'
    for p in edge_paths:
        if p and os.path.isfile(p):
            return True, 'Microsoft Edge'
    return False, ''
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_server_browser.py -q`
Expected: PASS（3 passed）。

- [ ] **Step 5: 全量测试**

Run: `python -m pytest -q`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add server.py tests/test_server_browser.py
git commit -m "fix(server): 修复 PROGRAMFILES(X86) 缺失崩溃；浏览器检测拆为可测函数（B-3）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: B-1 + B-2 — ThreadingHTTPServer + 绑定 127.0.0.1

**Files:**
- Modify: `server.py`（新增 `HOST` 常量与 `create_server`；改 `main()` 行 1311-1319）
- Test: `tests/test_server_create.py`

说明：当前 `HTTPServer(("", PORT))` 单线程 + 绑所有网卡。改为多线程 + 仅绑本地回环，并抽出可测的 `create_server`。

- [ ] **Step 1: 写失败测试**

```python
# tests/test_server_create.py
import http.server
import server


def test_create_server_is_threaded_and_local():
    srv = server.create_server(host="127.0.0.1", port=0)  # port 0 = 临时空闲端口
    try:
        assert isinstance(srv, http.server.ThreadingHTTPServer)
        assert srv.server_address[0] == "127.0.0.1"
    finally:
        srv.server_close()
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_create.py -q`
Expected: FAIL（`module 'server' has no attribute 'create_server'`）。

- [ ] **Step 3: 新增 HOST 常量与 create_server**

在 `server.py` 中 `PORT = 8080` 那一行下面加入：
```python
HOST = "127.0.0.1"  # 仅绑定本地回环，避免局域网无认证访问
```

在 `main()` 之前（例如 `_open_browser` 之后）新增：
```python
def create_server(host=HOST, port=PORT):
    """创建多线程 HTTP 服务并绑定指定主机。"""
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    return http.server.ThreadingHTTPServer((host, port), CustomHandler)
```

- [ ] **Step 4: 改 main() 使用 create_server**

将 `main()` 中这段（行 1311-1319）：
```python
    handler = CustomHandler
    
    # 设置 allow_reuse_address 减少端口占用冲突（仅用于TIME_WAIT状态，不能解决多进程同时监听）
    http.server.HTTPServer.allow_reuse_address = True
    
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            with http.server.HTTPServer(("", PORT), handler) as httpd:
```
替换为：
```python
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            with create_server() as httpd:
```
（删除 `handler = CustomHandler` 与单独的 allow_reuse_address 行——逻辑已并入 create_server。）

- [ ] **Step 5: 运行确认通过 + 全量**

Run: `python -m pytest tests/test_server_create.py -q`
Expected: PASS（1 passed）。
Run: `python -m pytest -q`
Expected: 全绿。

- [ ] **Step 6: 编译检查**

Run: `python -m py_compile server.py`
Expected: 无输出。

- [ ] **Step 7: 提交**

```bash
git add server.py tests/test_server_create.py
git commit -m "fix(server): 多线程服务 + 绑定 127.0.0.1（B-1/B-2），抽出 create_server

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: H-5 + H-6 — followup_sync_state 加锁 + 限容

**Files:**
- Modify: `server.py`（新增 `_followup_lock`/`_FOLLOWUP_STATE_MAX`/`_set_followup_state`；替换 `_write_followup_async` 与 handle_followup_delete/update 中对 `followup_sync_state` 的直接读写）
- Test: `tests/test_server_followup_state.py`

说明：B-1 多线程化后，`followup_sync_state` 的逐键读写需要加锁；同时它只增不删（H-6）。用一个加锁、限容（FIFO 丢弃最旧）的 setter 统一收口。

- [ ] **Step 1: 写失败测试**

```python
# tests/test_server_followup_state.py
import server


def test_set_followup_state_caps_size(monkeypatch):
    monkeypatch.setattr(server, "_FOLLOWUP_STATE_MAX", 3)
    server.followup_sync_state.clear()
    for i in range(5):
        server._set_followup_state(f"R{i}", {"status": "syncing"})
    assert len(server.followup_sync_state) == 3
    assert set(server.followup_sync_state.keys()) == {"R2", "R3", "R4"}
    server.followup_sync_state.clear()


def test_set_followup_state_overwrites(monkeypatch):
    monkeypatch.setattr(server, "_FOLLOWUP_STATE_MAX", 10)
    server.followup_sync_state.clear()
    server._set_followup_state("R1", {"status": "syncing"})
    server._set_followup_state("R1", {"status": "success"})
    assert server.followup_sync_state["R1"] == {"status": "success"}
    server.followup_sync_state.clear()
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_followup_state.py -q`
Expected: FAIL（`module 'server' has no attribute '_set_followup_state'`）。

- [ ] **Step 3: 新增锁与 setter**

`server.py` 中，在 `followup_sync_state = {}` 定义行（约行 89）之后加入：
```python
_followup_lock = threading.Lock()
_FOLLOWUP_STATE_MAX = 200  # 限制规模，防止只增不删导致内存缓慢增长（H-6）

def _set_followup_state(record_id, state):
    """线程安全地设置跟进同步状态，并限制字典规模（超出按插入顺序丢弃最旧）。"""
    with _followup_lock:
        followup_sync_state[record_id] = state
        while len(followup_sync_state) > _FOLLOWUP_STATE_MAX:
            oldest = next(iter(followup_sync_state))
            del followup_sync_state[oldest]
```
（`threading` 已在文件顶部导入。）

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_server_followup_state.py -q`
Expected: PASS（2 passed）。

- [ ] **Step 5: 收口直接读写**

在 `server.py` 中：
- 把 `_write_followup_async` 内所有 `followup_sync_state[record_id] = {...}` 形式的赋值（共多处：初始化、syncing、success、failed 等）改为 `_set_followup_state(record_id, {...})`。用 Grep 找 `followup_sync_state[` 定位全部站点。
- 把 `handle_followup_delete`/`handle_followup_update` 中的 `if record_id in followup_sync_state: del followup_sync_state[record_id]` 用锁包裹：
```python
        with _followup_lock:
            followup_sync_state.pop(record_id, None)
```
- `_update_followup_sync_status` 与 `handle_followup_sync_status` 中**只读**遍历 `followup_sync_state` 的部分可不改（读取容忍），但若有写操作也改为加锁。逐一核对 Grep 结果，确保没有遗漏的写站点。

- [ ] **Step 6: 全量测试 + 编译**

Run: `python -m pytest -q`
Expected: 全绿。
Run: `python -m py_compile server.py`
Expected: 无输出。

- [ ] **Step 7: 提交**

```bash
git add server.py tests/test_server_followup_state.py
git commit -m "fix(server): followup_sync_state 加锁 + 限容收口（H-5/H-6）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 收尾——verify 全绿 + 更新 PROGRESS

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（py_compile + ruff + 全部 pytest 绿）。若失败，报告 BLOCKED 并附输出。

- [ ] **Step 2: 更新 PROGRESS.md**

在对应 Backlog 项后标注/勾选：
- `- [ ] **B-1** ...` → 改为 `- [x] **B-1** ...（A2 完成：ThreadingHTTPServer + create_server）`
- `- [ ] **B-2** ...` → `- [x] **B-2** ...（A2 完成：绑定 127.0.0.1）`
- `- [ ] **B-3** ...` → `- [x] **B-3** ...（A2 完成：PROGRAMFILES(X86) 缺省值 + 可测）`
- `- [ ] **H-5** ...` → `- [x] **H-5** ...（A2 完成：followup_sync_state 加锁；sync_state/import_state 整体重赋值原子，无需额外锁）`
- `- [ ] **H-6** ...` → `- [x] **H-6** ...（A2 完成：_set_followup_state 限容）`
- `- [ ] **A2-debt** ...` → `- [x] **A2-debt** ...（已完成：status/tier 去硬编码 + now 注入）`
- 在 "🟠 高" 或新建 "A3" 区，追加一条：
  ```
  - [ ] **A3** server.run_sync/run_import 结构化进度协议（退出码/JSON 替代 [OK]/[ERROR] 关键字解析）+ 统一错误响应 {success,code,message}（H-8 相关）；fetch_yundocs_full.py 抓取健壮性；write_followup.py 串行队列 + JSON 转义。
  ```
- 更新顶部"最近更新"为 `2026-06-03`；把"验证基线"测试计数更新为实际数（运行 `python -m pytest -q` 看末行数字）。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): 标记 A2 后端加固完成，A3 范围记入

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（对照 spec Phase A 中属于"服务加固"的部分）：**
- B-1 ThreadingHTTPServer → Task 4 ✓
- B-2 绑定 127.0.0.1 → Task 4 ✓
- B-3 PROGRAMFILES(X86) 崩溃修复 → Task 3 ✓
- H-5 线程安全（followup_sync_state 锁；并说明 sync_state/import_state 重赋值原子）→ Task 5 ✓
- H-6 followup_sync_state 限容 → Task 5 ✓
- A2-debt（status/tier 去硬编码、now 注入）→ Task 1/2 ✓
- **明确拆到 A3（spec Phase A 剩余）：** 结构化进度协议、统一错误 code、fetch/write_followup Playwright 健壮性 → Task 6 记入 PROGRESS。

**Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码或精确的 Edit 指令；命令含预期输出。Task 1 Step 3/4 与 Task 5 Step 5 用 Grep 定位多站点替换，已说明逐一核对。Task 2 Step 4 给了校正断言数值的精确命令。

**Type/名称一致性：** `create_server(host=HOST, port=PORT)`、`_browser_candidate_paths()`、`_check_browser_available()`、`_set_followup_state(record_id, state)`、`_followup_lock`、`_FOLLOWUP_STATE_MAX`、`HOST` 在任务内定义与引用一致；`config.STATUS_*`/`config.TIER_LABELS` 与 A1 的 config.py 命名一致；`process_below100_nodes(sheet_json, tier_name, now=None)` 调用点同步更新。

**风险点：** Task 1 的真实数据回归（230/35）依赖本机存在 yundocs_data；若不存在，则以全量 pytest（含 fixture 上的 dashboard 与 tier_summary 断言）为准，并在报告中说明已跳过真实回归。

---

## Execution Handoff

见会话中执行方式选择（建议同 A1：subagent-driven-development）。
