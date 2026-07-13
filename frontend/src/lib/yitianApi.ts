import { api } from '@/api/client'
import type { YitianData } from '@/types/yitian'

/** 后端已按 allowedL4 切过数据;前端拿到什么就是该账号该看的全部。 */
export async function getYitianData(): Promise<YitianData> {
  return api.get<YitianData>('/api/yitian/data')
}
