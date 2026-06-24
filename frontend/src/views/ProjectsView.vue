<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, filterProjectRows, type ProjectFilters, type ProjectRow } from '@/lib/projectList'
import { applyColumnFilters, cfUniqueValues } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import HealthBadge from '@/components/HealthBadge.vue'
import FollowupModal from '@/components/FollowupModal.vue'
import Modal from '@/components/Modal.vue'
import { exportSheets } from '@/lib/exportXlsx'
import { buildExportSheets, type ExportScope } from '@/lib/projectExport'
import { followupApi } from '@/lib/followupApi'

const TABLE_ID = 'projects-active'
const data = useDataStore()
const projectTags = useProjectTagsStore()
const cf = useCrossFilterStore()
const route = useRoute()
const router = useRouter()
onMounted(() => {
  if (!data.data) data.load()
  if (!projectTags.loaded) projectTags.load()
})

const rows = computed(() =>
  buildProjectRows((data.data?.projects ?? []) as Project[], (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>, projectTags.assignments))

// 工具栏特殊筛选(非列枚举)
const sp = reactive<ProjectFilters>({ search: '', presale: '', paused: '', overspend: '', tags: [], riskCategory: '' })
// 先表头列枚举(crossFilter) → 再特殊项
const filtered = computed(() => filterProjectRows(applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as ProjectRow[], sp))

const ALL_COLUMNS: DataColumn[] = [
  { key: 'projectName', label: '项目名称', width: 220 },
  { key: 'projectId', label: '项目编号', width: 175 },
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'projectManager', label: '项目经理', width: 96 },
  { key: 'orgL4', label: 'L4组', width: 110 },
  { key: 'stage', label: '阶段', width: 100 },
  { key: 'progress', label: '完工%', width: 90, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'riskLevel', label: '风险', width: 96, formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'projectLevel', label: '级别', width: 80 },
  { key: 'projectType', label: '项目类型', width: 110 },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'paymentRatio', label: '回款完成率', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'projectStatus', label: '项目状态', width: 100 },
  { key: 'health', label: '健康度', width: 96 },
  { key: 'riskReasons', label: '关注原因', width: 220 },
  { key: 'paymentStatus', label: '回款状态', width: 100 },
  { key: 'tags', label: '标签', width: 160, formatter: (v) => (Array.isArray(v) && v.length ? v.join('、') : '') },
  { key: 'top1000', label: 'TOP1000', width: 90 },
  { key: 'quadrant', label: '象限', width: 140 },
  { key: 'action', label: '操作', width: 80, fixed: 'right' },
]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ['projectName', 'projectId', 'contractAmount', 'projectManager', 'orgL4', 'riskLevel', 'projectLevel', 'projectType', 'costRatio', 'paymentRatio', 'projectStatus', 'health', 'riskReasons', 'action']
const FILTERABLE = new Set(['projectManager', 'orgL4', 'stage', 'projectStatus', 'riskLevel', 'projectLevel', 'projectType', 'paymentStatus', 'health', 'top1000', 'quadrant'])

const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))

function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

// KPI 深链 → 列枚举写 crossFilter(并确保列可见) / 特殊项写本地态
function qval(v: unknown): string | null {
  if (typeof v === 'string' && v) return v
  if (Array.isArray(v)) { const s = v.find((x) => typeof x === 'string' && x); return (s as string) || null }
  return null
}
// 每次进页先清空本表残留筛选，再按 query 重建，确保 KPI 深链不与跨导航残留叠加
cf.clearAll(TABLE_ID)
for (const key of FILTERABLE) {
  const val = qval(route.query[key])
  if (val) {
    if (!prefs.visibleKeys.value.includes(key)) prefs.toggle(key)   // 罕见:深链命中默认隐藏列(paymentStatus)→显
    cf.setColumnFilter(TABLE_ID, key, [val], cfUniqueValues(rows.value, key).length)
  }
}
{
  const presale = qval(route.query.presale); if (presale) sp.presale = presale
  const paused = qval(route.query.paused); if (paused) sp.paused = paused
  const overspend = qval(route.query.overspend); if (overspend) sp.overspend = overspend
  const riskCategory = qval(route.query.riskCategory); if (riskCategory) sp.riskCategory = riskCategory
}

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

function onRow(row: Record<string, any>) { router.push(`/project/${row.projectId}`) }

const fuOpen = ref(false)
const fuProject = ref<{ projectId: string; projectName: string }>({ projectId: '', projectName: '' })
function openFollowup(row: Record<string, any>) {
  fuProject.value = { projectId: row.projectId, projectName: row.projectName || '' }
  fuOpen.value = true
}

const exOpen = ref(false)
const exScope = ref<ExportScope[]>(['list', 'tags', 'followup'])
const EX_OPTS: { value: ExportScope; label: string }[] = [
  { value: 'list', label: '项目清单' },
  { value: 'tags', label: '项目标签' },
  { value: 'followup', label: '跟进记录' },
  { value: 'nodes', label: '回款节点' },
  { value: 'milestones', label: '里程碑' },
]
async function doExport() {
  const fu = exScope.value.includes('followup') ? (await followupApi.all()).records : []
  const sheets = buildExportSheets(exScope.value, {
    rows: filtered.value,
    projects: (data.data?.projects ?? []) as any,
    assignments: projectTags.assignments,
    followup: fu as any,
    paymentNodes: (data.data?.paymentNodes ?? {}) as any,
    milestones: (data.data?.projectMilestones ?? {}) as any,
  })
  exportSheets(`项目数据导出_${filtered.value.length}项.xlsx`, sheets)
  exOpen.value = false
}
</script>

