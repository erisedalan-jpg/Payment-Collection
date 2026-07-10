# V2.8.2 跟进进展就地富文本内联编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 5 个跟进页的「点击填写」从弹窗改为就地在单元格内的富文本内联编辑（加粗/下划线/删除线/斜体/字体颜色/清除格式），后端与审计零改动。

**Architecture:** 新增纯函数库 `richText.ts`（严格白名单 `sanitizeRichText` + 去标签 `htmlToPlainText`）与共享组件 `RichTextCell.vue`（display 态渲染净化 v-html + 时间前缀；edit 态渲染工具条 + `contenteditable`，用浏览器原生 `document.execCommand`，零依赖）。5 页把 `#cell-{field}` slot 换成 `RichTextCell`，删除 `ProgressEditModal`。排序/筛选/导出对富文本字段去标签处理。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + Vitest（jsdom）。无新增第三方依赖。

## Global Constraints（每个任务都隐含）

- 交流语言简体中文；**不使用任何 emoji**，符号仅用 `→ ↓ ❌ ✕ ▾ ⚠`。
- 只引用 `frontend/src/styles/theme.css` 设计令牌，**不手写散值**；补 CSS，不引框架。自绘交互件五态齐全（default/hover/selected/disabled/focus，focus 走全局 `:focus-visible`）。
- 8pt grid（`--sp-*`）、圆角 `--r-*`、阴影仅 `--shadow-1/2`、动效仅 `--dur-1/2` + `--ease`。中文不加字距、muted 蓝/紫不用于小号正文。
- **不引任何第三方 npm 依赖**（净化器与编辑器均自研）。前端禁外链字体。
- 版本单一来源 `frontend/src/version.ts` → `V2.8.2` / `RELEASE_DATE='2026-07-10'`。
- 后端 / 审计 / schema / 数据管线**零改动**。升级仅换 dist，无需重启后端、无需点更新数据。
- TDD：先补/改测试再改实现。收尾 `bash verify.sh` 全绿（ruff + pytest + 前端 typecheck/vitest/build）。
- commit 结尾统一：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `frontend/src/lib/richText.ts` | `sanitizeRichText`（白名单净化）+ `htmlToPlainText`（去标签） | 新建 |
| `frontend/src/lib/richText.test.ts` | 上述纯函数单测（含 XSS 向量） | 新建 |
| `frontend/src/components/RichTextCell.vue` | 就地富文本编辑单元格组件 | 新建 |
| `frontend/src/components/RichTextCell.test.ts` | 组件测（渲染/编辑/保存/取消/工具条/键盘） | 新建 |
| `frontend/src/views/KeyProjectsView.vue` | 接入 RichTextCell（weekProgress/nextPlan） | 改 |
| `frontend/src/views/TempFollowupView.vue` | 同上 | 改 |
| `frontend/src/views/OpportunityFollowupView.vue` | 接入（id=oppId） | 改 |
| `frontend/src/views/RiskFollowupView.vue` | 接入（followAction/revConclusion）+ 关排序 + 移除 revConclusion 筛选 | 改 |
| `frontend/src/views/PaymentKeyFollowupView.vue` | 接入 + columnSort 关排序 | 改 |
| `frontend/src/lib/columnSort.ts` | `NON_SORTABLE_KEYS` 加 followAction/revConclusion | 改 |
| `frontend/src/views/KeyProjectsView.test.ts` | 改「打开弹窗」断言为「进入内联编辑」 | 改 |
| `frontend/src/components/ProgressEditModal.vue` / `.test.ts` | 5 页迁移后无消费方 | 删 |
| `frontend/src/version.ts` | V2.8.2 | 改 |
| `PROGRESS.md` | V2.8.2 记录 | 改 |

**关键事实（实现须知）：**
- `DataTable.vue:76` 提供 `#cell-{key}` slot 时用 slot、`col.formatter` 仅作 fallback → 给富文本列加 `formatter` **只影响导出**（`exportRow` 直接调 `col.formatter`），不影响显示。
- `store.update(id, field, content)` 用后端返回的 `record` 替换本地记录（含新 content + editTime）→ 保存后单元格自动刷新；返回 `Promise<void>`，出错抛异常。
- 5 页里仅 `KeyProjectsView.test.ts` 断言了旧弹窗流（`editOpen`）。`OpportunitiesView.test.ts` 的 `editOpen/openEdit` 是 **/opportunities 商机清单**页的另一功能，**不在本次范围**，不要动。

---

### Task 1: `richText.ts` 净化与去标签纯函数

**Files:**
- Create: `frontend/src/lib/richText.ts`
- Test: `frontend/src/lib/richText.test.ts`

**Interfaces:**
- Produces:
  - `sanitizeRichText(html: string): string` — 白名单净化，用于 `v-html` 渲染前与保存前。
  - `htmlToPlainText(html: string): string` — 去标签取纯文本（`<br>`→`\n`），用于导出。

