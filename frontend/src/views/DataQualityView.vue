<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import { coverageColor, verdictLabel } from '@/lib/governance'
import { exportRows } from '@/lib/exportXlsx'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const dq = computed(() => (data.data as any)?.dataQuality ?? null)
const provided = computed(() => !!dq.value?.summary?.pmisProvided)
const themes = computed(() => dq.value?.themes ?? [])
const unmatched = computed(() => dq.value?.unmatched ?? [])
const backfill = computed(() => dq.value?.backfill ?? [])
const conflicts = computed(() => dq.value?.conflicts ?? [])
const dirty = computed(() => dq.value?.dirty ?? [])

function pctTxt(n: number) { return Math.round((n ?? 0) * 100) + '%' }
function exportUnmatched() { exportRows('PMIS未匹配清单.xlsx', unmatched.value) }
function exportBackfill() {
  exportRows('PMIS回填待办.xlsx', backfill.value.map((b: any) => ({
    项目编号: b.projectId, 项目名称: b.projectName, 缺失字段: (b.missingFields || []).join('、'),
  })))
}
</script>

<template>
  <div class="dq-view">
    <h2 class="dq-title">数据治理</h2>
    <div v-if="!provided" class="dq-empty">
      未提供 PMIS 数据。请到「数据管理」页录入下载链接并下载,或把 PMIS 七个 xlsx 放入 input/pmis/ 后重新同步。
    </div>
    <template v-else>
      <div class="dq-cards">
        <div class="dq-card"><div class="dq-k">匹配率</div><div class="dq-v">{{ pctTxt(dq.summary.joinRate) }}</div></div>
        <div class="dq-card"><div class="dq-k">命中在建</div><div class="dq-v">{{ dq.summary.matchedActive }}</div></div>
        <div class="dq-card"><div class="dq-k">命中已关闭</div><div class="dq-v">{{ dq.summary.matchedClosed }}</div></div>
        <div class="dq-card"><div class="dq-k">未匹配</div><div class="dq-v" data-test="unmatched-count">{{ unmatched.length }}</div></div>
      </div>

      <h3 class="dq-h">主题覆盖率</h3>
      <div class="dq-themes">
        <div v-for="t in themes" :key="t.theme" class="dq-theme">
          <span class="dq-theme-name">{{ t.theme }}</span>
          <span class="dq-theme-bar"><i :style="{ width: pctTxt(t.coveragePct), background: coverageColor(t.coveragePct) }"></i></span>
          <span class="dq-theme-val">{{ pctTxt(t.coveragePct) }} · {{ verdictLabel(t.verdict) }}</span>
        </div>
      </div>

      <h3 class="dq-h">未匹配清单({{ unmatched.length }}) <button class="dq-exp" @click="exportUnmatched">导出</button></h3>
      <table class="dq-tbl"><thead><tr><th>项目编号</th><th>项目名称</th><th>类型</th></tr></thead>
        <tbody><tr v-for="u in unmatched" :key="u.projectId"><td>{{ u.projectId }}</td><td>{{ u.projectName }}</td><td>{{ u.kind }}</td></tr></tbody>
      </table>

      <h3 class="dq-h">回填待办({{ backfill.length }}) <button class="dq-exp" @click="exportBackfill">导出</button></h3>
      <table class="dq-tbl"><thead><tr><th>项目编号</th><th>项目名称</th><th>缺失字段</th></tr></thead>
        <tbody><tr v-for="b in backfill" :key="b.projectId"><td>{{ b.projectId }}</td><td>{{ b.projectName }}</td><td>{{ (b.missingFields || []).join('、') }}</td></tr></tbody>
      </table>

      <details class="dq-fold"><summary>口径冲突告警({{ conflicts.length }})</summary>
        <ul><li v-for="(c, i) in conflicts" :key="i"><b>{{ c.column }}</b> — {{ c.issue }} → {{ c.recommendation }}</li></ul>
      </details>
      <details class="dq-fold"><summary>脏值告警({{ dirty.length }})</summary>
        <ul><li v-for="(d, i) in dirty" :key="i">{{ d.type }}:{{ d.projectId }} {{ d.field }}={{ d.value }}</li></ul>
      </details>
    </template>
  </div>
</template>

<style scoped>
.dq-view { padding: 16px; }
.dq-title { font-size: var(--fs-5); margin: 0 0 12px; color: var(--txt); }
.dq-empty { padding: 32px; text-align: center; color: var(--mut); background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
.dq-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
.dq-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.dq-k { font-size: var(--fs-1); color: var(--mut); }
.dq-v { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
.dq-h { font-size: var(--fs-2); color: var(--txt); margin: 18px 0 8px; }
.dq-themes { display: flex; flex-direction: column; gap: 8px; }
.dq-theme { display: grid; grid-template-columns: 100px 1fr 120px; align-items: center; gap: 10px; }
.dq-theme-name { color: var(--sub); font-size: var(--fs-1); }
.dq-theme-bar { height: 10px; background: var(--card2); border-radius: 5px; overflow: hidden; }
.dq-theme-bar i { display: block; height: 100%; }
.dq-theme-val { font-size: var(--fs-1); color: var(--sub); }
.dq-exp { font-size: var(--fs-1); margin-left: 8px; cursor: pointer; background: var(--accent); color: var(--on-accent); border: none; border-radius: 6px; padding: 2px 10px; }
.dq-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-1); }
.dq-tbl th, .dq-tbl td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; color: var(--txt); }
.dq-tbl th { background: var(--card2); color: var(--sub); }
.dq-fold { margin-top: 14px; color: var(--sub); }
</style>
