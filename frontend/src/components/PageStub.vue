<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="page-stub">
    <h1 class="ps-title">{{ title }}</h1>
    <p class="ps-msg">建设中</p>
  </div>
</template>

<style scoped>
.page-stub { padding: var(--sp-5); }
.ps-title { font-size: var(--fs-5); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.ps-msg { font-size: var(--fs-2); color: var(--mut); margin: 0; }
</style>
