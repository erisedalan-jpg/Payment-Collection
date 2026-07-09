<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchAudit, buildExportRows, type AuditRow, type AuditFilters, type AuditResponse } from '@/lib/audit'
import { exportRows } from '@/lib/exportXlsx'

const rows = ref<AuditRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const accounts = ref<string[]>([])
const events = ref<{ code: string; label: string }[]>([])

const filters = ref<AuditFilters>({ account: '', event: [], from: '', to: '', result: '', kw: '' })
const dateRange = ref<[string, string] | null>(null)

function applyDateRange() {
  filters.value.from = dateRange.value?.[0] || ''
  filters.value.to = dateRange.value?.[1] || ''
}

async function load() {
  loading.value = true
  try {
    applyDateRange()
    const res: AuditResponse = await fetchAudit(filters.value, page.value, pageSize.value)
    rows.value = res.rows
    total.value = res.total
    accounts.value = res.facets.accounts
    events.value = res.facets.events
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  load()
}

function onReset() {
  filters.value = { account: '', event: [], from: '', to: '', result: '', kw: '' }
  dateRange.value = null
  page.value = 1
  load()
}

function onPageChange(p: number) {
  page.value = p
  load()
}

async function onExport() {
  applyDateRange()
  const res = await fetchAudit(filters.value, 1, 10000)
  if (!res.rows.length) {
    ElMessage.info('无可导出的记录')
    return
  }
  exportRows('审计日志.xlsx', buildExportRows(res.rows))
}

onMounted(load)
defineExpose({ onExport })
</script>

<template>
  <div class="audit-tab">
    <el-form :inline="true" class="audit-filters">
      <el-form-item label="账号">
        <el-select v-model="filters.account" clearable placeholder="全部" style="width: 160px">
          <el-option v-for="a in accounts" :key="a" :label="a" :value="a" />
        </el-select>
      </el-form-item>
      <el-form-item label="事件">
        <el-select v-model="filters.event" multiple collapse-tags clearable placeholder="全部" style="width: 220px">
          <el-option v-for="e in events" :key="e.code" :label="e.label" :value="e.code" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD"
          start-placeholder="起" end-placeholder="止" style="width: 240px" />
      </el-form-item>
      <el-form-item label="结果">
        <el-select v-model="filters.result" clearable placeholder="全部" style="width: 120px">
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failure" />
        </el-select>
      </el-form-item>
      <el-form-item label="关键字">
        <el-input v-model="filters.kw" clearable placeholder="账号/动作/目标/详情" style="width: 200px"
          @keyup.enter="onSearch" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSearch">查询</el-button>
        <el-button @click="onReset">重置</el-button>
        <el-button @click="onExport">导出</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="rows" v-loading="loading" size="small" border stripe>
      <el-table-column prop="ts" label="时间" width="200" class-name="u-num" />
      <el-table-column prop="account" label="账号" width="140" />
      <el-table-column prop="action" label="动作" width="160" />
      <el-table-column prop="ip" label="IP" width="140" class-name="u-num" />
      <el-table-column prop="target" label="目标" width="160" />
      <el-table-column label="结果" width="90">
        <template #default="{ row }">
          <span :class="row.success ? 'ok-text' : 'danger-text'">{{ row.success ? '成功' : '失败' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="detail" label="详情" min-width="220" show-overflow-tooltip />
    </el-table>

    <div class="audit-pager">
      <el-pagination background layout="total, prev, pager, next" :total="total"
        :page-size="pageSize" :current-page="page" @current-change="onPageChange" />
    </div>
  </div>
</template>

<style scoped>
.audit-filters {
  margin-bottom: var(--gap-card);
}
.audit-pager {
  margin-top: var(--gap-card);
  display: flex;
  justify-content: flex-end;
}
.ok-text {
  color: var(--ok-text);
}
.danger-text {
  color: var(--danger-text);
}
</style>
