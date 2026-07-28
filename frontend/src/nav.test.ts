import { describe, it, expect } from 'vitest'
import { PAGE_KEYS } from '@/lib/pageAccess'
import { ALL_PAGE_LINKS, NAV_SECTIONS, TAB_GROUPS, sectionPageLinks, isTabEntry } from './nav'

describe('nav 契约', () => {
  it('ALL_PAGE_LINKS 恰好覆盖全部 32 个 PageKey,不多不少', () => {
    // 承重点 ①:PAGE_OPTIONS/firstAllowedPath/AdminView 两处全部从它派生。
    // 少一个 → 该页无法授权、无法设数据范围,且不报错。
    expect([...ALL_PAGE_LINKS.map((l) => l.key)].sort()).toEqual([...PAGE_KEYS].sort())
  })

  it('ALL_PAGE_LINKS 无重复 key', () => {
    const keys = ALL_PAGE_LINKS.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('NAV_SECTIONS 一级项 23 个(含 3 个 tab 容器入口);+ 模板内硬编码的账号管理 = 侧栏 24 项', () => {
    // 项目5 + 回款4 + 商机2 + 工时3 + 重点跟进5 + 工具4 = 23;
    // 「系统管理 → 账号管理」不在 NAV_SECTIONS 里(它按 isSuper 而非 pageKey 控制,模板内单列)。
    expect(NAV_SECTIONS.reduce((n, s) => n + s.items.length, 0)).toBe(23)
    expect(NAV_SECTIONS.map((s) => s.id)).toEqual(['project', 'payment', 'opportunity', 'yitian', 'keyfollowup', 'tools'])
  })

  it('三个 tab 组共 12 页,且每组至少 2 项(单项无 tab 意义)', () => {
    const groups = Object.values(TAB_GROUPS)
    expect(groups.flat().length).toBe(12)
    for (const g of groups) expect(g.length).toBeGreaterThanOrEqual(2)
  })

  it('容器入口不带 pageKey —— 保证 ALL_PAGE_LINKS 天然无重复,无需去重逻辑', () => {
    const entries = NAV_SECTIONS.flatMap((s) => s.items).filter(isTabEntry)
    expect(entries.length).toBe(3)
    for (const e of entries) expect('key' in e).toBe(false)
  })

  it('sectionPageLinks 展开容器入口:项目组 = 4 个一级页 + 4 个分析 tab 页', () => {
    const proj = NAV_SECTIONS.find((s) => s.id === 'project')!
    expect(sectionPageLinks(proj).map((l) => l.key)).toEqual([
      'overview', 'projects', 'projects-closed', 'activity',
      'insight', 'insight-milestone', 'insight-costdetail', 'insight-risk',
    ])
  })

  it('回款分析两 tab 指向回款域新路径(不再是 /insight/*)', () => {
    expect(TAB_GROUPS['payment-analysis'].map((t) => t.to)).toEqual(['/payment/board', '/payment/calendar'])
  })
})
