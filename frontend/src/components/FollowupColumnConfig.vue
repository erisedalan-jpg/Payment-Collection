<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import type { CustomColumnType, FollowupTableId, DiffConfig } from '@/lib/followupColumns'
import { isDateKey } from '@/lib/cellFormat'

const props = withDefaults(defineProps<{
  modelValue: boolean
  table: FollowupTableId
  columns?: { key: string; label: string }[]
}>(), { columns: () => [] })
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const store = useFollowupColumnsStore()
const cols = computed(() => store.columnsFor(props.table))

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const newLabel = ref('')
const newType = ref<CustomColumnType>('text')
const newClear = ref(false)

// 「指定列」候选两路合并:内置/借入日期列(isDateKey 认中英文) + 自定义 date 列。
// isDateKey 认不出 cf-xxxxxxxx,故自定义 date 列必须单独并入。
const dateColumnOptions = computed(() => [
  ...(props.columns ?? []).filter((c) => isDateKey(c.key)).map((c) => ({ key: c.key, label: c.label })),
  ...cols.value.filter((c) => c.type === 'date').map((c) => ({ key: c.key, label: c.label })),
])

const newAnchorKind = ref<'today' | 'fixed' | 'column'>('today')
const newAnchorDate = ref('')
const newAnchorKey = ref('')
const newTarget = ref('')

function buildDiff(): DiffConfig | null {
  if (!newTarget.value) return null
  if (newAnchorKind.value === 'fixed') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newAnchorDate.value)) return null
    return { anchor: { kind: 'fixed', date: newAnchorDate.value }, target: newTarget.value }
  }
  if (newAnchorKind.value === 'column') {
    if (!newAnchorKey.value) return null
    return { anchor: { kind: 'column', key: newAnchorKey.value }, target: newTarget.value }
  }
  return { anchor: { kind: 'today' }, target: newTarget.value }
}

const addDisabled = computed(() =>
  cols.value.length >= 8 || !newLabel.value.trim() ||
  (newType.value === 'diff' && buildDiff() === null))

/** 列表行内展示引用关系,如「今天 − 立项日期」——
 *  引用的列被改名会静默失效(显示 '-'),把引用摆出来是对该债的可见性补偿。 */
function diffText(c: { diff?: DiffConfig }): string {
  const d = c.diff
  if (!d) return ''
  const labelOf = (k: string) => dateColumnOptions.value.find((o) => o.key === k)?.label ?? k
  const a = d.anchor.kind === 'today' ? '今天'
    : d.anchor.kind === 'fixed' ? d.anchor.date
    : labelOf(d.anchor.key)
  return `${a} − ${labelOf(d.target)}`
}

defineExpose({ dateColumnOptions, diffText })

