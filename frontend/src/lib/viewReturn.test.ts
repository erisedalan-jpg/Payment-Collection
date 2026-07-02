import { beforeEach, describe, expect, it } from 'vitest'
import { __resetViewReturn, isKeepAliveRoute, trackNavigation, viewKey } from './viewReturn'

beforeEach(() => __resetViewReturn())

describe('viewReturn', () => {
  it('列表→详情→返回同列表：token 不变（保持缓存）', () => {
    trackNavigation('project-detail', 'projects') // 下钻
    const before = viewKey('projects')
    trackNavigation('projects', 'project-detail') // 返回
    expect(viewKey('projects')).toBe(before)
  })

  it('从菜单（非详情来源）进入列表：token +1（触发重置）', () => {
    const k0 = viewKey('projects')
    trackNavigation('projects', 'overview')
    expect(viewKey('projects')).not.toBe(k0)
  })

  it('跨列表：详情→其它列表菜单，目标列表重置', () => {
    trackNavigation('project-detail', 'projects') // 从 projects 下钻
    const k0 = viewKey('insight-costdetail')
    trackNavigation('insight-costdetail', 'project-detail') // 从详情点"成本分析"
    expect(viewKey('insight-costdetail')).not.toBe(k0)
  })

  it('中间经过另一 keep-alive 列表后 armed 被清，回原列表不误判为返回', () => {
    trackNavigation('project-detail', 'projects') // armed = projects
    trackNavigation('insight-costdetail', 'project-detail') // 到达 costdetail → armed 清
    const k0 = viewKey('projects')
    trackNavigation('projects', 'insight-costdetail') // from 非详情
    expect(viewKey('projects')).not.toBe(k0)
  })

  it('已关闭项目：closed → 详情 → 返回，保持', () => {
    trackNavigation('closed-project-detail', 'closed-projects')
    const before = viewKey('closed-projects')
    trackNavigation('closed-projects', 'closed-project-detail')
    expect(viewKey('closed-projects')).toBe(before)
  })

  it('非 keep-alive 路由：viewKey 返回原 name，不带 token', () => {
    expect(viewKey('project-detail')).toBe('project-detail')
    expect(viewKey('overview')).toBe('overview')
  })

  it('isKeepAliveRoute 边界', () => {
    expect(isKeepAliveRoute('projects')).toBe(true)
    expect(isKeepAliveRoute('overview')).toBe(false)
    expect(isKeepAliveRoute(undefined)).toBe(false)
    expect(isKeepAliveRoute(123)).toBe(false)
  })
})
