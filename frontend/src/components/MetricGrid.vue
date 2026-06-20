<script setup lang="ts">
withDefaults(
  defineProps<{
    items: { k: string; v: string; sub?: string; cls?: string }[]
    colMin?: string
  }>(),
  { colMin: '150px' },
)
</script>

<template>
  <div class="u-grid-auto mg" :style="{ '--col-min': colMin }">
    <div v-for="(it, i) in items" :key="i" class="mg-card">
      <div class="mg-k">{{ it.k }}</div>
      <div class="mg-v u-num" :class="it.cls">{{ it.v }}</div>
      <div v-if="it.sub" class="mg-sub u-num">{{ it.sub }}</div>
    </div>
  </div>
</template>

<style scoped>
.mg { margin-bottom: var(--sp-3); }
.mg-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.mg-k { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.mg-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.mg-v.ok { color: var(--ok); }
.mg-v.warn { color: var(--warn); }
.mg-v.danger { color: var(--danger); }
.mg-v.mut { color: var(--mut); }
.mg-sub { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-1); }
</style>
