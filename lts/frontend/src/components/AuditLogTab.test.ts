import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AuditLogTab from './AuditLogTab.vue'
import * as auditLib from '@/lib/audit'
import * as xlsx from '@/lib/exportXlsx'

vi.mock('@/lib/audit', async (orig) => {
  const actual = await orig<typeof import('@/lib/audit')>()
  return { ...actual, fetchAudit: vi.fn() }
})

const sampleResp: auditLib.AuditResponse = {
  rows: [{
    ts: '2026-07-08T14:23:01+08:00', event: 'login.success', action: '登录成功',
    account: 'admin', displayName: '超级管理员', ip: '1.2.3.4', userAgent: 'UA',
    method: 'POST', path: '/api/login', status: 200, success: true, target: null, detail: null,
  }],
  total: 1,
  facets: { accounts: ['admin'], events: [{ code: 'login.success', label: '登录成功' }] },
}

describe('AuditLogTab', () => {
  beforeEach(() => {
    vi.mocked(auditLib.fetchAudit).mockResolvedValue(sampleResp)
  })

  it('挂载即拉取并渲染行', async () => {
    const w = mount(AuditLogTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(auditLib.fetchAudit).toHaveBeenCalled()
    expect(w.text()).toContain('登录成功')
    expect(w.text()).toContain('1.2.3.4')
  })

  it('导出调用 exportRows', async () => {
    const spy = vi.spyOn(xlsx, 'exportRows').mockImplementation(() => {})
    const w = mount(AuditLogTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    await (w.vm as unknown as { onExport: () => Promise<void> }).onExport()
    await flushPromises()
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toContain('审计日志')
  })
})
