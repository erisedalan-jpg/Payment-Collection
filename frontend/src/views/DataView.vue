<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useFilterStore } from '@/stores/filter'
import { api } from '@/api/client'
import { usePmisSync } from '@/composables/usePmisSync'
import { useInputFiles } from '@/composables/useInputFiles'
import { useFileStatus } from '@/composables/useFileStatus'
import { useReprocess } from '@/composables/useReprocess'
import { useDataHistory } from '@/composables/useDataHistory'
import { readWorkbook, parseManualSheets } from '@/lib/manualImport'
import { manualApi, type ManualError, type ManualBackup } from '@/lib/manualApi'

const data = useDataStore()
const projectTags = useProjectTagsStore()
const filter = useFilterStore()

const lastUpdate = computed(() => (data.data?.meta as any)?.lastUpdate || '-')
const lastPmis = computed(() => (data.data as any)?.dataQuality?.summary?.lastPmisUpdate || '-')

const { upload: pmisUpload, PMIS_FILE_NAMES } = usePmisSync()
const { files: fileStatus, load: loadFileStatus } = useFileStatus()

const ftime = (name: string) => fileStatus.value[name] || '-'

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
const { versions: historyVersions, preRollback: historyPre, source: historySource, busy: historyBusy,
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

// —— 人工数据导入 / 快照回滚 ——
const manImportInput = ref<HTMLInputElement | null>(null)
const manErrors = ref<ManualError[]>([])
const manMsg = ref('')
const manBackups = ref<ManualBackup[]>([])
const manBusy = ref(false)
async function loadManBackups() {
  try { manBackups.value = (await manualApi.backups()).versions ?? [] } catch { /* 无快照时忽略 */ }
}
async function onManImport() {
  const f = manImportInput.value?.files?.[0]; if (!f) return
  manBusy.value = true; manErrors.value = []; manMsg.value = ''
  try {
    const buf = await f.arrayBuffer()
    const sheets = parseManualSheets(readWorkbook(buf))
    if (!Object.keys(sheets).length) { manMsg.value = '未发现「项目标签」或「跟进记录」sheet'; return }
    const res = await manualApi.import(sheets, f.name)
    if (!res.success) { manErrors.value = res.errors ?? []; manMsg.value = res.message || '校验未通过'; return }
    manMsg.value = `导入成功（${res.tags ? '标签 ' + res.tags.projects + ' 项' : ''}${res.followup ? ' 跟进 ' + res.followup.count + ' 条' : ''}）`
    await loadManBackups(); await data.reload(); await projectTags.load()
  } catch (e) {
    manMsg.value = '导入异常：' + (e instanceof Error ? e.message : String(e))
  } finally { manBusy.value = false; if (manImportInput.value) manImportInput.value.value = '' }
}
async function onManRollback(id: string) {
  manBusy.value = true
  try { await manualApi.rollback(id); manMsg.value = '已回滚'; await data.reload(); await projectTags.load() }
  catch (e) { manMsg.value = '回滚失败：' + (e instanceof Error ? e.message : String(e)) }
  finally { manBusy.value = false }
}

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

const newTag = ref('')
function onAddTag() { const n = newTag.value.trim(); if (n) { projectTags.addTag(n); projectTags.save(); newTag.value = '' } }
function onRename(oldN: string, e: Event) { const v = (e.target as HTMLInputElement).value.trim(); if (v && v !== oldN) { projectTags.renameTag(oldN, v); projectTags.save() } }
function onDisable(name: string, on: boolean) { projectTags.disableTag(name, on); projectTags.save() }
const excludeOn = computed({ get: () => filter.excludeOn, set: (v: boolean) => filter.setExclude(v, filter.excludeTags) })
const excludeTags = computed({ get: () => filter.excludeTags, set: (v: string[]) => filter.setExclude(filter.excludeOn, v) })

onMounted(() => { if (!data.data) data.load(); loadFileStatus(); loadHistory(); loadManBackups(); if (!projectTags.loaded) projectTags.load() })
</script>

<template>
  <div class="data-view">
    <div class="dv-top">
      <h2 class="dv-title">数据管理</h2>
      <div class="dv-times u-num">处理 <b>{{ lastUpdate }}</b> · PMIS <b>{{ lastPmis }}</b></div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">数据来源（两种方式）</div>
      <div class="dv-row dv-hint">
        ① 页面导入：在下方「数据文件清单」逐类上传。
        ② 本地放置：把文件放到服务器目录后点「更新数据」生效——
        PMIS 九表放 <b>input/pmis/</b>，其余 CSV/xlsx（含核心回款源 collection_stages.csv）放 <b>input/</b> 根；
        服务器定时任务投放后，凭下方各文件「最近修改时间」核对是否到位。
      </div>
    </div>

    <div class="dv-card" data-test="files-card">
      <div class="dv-card-head">数据文件清单与状态</div>
      <div class="dv-sub-head">PMIS 九表（input/pmis/）</div>
      <div v-for="name in PMIS_FILE_NAMES" :key="name" class="dv-frow" data-test="pmis-row">
        <span class="dv-fname">{{ name }}</span>
        <span class="dv-ftime u-num">{{ ftime(name) }}</span>
      </div>
      <div class="dv-row dv-actions">
        <input ref="pmisInput" type="file" accept=".xlsx" multiple class="dv-file" />
        <button class="dv-btn" @click="onPmisUpload">上传 PMIS 文件</button>
        <span v-if="pmisUploadMsg" class="dv-hint">{{ pmisUploadMsg }}</span>
      </div>

      <div class="dv-sub-head">项目域文件（input/ 根）</div>
      <div v-for="name in INPUT_DISPLAY_NAMES" :key="name" class="dv-frow">
        <span class="dv-fname">{{ name }}</span>
        <span class="dv-ftime u-num">{{ ftime(name) }}</span>
      </div>
      <div class="dv-row dv-actions">
        <input ref="inputsInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
        <button class="dv-btn" @click="onUploadInputs">上传项目域文件</button>
        <span v-if="inputsUploadMsg" class="dv-hint">{{ inputsUploadMsg }}</span>
      </div>
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
        <div class="dv-row"><span class="dv-label">清空数据</span><button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button><span v-if="clearState" class="dv-hint ok">{{ clearState }}</span></div>
      </div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">项目标签</div>
      <div class="dv-row dv-tags-mgr">
        <span class="dv-label">标签库</span>
        <span v-for="t in projectTags.tags" :key="t.name" class="dv-tag" :class="{ off: t.disabled }">
          <input class="dv-tag-name" :value="t.name" @change="onRename(t.name, $event)" />
          <el-switch :model-value="!t.disabled" size="small" @update:model-value="(v: boolean) => onDisable(t.name, !v)" />
        </span>
        <el-input v-model="newTag" size="small" placeholder="新标签" style="width: 120px" @keyup.enter="onAddTag" />
        <button class="dv-btn" @click="onAddTag">添加</button>
      </div>
      <div class="dv-row">
        <span class="dv-label">按标签排除</span>
        <el-switch v-model="excludeOn" />
        <el-select v-model="excludeTags" size="small" multiple collapse-tags clearable placeholder="选要排除的标签" style="width: 220px">
          <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
        </el-select>
        <span class="dv-hint">开启后，挂有所选标签的项目从所有看板隐藏（替代旧纳管）</span>
      </div>
    </div>

    <div class="dv-card" data-test="manual-import-card">
      <div class="dv-card-head">人工数据导入 / 回滚</div>
      <div class="dv-row">
        <span class="dv-label">导入 xlsx</span>
        <input ref="manImportInput" type="file" accept=".xlsx,.xls" class="dv-file" @change="onManImport" :disabled="manBusy" />
        <span class="dv-hint">仅「项目标签」「跟进记录」sheet 整表替换；导入前自动快照</span>
      </div>
      <div v-if="manMsg" class="dv-row dv-hint ok">{{ manMsg }}</div>
      <table v-if="manErrors.length" class="dv-err u-num">
        <thead><tr><th>Sheet</th><th>行</th><th>列</th><th>错误</th></tr></thead>
        <tbody>
          <tr v-for="(e, i) in manErrors" :key="i">
            <td>{{ e.sheet }}</td><td>{{ e.row }}</td><td>{{ e.col || '-' }}</td><td>{{ e.message }}</td>
          </tr>
        </tbody>
      </table>
      <div v-for="b in manBackups" :key="b.id" class="dv-row" data-test="man-backup-row">
        <span class="dv-label u-num">{{ b.createdAt || b.id }}（标签{{ b.tagProjects ?? 0 }}/跟进{{ b.followupCount ?? 0 }}）</span>
        <button class="dv-btn" :disabled="manBusy" @click="onManRollback(b.id)">回滚到此</button>
      </div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">数据历史 / 回滚</div>
      <div v-if="historyPre" class="dv-row">
        <span class="dv-label">撤销</span>
        <button class="dv-btn ghost" :disabled="historyBusy" @click="onUndoRollback">撤销上次回滚</button>
        <span class="dv-hint">恢复到最近一次回滚前的状态</span>
      </div>
      <div v-if="!historyVersions.length" class="dv-hint">暂无历史版本，"更新数据"成功后会自动保存（保留最近 5 份）。</div>
      <div v-for="v in historyVersions" :key="v.id" class="dv-row" data-test="history-row">
        <span class="dv-label u-num">{{ v.createdAt || v.id }}</span>
        <span class="dv-hint u-num">项目 {{ v.projectCount ?? '-' }} · 节点 {{ v.paymentNodeCount ?? '-' }} · {{ fmtMB(v.sizeBytes) }}</span>
        <button class="dv-btn" :disabled="historyBusy" data-test="history-rollback" @click="onRollback(v.id)">回滚到此</button>
      </div>
      <div class="dv-row dv-hint" data-test="history-source-note">
        源数据仅保留最新 1 份<template v-if="historySource?.refreshedAt">（来自 {{ historySource.refreshedAt }}{{ historySource.sizeBytes ? ' · ' + fmtMB(historySource.sizeBytes) : '' }}）</template>，回滚仅还原看板数据。
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
.dv-sub-head { font-size: var(--fs-1); font-weight: 700; color: var(--sub); padding: var(--sp-2) var(--sp-4) 0; }
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
.dv-tags-mgr { flex-wrap: wrap; gap: var(--sp-2); }
.dv-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 1px solid var(--line); border-radius: var(--r-sm); }
.dv-tag.off { opacity: .5; }
.dv-tag-name { width: 84px; border: none; background: transparent; color: var(--txt); font-size: var(--fs-1); }
.dv-err { width: 100%; border-collapse: collapse; font-size: var(--fs-1); margin: var(--sp-2) 0; }
.dv-err th, .dv-err td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; color: var(--danger-text); }
</style>
