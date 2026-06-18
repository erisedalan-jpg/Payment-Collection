<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  columns: { key: string; label: string }[]
  visibleKeys: string[]
}>()
const emit = defineEmits<{
  toggle: [key: string]
  'move-up': [key: string]
  'move-down': [key: string]
  reset: []
}>()

// 可见列按 visibleKeys 顺序；隐藏列按 columns 原序
const visibleOrdered = computed(() =>
  props.visibleKeys
    .map((k) => props.columns.find((c) => c.key === k))
    .filter((c): c is { key: string; label: string } => !!c),
)
const hidden = computed(() => props.columns.filter((c) => !props.visibleKeys.includes(c.key)))
</script>

<template>
  <el-popover trigger="click" :width="260" placement="bottom-end" popper-class="colpick-pop">
    <template #reference>
      <button class="colpick-btn" type="button">选列 ▾</button>
    </template>
    <div class="colpick-inner">
      <div class="colpick-title">显示列（勾选显示，箭头排序）</div>
      <div class="colpick-list">
        <div v-for="(c, i) in visibleOrdered" :key="c.key" class="colpick-row">
          <el-checkbox :model-value="true" @change="emit('toggle', c.key)" />
          <span class="colpick-label">{{ c.label }}</span>
          <button
            class="colpick-arrow"
            type="button"
            :disabled="i === 0"
            @click="emit('move-up', c.key)"
          >↑</button>
          <button
            class="colpick-arrow"
            type="button"
            :disabled="i === visibleOrdered.length - 1"
            @click="emit('move-down', c.key)"
          >↓</button>
        </div>
        <div v-for="c in hidden" :key="c.key" class="colpick-row colpick-hidden">
          <el-checkbox :model-value="false" @change="emit('toggle', c.key)" />
          <span class="colpick-label">{{ c.label }}</span>
        </div>
      </div>
      <div class="colpick-actions">
        <button class="colpick-reset" type="button" @click="emit('reset')">恢复默认</button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.colpick-btn {
  font-size: var(--fs-1);
  color: var(--accent);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 2px 10px;
  cursor: pointer;
}
.colpick-title {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--txt);
  margin-bottom: var(--sp-2);
}
.colpick-list {
  max-height: 320px;
  overflow-y: auto;
}
.colpick-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 2px 0;
  font-size: var(--fs-1);
}
.colpick-hidden .colpick-label {
  color: var(--mut);
}
.colpick-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.colpick-arrow {
  width: 20px;
  border: 1px solid var(--line);
  background: var(--card2);
  border-radius: var(--r-sm);
  cursor: pointer;
  color: var(--sub);
}
.colpick-arrow:disabled {
  opacity: var(--disabled-opacity, 0.45);
  cursor: not-allowed;
}
.colpick-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--sp-2);
  border-top: 1px solid var(--line);
  padding-top: var(--sp-2);
}
.colpick-reset {
  font-size: var(--fs-1);
  color: var(--sub);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 2px 10px;
  cursor: pointer;
}
</style>
