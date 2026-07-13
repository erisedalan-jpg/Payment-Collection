<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { useYitianStore } from '@/stores/yitian'

// 候选项:优先取真实数据里出现过的工时类型;数据没加载时用固定 6 类兜底
const FALLBACK_TYPES = ['项目类', '售前类', '售后类', '管理类', '业务类', '假期类']

const store = useYitianSettingsStore()
const dataStore = useYitianStore()

const draft = ref<string[]>([])
const msg = ref('')
const err = ref(false)

const options = computed(() => {
  const t = dataStore.data?.dims.types ?? []
  return t.length ? t : FALLBACK_TYPES
})

onMounted(async () => {
  await store.load()
  draft.value = [...store.settings.excludedTypes]
})

watch(() => store.settings.excludedTypes, (v) => { draft.value = [...v] })

async function onSave() {
  msg.value = ''
  err.value = false
  try {
    await store.save({ excludedTypes: [...draft.value] })
    msg.value = '已保存，立即生效（无需点「更新数据」）'
  } catch (e) {
    err.value = true
    msg.value = e instanceof Error ? e.message : '保存失败'
  }
}

defineExpose({ draft, onSave })
</script>

<template>
  <div class="ys-card">
    <p class="ys-hint">
      勾选的工时类型<strong>不计入合规率</strong>的分子分母（仍计入总工时、饱和度、类型占比）。
      默认剔除管理类 / 业务类 / 假期类，与原工时检查工具口径一致。
    </p>
    <p class="ys-hint ys-warn">
      注意：管理类 / 业务类 / 假期类<strong>没有必填字段规则</strong>，把它们纳入后会一律判为合规，
      等于给合规率白送分母——纳入前请想清楚这个指标要表达什么。
    </p>

    <el-checkbox-group v-model="draft" class="ys-group">
      <el-checkbox v-for="t in options" :key="t" :value="t" :label="t" />
    </el-checkbox-group>

    <div class="ys-actions">
      <el-button type="primary" :loading="store.saving" @click="onSave">保存</el-button>
      <span v-if="msg" class="ys-msg" :class="{ 'ys-msg-err': err }">{{ msg }}</span>
    </div>
  </div>
</template>

<style scoped>
.ys-card { display: flex; flex-direction: column; gap: var(--gap-stack); padding: var(--sp-3) var(--sp-4); }
.ys-hint { font-size: var(--fs-2); color: var(--sub); line-height: var(--lh-base); }
.ys-warn { color: var(--warn-text); background: var(--warn-bg); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm); }
.ys-group { display: flex; flex-wrap: wrap; gap: var(--gap-stack); }
.ys-actions { display: flex; align-items: center; gap: var(--gap-stack); }
.ys-msg { font-size: var(--fs-1); color: var(--ok-text); }
.ys-msg-err { color: var(--danger-text); }
</style>
