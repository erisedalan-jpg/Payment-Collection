<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { api } from '@/api/client'
import { pingAgent } from '@/lib/cookieAgent'
import { useReprocess } from '@/composables/useReprocess'
import { useDataHistory } from '@/composables/useDataHistory'
import { readWorkbook, parseManualSheets } from '@/lib/manualImport'
import { manualApi, type ManualError, type ManualBackup } from '@/lib/manualApi'
import DataStatusBar from '@/components/DataStatusBar.vue'
import MainDomainSourceCard from '@/components/MainDomainSourceCard.vue'
import YitianSourceCard from '@/components/YitianSourceCard.vue'
import ProjectTagsCard from '@/components/ProjectTagsCard.vue'
import PortalConfigCard from '@/components/PortalConfigCard.vue'
import YitianScopeCard from '@/components/YitianScopeCard.vue'
import YitianStoreCard from '@/components/YitianStoreCard.vue'
import YitianRulesCard from '@/components/YitianRulesCard.vue'
import { useAuthStore } from '@/stores/auth'

const data = useDataStore()
const projectTags = useProjectTagsStore()
const auth = useAuthStore()

// tab 不持久化:每次进入默认落「数据源」签(更新数据已常驻,签只在偶尔改配置/回滚时才切)
const activeTab = ref('sources')

const mainCard = ref<InstanceType<typeof MainDomainSourceCard> | null>(null)
const yitianCard = ref<InstanceType<typeof YitianSourceCard> | null>(null)
const dlRunning = ref(false)

const lastUpdate = computed(() => (data.data?.meta as any)?.lastUpdate || '-')
const lastPmis = computed(() => (data.data as any)?.dataQuality?.summary?.lastPmisUpdate || '-')

// —— 更新数据 / 设置 ——
const { progress: repProgress, message: repMessage, running: repRunning, start: startReprocess } =
  useReprocess({ onDone: () => { data.reload(); mainCard.value?.reload(); yitianCard.value?.reload(); projectTags.load() } })

// —— PMIS 在线下载 ——
const cookieStatus = ref<{ sessionPreview: string; updatedAt: string }>({ sessionPreview: '', updatedAt: '' })
const agentOnline = ref(false)
const yitianStatus = ref<{ sessionPreview: string; updatedAt: string }>({ sessionPreview: '', updatedAt: '' })

async function checkAgent() {
  agentOnline.value = await pingAgent()
}
async function loadYitianStatus() {
  try { yitianStatus.value = await api.get('/api/yitian/cookie') } catch { /* 未登录/缺接口静默 */ }
}

async function loadCookieStatus() {
  try { cookieStatus.value = await api.get('/api/pmis/cookie') } catch { /* 未登录/缺接口静默 */ }
}
const { versions: historyVersions, preRollback: historyPre, source: historySource, busy: historyBusy,
        message: historyMsg, load: loadHistory, rollback: doRollback, undo: doUndo } =
  useDataHistory({ onChange: () => { data.reload(); mainCard.value?.reload(); yitianCard.value?.reload() } })
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

onMounted(() => { if (!data.data) data.load(); loadHistory(); loadManBackups(); if (!projectTags.loaded) projectTags.load(); loadCookieStatus() })
onMounted(() => { checkAgent(); loadYitianStatus() })
defineExpose({
  onFetchPmisCookie: () => mainCard.value?.onFetchPmisCookie(),
  onFetchYitianCookie: () => yitianCard.value?.onFetchYitianCookie(),
  checkAgent,
})
</script>

