# P8 数据治理页重设计 + 工具组收尾 + 打包专项核验 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 治理页 `/governance` 按「同步后健康检查」三层结构整页重写（结论横幅/五源卡/折叠告警区，含 §3.6 双向告警 UI）；关于页双域刷新；数据管理页文案对齐；L-21 存活页令牌化扫尾（含 BoardView 状态色入 echarts 桥）；打包专项核验（修复 write_followup.py 缺失）。版本 **V7.6.0**。

**Architecture:** 零后端改动。`lib/governance.ts` 重写为纯函数 `buildHealthReport(AnalysisData) → HealthReport`，View 是薄渲染层；状态色 canvas 侧走 echartsTheme.ts hex 镜像 + 契约测试（既有 CHART_* 模式）。Spec：`docs/superpowers/specs/2026-06-12-P8-governance-tools-design.md`。

**Tech Stack:** Vue3+TS+Vitest（前端）；PyInstaller（打包核验）。分支 `feat/phase-p8-governance`（已建，含 spec 提交）。

## 实施前已核实的事实

- `projectsQuality` 明细形状：`staffNoProject=[{name}]`、`managerNotInOrg=[{projectId,projectName,manager}]`、`presaleUnmapped=[{projectId,projectName}]`；`InputFileStat={provided,rows,matched,matchRate}`。
- `dataQuality`：`summary={pmisProvided,joinRate,matchedActive,matchedClosed,unmatched,lastPmisUpdate}`；`themes=[{theme,coveragePct,verdict('green'|'yellow'|'red')}]`；`unmatched=[{projectId,projectName,kind}]`；`backfill=[{projectId,projectName,missingFields[]}]`；`conflicts=[{column,issue,recommendation}]`；`dirty=[{type,projectId,field,value}]`。
- `meta={lastUpdate,totalProjects,totalPaymentNodes}`。
- DataTable props：`columns:{key,label,width?,sortable?,formatter?}[]`、`rows`、`showCount?`、插槽 `cell-<key>`。`exportRows(filename, rows)` 空数组不动作。
- theme.css 状态色：light `--ok #4e9a7c/--warn #e0a23b/--danger #d24d5c`，dark `#5ba88a/#e6b056/#e0697a`；**未定义** `--red/--orange/--green`（nav.ts 里是 var 回退）。
- ChartBox 按 `useSettingsStore().theme` 选 ENT_THEME/ENT_THEME_DARK；echartsTheme.ts 持有 CHART_*/STRUCT_* hex 镜像，`echartsTheme.tokens.test.ts` 契约测试同步。
- `.spec` datas **缺 `write_followup.py`**，而 server.py:230 frozen 分支 `_run_script_direct(write_script, 'write_followup', ...)` 需要它 → 打包版跟进回写必坏，T5 修复。
- **spec §6 两处修正**（usage 核实后）：① nav.ts 3 处 hex 是档位分类色回退（`var(--red, #ef4444)` 等，令牌未定义），属回款域语义 → 移交回款全量重设计，不在本期清理；② ColumnFilter 仅被 LedgerTable/PlanBoard（回款专属）引用 → 移出清理清单。记入 PROGRESS。

## 分级调度（用户指令：设计=Fable 5 主循环；实现/审查按难度分级，产出必经 git/测试核实）

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | lib/governance.ts buildHealthReport + 测试（TDD） | 高（口径核心） | opus | 主循环以真实数据核验 |
| T2 | DataQualityView 整页重写 + 测试 | 高（页面架构） | opus | 主循环测试+渲染核验 |
| T3 | AboutView 双域刷新 + DataView 文案对齐 + 测试 | 中 | sonnet | 主循环核实 |
| T4 | L-21 存活页令牌化扫尾 + BoardView 状态色入桥 + 契约测试 | 中（机械量大易错漏） | sonnet | 主循环 grep 复扫+目检 |
| T5 | 打包专项：.spec 修正 + frozen 走查 + 构建冒烟 | 高（frozen 易踩坑） | 主循环亲自 | opus 复核走查结论 |
| T6 | 版本 V7.6.0 + PROGRESS + verify.sh + 整体终审 | 低 | 主循环 | opus 终审 |

---

### Task 1: lib/governance.ts 健康检查视图模型（TDD）

**Files:**
- Rewrite: `frontend/src/lib/governance.ts`（现 11 行，coverageColor/verdictLabel 整体废弃，唯一消费方 DataQualityView 在 T2 重写）
- Rewrite: `frontend/src/lib/governance.test.ts`（现有内容整体替换）

- [ ] **Step 1: 整文件替换 governance.test.ts 为失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { buildHealthReport } from './governance'
import type { AnalysisData } from '@/types/analysis'

function makeData(over: Record<string, any> = {}): AnalysisData {
  return {
    meta: { lastUpdate: '2026-06-12 09:00', totalProjects: 10, totalPaymentNodes: 50 },
    dashboard: {}, summary: {}, projectOverview: {},
    rawNodes: [{ projectId: 'P-1', tier: '100万以上', isPaymentRelated: true }],
    dataQuality: {
      summary: { pmisProvided: true, joinRate: 0.95, matchedActive: 8, matchedClosed: 2, unmatched: 0, lastPmisUpdate: '2026-06-11' },
      themes: [
        { theme: '成本', coveragePct: 0.9, verdict: 'green' },
        { theme: '进度', coveragePct: 0.8, verdict: 'green' },
      ],
      unmatched: [], backfill: [], conflicts: [], dirty: [],
    },
    projectsQuality: {
      deptProjectCount: 9,
      orgFile: { provided: true, rows: 30, matched: 25, matchRate: 0.83 },
      mappingFile: { provided: true, rows: 5, matched: 5, matchRate: 1 },
      deliveryFile: { provided: true, rows: 40, matched: 38, matchRate: 0.95 },
      staffNoProject: [], managerNotInOrg: [], presaleTotal: 3, presaleMapped: 3, presaleUnmapped: [],
    },
    ...over,
  } as any
}

