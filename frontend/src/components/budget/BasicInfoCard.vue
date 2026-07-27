<script setup lang="ts">
import { useBudgetStore } from '@/stores/budget'
import AppCard from '@/components/AppCard.vue'
import SectionTitle from '@/components/SectionTitle.vue'

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
  <AppCard variant="default" class="bd-card">
    <SectionTitle level="card">基本信息</SectionTitle>

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
  </AppCard>
</template>

<style scoped>
/* 卡片外观(圆角/内边距/底色/阴影/描边)已交给 AppCard(default),此处只留布局属性 */
.bd-card { display: flex; flex-direction: column; gap: var(--gap-stack); }
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
