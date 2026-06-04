import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useExcelImport } from './useExcelImport'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function fakeFile(name: string) {
  return { name } as any as File
}
const okParse = () => ({ SheetNames: ['项目回款节点（里程碑）清单'], sheetRows: () => [['h'], ['1']] })

describe('useExcelImport', () => {
  it('扩展名非法 → 错误', async () => {
    const imp = useExcelImport({})
    await imp.importFile(fakeFile('a.csv'))
    expect(imp.phase.value).toBe('error')
    expect(imp.message.value).toContain('xlsx')
  })
  it('缺必需 Sheet → 错误', async () => {
    const imp = useExcelImport({
      readFile: async () => new ArrayBuffer(0),
      parseWorkbook: () => ({ SheetNames: ['其他'], sheetRows: () => [] }),
    })
    await imp.importFile(fakeFile('a.xlsx'))
    expect(imp.phase.value).toBe('error')
    expect(imp.message.value).toContain('必需Sheet')
  })
  it('上传成功 + 轮询至 100 → 完成 + onDone', async () => {
    const onDone = vi.fn()
    const postFn = vi.fn().mockResolvedValue({ success: true })
    const statusFn = vi.fn().mockResolvedValue({ running: false, progress: 100, message: '完成' })
    const imp = useExcelImport({
      readFile: async () => new ArrayBuffer(0),
      parseWorkbook: okParse,
      postFn,
      statusFn,
      pollMs: 1000,
      onDone,
    })
    await imp.importFile(fakeFile('a.xlsx'))
    await flushPromises()
    expect(postFn).toHaveBeenCalled()
    expect(imp.phase.value).toBe('done')
    expect(onDone).toHaveBeenCalled()
  })
  it('上传 success=false → 错误', async () => {
    const imp = useExcelImport({
      readFile: async () => new ArrayBuffer(0),
      parseWorkbook: okParse,
      postFn: vi.fn().mockResolvedValue({ success: false, message: '同步进行中' }),
    })
    await imp.importFile(fakeFile('a.xlsx'))
    await flushPromises()
    expect(imp.phase.value).toBe('error')
    expect(imp.message.value).toContain('同步进行中')
  })
})
