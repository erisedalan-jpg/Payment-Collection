# 设计：服务器端数据下载 + /insight/board 排名图表随排序换口径

- 日期：2026-06-25
- 版本：目标 V2.1.1（Z 级——/data 局部增下载 + /insight/board 排名图局部联动；不动大版本）
- 状态：已与用户确认，待写实施计划
- 涉及页面：`/data`（数据管理）、`/insight/board`（回款多维分析·排名）

## 1. 背景与目标

当前「更新数据」只重跑预处理（`preprocess_data.py`），数据源仍需人工放置 `input/`、`input/pmis/`。`pmisdata/` 下已有一套从 PMIS 在线抓取的脚本（`run_pmis_pipeline.sh` → 备份→下载→覆盖到 input/），但只能在服务器上手工跑，且依赖 `pmisdata/config.json` 里的 `session_cookie`。

本次目标：

1. **`/data` 增「下载数据」按钮**（放「更新数据」左侧），点击后由**服务器后台**跑 `run_pmis_pipeline.sh` 下载并覆盖数据，进度经 SSE 回传；Cookie 由能访问 PMIS 的机器获取后传到服务器写入 `config.json`。**只下载，不自动更新**（下载完提示点「更新数据」生效）。原离线放置+更新流程不变。同时压缩 `/data` 文件清单的展示空间。
2. **`/insight/board` 排名**：切换「排序」后，下方柱/折/饼图**随排序指标整体换口径**（而非仅重排、口径写死）。

## 2. 硬约束（决定架构）

- PMIS 会话 cookie 只能由人工登录获取，服务器无法自助登录。
- 浏览器同源策略：pmplatform 网页（`http://服务器:8080`）的 JS **读不到** `pmis.qianxin-inc.cn` 的 cookie；关键 `SESSION` 是 HttpOnly，连 `document.cookie`/书签脚本都读不到。能读 HttpOnly 全量 cookie 的实际只有 `update_cookie.py`（Playwright 读浏览器上下文）。
- 因此「点网页按钮自动取 cookie」不可行；cookie 必须先在能访问 PMIS 的机器上取到，再传给服务器。

## 3. 既定决策（用户确认）

| 决策点 | 选择 |
|---|---|
| 架构 | **甲：服务器端下载**（Ubuntu 服务器自身可访问 PMIS，已确认） |
| Cookie 送达 | **粘贴框 + `update_cookie.py --server` 直推 两条路并存**，共用一个端点 |
| Playwright | 抓 cookie 的机器两条路都保留（装了用 `--server`，没装用粘贴框） |
| 下载后动作 | **只下载，不自动 reprocess**；完成后提示点「更新数据」 |
| board 图表 | **随排序指标整体换口径**；柱/折单系列、按指标性质（金额/计数/比率）自适应；比率类饼图降级隐藏；不再恒为已回/待回 |

## 4. 任务1 — 后端：服务器端下载 + Cookie

### 4.1 新增端点（均超管专属）

加入 `server.py` 的 `_SUPER_ONLY_PATHS`，由 `_authz_gate` 拦截非超管。

1. **`POST /api/pmis/cookie`** `{cookie: "<完整 cookie 串>"}`
   - 校验：非空且包含 `SESSION=`；否则返回 `_error_payload(ERR_VALIDATION, ...)`。
   - 行为：读 `pmisdata/config.json`，仅替换 `session_cookie` 字段（保留其余键），原子写回（写临时文件再 `os.replace`）。
   - 返回：`{success: true, sessionPreview: "b394d964", message: "Cookie 已更新"}`（SESSION 前 8 位）。
   - 复用方：网页粘贴框、`update_cookie.py --server`。

2. **`GET /api/pmis/cookie`**（状态查询）
   - 返回：`{sessionPreview, updatedAt}`——`updatedAt` 取 `pmisdata/config.json` 的 mtime（本地时间字符串），`sessionPreview` 从现有 `session_cookie` 解析 SESSION 前 8 位；无则空串。
   - 用途：`/data` 页加载时显示「当前 SESSION xxxxxxxx · 更新于 …」。

3. **`GET /api/pmis/download`**（SSE，仿 `handle_reprocess`）
   - 互斥：`download_state.running` / `reprocess_state.running` / `history_state.running` 任一为真则拒绝（返回 `{running:false, message:"其他数据操作进行中..."}`）。
   - 起 `threading.Thread(target=run_download, daemon=True)`，随后 SSE 循环推 `download_state`，到 `progress>=100` 或 `running=False` 结束。

