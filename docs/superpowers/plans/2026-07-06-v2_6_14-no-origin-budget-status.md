# V2.6.14 「未获取原项目预算」状态 + 预算核算剩余负值标红 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 售前服务类且原项目总预算=0 的项目，从"超支"改判为中性「未获取原项目预算」（不计入任何超支统计），联动 /project/:id 标记、/insight/costdetail 卡与状态列、/projects 关注原因；外加预算核算页剩余负值红字。

**Architecture:** 纯前端。新增单一谓词 `noOriginBudget(project, pmisMap)`（costAnalysis 导出），驱动 riskReasons（第3参→产「未获取原项目预算」替代总/交付成本超支）与 costAnalysis（状态/计数）；下游 costdetail 卡、/projects 关注原因、首页成本超支桶随根信号自动减少。ProfitTree 剩余负值独立标红。

**Tech Stack:** Vue3 + TS + Vitest。

## Global Constraints

- 交流与文案用**简体中文**；**不使用任何 emoji**。
- 版本单一来源 `frontend/src/version.ts`；本期 Z 级 → **V2.6.14**，从 V2.6.13 增量。
- **纯前端改动，升级无需点「更新数据」**（不改后端/schema/preprocess/口径来源）。
- 判定单一来源：`noOriginBudget(p, pmis) = p.isPresale && Number(pmis[p.relatedClosedId]?.cost?.总预算 ?? 0) === 0`（含无 relatedClosedId）。
- 新状态「未获取原项目预算」= **中性灰**（`tone/TONE='mut'`）；**不计入超支**。
- 剩余负值 = **红字**（`--danger-text`）。
- 完成定义：代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。

---

### Task 1: 口径核心 — noOriginBudget 谓词 + riskReasons + costAnalysis + projectList

**Files:**
- Modify: `frontend/src/lib/riskReasons.ts`（`RiskCategory` `:5`、`riskReasons` 签名+成本块 `:31,48-58`）
- Modify: `frontend/src/lib/costAnalysis.ts`（新增 `noOriginBudget`、`CostStatus` `:4`、`DeliveryStatus` `:143`、`CostRow` `:14-22`、`buildCostRows` `:30-95`、`CostKpis`/`costKpis` `:98-109`）
- Modify: `frontend/src/lib/projectList.ts`（`riskReasons` 调用 `:93`、import `:3`）
- Test: `frontend/src/lib/riskReasons.test.ts`、`frontend/src/lib/costAnalysis.test.ts`

**Interfaces:**
- Produces: `noOriginBudget(p: Project, pmis: Record<string, ProjectPmis>): boolean`（costAnalysis 导出）；`RiskCategory` 含 `'未获取原项目预算'`；`riskReasons(project, pmis?, noOrigBudget=false)`；`CostRow.noOriginBudget: boolean`；`CostKpis.noOriginBudget: number`；`CostStatus`/`DeliveryStatus` 含 `'未获取原项目预算'`。

- [ ] **Step 1: 写失败测试 — riskReasons.test.ts**

在 `frontend/src/lib/riskReasons.test.ts` 末尾追加：
```ts
describe('riskReasons — 未获取原项目预算(第3参)', () => {
  it('noOrigBudget=true → 产未获取原项目预算(mut)、不产总/交付成本超支;其它原因仍在', () => {
    const p = baseProject({ overspendAmount: 12000,
      payment: { delayedCount: 1, relatedNodeCount: 2, actualTotal: 0, remainingTotal: 100, expectedTotal: 100, paymentRatio: 0 } })
    const pmis = basePmis({ cost: { 交付超支: true } })
    const cats = riskReasons(p, pmis, true).map((x) => x.category)
    expect(cats).toContain('未获取原项目预算')
    expect(cats).not.toContain('总成本超支大于5000')
    expect(cats).not.toContain('总成本超支小于5000')
    expect(cats).not.toContain('交付成本超支')
    expect(cats).toContain('回款延期')
    expect(riskReasons(p, pmis, true).find((x) => x.category === '未获取原项目预算')!.tone).toBe('mut')
  })
  it('noOrigBudget=false(默认) → 走原超支逻辑', () => {
    const p = baseProject({ overspendAmount: 12000 })
    expect(riskReasons(p).some((x) => x.category === '总成本超支大于5000')).toBe(true)
    expect(riskReasons(p).some((x) => x.category === '未获取原项目预算')).toBe(false)
  })
})
```

