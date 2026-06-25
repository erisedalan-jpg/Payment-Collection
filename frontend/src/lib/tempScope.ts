// 临时重点跟进范围筛选:条件树类型 + 字段目录 + 匹配(前端算,数据已按 L4 裁剪)。
export type Combinator = 'AND' | 'OR'
export type ScopeOp = 'in' | 'notIn' | 'between' | 'notBetween' | 'contains' | 'notContains'

export interface ScopeCondition {
  group: 'project' | 'paymentNode' | 'milestone'
  field: string
  op: ScopeOp
  values?: string[]
  min?: number | string | null
  max?: number | string | null
}
export interface ScopeGroup { combinator: Combinator; conditions: ScopeCondition[] }
export interface ScopeFilter { combinator: Combinator; groups: ScopeGroup[] }

export interface FieldDef {
  group: 'project' | 'paymentNode' | 'milestone'
  key: string
  label: string
  kind: 'enum' | 'number' | 'date' | 'text'
}

export interface ScopeProjectInput {
  id: string
  proj: Record<string, any>
  nodes: Record<string, any>[]
  milestones: Record<string, any>[]
}

export function opsForKind(kind: FieldDef['kind']): ScopeOp[] {
  if (kind === 'enum') return ['in', 'notIn']
  if (kind === 'text') return ['contains', 'notContains']
  return ['between', 'notBetween'] // number / date
}

// 字段目录(单一来源)。project 组 key 对应 buildScopeInputs 产出的 proj 键;
// paymentNode/milestone 组 key 对应原始子表行字段名(PaymentNodePmis / MilestoneItem)。
export const FIELD_CATALOG: FieldDef[] = [
  // —— project 组 ——
  { group: 'project', key: 'customer', label: '客户', kind: 'enum' },
  { group: 'project', key: 'projectManager', label: '项目经理', kind: 'enum' },
  { group: 'project', key: 'ar', label: 'AR', kind: 'enum' },
  { group: 'project', key: 'sr', label: 'SR', kind: 'enum' },
  { group: 'project', key: 'orgL4', label: 'L4组', kind: 'enum' },
  { group: 'project', key: 'projectLevel', label: '级别', kind: 'enum' },
  { group: 'project', key: 'projectType', label: '项目类型', kind: 'enum' },
  { group: 'project', key: 'stage', label: '阶段', kind: 'enum' },
  { group: 'project', key: 'projectStatus', label: '项目状态', kind: 'enum' },
  { group: 'project', key: 'health', label: '健康度', kind: 'enum' },
  { group: 'project', key: 'riskLevel', label: '风险等级', kind: 'enum' },
  { group: 'project', key: 'paymentStatus', label: '回款状态', kind: 'enum' },
  { group: 'project', key: 'top1000', label: 'TOP1000', kind: 'enum' },
  { group: 'project', key: 'quadrant', label: '象限', kind: 'enum' },
  { group: 'project', key: 'paused', label: '是否暂停', kind: 'enum' },
  { group: 'project', key: 'overspend', label: '是否超支', kind: 'enum' },
  { group: 'project', key: 'isPresale', label: '是否售前', kind: 'enum' },
  { group: 'project', key: 'tags', label: '标签', kind: 'enum' },
  { group: 'project', key: 'milestoneStatus', label: '里程碑进度状态', kind: 'enum' },
  { group: 'project', key: 'contractWan', label: '合同金额(万)', kind: 'number' },
  { group: 'project', key: 'progress', label: '完工进展', kind: 'number' },
  { group: 'project', key: 'costRatio', label: '预算消耗比', kind: 'number' },
  { group: 'project', key: 'paymentRatio', label: '回款完成率', kind: 'number' },
  { group: 'project', key: 'openRisks', label: '未关闭风险数', kind: 'number' },
  { group: 'project', key: 'finalAcceptDate', label: '终验时间', kind: 'date' },
  // —— paymentNode 组(存在性) ——
  { group: 'paymentNode', key: 'stage', label: '回款阶段', kind: 'enum' },
  { group: 'paymentNode', key: 'category', label: '回款类型', kind: 'enum' },
  { group: 'paymentNode', key: 'status', label: '状态', kind: 'enum' },
  { group: 'paymentNode', key: 'planDate', label: '计划日期', kind: 'date' },
  { group: 'paymentNode', key: 'actualDate', label: '实际日期', kind: 'date' },
  { group: 'paymentNode', key: 'payRatio', label: '计划比例', kind: 'number' },
  { group: 'paymentNode', key: 'actualRatio', label: '实际比例', kind: 'number' },
  { group: 'paymentNode', key: 'expectedPayment', label: '计划回款(万)', kind: 'number' },
  { group: 'paymentNode', key: 'receivedAmount', label: '已收(万)', kind: 'number' },
  { group: 'paymentNode', key: 'unpaidAmount', label: '未收(万)', kind: 'number' },
  { group: 'paymentNode', key: 'termDays', label: '账期(天)', kind: 'number' },
  // —— milestone 组(存在性) ——
  { group: 'milestone', key: 'priority', label: '优先级', kind: 'enum' },
  { group: 'milestone', key: 'payStage', label: '关联收款阶段', kind: 'enum' },
  { group: 'milestone', key: 'name', label: '里程碑名称', kind: 'text' },
  { group: 'milestone', key: 'planDate', label: '计划日期', kind: 'date' },
  { group: 'milestone', key: 'actualDate', label: '实际日期', kind: 'date' },
]

