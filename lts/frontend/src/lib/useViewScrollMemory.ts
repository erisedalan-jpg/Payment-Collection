import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue'

// 记忆并恢复主内容滚动容器(.app-main)的滚动位置：
// 菜单/深链/首次进入(新实例) → 停在顶部；下钻返回(缓存激活) → 恢复离开时的位置。
// 采用"激活期间监听 scroll 持续记录"而非"停用瞬间读取"——停用时详情页已换入同一容器、
// 较矮内容会把 scrollTop 夹到 0,那一刻读到的不是用户真实位置。
export function useViewScrollMemory(): void {
  let saved = 0
  let fresh = false
  const container = (): HTMLElement | null =>
    document.querySelector('.app-main') as HTMLElement | null
  const onScroll = (): void => {
    const el = container()
    if (el) saved = el.scrollTop
  }
  const detach = (): void => {
    const el = container()
    if (el) el.removeEventListener('scroll', onScroll)
  }

  onMounted(() => { fresh = true })

  onActivated(() => {
    const el = container()
    const target = saved // 先固定目标,避免恢复前的 scroll 噪声改写
    if (el) el.addEventListener('scroll', onScroll, { passive: true })
    if (fresh) { fresh = false; return } // 新实例:菜单/深链/首次 → 不恢复
    const restore = (): void => { if (el) el.scrollTop = target }
    if (typeof requestAnimationFrame === 'function') {
      void nextTick(() => requestAnimationFrame(restore))
    } else {
      void nextTick(restore)
    }
  })

  onDeactivated(detach)
  onBeforeUnmount(detach)
}
