<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { PROJECT_LINKS, ANALYSIS_LINKS, KEY_FOLLOWUP_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'

const ui = useUiStore()
const auth = useAuthStore()
const route = useRoute()
const projectLinks = computed(() => PROJECT_LINKS.filter((l) => auth.canAccess(l.key)))
const analysisLinks = computed(() => ANALYSIS_LINKS.filter((l) => auth.canAccess(l.key)))
const keyFollowupLinks = computed(() => KEY_FOLLOWUP_LINKS.filter((l) => auth.canAccess(l.key)))
const paymentLinks = computed(() => PAYMENT_LINKS.filter((l) => auth.canAccess(l.key)))
const toolLinks = computed(() => TOOL_LINKS.filter((l) => auth.canAccess(l.key)))

const activeSectionKey = computed(() => {
  const p = route.path
  if (p.startsWith('/projects/key')) return 'keyfollowup'
  if (p.startsWith('/opportunities/key')) return 'keyfollowup'
  if (p.startsWith('/opportunities/board')) return 'analysis'
  if (p.startsWith('/insight')) return 'analysis'
  if (p.startsWith('/payment')) return 'payment'
  if (p.startsWith('/data') || p.startsWith('/governance') || p.startsWith('/about')) return 'tools'
  if (p.startsWith('/admin')) return 'admin'
  return 'project'
})
function expanded(key: string): boolean {
  const v = ui.sectionExpanded[key]
  return v === undefined ? key === activeSectionKey.value : v
}
function onToggle(key: string) {
  ui.setSection(key, !expanded(key))
}
</script>

<template>
  <aside class="sidebar u-hairline-r" :class="{ collapsed: ui.sidebarCollapsed }">
    <nav class="sidebar-nav">
      <div v-if="projectLinks.length" class="section" :class="{ collapsed: !expanded('project') }">
        <button type="button" class="section-label" @click="onToggle('project')">
          <span class="section-caret">{{ expanded('project') ? '▾' : '▸' }}</span>项目
        </button>
        <div v-show="expanded('project')" class="section-links">
          <RouterLink v-for="link in projectLinks" :key="link.to" :to="link.to"
            class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="analysisLinks.length" class="section" :class="{ collapsed: !expanded('analysis') }">
        <button type="button" class="section-label" @click="onToggle('analysis')">
          <span class="section-caret">{{ expanded('analysis') ? '▾' : '▸' }}</span>项目分析
        </button>
        <div v-show="expanded('analysis')" class="section-links">
          <RouterLink v-for="link in analysisLinks" :key="link.to" :to="link.to"
            class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="keyFollowupLinks.length" class="section" :class="{ collapsed: !expanded('keyfollowup') }">
        <button type="button" class="section-label" @click="onToggle('keyfollowup')">
          <span class="section-caret">{{ expanded('keyfollowup') ? '▾' : '▸' }}</span>重点跟进
        </button>
        <div v-show="expanded('keyfollowup')" class="section-links">
          <RouterLink v-for="link in keyFollowupLinks" :key="link.to" :to="link.to"
            class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="paymentLinks.length" class="section" :class="{ collapsed: !expanded('payment') }">
        <button type="button" class="section-label" @click="onToggle('payment')">
          <span class="section-caret">{{ expanded('payment') ? '▾' : '▸' }}</span>回款<span class="section-tag">重点子域</span>
        </button>
        <div v-show="expanded('payment')" class="section-links">
          <RouterLink v-for="link in paymentLinks" :key="link.to" :to="link.to"
            class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="toolLinks.length" class="section" :class="{ collapsed: !expanded('tools') }">
        <button type="button" class="section-label" @click="onToggle('tools')">
          <span class="section-caret">{{ expanded('tools') ? '▾' : '▸' }}</span>工具
        </button>
        <div v-show="expanded('tools')" class="section-links">
          <RouterLink v-for="link in toolLinks" :key="link.to" :to="link.to"
            class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>

      <div v-if="auth.isSuper" class="section" :class="{ collapsed: !expanded('admin') }">
        <button type="button" class="section-label" @click="onToggle('admin')">
          <span class="section-caret">{{ expanded('admin') ? '▾' : '▸' }}</span>系统管理
        </button>
        <div v-show="expanded('admin')" class="section-links">
          <RouterLink to="/admin" class="nav-sub" active-class="active">账号管理</RouterLink>
        </div>
      </div>
    </nav>
  </aside>
  <button data-test="sidebar-toggle" class="sidebar-toggle" title="折叠/展开菜单"
    @click="ui.toggleSidebar()">{{ ui.sidebarCollapsed ? '››' : '‹‹' }}</button>
</template>

<style scoped>
.sidebar { width: 220px; border-right: 1px solid var(--line); background: var(--card);
  display: flex; flex-direction: column; transition: width .15s; overflow: hidden; }
.sidebar.collapsed { width: 0; border-right: none; }
.sidebar-nav { flex: 1; overflow-y: auto; padding: var(--sp-3) 0; }
.section { margin-bottom: var(--sp-4); }
.section-label { display: flex; align-items: center; width: 100%; background: none; border: 0;
  font-family: inherit; font-size: var(--fs-1); color: var(--mut); padding: var(--sp-1) var(--sp-4);
  font-weight: 600; text-align: left; cursor: pointer; }
.section-label:hover { background: var(--hover-tint); }
.section-caret { display: inline-block; width: 12px; margin-right: var(--sp-2); color: var(--mut); font-size: var(--fs-1); }
.group-label { font-size: var(--fs-1); color: var(--sub); padding: var(--sp-2) var(--sp-4) 2px; }
/* 全部分区子项统一为二级缩进样式(.nav-sub):字号 --fs-1、左缩进 30px,
   六个分区(项目/项目分析/重点跟进/回款/工具/系统管理)子项对齐一致。 */
.nav-sub { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4) var(--sp-2) 30px;
  font-size: var(--fs-1); color: var(--txt); text-decoration: none;
  transition: background-color var(--dur-1) var(--ease), color var(--dur-1) var(--ease); }
.nav-sub:hover { background: var(--hover-tint); }
/* 选中=accent 淡底 + 2px 当前项指示条(功能性,inset 阴影不占位、不偏移) */
.nav-sub.active { background: var(--selected-tint); color: var(--accent); font-weight: 600;
  box-shadow: inset 2px 0 0 var(--accent); }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.sidebar-toggle { width: 16px; border: none; border-right: 1px solid var(--line);
  background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: 0; }
.sidebar-toggle:hover { background: var(--bg); color: var(--accent); }
.section-tag { margin-left: var(--sp-2); font-weight: 400; font-size: var(--fs-1); color: var(--mut); }
.nav-sub2 { padding-left: 42px; }
</style>
