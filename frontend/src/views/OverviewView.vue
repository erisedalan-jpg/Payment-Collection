<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { Event, Project, ProjectPmis } from '@/types/analysis'
import { computeKpis, healthSummary, paymentBand } from '@/lib/overview'
import { paymentNodeRows } from '@/lib/paymentPmis'
import { useFilterStore } from '@/stores/filter'
import { fmtWan, fmtRatio } from '@/lib/format'
import HealthBadge from '@/components/HealthBadge.vue'
import EventTimeline from '@/components/EventTimeline.vue'
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

// KPI 卡带跳转(用户实测反馈 2026-06-11,推翻原"不可点击"决策):前五张带筛选进清单,达成率进回款总览
const kpiCards = computed(() => [
  { k: '在管项目', v: String(kpis.value.total), to: '/projects' },
  { k: '进行中', v: String(kpis.value.active), to: '/projects?projectStatus=实施中' }, // spec 4.1 用词;口径=项目状态'实施中'
  { k: '暂停', v: String(kpis.value.paused), to: '/projects?paused=yes' },
  { k: '高风险', v: String(kpis.value.highRisk), to: '/projects?riskLevel=高' },
  { k: '超支', v: String(kpis.value.overspend), to: '/projects?overspend=yes' },
])
const HEALTH_KEYS = ['健康', '关注', '风险'] as const
const DIM_LABELS = [['progress', '进度'], ['risk', '风险'], ['cost', '成本'], ['payment', '回款']] as const
const yearPct = computed(() => (band.value.yearExpected > 0 ? Math.min(band.value.yearActual / band.value.yearExpected, 1) : 0))

const rows = computed(() => buildProjectRows(projects.value, pmisMap.value))
const classEntries = computed(() => classifyProjects(rows.value))
const expandedCategory = ref<string | null>(null)
function toggleCategory(cat: string) {
  expandedCategory.value = expandedCategory.value === cat ? null : cat
}
defineExpose({ baseProjects })
</script>

