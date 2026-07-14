<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBudgetStore } from '@/stores/budget'
import type { DayCells } from '@/lib/budget/types'

const store = useBudgetStore()
const cfg = computed(() => store.effectiveConfig!)

let seq = 0
const uid = (): string => `s${Date.now()}_${seq++}`

const emptyCells = (): DayCells => ({ tech1: 0, tech2: 0, out1: 0, out2: 0 })

const CELLS: { key: keyof DayCells; label: string }[] = [
  { key: 'tech1', label: '技服一类' },
  { key: 'tech2', label: '技服二类' },
  { key: 'out1', label: '外包一类' },
  { key: 'out2', label: '外包二类' },
]

const pick = ref('')

/** 同一服务可重复添加多条(同一个服务在不同场景/不同批次的工作内容不一样) —— 故不去重。 */
function addService(name: string): void {
  const def = cfg.value.services.find((s) => s.name === name)
  if (!def) return
  store.form.services.push({
    uid: uid(), name: def.name, content: def.desc, cells: emptyCells(),
  })
  store.touch()
}

function onAdd(): void {
  if (!pick.value) return
  addService(pick.value)
  pick.value = ''
}

function removeService(u: string): void {
  const i = store.form.services.findIndex((s) => s.uid === u)
  if (i >= 0) store.form.services.splice(i, 1)
  store.touch()
}

const touch = (): void => store.touch()

defineExpose({ addService, removeService })
</script>

<template>
  <section class="bd-card">
    <div class="sv-head">
      <h3 class="bd-card-title">其他服务</h3>
      <div class="sv-tools">
        <el-select v-model="pick" class="sv-select" filterable clearable placeholder="选择服务（同一服务可加多条）">
          <!-- 服务名后端不强制唯一(budget_config.validate_config 未校验 services.name 去重),
               同名服务在目录里按位置区分,故用下标做 key,不用可能重复的 name。 -->
          <el-option v-for="(s, i) in cfg.services" :key="i" :value="s.name" :label="s.name" />
        </el-select>
        <el-button :disabled="!pick" @click="onAdd">添加</el-button>
      </div>
    </div>

    <p v-if="!store.form.services.length" class="sv-empty">还没有服务。从上方下拉选择后点「添加」。</p>

    <div v-for="s in store.form.services" :key="s.uid" class="sv-item">
      <div class="sv-item-head">
        <span class="sv-name">{{ s.name }}</span>
        <el-button link type="danger" class="sv-del" @click="removeService(s.uid)">✕ 删除</el-button>
      </div>

      <el-input v-model="s.content" type="textarea" :rows="2" placeholder="工作内容" @input="touch" />

      <div class="sv-row">
        <div v-for="c in CELLS" :key="c.key" class="sv-field">
          <label class="sv-label">{{ c.label }}（人天）</label>
          <el-input-number v-model="s.cells[c.key]" class="u-num sv-num" :min="0" :controls="false" @change="touch" />
        </div>
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
.bd-card-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); line-height: var(--lh-dense); }
.sv-head { display: flex; align-items: center; justify-content: space-between; gap: var(--gap-card); flex-wrap: wrap; }
.sv-tools { display: flex; align-items: center; gap: var(--sp-3); }
.sv-select { width: 280px; }
.sv-empty { font-size: var(--fs-2); color: var(--mut); }

.sv-item {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--sp-4);
  background: var(--card2);
}
.sv-item-head { display: flex; align-items: center; gap: var(--sp-2); }
.sv-name { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
.sv-del { margin-left: auto; }
.sv-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.sv-field { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
.sv-label { font-size: var(--fs-1); color: var(--sub); line-height: var(--lh-dense); }
.sv-num { width: 120px; }
</style>
