<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { paymentNodeRows } from '@/lib/paymentPmis'
import {
  ledgerRows,
  filterLedgerRows,
  ledgerSummaryPmis,
  ledgerTierStatsPmis,
  ledgerStatusCountsPmis,
} from '@/lib/ledger'
import { applyColumnFilters } from '@/lib/crossFilter'
import { fmtWan, fmtYuan, pct } from '@/lib/format'
import LedgerTable from '@/components/LedgerTable.vue'

const TABLE_ID = 'ledgerTable'
const TIER_OPTS = ['100万以上', '50-100万', '50万以下']
const STATUS_OPTS = ['已全额回款', '部分回款', '未回款', '延期']

const data = useDataStore()
const filter = useFilterStore()
const cf = useCrossFilterStore()

onMounted(() => {
  if (!data.data) data.load()
})

const search = ref('')
const tierSel = ref('')
const statusSel = ref('')

const allRows = computed(() =>
  ledgerRows(
    paymentNodeRows(data.data?.paymentNodes, data.data?.projects ?? [], data.data?.projectPmis),
    data.data?.projects ?? [],
  ),
)
const baseProjs = computed(() =>
  filter.excludeOn ? allRows.value.filter((r) => !filter.excludedIds[r.projectId]) : allRows.value,
)
const searched = computed(() =>
  filterLedgerRows(baseProjs.value, { search: search.value, tier: tierSel.value, status: statusSel.value }),
)
const displayed = computed(
  () => applyColumnFilters(searched.value as any, cf.tableFilters(TABLE_ID)) as any[],
)
const summary = computed(() => ledgerSummaryPmis(displayed.value as any))
const tierStats = computed(() => ledgerTierStatsPmis(displayed.value as any))
const statusCounts = computed(() => ledgerStatusCountsPmis(displayed.value as any))

const rateColor = (r: number) =>
  r >= 0.8 ? 'var(--c-paid)' : r >= 0.5 ? 'var(--c-pending)' : 'var(--danger)'

const columns = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'tier', label: '金额区间' },
  { key: 'orgL4', label: '服务组' },
  { key: 'projectManager', label: '项目经理' },
  { key: 'projectAmount', label: '项目金额(元)', formatter: (v: any) => fmtYuan(v as number) },
  { key: 'expectedPayment', label: '计划回款金额(元)', formatter: (v: any) => fmtYuan(v as number) },
  { key: 'actualPayment', label: '已回款金额(元)', formatter: (v: any) => fmtYuan(v as number) },
  {
    key: 'remainingAmount',
    label: '待回款金额(元)',
    formatter: (v: any) => fmtYuan(v as number),
  },
  {
    key: 'paymentRatio',
    label: '完成率',
    formatter: (v: any) => pct(v as number),
  },
  { key: 'paymentStatus', label: '状态' },
]
</script>

<template>
  <div class="ledger-view">
    <h2 class="lv-title">回款台账</h2>

    <div class="summary-bar">
      <div class="sb-item"><div class="sb-label">项目总数</div><div class="sb-val">{{ summary.projectCount }}</div></div>
      <div class="sb-item"><div class="sb-label">计划回款总金额(万)</div><div class="sb-val" style="color:var(--accent)">{{ fmtWan(summary.totalExp) }}</div></div>
      <div class="sb-item"><div class="sb-label">已回款总金额(万)</div><div class="sb-val green">{{ fmtWan(summary.totalAct) }}</div></div>
      <div class="sb-item"><div class="sb-label">待回款总金额(万)</div><div class="sb-val red">{{ fmtWan(summary.totalRem) }}</div></div>
      <div class="sb-item"><div class="sb-label">完成率</div><div class="sb-val" :style="{ color: rateColor(summary.rate) }">{{ pct(summary.rate) }}</div></div>
    </div>

    <div class="status-row">
      <div class="st-card"><div class="st-label">已全额回款</div><div class="st-val" style="color:var(--c-paid)">{{ statusCounts.fullPaid }}</div></div>
      <div class="st-card"><div class="st-label">部分回款</div><div class="st-val" style="color:var(--c-pending)">{{ statusCounts.partial }}</div></div>
      <div class="st-card"><div class="st-label">未回款</div><div class="st-val" style="color:var(--accent)">{{ statusCounts.unpaid }}</div></div>
      <div class="st-card"><div class="st-label">延期项目数</div><div class="st-val" style="color:var(--danger)">{{ statusCounts.delayed }}</div></div>
    </div>

    <div class="tier-cards">
      <div
        v-for="ts in tierStats"
        :key="ts.tier"
        class="tier-card"
      >
        <div class="tc-name">{{ ts.tier }}</div>
        <div class="tc-metrics">
          <span>项目数 <b style="color:var(--accent)">{{ ts.count }}</b></span>
          <span>计划回款金额 <b style="color:var(--accent)">{{ fmtYuan(ts.expWan) }}万</b></span>
          <span>待回款金额 <b style="color:var(--danger)">{{ fmtYuan(ts.remWan) }}万</b></span>
        </div>
      </div>
    </div>

    <div class="toolbar">
      <el-input v-model="search" size="small" placeholder="搜索项目编号/名称/经理..." clearable style="width: 260px" />
      <el-select v-model="tierSel" size="small" placeholder="全部区间" clearable style="width: 140px">
        <el-option v-for="t in TIER_OPTS" :key="t" :label="t" :value="t" />
      </el-select>
      <el-select v-model="statusSel" size="small" placeholder="全部状态" clearable style="width: 140px">
        <el-option v-for="s in STATUS_OPTS" :key="s" :label="s" :value="s" />
      </el-select>
      <el-button
        v-if="cf.hasFilters(TABLE_ID)"
        size="small"
        style="margin-left: auto"
        @click="cf.clearAll(TABLE_ID)"
      >
        清除所有筛选
      </el-button>
    </div>

    <LedgerTable
      :table-id="TABLE_ID"
      :projects="displayed"
      :columns="columns"
      :source-rows="baseProjs as Record<string, any>[]"
    />
  </div>
</template>

<style scoped>
.ledger-view { padding: 16px; }
.lv-title { font-size: 18px; font-weight: 700; color: var(--txt); margin: 0 0 14px; }
.summary-bar, .status-row { display: grid; gap: 10px; margin-bottom: 12px; }
.summary-bar { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.status-row { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
.sb-item, .st-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
.sb-label, .st-label { font-size: 12px; color: var(--mut); }
.sb-val { font-size: 18px; font-weight: 700; color: var(--txt); }
.sb-val.green { color: var(--c-paid); } .sb-val.red { color: var(--danger); }
.st-val { font-size: 20px; font-weight: 700; }
.tier-cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.tier-card { flex: 1; min-width: 200px; padding: 12px 16px; background: var(--card2); border-radius: 8px; border: 1px solid var(--line); }
.tc-name { font-weight: 700; font-size: 13px; color: var(--txt); margin-bottom: 6px; }
.tc-metrics { display: flex; gap: 16px; font-size: 12px; flex-wrap: wrap; }
.toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
</style>
