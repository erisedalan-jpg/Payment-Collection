<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import FilterBar from './FilterBar.vue'
import ProjectDetailDrawer from '@/components/ProjectDetailDrawer.vue'
const route = useRoute()
const showFilter = computed(() => !route.meta?.hideFilter)
</script>

<template>
  <div class="app-layout">
    <AppHeader />
    <div class="app-body">
      <AppSidebar />
      <main class="app-main">
        <FilterBar v-if="showFilter" />
        <router-view />
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
