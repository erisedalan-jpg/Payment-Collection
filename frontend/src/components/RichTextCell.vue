<script lang="ts">
// module scope:全站同一时刻仅一个富文本单元格处于编辑态(有未保存改动的编辑器拒绝被切走)
let activeCell: { tryClose: () => boolean; contains: (n: Node) => boolean } | null = null
</script>

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, onDeactivated } from 'vue'
import { ElMessage } from 'element-plus'
import { sanitizeRichText } from '@/lib/richText'

const props = withDefaults(defineProps<{
  content: string
  editable: boolean
  prefix?: string
  saveHandler: (html: string) => Promise<void> | void
}>(), { prefix: '' })

// 预设强调色(light/dark 两套主题下均可读;不含"默认色",清除颜色请用"清除格式")
const COLORS: { label: string; value: string }[] = [
  { label: '红', value: '#C8161D' },
  { label: '橙', value: '#D97706' },
  { label: '绿', value: '#15803D' },
  { label: '蓝', value: '#1D4ED8' },
  { label: '紫', value: '#7C3AED' },
  { label: '灰', value: '#6B7280' },
]

const editing = ref(false)
const dirty = ref(false)
const saving = ref(false)
const flash = ref(false)
const editorEl = ref<HTMLElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)

const renderedHtml = computed(() => sanitizeRichText(props.content))

// el-table 无 row-key 时分页/排序/筛选后按索引复用行,props.saveHandler(内联箭头绑当时的行)可能在
// 编辑器开着时被重绑到新行的 handler；进入编辑时快照,commit 用快照,避免存到错行。
let boundSave: ((html: string) => Promise<void> | void) | null = null

const self = {
  tryClose(): boolean {
    if (dirty.value) { flash.value = true; setTimeout(() => { flash.value = false }, 400); return false }
    stopEdit(); return true
  },
  contains(n: Node): boolean { return !!rootEl.value && rootEl.value.contains(n) },
}

function onDocMousedown(e: MouseEvent) {
  if (activeCell && !activeCell.contains(e.target as Node)) activeCell.tryClose()
}

function startEdit() {
  if (!props.editable) return
  if (activeCell && activeCell !== self && !activeCell.tryClose()) return  // 别处有脏编辑器拒绝关闭 → 不切换
  activeCell = self
  boundSave = props.saveHandler
  editing.value = true
  dirty.value = false
  document.addEventListener('mousedown', onDocMousedown, true)
  nextTick(() => {
    const el = editorEl.value
    if (!el) return
    try { document.execCommand('styleWithCSS', false, 'true') } catch { /* jsdom 无实现 */ }
    el.innerHTML = renderedHtml.value
    el.focus()
    const sel = window.getSelection?.()
    if (sel) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r) }
  })
}

function stopEdit() {
  editing.value = false
  dirty.value = false
  boundSave = null
  if (activeCell === self) activeCell = null
  document.removeEventListener('mousedown', onDocMousedown, true)
}

function cancel() { stopEdit() }

async function commit() {
  const html = sanitizeRichText(editorEl.value ? editorEl.value.innerHTML : '')
  const save = boundSave ?? props.saveHandler
  saving.value = true
  try {
    await save(html)
    stopEdit()
  } catch (e) {
    ElMessage.error('保存失败: ' + ((e as Error)?.message ?? ''))
  } finally {
    saving.value = false
  }
}

function exec(cmd: string) {
  try { document.execCommand(cmd, false) } catch { /* jsdom 无实现 */ }
  dirty.value = true
  editorEl.value?.focus()
}
function applyColor(value: string) {
  try { document.execCommand('styleWithCSS', false, 'true'); document.execCommand('foreColor', false, value) } catch { /* jsdom */ }
  dirty.value = true
  editorEl.value?.focus()
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); cancel() }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
}

