<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { api } from '@/api/client'
import { pingAgent, fetchPmisCookie } from '@/lib/cookieAgent'
import { usePmisSync } from '@/composables/usePmisSync'
import { useInputFiles } from '@/composables/useInputFiles'
import { useFileStatus } from '@/composables/useFileStatus'
import { usePmisDownload } from '@/composables/usePmisDownload'
import { dispatchMainDomainFiles, formatDispatchMessage, YITIAN_FILE_NAMES } from '@/lib/uploadDispatch'

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

const mainInput = ref<HTMLInputElement | null>(null)
const mainUploadMsg = ref('')
// 有跳过或有失败(HTTP 层被服务端拒收)都要黄字提醒,故名 mainWarn 而非 mainSkipped
const mainWarn = ref(false)
async function onUploadMain() {
  const files = Array.from(mainInput.value?.files || [])
  if (!files.length) return
  const r = dispatchMainDomainFiles(files)
  const okPmis = r.pmis.length ? await pmisUpload(r.pmis) : 0
  const okInputs = r.inputs.length ? await inputsUpload(r.inputs) : 0
  mainUploadMsg.value = formatDispatchMessage(r, okPmis, okInputs)
  const failed = (r.pmis.length - okPmis) + (r.inputs.length - okInputs)
  mainWarn.value = r.skipped.length > 0 || failed > 0
  if (mainInput.value) mainInput.value.value = ''
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
    <div class="dv-sub-head">项目域文件（input/ 根）</div>
    <div class="dv-fgrid">
      <div v-for="name in INPUT_DISPLAY_NAMES" :key="name" class="dv-fcell" :title="name">
        <span class="dv-fname2">{{ name }}</span>
        <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
      </div>
    </div>
    <div class="dv-row dv-actions">
      <input ref="mainInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
      <button class="dv-btn" data-test="btn-upload-main" @click="onUploadMain">上传主域数据文件</button>
    </div>
    <div v-if="mainUploadMsg" class="dv-row dv-hint" :class="{ warn: mainWarn }" data-test="upload-main-msg">{{ mainUploadMsg }}</div>

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
