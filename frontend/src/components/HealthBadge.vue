<script setup lang="ts">
import { computed } from 'vue'

// 健康度三态徽章：淡底+深字（设计规范 V2 状态三态）；非三态值（含「无数据」/空/缺省）走中性样式
// prop 可选：el-table 列注册阶段会以空 row 隐藏渲染一次插槽，undefined 同样落中性样式
const props = defineProps<{ overall?: string }>()
const CLS: Record<string, string> = { 健康: 'ok', 关注: 'warn', 风险: 'danger' }
const cls = computed(() => CLS[props.overall || ''] || 'none')
</script>

<template>
  <span class="health-badge" :class="cls">{{ props.overall || '无数据' }}</span>
</template>

<style scoped>
.health-badge { display: inline-block; padding: 1px 8px; border-radius: var(--r-full); font-size: var(--fs-1); font-weight: 600; line-height: 1.6; }
.health-badge.ok { background: var(--ok-bg); color: var(--ok-text); }
.health-badge.warn { background: var(--warn-bg); color: var(--warn-text); }
.health-badge.danger { background: var(--danger-bg); color: var(--danger-text); }
.health-badge.none { background: var(--card2); color: var(--mut); }
</style>