<template>
  <div class="overview-view">
    <div class="ov-body">
      <div class="ov-main">
        <div class="ov-kpis">
          <RouterLink v-for="c in kpiCards" :key="c.k" class="ov-kpi" :to="c.to">
            <div class="ov-kpi-v u-num">{{ c.v }}</div>
            <div class="ov-kpi-k">{{ c.k }}</div>
          </RouterLink>
          <RouterLink class="ov-kpi accent" to="/payment">
            <div class="ov-kpi-v u-num">{{ fmtRatio(kpis.paymentRatio) }}</div>
            <div class="ov-kpi-k">回款达成率</div>
          </RouterLink>
        </div>

        <section class="ov-card">
          <div class="ov-card-head">项目健康度</div>
          <div class="ov-health-row">
            <RouterLink v-for="k in HEALTH_KEYS" :key="k" class="ov-health-chip ov-health-chip--link" :to="`/projects?health=${k}`">
              <HealthBadge :overall="k" /><b class="u-num">{{ health.counts[k] }}</b>
            </RouterLink>
            <span v-if="health.counts.无数据" class="ov-health-chip">
              <HealthBadge overall="无数据" /><b class="u-num">{{ health.counts.无数据 }}</b>
            </span>
            <span v-for="[key, label] in DIM_LABELS" :key="key" class="ov-dim">{{ label }}异常 <b class="u-num">{{ health.dims[key] }}</b></span>
          </div>
          <!-- 6 类风险分类（已去掉冗余的单项目风险卡片列表，健康度卡仅留汇总+分类，单项目经下钻清单查看） -->
          <div class="ov-risk-cats">
            <div v-for="entry in classEntries" :key="entry.category" class="ov-rcat">
              <div class="ov-rcat-head" :class="`ov-rcat-head--${entry.tone}`" @click="toggleCategory(entry.category)">
                <span class="ov-rcat-label">{{ entry.category }}</span>
                <span class="ov-rcat-count u-num">{{ entry.count }}</span>
                <RouterLink
                  v-if="entry.count > 0"
                  class="ov-rcat-link"
                  :to="`/projects?riskCategory=${encodeURIComponent(entry.category)}`"
                  @click.stop
                >查看清单</RouterLink>
                <span class="ov-rcat-arrow" :class="{ 'ov-rcat-arrow--open': expandedCategory === entry.category }">▾</span>
              </div>
              <div v-if="expandedCategory === entry.category && entry.projects.length" class="ov-rcat-body">
                <button
                  v-for="p in entry.projects"
                  :key="p.projectId"
                  class="ov-rcat-item"
                  @click="router.push(`/project/${p.projectId}`)"
                >
                  <span class="ov-rcat-item-name">{{ p.projectName || p.projectId }}</span>
                  <span class="ov-rcat-item-detail">{{ p.detail }}</span>
                </button>
                <div v-if="!entry.projects.length" class="ov-empty-mini">无命中项目</div>
              </div>
              <div v-if="expandedCategory === entry.category && !entry.projects.length" class="ov-rcat-body">
                <div class="ov-empty-mini">无命中项目</div>
              </div>
            </div>
          </div>
        </section>

        <section class="ov-card ov-pay">
          <div class="ov-card-head">回款重点 <RouterLink class="ov-more" to="/payment">回款总览 →</RouterLink></div>
          <div class="ov-pay-grid">
            <RouterLink class="ov-pay-block" to="/payment">
              <div class="ov-pay-bar"><div class="ov-pay-fill" :style="{ width: yearPct * 100 + '%' }"></div></div>
              <div class="ov-pay-v u-num">{{ fmtWan(band.yearActual) }} / {{ fmtWan(band.yearExpected) }} 万</div>
              <div class="ov-pay-k">年度回款进度</div>
            </RouterLink>
            <RouterLink class="ov-pay-block" to="/payment">
              <div class="ov-pay-v u-num">{{ fmtWan(band.monthPending) }} 万</div>
              <div class="ov-pay-k">本月待回款</div>
            </RouterLink>
            <RouterLink class="ov-pay-block" to="/payment">
              <div class="ov-pay-v u-num">{{ band.dueSoon7 }}</div>
              <div class="ov-pay-k">7 天临期</div>
            </RouterLink>
            <div class="ov-pay-block">
              <div class="ov-pay-k">延期 Top3（待回金额）</div>
              <button v-for="t in band.delayedTop" :key="`${t.projectId}-${t.stage}`" class="ov-top-item" @click="router.push(`/project/${t.projectId}`)">
                <span class="ov-top-name">{{ t.projectName || t.projectId }}</span>
                <span class="u-num">{{ fmtWan(t.remaining) }} 万</span>
              </button>
              <div v-if="!band.delayedTop.length" class="ov-empty-mini">无延期节点</div>
            </div>
          </div>
        </section>

        <section class="ov-focus">
          <RouterLink class="ov-focus-card danger" to="/projects?riskLevel=高">高风险 <b class="u-num">{{ kpis.highRisk }}</b></RouterLink>
          <RouterLink class="ov-focus-card warn" to="/projects?paused=yes">暂停 <b class="u-num">{{ kpis.paused }}</b></RouterLink>
          <RouterLink class="ov-focus-card warn" to="/projects?overspend=yes">超支 <b class="u-num">{{ kpis.overspend }}</b></RouterLink>
        </section>
      </div>

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
.ov-body { display: grid; grid-template-columns: minmax(0, 7fr) minmax(260px, 3fr); gap: var(--sp-4); align-items: start; }
.ov-kpis { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-4); }
.ov-kpi { flex: 1; min-width: 110px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4); display: block; text-decoration: none; }
.ov-kpi:hover { background: var(--hover-tint); }
.ov-kpi.accent { border-color: var(--accent); }
.ov-kpi.accent .ov-kpi-v { color: var(--accent); }
.ov-kpi-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight, 1.15); }
.ov-kpi-k { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-1); }
.ov-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-4) var(--sp-4); margin-bottom: var(--sp-4); }
.ov-card-head { font-weight: 700; font-size: var(--fs-2); color: var(--txt); margin-bottom: var(--sp-3); display: flex; justify-content: space-between; align-items: center; }
.ov-more { font-size: var(--fs-1); color: var(--accent); text-decoration: none; font-weight: 600; }
.ov-health-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-4); margin-bottom: var(--sp-3); }
/* 三档计数行放大(用户反馈):数字升 --fs-4,徽章随 --fs-2 */
.ov-health-chip { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-2); color: var(--txt); }
.ov-health-chip b { font-size: var(--fs-4); }
.ov-health-chip :deep(.health-badge) { font-size: var(--fs-2); }
.ov-dim { font-size: var(--fs-1); color: var(--sub); }
.ov-dim b { color: var(--txt); }
.ov-pay { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.ov-pay-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--sp-3); }
.ov-pay-block { display: block; background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); padding: var(--sp-3) var(--sp-3); text-decoration: none; }
.ov-pay-block:hover { background: var(--hover-tint); }
.ov-pay-bar { height: 8px; background: var(--line); border-radius: var(--r-full); overflow: hidden; margin-bottom: var(--sp-2); }
.ov-pay-fill { height: 100%; background: var(--accent); }
.ov-pay-v { font-size: var(--fs-3); font-weight: 700; color: var(--txt); white-space: nowrap; }
.ov-pay-k { font-size: var(--fs-1); color: var(--mut); margin-top: 2px; }
.ov-top-item { display: flex; justify-content: space-between; gap: var(--sp-2); width: 100%; border: none; background: none; padding: 3px 0; font-size: var(--fs-1); color: var(--txt); cursor: pointer; text-align: left; }
.ov-top-item:hover { color: var(--accent); }
/* flex:1+min-width:0 缺一不可——flex 子项默认 min-width:auto 不收缩,59 字真实项目名会撑破卡片 */
.ov-top-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-empty-mini { font-size: var(--fs-1); color: var(--mut); }
.ov-focus { display: flex; gap: var(--sp-3); }
.ov-focus-card { flex: 1; display: flex; justify-content: space-between; align-items: center; padding: var(--sp-3) var(--sp-4); border-radius: var(--r-md); font-size: var(--fs-2); font-weight: 600; text-decoration: none; border: 1px solid var(--line); }
.ov-focus-card b { font-size: var(--fs-4); }
.ov-focus-card.danger { background: var(--danger-bg); color: var(--danger-text); }
.ov-focus-card.warn { background: var(--warn-bg); color: var(--warn-text); }
.ov-aside { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4); }
.ov-aside-title { font-weight: 700; font-size: var(--fs-2); color: var(--txt); margin-bottom: var(--sp-2); }
@media (max-width: 1200px) { .ov-body { grid-template-columns: 1fr; } }

