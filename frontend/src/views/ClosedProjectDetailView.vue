<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { ClosedProject } from '@/types/analysis'
import { fmtRatio } from '@/lib/format'

const data = useDataStore()
const route = useRoute()
const p = computed<ClosedProject | undefined>(() =>
  ((data.data?.closedProjects ?? []) as ClosedProject[]).find((x) => x.projectId === String(route.params.id)))

const fmtWan = (v: number | null | undefined) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }))
const yn = (v: unknown) => (v === true ? '是' : v === false ? '否' : '-')

const closeRows = computed(() => [
  { k: '关闭时间', v: p.value?.closeInfo?.关闭时间 || '-' },
  { k: '是否正常关闭', v: p.value?.closeInfo?.是否正常关闭 || '-' },
  { k: '计划终验时间', v: p.value?.closeInfo?.计划终验时间 || '-' },
  { k: '关闭说明', v: p.value?.closeInfo?.关闭说明 || '-' },
])
const teamRows = computed(() => [
  { k: '项目经理', v: p.value?.team?.项目经理 || '-' },
  { k: 'L4部门', v: p.value?.team?.L4部门 || '-' },
  { k: 'L3部门', v: p.value?.team?.L3部门 || '-' },
  { k: 'L3-1部门', v: p.value?.team?.L3_1部门 || '-' },
  { k: 'AR', v: p.value?.team?.AR || '-' },
  { k: 'SR', v: p.value?.team?.SR || '-' },
  { k: 'CSR', v: p.value?.team?.CSR || '-' },
  { k: 'CDR', v: p.value?.team?.CDR || '-' },
  { k: 'Sponsor', v: p.value?.team?.Sponsor || '-' },
])
const custRows = computed(() => [
  { k: '最终客户', v: p.value?.customer?.最终客户 || '-' },
  { k: '签约单位', v: p.value?.customer?.签约单位 || '-' },
  { k: '合同编号', v: p.value?.合同编号 || '-' },
  { k: '行业', v: p.value?.customer?.行业 || '-' },
  { k: '合同总额(万)', v: fmtWan(p.value?.customer?.合同总额) },
])
const costRows = computed(() => [
  { k: '总预算(万)', v: fmtWan(p.value?.cost?.总预算) },
  { k: '核算(万)', v: fmtWan(p.value?.cost?.核算) },
  { k: '剩余预算(万)', v: fmtWan(p.value?.cost?.剩余预算) },
  { k: '消耗比', v: fmtRatio(p.value?.cost?.消耗比) },
  { k: '项目超支', v: yn(p.value?.cost?.项目超支) },
  { k: '交付超支', v: yn(p.value?.cost?.交付超支) },
  { k: '成本状态', v: p.value?.cost?.成本状态 || '-' },
])
</script>

<template>
  <div class="closed-detail-view">
    <div v-if="!p" class="cd-404">
      <div class="cd-404-title">未找到该已关闭项目</div>
      <div class="cd-404-sub">项目编号 {{ route.params.id }} 不在交付三部已关闭清单中。</div>
      <RouterLink to="/projects/closed" class="cd-404-link">← 返回已关闭项目</RouterLink>
    </div>
    <template v-else>
      <div class="cd-head">
        <h2 class="cd-name">{{ p.projectName || p.projectId }}</h2>
        <span class="cd-badge">{{ p.status?.项目状态 || '已关闭' }}</span>
        <span v-if="p.progress?.项目阶段" class="cd-badge stage">{{ p.progress.项目阶段 }}</span>
      </div>
      <div class="cd-meta"><span>编号 <b>{{ p.projectId }}</b></span><span>经理 <b>{{ p.projectManager || '-' }}</b></span><span>服务组 <b>{{ p.orgL4 || '-' }}</b></span></div>

      <section><div class="cd-section-title">关闭信息</div>
        <div class="cd-chips"><div v-for="it in closeRows" :key="it.k" class="cd-chip"><span class="cd-chip-k">{{ it.k }}</span><span class="cd-chip-v">{{ it.v }}</span></div></div></section>
      <section><div class="cd-section-title">团队</div>
        <div class="cd-chips"><div v-for="it in teamRows" :key="it.k" class="cd-chip"><span class="cd-chip-k">{{ it.k }}</span><span class="cd-chip-v">{{ it.v }}</span></div></div></section>
      <section><div class="cd-section-title">客户</div>
        <div class="cd-chips"><div v-for="it in custRows" :key="it.k" class="cd-chip"><span class="cd-chip-k">{{ it.k }}</span><span class="cd-chip-v u-num">{{ it.v }}</span></div></div></section>
      <section><div class="cd-section-title">成本</div>
        <div class="cd-chips"><div v-for="it in costRows" :key="it.k" class="cd-chip"><span class="cd-chip-k">{{ it.k }}</span><span class="cd-chip-v u-num">{{ it.v }}</span></div></div></section>
    </template>
  </div>
</template>

<style scoped>
.closed-detail-view { padding: var(--sp-4); }
.cd-404 { text-align: center; padding: var(--sp-7) 0; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.cd-404-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin-bottom: var(--sp-2); }
.cd-404-sub { font-size: var(--fs-2); color: var(--mut); margin-bottom: var(--sp-4); }
.cd-404-link { color: var(--accent); font-size: var(--fs-2); text-decoration: none; font-weight: 600; }
.cd-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.cd-name { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.cd-badge { display: inline-block; padding: 1px var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); font-weight: 600; background: var(--card2); color: var(--sub); }
.cd-badge.stage { background: var(--selected-tint); color: var(--accent); }
.cd-meta { display: flex; flex-wrap: wrap; gap: var(--sp-4); font-size: var(--fs-2); color: var(--sub); margin-bottom: var(--sp-3); }
.cd-meta b { color: var(--txt); }
.cd-section-title { font-weight: 700; color: var(--accent); font-size: var(--fs-2); margin: var(--sp-4) 0 var(--sp-2); }
.cd-chips { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.cd-chip { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); font-size: var(--fs-2); }
.cd-chip-k { color: var(--mut); }
.cd-chip-v { color: var(--txt); font-weight: 600; }
</style>
