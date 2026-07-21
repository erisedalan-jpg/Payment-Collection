# 蓝信对齐到 LTS（LTS-1.1.0）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 master 的「蓝信」域移植进 `lts/` 精简变体——出站推送（仅项目关注原因，剥除倚天工时）+ 入站回调收件箱（仅收、无归入），发版 `LTS-1.1.0`。

**Architecture:** 复制 master 6 个 `lanxin*.py` 到 `lts/` 根，逐处剥离倚天（`timesheet` 路由/卡片）与归入（`_LANXIN_HANDLE_TARGETS` 等）；`server.py` 挂 8 个端点，`inbox/handle` 降级为「仅标记已处理」；前端复制 3 组件 + 3 库并剥倚天/归入，挂进 `DataView.vue` 超管专属区。蓝信属脉络③（不进数据管线），经 `/api/*` 直接读写 `data/*.json`。

**Tech Stack:** Python 3.8+ 标准库（urllib/hashlib/hmac，零第三方）；Vue3 + Vite + TS + Pinia + Element Plus；pytest + vitest。

## Global Constraints

- 所有代理沟通、代码注释、文档：**简体中文**。**不使用任何 emoji**。
- 版本单一来源：`lts/frontend/src/version.ts`。发版 `APP_VERSION='LTS-1.1.0'`、`RELEASE_DATE='2026-07-21'`。
- **绝不记密钥**：`appSecret`/`callbackAesKey`/`callbackSignToken`/`app_token` 绝不进日志/审计/异常/前端；读取一律脱敏（`public_config`）。`data/lanxin_config.json` 必须 gitignore。
- **不改 master**：只在 `lts/` 目录内改动。移植是「复制 master 文件后就地删改」，不是引用 master。
- **打包 frozen/开发双路径**：涉及蓝信数据文件路径处两条分支都要对（LTS server.py 同样有 `sys.frozen` 分支）。
- 验证铁律：`cd lts && bash verify.sh` 全绿（Python 语法 + ruff + pytest + 前端 typecheck/vitest/build）才算 done。

## 四条承重设计（沿用 master，一条不破，贯穿 Task 5）

1. **验签先于存证**：`/api/lanxin/callback` 是唯一免登录写入口，先无条件落盘 = 同网段任何人灌满磁盘。
2. **解析失败仍回 errCode 0**：存证落盘即「成功」，唯一返回非 0 的分支是存证落盘失败。看不懂落 `unparsed` 不丢弃。
3. **三密钥脱敏**：`public_config` 抹空三密钥只透 `has*` 布尔。
4. **回调正文全量转义**：员工任意输入 —— 但 LTS 无归入、回复不写入富文本跟进字段，故 `_lanxin_append_reply`/`html.escape` **不移植**（归入才需要）。回复正文仅在收件箱只读展示（Vue 文本插值天然转义）。

## File Structure（新增/修改一览）

后端（`lts/` 根）：
- 新增：`lanxin_crypto.py` `lanxin_callback.py` `lanxin_inbox.py`（**逐字复制**）、`lanxin_config.py` `lanxin_recipients.py` `lanxin.py`（复制后剥倚天）。
- 修改：`server.py`（导入 + 豁免 + 超管闸 + 常量/助手 + 8 端点 + 降级 handle）、`.gitignore`。
- 测试（`lts/tests/`）：复制 `test_lanxin_crypto.py` `test_lanxin_callback.py` `test_lanxin_inbox.py`（逐字）；适配 `test_lanxin_config.py` `test_lanxin_recipients.py` `test_lanxin.py` `test_server_lanxin.py` `test_server_lanxin_callback.py` `test_lanxin_wiring.py`。

前端（`lts/frontend/src/`）：
- 新增：`lib/lanxinInbox.ts`（去归入助手）、`lib/lanxin/items.ts`（仅 projectItems）、`lib/lanxinApi.ts`（handle→mark）、`components/LanxinConfigCard.vue`（剥倚天）、`components/LanxinPushDrawer.vue`（剥倚天）、`components/LanxinInboxCard.vue`（去归入重写）。
- 修改：`views/DataView.vue`（超管专属区挂三块）。
- 测试：适配 `lib/lanxinInbox.test.ts` `lib/lanxin/items.test.ts` `lib/lanxin/reasonWhitelistSync.test.ts` `components/Lanxin*.test.ts`。

收尾：`frontend/src/version.ts`、`CLAUDE.md`、`deploy/升级手册-LTS-1.1.0.md`。

---

## Task 1: 复制三个自包含后端模块 + 测试（逐字，无改动）

`lanxin_crypto.py`（零依赖 AES-256-CBC + SHA1 验签）、`lanxin_callback.py`（仅 import `lanxin_inbox`）、`lanxin_inbox.py`（无任何依赖）三者与倚天/归入完全无关，逐字复制。

**Files:**
- Create: `lts/lanxin_crypto.py` `lts/lanxin_callback.py` `lts/lanxin_inbox.py`
- Test: `lts/tests/test_lanxin_crypto.py` `lts/tests/test_lanxin_callback.py` `lts/tests/test_lanxin_inbox.py`

**Interfaces (Produces，供后续任务消费):**
- `lanxin_crypto.verify_signature(sign_token, timestamp, nonce, data_encrypt, signature) -> bool`
- `lanxin_crypto.decrypt(aes_key, data_encrypt) -> str`（失败抛 ValueError）
- `lanxin_callback.parse_envelope(plain) -> {"appId","orgId","events":[{"id","type","data"}]}`
- `lanxin_callback.event_to_item(event, store, received_at) -> dict`
- `lanxin_inbox.new_store()/migrate/record_sent/is_seen/mark_seen/add_item/resolve_identity/candidate_projects/mark_handled/prune`

- [ ] **Step 1: 复制 6 个文件（3 模块 + 3 测试）**

```bash
cd "lts"
cp ../lanxin_crypto.py ../lanxin_callback.py ../lanxin_inbox.py .
cp ../tests/test_lanxin_crypto.py ../tests/test_lanxin_callback.py ../tests/test_lanxin_inbox.py tests/
```

- [ ] **Step 2: 跑这三份测试确认逐字复制即通过**

Run: `cd lts && python -m pytest tests/test_lanxin_crypto.py tests/test_lanxin_callback.py tests/test_lanxin_inbox.py -q`
Expected: PASS（官方 AES 向量回归、伪造报文解析、收件箱去重全绿）

- [ ] **Step 3: Commit**

