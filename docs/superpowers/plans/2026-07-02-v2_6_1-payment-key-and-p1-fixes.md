# P2 回款重点跟进新页 + P1 修复（V2.6.1）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 逐任务实现。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 新增 `/payment/key` 回款重点跟进页（仿 /projects/temp 范围引擎+进度编辑，归档=仅归档不清空/风险语义），并顺带做 4 个 P1 页 UI 修复。

**Architecture:** 后端克隆 `temp_followup.py`（分组 scope）→ `payment_key_followup.py`，改跟进字段为 `followAction/revConclusion/nextRevDate`、归档不清 current（照 `risk_followup.py`）；server.py 镜像 temp-followup 一套端点。前端克隆 tempFollowup 的 api/store/view，行构建新建 `lib/paymentKeyFollowup.ts`（复用 `buildProjectRows` 基座 + `buildScopeInputs`/`projectMatches`/共享 `FIELD_CATALOG`），跟进三字段中 `nextRevDate` 用内联 `el-date-picker`（照 /risk）、另两字段走 `ProgressEditModal`（加 `paymentKey` 枚举）。**新 pageKey `payment-key`**。

**Tech Stack:** 同项目（Vue3+TS+Pinia+Element Plus / Python 标准库 / Vitest+pytest）。

## Global Constraints（每个任务隐含遵守）

- **不使用任何 emoji**；符号用 `→ ↓ ❌ ✕ ▾`。
- 版本单一来源 `frontend/src/version.ts`，本期目标 **V2.6.1**（延续 V2.6.0，X 不变、Z 递增）。
- 数字列挂 `.u-num`（DataTable `num:true`）；只引设计令牌不手写散值。
- 跟进术语用「邮件推动」不用「邮件催收」；交互件五态齐全。
- 改计算逻辑先补/改测试再改实现；声称完成前 `bash verify.sh` 全绿。
- **本轮(P2–P4)全程不出升级包**，到 P4(V2.6.3)统一出累积包；本期只合 master。
- commit 仅在特性分支上按任务提交（尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`）；不动本期外的既有未提交工作树改动。
- **权限**：范围设置/归档/删历史 = 超管专属（`_SUPER_ONLY_PATHS` 拦）；单格编辑 = 任意登录用户；followup 层不做 L4 二次裁剪（沿用 /data 上游裁剪）。
- **归档语义（钦定）= 仅归档不清空**（同 /risk）。

## 文件结构（P2 落点）

- 新建：`payment_key_followup.py`、`frontend/src/lib/paymentKeyFollowupApi.ts`、`frontend/src/stores/paymentKeyFollowup.ts`、`frontend/src/lib/paymentKeyFollowup.ts`、`frontend/src/views/PaymentKeyFollowupView.vue`（各含测试）
- 修改：`server.py`、`frontend/src/components/ProgressEditModal.vue`、`frontend/src/router/index.ts`、`frontend/src/nav.ts`、`frontend/src/lib/pageAccess.ts`、`frontend/src/components/{DashMetrics,NoStageProjectsTable,TagFilterSelect}.vue`、`frontend/src/version.ts`、`PROGRESS.md`
- 参照(克隆源,实现者读)：`temp_followup.py`、`risk_followup.py`、`frontend/src/lib/tempFollowupApi.ts`、`frontend/src/stores/{tempFollowup,riskFollowup}.ts`、`frontend/src/lib/{tempFollowup,keyProjects}.ts`、`frontend/src/views/{TempFollowupView,RiskFollowupView}.vue`、server.py 的 temp-followup 段。

---

### Task 1: P1 页 4 修复（UI 小改）

**Files:**
- Modify: `frontend/src/components/TagFilterSelect.vue`（缩窄，Fix 1+2）
- Modify: `frontend/src/components/DashMetrics.vue`（Fix 5）
- Modify: `frontend/src/components/NoStageProjectsTable.vue`（Fix 4）
- Test: 对应 `*.test.ts`（DashMetrics/NoStageProjectsTable 已有，追加断言）

- [ ] **Fix 1+2（标签筛选缩窄）**：`TagFilterSelect.vue` 的 `el-select` 现 `style="min-width: 160px"` → 改为**较窄且与 /projects 标签下拉相当**：去掉 min-width、改 `style="width: 140px"`（collapse-tags 已开）。此组件为 /payment/projects 与 /payment/nodes 共用,一处改两页同时生效。两页工具栏 `.pov-bar`/`.pv-bar` 已是 `flex-wrap: wrap` 单行容器,缩窄后即可容纳在一行(搜索/标签/选列/导出)。
- [ ] **Fix 5（项目数卡整卡可点、副字纯展示）**：`DashMetrics.vue`——
  - 项目数卡的 metric 项加 `action: 'projects'`（去掉原 `subAction`,`sub` 保留为纯展示字符串）。
  - `onCard(action)` 加分支：`else if (action === 'projects') router.push('/projects')`。
  - 模板：项目数卡加 `data-test="pay-projects-card"`；副字由 `<button ... @click.stop>` 改为**纯 `<span class="dm-sub">`（不可点、去 data-test=pay-nostage-link 的按钮、去 @click）**。删 `onSub` 函数。
  - 卡片 `:class="{ 'dm-card--link': m.action }"` 已存在 → 项目数卡因有 action 自动带 hover 手型。
  - 测试更新：`DashMetrics.test.ts` 原「点副字→/projects」用例改为「点项目数卡(`[data-test=pay-projects-card]`)→push('/projects')」；副字仍含「无回款阶段」文案(纯展示)。
- [ ] **Fix 4（无阶段清单分页）**：`NoStageProjectsTable.vue`——引入 `usePagedRows`：`const { paged, currentPage, pageSize } = usePagedRows(rows, 20)`；`<DataTable :rows="paged">`；表下加 pager（照 CostDetailView 模板）:`共 {{ rows.length }} 条` + `<el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20,50,100]" :total="rows.length" layout="sizes, prev, pager, next" size="small" background />`。`.test.ts` 补断言:>20 行时分页存在、总数显示。

