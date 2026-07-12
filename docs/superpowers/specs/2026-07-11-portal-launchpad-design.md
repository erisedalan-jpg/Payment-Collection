# 首页门户 / 快捷入口（Launchpad）设计 · V2.10.0

> 日期：2026-07-11
> 状态：设计已确认（用户认可）
> 范围：在首页顶部新增一套「快捷入口 / 门户（Launchpad）」——由超级管理员在 `/data` 配置，包含 **url 跳转** 与 **文件下载** 两类项，支持分组、组内排序、置顶⭐、并可为每项设定**可见账号范围**；普通账号在首页只读展示后端已按其账号过滤的可见项。参考工作路径 `demo.html` 的 Launchpad 部分。

## 1. 目标与背景

平台是**单机 / 内网离线**运行的项目管理与回款看板（后端纯标准库 `server.py`，前端 Vue3+Vite）。用户希望在**首页**增加一个门户区，让常用外部系统（如 PMIS、OA）一键跳转、常用文件（如周报模板、财报）一键下载，且这套入口由超管统一维护、按账号分发。

本功能新增：

- **首页顶部「快捷入口」紧凑区**（`OverviewView.vue`，KPI 卡之上），只读展示当前账号可见的门户项。
- **`/data` 配置区**（`DataView.vue` 内，仅超管），增删改门户项、管理分组与排序、上传文件、设可见范围。
- **后端门户子系统**：`data/portal_links.json`（配置）+ `data/portal_files/`（上传文件）+ 4 个端点 + 审计埋点。

### 关键既有事实（约束设计，均已核实 `文件:行号`）

- **超管写端点鉴权**：`do_POST` → `_auth_gate()`(401) → `_authz_gate()`(403) → `_dispatch_post`（`server.py:739`）。核心 helper `_require_super()`（`server.py:2199`）返回超管 account 或 None（失败已发 403）。超管路径可加入 `_SUPER_ONLY_PATHS`（`server.py:181`）由闸门统一拦截，或在 handler 首行手写 `if self._require_super() is None: return`。
- **JSON 持久化范式**：`_atomic_write_json(path, data)`（tmp+os.replace，`server.py:220`）+ `threading.RLock`（仿 `_tags_lock`，`server.py:272`）+ load/save 对（仿 `_load_project_tags`/`_save_project_tags`，`server.py:293`/`310`）。整存写端点走事务 helper `_followup_txn(lock, load, mutate, save)`（`server.py:2278`，返回 `(ok, res)`；`ValueError`→400，其它→500）。
- **无现成强制下载端点**：全后端**当前不存在** `Content-Disposition: attachment` 端点（`/api/pmis/download` 是 SSE 进度流，非回文件）。「服务器文件→浏览器」现仅靠 `CustomHandler` 静态服务（inline）。需**新写**下载 handler，响应写法照抄 `_serve_raw_data_file`（`server.py:2149`：`open(...,'rb').read()` → `send_response`/`send_header`/`end_headers`/`wfile.write`）；`_send_json` 的 `extra_headers` 参数（`server.py:2144`）演示追加自定义头。
- **上传落盘白名单范式**：`is_valid_pmis_name`/`is_valid_input_name`（固定白名单，`server.py:44-55`），落盘 `os.path.join(BASE_DIR, 'input', ...)`（`server.py:1916-1919`，multipart 解析已有）。
- **路径分支**：`BASE_DIR`（frozen=`os.path.dirname(sys.executable)`，否则源码目录，`server.py:78`）。**所有可写数据一律基于 `BASE_DIR`**；绝不用 `STATIC_DIR`/`sys._MEIPASS`（PyInstaller 临时只读目录，退出即销毁）。
- **前端当前用户 / 账号列表**：auth store 暴露 `isSuper` computed 与 `user.account`（`frontend/src/stores/auth.ts:14-17`，类型 `AuthUser` 见 `frontend/src/lib/auth.ts:3`）。全部账号经 `listAccounts()`（`frontend/src/lib/admin.ts:23`，GET `/api/admin/accounts`，仅超管可调）→ `AdminAccount[] = {account, displayName, isSuper, ...}`，后端 `handle_admin_accounts_list`（`server.py:2305`）→ `auth.list_public_accounts()`（脱敏，无 salt/hash）。
- **审计**：中央埋点在 `do_POST` 的 `finally` 调 `_audit_request()`（`server.py:749`）→ `audit.map_action(method, path)` 查 `_ACTION_MAP`（`audit.py:29`），命中才落盘。handler 内用 `self._audit_set(target=..., detail=...)`（`server.py:2242`）富化；纯函数 `audit.count_delta`/`join_detail` 可复用。
- **多线程**：`ThreadingHTTPServer`，文件写入必须加锁。
- **`/data` 结构**：`DataView.vue` 已有 `dv-maint` 的 `el-collapse`（项目标签 / 人工导入 / 历史回滚 / 清空数据，`DataView.vue:303`）——门户配置作为新 `el-collapse-item` 并入。
- **per-user localStorage**：已有 `lib/userScopedKey`（首页折叠状态按账号持久化复用它）。
- **设计令牌**：色块取色用 `--chart-1..8`；禁手写散值、禁 emoji 装饰（注：门户项的 `emoji` 是**用户数据**，非 UI 装饰，不受此限）。

