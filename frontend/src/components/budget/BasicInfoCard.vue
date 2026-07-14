<script setup lang="ts">
import { useBudgetStore } from '@/stores/budget'

// 这四组取值是审批标签,不参与任何计算,也不进费率配置 —— 故写在组件里,不从 config 读。
const PROJECT_LEVELS = ['P1', 'P2', 'P3', 'P4']
const CUSTOMER_LEVELS = ['TOP1000', '指名客户', '非指名客户']
const SIGN_TYPES = ['直签', '渠道', '项目合作']
const THIRD_PARTY = ['否', '是']

const store = useBudgetStore()
const touch = (): void => store.touch()

defineExpose({ PROJECT_LEVELS, CUSTOMER_LEVELS, SIGN_TYPES, THIRD_PARTY })
</script>

<template>
  <section class="bd-card">
    <h3 class="bd-card-title">基本信息</h3>

    <div class="bi-grid">
      <div class="bi-field">
        <label class="bi-label">报价名称</label>
        <el-input v-model="store.form.basic.quoteName" placeholder="用于存档列表识别" @input="touch" />
      </div>

      <div class="bi-field">
        <label class="bi-label">客户名称</label>
        <el-input v-model="store.form.basic.customerName" placeholder="客户全称" @input="touch" />
      </div>

      <div class="bi-field">
        <label class="bi-label">销售姓名</label>
        <el-input v-model="store.form.basic.salesName" placeholder="对接销售" @input="touch" />
      </div>

      <div class="bi-field">
        <label class="bi-label">项目地点</label>
        <el-input v-model="store.form.basic.location" placeholder="仅作记录，与城市分类无联动" @input="touch" />
      </div>

      <div class="bi-field">
        <label class="bi-label">项目金额（万元）</label>
        <el-input-number
          v-model="store.form.basic.projectAmount"
          class="u-num bi-num"
          :min="0"
          :controls="false"
          placeholder="成本比例的分母"
          @change="touch"
        />
      </div>

      <div class="bi-field">
        <label class="bi-label">项目级别</label>
        <el-select v-model="store.form.basic.projectLevel" placeholder="请选择" @change="touch">
          <el-option v-for="v in PROJECT_LEVELS" :key="v" :value="v" :label="v" />
        </el-select>
      </div>

      <div class="bi-field">
        <label class="bi-label">客户级别</label>
        <el-select v-model="store.form.basic.customerLevel" placeholder="请选择" @change="touch">
          <el-option v-for="v in CUSTOMER_LEVELS" :key="v" :value="v" :label="v" />
        </el-select>
      </div>

      <div class="bi-field">
        <label class="bi-label">签约类型</label>
        <el-select v-model="store.form.basic.signType" placeholder="请选择" @change="touch">
          <el-option v-for="v in SIGN_TYPES" :key="v" :value="v" :label="v" />
        </el-select>
      </div>

      <div class="bi-field">
        <label class="bi-label">是否含第三方外采</label>
        <el-select v-model="store.form.basic.thirdParty" placeholder="请选择" @change="touch">
          <el-option v-for="v in THIRD_PARTY" :key="v" :value="v" :label="v" />
        </el-select>
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
.bd-card-title {
  font-size: var(--fs-4);
  font-weight: 700;
  color: var(--txt);
  line-height: var(--lh-dense);
}
.bi-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--gap-card);
}
@media (max-width: 1200px) { .bi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 768px) { .bi-grid { grid-template-columns: minmax(0, 1fr); } }
.bi-field { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
.bi-label { font-size: var(--fs-1); color: var(--sub); line-height: var(--lh-dense); }
.bi-num { width: 100%; }
</style>
