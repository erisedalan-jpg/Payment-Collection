<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { Project, ProjectPmis, RawNode, Event } from '@/types/analysis'
import { buildProjectPage, RISK_COLUMNS, fmtDateCell } from '@/lib/projectPage'
import { fmtWan, fmtRatio } from '@/lib/format'
import { formatCellValue } from '@/lib/cellFormat'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import HealthBadge from '@/components/HealthBadge.vue'
import FollowupRecords from '@/components/FollowupRecords.vue'
import EventTimeline from '@/components/EventTimeline.vue'

const route = useRoute()
const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const page = computed(() =>
  buildProjectPage(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
    (data.data?.rawNodes ?? []) as RawNode[],
    String(route.params.id || ''),
  ),
)
const p = computed(() => page.value.project)
const m = computed(() => (page.value.pmis ?? {}) as Record<string, any>)

// —— 头部徽章（真实取值域：是否暂停 bool；评级 A/B/C…；项目阶段 启动/规划/执行/收尾）——
const stage = computed(() => m.value.progress?.项目阶段 || '')
const paused = computed(() => m.value.status?.是否暂停 === true)
const rating = computed(() => m.value.status?.评级 || '')

const metrics = computed(() => [
  { k: '完工进展', v: fmtRatio(m.value.progress?.完工进展) },
  { k: '里程碑状态', v: m.value.progress?.里程碑进度状态 || '-' },
  { k: '计划终验', v: fmtDateCell(m.value.progress?.计划终验) },
  { k: '风险', v: m.value.risk?.最高等级 ? `${m.value.risk.最高等级}(${m.value.risk?.未关闭风险数 ?? 0} 未关闭)` : '无' },
  { k: '预算消耗比', v: fmtRatio(m.value.cost?.消耗比) },
  { k: '回款完成率', v: fmtRatio(p.value?.payment?.paymentRatio) },
])

// —— Tab（回款为默认：重点子域，spec 4.2）——
const TABS = [
  { key: 'payment', label: '回款' },
  { key: 'progress', label: '进度里程碑' },
  { key: 'risk', label: '风险' },
  { key: 'cost', label: '预算核算' },
]
const tab = ref('payment')
const showOrigin = computed(() => !!p.value?.isPresale)
// 同组件复用(/project/A → /project/B)时回到默认回款 Tab——否则售前→非售前会留下无高亮的孤立 origin 内容
watch(() => route.params.id, () => { tab.value = 'payment' })

// —— 回款 ——
const paySummary = computed(() => {
  const pay = p.value?.payment
  return [
    { k: '计划回款(万)', v: fmtWan(pay?.expectedTotal) },
    { k: '已回款(万)', v: fmtWan(pay?.actualTotal) },
    { k: '待回款(万)', v: fmtWan(pay?.remainingTotal) },
    { k: '完成率', v: fmtRatio(pay?.paymentRatio) },
    { k: '延期节点', v: String(pay?.delayedCount ?? 0) },
  ]
})
const NODE_COLS: DataColumn[] = [
  { key: 'nodeName', label: '节点' },
  { key: 'planDate', label: '计划日期' },
  { key: 'expectedPayment', label: '计划回款' },
  { key: 'actualPayment', label: '已回款' },
  { key: 'actualPaymentRatio', label: '实际比例' },
  { key: 'nodeStatus', label: '状态' },
  { key: 'delayDays', label: '延期天数' },
].map((c) => ({ ...c, formatter: (v: unknown) => formatCellValue(v, c.key) }))

// —— 进度里程碑 ——
const progressInfo = computed(() => [
  { k: '完工进展', v: fmtRatio(m.value.progress?.完工进展) },
  { k: '项目阶段', v: m.value.progress?.项目阶段 || '-' },
  { k: '里程碑进度状态', v: m.value.progress?.里程碑进度状态 || '-' },
  { k: '计划终验', v: fmtDateCell(m.value.progress?.计划终验) },
])
// 里程碑明细=《项目回款节点（里程碑）清单》各行(P5.5 用户反馈;PMIS 无逐里程碑数据,仅百分比/状态枚举)
const MILESTONE_COLS: DataColumn[] = [
  { key: 'nodeName', label: '里程碑/节点' },
  { key: 'expectedMilestoneDate', label: '计划里程碑日期', width: 120, formatter: (v) => fmtDateCell(v) },
  { key: 'planDate', label: '计划回款日', width: 110, formatter: (v) => fmtDateCell(v) },
  { key: 'isMilestoneAchieved', label: '是否达成', width: 90, formatter: (v) => String(v ?? '-') },
  { key: 'actualDate', label: '实际日期', width: 110, formatter: (v) => fmtDateCell(v) },
  { key: 'completionStatus', label: '完成状态', width: 130, formatter: (v) => String(v ?? '-') },
]

