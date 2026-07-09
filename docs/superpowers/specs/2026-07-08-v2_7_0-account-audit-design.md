# 账号管理审计（全操作审计）设计 · V2.7.0

> 日期：2026-07-08
> 状态：设计已确认（用户认可）
> 范围：为账号管理增加审计功能——记录登录/登出/账号管理及全站写操作的操作留痕，仅超管可见，支持筛选与导出。

## 1. 目标与背景

现有认证/账号体系（`auth.py` + `server.py`）**对登录、登出、账号增删改、数据运维、业务写入等操作均无任何留痕**。本功能新增一套审计日志子系统：

- 采集**全操作审计**：认证类、账号管理类、数据运维类、业务写入类事件。
- 仅超级管理员（`admin` / `wangxutong` / `zhangyingzhe` 等 `isSuper`）可查看。
- 查看页支持**筛选**（账号/事件类型/日期区间/结果/关键字）与**导出**（xlsx）。
- 用户点名的四项字段一一落位：登录时间、登录 IP、用户名称、登出时间。

关键既有事实（约束设计）：

- 会话为**纯内存**（`auth._sessions`，12h TTL，服务重启即全清）；登录 `create_session`、登出 `destroy_session`。
- 部署为 **nginx:80 → 127.0.0.1:8080 反代**；`self.client_address[0]` 恒为 `127.0.0.1`。现有 nginx 已配 `proxy_set_header X-Forwarded-For` 与 `X-Real-IP`——**真实客户端 IP 可用，无需改 nginx**。
- `do_POST` 有统一鉴权链 `_auth_gate()` → `_authz_gate()`，是全站写操作天然拦截点。
- 运维型操作 `reprocess / clear-data / stop / pmis-download / data-history(list)` 挂在 **GET**；其余增删改挂在 **POST**。
- 服务为多线程（`ThreadingHTTPServer`）；文件写入须加锁。
- `data/*` 目录已被 `_is_protected_data_path` 对非超管拦截直链访问（`analysis_data.json` 例外）。

## 2. 决策记录（brainstorm 已定，不再回头）

| 决策点 | 选择 |
|---|---|
| 审计范围 | **全操作审计**：认证 + 账号管理 + 数据运维 + 业务写入 |
| 可见性 | **仅超级管理员**可见（沿用 `/admin` 的 `requiresSuper`） |
| 登出时间口径 | **只记显式事件**：登录、显式登出、（删除账号触发的）强制下线；**不追** TTL 静默过期、服务重启 |
| 保留策略 | 活动日志上限 **最近 1万条 且 最近 365 天**；**超出滚入文本归档、永不自动删除** |
| 查看页位置 | **并入账号管理页标签**（`AdminView.vue` 改 el-tabs：`[账号管理] [审计日志]`），无新路由/pageKey |
| 呈现形态 | **事件流表**（一行一操作），非"一行一会话(登录+登出配对)"表 |
| 数据处理 | 与 `analysis_data.json` **无关**，升级**不需点「更新数据」** |

## 3. 事件目录（记什么）

事件流模型，一条操作 = 一行记录（一条 JSONL）。四类：

### A 认证类（在 handler 内显式记录——登录时尚无会话账号）
- `login.success` 登录成功 — 账号、显示名、IP、时间、UA
- `login.failure` 登录失败 — 尝试的账号名、IP、原因（`密码错误` / `账号不存在`）；**绝不记尝试的密码**
- `logout` 登出（显式点击）— 账号、IP
- 强制下线：删除账号会清该账号会话，作为 `account.delete` 事件的 `detail` 附带说明；TTL 静默过期、服务重启**不记**。

### B 账号管理类（POST，中央记录 + handler 补 target/detail）
- `account.create` 创建账号 — 操作者、目标账号、授予的页面/L4 权限
- `account.update` 修改账号 — 操作者、目标账号、改了什么（显示名/页面/L4/是否重置密码）；**不记密码值/哈希/salt**
- `account.delete` 删除账号 — 操作者、目标账号（附「其会话已强制失效」）
- `account.change_password` 修改本人密码 — 操作者（仅记事实，不记密码）

### C 数据运维类
- `data.reprocess` 数据更新（GET reprocess）
- `data.clear` 清空数据（GET clear-data）
- `data.history.rollback` 数据回滚（POST）
- `data.history.undo` 撤销回滚（POST）
- `manual.import` 人工数据导入（POST）
- `manual.rollback` 人工数据回滚（POST）
- `pmis.upload` / `inputs.upload` 文件上传（POST）
- `pmis.download` PMIS 拉取（GET）
- `pmis.cookie.save` 更新 PMIS Cookie（POST）
- `server.stop` 停止服务（GET）

