<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import FilterBar from './FilterBar.vue'
import ProjectDetailDrawer from '@/components/ProjectDetailDrawer.vue'
import { useAuthStore } from '@/stores/auth'
import { KEEPALIVE_COMPONENTS, viewKey } from '@/lib/viewReturn'
const route = useRoute()
const auth = useAuthStore()
const fullscreen = computed(() => !!route.meta?.fullscreen)
const showFilter = computed(() => !route.meta?.hideFilter)
// 账号护栏：换号即换 keep-alive key → 缓存重建；登出经全屏页已卸载 v-else，此为防御纵深
const cacheKey = computed(() => auth.user?.account ?? 'anon')
const includeList = KEEPALIVE_COMPONENTS as unknown as string[]
</script>

<template>
  <router-view v-if="fullscreen" />
  <div v-else class="app-layout">
    <AppHeader />
    <div class="app-body">
      <AppSidebar />
      <main class="app-main">
        <FilterBar v-if="showFilter" />
        <router-view v-slot="{ Component, route: r }">
          <!-- max=2:菜单进入 bump token 后旧实例=永不可复用死缓存;返回判定仅单一 armed 槽,
               最多只需最近 1 个缓存(+1 余量)。实测 max=10 时死实例囤 205MB 堆/13万游离节点。 -->
          <keep-alive :include="includeList" :max="2" :key="cacheKey">
            <component :is="Component" :key="viewKey(r.name)" />
          </keep-alive>
        </router-view>
      </main>
    </div>
    <ProjectDetailDrawer />
  </div>
</template>

<style scoped>
.app-layout { display: flex; flex-direction: column; height: 100vh; }
.app-body { display: flex; flex: 1; min-height: 0; }
.app-main { flex: 1; overflow: auto; background: var(--bg); }
</style>
