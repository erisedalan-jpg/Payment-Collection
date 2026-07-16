/** 节点待回款（元）= 计划回款 - 实际回款。忠实移植 app.js getNodeRemaining。
 *  被 /insight/calendar、/ledger 共享消费（回款节点级）。 */
export function getNodeRemaining(n: Record<string, any>): number {
  return (n.expectedPayment || 0) - (n.actualPayment || 0)
}