## 2. 决策记录（brainstorm 已定，不再回头）

| 决策点 | 选择 |
|---|---|
| 门户位置 | **首页顶部内嵌紧凑区**（`OverviewView.vue`，KPI 卡之上），无新增路由/pageKey |
| 配置入口 | 并入 `/data` 的 `dv-maint` 折叠区，**仅超管**可见可编辑 |
| 项类型 | **url 跳转** + **文件下载** 两类 |
| 文件来源 | **超管上传到服务器**（`data/portal_files/`），非外链 |
| 可见范围 | 每项二选一：**全部账号** 或 **勾选具体账号**（多选自 `listAccounts()`） |
| 组织排序 | **支持分组 + 排序**：自定义组名（下拉选已有 + 可新建）、组级排序、组内排序、跨组**置顶⭐** |
| 图标外观 | **首字母色块 + 可选 emoji + 置顶⭐**（emoji 有值覆盖首字母） |
| url 打开方式 | **新标签页**打开（`target=_blank` + `rel="noopener noreferrer"`） |
| 排序交互 | v1 **上移/下移按钮**（组级 + 组内项级），不引拖拽依赖（拖拽留后续增强） |
| 上传上限 | **50 MB**（单文件；可调常量） |
| 首页空态 | 当前账号**无可见项 → 整块不渲染**；超管额外显一行「＋ 配置首页快捷入口 →」跳 `/data` |
| 版本 | **Y 级 V2.10.0**（新增首页区块 + /data 配置 + 新后端端点/本地数据；Y 无需大版本确认） |

## 3. 架构与数据流

```
超管 /data「首页门户」配置区（DataView.vue，PortalConfigCard.vue）
   ├─ 增/删/改门户项、组管理、组/项排序、置顶⭐
   ├─ 上传文件 ── POST /api/portal/upload（超管，multipart）──▶ data/portal_files/<id>__<消毒名>
   ├─ 设可见范围（全部 / 勾选具体账号，多选自 listAccounts()）
   └─ 保存 ── POST /api/portal/config（超管，_followup_txn + 校验 + 清理孤儿文件）──▶
                          │
                data/portal_links.json  （原子写 + _portal_lock RLock，仿 project_tags）
                          │
        GET /api/portal/config（全员登录；后端按当前账号过滤 visibility，越权项连 url/文件名都不返回；超管返回全量）
                          │
                          v
  首页 OverviewView 顶部「快捷入口」紧凑区（PortalLaunchpad.vue，可折叠）
   ├─ url 项 ── 新标签页打开（scheme 白名单校验后）
   └─ 文件项 ── GET /api/portal/download?id=（后端再校验该 id 对当前账号可见 → basename 消毒 → 强制下载）
```

**边界与职责**：配置写入与文件字节全部由后端把关；前端只做展示与表单。可见性在**列表**与**下载**两处独立强制（见 §6 安全）。

## 4. 数据模型

新建 `data/portal_links.json`（`PORTAL_LINKS_FILE = os.path.join(BASE_DIR, 'data', 'portal_links.json')`）：

