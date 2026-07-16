import { describe, it, expect } from 'vitest'
import { getNodeRemaining } from './riskGroups'

describe('getNodeRemaining', () => {
  it('expected - actual（元）', () => {
    expect(getNodeRemaining({ expectedPayment: 200000, actualPayment: 100000 })).toBe(100000)
    expect(getNodeRemaining({})).toBe(0)
  })
})