```bash
cd lts && git add lanxin_crypto.py lanxin_callback.py lanxin_inbox.py tests/test_lanxin_crypto.py tests/test_lanxin_callback.py tests/test_lanxin_inbox.py
git commit -m "feat(lts,lanxin): 移植自包含模块 crypto/callback/inbox(逐字,LTS-1.1.0 Task1)"
```

---

## Task 2: 移植 lanxin_config.py（剥倚天 timesheet 路由）

master `lanxin_config.py` 硬依赖 `from yitian_rules import ISSUE_LABELS`（LTS 无 `yitian_rules.py`）。删该 import、删 `DEFAULT_ISSUE_CODES`、`default_config` 只留 `project` 路由、校验只认 `project`。

**Files:**
- Create: `lts/lanxin_config.py`（从 master 复制后改）
- Test: `lts/tests/test_lanxin_config.py`（从 master 复制后改）

**Interfaces (Produces):**
- `default_config()`、`validate_config(cfg)`、`load_config(path)`、`save_config(path,cfg)`、`public_config(cfg)`、常量 `REASON_WHITELIST`

- [ ] **Step 1: 复制 master 文件**

```bash
cd lts && cp ../lanxin_config.py . && cp ../tests/test_lanxin_config.py tests/
```

- [ ] **Step 2: 删除倚天 import 与 DEFAULT_ISSUE_CODES**

在 `lts/lanxin_config.py` 中删除第 14 行的 import 与其下的 `DEFAULT_ISSUE_CODES` 块（原第 14~22 行）：

删除：
```python
from yitian_rules import ISSUE_LABELS

# ISSUE_LABELS 实测共 8 项 ...（整段注释）...
DEFAULT_ISSUE_CODES = [k for k in ISSUE_LABELS if not k.startswith("HINT_")]
```
（`REASON_WHITELIST` 常量保留不动。）

- [ ] **Step 3: `default_config()` 只留 project 路由**

把 `routes` 列表里的 `timesheet` 路由项整段删掉，只留 `project`：

```python
        "routes": [
            {
                "key": "project", "label": "项目关注原因", "enabled": True,
                # 默认到直接上级即止:+3 意味着一人收覆盖全部员工的卡,应由人显式开启
                "items": [_default_item(c, True, True, 1) for c in REASON_WHITELIST],
            },
        ],
```

- [ ] **Step 4: `validate_config` 去掉 timesheet 分支**

把 `validate_config` 里这两行（原 201~202）：
```python
        whitelist = list(ISSUE_LABELS.keys()) if key == "timesheet" else list(REASON_WHITELIST)
        legacy_field = "issueCodes" if key == "timesheet" else "reasons"
```
改为：
```python
        whitelist = list(REASON_WHITELIST)
        legacy_field = "reasons"
```
（`known = {r["key"] for ...}` 因 `default_config` 已只含 project 而自动只认 project；`seen != set(known)` 的完整性校验随之只要求 `{"project"}`，无需再改。）

- [ ] **Step 5: 适配 test_lanxin_config.py**

打开 `lts/tests/test_lanxin_config.py`，删除/改写所有针对 `timesheet` 路由与 `ISSUE_LABELS` 的用例：
- 删除断言「default_config 含 timesheet 路由」「timesheet 路由 items 来自 ISSUE_LABELS」的用例。
- 若有「routes 必须含 timesheet+project 两项」→ 改为「只含 project 一项」。
- 新增一条：`validate_config` 传入含 `key:"timesheet"` 的 route 应抛 `ValueError`（未知 route.key）。
- 保留：凭证脱敏（`public_config` 三密钥抹空 + has* 布尔）、`save_config` 空串密钥沿用旧值、`REASON_WHITELIST` 校验、supervisorLevels 边界等用例。

- [ ] **Step 6: 跑测试**

Run: `cd lts && python -m pytest tests/test_lanxin_config.py -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd lts && git add lanxin_config.py tests/test_lanxin_config.py
git commit -m "feat(lts,lanxin): 移植 config 并剥除倚天 timesheet 路由(LTS-1.1.0 Task2)"
```

---

## Task 3: 移植 lanxin_recipients.py（剥倚天工时卡）

`lanxin_recipients.py` 依赖 `from projects import read_sheet_by_header`（LTS 有 `projects.py`），无倚天 import。仅需删掉工时卡相关函数与短标签表。

**Files:**
- Create: `lts/lanxin_recipients.py`
- Test: `lts/tests/test_lanxin_recipients.py`

**Interfaces (Produces):**
- `read_org_tree(path)`、`supervisor_chain(tree,emp,levels)`、`resolve_project_manager(tree,team)`、`build_project_card(name,by_reason,reply_hint)`、`build_summary_card(name,rows,level_label,...)`、`short_reason(reason)`、`REPLY_HINT`

- [ ] **Step 1: 复制 master 文件**

```bash
cd lts && cp ../lanxin_recipients.py . && cp ../tests/test_lanxin_recipients.py tests/
```

- [ ] **Step 2: 删除工时卡与工时短标签**

在 `lts/lanxin_recipients.py` 删除：
- `ISSUE_SHORT_LABELS` 字典及其上方注释块（原第 58~66 行）。
- `short_issue` 函数（原第 69~71 行）。
- `build_timesheet_card` 函数（原第 195~209 行，整段含 docstring）。

保留 `REASON_SHORT_LABELS`/`short_reason`/`fit_bytes`/`fit_field`/`read_org_tree`/`supervisor_chain`/`resolve_project_manager`/`_field`/`_card`/`build_project_card`/`build_summary_card`。

- [ ] **Step 3: 适配 test_lanxin_recipients.py**

删除针对 `build_timesheet_card`/`short_issue`/`ISSUE_SHORT_LABELS` 的用例；保留项目卡/汇总卡/字节截断/组织树/上级链/经理解析用例。

- [ ] **Step 4: 跑测试**

Run: `cd lts && python -m pytest tests/test_lanxin_recipients.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd lts && git add lanxin_recipients.py tests/test_lanxin_recipients.py
git commit -m "feat(lts,lanxin): 移植 recipients 并删除倚天工时卡(LTS-1.1.0 Task3)"
```

---

## Task 4: 移植 lanxin.py（剥倚天 timesheet 分桶）

`lanxin.py` 的 `build_plan` 按 `kind in {"project","timesheet"}` 分桶。删整个 timesheet 分支及相关 helper。

**Files:**
- Create: `lts/lanxin.py`
- Test: `lts/tests/test_lanxin.py`

**Interfaces (Produces):**
- `get_app_token(cfg)`、`id_mapping(cfg,token,emp_id)`、`send_message`/`send_bot_message`、`build_plan(items,cfg,tree,project_pmis)`、`dispatch(plan,cfg)`、`LanxinError`