```jsonc
{
  "version": 1,
  "groups": ["常用系统", "文档下载"],           // 有序组名，定义分组展示顺序；空文件初始为 []
  "items": [
    {
      "id": "pl_ab12cd34",                      // 稳定 id，后端 secrets.token_hex 生成，前缀 pl_
      "type": "url",                             // "url" | "file"
      "name": "PMIS 系统",                       // 1-60 字符
      "group": "常用系统",                       // 必须 ∈ groups
      "emoji": "",                               // 可选，0-8 字符；有值则覆盖首字母色块
      "featured": true,                          // 置顶⭐（进跨组顶部区）
      "url": "https://pmis.example.com",         // type=url 必填，仅 http/https；type=file 时为 ""
      "file": null,                              // type=file 必填 {storedName, originalName, size}；type=url 时 null
      "visibility": { "mode": "all" }            // 或 {"mode":"accounts","accounts":["zhangsan","lisi"]}
    },
    {
      "id": "pl_ef56ab78",
      "type": "file",
      "name": "周报模板",
      "group": "文档下载",
      "emoji": "📄",
      "featured": false,
      "url": "",
      "file": { "storedName": "pl_ef56ab78__周报模板.xlsx", "originalName": "周报模板.xlsx", "size": 20480 },
      "visibility": { "mode": "accounts", "accounts": ["zhangsan"] }
    }
  ]
}
```

- **展示顺序**：① 置顶区 = 所有 `featured=true` 项（按 items 数组序，跨组）；② 之后按 `groups` 顺序逐组展示该组 `featured=false` 项（组内 = items 数组序）。featured 项**只**进置顶区、不在其原组重复出现（取消置顶后回落原组）。
- **排序落地**：组顺序 = `groups` 数组序；组内/置顶项顺序 = `items` 数组序。上移/下移 = 在对应数组内交换相邻元素。
- **文件存储**：`data/portal_files/<storedName>`，`storedName = f"{id}__{sanitized_original}"`（`sanitized_original` = `os.path.basename(originalName)` 再滤非法字符）。删项 / 换文件 / 保存时，清理 `data/portal_files/` 下不再被任何 item.file.storedName 引用的孤儿文件。
- **图标**：`emoji` 非空 → 显 emoji；否则 `initials(name)`（汉字取首字，拉丁取首字母大写）+ `avatarColor(name)`（名称哈希 → `--chart-1..8` 之一）。

## 5. 后端端点

所有端点在 `server.py`，路径与文件常量基于 `BASE_DIR`。

| 端点 | 方法 | 权限 | 行为 |
|---|---|---|---|
| `/api/portal/config` | GET | 全员登录 | 读 `portal_links.json`；**超管**返回全量 `{version, groups, items}`；**非超管**返回 `visibleForAccount(config, account)`——只含 `visibility` 命中该账号的 items，`groups` 仅保留仍有可见项的组；越权项**整条不出现**（连 name/url/文件名都不返回）。响应统一 `_json_response({success, config})` |
| `/api/portal/upload` | POST | 仅超管 | multipart 单文件（仿 inputs upload 解析）；校验大小 ≤ 50MB（`PORTAL_MAX_UPLOAD = 50*1024*1024`）；生成 `id`（若前端未带则后端补）与 `storedName`，写 `data/portal_files/`；返回 `{success, file:{storedName, originalName, size}}`。**不**直接改 config（前端拿回引用后随 config 一起保存） |
| `/api/portal/config` | POST | 仅超管 | 整存：`_require_super` + `_read_json_body` + `validate_portal_config`（纯函数，见下）→ `_followup_txn(_portal_lock, _load_portal_config, lambda _: new, _save_portal_config)` → 清理孤儿文件；审计 `_audit_set` |
| `/api/portal/download` | GET | 全员登录 | 参数 `id`；载 config → 找该 id 的 file 项 → **校验 `itemVisibleTo(item, account)`**（否则 404，不区分「不存在/无权」以免探测）→ `name = os.path.basename(item.file.storedName)`，`path = os.path.join(PORTAL_FILES_DIR, name)`，`os.path.isfile` 校验 → 读字节 → `Content-Type: application/octet-stream` + `Content-Disposition: attachment; filename="<ascii回退>"; filename*=UTF-8''<百分号编码 originalName>` + `Content-Length` → `wfile.write` |

**纯函数（放 `portal.py` 新模块，便于 pytest）**：

