<script setup lang="ts">
defineProps<{ modelValue: string; options: { value: string; label: string }[] }>()
defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <div class="seg" role="group">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="seg-b u-press"
      :class="{ on: o.value === modelValue }"
      :data-test="`seg-${o.value}`"
      @click="$emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-md); padding: 2px; }
.seg-b { border: none; background: transparent; color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: 3px var(--sp-3); border-radius: var(--r-sm); line-height: var(--lh-base);
  transition: color var(--dur-1) var(--ease), background-color var(--dur-1) var(--ease); }
.seg-b:hover:not(.on) { color: var(--txt); }
/* 选中=抬起 chip(淡底深字,符合三态规范;弃旧"实底+小号白字") */
.seg-b.on { background: var(--card); color: var(--accent); font-weight: 700; box-shadow: var(--shadow-1); }
</style>
