<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortalStore } from '@/stores/portal'
import { buildSections, type PortalConfig, type PortalItem } from '@/lib/portal'
import PortalItemEditDialog from './PortalItemEditDialog.vue'

const store = usePortalStore()
const draft = ref<PortalConfig>({ version: 1, groups: [], items: [] })
const dialogOpen = ref(false)
const editing = ref<PortalItem | null>(null)

function cloneConfig(c: PortalConfig): PortalConfig {
  return JSON.parse(JSON.stringify(c))
}
async function reload() {
  if (!store.loaded) await store.load().catch(() => {})
  draft.value = cloneConfig(store.config)
}
onMounted(reload)

const sections = computed(() => buildSections(draft.value))

function openNew() { editing.value = null; dialogOpen.value = true }
function openEdit(it: PortalItem) { editing.value = it; dialogOpen.value = true }

function onDialogSave(it: PortalItem) {
  if (it.group && !draft.value.groups.includes(it.group)) draft.value.groups.push(it.group)
  const idx = draft.value.items.findIndex((x) => x.id === it.id)
  if (idx >= 0) draft.value.items[idx] = it
  else draft.value.items.push(it)
}
function removeItem(it: PortalItem) {
  draft.value.items = draft.value.items.filter((x) => x.id !== it.id)
}
function moveItem(it: PortalItem, dir: -1 | 1, secItems: PortalItem[]) {
  const local = secItems.findIndex((x) => x.id === it.id)
  const target = local + dir
  if (target < 0 || target >= secItems.length) return
  const gi = draft.value.items.findIndex((x) => x.id === it.id)
  const gj = draft.value.items.findIndex((x) => x.id === secItems[target].id)
  const arr = draft.value.items
  ;[arr[gi], arr[gj]] = [arr[gj], arr[gi]]
  draft.value.items = [...arr]
}
function moveGroup(g: string, dir: -1 | 1) {
  const i = draft.value.groups.indexOf(g)
  const j = i + dir
  if (j < 0 || j >= draft.value.groups.length) return
  const gs = draft.value.groups
  ;[gs[i], gs[j]] = [gs[j], gs[i]]
  draft.value.groups = [...gs]
}

async function onSave() {
  try {
    await store.save(cloneConfig(draft.value))
    draft.value = cloneConfig(store.config)
    ElMessage.success('门户配置已保存')
  } catch (e) {
    ElMessage.error('保存失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

function visLabel(it: PortalItem): string {
  return it.visibility.mode === 'all' ? '全部' : `${it.visibility.accounts.length} 个账号`
}

defineExpose({ draft, onDialogSave })
</script>

<template>
  <div class="pc-card" data-test="portal-config-card">
    <div class="pc-head">
      <button class="pc-btn primary" data-test="pc-add" @click="openNew">＋ 新建门户项</button>
      <button class="pc-btn" data-test="pc-save" :disabled="store.saving" @click="onSave">保存</button>
      <span class="pc-hint">在首页顶部「快捷入口」按分组展示；置顶项汇入顶部区。</span>
    </div>

    <div v-if="!sections.length" class="pc-hint">还没有门户项，点「新建门户项」添加。</div>

    <div v-for="sec in sections" :key="sec.key" class="pc-sec">
      <div class="pc-sec-head">
        <span class="pc-sec-title">
          <span v-if="sec.featured">★ </span>{{ sec.label }}
        </span>
        <template v-if="!sec.featured">
          <button class="pc-mini" title="上移组" @click="moveGroup(sec.key, -1)">▲</button>
          <button class="pc-mini" title="下移组" @click="moveGroup(sec.key, 1)">▼</button>
        </template>
      </div>
      <div v-for="it in sec.items" :key="it.id" class="pc-item" data-test="pc-item-row">
        <span class="pc-type" :class="it.type">{{ it.type === 'url' ? '跳转' : '文件' }}</span>
        <span class="pc-name">{{ it.emoji || '' }} {{ it.name }}</span>
        <span class="pc-vis">{{ visLabel(it) }}</span>
        <button class="pc-mini" data-test="pc-up" title="上移" @click="moveItem(it, -1, sec.items)">▲</button>
        <button class="pc-mini" data-test="pc-down" title="下移" @click="moveItem(it, 1, sec.items)">▼</button>
        <button class="pc-mini" data-test="pc-edit" @click="openEdit(it)">编辑</button>
        <button class="pc-mini danger" data-test="pc-del" @click="removeItem(it)">删除</button>
      </div>
    </div>

    <PortalItemEditDialog v-model="dialogOpen" :item="editing" :groups="draft.groups" @save="onDialogSave" />
  </div>
</template>

<style scoped>
.pc-card { display: flex; flex-direction: column; gap: var(--sp-3); }
.pc-head { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.pc-sec { display: flex; flex-direction: column; gap: var(--sp-1); }
.pc-sec-head { display: flex; align-items: center; gap: var(--sp-1); }
.pc-sec-title { font-size: var(--fs-2); font-weight: 700; color: var(--txt); }
.pc-item {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2); border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--card2);
}
.pc-type {
  font-size: var(--fs-1); padding: 0 var(--sp-1); border-radius: var(--r-sm);
  background: var(--hover-tint); color: var(--sub);
}
.pc-type.file { background: var(--ok-bg); color: var(--ok-text); }
.pc-name { flex: 1; font-size: var(--fs-2); color: var(--txt); }
.pc-vis { font-size: var(--fs-1); color: var(--sub); }
.pc-mini {
  font-size: var(--fs-1); padding: 2px var(--sp-1); border: 1px solid var(--line);
  border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer;
}
.pc-mini:hover { color: var(--txt); border-color: var(--accent); }
.pc-mini.danger:hover { color: var(--danger-text); border-color: var(--danger-text); }
.pc-btn {
  border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm);
  padding: var(--sp-1) var(--sp-3); font-size: var(--fs-2); cursor: pointer; color: var(--txt);
}
.pc-btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.pc-btn:disabled { opacity: var(--disabled-opacity); cursor: default; }
.pc-hint { font-size: var(--fs-1); color: var(--mut); }
</style>
