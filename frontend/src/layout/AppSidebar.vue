<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { NAV_SECTIONS, TAB_GROUPS, isTabEntry, type NavItem, type NavLink } from '@/nav'

const ui = useUiStore()
const auth = useAuthStore()
const route = useRoute()

/** 一级项 → 可渲染的链接;不可访问则 null(整项不渲染)。
 *  tab 容器入口的 to 按权限动态求值 —— 指向该组第一个可见 tab,而非硬编码首项。 */
function resolveItem(item: NavItem): NavLink | null {
  if (!isTabEntry(item)) return auth.canAccess(item.key) ? item : null
  const hit = TAB_GROUPS[item.group].find((t) => auth.canAccess(t.key))
  return hit ? { label: item.label, to: hit.to, key: hit.key } : null
}

/** 按权限过滤后的分组;组内无任何可见项则整组不渲染。 */
const sections = computed(() =>
  NAV_SECTIONS
    .map((s) => ({ id: s.id, label: s.label, links: s.items.map(resolveItem).filter((l): l is NavLink => l !== null) }))
    .filter((s) => s.links.length > 0))

/** 当前路径所属 section —— 从 nav 常量反查,取代 V4.4.7 前的 8 行 if-else 特判。
 *  精确匹配优先:/projects/key 必须归重点跟进,不能被 /projects 的前缀规则抢走。
 *  前缀匹配按 to 长度降序,长路径优先。都不中则归 project(项目详情等 /project/:id 走此兜底)。 */
const activeSectionKey = computed(() => {
  const p = route.path
  if (p.startsWith('/admin')) return 'admin'
  const entries = NAV_SECTIONS.flatMap((s) =>
    s.items.flatMap((i) => (isTabEntry(i) ? TAB_GROUPS[i.group].map((t) => t.to) : [i.to]))
      .map((to) => ({ section: s.id, to })))
  const exact = entries.find((e) => e.to === p)
  if (exact) return exact.section
  const pref = [...entries].sort((a, b) => b.to.length - a.to.length)
    .find((e) => e.to !== '/' && p.startsWith(e.to + '/'))
  return pref ? pref.section : 'project'
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
      <div v-for="s in sections" :key="s.id" class="section" :class="{ collapsed: !expanded(s.id) }">
        <button type="button" class="section-label" @click="onToggle(s.id)">
          <span class="section-caret">{{ expanded(s.id) ? '▾' : '▸' }}</span>{{ s.label }}
        </button>
        <div v-show="expanded(s.id)" class="section-links">
          <RouterLink v-for="link in s.links" :key="link.to" :to="link.to"
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
/* 折叠/展开是"展开"类动效(整栏宽度伸缩,不是状态反馈),按规范取 --dur-2 200ms;
   原 .15s 既不在 120/200 两档上、也没给缓动(退化成 CSS 默认 ease),一并归到 --ease。 */
.sidebar { width: 220px; border-right: 1px solid var(--line); background: var(--card);
  display: flex; flex-direction: column; transition: width var(--dur-2) var(--ease); overflow: hidden; }
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
   七个分区(项目/回款/商机/倚天工时/重点跟进/工具/系统管理)子项对齐一致。 */
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
.nav-sub2 { padding-left: 42px; }
</style>
