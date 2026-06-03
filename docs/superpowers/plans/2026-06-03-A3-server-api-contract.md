# Plan A3：server.py API 契约与进度健壮性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 `server.py` 的对外契约与内部脆弱点：统一错误响应为 `{success, code, message}`、把脆弱的 `[OK]/[INFO]/[WARN]/[ERROR]` 关键字解析提取为可测函数并在 run_sync/run_import 复用（H-8 相关）、为跟进记录云写入加串行锁（防 WPS 并发覆盖），全部带测试。

**Architecture:** 全部改动在 `server.py`，行为保持式重构 + 小幅契约增强，最大化单元可测性，直接服务于 Phase B 前端要消费的 `/api`。是整体重构的 A3 块，自成闭环、可独立测试。

**Tech Stack:** Python 3.8+、pytest、ruff、pydantic（已装）。

参考：spec `docs/superpowers/specs/2026-06-03-payment-platform-refactor-design.md`；PROGRESS Backlog。

**不在本计划（拆到 A4，因依赖 Playwright/云文档、无法 CI 验证）：** `fetch_yundocs_full.py` 抓取分块超时/重试；`write_followup.py` 内部把手工引号/换行转义改为 `json.dumps`。串行写入的**锁**在本计划做（在 server.py 线程派发处），脚本内部的 JSON 转义留 A4。"脚本输出改为 JSON 行协议"的彻底改造也留 A4（需改脚本并联调），本计划先把**解析端**收敛为可测函数。

---

## File Structure

- Modify: `server.py`
  - 新增 `_error_payload(code, message)` + 错误码常量；将各 handler 的失败返回收口
  - 新增 `classify_progress_line(line)`；run_sync/run_import 三处解析循环改用它
  - 新增 `_write_followup_lock`；`_write_followup_async` 串行化云写入
- Create: `tests/test_server_error_payload.py`、`tests/test_server_progress.py`、`tests/test_server_write_lock.py`
- Modify: `PROGRESS.md`

约定：根目录运行命令；`conftest.py` 已把根目录加入 `sys.path`，`import server` 安全（导入不启动服务）。Windows，用 Bash 工具。提交信息末尾附：
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: 统一错误响应 {success, code, message}

**Files:**
- Modify: `server.py`（新增错误码常量 + `_error_payload`；收口各 handler 失败返回）
- Test: `tests/test_server_error_payload.py`

说明：当前各 handler 失败时返回 `{"success": False, "message": "..."}`，缺少机器可判别的 `code`。前端（Phase B）需要按 `code` 分支处理。加一个纯函数构造器并收口。

- [ ] **Step 1: 写失败测试**

```python
# tests/test_server_error_payload.py
import server


def test_error_payload_shape():
    p = server._error_payload(server.ERR_VALIDATION, "缺少必填字段: 项目编号")
    assert p == {"success": False, "code": "validation_error", "message": "缺少必填字段: 项目编号"}


def test_error_codes_distinct():
    codes = {server.ERR_VALIDATION, server.ERR_BUSY, server.ERR_PARSE, server.ERR_NOT_FOUND, server.ERR_INTERNAL}
    assert len(codes) == 5
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_error_payload.py -q`
Expected: FAIL（`module 'server' has no attribute 'ERR_VALIDATION'`）。

- [ ] **Step 3: 新增错误码与构造器**

在 `server.py` 模块级（例如 `FOLLOWUP_STATUSES = [...]` 附近）加入：

```python
# ── 统一错误响应 ──
ERR_VALIDATION = "validation_error"   # 字段校验失败
ERR_BUSY = "busy"                     # 同步/导入互斥冲突
ERR_PARSE = "parse_error"             # 请求体解析失败
ERR_NOT_FOUND = "not_found"           # 记录不存在
ERR_INTERNAL = "internal_error"       # 其它内部错误


def _error_payload(code, message):
    """统一错误响应体：{success: False, code, message}。"""
    return {"success": False, "code": code, "message": message}
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_server_error_payload.py -q`
Expected: PASS（2 passed）。

- [ ] **Step 5: 收口各 handler 的失败返回**

