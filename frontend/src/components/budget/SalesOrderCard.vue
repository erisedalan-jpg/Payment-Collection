<script setup lang="ts">
import { computed } from 'vue'
import { useBudgetStore } from '@/stores/budget'
import { fmtYuan } from '@/lib/format'

/** 销售下单建议：成本 → 物料数量的逆运算（数量 = 含毛利金额 ÷ 销售单价，向上取整）。
 *  这里只做展示，口径全在 lib/budget/salesOrder.ts。
 *  合计（Σ 数量 × 销售单价）会因向上取整**略高于**销售下单金额，这是下单必然的进位，不是算错。
 */
const store = useBudgetStore()
const order = computed(() => store.salesOrder)

defineExpose({ order })
</script>

<template>
  <section class="bd-card">
    <div class="so-head">
      <h3 class="bd-card-title">销售下单建议</h3>
      <span class="so-note">数量向上取整；直接成本并入单价最低且有量的物料</span>
    </div>

    <table class="so-table">
      <thead>
        <tr>
          <th>物料编号</th>
          <th>物料名称</th>
          <th>单价（元）</th>
          <th>数量</th>
          <th>金额（元）</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in order?.rows ?? []" :key="row.key">
          <td>{{ row.code }}</td>
          <td>{{ row.name }}</td>
          <td class="u-num">{{ fmtYuan(row.price) }}</td>
          <td class="u-num">{{ row.qty }}</td>
          <td class="u-num">{{ fmtYuan(row.amount) }}</td>
        </tr>
        <tr class="so-total">
          <td>合计</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
          <td class="u-num">{{ fmtYuan(order?.grandTotal ?? 0) }}</td>
        </tr>
      </tbody>
    </table>
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
.so-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--gap-card); flex-wrap: wrap; }
.so-note { font-size: var(--fs-1); color: var(--mut); line-height: var(--lh-dense); }

.so-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); color: var(--txt); }
.so-table th {
  text-align: left;
  font-size: var(--fs-1);
  font-weight: 700;
  color: var(--sub);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--line);
}
.so-table td {
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--line);
  line-height: var(--lh-dense);
}
.so-total td { font-weight: 700; }
</style>