- [ ] **Step 1: 复制 master 文件**

```bash
cd lts && cp ../lanxin.py . && cp ../tests/test_lanxin.py tests/
```

- [ ] **Step 2: 改 recipients import（去 timesheet 卡/short_issue）**

把 `lts/lanxin.py` 顶部（原第 157~160）：
```python
from lanxin_recipients import (
    build_project_card, build_summary_card, build_timesheet_card,
    resolve_project_manager, short_issue, supervisor_chain,
)
```
改为：
```python
from lanxin_recipients import (
    build_project_card, build_summary_card,
    resolve_project_manager, supervisor_chain,
)
```

- [ ] **Step 3: 删除工时聚合 helper `_sum_ts_counts`**

删除 `_sum_ts_counts` 函数（原第 189~194 行）。`_rollup`/`_merge_agg`/`_rollup_by_levels`/`_route`/`_descend_owner`/`_items_of` 保留（项目路由也用）。

- [ ] **Step 4: `build_plan` 删除 timesheet 桶与分支**

在 `build_plan` 内删除：
- 工时桶初始化：`ts_by_emp`、`ts_range`、`ts_label_to_code`、`r_ts = _route(cfg, "timesheet")`、`ts_items = _items_of(r_ts)`（原第 277~286 中属于 ts 的行；保留 `r_proj`/`proj_items`）。
- 循环里 `elif kind == "timesheet" and r_ts:` 整个分支（原第 318~332）。
- primary 卡区块里 `if r_ts:` 整段工时卡生成（原第 338~350）。
- 汇总卡区块里 `if r_ts:` 整段工时汇总（原第 366~382）。

保留 `if r_proj:` 的 primary 卡与汇总卡两段、`unresolved`、`reply_hint` 计算、`return`。

改完后 `build_plan` 只处理 `kind == "project"`。

- [ ] **Step 5: 适配 test_lanxin.py**

删除所有 `kind:"timesheet"` 事项、工时卡、工时汇总相关用例；保留项目事项 → 项目卡/汇总卡、`resolve_project_manager` 1:N、`unresolved`、`dispatch` 台账（sentLog）、限流重试等用例。若有「混合 project+timesheet 一次 build_plan」用例，改为只喂 project。

- [ ] **Step 6: 跑测试**

Run: `cd lts && python -m pytest tests/test_lanxin.py -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd lts && git add lanxin.py tests/test_lanxin.py
git commit -m "feat(lts,lanxin): 移植 lanxin.py 并剥除倚天 timesheet 分桶(LTS-1.1.0 Task4)"
```

---

## Task 5: server.py 接线（8 端点 + 降级 handle，去归入）

这是后端核心。挂端点、常量、助手、handler，`inbox/handle` 降级为「仅标记已处理」，**不 import 任何 `*_followup`、不移植归入相关符号**。

**Files:**
- Modify: `lts/server.py`（import 区、`_AUTH_EXEMPT`、`_SUPER_ONLY_PATHS`、模块级常量/助手、`do_GET`/`do_POST` 分发、handler 方法）
- Test: `lts/tests/test_server_lanxin.py`、`lts/tests/test_server_lanxin_callback.py`、`lts/tests/test_lanxin_wiring.py`（从 master 复制后改）

**Interfaces (Consumes):** Task 1~4 的全部模块；LTS 既有助手 `_send_json`/`_read_json_body`/`_read_body_bytes`/`_followup_txn`/`_atomic_write_json`/`_require_super`/`_audit_set`/`audit.client_ip`/`logger`/`datetime`。

- [ ] **Step 1: import 区加 6 个蓝信模块**

在 `lts/server.py` 顶部 import 区（`import audit` 附近）加：
```python
import lanxin
import lanxin_callback
import lanxin_config
import lanxin_crypto
import lanxin_inbox
import lanxin_recipients
```
（**不加** `import *_followup` —— LTS 无跟进域。）

- [ ] **Step 2: `_AUTH_EXEMPT` 加回调**

```python
_AUTH_EXEMPT = ('/api/login', '/api/logout', '/api/auth/me', '/api/lanxin/callback')
```
并在其上方补注释：
```python
# /api/lanxin/callback 免登录:蓝信服务端不带我们的会话 cookie。
# 安全边界是 SHA1 验签而非会话 —— 见 handle_lanxin_callback。绝不能进 _SUPER_ONLY_PATHS。
```

- [ ] **Step 3: `_SUPER_ONLY_PATHS` 加蓝信超管端点（不含 callback）**

在 frozenset 里追加：
```python
    '/api/lanxin/config', '/api/lanxin/selftest',
    '/api/lanxin/preview', '/api/lanxin/send',
    '/api/lanxin/inbox', '/api/lanxin/inbox/handle', '/api/lanxin/inbox/delete',
```

- [ ] **Step 4: 模块级常量与助手（从 master server.py 摘录，去归入）**

在 `_atomic_write_json` 之后（或任一模块级合适处）加入下列常量与函数。**从 master server.py 第 347~522 摘录，但删去归入相关的 `_LANXIN_HANDLE_TARGETS`/`lanxin_risk_key`/`_lanxin_append_reply`**：

```python
# ── 蓝信推送 /lanxin:凭证/路由配置(超管可配) ──
LANXIN_CONFIG_FILE = os.path.join(BASE_DIR, 'data', 'lanxin_config.json')
_lanxin_send_lock = threading.Lock()   # send 不可撤销,非阻塞 acquire,抢不到即 400

# ── 蓝信回调入站:收件箱库 + 原始报文存证 ──
LANXIN_INBOX_FILE = os.path.join(BASE_DIR, 'data', 'lanxin_inbox.json')
LANXIN_RAW_FILE = os.path.join(BASE_DIR, 'data', 'lanxin_callback_raw.jsonl')
_lanxin_inbox_lock = threading.RLock()
LANXIN_CALLBACK_MAX_BYTES = 1024 * 1024
_lanxin_rejected = {"count": 0, "lastAt": "", "lastFrom": "", "lastReason": ""}
LANXIN_RAW_ARCHIVE_DIR = os.path.join(BASE_DIR, 'data', 'lanxin_raw_archive')
LANXIN_RAW_MAX_BYTES = 8 * 1024 * 1024
LANXIN_RAW_ARCHIVE_KEEP = 5
LANXIN_CALLBACK_MAX_SKEW_SEC = 300
```

