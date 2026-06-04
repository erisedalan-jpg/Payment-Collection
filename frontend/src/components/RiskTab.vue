<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { riskGroups, getNodeRemaining } from '@/lib/riskGroups'
import { fmtYuan, fmtRatio, pct } from '@/lib/format'

const props = defineProps<{ tier: string; now?: Date }>()
const filter = useFilterStore()

const tierNodes = computed(() => filter.filteredNodes.filter((n) => n.tier === props.tier))
const groups = computed(() => riskGroups(tierNodes.value, props.now ?? new Date()))

const nodeCols: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'planDate', label: '计划日期' },
  { key: 'remaining', label: '待回款(元)', formatter: (_v, row) => fmtYuan(getNodeRemaining(row)) },
  { key: 'actualPaymentRatio', label: '实际比例', formatter: (v) => fmtRatio(v, '待上报') },
  { key: 'orgL4', label: '服务组' },
]

const highRiskCols: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'projectAmount', label: '项目金额(元)', formatter: (v) => fmtYuan(v as number) },
  { key: 'remainingAmount', label: '待回款金额(元)', formatter: (v) => fmtYuan(v as number) },
  { key: 'paymentRatio', label: '完成率', formatter: (v) => pct(v) },
  { key: 'orgL4', label: '服务组' },
]
</script>

<template>
  <div class="risk-tab">
    <section class="risk-card">
      <div class="rc-header orange">临近到期节点 <span class="rc-sub">7天内到期且未100%回款</span></div>
      <DataTable :columns="nodeCols" :rows="groups.nearDue as Record<string, any>[]" />
    </section>
    <section class="risk-card">
      <div class="rc-header primary">可提前但未行动 <span class="rc-sub">具备提前完成条件但未行动</span></div>
      <DataTable :columns="nodeCols" :rows="groups.canAdvance as Record<string, any>[]" />
    </section>
    <section class="risk-card">
      <div class="rc-header red">高金额低完成率 <span class="rc-sub">回款完成率&lt;30%且金额最高</span></div>
      <DataTable :columns="highRiskCols" :rows="groups.highRisk as Record<string, any>[]" />
    </section>
  </div>
</template>

<style scoped>
.risk-tab { padding: 12px 16px; display: flex; flex-direction: column; gap: 16px; }
.risk-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
.rc-header { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.rc-header.orange { color: #f59e0b; } .rc-header.primary { color: #4f46e5; } .rc-header.red { color: #ef4444; }
.rc-sub { font-weight: 400; font-size: 12px; color: #94a3b8; margin-left: 6px; }
</style>
