<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useFilterStore } from '@/stores/filter'
import { api } from '@/api/client'
import { pingAgent, fetchPmisCookie, fetchYitianCookie } from '@/lib/cookieAgent'
import { usePmisSync } from '@/composables/usePmisSync'
import { useInputFiles } from '@/composables/useInputFiles'
import { useFileStatus } from '@/composables/useFileStatus'
import { useReprocess } from '@/composables/useReprocess'
import { usePmisDownload } from '@/composables/usePmisDownload'
import { useDataHistory } from '@/composables/useDataHistory'
import { readWorkbook, parseManualSheets } from '@/lib/manualImport'
import { manualApi, type ManualError, type ManualBackup } from '@/lib/manualApi'
import DataStatusBar from '@/components/DataStatusBar.vue'

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
  useReprocess({ onDone: () => { data.reload(); loadFileStatus(); projectTags.load() } })

// —— PMIS 在线下载 ——
const pmisCookie = ref('')
const cookieStatus = ref<{ sessionPreview: string; updatedAt: string }>({ sessionPreview: '', updatedAt: '' })
const cookieMsg = ref('')
const cookieErr = ref(false)
const agentOnline = ref(false)
const yitianStatus = ref<{ sessionPreview: string; updatedAt: string }>({ sessionPreview: '', updatedAt: '' })
const yitianMsg = ref('')
const yitianErr = ref(false)

async function checkAgent() {
  agentOnline.value = await pingAgent()
}
async function loadYitianStatus() {
  try { yitianStatus.value = await api.get('/api/yitian/cookie') } catch { /* 未登录/缺接口静默 */ }
}

async function onFetchPmisCookie() {
  cookieMsg.value = ''; cookieErr.value = false
  const res = await fetchPmisCookie()
  if (!res.ok) { cookieErr.value = true; cookieMsg.value = 'PMIS cookie 获取失败：' + res.error; return }
  if (!res.hasSession) {
    cookieErr.value = true
    cookieMsg.value = '未检测到 PMIS 登录态（cookie 无 SESSION），请先在零信任内登录 PMIS'
    return
  }
  try {
    const r = await api.post<{ sessionPreview: string }>('/api/pmis/cookie', { cookie: res.cookie })
    cookieStatus.value = { sessionPreview: r.sessionPreview, updatedAt: '刚刚' }
    cookieMsg.value = `已获取并推送 PMIS cookie（${res.names.length} 项）`
  } catch (e) {
    cookieErr.value = true; cookieMsg.value = '推送失败：' + (e instanceof Error ? e.message : String(e))
  }
}

async function onFetchYitianCookie() {
  yitianMsg.value = ''; yitianErr.value = false
  const res = await fetchYitianCookie()
  if (!res.ok) { yitianErr.value = true; yitianMsg.value = '倚天 cookie 获取失败：' + res.error; return }
  try {
    const r = await api.post<{ sessionPreview: string }>('/api/yitian/cookie', { cookie: res.cookie })
    yitianStatus.value = { sessionPreview: r.sessionPreview, updatedAt: '刚刚' }
    yitianMsg.value = `已获取并存储倚天 cookie（${res.names.length} 项，备用）`
  } catch (e) {
    yitianErr.value = true; yitianMsg.value = '存储失败：' + (e instanceof Error ? e.message : String(e))
  }
}

const { progress: dlProgress, message: dlMessage, running: dlRunning, start: startDownload } =
  usePmisDownload({ onDone: () => { loadFileStatus(); loadCookieStatus() } })

async function loadCookieStatus() {
  try { cookieStatus.value = await api.get('/api/pmis/cookie') } catch { /* 未登录/缺接口静默 */ }
}
async function onDownload() {
  cookieMsg.value = ''; cookieErr.value = false
  const ck = pmisCookie.value.trim()
  if (ck) {
    try {
      const r = await api.post<{ sessionPreview: string }>('/api/pmis/cookie', { cookie: ck })
      cookieStatus.value = { sessionPreview: r.sessionPreview, updatedAt: '刚刚' }
      pmisCookie.value = ''
    } catch (e) {
      cookieErr.value = true
      cookieMsg.value = 'Cookie 保存失败：' + (e instanceof Error ? e.message : String(e))
      return  // cookie 失败则中止,不进入下载
    }
  }
  await startDownload()
}
const { versions: historyVersions, preRollback: historyPre, source: historySource, busy: historyBusy,
        message: historyMsg, load: loadHistory, rollback: doRollback, undo: doUndo } =
  useDataHistory({ onChange: () => { data.reload(); loadFileStatus() } })
