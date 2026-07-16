import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectTagsStore } from './projectTags'
import { useDataStore } from '@/stores/data'

vi.mock('@/lib/projectTagsApi', () => ({
  getTags: vi.fn(async () => ({ tags: [{ name: 'BH项目' }, { name: '框架合同' }], assignments: { A: ['BH项目'] } })),
  saveTags: vi.fn(async () => ({ success: true })),
}))
import { getTags, saveTags } from '@/lib/projectTagsApi'

describe('projectTags store', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('load 拉取标签库与挂载', async () => {
    const s = useProjectTagsStore()
    await s.load()
    expect(s.tags.map((t) => t.name)).toEqual(['BH项目', '框架合同'])
    expect(s.assignments.A).toEqual(['BH项目'])
    expect(s.activeTags.map((t) => t.name)).toEqual(['BH项目', '框架合同'])
  })

  it('addTag 去重；setProjectTags 设置；toggleTag 切换', async () => {
    const s = useProjectTagsStore(); await s.load()
    s.addTag('BH项目')
    s.addTag('退换货项目')
    expect(s.tags.map((t) => t.name)).toContain('退换货项目')
    s.setProjectTags('B', ['框架合同'])
    expect(s.assignments.B).toEqual(['框架合同'])
    s.toggleTag('B', '框架合同')
    expect(s.assignments.B ?? []).toEqual([])
  })

  it('renameTag 迁移挂载；disableTag 软停用', async () => {
    const s = useProjectTagsStore(); await s.load()
    s.renameTag('BH项目', 'BH重点')
    expect(s.tags.map((t) => t.name)).toContain('BH重点')
    expect(s.assignments.A).toEqual(['BH重点'])
    s.disableTag('框架合同', true)
    expect(s.activeTags.map((t) => t.name)).not.toContain('框架合同')
  })

  it('renameTag 改成已存在标签名 → 拒绝(防重复挂载)', async () => {
    const s = useProjectTagsStore(); await s.load()
    s.setProjectTags('A', ['BH项目', '框架合同'])
    s.renameTag('BH项目', '框架合同')          // 撞已存在名 → no-op
    expect(s.tags.map((t) => t.name)).toEqual(['BH项目', '框架合同'])
    expect(s.assignments.A).toEqual(['BH项目', '框架合同'])
  })

  it('save 调用 api 整存', async () => {
    const s = useProjectTagsStore(); await s.load()
    await s.save()
    expect(saveTags).toHaveBeenCalledWith({ tags: s.tags, assignments: s.assignments })
  })

  it('effectiveAssignments/tagsOf 合并 seed, manualTagsOf/seedTagsOf 分离', () => {
    const data = useDataStore(); data.$patch({ data: { tagSeed: { A: ['佳杰'] } } as any })
    const s = useProjectTagsStore()
    s.assignments = { A: ['BH项目'], B: ['框架合同'] }
    expect([...s.tagsOf('A')].sort()).toEqual(['BH项目', '佳杰'])
    expect(s.manualTagsOf('A')).toEqual(['BH项目'])
    expect(s.seedTagsOf('A')).toEqual(['佳杰'])
    expect([...s.effectiveAssignments.A].sort()).toEqual(['BH项目', '佳杰'])
    expect(s.effectiveAssignments.B).toEqual(['框架合同'])
    expect(s.tagsOf('B')).toEqual(['框架合同'])
  })

  it('seed 与手动同名去重(不重复)', () => {
    const data = useDataStore(); data.$patch({ data: { tagSeed: { A: ['佳杰'] } } as any })
    const s = useProjectTagsStore()
    s.assignments = { A: ['佳杰'] }
    expect(s.tagsOf('A')).toEqual(['佳杰'])
    expect(s.effectiveAssignments.A).toEqual(['佳杰'])
  })

  it('save 只写手动 assignments,不含 seed', async () => {
    const data = useDataStore(); data.$patch({ data: { tagSeed: { A: ['佳杰'] } } as any })
    const s = useProjectTagsStore()
    s.assignments = { A: ['BH项目'] }
    await s.save()
    expect(saveTags).toHaveBeenCalledWith({ tags: s.tags, assignments: { A: ['BH项目'] } })
  })
})
