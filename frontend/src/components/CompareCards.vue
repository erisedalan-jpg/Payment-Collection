<script setup lang="ts">
import { fmtYuan, pct } from '@/lib/format'
import type { CompareTierStat } from '@/lib/compare'

defineProps<{ stats: CompareTierStat[] }>()

const ACCENT: Record<string, string> = {
  '100万以上': '#EF4444',
  '50-100万': '#F59E0B',
  '50万以下': '#10B981',
}

function rateColor(r: number): string {
  return r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444'
}
function delayColor(r: number): string {
  return r > 0.2 ? '#ef4444' : r > 0.1 ? '#f59e0b' : '#10b981'
}
</script>

<template>
  <div class="cmp-cards">
    <div v-for="s in stats" :key="s.tier" class="cmp-card">
      <div class="cmp-accent" :style="{ background: ACCENT[s.tier] || '#94a3b8' }"></div>
      <div class="cmp-title">{{ s.tier }}</div>
      <div class="cmp-metrics">
        <div class="cmp-metric">
          <span class="cmp-ml">项目数</span>
          <span class="cmp-mv" style="color:#0f172a">{{ s.projectCount || 0 }}</span>
        </div>
        <div class="cmp-metric">
          <span class="cmp-ml">计划回款总金额(万)</span>
          <span class="cmp-mv" style="color:#3b82f6">{{ fmtYuan(s.totalAmountWan) }}</span>
        </div>
        <div class="cmp-metric">
          <span class="cmp-ml">待回款总金额(万)</span>
          <span class="cmp-mv" style="color:#ef4444">{{ fmtYuan(s.remainingAmountWan) }}</span>
        </div>
        <div class="cmp-metric">
          <span class="cmp-ml">完成率</span>
          <span class="cmp-mv" :style="{ color: rateColor(s.completionRate) }">{{ pct(s.completionRate) }}</span>
        </div>
        <div class="cmp-metric">
          <span class="cmp-ml">延期率</span>
          <span class="cmp-mv" :style="{ color: delayColor(s.delayRate) }">{{ pct(s.delayRate) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cmp-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.cmp-card { position: relative; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; overflow: hidden; }
.cmp-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.cmp-title { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
.cmp-metrics { display: flex; flex-direction: column; gap: 8px; }
.cmp-metric { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
.cmp-ml { color: #64748b; }
.cmp-mv { font-weight: 700; }
</style>
