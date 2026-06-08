<script setup lang="ts">
const props = defineProps<{ modelValue: string[]; options: { value: string; label: string }[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

function toggle(v: string) {
  const cur = props.modelValue
  const i = cur.indexOf(v)
  emit('update:modelValue', i >= 0 ? cur.filter((x) => x !== v) : [...cur, v])
}
function order(v: string): number {
  return props.modelValue.indexOf(v) + 1
}
</script>

<template>
  <div class="dp">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="dp-chip"
      :class="{ on: modelValue.includes(o.value) }"
      :data-test="`dim-${o.value}`"
      @click="toggle(o.value)"
    >
      <span v-if="order(o.value)" class="dp-ord">{{ order(o.value) }}</span>{{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.dp { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.dp-chip { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--line); background: var(--card); color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: 4px 10px; border-radius: 8px; }
.dp-chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 600; }
.dp-ord { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: 10px; font-weight: 700; }
</style>
