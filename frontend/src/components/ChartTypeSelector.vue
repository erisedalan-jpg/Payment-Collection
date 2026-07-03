<script setup lang="ts">
const LABELS: Record<string, string> = {
  bar: '柱状图',
  line: '折线图',
  pie: '饼图',
}

const props = defineProps<{
  modelValue: string[]
  available: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [string[]]
}>()

function toggle(type: string) {
  const current = props.modelValue
  if (current.includes(type)) {
    // 不允许取消最后一个
    if (current.length === 1) return
    emit('update:modelValue', current.filter((t) => t !== type))
  } else {
    emit('update:modelValue', [...current, type])
  }
}
</script>

<template>
  <div class="cts" role="group" aria-label="图表类型">
    <button
      v-for="type in available"
      :key="type"
      type="button"
      class="cts-b"
      :class="{ on: modelValue.includes(type) }"
      :data-type="type"
      :aria-pressed="modelValue.includes(type)"
      @click="toggle(type)"
    >
      {{ LABELS[type] ?? type }}
    </button>
  </div>
</template>

<style scoped>
.cts {
  display: inline-flex;
  background: var(--card2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 2px;
  gap: 2px;
}
.cts-b {
  border: none;
  background: transparent;
  color: var(--sub);
  cursor: pointer;
  font-size: var(--fs-1);
  padding: 3px var(--sp-3);
  border-radius: var(--r-sm);
  line-height: var(--lh-base);
  transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
}
/* 选中=抬起 chip(淡底深字,符合三态规范;弃旧"实底+小号白字") */
.cts-b.on {
  background: var(--card);
  color: var(--accent);
  font-weight: 700;
  box-shadow: var(--shadow-1);
}
.cts-b:not(.on):hover {
  background: var(--hover-tint);
}
</style>
