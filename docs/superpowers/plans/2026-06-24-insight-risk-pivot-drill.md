# /insight/risk 透视+下钻+筛选 Implementation Plan (SP-3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造 /insight/risk：风险统计分析加风险等级筛选（仅本块）；风险概览升级为行列自选透视（风险维度/项目维度两类，含多值风险大类/小类）；全页点数据→弹窗列出该桶项目→跳详情。

**Architecture:** lib/riskBoard.ts 扩 RiskRow（项目维度 + 风险大类/小类多值数组,仅未关闭口径）+ 12 维分类(risk/project,multi) + dimValues 炸开 + groupRiskDims(笛卡尔多值) + riskPivot(镜像 payBoardPivot)；DimPicker 加分组；新 RiskDrillModal；RiskBoardView 接筛选/透视/下钻。复用 PivotTable/ChartBox(datapoint-click)/lib/pivot 泛型。

**Tech Stack:** Vue3+TS+Pinia+ECharts+vitest；样式 theme.css 令牌。

## Global Constraints

> 每个任务隐含包含本节，值逐字照抄。

- **风险大类/小类口径 = 仅未关闭风险记录**（风险状态不含"已关闭"，与看板一致）。`riskMajorCats`/`riskMinorCats: string[]`：未关闭记录去重大类/小类；有未关闭但全空→`['未分类']`；**无未关闭风险→`['无风险']`**（每项目至少一桶）。
- **维度 12 个，分两类**（`RiskDimDef` 加 `category:'risk'|'project'` + `multi?:boolean`）：风险维度=`riskLevel`/`riskMajorCats`(multi)/`riskMinorCats`(multi)；项目维度=`orgL4`/`projectLevel`/`manager`/`industry`/`top1000`/`quadrant`/`projectStatus`/`stage`/`health`。
- **多值炸开**：`dimValuesOf(row,def)` 多值维返数组、单值维返 `[值或'未指定']`；`groupRiskDims` 笛卡尔积炸开（项目跨桶重复计，∑桶>总数；单值维零回归）。
- **指标** `RISK_METRICS` 不变：projectCount/hasRiskCount/openRiskSum/contractAmount。
- **风险等级筛选**（高/中/低/无风险多选，默认全选）**仅作用于风险统计分析**块；顶部卡片 + 风险概览用全量 rows。
- **下钻=RiskDrillModal**（列出该桶 RiskRow，点行跳 `/project/:id`），口径准确，**不走 /projects 深链**。
- **版本** `frontend/src/version.ts` → `APP_VERSION='V1.20.1'`、`RELEASE_DATE='2026-06-24'`。
- 禁止 emoji；简体中文；commit message 末尾必须是 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`；spec/plan 文档写盘不 commit。

---

### Task 1: RiskRow 扩展（项目维度 + 风险大类/小类多值）

**Files:**
- Modify: `frontend/src/lib/riskBoard.ts`（RiskRow + buildRiskRows + openCats）
- Test: `frontend/src/lib/riskBoard.test.ts`

**Interfaces:**
- Produces: `RiskRow` 新增 `projectStatus/stage/health: string`、`riskMajorCats/riskMinorCats: string[]`；`buildRiskRows` 填充。

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/riskBoard.test.ts`，在 `describe('buildRiskRows', ...)` 块内追加：

```typescript
  it('新增项目维度 + 风险大类/小类(仅未关闭,无风险→[无风险])', () => {
    const rec = (lvl: string, status: string, major: string, minor: string) => ({ 风险等级: lvl, 风险状态: status, 风险大类: major, 风险小类: minor })
    const projects = [
      { projectId: 'A', projectName: 'a', orgL4: '组', projectManager: '甲', health: { overall: '风险' } },
      { projectId: 'B', projectName: 'b', orgL4: '组', projectManager: '乙' },
    ] as unknown as Project[]
    const pmisMap = {
      A: { status: { 项目级别: 'P1', 项目状态: '实施中' }, progress: { 项目阶段: '执行' }, customer: {},
           riskRecords: [rec('高', '已识别', '客户侧风险', '其它'), rec('中', '已识别', '成本超支风险', ''), rec('低', '已关闭', '质量风险', 'x')] },
      B: { status: {}, progress: {}, customer: {}, riskRecords: [] },
    } as unknown as Record<string, ProjectPmis>
    const [a, b] = buildRiskRows(projects, pmisMap)
    expect(a.projectStatus).toBe('实施中')
    expect(a.stage).toBe('执行')
    expect(a.health).toBe('风险')
    expect([...a.riskMajorCats].sort()).toEqual(['客户侧风险', '成本超支风险'])  // 已关闭的质量风险被排除
    expect(a.riskMinorCats).toEqual(['其它'])                                   // 仅非空去重(成本超支的小类空被滤)
    expect(b.health).toBe('无数据')
    expect(b.riskMajorCats).toEqual(['无风险'])  // 无未关闭风险
    expect(b.riskMinorCats).toEqual(['无风险'])
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts`
Expected: FAIL（`a.projectStatus` undefined）

