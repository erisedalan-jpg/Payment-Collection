import { describe, expect, it } from 'vitest'
import { KEEPALIVE_COMPONENTS } from '@/lib/viewReturn'
import ProjectsView from './ProjectsView.vue'
import CostDetailView from './CostDetailView.vue'
import ClosedProjectsView from './ClosedProjectsView.vue'
import KeyProjectsView from './KeyProjectsView.vue'
import TempFollowupView from './TempFollowupView.vue'
import MilestoneView from './MilestoneView.vue'

const comps: Record<string, { name?: string }> = {
  ProjectsView, CostDetailView, ClosedProjectsView, KeyProjectsView, TempFollowupView, MilestoneView,
}

describe('目标视图组件 name 与 KEEPALIVE_COMPONENTS 一致', () => {
  it('每个目标组件都声明了与常量一致的 name', () => {
    for (const expected of KEEPALIVE_COMPONENTS) {
      expect(comps[expected]?.name).toBe(expected)
    }
  })
})