- `validate_portal_config(raw) -> dict`：校验 `version`；`groups` 为 ≤50 项字符串列表且去重；每个 item 校验 `id`(pl_ 前缀)/`type`∈{url,file}/`name`(1-60)/`group`∈groups/`emoji`(0-8)/`featured`(bool)/`url`(type=url 时非空且 `_is_safe_url` 仅 http/https)/`file`(type=file 时 `{storedName,originalName,size}` 且 storedName 无路径分隔符)/`visibility`(mode∈{all,accounts}，accounts 为字符串列表)。非法抛 `ValueError`（→400）。
- `_is_safe_url(url) -> bool`：`urlparse(url).scheme in ('http','https')`。
- `visibleForAccount(config, account) -> dict`：过滤 items + 收敛 groups，供 GET 非超管分支。
- `itemVisibleTo(item, account) -> bool`：`mode=='all'` 或 `account in accounts`。
- `orphan_files(config, existing_names) -> list`：算出可删的孤儿文件名。

**路由注册**：`_dispatch_post` 加 `/api/portal/config`、`/api/portal/upload`；`do_GET` 的 API 分支加 `/api/portal/config`、`/api/portal/download`。写端点路径加入 `_SUPER_ONLY_PATHS`（config/upload）。GET 两个端点仅需登录（不入超管闸）。

**审计**：`audit.py` 的 `_ACTION_MAP` 增：
```python
('POST', '/api/portal/config'): ('portal.save', '保存门户配置'),
('POST', '/api/portal/upload'): ('portal.upload', '上传门户文件'),
```
handler 内 `self._audit_set(detail='跳转 %d 项 · 文件 %d 项' % (n_url, n_file))`。

## 6. 安全（吸取历史 Critical：后端切数据 / 跨范围泄露）