describe('buildHealthReport', () => {
  it('全源就绪零告警 → 绿', () => {
    const r = buildHealthReport(makeData())
    expect(r.verdict).toBe('green')
    expect(r.title).toBe('数据就绪')
    expect(r.sources).toHaveLength(5)
    expect(r.sources.every((s) => s.provided)).toBe(true)
    expect(r.alerts.every((a) => a.count === 0)).toBe(true)
    expect(r.metaLine).toContain('2026-06-12 09:00')
  })

  it('仅低优先告警不阻塞绿,副文案附注条数', () => {
    const d = makeData()
    ;(d.dataQuality as any).dirty = [{ type: '金额', projectId: 'P-1', field: 'x', value: 'y' }]
    const r = buildHealthReport(d)
    expect(r.verdict).toBe('green')
    expect(r.sub).toBe('1 条低优先提示')
  })

  it('高/中告警 → 黄,标题计类数,backfill 缺失字段 join', () => {
    const d = makeData()
    ;(d.dataQuality as any).unmatched = [{ projectId: 'X-1', projectName: '甲', kind: '在建' }]
    ;(d.dataQuality as any).backfill = [{ projectId: 'P-2', projectName: '乙', missingFields: ['评级', '行业'] }]
    const r = buildHealthReport(d)
    expect(r.verdict).toBe('yellow')
    expect(r.title).toBe('2 类告警需关注')
    expect(r.alerts.find((a) => a.key === 'backfill')!.rows[0].missingFields).toBe('评级、行业')
  })

  it('云文档缺失 → 红(优先级最高)', () => {
    const r = buildHealthReport(makeData({ rawNodes: [] }))
    expect(r.verdict).toBe('red')
    expect(r.title).toContain('数据不可用')
    expect(r.sources.find((s) => s.key === 'yundocs')!.provided).toBe(false)
  })

  it('辅源缺失 → 卡未提供 + 高严重度缺失告警(note 降级说明) + 黄', () => {
    const d = makeData()
    ;(d.projectsQuality as any).orgFile = { provided: false, rows: 0, matched: 0, matchRate: 0 }
    const r = buildHealthReport(d)
    expect(r.verdict).toBe('yellow')
    const card = r.sources.find((s) => s.key === 'org')!
    expect(card.provided).toBe(false)
    expect(card.subs).toEqual(['未提供'])
    const miss = r.alerts.find((a) => a.key === 'missing-org')!
    expect(miss.severity).toBe('high')
    expect(miss.columns).toEqual([])
    expect(miss.note).toContain('组织架构')
  })

  it('dataQuality 整体缺失 → PMIS 卡未提供且不崩', () => {
    const r = buildHealthReport(makeData({ dataQuality: null }))
    expect(r.sources.find((s) => s.key === 'pmis')!.provided).toBe(false)
    expect(r.alerts.find((a) => a.key === 'missing-pmis')).toBeTruthy()
    expect(r.verdict).toBe('yellow')
  })

  it('projectsQuality 整体缺失 → 三卡未提供+三条缺失告警', () => {
    const r = buildHealthReport(makeData({ projectsQuality: null }))
    expect(r.sources.filter((s) => !s.provided).map((s) => s.key)).toEqual(['org', 'mapping', 'delivery'])
    expect(r.alerts.filter((a) => a.key.startsWith('missing-'))).toHaveLength(3)
  })

  it('排序:0条沉底,非零按严重度高→低再条数降序', () => {
    const d = makeData()
    ;(d.dataQuality as any).unmatched = [{ projectId: 'a' }]
    ;(d.projectsQuality as any).managerNotInOrg = [{ projectId: 'b' }, { projectId: 'c' }]
    ;(d.dataQuality as any).dirty = [{ type: 't', projectId: 'p', field: 'f', value: 'v' }]
    const r = buildHealthReport(d)
    expect(r.alerts.filter((a) => a.count > 0).map((a) => a.key)).toEqual(['managerNotInOrg', 'unmatched', 'dirty'])
    expect(r.alerts[r.alerts.length - 1].count).toBe(0)
  })

  it('主题覆盖不足进中级告警,PMIS 卡辅信息含主题可用比', () => {
    const d = makeData()
    ;(d.dataQuality as any).themes = [
      { theme: '成本', coveragePct: 0.9, verdict: 'green' },
      { theme: '风险', coveragePct: 0.2, verdict: 'red' },
    ]
    const r = buildHealthReport(d)
    const t = r.alerts.find((a) => a.key === 'themesLow')!
    expect(t.count).toBe(1)
    expect(t.rows[0]).toEqual({ theme: '风险', coverage: '20%', verdict: '不足' })
    expect(r.sources.find((s) => s.key === 'pmis')!.subs[0]).toContain('主题 1/2 可用')
  })

  it('导出文件名只挂在指定四类目', () => {
    const r = buildHealthReport(makeData())
    expect(r.alerts.filter((a) => a.exportName).map((a) => a.key).sort())
      .toEqual(['backfill', 'managerNotInOrg', 'presaleUnmapped', 'unmatched'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/governance.test.ts`
Expected: FAIL（buildHealthReport 不存在）

- [ ] **Step 3: 整文件替换 governance.ts**

```ts
import type { AnalysisData } from '@/types/analysis'

// 数据治理「健康检查」视图模型(P8 spec §2):纯函数聚合 meta+dataQuality+projectsQuality,零后端依赖。
export type Verdict = 'red' | 'yellow' | 'green'
export type Severity = 'high' | 'mid' | 'low'

export interface SourceCard {
  key: 'yundocs' | 'pmis' | 'org' | 'mapping' | 'delivery'
  label: string
  provided: boolean
  main: string
  mainLabel: string
  subs: string[] // ≤2 行辅信息(规范 1主2辅)
}

export interface AlertGroup {
  key: string
  label: string
  severity: Severity
  count: number
  columns: { key: string; label: string }[] // 空=无明细表(缺失类用 note)
  rows: Record<string, unknown>[]
  note?: string
  exportName?: string
}

export interface HealthReport {
  verdict: Verdict
  title: string
  sub: string
  metaLine: string
  sources: SourceCard[]
  alerts: AlertGroup[] // 已排序:0条沉底;其余严重度高→低,同级条数降序
}

const pct = (n: unknown) => `${Math.round((Number(n) || 0) * 100)}%`
const VERDICT_TXT: Record<string, string> = { green: '可用', yellow: '部分', red: '不足' }
const SEV_RANK: Record<Severity, number> = { high: 0, mid: 1, low: 2 }

// 源缺失降级说明(母 spec §3.4)
const MISSING: Record<string, { label: string; note: string }> = {
  pmis: { label: '数据源缺失:PMIS', note: '项目域五页整体空态。请在数据管理页在线下载或离线上传 PMIS 七表后点「更新数据」。' },
  org: { label: '数据源缺失:组织架构', note: '项目主域退化为 PMIS 在建全量。请提供 input/组织架构.xlsx 后点「更新数据」。' },
  mapping: { label: '数据源缺失:售前映射', note: '售前服务项目不整合历史,标记「待映射」。请提供 input/A.xlsx 后点「更新数据」。' },
  delivery: { label: '数据源缺失:预算核算明细', note: '项目预算核算明细显示「未提供」。请提供 input/delivery_analysis.xlsx 后点「更新数据」。' },
}

export function buildHealthReport(data: AnalysisData): HealthReport {
  const meta = data.meta ?? ({} as AnalysisData['meta'])
  const dq = data.dataQuality ?? null
  const pq = data.projectsQuality ?? null
  const yundocsOk = (data.rawNodes?.length ?? 0) > 0

  const themes = (dq?.themes ?? []) as { theme?: string; coveragePct?: number; verdict?: string }[]
  const themesOk = themes.filter((t) => t.verdict === 'green').length
  const s = dq?.summary
  const pmisOk = !!s?.pmisProvided
  const orgF = pq?.orgFile
  const mapF = pq?.mappingFile
  const delF = pq?.deliveryFile

  const sources: SourceCard[] = [
    { key: 'yundocs', label: '云文档', provided: yundocsOk,
      main: yundocsOk ? String(meta.totalPaymentNodes ?? 0) : '-', mainLabel: '节点行数',
      subs: yundocsOk ? [`项目 ${meta.totalProjects ?? 0}`, `更新 ${meta.lastUpdate || '-'}`] : ['未提供'] },
    { key: 'pmis', label: 'PMIS 七表', provided: pmisOk,
      main: pmisOk ? pct(s?.joinRate) : '-', mainLabel: '匹配率',
      subs: pmisOk
        ? [`在建 ${s?.matchedActive ?? 0} · 已关闭 ${s?.matchedClosed ?? 0} · 主题 ${themesOk}/${themes.length} 可用`, `更新 ${s?.lastPmisUpdate || '-'}`]
        : ['未提供'] },
    { key: 'org', label: '组织架构', provided: !!orgF?.provided,
      main: orgF?.provided ? String(pq?.deptProjectCount ?? 0) : '-', mainLabel: '主域项目',
      subs: orgF?.provided ? [`人员 ${orgF.rows ?? 0} 行 · 匹配 ${orgF.matched ?? 0}`] : ['未提供'] },
    { key: 'mapping', label: '售前映射', provided: !!mapF?.provided,
      main: mapF?.provided ? `${pq?.presaleMapped ?? 0}/${pq?.presaleTotal ?? 0}` : '-', mainLabel: '售前已映射',
      subs: mapF?.provided ? [`映射 ${mapF.rows ?? 0} 行`] : ['未提供'] },
    { key: 'delivery', label: '预算核算(delivery)', provided: !!delF?.provided,
      main: delF?.provided ? pct(delF.matchRate) : '-', mainLabel: '匹配率',
      subs: delF?.provided ? [`${delF.rows ?? 0} 行 · 匹配 ${delF.matched ?? 0}`] : ['未提供'] },
  ]

  const alerts: AlertGroup[] = []
  const missPairs: [string, boolean][] = [['pmis', pmisOk], ['org', !!orgF?.provided], ['mapping', !!mapF?.provided], ['delivery', !!delF?.provided]]
  for (const [k, ok] of missPairs) {
    if (!ok) alerts.push({ key: `missing-${k}`, label: MISSING[k].label, severity: 'high', count: 1, columns: [], rows: [], note: MISSING[k].note })
  }
  const unmatched = (dq?.unmatched ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'unmatched', label: 'PMIS 未匹配', severity: 'high', count: unmatched.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }, { key: 'kind', label: '类型' }],
    rows: unmatched, exportName: 'PMIS未匹配清单.xlsx' })
  const mno = (pq?.managerNotInOrg ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'managerNotInOrg', label: '负责人不在人员清单', severity: 'high', count: mno.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }, { key: 'manager', label: '负责人' }],
    rows: mno, exportName: '负责人告警.xlsx' })
  const backfill = ((dq?.backfill ?? []) as Record<string, unknown>[]).map((b) => ({
    ...b, missingFields: Array.isArray(b.missingFields) ? (b.missingFields as string[]).join('、') : b.missingFields,
  }))
  alerts.push({ key: 'backfill', label: '回填待办', severity: 'mid', count: backfill.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }, { key: 'missingFields', label: '缺失字段' }],
    rows: backfill, exportName: 'PMIS回填待办.xlsx' })
  const pum = (pq?.presaleUnmapped ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'presaleUnmapped', label: '售前未映射', severity: 'mid', count: pum.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }],
    rows: pum, exportName: '售前未映射.xlsx' })
  const conflicts = (dq?.conflicts ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'conflicts', label: '口径冲突', severity: 'mid', count: conflicts.length,
    columns: [{ key: 'column', label: '列' }, { key: 'issue', label: '问题' }, { key: 'recommendation', label: '建议' }], rows: conflicts })
  const lowThemes = themes.filter((t) => t.verdict !== 'green')
    .map((t) => ({ theme: t.theme, coverage: pct(t.coveragePct), verdict: VERDICT_TXT[t.verdict ?? ''] ?? t.verdict }))
  alerts.push({ key: 'themesLow', label: '主题覆盖不足', severity: 'mid', count: pmisOk ? lowThemes.length : 0,
    columns: [{ key: 'theme', label: '主题' }, { key: 'coverage', label: '覆盖率' }, { key: 'verdict', label: '判定' }],
    rows: pmisOk ? lowThemes : [] })
  const snp = (pq?.staffNoProject ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'staffNoProject', label: '人员清单无项目', severity: 'low', count: snp.length,
    columns: [{ key: 'name', label: '姓名' }], rows: snp })
  const dirty = (dq?.dirty ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'dirty', label: '脏值', severity: 'low', count: dirty.length,
    columns: [{ key: 'type', label: '类型' }, { key: 'projectId', label: '项目编号' }, { key: 'field', label: '字段' }, { key: 'value', label: '值' }],
    rows: dirty })

  alerts.sort((a, b) =>
    (a.count === 0 ? 1 : 0) - (b.count === 0 ? 1 : 0) || SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.count - a.count)

  const actionable = alerts.filter((a) => a.count > 0 && a.severity !== 'low')
  const lowCount = alerts.filter((a) => a.severity === 'low').reduce((n, a) => n + a.count, 0)
  let verdict: Verdict
  let title: string
  let sub = ''
  if (!yundocsOk) { verdict = 'red'; title = '数据不可用:云文档主数据缺失'; sub = '请在数据管理页同步或导入回款数据' }
  else if (actionable.length) { verdict = 'yellow'; title = `${actionable.length} 类告警需关注`; sub = lowCount ? `另有 ${lowCount} 条低优先提示` : '' }
  else { verdict = 'green'; title = '数据就绪'; sub = lowCount ? `${lowCount} 条低优先提示` : '' }
  const metaLine = `同步于 ${meta.lastUpdate || '-'} · 项目 ${meta.totalProjects ?? 0} · 节点 ${meta.totalPaymentNodes ?? 0}`
  return { verdict, title, sub, metaLine, sources, alerts }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/governance.test.ts`
Expected: PASS 10 项

- [ ] **Step 5: 确认 coverageColor/verdictLabel 无残留引用**

Run: `grep -rn "coverageColor\|verdictLabel" frontend/src --include="*.ts" --include="*.vue"`
Expected: 仅 DataQualityView.vue 命中（T2 重写将消除；若 T2 已先行则零命中）。governance.ts 内部 VERDICT_TXT 不算。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/governance.ts frontend/src/lib/governance.test.ts
git commit -m "feat(p8): 治理健康检查视图模型 buildHealthReport(三态结论/五源卡/九类分级告警,纯函数零后端)"
```