- [ ] **Step 2: 写失败测试 — costAnalysis.test.ts**

在 `frontend/src/lib/costAnalysis.test.ts`：顶部 import 补 `noOriginBudget`（改现有 `import { buildCostRows, costKpis, ... } from './costAnalysis'` 加入 `noOriginBudget`）。把 `costKpis` 测试用的 `mk` 助手默认值补 `noOriginBudget: false`（现为 `const mk = (o: Partial<any>) => ({ totalOverspend: false, deliveryOverspend: false, overspendAmount: 0, ...o })` → 加 `noOriginBudget: false,`）。追加：
```ts
describe('noOriginBudget 谓词', () => {
  const pmis = { ORG: { cost: { 总预算: 100 } }, ORG0: { cost: { 总预算: 0 } } } as any
  it('售前+原项目总预算=0→true;>0→false;非售前→false;售前无原项目→true', () => {
    expect(noOriginBudget({ isPresale: true, relatedClosedId: 'ORG0' } as any, pmis)).toBe(true)
    expect(noOriginBudget({ isPresale: true, relatedClosedId: 'ORG' } as any, pmis)).toBe(false)
    expect(noOriginBudget({ isPresale: false, relatedClosedId: 'ORG0' } as any, pmis)).toBe(false)
    expect(noOriginBudget({ isPresale: true } as any, pmis)).toBe(true)
  })
})

describe('buildCostRows — 未获取原项目预算', () => {
  it('售前无原项目预算 → 状态/交付状态=未获取原项目预算、两超支false、noOriginBudget=true', () => {
    const projects = [{ projectId: 'SF-N', isPresale: true, orgL4: 'D1', overspendAmount: 894277, deliveryCosts: [] }] as any
    const pmis = { 'SF-N': { cost: {}, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.noOriginBudget).toBe(true)
    expect(r.status).toBe('未获取原项目预算')
    expect(r.deliveryStatus).toBe('未获取原项目预算')
    expect(r.totalOverspend).toBe(false)
    expect(r.deliveryOverspend).toBe(false)
  })
})

describe('costKpis — 未获取原项目预算计数', () => {
  const mk = (o: Partial<any>) => ({ totalOverspend: false, deliveryOverspend: false, overspendAmount: 0, noOriginBudget: false, ...o })
  it('noOriginBudget 计数 + notOverspent 排除', () => {
    const rows = [mk({ noOriginBudget: true }), mk({}), mk({ totalOverspend: true, overspendAmount: 8000 })] as any
    const k = costKpis(rows)
    expect(k.noOriginBudget).toBe(1)
    expect(k.notOverspent).toBe(1)
    expect(k.totalOverspend).toBe(1)
  })
})
```
并**忠实更新既有用例**（`costAnalysis.test.ts:161` 的 `售前超支(overspendAmount>0)无原项目 → ...成本状态=超支`）——该项目正是 noOrigBudget，改判为「未获取原项目预算」：把该 `it(...)` 整块替换为：
```ts
  it('售前无原项目预算(overspendAmount>0) → 未获取原项目预算(不计超支)、剩余=−超支额、已核算=超支额', () => {
    const projects = [{ projectId: 'WSGF-SF-X', isPresale: true, orgL4: 'D1', overspendAmount: 894277, deliveryCosts: [] }] as any
    const pmis = { 'WSGF-SF-X': { cost: {}, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.noOriginBudget).toBe(true)
    expect(r.totalOverspend).toBe(false)
    expect(r.status).toBe('未获取原项目预算')
    expect(r.totalBudget).toBe(0)
    expect(r.remaining).toBe(-894277)
    expect(r.actualCost).toBe(894277)
  })
```
（`售前超支且有原项目`（`:172`，relatedClosedId='ORG'、原总预算 4147176>0）为 noOrig=false、**不改**。）

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/riskReasons.test.ts src/lib/costAnalysis.test.ts`
Expected: FAIL —— `noOriginBudget` 未导出、`未获取原项目预算` 未产、`CostRow.noOriginBudget` 未定义。

- [ ] **Step 4: 实现 riskReasons.ts**

4a. `RiskCategory` 联合（`:5`）末尾（`'数据异常'` 之后）加 `| '未获取原项目预算'`：
```ts
export type RiskCategory = '回款延期' | '里程碑滞后' | '总成本超支大于5000' | '总成本超支小于5000' | '交付成本超支' | '风险未闭环' | '数据异常' | '未获取原项目预算'
```

4b. `riskReasons` 签名（`:31`）加第 3 参：
```ts
export function riskReasons(project: Project, pmis?: ProjectPmis, noOrigBudget = false): RiskReason[] {
```

4c. 成本维度（现「3. 总成本超支」`const over = ...` 到「3b. 交付成本超支」`}` 整段，`:48-58`）替换为：
```ts
  // 3. 成本维度:售前未获取原项目预算 → 中性单列(不计入超支),替代 总/交付成本超支
  if (noOrigBudget) {
    out.push({ category: '未获取原项目预算', detail: '售前原项目预算缺失', tone: 'mut' })
  } else {
    const over = project.overspendAmount ?? 0
    const overCat: RiskCategory = over > 5000 ? '总成本超支大于5000' : '总成本超支小于5000'
    if (over > 0) {
      out.push({ category: overCat, detail: `超支 ${(over / 10000).toFixed(1)} 万`, tone: 'danger' })
    } else if ((pmis?.cost?.['项目超支']) || ((pmis?.cost?.['消耗比'] ?? 0) > 1)) {
      out.push({ category: overCat, detail: '项目超支', tone: 'danger' })
    }
    if (pmis?.cost?.['交付超支'] === true) {
      out.push({ category: '交付成本超支', detail: '交付人工超支', tone: 'danger' })
    }
  }
