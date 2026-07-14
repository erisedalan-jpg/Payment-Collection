<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBudgetStore } from '@/stores/budget'
import { productTotalDays } from '@/lib/budget/calc'
import type { DayCells, ProductRow } from '@/lib/budget/types'

const store = useBudgetStore()
const cfg = computed(() => store.effectiveConfig!)

let seq = 0
const uid = (): string => `p${Date.now()}_${seq++}`

/** 已添加的目录产品置灰 —— 同一产品不可重复添加(自定义产品例外,可重复)。 */
const usedIds = computed(() =>
  new Set(store.form.products.filter((p) => !p.isCustom).map((p) => p.id)))

const emptyCells = (): DayCells => ({ tech1: 0, tech2: 0, out1: 0, out2: 0 })

/** 四格人天:金额只认这四格,合计参考人天不参与。 */
const CELLS: { key: keyof DayCells; label: string }[] = [
  { key: 'tech1', label: '技服一类' },
  { key: 'tech2', label: '技服二类' },
  { key: 'out1', label: '外包一类' },
  { key: 'out2', label: '外包二类' },
]

const pick = ref('')

function addProduct(id: string): void {
  if (usedIds.value.has(id)) return
  const def = cfg.value.products.find((p) => p.id === id)
  if (!def) return
  store.form.products.push({
    uid: uid(), id: def.id, name: def.name, isCustom: false,
    qty: 1, stdDays: def.stdDays, coefficient: def.coefficient,
    std: emptyCells(), nonStdDesc: '', nonStd: emptyCells(),
    customDesc: '', custom: emptyCells(),
  })
  store.touch()
}

/** 下拉选中即添加,随后清空选择 —— 下拉是「加一个产品」的入口,不是「当前产品」的状态。 */
function onPick(id: string): void {
  if (id) addProduct(id)
  pick.value = ''
}

function addCustom(): void {
  store.form.products.push({
    uid: uid(), id: 'other', name: '', isCustom: true,
    qty: 0, stdDays: 0, coefficient: 0,
    std: emptyCells(), nonStdDesc: '', nonStd: emptyCells(),
    customDesc: '', custom: emptyCells(),
  })
  store.touch()
}

function removeProduct(u: string): void {
  const i = store.form.products.findIndex((p) => p.uid === u)
  if (i >= 0) store.form.products.splice(i, 1)
  store.touch()
}

/** 合计参考人天:只读、只是参考 —— 人天必须手动分配到四格,金额只认四格。 */
function totalDaysOf(p: ProductRow): number {
  return productTotalDays(p.qty, p.stdDays, p.coefficient)
}

const descOf = (p: ProductRow) => cfg.value.products.find((x) => x.id === p.id)

const touch = (): void => store.touch()

defineExpose({ addProduct, addCustom, removeProduct, totalDaysOf })
</script>

