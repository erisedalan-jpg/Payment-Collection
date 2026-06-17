<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import type { Project, ProjectPmis, Event, MilestoneItem, PaymentRecordsEntry, ProjectProfit } from '@/types/analysis'
import { buildProjectPage, RISK_COLUMNS, fmtDateCell } from '@/lib/projectPage'
import { fmtWan, fmtRatio, fmtYuan } from '@/lib/format'
import { formatCellValue } from '@/lib/cellFormat'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import HealthBadge from '@/components/HealthBadge.vue'
import FollowupRecords from '@/components/FollowupRecords.vue'
import EventTimeline from '@/components/EventTimeline.vue'
import MilestoneTable from '@/components/MilestoneTable.vue'
import ProfitTree from '@/components/ProfitTree.vue'

const route = useRoute()
const data = useDataStore()
const projectTags = useProjectTagsStore()
onMounted(() => {
  if (!data.data) data.load()
  if (!projectTags.loaded) projectTags.load()
})

const pid = computed(() => String(route.params.id || ''))
const myTags = computed(() => projectTags.tagsOf(pid.value))
const addInput = ref('')
function assignExisting(name: string) {
  if (!myTags.value.includes(name)) {
    projectTags.setProjectTags(pid.value, [...myTags.value, name])
    projectTags.save()
  }
}
function addOne() {
  const name = addInput.value.trim()
  if (!name) return
  projectTags.addTag(name)
  assignExisting(name)
  addInput.value = ''
}
function removeOne(name: string) {
  projectTags.setProjectTags(pid.value, myTags.value.filter((t) => t !== name))
  projectTags.save()
}

const page = computed(() =>
  buildProjectPage(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
    String(route.params.id || ''),
  ),
)
const p = computed(() => page.value.project)
const m = computed(() => (page.value.pmis ?? {}) as Record<string, any>)

// —— 头部徽章（真实取值域：是否暂停 bool；评级 A/B/C…；项目阶段 启动/规划/执行/收尾）——
const stage = computed(() => m.value.progress?.项目阶段 || '')
const paused = computed(() => m.value.status?.是否暂停 === true)
const rating = computed(() => m.value.status?.评级 || '')

// —— S2:三类超支风险标记 ——
const overBudget = computed(() => {
  const amt = p.value?.overspendAmount
  if (amt == null || amt <= 0) return null
  return { amount: amt, level: amt > 5000 ? 'danger' : 'warn' }
})
const DELIVERY_OVER_CATS = ['交付外包服务成本', '交付部门人工成本']
const deliveryOverBadges = computed(() =>
  (p.value?.deliveryCosts ?? [])
    .filter((c) => DELIVERY_OVER_CATS.includes(c.类别) && c.预算金额 != null && c.实际发生 != null && c.实际发生 > c.预算金额)
    .map((c) => c.类别),
)

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
  { key: 'payrec', label: '回款数据' },
  { key: 'progress', label: '进度里程碑' },
  { key: 'risk', label: '风险' },
  { key: 'cost', label: '预算核算' },
]
const tab = ref('payment')
const showOrigin = computed(() => !!p.value?.isPresale)
// 同组件复用(/project/A → /project/B)时回到默认回款 Tab——否则售前→非售前会留下无高亮的孤立 origin 内容
watch(() => route.params.id, () => { tab.value = 'payment' })

// —— 回款（PMIS 口径）——
const pmisPay = computed(() => p.value?.paymentPmis ?? null)
const pmisNodes = computed(() =>
  ((data.data?.paymentNodes ?? {}) as Record<string, any[]>)[p.value?.projectId || ''] ?? [])