- [ ] **Step 1: 写失败测试** `frontend/src/lib/richText.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeRichText, htmlToPlainText } from './richText'

describe('sanitizeRichText 白名单', () => {
  it('空/非串 → 空', () => {
    expect(sanitizeRichText('')).toBe('')
    expect(sanitizeRichText(null as unknown as string)).toBe('')
  })
  it('保留格式标签', () => {
    expect(sanitizeRichText('<b>粗</b>')).toBe('<b>粗</b>')
    expect(sanitizeRichText('<strong>a</strong>')).toBe('<strong>a</strong>')
    expect(sanitizeRichText('<u>x</u>')).toBe('<u>x</u>')
    expect(sanitizeRichText('<s>x</s>')).toBe('<s>x</s>')
    expect(sanitizeRichText('<i>x</i>')).toBe('<i>x</i>')
    expect(sanitizeRichText('<em>x</em>')).toBe('<em>x</em>')
    expect(sanitizeRichText('<br>')).toBe('<br>')
    expect(sanitizeRichText('<b><u>x</u></b>')).toBe('<b><u>x</u></b>')
  })
  it('颜色:合法 hex/rgb 保留,非法丢弃', () => {
    expect(sanitizeRichText('<span style="color:#f00">红</span>')).toBe('<span style="color:#f00">红</span>')
    expect(sanitizeRichText('<span style="color:rgb(1,2,3)">x</span>')).toBe('<span style="color:rgb(1,2,3)">x</span>')
    expect(sanitizeRichText('<span style="color:red">x</span>')).toBe('x')                 // 具名色不在正则内 → 丢色 → 裸 span 拆解
    expect(sanitizeRichText('<span style="color:expression(alert(1))">x</span>')).toBe('x') // 拦 expression
    expect(sanitizeRichText('<span style="color:#f00;background:url(x)">x</span>')).toBe('<span style="color:#f00">x</span>') // 只取 color
  })
  it('font[color] 归一化为 span', () => {
    expect(sanitizeRichText('<font color="#00f">蓝</font>')).toBe('<span style="color:#00f">蓝</span>')
  })
  it('XSS 向量被中和', () => {
    expect(sanitizeRichText('<script>alert(1)</script>')).toBe('')                 // script 连内容一起丢
    expect(sanitizeRichText('<img src=x onerror=alert(1)>')).toBe('')             // img 无子节点 → 空
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe('x')     // a 拆解,保留文字
    expect(sanitizeRichText('<b onclick="evil()">x</b>')).toBe('<b>x</b>')        // 属性全删
    expect(sanitizeRichText('<div><b>x</b></div>')).toBe('<b>x</b>')              // 未白名单容器拆解,保留内层格式
  })
  it('文本节点转义', () => {
    expect(sanitizeRichText('A & B')).toBe('A &amp; B')
    expect(sanitizeRichText('纯文本')).toBe('纯文本')
  })
})

describe('htmlToPlainText 去标签', () => {
  it('空 → 空', () => { expect(htmlToPlainText('')).toBe('') })
  it('去标签取文字', () => {
    expect(htmlToPlainText('<b>粗</b>体')).toBe('粗体')
    expect(htmlToPlainText('<span style="color:#f00">红</span>字')).toBe('红字')
  })
  it('<br> → 换行', () => { expect(htmlToPlainText('a<br>b')).toBe('a\nb') })
  it('trim + 纯文本原样', () => {
    expect(htmlToPlainText('  x  ')).toBe('x')
    expect(htmlToPlainText('纯文本')).toBe('纯文本')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/richText.test.ts`
Expected: FAIL（`richText` 模块不存在）

- [ ] **Step 3: 实现** `frontend/src/lib/richText.ts`

```ts
// 就地富文本:严格白名单净化 + 去标签。无第三方依赖,用浏览器 DOMParser。
const TAG_WHITELIST = new Set(['B', 'STRONG', 'U', 'I', 'EM', 'S', 'STRIKE', 'DEL', 'BR', 'SPAN', 'FONT'])
// 这些标签连同其文本内容一起丢弃(否则脚本正文会作为纯文本残留)
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'TITLE', 'TEXTAREA', 'NOSCRIPT'])
// 颜色只允许 #hex(3-8 位) 或 rgb(整数,整数,整数);排除 url()/expression()/具名色/含引号
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$|^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pickColor(el: Element): string {
  let color = ''
  if (el.tagName === 'FONT') color = (el.getAttribute('color') || '').trim()
  const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(el.getAttribute('style') || '')
  if (m) color = m[1].trim()
  return COLOR_RE.test(color) ? color : ''
}

function serializeChildren(node: Node): string {
  let out = ''
  node.childNodes.forEach((c) => { out += serializeNode(c) })
  return out
}

function serializeNode(node: Node): string {
  if (node.nodeType === 3) return escapeText(node.nodeValue || '')  // 文本
  if (node.nodeType !== 1) return ''                                // 注释等一律丢
  const el = node as Element
  const tag = el.tagName
  if (DROP_WITH_CONTENT.has(tag)) return ''
  if (!TAG_WHITELIST.has(tag)) return serializeChildren(el)         // 未白名单:拆解,保留净化后子内容
  if (tag === 'BR') return '<br>'
  if (tag === 'FONT' || tag === 'SPAN') {
    const color = pickColor(el)
    const inner = serializeChildren(el)
    return color ? `<span style="color:${color}">${inner}</span>` : inner   // 无合法色 → 拆解裸 span
  }
  const lower = tag.toLowerCase()                                   // b/strong/u/i/em/s/strike/del
  return `<${lower}>${serializeChildren(el)}</${lower}>`
}

export function sanitizeRichText(html: string): string {
  if (!html || typeof html !== 'string') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return serializeChildren(doc.body)
}

export function htmlToPlainText(html: string): string {
  if (!html || typeof html !== 'string') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let out = ''
  const walk = (node: Node) => {
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) out += c.nodeValue || ''
      else if (c.nodeType === 1) {
        if ((c as Element).tagName === 'BR') out += '\n'
        else walk(c)
      }
    })
  }
  walk(doc.body)
  return out.trim()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/richText.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/richText.ts frontend/src/lib/richText.test.ts
git commit -m "feat(richtext): 白名单净化 sanitizeRichText + 去标签 htmlToPlainText"
```

