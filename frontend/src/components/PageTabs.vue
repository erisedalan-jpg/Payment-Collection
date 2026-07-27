<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { TAB_GROUPS, type TabGroupId } from '@/nav'

const props = defineProps<{ group: TabGroupId }>()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const tabs = computed(() => (TAB_GROUPS[props.group] ?? []).filter((t) => auth.canAccess(t.key)))
/** 仅剩 1 个可见 tab 时整条不渲染 —— 单 tab 无切换意义,只是视觉噪音。 */
const visible = computed(() => tabs.value.length > 1)

/** 切 tab 保留当前 query:下钻参数(dim/dL4/dScroll 等)不能因换 tab 丢失。 */
function go(to: string) {
  if (to === route.path) return
  router.push({ path: to, query: route.query })
}

defineExpose({ tabs, visible })
</script>

<template>
  <div v-if="visible" class="pt-bar" role="tablist">
    <button v-for="t in tabs" :key="t.to" type="button" role="tab" class="pt-tab u-press"
      :class="{ on: t.to === route.path }" :aria-selected="t.to === route.path"
      :data-test="`pagetab-${t.key}`" @click="go(t.to)">{{ t.label }}</button>
  </div>
</template>

<style scoped>
/* 形态与 SegToggle 同源:选中=抬起 chip(淡底深字),不引入新令牌(新令牌属第二期)。 */
.pt-bar { display: flex; gap: var(--sp-1); padding: var(--sp-3) var(--sp-4) 0; }
.pt-tab {
  border: none; background: transparent; color: var(--sub); cursor: pointer;
  font-size: var(--fs-2); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm);
  line-height: var(--lh-dense);
  transition: color var(--dur-1) var(--ease), background-color var(--dur-1) var(--ease);
}
.pt-tab:hover:not(.on) { color: var(--txt); background: var(--hover-tint); }
.pt-tab.on { background: var(--card); color: var(--accent); font-weight: 700; box-shadow: var(--shadow-1); }
</style>
