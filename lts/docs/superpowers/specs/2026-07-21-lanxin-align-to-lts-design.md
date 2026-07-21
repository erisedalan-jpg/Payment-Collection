# 蓝信对齐到 LTS（LTS-1.1.0）设计

> 状态：已与用户确认范围（Option B：出站 + 入站收件箱，仅收不归入）。
> 定位：只动 `lts/` 精简变体，**不改 master**。master 侧蓝信代码为移植来源，逐处剥离倚天。

## 目标

把 master 全功能版的「蓝信」域移植到 `lts/` 精简变体，**排除倚天工时相关推送**（LTS 无倚天域），并因 LTS 无跟进域而把入站「归入」降级为「仅收进收件箱、超管标记已处理」。发版号 `LTS-1.1.0`。

## 背景与现状

- `lts/` 是 master 的长期支持精简副本，**仅保留核心项目 + 回款**，去除了商机 / 倚天工时 / 概算 / 重点项目进展 / 临时跟进 / 风险跟进 / 回款重点跟进等域。
- master 的蓝信是**双向闭环**：出站推送（异常项目 + 倚天工时提醒 → 应用号卡片）+ 入站回调（员工回复 → 收件箱 → 超管归入各跟进域）。
- LTS 当前**完全没有蓝信**（无任何 `lanxin*.py`、无蓝信前端）。
- LTS **没有** risk / temp / payment_key / opportunity / progress 这 5 个入站「归入」目标域 → 归入无处可归。
- master 蓝信**出站**在 2026-07-21 刚联调成功；**入站回调从未联调**。此事实须如实写进 LTS 手册与 `lts/CLAUDE.md`。

## 范围（进 / 不进）

| 项 | 进 LTS | 说明 |
|---|---|---|
| 蓝信配置（凭证 + 项目路由 + 回调双密钥，超管可配、脱敏下发） | 进 | `public_config` 三密钥抹空只透 `has*` 布尔 |
| 自检 / 预览 / 出站推送——**项目关注原因** | 进 | 数据源 `analysis_data`，LTS 有；异常项目/回款延期/成本超支等 |
| 出站推送——**倚天工时** | 不进 | 整条 `timesheet` 分支剥离 |
| 入站回调（SHA1 验签 → 存证 → 收件箱） | 进 | 仅收 |
| 入站**归入各跟进域** | 不进 | LTS 无 5 域；`inbox/handle` 降级为「标记已处理」 |
| 发送台账（反查 staffId → 工号/姓名） | 进 | 入站归因身份必需 |

## 实现路线

**复制 6 模块 + 就地剥倚天**（已选定，非重写）。理由：最大化复用 master 已联调的出站代码，避免重踩已修的坑（纯 Python AES-256-CBC 官方向量、appCard 双重字节/字符截断、验签边界、errCode 语义）。逐处剥倚天、不留死码，不带任何「倚天工时问题」路由或 UI 到 LTS。

## 架构与逐模块改动

### 后端（`lts/` 根新增 6 个 `lanxin*.py`）

1. **`lanxin_crypto.py`** — 原样复制（零依赖 AES-256-CBC 解密 + SHA1 验签，与倚天无关）。
2. **`lanxin_callback.py`** — 原样复制（回调报文解析，两套键名兼容 `eventType/appId` vs `type/app_id`）。
3. **`lanxin_inbox.py`** — 原样复制（收件箱 + 台账存储：身份反查 / 去重 / 滚动清理，纯数据无 IO）。归因候选里「推荐归入项目」字段保留但 LTS 不消费，无害。
4. **`lanxin.py`** — 复制后删除倚天：
   - 删 `timesheet` 分桶：`ts_by_emp` / `ts_range` / `ts_label_to_code` / `r_ts = _route(cfg,"timesheet")` / `ts_items = _items_of(r_ts)`。
   - 删循环内 `elif kind == "timesheet"` 整支及其后的工时卡生成、工时 rollup（`_sum_ts_counts` 调用、`ts_counts`）。
   - 删 import 的 `build_timesheet_card` / `short_issue`。
   - 保留 `kind == "project"` 全链路：`build_project_card` + `build_summary_card` + 项目 rollup + `dispatch`（含 sentLog 台账）。
   - `get_app_token` / `id_mapping` / `_send` / `send_message` / `send_bot_message` / `_route` / `_descend_owner` / `_rollup*` / `resolve_project_manager` 全保留。
5. **`lanxin_recipients.py`** — 复制后删除倚天：
   - 删 `build_timesheet_card`、`short_issue`、工时短标签表（`ISSUE_SHORT` 之类）与 `_sum_ts_counts` 相关注释块。
   - 保留 `build_project_card` / `build_summary_card` / `short_reason` / `read_org_tree` / `supervisor_chain` / `resolve_project_manager` / `_field` / `_card` / `fit_bytes` / `fit_field`。
