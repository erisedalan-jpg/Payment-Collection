/** 透视类型层。函数实现已迁移到 paymentBoard.ts / projectPivot.ts，本文件只保留类型供组件 import type。 */

export interface CrossMatrix<G = unknown> {
  rows: string[]
  cols: string[]
  cells: number[][]
  index: Record<string, Record<string, G>>
}

export interface PivotRow {
  tuple: string[]
  key: string
}
export interface PivotCol {
  label: string
  key: string
}
export interface PivotResult<G = unknown> {
  rowDimLabels: string[]
  colDimLabels: string[]
  rows: PivotRow[]
  cols: PivotCol[]
  cells: number[][]
  index: Record<string, Record<string, G>>
}
