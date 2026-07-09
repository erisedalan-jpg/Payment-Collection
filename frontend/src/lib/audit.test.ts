import { describe, it, expect } from 'vitest'
import { buildExportRows, type AuditRow } from './audit'

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  ts: '2026-07-08T14:23:01+08:00', event: 'login.success', action: '登录成功',
  account: 'admin', displayName: '超级管理员', ip: '1.2.3.4', userAgent: 'UA',
  method: 'POST', path: '/api/login', status: 200, success: true,
  target: null, detail: null, ...over,
})

describe('buildExportRows', () => {
  it('中文表头映射且结果成功/失败中文化', () => {
    const out = buildExportRows([row(), row({ success: false, action: '登录失败' })])
    expect(out).toHaveLength(2)
    expect(out[0]['时间']).toBe('2026-07-08T14:23:01+08:00')
    expect(out[0]['账号']).toBe('admin')
    expect(out[0]['结果']).toBe('成功')
    expect(out[1]['结果']).toBe('失败')
  })

  it('空 target/detail 输出空串而非 null', () => {
    const out = buildExportRows([row({ target: null, detail: null })])
    expect(out[0]['目标']).toBe('')
    expect(out[0]['详情']).toBe('')
  })
})
