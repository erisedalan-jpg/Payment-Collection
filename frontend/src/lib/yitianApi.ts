import { api } from '@/api/client'
import type { YitianData } from '@/types/yitian'
import type { YitianRulesConfig } from '@/lib/yitian/rulesConfig'

/** 后端已按 allowedL4 切过数据;前端拿到什么就是该账号该看的全部。 */
export async function getYitianData(): Promise<YitianData> {
  return api.get<YitianData>('/api/yitian/data')
}

export interface YitianSettings {
  excludedTypes: string[]
}

/** 合规检查范围配置(超管可配)。全体授权账号可读——页面要用它算合规率分母。 */
export async function getYitianSettings(): Promise<YitianSettings> {
  const r = await api.get<{ success: boolean; settings: YitianSettings }>('/api/yitian/settings')
  return r.settings
}

/** 保存配置(超管专属)。改完立即生效,无需点「更新数据」。 */
export async function saveYitianSettings(cfg: YitianSettings): Promise<YitianSettings> {
  const r = await api.post<{ success: boolean; settings: YitianSettings }>('/api/yitian/settings', cfg)
  return r.settings
}

export interface YitianStoreStats {
  rows: number
  start: string | null
  end: string | null
}

/** 累积库状态(已累积多少行、覆盖哪段日期)。 */
export async function getYitianStore(): Promise<YitianStoreStats> {
  const r = await api.get<{ success: boolean; stats: YitianStoreStats }>('/api/yitian/store')
  return r.stats
}

/** 清空累积库(超管)。误导入的回退手段。 */
export async function clearYitianStore(): Promise<YitianStoreStats> {
  const r = await api.post<{ success: boolean; stats: YitianStoreStats }>('/api/yitian/store/clear', {})
  return r.stats
}

/** 按日期区间删除累积数据(超管)。 */
export async function deleteYitianStoreRange(
  start: string, end: string,
): Promise<{ deleted: number; stats: YitianStoreStats }> {
  const r = await api.post<{ success: boolean; deleted: number; stats: YitianStoreStats }>(
    '/api/yitian/store/delete-range', { start, end })
  return { deleted: r.deleted, stats: r.stats }
}

export async function getYitianRules(): Promise<YitianRulesConfig> {
  const r = await api.get<{ success: boolean; rules: YitianRulesConfig }>('/api/yitian/rules')
  return r.rules
}

export async function saveYitianRules(cfg: YitianRulesConfig): Promise<{ rules: YitianRulesConfig; problemCount: number }> {
  const r = await api.post<{ success: boolean; rules: YitianRulesConfig; problemCount: number }>('/api/yitian/rules', cfg)
  return { rules: r.rules, problemCount: r.problemCount }
}
