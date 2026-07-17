<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { api } from '@/api/client'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useAuthStore } from '@/stores/auth'
import { useDataHistory } from '@/composables/useDataHistory'
import { readWorkbook, parseManualSheets } from '@/lib/manualImport'
import { manualApi, type ManualError, type ManualBackup } from '@/lib/manualApi'
import YitianStoreCard from '@/components/YitianStoreCard.vue'

const data = useDataStore()
const projectTags = useProjectTagsStore()
const auth = useAuthStore()

const emit = defineEmits<{ (e: 'data-changed'): void }>()

const { versions: historyVersions, preRollback: historyPre, source: historySource, busy: historyBusy,
        message: historyMsg, load: loadHistory, rollback: doRollback, undo: doUndo } =
  useDataHistory({ onChange: () => { data.reload(); emit('data-changed') } })
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

onMounted(() => { loadHistory(); loadManBackups() })
</script>

<template>
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
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:人工导入校验错误表 + 危险区标题 */
.dv-err { width: 100%; border-collapse: collapse; font-size: var(--fs-1); margin: var(--sp-2) 0; }
.dv-err th, .dv-err td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; color: var(--danger-text); }
.dv-danger-title { color: var(--danger-text); font-weight: 700; }
</style>
