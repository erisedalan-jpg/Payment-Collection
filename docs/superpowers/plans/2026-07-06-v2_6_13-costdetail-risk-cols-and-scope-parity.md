# V2.6.13 成本明细风险两列 + 三页范围补齐 /projects 列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ①`/insight/costdetail` 项目成本明细加「项目风险」「风险大类」两列；②`/risk`、`/projects/temp`、`/payment/key` 三页范围设置「项目」组补齐到 /projects 全部列。

**Architecture:** 纯前端。诉求1 = `CostRow` 加三派生字段 + 明细表两列（`风险大类` cell 插槽清单式）。诉求2 = ScopeBuilder 已通用（catalog 驱动、enum 选项自动摊平），只需给 catalog 加字段并让输入行携带对应键：temp/paykey 加 `关注原因`（tempScope + buildScopeInputs），/risk 经 `ProjectRow` 派生补 11 个项目级字段（riskRows）。两诉求相互独立。

**Tech Stack:** Vue3 + TS + Vitest。

## Global Constraints

- 交流与文案用**简体中文**；**不使用任何 emoji**。
- 版本单一来源 `frontend/src/version.ts`；本期 Z 级 → **V2.6.13**，从 V2.6.12 增量。
- **纯前端改动，升级无需点「更新数据」**（不改后端/schema/preprocess）。
- 表格数字列挂 `.u-num`（沿用现列约定）；间距/清单样式用设计令牌，不手写散值。
- `风险大类`（数组列）**不纳入列头筛选**（crossFilter 对数组会整体 String 化、破坏筛选）；`CostDetailView` 的 `FILTERABLE` 需显式排除它。
- `项目风险`=与 /projects「风险」列同源：`riskLevel` + 未关闭数，formatter `(v,r)=>r.openRisks?`${v}(${r.openRisks})`:v`。
- 「标签」scope 不纳入本次（选项需 project-tags 注入、temp 现有亦空壳）。
- 完成定义：代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。

---

### Task 1: `/insight/costdetail` 项目成本明细加风险两列

**Files:**
- Modify: `frontend/src/lib/costAnalysis.ts`（`CostRow` `:14-22`、`buildCostRows` `:30-86`）
- Modify: `frontend/src/views/CostDetailView.vue`（`DETAIL_COLS` `:108-122`、`FILTERABLE` `:125`、cell 插槽/样式、`onExport` `:165-172`）
- Test: `frontend/src/lib/costAnalysis.test.ts`

