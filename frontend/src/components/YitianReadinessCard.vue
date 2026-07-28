<script setup lang="ts">
import { computed } from 'vue'
import AppCard from './AppCard.vue'
import SectionTitle from './SectionTitle.vue'
import MetricGrid from './MetricGrid.vue'
import { TRANSFER_LABELS } from '@/lib/yitian/derived'
import type { YitianData } from '@/types/yitian'

const props = defineProps<{ data: YitianData | null }>()

const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']

const rd = computed(() => props.data?.meta?.dataReadiness ?? null)

/** 就绪度四数。任一源表缺失时给明确文案,不静默显示 0 —— 0 与「没提供」是两回事。
 *  cls 只取 MetricGrid 自己的 ok/warn —— 状态色写在 MetricGrid 的 scoped 样式里,
 *  本组件 scoped 的类名够不到子组件内部的 .mg-v(那会是永远不生效的死 CSS)。 */
const readiness = computed(() => {
  const r = rd.value
  if (!r) return []
  const pc = r.productCategory
  const cal = r.calibration
  return [
    { k: '产品大类覆盖',
      v: pc.provided ? `${pc.coveredLines}/${pc.totalLines}` : '未提供',
      sub: pc.provided && pc.totalLines
        ? `${Math.round((pc.coveredLines / pc.totalLines) * 100)}%` : '产品分类.xlsx 缺失',
      cls: pc.provided ? '' : 'warn' },
    { k: 'TOP1000 匹配客户',
      v: r.top1000.provided ? String(r.top1000.matchedCustomers) : '未提供',
      sub: r.top1000.provided ? `清单 ${r.top1000.rows} 家` : 'TOP1000.xlsx 缺失',
      cls: r.top1000.provided && r.top1000.hasQuad ? '' : 'warn' },
    { k: '产品线校准覆盖',
      v: cal.pending ? `${Math.round((cal.calibrated / cal.pending) * 100)}%` : '-',
      sub: cal.pending ? `已校准 ${cal.calibrated} / 待校准 ${cal.pending}` : '无待校准记录' },
    { k: '客户不可归属',
      v: String(Math.round(r.unattributed.hours)),
      sub: `${r.unattributed.rows} 行 · 可转移判定盲区`,
      cls: r.unattributed.rows ? 'warn' : '' },
  ]
})

/** 可转移五档按工时聚合(仅客户类工时,与后端判定口径一致)。 */
const transfer = computed(() => {
  const d = props.data
  if (!d) return []
  const acc = [0, 0, 0, 0, 0]
  for (const e of d.entries) {
    const t = e.t === null || e.t === undefined ? '' : (d.dims.types[e.t] ?? '')
    if (!CUSTOMER_TYPES.includes(t)) continue
    acc[e.tr] = (acc[e.tr] ?? 0) + e.h
  }
  const tot = acc.reduce((a, b) => a + b, 0)
  return acc.map((h, i) => ({
    k: TRANSFER_LABELS[i],
    v: String(Math.round(h)),
    sub: tot ? `${Math.round((h / tot) * 100)}%` : '-',
    cls: i === 4 ? 'ok' : i === 0 ? 'warn' : '',
  }))
})
</script>

<template>
  <AppCard v-if="rd">
    <SectionTitle level="section">可转移非原厂支持</SectionTitle>
    <MetricGrid :items="transfer" col-min="170px" class="rc-grid" />
    <SectionTitle level="section" class="rc-t2">数据就绪度</SectionTitle>
    <p class="rc-note">
      以上判定的可信度由下列四项决定：校准覆盖率越低、不可归属工时越多，结论水分越大；
      TOP1000 清单不全会让「可转移」偏高。
    </p>
    <!-- 两个 grid 的 class 必须不同:「客户不可归属」标签在两处都有,测试要靠 class 区分 -->
    <MetricGrid :items="readiness" col-min="170px" class="rc-grid2" />
  </AppCard>
</template>

<style scoped>
.rc-grid, .rc-grid2 { margin-bottom: var(--sp-4); }
.rc-t2 { margin-top: var(--sp-4); }
.rc-note { margin: 0 0 var(--sp-3); font-size: var(--fs-1); color: var(--mut); }
</style>
