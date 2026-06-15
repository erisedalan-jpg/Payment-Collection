/** 节点待回款（元）= 计划回款 - 实际回款。忠实移植 app.js getNodeRemaining。
 *  仍被 /calendar、/ledger、dashboardSignals 共享消费（回款节点级），2B 保留。 */
export function getNodeRemaining(n: Record<string, any>): number {
  return (n.expectedPayment || 0) - (n.actualPayment || 0)
}
