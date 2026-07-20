<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useYitianRulesStore } from '@/stores/yitianRules'
import { useYitianStore } from '@/stores/yitian'
import { downloadJson, downloadXlsx, parseImportFile, type YitianRulesConfig } from '@/lib/yitian/rulesConfig'
import { getYitianRules } from '@/lib/yitianApi'

const store = useYitianRulesStore()
const yitian = useYitianStore()
const draft = ref<YitianRulesConfig | null>(null)
const msg = ref(''); const err = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function clone(c: YitianRulesConfig): YitianRulesConfig { return JSON.parse(JSON.stringify(c)) }

onMounted(async () => {
  try { await store.load() } catch (e) { err.value = true; msg.value = e instanceof Error ? e.message : '加载失败' }
  if (store.config) draft.value = clone(store.config)
})
watch(() => store.config, (c) => { if (c && !draft.value) draft.value = clone(c) })

// —— 列表增删(el-tag) ——
function addTo(list: string[], v: string) { const s = v.trim(); if (s && !list.includes(s)) list.push(s) }
function removeAt(list: string[], i: number) { list.splice(i, 1) }

// —— 类型一致性表行增删 ——
function addTmRow(wt: string) { if (!draft.value) return; (draft.value.checks.typeMismatch.rules[wt] ||= []).push(['', '']) }
function delTmRow(wt: string, i: number) { draft.value?.checks.typeMismatch.rules[wt]?.splice(i, 1) }

// —— 产品线/名称表行增删 ——
function addLineRow() { draft.value?.checks.product.lineKeywords.push({ linePatterns: [], keywords: [] }) }
function delLineRow(i: number) { draft.value?.checks.product.lineKeywords.splice(i, 1) }
function addNameRow() { draft.value?.checks.product.nameKeywords.push({ namePatterns: [], keywords: [] }) }
function delNameRow(i: number) { draft.value?.checks.product.nameKeywords.splice(i, 1) }

async function onSave() {
  if (!draft.value) return
  msg.value = ''; err.value = false
  try {
    const r = await store.save(draft.value)
    draft.value = clone(r.rules)
    await yitian.load(true)                 // 刷新合规页数据
    msg.value = `已保存并重算，问题工时 ${r.problemCount} 条（立即生效，无需点「更新数据」）`
  } catch (e) { err.value = true; msg.value = e instanceof Error ? e.message : '保存失败' }
}

async function onReset() {
  const ok = await ElMessageBox.confirm('恢复为系统内置默认规则？未保存的改动将丢失（保存后才真正生效）。', '恢复默认', { type: 'warning' })
    .then(() => true).catch(() => false)
  if (!ok) return
  try {
    // 拿后端「出厂默认」(default=1),而非 load_config 返回的已保存自定义配置;仅落编辑区,点保存才生效。
    draft.value = clone(await getYitianRules({ default: true }))
    msg.value = '已载入内置默认，核对后点「保存」生效'; err.value = false
  } catch (e) { err.value = true; msg.value = e instanceof Error ? e.message : '载入默认失败' }
}

function triggerImport() { fileInput.value?.click() }
async function onFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const cfg = await parseImportFile(f)
    await ElMessageBox.confirm('导入将整份替换当前编辑内容（保存后才生效）。继续？', '导入确认', { type: 'warning' })
    applyImport(cfg)
    msg.value = '已导入到编辑区，请核对后点保存'; err.value = false
  } catch (e) { err.value = true; msg.value = '导入失败：' + (e instanceof Error ? e.message : String(e)) }
  finally { if (fileInput.value) fileInput.value.value = '' }
}
function applyImport(cfg: YitianRulesConfig) { draft.value = clone(cfg) }

defineExpose({ draft, onSave, onReset, applyImport, addTo, removeAt })
</script>

