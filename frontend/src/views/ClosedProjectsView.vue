<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { ClosedProject } from '@/types/analysis'
import { buildClosedRows, filterClosedRows, distinctClosedOptions, type ClosedFilters } from '@/lib/closedProjectList'
import { fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'

const data = useDataStore()
const router = useRouter()
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() => buildClosedRows((data.data?.closedProjects ?? []) as ClosedProject[]))
const filters = reactive<ClosedFilters>({ search: '', manager: [], orgL4: [], orgL3_1: [], projectType: [], projectLevel: [], rating: [], stage: [], projectStatus: [] })
const filtered = computed(() => filterClosedRows(rows.value, filters))

const managerOpts = computed(() => distinctClosedOptions(rows.value, 'projectManager'))
const orgL4Opts = computed(() => distinctClosedOptions(rows.value, 'orgL4'))
const orgL31Opts = computed(() => distinctClosedOptions(rows.value, 'orgL3_1'))
const typeOpts = computed(() => distinctClosedOptions(rows.value, 'projectType'))
const levelOpts = computed(() => distinctClosedOptions(rows.value, 'projectLevel'))
const ratingOpts = computed(() => distinctClosedOptions(rows.value, 'rating'))
const stageOpts = computed(() => distinctClosedOptions(rows.value, 'stage'))
const statusOpts = computed(() => distinctClosedOptions(rows.value, 'projectStatus'))

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

const columns: DataColumn[] = [
  { key: 'projectName', label: '项目名称' },
  { key: 'projectId', label: '项目编号', width: 190 },
  { key: 'customer', label: '客户', width: 130 },
  { key: 'signParty', label: '签约单位', width: 130 },
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'orgL4', label: '服务组(L4)', width: 110 },
  { key: 'orgL3_1', label: 'L3-1部门', width: 110 },
  { key: 'projectManager', label: '项目经理', width: 90 },
  { key: 'projectType', label: '项目类型', width: 100 },
  { key: 'projectLevel', label: '级别', width: 70 },
  { key: 'rating', label: '评级', width: 70 },
  { key: 'stage', label: '项目阶段', width: 100 },
  { key: 'projectStatus', label: '项目状态', width: 100 },
  { key: 'closedAt', label: '关闭时间', width: 110, sortable: true },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'overspend', label: '项目超支', width: 90, formatter: (v) => (v === true ? '是' : '否') },
]

function onRow(row: Record<string, any>) { router.push(`/closed-project/${row.projectId}`) }
</script>

<template>
  <div class="closed-view">
    <h2 class="cv-title">已关闭项目</h2>
    <div class="toolbar">
      <el-input v-model="filters.search" size="small" placeholder="搜索 项目名/编号/客户/经理" clearable style="width: 230px" />
      <el-select v-model="filters.manager" size="small" multiple collapse-tags clearable placeholder="项目经理" style="width: 130px">
        <el-option v-for="o in managerOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.orgL4" size="small" multiple collapse-tags clearable placeholder="服务组(L4)" style="width: 130px">
        <el-option v-for="o in orgL4Opts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.orgL3_1" size="small" multiple collapse-tags clearable placeholder="L3-1部门" style="width: 130px">
        <el-option v-for="o in orgL31Opts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectType" size="small" multiple collapse-tags clearable placeholder="项目类型" style="width: 120px">
        <el-option v-for="o in typeOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectLevel" size="small" multiple collapse-tags clearable placeholder="级别" style="width: 110px">
        <el-option v-for="o in levelOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.rating" size="small" multiple collapse-tags clearable placeholder="评级" style="width: 110px">
        <el-option v-for="o in ratingOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.stage" size="small" multiple collapse-tags clearable placeholder="项目阶段" style="width: 120px">
        <el-option v-for="o in stageOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectStatus" size="small" multiple collapse-tags clearable placeholder="项目状态" style="width: 120px">
        <el-option v-for="o in statusOpts" :key="o" :value="o" :label="o" />
      </el-select>
    </div>

    <div v-if="!rows.length" class="cv-empty">暂无已关闭项目数据——请在「数据管理」提供 PMIS 已关闭三表后点「更新数据」。</div>
    <DataTable v-else :columns="columns" :rows="paged" :show-count="false" clickable @row-click="onRow" />

    <div v-if="rows.length" class="cv-pager">
      <span class="cv-total u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.closed-view { padding: var(--sp-4); }
.cv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.cv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.cv-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.cv-total { font-size: var(--fs-1); color: var(--sub); }
</style>
