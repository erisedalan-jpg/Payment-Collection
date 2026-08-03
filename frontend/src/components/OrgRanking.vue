<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePaymentFilterStore } from '@/stores/paymentFilter'
import { useExcludeStore } from '@/stores/exclude'
import { useDataStore } from '@/stores/data'
import { payOrgRanking } from '@/lib/payDashboard'
import { filterProjects } from '@/lib/paymentPmis'
import { goBoard } from '@/lib/navContext'
import { fmtWan, pct } from '@/lib/format'
import SegToggle from './SegToggle.vue'
import SectionTitle from '@/components/SectionTitle.vue'

const filter = usePaymentFilterStore()
const exclude = useExcludeStore()
const data = useDataStore()
const router = useRouter()
const sortBy = ref('actualTotal')
const SORT_OPTS = [
  { value: 'actualTotal', label: '已回款' },
  { value: 'achievementRate', label: '达成率' },
]

const ranked = computed(() => {
  const projects = filterProjects(data.data?.projects ?? [], {
    viewMode: filter.viewMode,
    viewL4: filter.viewL4,
    viewPM: filter.viewPM,
    excludeActive: exclude.excludeOn,
    excludedIds: exclude.excludedIds,
  })
  return payOrgRanking(
    projects,
    data.data?.paymentNodes,
    filter.payRecordsAll,
    filter.dateStart,
    filter.dateEnd,
    sortBy.value as 'actualTotal' | 'achievementRate',
  )
})
const maxActual = computed(() => Math.max(1, ...ranked.value.map((o) => o.actualTotal)))

function rateColor(r: number | null): string {
  if (r == null) return 'var(--mut)'
  return r >= 0.45 ? 'var(--c-paid)' : r >= 0.3 ? 'var(--c-pending)' : 'var(--danger)'
}
</script>

<template>
  <div class="org-ranking">
    <div class="or-head">
      <SectionTitle>服务组达成排名</SectionTitle>
      <SegToggle v-model="sortBy" :options="SORT_OPTS" />
    </div>
    <div class="org-list">
      <div
        v-for="(o, i) in ranked"
        :key="o.org"
        v-activate
        class="rank-item"
        @click="goBoard(router, 'orgL4')"
      >
        <span class="rank-no">{{ i + 1 }}</span>
        <span class="rank-name" :title="o.org">{{ o.org }}</span>
        <span class="rank-bar-wrap">
          <span class="rank-bar" :style="{ width: ((o.actualTotal / maxActual) * 100).toFixed(1) + '%', background: rateColor(o.achievementRate) }" />
        </span>
        <span class="rank-amount u-num">{{ fmtWan(o.actualTotal) }} 万</span>
        <span class="rank-rate u-num" :style="{ color: rateColor(o.achievementRate) }">{{ pct(o.achievementRate) }}</span>
      </div>
      <div v-if="!ranked.length" class="or-empty">暂无数据</div>
    </div>
  </div>
</template>

<style scoped>
.org-ranking { }
.or-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
/* 列表区：展示全部 L4，超出时纵向滚动；360px ≈ 8 行 × 32px 行高 + 8px 内边距，令牌无对应行高值，故用具体 px */
.org-list { max-height: 360px; overflow-y: auto; }
.rank-item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; font-size: var(--fs-2); cursor: pointer; border-radius: var(--r-sm); }
.rank-item:hover { background: var(--card2); }
.rank-no { width: 20px; text-align: center; color: var(--mut); }
.rank-name { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt); }
/* 进度条槽与填充:原 4px 不在圆角档位(6/10/14/999)上。条高 10px,取 --r-full 走胶囊语义
   —— 浏览器会把半径按高度一半(5px)收敛,实际渲染与原 4px 只差 1px,而 --r-sm(6px) 收敛后同样是 5px、
   两者渲染等价,故按"进度条=胶囊"的语义选 --r-full 而非最近数值档。 */
.rank-bar-wrap { flex: 1; background: var(--card2); border-radius: var(--r-full); height: 10px; overflow: hidden; }
.rank-bar { display: block; height: 10px; border-radius: var(--r-full); }
.rank-amount { width: 90px; text-align: right; color: var(--sub); }
.rank-rate { width: 56px; text-align: right; font-weight: 600; }
.or-empty { color: var(--mut); padding: 12px; text-align: center; }
</style>
