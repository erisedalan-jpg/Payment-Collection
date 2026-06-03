<script setup lang="ts">
import { onMounted } from 'vue'
import { useDataStore } from '@/stores/data'

const store = useDataStore()
onMounted(() => {
  if (!store.data) store.load()
})
</script>

<template>
  <div class="home">
    <h1>项目回款跟踪与管控平台</h1>
    <p v-if="store.loading">加载中…</p>
    <p v-else-if="store.error" class="error">数据加载失败：{{ store.error }}</p>
    <div v-else-if="store.data">
      <p>数据更新时间：{{ store.data.meta.lastUpdate }}</p>
      <p>回款节点数：{{ store.data.rawNodes.length }}</p>
    </div>
    <p v-else>暂无数据，请先在数据管理中同步/导入。</p>
  </div>
</template>
