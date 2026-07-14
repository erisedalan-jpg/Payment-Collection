<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useBudgetConfigStore } from '@/stores/budgetConfig'
import type {
  BudgetConfig, BudgetRates, CityRate, HotelRates, MaterialKey,
} from '@/lib/budget/types'

/** 费率与目录配置抽屉(入口仅超管可见)。
 *
 *  ★ 这个抽屉存在的意义 ★
 *  原工具把汇率(6.8,还直接写在函数体里)、人天成本单价、住宿与差补标准、销售物料单价、
 *  成本比例阈值、19 个产品与 8 项服务的目录**全部硬编码在代码里**,有的还在 HTML 和 JS
 *  里各写一遍(两份真相源)。价格是会变的,而后继管理员根本无从得知这些数字从哪来、更改不动。
 *  用户钦定:凡「影响关键结果却埋在代码里」的口径,一律提升为可见可配 —— 这个抽屉就是那个「可见」。
 *
 *  ★ 草稿与生效配置解耦 ★
 *  打开时把 cfgStore.config **深拷贝**成 draft;页面上的费率速查表、输入框占位符、
 *  计算结果读的都是 store 里那份生效配置,改 draft 一律不影响它们。点「保存并生效」才
 *  cfgStore.save(draft) —— 中途关掉抽屉等于放弃改动,下次打开重新拷一份。
 *
 *  ★ 校验只认后端一处 ★
 *  合法性由后端 budget_config.validate_config 判定,它抛的 ValueError 文案本来就是可读中文
 *  (如「成本比例区间下限必须小于上限」「salesPrices 的键必须与 materials 的 key 一一对应」),
 *  这里**原样**展示给超管,不吞掉换成「保存失败」。前端不再抄一份校验规则 —— 那就是第二份
 *  真相源,迟早与后端漂移。
 *
 *  ★ 前端的超管判定只是 UI ★
 *  入口按钮 v-if="auth.user?.isSuper" 只是不给入口;真正的闸在后端
 *  (普通管理员 POST /api/budget/config → 403)。别以为藏了按钮就安全。
 *
 *  ★ 改费率不会改写旧报价 ★
 *  已保存的报价各自冻结了保存那一刻的费率快照(rateSnapshot),超管改了费率它们也不变 ——
 *  打开旧报价只会看到「本报价基于保存时的费率表」横幅。这是设计意图(报价必须可复现),不是 bug。
 */
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const cfgStore = useBudgetConfigStore()

const draft = ref<BudgetConfig | null>(null)
/** 模板里用的非空视图(同 ProductSection 的 store.effectiveConfig! 手法);渲染由外层 v-if="draft" 守住。 */
const d = computed(() => draft.value as BudgetConfig)

const tab = ref('price')
const error = ref('')

const clone = (c: BudgetConfig): BudgetConfig => JSON.parse(JSON.stringify(c)) as BudgetConfig

/** 每次打开都从当前生效配置重新拷一份 —— 上次改了没保存就关掉的残留草稿不该带回来。 */
function open(): void {
  if (!cfgStore.config) return
  draft.value = clone(cfgStore.config)
  error.value = ''
  tab.value = 'price'
}
watch(() => props.modelValue, (v) => { if (v) open() }, { immediate: true })

// —— 价格与阈值页签的字段表(标签集中一处,不在模板里散写) ——
const RATE_CITIES: { key: keyof BudgetRates; label: string }[] = [
  { key: 'city1', label: '一类城市' },
  { key: 'city2', label: '二类城市' },
]
const RATE_ROLES: { key: keyof CityRate; label: string }[] = [
  { key: 'pm', label: '项目经理' },
  { key: 'tech', label: '技术服务' },
  { key: 'out', label: '外包' },
]
/** 住宿的城市分类(一线/省会/其他/港澳)与人工成本的一类/二类是两套互不相干的口径,
 *  外包差旅又用回一类/二类 —— 原工具的既定事实,不要合并。港澳按美金计,结算时乘汇率。 */
const HOTEL_FIELDS: { key: keyof HotelRates; label: string }[] = [
  { key: 'type1', label: '一线城市（元/晚）' },
  { key: 'capital', label: '省会城市（元/晚）' },
  { key: 'other', label: '其他城市（元/晚）' },
  { key: 'hk', label: '港澳（美金/晚）' },
  { key: 'outType1', label: '外包差旅 一类城市（元/晚）' },
  { key: 'outType2', label: '外包差旅 二类城市（元/晚）' },
]

