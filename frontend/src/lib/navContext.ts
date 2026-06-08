import type { Router } from 'vue-router'

/** 带维度跳转多维看板。年/视角等全局筛选由 filter store 跨页保留，此处只传维度。 */
export function goBoard(router: Router, dim: string): void {
  router.push({ path: '/board', query: { dim } })
}