- [ ] **Steps（TDD）**：先改/加测试到目标态跑 FAIL → 实现 → `cd frontend && npx vitest run src/components/DashMetrics.test.ts src/components/NoStageProjectsTable.test.ts` 全绿 → `npm run typecheck` → 提交 `fix(payment): 标签筛选缩窄+项目数整卡可点+无阶段清单分页`。

---

### Task 2: 后端 payment_key_followup.py（纯函数）

**Files:**
- Create: `payment_key_followup.py`
- Test: `tests/test_payment_key_followup.py`

**Interfaces:**
- Produces：`PROGRESS_FIELDS=('followAction','revConclusion','nextRevDate')`、`SCOPE_GROUPS=('project','paymentNode','milestone')`、`new_store()`、`normalize_scope(scope)`（分组,同 temp）、`apply_update(store,project_id,field,content,account,now)`、`apply_archive(store,rows,now)`（**不清 current**）、`apply_archive_delete(store,idx)`。

- [ ] **Step 1: 写失败测试** `tests/test_payment_key_followup.py`（照 `tests/` 里 temp/risk followup 测试风格；断言：apply_update 写三元组、非法 field 抛 ValueError、**apply_archive 追加快照且 current 保留不清空**、normalize_scope 分组规整非法→空、apply_archive_delete 越界 False）。
- [ ] **Step 2: 运行确认失败** `python -m pytest tests/test_payment_key_followup.py -q`
- [ ] **Step 3: 实现**：以 `temp_followup.py` 为基(分组 scope 结构不变),仅两处改:
  - `PROGRESS_FIELDS = ('followAction', 'revConclusion', 'nextRevDate')`
  - `apply_archive` 去掉 `store['current'] = {}` 那行(照 `risk_followup.py` 的 apply_archive,只 append 快照)。
  其余（new_store/normalize_scope[含 SCOPE_GROUPS 分组]/apply_update/apply_archive_delete）逐字照 temp_followup.py。