### 4.2 `run_download()`

- 全局：`download_state = {"running":False,"progress":0,"message":""}`（与 `reprocess_state` 同形）。
- 定位脚本：`os.path.join(BASE_DIR, "pmisdata", "run_pmis_pipeline.sh")`；不存在 → `download_state = {running:False, progress:0, message:"下载脚本不存在"}` 返回。
- **frozen/dev 同路径**：脚本位于磁盘 `pmisdata/`、内部调用系统 `python3`，与 exe 是否打包无关——两种模式都用 `subprocess.Popen(["bash", script], cwd=<pmisdata>, env={**os.environ, "PMPLATFORM_DIR": BASE_DIR}, stdout=PIPE, stderr=STDOUT, encoding="utf-8", errors="replace")`。（不需 `_run_script_direct` 的 importlib 直跑，那是为 exe 内嵌且目标机无 python 的 preprocess 准备的；此处不适用。）
- 逐行解析进度（新函数 `classify_download_line(line) -> (progress, message) | None`，纯函数可单测）：

  | 行匹配（子串） | progress | message |
  |---|---|---|
  | `Step 1/3` | 10 | 下载 PMIS 报表… |
  | `✓ fetch_pmis_tables.py 执行成功` | 30 | PMIS 报表已下载 |
  | `Step 2/3` | 35 | 下载全量项目损益（耗时较长）… |
  | `✓ fetch_all_projects.py 执行成功` | 75 | 项目损益已下载 |
  | `Step 3/3` | 80 | 交付成本分析… |
  | `✓ delivery_analysis.py 执行成功` | 90 | 成本分析完成 |
  | `拷贝到目标路径` | 95 | 拷贝到 input/… |
  | `流水线完成` | 100 | 下载完成，请点「更新数据」生效 |
  | 含 `✗`（失败标记） | —（保留进度） | 记为错误行，收集到 errs |

  其余非空行：仅更新 `message`（显最新有效行，让管理员看到活动），progress 不变。进度单调不回退。
- 结束：`process.wait()`；退出码≠0 或出现 `✗` → `download_state = {running:False, progress:0, message:"下载失败: " + 最后几行错误}`。成功 → `progress=100, message="下载完成，请点更新数据生效"`，**不触发 reprocess**。
- `finally`：`time.sleep(3); download_state["running"]=False`（与 reprocess 收尾一致，给前端读完末态）。

### 4.3 `pmisdata/run_pmis_pipeline.sh`

仅参数化目标根目录，向后兼容（默认仍 `/opt/pmplatform`）：

```bash
PMPLATFORM_DIR="${PMPLATFORM_DIR:-/opt/pmplatform}"
PMIS_TARGET="$PMPLATFORM_DIR/input/pmis"
INPUT_TARGET="$PMPLATFORM_DIR/input"
```

替换原硬编码的 `PMIS_TARGET="/opt/pmplatform/input/pmis"`、`INPUT_TARGET="/opt/pmplatform/input"` 两行。其余逻辑（备份、清理、3 步下载、校验、拷贝）不动。

### 4.4 Cookie 送达：三条路径（按身份证明方式区分）

**关键前提**：服务器在 HTTP 层无法判断请求"是否来自可信环境"，只能看请求**是否携带身份凭证**。浏览器自动带会话 cookie，裸脚本默认不带。据此分三路：

1. **网页粘贴框（主路径、通用、免鉴权）**——见 §5.1。超管在任意能访问 PMIS 的（有界面的）机器抓到 cookie 串（`update_cookie.py --txt` 或浏览器 DevTools→Application→Cookies 复制含 SESSION 的串），粘进 `/data`，靠**超管浏览器会话**授权 `POST /api/pmis/cookie`。无需脚本鉴权，覆盖所有拓扑。

2. **`update_cookie.py` 在服务器本机直跑 → 直写 config.json（免 HTTP/免鉴权）**：保留现有本地写行为，写的就是服务器磁盘上的 `pmisdata/config.json`，服务器从同一文件读取。仅当抓 cookie 与服务器**同机**且服务器有图形界面可完成 Playwright 交互登录时适用。此路径**无需 `--server`**。

