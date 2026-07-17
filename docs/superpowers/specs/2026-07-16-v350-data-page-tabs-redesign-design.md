# V3.5.0 设计：/data 数据管理页 Tab 化重设计

> 设计文档（spec）。落成后交 `writing-plans` 生成实施计划。
> 交流语言：简体中文。

**版本**：V3.5.0（Y 级 —— 整页重设计；线上基线 V3.4.0）。
**性质**：**纯前端**。不碰后端、不改任何 API、不进数据管线、不改业务口径、无新增第三方依赖。升级只需换 `dist/`，**无需点「更新数据」、无需重启后端、无需新授权 pageKey**。
**目标**：把 `/data` 从「5 张高矮不齐的卡自适应换列」重构成「常驻头 + 三页签」，并按数据脉络合并 PMIS 域与项目域。**功能零改动**。

---

## 0. 全局约束（每个任务都隐含遵守）

- **功能零改动**：只动展示层与组件边界。不改任何 API 调用、SSE 进度反馈、权限判定、业务口径。
- **`data-test` 钩子只增不减**：现有 11 个（DataView）+ 12 个（子组件）全部保留、名字不变。挪了位置也要在新宿主组件里原样保留，否则 `DataView.test.ts` / `PortalConfigCard.test.ts` 静默失守。
- **只引设计令牌，不手写散值**：颜色/间距/字号/圆角/阴影/动效一律引用 `frontend/src/styles/theme.css` 的 CSS 变量。违者被 `theme.tokens.test.ts` 契约测试拦下。
- **不使用任何 emoji**（CLAUDE.md 铁律）；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- **双主题**：light/dark 都要正确（`html.dark` class 切换，非 media-query）。
- **8pt 网格 / 卡片规范 / 两级阴影 / 六级字号**：遵守 `docs/superpowers/specs/2026-06-10-design-foundation-design.md` 的设计底座。
- **不引入第 16 个色号**。主操作卡的 accent 描边沿用现有 `color-mix(in srgb, var(--accent) …)` 手法，不新增颜色变量。

---

## 1. 现状基线（调查结论，实现前的事实锚点）

### 1.1 页面结构
`frontend/src/views/DataView.vue`（527 行）+ `DataStatusBar.vue`（56 行）。V2.8.0 做过一次重设计（扁平 8 卡 → 状态条 + 主区 + 折叠），V3.2.0 又按功能域重排过一次。当前结构：

```
标题 数据管理
DataStatusBar（5 项：上次处理 / PMIS / 本机代理 / PMIS cookie / 倚天 cookie）
.dv-card.dv-primary「更新看板」（reprocess 主按钮 + SSE 进度）
.dv-domain-grid  ← grid-template-columns: repeat(auto-fit, minmax(380px, 1fr))
  ├─ 「PMIS 域」        cookie 获取 / 下载数据+SSE / 九表 fgrid / 上传 / 折叠(手动 cookie)
  ├─ 「项目域文件」      根文件 fgrid / 上传
  ├─ 「倚天工时域」      文件 fgrid / 上传+模板 / holidays 长格式说明 / 倚天 cookie / 折叠×3(超管：合规范围·累积数据·合规规则)
  ├─ 「项目标签」        标签库(增删改禁用) / 按标签排除
  └─ 「维护与历史」      折叠×4（人工导入回滚 / 数据历史回滚 / 门户[超管] / 清空数据）
```

**「乱」的根因（本次要治的三件事）**：
1. `auto-fit` 让 5 张高度差 4~5 倍的卡自适应换列 → 必然排出参差与空洞。
2. 倚天卡体量是「项目域文件」卡的 4~5 倍（文件+上传+模板+长说明+cookie+3 折叠），单卡失衡。
3. PMIS 域与项目域被按「文件落在哪个目录」拆成两张并列卡，而二者本是**同一条主域管线**的输入（见 §1.3）。

