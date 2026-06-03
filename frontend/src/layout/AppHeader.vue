<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'

const APP_VERSION = 'V6.0.0' // 单一来源；发版时更新

const store = useDataStore()
const updateTime = computed(() => store.data?.meta.lastUpdate ?? '-')

async function stopServer() {
  if (!confirm('确认停止本地服务？停止后页面将无法继续使用。')) return
  try {
    await fetch('/api/stop')
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
      <span class="sync-dot" /> 数据已同步
      <span class="date-badge">{{ updateTime }}</span>
      <button data-test="stop-server" class="stop-btn" title="停止服务" @click="stopServer">■</button>
    </div>
  </header>
</template>

<style scoped>
.app-header { display: flex; justify-content: space-between; align-items: center;
  height: 52px; padding: 0 18px; border-bottom: 1px solid #e2e8f0; background: #fff; }
.brand { display: flex; align-items: center; gap: 10px; }
.title { font-weight: 700; color: #0f172a; }
.version { font-size: 12px; color: #94a3b8; }
.meta { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #475569; }
.sync-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; display: inline-block; }
.date-badge { padding: 2px 8px; background: #f1f5f9; border-radius: 6px; font-size: 12px; }
.stop-btn { width: 28px; height: 28px; border: 1px solid #e2e8f0; border-radius: 6px;
  background: none; color: #ef4444; cursor: pointer; }
.stop-btn:hover { border-color: #ef4444; background: #fef2f2; }
</style>