- [ ] **Step 3: 实现 RiskRow 扩展 + openCats**

`frontend/src/lib/riskBoard.ts`：`RiskRow`（:31-43）在 `quadrant: string` 后加：

```typescript
  top1000: string
  quadrant: string
  projectStatus: string
  stage: string
  health: string
  riskMajorCats: string[]
  riskMinorCats: string[]
  riskLevel: RiskLevel
```

在 `buildRiskRows`（:45）之前加 helper：

```typescript
/** 未关闭记录去重的某分类字段值;无未关闭风险→['无风险'];有未关闭但全空→['未分类'] */
function openCats(pmis: ProjectPmis | undefined, field: string): string[] {
  const open = openRecords(pmis)
  if (!open.length) return ['无风险']
  const cats = [...new Set(open.map((r) => String(r[field] ?? '').trim()).filter((x) => x))]
  return cats.length ? cats : ['未分类']
}
```

`buildRiskRows`（:45-64）的返回对象加字段（`prog` 取 progress）：

```typescript
export function buildRiskRows(projects: Project[], pmisMap: Record<string, ProjectPmis>): RiskRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as ProjectPmis
    const st = (m.status ?? {}) as Record<string, unknown>
    const prog = (m.progress ?? {}) as Record<string, unknown>
    const cust = (m.customer ?? {}) as Record<string, unknown>
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      orgL4: v(p.orgL4),
      projectLevel: v(st['项目级别']),
      manager: v(p.projectManager),
      industry: v(cust['行业']),
      top1000: v(p.top1000, '否'),
      quadrant: v(p.quadrant),
      projectStatus: v(st['项目状态']),
      stage: v(prog['项目阶段']),
      health: v((p.health as { overall?: string } | undefined)?.overall, '无数据'),
      riskMajorCats: openCats(m, '风险大类'),
      riskMinorCats: openCats(m, '风险小类'),
      riskLevel: projectRiskLevel(m),
      openRisks: openRiskCount(m),
      contractAmount: Number(cust['合同总额'] ?? 0),
    }
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts`
Expected: PASS（新用例 + 现有 buildRiskRows 用例全过）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/riskBoard.ts frontend/src/lib/riskBoard.test.ts
git commit -m "feat(fe): riskBoard RiskRow 加项目维度+风险大类/小类多值(仅未关闭)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 维度分类(12) + dimValues + groupRiskDims(多值) + riskPivot

**Files:**
- Modify: `frontend/src/lib/riskBoard.ts`（RiskDimDef/RISK_DIMENSIONS/RISK_DIM_BY_KEY/RiskGroup/dimValuesOf/groupRiskDims/groupRisk/riskPivot；import PivotResult 类型）
- Test: `frontend/src/lib/riskBoard.test.ts`

**Interfaces:**
- Consumes: `RiskRow`（Task 1）。
- Produces: `RISK_DIMENSIONS`(12,带 category/multi)；`RISK_DIM_BY_KEY`；`RiskGroup` 加 `values: string[]`；`groupRiskDims(rows, dimKeys[])`；`groupRisk(rows, dimKey)`(= groupRiskDims([dimKey]))；`riskPivot(rows, rowDims[], colDims[], metricKey): PivotResult<RiskGroup>`。

- [ ] **Step 1: 写失败测试**

`riskBoard.test.ts`，把现有契约面维度断言（`RISK_DIMENSIONS.map((d) => d.key)).toEqual([...7])`）改为 12 项，并追加多值/透视用例：

```typescript
    expect(RISK_DIMENSIONS.map((d) => d.key)).toEqual([
      'riskLevel', 'riskMajorCats', 'riskMinorCats',
      'orgL4', 'projectLevel', 'manager', 'industry', 'top1000', 'quadrant', 'projectStatus', 'stage', 'health',
    ])
```

新增 describe（文件已 import buildRiskRows 等；按需 import groupRiskDims/riskPivot）：

