<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { PROJECT_LINKS, ANALYSIS_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'

const ui = useUiStore()
const auth = useAuthStore()
const projectLinks = computed(() => PROJECT_LINKS.filter((l) => auth.canAccess(l.key)))
const analysisLinks = computed(() => ANALYSIS_LINKS.filter((l) => auth.canAccess(l.key)))
const paymentLinks = computed(() => PAYMENT_LINKS.filter((l) => auth.canAccess(l.key)))
const toolLinks = computed(() => TOOL_LINKS.filter((l) => auth.canAccess(l.key)))
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <nav class="sidebar-nav">
      <div v-if="projectLinks.length" class="section">
        <div class="section-label">项目</div>
        <RouterLink v-for="link in projectLinks" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div v-if="analysisLinks.length" class="section">
        <div class="section-label">项目分析</div>
        <RouterLink v-for="link in analysisLinks" :key="link.to" :to="link.to"
          class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div v-if="paymentLinks.length" class="section">
        <div class="section-label">回款<span class="section-tag">重点子域</span></div>
        <RouterLink v-for="link in paymentLinks" :key="link.to" :to="link.to"
          class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div v-if="toolLinks.length" class="section">
        <div class="section-label">工具</div>
        <RouterLink v-for="link in toolLinks" :key="link.to" :to="link.to"
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
.sidebar-nav { flex: 1; overflow-y: auto; padding: var(--sp-3) 0; }
.section { margin-bottom: var(--sp-4); }
.section-label { font-size: var(--fs-1); color: var(--mut); padding: var(--sp-1) var(--sp-4); font-weight: 600; }
.group-label { font-size: var(--fs-1); color: var(--sub); padding: var(--sp-2) var(--sp-4) 2px; }
.nav-item, .nav-sub { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-2); color: var(--txt); text-decoration: none; }
.nav-sub { padding-left: 30px; font-size: var(--fs-1); }
.nav-item:hover, .nav-sub:hover { background: var(--card2); }
.nav-item.active, .nav-sub.active { background: var(--bg); color: var(--accent); font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.sidebar-toggle { width: 16px; border: none; border-right: 1px solid var(--line);
  background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: 0; }
.sidebar-toggle:hover { background: var(--bg); color: var(--accent); }
.section-tag { margin-left: var(--sp-2); font-weight: 400; font-size: var(--fs-1); color: var(--mut); }
.nav-sub2 { padding-left: 42px; }
</style>