### 1.2 权限事实（决定受众）
`server.py` 的 `_SUPER_ONLY_PATHS` 含 `/api/reprocess`、`/api/files/status`、`/api/pmis/upload`、`/api/inputs/upload`、`/api/pmis/cookie`、`/api/pmis/download`、`/api/yitian/cookie`、`/api/yitian/store/*`、`/api/yitian/rules`、`/api/data-history*`、`/api/manual/*`、`/api/clear-data`。
唯一对普通管理员放开的是 **`/api/tags` POST**（handler 内判权，不在超管闸内）与 `/api/yitian/settings` 的**读**（写超管）。

**用户已明确：普通管理员不会被授予 `data` 页面权限**。故本设计**只按超管一种受众排布**，不做角色分层布局、不新增 `v-if` 隐藏逻辑。
代码里现有的 `v-if="auth.isSuper"`（倚天三折叠 / 门户）**原样保留作纵深防御**，但不再作为布局依据。

### 1.3 两条上传管线与白名单（合并上传的事实基础）
- `usePmisSync()` → `POST /api/pmis/upload?name=`，白名单 `PMIS_FILE_NAMES`（9 个 xlsx：项目中心 / 项目基础信息数据 / 项目状态信息数据 / 项目风险数据 / 三个「-已关闭」/ 在建项目里程碑计划数据 / 已结项里程碑计划数据）。
- `useInputFiles()` → `POST /api/inputs/upload?name=`，白名单 `INPUT_FILE_NAMES`（组织架构.xlsx / A.xlsx / delivery_analysis.csv / delivery_analysis.xlsx / payment_records.csv / profit_loss_direct.csv / profit_loss_bridge.csv / budget_data.csv / collection_stages.csv / TOP1000.xlsx / **工时.xlsx / holidays.csv**）。
- **两个白名单完全互斥**（无同名文件）→ 按文件名自动分发安全。
- **陷阱**：`INPUT_FILE_NAMES` 含倚天两文件（后端按 `config.INPUT_SUBDIR_MAP` 落到 `input/yitian/`，与主域根文件共用同一个端点）。故主域上传的分发白名单必须是 `INPUT_FILE_NAMES − YITIAN_FILE_NAMES`，否则语义串域。
- **现有弱点（本次顺带修）**：两个 `upload()` 都对白名单外文件**静默 `continue`**，只返回 `ok` 计数，UI 报「已上传 3/4」——用户无从得知是哪个文件没传上去。
- 展示名单 `INPUT_DISPLAY_NAMES` = `INPUT_FILE_NAMES` 去掉 `delivery_analysis.xlsx`（legacy，仅上传兼容不展示）与倚天两文件。

### 1.4 现有 data-test 钩子（全部必须存活）
- `DataView.vue`（11）：`btn-fetch-pmis-cookie` `btn-download` `pmis-row` `pmis-cookie` `files-card` `btn-fetch-yitian-cookie` `manual-import-card` `man-backup-row` `history-row` `history-rollback` `history-source-note`
- `DataStatusBar.vue`（3 名）：`dsb-agent` `dsb-cookie` `dsb-yitian`
- `PortalConfigCard.vue`（8）：`portal-config-card` `pc-add` `pc-save` `pc-item-row` `pc-up` `pc-down` `pc-edit` `pc-del`