**Interfaces:**
- Produces: `CostRow` 增 `riskLevel: string`、`openRisks: number`、`riskMajorCats: string[]`。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/costAnalysis.test.ts` 末尾追加（`buildCostRows` 的 describe 内或新 describe 皆可）：

```ts
describe('buildCostRows — 风险派生列', () => {
  it('riskLevel/openRisks/riskMajorCats(去重去空,含已关闭)', () => {
    const projects = [{ projectId: 'WS5', orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { WS5: { cost: {}, status: {}, team: {},
      risk: { 最高等级: '高', 未关闭风险数: 2 },
      riskRecords: [{ 风险大类: '进度' }, { 风险大类: '成本' }, { 风险大类: '进度' }, { 风险大类: '' }] } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.riskLevel).toBe('高')
    expect(r.openRisks).toBe(2)
    expect(r.riskMajorCats).toEqual(['进度', '成本'])
  })
  it('无风险数据 → riskLevel=无 / openRisks=0 / riskMajorCats=[]', () => {
    const projects = [{ projectId: 'WS6', orgL4: 'D1', deliveryCosts: [] }] as any
    const pmis = { WS6: { cost: {}, status: {}, team: {} } } as any
    const r = buildCostRows(projects, pmis)[0]
    expect(r.riskLevel).toBe('无')
    expect(r.openRisks).toBe(0)
    expect(r.riskMajorCats).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts`
Expected: FAIL —— `riskLevel`/`riskMajorCats` 为 undefined。

- [ ] **Step 3: 改 `costAnalysis.ts`**

3a. `CostRow` 接口（`:21` `overspendAmount: number` 那行之后）补：
```ts
  totalOverspend: boolean; deliveryOverspend: boolean; overspendAmount: number
  riskLevel: string; openRisks: number; riskMajorCats: string[]
```

3b. `buildCostRows` 内，在 `const m = ...`（`:32`）之后补：
```ts
    const risk = (m.risk ?? {}) as Record<string, any>
    const riskMajorCats = [...new Set(
      ((m.riskRecords ?? []) as Record<string, any>[])
        .map((rr) => String(rr['风险大类'] ?? '').trim()).filter((sv) => sv !== ''),
    )]
```

3c. `buildCostRows` 的 `return { ... }`（`:67-85`）里，在 `overspendAmount,` 之后补：
```ts
      riskLevel: String(risk.最高等级 ?? '') || '无',
      openRisks: Number(risk.未关闭风险数 ?? 0),
      riskMajorCats,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts`
Expected: PASS。

- [ ] **Step 5: 改 `CostDetailView.vue`**

5a. `DETAIL_COLS`（`deliveryStatus` 那行 `:122` 之后）追加两列：
```ts
  { key: 'riskLevel', label: '项目风险', width: 110, sortable: true,
    formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'riskMajorCats', label: '风险大类', width: 180, wrap: true },
```

5b. `FILTERABLE`（`:125`）排除 `riskMajorCats`（数组列不进列筛选）：
```ts
const FILTERABLE = new Set(DETAIL_COLS.map((c) => c.key).filter((k) => k !== '_seq' && k !== 'riskMajorCats'))
```

5c. 模板里（现有 `#cell-deliveryStatus` 插槽附近，`:218` 之后）加 `风险大类` 清单插槽：
```html
            <template #cell-riskMajorCats="{ value }">
              <span v-if="!value || !value.length" class="cd-mut">-</span>
              <span v-else class="cd-majorcats">
                <span v-for="c in value" :key="c" class="cd-majorcat">{{ c }}</span>
              </span>
            </template>
```

5d. `<style scoped>` 内追加：
```css
.cd-majorcats { display: flex; flex-direction: column; gap: 2px; }
.cd-mut { color: var(--mut); }
```
（若 `.cd-mut` 已存在则不重复加。）

5e. `onExport`（`:166-172`）在 `交付成本状态: r.deliveryStatus,` 之后补两列：
```ts
    项目风险: r.openRisks ? `${r.riskLevel}(${r.openRisks})` : r.riskLevel,
    风险大类: r.riskMajorCats.join('、'),
```

- [ ] **Step 6: 类型检查 + 回归 + 构建**

Run: `cd frontend && npm run typecheck && npx vitest run && npm run build`
Expected: 全绿、无回归。

- [ ] **Step 7: 真机冒烟（人工，实现子代理跳过）**

`/insight/costdetail` 明细表末两列：项目风险显 `高(3)`；风险大类多风险清单式一行一项、去重；列头筛选出现「项目风险」不出现「风险大类」。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/lib/costAnalysis.ts frontend/src/lib/costAnalysis.test.ts frontend/src/views/CostDetailView.vue
git commit -m "feat(costdetail): 项目成本明细加项目风险/风险大类两列(多风险清单式) (V2.6.13)"
```

---

### Task 2: `/projects/temp`+`/payment/key` 范围加「关注原因」

**Files:**
- Modify: `frontend/src/lib/tempScope.ts`（`FIELD_CATALOG` `:36-81`）
- Modify: `frontend/src/lib/tempFollowup.ts`（`buildScopeInputs` `proj` `:61-87`）
- Test: `frontend/src/lib/tempScope.test.ts`、`frontend/src/lib/tempFollowup.test.ts`

**Interfaces:**
- Produces: `tempScope.FIELD_CATALOG` project 组含 `{ key: 'riskReasons', label: '关注原因', kind: 'enum' }`；`buildScopeInputs` 的 `proj.riskReasons` = `string[]`（category 数组）。

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/tempScope.test.ts` 的 `FIELD_CATALOG` describe 内加断言（`:24` 之后）：
```ts
    expect(projKeys).toContain('riskReasons')
```
同文件 `projectMatches` describe 内新增一例：
```ts
  it('project 关注原因(数组 enum) in / notIn', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'riskReasons', op: 'in', values: ['回款延期'] }] }] })
    expect(projectMatches(inp({ proj: { riskReasons: ['回款延期', '里程碑滞后'] } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { riskReasons: ['数据异常'] } }), f)).toBe(false)
  })
```
`frontend/src/lib/tempFollowup.test.ts` 的 `buildScopeInputs` 用例（`:56` `expect(i.proj.ar)...` 之后）加：
```ts
    expect(Array.isArray(i.proj.riskReasons)).toBe(true)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts src/lib/tempFollowup.test.ts`
Expected: FAIL —— catalog 无 `riskReasons`；`proj.riskReasons` 为 undefined。

- [ ] **Step 3: 改 `tempScope.ts`**

`FIELD_CATALOG` project 组里、`milestoneStatus` 那行（`:56`）之后加：
```ts
  { group: 'project', key: 'riskReasons', label: '关注原因', kind: 'enum' },
```

- [ ] **Step 4: 改 `tempFollowup.ts`**

`buildScopeInputs` 的 `proj: { ... }` 里、`milestoneStatus:` 那行（`:80`）之后加：
```ts
        riskReasons: (pr?.riskReasons ?? []).map((r) => r.category),
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts src/lib/tempFollowup.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/tempScope.ts frontend/src/lib/tempFollowup.ts frontend/src/lib/tempScope.test.ts frontend/src/lib/tempFollowup.test.ts
git commit -m "feat(scope): temp/payment-key 范围加「关注原因」项目字段 (V2.6.13)"
```

---

### Task 3: `/risk` 范围补齐 11 个项目级字段

**Files:**
- Modify: `frontend/src/lib/riskRows.ts`（import、`buildRiskRows` `:21-57`、`RISK_SCOPE_CATALOG` `:72-87`）
- Test: `frontend/src/lib/riskRows.test.ts`

**Interfaces:**
- Consumes: `buildProjectRows`（`@/lib/projectList`，`(projects, pmisMap) => ProjectRow[]`，`ProjectRow` 含 stage/progress/riskLevel/openRisks/costRatio/paymentRatio/health/riskReasons/paymentStatus/top1000/quadrant）。
- Produces: `RISK_SCOPE_CATALOG` 增 11 条；风险行含对应 11 个中文键。

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/riskRows.test.ts`：把顶部 import 改为
```ts
import { buildRiskRows, riskRowMatches, RISK_SCOPE_CATALOG } from './riskRows'
```
末尾追加：
```ts
describe('buildRiskRows — 项目级 scope 字段(补齐 /projects 列)', () => {
  const projects = [
    { projectId: 'P1', projectName: '甲', orgL4: '一组', paymentPmis: { contract: 2_000_000 },
      payment: { relatedNodeCount: 1, delayedCount: 0, remainingTotal: 0, actualTotal: 100, paymentRatio: 0.5 },
      health: { overall: '关注' }, top1000: '是', quadrant: 'Q1', overspendAmount: 8000 },
  ] as any
  const pmis = { P1: {
    status: { 项目级别: 'P1', 项目类型: '实施', 项目状态: '实施中' },
    progress: { 项目阶段: '交付', 完工进展: 0.6 },
    risk: { 最高等级: '高', 未关闭风险数: 3 },
    cost: { 消耗比: 0.9 },
    riskRecords: [{ 风险编码: 'FX-1', 风险状态: '未关闭', 项目编号: 'P1' }],
  } } as any

  it('风险行挂项目级字段(取自 ProjectRow)', () => {
    const r = buildRiskRows(projects, pmis, {})[0]
    expect(r['项目阶段']).toBe('交付')
    expect(r['完工进展']).toBe(0.6)
    expect(r['项目最高风险等级']).toBe('高')
    expect(r['未关闭风险数']).toBe(3)
    expect(r['预算消耗比']).toBe(0.9)
    expect(r['回款完成率']).toBe(0.5)
    expect(r['健康度']).toBe('关注')
    expect(r['TOP1000']).toBe('是')
    expect(r['象限']).toBe('Q1')
    expect(Array.isArray(r['关注原因'])).toBe(true)
    expect(r['关注原因']).toContain('总成本超支大于5000') // overspendAmount 8000 > 5000
  })

  it('RISK_SCOPE_CATALOG 含新增 11 个项目级字段', () => {
    const keys = RISK_SCOPE_CATALOG.map((f) => f.key)
    for (const k of ['项目阶段', '完工进展', '项目最高风险等级', '未关闭风险数', '预算消耗比',
      '回款完成率', '健康度', '关注原因', '回款状态', 'TOP1000', '象限']) {
      expect(keys).toContain(k)
    }
  })

  it('riskRowMatches 新字段:关注原因(数组enum) / 完工进展(number区间)', () => {
    const r = buildRiskRows(projects, pmis, {})[0]
    const catScope: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND',
      conditions: [{ field: '关注原因', op: 'in', values: ['总成本超支大于5000'] }] }] }
    expect(riskRowMatches(r, catScope)).toBe(true)
    const numScope: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND',
      conditions: [{ field: '完工进展', op: 'between', min: 0.5, max: 0.7 }] }] }
    expect(riskRowMatches(r, numScope)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/riskRows.test.ts`
Expected: FAIL —— 行无 `项目阶段` 等键；`RISK_SCOPE_CATALOG` 缺新字段。

- [ ] **Step 3: 改 `riskRows.ts` — import + prMap + 挂字段**

3a. 顶部 import 加：
```ts
import { buildProjectRows } from './projectList'
```

3b. `buildRiskRows` 函数体开头（`const out: RiskRow[] = []` 那行之前）加：
```ts
  const prMap = new Map(buildProjectRows(projects, pmisMap).map((r) => [r.projectId, r]))
```
（`buildRiskRows` 的 pmis 参数名为 `pmisMap`；若实际形参名不同，用实际名。）

3c. 在 `for (const p of projects)` 循环体内、`out.push({ ... })` 之前取 `pr`：
```ts
    const pr = prMap.get(p.projectId)
```
并在 push 的对象里（`'项目状态': ...` 等项目列附近）补 11 个字段：
```ts
        '项目阶段': pr?.stage ?? '-',
        '完工进展': pr?.progress ?? null,
        '项目最高风险等级': pr?.riskLevel ?? '无',
        '未关闭风险数': pr?.openRisks ?? 0,
        '预算消耗比': pr?.costRatio ?? null,
        '回款完成率': pr?.paymentRatio ?? null,
        '健康度': pr?.health ?? '无数据',
        '关注原因': (pr?.riskReasons ?? []).map((r) => r.category),
        '回款状态': pr?.paymentStatus ?? '-',
        'TOP1000': pr?.top1000 ?? '否',
        '象限': pr?.quadrant ?? '',
```

- [ ] **Step 4: 改 `RISK_SCOPE_CATALOG` — 追加 11 条**

`RISK_SCOPE_CATALOG` 数组末尾（`项目金额` 那条之后）追加：
```ts
  { key: '项目阶段', label: '项目阶段', kind: 'enum' as FieldKind },
  { key: '完工进展', label: '完工进展', kind: 'number' as FieldKind },
  { key: '项目最高风险等级', label: '项目最高风险等级', kind: 'enum' as FieldKind },
  { key: '未关闭风险数', label: '未关闭风险数', kind: 'number' as FieldKind },
  { key: '预算消耗比', label: '预算消耗比', kind: 'number' as FieldKind },
  { key: '回款完成率', label: '回款完成率', kind: 'number' as FieldKind },
  { key: '健康度', label: '健康度', kind: 'enum' as FieldKind },
  { key: '关注原因', label: '关注原因', kind: 'enum' as FieldKind },
  { key: '回款状态', label: '回款状态', kind: 'enum' as FieldKind },
  { key: 'TOP1000', label: 'TOP1000', kind: 'enum' as FieldKind },
  { key: '象限', label: '象限', kind: 'enum' as FieldKind },
```

- [ ] **Step 5: 跑测试 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/riskRows.test.ts && npm run typecheck`
Expected: PASS + typecheck 无错。

- [ ] **Step 6: 真机冒烟（人工，实现子代理跳过）**

`/risk` 范围设置抽屉：项目类字段下拉出现 阶段/健康度/关注原因/回款状态/TOP1000/象限 等，选值后命中数正确。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/riskRows.ts frontend/src/lib/riskRows.test.ts
git commit -m "feat(scope): /risk 范围补齐 11 个项目级字段(经 ProjectRow 派生) (V2.6.13)"
```

---

### Task 4: bump V2.6.13 + verify 全绿 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：
```ts
export const APP_VERSION = 'V2.6.13'
export const RELEASE_DATE = '2026-07-06'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法 + ruff + pytest + 前端 typecheck/vitest/build）。若前端未跑到，另跑 `cd frontend && npm run typecheck && npx vitest run && npm run build`。

- [ ] **Step 3: 更新 PROGRESS.md**

顶部新增 V2.6.13 条目、原「当前版本」改「上一版本」，一句话概述：`/insight/costdetail` 项目成本明细加「项目风险(同/projects风险列)」「风险大类(多风险清单式)」两列 + `/risk`、`/projects/temp`、`/payment/key` 三页范围「项目」组补齐到 /projects 列（temp/paykey 加关注原因、/risk 经 ProjectRow 派生补 11 字段；标签暂缓）；纯前端、升级无需点更新数据。照现有条目格式。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: bump V2.6.13 + PROGRESS(成本明细风险两列+三页范围补齐)"
```

---

## 打包（控制者收尾，PowerShell）

> 非实现任务；四任务全绿合 master 后由控制者执行，照 V2.6.12 惯例（纯前端）。

- 合 `master`：`git checkout master && git merge --no-ff <feat 分支>`。
- **PowerShell** 构建 /pm：`cd frontend; npx vite build --base=/pm/`，校验 `dist/index.html` 含 `="/pm/assets`。
- 写 `deploy/升级手册-V2.6.13.md`（从 V2.6.12 增量；头号注意=**纯前端、升级无需点「更新数据」**；无新页/pageKey/依赖；costdetail 多两列、三页范围多项目字段）。
- `python make_update_zip.py` 出 `release/pmplatform-update-V2.6.13.zip`。
- **构建后重建默认 dist**：`cd frontend; npx vite build`（校验 `="/assets`）。

---

## Self-Review

**Spec 覆盖：**
- 诉求1 costdetail 两列（riskLevel+openRisks / riskMajorCats 清单）→ Task 1。✓（含 FILTERABLE 排除 riskMajorCats 的关键处理）
- 诉求2 temp/paykey 关注原因 → Task 2；/risk 11 字段经 ProjectRow 派生 → Task 3。✓
- 标签暂缓 → 未加任务，Global Constraints 已注明。✓
- 版本/验证/打包 → Task 4 + 打包段。✓

**Placeholder 扫描：** 无 TBD/TODO；每步含完整代码或确切 old→new 与命令。✓

**类型一致：** `CostRow.riskLevel/openRisks/riskMajorCats`（Task1 产出）与视图列 key/formatter/export 一致；`buildScopeInputs.proj.riskReasons`（Task2）为 category 数组、catalog key `riskReasons` 对齐；`buildRiskRows` 11 中文键（Task3）与 `RISK_SCOPE_CATALOG` 11 条 key 逐一对齐、经 `ProjectRow` 字段（stage/progress/riskLevel/openRisks/costRatio/paymentRatio/health/riskReasons/paymentStatus/top1000/quadrant）派生。✓