const pmisPaySummary = computed(() => {
  const s = pmisPay.value
  if (!s) return []
  return [
    { k: '合同总额(万)', v: fmtWan(s.contract) },
    { k: '流水累计(万)', v: fmtWan(s.actualTotal) },
    { k: '回款笔数', v: String(s.paymentCount ?? 0) },
    { k: '完成率', v: fmtRatio(s.paymentRatio) },
    { k: '计划回款(万)', v: fmtWan(s.expectedTotal) },
    { k: '已回款/阶段', v: `${s.reachedCount ?? 0}/${s.nodeCount ?? 0}` },
  ]
})
const PMIS_NODE_COLS: DataColumn[] = [
  { key: 'stage', label: '回款阶段' },
  { key: 'planDate', label: '计划日期', formatter: (v) => fmtDateCell(v) },
  { key: 'actualDate', label: '实际日期', formatter: (v) => fmtDateCell(v) },
  { key: 'payRatio', label: '计划比例', formatter: (v) => fmtRatio(v) },
  { key: 'expectedPayment', label: '计划回款(万)', formatter: (v) => fmtWan(v as number) },
  { key: 'receivedAmount', label: '已收(万)', formatter: (v) => fmtWan(v as number) },
  { key: 'unpaidAmount', label: '未收(万)', formatter: (v) => fmtWan(v as number) },
  { key: 'termDays', label: '账期(天)', formatter: (v) => (v == null ? '-' : String(v)) },
  { key: 'payTerm', label: '收款条件', width: 240, wrap: true, formatter: (v) => (v ? String(v) : '-') },
  { key: 'status', label: '状态' },
]

// —— 进度里程碑 ——
const progressInfo = computed(() => [
  { k: '完工进展', v: fmtRatio(m.value.progress?.完工进展) },
  { k: '项目阶段', v: m.value.progress?.项目阶段 || '-' },
  { k: '里程碑进度状态', v: m.value.progress?.里程碑进度状态 || '-' },
  { k: '计划终验', v: fmtDateCell(m.value.progress?.计划终验) },
])
// 进度 tab 的「回款里程碑」表(基于云文档 page.nodes)已于 3A 下线;进度里程碑改由 MilestoneTable(PMIS)承载

// —— R2:项目里程碑(PMIS 里程碑两表)/回款流水/全预算 ——
const myMilestones = computed(() =>
  ((data.data?.projectMilestones ?? {}) as Record<string, MilestoneItem[]>)[p.value?.projectId || ''] ?? [])
const originMilestones = computed(() =>
  ((data.data?.projectMilestones ?? {}) as Record<string, MilestoneItem[]>)[page.value.closedId || ''] ?? [])

const payRec = computed(() =>
  ((data.data?.paymentRecords ?? {}) as Record<string, PaymentRecordsEntry>)[p.value?.projectId || ''] ?? null)
const payRecSummary = computed(() => [
  { k: '累计回款(万)', v: fmtWan(payRec.value?.total) },
  { k: '回款笔数', v: String(payRec.value?.count ?? 0) },
  { k: '最近回款日', v: payRec.value?.lastDate || '-' },
])
function fmtBill(r: Record<string, any>): string {
  const td = [r.billType, r.billDueDate].filter(Boolean).join('·')
  if (td) return td
  if (r.billProtocol) return `互抵:${r.billProtocol}`
  return ''
}

const PAYREC_COLS: DataColumn[] = [
  { key: 'type', label: '回款类型', width: 100 },
  { key: 'amount', label: '付款金额(元)', width: 130, formatter: (v) => fmtYuan(v as number) },
  { key: 'date', label: '回款确认日期', width: 120 },
  { key: 'payer', label: '回款单位' },
  { key: 'serial', label: '收款流水号', width: 150 },
  { key: 'claimer', label: '认领人', width: 90 },
  { key: 'currency', label: '币种', width: 120, formatter: (v, r) => (!v || v === 'CNY' ? 'CNY' : `${v}(汇率 ${r.rate ?? '-'})`) },
  { key: 'bill', label: '票据', width: 150, formatter: (_v, r) => fmtBill(r) },
]

const profit = computed(() =>
  ((data.data?.projectProfit ?? {}) as Record<string, ProjectProfit>)[p.value?.projectId || ''] ?? null)
