<script setup lang="ts">
import { computed } from 'vue'
import type { RawNode } from '@/types/analysis'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useDataStore } from '@/stores/data'
import { buildProjectDetail } from '@/lib/projectDetail'
import { formatCellValue } from '@/lib/cellFormat'
import { fmtYuan, fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from './DataTable.vue'

const pd = useProjectDetailStore()
const data = useDataStore()

const visible = computed({
  get: () => pd.visible,
  set: (v: boolean) => {
    if (!v) pd.close()
  },
})

const detail = computed(() =>
  pd.openId
    ? buildProjectDetail((data.data?.rawNodes ?? []) as RawNode[], pd.openId)
    : { project: null, nodes: [] },
)

const NODE_COLS: DataColumn[] = [
  { key: 'nodeName', label: '节点' },
  { key: 'planDate', label: '计划日期' },
  { key: 'expectedPayment', label: '计划回款' },
  { key: 'actualPayment', label: '已回款' },
  { key: 'actualPaymentRatio', label: '实际比例' },
  { key: 'nodeStatus', label: '状态' },
  { key: 'delayDays', label: '延期天数' },
].map((c) => ({ ...c, formatter: (v: unknown) => formatCellValue(v, c.key) }))

const summary = computed(() => {
  const p = detail.value.project
  if (!p) return []
  return [
    { k: '项目编号', v: p.projectId },
    { k: '项目名称', v: p.projectName || '-' },
    { k: '服务组(L4)', v: p.orgL4 || '-' },
    { k: '项目经理', v: p.projectManager || '-' },
    { k: '项目类型', v: p.projectType || '-' },
    { k: '金额区间', v: p.tier || '-' },
    { k: '项目金额', v: fmtYuan(p.projectAmount) },
    { k: '回款状态', v: p.paymentStatus },
    { k: '完成率', v: fmtRatio(p.paymentRatio) },
    { k: '计划回款', v: fmtYuan(p.expectedPayment) },
    { k: '已回款', v: fmtYuan(p.actualPayment) },
    { k: '待回款', v: fmtYuan(p.remainingAmount) },
  ]
})
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="detail.project ? detail.project.projectName || detail.project.projectId : '项目详情'"
    size="600px"
    append-to-body
  >
    <div v-if="detail.project" class="pd">
      <div class="pd-grid">
        <div v-for="item in summary" :key="item.k" class="pd-cell">
          <span class="pd-k">{{ item.k }}</span>
          <span class="pd-v">{{ item.v }}</span>
        </div>
      </div>
      <div class="pd-nodes-title">回款节点明细（{{ detail.nodes.length }}）</div>
      <DataTable :columns="NODE_COLS" :rows="detail.nodes" :show-count="false" />
    </div>
    <div v-else class="pd-empty">未找到该项目数据</div>
  </el-drawer>
</template>

<style scoped>
.pd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; margin-bottom: 16px; }
.pd-cell { display: flex; justify-content: space-between; gap: 10px; padding: 6px 10px;
  background: var(--card2); border: 1px solid var(--line); border-radius: 8px; font-size: 13px; }
.pd-k { color: var(--mut); }
.pd-v { color: var(--txt); font-weight: 600; text-align: right; }
.pd-nodes-title { font-weight: 700; color: var(--accent); font-size: 13px; margin-bottom: 8px; }
.pd-empty { color: var(--mut); padding: 24px; text-align: center; }
</style>
