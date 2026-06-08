<script setup lang="ts">
import { onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import DashMetrics from '@/components/DashMetrics.vue'
import TierStrip from '@/components/TierStrip.vue'
import OrgRanking from '@/components/OrgRanking.vue'
import TrendCard from '@/components/TrendCard.vue'
import DelayTopCard from '@/components/DelayTopCard.vue'

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
      <div class="dash-grid">
        <section class="dash-card"><TierStrip /></section>
        <section class="dash-card"><OrgRanking /></section>
        <section class="dash-card"><TrendCard /></section>
        <section class="dash-card"><DelayTopCard /></section>
      </div>
    </template>
    <p v-else class="dash-hint">暂无数据，请先在数据管理中同步/导入。</p>
  </div>
</template>

<style scoped>
.dashboard { min-height: 100%; padding: 16px; }
.dash-hint { padding: 24px; color: var(--mut); }
.dash-hint.error { color: var(--danger); }
.dash-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; margin-top: 12px; }
.dash-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; min-width: 0; }
@media (max-width: 900px) { .dash-grid { grid-template-columns: 1fr; } }
</style>