- [ ] **Step 4: 通过** `python -m pytest tests/test_payment_key_followup.py -q`
- [ ] **Step 5: Commit** `feat(backend): payment_key_followup 纯函数(分组scope+归档不清current)`

---

### Task 3: server.py 接线（5 端点 + 载入/落盘 + 权限）

**Files:**
- Modify: `server.py`
- Test:（server.py 无单测惯例，靠 pytest 纯函数 + 后续冒烟；本任务不新增测试，改动为镜像既有 temp-followup 段）

**Interfaces:**
- Produces：`/api/payment-key-followup`(GET) + `/scope`+`/update`+`/archive`+`/archive/delete`(POST)；数据落 `data/payment_key_followup.json`。

- [ ] **Step 1: 实现**（**通读 server.py 的 temp-followup 段后镜像**，逐处对应）：
  - 顶部 import：加 `import payment_key_followup as _paykey`（在 `import risk_followup as _riskfu` 附近，约 L36）。
  - `_SUPER_ONLY_PATHS`（L162）加：`'/api/payment-key-followup/scope', '/api/payment-key-followup/archive', '/api/payment-key-followup/archive/delete',`。
  - 文件常量 + 载入/落盘（仿 `TEMP_FOLLOWUP_FILE`/`_load_temp_followup`/`_save_temp_followup` L338-362，但**用原子写**：`.tmp`+`os.replace`，照 `risk_followup` 的 `_save_risk_followup`）：`PAYKEY_FOLLOWUP_FILE = os.path.join(BASE_DIR, 'data', 'payment_key_followup.json')` + `_load_paykey_followup()`（load 时 `store['scope']=_paykey.normalize_scope(...)`、setdefault current/archives、损坏→`_paykey.new_store()`）+ `_save_paykey_followup(store)`。
  - do_GET dispatch（L580 附近）：`elif parsed.path == '/api/payment-key-followup': self.handle_paykey_followup_get()`。
  - do_POST dispatch（L681 附近）：加 4 条 `/api/payment-key-followup/{scope,update,archive,archive/delete}` → 对应 handler。
  - 5 个 handler（仿 `handle_temp_followup_*` L1166-1247，把 `_temp`→`_paykey`、文件→paykey、update 的键 `projectId`→`projectId`[仍按项目号]、archive 用 `_paykey.apply_archive`[不清 current]）。GET/update 任意登录用户(仅 validate_session)，scope/archive/archive-delete 靠 `_SUPER_ONLY_PATHS` + `_authz_gate` 拦超管。
- [ ] **Step 2: 冒烟式自检**（无单测）：`python -c "import server"` 确认导入无语法错；`python -c "import payment_key_followup as p; s=p.new_store(); print(s)"`。
- [ ] **Step 3: 全量 pytest** `python -m pytest -q`（确认后端整体不回归）。
- [ ] **Step 4: Commit** `feat(backend): server.py 挂 payment-key-followup 5端点+原子落盘+超管门`

---

### Task 4: 前端 api + store

**Files:**
- Create: `frontend/src/lib/paymentKeyFollowupApi.ts`、`frontend/src/stores/paymentKeyFollowup.ts`
- Test: `frontend/src/stores/paymentKeyFollowup.test.ts`（照 tempFollowup/riskFollowup store 测试风格,重点断言 archive 后 current **不清空**）

