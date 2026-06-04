<script setup lang="ts">
import { onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import DashSummaryCards from '@/components/DashSummaryCards.vue'
import TierCards from '@/components/TierCards.vue'

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
      <DashSummaryCards />
      <TierCards />
    </template>
    <p v-else class="dash-hint">暂无数据，请先在数据管理中同步/导入。</p>
  </div>
</template>

<style scoped>
.dashboard { min-height: 100%; }
.dash-hint { padding: 24px; color: #64748b; }
.dash-hint.error { color: #ef4444; }
</style>
