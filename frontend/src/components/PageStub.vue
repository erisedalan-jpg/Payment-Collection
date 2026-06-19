<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div class="page-stub">
    <h2>{{ route.meta.title || route.name }}</h2>
    <p v-if="route.params.tab">页签：{{ route.params.tab }} ／ 档位：{{ route.params.tier }}</p>
    <p class="hint">（此页面将在后续里程碑实现）</p>
  </div>
</template>

<style scoped>
.page-stub { padding: var(--sp-5); }
.hint { color: var(--mut); font-size: var(--fs-2); }
</style>
