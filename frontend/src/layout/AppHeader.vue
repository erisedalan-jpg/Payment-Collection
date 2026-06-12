<script setup lang="ts">
import { useDataStore } from '@/stores/data'
import { api } from '@/api/client'
import { APP_VERSION } from '@/version'
import DisplaySettings from '@/components/DisplaySettings.vue'

const store = useDataStore()

async function stopServer() {
  if (!confirm('确认停止本地服务？停止后页面将无法继续使用。')) return
  try {
    await api.get('/api/stop')
  } catch {
    // 服务停止时连接会中断，忽略错误
  }
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <span class="title">项目回款跟踪与管控平台</span>
      <span class="version">{{ APP_VERSION }}</span>
    </div>
    <div class="meta">
      <template v-if="store.data">
        <span class="sync-dot" /> 数据已同步
        <span class="date-badge">{{ store.data.meta.lastUpdate }}</span>
      </template>
      <span v-else class="no-data">未加载数据</span>
      <DisplaySettings />
      <button data-test="stop-server" class="stop-btn" title="停止服务" @click="stopServer">■</button>
    </div>
  </header>
</template>

<style scoped>
.app-header { display: flex; justify-content: space-between; align-items: center;
  height: 52px; padding: 0 var(--sp-4); border-bottom: 1px solid var(--line); background: var(--card); }
.brand { display: flex; align-items: center; gap: var(--sp-3); }
.title { font-weight: 700; color: var(--txt); }
.version { font-size: var(--fs-1); color: var(--mut); }
.meta { display: flex; align-items: center; gap: var(--sp-3); font-size: var(--fs-2); color: var(--sub); }
.sync-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); display: inline-block; }
.date-badge { padding: 2px var(--sp-2); background: var(--bg); border-radius: var(--r-sm); font-size: var(--fs-1); }
.stop-btn { width: 28px; height: 28px; border: 1px solid var(--line); border-radius: var(--r-sm);
  background: none; color: var(--danger); cursor: pointer; }
.stop-btn:hover { border-color: var(--danger); background: var(--card2); }
.no-data { color: var(--mut); font-size: var(--fs-1); }
</style>
