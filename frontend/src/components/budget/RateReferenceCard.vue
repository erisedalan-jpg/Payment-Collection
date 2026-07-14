<script setup lang="ts">
import { computed } from 'vue'
import { useBudgetStore } from '@/stores/budget'

/** 费率速查:只读,全部由 store.effectiveConfig 渲染。
 *  原工具在 HTML 里另抄了一份静态费率表,与 JS 常量成了两份真相源(且 PM 那两格抄的是销售价) —— 这里只有一个源。 */
const store = useBudgetStore()
const cfg = computed(() => store.effectiveConfig!)

const laborRows = computed(() => {
  const r = cfg.value.rates
  return [
    { name: '项目经理 PM', c1: r.city1.pm, c2: r.city2.pm },
    { name: '技术服务', c1: r.city1.tech, c2: r.city2.tech },
    { name: '外包', c1: r.city1.out, c2: r.city2.out },
  ]
})

const hotelRows = computed(() => {
  const h = cfg.value.hotel
  return [
    { name: '一线城市', price: h.type1, unit: '元/晚' },
    { name: '省会城市', price: h.capital, unit: '元/晚' },
    { name: '其他城市', price: h.other, unit: '元/晚' },
    { name: '港澳', price: h.hk, unit: '美金/晚' },
    { name: '外包差旅（一类城市）', price: h.outType1, unit: '元/晚' },
    { name: '外包差旅（二类城市）', price: h.outType2, unit: '元/晚' },
  ]
})

// key 一律取 m.key(后端强制唯一,见 budget_config.validate_config);m.code 是超管可自由改写的
// 物料编号,不保证唯一,不能拿来做 v-for 的 :key。
const materialRows = computed(() =>
  cfg.value.materials.map((m) => ({
    key: m.key, code: m.code, name: m.name, price: cfg.value.salesPrices[m.key],
  })))

defineExpose({ laborRows, hotelRows, materialRows })
</script>

<template>
  <el-collapse class="bd-card rr-card">
    <el-collapse-item name="rr">
      <template #title>
        <span class="bd-card-title">费率速查</span>
        <span class="rr-note">只读 · 取自当前生效的费率配置（改费率去「费率配置」）</span>
      </template>

      <div class="rr-grid">
        <div class="rr-block">
          <h4 class="rr-h">人天成本单价（元/人天）</h4>
          <table class="rr-table">
            <thead>
              <tr><th>角色</th><th>一类城市</th><th>二类城市</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in laborRows" :key="r.name">
                <td>{{ r.name }}</td>
                <td class="u-num">{{ r.c1 }}</td>
                <td class="u-num">{{ r.c2 }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rr-block">
          <h4 class="rr-h">销售物料单价（元/人天）</h4>
          <table class="rr-table">
            <thead>
              <tr><th>物料编码</th><th>物料名称</th><th>销售单价</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in materialRows" :key="m.key">
                <td class="u-num">{{ m.code }}</td>
                <td>{{ m.name }}</td>
                <td class="u-num">{{ m.price }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rr-block">
          <h4 class="rr-h">住宿标准</h4>
          <table class="rr-table">
            <thead>
              <tr><th>类别</th><th>标准</th></tr>
            </thead>
            <tbody>
              <tr v-for="h in hotelRows" :key="h.name">
                <td>{{ h.name }}</td>
                <td class="u-num">{{ h.price }} {{ h.unit }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rr-block">
          <h4 class="rr-h">差补标准与汇率</h4>
          <table class="rr-table">
            <tbody>
              <tr>
                <td>差补（境内）</td>
                <td class="u-num">{{ cfg.allowance.dom }} 元/天</td>
              </tr>
              <tr>
                <td>差补（境外）</td>
                <td class="u-num">{{ cfg.allowance.intl }} 美金/天</td>
              </tr>
              <tr>
                <td>汇率（美金 → 人民币）</td>
                <td class="u-num">{{ cfg.fx }}</td>
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
/* 折叠头/体自带的边框与底色交给卡片本身,避免出现第三层边界 */
.rr-card :deep(.el-collapse-item__header),
.rr-card :deep(.el-collapse-item__wrap) {
  background: transparent;
  border-bottom-color: var(--line);
}
.rr-card :deep(.el-collapse-item__content) { padding-bottom: 0; }
.bd-card-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
.rr-note { font-size: var(--fs-1); color: var(--mut); margin-left: var(--sp-3); }
.rr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--gap-card);
  padding-top: var(--sp-2);
}
.rr-block { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
.rr-h { font-size: var(--fs-2); font-weight: 700; color: var(--txt); line-height: var(--lh-dense); }
.rr-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); color: var(--txt); }
.rr-table th {
  text-align: left;
  font-size: var(--fs-1);
  font-weight: 700;
  color: var(--sub);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--line);
}
.rr-table td {
  padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--line);
  line-height: var(--lh-dense);
}
</style>
