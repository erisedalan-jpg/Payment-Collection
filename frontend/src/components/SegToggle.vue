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
      class="seg-b"
      :class="{ on: o.value === modelValue }"
      :data-test="`seg-${o.value}`"
      @click="$emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; background: var(--card2); border: 1px solid var(--line); border-radius: 8px; padding: 2px; }
.seg-b { border: none; background: transparent; color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: 3px 11px; border-radius: 6px; line-height: 1.6; }
.seg-b.on { background: var(--accent); color: var(--on-accent); font-weight: 700; }
</style>
