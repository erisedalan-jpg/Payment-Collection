# 账号权限细粒度升级 — 逐页数据范围 + 配置界面重做 设计（V4.3.1）

> 承接 Phase 1（V4.2.0，工号级）/ Phase 2（V4.3.0，分数据域）。本期把范围下沉到**逐页**，并**重做 /admin 配置界面**大幅减点击。
> master 分支，基线 V4.3.0。版本 V4.3.1（用户钦定）。交流语言简体中文。

## 1. 背景与目标

Phase 2 的「按数据域」满足不了「同一域内、不同页看不同范围」——用户在 `/projects/temp`（属 `project` 域）需要独立于 `/projects`、`/payment` 等同域页的范围。用户确认「**任意页都可能**需要独立范围」，并要求同时**大幅减少配置点击**（现状超管配一个账号需 10+ 次点击）。

两个诉求是**同一次重做**：逐页范围的自然配置模型「默认范围 + 少数覆盖」顺手替换掉现在「三域各一堆多选框」的点击噩梦。

**目标**：① 账号可为**任意页**设独立数据范围（页 > 域 > 默认 三层优先级）；② `/admin` 配置界面重做——页面按导航组一键选、范围「默认 + 只加例外」，常见账号从 15+ 次点击降到 4~5 次。

## 2. 范围模型（三层优先级，在 Phase 1/2 之上纯加字段）

账号对象在 Phase 2 基础上再加 `pageScopes`：

```
{
  allowedL4, allowedStaff,                 // = 默认范围(Phase 1)
  domainScopes: { <域>: {l4,staff} },      // = 域覆盖(Phase 2,3域)
  pageScopes:   { <pageKey>: {l4,staff} }, // = 页覆盖(本期新增)
}
```

- **有效范围解析**（页 > 域 > 默认）：
  `effective(pageKey) = pageScopes[pageKey] ?? domainScopes[domainOf(pageKey)] ?? {allowedL4, allowedStaff}`
- `'*' in l4` → 该页全部。`{l4:[],staff:[]}` 显式空 → 该页看不到（沿用 Phase 2 语义）。
- `domainOf(pageKey)`：见 §3 的 pageKey→域映射。商机域 page/域覆盖仍**只到 L4、staff 恒清空**（沿用 Phase 1/2）。
- **迁移/兼容**：无 `pageScopes` → `{}` → 全走域/默认 → 行为与 V4.3.0 逐字一致；无 `domainScopes` 亦然。

## 3. pageKey → 数据域映射（域=服务端下发单位）

沿用 Phase 2 的三域，把每个 pageKey 归到其消费的数据源（`lib/pageAccess.ts` 全 27 键）：

| 域 | 数据源 | pageKey |
|---|---|---|
| `project` | `analysis_data`（useDataStore） | overview, projects, projects-closed, activity, insight, insight-milestone, insight-costdetail, insight-risk, insight-board, insight-calendar, payment, payment-projects, payment-nodes, projects-key, temp-followup, risk-followup, payment-key, governance |
| `yitian` | `yitian_data`（useYitianStore） | yitian, yitian-detail, yitian-compliance, yitian-analytics, yitian-trend, yitian-customer |
| `opportunity` | `opportunities`（useOpportunitiesStore） | opportunities-progress, opportunities-board, opportunity-followup |
| （无数据域） | — | about, budget, data（纯配置/静态页，不参与逐页范围） |

此映射是**单一来源**，后端（求域并集）与前端（收窄）共用；放 `lib/pageAccess.ts`（前端）+ `data_scope.py` 或 `config.py`（后端）各一份、由一个跨语言同步测试锁死一致（沿用项目既有「真读源码比对」手法）。**独立 followup store（risk/temp/payment_key/商机跟进/项目进展）仍不做 L4 隔离**（沿用既有边界；followup 页展示的**项目列表**属 `project` 域、随之收窄，但 followup 记录本身不裁）。

## 4. 生效与执行

**核心**：同域多页共享一份服务端下发数据，故——**服务端按域下发「并集」，前端按当前页「收窄」**。

