<script setup lang="ts">
import { ref } from 'vue'
import FuNodeTable from './FuNodeTable.vue'
import FollowupRecords from './FollowupRecords.vue'
import { useFuDataStore } from '@/stores/fuData'
import type { FuProject } from '@/lib/followupProjects'

const props = defineProps<{ project: FuProject }>()
const fu = useFuDataStore()
const open = ref(false)

function onFlwChange(v: string | number) {
  fu.setFlw(props.project.projectId, String(v) === '1')
}
defineExpose({ onFlwChange })
</script>

<template>
  <div class="fpr" :class="{ flw: project.flw }">
    <div class="fpr-head">
      <div class="fpr-name">{{ project.projectName }}</div>
      <div class="fpr-actions">
        <button class="fpr-btn" @click="open = !open">{{ open ? '收起' : '展开' }}</button>
        <el-select
          :model-value="project.flw ? '1' : '0'"
          size="small"
          style="width: 90px"
          @change="onFlwChange"
        >
          <el-option value="0" label="待跟进" />
          <el-option value="1" label="已跟进" />
        </el-select>
      </div>
    </div>
    <div class="fpr-meta">
      <span>{{ project.projectId }}</span>
      <span>{{ project.orgL4 }}</span>
      <span>{{ project.projectManager }}</span>
      <span>¥{{ project.projectAmountWan }}万</span>
      <span>到期: {{ project.earliestPlanDate }}</span>
      <span>完成: {{ project.completion }}</span>
      <span>状态: {{ project.nodeStatuses.slice(0, 3).join(', ') }}</span>
    </div>
    <div v-if="open" class="fpr-nodes">
      <FuNodeTable :nodes="project.nodes as Record<string, any>[]" />
      <FollowupRecords
        :project-id="project.projectId"
        :project-name="project.projectName"
        :default-next-date="(project.nodes[0] as Record<string, any>)?.nextActionDate || ''"
      />
    </div>
  </div>
</template>

<style scoped>
.fpr { padding: 14px; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 10px; }
.fpr-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
.fpr-name { flex: 1; min-width: 0; font-weight: 700; font-size: 14px; color: var(--txt); }
.fpr-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.fpr-btn { border: 1px solid var(--line); background: var(--card); border-radius: 6px; padding: 3px 12px; font-size: 12px; cursor: pointer; color: var(--sub); }
.fpr-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--mut); }
.fpr-nodes { margin-top: 6px; padding-left: 8px; border-left: 2px solid var(--line); }
</style>