// —— 产品目录 ——
/** 后端要求产品 id 非空、不重复、且不能是 'other'(该 id 保留给自定义产品) ——
 *  新行先给个不冲突的候选 id,超管可再改。 */
function nextProductId(): string {
  const used = new Set(d.value.products.map((p) => p.id))
  let n = d.value.products.length + 1
  while (used.has(`1.${n}`)) n++
  return `1.${n}`
}

function addProduct(): void {
  if (!draft.value) return
  draft.value.products.push({
    id: nextProductId(), name: '', coefficient: 1, stdDays: 1, stdDesc: '', nonstdDesc: '',
  })
}

function removeProduct(i: number): void {
  draft.value?.products.splice(i, 1)
}

// —— 服务目录 ——
function addService(): void {
  draft.value?.services.push({ name: '', desc: '' })
}

function removeService(i: number): void {
  draft.value?.services.splice(i, 1)
}

// —— 物料 ——
/** el-table 行槽里的 row 拿不到精确类型,索引 salesPrices(Record<MaterialKey, number>)会被
 *  TS 判为隐式 any —— 这里把读写收敛成两个签名明确的函数,模板只管调。 */
const priceOf = (k: MaterialKey): number => d.value.salesPrices[k]

function setPrice(k: MaterialKey, v: number | undefined): void {
  if (draft.value) draft.value.salesPrices[k] = Number(v ?? 0)
}

// —— 毛利率档位 ——
function addMargin(): void {
  draft.value?.margins.push({ value: 0.1, label: '10%' })
}

function removeMargin(i: number): void {
  draft.value?.margins.splice(i, 1)
}

/** 保存 → 后端校验 → 写回 store。store 里的 config 一变,页面的费率速查表 / 占位符 /
 *  计算结果(全是 computed)自动跟着变,不必点「更新数据」、不必刷新。 */
async function save(): Promise<void> {
  if (!draft.value) return
  error.value = ''
  try {
    // 传克隆:store 会把后端返回的配置写回 config,别让 config 与 draft 变成同一个对象
    // (那样再动草稿就会直接污染生效配置,解耦白做了)
    await cfgStore.save(clone(draft.value))
    ElMessage.success('费率已更新,立即生效')
    emit('update:modelValue', false)
  } catch (e) {
    // 后端的校验文案是可读中文,原样展示 —— 超管才知道到底哪一项不合法
    error.value = e instanceof Error ? e.message : '保存失败'
    ElMessage.error(error.value)
  }
}

