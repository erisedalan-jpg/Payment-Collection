<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="ph">
    <h2 class="ph-title">{{ title }}</h2>
    <div class="ph-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
/* 取值与被替换的 19 份 .XX-title 一致(--fs-4 / 700 / --txt),故抽组件后视觉零变化。
   改这三个值等于一次性改掉 19 个页面的外观,改前先看 PageHeader.test.ts 的契约用例。 */
.ph { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.ph-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.ph-actions { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; }
</style>