### D 业务写入类（POST，中央记录，通用 path→动作 标签）
- `followup.add` / `followup.delete` / `followup.update` 跟进记录增删改
- `tags.save` 标签保存
- `progress.update` / `progress.archive` / `progress.archive_delete` 项目进展
- `temp-followup` / `opportunity-followup` / `risk-followup` / `payment-key-followup` 各自的 `scope` / `update` / `archive` / `archive_delete`
- `opportunities.create` / `update` / `delete` / `import` 商机

### 每行字段（审计记录 schema）

```json
{
  "ts": "2026-07-08T14:23:01+08:00",   // ISO-8601 本地时间（带时区偏移）
  "event": "login.success",            // 稳定事件码（英文点分）
  "action": "登录成功",                 // 中文动作标签（供 UI 直显）
  "account": "wangxutong",             // 操作者账号（登录失败=尝试的账号名；未知="" ）
  "displayName": "wangxutong",         // 操作者显示名（取记录时快照，未知="" ）
  "ip": "10.1.2.3",                    // 客户端真实 IP
  "userAgent": "Mozilla/5.0 ...",      // 截断至 200 字符
  "method": "POST",
  "path": "/api/admin/accounts/create",
  "status": 200,                        // HTTP 状态码
  "success": true,                      // status 2xx 即 true
  "target": "zhangsan",                // 可选：受影响实体（目标账号/项目号/记录号）
  "detail": "授予页面[projects], L4[交付一部]"  // 可选：简短中文说明；绝不含敏感值
}
```

字段落位：**登录时间**=`login.success` 的 `ts`；**登录 IP**=`ip`；**用户名称**=`account`/`displayName`；**登出时间**=`logout` 事件的 `ts`（多数会话因不追 TTL 无登出行，UI 如实呈现空缺）。

## 4. 存储、保留与归档

- 活动日志：`data/audit_log.jsonl`（JSONL 追加，纯文本；gitignored 敏感数据；不进发布包）。
- 归档目录：`data/audit_archive/audit-YYYY.jsonl`（按年归档，纯文本追加，**永不自动清理/删除**；gitignored）。
- 上限：活动日志只保留**同时满足『最近 1万条』与『晚于 365 天』**的记录——某条记录一旦落到第 1万条之外**或**早于 365 天，即被滚出（滚出条件是并集：`beyond MAX_ROWS` OR `older than MAX_DAYS`）。
- 滚动触发（**惰性、无后台线程**）：写入后（及读取时）做廉价检查——活动日志条数超过 `MAX_ROWS + TRIM_MARGIN`（如 11000），**或**最旧一条已早于 `MAX_DAYS`——满足其一即执行一次滚动。仅在满足其一时才重写整文件，平时只做单行追加。
- 滚动动作：保留同时满足『最近 `MAX_ROWS` 条』与『晚于 `MAX_DAYS`』的记录为新活动日志（原子重写）；其余溢出记录按年**追加进 `data/audit_archive/audit-YYYY.jsonl`**，绝不丢弃。
- 常量：`MAX_ROWS = 10_000`、`MAX_DAYS = 365`、`TRIM_MARGIN = 1_000`。
- 线程安全：`audit.py` 模块级 `threading.Lock`；追加与滚动均在锁内；活动日志原子重写用 tmp+`os.replace`（复用现有 `_atomic_write_json` 模式）。
- 健壮性：**审计写入失败绝不影响主请求**——`record()` 内层与调用点均以 try/except 吞掉异常、仅写后端 `logger.error`，不向请求路径抛出。

## 5. 埋点方式（怎么记，低成本全覆盖）

新增 `audit.py`，核心（多为纯函数，便于 pytest）：
- `record(event: dict) -> None`：补全 `ts`、追加写、按需滚动归档；失败不抛。
- `read(filters: dict, page: int, page_size: int) -> dict`：读活动日志、应用筛选、分页；返回 `{rows, total, facets}`（`facets`=去重账号清单 + 事件类型清单，供 UI 下拉）。
- `map_action(method: str, path: str) -> tuple[str, str] | None`：path→（事件码, 中文动作）映射表；返回 `None` 表示该路径不审计（读端点）。
- `client_ip(headers, client_address) -> str`：优先 `X-Forwarded-For` 首跳 → `X-Real-IP` → `client_address[0]`。
- `_trim_and_archive(events, max_rows, max_days, now) -> tuple[list, list]`：纯函数，返回 `(保留, 溢出)`。

两层埋点：

1. **中央拦截**（覆盖 C、D 及账号 CRUD，近零成本）：
   - `do_POST` 末尾：对 `map_action` 命中的写路径，用已解析的会话账号 + `client_ip` + path→动作 + HTTP 状态，记一条。HTTP 状态经在 `send_response`（或 `_send_json`）处暂存 `self._audit_status`。
   - `do_GET` 末尾：**仅**对运维白名单 `{/api/reprocess, /api/clear-data, /api/stop, /api/pmis/download}` 记；其余读/列表/轮询 GET **不记**（防噪声与容量爆炸）。
   - handler 可选设置 `self._audit_detail`（如目标账号、授予权限、项目号），中央记录时并入 `target`/`detail`。