---

### Task 2: `RichTextCell.vue` 就地富文本单元格组件

**Files:**
- Create: `frontend/src/components/RichTextCell.vue`
- Test: `frontend/src/components/RichTextCell.test.ts`

**Interfaces:**
- Consumes: `sanitizeRichText` from `@/lib/richText`（Task 1）。
- Produces: 组件 props `{ content: string; editable: boolean; prefix?: string; saveHandler: (html: string) => Promise<void> | void }`；display 态点击进入编辑,`保存` 调 `saveHandler(sanitizeRichText(innerHTML))`,成功关闭、失败 `ElMessage` 且不关闭。

- [ ] **Step 1: 写失败测试** `frontend/src/components/RichTextCell.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RichTextCell from './RichTextCell.vue'

beforeEach(() => { vi.spyOn(document, 'execCommand').mockReturnValue(true) })

function mountCell(props: Record<string, unknown>) {
  return mount(RichTextCell, { props: { editable: true, saveHandler: vi.fn(), ...props }, global: { plugins: [ElementPlus] } })
}

describe('RichTextCell 显示态', () => {
  it('有内容:净化后 v-html + 前缀', () => {
    const w = mountCell({ content: '<b>粗</b>', editable: false, prefix: '2026-07-10：' })
    expect(w.find('.rtc-prefix').text()).toBe('2026-07-10：')
    expect(w.find('.rtc-body').element.innerHTML).toBe('<b>粗</b>')
  })
  it('空内容 + editable → 点击填写', () => {
    const w = mountCell({ content: '', editable: true })
    expect(w.find('.rtc-empty').text()).toBe('点击填写')
  })
  it('空内容 + 只读 → 短横', () => {
    const w = mountCell({ content: '', editable: false })
    expect(w.find('.rtc-empty').text()).toBe('-')
  })
  it('只读态点击不进入编辑', async () => {
    const w = mountCell({ content: '', editable: false })
    await w.find('.rtc-empty').trigger('click')
    expect(w.find('.rtc-editor').exists()).toBe(false)
  })
})

describe('RichTextCell 编辑态', () => {
  it('editable 点击 → 出编辑器', async () => {
    const w = mountCell({ content: '', editable: true })
    await w.find('.rtc-empty').trigger('click')
    expect(w.find('.rtc-editor').exists()).toBe(true)
    expect(w.find('[contenteditable]').exists()).toBe(true)
  })
  it('保存:回调收到净化 html,成功后关闭', async () => {
    const saveHandler = vi.fn().mockResolvedValue(undefined)
    const w = mountCell({ content: '', editable: true, saveHandler })
    await w.find('.rtc-empty').trigger('click')
    const ed = w.find('[contenteditable]').element as HTMLElement
    ed.innerHTML = '<b>hi</b><script>x</script>'
    await w.find('.rtc-save').trigger('click')
    await flushPromises()
    expect(saveHandler).toHaveBeenCalledWith('<b>hi</b>')       // script 被净化
    expect(w.find('.rtc-editor').exists()).toBe(false)
  })
  it('取消:不回调、关闭', async () => {
    const saveHandler = vi.fn()
    const w = mountCell({ content: '', editable: true, saveHandler })
    await w.find('.rtc-empty').trigger('click')
    await w.find('.rtc-cancel').trigger('click')
    expect(saveHandler).not.toHaveBeenCalled()
    expect(w.find('.rtc-editor').exists()).toBe(false)
  })
  it('工具条按钮调 execCommand', async () => {
    const w = mountCell({ content: '', editable: true })
    await w.find('.rtc-empty').trigger('click')
    await w.findAll('.rtc-tb')[0].trigger('click')              // 加粗
    expect(document.execCommand).toHaveBeenCalledWith('bold', false)
  })
  it('保存失败:保持打开', async () => {
    const saveHandler = vi.fn().mockRejectedValue(new Error('boom'))
    const w = mountCell({ content: '', editable: true, saveHandler })
    await w.find('.rtc-empty').trigger('click')
    await w.find('.rtc-save').trigger('click')
    await flushPromises()
    expect(w.find('.rtc-editor').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/RichTextCell.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现** `frontend/src/components/RichTextCell.vue`

```vue
<script lang="ts">
// module scope:全站同一时刻仅一个富文本单元格处于编辑态(有未保存改动的编辑器拒绝被切走)
let activeCell: { tryClose: () => boolean; contains: (n: Node) => boolean } | null = null
</script>

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
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
  if (activeCell === self) activeCell = null
  document.removeEventListener('mousedown', onDocMousedown, true)
}

