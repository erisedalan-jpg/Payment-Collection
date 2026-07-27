<script setup lang="ts">
// props 只有 variant;其余原生属性(disabled/data-test/title 等)经 fallthrough 透传到 <button>。
// 两个变体对应本仓真实存在的两类自写按钮,不是可选装饰:
//   default —— 白底主文字色(原 .av-export / .dv-btn 一族,2 处)
//   subtle  —— 浅灰次级按钮(原 .cd-btn / .mdt-btn / .mpt-btn / .mrt-btn / .nsp-btn
//              / .pv-btn / .pov-btn 一族,7 处),与 default 是【语义区别】而非随意的不一致
withDefaults(defineProps<{ variant?: 'default' | 'subtle' }>(), { variant: 'default' })
</script>

<template>
  <button type="button" class="ab u-press" :class="`ab--${variant}`"><slot /></button>
</template>

<style scoped>
/* 两个变体的取值均与被替换的现状【逐条相同】→ 视觉零变化(本期硬承诺)。
   契约测试 AppButton.test.ts 对两组各 4 项取值全部断言 —— 初版只断言了 radius/padding/
   background 三项,导致 7 处 subtle 按钮被误换成 default 而无任何测试变红。 */
.ab {
  border-radius: var(--r-sm);
  padding: var(--sp-1) var(--sp-3);
  cursor: pointer;
  line-height: var(--lh-base);
  transition: background-color var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
}
.ab--default {
  background: var(--card);
  border: 1px solid var(--line);
  font-size: var(--fs-2);
  color: var(--txt);
}
.ab--subtle {
  background: var(--card2);
  border: 1px solid var(--line2);
  font-size: var(--fs-1);
  color: var(--sub);
}
.ab--default:hover:not(:disabled) { background: var(--hover-tint); }
/* subtle 的 hover 沿用原 .cd-btn 一族的写法(变底色 + 转主色字),不改成 --hover-tint */
.ab--subtle:hover:not(:disabled) { background: var(--bg); color: var(--accent); }
.ab:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
</style>