```

- [ ] **Step 5: 实现 costAnalysis.ts**

5a. `CostStatus`（`:4`）与 `DeliveryStatus`（`:143`）各加 `'未获取原项目预算'`：
```ts
export type CostStatus = '超支大于5k' | '超支不足5k' | '未超支' | '未获取原项目预算'
```
```ts
export type DeliveryStatus = '未超支' | '交付预算超支' | '交付外包超支' | '原厂外包均超支' | '未获取原项目预算'
```

5b. 新增导出谓词（放 `CostStatus` 定义之后、`CostRow` 之前）：
```ts
/** 售前服务类且原项目(relatedClosedId)总预算=0(含原项目缺失)→未获取原项目预算。与 buildCostRows presale totalBudget 同口径。 */
export function noOriginBudget(p: Project, pmis: Record<string, ProjectPmis>): boolean {
  if (!p.isPresale) return false
  const oc = (p.relatedClosedId && pmis[p.relatedClosedId]) ? ((pmis[p.relatedClosedId] as any).cost ?? {}) : {}
  return Number(oc.总预算 ?? 0) === 0
}
```

5c. `CostRow`（`:21` `overspendAmount: number` 那行之后）加：
```ts
  totalOverspend: boolean; deliveryOverspend: boolean; overspendAmount: number
  riskLevel: string; openRisks: number; riskMajorCats: string[]
  noOriginBudget: boolean
```

5d. `buildCostRows` 内，`const m = ...`（`:32`）之后加：
```ts
    const noOrig = noOriginBudget(p, pmis)
```
把 `cats` 那行（`:70`）改为传入第 3 参：
```ts
    const cats = riskReasons(p, m as ProjectPmis, noOrig).map((rr) => rr.category)
```
`return { ... }` 里，把 `status:`/`deliveryStatus:` 两行改为 noOrig 覆盖，并补 `noOriginBudget`：
```ts
      status: noOrig ? '未获取原项目预算' : costStatusOf(totalOverspend, overspendAmount),
      // ...(totalBudget/actualCost/remaining/deliveryDeptRemaining/deliveryOutsourceRemaining 不变)...
      deliveryStatus: noOrig ? '未获取原项目预算' : deliveryStatusOf(deptRem, outRem),
      // ...
      noOriginBudget: noOrig,
