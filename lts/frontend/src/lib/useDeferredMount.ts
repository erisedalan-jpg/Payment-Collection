import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 延迟挂载重型子树,消除「跨页点击卡顿」。
 *
 * 返回的 `ready` 在生产浏览器中首帧为 false —— 让路由切换先绘制轻量骨架(标题/KPI/工具栏),
 * 随后经两帧 requestAnimationFrame 翻为 true,再挂载大表/图表等重内容,把它们的同步渲染
 * 移出「点击那一帧」,从而点击瞬间即出页面、不再冻结。展示内容不变,只是晚一两帧填充。
 *
 * 测试环境(vitest,`import.meta.env.MODE === 'test'`)与无 requestAnimationFrame 的环境下,
 * `ready` 恒为 true、挂载即渲染 —— 保证既有同步断言与 SSR 行为不变。
 */
export function useDeferredMount() {
  const canDefer = import.meta.env.MODE !== 'test' && typeof requestAnimationFrame === 'function'
  const ready = ref(!canDefer)
  if (!canDefer) return { ready }

  let r1 = 0
  let r2 = 0
  onMounted(() => {
    // 双 rAF:第一帧让骨架完成绘制,第二帧再翻 ready 挂载重内容。
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => { ready.value = true })
    })
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(r1)
    cancelAnimationFrame(r2)
  })
  return { ready }
}
