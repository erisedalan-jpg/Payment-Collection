<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'

const f = useFilterStore()

const year = computed({
  get: () => f.filterYear,
  set: (v: string) => f.setYear(v),
})

const mode = computed({
  get: () => f.viewMode,
  set: (v: 'global' | 'l4' | 'pm') => {
    if (v === 'global') f.setViewGlobal()
    else if (v === 'l4') f.setViewL4('')
    else f.setViewPM('')
  },
})
</script>

<template>
  <div class="filter-bar">
    <label class="fb-item">
      周期
      <select data-test="year-select" v-model="year">
        <option v-for="o in f.yearOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>
    </label>

    <label class="fb-item">
      视角
      <select data-test="view-mode" v-model="mode">
        <option value="global">全局</option>
        <option value="l4">L4 服务组</option>
        <option value="pm">项目经理</option>
      </select>
    </label>

    <label v-if="f.viewMode === 'l4'" class="fb-item">
      服务组
      <select data-test="view-l4" :value="f.viewL4" @change="f.setViewL4(($event.target as HTMLSelectElement).value)">
        <option value="">全部</option>
        <option v-for="d in f.l4Options" :key="d" :value="d">{{ d }}</option>
      </select>
    </label>

    <label v-if="f.viewMode === 'pm'" class="fb-item">
      项目经理
      <select data-test="view-pm" :value="f.viewPM" @change="f.setViewPM(($event.target as HTMLSelectElement).value)">
        <option value="">全部</option>
        <option v-for="p in f.pmOptions" :key="p" :value="p">{{ p }}</option>
      </select>
    </label>

  </div>
</template>

<style scoped>
.filter-bar { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-2) var(--sp-4);
  border-bottom: 1px solid var(--line); background: var(--card); font-size: var(--fs-1); color: var(--sub); }
.fb-item { display: inline-flex; align-items: center; gap: var(--sp-2); }
.fb-item select { padding: var(--sp-1) var(--sp-2); border: 1px solid var(--line2); border-radius: var(--r-sm);
  font-size: var(--fs-1); background: var(--card2); color: var(--txt); }
</style>
