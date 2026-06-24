<script setup lang="ts">
import { computed } from 'vue'

export interface DimOption { value: string; label: string; group?: string }
const props = defineProps<{ modelValue: string[]; options: DimOption[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

function toggle(v: string) {
  const cur = props.modelValue
  const i = cur.indexOf(v)
  emit('update:modelValue', i >= 0 ? cur.filter((x) => x !== v) : [...cur, v])
}
function order(v: string): number {
  return props.modelValue.indexOf(v) + 1
}
const hasGroups = computed(() => props.options.some((o) => o.group))
const groups = computed(() => {
  const m = new Map<string, DimOption[]>()
  for (const o of props.options) (m.get(o.group ?? '') ?? m.set(o.group ?? '', []).get(o.group ?? '')!).push(o)
  return [...m.entries()].map(([name, opts]) => ({ name, opts }))
})
</script>

<template>
  <div class="dp">
    <template v-if="hasGroups">
      <div v-for="g in groups" :key="g.name" class="dp-group">
        <span class="dp-group-label">{{ g.name }}</span>
        <button v-for="o in g.opts" :key="o.value" type="button" class="dp-chip"
          :class="{ on: modelValue.includes(o.value) }" :data-test="`dim-${o.value}`" @click="toggle(o.value)">
          <span v-if="order(o.value)" class="dp-ord">{{ order(o.value) }}</span>{{ o.label }}
        </button>
      </div>
    </template>
    <template v-else>
      <button v-for="o in options" :key="o.value" type="button" class="dp-chip"
        :class="{ on: modelValue.includes(o.value) }" :data-test="`dim-${o.value}`" @click="toggle(o.value)">
        <span v-if="order(o.value)" class="dp-ord">{{ order(o.value) }}</span>{{ o.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.dp { display: inline-flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
.dp-group { display: inline-flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
.dp-group-label { font-size: var(--fs-1); color: var(--mut); margin-right: var(--sp-1); }
.dp-chip { display: inline-flex; align-items: center; gap: var(--sp-1); border: 1px solid var(--line); background: var(--card); color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: var(--sp-1) var(--sp-3); border-radius: var(--r-md); }
.dp-chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 600; }
.dp-ord { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: var(--r-full); background: var(--accent); color: var(--on-accent); font-size: var(--fs-1); font-weight: 700; }
</style>
