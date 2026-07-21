import { describe, it, expect } from 'vitest'
import { projectItems } from './items'
import type { Project } from '@/types/analysis'

const p = (id: string, over: Partial<Project> = {}): Project => ({
  projectId: id, projectName: 'N' + id, projectManager: 'M', orgL4: 'L4',
  ...(over as object),
} as Project)

describe('projectItems', () => {
  it('无关注原因的项目不产出事项', () => {
    expect(projectItems([p('A')], {}, ['回款延期'])).toEqual([])
  })

  it('orgL4 缺失 → 数据异常;勾选了才产出', () => {
    const anomalous = [p('A', { orgL4: '' })]
    expect(projectItems(anomalous, {}, ['数据异常'])).toEqual([
      { kind: 'project', projectId: 'A', reasons: ['数据异常'] },
    ])
    // 未勾选「数据异常」→ 不产出
    expect(projectItems(anomalous, {}, ['回款延期'])).toEqual([])
  })

  it('allowedReasons 为空 → 全部过滤掉', () => {
    expect(projectItems([p('A', { orgL4: '' })], {}, [])).toEqual([])
  })

  it('同一项目多原因合并为一条事项', () => {
    const items = projectItems([p('A', { orgL4: '' })], {}, ['数据异常', '回款延期'])
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('project')
  })
})

// M-6:「与后端 REASON_WHITELIST 逐字一致」这条断言必须真的读后端源码比对(见
// ./reasonWhitelistSync.test.ts),不能在 TS 侧把同一份字面量再抄一遍 —— 那样改后端不改
// 这里照样绿,防不住跨语言两份副本漂移。该用例需要 node:fs,与本文件其余纯函数测试
// 分文件放置(本文件走全局 jsdom 环境,sync 检查走 node 环境,避免共享 setupFiles 冲突)。
