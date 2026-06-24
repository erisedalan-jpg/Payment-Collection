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
  <!-- 遮罩层 -->
  <div v-if="modelValue" class="oed-overlay" @click.self="emit('update:modelValue', false)">
    <!-- 抽屉面板 -->
    <div class="oed-panel" role="dialog" aria-label="编辑商机">
      <!-- 标题栏 -->
      <div class="oed-header">
        <span class="oed-title">编辑商机</span>
        <button class="oed-close" @click="emit('update:modelValue', false)">✕</button>
      </div>

      <!-- 表单区域 -->
      <div class="oed-body">
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
      </div>

      <!-- 底部操作栏 -->
      <div class="oed-footer">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button type="primary" @click="onSave">保存</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oed-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: var(--z-panel, 1500);
  display: flex;
  justify-content: flex-end;
}

.oed-panel {
  width: 560px;
  height: 100%;
  background: var(--bg, #fff);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-2, -2px 0 12px rgba(0,0,0,.12));
}

.oed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3, 12px) var(--sp-4, 16px);
  border-bottom: 1px solid var(--border, #e5e7eb);
  flex-shrink: 0;
}

.oed-title {
  font-size: var(--fs-4, 19px);
  font-weight: 600;
  color: var(--txt, #1a1a1a);
}

.oed-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--fs-3, 16px);
  color: var(--sub, #6b7280);
  padding: var(--sp-1, 4px);
  border-radius: var(--r-sm, 6px);
  line-height: 1;
}

.oed-close:hover {
  background: var(--hover-tint, rgba(0,0,0,.06));
  color: var(--txt, #1a1a1a);
}

.oed-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-3, 12px) var(--sp-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--gap-section, 24px);
}

.oed-info {
  border-top: 1px solid var(--border, #e5e7eb);
  padding-top: var(--sp-3, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2, 8px);
}

.oed-info-row {
  display: flex;
  gap: var(--sp-3, 12px);
  font-size: var(--fs-2, 14px);
  color: var(--sub, #6b7280);
}

.oed-info-label {
  min-width: 120px;
  color: var(--mut, #9ca3af);
}

.oed-info-val {
  color: var(--sub, #6b7280);
}

.oed-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--sp-2, 8px);
  padding: var(--sp-3, 12px) var(--sp-4, 16px);
  border-top: 1px solid var(--border, #e5e7eb);
  flex-shrink: 0;
}
</style>
