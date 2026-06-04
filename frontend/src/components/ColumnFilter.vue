<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { cfUniqueValues } from '@/lib/crossFilter'

const props = defineProps<{
  tableId: string
  colKey: string
  sourceRows: Record<string, any>[]
  group?: string[]
}>()

const store = useCrossFilterStore()
const visible = ref(false)
const search = ref('')
const selected = ref<Set<string>>(new Set())

const uniques = computed(() => cfUniqueValues(props.sourceRows, props.colKey))
const visibleUniques = computed(() => {
  const kw = search.value.trim().toLowerCase()
  if (!kw) return uniques.value
  return uniques.value.filter((u) => u.display.toLowerCase().includes(kw))
})
const active = computed(() => !!store.tableFilters(props.tableId)[props.colKey])
const allChecked = computed(
  () => uniques.value.length > 0 && selected.value.size === uniques.value.length,
)

// 打开弹层时初始化勾选：有筛选→沿用其选中值；否则全选
watch(visible, (open) => {
  if (!open) return
  search.value = ''
  const cur = store.tableFilters(props.tableId)[props.colKey]
  selected.value = cur ? new Set(cur.value) : new Set(uniques.value.map((u) => u.display))
})

function toggle(display: string, checked: boolean) {
  const s = new Set(selected.value)
  if (checked) s.add(display)
  else s.delete(display)
  selected.value = s
}
function toggleAll(checked: boolean) {
  selected.value = checked ? new Set(uniques.value.map((u) => u.display)) : new Set()
}
function apply() {
  store.setColumnFilter(
    props.tableId,
    props.colKey,
    Array.from(selected.value),
    uniques.value.length,
    props.group,
  )
  visible.value = false
}
function clear() {
  store.clearColumn(props.tableId, props.colKey, props.group)
  visible.value = false
}
</script>

<template>
  <el-popover
    v-model:visible="visible"
    trigger="click"
    :width="240"
    placement="bottom-start"
    popper-class="cf-popover"
  >
    <template #reference>
      <span class="cf-icon" :class="{ active }" title="列筛选">&#9660;</span>
    </template>
    <div class="cf-inner">
      <div class="cf-title">
        列筛选 <span class="cf-count">({{ visibleUniques.length }}个值)</span>
      </div>
      <el-input v-model="search" size="small" placeholder="搜索筛选选项..." clearable />
      <label class="cf-row cf-all">
        <el-checkbox :model-value="allChecked" @change="(v: any) => toggleAll(!!v)" />
        全选/取消全选
      </label>
      <div class="cf-list">
        <label v-for="u in visibleUniques" :key="u.display" class="cf-row" :title="u.display">
          <el-checkbox
            :model-value="selected.has(u.display)"
            @change="(v: any) => toggle(u.display, !!v)"
          />
          <span class="cf-text">{{ u.display }}</span>
        </label>
      </div>
      <div class="cf-actions">
        <el-button size="small" type="primary" @click="apply">确定</el-button>
        <el-button size="small" @click="clear">清除</el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.cf-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 3px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  color: #cbd5e1;
  vertical-align: middle;
}
.cf-icon:hover,
.cf-icon.active {
  color: #4f46e5;
  background: #eef2ff;
}
.cf-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #0f172a;
}
.cf-count {
  color: #94a3b8;
  font-weight: 400;
}
.cf-all {
  border-bottom: 1px solid #f1f5f9;
  margin: 6px 0;
  padding-bottom: 4px;
}
.cf-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 0;
  cursor: pointer;
}
.cf-list {
  max-height: 200px;
  overflow-y: auto;
}
.cf-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 190px;
}
.cf-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
</style>
