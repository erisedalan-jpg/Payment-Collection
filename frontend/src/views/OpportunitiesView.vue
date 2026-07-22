<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { useScopedOpportunities } from '@/composables/useScopedData'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { useTableMaxHeight } from '@/composables/useTableMaxHeight'
import { userScopedKey } from '@/lib/userScopedKey'
import { OPP_COLUMNS, DEFAULT_VISIBLE, FILTERABLE, recentUpdateOf } from '@/lib/opportunityColumns'
import type { OppColumn } from '@/lib/opportunityColumns'
import { exportRows } from '@/lib/exportXlsx'
import { useExternalSort } from '@/lib/useExternalSort'
import ColumnPicker from '@/components/ColumnPicker.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import OpportunityEditDrawer from '@/components/OpportunityEditDrawer.vue'
import type { OppRow } from '@/lib/opportunitiesApi'

const TABLE_ID = 'opportunities'
const auth = useAuthStore()
const store = useOpportunitiesStore()
const scopedOpportunities = useScopedOpportunities()
const cf = useCrossFilterStore()
cf.clearAll(TABLE_ID)

onMounted(() => {
  if (!store.loaded) store.load()
})

const now = new Date()

// 编辑抽屉状态
const editOpen = ref(false)
const editRow = ref<OppRow | null>(null)
const editMode = ref<'create' | 'edit'>('edit')

// 选列
const prefs = useColumnPrefs(userScopedKey(TABLE_ID), OPP_COLUMNS.map((c) => c.key), DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value
    .map((k) => OPP_COLUMNS.find((c) => c.key === k))
    .filter((c): c is OppColumn => !!c),
)
const pickerColumns = OPP_COLUMNS.map((c) => ({ key: c.key, label: c.label }))

const onToggle = prefs.makeToggle(cf, TABLE_ID)

// 派生注入：在过滤前注入 recentUpdate，使其可筛/可排/可导出
const withDerived = computed(() =>
  scopedOpportunities.value.map((r) => ({
    ...r,
    recentUpdate: recentUpdateOf((r as any).lastUpdate || '', now),
  })),
)

// 数据流水线
const fKw = ref('')

const afterColumnFilter = computed(() =>
  applyColumnFilters(withDerived.value, cf.tableFilters(TABLE_ID)) as Record<string, any>[],
)

const filtered = computed(() => {
  const kw = fKw.value.trim()
  if (!kw) return afterColumnFilter.value
  return afterColumnFilter.value.filter(
    (r) =>
      String(r.customer || '').includes(kw) ||
      String(r.name || '').includes(kw) ||
      String(r.salesOwner || '').includes(kw),
  )
})

// 全局排序（数值键 = OPP_COLUMNS 中 type==='number' 的列，与原判定等价）
const NUMERIC_KEYS = new Set(OPP_COLUMNS.filter((c) => c.type === 'number').map((c) => c.key))
const { sortState, onSortChange, sorted, defaultSort } = useExternalSort(filtered, NUMERIC_KEYS, userScopedKey(TABLE_ID))

// 分页
const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() =>
  sorted.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value),
)
watch(filtered, () => {
  currentPage.value = 1
})

// 首行冻结：裸 el-table 手动接入 useTableMaxHeight
const oppTableRef = ref<any>(null)
const { maxHeight: oppMaxHeight, recompute: oppRecompute } = useTableMaxHeight(
  () => oppTableRef.value?.$el as HTMLElement | undefined,
)
watch(() => paged.value, () => nextTick(oppRecompute), { flush: 'post' })

// 行选择（超管）
const selectedRows = ref<Record<string, any>[]>([])
function onSel(rows: Record<string, any>[]) {
  selectedRows.value = rows
}

// 格式化单元格
function fmtCell(col: OppColumn, row: Record<string, any>): string {
  const v = row[col.key]
  if (col.type === 'date') return (v || '').slice(0, 10) || '-'
  if (col.type === 'number') {
    if (v !== '' && v != null) return Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })
    return '-'
  }
  // text / select / auto
  return v ?? '-'
}

// 编辑处理器
function openEdit(row: OppRow) {
  editRow.value = row
  editMode.value = 'edit'
  editOpen.value = true
}

function onCreate() {
  editRow.value = null
  editMode.value = 'create'
  editOpen.value = true
}

async function onDelete() {
  if (!selectedRows.value.length) return
  try {
    await ElMessageBox.confirm(
      '确认删除选中的 ' + selectedRows.value.length + ' 条商机?',
      '删除确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  await store.remove(selectedRows.value.map((r) => r.id))
  selectedRows.value = []
  ElMessage.success('已删除')
}

// 导入：隐藏文件输入
const fileInput = ref<HTMLInputElement | null>(null)

async function onFilePick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const n = await store.importFile(f)
    ElMessage.success('导入 ' + n + ' 条')
  } catch {
    ElMessage.error('导入失败')
  } finally {
    (e.target as HTMLInputElement).value = ''
  }
}