<template>
  <div v-if="draft" class="yr-card">
    <p class="yr-hint">合规规则超管可配；保存后<strong>立即后端重算</strong>问题工时，无需点「更新数据」。停用某检查 → 该项不再产码。</p>

    <div class="yr-tools">
      <el-button size="small" @click="triggerImport">导入(JSON/Excel)</el-button>
      <el-button size="small" @click="downloadJson(draft)">导出JSON</el-button>
      <el-button size="small" @click="downloadXlsx(draft)">导出Excel</el-button>
      <el-button size="small" @click="onReset">恢复默认</el-button>
      <input ref="fileInput" type="file" accept=".json,.xlsx" style="display:none" @change="onFile" />
    </div>

    <!-- 基础项 -->
    <section class="yr-sec"><h4>基础项</h4>
      <div class="yr-row"><span class="yr-lbl">受检工时类型</span>
        <el-tag v-for="(t,i) in draft.checkedTypes" :key="t" closable @close="removeAt(draft.checkedTypes,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加类型回车" @keyup.enter="(e:any)=>{addTo(draft!.checkedTypes,e.target.value);e.target.value=''}" />
      </div>
      <div class="yr-row"><el-switch v-model="draft.checks.serviceMode.enabled" /><span class="yr-lbl">服务方式检查</span>
        <span class="yr-lbl">生效日</span><el-date-picker v-model="draft.checks.serviceMode.effectiveDate" type="date" value-format="YYYY-MM-DD" size="small" />
        <span class="yr-lbl">关键词</span>
        <el-tag v-for="(t,i) in draft.checks.serviceMode.keywords" :key="t" closable @close="removeAt(draft.checks.serviceMode.keywords,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加关键词回车" @keyup.enter="(e:any)=>{addTo(draft!.checks.serviceMode.keywords,e.target.value);e.target.value=''}" />
      </div>
      <div class="yr-row"><el-switch v-model="draft.checks.customer.enabled" /><span class="yr-lbl">客户名称检查 · 提示词</span>
        <el-tag v-for="(t,i) in draft.checks.customer.hintKeywords" :key="t" closable @close="removeAt(draft.checks.customer.hintKeywords,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加词回车" @keyup.enter="(e:any)=>{addTo(draft!.checks.customer.hintKeywords,e.target.value);e.target.value=''}" />
      </div>
      <div class="yr-row"><el-switch v-model="draft.checks.presaleProductHint.enabled" /><span class="yr-lbl">售前产品提示 · 跳过工时类型</span>
        <el-tag v-for="(t,i) in draft.checks.presaleProductHint.skipWorkTypes" :key="t" closable @close="removeAt(draft.checks.presaleProductHint.skipWorkTypes,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加词回车" @keyup.enter="(e:any)=>{addTo(draft!.checks.presaleProductHint.skipWorkTypes,e.target.value);e.target.value=''}" />
      </div>
    </section>

    <!-- 必填三段 -->
    <section class="yr-sec"><h4>必填三段</h4>
      <div v-for="seg in (['summary','progress','next'] as const)" :key="seg" class="yr-row">
        <el-switch v-model="draft.checks[seg].enabled" />
        <span class="yr-lbl">{{ { summary:'缺概述', progress:'缺进展', next:'缺下一步' }[seg] }}</span>
        <el-tag v-for="(t,i) in draft.checks[seg].keywords" :key="t" closable @close="removeAt(draft.checks[seg].keywords,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加关键词回车" @keyup.enter="(e:any)=>{addTo(draft!.checks[seg].keywords,e.target.value);e.target.value=''}" />
      </div>
    </section>

    <!-- 类型一致性 -->
    <section class="yr-sec"><h4>类型一致性 <el-switch v-model="draft.checks.typeMismatch.enabled" /></h4>
      <div v-for="wt in Object.keys(draft.checks.typeMismatch.rules)" :key="wt" class="yr-sub">
        <div class="yr-lbl">{{ wt }} <el-button size="small" text @click="addTmRow(wt)">+ 加一行</el-button></div>
        <div v-for="(pair,i) in draft.checks.typeMismatch.rules[wt]" :key="i" class="yr-row">
          <el-input v-model="pair[0]" size="small" placeholder="禁止词" class="yr-cell" />
          <span>→</span>
          <el-input v-model="pair[1]" size="small" placeholder="应归属类型" class="yr-cell" />
          <el-button size="small" text @click="delTmRow(wt,i)">删</el-button>
        </div>
      </div>
    </section>

    <!-- 产品类别 -->
    <section class="yr-sec"><h4>产品类别 <el-switch v-model="draft.checks.product.enabled" /></h4>
      <div class="yr-lbl">产品线关键词 <el-button size="small" text @click="addLineRow">+ 加产品线</el-button></div>
      <div v-for="(e,i) in draft.checks.product.lineKeywords" :key="i" class="yr-row">
        <el-input v-model="e.linePatterns[0]" size="small" placeholder="产品线匹配词(首)" class="yr-cell" />
        <el-input :model-value="e.keywords.join('、')" size="small" placeholder="合法关键词(、分隔)" class="yr-cell-wide"
          @change="(v:string)=>{e.keywords=v.split('、').map(s=>s.trim()).filter(Boolean)}" />
        <el-button size="small" text @click="delLineRow(i)">删</el-button>
      </div>
      <div class="yr-lbl">产品名称复核 <el-button size="small" text @click="addNameRow">+ 加产品名</el-button></div>
      <div v-for="(e,i) in draft.checks.product.nameKeywords" :key="i" class="yr-row">
        <el-input v-model="e.namePatterns[0]" size="small" placeholder="产品名称匹配词(首)" class="yr-cell" />
        <el-input :model-value="e.keywords.join('、')" size="small" placeholder="合法关键词(、分隔)" class="yr-cell-wide"
          @change="(v:string)=>{e.keywords=v.split('、').map(s=>s.trim()).filter(Boolean)}" />
        <el-button size="small" text @click="delNameRow(i)">删</el-button>
      </div>
      <div class="yr-row"><span class="yr-lbl">专属词</span>
        <el-tag v-for="(t,i) in draft.checks.product.exclusiveKws" :key="t" closable @close="removeAt(draft.checks.product.exclusiveKws,i)">{{ t }}</el-tag>
        <el-input class="yr-add" size="small" placeholder="加词回车" @keyup.enter="(e:any)=>{addTo(draft!.checks.product.exclusiveKws,e.target.value);e.target.value=''}" />
      </div>
    </section>

    <div class="yr-actions">
      <el-button type="primary" :loading="store.saving" @click="onSave">保存</el-button>
      <span v-if="msg" class="yr-msg" :class="{ 'yr-msg-err': err }">{{ msg }}</span>
    </div>
  </div>
  <div v-else class="yr-card"><el-skeleton :rows="6" animated /></div>
</template>

<style scoped>
.yr-card { display: flex; flex-direction: column; gap: var(--gap-stack); padding: var(--sp-3) var(--sp-4); }
.yr-hint { font-size: var(--fs-2); color: var(--sub); line-height: var(--lh-base); }
.yr-tools { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.yr-sec { border-top: 1px solid var(--line); padding-top: var(--sp-3); }
.yr-sec h4 { font-size: var(--fs-2); color: var(--txt); margin: 0 0 var(--sp-2); display: flex; align-items: center; gap: var(--sp-2); }
.yr-sub { margin-bottom: var(--sp-2); }
.yr-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.yr-lbl { font-size: var(--fs-1); color: var(--sub); }
.yr-add { width: 140px; }
.yr-cell { width: 160px; }
.yr-cell-wide { width: 320px; }
.yr-actions { display: flex; align-items: center; gap: var(--gap-stack); }
.yr-msg { font-size: var(--fs-1); color: var(--ok-text); }
.yr-msg-err { color: var(--danger-text); }
</style>
