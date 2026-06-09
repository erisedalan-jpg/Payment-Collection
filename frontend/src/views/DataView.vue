<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { api } from '@/api/client'
import { useCloudSync } from '@/composables/useCloudSync'
import { useExcelImport } from '@/composables/useExcelImport'
import { usePmisSync } from '@/composables/usePmisSync'
import { useReprocess } from '@/composables/useReprocess'

const data = useDataStore()
const filter = useFilterStore()

const lastUpdate = computed(() => (data.data?.meta as any)?.lastUpdate || '-')
const lastPmis = computed(() => (data.data as any)?.dataQuality?.summary?.lastPmisUpdate || '-')

const { progress: repProgress, message: repMessage, running: repRunning, start: startReprocess } =
  useReprocess({ onDone: () => data.reload() })

const syncUrl = ref('')
const { phase: syncPhase, progress: syncProgress, message: syncMessage, start: startCloudSync, stop: stopCloudSync } = useCloudSync()
function onSync() { startCloudSync(syncUrl.value) }

const importInput = ref<HTMLInputElement | null>(null)
const { phase: importPhase, progress: importProgress, message: importMessage, importFile, stop: stopExcelImport } = useExcelImport()
function onPickImport() { const f = importInput.value?.files?.[0]; if (f) importFile(f) }

const { links: pmisLinks, progress: pmisProgress, message: pmisMessage, running: pmisRunning,
        loadLinks: pmisLoadLinks, download: pmisDownload, upload: pmisUpload, PMIS_FILE_NAMES } = usePmisSync()
const pmisInput = ref<HTMLInputElement | null>(null)
const pmisUploadMsg = ref('')
async function onPmisUpload() {
  const files = Array.from(pmisInput.value?.files || [])
  if (!files.length) return
  const ok = await pmisUpload(files)
  pmisUploadMsg.value = `已上传 ${ok}/${files.length} 个 PMIS 文件,请点[更新数据]生效`
  if (pmisInput.value) pmisInput.value.value = ''  // 清空选择,避免再次点击重复上传同一批
}

onMounted(() => { if (!data.data) data.load(); pmisLoadLinks() })

const naguanOn = computed({ get: () => filter.naguanOn, set: (v: boolean) => filter.toggleNaguan(v) })
const clearState = ref('')
const clearing = ref(false)
async function onClear() {
  if (!window.confirm('确定要清空所有数据吗？此操作不可撤销!')) return
  if (!window.confirm('再次确认：是否清空所有数据？')) return
  clearing.value = true
  data.clearBusinessData()
  try { await api.get('/api/clear-data'); clearState.value = '已清空(含数据文件)' }
  catch { clearState.value = '内存已清空' }
  clearing.value = false
  setTimeout(() => { clearState.value = '' }, 2000)
}
</script>

