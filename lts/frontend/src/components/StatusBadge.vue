<script setup lang="ts">
// label 可选:el-table 列注册阶段会以空 row 渲染一次插槽,undefined 不应触发 prop 校验告警(同 HealthBadge)
withDefaults(defineProps<{ label?: string; tone?: string }>(), { tone: 'mut' })
</script>

<template>
  <span class="u-stbadge" :class="tone">{{ label }}</span>
</template>

<style scoped>
.u-stbadge { display: inline-block; padding: 1px var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); font-weight: 600; line-height: var(--lh-base); }
.u-stbadge.ok { background: var(--ok-bg); color: var(--ok-text); }
.u-stbadge.warn { background: var(--warn-bg); color: var(--warn-text); }
.u-stbadge.danger { background: var(--danger-bg); color: var(--danger-text); }
.u-stbadge.urgent { background: var(--urgent-bg); color: var(--urgent-text); }
.u-stbadge.mut { background: var(--card2); color: var(--mut); }
</style>