6. **`lanxin_config.py`** — 复制后精简 routes：
   - `default_config()` 的 `routes` 只保留 `"project"`，删 `"timesheet"` 路由项。
   - `validate`/`_migrate_route_items` 中 `known` 集合据此只含 `project`；删 `key == "timesheet"` 走 `ISSUE_LABELS` 白名单的分支，恒用 `REASON_WHITELIST` + `legacy_field="reasons"`。
   - 保留 `REASON_WHITELIST`（项目关注原因白名单，全为 LTS 内口径）、`public_config` 三密钥脱敏、凭证校验。

### 后端接线（`lts/server.py`）

- **import**：加 `lanxin` / `lanxin_callback` / `lanxin_config` / `lanxin_crypto` / `lanxin_inbox` / `lanxin_recipients`。**不 import 任何 `*_followup`**（LTS 无、且不归入）。
- **免登录豁免**：`_AUTH_EXEMPT` 由 `('/api/login','/api/logout','/api/auth/me')` 追加 `'/api/lanxin/callback'`。回调是全站唯一免登录写入口，安全边界是 SHA1 验签而非会话。
- **超管闸**：`_SUPER_ONLY_PATHS` frozenset 追加 `'/api/lanxin/config'`、`'/api/lanxin/selftest'`、`'/api/lanxin/preview'`、`'/api/lanxin/send'`、`'/api/lanxin/inbox'`、`'/api/lanxin/inbox/handle'`、`'/api/lanxin/inbox/delete'`。**`/api/lanxin/callback` 绝不进本集合**（否则免登录回调会被超管闸挡死）。
- **端点分发**（do_GET / do_POST 的 `if parsed.path == ...` 链，仿 master）：
  - GET：`/api/lanxin/config`（脱敏读）、`/api/lanxin/inbox`（列收件箱 + 台账 + `_lanxin_rejected` 计数）。
  - POST：`/api/lanxin/config`（写）、`/api/lanxin/selftest`（取 token + 工号换 ID + 发测试消息给本人）、`/api/lanxin/preview`（干跑出计划不发）、`/api/lanxin/send`（真发，走 `_lanxin_send_lock` 串行 + 记 sentLog）、`/api/lanxin/callback`（验签 → 新鲜度 → 存证 → 收件箱）、`/api/lanxin/inbox/handle`（**降级：仅置 `handled` 状态，无归入**）、`/api/lanxin/inbox/delete`。
- **回调处理 `handle_lanxin_callback`**（原样移植承重顺序）：① SHA1 验签先于存证（未过只记 `_lanxin_rejected` 计数含 `lastReason` 区分 signature/stale，绝不落 body）；② 新鲜度检查插在验签之后、存证之前；③ 解析失败仍返回 `errCode 0`（唯一非 0 分支＝存证落盘失败）；看不懂的报文落 `status:"unparsed"` 进收件箱不丢弃；④ 回复正文 `html.escape` 后换行只用 `<br>`。
- **移除归入**：master 里 `inbox/handle` 会读 `_LANXIN_ROUTE_DOMAINS` 把回复写进某跟进域（`followup_store.apply_update` / progress 内联分支）。LTS **整块删除**，`handle` 只做 `item['handled'] = True/False` + 可选备注，落 `lanxin_inbox.json`。删除随之带走 `_LANXIN_ROUTE_DOMAINS`、`lanxin_risk_key`、`_lanxin_append_reply` 里与归入耦合的部分（`_lanxin_append_reply` 若仅收件箱展示用则保留，若仅归入用则删——实现时按实际引用判定）。
- **辅助**：`_load_lanxin_inbox` / `_save_lanxin_inbox` / `_lanxin_rotate_raw`（回调存证滚动归档）/ `_lanxin_record_sent`（台账，入站反查身份必需）全保留。文件常量 `LANXIN_CONFIG_FILE` / `LANXIN_INBOX_FILE` / `LANXIN_RAW_FILE` / `LANXIN_RAW_ARCHIVE_DIR`、锁 `_lanxin_send_lock` / `_lanxin_inbox_lock`、`_lanxin_rejected` 状态字典全移植。
- **打包/开发双路径**（LTS 同样有 frozen 分支）：涉及蓝信数据文件路径的读写要同时照顾 `sys.executable` 目录（frozen）与开发路径。

### 前端（`lts/frontend/`）

- **`components/LanxinConfigCard.vue`** + `.test.ts` — 复制（凭证 + 项目路由配置 + 自检）。因只剩 project 路由，配置卡里不出现「倚天工时问题」路由分区。
- **`components/LanxinInboxCard.vue`** + `.test.ts` — 复制后**去掉「归入到某跟进域」下拉/按钮**，保留「标记已处理 / 删除」+ 收件箱列表 + 拒绝计数展示。
- **`components/LanxinPushDrawer.vue`** + `.test.ts` — 复制后**删除倚天工时推送分区**，只留项目异常（按关注原因选人预览/推送）。
- **`lib/lanxinApi.ts`** — 复制（去掉倚天推送相关的请求封装，若有）。
- **`lib/lanxinInbox.ts`** + `.test.ts` — 复制（收件箱纯数据处理，与倚天无关）。
- **`lib/lanxin/reasonWhitelistSync.ts`** + `.test.ts` — 复制（reasonWhitelist 只针对项目关注原因，本就与倚天无关）。
- **`views/DataView.vue`** — 在**超管专属折叠区**（与「首页门户 / 快捷入口」并列，`v-if="auth.isSuper"`）新增蓝信区块，挂：配置卡、手动推送（触发 PushDrawer）、收件箱卡。

