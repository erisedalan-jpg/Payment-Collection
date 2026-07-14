<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBudgetStore } from '@/stores/budget'
import { fmtYuan } from '@/lib/format'
import type { PmPhaseRow } from '@/lib/budget/types'

const store = useBudgetStore()
const cfg = computed(() => store.effectiveConfig!)
const rates = computed(() => cfg.value.rates)

const sum = (k: 'pm1' | 'pm2' | 'tech1' | 'tech2'): number =>
  store.form.pmPhases.reduce((s: number, p: PmPhaseRow) => s + (Number(p[k]) || 0), 0)

const pmDays1 = computed(() => sum('pm1'))
const pmDays2 = computed(() => sum('pm2'))
const techDays1 = computed(() => sum('tech1'))
const techDays2 = computed(() => sum('tech2'))

// ★小结一律用**成本单价**(rates,如 PM 一类 2000),不是销售价(salesPrices,2400)。
//  原工具这里显示的是销售价 —— 显示错了,填表人据此估成本会偏高 20%。
const pmCost1 = computed(() => pmDays1.value * rates.value.city1.pm)
const pmCost2 = computed(() => pmDays2.value * rates.value.city2.pm)
const techCost1 = computed(() => techDays1.value * rates.value.city1.tech)
const techCost2 = computed(() => techDays2.value * rates.value.city2.tech)
const pmTotalCost = computed(() => pmCost1.value + pmCost2.value + techCost1.value + techCost2.value)

const summary = computed(() => [
  { label: 'PM 一类', days: pmDays1.value, price: rates.value.city1.pm, cost: pmCost1.value },
  { label: 'PM 二类', days: pmDays2.value, price: rates.value.city2.pm, cost: pmCost2.value },
  { label: '技服一类', days: techDays1.value, price: rates.value.city1.tech, cost: techCost1.value },
  { label: '技服二类', days: techDays2.value, price: rates.value.city2.tech, cost: techCost2.value },
])

// PM 是必填段,默认展开(仍可折叠)
const active = ref<string[]>(['pm'])

const touch = (): void => store.touch()

defineExpose({ pmCost1, pmCost2, techCost1, techCost2, pmTotalCost })
</script>

<template>
  <el-collapse v-model="active" class="bd-card pm-card">
    <el-collapse-item name="pm">
      <template #title>
        <span class="bd-card-title">项目经理</span>
        <span class="pm-note">阶段只是分组标签，没有系数、没有工时基线</span>
      </template>

      <div class="pm-body">
        <div v-for="ph in store.form.pmPhases" :key="ph.name" class="pm-phase">
          <span class="pm-phase-name">{{ ph.name }}</span>
          <div class="pm-row">
            <div class="pm-field">
              <label class="pm-label">PM 一类（人天）</label>
              <el-input-number v-model="ph.pm1" class="u-num pm-num" :min="0" :controls="false" @change="touch" />
            </div>
            <div class="pm-field">
              <label class="pm-label">PM 二类（人天）</label>
              <el-input-number v-model="ph.pm2" class="u-num pm-num" :min="0" :controls="false" @change="touch" />
            </div>
            <div class="pm-field">
              <label class="pm-label">技服一类（人天）</label>
              <el-input-number v-model="ph.tech1" class="u-num pm-num" :min="0" :controls="false" @change="touch" />
            </div>
            <div class="pm-field">
              <label class="pm-label">技服二类（人天）</label>
              <el-input-number v-model="ph.tech2" class="u-num pm-num" :min="0" :controls="false" @change="touch" />
            </div>
          </div>
          <el-input v-model="ph.note" type="textarea" :rows="2" placeholder="工作内容" @input="touch" />
        </div>

        <div class="pm-sum">
          <h4 class="pm-sum-h">小结（按成本单价计）</h4>
          <table class="pm-table">
            <thead>
              <tr><th>类别</th><th>人天合计</th><th>成本单价</th><th>成本</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in summary" :key="s.label">
                <td>{{ s.label }}</td>
                <td class="u-num">{{ s.days }}</td>
                <td class="u-num">{{ s.price }}</td>
                <td class="u-num">{{ fmtYuan(s.cost) }}</td>
              </tr>
              <tr class="pm-total">
                <td>合计</td>
                <td class="u-num">{{ pmDays1 + pmDays2 + techDays1 + techDays2 }}</td>
                <td>—</td>
                <td class="u-num">{{ fmtYuan(pmTotalCost) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </el-collapse-item>
  </el-collapse>
</template>

<style scoped>
.bd-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.pm-card :deep(.el-collapse-item__header),
.pm-card :deep(.el-collapse-item__wrap) {
  background: transparent;
  border-bottom-color: var(--line);
}
.pm-card :deep(.el-collapse-item__content) { padding-bottom: 0; }
.bd-card-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
.pm-note { font-size: var(--fs-1); color: var(--mut); margin-left: var(--sp-3); }

.pm-body { display: flex; flex-direction: column; gap: var(--gap-card); padding-top: var(--sp-2); }
.pm-phase {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--sp-4);
  background: var(--card2);
}
.pm-phase-name { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
.pm-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.pm-field { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
.pm-label { font-size: var(--fs-1); color: var(--sub); line-height: var(--lh-dense); }
.pm-num { width: 130px; }

.pm-sum { display: flex; flex-direction: column; gap: var(--sp-2); }
.pm-sum-h { font-size: var(--fs-2); font-weight: 700; color: var(--sub); line-height: var(--lh-dense); }
.pm-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); color: var(--txt); }
.pm-table th {
  text-align: left;
  font-size: var(--fs-1);
  font-weight: 700;
  color: var(--sub);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--line);
}
.pm-table td {
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--line);
  line-height: var(--lh-dense);
}
.pm-total td { font-weight: 700; }
</style>