// —— 风险 ——
const riskSummary = computed(() => [
  { k: '未关闭风险', v: String(m.value.risk?.未关闭风险数 ?? 0) },
  { k: '风险记录数', v: String(m.value.risk?.风险记录数 ?? 0) },
  { k: '最高等级', v: m.value.risk?.最高等级 || '无' },
  { k: '闭环率', v: fmtRatio(m.value.risk?.闭环率) },
])
const riskCols: DataColumn[] = RISK_COLUMNS.map((c) => ({
  key: c.key,
  label: c.label,
  width: c.width,
  formatter: c.date ? (v: unknown) => fmtDateCell(v) : undefined,
}))
const riskRows = computed(() => (m.value.riskRecords ?? []) as Record<string, any>[])

// —— 预算核算 ——
const costSummary = computed(() => [
  { k: '总预算(万)', v: fmtWan(m.value.cost?.总预算) },
  { k: '核算(万)', v: fmtWan(m.value.cost?.核算) },
  { k: '剩余预算(万)', v: fmtWan(m.value.cost?.剩余预算) },
  { k: '消耗比', v: fmtRatio(m.value.cost?.消耗比) },
  { k: '成本状态', v: m.value.cost?.成本状态 || '-' },
  { k: '超支', v: m.value.cost?.超支 === true ? '是' : '否' },
])
const COST_COLS: DataColumn[] = [
  { key: '类别', label: '类别' },
  { key: '预算金额', label: '预算金额(万)', formatter: (v) => fmtWan(v as number) },
  { key: '实际发生', label: '实际发生(万)', formatter: (v) => fmtWan(v as number) },
  { key: '剩余预算', label: '剩余预算(万)', formatter: (v) => fmtWan(v as number) },
  { key: '消耗率', label: '消耗率', formatter: (v) => fmtRatio(v) },
]
const costRows = computed(() => (p.value?.deliveryCosts ?? []) as Record<string, any>[])

// —— 右栏:本项目动态(P3;spec 4.2 布局 B 右栏,与 /activity 同构) ——
const myEvents = computed(() =>
  ((data.data?.events ?? []) as Event[]).filter((e) => !!p.value?.projectId && e.projectId === p.value.projectId),
)

// —— 原项目（售前整合，两份信息并存：spec 3.2 + 5）——
const cm = computed(() => (page.value.closedPmis ?? {}) as Record<string, any>)
const originInfo = computed(() => [
  { k: '原项目编号', v: page.value.closedId || '-' },
  { k: '原项目名称', v: cm.value.team?.项目名称 || '-' },
  { k: '项目经理', v: cm.value.team?.项目经理 || '-' },
  { k: '最终客户', v: cm.value.customer?.最终客户 || '-' },
  { k: '合同总额(万)', v: fmtWan(cm.value.customer?.合同总额) },
  { k: '项目状态', v: cm.value.status?.项目状态 || '-' },
  { k: '项目阶段', v: cm.value.progress?.项目阶段 || '-' },
  { k: '完工进展', v: fmtRatio(cm.value.progress?.完工进展) },
])
</script>

