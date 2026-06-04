<script setup lang="ts">
import { computed } from 'vue'
import { fmtYuan, fmtRatio } from '@/lib/format'
import { getNodeRemaining } from '@/lib/riskGroups'

const props = withDefaults(defineProps<{ nodes: Record<string, any>[]; maxShow?: number }>(), {
  maxShow: 100,
})
const rows = computed(() => props.nodes.slice(0, props.maxShow))
</script>

<template>
  <div class="cnt-wrap">
    <table class="cnt-table">
      <thead>
        <tr>
          <th>项目编号</th>
          <th>项目名称</th>
          <th class="r">项目金额(元)</th>
          <th class="r">待回款金额(元)</th>
          <th>金额区间</th>
          <th>服务组</th>
          <th>项目经理</th>
          <th>节点状态</th>
          <th>里程碑/阶段名称</th>
          <th>计划回款时间</th>
          <th>实际回款比例</th>
          <th class="r">计划回款金额(元)</th>
          <th class="r">已回款金额(元)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(n, i) in rows" :key="i">
          <td>{{ n.projectId }}</td>
          <td :title="n.projectName || ''">{{ n.projectName || '-' }}</td>
          <td class="r">{{ fmtYuan(n.projectAmount) }}</td>
          <td class="r" style="color:#ef4444">{{ fmtYuan(getNodeRemaining(n)) }}</td>
          <td>{{ n.tier }}</td>
          <td>{{ n.orgL4 || '-' }}</td>
          <td>{{ n.projectManager || '-' }}</td>
          <td>{{ n.nodeStatus }}</td>
          <td>{{ n.milestone || n.stageName || '-' }}</td>
          <td>{{ n.planDate || '-' }}</td>
          <td>{{ fmtRatio(n.actualPaymentRatio, '待上报') }}</td>
          <td class="r">{{ fmtYuan(n.expectedPayment) }}</td>
          <td class="r">{{ fmtYuan(n.actualPayment) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="cnt-count">共 {{ nodes.length }} 条记录</div>
  </div>
</template>

<style scoped>
.cnt-wrap { overflow-x: auto; }
.cnt-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cnt-table th,
.cnt-table td {
  border: 1px solid #f1f5f9;
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cnt-table th { background: #f8fafc; color: #475569; font-weight: 600; }
.cnt-table th.r, .cnt-table td.r { text-align: right; font-family: var(--font-mono, monospace); }
.cnt-count { font-size: 12px; color: #94a3b8; padding: 6px 0; }
</style>