并复制 master 的以下函数**逐字**（它们不含归入逻辑）：`lanxin_timestamp_fresh`、`_load_lanxin_inbox`、`_save_lanxin_inbox`、`_lanxin_rotate_raw`、`_lanxin_record_sent`、`_lanxin_config_payload`。（对应 master server.py 第 401~419、422~438、440~470、492~522 行。保留各自的完整 docstring —— 它们记录了「读失败不落盘」「验签先于存证」等承重理由。）

> 注意:`_lanxin_config_payload` 与 `_lanxin_record_sent` 内部只用 `lanxin_config`/`lanxin_inbox`,无归入依赖,逐字可用。

- [ ] **Step 5: do_GET 分发加两条**

在 `do_GET` 的 `if/elif` 链里（参照 master 第 1036~1043）加：
```python
        elif parsed.path == '/api/lanxin/config':
            self.handle_lanxin_config_get()
        elif parsed.path == '/api/lanxin/inbox':
            self.handle_lanxin_inbox_get()
        elif parsed.path == '/api/lanxin/callback':
            self._send_json(405, {"errCode": -4, "errMsg": "仅支持 POST"})
```

- [ ] **Step 6: do_POST 分发加八条**

在 `do_POST` 链里（参照 master 第 1209~1222）加：
```python
        elif parsed.path == '/api/lanxin/config':
            self.handle_lanxin_config_save()
        elif parsed.path == '/api/lanxin/selftest':
            self.handle_lanxin_selftest()
        elif parsed.path == '/api/lanxin/preview':
            self.handle_lanxin_preview()
        elif parsed.path == '/api/lanxin/send':
            self.handle_lanxin_send()
        elif parsed.path == '/api/lanxin/callback':
            self.handle_lanxin_callback()
        elif parsed.path == '/api/lanxin/inbox/handle':
            self.handle_lanxin_inbox_handle()
        elif parsed.path == '/api/lanxin/inbox/delete':
            self.handle_lanxin_inbox_delete()
```

- [ ] **Step 7: 复制 handler 方法（config/selftest/preview/send/callback/inbox_get/inbox_delete + _lanxin_tree/_lanxin_pmis）逐字**

从 master server.py 复制这些 handler 方法到 LTS 的 handler class 内，**逐字**（它们无归入依赖）：
- `_lanxin_tree`（master 3039~3043）、`_lanxin_pmis`（3045~3048）
- `handle_lanxin_config_get`（3060~3063）、`handle_lanxin_config_save`（3065~3077）
- `handle_lanxin_selftest`（3079~3121）
- `handle_lanxin_preview`（3123~3143）、`handle_lanxin_send`（3145~3192）
- `handle_lanxin_callback`（3196~3305，含 `_mutate` 闭包 —— 只用 `lanxin_inbox`/`lanxin_callback`/`lanxin_crypto`，无归入）
- `handle_lanxin_inbox_get`（3307~3318）
- `handle_lanxin_inbox_delete`（3434~3460）

**不复制**：`_lanxin_valid_project_ids`、`_lanxin_write_followup`、以及 master 版 `handle_lanxin_inbox_handle`（下一步用降级版替代）。

- [ ] **Step 8: 写降级版 `handle_lanxin_inbox_handle`（仅标记已处理，无归入）**

新增（替代 master 的归入版）：
```python
    def handle_lanxin_inbox_handle(self):
        """POST /api/lanxin/inbox/handle {itemId} —— 把一条回复标记为【已处理】。超管专属。
        LTS 无跟进域,不做归入(master 的「归入各跟进域」在 LTS 无处可归),
        仅置 handled 供超管人工分诊。未解析条目同样可标记(收件箱只读,不写业务数据)。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        item_id = str(data.get('itemId') or '').strip()
        if not item_id:
            self._send_json(400, _error_payload(ERR_VALIDATION, "itemId 必填"))
            return
        account = auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))
        if not account:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        info = {"by": account, "at": now}
        ok, res = self._followup_txn(
            _lanxin_inbox_lock, _load_lanxin_inbox,
            lambda s: lanxin_inbox.mark_handled(s, item_id, info),
            _save_lanxin_inbox)
        if not ok:
            self._send_json(500, _error_payload(ERR_INTERNAL, res if isinstance(res, str) else "标记失败"))
            return
        if res is False:
            self._send_json(404, _error_payload(ERR_VALIDATION, "收件箱条目不存在"))
            return
        self._audit_set(target='蓝信回复 %s' % item_id, detail='标记已处理')
        self._send_json(200, {"success": True})
```

> `mark_handled` 找不到条目返回 `False`,`_followup_txn` 把它当 mutate 返回值透出 → `(True, False)`,故 `ok=True & res is False` 判 404。

- [ ] **Step 9: `handle_lanxin_inbox_get` 去 candidateProjects（无归入，不需要）**

LTS 收件箱不做归入,归因候选无意义。把复制来的 `handle_lanxin_inbox_get` 里对每条 item 附 `candidateProjects` 的循环去掉,直接下发 store items：
```python
    def handle_lanxin_inbox_get(self):
        """GET /api/lanxin/inbox —— 收件箱。超管专属。LTS 无归入,不附归因候选。"""
        with _lanxin_inbox_lock:
            store = _load_lanxin_inbox()
        items = list(store.get('items') or [])
        self._send_json(200, {"success": True, "items": items,
                              "rejected": dict(_lanxin_rejected),
                              "received": len(store.get('items') or [])})
```

- [ ] **Step 10: 确认无遗漏引用**

Run: `cd lts && grep -nE "followup|归入|_LANXIN_HANDLE|lanxin_risk_key|_lanxin_write_followup|_lanxin_append_reply|_lanxin_valid_project_ids|candidateProjects" server.py`
Expected: 仅剩与蓝信无关的既有 `/api/followup/*`（跟进记录，LTS 原有）匹配；**不得**出现 `_LANXIN_HANDLE`/`lanxin_risk_key`/`_lanxin_write_followup`/`_lanxin_append_reply`/`_lanxin_valid_project_ids`/`candidateProjects`。若出现，删干净。

- [ ] **Step 11: 适配三份 server 层测试**

- `test_lanxin_wiring.py`（复制后改）：断言 6 模块可 import、8 端点已挂、`/api/lanxin/callback` 在 `_AUTH_EXEMPT` 且不在 `_SUPER_ONLY_PATHS`、其余 7 端点在 `_SUPER_ONLY_PATHS`。删除针对 `_LANXIN_HANDLE_TARGETS`/归入域的断言。
- `test_server_lanxin.py`（复制后改）：保留 config get/save 脱敏、selftest、preview、send（含台账 record_sent）用例；删除归入相关用例；把 `inbox/handle` 用例改为「传 {itemId} → 条目被置 handled、handledInfo={by,at}」「不存在的 itemId → 404」。
- `test_server_lanxin_callback.py`（复制后改）：保留验签先于存证、验签失败只记数不落 body、新鲜度 stale、解析失败仍 errCode 0 落 unparsed、去重、存证滚动等用例；**删除**读 `frontend/src/lib/riskRows.ts` 的 `lanxin_risk_key` 契约测试（LTS 无归入、无该复合键）。

