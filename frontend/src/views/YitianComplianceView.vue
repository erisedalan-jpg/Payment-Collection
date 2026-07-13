<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { issueRows, countByCode, ISSUE_LABELS } from '@/lib/yitian/compliance'
import { exportRows } from '@/lib/exportXlsx'

const store = useYitianStore()
const view = useYitianViewStore()
const settings = useYitianSettingsStore()

onMounted(() => { store.load(); settings.load() })

const ready = computed(() => !!store.data)
const codeFilter = ref<string[]>([])

// excludedTypes 必须传进去,否则超管在 /data 剔除某类型后,总览/趋势页的问题数变了,
// 这里仍原样列出,两页口径漂移(I-7)。
const allRows = computed(() =>
  store.data ? issueRows(store.data, view.start, view.end, view.l4s, settings.settings.excludedTypes) : [])

const codeDist = computed(() => countByCode(allRows.value))

const codeOptions = computed(() =>
  codeDist.value.map((c) => ({ value: c.code, label: `${c.label} (${c.count})` })))

const rows = computed(() => {
  const keep = new Set(codeFilter.value)
  const src = keep.size
    ? allRows.value.filter((r) => r.codes.some((c) => keep.has(c)))
    : allRows.value
  return src.map((r) => ({
    ...r,
    okText: r.ok === 2 ? '问题' : '提示',
    issueText: r.msgs.length ? r.msgs.join('；') : r.codes.map((c) => ISSUE_LABELS[c] ?? c).join('；'),
  }))
})

const cols: DataColumn[] = [
  { key: 'date', label: '工作日', width: 110, sortable: true },
  { key: 'empName', label: '员工', width: 90, sortable: true },
  { key: 'l4', label: 'L4 组织', width: 130, sortable: true },
  { key: 'type', label: '工时类型', width: 100, sortable: true },
  { key: 'hours', label: '工时', width: 80, num: true, sortable: true },
  { key: 'customer', label: '客户', width: 160 },
  { key: 'workOrder', label: '工单编号', width: 140 },
  { key: 'okText', label: '状态', width: 80, sortable: true },
  { key: 'issueText', label: '问题', width: 320, wrap: true },
  { key: 'snippet', label: '工作成果摘要', width: 360, wrap: true },
]

function onExport() {
  // 既有签名是 exportRows(filename, rows) —— 文件名在前,别写反
  exportRows(
    `倚天工时合规问题_${view.start}_${view.end}.xlsx`,
    rows.value.map((r) => ({
      工作日: r.date, 员工: r.empName, L4组织: r.l4, 工时类型: r.type, 工时: r.hours,
      客户: r.customer, 工单编号: r.workOrder, 状态: r.okText, 问题: r.issueText, 工作成果摘要: r.snippet,
    })),
  )
}

defineExpose({ codeFilter, rows, codeDist })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <section class="yt-card">
        <div class="yt-head">
          <h3 class="yt-h">问题分布</h3>
          <div class="yt-actions">
            <el-select v-model="codeFilter" multiple collapse-tags clearable placeholder="全部问题类型"
              class="yt-code">
              <el-option v-for="o in codeOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <el-button @click="onExport">导出</el-button>
          </div>
        </div>
        <div v-if="!codeDist.length" class="yt-empty">本区间无合规问题</div>
        <ul v-else class="yt-dist">
          <li v-for="c in codeDist" :key="c.code" :class="{ 'yt-dist--warn': c.code.startsWith('HINT_') }">
            <span class="yt-dist-label">{{ c.label }}</span>
            <span class="yt-dist-count u-num">{{ c.count }}</span>
          </li>
        </ul>
      </section>

      <section class="yt-card">
        <h3 class="yt-h">问题明细</h3>
        <DataTable :columns="cols" :rows="rows" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-head { display: flex; justify-content: space-between; align-items: center; gap: var(--gap-stack); flex-wrap: wrap; }
.yt-actions { display: flex; gap: var(--gap-stack); align-items: center; }
.yt-code { min-width: 240px; }
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
.yt-dist { display: flex; flex-wrap: wrap; gap: var(--gap-stack); list-style: none; }
.yt-dist li {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--r-full);
  background: var(--danger-bg);
  color: var(--danger-text);
  font-size: var(--fs-2);
}
/* HINT_ 前缀是提示,不是问题——状态语义色须与问题码区分(M-5) */
.yt-dist li.yt-dist--warn {
  background: var(--warn-bg);
  color: var(--warn-text);
}
.yt-dist-count { font-weight: 700; }
</style>
