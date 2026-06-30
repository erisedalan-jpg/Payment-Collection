# 项目总览首页深度重做 V2.5.0 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把项目总览首页（`/`，`OverviewView.vue`）重做为「体检带（健康分段条+回款 CSS 环）→ 异常分诊卡网格（按严重度·可下钻）→ 右栏动态」三段式，删冗余、零后端改动。

**Architecture:** 新增 2 个纯展示组件 `RatioRing.vue`（CSS conic 环）、`HealthSegmentBar.vue`（健康分段条+图例），再重写 `OverviewView.vue` 模板与 scoped CSS 组合它们；去重/排序/隐藏 0 项只在视图层对 `classifyProjects` 结果做过滤排序，复用现有 `lib/overview.ts`、`lib/riskClassify.ts`、`lib/paymentPmis.ts`，不碰任何计算口径与后端。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Pinia + vue-router + Element Plus（本页不用）；测试 vitest + @vue/test-utils（`mount`）；样式仅引用 `frontend/src/styles/theme.css` 令牌。

## Global Constraints

- 只引用 `theme.css` 令牌（`--fs-*`/`--sp-*`/`--gap-*`/`--r-*`/`--ok|warn|danger|mut|accent`/`--*-bg`/`--*-text`/`--line`/`--card|card2`/`--hover-tint`/`--shadow-1`/`--dur-2`/`--ease`），**不手写颜色/字号散值**；唯一允许的像素散值＝图形尺寸（分段条/进度条条高 8~14px、色条 4px、圆点 10px），沿用现有 `ov-pay-bar:8px` 先例。
- 卡片守「1 主 2 辅」：体检带卡内仅 1 个 `--fs-5` 大值（回款环），健康计数压 `--fs-4`。
- 状态色只表状态：健康=`--ok`/关注=`--warn`/风险=`--danger`/无数据=`--mut`；回款达成环用 `--accent`（本页既有口径）。
- 阴影只 `--shadow-1`；hover 用 `--hover-tint`；动效只 `--dur-2`+`--ease`。
- 文案简体中文、**无 emoji**（箭头用 `→ ▾`）。
- **零后端 / 零口径改动**：不改 `lib/overview.ts`、`lib/riskClassify.ts`、`lib/paymentPmis.ts`、`EventTimeline.vue`、schema/preprocess/路由/pageAccess/nav；去重排序只在视图层。→ 升级不需「更新数据」、无新依赖、无新页。
- 版本：实现末步将 `frontend/src/version.ts` 的 `APP_VERSION` 改 `V2.5.0`、`RELEASE_DATE` 改 `2026-06-30`。
- 完成定义：`bash verify.sh` 全绿（后端 pytest + 前端 typecheck/vitest/build）。

---

### Task 1: RatioRing 组件（CSS conic 回款达成环）

**Files:**
- Create: `frontend/src/components/RatioRing.vue`
- Test: `frontend/src/components/RatioRing.test.ts`

**Interfaces:**
- Consumes: `fmtRatio` from `@/lib/format`（签名 `fmtRatio(v: unknown, nullLabel = '-') => string`；`0.509 → '50.9%'`，`0.5 → '50%'`，`null → '-'`）。
- Produces: 组件 `RatioRing`，props `{ ratio: number|null; label?: string; size?: number; thickness?: number; color?: string }`（默认 `label=''`、`size=96`、`thickness=10`、`color='var(--accent)'`）；DOM：根 `.ratio-ring`（`ratio` 非空时 inline-style 含 `conic-gradient`，空时仅 `var(--line)`）、`.ratio-ring-val`（显示 `fmtRatio(ratio)`）、`.ratio-ring-label`。

- [ ] **Step 1: 写失败测试**

