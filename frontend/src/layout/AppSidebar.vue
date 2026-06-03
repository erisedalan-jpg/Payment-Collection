<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import { OVERVIEW_LINKS, TOOL_LINKS, TIER_TABS, TIERS } from '@/nav'

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
        <div class="section-label">业务分析</div>
        <div v-for="t in TIER_TABS" :key="t.tab" class="group">
          <div class="group-label">{{ t.label }}</div>
          <RouterLink v-for="tier in TIERS" :key="tier.slug"
            :to="`/tier/${t.tab}/${tier.slug}`" class="nav-sub" active-class="active">
            <span class="dot" :style="{ background: tier.color }" />{{ tier.label }}
          </RouterLink>
        </div>
      </div>

      <div class="section">
        <div class="section-label">管理工具</div>
        <RouterLink v-for="link in TOOL_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>
    </nav>
    <button data-test="sidebar-toggle" class="toggle" title="折叠/展开菜单"
      @click="ui.toggleSidebar()">{{ ui.sidebarCollapsed ? '››' : '‹‹' }}</button>
  </aside>
</template>

<style scoped>
.sidebar { width: 220px; border-right: 1px solid #e2e8f0; background: #fff;
  display: flex; flex-direction: column; transition: width .15s; overflow: hidden; }
.sidebar.collapsed { width: 0; border-right: none; }
.sidebar-nav { flex: 1; overflow-y: auto; padding: 12px 0; }
.section { margin-bottom: 14px; }
.section-label { font-size: 11px; color: #94a3b8; padding: 4px 18px; font-weight: 600; }
.group-label { font-size: 12px; color: #64748b; padding: 6px 18px 2px; }
.nav-item, .nav-sub { display: flex; align-items: center; gap: 8px; padding: 7px 18px;
  font-size: 13px; color: #334155; text-decoration: none; }
.nav-sub { padding-left: 30px; font-size: 12px; }
.nav-item:hover, .nav-sub:hover { background: #f1f5f9; }
.nav-item.active, .nav-sub.active { background: #eef2ff; color: #4f46e5; font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.toggle { height: 32px; border: none; border-top: 1px solid #e2e8f0; background: #fff;
  color: #64748b; cursor: pointer; }
</style>
