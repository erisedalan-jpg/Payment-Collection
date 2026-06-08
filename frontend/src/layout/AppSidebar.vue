<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import { OVERVIEW_LINKS, ANALYSIS_LINKS, ANALYSIS_TAB_LINKS, TOOL_LINKS } from '@/nav'

const ui = useUiStore()
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <nav class="sidebar-nav">
      <div class="section">
        <div class="section-label">概览</div>
        <RouterLink v-for="link in OVERVIEW_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div class="section">
        <div class="section-label">分析</div>
        <RouterLink v-for="link in ANALYSIS_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div class="section">
        <div class="section-label">业务分析</div>
        <RouterLink v-for="link in ANALYSIS_TAB_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div class="section">
        <div class="section-label">管理工具</div>
        <RouterLink v-for="link in TOOL_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
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
.sidebar-nav { flex: 1; overflow-y: auto; padding: 12px 0; }
.section { margin-bottom: 14px; }
.section-label { font-size: 11px; color: var(--mut); padding: 4px 18px; font-weight: 600; }
.group-label { font-size: 12px; color: var(--sub); padding: 6px 18px 2px; }
.nav-item, .nav-sub { display: flex; align-items: center; gap: 8px; padding: 7px 18px;
  font-size: 13px; color: var(--txt); text-decoration: none; }
.nav-sub { padding-left: 30px; font-size: 12px; }
.nav-item:hover, .nav-sub:hover { background: var(--card2); }
.nav-item.active, .nav-sub.active { background: var(--bg); color: var(--accent); font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.sidebar-toggle { width: 16px; border: none; border-right: 1px solid var(--line);
  background: var(--card2); color: var(--sub); cursor: pointer; font-size: 11px; padding: 0; }
.sidebar-toggle:hover { background: var(--bg); color: var(--accent); }
</style>
