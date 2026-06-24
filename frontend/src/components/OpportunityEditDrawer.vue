<script setup lang="ts">
import { reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { OPP_COLUMNS, OPP_FIELDS } from '@/lib/opportunityColumns'
import { useOpportunitiesStore } from '@/stores/opportunities'
import type { OppRow } from '@/lib/opportunitiesApi'

const props = defineProps<{
  modelValue: boolean
  row: OppRow | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const store = useOpportunitiesStore()

// 只取 type 非 auto/derived 的可编辑列
const editCols = OPP_COLUMNS.filter((c) => c.type !== 'auto' && c.type !== 'derived')

// 只读信息字段
const infoKeys = ['firstReg', 'lastUpdate', 'recentUpdate'] as const
const infoCols = OPP_COLUMNS.filter((c) => infoKeys.includes(c.key as typeof infoKeys[number]))

// 长文本用 textarea 的字段
const textareaKeys = new Set(['remark', 'name', 'customer', 'mainProducts'])

// 表单本地副本
const form = reactive<Record<string, any>>({})

function rebuildForm(row: OppRow | null) {
  OPP_FIELDS.forEach((k) => {
    form[k] = row ? (row[k] ?? null) : null
  })
}

// 初始建立副本 + 监听 row 变化
rebuildForm(props.row)
watch(() => props.row, (r) => rebuildForm(r))

async function onSave() {
  if (!props.row) return
  const fields: Record<string, any> = {}
  OPP_FIELDS.forEach((k) => { fields[k] = form[k] })
  await store.update(props.row.id, fields)
  ElMessage.success('已保存')
  emit('update:modelValue', false)
}

defineExpose({ form, onSave })
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="编辑商机"
    direction="rtl"
    size="560px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- 表单区域 -->
    <el-form label-position="top" size="default">
      <el-form-item
        v-for="col in editCols"
        :key="col.key"
        :label="col.label"
      >
        <!-- select -->
        <el-select
          v-if="col.type === 'select'"
          v-model="form[col.key]"
          clearable
          style="width: 100%"
        >
          <el-option
            v-for="opt in col.options"
            :key="opt"
            :label="opt"
            :value="opt"
          />
        </el-select>

        <!-- date -->
        <el-date-picker
          v-else-if="col.type === 'date'"
          v-model="form[col.key]"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />

        <!-- number -->
        <el-input-number
          v-else-if="col.type === 'number'"
          v-model="form[col.key]"
          :controls="false"
          style="width: 100%"
        />

        <!-- text: textarea for long fields -->
        <el-input
          v-else-if="textareaKeys.has(col.key)"
          v-model="form[col.key]"
          type="textarea"
          :rows="3"
          style="width: 100%"
        />

        <!-- text: single line -->
        <el-input
          v-else
          v-model="form[col.key]"
          style="width: 100%"
        />
      </el-form-item>
    </el-form>

    <!-- 只读信息区 -->
    <div v-if="row" class="oed-info">
      <div
        v-for="col in infoCols"
        :key="col.key"
        class="oed-info-row"
      >
        <span class="oed-info-label">{{ col.label }}</span>
        <span class="oed-info-val">{{ row[col.key] ?? '-' }}</span>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="onSave">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.oed-info {
  border-top: 1px solid var(--line);
  padding-top: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.oed-info-row {
  display: flex;
  gap: var(--sp-3);
  font-size: var(--fs-2);
  color: var(--sub);
}

.oed-info-label {
  min-width: 120px;
  color: var(--mut);
}

.oed-info-val {
  color: var(--sub);
}
</style>
