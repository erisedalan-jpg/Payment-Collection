<script setup lang="ts">
// 四变体由「圆角 + 有无阴影」二维决定,取值来自全站 44 处卡片的实测分布:
//   default 17 处完全匹配 / raised 3 / flat 8 / inset 1,其余仅 padding 异、按变体归位。
// 【只有 variant 一个 prop】—— 不提供 padding/radius/shadow 逐项覆盖,
// 否则等于把「3 种圆角 × 5 种 padding」的现状混乱固化成 API。
withDefaults(defineProps<{ variant?: 'default' | 'raised' | 'flat' | 'inset' }>(), { variant: 'default' })
</script>

<template>
  <div class="ac" :class="`ac--${variant}`"><slot /></div>
</template>

<style scoped>
.ac { border: 1px solid var(--line); }
/* 页面主区块(概算 10 卡 / 倚天 5 卡 / 首页横幅与门户 / 回款总览) */
.ac--default {
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  background: var(--card);
  box-shadow: var(--shadow-1);
}
/* 带阴影的次级主块(待办队列 / 首页异常卡 / 数据治理源卡 / 数据状态条),
   与 default 只差圆角 —— 三变体方案覆盖不到它,详见 spec §3.3 的订正说明。 */
.ac--raised {
  border-radius: var(--r-md);
  padding: var(--card-pad);
  background: var(--card);
  box-shadow: var(--shadow-1);
}
/* 无阴影的内容块(图表卡 / 指标卡 / 各类明细块),与 raised 只差阴影 */
.ac--flat {
  border-radius: var(--r-md);
  padding: var(--card-pad);
  background: var(--card);
}
/* 卡内小信息块,底色用 --card2 与外层拉开层次 */
.ac--inset {
  border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3);
  background: var(--card2);
}
</style>