---

### Task 2: DataQualityView 整页重写（依赖 T1）

**Files:**
- Rewrite: `frontend/src/views/DataQualityView.vue`
- Rewrite: `frontend/src/views/DataQualityView.test.ts`

- [ ] **Step 1: 整文件替换 DataQualityView.test.ts 为失败测试**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DataQualityView from './DataQualityView.vue'
import { useDataStore } from '@/stores/data'

vi.mock('@/lib/exportXlsx', () => ({ exportRows: vi.fn() }))
import { exportRows } from '@/lib/exportXlsx'

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

function seed(over: Record<string, any> = {}) {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: '2026-06-12 09:00', totalProjects: 10, totalPaymentNodes: 50 },
    dashboard: {}, summary: {}, projectOverview: {},
    rawNodes: [{ projectId: 'P-1', tier: 't', isPaymentRelated: true }],
    dataQuality: {
      summary: { pmisProvided: true, joinRate: 0.95, matchedActive: 8, matchedClosed: 2, unmatched: 1, lastPmisUpdate: '2026-06-11' },
      themes: [{ theme: '成本', coveragePct: 0.9, verdict: 'green' }],
      unmatched: [{ projectId: 'X-1', projectName: '甲', kind: '在建' }],
      backfill: [], conflicts: [], dirty: [],
    },
    projectsQuality: {
      deptProjectCount: 9,
      orgFile: { provided: true, rows: 30, matched: 25, matchRate: 0.83 },
      mappingFile: { provided: true, rows: 5, matched: 5, matchRate: 1 },
      deliveryFile: { provided: true, rows: 40, matched: 38, matchRate: 0.95 },
      staffNoProject: [], managerNotInOrg: [], presaleTotal: 3, presaleMapped: 3, presaleUnmapped: [],
    },
    ...over,
  } as any
}

