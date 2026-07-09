# 本机 cookie 代理 + /data 网页驱动取 cookie 设计 · V2.7.1

> 日期：2026-07-09
> 状态：设计已确认（用户认可）
> 范围：把 `client/` 桌面工具的「取 cookie」能力集成进 `/data` 网页——网页点按钮 → 本机常驻小代理静默取 cookie → 网页传到服务器。PMIS 全链路（取→推→下载），倚天仅「取+存」备用（倚天功能本系统暂未开发）。

## 1. 目标与背景

现状：管理员用 `client/` 下的桌面 GUI（「奇安信Cookie工具」）取 PMIS/倚天 cookie 并推送到平台、触发下载。用户希望**在 `/data` 网页上点按钮取本机 cookie、再由网页传到服务器**，不必开独立桌面 App。

### 已确认的硬约束（不可回避，决定整个方案形态）

- **取 cookie 必须在装有零信任客户端的本机、由一个原生进程完成**：`_silent_fetch` 靠本机零信任客户端（系统级代理，把内网域名劫持到 198.18.x 虚拟 IP 再转发认证）在 `requests` 静默访问 `https://pmis.qianxin-inc.cn` / `https://yitian.b.qianxin-inc.cn` 时自动注入认证、收集 Set-Cookie 拼成整行 cookie 头。
- **浏览器 JS 取不到 cookie**：跨域 + 目标域 cookie 为 HttpOnly，JS 读不到；因此网页按钮背后必须有一个本机进程替它取。
- **服务器取不到 cookie**：平台服务器（Ubuntu, 10.248.105.95）**能到达** PMIS 网络（所以服务端下载本就能跑），但**没有零信任客户端、拿不到 cookie**。
- **用户已确认**：开浏览器的机器 = 装零信任、能取 cookie 的机器（同一台，网页才能经 127.0.0.1 调本机代理）；接受用「无界面常驻小代理」替代现桌面 GUI。

### 已验证：现有 `/pmisdata` 脚本与本方案完全兼容，cookie 可正确使用

- `run_pmis_pipeline.sh` 依次跑 `fetch_pmis_tables.py` → `fetch_all_projects.py` → `delivery_analysis.py`；前两者读 `pmisdata/config.json` 的 `session_cookie`，**直接作 `Cookie` 请求头**打 `base_url=https://pmis.qianxin-inc.cn`。
- 客户端 `_silent_fetch(PMIS_TARGET)` 取到的正是 `pmis.qianxin-inc.cn` 的**整行 cookie（含 `SESSION=`）**——与脚本所需**同域、同格式**。
- 服务端链路 `POST /api/pmis/cookie`（`pmis_config.write_session_cookie` 校验含 `SESSION=` → 原子写 `config.json`）→ `GET /api/pmis/download`（跑 pipeline）**今天就在用**（桌面 GUI 正是这么驱动的）。→ **PMIS 侧脚本零改动**。
- `pmisdata/update_cookie.py` 是**遗留的 playwright 取 cookie 脚本**（项目 V1.16.2 已弃 playwright），不在 pipeline 里、不冲突、本方案不用它。
- 校验闸：PMIS cookie 必须含 `SESSION=`（否则 `/api/pmis/cookie` 拒绝，提示「PMIS 未登录」）；**倚天 cookie 无 SESSION**（键为 `XSRF-TOKEN / tinytiger_online_session / PHPSESSID / session_id / portal_1`），故倚天存储端点**不套用 SESSION 校验**（只查非空）。

## 2. 决策记录（brainstorm 已定）

| 决策点 | 选择 |
|---|---|
| 集成形态 | **本机常驻小代理 + /data 网页按钮驱动**（方案 1）；浏览器点按钮 → 代理取 cookie → 网页传服务器 |
| 代理职责 | **只取 cookie、不碰平台账号**；推送由浏览器用当前超管会话做 |
| 代理形态 | 无界面、常驻、开机自启、只监听 `127.0.0.1`；复用 `_silent_fetch`；`client/` 精简改造 |
| 安全 | 127.0.0.1 绑定 + `Origin` 白名单校验（浏览器不可伪造 Origin）+ 预检含私有网络访问头 |
| PMIS 范围 | 全链路（取→推→下载），绝大部分复用现有端点/脚本，脚本零改动 |
| 倚天范围 | 仅「取+存」：新增 `POST/GET /api/yitian/cookie`，存 `data/yitian_config.json`（gitignored），**不做下载**（倚天功能暂未开发） |
| 倚天存储 | 服务端 `data/yitian_config.json`，字段 `session_cookie`，与 PMIS 的 `pmisdata/config.json` 对称 |
| 审计 | 两处 cookie 写入纳入 V2.7.0 审计；`_ACTION_MAP` 加 `('POST','/api/yitian/cookie')`（PMIS 已在表中） |
| 版本 | V2.7.1（`/data` 页内增强 + 新端点 + 本机代理，Z 级） |

