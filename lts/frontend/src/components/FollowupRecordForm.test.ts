import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FollowupRecordForm from './FollowupRecordForm.vue'

function mountForm(props = {}) {
  return mount(FollowupRecordForm, {
    props: {
      projectId: 'P1',
      projectName: '甲项目',
      types: ['邮件推动', '电话沟通'],
      statuses: ['跟进中', '已解决'],
      ...props,
    },
  })
}

describe('FollowupRecordForm', () => {
  it('新增模式：只读三字段 + 默认标题', () => {
    const w = mountForm()
    expect(w.text()).toContain('添加跟进记录')
    expect(w.text()).toContain('保存后自动生成')
    const ro = w.findAll('input[readonly]')
    expect(ro).toHaveLength(3)
  })
  it('校验：缺跟进人/内容不 emit submit', async () => {
    const w = mountForm()
    await w.find('.frf-btn.primary').trigger('click')
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toContain('请填写跟进人')
  })
  it('填写后 emit submit 含表单数据', async () => {
    const w = mountForm()
    await w.find('input[data-f="person"]').setValue('张三')
    await w.find('textarea').setValue('电话催款')
    await w.find('.frf-btn.primary').trigger('click')
    const ev = w.emitted('submit')
    expect(ev).toBeTruthy()
    expect((ev![0][0] as any)['跟进人']).toBe('张三')
    expect((ev![0][0] as any)['项目编号']).toBe('P1')
  })
  it('编辑模式：标题含记录编号，预填字段，submit 带记录编号', async () => {
    const w = mountForm({ editRecord: { 记录编号: 'FU-9', 跟进人: '李四', 跟进内容: '已回款', 跟进类型: '电话沟通', 跟进状态: '已解决' } })
    expect(w.text()).toContain('编辑跟进记录 (FU-9)')
    await w.find('.frf-btn.primary').trigger('click')
    const ev = w.emitted('submit')
    expect((ev![0][0] as any)['记录编号']).toBe('FU-9')
  })
})
