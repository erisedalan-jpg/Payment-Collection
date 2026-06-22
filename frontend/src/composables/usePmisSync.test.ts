import { describe, it, expect, vi, afterEach } from 'vitest'
import { usePmisSync, PMIS_FILE_NAMES } from './usePmisSync'

afterEach(() => vi.unstubAllGlobals())

describe('usePmisSync', () => {
  it('PMIS_FILE_NAMES 含九表', () => {
    expect(PMIS_FILE_NAMES.length).toBe(9)
  })

  it('usePmisSync 仅暴露 upload', () => {
    const api = usePmisSync()
    expect(typeof api.upload).toBe('function')
  })

  it('upload() 对每个 PMIS 文件 POST /api/pmis/upload?name=', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock as any)
    const s = usePmisSync()
    const f = new File([new Uint8Array([1, 2, 3])], '项目中心.xlsx')
    ;(f as any).arrayBuffer = async () => new Uint8Array([1, 2, 3]).buffer
    const ok = await s.upload([f])
    expect(ok).toBe(1)
    const calls = fetchMock.mock.calls as unknown as [string, ...unknown[]][]
    expect(calls[0][0]).toContain('/api/pmis/upload?name=')
  })

  it('upload() 跳过不在 PMIS_FILE_NAMES 的文件', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchMock as any)
    const s = usePmisSync()
    const f = new File([new Uint8Array([1])], 'unknown.xlsx')
    ;(f as any).arrayBuffer = async () => new Uint8Array([1]).buffer
    const ok = await s.upload([f])
    expect(ok).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