`frontend/src/components/RatioRing.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RatioRing from './RatioRing.vue'

describe('RatioRing', () => {
  it('ratio=0.509 → 显示 50.9% 且环为 conic 填充', () => {
    const w = mount(RatioRing, { props: { ratio: 0.509, label: '回款达成率' } })
    expect(w.find('.ratio-ring-val').text()).toBe('50.9%')
    expect(w.text()).toContain('回款达成率')
    expect(w.find('.ratio-ring').attributes('style') || '').toContain('conic-gradient')
  })

  it('ratio=null → 显示 - 且无 conic(置灰)', () => {
    const w = mount(RatioRing, { props: { ratio: null } })
    expect(w.find('.ratio-ring-val').text()).toBe('-')
    expect(w.find('.ratio-ring').attributes('style') || '').not.toContain('conic-gradient')
  })

  it('整数比例不留小数', () => {
    const w = mount(RatioRing, { props: { ratio: 0.5 } })
    expect(w.find('.ratio-ring-val').text()).toBe('50%')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/RatioRing.test.ts`
Expected: FAIL（`Cannot find module './RatioRing.vue'`）

- [ ] **Step 3: 写最小实现**

`frontend/src/components/RatioRing.vue`：
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { fmtRatio } from '@/lib/format'

const props = withDefaults(defineProps<{
  ratio: number | null
  label?: string
  size?: number
  thickness?: number
  color?: string
}>(), { label: '', size: 96, thickness: 10, color: 'var(--accent)' })

const isNull = computed(() => props.ratio == null)
const deg = computed(() => Math.max(0, Math.min(1, props.ratio ?? 0)) * 360)
const ringStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  background: isNull.value
    ? 'var(--line)'
    : `conic-gradient(${props.color} ${deg.value}deg, var(--line) 0)`,
}))
const holeStyle = computed(() => ({ inset: `${props.thickness}px` }))
const text = computed(() => fmtRatio(props.ratio))
const textColor = computed(() => (isNull.value ? 'var(--mut)' : props.color))
</script>

<template>
  <div class="ratio-ring" :style="ringStyle" role="img" :aria-label="`${label} ${text}`">
    <div class="ratio-ring-hole" :style="holeStyle">
      <div class="ratio-ring-val u-num" :style="{ color: textColor }">{{ text }}</div>
      <div v-if="label" class="ratio-ring-label">{{ label }}</div>
    </div>
  </div>
</template>

