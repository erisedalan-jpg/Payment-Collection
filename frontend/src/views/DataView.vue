<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { api } from '@/api/client'
import { useCloudSync } from '@/composables/useCloudSync'
import { useExcelImport } from '@/composables/useExcelImport'
import { usePmisSync } from '@/composables/usePmisSync'
import { useInputFiles } from '@/composables/useInputFiles'
import { useFileStatus } from '@/composables/useFileStatus'
import { useReprocess } from '@/composables/useReprocess'
import { useDataHistory } from '@/composables/useDataHistory'

const data = useDataStore()
const filter = useFilterStore()

const lastUpdate = computed(() => (data.data?.meta as any)?.lastUpdate || '-')
const lastPmis = computed(() => (data.data as any)?.dataQuality?.summary?.lastPmisUpdate || '-')

const WPS_KEY = '回款数据'
const { links: pmisLinks, defaults: linkDefaults, progress: pmisProgress, message: pmisMessage,
        running: pmisRunning, loadLinks: pmisLoadLinks, saveLinks: pmisSaveLinks,
        download: pmisDownload, upload: pmisUpload, PMIS_FILE_NAMES } = usePmisSync()
const { files: fileStatus, load: loadFileStatus } = useFileStatus()

const ftime = (name: string) => fileStatus.value[name] || '-'
const hasDefault = (name: string) => !!linkDefaults.value[name]
function resetLink(name: string) { pmisLinks.value[name] = linkDefaults.value[name] || '' }

// —— 回款数据(WPS 云同步 + 离线导入) ——
const { phase: syncPhase, progress: syncProgress, message: syncMessage, start: startCloudSync, stop: stopCloudSync } = useCloudSync()
function onSync() {
  pmisSaveLinks()   // 链接修改随同步动作持久化
  startCloudSync(pmisLinks.value[WPS_KEY] || '')
}
const importInput = ref<HTMLInputElement | null>(null)
const { phase: importPhase, progress: importProgress, message: importMessage, importFile, stop: stopExcelImport } = useExcelImport()
function onPickImport() { const f = importInput.value?.files?.[0]; if (f) importFile(f) }
const importing = computed(() => ['reading', 'uploading', 'processing'].includes(importPhase.value))

// —— PMIS 九表 ——
const pmisInput = ref<HTMLInputElement | null>(null)
const pmisUploadMsg = ref('')
async function onPmisUpload() {
  const files = Array.from(pmisInput.value?.files || [])
  if (!files.length) return
  const ok = await pmisUpload(files)
  pmisUploadMsg.value = `已上传 ${ok}/${files.length} 个 PMIS 文件,请点[更新数据]生效`
  if (pmisInput.value) pmisInput.value.value = ''
  loadFileStatus()
}
async function onPmisDownload() {
  await pmisDownload()
  loadFileStatus()
}

// —— 项目域文件(input/ 根) ——
const { upload: inputsUpload, INPUT_FILE_NAMES } = useInputFiles()
// 展示名单:legacy xlsx 仅作上传兼容不展示
const INPUT_DISPLAY_NAMES = INPUT_FILE_NAMES.filter((n) => n !== 'delivery_analysis.xlsx')
const inputsInput = ref<HTMLInputElement | null>(null)
const inputsUploadMsg = ref('')
async function onUploadInputs() {
  const files = Array.from(inputsInput.value?.files || [])
  if (!files.length) return
  const ok = await inputsUpload(files)
  inputsUploadMsg.value = `已上传 ${ok}/${files.length} 个项目域文件,请点[更新数据]生效`
  if (inputsInput.value) inputsInput.value.value = ''
  loadFileStatus()
}

// —— 更新数据 / 设置 ——
const { progress: repProgress, message: repMessage, running: repRunning, start: startReprocess } =
  useReprocess({ onDone: () => { data.reload(); loadFileStatus() } })
const { versions: historyVersions, preRollback: historyPre, busy: historyBusy,
        message: historyMsg, load: loadHistory, rollback: doRollback, undo: doUndo } =
  useDataHistory({ onChange: () => { data.reload(); loadFileStatus() } })
function fmtMB(bytes?: number) { return bytes ? (bytes / 1048576).toFixed(1) + ' MB' : '-' }
async function onRollback(id: string) {
  if (!window.confirm(`确定回滚到 ${id}？将用该版本覆盖当前数据与源数据，当前状态会先备份可撤销。`)) return
  await doRollback(id)
}
async function onUndoRollback() {
  if (!window.confirm('确定撤销上次回滚，恢复回滚前的状态？')) return
  await doUndo()
}

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