<template>
  <section class="bd-card">
    <div class="ps-head">
      <h3 class="bd-card-title">产品实施</h3>
      <div class="ps-tools">
        <el-select
          v-model="pick"
          class="ps-select"
          filterable
          clearable
          placeholder="搜索并选择产品（已添加的不可重复选）"
          @change="onPick"
        >
          <el-option
            v-for="p in cfg.products"
            :key="p.id"
            :value="p.id"
            :label="`${p.id} ${p.name}`"
            :disabled="usedIds.has(p.id)"
          />
        </el-select>
        <el-button @click="addCustom">添加自定义产品</el-button>
      </div>
    </div>

    <p v-if="!store.form.products.length" class="ps-empty">
      还没有产品。从上方下拉选一个目录产品，或添加自定义产品。
    </p>

    <div v-for="p in store.form.products" :key="p.uid" class="ps-item">
      <div class="ps-item-head">
        <template v-if="p.isCustom">
          <el-input
            v-model="p.name"
            class="ps-custom-name"
            placeholder="自定义产品名称"
            @input="touch"
          />
        </template>
        <template v-else>
          <span class="ps-name">{{ p.id }} {{ p.name }}</span>
          <el-tooltip placement="top" effect="dark">
            <template #content>
              <div class="ps-tip">
                <p>标准实施：{{ descOf(p)?.stdDesc || '—' }}</p>
                <p>非标实施：{{ descOf(p)?.nonstdDesc || '—' }}</p>
              </div>
            </template>
            <span class="ps-info" role="img" aria-label="说明">?</span>
          </el-tooltip>
        </template>
        <el-button link type="danger" class="ps-del" @click="removeProduct(p.uid)">✕ 删除</el-button>
      </div>

      <!-- 目录产品:标准实施 + 非标实施 -->
      <template v-if="!p.isCustom">
        <div class="ps-block">
          <h4 class="ps-h">标准实施</h4>
          <div class="ps-row">
            <div class="ps-field">
              <label class="ps-label">数量</label>
              <el-input-number v-model="p.qty" class="u-num ps-num" :min="0" :controls="false" @change="touch" />
            </div>
            <div class="ps-field">
              <label class="ps-label">单台标准人天</label>
              <el-input-number v-model="p.stdDays" class="u-num ps-num" :min="0" :controls="false" @change="touch" />
            </div>
            <div class="ps-field">
              <label class="ps-label">设备系数</label>
              <el-input-number v-model="p.coefficient" class="u-num ps-num" :min="0" :controls="false" @change="touch" />
            </div>
            <div class="ps-field ps-ref">
              <label class="ps-label">合计参考人天</label>
              <span class="ps-ref-val u-num">{{ totalDaysOf(p) }}</span>
              <span class="ps-ref-hint">仅供参考，不进金额；人天请手动填到下面四格</span>
            </div>
          </div>
          <div class="ps-row">
            <div v-for="c in CELLS" :key="c.key" class="ps-field">
              <label class="ps-label">{{ c.label }}（人天）</label>
              <el-input-number v-model="p.std[c.key]" class="u-num ps-num" :min="0" :controls="false" @change="touch" />
            </div>
          </div>
        </div>

        <div class="ps-block">
          <h4 class="ps-h">非标实施</h4>
          <el-input
            v-model="p.nonStdDesc"
            type="textarea"
            :rows="2"
            placeholder="非标实施的工作内容"
            @input="touch"
          />
          <div class="ps-row">
            <div v-for="c in CELLS" :key="c.key" class="ps-field">
              <label class="ps-label">{{ c.label }}（人天）</label>
              <el-input-number v-model="p.nonStd[c.key]" class="u-num ps-num" :min="0" :controls="false" @change="touch" />
            </div>
          </div>
        </div>
      </template>

      <!-- 自定义产品:只有工作内容 + 四格人天 -->
      <template v-else>
        <div class="ps-block">
          <h4 class="ps-h">工作内容</h4>
          <el-input
            v-model="p.customDesc"
            type="textarea"
            :rows="2"
            placeholder="自定义产品的工作内容"
            @input="touch"
          />
          <div class="ps-row">
            <div v-for="c in CELLS" :key="c.key" class="ps-field">
              <label class="ps-label">{{ c.label }}（人天）</label>
              <el-input-number v-model="p.custom[c.key]" class="u-num ps-num" :min="0" :controls="false" @change="touch" />
            </div>
          </div>
        </div>
      </template>
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
.ps-head { display: flex; align-items: center; justify-content: space-between; gap: var(--gap-card); flex-wrap: wrap; }
.ps-tools { display: flex; align-items: center; gap: var(--sp-3); }
.ps-select { width: 320px; }
.ps-empty { font-size: var(--fs-2); color: var(--mut); }

.ps-item {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--sp-4);
  background: var(--card2);
}
.ps-item-head { display: flex; align-items: center; gap: var(--sp-2); }
.ps-name { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
.ps-custom-name { max-width: 320px; }
.ps-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px; height: 18px;
  border-radius: var(--r-full);
  border: 1px solid var(--line2);
  font-size: var(--fs-1);
  color: var(--sub);
  cursor: help;
}
.ps-tip { max-width: 320px; font-size: var(--fs-1); line-height: var(--lh-base); }
.ps-del { margin-left: auto; }

.ps-block { display: flex; flex-direction: column; gap: var(--sp-2); }
.ps-h { font-size: var(--fs-2); font-weight: 700; color: var(--sub); line-height: var(--lh-dense); }
.ps-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.ps-field { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
.ps-label { font-size: var(--fs-1); color: var(--sub); line-height: var(--lh-dense); }
.ps-num { width: 120px; }
.ps-ref { justify-content: flex-end; }
.ps-ref-val { font-size: var(--fs-3); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.ps-ref-hint { font-size: var(--fs-1); color: var(--mut); }
</style>
