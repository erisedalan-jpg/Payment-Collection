<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { Event, Project, ProjectPmis, RawNode } from '@/types/analysis'
import { computeKpis, healthSummary, paymentBand } from '@/lib/overview'
import { fmtWan, fmtRatio } from '@/lib/format'
import HealthBadge from '@/components/HealthBadge.vue'
import EventTimeline from '@/components/EventTimeline.vue'

const data = useDataStore()
const router = useRouter()
onMounted(() => { if (!data.data) data.load() })

const projects = computed(() => (data.data?.projects ?? []) as Project[])
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)

const kpis = computed(() => computeKpis(projects.value, pmisMap.value))
const health = computed(() => healthSummary(projects.value))
const band = computed(() => paymentBand((data.data?.rawNodes ?? []) as RawNode[], new Date()))
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
            <span v-for="k in HEALTH_KEYS" :key="k" class="ov-health-chip">
              <HealthBadge :overall="k" /><b class="u-num">{{ health.counts[k] }}</b>
            </span>
            <span v-if="health.counts.无数据" class="ov-health-chip">
              <HealthBadge overall="无数据" /><b class="u-num">{{ health.counts.无数据 }}</b>
            </span>
            <span v-for="[key, label] in DIM_LABELS" :key="key" class="ov-dim">{{ label }}异常 <b class="u-num">{{ health.dims[key] }}</b></span>
          </div>
          <div v-if="health.riskProjects.length" class="ov-risk-list">
            <button v-for="p in health.riskProjects" :key="p.projectId" class="ov-risk-card" @click="router.push(`/project/${p.projectId}`)">
              <span class="ov-risk-name">{{ p.projectName || p.projectId }}</span>
              <HealthBadge overall="风险" />
            </button>
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
            <RouterLink class="ov-pay-block" to="/followup">
              <div class="ov-pay-v u-num">{{ band.dueSoon7 }}</div>
              <div class="ov-pay-k">7 天临期</div>
            </RouterLink>
            <div class="ov-pay-block">
              <div class="ov-pay-k">延期 Top3（待回金额）</div>
              <button v-for="t in band.delayedTop" :key="`${t.projectId}-${t.nodeName}`" class="ov-top-item" @click="router.push(`/project/${t.projectId}`)">
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
.overview-view { padding: 16px; }
.ov-body { display: grid; grid-template-columns: minmax(0, 7fr) minmax(260px, 3fr); gap: 16px; align-items: start; }
.ov-kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.ov-kpi { flex: 1; min-width: 110px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px 16px; display: block; text-decoration: none; }
.ov-kpi:hover { background: var(--hover-tint); }
.ov-kpi.accent { border-color: var(--accent); }
.ov-kpi.accent .ov-kpi-v { color: var(--accent); }
.ov-kpi-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight, 1.15); }
.ov-kpi-k { font-size: var(--fs-1); color: var(--mut); margin-top: 4px; }
.ov-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px 16px; margin-bottom: 16px; }
.ov-card-head { font-weight: 700; font-size: var(--fs-2); color: var(--txt); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
.ov-more { font-size: var(--fs-1); color: var(--accent); text-decoration: none; font-weight: 600; }
.ov-health-row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 10px; }
/* 三档计数行放大(用户反馈):数字升 --fs-4,徽章随 --fs-2 */
.ov-health-chip { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-2); color: var(--txt); }
.ov-health-chip b { font-size: var(--fs-4); }
.ov-health-chip :deep(.health-badge) { font-size: var(--fs-2); }
.ov-dim { font-size: var(--fs-1); color: var(--sub); }
.ov-dim b { color: var(--txt); }
.ov-risk-list { display: flex; flex-wrap: wrap; gap: 8px; }
.ov-risk-card { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--card2); border-radius: var(--r-sm); padding: 6px 10px; font-size: var(--fs-2); color: var(--txt); cursor: pointer; }
.ov-risk-card:hover { background: var(--hover-tint); }
.ov-risk-name { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-pay { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.ov-pay-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.ov-pay-block { display: block; background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 10px 12px; text-decoration: none; }
.ov-pay-block:hover { background: var(--hover-tint); }
.ov-pay-bar { height: 8px; background: var(--line); border-radius: var(--r-full); overflow: hidden; margin-bottom: 6px; }
.ov-pay-fill { height: 100%; background: var(--accent); }
.ov-pay-v { font-size: var(--fs-3); font-weight: 700; color: var(--txt); white-space: nowrap; }
.ov-pay-k { font-size: var(--fs-1); color: var(--mut); margin-top: 2px; }
.ov-top-item { display: flex; justify-content: space-between; gap: 8px; width: 100%; border: none; background: none; padding: 3px 0; font-size: var(--fs-1); color: var(--txt); cursor: pointer; text-align: left; }
.ov-top-item:hover { color: var(--accent); }
/* flex:1+min-width:0 缺一不可——flex 子项默认 min-width:auto 不收缩,59 字真实项目名会撑破卡片(同 DelayTopCard.dtc-name 约定) */
.ov-top-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-empty-mini { font-size: var(--fs-1); color: var(--mut); }
.ov-focus { display: flex; gap: 12px; }
.ov-focus-card { flex: 1; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: var(--r-md); font-size: var(--fs-2); font-weight: 600; text-decoration: none; border: 1px solid var(--line); }
.ov-focus-card b { font-size: var(--fs-4); }
.ov-focus-card.danger { background: var(--danger-bg); color: var(--danger-text); }
.ov-focus-card.warn { background: var(--warn-bg); color: var(--warn-text); }
.ov-aside { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px 14px; }
.ov-aside-title { font-weight: 700; font-size: var(--fs-2); color: var(--txt); margin-bottom: 8px; }
@media (max-width: 1200px) { .ov-body { grid-template-columns: 1fr; } }
</style>