- [ ] **Step 12: 跑 server 层测试**

Run: `cd lts && python -m pytest tests/test_lanxin_wiring.py tests/test_server_lanxin.py tests/test_server_lanxin_callback.py -q`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
cd lts && git add server.py tests/test_lanxin_wiring.py tests/test_server_lanxin.py tests/test_server_lanxin_callback.py
git commit -m "feat(lts,lanxin): server 接线 8 端点+降级 handle 去归入(LTS-1.1.0 Task5)"
```

---

## Task 6: lts/.gitignore 追加蓝信数据文件

含密钥/员工回复正文，必须忽略。

**Files:**
- Modify: `lts/.gitignore`

- [ ] **Step 1: 追加四条**

在 `lts/.gitignore` 末尾（其它 `data/*.json` 附近）加：
```
# 蓝信:含 appSecret/回调双密钥 + 员工回复正文 + 回调存证,绝不入库
data/lanxin_config.json
data/lanxin_inbox.json
data/lanxin_callback_raw.jsonl
data/lanxin_raw_archive/
```

- [ ] **Step 2: 确认忽略生效**

Run: `cd lts && printf '{}' > data/lanxin_config.json && git check-ignore data/lanxin_config.json && rm data/lanxin_config.json`
Expected: 打印 `data/lanxin_config.json`（已被忽略）

- [ ] **Step 3: Commit**

```bash
cd lts && git add .gitignore
git commit -m "chore(lts,lanxin): gitignore 蓝信配置/收件箱/存证(LTS-1.1.0 Task6)"
```

---

## Task 7: 前端库移植（lanxinInbox / items / lanxinApi，去归入+去倚天）

**Files:**
- Create: `lts/frontend/src/lib/lanxinInbox.ts`、`lts/frontend/src/lib/lanxin/items.ts`、`lts/frontend/src/lib/lanxinApi.ts`
- Test: `lts/frontend/src/lib/lanxinInbox.test.ts`、`lts/frontend/src/lib/lanxin/items.test.ts`、`lts/frontend/src/lib/lanxin/reasonWhitelistSync.test.ts`

**Interfaces (Produces):**
- `lanxinInbox.ts`：`LanxinInboxItem` 类型、`canHandle(item)`
- `items.ts`：`PushItem`（仅 project 变体）、`projectItems(projects, projectPmis, allowedReasons)`
- `lanxinApi.ts`：`getLanxinConfigFull/getLanxinConfig/saveLanxinConfig/lanxinSelftest/lanxinPreview/lanxinSend/getLanxinInbox/markLanxinInboxHandled/deleteLanxinInboxItem`、各接口类型

- [ ] **Step 1: `lib/lanxinInbox.ts`（去归入助手）**

新建 `lts/frontend/src/lib/lanxinInbox.ts`：
```typescript
// 蓝信收件箱的类型与纯判定。LTS 无归入,仅保留展示所需类型与"可标记已处理"判定。
export interface LanxinInboxItem {
  id: string
  receivedAt: string
  status: 'parsed' | 'unparsed'
  unparsedReason: string | null
  eventType: string
  staffId: string
  employId: string | null
  name: string | null
  msgType: string
  text: string
  groupId: string | null
  groupName: string | null
  handled: boolean
  handledInfo: Record<string, unknown> | null
}

/** 已处理的不重复标记。（未解析条目也可标记——LTS 收件箱只读,不写业务数据。） */
export function canHandle(item: Pick<LanxinInboxItem, 'handled'>): boolean {
  return !item.handled
}
```
（不移植 `HANDLE_DOMAINS`/`needsInstance`/`needsRiskCode`/`riskChoices`/`candidateProjects`。）

- [ ] **Step 2: `lib/lanxin/items.ts`（仅 projectItems）**

新建 `lts/frontend/src/lib/lanxin/items.ts`：
```typescript
import { riskReasons } from '@/lib/riskReasons'
import type { Project, ProjectPmis } from '@/types/analysis'

/** 待推事项。前端只回答「哪些项目有什么异常」;「发给谁」由后端解析花名册决定。 */
export type PushItem = { kind: 'project'; projectId: string; reasons: string[] }