```
（其余字段与 return 结构不变。）

5e. `CostKpis`（`:98`）加字段，`costKpis`（`:100-108`）循环加排除：
```ts
export interface CostKpis { total: number; notOverspent: number; totalOverspend: number; totalOverspendOver5k: number; deliveryOverspend: number; noOriginBudget: number }
```
```ts
export function costKpis(rows: CostRow[]): CostKpis {
  const k: CostKpis = { total: 0, notOverspent: 0, totalOverspend: 0, totalOverspendOver5k: 0, deliveryOverspend: 0, noOriginBudget: 0 }
  for (const r of rows) {
    k.total++
    if (r.noOriginBudget) { k.noOriginBudget++; continue }
    if (!r.totalOverspend && !r.deliveryOverspend) k.notOverspent++
    if (r.totalOverspend) { k.totalOverspend++; if (r.overspendAmount > 5000) k.totalOverspendOver5k++ }
    if (r.deliveryOverspend) k.deliveryOverspend++
  }
  return k
}
```

- [ ] **Step 6: 实现 projectList.ts**

第 3 行 import 补 `noOriginBudget`：
```ts
import { riskReasons, TOTAL_OVERSPEND_CATS, type RiskReason } from './riskReasons'
import { noOriginBudget } from './costAnalysis'
```
第 93 行：
```ts
      riskReasons: riskReasons(p, pmisMap[p.projectId], noOriginBudget(p, pmisMap)),
```

- [ ] **Step 7: 跑测试 + 全仓 typecheck/vitest**

Run: `cd frontend && npx vitest run src/lib/riskReasons.test.ts src/lib/costAnalysis.test.ts && npm run typecheck && npx vitest run`
Expected: 两文件 PASS；typecheck 无错；全量 vitest 全绿（若 `projectList.test.ts` 有 presale-无原项目 的 buildProjectRows fixture 致其 riskReasons 变化而挂，按新行为忠实更新——正常应无）。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/lib/riskReasons.ts frontend/src/lib/costAnalysis.ts frontend/src/lib/projectList.ts frontend/src/lib/riskReasons.test.ts frontend/src/lib/costAnalysis.test.ts
git commit -m "feat(cost): 未获取原项目预算口径核心(noOriginBudget谓词+riskReasons/costAnalysis改判,不计超支) (V2.6.14)"
```

---

### Task 2: `/insight/costdetail` 卡片 sub + 状态列中性灰 + 筛选排除

**Files:**
- Modify: `frontend/src/views/CostDetailView.vue`（`kpiItems` `:64-65`、`TONE`/`DELIVERY_TONE` `:129-130`、`filtered` `:152`）

**Interfaces:**
- Consumes: Task 1 的 `CostKpis.noOriginBudget`、`CostRow.noOriginBudget`、`CostStatus/DeliveryStatus='未获取原项目预算'`。

- [ ] **Step 1: 交付成本超支数卡加 sub**

`kpiItems`（`:64-65`）里 `交付成本超支数` 那项改为带 sub：
```ts
    { k: '交付成本超支数', v: String(k.deliveryOverspend), sub: `未获取原项目预算: ${k.noOriginBudget}`, cls: 'danger', clickable: true },
```

- [ ] **Step 2: TONE/DELIVERY_TONE 加中性灰**

`:129-130`：
```ts
const TONE: Record<string, string> = { 未超支: 'ok', 超支不足5k: 'warn', 超支大于5k: 'danger', 未获取原项目预算: 'mut' }
const DELIVERY_TONE: Record<string, string> = { 未超支: 'ok', 交付预算超支: 'warn', 交付外包超支: 'warn', 原厂外包均超支: 'danger', 未获取原项目预算: 'mut' }
```

- [ ] **Step 3: 「未超支」就地筛选排除 noOrig**

`filtered`（`:152` `notOverspent` 分支）：
```ts
  if (kpiFilter.value === 'notOverspent') r = r.filter((x) => !x.totalOverspend && !x.deliveryOverspend && !x.noOriginBudget)
```

- [ ] **Step 4: 类型检查 + 回归 + 构建**

