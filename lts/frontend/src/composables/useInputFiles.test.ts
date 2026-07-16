import { describe, it, expect, vi, afterEach } from 'vitest'
import { useInputFiles, INPUT_FILE_NAMES } from './useInputFiles'

function fakeFile(name: string): File {
  return { name, arrayBuffer: async () => new ArrayBuffer(4) } as unknown as File
}

afterEach(() => vi.unstubAllGlobals())

describe('useInputFiles', () => {
  it('包含十二个固定文件名(含核心回款源/TOP1000/倚天工时域)', () => {
    expect(INPUT_FILE_NAMES).toEqual([
      '组织架构.xlsx', 'A.xlsx', 'delivery_analysis.csv', 'delivery_analysis.xlsx',
      'payment_records.csv', 'profit_loss_direct.csv', 'profit_loss_bridge.csv', 'budget_data.csv',
      'collection_stages.csv', 'TOP1000.xlsx', '工时.xlsx', 'holidays.csv',
    ])
  })

  it('白名单包含 TOP1000.xlsx', () => {
    expect(INPUT_FILE_NAMES).toContain('TOP1000.xlsx')
  })

  it('upload 只传白名单文件并按文件名编码到 query', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      return { ok: true } as Response
    }))
    const { upload } = useInputFiles()
    const ok = await upload([fakeFile('组织架构.xlsx'), fakeFile('别的.xlsx')])
    expect(ok).toBe(1)
    expect(calls).toEqual(['/api/inputs/upload?name=' + encodeURIComponent('组织架构.xlsx')])
  })

  it('上传失败不计入成功数', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false } as Response)))
    const { upload } = useInputFiles()
    expect(await upload([fakeFile('A.xlsx')])).toBe(0)
  })
})