/** 项目关注原因 → 事项。口径复用 riskReasons(单一来源),此处只做「配置勾选」过滤。 */
export function projectItems(
  projects: Project[],
  projectPmis: Record<string, ProjectPmis>,
  allowedReasons: string[],
): PushItem[] {
  const allow = new Set(allowedReasons)
  const out: PushItem[] = []
  for (const p of projects) {
    const reasons = riskReasons(p, projectPmis[p.projectId])
      .map((r) => r.category as string)
      .filter((c) => allow.has(c))
    if (reasons.length) out.push({ kind: 'project', projectId: p.projectId, reasons })
  }
  return out
}
```
（不移植 `timesheetItems` 与 `@/lib/yitian/compliance` import。）

- [ ] **Step 3: `lib/lanxinApi.ts`（handle→mark）**

从 master 复制 `lts/frontend/src/lib/lanxinApi.ts`，改两处：
- `PushItem` 的 import 保持 `from '@/lib/lanxin/items'`（现在只有 project 变体，类型仍成立）。
- 把 `handleLanxinInboxItem(itemId, domain, projectId, instanceId?, riskCode?)` 整个函数替换为：
```typescript
/** LTS 无归入,仅标记已处理。后端只认 itemId。 */
export async function markLanxinInboxHandled(itemId: string): Promise<{ success: boolean }> {
  return await api.post<{ success: boolean }>('/api/lanxin/inbox/handle', { itemId })
}
```
- 删除 `LanxinInboxHandleResp` 接口（不再用）；`getLanxinInbox` 返回的 `LanxinInboxResp.items` 类型来自新 `lanxinInbox.ts`（无 candidateProjects），保持一致。

- [ ] **Step 4: 复制并适配三份测试**

```bash
cd lts && cp ../frontend/src/lib/lanxinInbox.test.ts frontend/src/lib/lanxinInbox.test.ts
cp ../frontend/src/lib/lanxin/items.test.ts frontend/src/lib/lanxin/items.test.ts
cp ../frontend/src/lib/lanxin/reasonWhitelistSync.test.ts frontend/src/lib/lanxin/reasonWhitelistSync.test.ts
```
- `lanxinInbox.test.ts`：删除针对 `HANDLE_DOMAINS`/`needsInstance`/`needsRiskCode`/`riskChoices` 的用例；保留/调整 `canHandle`（现在只看 `handled`）。
- `items.test.ts`：删除 `timesheetItems` 用例；保留 `projectItems`。若含「与后端 REASON_WHITELIST 逐字一致」的抄本用例，删除（由 reasonWhitelistSync.test.ts 真读源码守卫）。
- `reasonWhitelistSync.test.ts`：**逐字可用** —— 它按相对路径 `../../../../lanxin_config.py` 解析到 `lts/lanxin_config.py`，读 `REASON_WHITELIST` 与 `@/lib/riskReasons` 的 `ALL_RISK_CATEGORIES` 比对。先确认 `lts/frontend/src/lib/riskReasons.ts` 导出 `ALL_RISK_CATEGORIES`（`grep -n "ALL_RISK_CATEGORIES" lts/frontend/src/lib/riskReasons.ts`）；若命名不同，改测试里的引用名以匹配 LTS 实际导出。

- [ ] **Step 5: 跑前端库测试**

Run: `cd lts/frontend && npx vitest run src/lib/lanxinInbox.test.ts src/lib/lanxin/items.test.ts src/lib/lanxin/reasonWhitelistSync.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd lts && git add frontend/src/lib/lanxinInbox.ts frontend/src/lib/lanxin/items.ts frontend/src/lib/lanxinApi.ts frontend/src/lib/lanxinInbox.test.ts frontend/src/lib/lanxin/items.test.ts frontend/src/lib/lanxin/reasonWhitelistSync.test.ts
git commit -m "feat(lts,lanxin): 前端库 inbox/items/api 移植去归入去倚天(LTS-1.1.0 Task7)"
```

---

## Task 8: LanxinConfigCard.vue（剥倚天 ISSUE_LABELS）

配置卡引 `ISSUE_LABELS` 仅为渲染 timesheet 路由。LTS 只有 project 路由，删该 import 与 timesheet 分支。

**Files:**
- Create: `lts/frontend/src/components/LanxinConfigCard.vue`
- Test: `lts/frontend/src/components/LanxinConfigCard.test.ts`

- [ ] **Step 1: 复制**

```bash
cd lts && cp ../frontend/src/components/LanxinConfigCard.vue frontend/src/components/
cp ../frontend/src/components/LanxinConfigCard.test.ts frontend/src/components/
```

- [ ] **Step 2: 删倚天 import 与 timesheet 分支**

- 删第 4 行：`import { ISSUE_LABELS } from '@/lib/yitian/compliance'`。
- `codeLabel`（原第 36~39）简化为：
```typescript
function codeLabel(routeKey: string, code: string): string {
  // 项目关注原因的 code 本身就是中文,直接显示。
  return code
}
```
（若 `routeKey` 参数因此未用致 lint 报错，去掉该形参并同步调用点。）
- 模板第 183 行 `{{ r.key === 'timesheet' ? '问题类型' : '关注原因' }}` 改为常量 `关注原因`。
- 全文件再 grep `timesheet`/`ISSUE_LABELS`/`工时` 清零。

- [ ] **Step 3: 适配测试**

`LanxinConfigCard.test.ts`：删除针对 timesheet 路由渲染/ISSUE_LABELS 的用例；保留凭证表单、脱敏 has* 展示、保存、验签计数展示、`@open-push` 事件、project 路由项勾选等用例。

- [ ] **Step 4: 跑测试**

Run: `cd lts/frontend && npx vitest run src/components/LanxinConfigCard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd lts && git add frontend/src/components/LanxinConfigCard.vue frontend/src/components/LanxinConfigCard.test.ts
git commit -m "feat(lts,lanxin): ConfigCard 移植剥倚天路由(LTS-1.1.0 Task8)"
```

---

## Task 9: LanxinPushDrawer.vue（剥倚天工时推送）

**Files:**
- Create: `lts/frontend/src/components/LanxinPushDrawer.vue`
- Test: `lts/frontend/src/components/LanxinPushDrawer.test.ts`

- [ ] **Step 1: 复制**

```bash
cd lts && cp ../frontend/src/components/LanxinPushDrawer.vue frontend/src/components/
cp ../frontend/src/components/LanxinPushDrawer.test.ts frontend/src/components/
```

- [ ] **Step 2: 删倚天 import**

删除第 5~8 行的：
```typescript
import { useYitianStore } from '@/stores/yitian'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { issueRows } from '@/lib/yitian/compliance'
```
第 8 行 `import { projectItems, timesheetItems, type PushItem } from '@/lib/lanxin/items'` 改为：
```typescript
import { projectItems, type PushItem } from '@/lib/lanxin/items'
```

- [ ] **Step 3: 删倚天 store 实例与 buildItems 工时分支**

- 删第 16~17：`const yitian = useYitianStore()`、`const yitianSettings = useYitianSettingsStore()`。
- `buildItems`（原第 33~50）删掉 `const rTs = ...` 起的整个 timesheet 分支，只留：
```typescript
function buildItems(cfg: LanxinConfig): PushItem[] {
  const out: PushItem[] = []
  const rProj = cfg.routes.find((r) => r.key === 'project')
  if (rProj?.enabled && data.data) {
    const allow = (rProj.items ?? []).filter((i) => i.enabled).map((i) => i.code)
    out.push(...projectItems(data.data.projects ?? [],
                             (data.data.projectPmis ?? {}) as never,
                             allow))
  }
  return out
}
```

- [ ] **Step 4: `doPreview` 删倚天加载与告警**

删除 `doPreview` 里 `const rTs = ...`、`if (rTs?.enabled) await Promise.all([yitian.load(), yitianSettings.load()])`、以及 `if (rTs?.enabled && !yitian.data) ElMessage.warning(...)` 三处（原第 57、60、63~65）。保留 `cfg = await getLanxinConfig()`、`items.value = buildItems(cfg)`、`plan.value = await lanxinPreview(...)`。

模板（预览列表/卡片仿真）与 `doSend`/`cardStr`/`cardFields` 不动。

- [ ] **Step 5: 适配测试**

`LanxinPushDrawer.test.ts`：删除工时事项/yitian store 相关用例与 mock；保留预览（projectItems → plan）、确认推送、失败列表、未解析列表、卡片全文展示等用例。

- [ ] **Step 6: 跑测试**

Run: `cd lts/frontend && npx vitest run src/components/LanxinPushDrawer.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd lts && git add frontend/src/components/LanxinPushDrawer.vue frontend/src/components/LanxinPushDrawer.test.ts
git commit -m "feat(lts,lanxin): PushDrawer 移植剥倚天工时推送(LTS-1.1.0 Task9)"
```

---

## Task 10: LanxinInboxCard.vue（去归入，重写为"仅收+标记已处理"）

这是唯一需真重写的组件：去掉归入抽屉（domain/risk/temp/instance/candidate 全删），操作列改「标记已处理 / 删除」，「归入去向」列改「处理状态」。

**Files:**
- Create: `lts/frontend/src/components/LanxinInboxCard.vue`
- Test: `lts/frontend/src/components/LanxinInboxCard.test.ts`

- [ ] **Step 1: 新建组件（完整内容如下）**

新建 `lts/frontend/src/components/LanxinInboxCard.vue`：
```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getLanxinInbox, markLanxinInboxHandled, deleteLanxinInboxItem } from '@/lib/lanxinApi'
import { canHandle, type LanxinInboxItem } from '@/lib/lanxinInbox'

