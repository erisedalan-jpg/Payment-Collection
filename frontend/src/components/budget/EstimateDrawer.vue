<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listEstimates, getEstimate, deleteEstimate,
  type EstimateMeta, type EstimateRecord,
} from '@/lib/budgetApi'

/** 存档抽屉:列出报价存档,支持搜索 / 恢复 / 删除。
 *
 *  「查看全部账号」只对超管渲染 —— 但真正的闸在后端(普通管理员传 ?all=1 也只拿得到自己的),
 *  前端这里只是不给入口。
 *
 *  恢复只负责取整条记录并 emit,由父页面决定怎么装载(它才知道当前表单脏不脏)。
 */
const props = defineProps<{
  modelValue: boolean
  isSuper?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'restore', rec: EstimateRecord): void
}>()

const items = ref<EstimateMeta[]>([])
const loading = ref(false)
const keyword = ref('')
const showAll = ref(false)

/** 非超管一律按 all=false 拉 —— 不给它传 true 的机会。 */
async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await listEstimates(props.isSuper ? showAll.value : false)
  } catch (e) {
    ElMessage.error('存档列表加载失败: ' + (e as Error).message)
  } finally {
    loading.value = false
  }
}

async function toggleAll(v: boolean): Promise<void> {
  showAll.value = v
  await load()
}

/** 每次打开都重拉 —— 别拿上一次打开时的旧列表糊弄用户。 */
watch(() => props.modelValue, (v) => { if (v) void load() }, { immediate: true })

const filtered = computed<EstimateMeta[]>(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return items.value
  return items.value.filter(
    (x) => (x.quoteName ?? '').toLowerCase().includes(k)
        || (x.customerName ?? '').toLowerCase().includes(k),
  )
})

const fmtRatio = (v: number | null): string => (v == null ? '-' : `${v.toFixed(2)}%`)
const fmtAmount = (v: number | null): string => (v == null ? '-' : String(v))

async function restore(id: string): Promise<void> {
  try {
    const rec = await getEstimate(id)
    emit('restore', rec)
  } catch (e) {
    ElMessage.error('读取存档失败: ' + (e as Error).message)
  }
}

async function doDelete(id: string): Promise<void> {
  try {
    await deleteEstimate(id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e as Error).message)
  }
}

/** 二次确认与实际删除分开 —— 删除本身要能被直接调用(测试/程序化调用)。 */
async function confirmDelete(row: EstimateMeta): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除报价「${row.quoteName}」吗?删除后不可恢复。`, '删除存档', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch {
    return   // 用户取消
  }
  await doDelete(row.id)
}

defineExpose({ items, filtered, keyword, showAll, loading, load, toggleAll, restore, doDelete, confirmDelete })
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="报价存档"
    direction="rtl"
    size="900px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="ed-bar">
      <el-input
        v-model="keyword"
        class="ed-search"
        placeholder="搜索报价名称 / 客户名称"
        clearable
      />
      <el-switch
        v-if="isSuper"
        :model-value="showAll"
        active-text="查看全部账号"
        @update:model-value="toggleAll(!!$event)"
      />
    </div>

    <el-table v-loading="loading" :data="filtered" size="default" class="ed-table">
      <el-table-column prop="quoteName" label="报价名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="customerName" label="客户" min-width="140" show-overflow-tooltip />
      <el-table-column prop="salesName" label="销售" min-width="90" />
      <el-table-column v-if="isSuper && showAll" prop="account" label="创建人" min-width="100" />
      <el-table-column label="项目金额（万元）" min-width="120" align="right">
        <template #default="{ row }">
          <span class="u-num">{{ fmtAmount(row.projectAmount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="成本比例" min-width="100" align="right">
        <template #default="{ row }">
          <span class="u-num" :class="'is-' + row.ratioStatus">{{ fmtRatio(row.costRatio) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" min-width="150" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="restore(row.id)">恢复</el-button>
          <el-button link type="danger" @click="confirmDelete(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <span class="ed-empty">还没有存档。填好报价后点「保存」即可存档。</span>
      </template>
    </el-table>
  </el-drawer>
</template>

<style scoped>
.ed-bar {
  display: flex;
  align-items: center;
  gap: var(--gap-card);
  margin-bottom: var(--gap-stack);
}
.ed-search { max-width: 320px; }
.ed-table { width: 100%; }
.ed-empty { font-size: var(--fs-1); color: var(--mut); line-height: var(--lh-dense); }

/* 成本比例三态:淡底深字只用于带文字的状态标识,这里是纯数字列 → 只染字色 */
.is-low { color: var(--warn-text); }
.is-high { color: var(--danger-text); }
</style>
