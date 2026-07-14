<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useBudgetConfigStore } from '@/stores/budgetConfig'
import { useBudgetStore } from '@/stores/budget'
import { useAuthStore } from '@/stores/auth'
import { saveEstimate, type EstimateRecord } from '@/lib/budgetApi'
import { exportEstimate } from '@/lib/budget/exportEstimate'
import type { BudgetForm } from '@/lib/budget/types'
import BasicInfoCard from '@/components/budget/BasicInfoCard.vue'
import RateReferenceCard from '@/components/budget/RateReferenceCard.vue'
import ProductSection from '@/components/budget/ProductSection.vue'
import PmSection from '@/components/budget/PmSection.vue'
import ServiceSection from '@/components/budget/ServiceSection.vue'
import DirectCostSection from '@/components/budget/DirectCostSection.vue'
import RatioCard from '@/components/budget/RatioCard.vue'
import CrmCard from '@/components/budget/CrmCard.vue'
import SummaryCard from '@/components/budget/SummaryCard.vue'
import SalesOrderCard from '@/components/budget/SalesOrderCard.vue'
import EstimateDrawer from '@/components/budget/EstimateDrawer.vue'

const cfgStore = useBudgetConfigStore()
const store = useBudgetStore()
const auth = useAuthStore()

onMounted(async () => {
  await cfgStore.load()
  if (cfgStore.config) {
    store.reset(cfgStore.config)
    store.setCurrentConfig(cfgStore.config)
  }
})

const ready = computed(() => !!cfgStore.config && !!store.form.basic)

// 表单任何变动 → 重新生成 CRM 建议(用户手改过就不覆盖)
watch(() => store.result, () => store.syncCrmText(), { deep: false })

const drawerOpen = ref(false)
const rateCfgOpen = ref(false)   // Task 13:RateConfigDrawer(超管)
const saving = ref(false)

/** 保存与导出前的统一校验。返回错误文案;通过返回 ''。 */
function validate(): string {
  const b = store.form.basic
  const required: [string, unknown][] = [
    ['报价名称', b.quoteName], ['客户名称', b.customerName], ['销售', b.salesName],
    ['项目所在地', b.location], ['项目金额（万元）', b.projectAmount],
    ['项目级别', b.projectLevel], ['客户级别', b.customerLevel],
    ['签约类型', b.signType], ['是否含第三方外采', b.thirdParty],
  ]
  for (const [label, v] of required) {
    if (v === null || v === undefined || String(v).trim() === '') return `请填写「${label}」`
  }
  // 成本比例异常时必须填说明 —— 保存与导出都拦
  const st = store.result?.ratioStatus
  if ((st === 'low' || st === 'high') && !store.form.ratioExplanation.trim()) {
    return '成本比例异常,请填写异常原因'
  }
  return ''
}

/** 保存 = 覆盖当前这条(带 id);另存为 = 强制新建(不带 id)。
 *  原工具是无条件新增 —— 改个错字都多出一条存档。 */
async function save(saveAsNew: boolean): Promise<void> {
  const err = validate()
  if (err) { ElMessage.warning(err); return }
  saving.value = true
  try {
    const rec = await saveEstimate(store.toPayload(saveAsNew))
    store.markSaved(rec.id)
    ElMessage.success(saveAsNew ? '已另存为新报价' : '已保存')
  } catch (e) {
    ElMessage.error('保存失败: ' + (e as Error).message)
  } finally {
    saving.value = false
  }
}

function onExport(): void {
  const err = validate()
  if (err) { ElMessage.warning(err); return }
  const cfg = store.effectiveConfig
  const r = store.result
  const order = store.salesOrder
  if (!cfg || !r || !order) return
  // 导出用**这份报价生效的费率**(旧存档 = 它自己的快照),与页面上看到的数一致
  exportEstimate(store.form, cfg, r, order)
}

/** 脏表单上做破坏性操作(恢复存档 / 新建)前先问一句。 */
async function confirmDiscard(msg: string): Promise<boolean> {
  if (!store.dirty) return true
  try {
    await ElMessageBox.confirm(msg, '有未保存的改动', {
      type: 'warning', confirmButtonText: '放弃改动', cancelButtonText: '取消',
    })
    return true
  } catch {
    return false
  }
}

