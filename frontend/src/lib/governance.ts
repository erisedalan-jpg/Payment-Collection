import type { AnalysisData } from '@/types/analysis'
import { anomalyRows } from './anomaly'

// 数据治理「健康检查」视图模型(P8 spec §2):纯函数聚合 meta+dataQuality+projectsQuality,零后端依赖。
export type Verdict = 'red' | 'yellow' | 'green'
export type Severity = 'high' | 'mid' | 'low'

export interface SourceCard {
  key: 'yundocs' | 'pmis' | 'org' | 'mapping' | 'delivery' | 'milestone' | 'payRecords' | 'profit' | 'bridge'
  label: string
  provided: boolean
  main: string
  mainLabel: string
  subs: string[] // ≤2 行辅信息(规范 1主2辅)
}

export interface AlertGroup {
  key: string
  label: string
  severity: Severity
  count: number
  columns: { key: string; label: string }[] // 空=无明细表(缺失类用 note)
  rows: Record<string, unknown>[]
  note?: string
  exportName?: string
}

export interface HealthReport {
  verdict: Verdict
  title: string
  sub: string
  metaLine: string
  sources: SourceCard[]
  alerts: AlertGroup[] // 已排序:0条沉底;其余严重度高→低,同级条数降序
}

const pct = (n: unknown) => `${Math.round((Number(n) || 0) * 100)}%`
const VERDICT_TXT: Record<string, string> = { green: '可用', yellow: '部分', red: '不足' }
const SEV_RANK: Record<Severity, number> = { high: 0, mid: 1, low: 2 }

// 源缺失降级说明(母 spec §3.4)
const MISSING: Record<string, { label: string; note: string }> = {
  pmis: { label: '数据源缺失:PMIS', note: '项目域五页整体空态。请在数据管理页在线下载或离线上传 PMIS 七表后点「更新数据」。' },
  org: { label: '数据源缺失:组织架构', note: '项目主域退化为 PMIS 在建全量。请提供 input/组织架构.xlsx 后点「更新数据」。' },
  mapping: { label: '数据源缺失:售前映射', note: '售前服务项目不整合历史,标记「待映射」。请提供 input/A.xlsx 后点「更新数据」。' },
  delivery: { label: '数据源缺失:预算核算明细', note: '项目预算核算明细显示「未提供」。请提供 input/delivery_analysis.xlsx 后点「更新数据」。' },
  msActive: { label: '数据源缺失:里程碑(在建)', note: '项目里程碑展示缺失。请从 PMIS 导出 在建项目里程碑计划数据.xlsx 放入 input/pmis/ 后点「更新数据」。' },
  msClosed: { label: '数据源缺失:里程碑(已结项)', note: '售前项目的原项目里程碑缺失。请从 PMIS 导出 已结项里程碑计划数据.xlsx 放入 input/pmis/ 后点「更新数据」。' },
  paymentRecords: { label: '数据源缺失:回款流水', note: '详情页回款数据 Tab 缺失。请提供 input/payment_records.csv 后点「更新数据」。' },
  profitDirect: { label: '数据源缺失:全预算(direct)', note: '预算核算科目树缺失。请提供 input/profit_loss_direct.csv 后点「更新数据」。' },
  profitBridge: { label: '数据源缺失:桥接预算', note: '售前项目的原项目预算核算缺失。请提供 input/profit_loss_bridge.csv 后点「更新数据」。' },
  budget: { label: '数据源缺失:预算版本(budget)', note: '科目树概算/核算两列将为空。请提供 input/budget_data.csv 后点「更新数据」。' },
}