用 Grep 找全部 `{"success": False, "message"` 出现处（在 `handle_import`/`handle_followup_add`/`handle_followup_delete`/`handle_followup_update` 等）。把每处
`self._json_response({"success": False, "message": M})`
改为
`self._json_response(_error_payload(<CODE>, M))`，按语义选 code：
- 字段校验类（缺必填、超长、类型无效）→ `ERR_VALIDATION`
- 同步/导入互斥（"同步正在进行中"/"导入正在进行中"）→ `ERR_BUSY`
- 请求体 JSON 解析失败（`f"请求数据解析失败: {e}"`）→ `ERR_PARSE`
- 未找到记录（"未找到记录"/"缺少记录编号"）→ `ERR_NOT_FOUND`（"缺少记录编号"也归 VALIDATION 亦可，二选一并保持一致；本计划用 ERR_NOT_FOUND 给"未找到记录"，"缺少记录编号"用 ERR_VALIDATION）

注意：
- 仅改 `success: False` 的**错误**返回；`success: True` 的成功返回不动，不加 code。
- `handle_sync` 里那条 `{"running": False, "progress": 0, "message": ...}`（SSE/进度形状，非 `success` 形状）**不要**改。
- 改完用 Grep 确认 `server.py` 中不再有裸 `{"success": False, "message"` 字面量（全部经 `_error_payload`）。报告每处改动与所选 code。

- [ ] **Step 6: 全量测试 + 编译**

Run: `python -m pytest -q`（全绿）
Run: `python -m py_compile server.py`（无输出）

- [ ] **Step 7: 提交**

```bash
git add server.py tests/test_server_error_payload.py
git commit -m "feat(server): 统一错误响应 {success,code,message} 并收口各 handler

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 进度行解析提取为可测函数

**Files:**
- Modify: `server.py`（新增 `classify_progress_line`；run_sync 的 fetch 循环、run_sync 的 preprocess 循环、run_import 的 preprocess 循环改用它）
- Test: `tests/test_server_progress.py`

说明：当前三处循环各自用 `if '[OK]' in line: ... elif '[INFO]'...` 重复检测脚本输出级别（脆弱、重复）。提取为一个可测函数，三处复用（H-8 相关）。行为保持。

- [ ] **Step 1: 写失败测试**

```python
# tests/test_server_progress.py
import server


def test_classify_levels():
    assert server.classify_progress_line("[OK] 提取完成") == ("ok", "[OK] 提取完成")
    assert server.classify_progress_line("[INFO] 正在连接") == ("info", "正在连接")
    assert server.classify_progress_line("[WARN] 慢") == ("warn", "慢")
    assert server.classify_progress_line("[ERROR] 失败了") == ("error", "失败了")
    assert server.classify_progress_line("普通输出") == ("other", "普通输出")


def test_classify_blank_returns_none():
    assert server.classify_progress_line("   ") is None
    assert server.classify_progress_line("") is None
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_progress.py -q`
Expected: FAIL（无 `classify_progress_line`）。

- [ ] **Step 3: 新增 classify_progress_line**

在 `server.py` 模块级（`run_sync` 之前）加入：

```python
def classify_progress_line(line):
    """解析子脚本输出的一行，返回 (level, text) 或 None（空行）。
    level ∈ {'ok','info','warn','error','other'}。
    保持与既有关键字解析一致：info/warn/error 去掉级别前缀，ok/other 原样。
    """
    s = line.strip()
    if not s:
        return None
    if '[OK]' in s:
        return ('ok', s)
    if '[INFO]' in s:
        return ('info', s.replace('[INFO] ', ''))
    if '[WARN]' in s:
        return ('warn', s.replace('[WARN] ', ''))
    if '[ERROR]' in s:
        return ('error', s.replace('[ERROR] ', ''))
    return ('other', s)
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_server_progress.py -q`
Expected: PASS（2 passed）。

- [ ] **Step 5: 三处循环改用 classify_progress_line（行为保持）**

在 `run_sync` 与 `run_import` 中有三个 `for line in process.stdout:` 解析循环（① run_sync 的 fetch 提取循环、② run_sync 的 preprocess 循环、③ run_import 的 preprocess 循环）。每个循环开头当前是：
```python
                for line in process.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    if '[OK]' in line:
                        ...
                    elif '[INFO]' in line:
                        ...
                    elif '[WARN]' in line:
                        ...
                    elif '[ERROR]' in line:
                        ...
                    else:
                        ...
