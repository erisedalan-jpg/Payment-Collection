<script setup lang="ts">
import { fmtYuan, pct } from '@/lib/format'
import type { PmAgg } from '@/lib/pmView'

defineProps<{ rows: PmAgg[]; expanded: string }>()
const emit = defineEmits<{ select: [string] }>()

const rateColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444')
</script>

<template>
  <div class="pm-rank-wrap">
    <table class="pm-rank-table">
      <thead>
        <tr>
          <th class="c">排名</th>
          <th>项目经理</th>
          <th class="c">项目数</th>
          <th class="r">负责金额(元)</th>
          <th class="r">已回款金额(元)</th>
          <th class="r">待回款金额(元)</th>
          <th class="c">完成率</th>
          <th class="c">延期节点</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(p, i) in rows"
          :key="p.name"
          class="pm-row"
          :class="{ expanded: expanded === p.name }"
          @click="emit('select', p.name)"
        >
          <td class="c rank">{{ i + 1 }}</td>
          <td class="name">{{ p.name }}</td>
          <td class="c">{{ p.projectCount }}</td>
          <td class="r">{{ fmtYuan(p.totalAmount) }}</td>
          <td class="r" style="color:#3b82f6">{{ fmtYuan(p.actualPayment) }}</td>
          <td class="r" style="color:#ef4444">{{ fmtYuan(p.remaining) }}</td>
          <td class="c" :style="{ color: rateColor(p.rate), fontWeight: 700 }">{{ pct(p.rate) }}</td>
          <td class="c" :style="{ color: p.delayedCount > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }">
            {{ p.delayedCount }}
          </td>
        </tr>
      </tbody>
    </table>
    <div class="pm-count">共 {{ rows.length }} 位项目经理</div>
  </div>
</template>

<style scoped>
.pm-rank-wrap { overflow-x: auto; }
.pm-rank-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pm-rank-table th,
.pm-rank-table td { border: 1px solid #f1f5f9; padding: 8px 10px; }
.pm-rank-table th { background: #f8fafc; color: #475569; font-weight: 600; }
.pm-rank-table th.c, .pm-rank-table td.c { text-align: center; }
.pm-rank-table th.r, .pm-rank-table td.r { text-align: right; font-family: var(--font-mono, monospace); }
.pm-row { cursor: pointer; }
.pm-row:hover { background: #f8fafc; }
.pm-row.expanded { background: #eef2ff; font-weight: 700; }
.pm-row .name { font-weight: 600; }
.pm-row .rank { font-size: 15px; }
.pm-count { font-size: 12px; color: #94a3b8; padding: 6px 0; }
</style>
