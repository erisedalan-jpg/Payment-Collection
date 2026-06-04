<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { computeTierStats } from '@/lib/dashboardStats'
import { fmtWan, pct } from '@/lib/format'
import { TIERS } from '@/nav'

const filter = useFilterStore()

const STATUS_ROWS = [
  { key: 'canAdvance', label: '加资源可提前' },
  { key: 'reachedCondition', label: '达到回款条件' },
  { key: 'advance', label: '已提前回款' },
  { key: 'fullPaid', label: '已全额回款' },
  { key: 'onTime', label: '正常实施中' },
  { key: 'delayed', label: '延期' },
] as const

const cards = computed(() =>
  TIERS.map((t) => {
    const s = computeTierStats(t.label, filter.filteredNodes) as Record<string, any>
    return {
      tier: t.label,
      color: t.color,
      projectCount: s.projectCount,
      expectedAmountWan: s.expectedAmountWan,
      actualAmountWan: s.actualAmountWan,
      remainingAmountWan: s.remainingAmountWan,
      completion: s.expectedAmountWan > 0 ? s.actualAmountWan / s.expectedAmountWan : 0,
      rows: STATUS_ROWS.map((r) => ({
        label: r.label,
        count: s[`${r.key}Count`] as number,
        amountWan: s[`${r.key}Expected`] as number,
      })),
    }
  }),
)
</script>

<template>
  <div class="tier-cards">
    <div v-for="c in cards" :key="c.tier" class="tier-card">
      <div class="tc-head">
        <span class="tc-dot" :style="{ background: c.color }" />
        <span class="tc-title">{{ c.tier }}</span>
        <span class="tc-count">{{ c.projectCount }} 个项目</span>
      </div>
      <div class="tc-amounts">
        <span>计划 {{ fmtWan(c.expectedAmountWan * 10000) }} 万</span>
        <span>已回 {{ fmtWan(c.actualAmountWan * 10000) }} 万</span>
        <span>完成率 {{ pct(c.completion) }}</span>
      </div>
      <table class="tc-table">
        <tbody>
          <tr v-for="r in c.rows" :key="r.label">
            <td>{{ r.label }}</td>
            <td class="tc-num">{{ r.count }}</td>
            <td class="tc-num">{{ fmtWan(r.amountWan * 10000) }} 万</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.tier-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; padding: 0 16px 16px; }
.tier-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
.tc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.tc-dot { width: 8px; height: 8px; border-radius: 50%; }
.tc-title { font-weight: 700; color: #0f172a; }
.tc-count { margin-left: auto; font-size: 12px; color: #64748b; }
.tc-amounts { display: flex; gap: 12px; font-size: 12px; color: #475569; margin-bottom: 8px; }
.tc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tc-table td { padding: 4px 0; border-top: 1px solid #f1f5f9; }
.tc-num { text-align: right; color: #334155; }
</style>