<style scoped>
.ratio-ring { position: relative; border-radius: var(--r-full); flex: none; }
.ratio-ring-hole { position: absolute; background: var(--card); border-radius: var(--r-full); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
.ratio-ring-val { font-size: var(--fs-5); font-weight: 700; line-height: var(--lh-tight, 1.15); }
.ratio-ring-label { font-size: var(--fs-1); color: var(--mut); }
</style>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/RatioRing.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RatioRing.vue frontend/src/components/RatioRing.test.ts
git commit -m "feat(overview): RatioRing 回款达成 CSS conic 环组件"
```

---

### Task 2: HealthSegmentBar 组件（健康分段条 + 可点图例）

**Files:**
- Create: `frontend/src/components/HealthSegmentBar.vue`
- Test: `frontend/src/components/HealthSegmentBar.test.ts`

**Interfaces:**
- Consumes: 无 lib 依赖；图例链接用 vue-router `RouterLink`（测试用 `RouterLinkStub` 替身）。
- Produces: 组件 `HealthSegmentBar`，props `{ segments: { key: string; label: string; count: number; color: string; to?: string }[]; height?: number; minSegmentPct?: number }`（默认 `height=14`、`minSegmentPct=4`）；只渲染 `count>0` 的段；DOM：`.hsb` 根、`.hsb-bar` 内多个 `.hsb-seg`（inline `width`%、`background`）、`.hsb-legend` 内多个 `.hsb-leg`（含 `.hsb-dot`/`.hsb-leg-label`/`.hsb-leg-count`），`segment.to` 存在时该图例项为 `RouterLink`。

- [ ] **Step 1: 写失败测试**

`frontend/src/components/HealthSegmentBar.test.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import HealthSegmentBar from './HealthSegmentBar.vue'

const segs = [
  { key: '健康', label: '健康', count: 336, color: 'var(--ok)', to: '/projects?health=健康' },
  { key: '关注', label: '关注', count: 253, color: 'var(--warn)', to: '/projects?health=关注' },
  { key: '风险', label: '风险', count: 49, color: 'var(--danger)', to: '/projects?health=风险' },
  { key: '无数据', label: '无数据', count: 0, color: 'var(--mut)' },
]
const opts = { global: { stubs: { RouterLink: RouterLinkStub } } }

describe('HealthSegmentBar', () => {
  it('只渲染 count>0 的段与图例', () => {
    const w = mount(HealthSegmentBar, { props: { segments: segs }, ...opts })
    expect(w.findAll('.hsb-seg')).toHaveLength(3)
    expect(w.findAll('.hsb-leg')).toHaveLength(3)
    expect(w.text()).toContain('336')
  })

  it('极小段宽不小于 minSegmentPct', () => {
    const w = mount(HealthSegmentBar, {
      props: { segments: [
        { key: 'a', label: 'A', count: 999, color: 'var(--ok)' },
        { key: 'b', label: 'B', count: 1, color: 'var(--danger)' },
      ], minSegmentPct: 5 },
      ...opts,
    })
    expect(w.findAll('.hsb-seg')[1].attributes('style')).toContain('width: 5%')
  })

  it('有 to 的图例渲染为链接并带正确 to', () => {
    const w = mount(HealthSegmentBar, { props: { segments: segs }, ...opts })
    const links = w.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(3)
    expect(links[0].props('to')).toBe('/projects?health=健康')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/HealthSegmentBar.test.ts`
Expected: FAIL（`Cannot find module './HealthSegmentBar.vue'`）

- [ ] **Step 3: 写最小实现**

`frontend/src/components/HealthSegmentBar.vue`：
```vue
<script setup lang="ts">
import { computed } from 'vue'

interface Seg { key: string; label: string; count: number; color: string; to?: string }
const props = withDefaults(defineProps<{
  segments: Seg[]
  height?: number
  minSegmentPct?: number
}>(), { height: 14, minSegmentPct: 4 })

const shown = computed(() => props.segments.filter((s) => s.count > 0))
const total = computed(() => shown.value.reduce((sum, s) => sum + s.count, 0))
const widths = computed<Record<string, number>>(() => {
  const t = total.value
  const m: Record<string, number> = {}
  for (const s of shown.value) {
    const raw = t > 0 ? (s.count / t) * 100 : 0
    m[s.key] = Math.max(raw, props.minSegmentPct)
  }
  return m
})
</script>

<template>
  <div class="hsb">
    <div class="hsb-bar" :style="{ height: `${height}px` }">
      <div v-for="s in shown" :key="s.key" class="hsb-seg"
        :style="{ width: `${widths[s.key]}%`, background: s.color }" :title="`${s.label} ${s.count}`"></div>
    </div>
    <div class="hsb-legend">
      <component :is="s.to ? 'RouterLink' : 'span'" v-for="s in shown" :key="s.key"
        class="hsb-leg" :class="{ 'hsb-leg--link': s.to }" :to="s.to">
        <span class="hsb-dot" :style="{ background: s.color }"></span>
        <span class="hsb-leg-label">{{ s.label }}</span>
        <b class="hsb-leg-count u-num">{{ s.count }}</b>
      </component>
    </div>
  </div>
</template>

<style scoped>
.hsb { display: flex; flex-direction: column; gap: var(--sp-2); }
.hsb-bar { display: flex; width: 100%; border-radius: var(--r-full); overflow: hidden; background: var(--line); }
.hsb-seg { height: 100%; }
.hsb-legend { display: flex; flex-wrap: wrap; gap: var(--sp-4); }
.hsb-leg { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-1); color: var(--sub); text-decoration: none; }
.hsb-leg--link { cursor: pointer; padding: 0 var(--sp-1); border-radius: var(--r-sm); }
.hsb-leg--link:hover { background: var(--hover-tint); }
.hsb-dot { width: 10px; height: 10px; border-radius: var(--r-full); flex: none; }
.hsb-leg-label { color: var(--sub); }
.hsb-leg-count { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
</style>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/HealthSegmentBar.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/HealthSegmentBar.vue frontend/src/components/HealthSegmentBar.test.ts
git commit -m "feat(overview): HealthSegmentBar 健康分段条+可点图例组件"
```

---

### Task 3: 重写 OverviewView（体检带 + 异常分诊卡 + 右栏）

**Files:**
- Modify: `frontend/src/views/OverviewView.vue`（整文件替换）
- Modify: `frontend/src/views/OverviewView.test.ts`（断言重写）

**Interfaces:**
- Consumes: Task 1 `RatioRing`、Task 2 `HealthSegmentBar`；现有 `computeKpis/healthSummary/paymentBand`（`@/lib/overview`）、`paymentNodeRows`（`@/lib/paymentPmis`）、`buildProjectRows`（`@/lib/projectList`）、`classifyProjects`（`@/lib/riskClassify`，返回 `{ category, tone:'warn'|'danger'|'mut', count, projects:{projectId,projectName,detail}[] }[]`，固定 6 类序：回款延期/里程碑滞后/成本超支/风险未闭环/数据异常/健康度低）、`fmtWan/fmtRatio`（`@/lib/format`）、`EventTimeline`。
- Produces: 重写后 `OverviewView` 仍 `defineExpose({ baseProjects })`（标签排除测试依赖）；DOM 关键类：`.ov-band`/`.ov-band-pay`/`.ratio-ring`/`.hsb`/`.ov-anomaly`/`.ov-anomaly-grid`/`.ov-acard`/`.ov-aside`；不再含 `.ov-kpis`/`.ov-focus`/`.ov-risk-cats`/`进度异常`/`健康度低`。

- [ ] **Step 1: 改测试为新结构（先失败）**

整体替换 `frontend/src/views/OverviewView.test.ts` 中 `describe('OverviewView', …)` 块（保留文件顶部 import、`beforeEach`、`now/iso/inDays`、`seed`、`mountView`，以及末尾 `describe('OverviewView 标签排除', …)` 两个用例**不变**）。把第一个 describe 替换为：
```ts
describe('OverviewView', () => {
  it('体检带:在管/进行中/暂停 + 健康分段条 + 回款达成率环', async () => {
    seed()
    const w = await mountView()
    expect(w.find('.ov-band').text()).toContain('在管')
    expect(w.find('.ov-band').text()).toContain('回款达成率')
    expect(w.find('.ratio-ring-val').text()).toBe('60%')   // 600/1000
    expect(w.find('.hsb').exists()).toBe(true)
  })

  it('体检带回款三数:年度进度/本月待回/7天临期,均链 /payment', async () => {
    seed()
    const w = await mountView()
    const band = w.find('.ov-band-pay')
    expect(band.text()).toContain('年度回款进度')
    expect(band.text()).toContain('本月待回款')
    expect(band.text()).toContain('50')   // 本月待回 30+20=50 万
    expect(band.text()).toContain('7 天临期')
    expect(band.findAll('a').every((a) => a.attributes('href') === '/payment')).toBe(true)
  })

  it('健康段链接带 health query', async () => {
    seed()
    const w = await mountView()
    expect(
      w.find('a[href="/projects?health=%E9%A3%8E%E9%99%A9"]').exists()
      || w.find('a[href="/projects?health=风险"]').exists(),
    ).toBe(true)
  })

  it('异常分诊区有标题;旧冗余元素已移除', async () => {
    seed()
    const w = await mountView()
    expect(w.text()).toContain('需要处理的异常')
    expect(w.find('.ov-kpis').exists()).toBe(false)
    expect(w.find('.ov-focus').exists()).toBe(false)
    expect(w.text()).not.toContain('进度异常')
    expect(w.text()).not.toContain('健康度低')
  })

  it('右栏动态最多 10 条 + 查看全部链接', async () => {
    seed()
    const w = await mountView()
    expect(w.findAll('.ev-item')).toHaveLength(10)
    expect(w.find('a[href="/activity"]').exists()).toBe(true)
  })

  it('无数据空态不崩(零项目零事件)', async () => {
    const ds = useDataStore()
    ds.data = { meta: {}, dashboard: {}, summary: {}, displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {}, rawNodes: [], events: [] } as any
    const w = await mountView()
    expect(w.text()).toContain('首次同步，暂无变化记录')
    expect(w.find('.ov-band').text()).toContain('在管')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/OverviewView.test.ts`
Expected: FAIL（旧 `OverviewView.vue` 无 `.ov-band`/`.ratio-ring` 等，新断言报错）

- [ ] **Step 3: 整文件替换 OverviewView.vue**

`frontend/src/views/OverviewView.vue` 全文替换为：
```vue
<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { Event, Project, ProjectPmis } from '@/types/analysis'
import { computeKpis, healthSummary, paymentBand } from '@/lib/overview'
import { paymentNodeRows } from '@/lib/paymentPmis'
import { useFilterStore } from '@/stores/filter'
import { fmtWan, fmtRatio } from '@/lib/format'
import EventTimeline from '@/components/EventTimeline.vue'
import RatioRing from '@/components/RatioRing.vue'
import HealthSegmentBar from '@/components/HealthSegmentBar.vue'
import { buildProjectRows } from '@/lib/projectList'
import { classifyProjects } from '@/lib/riskClassify'

const data = useDataStore()
const filter = useFilterStore()
const router = useRouter()
onMounted(() => { if (!data.data) data.load() })

const baseProjects = computed(() => {
  const all = (data.data?.projects ?? []) as Project[]
  return filter.excludeOn ? all.filter((p) => !filter.excludedIds[p.projectId]) : all
})
const projects = baseProjects
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)

const kpis = computed(() => computeKpis(projects.value, pmisMap.value, data.data?.paymentRecords))
const health = computed(() => healthSummary(projects.value))
const band = computed(() => paymentBand(
  paymentNodeRows(data.data?.paymentNodes, projects.value, data.data?.projectPmis),
  new Date(),
  filter.payRecordsAll,
  filter.dateStart,
  filter.dateEnd,
))
const recentEvents = computed(() => ((data.data?.events ?? []) as Event[]).slice(0, 10))
const yearPct = computed(() => (band.value.yearExpected > 0 ? Math.min(band.value.yearActual / band.value.yearExpected, 1) : 0))

// 体检带:健康分段条数据(无数据段仅 count>0 时由组件过滤显示;无 to 不可点)
const healthSegments = computed(() => [
  { key: '健康', label: '健康', count: health.value.counts.健康, color: 'var(--ok)', to: '/projects?health=健康' },
  { key: '关注', label: '关注', count: health.value.counts.关注, color: 'var(--warn)', to: '/projects?health=关注' },
  { key: '风险', label: '风险', count: health.value.counts.风险, color: 'var(--danger)', to: '/projects?health=风险' },
  { key: '无数据', label: '无数据', count: health.value.counts.无数据, color: 'var(--mut)' },
])

// 异常分诊:去 健康度低(并入体检带)+ 隐藏 0 项,按 danger→warn→mut 稳定排序(组内保留 classifyProjects 固定序)
const rows = computed(() => buildProjectRows(projects.value, pmisMap.value))
const classEntries = computed(() => classifyProjects(rows.value))
const SEVERITY_ORDER: Record<string, number> = { danger: 0, warn: 1, mut: 2 }
const BLURB: Record<string, string> = {
  回款延期: '有延期收款节点的项目',
  里程碑滞后: '里程碑计划滞后的项目',
  成本超支: '总/交付成本超支的项目',
  风险未闭环: '存在未关闭风险项的项目',
  数据异常: '组织架构缺失等数据问题',
}
const anomalyCards = computed(() =>
  classEntries.value
    .filter((e) => e.category !== '健康度低' && e.count > 0)
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.tone] - SEVERITY_ORDER[b.tone]),
)

const expanded = reactive<Record<string, boolean>>({})
function toggle(cat: string) { expanded[cat] = !expanded[cat] }

interface DrillItem { projectId: string; primary: string; secondary: string }
function cardItems(cat: string): DrillItem[] {
  if (cat === '回款延期' && band.value.delayedTop.length) {
    return band.value.delayedTop.map((t) => ({
      projectId: t.projectId, primary: t.projectName || t.projectId, secondary: `待回 ${fmtWan(t.remaining)} 万`,
    }))
  }
  const entry = classEntries.value.find((e) => e.category === cat)
  return (entry?.projects ?? []).slice(0, 5).map((p) => ({
    projectId: p.projectId, primary: p.projectName || p.projectId, secondary: p.detail,
  }))
}
function catLink(cat: string): string { return `/projects?riskCategory=${encodeURIComponent(cat)}` }

defineExpose({ baseProjects })
</script>

<template>
  <div class="overview-view">
    <!-- 体检带 -->
    <section class="ov-band">
      <div class="ov-band-health">
        <div class="ov-band-head">
          <span class="ov-band-title">项目健康度</span>
          <span class="ov-band-ctx u-num">在管 {{ kpis.total }} · 进行中 {{ kpis.active }} · 暂停 {{ kpis.paused }}</span>
        </div>
        <HealthSegmentBar :segments="healthSegments" />
      </div>
      <div class="ov-band-pay">
        <RouterLink class="ov-ring-link" to="/payment">
          <RatioRing :ratio="kpis.paymentRatio" label="回款达成率" :size="104" />
        </RouterLink>
        <div class="ov-pay-stats">
          <RouterLink class="ov-pay-stat" to="/payment">
            <div class="ov-pay-bar"><div class="ov-pay-fill" :style="{ width: yearPct * 100 + '%' }"></div></div>
            <div class="ov-pay-v u-num">{{ fmtWan(band.yearActual) }} / {{ fmtWan(band.yearExpected) }} 万</div>
            <div class="ov-pay-k">年度回款进度</div>
          </RouterLink>
          <RouterLink class="ov-pay-stat" to="/payment">
            <div class="ov-pay-v u-num">{{ fmtWan(band.monthPending) }} 万</div>
            <div class="ov-pay-k">本月待回款</div>
          </RouterLink>
          <RouterLink class="ov-pay-stat" to="/payment">
            <div class="ov-pay-v u-num">{{ band.dueSoon7 }}</div>
            <div class="ov-pay-k">7 天临期</div>
          </RouterLink>
        </div>
      </div>
    </section>

    <div class="ov-lower">
      <section class="ov-anomaly">
        <div class="ov-anomaly-title">需要处理的异常</div>
        <div v-if="anomalyCards.length" class="ov-anomaly-grid">
          <div v-for="c in anomalyCards" :key="c.category" class="ov-acard" :class="`ov-acard--${c.tone}`">
            <div class="ov-acard-head">
              <span class="ov-acard-name">{{ c.category }}</span>
              <span class="ov-acard-count u-num" :class="`ov-acard-count--${c.tone}`">{{ c.count }}</span>
            </div>
            <div class="ov-acard-blurb">{{ BLURB[c.category] }}</div>
            <div class="ov-acard-ops">
              <RouterLink class="ov-acard-link" :to="catLink(c.category)">查看清单 →</RouterLink>
              <button class="ov-acard-toggle" type="button" @click="toggle(c.category)">
                展开 <span class="ov-acard-arrow" :class="{ 'ov-acard-arrow--open': expanded[c.category] }">▾</span>
              </button>
            </div>
            <div v-if="expanded[c.category]" class="ov-acard-body">
              <button v-for="it in cardItems(c.category)" :key="it.projectId" type="button"
                class="ov-acard-item" @click="router.push(`/project/${it.projectId}`)">
                <span class="ov-acard-item-name">{{ it.primary }}</span>
                <span class="ov-acard-item-detail">{{ it.secondary }}</span>
              </button>
              <RouterLink v-if="c.count > cardItems(c.category).length" class="ov-acard-all" :to="catLink(c.category)">
                查看全部 {{ c.count }} 个 →
              </RouterLink>
            </div>
          </div>
        </div>
        <div v-else class="ov-anomaly-empty">暂无需要处理的异常</div>
      </section>

      <aside class="ov-aside">
        <div class="ov-aside-title">项目动态</div>
        <EventTimeline :events="recentEvents" empty-text="首次同步，暂无变化记录" />
        <RouterLink class="ov-more" to="/activity">查看全部 →</RouterLink>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.overview-view { padding: var(--sp-4); }

/* 体检带 */
.ov-band {
  display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: var(--sp-5); background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r-lg); padding: var(--card-pad); box-shadow: var(--shadow-1);
  margin-bottom: var(--gap-section);
}
.ov-band-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); margin-bottom: var(--sp-3); flex-wrap: wrap; }
.ov-band-title { font-size: var(--fs-2); font-weight: 700; color: var(--txt); }
.ov-band-ctx { font-size: var(--fs-1); color: var(--sub); }
.ov-band-pay { display: flex; align-items: center; gap: var(--sp-4); border-left: 1px solid var(--line); padding-left: var(--sp-5); }
.ov-ring-link { text-decoration: none; flex: none; }
.ov-pay-stats { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; flex: 1; }
.ov-pay-stat { display: block; text-decoration: none; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-sm); }
.ov-pay-stat:hover { background: var(--hover-tint); }
.ov-pay-bar { height: 8px; background: var(--line); border-radius: var(--r-full); overflow: hidden; margin-bottom: var(--sp-1); }
.ov-pay-fill { height: 100%; background: var(--accent); }
.ov-pay-v { font-size: var(--fs-3); font-weight: 700; color: var(--txt); white-space: nowrap; }
.ov-pay-k { font-size: var(--fs-1); color: var(--mut); }

/* 下半区 */
.ov-lower { display: grid; grid-template-columns: minmax(0, 7fr) minmax(260px, 3fr); gap: var(--sp-4); align-items: start; }

/* 异常分诊 */
.ov-anomaly-title { font-size: var(--fs-2); font-weight: 700; color: var(--txt); margin-bottom: var(--sp-3); }
.ov-anomaly-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap-card); }
.ov-acard { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); padding-left: calc(var(--card-pad) + var(--sp-1)); box-shadow: var(--shadow-1); overflow: hidden; }
.ov-acard::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.ov-acard--danger::before { background: var(--danger); }
.ov-acard--warn::before { background: var(--warn); }
.ov-acard--mut::before { background: var(--mut); }
.ov-acard-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); }
.ov-acard-name { font-size: var(--fs-2); font-weight: 600; color: var(--txt); }
.ov-acard-count { font-size: var(--fs-4); font-weight: 700; }
.ov-acard-count--danger { color: var(--danger); }
.ov-acard-count--warn { color: var(--warn); }
.ov-acard-count--mut { color: var(--mut); }
.ov-acard-blurb { font-size: var(--fs-1); color: var(--sub); margin-top: var(--sp-1); }
.ov-acard-ops { display: flex; align-items: center; justify-content: space-between; margin-top: var(--sp-2); }
.ov-acard-link { font-size: var(--fs-1); color: var(--accent); text-decoration: none; font-weight: 600; }
.ov-acard-toggle { border: none; background: none; cursor: pointer; font-size: var(--fs-1); color: var(--sub); display: inline-flex; align-items: center; gap: var(--sp-1); }
.ov-acard-arrow { display: inline-block; transition: transform var(--dur-2) var(--ease); }
.ov-acard-arrow--open { transform: rotate(180deg); }
.ov-acard-body { margin-top: var(--sp-2); padding-top: var(--sp-2); border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 2px; }
.ov-acard-item { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-3); border: none; background: none; padding: 3px 0; font-size: var(--fs-1); color: var(--txt); cursor: pointer; text-align: left; width: 100%; }
.ov-acard-item:hover { color: var(--accent); }
.ov-acard-item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-acard-item-detail { color: var(--sub); white-space: nowrap; }
.ov-acard-all { font-size: var(--fs-1); color: var(--accent); text-decoration: none; margin-top: var(--sp-1); }
.ov-anomaly-empty { font-size: var(--fs-1); color: var(--mut); padding: var(--sp-4); background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }

