<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Project } from '@/types/analysis'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useDataStore } from '@/stores/data'
import { buildProjectDetail } from '@/lib/projectDetail'
import { fmtYuan, fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from './DataTable.vue'

const router = useRouter()
const pd = useProjectDetailStore()
const data = useDataStore()

// 仅项目主域（projects[]）的项目展示全页详情入口——非主域项目跳过去是 404（spec 2：抽屉保留快速下钻，/project/:id 为全页升级版）
const inDomain = computed(
  () => !!pd.openId && ((data.data?.projects ?? []) as Project[]).some((x) => x.projectId === pd.openId),
)

function goFull() {
  const id = pd.openId
  pd.close()
  if (id) router.push(`/project/${id}`)
}

const visible = computed({
  get: () => pd.visible,
  set: (v: boolean) => {
    if (!v) pd.close()
  },
})

const detail = computed(() =>
  pd.openId
    ? buildProjectDetail(data.data?.paymentNodes, (data.data?.projects ?? []) as Project[], data.data?.projectPmis, pd.openId)
    : { project: null, nodes: [] },
)

const NODE_COLS: DataColumn[] = [
  { key: 'stage', label: '阶段' },
  { key: 'planDate', label: '计划日期' },
  { key: 'expectedPayment', label: '计划回款', formatter: (v: unknown) => fmtYuan(v as number) },
  { key: 'receivedAmount', label: '已回款', formatter: (v: unknown) => fmtYuan(v as number) },
  { key: 'unpaidAmount', label: '未回款', formatter: (v: unknown) => fmtYuan(v as number) },
  { key: 'actualRatio', label: '实际比例', formatter: (v: unknown) => fmtRatio(v as number) },
  { key: 'status', label: '状态' },
]

const summary = computed(() => {
  const p = detail.value.project
  if (!p) return []
  return [
    { k: '项目编号', v: p.projectId },
    { k: '项目名称', v: p.projectName || '-' },
    { k: '服务组(L4)', v: p.orgL4 || '-' },
    { k: '项目经理', v: p.projectManager || '-' },
    { k: '金额区间', v: p.tier || '-' },
    { k: '项目金额', v: fmtYuan(p.projectAmount) },
    { k: '回款状态', v: p.paymentStatus },
    { k: '延期', v: p.delayed ? '有延期节点' : '无' },
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
      <button v-if="inDomain" class="pd-full-link" @click="goFull">查看完整详情 →</button>
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
.pd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-2) var(--sp-4); margin-bottom: var(--sp-4); }
.pd-cell { display: flex; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3);
  background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-md); font-size: var(--fs-2); }
.pd-k { color: var(--mut); }
.pd-v { color: var(--txt); font-weight: 600; text-align: right; }
.pd-nodes-title { font-weight: 700; color: var(--accent); font-size: var(--fs-2); margin-bottom: var(--sp-2); }
.pd-empty { color: var(--mut); padding: var(--sp-5); text-align: center; }
.pd-full-link { border: none; background: none; color: var(--accent); font-size: var(--fs-2); font-weight: 600; cursor: pointer; padding: 0; margin-bottom: var(--sp-3); }
</style>