function fmtMB(bytes?: number) { return bytes ? (bytes / 1048576).toFixed(1) + ' MB' : '-' }
async function onRollback(id: string) {
  try {
    await ElMessageBox.confirm(`确定回滚到 ${id}？将用该版本覆盖当前数据与源数据，当前状态会先备份可撤销。`, '确认', { type: 'warning' })
  } catch {
    return
  }
  await doRollback(id)
}
async function onUndoRollback() {
  try {
    await ElMessageBox.confirm('确定撤销上次回滚，恢复回滚前的状态？', '确认', { type: 'warning' })
  } catch {
    return
  }
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
  try {
    await ElMessageBox.confirm('确定要清空所有数据吗？此操作不可撤销!', '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await ElMessageBox.confirm('再次确认：是否清空所有数据？', '确认', { type: 'warning' })
  } catch {
    return
  }
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

onMounted(() => { if (!data.data) data.load(); loadFileStatus(); loadHistory(); loadManBackups(); if (!projectTags.loaded) projectTags.load(); loadCookieStatus() })
onMounted(() => { checkAgent(); loadYitianStatus() })
defineExpose({ onFetchPmisCookie, onFetchYitianCookie, checkAgent })
</script>

<template>
  <div class="data-view">
    <div class="dv-top">
      <h2 class="dv-title">数据管理</h2>
    </div>

    <DataStatusBar :last-update="lastUpdate" :last-pmis="lastPmis" :agent-online="agentOnline"
      :cookie-status="cookieStatus" :yitian-status="yitianStatus" />

    <div class="dv-card dv-main">
      <div class="dv-card-head">获取与更新数据</div>

      <div class="dv-step">① 获取数据</div>
      <div class="dv-row dv-src-note dv-hint">
        两种方式二选一：从 PMIS 在线抓取覆盖 input/，或手动上传文件到 input/（PMIS 九表放
        <b>input/pmis/</b>，其余 CSV/xlsx（含核心回款源 collection_stages.csv）放 <b>input/</b> 根）；获取后点「更新数据」生效。
      </div>

      <div class="dv-paths u-grid-auto">
        <div class="dv-path">
          <div class="dv-path-head">在线获取（PMIS）</div>
          <div class="dv-row">
            <button class="dv-btn primary" data-test="btn-fetch-pmis-cookie" @click="onFetchPmisCookie">获取本机 PMIS cookie 并推送</button>
            <span class="dv-badge" :class="agentOnline ? 'ok' : 'warn'">本机代理{{ agentOnline ? '已连接' : '未运行' }}</span>
          </div>
          <div v-if="cookieMsg" class="dv-row dv-hint" :class="cookieErr ? 'err' : 'ok'">{{ cookieMsg }}</div>
          <div class="dv-row">
            <button class="dv-btn" data-test="btn-download" :disabled="dlRunning || repRunning" @click="onDownload">下载数据</button>
            <span class="dv-hint">从 PMIS 抓取并覆盖 input/（只抓取不重算）</span>
          </div>
          <div v-if="dlRunning || dlProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: dlProgress + '%' }"></div></div><div class="dv-msg">{{ dlMessage }}</div></div>
        </div>

        <div class="dv-path" data-test="files-card">
          <div class="dv-path-head">上传文件</div>
          <div class="dv-sub-head">PMIS 九表（input/pmis/）</div>
          <div class="dv-fgrid">
            <div v-for="name in PMIS_FILE_NAMES" :key="name" class="dv-fcell" data-test="pmis-row" :title="name">
              <span class="dv-fname2">{{ name }}</span>
              <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
            </div>
          </div>
          <div class="dv-row dv-actions">
            <input ref="pmisInput" type="file" accept=".xlsx" multiple class="dv-file" />
            <button class="dv-btn" @click="onPmisUpload">上传 PMIS 文件</button>
            <span v-if="pmisUploadMsg" class="dv-hint">{{ pmisUploadMsg }}</span>
          </div>
          <div class="dv-sub-head">项目域文件（input/ 根）</div>
          <div class="dv-fgrid">
            <div v-for="name in INPUT_DISPLAY_NAMES" :key="name" class="dv-fcell" :title="name">
              <span class="dv-fname2">{{ name }}</span>
              <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
            </div>
          </div>
          <div class="dv-row dv-actions">
            <input ref="inputsInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
            <button class="dv-btn" @click="onUploadInputs">上传项目域文件</button>
            <span v-if="inputsUploadMsg" class="dv-hint">{{ inputsUploadMsg }}</span>
          </div>
        </div>
      </div>

      <el-collapse class="dv-more">
        <el-collapse-item name="more" title="更多：手动粘贴 cookie / 倚天 cookie（取备用）">
          <div class="dv-row dv-cookie">
            <span class="dv-label">手动 cookie</span>
            <textarea v-model="pmisCookie" data-test="pmis-cookie" class="dv-cookie-box" rows="2"
              placeholder="粘贴完整 PMIS cookie 串（高级兜底；正常用上方「获取本机 cookie」）"></textarea>
          </div>
          <div class="dv-row">
            <button class="dv-btn" data-test="btn-fetch-yitian-cookie" @click="onFetchYitianCookie">获取本机倚天 cookie 并存储</button>
            <span class="dv-hint">当前 {{ yitianStatus.sessionPreview || '-' }} · 更新于 {{ yitianStatus.updatedAt || '-' }}</span>
          </div>
          <div v-if="yitianMsg" class="dv-row dv-hint" :class="yitianErr ? 'err' : 'ok'">{{ yitianMsg }}</div>
        </el-collapse-item>
      </el-collapse>

      <div class="dv-step">② 更新看板</div>
      <div class="dv-row">
        <button class="dv-btn primary dv-btn-lg" :disabled="repRunning || dlRunning" @click="startReprocess()">更新数据（重新处理）</button>
        <span class="dv-hint">读取已获取数据重算看板</span>
      </div>
      <div v-if="repRunning || repProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: repProgress + '%' }"></div></div><div class="dv-msg">{{ repMessage }}</div></div>
    </div>

    <div class="dv-section-label">维护</div>
    <el-collapse class="dv-maint">
      <el-collapse-item name="tags" title="项目标签">
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
      </el-collapse-item>

      <el-collapse-item name="manual" title="人工数据导入 / 回滚">
        <div data-test="manual-import-card">
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
      </el-collapse-item>

      <el-collapse-item name="history" title="数据历史 / 回滚">
        <div v-if="historyPre" class="dv-row">
          <span class="dv-label">撤销</span>
          <button class="dv-btn ghost" :disabled="historyBusy" @click="onUndoRollback">撤销上次回滚</button>
          <span class="dv-hint">恢复到最近一次回滚前的状态</span>
        </div>
        <div v-if="!historyVersions.length" class="dv-row dv-hint">暂无历史版本，"更新数据"成功后会自动保存（保留最近 5 份）。</div>
        <div v-for="v in historyVersions" :key="v.id" class="dv-row" data-test="history-row">
          <span class="dv-label u-num">{{ v.createdAt || v.id }}</span>
          <span class="dv-hint u-num">项目 {{ v.projectCount ?? '-' }} · 节点 {{ v.paymentNodeCount ?? '-' }} · {{ fmtMB(v.sizeBytes) }}</span>
          <button class="dv-btn" :disabled="historyBusy" data-test="history-rollback" @click="onRollback(v.id)">回滚到此</button>
        </div>
        <div class="dv-row dv-hint" data-test="history-source-note">
          源数据仅保留最新 1 份<template v-if="historySource?.refreshedAt">（来自 {{ historySource.refreshedAt }}{{ historySource.sizeBytes ? ' · ' + fmtMB(historySource.sizeBytes) : '' }}）</template>，回滚仅还原看板数据。
        </div>
        <div v-if="historyMsg" class="dv-row dv-hint ok">{{ historyMsg }}</div>
      </el-collapse-item>

      <el-collapse-item name="clear">
        <template #title><span class="dv-danger-title">清空数据 ⚠</span></template>
        <div class="dv-row">
          <button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button>
          <span v-if="clearState" class="dv-hint ok">{{ clearState }}</span>
          <span class="dv-hint">删除所有已获取数据与看板，不可撤销（两步确认）。</span>
        </div>
      </el-collapse-item>
    </el-collapse>
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
.dv-msg { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-2); }
.dv-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-card); }
@media (max-width: 768px) { .dv-grid2 { grid-template-columns: 1fr; } }
.dv-tags-mgr { flex-wrap: wrap; gap: var(--sp-2); }
.dv-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 1px solid var(--line); border-radius: var(--r-sm); }
.dv-tag.off { opacity: .5; }
.dv-tag-name { width: 84px; border: none; background: transparent; color: var(--txt); font-size: var(--fs-1); }
.dv-err { width: 100%; border-collapse: collapse; font-size: var(--fs-1); margin: var(--sp-2) 0; }
.dv-err th, .dv-err td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; color: var(--danger-text); }
.dv-cookie { align-items: flex-start; }
.dv-cookie-box { flex: 1 1 320px; min-width: 220px; font-size: var(--fs-1); font-family: var(--font-sans);
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card); color: var(--txt);
  padding: var(--sp-2); resize: vertical; }
