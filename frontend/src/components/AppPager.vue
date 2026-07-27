<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  page: number
  size: number
  total: number
  sizes?: number[]
}>(), { sizes: undefined })

const emit = defineEmits<{ 'update:page': [number]; 'update:size': [number] }>()

/** 默认取全站主流配置(13/17 处用的就是这两组),少数页可传 sizes 覆盖。 */
const effectiveSizes = computed(() => props.sizes ?? [20, 50, 80, 100])

function onPage(v: number) { emit('update:page', v) }
function onSize(v: number) { emit('update:size', v) }

defineExpose({ effectiveSizes, onPage, onSize })
</script>

<template>
  <div class="ap">
    <span class="ap-total u-num">共 {{ total }} 条</span>
    <el-pagination
      :current-page="page" :page-size="size" :page-sizes="effectiveSizes" :total="total"
      layout="sizes, prev, pager, next" size="small" background
      @update:current-page="onPage" @update:page-size="onSize" />
  </div>
</template>

<style scoped>
/* 与被替换的 cv-pager/pn-pager/pov-pager 逐字相同(三者原本一字不差) */
.ap { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
/* 取被替换的 .cv-total / .pv-total / .yt-total 一族原值(--fs-1 + --sub)。
   plan 初版写的 --fs-2 + --mut 与全部 11 处现状都不同(12px→14px、颜色变浅),已订正。 */
.ap-total { font-size: var(--fs-1); color: var(--sub); }
</style>