### 4.1 服务端：按域下发并集
- 对每个域 D，取账号在 D 内**所有可访问页**（`allowedPages` 命中）的 `effective(pageKey)`，求**并集**（l4 取并、staff 取并；任一为 `'*'` → 该域全部）。
- 用并集过滤该域数据下发，**复用 Phase 1/2 的** `filter_analysis_data(l4, pm_names)` / `scope_yitian_data(l4, staff)` / 商机 `filter_for_account(l4)`。
- 即账号在某域**拿到的是其所有页范围的并集**（拿不到任何页都无权的数据）；具体每页看到的子集由前端收窄。
- `auth.effective_scope` 扩为**页感知** `effective_scope(rec, domain, page_key=None)`：给 page_key 走三层解析、不给退化为「域 ?? 默认」（Phase 2 调用点不传 page_key、行为不变，向后兼容）。新增 `domain_union_scope(rec, domain, page_keys) -> (l4, staff)` 求并集，端点用它。

### 4.2 前端：按当前页收窄
- 新增**三个按域的 scoped-selector composable**：`useScopedProjects()` / `useScopedYitian()` / `useScopedOpportunities()`。内部读 `useRoute().meta.pageKey` + auth 的 `effective(pageKey)`，把共享 store 数据收窄成本页应见子集（`'*'`→不收窄；显式空→空）。
- 各数据展示 view 把直读 `data.data?.projects`（约 17 处）/`store.rows`（商机 3 处）/传给 lib 聚合的 `store.data`+`l4s`（工时 6 处）换成对应 scoped 结果。**精确改点清单在实现计划里 grep 枚举**（去中心化消费，编译器不强制）。
- **PM 姓名匹配的数据缺口**：项目按 `projectManager(姓名) ∈ scope.staff 解析出的姓名` 匹配，但前端无花名册。补法：`/api/auth/me` 与 `/api/login` 返回的 user **富化 `staffNames: {工号:姓名}`**（仅该账号 default+域+页 scope 里出现的工号，服务端用 `_load_roster_cached()` 解析）。前端 scoped-selector 用它做 PM 匹配，**与服务端 `_staff_pm_names` 同口径**（保证收窄结果 = 服务端会给的）。工时侧无此问题（`yitian_data` 自带 roster、entries 原生带工号）。
- **前端有效范围 helper**：`lib/pageScope.ts` 的 `effectiveScope(user, pageKey) -> {l4, staff}`（镜像后端三层解析）+ `narrowProjects`/`narrowYitian`/`narrowOpportunities` 纯函数（可单测）。AuthUser 加 `domainScopes?`/`pageScopes?`/`staffNames?`。

### 4.3 防漏页守卫（承重）
去中心化消费 → 新增 view 忘了用 scoped-selector 就会**静默显示并集（偏宽）**。加一个**源码扫描守卫测试**：枚举 `frontend/src/views/` 下所有 view，断言凡读项目/工时/商机数据的都经 scoped-selector、**不直读 `useDataStore().data`/`useYitianStore().data`/`useOpportunitiesStore().rows` 的裸数据字段**（白名单排除 AdminView 取 L4 选项等非展示用途）。新增违规 view 即 CI 变红。（漏页的安全后果被并集下发兜底为「偏宽但不越权」，守卫再堵住「偏宽」。）

## 5. 后端改动清单

- `auth.py`：`effective_scope(rec, domain, page_key=None)` 三层解析；`domain_union_scope(rec, domain, page_keys)`；`_make_user`/`public_user`/CRUD 加 `pageScopes`（校验 `_validate_page_scopes`：键须 ∈ 27 pageKey、值 `{l4,staff}` 复用校验、商机页 staff 清空）。
- `data_scope.py` 或 `config.py`：`PAGE_DOMAINS`（pageKey→域）+ `DOMAIN_PAGES`（域→pageKey 列表）常量（后端侧单一来源）。
- `server.py`：`handle_data_json`/`handle_yitian_data`/商机四处改用 `domain_union_scope`（传该域全部 pageKey ∩ 账号可访问页）；`handle_admin_account_create/update` 透传 `pageScopes`；`handle_auth_me`/`handle_login` 富化 `staffNames`（新 helper `_user_payload(account, rec)`）。
- 审计：create/update 详情附「逐页覆盖」页数。

## 6. 配置界面重做（AdminView 弹窗）

