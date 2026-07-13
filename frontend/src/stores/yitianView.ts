import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { userScopedKey } from '@/lib/userScopedKey'
import type { WeekMode } from '@/lib/yitian/calendar'

const BASE_KEY = 'yitian_view'

/** /yitian 各页共享的视图状态:日期区间 + 周口径 + L4 筛选。按登录账号持久化(V2.8.3 范式)。 */
export const useYitianViewStore = defineStore('yitianView', () => {
  const start = ref('')
  const end = ref('')
  const weekMode = ref<WeekMode>('calc')   // 默认倚天计算周(与倚天填报截止口径一致)
  const l4s = ref<string[]>([])
  let hydrated = false

  function persist(): void {
    if (!hydrated) return                  // 未 hydrate / 已 reset:不写,免把默认值糊到别人的 key 上
    try {
      localStorage.setItem(userScopedKey(BASE_KEY), JSON.stringify({
        start: start.value, end: end.value, weekMode: weekMode.value, l4s: l4s.value,
      }))
    } catch {
      /* 隐私模式/配额满:静默降级为不持久化 */
    }
  }

  watch([start, end, weekMode, l4s], persist, { deep: true })

  /** 组件 setup 内调用(需 pinia active 才能取到账号前缀)。幂等。 */
  function hydrate(): void {
    if (hydrated) return
    try {
      const raw = localStorage.getItem(userScopedKey(BASE_KEY))
      if (raw) {
        const p = JSON.parse(raw) as Partial<{ start: string; end: string; weekMode: WeekMode; l4s: string[] }>
        if (p.start) start.value = p.start
        if (p.end) end.value = p.end
        if (p.weekMode === 'iso' || p.weekMode === 'calc') weekMode.value = p.weekMode
        if (Array.isArray(p.l4s)) l4s.value = p.l4s
      }
    } catch {
      /* 坏 JSON:忽略,用默认值 */
    }
    hydrated = true
  }

  /** 把区间钳制到数据实际跨度内(首次进页面 / 换了数据后区间越界)。 */
  function ensureRange(dataStart: string, dataEnd: string): void {
    if (!dataStart || !dataEnd) return
    if (!start.value || start.value < dataStart || start.value > dataEnd) start.value = dataStart
    if (!end.value || end.value > dataEnd || end.value < dataStart) end.value = dataEnd
  }

  function reset(): void {
    hydrated = false
    start.value = ''
    end.value = ''
    weekMode.value = 'calc'
    l4s.value = []
  }

  return { start, end, weekMode, l4s, hydrate, ensureRange, reset }
})
