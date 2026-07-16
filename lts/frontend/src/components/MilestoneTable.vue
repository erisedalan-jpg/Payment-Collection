<script setup lang="ts">
import type { MilestoneItem } from '@/types/analysis'

// 项目里程碑表(R2 spec §3;S1 去行级三色——priority 仅数据保留供后续统计,UI 用通用表格色)
const props = defineProps<{ items: MilestoneItem[] }>()
const done = (i: MilestoneItem) => !!i.actualDate
</script>

<template>
  <table class="ms-table">
    <thead>
      <tr><th>里程碑</th><th>计划时间</th><th>实际时间</th><th>关联回款阶段</th><th>状态</th></tr>
    </thead>
    <tbody>
      <tr v-for="(i, idx) in props.items" :key="idx">
        <td class="ms-name">{{ i.name }}</td>
        <td class="u-num">{{ i.planDate || '-' }}</td>
        <td class="u-num">{{ i.actualDate || '-' }}</td>
        <td>{{ i.payStage || '-' }}</td>
        <td><span class="ms-status" :class="{ done: done(i) }">{{ done(i) ? '已完成' : '未完成' }}</span></td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.ms-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.ms-table th, .ms-table td { padding: var(--sp-2) var(--sp-3); text-align: left; border-bottom: 1px solid var(--line); }
.ms-table th { color: var(--sub); font-weight: 600; font-size: var(--fs-1); }
.ms-name { color: var(--txt); font-weight: 600; }
.ms-status { color: var(--mut); font-size: var(--fs-1); }
.ms-status.done { color: var(--ok-text); font-weight: 600; }
</style>