### 1.5 测试基线与已知陷阱
- `DataView.test.ts`（225 行）：`mount(DataView, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })` + `flushPromises()`；mock 了 `@/lib/manualApi`、`@/lib/cookieAgent`，stub 了全局 `fetch`。
- 一条现存断言是**旧约束**，重构后仍须成立：`expect(w.text()).not.toContain('在线下载')`（§3.1 的文案要绕开这四个字）。
- **★ 陷阱一（V3.3.0 实际踩过，致 `verify.sh` 变红）**：DataView 测试同步 `mount` 未 stub 子组件、未 `await flushPromises()` 时，子组件 `onMounted` 的拒绝会逸出成 unhandled rejection → **vitest 用例全绿但退出码非零**，`verify.sh` 判红。本次拆出 4 个新子组件会放大这个风险：新子组件若在 `onMounted` 里发请求，DataView 的测试必须 stub 它们或确保 fetch stub 覆盖其请求路径。
- **★ 陷阱二（已读源码实证，非推测）**：Element Plus **2.14.1** `node_modules/element-plus/es/components/tabs/src/tab-pane.mjs` 中 `lazy: Boolean`（Vue 布尔 prop 默认 `false`），渲染判据为
  ```js
  const shouldBeRender = computed(() => !props.lazy || loaded.value || active.value)
  ```
  `!false` 恒真 → **三个签的内容全部渲染**，非激活签仅被 `withDirectives(..., [[vShow, active.value]])` 以 `v-show` 置 `display:none`。DOM 节点存在、`textContent` 存在，故现有 `w.text()` 断言与 `find('[data-test="history-row"]')` 查询**不会因分签而失效**。
  - **因此绝不能给 `el-tab-pane` 设 `lazy`** —— 一旦设了，非激活签变 `v-if` 不渲染，测试与冷加载行为同时改变。
  - **推论**：若新测试想断言"某签当前可见"，`text()` / `find()` 都做不到（隐藏内容照样命中），必须用 `isVisible()`（`v-show` 下为 `false`）。

---

## 2. 目标结构

```
数据管理                                              ← 标题（常驻）
DataStatusBar：上次处理 · PMIS · 本机代理 · PMIS cookie · 倚天 cookie   ← 常驻
「更新看板」主操作卡：【更新数据（重新处理）】+ SSE 进度条              ← 常驻
────────────────────────────────────────
 数据源 │ 配置 │ 维护                                 ← el-tabs
```

**状态条与「更新数据」不进签、常驻 tabs 之上**：它们是本页主线，任何签下都要能一眼看到状态、一键触发。签只承载"去哪里做事"。

**Tab 不持久化**，每次进入默认落「数据源」签。理由：更新数据已常驻，签只在偶尔改配置/回滚时才切；持久化会让人下次进来莫名停在「维护」签。（**明确排除**：不引入 `usePersistentSort` 那类按账号持久化机制。）

### 2.1 签内容映射

| 签 | 卡 | 内容 | 取自今天的哪里 |
|---|---|---|---|
| **数据源** | 「项目主域」 | 获取本机 PMIS cookie + 代理徽章 / 下载数据 + SSE 进度 / PMIS 九表 fgrid / 项目域文件 fgrid / **合并上传** / 折叠：手动粘贴 PMIS cookie | 「PMIS 域」卡 + 「项目域文件」卡**合并** |
| | 「倚天工时域」 | 文件 fgrid / **合并上传 + 下载 holidays 模板** / 倚天 cookie 行 / 折叠：holidays.csv 格式说明 | 「倚天工时域」卡**瘦身** |
| **配置** | 「项目标签」 | 标签库（增/改名/禁用）+ 按标签排除 | 原「项目标签」卡 |
| | 「倚天合规」 | `YitianScopeCard`（合规检查范围）+ `YitianRulesCard`（合规规则配置） | 倚天卡的 2 个折叠 |
| | 「首页门户」 | `PortalConfigCard` | 「维护与历史」卡的门户折叠 |
| **维护** | 单栏 `el-collapse` | 人工数据导入/回滚 · 数据历史/回滚 · **倚天累积数据管理**（`YitianStoreCard`）· 清空数据 ⚠ | 「维护与历史」卡 + 倚天卡的累积数据折叠 |

### 2.2 两处刻意的归属调整（连同理由，实现时不得擅自改回）
- **倚天「累积数据管理」（`YitianStoreCard`）：倚天卡 → 维护签**。它做的是按周删除范围 / 清空累积库，性质与「数据历史回滚」「清空数据」同属破坏性数据维护，**不是配置**。今天它与文件上传挤在一张卡里，是倚天卡臃肿的成因之一。
- **「按标签排除」留在配置签、与标签库同卡**。它虽是全站筛选开关（写 `filter` store，非 `projectTags`），但与标签库是一件事的两面（定义标签 → 用标签排除），拆开会导致来回跳。