Run: `cd frontend && npm run typecheck && npx vitest run && npm run build`
Expected: 全绿、无回归。

- [ ] **Step 5: 真机冒烟（人工，实现子代理跳过）**

`/insight/costdetail`：交付成本超支数卡下显「未获取原项目预算: N」；售前无原项目预算项目的 成本状态/交付成本状态 列显中性灰「未获取原项目预算」；总/交付超支数相应减少。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/CostDetailView.vue
git commit -m "feat(costdetail): 交付超支数卡加未获取原项目预算计数+状态列中性灰+未超支筛选排除 (V2.6.14)"
```

---

### Task 3: `/project/:id` 上方标记切「未获取原项目预算」

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue`（import、computed、模板 `:292-293`、样式）
- Test: `frontend/src/views/ProjectDetailView.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `noOriginBudget`（`@/lib/costAnalysis`）。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/ProjectDetailView.test.ts` 内合适 describe 追加（若已有 seed/mount 助手，复用；下例给出自足断言，实现者按该文件既有 mount 模式适配）：
```ts
  it('售前无原项目预算 → 显「未获取原项目预算」徽标、不显超支徽标', async () => {
    // 该 test 需 seed 一个 isPresale 且原项目总预算=0 的项目并进入 /project/:id;
    // 断言渲染文本含「未获取原项目预算」且不含「总体预算超支」。
    // 按本文件既有 seed/mount 范式构造(参照文件内其它用例)。
    // 关键断言:
    // expect(w.text()).toContain('未获取原项目预算')
    // expect(w.text()).not.toContain('总体预算超支')
  })
```
（实现者据本文件既有测试范式补全 seed/mount；核心断言两行如上。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: FAIL（尚未渲染「未获取原项目预算」徽标）。

- [ ] **Step 3: 实现**

3a. `<script setup>` import 区加：
```ts
import { noOriginBudget } from '@/lib/costAnalysis'
```
3b. 在 `overBudget`/`deliveryOverBadges` 计算（`:62-72`）附近加：
```ts
const noOrigBudget = computed(() => p.value ? noOriginBudget(p.value, (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>) : false)
```
3c. 模板 `:292-293` 两个超支徽标替换为：
```html
            <template v-if="noOrigBudget">
              <span class="pd-badge mut">未获取原项目预算</span>
            </template>
            <template v-else>
              <span v-if="overBudget" class="pd-badge" :class="`over-${overBudget.level}`">总体预算超支 {{ fmtWan(overBudget.amount) }}万</span>
              <span v-for="cat in deliveryOverBadges" :key="cat" class="pd-badge over-danger">{{ cat }}超支</span>
            </template>
```
3d. `<style>` 若无 `.pd-badge.mut` 则加：
```css
.pd-badge.mut { background: var(--card2); color: var(--mut); }
```
（`ProjectPmis` 类型若未 import，在本文件 import 区补 `import type { ProjectPmis } from '@/types/analysis'`——多数已有 `Project`/`ProjectPmis` import，按实际补。）

- [ ] **Step 4: 跑测试 + 类型检查**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts && npm run typecheck`
Expected: PASS + typecheck 无错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(project-detail): 售前未获取原项目预算显中性徽标(替代超支标记) (V2.6.14)"
```

---

### Task 4: 预算核算页剩余负值红字（ProfitTree）

**Files:**
- Modify: `frontend/src/components/ProfitTree.vue`（剩余单元格 `:34`、样式）
- Test: `frontend/src/components/ProfitTree.test.ts`

- [ ] **Step 1: 写失败测试**

在 `frontend/src/components/ProfitTree.test.ts` 末尾追加（按该文件既有 mount 范式）：
```ts
  it('剩余<0 的非比率行单元格挂 .pt-neg(红字)', async () => {
    const rows = [{ code: 'X', name: '成本', level: 1, budget: 100, estimate: 100, final: 100, actual: 120, remaining: -20, rate: 1.2 }] as any
    const w = mount(ProfitTree, { props: { rows } })
    await flushPromises()
    expect(w.find('.pt-neg').exists()).toBe(true)
  })
```
（若文件顶部未 import `mount`/`flushPromises`，按本文件既有 import 补。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/ProfitTree.test.ts`
Expected: FAIL（`.pt-neg` 不存在）。

- [ ] **Step 3: 实现**

`:34` 剩余单元格改为：
```html
        <td class="u-num" :class="{ 'pt-neg': !isRateRow(r) && (r.remaining ?? 0) < 0 }">{{ money(r, r.remaining) }}</td>
