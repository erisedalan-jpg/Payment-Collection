<script setup lang="ts">
import { computed } from 'vue'
import { useBudgetStore } from '@/stores/budget'
import { fmtYuan } from '@/lib/format'
import type { DirectCostForm } from '@/lib/budget/types'

/** 直接成本(差补/住宿/交通)。所有单价一律从 store.effectiveConfig 读 —— 一个数都不写死,
 *  否则超管改了费率,页面提示还留着旧数字。 */
const store = useBudgetStore()
const cfg = computed(() => store.effectiveConfig!)

interface Field { key: keyof DirectCostForm; label: string; hint: string }

const allowanceFields = computed<Field[]>(() => [
  { key: 'allowanceDomDays', label: '差补·境内（天）', hint: `${cfg.value.allowance.dom} 元/天` },
  { key: 'allowanceIntlDays', label: '差补·境外（天）', hint: `${cfg.value.allowance.intl} 美金/天，汇率 ${cfg.value.fx}` },
])

const hotelFields = computed<Field[]>(() => [
  { key: 'hotelType1', label: '住宿·一线城市（晚）', hint: `${cfg.value.hotel.type1} 元/晚` },
  { key: 'hotelCapital', label: '住宿·省会城市（晚）', hint: `${cfg.value.hotel.capital} 元/晚` },
  { key: 'hotelOther', label: '住宿·其他城市（晚）', hint: `${cfg.value.hotel.other} 元/晚` },
  { key: 'hotelHk', label: '住宿·港澳（晚）', hint: `${cfg.value.hotel.hk} 美金/晚，汇率 ${cfg.value.fx}` },
  { key: 'hotelOutType1', label: '外包差旅·一类城市（晚）', hint: `${cfg.value.hotel.outType1} 元/晚` },
  { key: 'hotelOutType2', label: '外包差旅·二类城市（晚）', hint: `${cfg.value.hotel.outType2} 元/晚` },
])

// ★两个交通字段是**两个不同类目**,都计入直接成本,别当成重复计费:
//  本地交通 = 员工常驻(base)地的交通费;当地交通 = 差旅期间在目的地的交通费。
const transportFields: Field[] = [
  { key: 'localTransportBase', label: '本地交通（员工 base 地）（元）', hint: '员工常驻地的交通费' },
  { key: 'localTransportTrip', label: '当地交通（差旅期间）（元）', hint: '差旅期间在目的地的交通费' },
  { key: 'interCityTransport', label: '城际交通（元）', hint: '往返目的地的机票/高铁等' },
]

const touch = (): void => store.touch()

defineExpose({ allowanceFields, hotelFields, transportFields })
</script>

<template>
  <section class="bd-card">
    <div class="dc-head">
      <h3 class="bd-card-title">直接成本</h3>
      <span class="dc-total u-num">合计 {{ fmtYuan(store.result?.directCost ?? 0) }} 元</span>
    </div>

    <div class="dc-block">
      <h4 class="dc-h">差补</h4>
      <div class="dc-row">
        <div v-for="f in allowanceFields" :key="f.key" class="dc-field">
          <label class="dc-label">{{ f.label }}</label>
          <el-input-number
            v-model="store.form.direct[f.key]"
            class="u-num dc-num"
            :min="0"
            :controls="false"
            :placeholder="f.hint"
            @change="touch"
          />
          <span class="dc-hint u-num">{{ f.hint }}</span>
        </div>
      </div>
    </div>

    <div class="dc-block">
      <h4 class="dc-h">住宿 / 外包差旅</h4>
      <div class="dc-row">
        <div v-for="f in hotelFields" :key="f.key" class="dc-field">
          <label class="dc-label">{{ f.label }}</label>
          <el-input-number
            v-model="store.form.direct[f.key]"
            class="u-num dc-num"
            :min="0"
            :controls="false"
            :placeholder="f.hint"
            @change="touch"
          />
          <span class="dc-hint u-num">{{ f.hint }}</span>
        </div>
      </div>
    </div>

    <div class="dc-block">
      <h4 class="dc-h">交通</h4>
      <div class="dc-row">
        <div v-for="f in transportFields" :key="f.key" class="dc-field">
          <label class="dc-label">{{ f.label }}</label>
          <el-input-number
            v-model="store.form.direct[f.key]"
            class="u-num dc-num"
            :min="0"
            :controls="false"
            :placeholder="f.hint"
            @change="touch"
          />
          <span class="dc-hint">{{ f.hint }}</span>
        </div>
      </div>
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
.dc-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--gap-card); }
.dc-total { font-size: var(--fs-2); color: var(--sub); }
.dc-block { display: flex; flex-direction: column; gap: var(--sp-2); }
.dc-h { font-size: var(--fs-2); font-weight: 700; color: var(--sub); line-height: var(--lh-dense); }
.dc-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.dc-field { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; width: 200px; }
.dc-label { font-size: var(--fs-1); color: var(--sub); line-height: var(--lh-dense); }
.dc-hint { font-size: var(--fs-1); color: var(--mut); line-height: var(--lh-dense); }
.dc-num { width: 100%; }
</style>