<template>
  <div class="projects-view">
    <h2 class="pv-title">在建项目</h2>
    <div class="toolbar">
      <el-input v-model="sp.search" size="small" placeholder="搜索 项目名/编号/客户/经理" clearable style="width: 230px" />
      <el-select v-model="sp.presale" size="small" clearable placeholder="售前整合" style="width: 105px"
        :empty-values="['', null, undefined]" :value-on-clear="''">
        <el-option value="yes" label="售前整合" />
        <el-option value="no" label="非售前" />
      </el-select>
      <el-select v-model="sp.tags" size="small" multiple collapse-tags clearable placeholder="标签" style="width: 140px">
        <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
      </el-select>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button class="pv-export-btn" @click="exOpen = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="sp.paused === 'yes' || sp.overspend === 'yes' || sp.riskCategory" class="pv-tags">
      <span v-if="sp.paused === 'yes'" class="pv-tag">已暂停项目 <button @click="sp.paused = ''">✕</button></span>
      <span v-if="sp.overspend === 'yes'" class="pv-tag">超支项目 <button @click="sp.overspend = ''">✕</button></span>
      <span v-if="sp.riskCategory" class="pv-tag">风险分类: {{ sp.riskCategory }} <button @click="sp.riskCategory = ''">✕</button></span>
    </div>

    <div v-if="!rows.length" class="pv-empty">暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>
    <div v-else class="pv-scroll">
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="pv-th">{{ c.label }}<el-tooltip v-if="c.key === 'health'" placement="top">
              <template #content>四维异常——进度:里程碑进度状态含滞后/延期/超期;风险:最高等级高且未关闭&gt;0;成本:超支或消耗比&gt;100%;回款:存在延期回款节点。<br />总评:0 项=健康 / 1 项=关注 / ≥2 项=风险;PMIS 未匹配=无数据。</template>
              <span class="pv-info">i</span>
            </el-tooltip><ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" /></span>
        </template>
        <template #cell-projectName="{ row }">
          {{ row.projectName }}<span v-if="row.hasClosed" class="pv-origin">原项目*</span><span v-if="row.isAnomalous" class="pv-anomaly" title="服务组 L4 缺失，回款看板不统计">数据异常</span>
        </template>
        <template #cell-health="{ row }">
          <HealthBadge :overall="row.health" />
        </template>
        <template #cell-riskReasons="{ row }">
          <span v-if="!row.riskReasons || !row.riskReasons.length" class="rr-none">-</span>
          <span v-else class="rr-pills">
            <span
              v-for="r in row.riskReasons"
              :key="r.category"
              class="rr-pill"
              :class="`rr-pill--${r.tone}`"
              :title="r.detail"
            >{{ r.category }}</span>
          </span>
        </template>
        <template #cell-tags="{ value }">
          <span v-for="t in (value || [])" :key="t" class="lst-tag">{{ t }}</span>
        </template>
        <template #cell-action="{ row }">
          <button class="pv-fu-btn" @click.stop="openFollowup(row)">跟进</button>
        </template>
      </DataTable>
    </div>

    <FollowupModal v-model="fuOpen" :project-id="fuProject.projectId" :project-name="fuProject.projectName" />

    <Modal v-model="exOpen" title="导出范围" width="420px">
      <el-checkbox-group v-model="exScope">
        <el-checkbox v-for="o in EX_OPTS" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
      </el-checkbox-group>
      <div style="margin-top: var(--gap-card)">
        <button class="pv-fu-btn" :disabled="!exScope.length" @click="doExport">
          导出 xlsx（当前筛选 {{ filtered.length }} 项）
        </button>
      </div>
    </Modal>

    <div v-if="rows.length" class="pv-pager">
      <span class="pv-total u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.projects-view { padding: var(--sp-4); }
.pv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.pv-scroll { overflow-x: auto; }
.pv-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
.pv-origin { margin-left: var(--sp-2); padding: 0 var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); background: var(--selected-tint); color: var(--accent); }
.pv-anomaly { margin-left: var(--sp-2); padding: 0 var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); background: var(--warn-bg); color: var(--warn-text); }
.pv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.pv-tags { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.pv-tag { display: inline-flex; align-items: center; gap: var(--sp-2); padding: 2px var(--sp-3); border-radius: var(--r-full); font-size: var(--fs-1); background: var(--selected-tint); color: var(--accent); font-weight: 600; }
.pv-tag button { border: none; background: none; color: var(--accent); cursor: pointer; padding: 0; font-size: var(--fs-1); }
.pv-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pv-total { font-size: var(--fs-1); color: var(--sub); }
.pv-info { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: var(--r-full); border: 1px solid var(--sub); color: var(--sub); font-size: 10px; font-style: italic; cursor: help; line-height: 1; }
.lst-tag { display: inline-block; padding: 1px 6px; margin: 1px; border-radius: var(--r-sm); background: var(--card2); color: var(--sub); font-size: var(--fs-1); }
.pv-fu-btn { font-size: var(--fs-1); color: var(--accent); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 8px; cursor: pointer; }
.pv-export-btn { font-size: var(--fs-1); color: var(--accent); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 10px; cursor: pointer; }
/* 关注原因列 pill 样式 */
.rr-none { color: var(--mut); font-size: var(--fs-1); }
.rr-pills { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.rr-pill { display: inline-block; padding: 1px var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); font-weight: 600; line-height: var(--lh-base); cursor: default; }
.rr-pill--warn { background: var(--warn-bg); color: var(--warn-text); }
.rr-pill--danger { background: var(--danger-bg); color: var(--danger-text); }
.rr-pill--mut { background: var(--card2); color: var(--sub); }
</style>