<template>
  <div class="data-view">
    <div class="dv-top">
      <h2 class="dv-title">数据管理</h2>
    </div>

    <DataStatusBar :last-update="lastUpdate" :last-pmis="lastPmis" :agent-online="agentOnline"
      :cookie-status="cookieStatus" :yitian-status="yitianStatus" />

    <!-- 主操作:更新看板 -->
    <div class="dv-card dv-primary">
      <div class="dv-card-head">更新看板</div>
      <div class="dv-row dv-hint">
        两种方式二选一：从 PMIS 在线抓取覆盖 input/，或手动上传文件到 input/（PMIS 九表放
        <b>input/pmis/</b>，其余 CSV/xlsx（含核心回款源 collection_stages.csv）放 <b>input/</b> 根）；获取后点「更新数据」生效。
      </div>
      <div class="dv-row">
        <button class="dv-btn primary dv-btn-lg" :disabled="repRunning || dlRunning" @click="startReprocess()">更新数据（重新处理）</button>
        <span class="dv-hint">读取已获取数据重算看板</span>
      </div>
      <div v-if="repRunning || repProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: repProgress + '%' }"></div></div><div class="dv-msg">{{ repMessage }}</div></div>
    </div>

    <el-tabs v-model="activeTab" class="dv-tabs">
      <!-- 注意:绝不给 el-tab-pane 设 lazy(EP 2.14.1 默认 false=全渲染+v-show 隐藏);
           一旦设 lazy,现有 data-test 查询与冷加载行为同时改变。 -->
      <el-tab-pane label="数据源" name="sources">
        <div class="dv-pane-grid">
          <MainDomainSourceCard ref="mainCard" :rep-running="repRunning"
            @cookie-change="(v) => cookieStatus = v"
            @download-done="loadCookieStatus"
            @running-change="(v: boolean) => dlRunning = v" />

          <YitianSourceCard ref="yitianCard" :yitian-status="yitianStatus"
            @cookie-change="(v) => yitianStatus = v" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="配置" name="config">
        <div class="dv-pane-grid">
          <ProjectTagsCard />

          <div v-if="auth.isSuper" class="dv-card">
            <div class="dv-card-head">倚天合规</div>
            <el-collapse class="dv-more">
              <el-collapse-item name="yitian-scope" title="合规检查范围（超管）">
                <YitianScopeCard />
              </el-collapse-item>
              <el-collapse-item name="yitian-rules" title="合规规则配置（超管）">
                <YitianRulesCard />
              </el-collapse-item>
            </el-collapse>
          </div>

          <div v-if="auth.isSuper" class="dv-card dv-span-all">
            <div class="dv-card-head">首页门户</div>
            <el-collapse class="dv-more">
              <el-collapse-item name="portal" title="首页门户 / 快捷入口">
                <PortalConfigCard />
              </el-collapse-item>
            </el-collapse>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="维护" name="maint">
        <div class="dv-card">
          <div class="dv-card-head">维护与历史</div>
          <el-collapse class="dv-maint">
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

            <el-collapse-item v-if="auth.isSuper" name="yitian-store" title="倚天累积数据管理（超管）">
              <YitianStoreCard />
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
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

.data-view { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--gap-card); }
.dv-top { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-2); }
.dv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }

/* 主操作:更新看板,提为显眼主操作区(色调+更粗边框,不引入新色号) */
.dv-primary {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
  background: color-mix(in srgb, var(--accent) 5%, var(--card));
  box-shadow: var(--shadow-2);
}
.dv-primary .dv-card-head { color: var(--accent); border-bottom-color: color-mix(in srgb, var(--accent) 25%, var(--line)); }

/* 显式两栏:卡的位置由设计决定,不由浏览器宽度决定(旧 auto-fit 让 5 张高度差 4~5 倍的卡排出参差) */
.dv-pane-grid {
  display: grid;
  gap: var(--gap-card);
  grid-template-columns: 1fr 1fr;
  align-items: start;
}
.dv-span-all { grid-column: 1 / -1; }
@media (max-width: 768px) { .dv-pane-grid { grid-template-columns: 1fr; } }
.dv-tabs :deep(.el-tabs__item) { font-size: var(--fs-2); font-weight: 700; }
.dv-tabs :deep(.el-tabs__content) { padding-top: var(--gap-section); }

/* 以下为单卡专用规则(非共享词汇,故未进 dataview.css);剩余几张卡仍内联在本文件内,
   删掉会破坏「页面观感须与 Task 2 之前完全一致」——逐张抽卡时随卡搬到各自组件。 */
.dv-err { width: 100%; border-collapse: collapse; font-size: var(--fs-1); margin: var(--sp-2) 0; }
.dv-err th, .dv-err td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; color: var(--danger-text); }
.dv-danger-title { color: var(--danger-text); font-weight: 700; }
</style>