defineExpose({
  draft, tab, error, save,
  addProduct, removeProduct, addService, removeService, addMargin, removeMargin,
})
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="费率与目录配置"
    direction="rtl"
    size="60%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="draft" class="rc-body">
      <p class="rc-hint">
        保存后<strong>立即生效</strong>（无需点「更新数据」）。已保存的旧报价不会被改写 ——
        它们各自冻结了保存时的费率快照，打开时会提示「本报价基于保存时的费率表」，这是为了报价可复现。
      </p>

      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />

      <el-tabs v-model="tab" class="rc-tabs">
        <!-- 1. 价格与阈值 -->
        <el-tab-pane label="价格与阈值" name="price">
          <section class="rc-sec">
            <h4 class="rc-h">人天成本单价（元/人天）</h4>
            <div class="rc-cols">
              <div v-for="c in RATE_CITIES" :key="c.key" class="rc-col">
                <span class="rc-col-head">{{ c.label }}</span>
                <div v-for="r in RATE_ROLES" :key="r.key" class="rc-field">
                  <label class="rc-label">{{ r.label }}</label>
                  <el-input-number
                    v-model="d.rates[c.key][r.key]"
                    class="u-num rc-num" :min="0" :controls="false"
                  />
                </div>
              </div>
            </div>
          </section>

          <section class="rc-sec">
            <h4 class="rc-h">销售物料单价（元/人天）</h4>
            <p class="rc-note">
              与「物料」页签是同一份数据（salesPrices），改哪边都一样。销售单价与毛利率无关 ——
              毛利率只作为 (1 + 毛利率) 的乘数。
            </p>
            <div class="rc-fields">
              <div v-for="m in d.materials" :key="m.key" class="rc-field">
                <label class="rc-label">{{ m.name }}</label>
                <el-input-number
                  v-model="d.salesPrices[m.key]"
                  class="u-num rc-num" :min="0" :controls="false"
                />
              </div>
            </div>
          </section>

          <section class="rc-sec">
            <h4 class="rc-h">住宿标准</h4>
            <div class="rc-fields">
              <div v-for="h in HOTEL_FIELDS" :key="h.key" class="rc-field">
                <label class="rc-label">{{ h.label }}</label>
                <el-input-number
                  v-model="d.hotel[h.key]"
                  class="u-num rc-num" :min="0" :controls="false"
                />
              </div>
            </div>
          </section>

          <section class="rc-sec">
            <h4 class="rc-h">差补标准与汇率</h4>
            <div class="rc-fields">
              <div class="rc-field">
                <label class="rc-label">差补 境内（元/天）</label>
                <el-input-number v-model="d.allowance.dom" class="u-num rc-num" :min="0" :controls="false" />
              </div>
              <div class="rc-field">
                <label class="rc-label">差补 境外（美金/天）</label>
                <el-input-number v-model="d.allowance.intl" class="u-num rc-num" :min="0" :controls="false" />
              </div>
              <div class="rc-field">
                <label class="rc-label">汇率（美金 → 人民币）</label>
                <el-input-number
                  v-model="d.fx"
                  class="u-num rc-num" :min="0" :step="0.01" :controls="false"
                />
              </div>
            </div>
          </section>

          <section class="rc-sec">
            <h4 class="rc-h">成本比例正常区间（%）</h4>
            <p class="rc-note">闭区间。低于下限 → 偏低告警；高于上限 → 偏高告警，两者都要求填异常说明。</p>
            <div class="rc-fields">
              <div class="rc-field">
                <label class="rc-label">下限</label>
                <el-input-number v-model="d.ratio.min" class="u-num rc-num" :min="0" :controls="false" />
              </div>
              <div class="rc-field">
                <label class="rc-label">上限</label>
                <el-input-number v-model="d.ratio.max" class="u-num rc-num" :min="0" :controls="false" />
              </div>
            </div>
          </section>

          <section class="rc-sec">
            <h4 class="rc-h">毛利率档位</h4>
            <p class="rc-note">value 是 [0, 1) 的小数（0.13 = 13%）；label 是下拉里显示的文字。</p>
            <div v-for="(m, i) in d.margins" :key="i" class="rc-row">
              <div class="rc-field">
                <label class="rc-label">毛利率</label>
                <el-input-number
                  v-model="m.value"
                  class="u-num rc-num" :min="0" :max="0.99" :step="0.01" :controls="false"
                />
              </div>
              <div class="rc-field rc-grow">
                <label class="rc-label">显示文字</label>
                <el-input v-model="m.label" placeholder="如 13%（含产品）" />
              </div>
              <el-button link type="danger" class="rc-del" @click="removeMargin(i)">✕ 删除</el-button>
            </div>
            <el-button class="rc-add" @click="addMargin">新增档位</el-button>
          </section>
        </el-tab-pane>

        <!-- 2. 产品目录 -->
        <el-tab-pane label="产品目录" name="products">
          <p class="rc-note">
            产品编号不可重复，且不能用 other（该编号保留给「自定义产品」）。系数与标准人天只作为参考值 ——
            页面上的人天一律手填。
          </p>
          <el-table :data="d.products" size="default" class="rc-table">
            <el-table-column label="编号" width="100">
              <template #default="{ row }">
                <el-input v-model="row.id" class="u-num" placeholder="1.20" />
              </template>
            </el-table-column>
            <el-table-column label="产品名" min-width="160">
              <template #default="{ row }">
                <el-input v-model="row.name" placeholder="产品名称" />
              </template>
            </el-table-column>
            <el-table-column label="设备系数" width="110">
              <template #default="{ row }">
                <el-input-number v-model="row.coefficient" class="u-num rc-cell-num" :min="0" :step="0.1" :controls="false" />
              </template>
            </el-table-column>
            <el-table-column label="单台标准人天" width="120">
              <template #default="{ row }">
                <el-input-number v-model="row.stdDays" class="u-num rc-cell-num" :min="0" :step="0.5" :controls="false" />
              </template>
            </el-table-column>
            <el-table-column label="标准实施说明" min-width="220">
              <template #default="{ row }">
                <el-input v-model="row.stdDesc" type="textarea" :rows="3" placeholder="标准实施说明" />
              </template>
            </el-table-column>
            <el-table-column label="非标实施说明" min-width="220">
              <template #default="{ row }">
                <el-input v-model="row.nonstdDesc" type="textarea" :rows="3" placeholder="非标实施说明" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ $index }">
                <el-button link type="danger" @click="removeProduct($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button class="rc-add" @click="addProduct">新增产品</el-button>
        </el-tab-pane>

        <!-- 3. 服务目录 -->
        <el-tab-pane label="服务目录" name="services">
          <p class="rc-note">
            说明是添加该服务时带入的默认「工作内容」，报价里可再改。标「用户自定义」的那条
            （其他服务）在报价页允许自填服务名。
          </p>
          <el-table :data="d.services" size="default" class="rc-table">
            <el-table-column label="服务名" min-width="160">
              <template #default="{ row }">
                <el-input v-model="row.name" placeholder="服务名称" />
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="320">
              <template #default="{ row }">
                <el-input v-model="row.desc" type="textarea" :rows="3" placeholder="服务说明" />
              </template>
            </el-table-column>
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <span class="rc-type">{{ row.isOther ? '用户自定义' : '标准' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ $index }">
                <el-button link type="danger" @click="removeService($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button class="rc-add" @click="addService">新增服务</el-button>
        </el-tab-pane>

        <!-- 4. 物料 -->
        <el-tab-pane label="物料" name="materials">
          <p class="rc-note">
            key 不可改：它是 salesPrices 的键，后端强制两者一一对应（销售下单的逆运算靠它对账），
            改了会被拒。要增删物料须同时改前端类型 MaterialKey，不在本抽屉的范围内。
          </p>
          <el-table :data="d.materials" size="default" class="rc-table">
            <el-table-column label="key" width="110">
              <template #default="{ row }">
                <span class="u-num rc-key">{{ row.key }}</span>
              </template>
            </el-table-column>
            <el-table-column label="物料编号" min-width="220">
              <template #default="{ row }">
                <el-input v-model="row.code" class="u-num" placeholder="JY-CPJF-..." />
              </template>
            </el-table-column>
            <el-table-column label="物料名称" min-width="260">
              <template #default="{ row }">
                <el-input v-model="row.name" placeholder="物料名称" />
              </template>
            </el-table-column>
            <el-table-column label="销售单价（元/人天）" width="160">
              <template #default="{ row }">
                <el-input-number
                  :model-value="priceOf(row.key)"
                  class="u-num rc-cell-num" :min="0" :controls="false"
                  @update:model-value="setPrice(row.key, $event)"
                />
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <div class="rc-footer">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" :loading="cfgStore.saving" @click="save">保存并生效</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.rc-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-stack);
}
.rc-hint {
  font-size: var(--fs-1);
  color: var(--sub);
  line-height: var(--lh-base);
}
.rc-note {
  font-size: var(--fs-1);
  color: var(--mut);
  line-height: var(--lh-dense);
  margin-bottom: var(--sp-2);
}

.rc-sec {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-bottom: var(--sp-4);
  border-bottom: 1px solid var(--line);
}
.rc-sec:last-child { border-bottom: none; padding-bottom: 0; }
.rc-h {
  font-size: var(--fs-3);
  font-weight: 700;
  color: var(--txt);
  line-height: var(--lh-dense);
}

.rc-cols { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.rc-col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--card2);
}
.rc-col-head {
  font-size: var(--fs-2);
  font-weight: 700;
  color: var(--txt);
  line-height: var(--lh-dense);
}

.rc-fields { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.rc-row {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--gap-card);
}
.rc-field { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
.rc-grow { flex: 1 1 200px; }
.rc-label {
  font-size: var(--fs-1);
  color: var(--sub);
  line-height: var(--lh-dense);
}
.rc-num { width: 140px; }
.rc-cell-num { width: 100%; }
.rc-del { margin-bottom: var(--sp-1); }
.rc-add { align-self: flex-start; margin-top: var(--sp-3); }

.rc-table { width: 100%; }
.rc-key { font-size: var(--fs-2); color: var(--sub); }
.rc-type { font-size: var(--fs-1); color: var(--mut); }

.rc-footer { display: flex; justify-content: flex-end; gap: var(--sp-2); }
</style>