export function fieldsOf(group: FieldDef['group']): FieldDef[] {
  return FIELD_CATALOG.filter((f) => f.group === group)
}

function isDateLike(x: any): boolean {
  return typeof x === 'string' && /\d{4}-\d{2}-\d{2}/.test(x)
}

function inRange(raw: any, min: any, max: any): boolean {
  const hasMin = min != null && min !== ''
  const hasMax = max != null && max !== ''
  if (!hasMin && !hasMax) return true
  if (isDateLike(min) || isDateLike(max)) {
    const v = String(raw ?? '').slice(0, 10)
    if (v === '') return false
    if (hasMin && v < String(min).slice(0, 10)) return false
    if (hasMax && v > String(max).slice(0, 10)) return false
    return true
  }
  if (raw == null || raw === '') return false
  const n = Number(raw)
  if (Number.isNaN(n)) return false
  if (hasMin && n < Number(min)) return false
  if (hasMax && n > Number(max)) return false
  return true
}

function leafMatch(raw: any, c: ScopeCondition): boolean {
  switch (c.op) {
    case 'in':
    case 'notIn': {
      const set = new Set(c.values ?? [])
      const hit = Array.isArray(raw)
        ? raw.some((v) => set.has(String(v)))
        : set.has(String(raw ?? ''))
      return c.op === 'in' ? hit : !hit
    }
    case 'between':
    case 'notBetween': {
      const within = inRange(raw, c.min, c.max)
      return c.op === 'between' ? within : !within
    }
    case 'contains':
    case 'notContains': {
      const term = String((c.values && c.values[0]) ?? '')
      const hit = term !== '' && String(raw ?? '').includes(term)
      return c.op === 'contains' ? hit : !hit
    }
  }
  return false
}

function evalCond(input: ScopeProjectInput, c: ScopeCondition): boolean {
  if (c.group === 'project') return leafMatch(input.proj[c.field], c)
  const rows = c.group === 'paymentNode' ? input.nodes : input.milestones
  return (rows ?? []).some((r) => leafMatch(r[c.field], c))
}

function evalGroup(input: ScopeProjectInput, g: ScopeGroup): boolean {
  if (!g.conditions || !g.conditions.length) return false // 空组不命中
  const rs = g.conditions.map((c) => evalCond(input, c))
  return g.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}

/** 空范围(无 groups 或全空组)→ false。两级 AND/OR。 */
export function projectMatches(input: ScopeProjectInput, scope: ScopeFilter): boolean {
  if (!scope || !Array.isArray(scope.groups) || !scope.groups.length) return false
  const rs = scope.groups.map((g) => evalGroup(input, g))
  return scope.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}
