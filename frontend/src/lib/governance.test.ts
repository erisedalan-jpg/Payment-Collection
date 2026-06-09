import { describe, it, expect } from 'vitest'
import { coverageColor, verdictLabel } from './governance'

describe('coverageColor', () => {
  it('maps thresholds to tokens', () => {
    expect(coverageColor(0.8)).toBe('var(--c-paid)')
    expect(coverageColor(0.7)).toBe('var(--c-paid)') // 边界 >=0.7
    expect(coverageColor(0.5)).toBe('var(--c-pending)')
    expect(coverageColor(0.3)).toBe('var(--c-pending)') // 边界 >=0.3
    expect(coverageColor(0.1)).toBe('var(--danger)')
  })
})

describe('verdictLabel', () => {
  it('maps verdict to symbol text', () => {
    expect(verdictLabel('green')).toBe('可用')
    expect(verdictLabel('yellow')).toBe('部分')
    expect(verdictLabel('red')).toBe('不足')
    expect(verdictLabel('unknown')).toBe('不足') // 未知一律按不足兜底
  })
})
