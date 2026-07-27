import type { Router } from 'vue-router'

/** 带维度跳转回款多维分析(board)。年/视角等全局筛选由 filter store 跨页保留,此处只传维度。
 *  V1.16.0:board 迁至 /insight/board(项目分析中心)。
 *  V4.4.7:项目分析中心解散,board 迁回回款域 /payment/board。 */
export function goBoard(router: Router, dim: string): void {
  router.push({ path: '/payment/board', query: { dim } })
}