const mountView = () => mount(DataQualityView, { global: { stubs: { DataTable: true } } })

describe('DataQualityView', () => {
  it('黄横幅:有未匹配告警', () => {
    seed()
    const w = mountView()
    const banner = w.find('[data-test="banner"]')
    expect(banner.classes()).toContain('yellow')
    expect(banner.text()).toContain('1 类告警需关注')
    expect(banner.text()).toContain('2026-06-12 09:00')
  })

  it('绿横幅:告警清零', () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).dataQuality.unmatched = []
    ;(ds.data as any).dataQuality.summary.unmatched = 0
    const w = mountView()
    expect(w.find('[data-test="banner"]').classes()).toContain('green')
    expect(w.text()).toContain('数据就绪')
  })

  it('红横幅:云文档缺失', () => {
    seed({ rawNodes: [] })
    const w = mountView()
    expect(w.find('[data-test="banner"]').classes()).toContain('red')
  })

  it('五张源卡,缺失源置灰带未提供徽章', () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projectsQuality.orgFile = { provided: false, rows: 0, matched: 0, matchRate: 0 }
    const w = mountView()
    expect(w.findAll('.gov-src')).toHaveLength(5)
    const org = w.find('[data-test="src-org"]')
    expect(org.classes()).toContain('off')
    expect(org.text()).toContain('未提供')
  })

  it('0 条告警置灰且按钮禁用', () => {
    seed()
    const w = mountView()
    const dirty = w.find('[data-test="alert-dirty"]')
    expect(dirty.classes()).toContain('zero')
    expect(dirty.find('button').attributes('disabled')).toBeDefined()
  })

  it('点击展开明细表,缺失类展开为 note 文案', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projectsQuality.mappingFile = { provided: false, rows: 0, matched: 0, matchRate: 0 }
    const w = mountView()
    const un = w.find('[data-test="alert-unmatched"]')
    await un.find('button').trigger('click')
    expect(un.find('data-table-stub').exists()).toBe(true)
    const miss = w.find('[data-test="alert-missing-mapping"]')
    await miss.find('button').trigger('click')
    expect(miss.find('.gov-note').text()).toContain('A.xlsx')
    expect(miss.find('data-table-stub').exists()).toBe(false)
  })

  it('导出按钮调用 exportRows(文件名+行)', async () => {
    seed()
    const w = mountView()
    const un = w.find('[data-test="alert-unmatched"]')
    await un.find('button').trigger('click')
    await un.find('.gov-exp').trigger('click')
    expect(exportRows).toHaveBeenCalledWith('PMIS未匹配清单.xlsx', [{ projectId: 'X-1', projectName: '甲', kind: '在建' }])
  })

  it('未加载空态', () => {
    const ds = useDataStore()
    vi.spyOn(ds, 'load').mockResolvedValue(undefined as never)
    const w = mountView()
    expect(w.text()).toContain('数据加载中或加载失败')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/DataQualityView.test.ts`
Expected: FAIL（旧页无 data-test="banner" 等）

- [ ] **Step 3: 整文件替换 DataQualityView.vue**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { buildHealthReport, type AlertGroup } from '@/lib/governance'
import { exportRows } from '@/lib/exportXlsx'
import DataTable from '@/components/DataTable.vue'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const loaded = computed(() => !!data.data)
const report = computed(() => (data.data ? buildHealthReport(data.data) : null))

const open = ref<Set<string>>(new Set())
function toggle(a: AlertGroup) {
  if (a.count === 0) return
  const s = new Set(open.value)
  if (s.has(a.key)) s.delete(a.key)
  else s.add(a.key)
  open.value = s
}
function onExport(a: AlertGroup) { if (a.exportName) exportRows(a.exportName, a.rows) }
const SEV_TXT: Record<string, string> = { high: '高', mid: '中', low: '低' }
</script>

<template>
  <div class="gov-view">
    <h2 class="gov-title">数据治理</h2>
    <div v-if="!loaded" class="gov-empty">数据加载中或加载失败,请确认后端服务在运行。</div>
    <template v-else-if="report">
      <div class="gov-banner" :class="report.verdict" data-test="banner">
        <div class="gov-banner-main">
          <span class="gov-dot" />
          <div>
            <div class="gov-banner-title">{{ report.title }}</div>
            <div v-if="report.sub" class="gov-banner-sub">{{ report.sub }}</div>
          </div>
        </div>
        <div class="gov-banner-meta u-num">{{ report.metaLine }}</div>
      </div>

      <div class="gov-srcs">
        <div v-for="src in report.sources" :key="src.key" class="gov-src" :class="{ off: !src.provided }" :data-test="`src-${src.key}`">
          <div class="gov-src-head">
            <span class="gov-src-name">{{ src.label }}</span>
            <span class="gov-src-badge" :class="{ on: src.provided }">{{ src.provided ? '已提供' : '未提供' }}</span>
          </div>
          <div class="gov-src-main u-num">{{ src.main }}</div>
          <div class="gov-src-mlabel">{{ src.mainLabel }}</div>
          <div v-for="(sub, i) in src.subs" :key="i" class="gov-src-sub u-num">{{ sub }}</div>
        </div>
      </div>

      <h3 class="gov-h">告警 <span class="gov-h-hint">按严重度排序,0 条置灰</span></h3>
      <div class="gov-alerts">
        <div v-for="a in report.alerts" :key="a.key" class="gov-alert" :class="{ zero: a.count === 0 }" :data-test="`alert-${a.key}`">
          <button class="gov-alert-row" :disabled="a.count === 0" @click="toggle(a)">
            <span class="gov-sev" :class="a.severity">{{ SEV_TXT[a.severity] }}</span>
            <span class="gov-alert-label">{{ a.label }}</span>
            <span class="gov-alert-count u-num">{{ a.count }} 条</span>
            <span class="gov-alert-arrow" :class="{ open: open.has(a.key) }">▾</span>
          </button>
          <div v-if="open.has(a.key)" class="gov-alert-body">
            <p v-if="a.note" class="gov-note">{{ a.note }}</p>
            <template v-else>
              <div v-if="a.exportName" class="gov-exp-row">
                <button class="gov-exp" @click="onExport(a)">导出</button>
              </div>
              <DataTable :columns="a.columns" :rows="a.rows" :show-count="false" />
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gov-view { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--gap-section); }
.gov-title { font-size: var(--fs-5); font-weight: 700; margin: 0; color: var(--txt); }
.gov-empty { padding: var(--sp-6); text-align: center; color: var(--mut); background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.gov-banner { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-4); padding: var(--card-pad); border-radius: var(--r-lg); border: 1px solid var(--line); flex-wrap: wrap; }
.gov-banner.green { background: var(--ok-bg); }
.gov-banner.yellow { background: var(--warn-bg); }
.gov-banner.red { background: var(--danger-bg); }
.gov-banner-main { display: flex; align-items: center; gap: var(--sp-3); }
.gov-dot { width: 12px; height: 12px; border-radius: var(--r-full); flex-shrink: 0; }
.gov-banner.green .gov-dot { background: var(--ok); }
.gov-banner.yellow .gov-dot { background: var(--warn); }
.gov-banner.red .gov-dot { background: var(--danger); }
.gov-banner-title { font-size: var(--fs-4); font-weight: 700; }
.gov-banner.green .gov-banner-title { color: var(--ok-text); }
.gov-banner.yellow .gov-banner-title { color: var(--warn-text); }
.gov-banner.red .gov-banner-title { color: var(--danger-text); }
.gov-banner-sub { font-size: var(--fs-1); color: var(--sub); margin-top: 2px; }
.gov-banner-meta { font-size: var(--fs-1); color: var(--sub); }
.gov-srcs { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--gap-card); }
.gov-src { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); box-shadow: var(--shadow-1); }
.gov-src.off { opacity: var(--disabled-opacity); }
.gov-src-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-2); gap: var(--sp-2); }
.gov-src-name { font-size: var(--fs-2); font-weight: 600; color: var(--sub); }
.gov-src-badge { font-size: var(--fs-1); padding: 1px var(--sp-2); border-radius: var(--r-full); background: var(--card2); color: var(--mut); white-space: nowrap; }
.gov-src-badge.on { background: var(--ok-bg); color: var(--ok-text); }
.gov-src-main { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.gov-src-mlabel { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-2); }
.gov-src-sub { font-size: var(--fs-1); color: var(--sub); }
.gov-h { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
.gov-h-hint { font-size: var(--fs-1); font-weight: 400; color: var(--mut); margin-left: var(--sp-2); }
.gov-alerts { display: flex; flex-direction: column; gap: var(--gap-stack); }
.gov-alert { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; }
.gov-alert.zero { opacity: var(--disabled-opacity); }
.gov-alert-row { display: flex; align-items: center; gap: var(--sp-3); width: 100%; padding: var(--sp-3) var(--sp-4); background: none; border: none; cursor: pointer; color: var(--txt); font-size: var(--fs-2); text-align: left; }
.gov-alert-row:disabled { cursor: default; }
.gov-alert-row:not(:disabled):hover { background: var(--hover-tint); }
.gov-sev { font-size: var(--fs-1); font-weight: 600; padding: 1px var(--sp-2); border-radius: var(--r-sm); flex-shrink: 0; }
.gov-sev.high { background: var(--danger-bg); color: var(--danger-text); }
.gov-sev.mid { background: var(--warn-bg); color: var(--warn-text); }
.gov-sev.low { background: var(--card2); color: var(--mut); }
.gov-alert-label { flex: 1; font-weight: 600; }
.gov-alert-count { color: var(--sub); }
.gov-alert-arrow { color: var(--mut); transition: transform var(--dur-2) var(--ease); }
.gov-alert-arrow.open { transform: rotate(180deg); }
.gov-alert-body { padding: 0 var(--sp-4) var(--sp-4); }
.gov-note { font-size: var(--fs-2); color: var(--sub); margin: 0; line-height: var(--lh-base); }
.gov-exp-row { display: flex; justify-content: flex-end; margin-bottom: var(--sp-2); }
.gov-exp { font-size: var(--fs-1); background: var(--accent); color: var(--on-accent); border: none; border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-3); cursor: pointer; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/DataQualityView.test.ts src/lib/governance.test.ts`
Expected: PASS 全部

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/DataQualityView.vue frontend/src/views/DataQualityView.test.ts
git commit -m "feat(p8): 治理页整页重写(结论横幅/五源卡/折叠分级告警+导出,全 V2 令牌)"
```

---

### Task 3: AboutView 双域刷新 + DataView 文案对齐

**Files:**
- Rewrite: `frontend/src/views/AboutView.vue`
- Rewrite: `frontend/src/views/AboutView.test.ts`
- Modify: `frontend/src/views/DataView.vue:111`（仅一行文案）

- [ ] **Step 1: 整文件替换 AboutView.test.ts 为失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AboutView from './AboutView.vue'
import { APP_VERSION } from '@/version'

describe('AboutView', () => {
  it('版本号与发布信息', () => {
    const w = mount(AboutView)
    expect(w.text()).toContain(APP_VERSION)
    expect(w.text()).toContain('项目回款跟踪与管控平台')
  })

  it('双域功能说明与三类数据来源', () => {
    const w = mount(AboutView)
    expect(w.text()).toContain('项目域')
    expect(w.text()).toContain('回款域')
    expect(w.text()).toContain('数据治理')
    expect(w.text()).toContain('PMIS')
    expect(w.text()).toContain('组织架构')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/AboutView.test.ts`
Expected: FAIL（旧页无「项目域」分组）

- [ ] **Step 3: 整文件替换 AboutView.vue**

```vue
<script setup lang="ts">
import { APP_VERSION, RELEASE_DATE } from '@/version'

const SECTIONS = [
  { title: '项目域(五页)', items: [
    '项目总览:KPI 条 / 健康度总览 / 回款重点带 / 风险焦点 / 动态流',
    '项目清单:多条件筛选 + 全列搜索,行点击下钻项目详情',
    '项目详情:回款 / 进度里程碑 / 风险 / 预算核算 / 原项目五 Tab + 动态时间线',
    '项目动态:快照 diff 事件流 + 周期对比(上次同步 / 上周 / 上月)',
    '项目分析:11 维 × 6 指标排名 / 交叉 / 透视,可下钻',
  ] },
  { title: '回款域(五页)', items: [
    '回款总览:核心指标 / 档位进度 / 服务组排名 / 月度趋势(FilterBar 联动)',
    '回款分析:多维看板 + 项目总览 / 回款节点 / 回款状态 / 风险项目 / 数据质检',
    '回款日历:双月视图 / 年度热力图 / 到期提醒',
    '临期跟进:30/15/7 天临期进度 + 跟进记录云文档回写',
    '回款台账:跨档位统一视图,行内下钻',
  ] },
  { title: '工具组', items: [
    '数据管理:云同步 / 离线导入 / PMIS 下载上传 / 项目域文件上传 / 更新数据',
    '数据治理:全源健康检查(结论横幅 / 源状态卡 / 分级告警与导出)',
  ] },
]
</script>

<template>
  <div class="about-view">
    <div class="about-head">
      <div class="about-name">项目回款跟踪与管控平台</div>
      <div class="about-ver">Version {{ APP_VERSION }}</div>
    </div>

    <div class="about-grid">
      <div class="about-k">产品名称</div><div class="about-v">项目回款跟踪与管控平台</div>
      <div class="about-k">版本号</div><div class="about-v">{{ APP_VERSION }}</div>
      <div class="about-k">发布日期</div><div class="about-v">{{ RELEASE_DATE }}</div>
      <div class="about-k">作者</div><div class="about-v">交付中心-交付实施三部-阿童木</div>
      <div class="about-k">数据来源</div><div class="about-v">WPS 云文档(回款节点清单) + PMIS 七表 + 项目域三文件(组织架构 / 售前映射 A / delivery)</div>
    </div>

    <div v-for="sec in SECTIONS" :key="sec.title" class="about-feat-box">
      <div class="about-feat-title">{{ sec.title }}</div>
      <ul class="about-features">
        <li v-for="(f, i) in sec.items" :key="i">{{ f }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.about-view { padding: var(--sp-5); max-width: 720px; }
.about-head { margin-bottom: var(--sp-5); }
.about-name { font-size: var(--fs-5); font-weight: 700; color: var(--txt); margin-bottom: var(--sp-1); }
.about-ver { font-size: var(--fs-2); color: var(--mut); }
.about-grid { display: grid; grid-template-columns: 120px 1fr; gap: var(--sp-3) var(--sp-4); font-size: var(--fs-2); border-top: 1px solid var(--line); padding-top: var(--sp-4); }
.about-k { color: var(--mut); font-weight: 600; }
.about-v { color: var(--txt); }
.about-feat-box { margin-top: var(--sp-5); padding: var(--sp-4); background: var(--card2); border-radius: var(--r-md); font-size: var(--fs-1); color: var(--mut); }
.about-feat-title { font-weight: 700; margin-bottom: var(--sp-2); color: var(--sub); }
.about-features { list-style: disc; padding-left: var(--sp-5); line-height: var(--lh-base); margin: 0; }
.about-features li { margin-bottom: var(--sp-1); }
</style>
```

- [ ] **Step 4: DataView.vue 文案对齐治理页口径（111 行）**

旧：`<div class="dv-card-head">项目域数据（组织架构 / 项目映射 / 预算核算）</div>`
新：`<div class="dv-card-head">项目域数据（组织架构 / 售前映射 / 预算核算明细）</div>`

（DataView 其余 px 散值由 T4 统一清理，本任务不动样式。）

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/AboutView.test.ts src/views/DataView.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/AboutView.vue frontend/src/views/AboutView.test.ts frontend/src/views/DataView.vue
git commit -m "feat(p8): 关于页双域刷新(项目域/回款域/工具组+三类数据来源)+数据管理页文案对齐(售前映射/预算核算明细)"
```

---

### Task 4: L-21 存活页令牌化扫尾 + BoardView 状态色入桥

**Files:**
- Modify（px→令牌，仅 `<style>` 内）: `frontend/src/views/{OverviewView,ProjectsView,ProjectDetailView,ActivityView,InsightView,DataView}.vue`、`frontend/src/layout/{AppHeader,AppSidebar,FilterBar}.vue`、`frontend/src/components/{DataTable,SegToggle,HealthBadge,EventTimeline,PivotTable,DimPicker,DisplaySettings,ProjectDetailDrawer,PageStub}.vue`
- Modify: `frontend/src/charts/echartsTheme.ts`（加 STATUS_LIGHT/STATUS_DARK）
- Modify: `frontend/src/charts/echartsTheme.tokens.test.ts`（加状态色契约断言）
- Modify: `frontend/src/views/BoardView.vue:69-70`（2 处状态 hex）
- **跳过**（移交回款全量重设计，PROGRESS 注明）：Calendar/Followup/Ledger/Dashboard/PayAnalysis 各页及专属组件（Cal*/PlanBoard/PlanTab/PendingBarChart/Fu*/Followup*/LedgerTable/TierStrip/OrgRanking/TrendCard/DashMetrics/ColumnFilter/BoardDrilldownModal/DataQualityTable/ProjectsOverviewTab/RiskTab/TierIntegrityTab）、lib/calendar.ts、lib/planBoards.ts、nav.ts TIERS 回退 hex、BoardView 其余 px。

- [ ] **Step 1: 状态色契约测试先行（echartsTheme.tokens.test.ts 追加）**

在现文件追加（import 行加入 STATUS_LIGHT/STATUS_DARK；root/dark 取值方式沿用文件内既有模式）：

```ts
  it('STATUS_* 与 theme.css 状态色同步', () => {
    expect(STATUS_LIGHT.ok).toBe(cssVar(root, '--ok'))
    expect(STATUS_LIGHT.warn).toBe(cssVar(root, '--warn'))
    expect(STATUS_LIGHT.danger).toBe(cssVar(root, '--danger'))
    expect(STATUS_DARK.ok).toBe(cssVar(dark, '--ok'))
    expect(STATUS_DARK.warn).toBe(cssVar(dark, '--warn'))
    expect(STATUS_DARK.danger).toBe(cssVar(dark, '--danger'))
  })
```

Run: `cd frontend && npx vitest run src/charts/echartsTheme.tokens.test.ts` → FAIL（STATUS_* 未导出）

- [ ] **Step 2: echartsTheme.ts 加状态色镜像（CHART_* 同款模式）**

```ts
// 状态色镜像(canvas 不能读 CSS 变量,与 CHART_* 同理;契约测试与 theme.css 同步)
export const STATUS_LIGHT = { ok: '#4e9a7c', warn: '#e0a23b', danger: '#d24d5c' }
export const STATUS_DARK = { ok: '#5ba88a', warn: '#e6b056', danger: '#e0697a' }
```

Run 同上 → PASS

- [ ] **Step 3: BoardView 两处状态 hex 换镜像**

script 顶部加：

```ts
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'
import { useSettingsStore } from '@/stores/settings'
```

（settings store 已有则复用现有实例变量。）在构建柱状 option 的 computed 内取 `const sc = useSettingsStore().theme === 'dark' ? STATUS_DARK : STATUS_LIGHT`，然后：
- 69 行 `itemStyle: { color: '#10B981' }` → `itemStyle: { color: sc.ok }`（已回款=状态 ok）
- 70 行 `itemStyle: { color: '#F59E0B' }` → `itemStyle: { color: sc.warn }`（待回款=状态 warn）

Run: `cd frontend && npx vitest run src/views/BoardView.test.ts` → PASS

- [ ] **Step 4: px→令牌机械替换（仅上列存活文件的 `<style>` 块）**

逐文件先列出现状：

```bash
cd frontend && grep -nE "font-size:\s*[0-9]+px|padding[^;]*:\s*[^;]*[0-9]+px|margin[^;]*:\s*[^;]*[0-9]+px|border-radius:\s*[0-9]+px|gap:\s*[0-9]+px" src/views/OverviewView.vue  # 每个文件同此
```

映射表（**等距贴最近格点，等距取大**；shorthand 可混写如 `padding: 2px var(--sp-2)`）：

| 类别 | 替换 |
|---|---|
| 间距(padding/margin/gap) | 4→`var(--sp-1)` 6,8→`var(--sp-2)` 10,12→`var(--sp-3)` 14,16→`var(--sp-4)` 20(卡内边距语义)→`var(--card-pad)` 20(其他),24→`var(--sp-5)` 32→`var(--sp-6)` 48→`var(--sp-7)`；**1-3px 微调保留原值** |
| border-radius | ≤6→`var(--r-sm)` 8-12→`var(--r-md)` 14-16→`var(--r-lg)` ≥24/999/50%→`var(--r-full)` |
| font-size | 11-12→`var(--fs-1)` 13-14→`var(--fs-2)` 15-16→`var(--fs-3)` 17-20→`var(--fs-4)` 21-28→`var(--fs-5)` ≥29→`var(--fs-6)` |
| line-height 数值 | 1.15→`var(--lh-tight)` 1.4→`var(--lh-dense)` 1.6→`var(--lh-base)`；px 行高保留 |

仅动 `<style>`，不动模板/逻辑/类名；width/height/min-width 等尺寸值**不换**（令牌只管间距/圆角/字号/行高）。

- [ ] **Step 5: 复扫验证清零 + 全量测试**

```bash
cd frontend && grep -cnE "font-size:\s*[0-9]+px|padding[^;]*:\s*(?![123]px)[^;]*[0-9]+px|border-radius:\s*[0-9]+px|gap:\s*[0-9]+px" <各存活文件>
```

（grep -P 不可用时人工复查 1-3px 例外。）Expected: 存活文件仅剩 1-3px 微调。
Run: `cd frontend && npm run test:run && npm run typecheck`
Expected: 全绿（若有测试断言旧 px 值则同步该断言并在报告中说明）。

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src
git commit -m "refactor(p8): L-21 存活页令牌化扫尾(项目域五页/工具组/布局/共用组件 px→令牌)+BoardView 状态色入 echarts 镜像(契约测试)"
```

---

### Task 5: 打包专项核验（主循环亲自执行）

**Files:**
- Modify: `PaymentReviewApp.spec`
- 产物不入库（dist/build 已 gitignore，核实后不 add）

- [ ] **Step 1: .spec 修正**

- datas 中 `('snapshots.py', '.'),` 之后加一行：`('write_followup.py', '.'),`（server.py:230 frozen 分支依赖，当前缺失=打包版跟进回写必坏）
- 头注释 `版本: V5.9.1 | 日期: 2026-06-02` → `版本: V7.6.0 | 日期: 2026-06-12`
- `name='PaymentReviewApp_v5.9.1'` → `name='PaymentReviewApp_v7.6.0'`

- [ ] **Step 2: frozen 走查（输出结论清单，进 PROGRESS Handoff）**

核对项：
1. `_run_script_direct` 四目标（preprocess_data/fetch_yundocs_full/pmis_download/write_followup）均在 datas（修正后 ✓）。
2. preprocess_data 进程内 import 的 pmis/projects/snapshots/schema/config 均在 datas。
3. server.py 各 frozen 分支：静态资源（dist/图标/fonts）走 `sys._MEIPASS`；可变数据（data/、input/、yundocs_data/、followup_records）走 exe 目录。
4. snapshots 流水线产物（data/snapshots/、data/events.json）在 frozen 下落 exe 目录而非 _MEIPASS。
5. input/pmis/ 上传与三新文件上传在 frozen 下的目标目录。

- [ ] **Step 3: 构建 + 冒烟**

```bash
python -m PyInstaller --version || pip install pyinstaller
cd frontend && npm run build && cd ..
python -m PyInstaller PaymentReviewApp.spec --noconfirm   # 后台运行,耗时长(playwright 收集)
```

冒烟（确认 8080 无 dev server 占用后）：启动 `dist/PaymentReviewApp_v7.6.0.exe`，轮询 `curl http://localhost:8080/` 200 且为 SPA index；`curl http://localhost:8080/data/analysis_data.json` 200；浏览器目检 `/governance` 渲染（或 curl 拿 index 后由用户目检）；`curl http://localhost:8080/api/stop` 收尾。构建环境不可行 → 输出 Step1/2 结论 + 核验清单交用户打包机执行。

- [ ] **Step 4: Commit**

```bash
git add PaymentReviewApp.spec
git commit -m "fix(p8): 打包 spec 补 write_followup.py(frozen 跟进回写缺件)+exe 版本名 v7.6.0,frozen 走查+构建冒烟"
```

- [ ] **Step 5: opus 复核走查结论**（对照 server.py/各脚本 frozen 分支逐条验证 Step 2 清单）

---

### Task 6: 版本 + PROGRESS + verify + 终审

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: version.ts**

```ts
export const APP_VERSION = 'V7.6.0'
export const RELEASE_DATE = '2026-06-12'
```

- [ ] **Step 2: PROGRESS.md**

- 头部版本 V7.6.0；「进行中」→ P8 完成待合并。
- **P7 暂停决策**：回款子域预计全量重新设计（后续独立立项），P7 逐页翻新取消；L-21 回款域余量（约 230 处 px + calendar/planBoards/nav.ts TIERS hex）移交该立项。
- L-21 关闭（存活页清零），注明 spec §6 两处修正（nav.ts 移交、ColumnFilter 移出）。
- Handoff P8：归并决策、frozen 走查结论、write_followup.py 缺件修复、烟雾清单：① /governance 三态横幅与五源卡数值（对照数据管理页时间）② 展开「PMIS 未匹配」导出 xlsx 可开 ③ 0 条告警置灰不可点 ④ 缺失源卡灰态+缺失告警 note（可临时移走 input 文件重跑更新数据验证）⑤ /about 双域文案 + V7.6.0 ⑥ 字号三档在治理/关于页生效 ⑦ exe 冒烟（治理页渲染）。
- P-next 用户待办三项保留不动。

- [ ] **Step 3: verify.sh 全绿**

Run: `bash verify.sh`
Expected: py_compile + ruff + pytest(188) + typecheck + vitest + build 全过（vitest 数量随 T1/T2 新增上浮）。

- [ ] **Step 4: Commit + opus 整体终审（diff master..HEAD 对照 spec）**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(p8): 版本 V7.6.0 + PROGRESS 记录 P8 完成(治理页重设计/工具组收尾/L-21 关闭/打包核验)"
```

终审通过 → superpowers:finishing-a-development-branch 四选项菜单。
