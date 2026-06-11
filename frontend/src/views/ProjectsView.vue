<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, filterProjectRows, distinctOptions, type ProjectFilters } from '@/lib/projectList'
import { fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import HealthBadge from '@/components/HealthBadge.vue'

const data = useDataStore()
const route = useRoute()
const router = useRouter()
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() =>
  buildProjectRows(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
  ),
)
const filters = reactive<ProjectFilters>({ search: '', stage: '', projectStatus: '', health: '', riskLevel: '', paymentStatus: '', presale: '', paused: '', overspend: '' })

// 路由 query → 初始筛选(项目总览风险焦点行带筛选跳入;仅取字符串值)
const QUERY_KEYS = ['search', 'stage', 'projectStatus', 'health', 'riskLevel', 'paymentStatus', 'presale', 'paused', 'overspend'] as const
for (const k of QUERY_KEYS) {
  const v = route.query[k]
  if (typeof v === 'string' && v) filters[k] = v
}

const filtered = computed(() => filterProjectRows(rows.value, filters))

const stageOpts = computed(() => distinctOptions(rows.value, 'stage'))
const statusOpts = computed(() => distinctOptions(rows.value, 'projectStatus'))
const riskOpts = computed(() => distinctOptions(rows.value, 'riskLevel'))
const HEALTH_OPTS = ['健康', '关注', '风险', '无数据']
const PAY_OPTS = ['无节点', '回款中', '延期', '已回清']

const columns: DataColumn[] = [
  { key: 'projectName', label: '项目名称', sortable: true },
  { key: 'projectId', label: '项目编号', width: 190 },
  { key: 'customer', label: '客户' },
  { key: 'projectManager', label: '项目经理', width: 90 },
  { key: 'stage', label: '阶段', width: 90 },
  { key: 'progress', label: '完工%', width: 85, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'riskLevel', label: '风险', width: 85, formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'paymentRatio', label: '回款完成率', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'health', label: '健康度', width: 90 },
]

function onRow(row: Record<string, any>) { router.push(`/project/${row.projectId}`) }
</script>

<template>
  <div class="projects-view">
    <h2 class="pv-title">项目清单</h2>
    <div class="toolbar">
      <el-input v-model="filters.search" size="small" placeholder="搜索 项目名/编号/客户/经理" clearable style="width: 230px" />
      <el-select v-model="filters.stage" size="small" clearable placeholder="阶段" style="width: 110px"
        :empty-values="[null, undefined]" :value-on-clear="''">
        <el-option v-for="o in stageOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectStatus" size="small" clearable placeholder="项目状态" style="width: 110px"
        :empty-values="[null, undefined]" :value-on-clear="''">
        <el-option v-for="o in statusOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.health" size="small" clearable placeholder="健康度" style="width: 105px"
        :empty-values="[null, undefined]" :value-on-clear="''">
        <el-option v-for="o in HEALTH_OPTS" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.riskLevel" size="small" clearable placeholder="风险等级" style="width: 105px"
        :empty-values="[null, undefined]" :value-on-clear="''">
        <el-option v-for="o in riskOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.paymentStatus" size="small" clearable placeholder="回款状态" style="width: 105px"
        :empty-values="[null, undefined]" :value-on-clear="''">
        <el-option v-for="o in PAY_OPTS" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.presale" size="small" clearable placeholder="售前整合" style="width: 105px"
        :empty-values="[null, undefined]" :value-on-clear="''">
        <el-option value="yes" label="售前整合" />
        <el-option value="no" label="非售前" />
      </el-select>
    </div>

    <div v-if="filters.paused === 'yes' || filters.overspend === 'yes'" class="pv-tags">
      <span v-if="filters.paused === 'yes'" class="pv-tag">已暂停项目 <button @click="filters.paused = ''">✕</button></span>
      <span v-if="filters.overspend === 'yes'" class="pv-tag">超支项目 <button @click="filters.overspend = ''">✕</button></span>
    </div>

    <div v-if="!rows.length" class="pv-empty">暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>
    <DataTable v-else :columns="columns" :rows="filtered" clickable @row-click="onRow">
      <template #cell-projectName="{ row }">
        {{ row.projectName }}<span v-if="row.hasClosed" class="pv-origin">原项目*</span>
      </template>
      <template #cell-health="{ row }">
        <HealthBadge :overall="row.health" />
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.projects-view { padding: 16px; }
.pv-title { font-size: 18px; font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pv-origin { margin-left: 6px; padding: 0 6px; border-radius: var(--r-full); font-size: 11px; background: var(--selected-tint); color: var(--accent); }
.pv-empty { color: var(--mut); padding: 40px 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.pv-tags { display: flex; gap: 8px; margin-bottom: 10px; }
.pv-tag { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: var(--r-full); font-size: 12px; background: var(--selected-tint); color: var(--accent); font-weight: 600; }
.pv-tag button { border: none; background: none; color: var(--accent); cursor: pointer; padding: 0; font-size: 12px; }
</style>
