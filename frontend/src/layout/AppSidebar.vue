<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import { PROJECT_LINKS, PAYMENT_LINKS, ANALYSIS_TAB_LINKS, TOOL_LINKS } from '@/nav'

const ui = useUiStore()
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <nav class="sidebar-nav">
      <div class="section">
        <div class="section-label">项目</div>
        <RouterLink v-for="link in PROJECT_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div class="section">
        <div class="section-label">回款<span class="section-tag">重点子域</span></div>
        <RouterLink v-for="link in PAYMENT_LINKS" :key="link.to" :to="link.to"
          class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        <div class="group-label">回款分析</div>
        <RouterLink v-for="link in ANALYSIS_TAB_LINKS" :key="link.to" :to="link.to"
          class="nav-sub nav-sub2" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div class="section">
        <div class="section-label">工具</div>
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
.section-label { font-size: var(--fs-1); color: var(--mut); padding: 4px 18px; font-weight: 600; }
.group-label { font-size: var(--fs-1); color: var(--sub); padding: 6px 18px 2px; }
.nav-item, .nav-sub { display: flex; align-items: center; gap: 8px; padding: 7px 18px;
  font-size: var(--fs-2); color: var(--txt); text-decoration: none; }
.nav-sub { padding-left: 30px; font-size: var(--fs-1); }
.nav-item:hover, .nav-sub:hover { background: var(--card2); }
.nav-item.active, .nav-sub.active { background: var(--bg); color: var(--accent); font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.sidebar-toggle { width: 16px; border: none; border-right: 1px solid var(--line);
  background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: 0; }
.sidebar-toggle:hover { background: var(--bg); color: var(--accent); }
.section-tag { margin-left: 6px; font-weight: 400; font-size: var(--fs-1); color: var(--mut); }
.nav-sub2 { padding-left: 42px; }
</style>