## 3. 架构与部件

三个职责单一的部件：

### 3.1 本机 cookie 代理（`client/` 精简改造）

- 复用现有 `_silent_fetch(target_url, ...)`（禁系统代理 `trust_env=False`、空 proxies、检测重定向登录页/登录页 HTML、拼整行 cookie）。
- 用 Python 标准库 `http.server` 起本地服务，**只监听 `127.0.0.1`，默认端口 `8765`**（可配）。
- 端点（均 `GET`，返回 JSON）：
  - `/ping` → `{ok: true, service: "pmp-cookie-agent", version: "..."}`（健康探测，供网页判断代理是否在跑）。
  - `/pmis-cookie` → 取 PMIS cookie，返回 `{ok, cookie, names, hasSession, error}`；`hasSession` = cookie 名里是否有 `SESSION`。
  - `/yitian-cookie` → 取倚天 cookie，返回 `{ok, cookie, names, error}`（无 hasSession 概念）。
- **CORS/预检**：对所有端点，若请求带 `Origin` 且在白名单内，回 `Access-Control-Allow-Origin: <该Origin>`；处理 `OPTIONS` 预检并额外回 `Access-Control-Allow-Private-Network: true`（应对新版 Chrome 私有网络访问预检，防内网页面→localhost 被拦）。非白名单 Origin → 403，不返回 cookie。
- **不碰平台账号/会话**（推送由浏览器做），故代理无状态、无凭据落盘。
- 配置：小 `agent_config.json`（`port`、`allowed_origins` 列表，默认含平台 IP `http://10.248.105.95`）。
- 分发：PyInstaller 出小 exe + 开机自启（Windows 启动目录快捷方式 / `.bat`）。保留/移除 GUI 由实现阶段决定（核心是无界面代理）。

### 3.2 `/data` 网页（`frontend/src/views/DataView.vue` + 新 composable/lib）

- 挂载时探测 `GET http://127.0.0.1:8765/ping`，显示「本机代理：已连接 / 未运行」状态条（未运行给启动指引，不报红崩溃）。
- **PMIS 区**新增「获取本机 PMIS cookie」按钮：调代理 `/pmis-cookie` → 若 `ok && hasSession` → 展示 SESSION 预览+cookie 名清单 → **浏览器用当前超管会话** `POST /api/pmis/cookie`（现有端点）→ 刷新 cookie 状态；`hasSession=false` 或 `error` → 提示对应原因、不推送。之后「下载数据」沿用现有。
- **倚天区**（新）新增「获取本机倚天 cookie」按钮：调代理 `/yitian-cookie` → `ok` → `POST /api/yitian/cookie`（新端点）→ 显示倚天 cookie 状态（更新时间/预览）；无下载按钮（倚天功能暂未开发，标注「取到备用」）。
- 新增前端 `lib/cookieAgent.ts`：封装对本机代理的 fetch（`pingAgent()`/`fetchPmisCookie()`/`fetchYitianCookie()`，统一超时与错误→中文消息）。

### 3.3 服务端（`server.py` + 新 `yitian_config.py` 或复用通用 cookie 读写）

- 新增 `POST /api/yitian/cookie {cookie}` 与 `GET /api/yitian/cookie`（状态）：
  - **超管专属**（加入 `_SUPER_ONLY_PATHS`，与 `/api/pmis/cookie` 一致）。
  - 存 `data/yitian_config.json`（gitignored），字段 `session_cookie`；**校验非空即可、不要 SESSION**。
  - 读写用一个小纯函数模块（新 `yitian_config.py`，仿 `pmis_config.py` 但去掉 SESSION 强校验；`session_preview` 取 cookie 整串前 8 位——倚天无固定 SESSION 键）。
- **PMIS 端点/脚本零改动**（`/api/pmis/cookie`、`/api/pmis/download`、`pmisdata/*` 全部复用）。
- **审计**：`audit._ACTION_MAP` 加 `('POST','/api/yitian/cookie'): ('yitian.cookie_save','更新倚天 Cookie')`（PMIS 的 `('POST','/api/pmis/cookie')` 已在表中，无需加）。

### 数据流

