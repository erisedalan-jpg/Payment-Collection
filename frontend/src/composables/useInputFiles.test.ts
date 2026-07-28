import { describe, it, expect, vi, afterEach } from 'vitest'
import { useInputFiles, INPUT_FILE_NAMES } from './useInputFiles'

function fakeFile(name: string): File {
  return { name, arrayBuffer: async () => new ArrayBuffer(4) } as unknown as File
}

afterEach(() => vi.unstubAllGlobals())

describe('useInputFiles', () => {
  it('包含十三个固定文件名(含核心回款源/TOP1000/产品分类/倚天工时域)', () => {
    expect(INPUT_FILE_NAMES).toEqual([
      '组织架构.xlsx', 'A.xlsx', 'delivery_analysis.csv', 'delivery_analysis.xlsx',
      'payment_records.csv', 'profit_loss_direct.csv', 'profit_loss_bridge.csv', 'budget_data.csv',
      'collection_stages.csv', 'TOP1000.xlsx', '产品分类.xlsx', '工时.xlsx', 'holidays.csv',
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

describe('上传白名单与后端 config.INPUT_UPLOAD_NAMES 一致(结构守卫)', () => {
  // 本仓有两份并行的上传白名单:后端 config.INPUT_UPLOAD_NAMES 与前端 INPUT_FILE_NAMES。
  // 二者漂移的表现是「后端放行、前端静默丢弃」——upload() 里 includes 不命中直接 continue,
  // 页面上传毫无反馈。V4.5.4 加 产品分类.xlsx 时就漏了前端这份(计划本身没分配这个改动)。
  // 以 config.py 为单一来源做守卫,今后后端加文件、前端漏加会立刻变红。
  it('两份清单集合相等', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../../../config.py'), 'utf-8')

    // 先取 INPUT_UPLOAD_NAMES 的赋值块,再把其中的常量名解析成字面量值
    const block = src.match(/INPUT_UPLOAD_NAMES\s*=\s*\[([\s\S]*?)\]/)
    expect(block, 'config.py 未找到 INPUT_UPLOAD_NAMES').not.toBeNull()
    const constNames = (block as RegExpMatchArray)[1].match(/[A-Z_][A-Z0-9_]*/g) ?? []
    // 自证断言:解析失配会得到空数组 → 下面的 every 空跑恒真。钉住规模。
    expect(constNames.length, 'INPUT_UPLOAD_NAMES 解析失配').toBeGreaterThan(10)

    const backend = constNames.map((n) => {
      const m = src.match(new RegExp(String.raw`^${n}\s*=\s*"([^"]+)"`, 'm'))
      expect(m, `config.py 未找到常量 ${n} 的字面量`).not.toBeNull()
      return (m as RegExpMatchArray)[1]
    })
    expect(backend.length, '常量字面量解析失配').toBeGreaterThan(10)
    expect([...backend].sort()).toEqual([...INPUT_FILE_NAMES].sort())
  })
})
