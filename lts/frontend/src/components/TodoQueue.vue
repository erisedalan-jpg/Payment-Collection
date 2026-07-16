<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TodoBucket, TodoQueueResult } from '@/lib/todoQueue'
import SegToggle from '@/components/SegToggle.vue'

const props = defineProps<{ result: TodoQueueResult; windowDays: 7 | 30 }>()
const emit = defineEmits<{ 'update:windowDays': [7 | 30] }>()

// 4 桶展示顺序与短标
const BUCKETS: { key: TodoBucket; short: string }[] = [
  { key: '回款临期', short: '临期' },
  { key: '回款已延期', short: '已延期' },
  { key: '里程碑', short: '里程碑' },
  { key: '成本超支', short: '超支' },
]
const WINDOW_OPTS = [
  { value: '7', label: '7天' },
  { value: '30', label: '30天' },
]

const activeBucket = ref<TodoBucket | ''>('')
function toggleBucket(k: TodoBucket) { activeBucket.value = activeBucket.value === k ? '' : k }

const visibleItems = computed(() =>
  activeBucket.value ? props.result.items.filter((i) => i.bucket === activeBucket.value) : props.result.items,
)

const winStr = computed({
  get: () => String(props.windowDays),
  set: (v: string) => emit('update:windowDays', v === '30' ? 30 : 7),
})
</script>

<template>
  <div class="tq">
    <div class="tq-head">
      <span class="tq-title">待办 / 临期</span>
      <SegToggle v-model="winStr" :options="WINDOW_OPTS" />
    </div>
    <div class="tq-counts">
      <button
        v-for="b in BUCKETS" :key="b.key" type="button"
        class="tq-count" :class="{ on: activeBucket === b.key }"
        :data-test="`tq-bucket-${b.key}`" @click="toggleBucket(b.key)"
      >
        <span class="tq-count-k">{{ b.short }}</span>
        <span class="tq-count-v u-num">{{ result.counts[b.key] }}</span>
      </button>
    </div>
    <div v-if="visibleItems.length" class="tq-list">
      <RouterLink
        v-for="it in visibleItems" :key="it.key" class="tq-item"
        :to="`/project/${it.projectId}`"
      >
        <span class="tq-state" :class="`tone-${it.tone}`">{{ it.stateLabel }}</span>
        <span class="tq-name">{{ it.projectName }}</span>
        <span class="tq-detail u-num">{{ it.detail }}</span>
      </RouterLink>
    </div>
    <div v-else class="tq-empty">暂无待办</div>
  </div>
</template>

<style scoped>
.tq { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); box-shadow: var(--shadow-1); }
.tq-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.tq-title { font-size: var(--fs-2); font-weight: 700; color: var(--txt); }
.tq-counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-2); margin-bottom: var(--sp-3); }
.tq-count { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--line); background: var(--card2); border-radius: var(--r-sm); padding: var(--sp-1) 0; cursor: pointer; transition: background-color var(--dur-1) var(--ease); }
.tq-count:hover { background: var(--hover-tint); }
.tq-count.on { background: var(--selected-tint); border-color: var(--accent); }
.tq-count-k { font-size: var(--fs-1); color: var(--mut); }
.tq-count-v { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
.tq-list { display: flex; flex-direction: column; gap: 2px; max-height: 420px; overflow-y: auto; }
.tq-item { display: flex; align-items: baseline; gap: var(--sp-2); padding: var(--sp-1) var(--sp-1); border-radius: var(--r-sm); text-decoration: none; }
.tq-item:hover { background: var(--hover-tint); }
.tq-state { flex-shrink: 0; font-size: var(--fs-1); font-weight: 600; padding: 0 var(--sp-2); border-radius: var(--r-full); line-height: 1.7; }
.tq-state.tone-warn { background: var(--warn-bg); color: var(--warn-text); }
.tq-state.tone-danger { background: var(--danger-bg); color: var(--danger-text); }
.tq-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--accent); font-weight: 600; }
.tq-detail { flex-shrink: 0; font-size: var(--fs-1); color: var(--sub); white-space: nowrap; }
.tq-empty { font-size: var(--fs-1); color: var(--mut); padding: var(--sp-4) 0; text-align: center; }
</style>