const profitSummary = computed(() => {
  const s = (profit.value?.summary ?? {}) as Record<string, number | null>
  return [
    { k: '预算收入(万)', v: fmtWan(s.预算收入) },
    { k: '实际成本(万)', v: fmtWan(s.实际成本) },
    { k: '预算毛利(万)', v: fmtWan(s.预算毛利) },
    { k: '预算毛利率', v: fmtRatio(s.预算毛利率) },
  ]
})
const bridge = computed(() => profit.value?.bridge ?? null)
const bridgeSummary = computed(() => {
  const s = (bridge.value?.summary ?? {}) as Record<string, number | null>
  return [
    { k: '预算收入(万)', v: fmtWan(s.预算收入) },
    { k: '预算成本(万)', v: fmtWan(s.预算成本) },
    { k: '实际成本(万)', v: fmtWan(s.实际成本) },
    { k: '预算毛利率', v: fmtRatio(s.预算毛利率) },
  ]
})

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
            <span v-if="overBudget" class="pd-badge" :class="`over-${overBudget.level}`">总体预算超支 {{ fmtWan(overBudget.amount) }}万</span>
            <span v-for="cat in deliveryOverBadges" :key="cat" class="pd-badge over-danger">{{ cat }}超支</span>
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

          <section class="pd-tags">
            <span class="pdt-label">项目标签</span>
            <span v-for="t in myTags" :key="t" class="tag-chip">{{ t }}<span class="tag-x" @click="removeOne(t)">✕</span></span>
            <span v-if="!myTags.length" class="pdt-empty">未打标签</span>
            <el-select v-model="addInput" size="small" filterable allow-create default-first-option
                       placeholder="加标签" style="width: 150px" @change="addOne">
              <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
            </el-select>
          </section>

          <nav class="pd-tabs">
            <button v-for="t in TABS" :key="t.key" class="pd-tab" :class="{ active: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
            <button v-if="showOrigin" class="pd-tab" :class="{ active: tab === 'origin' }" @click="tab = 'origin'">原项目</button>
          </nav>

          <section v-if="tab === 'payment'" class="pd-section">
            <div class="pd-section-title">回款（系统核心口径<span v-if="pmisPay?.fromOrigin">·取原项目</span>）</div>
            <div class="pd-chips">
              <div v-for="it in pmisPaySummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <div class="pd-note">完成率=回款流水累计÷合同总额（payment_records.csv；售前项目取原项目合同总额）。回款阶段来源 input/collection_stages.csv。</div>
            <DataTable v-if="pmisNodes.length" :columns="PMIS_NODE_COLS" :rows="pmisNodes as any[]" :show-count="false" />
            <div v-else class="pd-note">该项目暂无回款阶段数据。</div>
            <div class="pd-section-title">跟进记录</div>
            <FollowupRecords :project-id="p.projectId" :project-name="p.projectName || ''" />
          </section>

          <section v-else-if="tab === 'payrec'" class="pd-section">
            <template v-if="payRec">
              <div class="pd-chips">
                <div v-for="it in payRecSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
              </div>
              <div class="pd-note">出处：payment_records.csv（PMIS 回款流水）。</div>
              <DataTable :columns="PAYREC_COLS" :rows="payRec.records ?? []" />
            </template>
            <div v-else class="pd-note">未提供回款流水数据（input/payment_records.csv），或该项目暂无回款记录。</div>
          </section>

          <section v-else-if="tab === 'progress'" class="pd-section">
            <div class="pd-chips">
              <div v-for="it in progressInfo" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <div class="pd-section-title">项目里程碑（来源：PMIS 里程碑计划；行色=优先级 红高/棕中/绿低）</div>
            <MilestoneTable v-if="myMilestones.length" :items="myMilestones" />
            <div v-else class="pd-note">未提供项目里程碑数据（input/pmis/ 里程碑两表）。</div>
          </section>

          <section v-else-if="tab === 'risk'" class="pd-section">
            <div class="pd-chips">
              <div v-for="it in riskSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <DataTable v-if="riskRows.length" :columns="riskCols" :rows="riskRows" />
            <div v-else class="pd-note">无风险记录。</div>
          </section>

          <section v-else-if="tab === 'cost'" class="pd-section">
            <template v-if="profit">
              <div class="pd-chips">
                <div v-for="it in profitSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
              </div>
              <div class="pd-note">全预算出处：profit_loss_direct.csv；概算/核算列出处：budget_data.csv。</div>
              <ProfitTree :rows="profit.rows ?? []" />
              <template v-if="bridge">
                <div class="pd-section-title">原项目预算核算（桥接 {{ bridge.ssId || '-' }}，不计入当前汇总）</div>
                <div class="pd-chips">
                  <div v-for="it in bridgeSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
                </div>
                <ProfitTree :rows="bridge.rows ?? []" />
              </template>
            </template>
            <div v-else class="pd-note">未提供全预算数据（input/profit_loss_direct.csv）。</div>
            <div class="pd-section-title">PMIS 汇总与交付明细</div>
            <div class="pd-chips">
              <div v-for="it in costSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <div class="pd-note">汇总出处：PMIS《项目状态信息数据》（消耗比=项目核算÷项目总预算）；下方明细出处：delivery_analysis.csv，两者口径独立。</div>
            <DataTable v-if="costRows.length" :columns="COST_COLS" :rows="costRows" :show-count="false" />
            <div v-else class="pd-note">未提供预算核算明细（delivery_analysis.csv）。</div>
          </section>

          <section v-else-if="tab === 'origin'" class="pd-section">
            <div v-if="!page.closedId" class="pd-note">待提供映射（A.xlsx）——该售前项目尚无已关闭原项目关联。</div>
            <template v-else>
              <div class="pd-note">以下为已关闭原项目信息（标记「原项目」，不计入当前项目汇总）。</div>
              <div v-if="!page.closedPmis" class="pd-note">该原项目在 PMIS 已关闭项目表中无记录，仅能显示编号。</div>
              <div class="pd-chips">
                <div v-for="it in originInfo" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
              </div>
              <template v-if="originMilestones.length">
                <div class="pd-section-title">原项目里程碑（不计入当前汇总）</div>
                <MilestoneTable :items="originMilestones" />
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
.project-detail-view { padding: var(--sp-4); }
.pd-404 { text-align: center; padding: var(--sp-7) 0; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.pd-404-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin-bottom: var(--sp-2); }
.pd-404-sub { font-size: var(--fs-2); color: var(--mut); margin-bottom: var(--sp-4); }
.pd-404-link { color: var(--accent); font-size: var(--fs-2); text-decoration: none; font-weight: 600; }
.pd-head { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-2); }
.pd-name { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.pd-badge { display: inline-block; padding: 1px var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); font-weight: 600; line-height: var(--lh-base); }
.pd-badge.stage { background: var(--selected-tint); color: var(--accent); }
.pd-badge.paused { background: var(--warn-bg); color: var(--warn-text); }
.pd-badge.rating { background: var(--card2); color: var(--sub); }
.pd-badge.origin { background: var(--selected-tint); color: var(--accent); }
.pd-badge.over-danger { background: var(--danger-bg); color: var(--danger-text); }
.pd-badge.over-warn { background: var(--warn-bg); color: var(--warn-text); }
.pd-meta { display: flex; flex-wrap: wrap; gap: var(--sp-4); font-size: var(--fs-2); color: var(--sub); margin-bottom: var(--sp-3); }
.pd-meta b { color: var(--txt); }
.pd-metrics { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-4); }
.pd-metric { flex: 1; min-width: 120px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4); }
.pd-metric-v { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
.pd-metric-k { font-size: var(--fs-1); color: var(--mut); margin-top: 2px; }
.pd-tabs { display: flex; gap: var(--sp-1); border-bottom: 1px solid var(--line); margin-bottom: var(--sp-3); }
.pd-tab { border: none; background: none; padding: var(--sp-2) var(--sp-4); font-size: var(--fs-2); color: var(--sub); cursor: pointer; border-bottom: 2px solid transparent; }
.pd-tab:hover { background: var(--hover-tint); }
.pd-tab.active { color: var(--accent); font-weight: 700; border-bottom-color: var(--accent); }
.pd-section { margin-bottom: var(--sp-4); }
.pd-section-title { font-weight: 700; color: var(--accent); font-size: var(--fs-2); margin: var(--sp-4) 0 var(--sp-2); }
.pd-chips { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.pd-chip { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); font-size: var(--fs-2); }
.pd-chip-k { color: var(--mut); }
.pd-chip-v { color: var(--txt); font-weight: 600; }
.pd-note { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-3); }
.pd-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--sp-4); align-items: start; }
.pd-aside { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4); }
.pd-aside-title { font-weight: 700; font-size: var(--fs-2); color: var(--txt); margin-bottom: var(--sp-2); }
@media (max-width: 1200px) { .pd-body { grid-template-columns: 1fr; } }
.pd-tags { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); margin: var(--sp-2) 0 var(--gap-section); }
.pdt-label { font-size: var(--fs-2); color: var(--sub); }
.pdt-empty { font-size: var(--fs-1); color: var(--mut); }
.tag-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--r-sm); background: var(--card2); color: var(--sub); font-size: var(--fs-1); }
.tag-x { cursor: pointer; color: var(--mut); }
.tag-x:hover { color: var(--danger-text); }
</style>