```typescript
import { groupRiskDims, riskPivot } from './riskBoard'

const MR = [
  { projectId: 'A', riskLevel: '高', openRisks: 2, contractAmount: 100, orgL4: '一组', riskMajorCats: ['客户侧风险', '成本超支风险'] },
  { projectId: 'B', riskLevel: '中', openRisks: 1, contractAmount: 200, orgL4: '一组', riskMajorCats: ['客户侧风险'] },
  { projectId: 'C', riskLevel: '无风险', openRisks: 0, contractAmount: 300, orgL4: '二组', riskMajorCats: ['无风险'] },
] as any

describe('多值炸开 groupRiskDims / riskPivot', () => {
  it('多值维 riskMajorCats 炸开:项目跨桶重复,∑>总数', () => {
    const gs = groupRiskDims(MR, ['riskMajorCats'])
    const m = Object.fromEntries(gs.map((g) => [g.key, g.projectCount]))
    expect(m['客户侧风险']).toBe(2)   // A,B
    expect(m['成本超支风险']).toBe(1) // A
    expect(m['无风险']).toBe(1)       // C
    expect(gs.reduce((s, g) => s + g.projectCount, 0)).toBe(4)  // >3 总数
  })
  it('单值维 orgL4 零回归:∑=总数', () => {
    const gs = groupRiskDims(MR, ['orgL4'])
    expect(gs.reduce((s, g) => s + g.projectCount, 0)).toBe(3)
  })
  it('riskPivot 行 orgL4 × 列 riskLevel,index 留桶供下钻', () => {
    const p = riskPivot(MR, ['orgL4'], ['riskLevel'], 'projectCount')
    expect(p.rows.map((r) => r.key)).toContain('一组')
    expect(p.index['一组']?.['高']?.rows.map((r: any) => r.projectId)).toEqual(['A'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts`
Expected: FAIL（维度断言 + `groupRiskDims`/`riskPivot` 不存在）

- [ ] **Step 3: 实现维度/分组/透视**

`riskBoard.ts` 顶部 import 加：

```typescript
import type { PivotResult, PivotRow, PivotCol } from './pivot'
```

替换 `RiskDimDef`/`RISK_DIMENSIONS`（:89-98）为：

```typescript
export interface RiskDimDef {
  key: 'riskLevel' | 'riskMajorCats' | 'riskMinorCats' | 'orgL4' | 'projectLevel' | 'manager' | 'industry' | 'top1000' | 'quadrant' | 'projectStatus' | 'stage' | 'health'
  label: string
  category: 'risk' | 'project'
  multi?: boolean
}
export const RISK_DIMENSIONS: RiskDimDef[] = [
  { key: 'riskLevel', label: '风险等级', category: 'risk' },
  { key: 'riskMajorCats', label: '风险大类', category: 'risk', multi: true },
  { key: 'riskMinorCats', label: '风险小类', category: 'risk', multi: true },
  { key: 'orgL4', label: 'L4组织', category: 'project' },
  { key: 'projectLevel', label: '项目级别', category: 'project' },
  { key: 'manager', label: '项目经理', category: 'project' },
  { key: 'industry', label: '行业', category: 'project' },
  { key: 'top1000', label: 'TOP1000', category: 'project' },
  { key: 'quadrant', label: '象限', category: 'project' },
  { key: 'projectStatus', label: '项目状态', category: 'project' },
  { key: 'stage', label: '项目阶段', category: 'project' },
  { key: 'health', label: '健康度', category: 'project' },
]
export const RISK_DIM_BY_KEY: Record<string, RiskDimDef> = Object.fromEntries(
  RISK_DIMENSIONS.map((d) => [d.key, d]),
)
```

`RiskGroup`（:109-116）加 `values`：

```typescript
export interface RiskGroup {
  key: string
  values: string[]
  rows: RiskRow[]
  projectCount: number
  hasRiskCount: number
  openRiskSum: number
  contractAmount: number
}
```

替换 `groupRisk`（:118-134）为 dimValues + groupRiskDims + groupRisk + riskPivot（删除原单值 groupRisk 体）：