async function onAdd() {
  const label = newLabel.value.trim()
  if (!label) return
  const diff = newType.value === 'diff' ? buildDiff() : undefined
  if (newType.value === 'diff' && !diff) { ElMessage.error('请选择指定日期与指定列'); return }
  try {
    await store.add(props.table, label, newType.value, newClear.value, diff ?? undefined)
    newLabel.value = ''; newType.value = 'text'; newClear.value = false
    newAnchorKind.value = 'today'; newAnchorDate.value = ''; newAnchorKey.value = ''; newTarget.value = ''
  } catch (e) {
    ElMessage.error((e as Error).message || '新增失败')
  }
}
async function onRename(key: string, label: string) {
  const l = label.trim()
  if (!l) return
  try { await store.update(props.table, key, { label: l }) }
  catch (e) { ElMessage.error((e as Error).message || '改名失败') }
}
async function onToggleClear(key: string, clearOnArchive: boolean) {
  try { await store.update(props.table, key, { clearOnArchive }) }
  catch (e) { ElMessage.error((e as Error).message || '修改失败') }
}
async function onMove(key: string, dir: -1 | 1) {
  const keys = cols.value.map((c) => c.key)
  const i = keys.indexOf(key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= keys.length) return
  ;[keys[i], keys[j]] = [keys[j], keys[i]]
  try { await store.reorder(props.table, keys) }
  catch (e) { ElMessage.error((e as Error).message || '重排失败') }
}
async function onDelete(key: string, label: string) {
  try {
    await ElMessageBox.confirm(
      `将删除列「${label}」，并清除该列在当前数据里已填写的全部值（历史归档不受影响）。此操作不可撤销。`,
      '删除自定义列', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch { return }
  try {
    const r = await store.remove(props.table, key)
    ElMessage.success(`已删除列「${label}」，清除 ${r.affectedRows} 行值`)
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}
</script>

<template>
  <el-drawer v-model="open" title="列设置（自定义列）" size="480px" append-to-body>
    <div class="fcc">
      <div class="fcc-hint">超管可为本表增加供其他管理员填写的列（文本/日期），或自动计算的时间差列。每表最多 8 列。</div>
      <div v-for="c in cols" :key="c.key" class="fcc-row" data-test="fcc-col">
        <el-input :model-value="c.label" size="small" style="width: 130px" maxlength="20"
          @change="(v: string) => onRename(c.key, v)" />
        <span class="fcc-type">{{ c.type === 'date' ? '日期' : c.type === 'diff' ? '时间差' : '文本' }}</span>
        <span v-if="c.type === 'diff'" class="fcc-diff">{{ diffText(c) }}</span>
        <el-checkbox v-else :model-value="c.clearOnArchive" label="归档清空"
          @update:model-value="(v: boolean) => onToggleClear(c.key, v)" />
        <button class="fcc-mini" title="上移" @click="onMove(c.key, -1)">↑</button>
        <button class="fcc-mini" title="下移" @click="onMove(c.key, 1)">↓</button>
        <button class="fcc-mini fcc-del" title="删除" @click="onDelete(c.key, c.label)">✕</button>
      </div>
      <div v-if="!cols.length" class="fcc-empty">暂无自定义列。</div>

      <div class="fcc-new">
        <el-input v-model="newLabel" size="small" style="width: 130px" maxlength="20"
          placeholder="新列名" data-test="fcc-new-label" />
        <el-select v-model="newType" size="small" style="width: 90px">
          <el-option label="文本" value="text" />
          <el-option label="日期" value="date" />
          <el-option label="时间差" value="diff" />
        </el-select>
        <el-checkbox v-if="newType !== 'diff'" v-model="newClear" label="归档清空" />
        <template v-if="newType === 'diff'">
          <el-select v-model="newAnchorKind" size="small" style="width: 110px">
            <el-option label="当前日期" value="today" />
            <el-option label="指定日期" value="fixed" />
            <el-option label="选择列" value="column" />
          </el-select>
          <el-date-picker v-if="newAnchorKind === 'fixed'" v-model="newAnchorDate" type="date"
            size="small" style="width: 150px" value-format="YYYY-MM-DD" placeholder="指定日期" />
          <el-select v-if="newAnchorKind === 'column'" v-model="newAnchorKey" size="small"
            style="width: 150px" placeholder="被减列">
            <el-option v-for="o in dateColumnOptions" :key="o.key" :label="o.label" :value="o.key" />
          </el-select>
          <span class="fcc-type">−</span>
          <el-select v-model="newTarget" size="small" style="width: 150px" placeholder="指定列">
            <el-option v-for="o in dateColumnOptions" :key="o.key" :label="o.label" :value="o.key" />
          </el-select>
        </template>
        <el-button size="small" type="primary" :disabled="addDisabled" data-test="fcc-add" @click="onAdd">添加</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.fcc { display: flex; flex-direction: column; gap: var(--sp-3); }
.fcc-hint { font-size: var(--fs-1); color: var(--mut); }
.fcc-row { display: flex; align-items: center; gap: var(--sp-2); }
.fcc-type { font-size: var(--fs-1); color: var(--sub); width: 32px; }
.fcc-diff { font-size: var(--fs-1); color: var(--mut); }
.fcc-new { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-3);
  padding-top: var(--sp-3); border-top: 1px solid var(--line); flex-wrap: wrap; }
.fcc-mini { border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm);
  cursor: pointer; padding: 2px 6px; color: var(--sub); }
.fcc-mini:hover { background: var(--hover-tint); }
.fcc-del:hover { color: var(--danger); }
.fcc-empty { font-size: var(--fs-1); color: var(--mut); }
</style>
