<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FIELD_CATALOG, projectMatches,
  type ScopeFilter, type ScopeGroup, type ScopeCondition, type FieldDef, type FieldLike } from '@/lib/tempScope'
import { OP_LABEL, type ScopeOp } from '@/lib/scopeOps'

const props = defineProps<{
  modelValue: boolean
  inputs: any[]
  initial: ScopeFilter
  catalog?: FieldLike[]
  singleTable?: boolean
  title?: string
  matchFn?: (input: any, draft: ScopeFilter) => boolean
  countUnit?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; save: [ScopeFilter] }>()

const CATALOG = computed<FieldLike[]>(() => props.catalog ?? FIELD_CATALOG)
const SINGLE = computed(() => props.singleTable === true)
const TITLE = computed(() => props.title ?? '范围设置（临时重点跟进）')
const UNIT = computed(() => props.countUnit ?? '项目')
const matchOf = (i: any, d: ScopeFilter) => (props.matchFn ?? projectMatches)(i, d)

const GROUP_LABEL: Record<string, string> = { project: '项目级', paymentNode: '回款节点', milestone: '里程碑明细' }

// v-for 稳定 key：group/condition 增删会 splice 数组，数组索引作 key 会让 Vue 复用错位的 DOM/组件实例
// （如 el-select 内部搜索态），故本地给每个 group/condition 挂一个仅供渲染用的 _uid，保存时剔除。
type UiCondition = ScopeCondition & { _uid: number }
type UiGroup = Omit<ScopeGroup, 'conditions'> & { conditions: UiCondition[]; _uid: number }
type UiScopeFilter = Omit<ScopeFilter, 'groups'> & { groups: UiGroup[] }

let uidSeq = 0
function nextUid(): number { return ++uidSeq }

function clone(s: ScopeFilter): ScopeFilter {
  return JSON.parse(JSON.stringify(s ?? { combinator: 'AND', groups: [] }))
}
function toUi(s: ScopeFilter): UiScopeFilter {
  return {
    combinator: s.combinator,
    groups: (s.groups ?? []).map((g) => ({
      combinator: g.combinator,
      _uid: nextUid(),
      conditions: (g.conditions ?? []).map((c) => ({ ...c, _uid: nextUid() })),
    })),
  }
}
function fromUi(s: UiScopeFilter): ScopeFilter {
  return {
    combinator: s.combinator,
    groups: s.groups.map((g) => ({
      combinator: g.combinator,
      conditions: g.conditions.map(({ _uid: _drop, ...rest }) => rest),
    })),
  }
}
const draft = ref<UiScopeFilter>(toUi(clone(props.initial)))
watch(() => props.modelValue, (v) => { if (v) draft.value = toUi(clone(props.initial)) })

function defFor(c: ScopeCondition): FieldLike | undefined {
  if (SINGLE.value) return CATALOG.value.find((f) => f.key === c.field)
  return CATALOG.value.find((f) => f.group === c.group && f.key === c.field)
}
function kindOf(c: ScopeCondition): FieldDef['kind'] { return defFor(c)?.kind ?? 'enum' }

const fieldsByGroup = computed<Record<string, FieldLike[]>>(() => {
  const map: Record<string, FieldLike[]> = {}
  for (const f of CATALOG.value) {
    const g = f.group ?? ''
    if (!map[g]) map[g] = []
    map[g].push(f)
  }
  return map
})
const OPS_BY_KIND: Record<string, ScopeOp[]> = {
  enum: ['in', 'notIn'], text: ['contains', 'notContains'],
  number: ['between', 'notBetween'], date: ['between', 'notBetween'],
}
// 用 computed 缓存而非每次 filter——防止 el-select 选项数组每次渲染换引用导致递归更新
function stableFieldsOf(group: string | undefined): FieldLike[] {
  if (SINGLE.value) return CATALOG.value
  return fieldsByGroup.value[group ?? ''] ?? []
}
function stableOpsForKind(kind: string): ScopeOp[] {
  return OPS_BY_KIND[kind] ?? OPS_BY_KIND['number']
}

// candidatesMap 同理：computed 稳定引用，避免枚举选项每轮重建触发 el-select 递归
const candidatesMap = computed(() => {
  const map: Record<string, string[]> = {}
  for (const f of CATALOG.value) {
    const set = new Set<string>()
    for (const it of props.inputs) {
      if (SINGLE.value) {
        const v = (it as any)[f.key]
        if (Array.isArray(v)) v.forEach((x) => x != null && x !== '' && set.add(String(x)))
        else if (v != null && v !== '') set.add(String(v))
      } else if (f.group === 'project') {
        const v = it.proj[f.key]
        if (Array.isArray(v)) v.forEach((x: any) => x != null && x !== '' && set.add(String(x)))
        else if (v != null && v !== '') set.add(String(v))
      } else {
        const rows = f.group === 'paymentNode' ? it.nodes : it.milestones
        for (const r of rows ?? []) { const val = r[f.key]; if (val != null && val !== '') set.add(String(val)) }
      }
    }
    map[(SINGLE.value ? '' : (f.group ?? '') + '::') + f.key] = [...set].sort((a, b) => a.localeCompare(b, 'zh'))
  }
  return map
})
function candidates(c: ScopeCondition): string[] {
  return candidatesMap.value[(SINGLE.value ? '' : (c.group ?? '') + '::') + c.field] ?? []
}