2. **显式补录**（认证类）：
   - `handle_login`：成功记 `login.success`、失败记 `login.failure`（含原因）——登录时无会话账号、失败无有效账号，必须显式记。
   - `handle_logout`：记 `logout`。
   - 中央拦截**跳过** `/api/login`、`/api/logout`，避免与显式补录重复。

## 6. 查看页与导出

- `AdminView.vue` 改 `el-tabs`：`[账号管理] [审计日志]` 两标签，沿用 `/admin` 的 `requiresSuper` 守卫（仅超管，无新路由/pageKey）。
- 审计日志标签（新组件 `AuditLogTab.vue` + `lib/audit.ts`）：
  - 表格列：时间 / 账号 / 动作 / IP / 目标 / 结果 / 详情。数字/时间列挂 `.u-num`（tabular-nums）。
  - 筛选：账号（下拉，来自 facets）、事件类型（多选，来自 facets）、日期区间、结果（成功/失败）、关键字（对账号/动作/目标/详情模糊匹配）。
  - 分页：**后端按筛选分页**（读活动日志）；归档文件为磁盘备份、默认不进 UI。
  - 导出：**当前筛选结果导出 xlsx**（复用前端 `xlsx` 能力；导出走"全部筛选结果"而非仅当前页）。
- 后端新增：
  - `GET /api/admin/audit?account=&event=&from=&to=&result=&kw=&page=&pageSize=` → 超管专属，返回 `{success, rows, total, facets}`。
  - 导出复用同端点（`pageSize` 传大值或 `all`），前端拿全量筛选结果构 xlsx。
  - 新端点路径 `/api/admin/audit` 命中 `_authz_gate` 的 `path.startswith('/api/admin/')` 分支，天然超管化；无需改授权表。

## 7. 隐私与安全护栏

- **绝不记录**：明文密码、密码哈希、salt、会话 token、cookie 原值、完整请求体。
- 改密只记「修改密码」事实；登录失败只记尝试的账号名 + 原因（`密码错误`/`账号不存在`），**不记尝试的密码**。
- 审计文件位于 `data/`：非超管直链已被 `_is_protected_data_path` 拦截；查看 API 亦超管专属（双保险）。
- UA 截断 200 字符、账号名沿用既有 ≤256 校验，防超大字段撑爆记录。

## 8. 版本 · 打包 · 部署

- 版本：**V2.7.0**（新增审计子系统，Y 级）。单一来源 `frontend/src/version.ts`。
- 改动面：`server.py`（埋点+新端点）、新增 `audit.py`；前端 `AdminView.vue`、新增 `AuditLogTab.vue` + `lib/audit.ts`。
- 部署：**须重启后端**（`server.py`+`audit.py` 变更）；**不需点「更新数据」**（审计独立于 `analysis_data.json`）；**无需改 nginx**（`X-Forwarded-For` 已配）。
- 运行期数据：`data/audit_log.jsonl`、`data/audit_archive/` 为 gitignored、不进发布包，部署后从空开始积累。
- 打包流程沿用：PowerShell `--base=/pm/` 构建校验 `="/pm/assets` → `make_update_zip.py` → 重建默认 dist 校验 `="/assets`。
- 从在线基线 **V2.6.15 增量**。

## 9. 测试（TDD）

后端 `tests/test_audit.py`：
- 纯函数：`map_action`（POST 写路径命中/GET 白名单命中/读端点返回 None）、`client_ip`（XFF 首跳/X-Real-IP 回退/client_address 回退）、`_trim_and_archive`（按条数保留/按天数丢弃/溢出量正确）。
- I/O（tmp 目录）：`record`→`read` 往返；滚动把溢出**写进归档文件**且活动文件精简正确；`read` 筛选（账号/事件/日期/结果/关键字）与分页正确；`record` 遇写失败不抛。

后端 `tests/test_server_audit.py`（或并入 `test_server_tags.py` 同风格）：
- 中央拦截：一次认证 POST 写端点后活动日志新增一条、字段正确（账号/IP/动作/状态）。
- 登录成功/失败/登出分别落 `login.success`/`login.failure`/`logout`。
- `/api/admin/audit` 超管可读、非超管 403。
- 隐私：登录失败记录不含密码；改密记录不含密码/哈希。

前端 `AuditLogTab` vitest：筛选/分页/导出行为、facets 渲染、空态。

## 10. 单元边界（isolation）

- `audit.py`：纯采集/存储/读取，**不依赖** `server` 模块（`server` 单向依赖 `audit`）；I/O 路径经模块常量可 monkeypatch（仿 `test_server_tags` 对 `PROJECT_TAGS_FILE` 的做法）。
- `lib/audit.ts`：仅 fetch + 类型；筛选/导出为纯函数便于测试。
- `AuditLogTab.vue`：仅渲染 + 交互，数据经 `lib/audit.ts`。