async function onRestore(rec: EstimateRecord): Promise<void> {
  if (!await confirmDiscard('当前报价有未保存的改动,恢复存档会丢弃它们。确定继续吗?')) return
  // 后端把 data 存成不透明 JSON(EstimateRecord.data: unknown),取回来时按表单形状装载
  store.loadRecord({
    id: rec.id,
    quoteName: rec.quoteName,
    data: rec.data as BudgetForm,
    rateSnapshot: rec.rateSnapshot,
  })
  drawerOpen.value = false
  ElMessage.success(`已恢复「${rec.quoteName}」`)
}

async function onNew(): Promise<void> {
  if (!cfgStore.config) return
  if (!await confirmDiscard('当前报价有未保存的改动,新建会丢弃它们。确定继续吗?')) return
  store.reset(cfgStore.config)
}

onBeforeRouteLeave(async () => {
  if (!store.dirty) return true
  try {
    await ElMessageBox.confirm('有未保存的改动,确定离开吗?', '离开概算工具', {
      type: 'warning', confirmButtonText: '离开', cancelButtonText: '留下',
    })
    return true
  } catch {
    return false
  }
})

defineExpose({ validate, save, onExport, onRestore, onNew, drawerOpen, rateCfgOpen })
</script>

<template>
  <div class="budget-view">
    <el-alert v-if="cfgStore.error" :title="cfgStore.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="cfgStore.loading && !ready" :rows="8" animated />

    <template v-if="ready">
      <!-- 顶部操作条 -->
      <div class="bd-topbar">
        <h2 class="bd-title">概算工具</h2>
        <div class="bd-actions">
          <span v-if="store.dirty" class="bd-dirty">未保存</span>
          <el-button @click="drawerOpen = true">存档</el-button>
          <el-button v-if="auth.user?.isSuper" @click="rateCfgOpen = true">费率与目录配置</el-button>
          <el-button @click="onNew">新建报价</el-button>
        </div>
      </div>

      <!-- 费率快照横幅:这份报价用的是旧费率表,不点重算就一直按旧费率算(报价必须可复现) -->
      <el-alert v-if="store.snapshotStale" type="warning" show-icon :closable="false">
        <template #title>本报价基于保存时的费率表；当前费率表已更新。</template>
        <template #default>
          <el-button size="small" @click="store.useLatestRates()">按最新费率重算</el-button>
        </template>
      </el-alert>

      <!-- 输入区 -->
      <BasicInfoCard />
      <RateReferenceCard />
      <ProductSection />
      <PmSection />
      <ServiceSection />
      <DirectCostSection />

      <!-- 结果区(全部实时联动 store.result / store.salesOrder) -->
      <RatioCard />
      <CrmCard />
      <SummaryCard />
      <SalesOrderCard />

      <!-- 底部操作区 -->
      <div class="bd-footer">
        <el-button type="primary" :loading="saving" @click="save(false)">保存</el-button>
        <el-button :loading="saving" @click="save(true)">另存为新报价</el-button>
        <el-button @click="onExport">导出 Excel</el-button>
      </div>

      <EstimateDrawer
        v-model="drawerOpen"
        :is-super="auth.user?.isSuper === true"
        @restore="onRestore"
      />
      <!-- Task 13:<RateConfigDrawer v-model="rateCfgOpen" /> -->
    </template>
  </div>
</template>

<style scoped>
/* .app-main 自身无内边距 —— 每个页面自己给(见 .projects-view) */
.budget-view {
  display: flex;
  flex-direction: column;
  gap: var(--gap-section);
  padding: var(--sp-4);
}
.bd-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap-card);
  flex-wrap: wrap;
}
.bd-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
.bd-actions { display: flex; align-items: center; gap: var(--sp-2); }
.bd-dirty {
  font-size: var(--fs-1);
  font-weight: 700;
  line-height: var(--lh-dense);
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--r-full);
  background: var(--warn-bg);
  color: var(--warn-text);
}
.bd-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--line);
}
</style>
