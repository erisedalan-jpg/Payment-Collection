<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from './Modal.vue'
import FuProjectRow from './FuProjectRow.vue'
import { useFuDataStore } from '@/stores/fuData'
import {
  followupDeptProjects,
  deptWindowNodes,
  deptUrgency,
  applyProjDropdown,
} from '@/lib/followupProjects'

const props = defineProps<{
  modelValue: boolean
  dept: string
  timeWin: string
  relatedNodes: Record<string, any>[]
  today?: Date
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const fu = useFuDataStore()
const fval = ref('all')
watch(
  () => props.modelValue,
  (o) => {
    if (o) fval.value = 'all'
  },
)

const now = computed(() => props.today ?? new Date())
const windowNodes = computed(() =>
  deptWindowNodes(props.relatedNodes as any, props.dept, props.timeWin, now.value),
)
const projSet = computed(() => new Set(windowNodes.value.map((n) => (n as any).projectId)))
const allProjs = computed(() => followupDeptProjects(props.relatedNodes as any, props.dept, fu.data))
const projs = computed(() => allProjs.value.filter((p) => projSet.value.has(p.projectId)))
const displayProjs = computed(() => applyProjDropdown(projs.value, fval.value, now.value))
const urgency = computed(() => deptUrgency(windowNodes.value, now.value))

const projCount = computed(() => projs.value.length)
const nodeCount = computed(() => windowNodes.value.length)
const flwCount = computed(() => projs.value.filter((p) => p.flw).length)
const flwRate = computed(() => (projCount.value > 0 ? Math.round((flwCount.value / projCount.value) * 100) : 0))
const rateColor = computed(() => (flwRate.value >= 80 ? '#10b981' : flwRate.value >= 50 ? '#f59e0b' : '#ef4444'))
const timeLabel = computed(
  () =>
    ((
      { delay: ' (已延期)', d7: ' (7天内到期)', d15: ' (15天内到期)', d30: ' (30天内到期)' } as Record<string, string>
    )[props.timeWin] || ''),
)
const maxU = computed(() => Math.max(urgency.value.delay, urgency.value.d7, urgency.value.d15, urgency.value.d30, 1))
const URG = computed(() => [
  { label: '已延期', count: urgency.value.delay, color: '#dc2626' },
  { label: '7天内到期', count: urgency.value.d7, color: '#f97316' },
  { label: '8~15天到期', count: urgency.value.d15, color: '#f59e0b' },
  { label: '16~30天到期', count: urgency.value.d30, color: '#3b82f6' },
])

function batch(v: string | number) {
  if (v === '') return
  fu.batchSetFlw(projs.value.map((p) => p.projectId), String(v) === '1')
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="`${dept}${timeLabel}`"
    width="92%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="fe-body">
      <aside class="fe-left">
        <div class="fe-sum">涉及 {{ projCount }} 个项目 · 共 {{ nodeCount }} 个节点</div>
        <div class="fe-rate" :style="{ color: rateColor }">{{ flwRate }}%<span>跟进率</span></div>
        <div class="fe-cards">
          <div class="fe-c red"><b>{{ projCount - flwCount }}</b><span>待跟进</span></div>
          <div class="fe-c green"><b>{{ flwCount }}</b><span>已跟进</span></div>
        </div>
        <div class="fe-urg-title">到期紧迫度</div>
        <div v-for="u in URG" :key="u.label" class="fe-urg">
          <span class="fe-urg-label">{{ u.label }}</span>
          <div class="fe-urg-bar"><div :style="{ width: Math.round((u.count / maxU) * 100) + '%', background: u.color }"></div></div>
          <span class="fe-urg-num">{{ u.count }}</span>
        </div>
        <div class="fe-label">跟进状态筛选</div>
        <el-select v-model="fval" size="small" style="width: 100%">
          <el-option value="all" label="全部项目" />
          <el-option value="flw" label="已跟进" />
          <el-option value="noflw" label="未跟进" />
          <el-option value="7d" label="7天内到期" />
          <el-option value="15d" label="15天内到期" />
        </el-select>
        <div class="fe-label">批量操作</div>
        <el-select :model-value="''" size="small" style="width: 100%" placeholder="批量设置跟进..." @change="batch">
          <el-option value="1" label="全部标记已跟进" />
          <el-option value="0" label="全部标记未跟进" />
        </el-select>
      </aside>
      <section class="fe-right">
        <h3 class="fe-r-title">项目列表</h3>
        <div class="fe-r-count">共 {{ displayProjs.length }} 个项目 | 已跟进 {{ flwCount }}/{{ projCount }}</div>
        <FuProjectRow v-for="p in displayProjs" :key="p.projectId" :project="p" />
        <div v-if="!displayProjs.length" class="fe-empty">暂无匹配项目</div>
      </section>
    </div>
  </Modal>
</template>

<style scoped>
.fe-body { display: flex; gap: 16px; }
.fe-left { width: 240px; flex-shrink: 0; }
.fe-right { flex: 1; min-width: 0; }
.fe-sum { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
.fe-rate { font-size: 32px; font-weight: 900; text-align: center; margin-bottom: 12px; }
.fe-rate span { display: block; font-size: 12px; color: #8c8c9e; font-weight: 400; }
.fe-cards { display: flex; gap: 10px; margin-bottom: 16px; }
.fe-c { flex: 1; text-align: center; padding: 12px 8px; border-radius: 8px; }
.fe-c b { font-size: 18px; display: block; }
.fe-c span { font-size: 12px; font-weight: 600; }
.fe-c.red { background: #fef2f2; color: #ef4444; }
.fe-c.green { background: #ecfdf5; color: #10b981; }
.fe-urg-title { font-size: 13px; font-weight: 600; color: #8c8c9e; margin-bottom: 8px; }
.fe-urg { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.fe-urg-label { font-size: 12px; color: #8c8c9e; width: 76px; flex-shrink: 0; text-align: right; }
.fe-urg-bar { flex: 1; height: 10px; background: #f1f5f9; border-radius: 5px; overflow: hidden; }
.fe-urg-bar > div { height: 100%; border-radius: 5px; }
.fe-urg-num { font-size: 13px; font-weight: 700; color: #1a1a2e; min-width: 20px; text-align: right; }
.fe-label { font-size: 13px; font-weight: 600; color: #475569; margin: 12px 0 6px; }
.fe-r-title { font-size: 15px; font-weight: 700; margin: 0 0 4px; }
.fe-r-count { font-size: 11px; color: #8c8c9e; margin-bottom: 16px; }
.fe-empty { text-align: center; padding: 30px; color: #8c8c9e; }
</style>