3. **`update_cookie.py --server <url>`（可选便捷路径，跨机器用）**：新增参数 `--server <url>`、`--account <超管账号>`、`--password <pw>`（password 缺省 `getpass` 交互输入）。
   - 现有 Playwright 抓 cookie 流程不变，得到 `cookie_string`。
   - 用 stdlib `urllib.request`（不引入新依赖）：
     1. `POST <url>/api/login` `{account, password}`（字段名以 `server.py handle_login` 为准：`account`/`password`），从响应 `Set-Cookie` 取 pmplatform 会话 token。
     2. 带该会话 Cookie 头 `POST <url>/api/pmis/cookie` `{cookie: cookie_string}`。
     3. 打印服务器返回（`[OK] Cookie 已推送到服务器 (SESSION xxxxxxxx)` 或 `[ERROR] ...`）。
   - `--txt`/默认本地写 `config.json` 行为保留；`--server` 与本地写互不排斥。

### 4.5 互斥与安全

- `handle_reprocess`、数据历史回滚/撤销在 busy 判断里加入 `download_state.running`。
- 三个新端点都在超管门内（`_SUPER_ONLY_PATHS` / `/api/admin/` 同级），非超管 403。
- Cookie 是敏感的实时会话，仅经已鉴权通道传输、落 `pmisdata/config.json`。

### 4.6 打包/部署清单（spec 记录，落实施时核对，不在本次扩大代码改动面）

- `make_deploy_zip.py` 需纳入 `pmisdata/`：`run_pmis_pipeline.sh`、`fetch_pmis_tables.py`、`fetch_all_projects.py`、`delivery_analysis.py`、`update_cookie.py`、`config.json`（**原样进包，含当前 cookie**——SESSION 定期过期、无安全隐患，无需置空/ignore；首次部署后由「下载数据」或 `--server` 刷新即可）、桥接 `A.xlsx`、`项目基础信息数据*.xlsx`（脚本依赖）。
- 服务器需有 `bash`、`python3`（含 `requests`、`openpyxl`）；抓 cookie 的机器另需 `playwright` + chromium。

## 5. 任务1 — 前端：/data 展示压缩 + 下载区

改 `frontend/src/views/DataView.vue`，新增 composable `usePmisDownload`（仿 `useReprocess` 的 SSE 模式）与 api 封装 `pmisCookie`（GET/POST）、`pmisDownload`（SSE）。

### 5.1 下载区（并入「更新数据」卡）

- 卡头改「数据下载 / 更新」。
- **Cookie 行**：`PMIS Cookie` 文本域（`rows=2`，占位「粘贴完整 cookie 串；已用 update_cookie.py --server 推送可留空」）+ 状态文字「当前 SESSION xxxxxxxx · 更新于 …」（来自 `GET /api/pmis/cookie`，onMounted 拉取）。
- **按钮行**：`[下载数据]` `[更新数据（重新处理）]`——**下载按钮在更新按钮左侧**——+ hint。
- **两条独立进度条**：下载（download SSE）/ 更新（既有 reprocess SSE），各自的 `dv-progress`。
- 点「下载数据」：
  1. 文本域非空 → 先 `POST /api/pmis/cookie`，把结果显在状态文字（成功更新 sessionPreview/updatedAt；失败显错误，**中止**不进入下载）。
  2. 开 `GET /api/pmis/download` SSE，进度+消息走下载进度条。
  3. 完成显「下载完成，请点更新数据生效」（不自动 reprocess）。
- 下载/更新进行中互相禁用按钮（沿用 `:disabled`）。

### 5.2 文件清单压缩

- 把「一文件一行」（`.dv-frow`，name 固定 230px）改为**响应式多列网格**（约 2–3 列，窄屏回落 1 列）。
- 每格：**去扩展名短名**（`.xlsx`/`.csv` 去掉，`title` 存全名供悬停）+ 修改时间（更小号 `--mut`）。
- PMIS 九表、项目域 两组各一网格；两个上传按钮与逻辑不变。
- 目标：纵向占用降约 ⅔，信息（文件名+mtime）不丢。

## 6. 任务2 — /insight/board 排名图表随排序换口径

改 `frontend/src/views/BoardView.vue` 与 `frontend/src/lib/chartOptions.ts`。

### 6.1 排序键 → 图表口径映射

