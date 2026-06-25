<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  FIELD_CATALOG, projectMatches,
  type ScopeFilter, type ScopeProjectInput, type ScopeCondition, type FieldDef, type ScopeOp,
} from '@/lib/tempScope'

const props = defineProps<{ modelValue: boolean; inputs: ScopeProjectInput[]; initial: ScopeFilter }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; save: [ScopeFilter] }>()

const GROUP_LABEL: Record<FieldDef['group'], string> = { project: '项目级', paymentNode: '回款节点', milestone: '里程碑明细' }
const OP_LABEL: Record<string, string> = {
  in: '属于', notIn: '不属于', between: '区间内', notBetween: '区间外', contains: '包含', notContains: '不包含',
}

function clone(s: ScopeFilter): ScopeFilter {
  return JSON.parse(JSON.stringify(s ?? { combinator: 'AND', groups: [] }))
}
const draft = ref<ScopeFilter>(clone(props.initial))
watch(() => props.modelValue, (v) => { if (v) draft.value = clone(props.initial) })

function defFor(c: ScopeCondition): FieldDef | undefined {
  return FIELD_CATALOG.find((f) => f.group === c.group && f.key === c.field)
}
function kindOf(c: ScopeCondition): FieldDef['kind'] { return defFor(c)?.kind ?? 'enum' }

// fieldsOf / opsForKind 稳定引用:避免单选 el-select 选项数组每次渲染换引用→递归更新
const fieldsByGroup = computed<Record<string, FieldDef[]>>(() => {
  const map: Record<string, FieldDef[]> = {}
  for (const f of FIELD_CATALOG) {
    if (!map[f.group]) map[f.group] = []
    map[f.group].push(f)
  }
  return map
})
const OPS_BY_KIND: Record<string, ScopeOp[]> = {
  enum: ['in', 'notIn'],
  text: ['contains', 'notContains'],
  number: ['between', 'notBetween'],
  date: ['between', 'notBetween'],
}
function stableFieldsOf(group: string | undefined): FieldDef[] {
  return fieldsByGroup.value[group ?? ''] ?? []
}
function stableOpsForKind(kind: string): ScopeOp[] {
  return OPS_BY_KIND[kind] ?? OPS_BY_KIND['number']
}

// 枚举候选值:按 (group, field) 预聚合为稳定引用,避免 el-select multiple 选项数组每次渲染换引用→递归更新
const candidatesMap = computed(() => {
  const map: Record<string, string[]> = {}
  for (const f of FIELD_CATALOG) {
    const set = new Set<string>()
    for (const it of props.inputs) {
      if (f.group === 'project') {
        const v = it.proj[f.key]
        if (Array.isArray(v)) v.forEach((x) => x != null && x !== '' && set.add(String(x)))
        else if (v != null && v !== '') set.add(String(v))
      } else {
        const rows = f.group === 'paymentNode' ? it.nodes : it.milestones
        for (const r of rows ?? []) {
          const val = r[f.key]
          if (val != null && val !== '') set.add(String(val))
        }
      }
    }
    map[f.group + '::' + f.key] = [...set].sort((a, b) => a.localeCompare(b, 'zh'))
  }
  return map
})
function candidates(c: ScopeCondition): string[] {
  return candidatesMap.value[c.group + '::' + c.field] ?? []
}

function addGroup() { draft.value.groups.push({ combinator: 'AND', conditions: [] }) }
function removeGroup(gi: number) { draft.value.groups.splice(gi, 1) }
function addCondition(gi: number) {
  draft.value.groups[gi].conditions.push({ group: 'project', field: 'orgL4', op: 'in', values: [] })
}
function removeCondition(gi: number, ci: number) { draft.value.groups[gi].conditions.splice(ci, 1) }
function onGroupChange(c: ScopeCondition) {
  const first = stableFieldsOf(c.group)[0]
  c.field = first?.key ?? ''
  c.op = stableOpsForKind(first?.kind ?? 'enum')[0]
  c.values = []; c.min = null; c.max = null
}
function onFieldChange(c: ScopeCondition) {
  c.op = stableOpsForKind(kindOf(c))[0]
  c.values = []; c.min = null; c.max = null
}

const matchCount = computed(() => props.inputs.filter((i) => projectMatches(i, draft.value)).length)

function onSave() { emit('save', clone(draft.value)); emit('update:modelValue', false) }
function onCancel() { emit('update:modelValue', false) }

defineExpose({ draft, matchCount, addGroup, addCondition, removeGroup, removeCondition, onSave, candidates, kindOf })
</script>

<template>
  <el-drawer :model-value="modelValue" title="范围设置（临时重点跟进）" direction="rtl" size="640px"
    @update:model-value="emit('update:modelValue', $event)">
    <div class="sb-top">
      <span class="sb-label">组之间</span>
      <el-radio-group v-model="draft.combinator" size="small">
        <el-radio-button value="AND">AND（且）</el-radio-button>
        <el-radio-button value="OR">OR（或）</el-radio-button>
      </el-radio-group>
      <el-button size="small" type="primary" plain data-test="sb-add-group" @click="addGroup">添加组</el-button>
    </div>

    <div v-for="(g, gi) in draft.groups" :key="gi" class="sb-group">
      <div class="sb-group-head">
        <span class="sb-label">组 {{ gi + 1 }} · 条件之间</span>
        <el-radio-group v-model="g.combinator" size="small">
          <el-radio-button value="AND">AND</el-radio-button>
          <el-radio-button value="OR">OR</el-radio-button>
        </el-radio-group>
        <el-button size="small" text @click="addCondition(gi)">添加条件</el-button>
        <el-button size="small" text type="danger" @click="removeGroup(gi)">删除组</el-button>
      </div>

      <div v-for="(c, ci) in g.conditions" :key="ci" class="sb-cond">
        <el-select v-model="c.group" size="small" style="width: 110px" @change="onGroupChange(c)">
          <el-option v-for="(lbl, gk) in GROUP_LABEL" :key="gk" :label="lbl" :value="gk" />
        </el-select>
        <el-select v-model="c.field" size="small" style="width: 140px" @change="onFieldChange(c)">
          <el-option v-for="f in stableFieldsOf(c.group)" :key="f.key" :label="f.label" :value="f.key" />
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
      <span class="sb-count u-num">命中 {{ matchCount }} 个项目</span>
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
