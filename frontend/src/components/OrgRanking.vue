<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { rankByOrg } from '@/lib/dashboardCharts'
import { fmtWan, pct } from '@/lib/format'
import { TIERS } from '@/nav'

const filter = useFilterStore()
const tierFilter = ref('')
const sortBy = ref<'actualTotal' | 'achievementRate'>('actualTotal')

const ranked = computed(() => rankByOrg(filter.filteredNodes, tierFilter.value, sortBy.value).slice(0, 15))
const maxActual = computed(() => Math.max(1, ...ranked.value.map((o) => o.actualTotal)))

function rateColor(r: number): string {
  return r >= 0.45 ? '#10b981' : r >= 0.3 ? '#f59e0b' : '#ef4444'
}
</script>

<template>
  <div class="org-ranking">
    <div class="or-toolbar">
      <select data-test="rank-tier" v-model="tierFilter">
        <option value="">全部区间</option>
        <option v-for="t in TIERS" :key="t.slug" :value="t.label">{{ t.label }}</option>
      </select>
      <select data-test="rank-sort" v-model="sortBy">
        <option value="actualTotal">已回款金额</option>
        <option value="achievementRate">已回款达成率</option>
      </select>
    </div>
    <div v-for="(o, i) in ranked" :key="o.org" class="rank-item">
      <span class="rank-no">{{ i + 1 }}</span>
      <span class="rank-name" :title="o.org">{{ o.org }}</span>
      <span class="rank-bar-wrap">
        <span class="rank-bar" :style="{ width: (o.actualTotal / maxActual * 100).toFixed(1) + '%', background: rateColor(o.achievementRate) }" />
      </span>
      <span class="rank-amount">{{ fmtWan(o.actualTotal) }} 万</span>
      <span class="rank-rate" :style="{ color: rateColor(o.achievementRate) }">{{ pct(o.achievementRate) }}</span>
    </div>
    <div v-if="!ranked.length" class="or-empty">暂无数据</div>
  </div>
</template>

<style scoped>
.org-ranking { padding: 8px 0; }
.or-toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
.or-toolbar select { padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; }
.rank-item { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 13px; }
.rank-no { width: 20px; text-align: center; color: #64748b; }
.rank-name { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-bar-wrap { flex: 1; background: #f1f5f9; border-radius: 4px; height: 10px; }
.rank-bar { display: block; height: 10px; border-radius: 4px; }
.rank-amount { width: 90px; text-align: right; color: #334155; }
.rank-rate { width: 56px; text-align: right; font-weight: 600; }
.or-empty { color: #94a3b8; padding: 12px; text-align: center; }
</style>
