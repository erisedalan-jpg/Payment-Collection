<script setup lang="ts">
import { computed } from 'vue'
import { useBudgetStore } from '@/stores/budget'
import { fmtYuan } from '@/lib/format'

/** 费用汇总：人工成本六个分项（人天 × 成本单价 = 金额）+ 直接成本 = 总成本（未含税），
 *  再 ×(1 + 毛利率) = 销售下单金额（含税）。
 *
 *  分项一律按**成本单价**（rates）算，不是销售价（salesPrices）—— 销售价只在销售下单建议里用。
 *  六项之和恒等于 result.laborCost（技服/外包分项把 PM 模块内、产品、其他服务的人天并列相加）。
 */
const store = useBudgetStore()
const cfg = computed(() => store.effectiveConfig!)
const r = computed(() => store.result)

interface Line { label: string; days: number; price: number; cost: number }

const lines = computed<Line[]>(() => {
  const res = r.value
  const rates = cfg.value.rates
  if (!res) return []
  const mk = (label: string, days: number, price: number): Line =>
    ({ label, days, price, cost: days * price })
  return [
    mk('PM 一类', res.pmDays1, rates.city1.pm),
    mk('PM 二类', res.pmDays2, rates.city2.pm),
    mk('技服一类', res.pmTechDays1 + res.prodTechDays1 + res.svcTechDays1, rates.city1.tech),
    mk('技服二类', res.pmTechDays2 + res.prodTechDays2 + res.svcTechDays2, rates.city2.tech),
    mk('外包一类', res.prodOutDays1 + res.svcOutDays1, rates.city1.out),
    mk('外包二类', res.prodOutDays2 + res.svcOutDays2, rates.city2.out),
  ]
})

const totalDays = computed(() => lines.value.reduce((s, x) => s + x.days, 0))

const touch = (): void => store.touch()

defineExpose({ lines, totalDays })
</script>

<template>
  <section class="bd-card">
    <div class="sc-head">
      <h3 class="bd-card-title">费用汇总</h3>
      <div class="sc-hero">
        <span class="sc-hero-label">销售下单金额（含税）</span>
        <span class="sc-hero-value u-num">{{ fmtYuan(r?.salesAmount ?? 0) }} 元</span>
      </div>
    </div>

    <table class="sc-table">
      <thead>
        <tr>
          <th>人工成本分项</th>
          <th>人天</th>
          <th>成本单价</th>
          <th>金额（元）</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in lines" :key="l.label">
          <td>{{ l.label }}</td>
          <td class="u-num">{{ l.days }}</td>
          <td class="u-num">{{ fmtYuan(l.price) }}</td>
          <td class="u-num">{{ fmtYuan(l.cost) }}</td>
        </tr>
        <tr class="sc-sub">
          <td>人工成本小计</td>
          <td class="u-num">{{ totalDays }}</td>
          <td>—</td>
          <td class="u-num">{{ fmtYuan(r?.laborCost ?? 0) }}</td>
        </tr>
        <tr class="sc-sub">
          <td>直接成本（差补 / 住宿 / 交通）</td>
          <td>—</td>
          <td>—</td>
          <td class="u-num">{{ fmtYuan(r?.directCost ?? 0) }}</td>
        </tr>
        <tr class="sc-total">
          <td>总成本（未含税）</td>
          <td>—</td>
          <td>—</td>
          <td class="u-num">{{ fmtYuan(r?.totalCost ?? 0) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="sc-margin">
      <label class="sc-label">毛利率</label>
      <el-select v-model="store.form.margin" class="sc-select" @change="touch">
        <!-- 毛利率档位后端不强制 value 唯一(budget_config.validate_config 只校验区间,不去重),
             按位置区分,故用下标做 key,不用可能重复的 value。 -->
        <el-option
          v-for="(m, i) in cfg.margins"
          :key="i"
          :value="m.value"
          :label="m.label"
        />
      </el-select>
      <!-- ★毛利率现在也会牵动成本比例（修正前它只影响下单金额），老用户会以为切档位不动比例 -->
      <span class="sc-hint">毛利率会影响成本比例</span>
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
.sc-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--gap-card); flex-wrap: wrap; }
.sc-hero { display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-1); }
.sc-hero-label { font-size: var(--fs-1); color: var(--sub); line-height: var(--lh-dense); }
/* 一卡只有这一个 700 大号主值（总成本走表格合计行，不再抢主位） */
.sc-hero-value { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }

.sc-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); color: var(--txt); }
.sc-table th {
  text-align: left;
  font-size: var(--fs-1);
  font-weight: 700;
  color: var(--sub);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--line);
}
.sc-table td {
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--line);
  line-height: var(--lh-dense);
}
.sc-sub td { color: var(--sub); }
.sc-total td { font-weight: 700; }

.sc-margin { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.sc-label { font-size: var(--fs-1); color: var(--sub); line-height: var(--lh-dense); }
.sc-select { width: 200px; }
.sc-hint { font-size: var(--fs-1); color: var(--mut); line-height: var(--lh-dense); }
</style>