const items = ref<LanxinInboxItem[]>([])
const rejected = ref<{ count: number; lastAt: string; lastFrom?: string }>({ count: 0, lastAt: '' })
const received = ref(0)
const busy = ref(false)

async function load() {
  busy.value = true
  try {
    const res = await getLanxinInbox()
    items.value = res.items ?? []
    rejected.value = res.rejected ?? { count: 0, lastAt: '' }
    received.value = res.received ?? 0
  } catch (e) {
    ElMessage.error('加载失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

/** 来源展示：三种事件类型对应私聊/群聊(+群名)/应用号；未知类型原样显示。 */
function sourceLabel(item: LanxinInboxItem): string {
  if (item.eventType === 'bot_group_message') return item.groupName ? `群聊 · ${item.groupName}` : '群聊'
  if (item.eventType === 'bot_private_message') return '私聊'
  if (item.eventType === 'account_message') return '应用号'
  return item.eventType || '-'
}

async function onMark(item: LanxinInboxItem) {
  if (!canHandle(item)) return
  busy.value = true
  try {
    await markLanxinInboxHandled(item.id)
    ElMessage.success('已标记为已处理')
    await load()
  } catch (e) {
    ElMessage.error('标记失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

async function onDelete(item: LanxinInboxItem) {
  try {
    await ElMessageBox.confirm('确定删除这条蓝信回复？删除后不可恢复。', '确认删除', { type: 'warning' })
  } catch {
    return
  }
  busy.value = true
  try {
    await deleteLanxinInboxItem(item.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

onMounted(() => { load() })

// 测试直接摆状态调用方法(参照 master InboxCard 的 defineExpose 做法)。
defineExpose({ items, rejected, received, load, onMark, onDelete })
</script>

<template>
  <div class="dv-card" data-test="li-card">
    <div class="dv-card-head">蓝信回复</div>

    <div class="dv-row dv-hint">
      共 <span class="u-num">{{ received }}</span> 条回复
      <template v-if="rejected.count > 0">
        · 验签被拒 <span class="dv-hint warn u-num">{{ rejected.count }}</span> 次(最近 {{ rejected.lastAt }})
      </template>
    </div>

    <el-table :data="items" v-loading="busy" size="small" border stripe data-test="li-table">
      <el-table-column prop="receivedAt" label="接收时间" width="160" class-name="u-num" />
      <el-table-column label="姓名" width="140">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <span>{{ row.name ?? '未知' }}</span>
          <div v-if="!row.name" class="li-staffid dv-hint u-num">{{ row.staffId }}</div>
        </template>
      </el-table-column>
      <el-table-column label="工号" width="100" class-name="u-num">
        <template #default="{ row }: { row: LanxinInboxItem }">{{ row.employId ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="来源" width="140">
        <template #default="{ row }: { row: LanxinInboxItem }">{{ sourceLabel(row) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="200">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <span class="dv-badge" :class="row.status === 'parsed' ? 'ok' : 'warn'">
            {{ row.status === 'parsed' ? '已解析' : '未解析' }}
          </span>
          <!-- 不静默隐藏:未解析原因必须显式展示,是排查蓝信真实回调报文的唯一线索 -->
          <div v-if="row.status === 'unparsed'" class="li-reason dv-hint warn">{{ row.unparsedReason }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="text" label="回复内容" min-width="200" show-overflow-tooltip />
      <el-table-column label="处理状态" width="180">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <span v-if="row.handled" class="dv-badge ok">
            已处理<template v-if="row.handledInfo?.at"> · {{ row.handledInfo.at }}</template>
          </span>
          <span v-else class="dv-hint">未处理</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <button class="dv-btn" data-test="li-mark-btn" :disabled="!canHandle(row)"
            @click="onMark(row)">标记已处理</button>
          <button class="dv-btn danger" data-test="li-delete-btn" @click="onDelete(row)">删除</button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

.li-staffid { font-size: var(--fs-1); }
.li-reason { font-size: var(--fs-1); margin-top: var(--sp-1); }
.dv-btn + .dv-btn { margin-left: var(--sp-2); }
</style>
```

> 若 `@/styles/dataview.css` 在 LTS 不存在，改用 LTS DataView 实际引用的样式文件（`grep -n "@import" lts/frontend/src/views/DataView.vue` 确认），或去掉该 @import 并复用 `.dv-*` 全局类。

- [ ] **Step 2: 新建测试**

新建 `lts/frontend/src/components/LanxinInboxCard.test.ts`（参照 master 结构，但只测「仅收+标记」）：
- mock `@/lib/lanxinApi` 的 `getLanxinInbox`（返回 parsed+unparsed 两条 + rejected 计数）、`markLanxinInboxHandled`、`deleteLanxinInboxItem`。
- 用例：① 挂载后 load 填充 items/received/rejected；② `onMark(parsed 未处理)` 调 `markLanxinInboxHandled(id)` 后重载；③ 已 handled 的 `canHandle` 为 false（标记按钮 disabled）；④ `onDelete` 走确认框 + `deleteLanxinInboxItem`；⑤ 未解析条目仍展示 `unparsedReason`。

- [ ] **Step 3: 跑测试**

Run: `cd lts/frontend && npx vitest run src/components/LanxinInboxCard.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd lts && git add frontend/src/components/LanxinInboxCard.vue frontend/src/components/LanxinInboxCard.test.ts
git commit -m "feat(lts,lanxin): InboxCard 重写为仅收+标记已处理(去归入)(LTS-1.1.0 Task10)"
```

---

## Task 11: DataView.vue 挂载（超管专属区）

在 LTS `DataView.vue` 超管专属区挂：配置卡（含「立即推送」按钮触发抽屉）、收件箱卡、推送抽屉。

**Files:**
- Modify: `lts/frontend/src/views/DataView.vue`

- [ ] **Step 1: script 区 import 三组件 + 抽屉开关**

在 `<script setup>` 里加：
```typescript
import LanxinConfigCard from '@/components/LanxinConfigCard.vue'
import LanxinPushDrawer from '@/components/LanxinPushDrawer.vue'
import LanxinInboxCard from '@/components/LanxinInboxCard.vue'
```
并加 `const lanxinOpen = ref(false)`（确认 `ref` 已从 vue import；`auth` store 已在 DataView 用于 `auth.isSuper`）。

- [ ] **Step 2: 模板超管区挂载**

在 LTS DataView 现有超管专属块（`v-if="auth.isSuper"` 的 `portal` collapse 同层）后，加一个超管专属蓝信区：
```vue
      <div v-if="auth.isSuper" class="dv-card dv-span-all">
        <LanxinConfigCard @open-push="lanxinOpen = true" />
      </div>
      <div v-if="auth.isSuper" class="dv-card dv-span-all">
        <LanxinInboxCard />
      </div>
```
并在模板根层（与其它 el-drawer 同级、任意收尾处）加抽屉：
```vue
    <LanxinPushDrawer v-model="lanxinOpen" />
```
> 具体套哪个容器类/放进哪个 collapse-item,按 LTS DataView 实际布局就近选择(参照 `portal` collapse-item 的写法)；关键是 `v-if="auth.isSuper"` 收起、后端超管闸已在 `_SUPER_ONLY_PATHS`,普通管理员看不到也打不通。

- [ ] **Step 3: typecheck + 相关测试**

Run: `cd lts/frontend && npx vue-tsc --noEmit && npx vitest run src/views/DataView.test.ts`
Expected: PASS（DataView 现有测试不因新增超管块而红；若断言了子组件数量/结构，同步更新）

- [ ] **Step 4: Commit**

```bash
cd lts && git add frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(lts,lanxin): DataView 超管区挂载配置/收件箱/推送抽屉(LTS-1.1.0 Task11)"
```

---

## Task 12: 收尾（版本 LTS-1.1.0 + 文档 + 全量验证）

**Files:**
- Modify: `lts/frontend/src/version.ts`、`lts/CLAUDE.md`
- Create: `lts/deploy/升级手册-LTS-1.1.0.md`

- [ ] **Step 1: 版本号**

`lts/frontend/src/version.ts`：
```typescript
export const APP_VERSION = 'LTS-1.1.0'
export const RELEASE_DATE = '2026-07-21'
```

- [ ] **Step 2: lts/CLAUDE.md 增蓝信域**

在「功能范围」句末补「· 蓝信推送（超管）」；在架构表加一行：
```
| `lanxin*.py`(6 模块) | 蓝信双向域(脉络③,不进管线):出站推送【仅项目关注原因,无倚天工时】+ 入站回调收件箱【仅收,无归入】。config(凭证+项目路由+回调双密钥,超管可配,脱敏下发) · recipients(卡片) · crypto(零依赖 AES+SHA1 验签) · callback(报文解析) · inbox(收件箱+发送台账)。凭证入站从未联调 |
```
并加一节「蓝信约定（LTS-1.1.0）」，记四条承重（验签先于存证 / 解析失败仍 errCode 0 / 三密钥脱敏 / 免登录仅回调且靠验签）、与 master 的差异（无倚天推送、无归入、handle 仅标记已处理）、债 L-31（nonce 重放缓存未做，依赖时间戳窗口+存证轮转）。`data/lanxin_config.json` 必须 gitignore。

- [ ] **Step 3: 写升级手册**

新建 `lts/deploy/升级手册-LTS-1.1.0.md`（参照 `lts/deploy/服务器部署手册.md` 的现网形态）：
- 从 LTS-1.0.0 升级：**非纯前端** —— 换 dist + 覆盖后端 `.py`（含 6 个新 `lanxin*.py`）+ 重启；**无需点「更新数据」**（蓝信不进数据管线）。
- 升级后超管在「数据管理」页配置蓝信凭证（AppId/AppSecret/网关/orgId + 回调双密钥），点自检验证；配置 `input/组织架构.xlsx` 是收件人解析前提。
- 知情：入站回调地址需在蓝信开发者中心「回调事件」页填 `<对外地址>/api/lanxin/callback`；入站从未联调。
- 新增 gitignore 数据文件说明；回滚（换回旧 dist + 删 6 个 lanxin*.py + 重启）。

- [ ] **Step 4: 全量验证**

Run: `cd lts && bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`（Python 语法 + ruff + pytest + 前端 typecheck/vitest/build 全绿）
> 注意 LTS pytest 作用域别污染 master 根（见记忆 `v323-risk-coldload-persistence`）；`cd lts` 后再跑。

- [ ] **Step 5: Commit**

```bash
cd lts && git add frontend/src/version.ts CLAUDE.md deploy/升级手册-LTS-1.1.0.md
git commit -m "release(lts): 蓝信对齐收官 LTS-1.1.0(版本+CLAUDE.md+升级手册)"
```

---

## Self-Review

- **Spec coverage**：范围表六项逐一映射 —— 配置(T2/T8) · 出站推送项目(T3/T4/T5/T9) · 排除倚天(T2~T4/T7~T9) · 入站回调(T1/T5) · 排除归入(T5/T7/T10) · 发送台账(T1/T5)。
- **Placeholder scan**：无 TBD/TODO；每个改动步给了具体删改点或完整代码。
- **Type consistency**：`PushItem` 全程只 project 变体；`markLanxinInboxHandled(itemId)` 前后端签名一致（后端只认 itemId）；`LanxinInboxItem` 去 candidateProjects，前后端一致（T5 Step9 去后端 candidateProjects ⇔ T7 Step1 去类型字段）。
- **承重一致**：验签先于存证/解析失败仍 0/三密钥脱敏，随 handler 逐字移植（T5 Step7）；回调正文转义在 LTS 因无归入而不涉及富文本写入，仅收件箱只读展示。
- **依赖核实**：LTS 已有 `projects.read_sheet_by_header`、`@/stores/data`、`@/lib/riskReasons(riskReasons/ALL_RISK_CATEGORIES)`、`@/api/client`、server 通用助手 `_followup_txn/_read_body_bytes/...` —— 均已在探查阶段确认存在。