---

## 3. 组件拆分

`DataView.vue` 现 527 行，把 5 张卡的脚本逻辑全塞进一个 `setup`（PMIS cookie、下载、上传×3、历史、人工导入、标签、清空）。这是"乱"在代码侧的对应物，也是本次必须一并整理的原因：**不拆的话，新卡逻辑还得继续往这个 setup 里堆**。

| 组件 | 职责 | 依赖（自持） |
|---|---|---|
| `views/DataView.vue` | **瘦壳**：状态条 + 更新卡 + tabs 骨架。只保留 `useReprocess`、`lastUpdate/lastPmis`、`checkAgent`、cookie 状态加载（喂状态条） | `useDataStore` `useReprocess` `cookieAgent.pingAgent` |
| `components/MainDomainSourceCard.vue` | 主域：PMIS cookie 获取/手动粘贴、下载数据+SSE、九表 fgrid、根文件 fgrid、合并上传 | `usePmisSync` `useInputFiles` `useFileStatus` `usePmisDownload` `cookieAgent.fetchPmisCookie` |
| `components/YitianSourceCard.vue` | 倚天：文件 fgrid、合并上传、holidays 模板下载与格式说明、倚天 cookie | `useInputFiles` `useFileStatus` `cookieAgent.fetchYitianCookie` |
| `components/ProjectTagsCard.vue` | 标签库 + 按标签排除 | `useProjectTagsStore` `useFilterStore` |
| `components/MaintenanceCard.vue` | 人工导入/回滚、数据历史/回滚、`YitianStoreCard`、清空数据 | `useDataHistory` `manualApi` `manualImport` |

**已是独立组件、只挪位置不改内部**：`YitianScopeCard` `YitianRulesCard` `YitianStoreCard` `PortalConfigCard` `DataStatusBar`。

### 3.1 跨组件协作的约定（避免拆出耦合）
拆分后有三处跨组件依赖，用**父传 props / 子发 emit** 解决，**不新建 store**（此页低频，新建 store 是过度设计）：

1. **状态条要显示 cookie 状态，但 cookie 是在 `MainDomainSourceCard` / `YitianSourceCard` 里获取的**
   → 两卡在 cookie 推送成功后 `emit('cookie-change', { sessionPreview, updatedAt })`；`DataView` 持 `cookieStatus` / `yitianStatus` 并透传给 `DataStatusBar`。初始加载（`GET /api/pmis/cookie`、`GET /api/yitian/cookie`）留在 `DataView`，以 props 下发给两卡作初值。
2. **`useFileStatus` 被两张源卡共用**
   → **各自实例化**（`useFileStatus()` 是无状态组合式，各持一份 `files` ref 与 `load()`）。上传成功后各自 `load()` 刷新自己的 fgrid。**不共享实例、不提升到父**。
3. **`更新数据` 完成后要刷新文件状态与标签**
   → `DataView` 的 `useReprocess({ onDone })` 里 `data.reload()` + `projectTags.load()` 照旧；文件状态刷新改为**父通过 `ref` 调子组件 `defineExpose` 的 `reload()`**（两张源卡各 expose 一个 `reload()`）。

**互斥禁用**：`更新数据` 按钮（DataView）与 `下载数据` 按钮（MainDomainSourceCard）今天互相 `:disabled="repRunning || dlRunning"`。拆开后：`DataView` 把 `repRunning` 以 prop 下发给 `MainDomainSourceCard`（禁用其下载按钮）；`MainDomainSourceCard` 把 `dlRunning` 通过 `emit('running-change', bool)` 上报（禁用更新按钮）。**这条互斥不得丢失** —— 两个 SSE 任务并发会同时写 `input/`。