function onExport() {
  exportRows(
    '商机清单_' + filtered.value.length + '条.xlsx',
    filtered.value.map((r) =>
      Object.fromEntries(OPP_COLUMNS.map((c) => [c.label, (r as any)[c.key] ?? ''])),
    ),
  )
}

defineExpose({
  store, filtered, paged, selectedRows, visibleColumns, fKw, sortState, auth, withDerived,
  editOpen, editRow, editMode, openEdit, onCreate, onDelete, onExport,
})
</script>

<template>
  <div class="opp-view">
    <h2 class="opp-title">商机清单</h2>

    <!-- 工具栏 -->
    <div class="opp-toolbar">
      <el-input
        v-model="fKw"
        size="small"
        placeholder="客户/商机/销售负责人"
        clearable
        style="width: 200px"
        data-test="opp-kw"
      />
      <ColumnPicker
        :columns="pickerColumns"
        :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle"
        @move-up="prefs.moveUp"
        @move-down="prefs.moveDown"
        @reset="prefs.reset"
      />
      <!-- 新增商机:任意登录管理员(普通管理员限本人 L4,由后端 + 编辑抽屉约束) -->
      <el-button size="small" type="primary" data-test="opp-add" @click="onCreate">
        新增商机
      </el-button>
      <!-- 超管专属写操作:删除/导入/导出 -->
      <template v-if="auth.isSuper">
        <el-button
          size="small"
          type="danger"
          data-test="opp-del"
          :disabled="!selectedRows.length"
          @click="onDelete"
        >
          删除选中
        </el-button>
        <el-button size="small" data-test="opp-import" @click="fileInput?.click()">
          导入
        </el-button>
        <el-button size="small" data-test="opp-export" @click="onExport">
          导出
        </el-button>
        <!-- 隐藏文件输入 -->
        <input
          ref="fileInput"
          type="file"
          accept=".xlsx"
          style="display: none"
          @change="onFilePick"
        />
      </template>
      <el-button
        v-if="cf.hasFilters(TABLE_ID)"
        size="small"
        style="margin-left: auto"
        @click="cf.clearAll(TABLE_ID)"
      >清除所有筛选</el-button>
    </div>

    <!-- 表格 -->
    <div class="opp-scroll">
      <el-table
        ref="oppTableRef"
        :data="paged"
        border
        style="width: 100%"
        :max-height="oppMaxHeight"
        @selection-change="onSel"
        @sort-change="onSortChange"
        :default-sort="defaultSort"
      >
        <!-- 选择列：超管专属 -->
        <el-table-column v-if="auth.isSuper" type="selection" width="48" />

        <!-- 动态列 -->
        <el-table-column
          v-for="col in visibleColumns"
          :key="col.key"
          :prop="col.key"
          :label="col.label"
          :width="col.width"
          :sortable="col.sortable ? 'custom' : false"
          :show-overflow-tooltip="!col.wrap"
        >
          <template #header>
            <span class="opp-th">
              {{ col.label }}
              <ColumnFilter
                v-if="FILTERABLE.has(col.key)"
                :table-id="TABLE_ID"
                :col-key="col.key"
                :source-rows="withDerived"
              />
            </span>
          </template>
          <template #default="{ row }">
            <template v-if="col.type === 'derived' && col.key === 'recentUpdate'">
              <StatusBadge
                :label="row.recentUpdate"
                :tone="row.recentUpdate === '是' ? 'ok' : 'mut'"
              />
            </template>
            <template v-else>
              {{ fmtCell(col, row) }}
            </template>
          </template>
        </el-table-column>

        <!-- 操作列：任意登录管理员可编辑(普通管理员经 GET 已只见本人 L4 行;写入后端再校验 L4) -->
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text @click.stop="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页条 -->
    <div class="opp-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]"
        :total="filtered.length"
        layout="sizes, prev, pager, next"
        size="small"
        background
      />
    </div>

    <!-- 编辑抽屉 -->
    <OpportunityEditDrawer v-model="editOpen" :row="editRow" :mode="editMode" />
  </div>
</template>

<style scoped>
.opp-view {
  padding: var(--sp-4);
}
.opp-title {
  font-size: var(--fs-4);
  font-weight: 700;
  color: var(--txt);
  margin: 0 0 var(--sp-3);
}
.opp-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
}
.opp-scroll {
  overflow-x: auto;
}
.opp-th {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
}
.opp-pager {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
}
</style>