**Interfaces:**
- Produces：`paymentKeyFollowupApi`（get/saveScope/update/archive/deleteArchive，端点 `/api/payment-key-followup/*`，update field 类型 `'followAction'|'revConclusion'|'nextRevDate'`）；`usePaymentKeyFollowupStore`（scope/current/archives/loaded + load/saveScope/update/archive[**不清 current**]/deleteArchive/reset）。
- Consumes：`ScopeFilter`（tempScope）、新 `PaymentKeyRecord` 类型（在 Task 5 的 lib 里定义并 import；或就近在 store 用 `Record<string, any>`——**统一在 paymentKeyFollowup.ts 定义 `PaymentKeyRecord` 并被 store/api import**，见 Task 5）。

- [ ] **Step 1: 写失败测试**（store：mock api，断言 load 填 scope/current/archives；update 合并 record；**archive 后 current 保持不变**[对照 risk 语义]）。
- [ ] **Step 2: 失败** `cd frontend && npx vitest run src/stores/paymentKeyFollowup.test.ts`
- [ ] **Step 3: 实现**：
  - `paymentKeyFollowupApi.ts` 克隆 `tempFollowupApi.ts`，路径全改 `/api/payment-key-followup/*`，`update` 的 field 类型改 3 字段，record 类型用 `PaymentKeyRecord`。
  - `stores/paymentKeyFollowup.ts` 克隆 `stores/riskFollowup.ts`（**因归档不清 current**），store id `'paymentKeyFollowup'`，update field 类型 3 字段，current 类型 `Record<string, PaymentKeyRecord>`，archive 保留「不清 current」注释。
- [ ] **Step 4: 通过 + typecheck**
- [ ] **Step 5: Commit** `feat(回款跟进): paymentKeyFollowup api+store(归档不清current)`

---

### Task 5: 行构建 lib/paymentKeyFollowup.ts

**Files:**
- Create: `frontend/src/lib/paymentKeyFollowup.ts`
- Test: `frontend/src/lib/paymentKeyFollowup.test.ts`

**Interfaces:**
- Produces：`PaymentKeyRecord`（followAction/revConclusion/nextRevDate 各 + EditTime + EditBy）；`PaymentKeyRow`；`buildPaymentKeyRows(projects, pmisMap, current, inScopeIds): PaymentKeyRow[]`；`payFollowDate(rec)`/`payFollowBy(rec)`（从 3 字段 EditTime/EditBy 归并）。复用 `buildScopeInputs`（从 `./tempFollowup` re-export 或直接 import）+ `projectMatches`（tempScope）+ `FIELD_CATALOG`（ScopeBuilder 默认）。
- Consumes：`buildProjectRows`（projectList，取 customer/projectManager/orgL4/projectLevel/paymentRatio/paymentStatus/riskLevel/openRisks 等）。

- [ ] **Step 1: 写失败测试**：给定 1 项目 + current 有 followAction/nextRevDate → 断言行含 projectId/projectName/projectManager/orgL4/projectLevel/contractWan/paymentRatio/paymentStatus + followAction/revConclusion/nextRevDate + payFollowDate=最新 EditTime、payFollowBy=去重编辑人；不在 inScopeIds 的项目不出现。
- [ ] **Step 2: 失败**
- [ ] **Step 3: 实现**（参照 `lib/tempFollowup.ts` buildTempRows,但进度字段换 3 个）：

