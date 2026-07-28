<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { fetchYitianCookie } from '@/lib/cookieAgent'
import { useInputFiles } from '@/composables/useInputFiles'
import { useFileStatus } from '@/composables/useFileStatus'
import { YITIAN_FILE_NAMES } from '@/lib/uploadDispatch'
import { useYitianStore } from '@/stores/yitian'

defineProps<{ yitianStatus: { sessionPreview: string; updatedAt: string } }>()
const emit = defineEmits<{
  (e: 'cookie-change', v: { sessionPreview: string; updatedAt: string }): void
}>()

const { upload: inputsUpload } = useInputFiles()
const { files: fileStatus, load: loadFileStatus } = useFileStatus()
const ftime = (name: string) => fileStatus.value[name] || '-'

// TOP1000 / 产品分类两张源表的解析状态(V4.5.4)。倚天数据未加载时为 null,整块不渲染
// —— 列缺失要显式告警,而不是让客户象限/产品大类静默全空(TOP1000 此前零可观测性)。
const yStore = useYitianStore()
const rd = computed(() => yStore.data?.meta?.dataReadiness ?? null)

const yitianInput = ref<HTMLInputElement | null>(null)
const yitianUploadMsg = ref('')
// 有跳过或有失败(HTTP 层被服务端拒收)都要黄字提醒,故名 yitianWarn 而非 yitianSkipped
const yitianWarn = ref(false)
async function onUploadYitian() {
  const files = Array.from(yitianInput.value?.files || [])
  if (!files.length) return
  const accepted = files.filter((f) => YITIAN_FILE_NAMES.includes(f.name))
  const skipped = files.filter((f) => !YITIAN_FILE_NAMES.includes(f.name))
  const ok = accepted.length ? await inputsUpload(accepted) : 0
  const failed = accepted.length - ok
  let msg = `已上传 ${ok} 个倚天文件,请点[更新数据]生效`
  if (failed > 0) msg += `;失败 ${failed} 个（服务端未接收,请重试）`
  if (skipped.length) msg += ';已跳过:' + skipped.map((f) => `${f.name}（不在倚天白名单）`).join('、')
  yitianUploadMsg.value = msg
  yitianWarn.value = skipped.length > 0 || failed > 0
  if (yitianInput.value) yitianInput.value.value = ''
  loadFileStatus()
}

/** holidays.csv 模板:前端生成 Blob 下载,不需要后端。 */
function onDownloadHolidayTemplate() {
  const lines = ['日期,类型', '2026-01-01,休', '2026-02-16,休', '2026-02-14,班']
  // BOM 让 Excel 打开不乱码
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'holidays.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

const yitianMsg = ref('')
const yitianErr = ref(false)
async function onFetchYitianCookie() {
  yitianMsg.value = ''; yitianErr.value = false
  const res = await fetchYitianCookie()
  if (!res.ok) { yitianErr.value = true; yitianMsg.value = '倚天 cookie 获取失败：' + res.error; return }
  try {
    const r = await api.post<{ sessionPreview: string }>('/api/yitian/cookie', { cookie: res.cookie })
    emit('cookie-change', { sessionPreview: r.sessionPreview, updatedAt: '刚刚' })
    yitianMsg.value = `已获取并存储倚天 cookie（${res.names.length} 项，备用）`
  } catch (e) {
    yitianErr.value = true; yitianMsg.value = '存储失败：' + (e instanceof Error ? e.message : String(e))
  }
}

onMounted(() => { loadFileStatus() })
defineExpose({ reload: loadFileStatus, onFetchYitianCookie })
</script>

<template>
  <div class="dv-card">
    <div class="dv-card-head">倚天工时域</div>
    <div class="dv-sub-head">倚天工时域（input/yitian/）</div>
    <div class="dv-fgrid">
      <div v-for="name in YITIAN_FILE_NAMES" :key="name" class="dv-fcell" :title="name">
        <span class="dv-fname2">{{ name }}</span>
        <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
      </div>
    </div>
    <div v-if="rd" class="ysc-rd">
      <div class="ysc-rd-row">
        <span>TOP1000.xlsx</span>
        <span v-if="!rd.top1000.provided" class="ysc-warn">未提供</span>
        <span v-else>
          {{ rd.top1000.rows }} 家 · 匹配 {{ rd.top1000.matchedCustomers }}
          <span v-if="!rd.top1000.hasQuad" class="ysc-warn">· 未找到象限列</span>
          <span v-if="!rd.top1000.hasBg" class="ysc-warn">· 未找到市场BG列</span>
        </span>
      </div>
      <div class="ysc-rd-row">
        <span>产品分类.xlsx</span>
        <span v-if="!rd.productCategory.provided" class="ysc-warn">未提供</span>
        <span v-else>
          {{ rd.productCategory.rows }} 条 · 覆盖产品线
          {{ rd.productCategory.coveredLines }}/{{ rd.productCategory.totalLines }}
        </span>
      </div>
    </div>
    <div class="dv-row dv-actions">
      <input ref="yitianInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
      <button class="dv-btn" data-test="btn-upload-yitian" @click="onUploadYitian">上传倚天文件</button>
      <button class="dv-btn" @click="onDownloadHolidayTemplate">下载 holidays.csv 模板</button>
    </div>
    <div v-if="yitianUploadMsg" class="dv-row dv-hint" :class="{ warn: yitianWarn }" data-test="upload-yitian-msg">{{ yitianUploadMsg }}</div>

    <div class="dv-row dv-actions">
      <button class="dv-btn" data-test="btn-fetch-yitian-cookie" @click="onFetchYitianCookie">获取本机倚天 cookie 并存储</button>
      <span class="dv-hint">当前 {{ yitianStatus.sessionPreview || '-' }} · 更新于 {{ yitianStatus.updatedAt || '-' }}</span>
    </div>
    <div v-if="yitianMsg" class="dv-row dv-hint" :class="yitianErr ? 'err' : 'ok'">{{ yitianMsg }}</div>

    <el-collapse class="dv-more">
      <el-collapse-item name="holidays-fmt" title="holidays.csv 格式说明">
        <div class="dv-hint dv-fmt">
          holidays.csv 格式（UTF-8，两列）：<code>日期,类型</code>；类型只有两种——
          <code>休</code>=法定假/调休放假（即使落在周一~周五），<code>班</code>=调休上班（即使落在周末）。
          未列出的日期按「周一~周五为工作日」处理。不提供该文件时全站按纯周一~周五近似，
          含节假日的周期饱和度会偏低。
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:两张源表解析状态。横向内边距与 .dv-fgrid 对齐,否则贴到卡边框上 */
.ysc-rd { display: flex; flex-direction: column; gap: var(--sp-1); margin-top: var(--sp-2); padding: 0 var(--sp-4); }
.ysc-rd-row { display: flex; justify-content: space-between; gap: var(--sp-2);
              font-size: var(--fs-1); color: var(--sub); }
.ysc-warn { color: var(--warn-text); }

/* 本卡特有:holidays.csv 格式说明排版 */
.dv-fmt { padding: var(--sp-1) var(--sp-4) var(--sp-2); line-height: var(--lh-base); }
.dv-fmt code { background: var(--card2, var(--card)); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 0 4px; }
</style>
