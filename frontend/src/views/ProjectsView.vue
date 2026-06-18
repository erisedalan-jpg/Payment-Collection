<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, filterProjectRows, distinctOptions, type ProjectFilters } from '@/lib/projectList'
import { fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import HealthBadge from '@/components/HealthBadge.vue'
import FollowupModal from '@/components/FollowupModal.vue'
import Modal from '@/components/Modal.vue'
import { exportSheets } from '@/lib/exportXlsx'
import { buildExportSheets, type ExportScope } from '@/lib/projectExport'
import { followupApi } from '@/lib/followupApi'

const data = useDataStore()
const projectTags = useProjectTagsStore()
const route = useRoute()
const router = useRouter()
onMounted(() => {
  if (!data.data) data.load()
  if (!projectTags.loaded) projectTags.load()
})

const rows = computed(() =>
  buildProjectRows(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
    projectTags.assignments,
  ),
)
const filters = reactive<ProjectFilters>({ search: '', manager: [], orgL4: [], stage: [], projectStatus: [], riskLevel: [], projectLevel: [], paymentStatus: [], health: [], presale: '', paused: '', overspend: '', tags: [] })

// 路由 query → 初始筛选:多选键收单值为 [v]/数组(KPI 单值链接如 ?riskLevel=高 仍工作),单值键收 string
const MULTI_KEYS = ['manager', 'orgL4', 'stage', 'projectStatus', 'riskLevel', 'projectLevel', 'paymentStatus', 'health'] as const
const SINGLE_KEYS = ['search', 'presale', 'paused', 'overspend'] as const
for (const k of MULTI_KEYS) {
  const v = route.query[k]
  if (typeof v === 'string' && v) filters[k] = [v]
  else if (Array.isArray(v)) filters[k] = v.filter((x): x is string => typeof x === 'string' && !!x)
}
for (const k of SINGLE_KEYS) {
  const v = route.query[k]
  if (typeof v === 'string' && v) filters[k] = v
}

const filtered = computed(() => filterProjectRows(rows.value, filters))

const managerOpts = computed(() => distinctOptions(rows.value, 'projectManager'))
const orgOpts = computed(() => distinctOptions(rows.value, 'orgL4'))
const stageOpts = computed(() => distinctOptions(rows.value, 'stage'))
const statusOpts = computed(() => distinctOptions(rows.value, 'projectStatus'))
const riskOpts = computed(() => distinctOptions(rows.value, 'riskLevel'))
const levelOpts = computed(() => distinctOptions(rows.value, 'projectLevel'))
const HEALTH_OPTS = ['健康', '关注', '风险', '无数据']
const PAY_OPTS = ['无节点', '回款中', '延期', '已回清']

// 分页(S1:633 行全量渲染是卡慢根因)
const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

const columns: DataColumn[] = [
  { key: 'projectName', label: '项目名称' },
  { key: 'projectId', label: '项目编号', width: 190 },
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'projectManager', label: '项目经理', width: 90 },
  { key: 'orgL4', label: '服务组(L4)', width: 110 },
  { key: 'stage', label: '阶段', width: 90 },
  { key: 'progress', label: '完工%', width: 85, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'riskLevel', label: '风险', width: 85, formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'projectLevel', label: '级别', width: 70 },
  { key: 'projectType', label: '项目类型', width: 100 },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'paymentRatio', label: '回款完成率', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'health', label: '健康度', width: 90 },
  { key: 'tags', label: '标签', width: 160, formatter: (v) => (Array.isArray(v) && v.length ? v.join('、') : '') },
  { key: 'action', label: '操作', width: 80 },
]

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
      <el-input v-model="filters.search" size="small" placeholder="搜索 项目名/编号/客户/经理" clearable style="width: 230px" />
      <el-select v-model="filters.manager" size="small" multiple collapse-tags clearable placeholder="项目经理" style="width: 130px">
        <el-option v-for="o in managerOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.orgL4" size="small" multiple collapse-tags clearable placeholder="服务组(L4)" style="width: 130px">
        <el-option v-for="o in orgOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.stage" size="small" multiple collapse-tags clearable placeholder="阶段" style="width: 120px">
        <el-option v-for="o in stageOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectStatus" size="small" multiple collapse-tags clearable placeholder="项目状态" style="width: 120px">
        <el-option v-for="o in statusOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.riskLevel" size="small" multiple collapse-tags clearable placeholder="风险等级" style="width: 120px">
        <el-option v-for="o in riskOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectLevel" size="small" multiple collapse-tags clearable placeholder="级别" style="width: 120px">
        <el-option v-for="o in levelOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.paymentStatus" size="small" multiple collapse-tags clearable placeholder="回款状态" style="width: 120px">
        <el-option v-for="o in PAY_OPTS" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.health" size="small" multiple collapse-tags clearable placeholder="健康度" style="width: 120px">
        <el-option v-for="o in HEALTH_OPTS" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.presale" size="small" clearable placeholder="售前整合" style="width: 105px"
        :empty-values="['', null, undefined]" :value-on-clear="''">
        <el-option value="yes" label="售前整合" />
        <el-option value="no" label="非售前" />
      </el-select>
      <el-select v-model="filters.tags" size="small" multiple collapse-tags clearable placeholder="标签" style="width: 140px">
        <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
      </el-select>
      <button class="pv-export-btn" @click="exOpen = true">导出</button>
    </div>

    <div v-if="filters.paused === 'yes' || filters.overspend === 'yes'" class="pv-tags">
      <span v-if="filters.paused === 'yes'" class="pv-tag">已暂停项目 <button @click="filters.paused = ''">✕</button></span>
      <span v-if="filters.overspend === 'yes'" class="pv-tag">超支项目 <button @click="filters.overspend = ''">✕</button></span>
    </div>

    <div v-if="!rows.length" class="pv-empty">暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>
    <DataTable v-else :columns="columns" :rows="paged" :show-count="false" clickable @row-click="onRow">
      <template #cell-projectName="{ row }">
        {{ row.projectName }}<span v-if="row.hasClosed" class="pv-origin">原项目*</span>
      </template>
      <template #cell-health="{ row }">
        <HealthBadge :overall="row.health" />
      </template>
      <template #cell-tags="{ value }">
        <span v-for="t in (value || [])" :key="t" class="lst-tag">{{ t }}</span>
      </template>
      <template #cell-action="{ row }">
        <button class="pv-fu-btn" @click.stop="openFollowup(row)">跟进</button>
      </template>
      <template #header-health>
        <span class="pv-health-head">健康度
          <el-tooltip placement="top">
            <template #content>
              四维异常——进度:里程碑进度状态含滞后/延期/超期;风险:最高等级高且未关闭&gt;0;成本:超支或消耗比&gt;100%;回款:存在延期回款节点。<br />总评:0 项异常=健康 / 1 项=关注 / ≥2 项=风险;PMIS 未匹配=无数据。
            </template>
            <span class="pv-info">i</span>
          </el-tooltip>
        </span>
      </template>
    </DataTable>

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
.toolbar { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.pv-origin { margin-left: var(--sp-2); padding: 0 var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); background: var(--selected-tint); color: var(--accent); }
.pv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.pv-tags { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.pv-tag { display: inline-flex; align-items: center; gap: var(--sp-2); padding: 2px var(--sp-3); border-radius: var(--r-full); font-size: var(--fs-1); background: var(--selected-tint); color: var(--accent); font-weight: 600; }
.pv-tag button { border: none; background: none; color: var(--accent); cursor: pointer; padding: 0; font-size: var(--fs-1); }
.pv-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pv-total { font-size: var(--fs-1); color: var(--sub); }
.pv-health-head { display: inline-flex; align-items: center; gap: var(--sp-1); }
.pv-info { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: var(--r-full); border: 1px solid var(--sub); color: var(--sub); font-size: 10px; font-style: italic; cursor: help; line-height: 1; }
.lst-tag { display: inline-block; padding: 1px 6px; margin: 1px; border-radius: var(--r-sm); background: var(--card2); color: var(--sub); font-size: var(--fs-1); }
.pv-fu-btn { font-size: var(--fs-1); color: var(--accent); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 8px; cursor: pointer; }
.pv-export-btn { font-size: var(--fs-1); color: var(--accent); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 10px; cursor: pointer; }
</style>
