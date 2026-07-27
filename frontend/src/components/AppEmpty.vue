<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'default' | 'plain' }>(), { variant: 'default' })
</script>

<template>
  <div class="ae" :class="`ae--${variant}`"><slot /></div>
</template>

<style scoped>
/* 取值与被替换的 cv-empty/cd-empty/gov-empty/iv-empty/mv-empty/pv-empty 一致 → 视觉零变化。
   padding 取多数派 var(--sp-7) 0;个别原为 --sp-4/--sp-6 的按本规格归位(预期内的轻微变化)。 */
.ae { color: var(--mut); text-align: center; }
.ae--default {
  padding: var(--sp-7) 0;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
/* plain:无边框无背景,供原 bv-empty 那种嵌在卡内的简单空态 */
.ae--plain { padding: var(--sp-4); }
</style>
