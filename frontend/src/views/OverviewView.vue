<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { Event, Project, ProjectPmis } from '@/types/analysis'
import { computeKpis, healthSummary, paymentBand } from '@/lib/overview'
import { paymentNodeRows } from '@/lib/paymentPmis'
import { useFilterStore } from '@/stores/filter'
import { fmtWan } from '@/lib/format'
import EventTimeline from '@/components/EventTimeline.vue'
import SegToggle from '@/components/SegToggle.vue'
import { filterEvents } from '@/lib/activity'
import RatioRing from '@/components/RatioRing.vue'
import HealthSegmentBar from '@/components/HealthSegmentBar.vue'
import { buildProjectRows } from '@/lib/projectList'
import { classifyProjects } from '@/lib/riskClassify'
import TodoQueue from '@/components/TodoQueue.vue'
import { buildTodoQueue } from '@/lib/todoQueue'
import { buildMilestoneProjects } from '@/lib/milestoneAnalytics'

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
  projects.value,
  filter.payRecordsAll,
  filter.dateStart,
  filter.dateEnd,
))
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

// 待办/临期 队列（7/30 天窗口）
const todoWindow = ref<7 | 30>(7)
const milestoneProjects = computed(() =>
  buildMilestoneProjects(projects.value, pmisMap.value, (data.data?.projectMilestones ?? {}) as Record<string, any>),
)
const payNodes = computed(() => paymentNodeRows(data.data?.paymentNodes, projects.value, data.data?.projectPmis))
const pidOverspend = computed(() => new Map(projects.value.map((p) => [p.projectId, p.overspendAmount ?? 0])))
const todoRows = computed(() =>
  rows.value.map((r) => ({ projectId: r.projectId, projectName: r.projectName, riskReasons: r.riskReasons, overspendAmount: pidOverspend.value.get(r.projectId) ?? 0 })),
)
const todoResult = computed(() => buildTodoQueue(payNodes.value, milestoneProjects.value, todoRows.value, new Date(), todoWindow.value))

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

interface DrillItem { key: string; projectId: string; primary: string; secondary: string }
function cardItems(cat: string): DrillItem[] {
  if (cat === '回款延期' && band.value.delayedTop.length) {
    return band.value.delayedTop.map((t, i) => ({
      key: `${t.projectId}-${t.stage}-${i}`, projectId: t.projectId, primary: t.projectName || t.projectId, secondary: `待回 ${fmtWan(t.remaining)} 万`,
    }))
  }
  const entry = classEntries.value.find((e) => e.category === cat)
  return (entry?.projects ?? []).slice(0, 3).map((p, i) => ({
    key: `${p.projectId}-${i}`, projectId: p.projectId, primary: p.projectName || p.projectId, secondary: p.detail,
  }))
}
function catLink(cat: string): string { return `/projects?riskCategory=${encodeURIComponent(cat)}` }

// 本期变化数字条（基线=上次同步；快照不足则 null 不渲染）
const digest = computed(() => {
  const e = data.data?.periodCompare?.lastSync
  if (!e) return null
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n))
  return [
    { k: '阶段推进', v: String(e.advancedProjects ?? 0) },
    { k: '新增延期', v: String(e.newDelayedNodes ?? 0) },
    { k: '回款新增', v: `${fmtWan(e.paymentGained ?? 0)}万` },
    { k: '风险净增', v: sign(e.riskNetChange ?? 0) },
  ]
})

// 事件：默认只看要紧（tone∈warn/danger）+ L4 快筛
const EV_SCOPE_OPTS = [
  { value: 'important', label: '只看要紧' },
  { value: 'all', label: '全部' },
]
const evScope = ref('important') // 'important' | 'all'（用 string 避免 SegToggle v-model 回写 string 时的联合类型不可赋值）
const evL4 = ref('')
const pidL4 = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const p of projects.value) { if (p.projectId && p.orgL4) map[p.projectId] = String(p.orgL4) }
  return map
})
const l4Options = computed(() => {
  const set = new Set<string>()
  for (const p of projects.value) { if (p.orgL4) set.add(String(p.orgL4)) }
  return [{ value: '', label: '全部 L4' }, ...[...set].sort((a, b) => a.localeCompare(b, 'zh-CN')).map((v) => ({ value: v, label: v }))]
})
const shownEvents = computed(() => {
  let evs = (data.data?.events ?? []) as Event[]
  if (evScope.value === 'important') evs = evs.filter((e) => e.tone === 'warn' || e.tone === 'danger')
  if (evL4.value) evs = filterEvents(evs, { domain: '', query: '', types: [], l4: evL4.value }, pidL4.value)
  return evs.slice(0, 10)
})

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
            <div class="ov-acard-body">
              <button v-for="it in cardItems(c.category)" :key="it.key" type="button"
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

      <section class="ov-todo">
        <TodoQueue :result="todoResult" v-model:window-days="todoWindow" />
      </section>

      <aside class="ov-aside">
        <div class="ov-aside-title">项目动态</div>
        <div v-if="digest" class="ov-digest">
          <span v-for="d in digest" :key="d.k" class="ov-digest-i">
            <span class="ov-digest-k">{{ d.k }}</span>
            <span class="ov-digest-v u-num">{{ d.v }}</span>
          </span>
        </div>
        <div class="ov-ev-tools">
          <SegToggle v-model="evScope" :options="EV_SCOPE_OPTS" />
          <el-select v-model="evL4" size="small" style="width: 120px">
            <el-option v-for="o in l4Options" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </div>
        <EventTimeline :events="shownEvents" empty-text="暂无要紧动态" />
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
.ov-lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }

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
.ov-acard-count--danger { color: var(--danger-text); }
.ov-acard-count--warn { color: var(--warn-text); }
.ov-acard-count--mut { color: var(--mut); }
.ov-acard-blurb { font-size: var(--fs-1); color: var(--sub); margin-top: var(--sp-1); }
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
.ov-digest { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-1) var(--sp-3); padding: var(--sp-2) 0; margin-bottom: var(--sp-2); border-bottom: 1px solid var(--line); }
.ov-digest-i { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); }
.ov-digest-k { font-size: var(--fs-1); color: var(--mut); }
.ov-digest-v { font-size: var(--fs-2); font-weight: 700; color: var(--txt); }
.ov-ev-tools { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); flex-wrap: wrap; }

@media (max-width: 1200px) {
  .ov-lower { grid-template-columns: 1fr; }
  .ov-band { grid-template-columns: 1fr; }
  .ov-band-pay { border-left: none; border-top: 1px solid var(--line); padding-left: 0; padding-top: var(--sp-4); }
}
@media (max-width: 768px) {
  .ov-band-pay { flex-direction: column; align-items: stretch; }
}
</style>
