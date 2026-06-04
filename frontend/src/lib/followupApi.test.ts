import { describe, it, expect, vi, afterEach } from 'vitest'
import { followupApi } from './followupApi'

afterEach(() => vi.restoreAllMocks())

function mockFetch(body: any) {
  return vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => body } as any)
}

describe('followupApi', () => {
  it('types 解析类型/状态', async () => {
    mockFetch({ success: true, 跟进类型: ['邮件推动'], 跟进状态: ['跟进中'] })
    const r = await followupApi.types()
    expect(r['跟进类型']).toEqual(['邮件推动'])
  })
  it('list 编码 projectId 并带 limit', async () => {
    const f = mockFetch({ success: true, records: [{ 记录编号: 'FU-1' }], total: 1 })
    const r = await followupApi.list('P 1', 20)
    expect(r.records[0]['记录编号']).toBe('FU-1')
    expect((f.mock.calls[0][0] as string)).toBe('/api/followup/list/P%201?limit=20')
  })
  it('add POST 到 /api/followup/add', async () => {
    const f = mockFetch({ success: true, 记录编号: 'FU-2', message: '已保存' })
    const r = await followupApi.add({ 项目编号: 'P1', 项目名称: '甲', 跟进人: '张', 跟进类型: '邮件推动', 跟进内容: '催', 跟进状态: '跟进中' })
    expect(r['记录编号']).toBe('FU-2')
    expect(f.mock.calls[0][0]).toBe('/api/followup/add')
    expect((f.mock.calls[0][1] as any).method).toBe('POST')
  })
  it('remove 仅传记录编号（无 cloudUrl）', async () => {
    const f = mockFetch({ success: true, message: '已删除' })
    await followupApi.remove('FU-9')
    expect(JSON.parse((f.mock.calls[0][1] as any).body)).toEqual({ 记录编号: 'FU-9' })
  })
  it('syncStatus 解析 state', async () => {
    mockFetch({ success: true, recordId: 'FU-1', state: { status: 'success', message: 'ok' } })
    const r = await followupApi.syncStatus('FU-1')
    expect(r.state.status).toBe('success')
  })
})
