<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useBudgetConfigStore } from '@/stores/budgetConfig'
import { useBudgetStore } from '@/stores/budget'
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

const cfgStore = useBudgetConfigStore()
const store = useBudgetStore()

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
</script>

<template>
  <div class="budget-view">
    <el-alert v-if="cfgStore.error" :title="cfgStore.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="cfgStore.loading && !ready" :rows="8" animated />

    <template v-if="ready">
      <!-- Task 12:EstimateDrawer + 顶部操作条 + 费率快照横幅
           Task 13:RateConfigDrawer(超管) -->
      <h2 class="bd-title">概算工具</h2>

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
.bd-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
</style>
