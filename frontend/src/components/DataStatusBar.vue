<script setup lang="ts">
import AppCard from './AppCard.vue'

defineProps<{
  lastUpdate: string
  lastPmis: string
  agentOnline: boolean
  cookieStatus: { sessionPreview: string; updatedAt: string }
  yitianStatus: { sessionPreview: string; updatedAt: string }
}>()
</script>

<template>
  <AppCard variant="raised" class="dsb">
    <div class="dsb-item">
      <span class="dsb-label">上次处理</span>
      <span class="dsb-val u-num">{{ lastUpdate }}</span>
    </div>
    <div class="dsb-item">
      <span class="dsb-label">PMIS</span>
      <span class="dsb-val u-num">{{ lastPmis }}</span>
    </div>
    <div class="dsb-item">
      <span class="dsb-label">本机代理</span>
      <span class="dsb-badge" :class="agentOnline ? 'ok' : 'warn'" data-test="dsb-agent">{{ agentOnline ? '已连接' : '未运行' }}</span>
    </div>
    <div class="dsb-item">
      <span class="dsb-label">PMIS cookie</span>
      <span v-if="cookieStatus.sessionPreview" class="dsb-badge ok u-num" data-test="dsb-cookie">有效 · {{ cookieStatus.sessionPreview }} · {{ cookieStatus.updatedAt || '-' }}</span>
      <span v-else class="dsb-badge warn" data-test="dsb-cookie">未设置</span>
    </div>
    <div class="dsb-item">
      <span class="dsb-label">倚天 cookie</span>
      <span class="dsb-val" :class="{ mut: !yitianStatus.sessionPreview }" data-test="dsb-yitian">{{ yitianStatus.sessionPreview ? '已存 · ' + (yitianStatus.updatedAt || '-') : '-' }}</span>
    </div>
  </AppCard>
</template>

<style scoped>
/* 卡片外观(底/描边/圆角/阴影/内边距)已交给 AppCard(raised),
   原 padding: --sp-3 --sp-4 随本次归位到 --card-pad;
   这里只保留 AppCard 不接管的布局属性。 */
.dsb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-5);
}
.dsb-item { display: flex; align-items: baseline; gap: var(--sp-2); }
.dsb-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.dsb-val { font-size: var(--fs-2); color: var(--txt); }
.dsb-val.mut { color: var(--mut); }
.dsb-badge { font-size: var(--fs-1); font-weight: 600; padding: 2px 8px; border-radius: var(--r-full); }
.dsb-badge.ok { background: var(--ok-bg); color: var(--ok-text); }
.dsb-badge.warn { background: var(--warn-bg); color: var(--warn-text); }
</style>