.dv-fgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 2px var(--sp-4); padding: var(--sp-2) var(--sp-4); }
.dv-fcell { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); padding: 3px 0; border-bottom: 1px dashed var(--line); min-width: 0; }
.dv-fname2 { color: var(--txt); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dv-ftime2 { color: var(--mut); font-size: var(--fs-1); flex-shrink: 0; }
@media (max-width: 768px) { .dv-fgrid { grid-template-columns: 1fr; } }
.dv-main { padding-bottom: var(--sp-3); }
.dv-step { font-size: var(--fs-2); font-weight: 700; color: var(--txt); padding: var(--sp-3) var(--sp-4) 0; }
.dv-section-label { font-size: var(--fs-1); font-weight: 700; color: var(--sub); margin-top: var(--sp-3); padding: 0 var(--sp-1); }
.dv-src-note { padding-top: var(--sp-2); }
.dv-paths { padding: var(--sp-2) var(--sp-4) var(--sp-3); }
.dv-path { border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card2, var(--card)); padding-bottom: var(--sp-2); }
.dv-path-head { font-size: var(--fs-2); font-weight: 700; color: var(--txt); padding: var(--sp-2) var(--sp-3) 0; }
.dv-path .dv-row { padding: var(--sp-2) var(--sp-3); }
.dv-path .dv-sub-head { padding-left: var(--sp-3); }
.dv-path .dv-fgrid { padding-left: var(--sp-3); padding-right: var(--sp-3); }
.dv-path .dv-actions { border-top: 1px dashed var(--line); }
.dv-badge { font-size: var(--fs-1); font-weight: 600; padding: 2px 8px; border-radius: var(--r-full); }
.dv-badge.ok { background: var(--ok-bg); color: var(--ok-text); }
.dv-badge.warn { background: var(--warn-bg); color: var(--warn-text); }
.dv-hint.err { color: var(--danger-text); }
.dv-btn-lg { font-size: var(--fs-3); padding: var(--sp-2) var(--sp-5); }
.dv-btn.primary:hover:not(:disabled) { box-shadow: var(--lift); }
.dv-danger-title { color: var(--danger-text); font-weight: 700; }
.dv-more, .dv-maint { margin: 0; }
.dv-more :deep(.el-collapse-item__header),
.dv-maint :deep(.el-collapse-item__header) { font-size: var(--fs-2); font-weight: 700; color: var(--txt); padding-left: var(--sp-4); }
.dv-more :deep(.el-collapse-item__content),
.dv-maint :deep(.el-collapse-item__content) { padding-bottom: var(--sp-2); }
.dv-maint { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-1); }
.dv-more { border-top: 1px solid var(--line); }
</style>