```ts
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, type ProjectRow } from './projectList'
export { buildScopeInputs } from './tempFollowup'  // 复用范围输入构建

export interface PaymentKeyRecord {
  followAction?: string; followActionEditTime?: string; followActionEditBy?: string
  revConclusion?: string; revConclusionEditTime?: string; revConclusionEditBy?: string
  nextRevDate?: string; nextRevDateEditTime?: string; nextRevDateEditBy?: string
}

export interface PaymentKeyRow {
  projectId: string; customer: string; projectName: string; projectManager: string
  orgL4: string; projectLevel: string; contractWan: number | null
  paymentRatio: number | null; paymentStatus: string; riskLevel: string; openRisks: number
  stage: string; projectType: string; projectStatus: string; health: string
  top1000: string; quadrant: string
  followAction: string; followActionEditTime: string; followActionEditBy: string
  revConclusion: string; revConclusionEditTime: string; revConclusionEditBy: string
  nextRevDate: string; nextRevDateEditTime: string; nextRevDateEditBy: string
  followDate: string; followBy: string
}

const v = (raw: unknown, fb = ''): string => { const s = raw == null ? '' : String(raw).trim(); return s === '' ? fb : s }

export function payFollowDate(rec: PaymentKeyRecord): string {
  return [v(rec.followActionEditTime), v(rec.revConclusionEditTime), v(rec.nextRevDateEditTime)].sort().pop() || ''
}
export function payFollowBy(rec: PaymentKeyRecord): string {
  const list = [v(rec.followActionEditBy), v(rec.revConclusionEditBy), v(rec.nextRevDateEditBy)].filter((x) => x)
  return [...new Set(list)].join('、')
}

export function buildPaymentKeyRows(
  projects: Project[], pmisMap: Record<string, ProjectPmis>,
  current: Record<string, PaymentKeyRecord>, inScopeIds: Set<string>,
): PaymentKeyRow[] {
  const prMap = new Map<string, ProjectRow>(buildProjectRows(projects, pmisMap).map((r) => [r.projectId, r]))
  return projects.filter((p) => inScopeIds.has(p.projectId)).map((p) => {
    const pr = prMap.get(p.projectId)
    const rec = current[p.projectId] ?? {}
    const contract = p.paymentPmis?.contract
    return {
      projectId: p.projectId,
      customer: pr?.customer ?? '-',
      projectName: p.projectName || p.projectId,
      projectManager: pr?.projectManager ?? '-',
      orgL4: pr?.orgL4 ?? '-',
      projectLevel: pr?.projectLevel ?? '-',
      contractWan: typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,
      paymentRatio: pr?.paymentRatio ?? null,
      paymentStatus: pr?.paymentStatus ?? '-',
      riskLevel: pr?.riskLevel ?? '无',
      openRisks: pr?.openRisks ?? 0,
      stage: pr?.stage ?? '-',
      projectType: pr?.projectType ?? '-',
      projectStatus: pr?.projectStatus ?? '-',
      health: pr?.health ?? '无数据',
      top1000: pr?.top1000 ?? '否',
      quadrant: pr?.quadrant ?? '',
      followAction: v(rec.followAction), followActionEditTime: v(rec.followActionEditTime), followActionEditBy: v(rec.followActionEditBy),
      revConclusion: v(rec.revConclusion), revConclusionEditTime: v(rec.revConclusionEditTime), revConclusionEditBy: v(rec.revConclusionEditBy),
      nextRevDate: v(rec.nextRevDate), nextRevDateEditTime: v(rec.nextRevDateEditTime), nextRevDateEditBy: v(rec.nextRevDateEditBy),
      followDate: payFollowDate(rec), followBy: payFollowBy(rec),
    }
  })
}
```

> 若 `ProjectRow` 缺某字段（如 quadrant/openRisks 命名不同），实现者通读 `lib/projectList.ts` 的 `ProjectRow` 接口按实名对齐(与 buildTempRows L27-42 取字段方式一致)。

- [ ] **Step 4: 通过 + typecheck**
- [ ] **Step 5: Commit** `feat(回款跟进): buildPaymentKeyRows 行构建`

---

### Task 6: ProgressEditModal 枚举 + PaymentKeyFollowupView.vue

**Files:**
- Modify: `frontend/src/components/ProgressEditModal.vue`
- Create: `frontend/src/views/PaymentKeyFollowupView.vue`
- Test: `frontend/src/views/PaymentKeyFollowupView.test.ts`

- [ ] **Step 1: ProgressEditModal 加 paymentKey 枚举**：
  - `store?: 'key' | 'temp' | 'oppFollowup' | 'riskFollowup' | 'paymentKey'`。
  - import `usePaymentKeyFollowupStore`；`activeStore` 加分支 `props.store === 'paymentKey' ? payKeyStore : ...`。
  - `FIELD_LABEL` 已含 followAction/revConclusion，无需加(nextRevDate 走内联 date-picker、不经本弹窗)。
