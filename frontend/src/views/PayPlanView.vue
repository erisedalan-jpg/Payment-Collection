<script setup lang="ts">
import { computed } from 'vue'
import { usePagedRows } from '@/lib/usePagedRows'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters } from '@/lib/crossFilter'
import ColumnFilter from '@/components/ColumnFilter.vue'
import { formatCellValue } from '@/lib/cellFormat'
import { fmtWan, fmtRatio } from '@/lib/format'
import { projectPaymentRows, progressBuckets, filterProjects, rateColorPmis } from '@/lib/paymentPmis'

const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()
const cf = useCrossFilterStore()
const TABLE_ID = 'panalysis-progress'

const rows = computed(() =>
  projectPaymentRows(
    filterProjects(data.data?.projects ?? [], {
      viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
      excludeActive: filter.excludeOn, excludedIds: filter.excludedIds,
    }),
    data.data?.projectPmis ?? {},
    data.data?.paymentNodes,
    filter.payRecordsAll,
    filter.dateStart,
    filter.dateEnd,
  ),
)
const buckets = computed(() => progressBuckets(rows.value))

const COLS = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'dept', label: '部门' },
  { key: 'progress', label: '进度态' },
  { key: 'contract', label: '合同(万)' },
  { key: 'actualTotal', label: '已回款(万)' },
  { key: 'paymentRatio', label: '完成率' },
]
const filteredRows = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)))
const { paged, currentPage, pageSize } = usePagedRows(filteredRows, 50)
const fmtCol = (key: string, v: any) =>
  key === 'contract' || key === 'actualTotal' ? fmtWan(v) : key === 'paymentRatio' ? fmtRatio(v) : formatCellValue(v, key)
function onRow(r: Record<string, any>) { pd.open(r.projectId) }
</script>

<template>
  <div class="progress-tab">
    <section class="buckets">
      <div v-for="b in buckets.buckets" :key="b.key" class="bk">
        <div class="bk-title">{{ b.key }}</div>
        <div class="bk-main u-num">{{ b.projectCount }}<span class="bk-unit"> 个</span></div>
        <div class="bk-sub u-num">
          合同Σ {{ fmtWan(b.contractSum) }} 万 · 已回Σ {{ fmtWan(b.actualSum) }} 万 ·
          完成率 <span :style="{ color: rateColorPmis(b.rate) }">{{ fmtRatio(b.rate) }}</span>
        </div>
      </div>
      <div v-if="buckets.unknown" class="bk-unknown">另有 {{ buckets.unknown }} 个项目无合同（未知，不计入进度桶）</div>
    </section>

    <div class="cf-bar">共 {{ filteredRows.length }} / {{ rows.length }} 个项目
      <button class="cf-clear" @click="cf.clearAll(TABLE_ID)">清除筛选</button>
    </div>
    <div class="tbl-wrap">
      <table class="ptbl u-num">
        <thead>
          <tr>
            <th v-for="c in COLS" :key="c.key">
              <span class="th-l">{{ c.label }}</span>
              <ColumnFilter :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" :group="[]" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in paged" :key="r.projectId" class="prow" @click="onRow(r)">
            <td v-for="c in COLS" :key="c.key" :style="c.key === 'paymentRatio' ? { color: rateColorPmis(r.paymentRatio) } : undefined">
              {{ fmtCol(c.key, r[c.key]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pp-pager">
      <span class="u-num">共 {{ filteredRows.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filteredRows.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.buckets { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--gap-card); margin-bottom: var(--gap-section); }
.bk { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.bk-title { font-size: var(--fs-2); color: var(--sub); margin-bottom: var(--sp-1); }
.bk-main { font-size: var(--fs-6); font-weight: 700; color: var(--txt); }
.bk-unit { font-size: var(--fs-2); color: var(--mut); font-weight: 400; }
.bk-sub { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-1); }
.bk-unknown { grid-column: 1 / -1; font-size: var(--fs-1); color: var(--mut); }
.cf-bar { display: flex; align-items: center; gap: var(--sp-3); font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-2); }
.cf-clear { font-size: var(--fs-1); color: var(--accent); background: none; border: none; cursor: pointer; }
.tbl-wrap { overflow-x: auto; }
.ptbl { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.ptbl th, .ptbl td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; white-space: nowrap; }
.ptbl th { background: var(--card2); color: var(--sub); }
.prow { cursor: pointer; }
.prow:hover { background: var(--hover-tint); }
.pp-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pp-pager .u-num { font-size: var(--fs-1); color: var(--sub); }
</style>
