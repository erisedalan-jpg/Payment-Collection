import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElMessage } from 'element-plus'
import { notifyArchived } from './followupArchive'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn() },
}))

beforeEach(() => { vi.clearAllMocks() })

describe('notifyArchived', () => {
  it('有范围外记录被保留时告警,并把条数说出来', () => {
    notifyArchived(3)
    expect(ElMessage.warning).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).not.toHaveBeenCalled()
    const msg = vi.mocked(ElMessage.warning).mock.calls[0][0] as string
    expect(msg).toContain('3 条')
    expect(msg).toContain('保留')      // 关键语义:没被清掉,不是「已归档 3 条」
  })

  it('没有范围外记录时是普通成功提示', () => {
    notifyArchived(0)
    expect(ElMessage.success).toHaveBeenCalledWith('已归档')
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })
})
