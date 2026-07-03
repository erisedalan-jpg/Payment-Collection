<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { cfUniqueValues, applyColumnFilters } from '@/lib/crossFilter'

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

const uniques = computed(() => {
  const all = store.tableFilters(props.tableId)
  const others: typeof all = {}
  for (const k of Object.keys(all)) if (k !== props.colKey) others[k] = all[k]
  const scoped = applyColumnFilters(props.sourceRows, others)
  return cfUniqueValues(scoped, props.colKey)
})
const visibleUniques = computed(() => {
  const kw = search.value.trim().toLowerCase()
  if (!kw) return uniques.value
  return uniques.value.filter((u) => u.display.toLowerCase().includes(kw))
})
const active = computed(() => !!store.tableFilters(props.tableId)[props.colKey])
const searching = computed(() => search.value.trim().length > 0)
// 搜索态下,全选/勾选/确定只作用于「当前搜索结果」——修「必须先取消全选再勾搜索项」的坑。
const allChecked = computed(() => {
  if (searching.value) {
    const vis = visibleUniques.value
    return vis.length > 0 && vis.every((u) => selected.value.has(u.display))
  }
  return uniques.value.length > 0 && selected.value.size === uniques.value.length
})

// 打开弹层时初始化勾选：有筛选→与当前可见 uniques 取交集；否则全选可见
watch(visible, (open) => {
  if (!open) return
  search.value = ''
  const cur = store.tableFilters(props.tableId)[props.colKey]
  const visibleSet = new Set(uniques.value.map((u) => u.display))
  selected.value = cur
    ? new Set(cur.value.filter((v) => visibleSet.has(v)))
    : new Set(uniques.value.map((u) => u.display))
})

function toggle(display: string, checked: boolean) {
  const s = new Set(selected.value)
  if (checked) s.add(display)
  else s.delete(display)
  selected.value = s
}
function toggleAll(checked: boolean) {
  if (searching.value) {
    // 只增删当前搜索结果,不动搜索框外的其它值
    const s = new Set(selected.value)
    for (const u of visibleUniques.value) checked ? s.add(u.display) : s.delete(u.display)
    selected.value = s
  } else {
    selected.value = checked ? new Set(uniques.value.map((u) => u.display)) : new Set()
  }
}
function apply() {
  // 搜索态:确定 = 只筛「搜索结果中被勾选的值」(无需先取消全选);非搜索态:按整体勾选。
  const values = searching.value
    ? visibleUniques.value.filter((u) => selected.value.has(u.display)).map((u) => u.display)
    : Array.from(selected.value)
  store.setColumnFilter(props.tableId, props.colKey, values, uniques.value.length, props.group)
  visible.value = false
}
function clear() {
  store.clearColumn(props.tableId, props.colKey, props.group)
  visible.value = false
}
</script>

<template>
  <!-- 性能护栏(V2.6.6):persistent=false + v-if —— 弹层内容(整列唯一值选项,可达数百项)
       只在打开期间存在;el-popover persistent 默认 true 会挂载即渲染并永驻 body,
       多页多列(9页×最多7列)+keep-alive 缓存叠加出数万隐藏节点,拖慢全站样式/布局重算。 -->
  <el-popover
    v-model:visible="visible"
    trigger="click"
    :width="240"
    placement="bottom-start"
    popper-class="cf-popover"
    :persistent="false"
  >
    <template #reference>
      <span class="cf-icon" :class="{ active }" title="列筛选" @click.stop>&#9660;</span>
    </template>
    <div v-if="visible" class="cf-inner">
      <div class="cf-title">
        列筛选 <span class="cf-count">({{ visibleUniques.length }}个值)</span>
      </div>
      <el-input v-model="search" size="small" placeholder="搜索筛选选项..." clearable />
      <label v-activate class="cf-row cf-all">
        <el-checkbox :model-value="allChecked" @change="(v: any) => toggleAll(!!v)" />
        {{ searching ? '全选/取消全选(搜索结果)' : '全选/取消全选' }}
      </label>
      <div class="cf-list">
        <label v-for="u in visibleUniques" :key="u.display" v-activate class="cf-row" :title="u.display">
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
  margin-left: var(--sp-1);
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: var(--fs-1);
  color: var(--mut);
  vertical-align: middle;
}
.cf-icon:hover,
.cf-icon.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.cf-title {
  font-size: var(--fs-1);
  font-weight: 600;
  margin-bottom: var(--sp-2);
  color: var(--txt);
}
.cf-count {
  color: var(--mut);
  font-weight: 400;
}
.cf-all {
  border-bottom: 1px solid var(--line);
  margin: var(--sp-2) 0;
  padding-bottom: var(--sp-1);
}
.cf-row {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-1);
  padding: var(--sp-1) 0;
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
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}
</style>
