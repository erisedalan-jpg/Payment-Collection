<script setup lang="ts">
import { computed } from 'vue'
import { pendingNodes } from '@/lib/followupProjects'
import { formatCellValue } from '@/lib/cellFormat'

const props = defineProps<{ nodes: Record<string, any>[] }>()
const rows = computed(() => pendingNodes(props.nodes as any) as Record<string, any>[])

const COLS = [
  { key: 'nodeName', label: '节点' },
  { key: 'planDate', label: '计划日期' },
  { key: 'planPaymentRatio', label: '计划回款%' },
  { key: 'actualPaymentRatio', label: '实际回款%' },
  { key: 'nodeStatus', label: '状态' },
  { key: 'blocker', label: '卡点' },
  { key: 'blockerOwner', label: '卡点责任方' },
  { key: 'nextAction', label: '下一步动作' },
  { key: 'nextActionDate', label: '动作完成时间' },
]
</script>

<template>
  <div v-if="!rows.length" class="fnt-empty">暂无待跟进节点（已全额回款的节点已自动隐藏）</div>
  <div v-else class="fnt-wrap">
    <table class="fnt-table">
      <thead>
        <tr><th v-for="c in COLS" :key="c.key">{{ c.label }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(n, i) in rows" :key="i">
          <td v-for="c in COLS" :key="c.key" :title="String(n[c.key] ?? '')">{{ formatCellValue(n[c.key], c.key) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.fnt-wrap { overflow-x: auto; }
.fnt-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 4px 0; }
.fnt-table th, .fnt-table td {
  padding: 5px 6px; border: 1px solid #ebe7e2; text-align: left; white-space: nowrap;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis;
}
.fnt-table th { background: #fafbfc; color: #475569; font-weight: 600; }
.fnt-empty { font-size: 13px; color: #8c8c9e; padding: 8px 0; }
</style>