```typescript
/** 取某行在某维的取值列表:multi 维返数组(buildRiskRows 已保证非空),单值维返 [值或'未指定'] */
function dimValuesOf(row: RiskRow, def: RiskDimDef): string[] {
  if (def.multi) {
    const arr = (row as unknown as Record<string, unknown>)[def.key] as string[] | undefined
    return arr && arr.length ? arr : ['未分类']
  }
  const raw = (row as unknown as Record<string, unknown>)[def.key]
  return [raw == null || String(raw).trim() === '' ? '未指定' : String(raw)]
}

function buildRiskGroup(key: string, values: string[], grows: RiskRow[]): RiskGroup {
  return {
    key, values, rows: grows,
    projectCount: grows.length,
    hasRiskCount: grows.filter((r) => r.riskLevel !== '无风险').length,
    openRiskSum: grows.reduce((s, r) => s + r.openRisks, 0),
    contractAmount: grows.reduce((s, r) => s + r.contractAmount, 0),
  }
}

/** 按 1..N 维分桶(桶 key=各维取值 ' / ' 连接);含 multi 维按笛卡尔积炸开(一行可计入多桶,组间重复计数);默认按项目数降序 */
export function groupRiskDims(rows: RiskRow[], dimKeys: string[]): RiskGroup[] {
  const defs = dimKeys.map((k) => RISK_DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, { values: string[]; rows: RiskRow[] }> = {}
  for (const r of rows) {
    let combos: string[][] = [[]]
    for (const d of defs) {
      const vals = dimValuesOf(r, d)
      combos = combos.flatMap((c) => vals.map((val) => [...c, val]))
    }
    for (const combo of combos) {
      const key = combo.join(' / ')
      ;(buckets[key] ||= { values: combo, rows: [] }).rows.push(r)
    }
  }
  return Object.entries(buckets)
    .map(([key, b]) => buildRiskGroup(key, b.values, b.rows))
    .sort((a, b) => b.projectCount - a.projectCount)
}

/** 单维分桶(风险统计分析用);多值维自动炸开 */
export function groupRisk(rows: RiskRow[], dimKey: RiskDimDef['key']): RiskGroup[] {
  return groupRiskDims(rows, [dimKey])
}

const mv = (g: RiskGroup, k: RiskMetricKey): number => (g[k] ?? 0) as number
/** 桶存在但指标 null→NaN(展示 '-');桶不存在为 0 */
const cellVal = (g: RiskGroup | undefined, k: RiskMetricKey): number => {
  if (!g) return 0
  const x = g[k]
  return x == null ? NaN : (x as number)
}

/** 多行多列透视(colDims 空退化单列合计),镜像 payBoardPivot */
export function riskPivot(
  rows: RiskRow[], rowDims: string[], colDims: string[], metricKey: RiskMetricKey,
): PivotResult<RiskGroup> {
  const rn = rowDims.length
  const full = groupRiskDims(rows, [...rowDims, ...colDims])
  const index: Record<string, Record<string, RiskGroup>> = {}
  const rowMap = new Map<string, string[]>()
  const colMap = new Map<string, string[]>()
  const rowTot: Record<string, number> = {}
  const colTot: Record<string, number> = {}
  for (const g of full) {
    const rowVals = g.values.slice(0, rn)
    const colVals = g.values.slice(rn)
    const rk = rowVals.join(' / ')
    const ck = colVals.join(' / ')
    rowMap.set(rk, rowVals)
    colMap.set(ck, colVals)
    ;(index[rk] ||= {})[ck] = g
    const val = mv(g, metricKey)
    rowTot[rk] = (rowTot[rk] || 0) + val
    colTot[ck] = (colTot[ck] || 0) + val
  }
  const rowKeys = [...rowMap.keys()].sort((a, b) => rowTot[b] - rowTot[a])
  const colKeys = [...colMap.keys()].sort((a, b) => colTot[b] - colTot[a])
  const prows: PivotRow[] = rowKeys.map((k) => ({ key: k, tuple: rowMap.get(k)! }))
  const pcols: PivotCol[] = colKeys.map((k) => ({ key: k, label: colDims.length ? k : '合计' }))
  const cells = prows.map((r) => pcols.map((c) => cellVal(index[r.key]?.[c.key], metricKey)))
  return {
    rowDimLabels: rowDims.map((d) => RISK_DIM_BY_KEY[d]?.label ?? d),
    colDimLabels: colDims.map((d) => RISK_DIM_BY_KEY[d]?.label ?? d),
    rows: prows, cols: pcols, cells, index,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts && cd frontend && npm run typecheck`
Expected: PASS（含旧 groupRisk('orgL4') 用例；typecheck 绿）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/riskBoard.ts frontend/src/lib/riskBoard.test.ts
git commit -m "feat(fe): riskBoard 12维分类+dimValues炸开+groupRiskDims+riskPivot" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: DimPicker 分组增强

**Files:**
- Modify: `frontend/src/components/DimPicker.vue`
- Test: `frontend/src/components/DimPicker.test.ts`

**Interfaces:**
- Produces: DimPicker `options` 项支持可选 `group?: string`；有 group 时按组渲染小标题，无 group 时平铺（向后兼容 /insight、/board）。

- [ ] **Step 1: 写失败测试**

`DimPicker.test.ts` 追加（文件已 mount DimPicker；按现有结构）：

```typescript
  it('options 含 group 时渲染分组小标题', () => {
    const w = mount(DimPicker, { props: { modelValue: [], options: [
      { value: 'a', label: 'A', group: '风险维度' },
      { value: 'b', label: 'B', group: '项目维度' },
    ] } })
    expect(w.text()).toContain('风险维度')
    expect(w.text()).toContain('项目维度')
    expect(w.findAll('.dp-chip').length).toBe(2)
  })
  it('无 group 时平铺(向后兼容)', () => {
    const w = mount(DimPicker, { props: { modelValue: [], options: [{ value: 'a', label: 'A' }] } })
    expect(w.findAll('.dp-group-label').length).toBe(0)
    expect(w.findAll('.dp-chip').length).toBe(1)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/DimPicker.test.ts`
