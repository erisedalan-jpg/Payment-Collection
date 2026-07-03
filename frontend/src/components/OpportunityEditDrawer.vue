<script setup lang="ts">
import { reactive, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { OPP_COLUMNS, OPP_FIELDS } from '@/lib/opportunityColumns'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { useAuthStore } from '@/stores/auth'
import type { OppRow } from '@/lib/opportunitiesApi'

const props = defineProps<{
  modelValue: boolean
  row: OppRow | null
  mode?: 'create' | 'edit'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const store = useOpportunitiesStore()
const auth = useAuthStore()

// 只取 type 非 auto/derived 的可编辑列
const editCols = OPP_COLUMNS.filter((c) => c.type !== 'auto' && c.type !== 'derived')

// L4 写入约束:普通管理员只能选本人 allowedL4(后端同样校验);'*' 视为全集。
function optionsFor(col: { key: string; options?: string[] }): string[] {
  const full = col.options ?? []
  if (col.key !== 'l4' || auth.isSuper) return full
  const allowed = auth.user?.allowedL4 ?? []
  if (allowed.includes('*')) return full
  return full.filter((o) => allowed.includes(o))
}
// 普通管理员恰有一个 L4 时:新增预填该值并锁定(不可改)。
const l4Locked = computed(() => {
  if (auth.isSuper) return false
  const allowed = auth.user?.allowedL4 ?? []
  return allowed.length === 1 && allowed[0] !== '*'
})

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
  // 普通管理员新增:仅一个 L4 时预填该值(与后端缺省补 L4 一致)
  if (props.mode === 'create' && !auth.isSuper) {
    const allowed = auth.user?.allowedL4 ?? []
    if (allowed.length === 1 && allowed[0] !== '*') form['l4'] = allowed[0]
  }
}

// 初始建立副本 + 监听 row / mode 变化
rebuildForm(props.row)
watch(() => [props.row, props.mode], () => rebuildForm(props.row))

async function onSave() {
  const fields: Record<string, any> = {}
  OPP_FIELDS.forEach((k) => { fields[k] = form[k] })
  try {
    if (props.mode === 'create') {
      await store.create(fields)
      ElMessage.success('已新增')
    } else {
      if (!props.row) return
      await store.update(props.row.id, fields)
      ElMessage.success('已保存')
    }
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error('保存失败: ' + (e as Error).message)
  }
}

defineExpose({ form, onSave, optionsFor, l4Locked })
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    :title="mode === 'create' ? '新增商机' : '编辑商机'"
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
          :disabled="col.key === 'l4' && l4Locked"
          style="width: 100%"
        >
          <el-option
            v-for="opt in optionsFor(col)"
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

    <!-- 只读信息区：create 模式不显示 -->
    <div v-if="mode !== 'create' && row" class="oed-info">
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