export function buildHealthReport(data: AnalysisData): HealthReport {
  const meta = data.meta ?? ({} as AnalysisData['meta'])
  const dq = data.dataQuality ?? null
  const pq = data.projectsQuality ?? null
  const yundocsOk = (data.projects?.length ?? 0) > 0

  const themes = (dq?.themes ?? []) as { theme?: string; coveragePct?: number; verdict?: string }[]
  const themesOk = themes.filter((t) => t.verdict === 'green').length
  const s = dq?.summary
  const pmisOk = !!s?.pmisProvided
  const orgF = pq?.orgFile
  const mapF = pq?.mappingFile
  const delF = pq?.deliveryFile
  const msA = pq?.milestoneActive
  const msC = pq?.milestoneClosed
  const prF = pq?.paymentRecordsFile
  const pdF = pq?.profitDirectFile
  const pbF = pq?.profitBridgeFile
  const bgF = pq?.budgetFile

  const sources: SourceCard[] = [
    { key: 'yundocs', label: '云文档', provided: yundocsOk,
      main: yundocsOk ? String(meta.totalPaymentNodes ?? 0) : '-', mainLabel: '节点行数',
      subs: yundocsOk ? [`项目 ${meta.totalProjects ?? 0}`, `更新 ${meta.lastUpdate || '-'}`] : ['未提供'] },
    { key: 'pmis', label: 'PMIS 七表', provided: pmisOk,
      main: pmisOk ? pct(s?.joinRate) : '-', mainLabel: '匹配率',
      subs: pmisOk
        ? [`在建 ${s?.matchedActive ?? 0} · 已关闭 ${s?.matchedClosed ?? 0} · 主题 ${themesOk}/${themes.length} 可用`, `更新 ${s?.lastPmisUpdate || '-'}`]
        : ['未提供'] },
    { key: 'org', label: '组织架构', provided: !!orgF?.provided,
      main: orgF?.provided ? String(pq?.deptProjectCount ?? 0) : '-', mainLabel: '主域项目',
      subs: orgF?.provided ? [`人员 ${orgF.rows ?? 0} 行 · 匹配 ${orgF.matched ?? 0}`] : ['未提供'] },
    { key: 'mapping', label: '售前映射', provided: !!mapF?.provided,
      main: mapF?.provided ? `${pq?.presaleMapped ?? 0}/${pq?.presaleTotal ?? 0}` : '-', mainLabel: '售前已映射',
      subs: mapF?.provided ? [`映射 ${mapF.rows ?? 0} 行`] : ['未提供'] },
    { key: 'delivery', label: '预算核算(delivery)', provided: !!delF?.provided,
      main: delF?.provided ? pct(delF.matchRate) : '-', mainLabel: '匹配率',
      subs: delF?.provided ? [`${delF.rows ?? 0} 行 · 匹配 ${delF.matched ?? 0}`] : ['未提供'] },
    { key: 'milestone', label: '里程碑两表', provided: !!(msA?.provided || msC?.provided),
      main: msA?.provided ? String(msA.matched ?? 0) : '-', mainLabel: '在建命中',
      subs: (msA?.provided || msC?.provided)
        ? [`在建 ${msA?.rows ?? 0} 行 · 已结项 ${msC?.rows ?? 0} 行`]
        : ['未提供'] },
    { key: 'payRecords', label: '回款流水', provided: !!prF?.provided,
      main: prF?.provided ? String(prF.rows ?? 0) : '-', mainLabel: '流水行数',
      subs: prF?.provided ? [`命中主域 ${prF.matched ?? 0}`] : ['未提供'] },
    { key: 'profit', label: '全预算(direct+budget)', provided: !!pdF?.provided,
      main: pdF?.provided ? pct(pdF.matchRate) : '-', mainLabel: '匹配率',
      subs: pdF?.provided ? [`direct ${pdF.rows ?? 0} 行 · budget ${bgF?.rows ?? 0} 行`] : ['未提供'] },
    { key: 'bridge', label: '桥接预算', provided: !!pbF?.provided,
      main: pbF?.provided ? String(pbF.matched ?? 0) : '-', mainLabel: '售前命中',
      subs: pbF?.provided ? [`${pbF.rows ?? 0} 行`] : ['未提供'] },
  ]

  const alerts: AlertGroup[] = []
  const missPairs: [keyof typeof MISSING, boolean, Severity][] = [
    ['pmis', pmisOk, 'high'], ['org', !!orgF?.provided, 'high'],
    ['mapping', !!mapF?.provided, 'high'], ['delivery', !!delF?.provided, 'high'],
    ['msActive', !!msA?.provided, 'high'], ['msClosed', !!msC?.provided, 'mid'],
    ['paymentRecords', !!prF?.provided, 'high'], ['profitDirect', !!pdF?.provided, 'high'],
    ['profitBridge', !!pbF?.provided, 'mid'], ['budget', !!bgF?.provided, 'mid'],
  ]
  for (const [k, ok, sev] of missPairs) {
    if (!ok) alerts.push({ key: `missing-${k}`, label: MISSING[k].label, severity: sev, count: 1, columns: [], rows: [], note: MISSING[k].note })
  }
  const unmatched = (dq?.unmatched ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'unmatched', label: 'PMIS 未匹配', severity: 'high', count: unmatched.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }, { key: 'kind', label: '类型' }],
    rows: unmatched, exportName: 'PMIS未匹配清单.xlsx' })
  const mno = (pq?.managerNotInOrg ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'managerNotInOrg', label: '负责人不在人员清单', severity: 'high', count: mno.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }, { key: 'manager', label: '负责人' }],
    rows: mno, exportName: '负责人告警.xlsx' })
  const backfill = ((dq?.backfill ?? []) as Record<string, unknown>[]).map((b) => ({
    ...b, missingFields: Array.isArray(b.missingFields) ? (b.missingFields as string[]).join('、') : b.missingFields,
  }))
  alerts.push({ key: 'backfill', label: '回填待办', severity: 'mid', count: backfill.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }, { key: 'missingFields', label: '缺失字段' }],
    rows: backfill, exportName: 'PMIS回填待办.xlsx' })
  const pum = (pq?.presaleUnmapped ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'presaleUnmapped', label: '售前未映射', severity: 'mid', count: pum.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }],
    rows: pum, exportName: '售前未映射.xlsx' })
  const conflicts = (dq?.conflicts ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'conflicts', label: '口径冲突', severity: 'mid', count: conflicts.length,
    columns: [{ key: 'column', label: '列' }, { key: 'issue', label: '问题' }, { key: 'recommendation', label: '建议' }], rows: conflicts })
  const lowThemes = themes.filter((t) => t.verdict !== 'green')
    .map((t) => ({ theme: t.theme, coverage: pct(t.coveragePct), verdict: VERDICT_TXT[t.verdict ?? ''] ?? t.verdict }))
  alerts.push({ key: 'themesLow', label: '主题覆盖不足', severity: 'mid', count: pmisOk ? lowThemes.length : 0,
    columns: [{ key: 'theme', label: '主题' }, { key: 'coverage', label: '覆盖率' }, { key: 'verdict', label: '判定' }],
    rows: pmisOk ? lowThemes : [] })
  const snp = (pq?.staffNoProject ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'staffNoProject', label: '人员清单无项目', severity: 'low', count: snp.length,
    columns: [{ key: 'name', label: '姓名' }], rows: snp })
  const dirty = (dq?.dirty ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'dirty', label: '脏值', severity: 'low', count: dirty.length,
    columns: [{ key: 'type', label: '类型' }, { key: 'projectId', label: '项目编号' }, { key: 'field', label: '字段' }, { key: 'value', label: '值' }],
    rows: dirty })

  const anomalies = anomalyRows(data.projects ?? [])
  alerts.push({ key: 'l4Missing', label: '回款排除：服务组 L4 缺失', severity: 'mid', count: anomalies.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' }, { key: 'reason', label: '原因' }],
    rows: anomalies, exportName: '回款排除-L4缺失.xlsx' })

  alerts.sort((a, b) =>
    (a.count === 0 ? 1 : 0) - (b.count === 0 ? 1 : 0) || SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.count - a.count)

  const actionable = alerts.filter((a) => a.count > 0 && a.severity !== 'low')
  const lowCount = alerts.filter((a) => a.severity === 'low').reduce((n, a) => n + a.count, 0)
  let verdict: Verdict
  let title: string
  let sub = ''
  if (!yundocsOk) { verdict = 'red'; title = '数据不可用:云文档主数据缺失'; sub = '请在数据管理页同步或导入回款数据' }
  else if (actionable.length) { verdict = 'yellow'; title = `${actionable.length} 类告警需关注`; sub = lowCount ? `另有 ${lowCount} 条低优先提示` : '' }
  else { verdict = 'green'; title = '数据就绪'; sub = lowCount ? `${lowCount} 条低优先提示` : '' }
  const metaLine = `同步于 ${meta.lastUpdate || '-'} · 项目 ${meta.totalProjects ?? 0} · 节点 ${meta.totalPaymentNodes ?? 0}`
  return { verdict, title, sub, metaLine, sources, alerts }
}
