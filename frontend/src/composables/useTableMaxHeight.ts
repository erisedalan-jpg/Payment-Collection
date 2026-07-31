import { onActivated, onBeforeUnmount, onDeactivated, onMounted, nextTick, ref, type Ref } from 'vue'

/** 纯计算:视口可用高度 = 视口高 − 表格顶部距 − 底部留白,不低于 min。
 *  rectTop 为负(表格顶部已滚出视口上沿)时按【贴顶】算,给结果封个顶 —— 否则
 *  innerHeight − 负数 会在滚动态重算时把表体撑到远超视口(极端情况几千 px)。
 *  注意这【不是】为了救冻结表头:rectTop < 0 时表头已经在视口上方了,与表体多高无关
 *  (el-table 设 max-height 时表头是表内独立 wrapper,不是 viewport-sticky)。
 *  代价:滚动态下重算会比不 clamp 时矮 |rectTop| 那么多。该路径极窄(动态测高的表都在
 *  页面顶部,表高被算成填满剩余视口,页面可滚动量只有 pager 那几十 px),属防御性封顶。 */
export function computeMaxHeight(rectTop: number, innerHeight: number, bottomGap: number, min: number): number {
  return Math.max(min, innerHeight - Math.max(0, rectTop) - bottomGap)
}

/** 兜底地板:测不准时(表格在折叠线以下,rect.top 远大于视口高,算出的负数不是「空间不够」
 *  而是「没测到」)最坏也要显示约 10 行。生效条件是 rect.top > innerHeight − 464。
 *  现有页面顶部表格(rect.top≈250):innerHeight≈950(1080p 全屏)算出 676 > 440,不生效;
 *  但 1366×768 笔记本的 innerHeight 实际只有 620~660(屏幕高 ≠ innerHeight),算出约 364,
 *  地板【会】生效,表体底边比视口底低约 50px、最后一行要页面滚动才看得全。这是取 440 的
 *  已知取舍(换来最坏情况从 4 行升到约 10 行);取 560 会把溢出扩大到约 170px,故不取。
 *  长页面底部的大明细表不该依赖这个地板,应显式传 max-height-px(见 lib/tableLayout.ts)。 */
const DEFAULT_MIN_HEIGHT = 440

/**
 * 动态测量目标元素在视口中的顶部位置,算出 el-table 的 max-height。
 * 随窗口 resize / keep-alive 激活 / 外部 recompute() 重算。enabled 为假时不计算(非冻结表零开销)。
 */
export function useTableMaxHeight(
  getEl: () => HTMLElement | null | undefined,
  opts: { bottomGap?: number; min?: number; enabled?: () => boolean } = {},
): { maxHeight: Ref<number>; recompute: () => void } {
  const bottomGap = opts.bottomGap ?? 24
  const min = opts.min ?? DEFAULT_MIN_HEIGHT
  const maxHeight = ref(min)

  function recompute() {
    if (opts.enabled && !opts.enabled()) return
    const el = getEl()
    if (!el || typeof window === 'undefined') return
    const top = el.getBoundingClientRect().top
    maxHeight.value = computeMaxHeight(top, window.innerHeight, bottomGap, min)
  }

  const onResize = () => recompute()
  const addListener = () => {
    if (opts.enabled && !opts.enabled()) return
    if (typeof window !== 'undefined') window.addEventListener('resize', onResize)
  }
  const removeListener = () => { if (typeof window !== 'undefined') window.removeEventListener('resize', onResize) }

  onMounted(() => { addListener(); nextTick(recompute) })
  onActivated(() => { addListener(); nextTick(recompute) }) // keep-alive 页重新激活时重算(非 keep-alive 下不触发)
  onDeactivated(removeListener)
  onBeforeUnmount(removeListener)

  return { maxHeight, recompute }
}