/* 右栏动态 */
.ov-aside { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4); box-shadow: var(--shadow-1); }
.ov-aside-title { font-weight: 700; font-size: var(--fs-2); color: var(--txt); margin-bottom: var(--sp-2); }
.ov-more { font-size: var(--fs-1); color: var(--accent); text-decoration: none; font-weight: 600; }

@media (max-width: 1200px) {
  .ov-lower { grid-template-columns: 1fr; }
  .ov-band { grid-template-columns: 1fr; }
  .ov-band-pay { border-left: none; border-top: 1px solid var(--line); padding-left: 0; padding-top: var(--sp-4); }
}
@media (max-width: 768px) {
  .ov-band-pay { flex-direction: column; align-items: stretch; }
}
</style>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/views/OverviewView.test.ts`
Expected: PASS（含 `OverviewView` 6 用例 + `OverviewView 标签排除` 2 用例，全 passed）

- [ ] **Step 5: typecheck 确认无类型错误**

Run: `cd frontend && npm run typecheck`
Expected: 退出码 0、无报错

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/OverviewView.vue frontend/src/views/OverviewView.test.ts
git commit -m "feat(overview): 首页重做为体检带+异常分诊卡+右栏(V2.5.0,删冗余)"
```

---

### Task 4: 版本号 + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `APP_VERSION = 'V2.5.0'`、`RELEASE_DATE = '2026-06-30'`。