/* 健康度 chip 可点击 */
.ov-health-chip--link { text-decoration: none; cursor: pointer; }
.ov-health-chip--link:hover { opacity: 0.8; }

/* 风险分类区 */
.ov-risk-cats { margin-top: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); }
.ov-rcat { border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden; }
.ov-rcat-head { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); cursor: pointer; user-select: none; }
.ov-rcat-head--warn { background: var(--warn-bg); color: var(--warn-text); }
.ov-rcat-head--danger { background: var(--danger-bg); color: var(--danger-text); }
.ov-rcat-head--mut { background: var(--card2); color: var(--sub); }
.ov-rcat-label { font-size: var(--fs-2); font-weight: 600; flex: 1; }
.ov-rcat-count { font-size: var(--fs-2); font-weight: 700; min-width: 28px; text-align: right; }
.ov-rcat-link { font-size: var(--fs-1); text-decoration: none; opacity: 0.85; padding: 0 var(--sp-2); border-radius: var(--r-sm); border: 1px solid currentColor; }
.ov-rcat-link:hover { opacity: 1; }
.ov-rcat-arrow { font-size: var(--fs-1); transition: transform var(--dur-2) var(--ease); display: inline-block; }
.ov-rcat-arrow--open { transform: rotate(180deg); }
.ov-rcat-body { background: var(--card2); padding: var(--sp-2) var(--sp-3); display: flex; flex-direction: column; gap: 2px; }
.ov-rcat-item { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-3); border: none; background: none; padding: 3px 0; font-size: var(--fs-1); color: var(--txt); cursor: pointer; text-align: left; width: 100%; }
.ov-rcat-item:hover { color: var(--accent); }
.ov-rcat-item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-rcat-item-detail { color: var(--sub); font-size: var(--fs-1); white-space: nowrap; }
</style>
