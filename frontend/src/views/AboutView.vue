<script setup lang="ts">
import { APP_VERSION, RELEASE_DATE } from '@/version'

const SECTIONS = [
  { title: '项目域(五页)', items: [
    '项目总览:KPI 条 / 健康度总览 / 回款重点带 / 风险焦点 / 动态流',
    '项目清单:多条件筛选 + 全列搜索,行点击下钻项目详情',
    '项目详情:回款 / 进度里程碑 / 风险 / 预算核算 / 原项目五 Tab + 动态时间线',
    '项目动态:快照 diff 事件流 + 周期对比(上次同步 / 上周 / 上月)',
    '项目分析:11 维 × 6 指标排名 / 交叉 / 透视,可下钻',
  ] },
  { title: '回款域(五页)', items: [
    '回款总览:核心指标 / 档位进度 / 服务组排名 / 月度趋势(FilterBar 联动)',
    '回款分析:多维看板 + 项目总览 / 回款节点 / 回款状态 / 风险项目 / 数据质检',
    '回款日历:双月视图 / 年度热力图 / 到期提醒',
    '临期跟进:30/15/7 天临期进度 + 跟进记录云文档回写',
    '回款台账:跨档位统一视图,行内下钻',
  ] },
  { title: '工具组', items: [
    '数据管理:云同步 / 离线导入 / PMIS 下载上传 / 项目域文件上传 / 更新数据',
    '数据治理:全源健康检查(结论横幅 / 源状态卡 / 分级告警与导出)',
  ] },
]
</script>

<template>
  <div class="about-view">
    <div class="about-head">
      <div class="about-name">项目管理平台</div>
      <div class="about-ver">Version {{ APP_VERSION }}</div>
    </div>

    <div class="about-grid">
      <div class="about-k">产品名称</div><div class="about-v">项目管理平台</div>
      <div class="about-k">版本号</div><div class="about-v">{{ APP_VERSION }}</div>
      <div class="about-k">发布日期</div><div class="about-v">{{ RELEASE_DATE }}</div>
      <div class="about-k">作者</div><div class="about-v">王叙潼牛逼</div>
    </div>

    <div v-for="sec in SECTIONS" :key="sec.title" class="about-feat-box">
      <div class="about-feat-title">{{ sec.title }}</div>
      <ul class="about-features">
        <li v-for="(f, i) in sec.items" :key="i">{{ f }}</li>
      </ul>
    </div>

    <div class="about-feat-box">
      <div class="about-feat-title">健康度规则</div>
      <ul class="about-features">
        <li>四维异常：进度=里程碑进度状态含滞后/延期/超期；风险=最高等级高且未关闭风险数&gt;0；成本=超支或消耗比&gt;100%；回款=存在延期回款节点</li>
        <li>总评：0 项异常=健康 / 1 项=关注 / ≥2 项=风险；PMIS 未匹配=无数据（不计三态）</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.about-view { padding: var(--sp-5); max-width: 720px; }
.about-head { margin-bottom: var(--sp-5); }
.about-name { font-size: var(--fs-5); font-weight: 700; color: var(--txt); margin-bottom: var(--sp-1); }
.about-ver { font-size: var(--fs-2); color: var(--mut); }
.about-grid { display: grid; grid-template-columns: 120px 1fr; gap: var(--sp-3) var(--sp-4); font-size: var(--fs-2); border-top: 1px solid var(--line); padding-top: var(--sp-4); }
.about-k { color: var(--mut); font-weight: 600; }
.about-v { color: var(--txt); }
.about-feat-box { margin-top: var(--sp-5); padding: var(--sp-4); background: var(--card2); border-radius: var(--r-md); font-size: var(--fs-1); color: var(--mut); }
.about-feat-title { font-weight: 700; margin-bottom: var(--sp-2); color: var(--sub); }
.about-features { list-style: disc; padding-left: var(--sp-5); line-height: var(--lh-base); margin: 0; }
.about-features li { margin-bottom: var(--sp-1); }
</style>
