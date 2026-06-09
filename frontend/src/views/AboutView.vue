<script setup lang="ts">
import { APP_VERSION, RELEASE_DATE } from '@/version'

const FEATURES = [
  '按项目金额区间（100万以上 / 50-100万 / 50万以下）分级管理',
  '看板首页：6 种节点状态（加资源可提前 / 达到回款条件 / 已提前回款 / 已全额回款 / 延期 / 正常实施中）汇总展示',
  '季度待回款与月度待回款图表，支持年份 / 季度切换',
  '服务组（L4）达成率排名、延期项目 Top10',
  '区间对比：三档回款达成对比看板、回款进度 / 状态分布 / 月度趋势对比、服务组 TOP5/BOTTOM5 排名',
  '回款日历：独立年份切换、双月视图、状态热力图、15 天 / 30 天到期提醒',
  '回款台账：跨区间统一视图、行内下钻、节点状态卡片、区间摘要',
  '业务分析：项目总览 / 回款节点 / 回款状态 / 风险项目 / 数据质检',
  '项目经理视图、视角切换（L4 服务组 / 项目经理）、周期切换（年 / 季度）',
  '临期跟进（Signal Board）：L4 服务组 30/15/7 天临期回款进度，含展开面板、节点详情、跟进记录与云文档异步回写',
  '纳管筛选开关，支持是 / 空值展示、否排除，全系统联动',
  '数据管理：WPS 云文档同步（含停止同步）、离线 Excel 导入（含停止）、数据缺失检查、清空数据',
]
</script>

<template>
  <div class="about-view">
    <div class="about-head">
      <div class="about-name">项目回款跟踪与管控平台</div>
      <div class="about-ver">Version {{ APP_VERSION }}</div>
    </div>

    <div class="about-grid">
      <div class="about-k">产品名称</div><div class="about-v">项目回款跟踪与管控平台</div>
      <div class="about-k">版本号</div><div class="about-v">{{ APP_VERSION }}</div>
      <div class="about-k">发布日期</div><div class="about-v">{{ RELEASE_DATE }}</div>
      <div class="about-k">作者</div><div class="about-v">交付中心-交付实施三部-阿童木</div>
      <div class="about-k">数据来源</div><div class="about-v">WPS云文档 - 项目回款节点清单</div>
    </div>

    <div class="about-feat-box">
      <div class="about-feat-title">功能说明</div>
      <ul class="about-features">
        <li v-for="(f, i) in FEATURES" :key="i">{{ f }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.about-view { padding: 24px; max-width: 720px; }
.about-head { margin-bottom: 24px; }
.about-name { font-size: 20px; font-weight: 800; color: var(--txt); margin-bottom: 4px; }
.about-ver { font-size: 14px; color: var(--mut); }
.about-grid { display: grid; grid-template-columns: 120px 1fr; gap: 12px 16px; font-size: 13px; border-top: 1px solid var(--line); padding-top: 16px; }
.about-k { color: var(--mut); font-weight: 600; }
.about-v { color: var(--txt); }
.about-feat-box { margin-top: 24px; padding: 16px; background: var(--card2); border-radius: 8px; font-size: 12px; color: var(--mut); }
.about-feat-title { font-weight: 700; margin-bottom: 8px; color: var(--sub); }
.about-features { list-style: disc; padding-left: 20px; line-height: 2; margin: 0; }
</style>