onMounted(() => { if (!data.data) data.load(); pmisLoadLinks(); loadFileStatus(); loadHistory() })
</script>

<template>
  <div class="data-view">
    <div class="dv-top">
      <h2 class="dv-title">数据管理</h2>
      <div class="dv-times u-num">处理 <b>{{ lastUpdate }}</b> · PMIS <b>{{ lastPmis }}</b></div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">回款数据（WPS 云文档）</div>
      <div class="dv-row">
        <span class="dv-label">下载链接</span>
        <input v-model="pmisLinks[WPS_KEY]" data-test="wps-input" type="text" class="dv-link" placeholder="WPS 云文档网址" />
        <button v-if="hasDefault(WPS_KEY)" class="dv-btn ghost" data-test="wps-reset" @click="resetLink(WPS_KEY)">重置</button>
        <button class="dv-btn primary" :disabled="syncPhase === 'syncing'" @click="onSync">云同步</button>
        <button v-if="syncPhase === 'syncing'" class="dv-btn" @click="stopCloudSync">停止</button>
      </div>
      <div v-if="syncPhase !== 'idle'" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :class="syncPhase" :style="{ width: syncProgress + '%' }"></div></div><div class="dv-msg" :class="syncPhase">{{ syncMessage }}</div></div>
      <div class="dv-row">
        <span class="dv-label">离线导入</span>
        <input ref="importInput" type="file" accept=".xlsx,.xls" class="dv-file" />
        <button class="dv-btn" :disabled="importing" @click="onPickImport">导入</button>
        <button v-if="importing" class="dv-btn" @click="stopExcelImport">停止</button>
        <span class="dv-hint">需含 Sheet「项目回款节点（里程碑）清单」</span>
      </div>
      <div v-if="importPhase !== 'idle'" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :class="importPhase" :style="{ width: importProgress + '%' }"></div></div><div class="dv-msg" :class="importPhase">{{ importMessage }}</div></div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">PMIS 数据（九表 · 有直链可在线下载，其余从 PMIS 手动导出后上传）</div>
      <div v-for="name in PMIS_FILE_NAMES" :key="name" class="dv-frow" data-test="pmis-row">
        <span class="dv-fname">{{ name }}</span>
        <template v-if="hasDefault(name)">
          <input v-model="pmisLinks[name]" type="text" class="dv-link" placeholder="下载链接" />
          <button class="dv-btn ghost" data-test="link-reset" @click="resetLink(name)">重置</button>
        </template>
        <span v-else class="dv-badge">无直链 · 需手动导出上传</span>
        <span class="dv-ftime u-num">{{ ftime(name) }}</span>
      </div>
      <div class="dv-row dv-actions">
        <button class="dv-btn primary" :disabled="pmisRunning" @click="onPmisDownload()">在线下载（有链接项）</button>
        <input ref="pmisInput" type="file" accept=".xlsx" multiple class="dv-file" />
        <button class="dv-btn" @click="onPmisUpload">离线上传</button>
      </div>
      <div v-if="pmisRunning || pmisProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: pmisProgress + '%' }"></div></div><div class="dv-msg">{{ pmisMessage || '处理中...' }}</div></div>
      <div v-if="pmisUploadMsg" class="dv-row dv-hint">{{ pmisUploadMsg }}</div>
    </div>

    <div class="dv-card" data-test="inputs-card">
      <div class="dv-card-head">项目域文件（input/ 根 · 手动导出后上传）</div>
      <div v-for="name in INPUT_DISPLAY_NAMES" :key="name" class="dv-frow">
        <span class="dv-fname">{{ name }}</span>
        <span class="dv-ftime u-num">{{ ftime(name) }}</span>
      </div>
      <div class="dv-row dv-actions">
        <input ref="inputsInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
        <button class="dv-btn" @click="onUploadInputs">多选上传</button>
      </div>
      <div v-if="inputsUploadMsg" class="dv-row dv-hint">{{ inputsUploadMsg }}</div>
    </div>

    <div class="dv-grid2">
      <div class="dv-card">
        <div class="dv-card-head">更新数据</div>
        <div class="dv-row">
          <button class="dv-btn primary" :disabled="repRunning" @click="startReprocess()">更新数据（重新处理）</button>
          <span class="dv-hint">读取已获取的全部数据文件,重算看板</span>
        </div>
        <div v-if="repRunning || repProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: repProgress + '%' }"></div></div><div class="dv-msg">{{ repMessage }}</div></div>
      </div>
      <div class="dv-card">
        <div class="dv-card-head">设置</div>
        <div class="dv-row"><span class="dv-label">纳管开关</span><el-switch v-model="naguanOn" /><span class="dv-hint">关闭后不再排除纳管项目(全站联动)</span></div>
        <div class="dv-row"><span class="dv-label">清空数据</span><button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button><span v-if="clearState" class="dv-hint ok">{{ clearState }}</span></div>
      </div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">数据历史 / 回滚</div>
      <div v-if="historyPre" class="dv-row">
        <span class="dv-label">撤销</span>
        <button class="dv-btn ghost" :disabled="historyBusy" @click="onUndoRollback">撤销上次回滚</button>
        <span class="dv-hint">恢复到最近一次回滚前的状态</span>
      </div>
      <div v-if="!historyVersions.length" class="dv-hint">暂无历史版本，"更新数据"成功后会自动保存（保留最近 3 份）。</div>
      <div v-for="v in historyVersions" :key="v.id" class="dv-row" data-test="history-row">
        <span class="dv-label u-num">{{ v.createdAt || v.id }}</span>
        <span class="dv-hint u-num">项目 {{ v.projectCount ?? '-' }} · 节点 {{ v.paymentNodeCount ?? '-' }} · {{ fmtMB(v.sizeBytes) }}</span>
        <button class="dv-btn" :disabled="historyBusy" data-test="history-rollback" @click="onRollback(v.id)">回滚到此</button>
      </div>
      <div v-if="historyMsg" class="dv-hint ok">{{ historyMsg }}</div>
    </div>
  </div>