function addGroup() { draft.value.groups.push({ combinator: 'AND', conditions: [], _uid: nextUid() }) }
function removeGroup(gi: number) { draft.value.groups.splice(gi, 1) }
function addCondition(gi: number) {
  if (SINGLE.value) {
    const first = CATALOG.value[0]
    draft.value.groups[gi].conditions.push({ field: first?.key ?? '', op: stableOpsForKind(first?.kind ?? 'enum')[0], values: [], _uid: nextUid() })
  } else {
    draft.value.groups[gi].conditions.push({ group: 'project', field: 'orgL4', op: 'in', values: [], _uid: nextUid() })
  }
}
function removeCondition(gi: number, ci: number) { draft.value.groups[gi].conditions.splice(ci, 1) }
function onGroupChange(c: ScopeCondition) {
  const first = stableFieldsOf(c.group ?? '')[0]
  c.field = first?.key ?? ''
  c.op = stableOpsForKind(first?.kind ?? 'enum')[0]
  c.values = []; c.min = null; c.max = null
}
function onFieldChange(c: ScopeCondition) {
  c.op = stableOpsForKind(kindOf(c))[0]
  c.values = []; c.min = null; c.max = null
}

const matchCount = computed(() => props.inputs.filter((i) => matchOf(i, draft.value)).length)

function onSave() { emit('save', fromUi(draft.value)); emit('update:modelValue', false) }
function onCancel() { emit('update:modelValue', false) }

defineExpose({ draft, matchCount, addGroup, addCondition, removeGroup, removeCondition, onSave, candidates, kindOf, SINGLE })
</script>

<template>
  <el-drawer :model-value="modelValue" :title="TITLE" direction="rtl" size="640px"
    @update:model-value="emit('update:modelValue', $event)">
    <div class="sb-top">
      <span class="sb-label">组之间</span>
      <el-radio-group v-model="draft.combinator" size="small">
        <el-radio-button value="AND">AND（且）</el-radio-button>
        <el-radio-button value="OR">OR（或）</el-radio-button>
      </el-radio-group>
      <el-button size="small" type="primary" plain data-test="sb-add-group" @click="addGroup">添加组</el-button>
    </div>

    <div v-for="(g, gi) in draft.groups" :key="g._uid" class="sb-group">
      <div class="sb-group-head">
        <span class="sb-label">组 {{ gi + 1 }} · 条件之间</span>
        <el-radio-group v-model="g.combinator" size="small">
          <el-radio-button value="AND">AND</el-radio-button>
          <el-radio-button value="OR">OR</el-radio-button>
        </el-radio-group>
        <el-button size="small" text @click="addCondition(gi)">添加条件</el-button>
        <el-button size="small" text type="danger" @click="removeGroup(gi)">删除组</el-button>
      </div>

      <div v-for="(c, ci) in g.conditions" :key="c._uid" class="sb-cond">
        <el-select v-if="!SINGLE" v-model="c.group" size="small" style="width: 110px" @change="onGroupChange(c)">
          <el-option v-for="(lbl, gk) in GROUP_LABEL" :key="gk" :label="lbl" :value="gk" />
        </el-select>
        <el-select v-model="c.field" size="small" style="width: 140px" @change="onFieldChange(c)">
          <el-option v-for="f in stableFieldsOf(c.group ?? '')" :key="f.key" :label="f.label" :value="f.key" />
        </el-select>
        <el-select v-model="c.op" size="small" style="width: 100px">
          <el-option v-for="op in stableOpsForKind(kindOf(c))" :key="op" :label="OP_LABEL[op]" :value="op" />
        </el-select>
        <!-- 枚举:多选 -->
        <el-select v-if="kindOf(c) === 'enum'" v-model="c.values" multiple collapse-tags filterable
          size="small" style="min-width: 180px; flex: 1">
          <el-option v-for="v in candidates(c)" :key="v" :label="v" :value="v" />
        </el-select>
        <!-- 文本:包含词 -->
        <el-input v-else-if="kindOf(c) === 'text'" :model-value="(c.values && c.values[0]) || ''"
          size="small" placeholder="包含词" style="flex: 1" @update:model-value="c.values = [$event]" />
        <!-- 数值:min/max -->
        <template v-else-if="kindOf(c) === 'number'">
          <el-input-number v-model="c.min as any" :controls="false" size="small" placeholder="最小" style="width: 100px" />
          <el-input-number v-model="c.max as any" :controls="false" size="small" placeholder="最大" style="width: 100px" />
        </template>
        <!-- 日期:起止 -->
        <template v-else>
          <el-date-picker v-model="c.min as any" type="date" value-format="YYYY-MM-DD" size="small" placeholder="起" style="width: 130px" />
          <el-date-picker v-model="c.max as any" type="date" value-format="YYYY-MM-DD" size="small" placeholder="止" style="width: 130px" />
        </template>
        <el-button size="small" text type="danger" @click="removeCondition(gi, ci)">✕</el-button>
      </div>
      <div v-if="!g.conditions.length" class="sb-empty">该组暂无条件（空组不命中）。</div>
    </div>

    <div v-if="!draft.groups.length" class="sb-empty">暂无范围条件——「添加组」开始定义；保存空范围则页面无项目。</div>

    <template #footer>
      <span class="sb-count u-num">命中 {{ matchCount }} 个{{ UNIT }}</span>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" data-test="sb-save" @click="onSave">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.sb-top { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.sb-label { font-size: var(--fs-1); color: var(--sub); }
.sb-group { border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3); margin-bottom: var(--sp-3); background: var(--card2); }
.sb-group-head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.sb-cond { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-2); }
.sb-empty { font-size: var(--fs-1); color: var(--mut); padding: var(--sp-2) 0; }
.sb-count { margin-right: auto; font-size: var(--fs-1); color: var(--sub); }
</style>