Expected: FAIL（无分组渲染）

- [ ] **Step 3: 实现分组**

`frontend/src/components/DimPicker.vue` 完整替换为：

```vue
<script setup lang="ts">
import { computed } from 'vue'

export interface DimOption { value: string; label: string; group?: string }
const props = defineProps<{ modelValue: string[]; options: DimOption[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

function toggle(v: string) {
  const cur = props.modelValue
  const i = cur.indexOf(v)
  emit('update:modelValue', i >= 0 ? cur.filter((x) => x !== v) : [...cur, v])
}
function order(v: string): number {
  return props.modelValue.indexOf(v) + 1
}
const hasGroups = computed(() => props.options.some((o) => o.group))
const groups = computed(() => {
  const m = new Map<string, DimOption[]>()
  for (const o of props.options) (m.get(o.group ?? '') ?? m.set(o.group ?? '', []).get(o.group ?? '')!).push(o)
  return [...m.entries()].map(([name, opts]) => ({ name, opts }))
})
</script>

<template>
  <div class="dp">
    <template v-if="hasGroups">
      <div v-for="g in groups" :key="g.name" class="dp-group">
        <span class="dp-group-label">{{ g.name }}</span>
        <button v-for="o in g.opts" :key="o.value" type="button" class="dp-chip"
          :class="{ on: modelValue.includes(o.value) }" :data-test="`dim-${o.value}`" @click="toggle(o.value)">
          <span v-if="order(o.value)" class="dp-ord">{{ order(o.value) }}</span>{{ o.label }}
        </button>
      </div>
    </template>
    <template v-else>
      <button v-for="o in options" :key="o.value" type="button" class="dp-chip"
        :class="{ on: modelValue.includes(o.value) }" :data-test="`dim-${o.value}`" @click="toggle(o.value)">
        <span v-if="order(o.value)" class="dp-ord">{{ order(o.value) }}</span>{{ o.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.dp { display: inline-flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
.dp-group { display: inline-flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
.dp-group-label { font-size: var(--fs-1); color: var(--mut); margin-right: var(--sp-1); }
.dp-chip { display: inline-flex; align-items: center; gap: var(--sp-1); border: 1px solid var(--line); background: var(--card); color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: var(--sp-1) var(--sp-3); border-radius: var(--r-md); }
.dp-chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 600; }
.dp-ord { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: var(--r-full); background: var(--accent); color: var(--on-accent); font-size: var(--fs-1); font-weight: 700; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/DimPicker.test.ts src/views/InsightView.test.ts src/views/BoardView.test.ts`
Expected: PASS（新分组用例 + 现有 /insight、/board 平铺用例零回归）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DimPicker.vue frontend/src/components/DimPicker.test.ts
git commit -m "feat(fe): DimPicker 支持可选 group 分组小标题(向后兼容平铺)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: RiskDrillModal 下钻弹窗

**Files:**
- Create: `frontend/src/components/RiskDrillModal.vue`
- Test: `frontend/src/components/RiskDrillModal.test.ts`

**Interfaces:**
- Consumes: `RiskRow`（Task 1）。
- Produces: `RiskDrillModal` props `{ modelValue:boolean, title:string, rows: RiskRow[] }`，emit `update:modelValue`；点行 `router.push('/project/'+id)` 并关闭。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/components/RiskDrillModal.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import RiskDrillModal from './RiskDrillModal.vue'

let router: Router
beforeEach(() => {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/project/:id', component: { template: '<div/>' } },
  ] })
})

const rows = [{ projectId: 'P1', projectName: '甲', orgL4: '组', riskLevel: '高', openRisks: 2, contractAmount: 2000000 }] as any

