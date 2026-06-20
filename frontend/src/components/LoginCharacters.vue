<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'

type Mood = 'idle' | 'account' | 'password' | 'reveal' | 'fail'
const props = withDefaults(defineProps<{ mood?: Mood }>(), { mood: 'idle' })

// 防御性判断:jsdom 无 matchMedia,不抛异常
const reduceMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 眼随鼠标:瞳孔相对视口中心偏移,归一化后缩放到 ±3px
const eye = reactive({ x: 0, y: 0 })
function onMove(e: MouseEvent) {
  if (reduceMotion) return
  const cx = window.innerWidth / 2 || 1
  const cy = window.innerHeight / 2 || 1
  eye.x = Math.max(-1, Math.min(1, (e.clientX - cx) / cx)) * 3
  eye.y = Math.max(-1, Math.min(1, (e.clientY - cy) / cy)) * 3
}

// 随机眨眼
const blinking = ref(false)
let blinkTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined
function scheduleBlink() {
  blinkTimer = setTimeout(() => {
    blinking.value = true
    closeTimer = setTimeout(() => { blinking.value = false; scheduleBlink() }, 160)
  }, 2000 + Math.random() * 3000)
}

onMounted(() => {
  window.addEventListener('mousemove', onMove)
  if (!reduceMotion) scheduleBlink()
})
onUnmounted(() => {
  window.removeEventListener('mousemove', onMove)
  if (blinkTimer) clearTimeout(blinkTimer)
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <div class="lc" :class="[`lc--${props.mood}`, { 'lc--blink': blinking }]"
       :style="{ '--eye-x': eye.x + 'px', '--eye-y': eye.y + 'px' }">
    <div v-for="i in 4" :key="i" class="lc-char" :class="`lc-char--${i}`">
      <div class="lc-face">
        <span class="lc-eye"><i class="lc-pupil" /></span>
        <span class="lc-eye"><i class="lc-pupil" /></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lc { display: flex; gap: var(--sp-3); align-items: flex-end; justify-content: center; }
/* 以下角色/眼/瞳孔的像素尺寸与 top 偏移为纯 CSS 插画固有几何(类比 SVG 坐标),非布局间距;颜色/圆角/动效时长均走令牌。 */
.lc-char { position: relative; width: 84px; height: 116px; transition: transform var(--dur-2) var(--ease); }
.lc-char--1 { background: var(--chart-1); border-radius: var(--r-lg); }
.lc-char--2 { background: var(--chart-2); border-radius: var(--r-md); height: 134px; }
.lc-char--3 { background: var(--chart-3); border-radius: var(--r-full) var(--r-full) var(--r-sm) var(--r-sm); height: 84px; } /* 半圆顶 */
.lc-char--4 { background: var(--chart-4); border-radius: var(--r-lg); height: 104px; }
.lc-face { position: absolute; top: 20px; left: 0; right: 0; display: flex; gap: var(--sp-3); justify-content: center; }
.lc-eye { width: 16px; height: 16px; border-radius: var(--r-full); background: var(--card); display: grid; place-items: center; overflow: hidden; transition: transform var(--dur-1) var(--ease); }
.lc-pupil { width: 7px; height: 7px; border-radius: var(--r-full); background: var(--txt); transform: translate(var(--eye-x, 0), var(--eye-y, 0)); transition: transform var(--dur-1) var(--ease); }

/* 眨眼 */
.lc--blink .lc-eye { transform: scaleY(.12); }

/* 账号聚焦:两两内倾"互相对视" */
.lc--account .lc-char--1, .lc--account .lc-char--2 { transform: rotate(6deg); }
.lc--account .lc-char--3, .lc--account .lc-char--4 { transform: rotate(-6deg); }
.lc--account .lc-char--1 .lc-pupil, .lc--account .lc-char--2 .lc-pupil { transform: translateX(3px); }
.lc--account .lc-char--3 .lc-pupil, .lc--account .lc-char--4 .lc-pupil { transform: translateX(-3px); }

/* 密码聚焦:扭头 + 眯眼遮挡(不看密码) */
.lc--password .lc-char { transform: rotate(-4deg); }
.lc--password .lc-eye { transform: scaleY(.18); }

/* 显示密码:望向远方 + 1 号偶尔偷瞄 */
.lc--reveal .lc-pupil { transform: translateY(-3px); }
.lc--reveal .lc-char--1 .lc-pupil { animation: lc-peek 2.4s steps(1) infinite; }
@keyframes lc-peek { 0%, 80% { transform: translateY(-3px); } 85%, 95% { transform: translateY(2px); } 100% { transform: translateY(-3px); } }

/* 登录失败:摇头 */
.lc--fail .lc-char { animation: lc-shake .5s var(--ease); }
@keyframes lc-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px) rotate(-3deg); } 40% { transform: translateX(6px) rotate(3deg); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }

@media (prefers-reduced-motion: reduce) {
  .lc-char, .lc-eye, .lc-pupil { transition: none !important; animation: none !important; }
}
</style>