```
浏览器(零信任机, 已登录超管) --点[获取本机PMIS cookie]--> http://127.0.0.1:8765/pmis-cookie (本机代理)
   代理 _silent_fetch(pmis.qianxin-inc.cn) --零信任静默认证--> 整行cookie(含SESSION)
   --> 浏览器拿到 --POST /api/pmis/cookie(超管会话)--> pmis_config 写 pmisdata/config.json
   --点[下载数据]--> GET /api/pmis/download --> run_pmis_pipeline.sh 用 cookie 下载
倚天: ... /yitian-cookie --> POST /api/yitian/cookie --> 写 data/yitian_config.json (存储为止)
```

## 4. 安全护栏

- 代理**只绑 `127.0.0.1`**（外部网络访问不到）。
- 代理校验请求 `Origin` == 白名单平台源；非白名单 → 403 不返回 cookie。**浏览器不允许 JS 伪造 `Origin` 头**，可挡任意恶意网页调本机代理套取 cookie。
- 平台是 HTTP、代理是 `http://127.0.0.1`，同为 HTTP，**无混合内容拦截**（若平台日后改 HTTPS，则需代理也上 TLS 或用其它通道——记为已知约束）。
- 服务端 `/api/yitian/cookie`、`/api/pmis/cookie` 均超管专属；cookie 落 gitignored 文件；不进发布包。
- cookie 仅在本机（浏览器↔代理）与内网（浏览器→平台）流转，与今日桌面工具一致，不出内网。

## 5. 错误处理与边界

- 代理未运行 → 网页 localhost fetch 抛错（连接拒绝/超时）→ 显示「本机代理未运行，请启动」+ 指引，不崩溃。
- PMIS 未登录（cookie 无 SESSION）→ 代理 `hasSession=false` → 网页提示「未检测到 PMIS 登录态」，不推送。
- 零信任未登录（被重定向到登录页 / 页面为登录页）→ 代理 `ok=false, error=...` → 网页提示「零信任未登录」。
- 倚天 cookie 只校验非空（键名不同、无 SESSION）。
- 白名单 Origin 可配（多主机名/IP 场景）；默认平台 IP。

## 6. 测试

- **代理**（pytest，`client/` 下）：mock `_silent_fetch`，测 HTTP 处理器——`/ping` 返回、`/pmis-cookie` 成功返回 JSON 且 `hasSession` 判定正确、`/yitian-cookie` 返回、白名单 Origin 放行 / 非白名单 403、`OPTIONS` 预检回 ACAO + `Access-Control-Allow-Private-Network`。
- **服务端**（pytest，HTTP 级，仿 `tests/test_server_audit.py`）：`POST /api/yitian/cookie` 超管写成功 + 落 `data/yitian_config.json`、`GET` 状态、非超管 403、空 cookie 拒绝、**审计落一条 `yitian.cookie_save`**。`yitian_config` 纯函数单测（写/读/预览/空拒绝）。
- **前端**（vitest）：`lib/cookieAgent.ts` 纯逻辑 + DataView 新按钮——mock 代理 fetch 成功→调用 `POST /api/pmis/cookie`、代理未运行态显示、`hasSession=false` 告警不推送。

## 7. 范围 · 版本 · 交付

- **范围**：PMIS 全链路（取→推→下载，绝大部分复用）；倚天仅「取+存」（新端点，无下载）。
- **版本**：**V2.7.1**（`/data` 页内增强 + 新端点 + 本机代理，Z 级；X 不变、无新页面/pageKey）。单一来源 `frontend/src/version.ts`。
- **交付两块**：
  - (a) 服务端 + 前端随平台更新包（改 `server.py` + 新 `yitian_config.py` + 前端 dist；**须重启后端**；不需点更新数据）。
  - (b) **本机代理**是客户端产物（源码 `client/`，PyInstaller 出 exe + 开机自启说明），单独发到管理员机器装一次。
- PMIS pipeline 零改动；`data/yitian_config.json`、`client/agent_config.json` 等运行期文件 gitignored、不进包。

## 8. 单元边界（isolation）

- 本机代理：`_silent_fetch`（取 cookie，已存在）与 HTTP 服务层（新增）分离；HTTP 层 mock `_silent_fetch` 可测。代理**不依赖平台代码**。
- `yitian_config.py`：纯读写/校验/预览，不依赖 `server`（server 单向依赖它，仿 `pmis_config.py`）。
- 前端 `lib/cookieAgent.ts`：仅封装本机代理 fetch + 错误中文化，无 UI；DataView 仅编排。
