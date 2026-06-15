import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FollowupRecords from './FollowupRecords.vue'

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/followupApi', () => ({
  followupApi: {
    types: vi.fn().mockResolvedValue({ 跟进类型: ['邮件推动', '电话沟通'], 跟进状态: ['跟进中', '已解决'] }),
    list: vi.fn().mockResolvedValue({
      records: [
        { 记录编号: 'FU-2', 跟进时间: '2026-06-02 10:00', 跟进人: '李', 跟进类型: '电话沟通', 跟进内容: '二次催款', 跟进状态: '跟进中' },
        { 记录编号: 'FU-1', 跟进时间: '2026-06-01 10:00', 跟进人: '张', 跟进类型: '邮件推动', 跟进内容: '首次催款', 跟进状态: '跟进中' },
      ],
      total: 2,
    }),
    add: vi.fn().mockResolvedValue({ 记录编号: 'FU-3', message: '跟进记录已保存（仅本地保存）' }),
    update: vi.fn().mockResolvedValue({ 记录编号: 'FU-1', message: '跟进记录已更新（仅本地保存）' }),
    remove: vi.fn().mockResolvedValue({ message: '已删除（仅本地）' }),
  },
}))

import { followupApi } from '@/lib/followupApi'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

function mountRecords() {
  return mount(FollowupRecords, { props: { projectId: 'P1', projectName: '甲项目' } })
}

describe('FollowupRecords', () => {
  it('挂载加载类型与记录，最新条展示详情', async () => {
    const w = mountRecords()
    await flushPromises()
    expect(followupApi.list).toHaveBeenCalledWith('P1', 20)
    expect(w.text()).toContain('二次催款')
    expect(w.text()).toContain('跟进记录')
  })
  it('点击添加显示表单', async () => {
    const w = mountRecords()
    await flushPromises()
    expect(w.findComponent({ name: 'FollowupRecordForm' }).exists()).toBe(false)
    await w.find('.fr-addbtn').trigger('click')
    expect(w.findComponent({ name: 'FollowupRecordForm' }).exists()).toBe(true)
  })
  it('表单提交调用 add 并重载', async () => {
    const w = mountRecords()
    await flushPromises()
    await w.find('.fr-addbtn').trigger('click')
    ;(w.vm as any).onSubmit({ 项目编号: 'P1', 项目名称: '甲项目', 跟进人: '王', 跟进类型: '邮件推动', 跟进内容: '催', 跟进状态: '跟进中' })
    await flushPromises()
    expect(followupApi.add).toHaveBeenCalled()
    expect(followupApi.list).toHaveBeenCalledTimes(2)
  })
  it('删除走 confirm + remove', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const w = mountRecords()
    await flushPromises()
    await (w.vm as any).onDelete({ 记录编号: 'FU-2' })
    await flushPromises()
    expect(followupApi.remove).toHaveBeenCalledWith('FU-2')
  })
})