describe('RiskDrillModal', () => {
  it('标题含项目数、渲染行', async () => {
    const w = mount(RiskDrillModal, { props: { modelValue: true, title: 'L4组织=组 / 风险等级=高', rows },
      global: { plugins: [ElementPlus, router], stubs: { Modal: { template: '<div><slot/></div>' } } } })
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('高')
  })
  it('点行跳详情并关闭', async () => {
    await router.push('/'); await router.isReady()
    const push = vi.spyOn(router, 'push')
    const w = mount(RiskDrillModal, { props: { modelValue: true, title: 't', rows },
      global: { plugins: [ElementPlus, router], stubs: { Modal: { template: '<div><slot/></div>' } } } })
    await w.find('.el-table__row').trigger('click')
    expect(push).toHaveBeenCalledWith('/project/P1')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/RiskDrillModal.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 RiskDrillModal.vue**

新建 `frontend/src/components/RiskDrillModal.vue`（参照 InsightDrillModal）：

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { RiskRow } from '@/lib/riskBoard'
import { fmtWan } from '@/lib/format'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'

const props = defineProps<{ modelValue: boolean; title: string; rows: RiskRow[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const router = useRouter()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 190 },
  { key: 'projectName', label: '项目名称' },
  { key: 'orgL4', label: 'L4组织', width: 110 },
  { key: 'riskLevel', label: '风险等级', width: 90 },
  { key: 'openRisks', label: '未关闭数', width: 90, num: true },
  { key: 'contractAmount', label: '合同总额(万)', width: 110, num: true, formatter: (v) => fmtWan(v as number) },
]

function onRow(row: Record<string, any>) {
  emit('update:modelValue', false)
  router.push(`/project/${row.projectId}`)
}
</script>

<template>
  <Modal :model-value="props.modelValue" :title="`${props.title}（${props.rows.length} 个项目）`"
    @update:model-value="emit('update:modelValue', $event)">
    <DataTable :columns="COLS" :rows="props.rows" :show-count="false" clickable @row-click="onRow" />
  </Modal>
</template>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/RiskDrillModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RiskDrillModal.vue frontend/src/components/RiskDrillModal.test.ts
git commit -m "feat(fe): RiskDrillModal 风险下钻弹窗(列出桶项目跳详情)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 风险统计分析 — 风险等级筛选 + 维度扩展 + 图/表下钻

**Files:**
- Modify: `frontend/src/views/RiskBoardView.vue`
- Test: `frontend/src/views/RiskBoardView.test.ts`

**Interfaces:**
- Consumes: `groupRisk`/`RISK_DIMENSIONS`（Task 2）、`RiskDrillModal`（Task 4）、`ChartBox`(@datapoint-click)。

- [ ] **Step 1: 写失败测试**

`RiskBoardView.test.ts` 追加（按现有 seed/mount 结构；fixture 需含项目使风险等级多样）：

```typescript
  it('风险等级筛选去勾"无风险"只影响风险统计分析,不影响卡片', async () => {
    const w = await mountView()   // 现有挂载helper
    const before = w.find('.rv-card-main').text()
    // 去勾无风险(data-test=lvl-无风险 的 chip)
    const chip = w.find('[data-test="lvl-无风险"]')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    // 卡片(顶部第一个 .rv-card-main)不变
    expect(w.find('.rv-card-main').text()).toBe(before)
  })
  it('点风险统计分析表行打开下钻弹窗', async () => {
    const w = await mountView()
    await w.find('.rv-rank-table .el-table__row').trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })
```

> 注:具体选择器/挂载 helper 以 RiskBoardView.test.ts 现状为准;若现无 mountView helper 则照其现有 mount 方式写。fixture 须含一个 riskLevel='无风险' 项目使 chip 存在。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/RiskBoardView.test.ts`
Expected: FAIL（无 lvl 筛选 / drill）

- [ ] **Step 3: 实现风险统计分析改造**

`RiskBoardView.vue` script：
- import 加 `RiskDrillModal`：`import RiskDrillModal from '@/components/RiskDrillModal.vue'`；`type RiskRow` 加入 riskBoard import。
- 维度选项扩到全部 12 维：`DIM_OPTS` 已是 `RISK_DIMENSIONS.map(...)`，自动含 12 维（无需改）。
- 加风险等级筛选与下钻状态、statRows：

```typescript
const LEVELS = ['高', '中', '低', '无风险'] as const
const levelFilter = ref<string[]>([...LEVELS])
function toggleLevel(l: string) {
  levelFilter.value = levelFilter.value.includes(l) ? levelFilter.value.filter((x) => x !== l) : [...levelFilter.value, l]
}
const statRows = computed(() => rows.value.filter((r) => levelFilter.value.includes(r.riskLevel)))

// 下钻
const drillOpen = ref(false)
const drillTitle = ref('')
const drillRows = ref<RiskRow[]>([])
function openDrill(title: string, rs: RiskRow[]) { drillTitle.value = title; drillRows.value = rs; drillOpen.value = true }
```

- `groups` 改用 statRows：`const gs = groupRisk(statRows.value, dimKey.value)`。
- chart 下钻：在 `<ChartBox>` 加 `@datapoint-click`：从 `e.name` 找桶 → openDrill。
- table 下钻：`<DataTable :columns="RANK_COLS" :rows="groups" class="rv-rank-table" clickable @row-click="onRankRow" />`，`onRankRow(g) => openDrill(`${rankDimLabel}=${g.key}`, g.rows)`。

template 工具栏加风险等级筛选 chips（在维度/统计/图表类型前）：

```html
        <span class="rv-label">风险等级</span>
        <span class="rv-levelfilter">
          <button v-for="l in LEVELS" :key="l" type="button" class="rv-lvl-chip" :class="{ on: levelFilter.includes(l) }"
            :data-test="`lvl-${l}`" @click="toggleLevel(l)">{{ l }}</button>
        </span>
```

ChartBox + table 改：

```html
      <div class="rv-charts-row">
        <div v-for="(opt, idx) in rankingChartOptions" :key="chartTypes[idx]" class="rv-chart-item">
          <ChartBox :option="opt" height="300px" @datapoint-click="(e: any) => onChartDrill(e?.name)" />
        </div>
      </div>
      <DataTable :columns="RANK_COLS" :rows="groups" class="rv-rank-table" clickable @row-click="onRankRow" />
```

script 配套：

```typescript
const rankDimLabel = computed(() => RISK_DIMENSIONS.find((d) => d.key === dimKey.value)?.label ?? '维度')
function onRankRow(row: Record<string, any>) { openDrill(`${rankDimLabel.value}=${row.key}`, row.rows) }
function onChartDrill(name?: string) {
  const g = groups.value.find((x) => x.key === name)
  if (g) openDrill(`${rankDimLabel.value}=${g.key}`, g.rows)
}
```

template 末尾(`</template>` 的 `</div>` 前)加弹窗：

```html
      <RiskDrillModal v-model="drillOpen" :title="drillTitle" :rows="drillRows" />
```

样式加：

```css
.rv-levelfilter { display: inline-flex; gap: var(--sp-2); }
.rv-lvl-chip { border: 1px solid var(--line); background: var(--card); color: var(--sub); cursor: pointer;
  font-size: var(--fs-1); padding: var(--sp-1) var(--sp-3); border-radius: var(--r-md); }
.rv-lvl-chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 600; }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/RiskBoardView.test.ts && cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/RiskBoardView.vue frontend/src/views/RiskBoardView.test.ts
git commit -m "feat(fe): 风险统计分析 加风险等级筛选(仅本块)+12维+图/表下钻" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 风险概览 — 升级为行列自选透视 + 下钻（移除旧 riskOverview）

**Files:**
- Modify: `frontend/src/views/RiskBoardView.vue`、`frontend/src/lib/riskBoard.ts`（删 riskOverview/RiskOverviewRow 死码）
- Test: `frontend/src/views/RiskBoardView.test.ts`、`frontend/src/lib/riskBoard.test.ts`（删 riskOverview 测试）

**Interfaces:**
- Consumes: `riskPivot`/`RISK_METRICS`/`RISK_DIMENSIONS`（Task 2）、`DimPicker`(group)（Task 3）、`PivotTable`、`RiskDrillModal`。

- [ ] **Step 1: 写失败测试**

`RiskBoardView.test.ts` 追加：

```typescript
  it('风险概览为透视:DimPicker 选行列维 + PivotTable 渲染', async () => {
    const w = await mountView()
    expect(w.find('.pv').exists()).toBe(true)       // PivotTable 表
    expect(w.findAll('[data-test^="dim-"]').length).toBeGreaterThan(0)  // DimPicker chips
  })
  it('点透视格打开下钻弹窗', async () => {
    const w = await mountView()
    const cell = w.find('.pv .pv-click')
    if (cell.exists()) { await cell.trigger('click'); expect((w.vm as any).drillOpen).toBe(true) }
  })
```

`riskBoard.test.ts`：**删除** `describe('风险契约面/聚合')` 中 riskOverview 相关用例（`riskOverview 四类计数...`）及顶部 `riskOverview` 的 import。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/RiskBoardView.test.ts`
Expected: FAIL（无 .pv 透视表）

- [ ] **Step 3: 实现风险概览透视 + 删死码**

`riskBoard.ts`：删除 `RiskOverviewRow`（:136-144）与 `riskOverview`（:146-160）整段（已无消费方）。

`RiskBoardView.vue` script：
- import 改：`buildRiskRows, riskSummary, groupRisk, riskPivot, RISK_DIMENSIONS, RISK_METRICS, RISK_DIM_BY_KEY, type RiskMetricKey, type RiskDimDef, type RiskRow`（去 `riskOverview`）。加 `import DimPicker from '@/components/DimPicker.vue'`、`import PivotTable from '@/components/PivotTable.vue'`。
- 删旧 `OVERVIEW_DIM_OPTS`/`overviewDim`/`overviewRows`/`OVERVIEW_COLS`（:75-86）。
- 加透视状态：

```typescript
// ---- 风险概览(透视) ----
const PIVOT_DIM_OPTS = RISK_DIMENSIONS.map((d) => ({ value: d.key, label: d.label, group: d.category === 'risk' ? '风险维度' : '项目维度' }))
const OVERVIEW_METRIC_OPTS = RISK_METRICS.map((m) => ({ value: m.key, label: m.label }))
const rowDims = ref<string[]>(['orgL4'])
const colDims = ref<string[]>(['riskLevel'])
const ovMetric = ref<RiskMetricKey>('projectCount')
const ovMetricDef = computed(() => RISK_METRICS.find((m) => m.key === ovMetric.value)!)
const pivot = computed(() => riskPivot(rows.value, rowDims.value, colDims.value, ovMetric.value))
function fmtPivot(v: number): string {
  if (Number.isNaN(v)) return '-'
  return ovMetricDef.value.kind === 'money' ? fmtWan(v) : String(v)
}
function onPivotCell(p: { rowKey: string; colKey: string }) {
  const g = pivot.value.index[p.rowKey]?.[p.colKey]
  if (g) openDrill(`${p.rowKey}${p.colKey ? ' / ' + p.colKey : ''}`, g.rows)
}
```

template 风险概览块（替换原单维表）：

```html
      <h3 class="rv-h3">风险概览</h3>
      <div class="rv-toolbar">
        <span class="rv-label">行维度</span><DimPicker v-model="rowDims" :options="PIVOT_DIM_OPTS" />
        <span class="rv-label">列维度</span><DimPicker v-model="colDims" :options="PIVOT_DIM_OPTS" />
        <span class="rv-label">指标</span><SegToggle v-model="ovMetric" :options="OVERVIEW_METRIC_OPTS" />
      </div>
      <PivotTable :pivot="pivot" :format="fmtPivot" @cell-click="onPivotCell" />
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/RiskBoardView.test.ts src/lib/riskBoard.test.ts && cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/RiskBoardView.vue frontend/src/views/RiskBoardView.test.ts frontend/src/lib/riskBoard.ts frontend/src/lib/riskBoard.test.ts
git commit -m "feat(fe): 风险概览升级为行列自选透视(风险/项目两类维)+格下钻,删旧 riskOverview" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 版本 V1.20.1 + PROGRESS.md + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 改版本**

`frontend/src/version.ts`：

```typescript
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.20.1'
export const RELEASE_DATE = '2026-06-24'
```

- [ ] **Step 2: 更新 PROGRESS.md**

头部当前/上一版本滚动 + 版本史追加（照既有格式）：

```markdown
- V1.20.1（2026-06-24）/insight/risk 透视+下钻+筛选（feat/insight-risk-pivot-drill，SDD + verify 全绿）
  - 风险统计分析加风险等级筛选(高/中/低/无风险多选,仅本块);维度扩 12(风险等级/大类/小类[多值,仅未关闭] + 9 项目维度);风险概览升级为行列自选透视(DimPicker 风险/项目两类分组 + RISK_METRICS 指标 + PivotTable,删旧 riskOverview);全页点图柱/透视格/表行→RiskDrillModal 列出该桶项目跳详情。风险大类/小类多值按未关闭记录炸开(项目跨桶重复计)。
```

- [ ] **Step 3: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V1.20.1 /insight/risk 透视+下钻+筛选" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage：**
- §2 RiskRow 扩展(项目维度+风险大类/小类多值,仅未关闭) → T1 ✅
- §3 12 维分类 + dimValues 炸开 + groupRiskDims → T2 ✅
- §4 riskPivot → T2 ✅
- §5.1 风险统计分析(风险等级筛选仅本块 + 12维 + 图/表下钻) → T5 ✅
- §5.2 风险概览升级透视(DimPicker 分组 + 指标 + PivotTable + 格下钻) → T3(DimPicker)+T6 ✅
- §5.3 RiskDrillModal → T4 ✅
- §6 边界(多值跨桶/无风险桶/未分类/空筛选/NaN) → T1/T2 测试覆盖 ✅
- §7 测试 → 各任务 TDD + T7 verify ✅
- §8 版本 V1.20.1 → T7 ✅

**2. Placeholder scan：** 无 TBD/TODO；每步含完整代码（T5 选择器以现状为准的注记是给实现者的真实指引,非占位）。✅

**3. Type consistency：**
- RiskRow 新字段(projectStatus/stage/health/riskMajorCats/riskMinorCats) T1 定义、T2 dimValues/groupRiskDims 消费、T4 RiskDrillModal 读 riskLevel/openRisks/contractAmount/orgL4/projectName/projectId 一致。✅
- RiskDimDef key 联合类型 12 项、category/multi；RISK_DIM_BY_KEY；RiskGroup.values；riskPivot 签名 → T2 定义、T5/T6 消费一致。✅
- DimPicker DimOption.group 可选 → T3 定义、T6 PIVOT_DIM_OPTS 用 group 一致。✅
- riskOverview 删除点(T6)在其唯一消费方(RiskBoardView 概览)同任务替换,无悬空。✅
- groupRisk(rows,dimKey) 保持单维签名(=groupRiskDims([dimKey])),现有 riskBoard.test 的 groupRisk('orgL4') 零回归。✅
