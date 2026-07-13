import { api } from '@/api/client'
import type { YitianData } from '@/types/yitian'

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