```
改为在循环体顶部调用分类函数，再用返回的 `level`/`text` 分支（保留每个循环原有的 per-level 业务逻辑——如 sheet 计数、progress 增量、error_lines 收集等，逐字搬到对应 level 分支，不改行为）：
```python
                for raw_line in process.stdout:
                    parsed = classify_progress_line(raw_line)
                    if parsed is None:
                        continue
                    level, text = parsed
                    line = raw_line.strip()  # 若原逻辑用到完整行（如 logger.info(f"[fetch] {line}")）
                    if level == 'ok':
                        ...原 [OK] 分支逻辑...
                    elif level == 'info':
                        ...原 [INFO] 分支逻辑（注意原代码用 line.replace('[INFO] ', '')，现可直接用 text）...
                    elif level == 'warn':
                        ...原 [WARN] 分支...
                    elif level == 'error':
                        ...原 [ERROR] 分支...
                    else:  # 'other'
                        ...原 else 分支（含对 Error/Exception/Traceback 关键字的兜底收集）...
```
要点：
- 这是**行为保持**重构。逐循环对照原分支，确保 progress 计算、消息文案、`error_lines`/`preprocess_errors` 收集、`logger` 调用完全一致。
- 原 `[INFO]`/`[WARN]`/`[ERROR]` 分支里用 `line.replace('[INFO] ', '')` 得到的文本，现等于 `text`，可直接用 `text`（结果相同）。
- 三个循环逐一改、逐一核对。先读 server.py 中这三段的当前完整代码再动手。

- [ ] **Step 6: 全量测试 + 编译**

Run: `python -m pytest -q`（全绿）
Run: `python -m py_compile server.py`（无输出）

- [ ] **Step 7: 真实冒烟（可选，本机有 yundocs_data 时）**

若本机可跑同步链路较重，可跳过；至少确认 `python preprocess_data.py` 仍 `[OK] 数据已通过 schema 校验`（证明 preprocess 输出未受影响——本任务不改 preprocess）。

- [ ] **Step 8: 提交**

```bash
git add server.py tests/test_server_progress.py
git commit -m "refactor(server): 进度行解析提取为可测 classify_progress_line，三处循环复用

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 跟进云写入串行锁（防 WPS 并发覆盖）

**Files:**
- Modify: `server.py`（新增 `_write_followup_lock`；`_write_followup_async` 全程持锁）
- Test: `tests/test_server_write_lock.py`

说明：每次 add/delete/update 都 `threading.Thread(target=_write_followup_async,...)` 派发；并发时多个浏览器会话同时写同一云文档 → 后写覆盖先写。用一把锁让云写入串行。

- [ ] **Step 1: 写失败测试（验证锁互斥）**

```python
# tests/test_server_write_lock.py
import threading
import time
import server


def test_write_followup_lock_serializes():
    overlap = {"max": 0, "cur": 0}
    probe = threading.Lock()

    def critical():
        with server._write_followup_lock:
            with probe:
                overlap["cur"] += 1
                overlap["max"] = max(overlap["max"], overlap["cur"])
            time.sleep(0.02)
            with probe:
                overlap["cur"] -= 1

    threads = [threading.Thread(target=critical) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert overlap["max"] == 1  # 任意时刻最多 1 个线程进入临界区
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_write_lock.py -q`
Expected: FAIL（无 `_write_followup_lock`）。

- [ ] **Step 3: 新增锁**

在 `server.py` 模块级（`_followup_lock = threading.Lock()` 附近）加入：
```python
_write_followup_lock = threading.Lock()  # 云文档写入串行化，防并发覆盖
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_server_write_lock.py -q`
Expected: PASS（1 passed）。

- [ ] **Step 5: 让 _write_followup_async 全程持锁**

