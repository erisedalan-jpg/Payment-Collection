<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { buildHealthReport, type AlertGroup } from '@/lib/governance'
import { exportRows } from '@/lib/exportXlsx'
import DataTable from '@/components/DataTable.vue'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const loaded = computed(() => !!data.data)
const report = computed(() => (data.data ? buildHealthReport(data.data) : null))

const open = ref<Set<string>>(new Set())
function toggle(a: AlertGroup) {
  if (a.count === 0) return
  const s = new Set(open.value)
  if (s.has(a.key)) s.delete(a.key)
  else s.add(a.key)
  open.value = s
}
function onExport(a: AlertGroup) { if (a.exportName) exportRows(a.exportName, a.rows) }
const SEV_TXT: Record<string, string> = { high: '高', mid: '中', low: '低' }
</script>

<template>
  <div class="gov-view">
    <h2 class="gov-title">数据治理</h2>
    <div v-if="!loaded" class="gov-empty">数据加载中或加载失败,请确认后端服务在运行。</div>
    <template v-else-if="report">
      <div class="gov-banner" :class="report.verdict" data-test="banner">
        <div class="gov-banner-main">
          <span class="gov-dot" />
          <div>
            <div class="gov-banner-title">{{ report.title }}</div>
            <div v-if="report.sub" class="gov-banner-sub">{{ report.sub }}</div>
          </div>
        </div>
        <div class="gov-banner-meta u-num">{{ report.metaLine }}</div>
      </div>

      <div class="gov-srcs">
        <div v-for="src in report.sources" :key="src.key" class="gov-src" :class="{ off: !src.provided }" :data-test="`src-${src.key}`">
          <div class="gov-src-head">
            <span class="gov-src-name">{{ src.label }}</span>
            <span class="gov-src-badge" :class="{ on: src.provided }">{{ src.provided ? '已提供' : '未提供' }}</span>
          </div>
          <div class="gov-src-main u-num">{{ src.main }}</div>
          <div class="gov-src-mlabel">{{ src.mainLabel }}</div>
          <div v-for="(sub, i) in src.subs" :key="i" class="gov-src-sub u-num">{{ sub }}</div>
        </div>
      </div>

      <h3 class="gov-h">告警 <span class="gov-h-hint">按严重度排序,0 条置灰</span></h3>
      <div class="gov-alerts">
        <div v-for="a in report.alerts" :key="a.key" class="gov-alert" :class="{ zero: a.count === 0 }" :data-test="`alert-${a.key}`">
          <button class="gov-alert-row" :disabled="a.count === 0" @click="toggle(a)">
            <span class="gov-sev" :class="a.severity">{{ SEV_TXT[a.severity] }}</span>
            <span class="gov-alert-label">{{ a.label }}</span>
            <span class="gov-alert-count u-num">{{ a.count }} 条</span>
            <span class="gov-alert-arrow" :class="{ open: open.has(a.key) }">▾</span>
          </button>
          <div v-if="open.has(a.key)" class="gov-alert-body">
            <p v-if="a.note" class="gov-note">{{ a.note }}</p>
            <template v-else>
              <div v-if="a.exportName" class="gov-exp-row">
                <button class="gov-exp" @click="onExport(a)">导出</button>
              </div>
              <DataTable :columns="a.columns" :rows="a.rows" :show-count="false" />
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gov-view { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--gap-section); }
.gov-title { font-size: var(--fs-5); font-weight: 700; margin: 0; color: var(--txt); }
.gov-empty { padding: var(--sp-6); text-align: center; color: var(--mut); background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.gov-banner { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-4); padding: var(--card-pad); border-radius: var(--r-lg); border: 1px solid var(--line); flex-wrap: wrap; }
.gov-banner.green { background: var(--ok-bg); }
.gov-banner.yellow { background: var(--warn-bg); }
.gov-banner.red { background: var(--danger-bg); }
.gov-banner-main { display: flex; align-items: center; gap: var(--sp-3); }
.gov-dot { width: 12px; height: 12px; border-radius: var(--r-full); flex-shrink: 0; }
.gov-banner.green .gov-dot { background: var(--ok); }
.gov-banner.yellow .gov-dot { background: var(--warn); }
.gov-banner.red .gov-dot { background: var(--danger); }
.gov-banner-title { font-size: var(--fs-4); font-weight: 700; }
.gov-banner.green .gov-banner-title { color: var(--ok-text); }
.gov-banner.yellow .gov-banner-title { color: var(--warn-text); }
.gov-banner.red .gov-banner-title { color: var(--danger-text); }
.gov-banner-sub { font-size: var(--fs-1); color: var(--sub); margin-top: 2px; }
.gov-banner-meta { font-size: var(--fs-1); color: var(--sub); }
.gov-srcs { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--gap-card); }
.gov-src { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); box-shadow: var(--shadow-1); }
.gov-src.off { opacity: var(--disabled-opacity); }
.gov-src-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-2); gap: var(--sp-2); }
.gov-src-name { font-size: var(--fs-2); font-weight: 600; color: var(--sub); }
.gov-src-badge { font-size: var(--fs-1); padding: 1px var(--sp-2); border-radius: var(--r-full); background: var(--card2); color: var(--mut); white-space: nowrap; }
.gov-src-badge.on { background: var(--ok-bg); color: var(--ok-text); }
.gov-src-main { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.gov-src-mlabel { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-2); }
.gov-src-sub { font-size: var(--fs-1); color: var(--sub); }
.gov-h { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
.gov-h-hint { font-size: var(--fs-1); font-weight: 400; color: var(--mut); margin-left: var(--sp-2); }
.gov-alerts { display: flex; flex-direction: column; gap: var(--gap-stack); }
.gov-alert { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; }
.gov-alert.zero { opacity: var(--disabled-opacity); }
.gov-alert-row { display: flex; align-items: center; gap: var(--sp-3); width: 100%; padding: var(--sp-3) var(--sp-4); background: none; border: none; cursor: pointer; color: var(--txt); font-size: var(--fs-2); text-align: left; }
.gov-alert-row:disabled { cursor: default; }
.gov-alert-row:not(:disabled):hover { background: var(--hover-tint); }
.gov-sev { font-size: var(--fs-1); font-weight: 600; padding: 1px var(--sp-2); border-radius: var(--r-sm); flex-shrink: 0; }
.gov-sev.high { background: var(--danger-bg); color: var(--danger-text); }
.gov-sev.mid { background: var(--warn-bg); color: var(--warn-text); }
.gov-sev.low { background: var(--card2); color: var(--mut); }
.gov-alert-label { flex: 1; font-weight: 600; }
.gov-alert-count { color: var(--sub); }
.gov-alert-arrow { color: var(--mut); transition: transform var(--dur-2) var(--ease); }
.gov-alert-arrow.open { transform: rotate(180deg); }
.gov-alert-body { padding: 0 var(--sp-4) var(--sp-4); }
.gov-note { font-size: var(--fs-2); color: var(--sub); margin: 0; line-height: var(--lh-base); }
.gov-exp-row { display: flex; justify-content: flex-end; margin-bottom: var(--sp-2); }
.gov-exp { font-size: var(--fs-1); background: var(--accent); color: var(--on-accent); border: none; border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-3); cursor: pointer; }
</style>