### 3.2 `defineExpose` 现状注意
`DataView.vue` 现有 `defineExpose({ onFetchPmisCookie, onFetchYitianCookie, checkAgent })`，`DataView.test.ts` 依赖它直接调方法测 cookie 流程。拆分后这三个方法有两个搬到子组件里 → **测试须改为通过子组件实例调用**，或在 `DataView` 保留转发型 expose。实现时择一，**但必须让原有 cookie 流程的断言继续覆盖**（成功/失败/无 SESSION 三条路径）。

---

## 4. 布局规范（治「参差」的具体手段）

**废除 `auto-fit`** —— 卡的位置由设计决定，不由浏览器宽度决定。

| 签 | 栅格 | 说明 |
|---|---|---|
| 数据源 | `grid-template-columns: 1fr 1fr` | 两张卡（主域 / 倚天），体量相近，天然齐平 |
| 配置 | `grid-template-columns: 1fr 1fr` | 项目标签 / 倚天合规 / 首页门户；门户卡内容多 → `grid-column: 1 / -1` 独占整行 |
| 维护 | 单栏 | `el-collapse` 列表，无参差可言 |

- 间距沿用 `--gap-card`；`align-items: start`（保留，避免等高拉伸）。
- **窄屏 `@media (max-width: 768px)`**：两栏签一律降为 `grid-template-columns: 1fr`。
- 现有 `.dv-*` 类名与样式**尽量原样复用**（`.dv-card` `.dv-card-head` `.dv-sub-head` `.dv-row` `.dv-btn` `.dv-fgrid` `.dv-fcell` `.dv-hint` `.dv-progress` …）。拆组件时把用到的样式**随组件迁移**（scoped），不新造一套命名。
- `.dv-primary`（更新卡 accent 描边 + `--shadow-2`）保留不变。
- **`el-tabs` 只做最小样式覆写**：签头字号对齐 `--fs-2`、字重 700、与下方内容间距取 `--gap-section`。不改 EP 的激活条颜色（EP 默认取 primary，已由全局主题接管）。

---

## 5. 合并上传的行为规范

**主域上传**（`MainDomainSourceCard`）：一个 `<input type="file" multiple accept=".xlsx,.csv">` + 一个「上传主域数据文件」按钮。

```
分发规则（前端按文件名，白名单互斥已由 §1.3 证实）：
  name ∈ PMIS_FILE_NAMES                      → POST /api/pmis/upload
  name ∈ (INPUT_FILE_NAMES − YITIAN_FILE_NAMES) → POST /api/inputs/upload
  其余（含倚天两文件、误传文件）               → 不发请求，计入「已跳过」
```

**反馈文案**（替代今天的「已上传 3/4」）：
```
已上传 9 个 PMIS 九表 + 2 个项目域文件，请点[更新数据]生效
已跳过：工时.xlsx（属倚天工时域，请在「倚天工时域」卡上传）、xxx.xlsx（不在主域白名单）
```
- 跳过项**逐个列名**并给出原因（两类原因：属倚天域 / 不在白名单）。
- 「已跳过」行用 `--warn-text`（淡底深字三态规范），非 `--danger`——跳过不是错误。
- 有跳过项时**不阻断**已识别文件的上传。

**倚天上传**（`YitianSourceCard`）：保持独立的 `<input>`，走 `useInputFiles()`（白名单已含倚天两文件），**同样补齐跳过反馈**（原因：不在倚天白名单）。

**实现落点**：分发与跳过归类是纯逻辑，抽到 `frontend/src/lib/uploadDispatch.ts`（纯函数 `dispatchMainDomainFiles(files) → { pmis: File[], inputs: File[], skipped: {name, reason}[] }`），**先写测试再写实现**（CLAUDE.md §6）。组合式 `usePmisSync` / `useInputFiles` 的 `upload()` 签名与端点**不动**。

---

## 6. 错误处理