在 `_write_followup_async(record, cloud_url)` 函数体内，用 `with _write_followup_lock:` 包裹其主体（从设置初始 "syncing" 状态到结束的整段工作）。具体做法：先读该函数当前完整代码，将其 `try: ... except ...:` 主体整体缩进进 `with _write_followup_lock:` 之内（或在函数体最外层加 `with _write_followup_lock:` 再放原有逻辑）。确保：
- `_set_followup_state(record_id, ...)` 调用仍按原顺序执行（它内部用的是另一把 `_followup_lock`，与 `_write_followup_lock` 不同，不会死锁——`_write_followup_lock` 不在 `_set_followup_state` 内获取）。
- 不改变任何状态文案/分支逻辑，仅增加串行化。
- 报告确认两把锁不嵌套获取对方（无死锁风险）。

- [ ] **Step 6: 全量测试 + 编译**

Run: `python -m pytest -q`（全绿）
Run: `python -m py_compile server.py`（无输出）

- [ ] **Step 7: 提交**

```bash
git add server.py tests/test_server_write_lock.py
git commit -m "fix(server): 跟进云写入串行锁，防 WPS 并发覆盖

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 收尾——verify 全绿 + 更新 PROGRESS

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（py_compile + ruff + 全部 pytest 绿）。失败则报告 BLOCKED 附输出。

- [ ] **Step 2: 更新 PROGRESS.md**

- 找到 `- [ ] **A3** ...` 行，改为 `[x]` 并把措辞收敛为本计划实际完成范围：
  ```
  - [x] **A3** server.py API 契约与进度健壮性：统一错误响应 {success,code,message}；进度解析提取为可测 classify_progress_line（run_sync/run_import 复用，H-8 部分）；跟进云写入串行锁。
  ```
- 在 "🟠 高（后端健壮性）" 区新增 A4 行：
  ```
  - [ ] **A4** Playwright 脚本健壮性（需浏览器/云文档手验）：fetch_yundocs_full.py 抓取分块超时/重试；write_followup.py 把手工引号/换行转义改为 json.dumps；脚本输出改 JSON 行协议（与 classify_progress_line 对接）。
  ```
- 若 `- [ ] **H-8** ...` 仍在，追加 `（部分由 A3 完成：解析逻辑已提取复用）`。
- 更新顶部"最近更新"为 `2026-06-03`；"验证基线"测试计数更新为 `python -m pytest -q` 实际数。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): 标记 A3 完成，记入 A4（Playwright 脚本健壮性）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（对照 PROGRESS 的 A3 描述）：**
- 统一错误响应 {success,code,message} → Task 1 ✓
- 结构化进度（解析端可测化、去重）→ Task 2 ✓（脚本侧 JSON 行协议留 A4，已说明）
- write_followup 串行（锁，在 server 线程派发处）→ Task 3 ✓（脚本内部 JSON 转义留 A4）
- fetch 抓取健壮性 → 明确拆 A4（Playwright 不可 CI 验证）
- H-8 run_sync/run_import 去重 → Task 2 部分达成

**Placeholder scan：** 新增的辅助函数/常量/测试均给出完整代码；Task 1 Step 5 与 Task 2 Step 5、Task 3 Step 5 为应用到既有多站点，已要求"先读当前完整代码再改 + 逐处核对 + Grep 验证"，并给出精确的改写模式与约束（行为保持）。无 TBD/TODO。

**Type/名称一致性：** `_error_payload(code, message)`、`ERR_*`、`classify_progress_line(line)→(level,text)|None`、`_write_followup_lock` 在定义与测试/引用处一致；与现有 `_followup_lock`/`_set_followup_state`（A2）区分清楚，且说明两锁不互相嵌套获取（无死锁）。

**风险点：** Task 2 是对同步关键路径（无法 CI 跑真实 Playwright）的行为保持重构——靠 `classify_progress_line` 单测 + 逐处人工核对保证等价；Task 2 Step 7 给了 preprocess 冒烟兜底。Task 3 锁互斥测试用 sleep 制造重叠窗口，确定性足够。

---

## Execution Handoff

见会话中执行方式选择（建议同 A1/A2：subagent-driven-development）。
