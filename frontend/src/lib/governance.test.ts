import { describe, it, expect } from 'vitest'
import { coverageColor, verdictLabel } from './governance'

describe('coverageColor', () => {
  it('maps thresholds to tokens', () => {
    expect(coverageColor(0.8)).toBe('var(--c-paid)')
    expect(coverageColor(0.5)).toBe('var(--c-pending)')
    expect(coverageColor(0.1)).toBe('var(--danger)')
  })
})

describe('verdictLabel', () => {
  it('maps verdict to symbol text', () => {
    expect(verdictLabel('green')).toBe('可用')
    expect(verdictLabel('yellow')).toBe('部分')
    expect(verdictLabel('red')).toBe('不足')
  })
})