<template>
  <div class="data-view">
    <h2 class="dv-title">数据管理</h2>

    <div class="dv-times">
      <span>数据处理时间:<b>{{ lastUpdate }}</b></span>
      <span>PMIS 数据时间:<b>{{ lastPmis }}</b></span>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">数据来源 · 获取(获取后点"更新数据"生效)</div>
      <div class="dv-sub">回款数据</div>
      <div class="dv-row">
        <el-input v-model="syncUrl" size="small" placeholder="粘贴 WPS 云文档网址" style="flex:1" />
        <button class="dv-btn" :disabled="syncPhase === 'syncing'" @click="onSync">云同步</button>
        <button v-if="syncPhase === 'syncing'" class="dv-btn" @click="stopCloudSync">停止</button>
      </div>
      <div v-if="syncPhase !== 'idle'" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :class="syncPhase" :style="{ width: syncProgress + '%' }"></div></div><div class="dv-msg" :class="syncPhase">{{ syncMessage }}</div></div>
      <div class="dv-row">
        <input ref="importInput" type="file" accept=".xlsx,.xls" class="dv-file" />
        <button class="dv-btn" :disabled="['reading','uploading','processing'].includes(importPhase)" @click="onPickImport">离线导入</button>
        <button v-if="['reading','uploading','processing'].includes(importPhase)" class="dv-btn" @click="stopExcelImport">停止</button>
      </div>
      <div class="dv-row dv-note">离线导入需含 Sheet「项目回款节点（里程碑）清单」</div>
      <div v-if="importPhase !== 'idle'" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :class="importPhase" :style="{ width: importProgress + '%' }"></div></div><div class="dv-msg" :class="importPhase">{{ importMessage }}</div></div>

      <div class="dv-sub">项目域(PMIS)</div>
      <div class="dv-row dv-note">在线:配置 7 个下载链接(空则在此录入);离线:多选 7 个 xlsx 上传到 input/pmis/。</div>
      <div v-for="name in PMIS_FILE_NAMES" :key="name" class="dv-row dv-pmis-row">
        <span class="dv-label dv-pmis-label">{{ name }}</span>
        <input v-model="pmisLinks[name]" type="text" class="dv-pmis-input" placeholder="下载链接(可选)" />
      </div>
      <div class="dv-row">
        <button class="dv-btn" :disabled="pmisRunning" @click="pmisDownload()">在线下载</button>
        <input ref="pmisInput" type="file" accept=".xlsx" multiple class="dv-file" />
        <button class="dv-btn" @click="onPmisUpload">离线上传</button>
      </div>
      <div v-if="pmisRunning || pmisProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: pmisProgress + '%' }"></div></div><div class="dv-msg">{{ pmisMessage || '处理中...' }}</div></div>
      <div v-if="pmisUploadMsg" class="dv-row dv-note">{{ pmisUploadMsg }}</div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">更新数据</div>
      <div class="dv-row">
        <button class="dv-btn primary" :disabled="repRunning" @click="startReprocess()">更新数据(重新处理)</button>
        <span class="dv-hint">读取已获取的回款 + PMIS 文件,重算看板数据</span>
      </div>
      <div v-if="repRunning || repProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: repProgress + '%' }"></div></div><div class="dv-msg">{{ repMessage }}</div></div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">设置</div>
      <div class="dv-row"><span class="dv-label">纳管开关</span><el-switch v-model="naguanOn" /><span class="dv-hint">关闭后不再排除纳管项目(全站联动)</span></div>
      <div class="dv-row"><span class="dv-label">清空数据</span><button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button><span v-if="clearState" class="dv-clear-state">{{ clearState }}</span></div>
    </div>
  </div>
</template>

<style scoped>
.data-view { padding: 16px; }
.dv-title { font-size: 18px; font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.dv-times { display: flex; gap: 24px; font-size: var(--fs-1); color: var(--sub); margin-bottom: 14px; }
.dv-times b { color: var(--txt); }
.dv-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 14px; }
.dv-card-head { font-weight: 700; padding: 10px 16px; border-bottom: 1px solid var(--line); color: var(--txt); }
.dv-sub { padding: 10px 16px 0; font-size: var(--fs-1); color: var(--mut); font-weight: 700; }
.dv-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; font-size: 13px; }
.dv-label { width: 84px; flex-shrink: 0; color: var(--sub); font-weight: 600; }
.dv-hint, .dv-note { font-size: 12px; color: var(--mut); }
.dv-btn { border: 1px solid var(--line); background: var(--card); border-radius: 6px; padding: 5px 14px; font-size: 13px; cursor: pointer; color: var(--txt); }
.dv-btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
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
.dv-pmis-row { align-items: center; }
.dv-pmis-label { width: 200px; flex-shrink: 0; word-break: break-all; white-space: normal; line-height: 1.4; }
.dv-pmis-input { flex: 1; border: 1px solid var(--line); background: var(--card); border-radius: 6px; padding: 4px 8px; font-size: 12px; color: var(--txt); outline: none; }
.dv-pmis-input:focus { border-color: var(--accent); }
</style>
