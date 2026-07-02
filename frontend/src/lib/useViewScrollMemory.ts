import { nextTick, onActivated, onDeactivated, onMounted } from 'vue'

// 记忆并恢复主内容滚动容器(.app-main)的滚动位置：
// 菜单/深链/首次进入(新实例) → 停在顶部；下钻返回(缓存激活) → 恢复离开时的位置。
export function useViewScrollMemory(): void {
  let saved = 0
  let fresh = false
  const container = (): HTMLElement | null =>
    document.querySelector('.app-main') as HTMLElement | null

  onMounted(() => { fresh = true })

  onDeactivated(() => {
    const el = container()
    if (el) saved = el.scrollTop
  })

  onActivated(() => {
    if (fresh) { fresh = false; return } // 新实例：菜单/深链/首次 → 不恢复
    const restore = (): void => {
      const el = container()
      if (el) el.scrollTop = saved
    }
    if (typeof requestAnimationFrame === 'function') {
      void nextTick(() => requestAnimationFrame(restore))
    } else {
      void nextTick(restore)
    }
  })
}
