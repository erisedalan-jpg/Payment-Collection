<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'

const props = defineProps<{ tier: string }>()
const data = useDataStore()

interface IncompleteRow {
  projectId: string
  projectName?: string
  orgL4?: string
  projectManager?: string
  projectCompletion?: string
  isMilestoneAchieved?: string
}

const rows = computed<IncompleteRow[]>(() => {
  const summary = (data.data?.summary as Record<string, any> | undefined)?.[props.tier]
  return (summary?.incompleteData ?? []) as IncompleteRow[]
})

const deptEntries = computed(() => {
  const counts: Record<string, number> = {}
  for (const p of rows.value) {
    const d = p.orgL4 || '未指定'
    counts[d] = (counts[d] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})

const missingCompletion = computed(() => rows.value.filter((p) => !p.projectCompletion).length)
const missingMilestone = computed(() => rows.value.filter((p) => !p.isMilestoneAchieved).length)
</script>

<template>
  <div class="integrity-tab">
    <div class="it-note">筛选条件：关联回款=是 且 当前项目完成%为空 且 是否已达成里程碑为空</div>
    <div class="it-summary">
      <div class="it-stat"><div class="it-label">缺失项目总数</div><div class="it-val orange">{{ rows.length }}</div></div>
      <div class="it-stat"><div class="it-label">L4部门数</div><div class="it-val">{{ deptEntries.length }}</div></div>
      <div class="it-stat"><div class="it-label">项目完成%缺失</div><div class="it-val" :class="missingCompletion ? 'red' : 'green'">{{ missingCompletion }}</div></div>
      <div class="it-stat"><div class="it-label">里程碑达成缺失</div><div class="it-val" :class="missingMilestone ? 'red' : 'green'">{{ missingMilestone }}</div></div>
    </div>
    <div v-if="deptEntries.length" class="it-badges">
      <span v-for="[dept, cnt] in deptEntries" :key="dept" class="it-badge">{{ dept }} <b>{{ cnt }}</b></span>
    </div>
    <table class="it-table">
      <thead><tr><th>项目编号</th><th>项目名称</th><th>项目经理L4部门</th><th>项目经理</th><th>当前项目完成%</th><th>是否已达成里程碑</th></tr></thead>
      <tbody>
        <tr v-if="!rows.length"><td colspan="6" class="it-ok">数据完整，无待补全项</td></tr>
        <tr v-for="p in rows" :key="p.projectId">
          <td>{{ p.projectId }}</td>
          <td :title="p.projectName">{{ p.projectName || '-' }}</td>
          <td>{{ p.orgL4 || '-' }}</td>
          <td>{{ p.projectManager || '-' }}</td>
          <td><span v-if="!p.projectCompletion" class="miss">缺失</span><span v-else>{{ p.projectCompletion }}</span></td>
          <td><span v-if="!p.isMilestoneAchieved" class="miss">缺失</span><span v-else>{{ p.isMilestoneAchieved }}</span></td>
        </tr>
      </tbody>
    </table>
    <div class="it-count">共 {{ rows.length }} 条记录</div>
  </div>
</template>

<style scoped>
.integrity-tab { padding: 12px 16px; }
.it-note { background: #fff7ed; color: #b45309; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.it-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 12px; }
.it-stat { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
.it-label { font-size: 12px; color: #64748b; }
.it-val { font-size: 18px; font-weight: 700; }
.it-val.orange { color: #f59e0b; } .it-val.red { color: #ef4444; } .it-val.green { color: #10b981; }
.it-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.it-badge { background: #fff7ed; color: #b45309; padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; }
.it-table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
.it-table th, .it-table td { border: 1px solid #f1f5f9; padding: 6px 10px; text-align: left; }
.it-ok { text-align: center; color: #10b981; padding: 20px; }
.miss { color: #ef4444; font-weight: 700; }
.it-count { font-size: 12px; color: #94a3b8; margin-top: 8px; }
</style>
