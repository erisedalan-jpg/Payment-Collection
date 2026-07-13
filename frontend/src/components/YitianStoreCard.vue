<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getYitianStore, clearYitianStore, deleteYitianStoreRange,
         type YitianStoreStats } from '@/lib/yitianApi'

const stats = ref<YitianStoreStats>({ rows: 0, start: null, end: null })
const range = ref<[string, string] | null>(null)
const busy = ref(false)
const msg = ref('')
const err = ref(false)

async function refresh() {
  try {
    stats.value = await getYitianStore()
  } catch (e) {
    err.value = true
    msg.value = e instanceof Error ? e.message : '读取累积状态失败'
  }
}

onMounted(refresh)

async function onClear() {
  msg.value = ''; err.value = false
  busy.value = true
  try {
    stats.value = await clearYitianStore()
    msg.value = '累积库已清空，下次导入从零开始'
  } catch (e) {
    err.value = true
    msg.value = e instanceof Error ? e.message : '清空失败'
  } finally {
    busy.value = false
  }
}

async function onConfirmClear() {
  try {
    await ElMessageBox.confirm(
      '将删除全部已累积的倚天工时数据（不可撤销）。倚天合规检查范围等配置不受影响。',
      '清空倚天累积数据', { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' })
  } catch {
    return   // 用户取消
  }
  await onClear()
}

async function onDeleteRange() {
  msg.value = ''; err.value = false
  const r = range.value
  if (!r || !r[0] || !r[1]) {
    err.value = true
    msg.value = '请先选择要删除的日期区间'
    return
  }
  // 误删的历史周没有源文件可重导 = 永久丢失(工时.xlsx 每周被新导出覆盖，只含最近一次导出
  // 的那一周)，破坏性其实高于「清空」，必须有同级二次确认（I-4）。
  try {
    await ElMessageBox.confirm(
      `将删除 ${r[0]} ~ ${r[1]} 区间的累积工时数据（不可撤销）。该区间的原始导出文件（工时.xlsx）` +
      `通常已被之后每周的新导出覆盖，删除后无法从当前文件重新导入恢复。`,
      '删除该区间', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
  } catch {
    return   // 用户取消
  }
  busy.value = true
  try {
    const res = await deleteYitianStoreRange(r[0], r[1])
    stats.value = res.stats
    msg.value = `已删除 ${res.deleted} 行（${r[0]} ~ ${r[1]}）`
  } catch (e) {
    err.value = true
    msg.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    busy.value = false
  }
}

defineExpose({ stats, range, onClear, onDeleteRange })
</script>

<template>
  <div class="ys-card">
    <p class="ys-hint">
      倚天每周导出的是<strong>当周</strong>工时。系统按<strong>工时ID</strong>累加：新行追加、
      已存在的行覆盖更新（员工事后补填/修正后重导一遍即可修正历史，重复导入同一份文件也不会变双份）。
    </p>

    <div class="ys-stat">
      <template v-if="stats.rows">
        已累积 <strong class="u-num">{{ stats.rows }}</strong> 行，
        覆盖 <strong class="u-num">{{ stats.start }}</strong> ~ <strong class="u-num">{{ stats.end }}</strong>
      </template>
      <template v-else>尚未导入任何倚天工时数据</template>
    </div>

    <div class="ys-row">
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" unlink-panels
        range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" size="default" />
      <el-button :loading="busy" @click="onDeleteRange">删除该区间</el-button>
      <el-button type="danger" plain :loading="busy" @click="onConfirmClear">清空全部累积数据</el-button>
    </div>

    <p v-if="msg" class="ys-msg" :class="{ 'ys-msg-err': err }">{{ msg }}</p>
  </div>
</template>

<style scoped>
.ys-card { display: flex; flex-direction: column; gap: var(--gap-stack); padding: var(--sp-3) var(--sp-4); }
.ys-hint { font-size: var(--fs-2); color: var(--sub); line-height: var(--lh-base); }
.ys-stat { font-size: var(--fs-2); color: var(--txt); }
.ys-row { display: flex; flex-wrap: wrap; gap: var(--gap-stack); align-items: center; }
.ys-msg { font-size: var(--fs-1); color: var(--ok-text); }
.ys-msg-err { color: var(--danger-text); }
</style>
