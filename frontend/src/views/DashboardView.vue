<script setup lang="ts">
import { onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import DashMetrics from '@/components/DashMetrics.vue'
import PaymentL4Table from '@/components/PaymentL4Table.vue'
import NoStageProjectsTable from '@/components/NoStageProjectsTable.vue'

const data = useDataStore()
onMounted(() => {
  if (!data.data) data.load()
})
</script>

<template>
  <div class="dashboard">
    <p v-if="data.loading" class="dash-hint">加载中…</p>
    <p v-else-if="data.error" class="dash-hint error">数据加载失败：{{ data.error }}</p>
    <template v-else-if="data.data">
      <DashMetrics />
      <section class="dash-card dash-block"><PaymentL4Table /></section>
      <section class="dash-card dash-block"><NoStageProjectsTable /></section>
    </template>
    <p v-else class="dash-hint">暂无数据，请先在数据管理中同步/导入。</p>
  </div>
</template>

<style scoped>
.dashboard { min-height: 100%; padding: var(--sp-4); }
.dash-hint { padding: var(--sp-6); color: var(--mut); }
.dash-hint.error { color: var(--danger); }
.dash-block { margin-top: var(--gap-card); }
.dash-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-lg); padding: var(--card-pad); min-width: 0; }
</style>
