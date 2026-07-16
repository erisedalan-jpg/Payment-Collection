<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'

type Mood = 'idle' | 'account' | 'password' | 'reveal' | 'fail'
const props = withDefaults(defineProps<{ mood?: Mood }>(), { mood: 'idle' })

// 眼随鼠标 + 身体微倾:瞳孔相对视口中心偏移(±8px,角色放大后加大幅度更显互动),
// 身体随光标横向微倾(±5deg,以 skewX 绕底边实现——脚底钉死,仅上身向光标侧探)。
// 注:这些是温和的小幅 UI 反馈;reduced-motion 仅在 CSS 侧关掉循环"偷瞄/摇头",其余对所有人保留(用户要求最大还原)。
const eye = reactive({ x: 0, y: 0 })
const tilt = ref(0)
function onMove(e: MouseEvent) {
  const cx = window.innerWidth / 2 || 1
  const cy = window.innerHeight / 2 || 1
  const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / cx))
  const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / cy))
  eye.x = nx * 8
  eye.y = ny * 8
  tilt.value = -nx * 5   // skewX 取负向光标侧探(脚底为轴),正负与视口坐标相关
}

// 随机眨眼
const blinking = ref(false)
let blinkTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
function scheduleBlink() {
  blinkTimer = setTimeout(() => {
    blinking.value = true
    closeTimer = setTimeout(() => { blinking.value = false; scheduleBlink() }, 160)
  }, 1800 + Math.random() * 2600)
}

onMounted(() => {
  window.addEventListener('mousemove', onMove)
  scheduleBlink()
})
onUnmounted(() => {
  window.removeEventListener('mousemove', onMove)
  if (blinkTimer) clearTimeout(blinkTimer)
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <div class="lc" :class="[`lc--${props.mood}`, { 'lc--blink': blinking }]"
       :style="{ '--eye-x': eye.x + 'px', '--eye-y': eye.y + 'px', '--tilt': tilt + 'deg' }">
    <div v-for="i in 4" :key="i" class="lc-char" :class="`lc-char--${i}`">
      <div class="lc-face">
        <span class="lc-eye"><i class="lc-pupil" /></span>
        <span class="lc-eye"><i class="lc-pupil" /></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lc { display: flex; align-items: flex-end; justify-content: center; }
/* 角色/眼/瞳孔的像素尺寸与 top 偏移为纯 CSS 插画固有几何(类比 SVG 坐标),非布局间距;颜色/圆角/动效时长均走令牌。
   高矮宽窄各异;transform-origin 落底边中点 + 倾斜一律用 skewX——底边钉死不动,仅顶/左/右三边随之倾斜。
   相邻负边距叠压约 1/4 身位(部分重叠)。 */
.lc-char { position: relative; transform-origin: bottom center; transform: skewX(var(--tilt, 0deg)); transition: transform var(--dur-2) var(--ease); }
.lc-char + .lc-char { margin-left: -32px; }
.lc-char--1 { width: 100px; height: 170px; background: var(--chart-1); border-radius: var(--r-lg); }            /* 高瘦 */
.lc-char--2 { width: 132px; height: 206px; background: var(--chart-2); border-radius: var(--r-md); }            /* 最高最壮 */
.lc-char--3 { width: 144px; height: 116px; background: var(--chart-3); border-radius: var(--r-full) var(--r-full) var(--r-sm) var(--r-sm); }  /* 矮宽·半圆顶 */
.lc-char--4 { width: 108px; height: 150px; background: var(--chart-4); border-radius: var(--r-lg); }            /* 中等 */
.lc-face { position: absolute; top: 32px; left: 0; right: 0; display: flex; gap: var(--sp-3); justify-content: center; }
.lc-eye { width: 29px; height: 29px; border-radius: var(--r-full); background: var(--card); display: grid; place-items: center; overflow: hidden; transition: transform var(--dur-1) var(--ease); }
.lc-pupil { width: 13px; height: 13px; border-radius: var(--r-full); background: var(--txt); transform: translate(var(--eye-x, 0), var(--eye-y, 0)); transition: transform var(--dur-1) var(--ease); }

/* 账号聚焦:全员以脚底为轴向表单(右)探身偷看,高个倾更多,瞳孔盯向输入框(右下) */
.lc--account .lc-char--2 { transform: skewX(-13deg); }
.lc--account .lc-char--1 { transform: skewX(-11deg); }
.lc--account .lc-char--4 { transform: skewX(-9deg); }
.lc--account .lc-char--3 { transform: skewX(-7deg); }
.lc--account .lc-eye { transform: scaleY(1.1); }
.lc--account .lc-pupil { transform: translate(7px, 5px); }

/* 密码聚焦:探身收一点 + 眯眼 + 瞳孔来回"偷瞄"(更鬼祟) */
.lc--password .lc-char { transform: skewX(-6deg); }
.lc--password .lc-eye { transform: scaleY(.5); }
.lc--password .lc-pupil { animation: lc-spy 2.2s var(--ease) infinite; }
@keyframes lc-spy { 0%, 45% { transform: translate(7px, 4px); } 55%, 70% { transform: translate(-5px, 2px); } 80%, 100% { transform: translate(7px, 4px); } }

/* 显示密码:既然可见,全员加大探身死盯 */
.lc--reveal .lc-char--2 { transform: skewX(-15deg); }
.lc--reveal .lc-char--1 { transform: skewX(-13deg); }
.lc--reveal .lc-char--4 { transform: skewX(-11deg); }
.lc--reveal .lc-char--3 { transform: skewX(-9deg); }
.lc--reveal .lc-eye { transform: scaleY(1.15); }
.lc--reveal .lc-pupil { transform: translate(8px, 6px); }

/* 登录失败:绕底边 skew 摇头"不对",脚底不动 */
.lc--fail .lc-char { animation: lc-shake .55s var(--ease); }
@keyframes lc-shake { 0%, 100% { transform: skewX(0); } 15% { transform: skewX(8deg); } 30% { transform: skewX(-8deg); } 45% { transform: skewX(6deg); } 60% { transform: skewX(-6deg); } 75% { transform: skewX(3deg); } }

/* 眨眼:置于聚焦规则之后,确保眨眼瞬间盖过"睁大/眯眼" */
.lc--blink .lc-eye { transform: scaleY(.1); }

/* 减少动态:关掉循环"偷瞄/摇头",保留静态探身姿态(小幅 UI 反馈) */
@media (prefers-reduced-motion: reduce) {
  .lc--fail .lc-char { animation: none; }
  .lc--password .lc-pupil { animation: none; transform: translate(7px, 4px); }
}
</style>
