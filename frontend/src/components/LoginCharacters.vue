<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'

type Mood = 'idle' | 'account' | 'password' | 'reveal' | 'fail'
const props = withDefaults(defineProps<{ mood?: Mood }>(), { mood: 'idle' })

// 眼随鼠标 + 身体微倾:瞳孔相对视口中心偏移(±8px,角色放大后加大幅度更显互动),身体随光标横向微倾(±5deg)。
// 注:这些是温和的小幅 UI 反馈;reduced-motion 仅在 CSS 侧关掉大幅"摇头",其余对所有人保留(用户要求最大还原)。
const eye = reactive({ x: 0, y: 0 })
const tilt = ref(0)
function onMove(e: MouseEvent) {
  const cx = window.innerWidth / 2 || 1
  const cy = window.innerHeight / 2 || 1
  const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / cx))
  const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / cy))
  eye.x = nx * 8
  eye.y = ny * 8
  tilt.value = nx * 5
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
.lc { display: flex; gap: var(--sp-4); align-items: flex-end; justify-content: center; }
/* 以下角色/眼/瞳孔的像素尺寸与 top 偏移为纯 CSS 插画固有几何(类比 SVG 坐标),非布局间距;颜色/圆角/动效时长均走令牌。放大约 1.45x(更接近参考、增强存在感)。 */
.lc-char { position: relative; width: 122px; height: 168px; transform: rotate(var(--tilt, 0deg)); transition: transform var(--dur-2) var(--ease); }
.lc-char--1 { background: var(--chart-1); border-radius: var(--r-lg); }
.lc-char--2 { background: var(--chart-2); border-radius: var(--r-md); height: 194px; }
.lc-char--3 { background: var(--chart-3); border-radius: var(--r-full) var(--r-full) var(--r-sm) var(--r-sm); height: 122px; } /* 半圆顶 */
.lc-char--4 { background: var(--chart-4); border-radius: var(--r-lg); height: 150px; }
.lc-face { position: absolute; top: 32px; left: 0; right: 0; display: flex; gap: var(--sp-3); justify-content: center; }
.lc-eye { width: 29px; height: 29px; border-radius: var(--r-full); background: var(--card); display: grid; place-items: center; overflow: hidden; transition: transform var(--dur-1) var(--ease); }
.lc-pupil { width: 13px; height: 13px; border-radius: var(--r-full); background: var(--txt); transform: translate(var(--eye-x, 0), var(--eye-y, 0)); transition: transform var(--dur-1) var(--ease); }

/* 眨眼 */
.lc--blink .lc-eye { transform: scaleY(.1); }

/* 账号聚焦:两两内倾"互相对视"(覆盖 idle 的 --tilt) */
.lc--account .lc-char--1, .lc--account .lc-char--2 { transform: rotate(8deg); }
.lc--account .lc-char--3, .lc--account .lc-char--4 { transform: rotate(-8deg); }
.lc--account .lc-char--1 .lc-pupil, .lc--account .lc-char--2 .lc-pupil { transform: translateX(6px); }
.lc--account .lc-char--3 .lc-pupil, .lc--account .lc-char--4 .lc-pupil { transform: translateX(-6px); }

/* 密码聚焦:扭头 + 眯眼遮挡(不看密码) */
.lc--password .lc-char { transform: rotate(-5deg); }
.lc--password .lc-eye { transform: scaleY(.16); }

/* 显示密码:望向远方 + 1 号偶尔偷瞄 */
.lc--reveal .lc-pupil { transform: translateY(-6px); }
.lc--reveal .lc-char--1 .lc-pupil { animation: lc-peek 2.4s steps(1) infinite; }
@keyframes lc-peek { 0%, 80% { transform: translateY(-6px); } 85%, 95% { transform: translateY(5px); } 100% { transform: translateY(-6px); } }

/* 登录失败:摇头(大幅,reduced-motion 下关) */
.lc--fail .lc-char { animation: lc-shake .5s var(--ease); }
@keyframes lc-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-7px) rotate(-4deg); } 40% { transform: translateX(7px) rotate(4deg); } 60% { transform: translateX(-5px); } 80% { transform: translateX(5px); } }

/* 减少动态:仅关闭大幅"摇头";温和的眼随/眨眼/姿态/偷瞄保留(小幅 UI 反馈)。 */
@media (prefers-reduced-motion: reduce) {
  .lc--fail .lc-char { animation: none; }
}
</style>
