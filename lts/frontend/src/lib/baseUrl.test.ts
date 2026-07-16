import { describe, it, expect } from 'vitest'
import { joinBase } from './baseUrl'

describe('joinBase', () => {
  it('默认 base / 时原样返回(向后兼容)', () => {
    expect(joinBase('/', '/api/login')).toBe('/api/login')
    expect(joinBase('/', '/data/analysis_data.json')).toBe('/data/analysis_data.json')
  })
  it('base /pm/ 时加前缀', () => {
    expect(joinBase('/pm/', '/api/login')).toBe('/pm/api/login')
    expect(joinBase('/pm/', '/data/analysis_data.json')).toBe('/pm/data/analysis_data.json')
    expect(joinBase('/pm/', '/api/pmis/upload')).toBe('/pm/api/pmis/upload')
  })
  it('空 base 也安全', () => {
    expect(joinBase('', '/api/x')).toBe('/api/x')
  })
})