onBeforeUnmount(() => { if (activeCell === self) activeCell = null; document.removeEventListener('mousedown', onDocMousedown, true) })
// keep-alive 页面停用(deactivated)不会走 onBeforeUnmount:若停用时正在编辑,须主动 stopEdit()
// 清单例/监听,否则 activeCell 悬挂,切到另一 keep-alive 页点格编辑会被拒(flash 打在离屏组件上)。
onDeactivated(() => { if (editing.value) stopEdit() })

defineExpose({ editing, dirty, startEdit, cancel, commit, tryClose: self.tryClose })
</script>

<template>
  <div ref="rootEl" class="rich-text-cell" :class="{ 'rtc-flash': flash }">
    <template v-if="!editing">
      <span v-if="content" class="rtc-display" :class="{ editable }" @click.stop="startEdit"
        ><span v-if="prefix" class="rtc-prefix">{{ prefix }}</span
        ><span class="rtc-body" v-html="renderedHtml"></span></span>
      <span v-else class="rtc-empty" :class="{ editable }" @click.stop="startEdit">{{ editable ? '点击填写' : '-' }}</span>
    </template>
    <div v-else class="rtc-editor" @click.stop>
      <div class="rtc-toolbar">
        <button type="button" class="rtc-tb" title="加粗" @mousedown.prevent @click="exec('bold')"><b>B</b></button>
        <button type="button" class="rtc-tb" title="下划线" @mousedown.prevent @click="exec('underline')"><u>U</u></button>
        <button type="button" class="rtc-tb" title="删除线" @mousedown.prevent @click="exec('strikeThrough')"><s>S</s></button>
        <button type="button" class="rtc-tb" title="斜体" @mousedown.prevent @click="exec('italic')"><i>I</i></button>
        <button v-for="c in COLORS" :key="c.value" type="button" class="rtc-color" :style="{ background: c.value }"
          :title="c.label" @mousedown.prevent @click="applyColor(c.value)"></button>
        <button type="button" class="rtc-tb" title="清除格式" @mousedown.prevent @click="exec('removeFormat')">✕</button>
      </div>
      <div ref="editorEl" class="rtc-input" contenteditable="true" @input="dirty = true" @keydown="onKeydown"></div>
      <div class="rtc-actions">
        <button type="button" class="rtc-cancel" @click="cancel">取消</button>
        <button type="button" class="rtc-save" :disabled="saving" @click="commit">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rich-text-cell { display: inline-block; width: 100%; }
.rtc-display, .rtc-empty { display: inline-block; white-space: pre-wrap; }
.rtc-display.editable, .rtc-empty.editable { cursor: pointer; }
.rtc-empty.editable { color: var(--accent); }
.rtc-prefix { color: var(--mut); }
.rtc-editor { border: 1px solid var(--accent); border-radius: var(--r-sm); padding: var(--sp-2);
  background: var(--card); box-shadow: var(--shadow-1); }
.rtc-flash .rtc-editor { animation: rtc-flash var(--dur-2) var(--ease); }
@keyframes rtc-flash { 0%, 100% { border-color: var(--accent); } 50% { border-color: var(--danger); } }
.rtc-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-1); margin-bottom: var(--sp-2); }
.rtc-tb { min-width: 24px; height: 24px; padding: 0 4px; border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--card2); color: var(--txt); cursor: pointer; font-size: var(--fs-1); line-height: 1; }
.rtc-tb:hover { background: var(--hover-tint); }
.rtc-tb:active { background: var(--selected-tint); }
.rtc-tb:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
.rtc-color { width: 20px; height: 20px; padding: 0; border: 1px solid var(--line); border-radius: var(--r-sm); cursor: pointer; }
.rtc-input { min-height: 84px; max-height: 200px; overflow-y: auto; border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: var(--sp-2); background: var(--card); color: var(--txt);
  font-size: var(--fs-2); white-space: pre-wrap; outline: none; }
.rtc-input:focus { border-color: var(--accent); }
.rtc-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-2); }
.rtc-cancel, .rtc-save { font-size: var(--fs-1); border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 2px var(--sp-3); cursor: pointer; background: var(--card2); color: var(--txt); }
.rtc-save { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.rtc-save:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
</style>