```
`<style>` 末尾加：
```css
.pt-neg { color: var(--danger-text); }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/ProfitTree.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ProfitTree.vue frontend/src/components/ProfitTree.test.ts
git commit -m "feat(profit-tree): 预算核算剩余负值红字 (V2.6.14)"
```

---

### Task 5: bump V2.6.14 + verify 全绿 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：
```ts
export const APP_VERSION = 'V2.6.14'
export const RELEASE_DATE = '2026-07-06'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法 + ruff + pytest + 前端 typecheck/vitest/build）。若前端未跑到，另跑 `cd frontend && npm run typecheck && npx vitest run && npm run build`。

- [ ] **Step 3: 更新 PROGRESS.md**

顶部新增 V2.6.14 条目、原「当前版本」改「上一版本」，一句话概述：新增「未获取原项目预算」状态（售前且原项目总预算=0，`noOriginBudget` 谓词）——riskReasons/costAnalysis 改判为中性、不计超支，联动 /project/:id 标记、costdetail 卡与状态列、/projects 关注原因、首页成本超支桶相应减少；预算核算页剩余负值红字；纯前端、升级无需点更新数据。照现有条目格式。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: bump V2.6.14 + PROGRESS(未获取原项目预算状态+剩余负值标红)"
```

---

## 打包（控制者收尾，PowerShell）

> 非实现任务；五任务全绿合 master 后由控制者执行，照 V2.6.13 惯例（纯前端）。

- 合 `master`：`git checkout master && git merge --no-ff <feat 分支>`。
- **PowerShell** 构建 /pm：`cd frontend; npx vite build --base=/pm/`，校验 `dist/index.html` 含 `="/pm/assets`。
- 写 `deploy/升级手册-V2.6.14.md`（从 V2.6.13 增量；头号注意=**纯前端、升级无需点「更新数据」**；无新页/pageKey/依赖；说明售前无原项目预算项目改显「未获取原项目预算」、不再计入超支、剩余负值红字）。
- `python make_update_zip.py` 出 `release/pmplatform-update-V2.6.14.zip`。
- **构建后重建默认 dist**：`cd frontend; npx vite build`（校验 `="/assets`）。

---

## Self-Review

**Spec 覆盖：**
- 判定单一来源 noOriginBudget → Task 1。✓
- 诉求1.1 剩余红字 → Task 4；诉求1.2 详情页标记 → Task 3。✓
- 诉求2.1 riskReasons 联动 + 卡片 → Task 1(riskReasons/costKpis) + Task 2(卡 sub)。✓
- 诉求2.2 明细状态列 → Task 1(status override) + Task 2(TONE 中性灰)。✓
- 诉求3 /projects 关注原因 → Task 1 自动生效(riskReasons 产新类)，无独立任务。✓
- 统计连锁(首页桶/未超支排除) → Task 1(根信号) + Task 2(筛选排除)。✓
- 既有售前超支测试忠实更新 → Task 1 Step 2。✓
- 版本/验证/打包 → Task 5 + 打包段。✓

**Placeholder 扫描：** 无 TBD/TODO；改代码步骤含完整代码。Task3/Task4 的视图/组件测试给出核心断言 + 让实现者按该文件既有 seed/mount 范式补全(非占位，是明确指令+断言)。✓

**类型一致：** `noOriginBudget(p, pmis): boolean`（Task1 产出）在 Task1(costAnalysis/projectList)、Task3(ProjectDetailView) 一致消费；`CostRow.noOriginBudget`/`CostKpis.noOriginBudget`（Task1）在 Task2 消费；`riskReasons(_, _, noOrigBudget)` 第3参、`RiskCategory '未获取原项目预算'`、`CostStatus/DeliveryStatus '未获取原项目预算'` 全程一致。✓