</template>

<style scoped>
.data-view { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--gap-card); }
.dv-top { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-2); }
.dv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.dv-times { font-size: var(--fs-1); color: var(--sub); }
.dv-times b { color: var(--txt); }
.dv-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-1); }
.dv-card-head { font-weight: 700; font-size: var(--fs-2); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--line); color: var(--txt); }
.dv-row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); font-size: var(--fs-2); flex-wrap: wrap; }
.dv-actions { border-top: 1px solid var(--line); }
.dv-frow { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-4); font-size: var(--fs-2); border-bottom: 1px dashed var(--line); }
.dv-frow:last-of-type { border-bottom: none; }
.dv-fname { width: 230px; flex-shrink: 0; color: var(--txt); word-break: break-all; }
.dv-ftime { margin-left: auto; color: var(--mut); font-size: var(--fs-1); flex-shrink: 0; }
.dv-label { width: 70px; flex-shrink: 0; color: var(--sub); font-weight: 600; font-size: var(--fs-1); }
.dv-link { flex: 1; min-width: 200px; border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-2); font-size: var(--fs-1); color: var(--txt); outline: none; }
.dv-link:focus { border-color: var(--accent); }
.dv-badge { font-size: var(--fs-1); padding: 1px var(--sp-2); border-radius: var(--r-full); background: var(--warn-bg); color: var(--warn-text); white-space: nowrap; }
.dv-btn { border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-3); font-size: var(--fs-2); cursor: pointer; color: var(--txt); }
.dv-btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.dv-btn.ghost { color: var(--sub); }
.dv-btn.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
.dv-btn:disabled { opacity: var(--disabled-opacity); cursor: default; }
.dv-hint { font-size: var(--fs-1); color: var(--mut); }
.dv-hint.ok { color: var(--ok-text); }
.dv-file { font-size: var(--fs-1); }
.dv-progress { padding: 0 var(--sp-4) var(--sp-3); }
.dv-bar { height: 8px; background: var(--line); border-radius: var(--r-sm); overflow: hidden; }
.dv-bar-fill { height: 100%; background: var(--accent); transition: width var(--dur-2) var(--ease); }
.dv-bar-fill.done { background: var(--ok); }
.dv-bar-fill.error { background: var(--danger); }
.dv-msg { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-2); }
.dv-msg.done { color: var(--ok-text); }
.dv-msg.error { color: var(--danger-text); }
.dv-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-card); }
@media (max-width: 768px) { .dv-grid2 { grid-template-columns: 1fr; } }
</style>
