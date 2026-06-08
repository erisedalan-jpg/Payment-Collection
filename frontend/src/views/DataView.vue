<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { api } from '@/api/client'
import { dataQualityRows, dataQualityDrill, DATA_CHECKS } from '@/lib/dataQuality'
import DataQualityTable from '@/components/DataQualityTable.vue'
import DataDrillModal from '@/components/DataDrillModal.vue'
import { useCloudSync } from '@/composables/useCloudSync'
import { useExcelImport } from '@/composables/useExcelImport'

const data = useDataStore()
const filter = useFilterStore()
onMounted(() => {
  if (!data.data) data.load()
})

const TIER_LABELS = ['100万以上', '50-100万', '50万以下']

const rawNodes = computed(() => (data.data?.rawNodes ?? []) as Record<string, any>[])
const rows = computed(() => dataQualityRows(rawNodes.value as any))

const naguanOn = computed({
  get: () => filter.naguanOn,
  set: (v: boolean) => filter.toggleNaguan(v),
})

const drillOpen = ref(false)
const drillTitle = ref('')
const drillNodes = ref<Record<string, any>[]>([])
function onDrill(e: { checkIdx: number; tierIdx: number }) {
  drillNodes.value = dataQualityDrill(rawNodes.value as any, e.checkIdx, e.tierIdx) as Record<string, any>[]
  const tierLabel = e.tierIdx >= 0 ? TIER_LABELS[e.tierIdx] : '全部区间'
  drillTitle.value = `${tierLabel} - ${DATA_CHECKS[e.checkIdx]?.name || ''}`
  drillOpen.value = true
}

const clearState = ref('')
const clearing = ref(false)
async function onClear() {
  if (!window.confirm('确定要清空所有数据吗？\n\n此操作将删除系统中所有已加载的项目和回款数据，清空后需重新同步才能恢复。')) return
  if (!window.confirm('再次确认：是否清空所有数据？此操作不可撤销！')) return
  clearing.value = true
  data.clearBusinessData()
  try {
    await api.get('/api/clear-data')
    clearState.value = '已清空(含数据文件)'
  } catch {
    clearState.value = '内存已清空'
  }
  clearing.value = false
  setTimeout(() => {
    clearState.value = ''
  }, 2000)
}
// 云同步（解构使 ref 在模板自动解包，避免 .value 踩坑）
const syncUrl = ref('')
const {
  phase: syncPhase,
  progress: syncProgress,
  message: syncMessage,
  start: startCloudSync,
  stop: stopCloudSync,
} = useCloudSync({ onDone: () => data.reload() })
function onSync() {
  startCloudSync(syncUrl.value)
}

// 离线导入
const importInput = ref<HTMLInputElement | null>(null)
const {
  phase: importPhase,
  progress: importProgress,
  message: importMessage,
  importFile,
  stop: stopExcelImport,
} = useExcelImport({ onDone: () => data.reload() })
function onPickImport() {
  const f = importInput.value?.files?.[0]
  if (!f) return
  importFile(f)
}
defineExpose({ onClear, onSync, onPickImport })
</script>

<template>
  <div class="data-view">
    <h2 class="dv-title">数据管理</h2>

    <div class="dv-card">
      <div class="dv-card-head">设置</div>
      <div class="dv-row">
        <span class="dv-label">纳管开关</span>
        <el-switch v-model="naguanOn" />
        <span class="dv-hint">关闭后不再排除纳管项目（全站联动）</span>
      </div>
      <div class="dv-row">
        <span class="dv-label">清空数据</span>
        <button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button>
        <span v-if="clearState" class="dv-clear-state">{{ clearState }}</span>
      </div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">云同步（WPS 云文档）</div>
      <div class="dv-row">
        <el-input v-model="syncUrl" size="small" placeholder="粘贴 WPS 云文档网址" style="flex:1" />
        <button class="dv-btn" :disabled="syncPhase === 'syncing'" @click="onSync">同步最新数据</button>
        <button v-if="syncPhase === 'syncing'" class="dv-btn" @click="stopCloudSync">停止</button>
      </div>
      <div v-if="syncPhase !== 'idle'" class="dv-progress">
        <div class="dv-bar"><div class="dv-bar-fill" :class="syncPhase" :style="{ width: syncProgress + '%' }"></div></div>
        <div class="dv-msg" :class="syncPhase">{{ syncMessage }}</div>
      </div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">离线 Excel 导入</div>
      <div class="dv-row">
        <input ref="importInput" type="file" accept=".xlsx,.xls" class="dv-file" />
        <button class="dv-btn" :disabled="['reading', 'uploading', 'processing'].includes(importPhase)" @click="onPickImport">离线导入</button>
        <button v-if="['reading', 'uploading', 'processing'].includes(importPhase)" class="dv-btn" @click="stopExcelImport">停止</button>
      </div>
      <div class="dv-row dv-note">需包含 Sheet 页「项目回款节点（里程碑）清单」</div>
      <div v-if="importPhase !== 'idle'" class="dv-progress">
        <div class="dv-bar"><div class="dv-bar-fill" :class="importPhase" :style="{ width: importProgress + '%' }"></div></div>
        <div class="dv-msg" :class="importPhase">{{ importMessage }}</div>
      </div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">数据质量总览</div>
      <DataQualityTable :rows="rows" @drill="onDrill" />
    </div>

    <DataDrillModal v-model="drillOpen" :title="drillTitle" :nodes="drillNodes" />
  </div>
</template>

<style scoped>
.data-view { padding: 16px; }
.dv-title { font-size: 18px; font-weight: 700; color: var(--txt); margin: 0 0 14px; }
.dv-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 14px; }
.dv-card-head { font-weight: 700; padding: 10px 16px; border-bottom: 1px solid var(--line); color: var(--txt); }
.dv-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; font-size: 13px; }
.dv-label { width: 84px; flex-shrink: 0; color: var(--sub); font-weight: 600; }
.dv-hint { font-size: 12px; color: var(--mut); }
.dv-note { color: var(--mut); font-size: 12px; }
.dv-btn { border: 1px solid var(--line); background: var(--card); border-radius: 6px; padding: 5px 14px; font-size: 13px; cursor: pointer; }
.dv-btn.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
.dv-btn:disabled { opacity: 0.5; cursor: default; }
.dv-clear-state { font-size: 12px; color: var(--c-paid); }
.dv-file { font-size: 12px; }
.dv-progress { padding: 0 16px 12px; }
.dv-bar { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
.dv-bar-fill { height: 100%; background: var(--accent); transition: width .3s ease; }
.dv-bar-fill.done { background: var(--c-paid); }
.dv-bar-fill.error { background: var(--danger); }
.dv-msg { font-size: 12px; color: var(--mut); margin-top: 6px; }
.dv-msg.done { color: var(--c-paid); }
.dv-msg.error { color: var(--danger); }
</style>