function cancel() { stopEdit() }

async function commit() {
  const html = sanitizeRichText(editorEl.value ? editorEl.value.innerHTML : '')
  saving.value = true
  try {
    await props.saveHandler(html)
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/RichTextCell.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RichTextCell.vue frontend/src/components/RichTextCell.test.ts
git commit -m "feat(richtext): RichTextCell 就地富文本编辑单元格(execCommand,单例互斥)"
```

---

### Task 3: KeyProjectsView 接入 RichTextCell

**Files:**
- Modify: `frontend/src/views/KeyProjectsView.vue`
- Modify: `frontend/src/views/KeyProjectsView.test.ts`

**Interfaces:**
- Consumes: `RichTextCell`（Task 2）、`htmlToPlainText`（Task 1）、`progress.update(id, 'weekProgress'|'nextPlan', html)`。

- [ ] **Step 1: 改测试为「进入内联编辑」（先红）**

在 `frontend/src/views/KeyProjectsView.test.ts` 把这个用例（约 67-71 行）：

```ts
  it('点进展单元格(当前数据)打开编辑弹窗', async () => {
    seed(); const w = await mountView()
    await w.find('.kp-prog-cell').trigger('click')
    expect((w.vm as any).editOpen).toBe(true)
  })
```

替换为：

```ts
  it('点进展单元格(当前数据)进入内联富文本编辑', async () => {
    seed(); const w = await mountView()
    await w.find('.rtc-empty').trigger('click')       // 空进展格 = 「点击填写」
    expect(w.find('.rtc-editor').exists()).toBe(true)
    expect(w.find('[contenteditable]').exists()).toBe(true)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/KeyProjectsView.test.ts`
Expected: FAIL（`.rtc-empty` 不存在）

- [ ] **Step 3: 改实现** `frontend/src/views/KeyProjectsView.vue`

3a. import：第 2 行 `import { computed, onMounted, reactive, ref } from 'vue'` → 去掉 `reactive`：
```ts
import { computed, onMounted, ref } from 'vue'
```
第 18 行 `import ProgressEditModal from '@/components/ProgressEditModal.vue'` 替换为：
```ts
import RichTextCell from '@/components/RichTextCell.vue'
```
第 23 行 `import { fmt } from '@/lib/format'` 之后补一行：
```ts
import { htmlToPlainText } from '@/lib/richText'
```

3b. 用 `editPrefix` 替换 `progCell`（约 84-89 行整段）：
```ts
function editPrefix(row: KeyProjectRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  return t ? `${t}：` : ''
}
```

3c. 删除编辑弹窗状态与 openEdit（约 95-110 行整段 `// 编辑` … `}`）：
```ts
// 编辑
const editOpen = ref(false)
const editCtx = reactive({
  projectId: '',
  projectName: '',
  field: 'weekProgress' as 'weekProgress' | 'nextPlan',
  initial: '',
})
function openEdit(row: KeyProjectRow, field: 'weekProgress' | 'nextPlan') {
  if (!fp.isCurrent.value) return
  editCtx.projectId = row.projectId
  editCtx.projectName = row.projectName
  editCtx.field = field
  editCtx.initial = row[field] ?? ''
  editOpen.value = true
}
```
→ 整段删除（无替代）。

3d. exportRow 两处进展去标签（约 152-153 行）：
```ts
    本周工作进展: r.weekProgress ? `${r.weekProgressEditTime}：${r.weekProgress}` : '',
    后续工作计划: r.nextPlan ? `${r.nextPlanEditTime}：${r.nextPlan}` : '',
```
→
```ts
    本周工作进展: r.weekProgress ? `${r.weekProgressEditTime}：${htmlToPlainText(r.weekProgress)}` : '',
    后续工作计划: r.nextPlan ? `${r.nextPlanEditTime}：${htmlToPlainText(r.nextPlan)}` : '',
```

3e. defineExpose 去掉 editOpen/editCtx（约 160-164 行）：把 `editOpen, editCtx,` 那一行删掉。

3f. 模板两处 slot（206-219 行）替换为：
```vue
        <template #cell-weekProgress="{ row }">
          <RichTextCell
            :content="(row as KeyProjectRow).weekProgress ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as KeyProjectRow, 'weekProgress')"
            :save-handler="(html: string) => progress.update((row as KeyProjectRow).projectId, 'weekProgress', html)"
          />
        </template>
        <template #cell-nextPlan="{ row }">
          <RichTextCell
            :content="(row as KeyProjectRow).nextPlan ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as KeyProjectRow, 'nextPlan')"
            :save-handler="(html: string) => progress.update((row as KeyProjectRow).projectId, 'nextPlan', html)"
          />
        </template>
```

3g. 删除模板里的 `<ProgressEditModal ... />`（230-236 行整段）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/KeyProjectsView.test.ts && npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: PASS + 无类型错误

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/KeyProjectsView.vue frontend/src/views/KeyProjectsView.test.ts
git commit -m "feat(richtext): KeyProjectsView 进展改就地富文本(RichTextCell)"
```

---

### Task 4: TempFollowupView 接入 RichTextCell

**Files:**
- Modify: `frontend/src/views/TempFollowupView.vue`

**Interfaces:**
- Consumes: `RichTextCell`、`htmlToPlainText`、`temp.update(id, 'weekProgress'|'nextPlan', html)`。

- [ ] **Step 1: 跑现有测试建基线**

Run: `cd frontend && npx vitest run src/views/TempFollowupView.test.ts`
Expected: PASS（该测试不引用弹窗；作为回归基线）

- [ ] **Step 2: 改实现** `frontend/src/views/TempFollowupView.vue`

2a. import：第 2 行去掉 `reactive`：
```ts
import { computed, onMounted, ref } from 'vue'
```
第 19 行 `import ProgressEditModal ...` → `import RichTextCell from '@/components/RichTextCell.vue'`；第 25 行 `import { fmt } from '@/lib/format'` 后补 `import { htmlToPlainText } from '@/lib/richText'`。

2b. weekProgress/nextPlan 列加导出去标签 formatter（71-72 行）：
```ts
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true },
```
→
```ts
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
```
（该 formatter 仅用于导出；显示走 `#cell-*` slot。）

2c. 用 `editPrefix` 替换 `progCell`（106-111 行整段）：
```ts
function editPrefix(row: TempRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  return t ? `${t}：` : ''
}
```

2d. 删除编辑弹窗状态与 openEdit（115-122 行整段 `// 进展编辑(走 temp store)` … `}`）。

2e. defineExpose 去掉 `editOpen, editCtx,` 一行（约 158 行）。

2f. 模板两处 slot（197-204 行）替换为：
```vue
        <template #cell-weekProgress="{ row }">
          <RichTextCell
            :content="(row as TempRow).weekProgress ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as TempRow, 'weekProgress')"
            :save-handler="(html: string) => temp.update((row as TempRow).projectId, 'weekProgress', html)"
          />
        </template>
        <template #cell-nextPlan="{ row }">
          <RichTextCell
            :content="(row as TempRow).nextPlan ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as TempRow, 'nextPlan')"
            :save-handler="(html: string) => temp.update((row as TempRow).projectId, 'nextPlan', html)"
          />
        </template>
```

2g. 删除 `<ProgressEditModal store="temp" ... />`（215-216 行）。

- [ ] **Step 3: 跑测试 + 类型检查确认通过**

Run: `cd frontend && npx vitest run src/views/TempFollowupView.test.ts && npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: PASS + 无类型错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/TempFollowupView.vue
git commit -m "feat(richtext): TempFollowupView 进展改就地富文本"
```

---

### Task 5: OpportunityFollowupView 接入 RichTextCell

**Files:**
- Modify: `frontend/src/views/OpportunityFollowupView.vue`

**Interfaces:**
- Consumes: `RichTextCell`、`htmlToPlainText`、`oppf.update(id, 'weekProgress'|'nextPlan', html)`（id = 商机 oppId，取自 `row.id`）。

- [ ] **Step 1: 跑现有测试建基线**

Run: `cd frontend && npx vitest run src/views/OpportunityFollowupView.test.ts`
Expected: PASS（作回归基线）

- [ ] **Step 2: 改实现** `frontend/src/views/OpportunityFollowupView.vue`

2a. import：第 1 行去掉 `reactive`：
```ts
import { computed, onMounted, ref } from 'vue'
```
第 18 行 `import ProgressEditModal ...` → `import RichTextCell from '@/components/RichTextCell.vue'`；第 21 行 `import { exportSheets } from '@/lib/exportXlsx'` 后补 `import { htmlToPlainText } from '@/lib/richText'`。

2b. FOLLOWUP_COLUMNS 的 weekProgress/nextPlan formatter 改为导出去标签（51-52 行）：
```ts
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true, formatter: (v, r) => (v ? `${r.weekProgressEditTime}：${v}` : '') },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true, formatter: (v, r) => (v ? `${r.nextPlanEditTime}：${v}` : '') },
```
→
```ts
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true, formatter: (v, r) => (v ? `${r.weekProgressEditTime}：${htmlToPlainText(String(v))}` : '') },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true, formatter: (v, r) => (v ? `${r.nextPlanEditTime}：${htmlToPlainText(String(v))}` : '') },
```

2c. 用 `editPrefix` 替换 `progCell`（70-75 行整段）：
```ts
function editPrefix(row: OppFollowupRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  return t ? `${t}：` : ''
}
```

2d. 删除编辑弹窗状态与 openEdit（77-85 行整段 `// 进展编辑(走 oppFollowup store...` … `}`）。

2e. defineExpose 去掉 `editOpen, editCtx,` 一行（约 118 行）。

2f. 模板两处 slot（157-164 行）替换为：
```vue
        <template #cell-weekProgress="{ row }">
          <RichTextCell
            :content="(row as OppFollowupRow).weekProgress ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as OppFollowupRow, 'weekProgress')"
            :save-handler="(html: string) => oppf.update((row as OppFollowupRow).id, 'weekProgress', html)"
          />
        </template>
        <template #cell-nextPlan="{ row }">
          <RichTextCell
            :content="(row as OppFollowupRow).nextPlan ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as OppFollowupRow, 'nextPlan')"
            :save-handler="(html: string) => oppf.update((row as OppFollowupRow).id, 'nextPlan', html)"
          />
        </template>
```

2g. 删除 `<ProgressEditModal store="oppFollowup" ... />`（175-176 行）。

- [ ] **Step 3: 跑测试 + 类型检查确认通过**

Run: `cd frontend && npx vitest run src/views/OpportunityFollowupView.test.ts && npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: PASS + 无类型错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/OpportunityFollowupView.vue
git commit -m "feat(richtext): OpportunityFollowupView 进展改就地富文本"
```

---

### Task 6: RiskFollowupView 接入 + 关排序 + 移除 revConclusion 筛选

**Files:**
- Modify: `frontend/src/views/RiskFollowupView.vue`

**Interfaces:**
- Consumes: `RichTextCell`、`htmlToPlainText`、`risk.update(riskKey, 'followAction'|'revConclusion', html)`。
- 注意：本页 followAction/revConclusion 走 `FOLLOW_COLS` 显式 `sortable:true`（非 withSortable），故在本页直接改；`nextRevDate` 保持内联 `el-date-picker` 不变。

- [ ] **Step 1: 跑现有测试建基线**

Run: `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts`
Expected: PASS（作回归基线）

- [ ] **Step 2: 改实现** `frontend/src/views/RiskFollowupView.vue`

2a. import：第 1 行去掉 `reactive`：
```ts
import { computed, onMounted, ref } from 'vue'
```
第 17 行 `import ProgressEditModal ...` → `import RichTextCell from '@/components/RichTextCell.vue'`；第 23 行 `import { fmt } from '@/lib/format'` 后补 `import { htmlToPlainText } from '@/lib/richText'`。

2b. FOLLOW_COLS 关掉两富文本列排序、加导出去标签 formatter（61-65 行）：
```ts
const FOLLOW_COLS: DataColumn[] = [
  { key: 'followAction', label: '跟进动作', width: 240, wrap: true, sortable: true },
  { key: 'revConclusion', label: 'rev结论', width: 240, wrap: true, sortable: true },
  { key: 'nextRevDate', label: '下次rev时间', width: 170, sortable: true },
]
```
→
```ts
const FOLLOW_COLS: DataColumn[] = [
  { key: 'followAction', label: '跟进动作', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
  { key: 'revConclusion', label: 'rev结论', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
  { key: 'nextRevDate', label: '下次rev时间', width: 170, sortable: true },
]
```

2c. FILTERABLE 移除 `revConclusion`（88 行）：
```ts
const FILTERABLE = new Set(['风险等级', '风险状态', '风险大类', '风险小类', '项目级别', '项目经理', 'L4组织', '项目类型', '项目状态', '客户', 'revConclusion', 'nextRevDate'])
```
→（删掉 `'revConclusion', `）
```ts
const FILTERABLE = new Set(['风险等级', '风险状态', '风险大类', '风险小类', '项目级别', '项目经理', 'L4组织', '项目类型', '项目状态', '客户', 'nextRevDate'])
```

2d. 用 `editPrefix` 替换 `progCell`（98-103 行整段）：
```ts
function editPrefix(row: RiskRow, field: 'followAction' | 'revConclusion'): string {
  const t = field === 'followAction' ? row.followActionEditTime : row.revConclusionEditTime
  return t ? `${t}：` : ''
}
```

2e. 删除编辑弹窗状态与 openEdit（96-111 行：`const editOpen` / `const editCtx` / `progCell`（已被 2d 替换）/ `openEdit`）。具体删掉这两段（progCell 已在 2d 处理）：
```ts
const editOpen = ref(false)
const editCtx = reactive({ riskKey: '', title: '', field: 'followAction' as 'followAction' | 'revConclusion', initial: '' })
```
和
```ts
function openEdit(row: RiskRow, field: 'followAction' | 'revConclusion') {
  if (!fp.isCurrent.value) return
  editCtx.riskKey = row.riskKey
  editCtx.title = `${row['项目名称'] ?? ''} / 风险 ${row['风险编码'] ?? ''}`
  editCtx.field = field
  editCtx.initial = (row as Record<string, any>)[field] ?? ''
  editOpen.value = true
}
```
（`onDateChange` 保留不动。）

2f. defineExpose 去掉 `editOpen, editCtx,` 一行（约 148 行）。

2g. 模板两处 slot（187-194 行）替换为（nextRevDate 的 date-picker slot 195-201 保持不动）：
```vue
        <template #cell-followAction="{ row }">
          <RichTextCell
            :content="((row as RiskRow) as Record<string, any>).followAction ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as RiskRow, 'followAction')"
            :save-handler="(html: string) => risk.update((row as RiskRow).riskKey, 'followAction', html)"
          />
        </template>
        <template #cell-revConclusion="{ row }">
          <RichTextCell
            :content="((row as RiskRow) as Record<string, any>).revConclusion ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as RiskRow, 'revConclusion')"
            :save-handler="(html: string) => risk.update((row as RiskRow).riskKey, 'revConclusion', html)"
          />
        </template>
```

2h. 删除 `<ProgressEditModal v-model="editOpen" store="riskFollowup" ... />`（211-213 行）。

- [ ] **Step 3: 跑测试 + 类型检查确认通过**

Run: `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts && npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: PASS + 无类型错误

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/RiskFollowupView.vue
git commit -m "feat(richtext): RiskFollowupView 跟进改就地富文本(关排序/去 revConclusion 筛选)"
```

---

### Task 7: PaymentKeyFollowupView 接入 + columnSort 关排序

**Files:**
- Modify: `frontend/src/views/PaymentKeyFollowupView.vue`
- Modify: `frontend/src/lib/columnSort.ts`

**Interfaces:**
- Consumes: `RichTextCell`、`htmlToPlainText`、`pk.update(projectId, 'followAction'|'revConclusion', html)`。
- 注意：本页 followAction/revConclusion 走 `withSortable`，故关排序在 `columnSort.ts` 的 `NON_SORTABLE_KEYS` 里做（顺带对全站生效，其余页不含这两列、无副作用）；`nextRevDate` 内联 date-picker 保持不变。

- [ ] **Step 1: 跑现有测试建基线**

Run: `cd frontend && npx vitest run src/views/PaymentKeyFollowupView.test.ts`
Expected: PASS（作回归基线）

- [ ] **Step 2: columnSort.ts 关 followAction/revConclusion 排序**

`frontend/src/lib/columnSort.ts` 第 4 行：
```ts
export const NON_SORTABLE_KEYS = new Set<string>(['weekProgress', 'nextPlan', 'remark', 'mainProducts'])
```
→
```ts
export const NON_SORTABLE_KEYS = new Set<string>(['weekProgress', 'nextPlan', 'remark', 'mainProducts', 'followAction', 'revConclusion'])
```

- [ ] **Step 3: 改实现** `frontend/src/views/PaymentKeyFollowupView.vue`

3a. import：第 2 行去掉 `reactive`：
```ts
import { computed, onMounted, ref } from 'vue'
```
第 20 行 `import ProgressEditModal ...` → `import RichTextCell from '@/components/RichTextCell.vue'`；第 26 行 `import { fmt } from '@/lib/format'` 后补 `import { htmlToPlainText } from '@/lib/richText'`。

3b. followAction/revConclusion 列加导出去标签 formatter（80-81 行）：
```ts
  { key: 'followAction', label: '跟进动作', width: 240, wrap: true },
  { key: 'revConclusion', label: 'rev结论', width: 240, wrap: true },
```
→
```ts
  { key: 'followAction', label: '跟进动作', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
  { key: 'revConclusion', label: 'rev结论', width: 240, wrap: true, formatter: (v) => htmlToPlainText(String(v ?? '')) },
```

3c. 用 `editPrefix` 替换 `progCell`（98-103 行整段）：
```ts
function editPrefix(row: PaymentKeyRow, field: 'followAction' | 'revConclusion'): string {
  const t = field === 'followAction' ? row.followActionEditTime : row.revConclusionEditTime
  return t ? `${t}：` : ''
}
```

3d. 删除编辑弹窗状态与 openEdit（107-114 行整段 `// 进展编辑(走 paymentKey store)` … `}`）。（`onDateChange` 保留。）

3e. defineExpose 去掉 `editOpen, editCtx,` 一行（约 156 行）。

3f. 模板两处 slot（195-202 行）替换为（nextRevDate date-picker slot 203-209 保持不动）：
```vue
        <template #cell-followAction="{ row }">
          <RichTextCell
            :content="(row as PaymentKeyRow).followAction ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as PaymentKeyRow, 'followAction')"
            :save-handler="(html: string) => pk.update((row as PaymentKeyRow).projectId, 'followAction', html)"
          />
        </template>
        <template #cell-revConclusion="{ row }">
          <RichTextCell
            :content="(row as PaymentKeyRow).revConclusion ?? ''"
            :editable="fp.isCurrent.value"
            :prefix="editPrefix(row as PaymentKeyRow, 'revConclusion')"
            :save-handler="(html: string) => pk.update((row as PaymentKeyRow).projectId, 'revConclusion', html)"
          />
        </template>
```

3g. 删除 `<ProgressEditModal v-model="editOpen" store="paymentKey" ... />`（220-221 行）。

- [ ] **Step 4: 跑测试 + 类型检查确认通过**

Run: `cd frontend && npx vitest run src/views/PaymentKeyFollowupView.test.ts src/views/RiskFollowupView.test.ts src/views/TempFollowupView.test.ts src/views/OpportunityFollowupView.test.ts && npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: PASS + 无类型错误（含用到 withSortable 的三页无排序回归）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/PaymentKeyFollowupView.vue frontend/src/lib/columnSort.ts
git commit -m "feat(richtext): PaymentKeyFollowupView 跟进改就地富文本 + 关 followAction/revConclusion 排序"
```

---

### Task 8: 删除 ProgressEditModal + 版本 bump + verify + PROGRESS

**Files:**
- Delete: `frontend/src/components/ProgressEditModal.vue`, `frontend/src/components/ProgressEditModal.test.ts`
- Modify: `frontend/src/version.ts`, `PROGRESS.md`

**Interfaces:**
- Consumes: 5 页均已不再 import ProgressEditModal（Task 3-7）。

- [ ] **Step 1: 确认无残留引用**

Run: `cd frontend && git grep -n "ProgressEditModal" -- src/ || echo NO-REF`
Expected: 仅可能命中将被删的 `ProgressEditModal.test.ts` 自身；`src/views` 下 **零命中**（若有命中说明某页漏改，回对应任务修）。

- [ ] **Step 2: 删除弹窗组件与其测试**

```bash
git rm frontend/src/components/ProgressEditModal.vue frontend/src/components/ProgressEditModal.test.ts
```

- [ ] **Step 3: 版本 bump** `frontend/src/version.ts`

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V2.8.2'
export const RELEASE_DATE = '2026-07-10'
```

- [ ] **Step 4: 全量前端测试 + 类型 + 构建**

Run: `cd frontend && npm run test:run && npm run typecheck && npm run build`
Expected: 全绿（vitest 全过、typecheck 0 错、build 成功）

- [ ] **Step 5: 后端回归（确认零改动不破坏）**

Run: `python -m pytest -q`
Expected: PASS（后端未改，作安全网）

- [ ] **Step 6: 更新 `PROGRESS.md`**

在版本历史顶部加入 V2.8.2 条目（Z 级，纯前端）：概述「5 跟进页进展改就地富文本内联编辑（加粗/下划线/删除线/斜体/颜色/清除格式）；新增 richText.ts + RichTextCell.vue，删 ProgressEditModal；后端/审计零改动；risk/payment 关 2 列排序、risk 去 revConclusion 筛选、导出去标签；升级仅换 dist、无需重启后端/无需点更新数据」。把上一条 V2.8.1 相应降级标注。

- [ ] **Step 7: 整仓验证**

Run: `bash verify.sh`
Expected: 全绿（语法/ruff/pytest + 前端 typecheck/vitest/build）

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "chore(release): V2.8.2 就地富文本内联编辑收官(删 ProgressEditModal + 版本 + PROGRESS)"
```

---

## Self-Review（作者自查）

**1. Spec 覆盖**
- 就地内联富文本(6 工具) → Task 2 RichTextCell + Task 3-7 接入 ✅
- 净化白名单 + XSS + font→span + 文本转义 → Task 1 richText.ts + 测试 ✅
- htmlToPlainText 去标签导出 → Task 1 + 各页 formatter/exportRow（Task 3-7）✅
- 保存语义(保存/取消/Esc/Ctrl+Enter/脏态外部保持打开/单例互斥) → Task 2 ✅
- 展示净化 v-html + 时间前缀 + 空占位 + pre-wrap → Task 2 ✅
- 历史只读(editable=false 无编辑器) → Task 2（只读态点击不进入编辑测试）✅
- 排序:followAction/revConclusion 关闭 → Task 6(risk 显式) + Task 7(columnSort) ✅
- 筛选:risk 去 revConclusion → Task 6 ✅
- 色板 6 色(两主题可读，取代 spec「含默认色」为「清除格式」代替，理由:固定 --txt 会跨主题失读) → Task 2 ✅
- 删 ProgressEditModal + 版本 V2.8.2 + 后端零改动 → Task 8 ✅

**2. 占位符扫描**：无 TBD/TODO；每个代码步给出完整代码或精确 before→after。行号标「约」处为定位提示，实现按锚点文本匹配。

**3. 类型/命名一致性**：`sanitizeRichText`/`htmlToPlainText`（Task 1 定义，Task 2-7 消费）一致；`RichTextCell` props `content/editable/prefix/saveHandler`（Task 2 定义，Task 3-7 传参 `:save-handler`）一致；各页 `editPrefix(row, field)` 签名与该页 field 联合一致；`NON_SORTABLE_KEYS` 单一来源。

**偏离 spec 的显式记录**：色板由「约 7 色含默认/黑」调整为「6 色纯强调、不含默认色」，因固定 `--txt` 十六进制在另一主题下会失去对比度；恢复默认色用「清除格式」。功能等价、更稳，供终审知悉。