<template>
  <div class="project-detail-view">
    <div v-if="!p" class="pd-404">
      <div class="pd-404-title">未找到该项目</div>
      <div class="pd-404-sub">项目编号 {{ route.params.id }} 不在项目主域中（仅含交付实施三部在建项目）。</div>
      <RouterLink to="/projects" class="pd-404-link">← 返回项目清单</RouterLink>
    </div>

    <template v-else>
      <div class="pd-body">
        <div class="pd-main">
          <div class="pd-head">
            <h2 class="pd-name">{{ p.projectName || p.projectId }}</h2>
            <span v-if="stage" class="pd-badge stage">{{ stage }}</span>
            <span v-if="paused" class="pd-badge paused">已暂停</span>
            <span v-if="rating" class="pd-badge rating">评级 {{ rating }}</span>
            <span v-if="p.isPresale" class="pd-badge origin" title="含已关闭原项目信息">原项目</span>
            <HealthBadge :overall="p.health?.overall || '无数据'" />
          </div>
          <div class="pd-meta">
            <span>编号 <b>{{ p.projectId }}</b></span>
            <span>客户 <b>{{ m.customer?.最终客户 || '-' }}</b></span>
            <span>合同总额(万) <b class="u-num">{{ fmtWan(m.customer?.合同总额) }}</b></span>
            <span>项目经理 <b>{{ p.projectManager || '-' }}</b></span>
            <span>服务组 <b>{{ p.orgL4 || '-' }}</b></span>
          </div>

          <div class="pd-metrics">
            <div v-for="it in metrics" :key="it.k" class="pd-metric">
              <div class="pd-metric-v u-num">{{ it.v }}</div>
              <div class="pd-metric-k">{{ it.k }}</div>
            </div>
          </div>

          <nav class="pd-tabs">
            <button v-for="t in TABS" :key="t.key" class="pd-tab" :class="{ active: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
            <button v-if="showOrigin" class="pd-tab" :class="{ active: tab === 'origin' }" @click="tab = 'origin'">原项目</button>
          </nav>

          <section v-if="tab === 'payment'" class="pd-section">
            <div class="pd-chips">
              <div v-for="it in paySummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <DataTable :columns="NODE_COLS" :rows="page.nodes" />
            <div class="pd-section-title">跟进记录</div>
            <FollowupRecords :project-id="p.projectId" :project-name="p.projectName || ''" />
          </section>

          <section v-else-if="tab === 'progress'" class="pd-section">
            <div class="pd-chips">
              <div v-for="it in progressInfo" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <div class="pd-section-title">里程碑明细（来源：项目回款节点（里程碑）清单）</div>
            <DataTable v-if="page.nodes.length" :columns="MILESTONE_COLS" :rows="page.nodes" :show-count="false" />
            <div v-else class="pd-note">无里程碑节点记录。</div>
          </section>

          <section v-else-if="tab === 'risk'" class="pd-section">
            <div class="pd-chips">
              <div v-for="it in riskSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <DataTable v-if="riskRows.length" :columns="riskCols" :rows="riskRows" />
            <div v-else class="pd-note">无风险记录。</div>
          </section>

          <section v-else-if="tab === 'cost'" class="pd-section">
            <div class="pd-chips">
              <div v-for="it in costSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <div class="pd-note">汇总出处：PMIS《项目状态信息数据》（消耗比=项目核算÷项目总预算）；下方明细出处：delivery_analysis.xlsx，两者口径独立。</div>
            <DataTable v-if="costRows.length" :columns="COST_COLS" :rows="costRows" :show-count="false" />
            <div v-else class="pd-note">未提供预算核算明细（delivery_analysis.xlsx）。</div>
          </section>

          <section v-else-if="tab === 'origin'" class="pd-section">
            <div v-if="!page.closedId" class="pd-note">待提供映射（A.xlsx）——该售前项目尚无已关闭原项目关联。</div>
            <template v-else>
              <div class="pd-note">以下为已关闭原项目信息（标记「原项目」，不计入当前项目汇总）。</div>
              <div v-if="!page.closedPmis" class="pd-note">该原项目在 PMIS 已关闭项目表中无记录，仅能显示编号。</div>
              <div class="pd-chips">
                <div v-for="it in originInfo" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
              </div>
              <template v-if="page.closedNodes.length">
                <div class="pd-section-title">原项目回款节点（不计入当前汇总）</div>
                <DataTable :columns="NODE_COLS" :rows="page.closedNodes" :show-count="false" />
              </template>
            </template>
          </section>
        </div>
        <aside class="pd-aside">
          <div class="pd-aside-title">项目动态</div>
          <EventTimeline :events="myEvents" empty-text="暂无该项目动态" />
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.project-detail-view { padding: 16px; }
.pd-404 { text-align: center; padding: 60px 0; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.pd-404-title { font-size: 18px; font-weight: 700; color: var(--txt); margin-bottom: 8px; }
.pd-404-sub { font-size: 13px; color: var(--mut); margin-bottom: 16px; }
.pd-404-link { color: var(--accent); font-size: 13px; text-decoration: none; font-weight: 600; }
.pd-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.pd-name { font-size: 19px; font-weight: 700; color: var(--txt); margin: 0; }
.pd-badge { display: inline-block; padding: 1px 8px; border-radius: var(--r-full); font-size: 12px; font-weight: 600; line-height: 1.6; }
.pd-badge.stage { background: var(--selected-tint); color: var(--accent); }
.pd-badge.paused { background: var(--warn-bg); color: var(--warn-text); }
.pd-badge.rating { background: var(--card2); color: var(--sub); }
.pd-badge.origin { background: var(--selected-tint); color: var(--accent); }
.pd-meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--sub); margin-bottom: 12px; }
.pd-meta b { color: var(--txt); }
.pd-metrics { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.pd-metric { flex: 1; min-width: 120px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 10px 14px; }
.pd-metric-v { font-size: 16px; font-weight: 700; color: var(--txt); }
.pd-metric-k { font-size: 12px; color: var(--mut); margin-top: 2px; }
.pd-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 12px; }
.pd-tab { border: none; background: none; padding: 8px 14px; font-size: 13px; color: var(--sub); cursor: pointer; border-bottom: 2px solid transparent; }
.pd-tab:hover { background: var(--hover-tint); }
.pd-tab.active { color: var(--accent); font-weight: 700; border-bottom-color: var(--accent); }
.pd-section { margin-bottom: 16px; }
.pd-section-title { font-weight: 700; color: var(--accent); font-size: 13px; margin: 14px 0 8px; }
.pd-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.pd-chip { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); font-size: 13px; }
.pd-chip-k { color: var(--mut); }
.pd-chip-v { color: var(--txt); font-weight: 600; }
.pd-note { font-size: 12px; color: var(--mut); margin-bottom: 10px; }
.pd-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.pd-aside { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px 14px; }
.pd-aside-title { font-weight: 700; font-size: 13px; color: var(--txt); margin-bottom: 8px; }
@media (max-width: 1200px) { .pd-body { grid-template-columns: 1fr; } }
</style>