- [ ] **Step 1: 改版本号**

把 `frontend/src/version.ts` 第 2~3 行
```ts
export const APP_VERSION = 'V2.4.0'
export const RELEASE_DATE = '2026-06-29'
```
改为
```ts
export const APP_VERSION = 'V2.5.0'
export const RELEASE_DATE = '2026-06-30'
```

- [ ] **Step 2: 前端构建确认通过**

Run: `cd frontend && npm run build`
Expected: 构建成功、无报错（dist 重新生成）

- [ ] **Step 3: 全量验证 verify.sh 全绿**

Run: `bash verify.sh`
Expected: 语法编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts
git commit -m "chore(V2.5.0): 版本号 + 发布日期"
```

---

## 真机冒烟（实现完成后，合并前由控制者执行）

> 这步不写入子任务（无单测断言），由 subagent-driven 流程末尾的真机核对完成，沿用本会话 puppeteer 截图脚本（`scratchpad/shots/shoot.mjs`，登录 admin/wxtnb，访问 `/`）。逐项目验：
- before/after 对比：体检带（健康分段条 + 回款环 50.9%）、异常分诊卡（成本超支/风险未闭环/回款延期/里程碑滞后，按序）、右栏动态。
- 深色主题：切「深色」，环/分段条/色条/状态色正常，无白底突兀。
- 三档字号：小/中/大切换，整体缩放不破版。
- 断点：窗口 ≤1200px（下半区并 1 列、体检带左右堆叠）、≤768px（回款竖排）。
- 空态：无回款合同时环显「-」；异常 0 类时显「暂无需要处理的异常」。
- 下钻：点健康「风险」段 → `/projects?health=风险`；异常卡「查看清单」→ `/projects?riskCategory=…`；展开点项目 → `/project/:id`；回款各块 → `/payment`。

## Self-Review（写计划后自查）

- **Spec 覆盖**：体检带(§4.1)→Task3 体检带模板；健康分段条→Task2+Task3；回款环→Task1+Task3；异常分诊(§4.2)→Task3 anomalyCards+卡片；右栏(§4.3)→Task3 aside；删/合清单(§6)→Task3（无 `.ov-kpis/.ov-focus/进度异常/健康度低`）；数据映射(§5)→Task3 script 全部复用现有 lib；响应式/主题(§8)→Task3 media query + 全令牌；版本(§10)→Task4；验证(§11)→各任务 vitest + Task4 verify.sh + 冒烟段。无遗漏。
- **占位符扫描**：无 TBD/TODO；每个改代码步骤均给完整代码与确切命令/预期。
- **类型一致**：`RatioRing` props（`ratio/label/size/thickness/color`）、`HealthSegmentBar` props（`segments/height/minSegmentPct`，段字段 `key/label/count/color/to`）在 Task1/2 定义与 Task3 调用一致；`classifyProjects` 返回 `tone:'warn'|'danger'|'mut'` 与 `SEVERITY_ORDER`/`.ov-acard--{tone}` 键一致；`band.delayedTop` 字段 `projectId/projectName/stage/remaining` 与 `cardItems` 使用一致。