- **可访问页面**：27 项裸多选 → **按导航组（项目/分析/跟进/回款/工时/工具）勾选** + 「全部页面」开关 + 每组可展开逐页微调。组级一键 = 一次点 4~6 页。
- **默认数据范围**：`可见 L4` + `可见员工` 两个选择器（沿用现有，含全部/工号显姓名）。
- **范围覆盖（可选）**：一个「覆盖列表」，`[+ 添加覆盖]` → 选**目标**（下拉：`域`＝项目&回款/工时/商机，或 `具体页面`＝27 页）+ 该目标 L4[+员工]。域目标写 `domainScopes`、页目标写 `pageScopes`；商机目标无员工项。列表每行可删。大多数账号 0~2 行。
- **表格「可见范围」列**：默认范围摘要 + 有覆盖时标「＋N 覆盖」。
- **点击对比**（组长看全部页、数据限本组）：现 15+ 次 → 重做后「全部页面」(1)+默认 L4 选组(2~3)+0 覆盖 ≈ 4~5 次。
- **前端类型**：`admin.ts` 的 `AdminAccount` 加 `pageScopes?`；`createAccount`/`updateAccount` 载荷加 `pageScopes?`（**可选**，避免必填字段孤儿——吸取 Phase 1 教训）。

## 7. 安全不变量

1. **服务端强制并集边界**：账号在某域拿到的数据 = 其所有可访问页范围的并集，**绝不含任何页都无权的数据**。
2. **前端收窄是展示级、漏页有界**：漏改一个 view 顶多显示并集（账号本就有权在别页看的），非越权；守卫测试（§4.3）再堵住。
3. **收窄口径与服务端一致**：前端 `narrowProjects` 用 `staffNames` 做 PM 匹配，与服务端 `_staff_pm_names` 同口径；`effectiveScope` 镜像后端三层解析（由跨语言同步测试锁死 pageKey→域映射一致）。
4. **超管恒全量**；**商机域恒无工号级**（两端 staff 清空双保险）；**显式空覆盖 = 该页看不到**。

## 8. 边界与错误处理

- 页覆盖缺省 → 回退域；域缺省 → 回退默认；全缺省 → V4.3.0 行为。
- `pageScopes` 含未知 pageKey / 值非法 → 校验 4xx。
- 账号无某页访问权（`allowedPages` 不含）→ 该页 pageKey 不进域并集（配了也不放大下发）。
- 花名册缺失 → `staffNames` 空、PM 匹配为空（工时/L4 侧照常），不阻断。
- `about`/`budget`/`data` 无数据域 → 不出现在覆盖目标的「页面」下拉里。

## 9. 测试计划

- **`auth`（纯函数）**：`effective_scope` 三层（页/域/默认/显式空）；`domain_union_scope` 并集（含 `'*'` 短路、跨页并、账号无该页则不计入）；`_validate_page_scopes`（未知 pageKey 拒、商机 staff 清空）；`public_user` 含 `pageScopes`；迁移默认 `{}`。
- **`server`**：某账号 project 域两页不同 pageScopes → `/data` 下发二者并集；`/api/auth/me` 带 `staffNames`（含 scope 工号解析、不含无关工号）；create/update 持久化 `pageScopes`。
- **前端（vitest）**：`lib/pageScope` 的 `effectiveScope`/`narrowProjects`/`narrowYitian`/`narrowOpportunities` 纯函数（三层解析 + L4/staff/PM 匹配 + `'*'`/空）；scoped-selector 随路由 pageKey 变化收窄；**pageKey→域映射跨语言同步测试**（前端 `PAGE_DOMAINS` == 真读后端源码）；**防漏页守卫测试**（扫 views 无裸读 store 数据）；AdminView 重做（组级选页、覆盖列表增删、目标=域/页载荷正确、商机无员工）。
- 真实数据冒烟：建「默认全部 + /临时跟进 覆盖为某 L4」账号，核对 `/projects` 全量而 `/projects/temp` 仅该 L4；核对同域其他页不受影响。
- `verify.sh` 全绿。

## 10. 明确不做

- **逐页服务端硬隔离**（每页单独 fetch）——用并集+前端收窄，保留单次拉取架构。
- **独立 followup store 的 L4 隔离**——沿用既有边界（只裁 followup 页展示的项目列表，不裁 followup 记录）。
- **只读/读写分离、字段/列级隐藏**——正交维度，后续独立开期。
- **预设/角色模板**——本期不做（覆盖列表已足够；真需要再单开）。

## 11. 验证

按 `CLAUDE.md` §6：`bash verify.sh` 全绿；改 `auth.py`/`data_scope.py`/前端收窄纯函数**先补/改测试再改实现**；**逐页收窄必须真实数据浏览器冒烟**（建受限账号、逐页核对可见集，尤其漏页守卫覆盖不到的视觉层）。收尾**重建默认 base dist**（避免本地版本号/白屏问题，见既有教训）。
