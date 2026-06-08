<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { TIERS } from '@/nav'

const props = defineProps<{ tier: string }>()
const data = useDataStore()

interface IncompleteRow {
  projectId: string
  projectName?: string
  orgL4?: string
  projectManager?: string
  projectCompletion?: string
  isMilestoneAchieved?: string
  _tier?: string
}

const rows = computed<IncompleteRow[]>(() => {
  const sm = (data.data?.summary as Record<string, any> | undefined) ?? {}
  const tiers = props.tier ? [props.tier] : TIERS.map((t) => t.label)
  return tiers.flatMap((t) =>
    ((sm[t]?.incompleteData ?? []) as IncompleteRow[]).map((r) => ({ ...r, _tier: t })),
  )
})

const showTier = computed(() => props.tier === '')

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
      <thead>
        <tr>
          <th v-if="showTier">档位</th>
          <th>项目编号</th><th>项目名称</th><th>项目经理L4部门</th><th>项目经理</th><th>当前项目完成%</th><th>是否已达成里程碑</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length"><td :colspan="showTier ? 7 : 6" class="it-ok">数据完整，无待补全项</td></tr>
        <tr v-for="p in rows" :key="p.projectId">
          <td v-if="showTier">{{ p._tier }}</td>
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
.it-note { background: color-mix(in srgb, var(--warn) 12%, transparent); color: var(--warn); padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.it-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 12px; }
.it-stat { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
.it-label { font-size: 12px; color: var(--mut); }
.it-val { font-size: 18px; font-weight: 700; }
.it-val.orange { color: var(--c-pending); } .it-val.red { color: var(--danger); } .it-val.green { color: var(--c-paid); }
.it-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.it-badge { background: color-mix(in srgb, var(--warn) 12%, transparent); color: var(--warn); padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; }
.it-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--card); }
.it-table th, .it-table td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; }
.it-ok { text-align: center; color: var(--c-paid); padding: 20px; }
.miss { color: var(--danger); font-weight: 700; }
.it-count { font-size: 12px; color: var(--mut); margin-top: 8px; }
</style>