1. **可见性双重强制**：`GET /api/portal/config` 对非超管**不返回**越权项（连 name/url/文件名都不出现）；`GET /api/portal/download` **独立**再校验 `itemVisibleTo`，杜绝「猜 id 直接下载」。两处共用 `itemVisibleTo`，逻辑单一来源。
2. **越权下载 → 404**：下载端点对「项不存在」与「项存在但无权」**返回同一 404**，避免账号据响应差异探测他人可见文件的存在。
3. **URL scheme 白名单**：`_is_safe_url` 仅放 `http/https`；存储时（`validate_portal_config`）与前端渲染时双校验，挡 `javascript:`/`data:` 点击 XSS。url 项渲染 `rel="noopener noreferrer"` + `target="_blank"`。
4. **下载路径消毒**：只在 `PORTAL_FILES_DIR = os.path.join(BASE_DIR, 'data', 'portal_files')` 内取文件，`os.path.basename(storedName)` 消毒；`storedName` 在 `validate_portal_config` 阶段拒绝含 `/`、`\`、`..`。
5. **上传约束**：仅超管；大小 ≤ 50MB；`storedName` 由后端按 `id` 生成，原名仅用于 `Content-Disposition` 展示，落盘名不含用户可控路径。
6. **写端点**：config/upload 走 `_require_super` + `_SUPER_ONLY_PATHS` 双保险；multipart 解析失败/超限 → 400 明确报错。
7. **审计留痕**：门户增删改（config.save / upload）落审计，可追溯谁改了分发范围。

## 7. 前端结构

| 文件 | 职责 |
|---|---|
| `frontend/src/lib/portal.ts` | 类型 `PortalItem`/`PortalConfig`/`PortalSection`；纯函数 `buildSections(config)`（置顶区在前 + 按 groups 分组）、`initials(name)`、`avatarColor(name)`、`isSafeUrl(url)` |
| `frontend/src/lib/portalApi.ts` | `getPortalConfig()`、`savePortalConfig(cfg)`、`uploadPortalFile(file)`、`downloadUrl(id)`（拼 `/api/portal/download?id=`，经 `apiUrl`） |
| `frontend/src/stores/portal.ts` | Pinia：`config` ref、`load()`（GET，全员）、`save(cfg)`（超管 POST）、`reset()`（登录/登出清） |
| `frontend/src/components/PortalLaunchpad.vue` | 表现型：props `sections`；渲染置顶区 + 分组区的图标瓦片；url 项 `<a target=_blank rel=noopener>`、文件项点击走 `downloadUrl(id)`；紧凑瓦片（图标 ~48px），tokens-only |
| `frontend/src/components/PortalConfigCard.vue` | `/data` 内超管配置：组管理（下拉+新建、组上/下移）、项列表表格（名称/类型/组/可见范围/置顶/上下移/编辑/删除）、保存按钮（有明确进度反馈） |
| `frontend/src/components/PortalItemEditDialog.vue` | 新建/编辑弹窗：类型切换 url↔文件、名称、组（select+可新建）、emoji（可选）、置顶开关、可见范围（全部 / 多选账号自 `listAccounts()`）、文件上传（type=file 时，调 `uploadPortalFile`）；校验 url scheme |
| `frontend/src/views/OverviewView.vue` | 顶部（KPI 之上）插入 `PortalLaunchpad`；`onMounted` 触发 `portal.load()`；折叠状态按账号存 `userScopedKey`；无可见项不渲染，超管显配置入口 |
| `frontend/src/views/DataView.vue` | `dv-maint` 加 `el-collapse-item` 「首页门户 / 快捷入口」（`v-if="auth.isSuper"`），内嵌 `PortalConfigCard` |

- **登录/登出**：`stores/auth.ts` 的 login/logout 已 `reset()` 一批 store，门户 store 一并加入 `reset()`，杜绝换账号复用上一用户的可见配置。

## 8. 版本 / 部署

- **版本**：`frontend/src/version.ts` → `V2.10.0`，`RELEASE_DATE = 2026-07-11`（或实际发版日）。
- **部署**：**非纯前端** → 换 `frontend/dist` + **重启后端**（新端点 + 新 audit 动作）。`data/portal_links.json` 与 `data/portal_files/` 首次访问/保存时自动创建，**无需**点「更新数据」。**无新增路由/pageKey，无需授权变更**。
- 升级手册基线 = 当前在线 **V2.9.0**。

## 9. 测试策略

**后端 pytest（`tests/test_portal.py` + `tests/test_server_portal.py`）**：
- `portal.py` 纯函数：`validate_portal_config` 合法/各类非法（坏 scheme、group 不在 groups、storedName 带 `..`、type/file 不匹配）；`visibleForAccount`（越权账号拿不到项 + groups 收敛）；`itemVisibleTo`；`orphan_files`；`isSafeUrl`。
- 端点：GET config 超管全量 vs 普通账号过滤；POST config 非超管 403、超管保存+回读一致；upload 非超管 403、超限 400、成功返回引用；download 可见→200+Content-Disposition（含中文名 `filename*`）、越权→404、不存在→404、path 穿越尝试→404；原子写并发安全（沿用既有锁范式，不新造测试框架）。

**前端 vitest**：
- `portal.spec.ts`：`buildSections`（置顶排序 + 分组顺序 + featured 不在原组重复）、`initials`（汉字/拉丁/空）、`avatarColor`（确定性、落在令牌集）、`isSafeUrl`。
- `PortalLaunchpad.spec.ts`：渲染分组与置顶、url 项 `target/rel` 正确、文件项点击命中 downloadUrl、空 sections 不渲染。
- `PortalConfigCard.spec.ts` / `PortalItemEditDialog.spec.ts`：增删改项、组新建、可见范围多选、url scheme 校验拦截非法、类型切换字段互斥（url 清 file / file 清 url）。
- `OverviewView` 既有测试：补「无可见项不渲染门户块」「超管显配置入口」。

**验证**：`bash verify.sh` 全绿（后端 pytest + 前端 typecheck/vitest/build）；手动冒烟：超管在 /data 建 url 项 + 上传文件项 + 设可见范围 → 普通账号首页只见其可见项、点 url 新标签打开、点文件下载成功、越权账号 GET download 直连拿 404。

## 10. 非目标（YAGNI）

- 拖拽排序（v1 用上/下移按钮）。
- 分类图标库 / 自定义配色选择器（图标 = 首字母色块或 emoji）。
- 门户项点击量统计 / 收藏（featured 由超管统一置顶，非个人收藏）。
- 外链存活探测 / 文件版本管理 / 大文件分片上传。
- 普通管理员配置门户（仅超管）。
