<script setup lang="ts">
// 两级取值来自全量核对:card 级(--fs-4/700)15 处、section 级(--fs-3/700)10 处。
// V4.4.9 曾把两者压成「统一 --fs-3/600」,是只看了 .gov-h 与 .yt-h 两个样本的抽样误判。
// 【只有 level 一个 prop】—— 不提供字号/字重逐项覆盖,否则又会散回各写各的。
withDefaults(defineProps<{ level?: 'card' | 'section' }>(), { level: 'section' })
</script>

<template>
  <h3 class="st" :class="`st--${level}`"><slot /></h3>
</template>

<style scoped>
.st { margin: 0; line-height: var(--lh-dense); }
/* 卡片主标题:概算 10 卡的 .bd-card-title、日历/详情页的 404 与卡头标题等 15 处 */
.st--card { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
/* 卡内小节标题:.gov-h / .ob-h3 / .rv-h3 / .or-title / .tc-title 等 10 处 */
.st--section { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
</style>
