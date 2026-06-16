import { describe, it, expect } from 'vitest'
import { parseManualSheets } from './manualImport'

describe('parseManualSheets', () => {
  it('从 workbook 抽取 项目标签/跟进记录 两 sheet 矩阵，忽略其它', () => {
    const wb = {
      SheetNames: ['项目标签', '跟进记录', '回款节点'],
      sheetRows: (n: string) => ({
        项目标签: [['项目编号', '项目名称', '标签'], ['P1', '甲', 'BH项目']],
        跟进记录: [['记录编号'], ['FU-1']],
        回款节点: [['x'], ['y']],
      }[n]),
    }
    const sheets = parseManualSheets(wb as any)
    expect(Object.keys(sheets).sort()).toEqual(['跟进记录', '项目标签'])
    expect(sheets['项目标签'][1]).toEqual(['P1', '甲', 'BH项目'])
    expect(sheets['回款节点' as any]).toBeUndefined()
  })
})