沿用现状，不新增机制：
- cookie 获取/推送失败 → 卡内 `.dv-hint.err`（`--danger-text`）行，文案含具体错误。
- SSE 进度（reprocess / download）→ `.dv-progress > .dv-bar > .dv-bar-fill` + `.dv-msg`，**结构与 class 不变**。
- 人工导入校验失败 → `.dv-err` 表格逐行列出 sheet/行/列/错误。
- 清空数据 → **两步 `ElMessageBox.confirm`** 不得简化为一步。
- 回滚 → 单步 confirm + `type: 'warning'`。
- `loadCookieStatus` / `loadYitianStatus` / `loadManBackups` 的 catch 静默（未登录/缺接口）**保持静默**，不要改成弹窗。

---

## 7. 测试

**新增**
- `frontend/src/lib/uploadDispatch.test.ts`：分发纯函数。覆盖——9 个九表全进 pmis；根 CSV 全进 inputs；`工时.xlsx`/`holidays.csv` 进 skipped 且 reason=属倚天域；`delivery_analysis.xlsx`（legacy，在 `INPUT_FILE_NAMES` 内但不展示）**仍应正常上传**至 inputs；未知文件进 skipped 且 reason=不在白名单；空数组不炸。
- 每个新子组件一个 `*.test.ts`：挂载 + 该卡内 `data-test` 钩子存活 + 关键交互（上传反馈文案、cookie emit、互斥禁用）。

**改造**
- `DataView.test.ts`：改为瘦壳测试（状态条数据、更新按钮+SSE、tabs 三签存在且默认落「数据源」）。原有的卡内断言**下沉到对应子组件的测试**，不得整体删除。
  - **「默认落数据源签」必须用 `isVisible()` 断言**，不能用 `text()`/`find()` —— 三签内容全在 DOM 里（§1.5 陷阱二），`text()` 恒命中，写出来会是**永远为真的假绿测试**。
  - **必须保留**：`not.toContain('在线下载')`、`toContain('2026-06-12 16:40')`（lastUpdate）。
  - **必须 stub 子组件或让 fetch stub 覆盖其请求**，否则触发 §1.5 陷阱一（vitest 全绿、退出码非零、`verify.sh` 判红）。
  - **验证时不能只看用例是否全绿，必须确认 `npm run test:run` 的退出码为 0。**

**回归安全网**
- `bash verify.sh` 全绿（后端 pytest + 前端 typecheck/vitest/build）。
- **纯前端改动仍须目验**（CLAUDE.md §6）：`python server.py` + `cd frontend && npm run dev`，用超管账号进 `/data`，逐签确认：三签可切、默认落数据源、更新数据 SSE 进度正常、两卡上传反馈（含跳过文案）、light/dark 两主题、窄屏降单栏、无 console 报错。
  - 上一版（V3.2.0）的教训：**颜色/视觉问题单测与 diff 全部放过，只有实拍才逮得到**。「已跳过」行的 `--warn-text` 在暗色下必须实际看一眼。

---

## 8. 明确不做（YAGNI）

- **不拆子路由**（`/data/sources` 等）——要动路由与权限 pageKey，对低频页过重。
- **不做角色分层布局**——普通管理员不给 `data` 权限（§1.2）。
- **不持久化 tab 状态**（§2）。
- **不给 `el-tab-pane` 设 `lazy`**（§1.5 陷阱二）。
- **不新建 store**——跨组件协作用 props/emit（§3.1）。
- **不改后端任何一行**，不改 `usePmisSync` / `useInputFiles` 的端点与签名。
- **不给本页加图表**。
- **不改 `DataStatusBar` 的内容项**（5 项不增不减，仅可能因 emit 改数据来源）。

---

## 9. 发版

- `frontend/src/version.ts`：`APP_VERSION = 'V3.5.0'`，`RELEASE_DATE` 改为实际发版日。
- `PROGRESS.md`：动手前标 `in_progress`，完成后记结论。
- **升级路径**：纯前端 → 只换 `dist/`。无需点「更新数据」、无需重启后端、无需新授权 pageKey。线上基线 V3.4.0。
