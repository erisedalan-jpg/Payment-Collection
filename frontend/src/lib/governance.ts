// 数据治理视图的纯函数视图模型助手(与回款内"数据质检" dataQuality.ts 无关)
export function coverageColor(pct: number): string {
  if (pct >= 0.7) return 'var(--c-paid)'
  if (pct >= 0.3) return 'var(--c-pending)'
  return 'var(--danger)'
}

export function verdictLabel(v: string): string {
  return v === 'green' ? '可用' : v === 'yellow' ? '部分' : '不足'
}
