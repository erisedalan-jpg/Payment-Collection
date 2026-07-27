<script setup lang="ts">
import AppCard from './AppCard.vue'

withDefaults(
  defineProps<{
    items: { k: string; v: string; sub?: string; cls?: string; clickable?: boolean }[]
    colMin?: string
  }>(),
  { colMin: '150px' },
)
const emit = defineEmits<{ 'item-click': [number] }>()
</script>

<template>
  <div class="u-grid-auto mg" :style="{ '--col-min': colMin }">
    <AppCard v-for="(it, i) in items" :key="i" variant="flat" class="mg-card"
      :class="it.clickable ? 'mg-card--clickable u-lift u-focus-ring' : ''"
      :tabindex="it.clickable ? 0 : undefined"
      :role="it.clickable ? 'button' : undefined"
      @click="it.clickable && emit('item-click', i)"
      @keydown.enter.prevent="it.clickable && emit('item-click', i)"
      @keydown.space.prevent="it.clickable && emit('item-click', i)">
      <div class="mg-k">{{ it.k }}</div>
      <div class="mg-v u-num" :class="it.cls">{{ it.v }}</div>
      <div v-if="it.sub" class="mg-sub u-num">{{ it.sub }}</div>
    </AppCard>
  </div>
</template>

<style scoped>
.mg { margin-bottom: var(--sp-3); }
/* 卡片外观已交给 AppCard(flat);.mg-card 保留为 --clickable 修饰符的基类与 DOM 定位钩子。 */
.mg-card--clickable { cursor: pointer; transition: background var(--dur-1) var(--ease); }
.mg-card--clickable:hover { background: var(--hover-tint); }
.mg-k { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.mg-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.mg-v.ok { color: var(--ok-text); }
.mg-v.warn { color: var(--warn-text); }
.mg-v.danger { color: var(--danger-text); }
.mg-v.mut { color: var(--mut); }
.mg-sub { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-1); }
</style>