- [ ] **Step 2: PaymentKeyFollowupView.vue**（**克隆 `TempFollowupView.vue`,通读它 + `RiskFollowupView.vue` 后改**）：
  - `defineOptions({ name: 'PaymentKeyFollowupView' })` + `useViewScrollMemory()`；`TABLE_ID='payment-key'`；store 用 `usePaymentKeyFollowupStore`；标题「回款重点跟进」。
  - 行源：`buildPaymentKeyRows(projects, pmisMap, pk.current, inScopeIds)`；`inScopeIds` = `buildScopeInputs(...) → projectMatches(i, pk.scope)`（同 temp）。
  - **列（DataColumn[]，用 `withSortable` 包）**：默认可见 = 项目编号(projectId)/项目名称(projectName)/项目经理(projectManager)/L4组(orgL4)/项目级别(projectLevel)/合同额万(contractWan,同 temp 的 toLocaleString formatter)/**跟进动作(followAction,wrap)/rev结论(revConclusion,wrap)/下次rev时间(nextRevDate,date)**；其他列(默认隐藏,位置在 contractWan 之后、followAction 之前)= 回款完成率(paymentRatio)/回款状态(paymentStatus)/风险(riskLevel)/阶段(stage)/项目类型(projectType)/项目状态(projectStatus)/健康度(health)/TOP1000(top1000)/象限(quadrant)。`DEFAULT_VISIBLE` 列出 9 个默认列 key。`FILTERABLE`=枚举列(projectManager/orgL4/projectLevel/paymentStatus/riskLevel/stage/projectType/projectStatus/health/top1000/quadrant)。
  - **进度编辑**：followAction/revConclusion 走 `ProgressEditModal store="paymentKey"`（照 temp 的 openEdit/editCtx,field 类型改 `'followAction'|'revConclusion'`）；**nextRevDate 走内联 `el-date-picker`**（照 `RiskFollowupView.vue` 的 `onDateChange`→`pk.update(projectId,'nextRevDate',val)`；单元格 `#cell-nextRevDate` 插槽渲 date-picker，仅 isCurrent 可编辑）。
  - **归档=仅归档不清空**：按钮文案「归档（留存跟进）」；确认弹窗文案「已填写的跟进动作 / rev结论 / 下次rev时间 **保留不清空**」（照 RiskFollowupView L189/238）；`doArchive` 调 `pk.archive(currentRows)`（store 不清 current）。
  - 范围设置(超管,ScopeBuilder 默认 catalog=FIELD_CATALOG)、历史下拉、删历史(超管)、导出(超管,多 sheet 按列)——照 TempFollowupView 搬。
  - onRow → `router.push('/project/'+row.projectId)`。onMounted：`if(!data.data)data.load(); if(!pk.loaded)pk.load()`；setup 顶 `cf.clearAll(TABLE_ID)`。
- [ ] **Step 3: 测试** `PaymentKeyFollowupView.test.ts`：断言默认 9 列在场（含跟进动作/rev结论/下次rev时间）、无范围时空态文案、超管见范围设置/归档按钮、行点击跳详情。（store/data 用 stub；auth.isSuper 置真测超管按钮。）
- [ ] **Step 4: 全绿 + typecheck** `cd frontend && npx vitest run src/views/PaymentKeyFollowupView.test.ts && npm run typecheck`
- [ ] **Step 5: Commit** `feat(回款跟进): PaymentKeyFollowupView 页 + ProgressEditModal paymentKey 枚举`

---

### Task 7: 接线 nav + pageKey + route

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts`、`frontend/src/nav.ts`、`frontend/src/router/index.ts`
- Test: `frontend/src/router/index.test.ts`、`frontend/src/layout/AppSidebar.test.ts`（追加）

- [ ] **Step 1: 改测试先行**：router.test 加断言 `/payment/key` 解析到 `payment-key` pageKey；AppSidebar.test 断言「重点跟进」区含「回款重点跟进」(KEY_FOLLOWUP_LINKS 由 4→5)。跑 FAIL。
- [ ] **Step 2: 实现**：
  - `pageAccess.ts`：`PageKey` 联合加 `'payment-key'`。
  - `nav.ts`：`KEY_FOLLOWUP_LINKS` 末尾(风险跟进下)加 `{ label: '回款重点跟进', to: '/payment/key', key: 'payment-key' }`（自动级联 PAGE_OPTIONS 授权下拉 + 侧栏）。
  - `router/index.ts`：import `PaymentKeyFollowupView`；加精确路由 `{ path: '/payment/key', name: 'payment-key', component: PaymentKeyFollowupView, meta: { title: '回款重点跟进', hideFilter: true, pageKey: 'payment-key' } }`（**精确路径,勿引 /payment/:param**；放在其它 /payment/* 精确路由旁）。
- [ ] **Step 3: 全量 vitest + typecheck + build** `cd frontend && npx vitest run && npm run typecheck && npm run build`
- [ ] **Step 4: Commit** `feat(回款跟进): 挂 /payment/key 路由+nav(重点跟进区,风险跟进下)+pageKey`

---

### Task 8: 版本 + PROGRESS + 验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1:** `version.ts`：`APP_VERSION='V2.6.1'`、`RELEASE_DATE='2026-07-02'`。
- [ ] **Step 2:** `PROGRESS.md`：加 V2.6.1 版本节（P2 内容 + 4 修复；纯前端+新后端 followup json 自建；**新 pageKey payment-key 需授权**；**本轮不出包,到 P4 统一打**）。
- [ ] **Step 3: 全量验证** `bash verify.sh`（语法/ruff/pytest[+新 test_payment_key_followup]/typecheck/vitest/build 全绿）。
- [ ] **Step 4: 真机冒烟**（承 design-review-screenshot-harness）：/payment/key 空态→超管范围设置→命中项目出行→单格编辑 followAction/revConclusion(弹窗)+nextRevDate(日期)保存→刷新留存→归档(留存不清空)→历史下拉；普通管理员(wangxutong)可编辑单格、看不到范围/归档按钮、只见本人 L4；侧栏「重点跟进」区有「回款重点跟进」;4 修复(标签窄/整卡跳/清单分页)生效；0 console 报错。
- [ ] **Step 5: Commit** `chore(release): V2.6.1 回款重点跟进+P1修复 版本+PROGRESS`

---

## 自查（写完计划的检查）

- **spec 覆盖**：spec §5(/payment/key) 映射 Task 2-7；4 修复(用户本轮追加)映射 Task 1；收尾 Task 8。✓
- **占位扫描**：Task 5 给了完整行构建代码；克隆类任务(2/3/4/6)指明「读源+改这几处 delta」并列全 delta,非占位。✓
- **类型一致**：`PaymentKeyRecord`(Task5)被 store/api(Task4)import；ProgressEditModal 枚举加 'paymentKey'(Task6)与 store id 'paymentKeyFollowup' 对应；pageKey 'payment-key' 三处(pageAccess/nav/route)一致。✓
- **顺序依赖**：Task2(后端纯函数)→Task3(server 接线);Task4(api/store 用 PaymentKeyRecord)与 Task5(定义 PaymentKeyRecord)——**Task5 先于 Task4 或 Task4 用前向 import**:调整为 **Task5 在 Task4 之前**更稳(PaymentKeyRecord 定义在 lib)。执行时按 1→2→3→5→4→6→7→8 顺序(控制者据此派发)。✓
- **归档语义**:后端(Task2 apply_archive 不清)+ store(Task4 archive 不清)+ 视图文案(Task6 留存)三处一致=仅归档不清空。✓
