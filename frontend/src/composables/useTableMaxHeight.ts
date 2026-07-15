import { onActivated, onBeforeUnmount, onDeactivated, onMounted, nextTick, ref, type Ref } from 'vue'

/** 纯计算:视口可用高度 = 视口高 − 表格顶部距 − 底部留白,不低于 min。 */
export function computeMaxHeight(rectTop: number, innerHeight: number, bottomGap: number, min: number): number {
  return Math.max(min, innerHeight - rectTop - bottomGap)
}

/**
 * 动态测量目标元素在视口中的顶部位置,算出 el-table 的 max-height。
 * 随窗口 resize / keep-alive 激活 / 外部 recompute() 重算。enabled 为假时不计算(非冻结表零开销)。
 */
export function useTableMaxHeight(
  getEl: () => HTMLElement | null | undefined,
  opts: { bottomGap?: number; min?: number; enabled?: () => boolean } = {},
): { maxHeight: Ref<number>; recompute: () => void } {
  const bottomGap = opts.bottomGap ?? 24
  const min = opts.min ?? 200
  const maxHeight = ref(min)

  function recompute() {
    if (opts.enabled && !opts.enabled()) return
    const el = getEl()
    if (!el || typeof window === 'undefined') return
    const top = el.getBoundingClientRect().top
    maxHeight.value = computeMaxHeight(top, window.innerHeight, bottomGap, min)
  }

  const onResize = () => recompute()
  const addListener = () => { if (typeof window !== 'undefined') window.addEventListener('resize', onResize) }
  const removeListener = () => { if (typeof window !== 'undefined') window.removeEventListener('resize', onResize) }

  onMounted(() => { addListener(); nextTick(recompute) })
  onActivated(() => { addListener(); nextTick(recompute) }) // keep-alive 页重新激活时重算(非 keep-alive 下不触发)
  onDeactivated(removeListener)
  onBeforeUnmount(removeListener)

  return { maxHeight, recompute }
}
