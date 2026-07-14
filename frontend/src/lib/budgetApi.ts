import { api } from '@/api/client'
import type { BudgetConfig } from '@/lib/budget/types'

/** 存档列表的轻量元信息(后端 budget_store.meta_of)。不含 data / rateSnapshot。 */
export interface EstimateMeta {
  id: string
  account: string
  quoteName: string
  createdAt: string
  updatedAt: string
  customerName: string
  salesName: string
  projectAmount: number | null
  totalCost: number | null
  salesAmount: number | null
  costRatio: number | null
  ratioStatus: string
}

/** 整条存档记录。rateSnapshot = 保存那一刻的完整费率配置(报价可复现的根据)。 */
export interface EstimateRecord extends EstimateMeta {
  data: unknown
  rateSnapshot: BudgetConfig
  summary: Record<string, unknown>
}

/** 费率与目录配置。登录 + budget 授权即可读(页面要用它算);写须超管。 */
export async function getBudgetConfig(): Promise<BudgetConfig> {
  const r = await api.get<{ success: boolean; config: BudgetConfig }>('/api/budget/config')
  return r.config
}

/** 保存配置(超管专属)。改完立即生效,无需点「更新数据」。 */
export async function saveBudgetConfig(cfg: BudgetConfig): Promise<BudgetConfig> {
  const r = await api.post<{ success: boolean; config: BudgetConfig }>('/api/budget/config', cfg)
  return r.config
}

/** 存档列表。all=true 仅对超管有效 —— 普通管理员传了后端也只返回自己的。 */
export async function listEstimates(all = false): Promise<EstimateMeta[]> {
  const r = await api.get<{ success: boolean; items: EstimateMeta[] }>(
    '/api/budget/estimates' + (all ? '?all=1' : ''))
  return r.items
}

export async function getEstimate(id: string): Promise<EstimateRecord> {
  const r = await api.get<{ success: boolean; record: EstimateRecord }>(
    `/api/budget/estimates?id=${encodeURIComponent(id)}`)
  return r.record
}

/** 带 id → 覆盖(后端校验 owner/超管);不带 id → 新建。 */
export async function saveEstimate(body: {
  id?: string
  quoteName: string
  data: unknown
  rateSnapshot: BudgetConfig
  summary: Record<string, unknown>
}): Promise<EstimateRecord> {
  const r = await api.post<{ success: boolean; record: EstimateRecord }>(
    '/api/budget/estimates', body)
  return r.record
}

export async function deleteEstimate(id: string): Promise<void> {
  await api.post<{ success: boolean }>('/api/budget/estimates/delete', { id })
}
