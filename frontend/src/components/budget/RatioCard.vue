<script setup lang="ts">
import { computed } from 'vue'
import { useBudgetStore } from '@/stores/budget'
import type { RatioStatus } from '@/lib/budget/types'

/** 成本比例 = 销售下单金额（含税）÷ 项目金额。
 *
 *  ★原工具的页面文案就是这么写的，但它的代码分子取的是**未含税总成本**（漏乘 1+毛利率）——
 *   文案对、代码错。calc.ts 已按文案把代码改对，这里的文案照旧保持一致。
 *   直接后果：毛利率现在会影响成本比例（见 SummaryCard 的提示）。
 *
 *  建议范围一律从 effectiveConfig.ratio 读，不写死 —— 超管改了阈值，这里要跟着变。
 */
const store = useBudgetStore()
const cfg = computed(() => store.effectiveConfig!)

const status = computed<RatioStatus>(() => store.result?.ratioStatus ?? 'na')

/** 项目金额未填 / 总成本为 0 → 不判定，显示 --。 */
const ratioText = computed(() => {
  const v = store.result?.costRatio
  return v == null ? '--' : `${v.toFixed(2)}%`
})

// 三态一律「淡底 + 深字」（设计规范：禁止实底状态色配小号白字）
const BADGE: Record<Exclude<RatioStatus, 'na'>, { text: string; cls: string }> = {
  normal: { text: '比例正常', cls: 'is-ok' },
  low: { text: '比例偏低', cls: 'is-warn' },
  high: { text: '比例偏高', cls: 'is-danger' },
}
const badge = computed(() => (status.value === 'na' ? null : BADGE[status.value]))

/** 偏低 / 偏高必须写异常说明；未判定（na）不要求。 */
const needExplain = computed(() => status.value === 'low' || status.value === 'high')
const explainMissing = computed(
  () => needExplain.value && !(store.form.ratioExplanation ?? '').trim(),
)

const touch = (): void => store.touch()

defineExpose({ status, ratioText, needExplain, explainMissing })
</script>

<template>
  <section class="bd-card">
    <div class="rc-head">
      <h3 class="bd-card-title">成本比例</h3>
      <span class="rc-range u-num">建议范围 {{ cfg.ratio.min }}% ~ {{ cfg.ratio.max }}%</span>
    </div>

    <div class="rc-main">
      <span class="rc-value u-num">{{ ratioText }}</span>
      <span v-if="badge" class="rc-badge" :class="badge.cls">{{ badge.text }}</span>
      <span v-else class="rc-na">填写项目金额后自动判定</span>
    </div>

    <p class="rc-desc">成本比例 = 销售下单金额（含税）÷ 项目金额</p>

    <div v-if="needExplain" class="rc-explain">
      <label class="rc-label">
        异常说明
        <span class="rc-req">必填</span>
      </label>
      <el-input
        v-model="store.form.ratioExplanation"
        type="textarea"
        :rows="3"
        placeholder="比例不在建议范围内，请说明原因（此说明会随报价一起存档）"
        @input="touch"
      />
      <p v-if="explainMissing" class="rc-err">比例不在建议范围内，异常说明必填。</p>
    </div>
  </section>
</template>

<style scoped>
.bd-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}
.bd-card-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); line-height: var(--lh-dense); }
.rc-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--gap-card); flex-wrap: wrap; }
.rc-range { font-size: var(--fs-1); color: var(--mut); line-height: var(--lh-dense); }

.rc-main { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
/* 一卡只有这一个 700 大号主值 */
.rc-value { font-size: var(--fs-6); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }

/* 三态：淡底 + 深字 */
.rc-badge {
  font-size: var(--fs-2);
  font-weight: 700;
  line-height: var(--lh-dense);
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--r-full);
}
.rc-badge.is-ok { background: var(--ok-bg); color: var(--ok-text); }
.rc-badge.is-warn { background: var(--warn-bg); color: var(--warn-text); }
.rc-badge.is-danger { background: var(--danger-bg); color: var(--danger-text); }
.rc-na { font-size: var(--fs-1); color: var(--mut); line-height: var(--lh-dense); }

.rc-desc { font-size: var(--fs-1); color: var(--sub); line-height: var(--lh-dense); }

.rc-explain { display: flex; flex-direction: column; gap: var(--sp-2); }
.rc-label { font-size: var(--fs-1); color: var(--sub); line-height: var(--lh-dense); }
.rc-req {
  margin-left: var(--sp-1);
  padding: 0 var(--sp-1);
  border-radius: var(--r-sm);
  background: var(--danger-bg);
  color: var(--danger-text);
  font-weight: 700;
}
.rc-err { font-size: var(--fs-1); color: var(--danger-text); line-height: var(--lh-dense); }
</style>
