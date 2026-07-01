<script setup lang="ts">
import { computed } from 'vue'
import { getActivePinia } from 'pinia'
import VChart from 'vue-echarts'
import { ENT_THEME, ENT_THEME_DARK } from './echartsTheme'
import { useSettingsStore } from '@/stores/settings'

const props = withDefaults(
  defineProps<{
    option: Record<string, any>
    height?: string
  }>(),
  { height: '320px' },
)

const emit = defineEmits<{ 'datapoint-click': [any] }>()

// 无活动 pinia 时（个别不带 store 的测试场景）回退浅色，避免抛错。
const theme = computed(() => {
  if (!getActivePinia()) return ENT_THEME
  return useSettingsStore().theme === 'dark' ? ENT_THEME_DARK : ENT_THEME
})

// 系统「减少动态效果」偏好：整体关闭图表动画（设计规范要求尊重 prefers-reduced-motion）。
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// 全站图表性能护栏（渲染边界统一注入，不改各视图 option 计算，故不影响以 option 为断言的测试）：
// 1) tooltip.renderMode='richText' —— hover 卡顿主因修复：默认 HTML tooltip 每次 mousemove 读
//    DOM 尺寸(getSize)触发整文档强制回流，页面 DOM 越重(如成本明细大表)越卡；richText 直接
//    画在 canvas 上，无 DOM 无回流。本项目 tooltip 无 HTML formatter，仅默认/字符串模板，可安全切换。
// 2) axisPointer.animation=false + tooltip.transitionDuration=0：指示器/浮层停止逐帧缓动重绘。
// 3) 进场/更新动画压到轻量时长，缩短慢机进场的重绘窗口。
// 视图若自带同名字段以视图为准（放在展开之后覆盖默认）。
const merged = computed(() => {
  const o = props.option || {}
  const tip = o.tooltip
  return {
    animation: !reduceMotion,
    animationDuration: 260,
    animationDurationUpdate: 200,
    ...o,
    axisPointer: { animation: false, ...(o.axisPointer || {}) },
    ...(tip
      ? { tooltip: { renderMode: 'richText', transitionDuration: 0, ...tip, axisPointer: { animation: false, ...(tip.axisPointer || {}) } } }
      : {}),
  }
})
</script>

<template>
  <div class="chart-box" :style="{ height }">
    <VChart :option="merged" :theme="theme" autoresize @click="(e: any) => emit('datapoint-click', e)" />
  </div>
</template>

<style scoped>
.chart-box { width: 100%; }
.chart-box :deep(.echarts) { width: 100%; height: 100%; }
</style>