```ts
// BoardView 内
const SORT_CHART: Record<PayBoardSortKey, { label: string; kind: ValueKind; val: (g: PayBoardGroup) => number }> = {
  projectCount:   { label: '项目数',   kind: 'count',  val: (g) => g.projectCount },
  contractSum:    { label: '合同金额', kind: 'amount', val: (g) => g.contractSum },
  rate:           { label: '完成率',   kind: 'ratio',  val: (g) => g.rate ?? 0 },
  delayedNodeSum: { label: '延期节点', kind: 'count',  val: (g) => g.delayedNodeSum },
}
const activeChart = computed(() => SORT_CHART[sortKey.value])
```

- `chartTop = sortedGroups.slice(0,15)` 不变（本就随 `sortKey` 重排）。
- `categories = chartTop.map(g => g.key)`；`values = chartTop.map(activeChart.value.val)`。

### 6.2 三图改用统一构建器

- 柱：`buildRankingOption('bar', {categories, values, metricLabel: activeChart.label, valueKind: activeChart.kind, palette})`
- 折：`buildRankingOption('line', { ... })`
- 饼：`valueKindForPie(activeChart.kind)` 为真 → `buildRankingOption('pie', {...})`；为假（`ratio`/完成率）→ **不渲染图，显降级提示**「完成率为比率，不宜用饼图」。
- 标题随指标：`${activeChart.label}排名（Top ${chartTop.length}）`；饼图降级时标题同上、正文为提示。
- 删除原 `stackedBarOption`/`lineChartOption`（已回/待回堆叠柱、双折线）；`pieChartOption` 改为按 activeChart 构建。`STATUS_LIGHT/DARK` 在本视图若不再被其它处使用则一并移除 import。

### 6.3 chartOptions.ts 加 `palette`

- `RankingOptionParams` 增可选 `palette?: string[]`；`buildRankingOption` 内 `const color = params.palette ?? CHART_LIGHT`，pie 与 bar/line 的 `color` 改用 `color`。默认值保证既有调用零回归。
- BoardView 传 `palette = settings.theme === 'dark' ? CHART_DARK : CHART_LIGHT`（消除深色主题下饼/柱用浅色板的旧问题）。

## 7. 模块边界

- `classify_download_line`：纯函数，输入一行、输出 `(progress, message)|None`，独立可测，不碰 IO。
- `POST /api/pmis/cookie` 的 config 读改写：单一职责「替换 session_cookie 字段并原子写」，可抽一个小 helper（如 `pmisdata` 无 server 依赖的 `write_session_cookie(config_path, cookie)`），便于单测。
- `usePmisDownload`：只管 SSE 状态机（progress/message/running/start），与 `useReprocess` 对称；DataView 只编排。
- `SORT_CHART` 映射 + `buildRankingOption`：图表构建与视图编排分离；`buildRankingOption` 仍是无副作用纯函数。

## 8. 验证

`bash verify.sh` 全绿：

- 后端 pytest 新增：
  - `write_session_cookie`：合法写入保留其余键、原子；非法（无 SESSION/空）拒绝。
  - `classify_download_line`：各步骤标记→正确 (progress,message)；`✗`/空行/无关行处理。
- 前端 vitest 新增/改：
  - `chartOptions`：传 `palette` 时 bar/line/pie 用该色板；不传时回落 `CHART_LIGHT`（零回归）。
  - BoardView：切 `sortKey` 后 `values`/标题随 activeChart 变；`rate` 时饼图降级。
  - DataView：点「下载数据」先 POST cookie（mock）再开 SSE；文件清单网格渲染短名+title。
- `npm run typecheck` / `npm run build` 绿。
- 下载与 cookie 推送因本机无 PMIS 访问，由用户在可访问机器上冒烟（下载成功/失败反馈、`--server` 直推）。

## 9. 不做（YAGNI / 边界）

- 不自动在下载后触发 reprocess（用户明确二步）。
- 不在网页里尝试用 JS 直接读 PMIS cookie（跨域+HttpOnly 不可行）。
- 不改 `run_pmis_pipeline.sh` 的下载/备份算法，只参数化目标根。
- 不在本次重构 `make_deploy_zip.py` 打包逻辑之外的部分（仅按 4.6 清单补 pmisdata 纳入，落实施时处理）。
- board 不保留旧的已回/待回堆叠视图（用户确认单系列换口径）。