## 配置 / 数据 / gitignore

- `lts/.gitignore` 追加（含密钥 / 员工回复正文，必须忽略）：
  ```
  data/lanxin_config.json
  data/lanxin_inbox.json
  data/lanxin_callback_raw.jsonl
  data/lanxin_raw_archive/
  ```
- 蓝信属脉络③（配置/存档类），**不进数据管线**，经 `/api/*` 直接读写 `data/*.json`，改完即时生效。
- schema 无需改（蓝信配置/收件箱不走 pydantic 主契约）。

## 承重设计（沿用 master，一条不破）

1. **验签先于存证**：`/api/lanxin/callback` 是唯一免登录写入口；先无条件落盘则同网段任何人可灌满磁盘。
2. **解析失败仍返回 errCode 0**：存证一旦落盘、重推毫无意义（白烧蓝信 3 次重试额度）；「成功」＝「已持久化」而非「已理解」；唯一返回非 0 ＝存证落盘失败。
3. **绝不记密钥**：`appSecret` / `callbackAesKey` / `callbackSignToken` / `app_token` 绝不进日志/审计/异常/前端；读取接口一律脱敏。
4. **回复必须全量转义**：员工任意输入，`html.escape` 后换行只用 `<br>`（`<p>` 不在富文本白名单会被拆解）。
5. **后端不接受前端传来的身份标识**：出站只认 `projectId`；staffId 由服务端发送台账反查。
6. **凭证未联调（入站）**：全链路入站从未联调，改动靠 `lanxin_crypto` 官方向量回归 + 伪造报文单测兜底。债 L-31（nonce 重放缓存未做，依赖时间戳窗口 + 存证轮转两道叠加）一并带入 LTS 并在 `lts/CLAUDE.md` 记录。

## 测试与验证

- 移植 master 蓝信单测并剥倚天断言：
  - `lanxin_crypto` 官方 AES 向量回归（**原样，不改**）。
  - 伪造回调：验签通过/失败、新鲜度 stale、解析失败仍 errCode 0、看不懂落 unparsed。
  - `lanxin_config` 校验：只认 `project` 路由，喂 `timesheet` 路由应报「未知 route.key」。
  - `lanxin_inbox` 存储：去重、身份反查、滚动清理。
  - server 层回调契约测试（若移植 `test_server_lanxin_callback.py`，去掉归入相关断言，改断「handle 只置 handled」）。
- 前端 vitest：三组件剥倚天后仍渲染、配置卡无倚天路由、Inbox 卡无归入下拉。
- **验收命令**：`cd lts && bash verify.sh` 全绿（Python 语法 + ruff + pytest + 前端 typecheck/vitest/build）。注意 LTS pytest 作用域，勿污染 master 根（历史有此债，见 `v323-risk-coldload-persistence` 记忆）。

## 版本 / 部署 / 文档

- 版本单一来源：`lts/frontend/src/version.ts` → `APP_VERSION = 'LTS-1.1.0'`，`RELEASE_DATE = '2026-07-21'`。
- 新增 `lts/deploy/升级手册-LTS-1.1.0.md`：**纯换后端 + dist + 重启**，**无需点「更新数据」**（蓝信不进管线）。列出新增 4 个 gitignore 数据文件、超管在 `/data` 配置蓝信、入站从未联调的告知。
- 更新 `lts/CLAUDE.md`：新增蓝信域描述——「仅出站（项目关注原因，无倚天推送）+ 入站收件箱（仅收、无归入）」、6 模块职责、四条承重、债 L-31。
- LTS 无 `PROGRESS.md`，进度并入 `lts/CLAUDE.md`，不另设。

## 打包坑（LTS 同样有 frozen 双路径）

- 涉及「调用脚本 / 读写文件路径」的蓝信逻辑，frozen 与开发两条分支都要对（`sys._MEIPASS` 静态 / `sys.executable` 目录数据）。
- 若 LTS 有 `/pm` 部署形态，前端构建 base 遵循 LTS 现有部署手册约定。

## 自审记录

- 占位符扫描：无 TBD / TODO。
- 一致性：出站只留 `project`，配置/管线/前端三处口径一致（配置 routes 删 timesheet ⇔ lanxin.py 删 timesheet 分桶 ⇔ 前端 PushDrawer 删倚天分区 ⇔ ConfigCard 无倚天路由）。
- 歧义澄清：`inbox/handle` 明确为「仅置 handled，无归入」；`_lanxin_append_reply` 去留按实现时实际引用判定（收件箱展示用则留，纯归入用则删）。
- 范围：单一子系统（LTS 蓝信），一份实现计划可覆盖。
