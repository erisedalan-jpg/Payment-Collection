<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { api } from '@/api/client'
import { pingAgent, fetchPmisCookie } from '@/lib/cookieAgent'
import { usePmisSync } from '@/composables/usePmisSync'
import { useInputFiles } from '@/composables/useInputFiles'
import { useFileStatus } from '@/composables/useFileStatus'
import { usePmisDownload } from '@/composables/usePmisDownload'

defineProps<{ repRunning: boolean }>()
const emit = defineEmits<{
  (e: 'cookie-change', v: { sessionPreview: string; updatedAt: string }): void
  (e: 'download-done'): void
  (e: 'running-change', v: boolean): void
}>()

const { upload: pmisUpload, PMIS_FILE_NAMES } = usePmisSync()
const { upload: inputsUpload, INPUT_FILE_NAMES } = useInputFiles()
const { files: fileStatus, load: loadFileStatus } = useFileStatus()
const ftime = (name: string) => fileStatus.value[name] || '-'

// 展示名单:legacy xlsx 仅作上传兼容不展示;倚天两文件属另一张卡
const YITIAN_FILE_NAMES = ['工时.xlsx', 'holidays.csv']
const INPUT_DISPLAY_NAMES = INPUT_FILE_NAMES
  .filter((n) => n !== 'delivery_analysis.xlsx')
  .filter((n) => !YITIAN_FILE_NAMES.includes(n))

const agentOnline = ref(false)
async function checkAgent() { agentOnline.value = await pingAgent() }

const pmisCookie = ref('')
const cookieMsg = ref('')
const cookieErr = ref(false)

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
    emit('cookie-change', { sessionPreview: r.sessionPreview, updatedAt: '刚刚' })
    cookieMsg.value = `已获取并推送 PMIS cookie（${res.names.length} 项）`
  } catch (e) {
    cookieErr.value = true; cookieMsg.value = '推送失败：' + (e instanceof Error ? e.message : String(e))
  }
}

const { progress: dlProgress, message: dlMessage, running: dlRunning, start: startDownload } =
  usePmisDownload({ onDone: () => { loadFileStatus(); emit('download-done') } })
watch(dlRunning, (v) => emit('running-change', v))

async function onDownload() {
  cookieMsg.value = ''; cookieErr.value = false
  const ck = pmisCookie.value.trim()
  if (ck) {
    try {
      const r = await api.post<{ sessionPreview: string }>('/api/pmis/cookie', { cookie: ck })
      emit('cookie-change', { sessionPreview: r.sessionPreview, updatedAt: '刚刚' })
      pmisCookie.value = ''
    } catch (e) {
      cookieErr.value = true
      cookieMsg.value = 'Cookie 保存失败：' + (e instanceof Error ? e.message : String(e))
      return  // cookie 失败则中止,不进入下载
    }
  }
  await startDownload()
}

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

onMounted(() => { loadFileStatus(); checkAgent() })
defineExpose({ reload: loadFileStatus, onFetchPmisCookie })
</script>

<template>
  <div class="dv-card" data-test="files-card">
    <div class="dv-card-head">项目主域</div>

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

    <el-collapse class="dv-more">
      <el-collapse-item name="pmis-cookie-manual" title="更多：手动粘贴 PMIS cookie（取备用）">
        <div class="dv-row dv-cookie">
          <span class="dv-label">手动 cookie</span>
          <textarea v-model="pmisCookie" data-test="pmis-cookie" class="dv-cookie-box" rows="2"
            placeholder="粘贴完整 PMIS cookie 串（高级兜底；正常用上方「获取本机 cookie」）"></textarea>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:手动 cookie 输入框 */
.dv-cookie { align-items: flex-start; }
.dv-cookie-box { flex: 1 1 320px; min-width: 220px; font-size: var(--fs-1); font-family: var(--font-sans);
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--card); color: var(--txt);
  padding: var(--sp-2); resize: vertical; }
</style>
