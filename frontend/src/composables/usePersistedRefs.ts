import { watch, type Ref } from 'vue'
import { userScopedKey } from '@/lib/userScopedKey'

/** 把一组页面视图 ref 按登录账号持久化到 localStorage(V2.8.3 范式,与 useYitianViewStore 同源)。
 *  须在组件 setup 内调用(userScopedKey 需要 pinia active)。
 *  只收「用户选择」类状态 —— modal 开关/DOM 引用/分页页码绝不传进来:
 *  存了 drillOpen:true 会导致下次进页面弹出一个空 modal;HTMLElement 无法序列化;
 *  currentPage 会让人「回来还停在第 5 页」且数据变化后可能越界。 */
export function usePersistedRefs(baseKey: string, refs: Record<string, Ref<any>>): void {
  let hydrated = false
  try {
    const raw = localStorage.getItem(userScopedKey(baseKey))
    if (raw) {
      const p = JSON.parse(raw) as Record<string, unknown>
      for (const [k, r] of Object.entries(refs)) {
        const v = p[k]
        if (v === undefined) continue
        // 类型护栏:存档结构与当前代码不符时跳过该键,不污染运行时。
        // 本期 8 个页面各存一份不同结构的档,今后任一次「改默认值/换类型/删状态」
        // 都会让旧档与新代码错位,没有护栏会把字符串灌进本该是数组的 ref、页面直接崩。
        if (Array.isArray(r.value) !== Array.isArray(v)) continue
        // r.value !== null 必须在 typeof 比较【之前】:typeof null === 'object',
        // 否则 ref<number|null>(null) 会把合法的 number 存档判为不符而静默失效。
        if (!Array.isArray(v) && r.value !== null && typeof r.value !== typeof v) continue
        r.value = v
      }
    }
  } catch {
    /* 坏 JSON / 隐私模式:忽略,用默认值 */
  }
  hydrated = true

  watch(Object.values(refs), () => {
    if (!hydrated) return
    try {
      const out: Record<string, unknown> = {}
      for (const [k, r] of Object.entries(refs)) out[k] = r.value
      localStorage.setItem(userScopedKey(baseKey), JSON.stringify(out))
    } catch {
      /* 配额满:静默降级为不持久化 */
    }
  }, { deep: true })
}
