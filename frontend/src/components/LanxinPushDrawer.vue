<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useYitianStore } from '@/stores/yitian'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { issueRows } from '@/lib/yitian/compliance'
import { projectItems, timesheetItems, type PushItem } from '@/lib/lanxin/items'
import { getLanxinConfig, lanxinPreview, lanxinSend,
         type LanxinConfig, type LanxinPlan, type LanxinSendResult } from '@/lib/lanxinApi'
import SectionTitle from '@/components/SectionTitle.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const data = useDataStore()
const yitian = useYitianStore()
const yitianSettings = useYitianSettingsStore()

const plan = ref<LanxinPlan | null>(null)
const result = ref<LanxinSendResult | null>(null)
const busy = ref(false)
const items = ref<PushItem[]>([])

// —— 收件人挑选(V4.5.10) ——
// 起因:连通性自检只能证明"网关通",要验一次真实数据只能往生产上真发,而此前
// 只有"全发"一个档 —— 想小范围试一下，就得真的打扰全部收件人。
// 【选择键必须是 role + employId 二元组】:同一个人既是项目经理又是上级时，plan 里
// 是两条(本人明细卡 / 上级汇总卡)，只按工号选会把两条一起选中，试发变成发两条。
const selected = ref<Set<string>>(new Set())
const rkey = (r: { role: string; employId: string }) => `${r.role}|${r.employId}`
const allKeys = computed(() => (plan.value?.recipients ?? []).map(rkey))
const allChecked = computed(() =>
  allKeys.value.length > 0 && selected.value.size === allKeys.value.length)
const someChecked = computed(() =>
  selected.value.size > 0 && selected.value.size < allKeys.value.length)
function toggleOne(k: string, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(k); else next.delete(k)
  selected.value = next
}
function toggleAll(on: boolean) {
  selected.value = on ? new Set(allKeys.value) : new Set()
}

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/** 前端只算「哪些项目/工时行有什么异常」;「发给谁」由后端解析花名册决定。
 *  issueRows 的 start/end 传空串 → 函数内 `start && ...`/`end && ...` 判断为假,
 *  不做任何日期过滤 = 与「全时口径」等价(已核实,见 lib/yitian/compliance.ts issueRows)。
 *  cfg 由调用方传入并复用(doPreview 已拉过一次),避免同一次预览打两遍 /api/lanxin/config。 */
function buildItems(cfg: LanxinConfig): PushItem[] {
  const out: PushItem[] = []
  const rProj = cfg.routes.find((r) => r.key === 'project')
  if (rProj?.enabled && data.data) {
    const allow = (rProj.items ?? []).filter((i) => i.enabled).map((i) => i.code)
    out.push(...projectItems(data.data.projects ?? [],
                             (data.data.projectPmis ?? {}) as never,
                             allow))
  }
  const rTs = cfg.routes.find((r) => r.key === 'timesheet')
  if (rTs?.enabled && yitian.data) {
    const allow = (rTs.items ?? []).filter((i) => i.enabled).map((i) => i.code)
    const rows = issueRows(yitian.data, '', '', [], yitianSettings.settings.excludedTypes ?? [])
    out.push(...timesheetItems(rows, allow,
                               yitian.data.meta.periodStart ?? '', yitian.data.meta.periodEnd ?? ''))
  }
  return out
}

async function doPreview() {
  busy.value = true
  result.value = null
  try {
    const cfg = await getLanxinConfig()
    const rTs = cfg.routes.find((r) => r.key === 'timesheet')
    // C-1:yitian store 是惰性加载(只在进入 /yitian 时触发),/data 页从不主动 load,
    // 若这里不显式拉一次,yitian.data 恒为 null → 工时事项静默产出 0 条、超管毫无察觉。
    if (rTs?.enabled) await Promise.all([yitian.load(), yitianSettings.load()])
    items.value = buildItems(cfg)
    // 路由开着却因数据没到而一条工时事项都没有 → 必须显式告知,不能静默为 0
    if (rTs?.enabled && !yitian.data) {
      ElMessage.warning('倚天工时数据未加载，工时问题未纳入本次推送')
    }
    plan.value = await lanxinPreview(items.value)
    // 默认全选 = 保持"预览完直接推"的原行为不变;想小范围试发就自己取消勾选。
    selected.value = new Set(allKeys.value)
  } catch (e) {
    ElMessage.error('预览失败：' + (e instanceof Error ? e.message : String(e)))
    plan.value = null
    selected.value = new Set()
  } finally { busy.value = false }
}

async function doSend() {
  if (!plan.value) return
  const picked = (plan.value.recipients ?? []).filter((r) => selected.value.has(rkey(r)))
  if (!picked.length) { ElMessage.warning('请至少勾选一个收件人'); return }
  const partial = picked.length < plan.value.recipients.length
  try {
    await ElMessageBox.confirm(
      partial
        ? `确定只向勾选的 ${picked.length} 人推送？（本次计划共 ${plan.value.recipients.length} 人，`
          + '其余不会收到）该操作会真实触达员工，不可撤销。'
        : `确定向 ${plan.value.totals.recipients} 人推送蓝信消息？该操作会真实触达员工，不可撤销。`,
      '确认推送', { type: 'warning' })
  } catch { return }
  busy.value = true
  try {
    // 与预览同一份 items → 后端同一个 build_plan → 所见即所发。
    // only 只做收窄:后端拿它过滤自己算出来的 recipients,加不出人、也改不了卡片。
    // 全选时传 undefined(不带该字段)→ 走原来的全发路径,行为逐字不变。
    const r = await lanxinSend(items.value,
      partial ? picked.map((p) => ({ role: p.role, employId: p.employId })) : undefined)
    plan.value = r.plan
    result.value = r.result
    // 后端回的是【收窄后】的 plan,勾选态要跟着重建,否则 selected 里留着已被过滤掉的
    // 键,全选框的 indeterminate 会显示成"部分选中"而列表里明明每行都打了勾。
    selected.value = new Set((r.plan.recipients ?? []).map(rkey))
    ElMessage.success(`已推送 ${r.result.sent} 条`)
  } catch (e) {
    ElMessage.error('推送失败：' + (e instanceof Error ? e.message : String(e)))
  } finally { busy.value = false }
}

watch(() => props.modelValue, (v) => { if (v) doPreview() }, { immediate: true })

/** 卡片内容(card)是后端拼好的自由字典,模板里反复内联类型断言容易撞上 SFC 模板编译器的表达式解析边界，
 *  统一收敛到这两个小helper。 */
function cardStr(card: Record<string, unknown>, key: string): string {
  const v = card[key]
  return typeof v === 'string' ? v : ''
}
function cardFields(card: Record<string, unknown>): { key: string; value: string }[] {
  return Array.isArray(card.fields) ? (card.fields as { key: string; value: string }[]) : []
}
</script>

<template>
  <el-drawer v-model="open" title="蓝信推送 · 预览" size="60%">
    <div class="lx-wrap">
      <div class="dv-row">
        <button class="dv-btn" :disabled="busy" @click="doPreview">重新预览</button>
        <button class="dv-btn primary" data-test="lx-send"
          :disabled="busy || !plan?.recipients.length || !selected.size"
          @click="doSend">确认推送</button>
        <span v-if="plan" class="dv-hint">
          收件 {{ plan.totals.recipients }} 人 · 未解析 {{ plan.totals.unresolved }} 项
          · 已选 <span class="u-num">{{ selected.size }}</span> 人
        </span>
      </div>

      <div v-if="result" class="dv-row dv-hint" :class="result.failed.length ? 'warn' : 'ok'">
        推送结果：成功 {{ result.sent }} 条<template v-if="result.failed.length">，失败 {{ result.failed.length }} 条</template>
      </div>
      <div v-if="result?.failed.length" class="lx-list" data-test="lx-failed">
        <div class="dv-sub-head">发送失败（未送达，可重试）</div>
        <div v-for="f in result.failed" :key="f.employId" class="lx-item">
          <span class="dv-badge warn">失败</span>
          <span class="lx-name">{{ f.name }}（{{ f.employId }}）</span>
          <span class="dv-hint">{{ f.errMsg }}（{{ f.errCode }}）</span>
        </div>
      </div>

      <div v-if="plan?.unresolved.length" class="lx-list" data-test="lx-unresolved">
        <div class="dv-sub-head">未解析（不会收到消息）</div>
        <div v-for="u in plan.unresolved" :key="u.kind + u.id" class="lx-item">
          <span class="dv-badge warn">未解析</span>
          <span class="lx-name">{{ u.id }} {{ u.name }}</span>
          <span class="dv-hint">{{ u.reason }}</span>
        </div>
      </div>

      <div v-if="plan" class="lx-list">
        <div class="dv-sub-head">收件人与卡片全文（所见即所发）</div>
        <!-- 只给勾选的人推送:自检只能验网关连通,验真实数据此前只能全员真发一次 -->
        <div class="dv-row">
          <el-checkbox :model-value="allChecked" :indeterminate="someChecked"
            data-test="lx-select-all" @change="toggleAll(Boolean($event))">
            全选（取消勾选即可只推送给指定的人）
          </el-checkbox>
        </div>
        <div v-for="r in plan.recipients" :key="r.role + r.employId" class="lx-card-prev">
          <div class="lx-item">
            <el-checkbox :model-value="selected.has(r.role + '|' + r.employId)"
              :data-test="`lx-pick-${r.role}-${r.employId}`"
              @change="toggleOne(r.role + '|' + r.employId, Boolean($event))" />
            <span class="dv-badge" :class="r.role === 'primary' ? 'ok' : 'warn'">
              {{ r.role === 'primary' ? '本人' : '汇总' }}
            </span>
            <span class="lx-name">{{ r.name }}（{{ r.employId }}）</span>
          </div>
          <div class="lx-card-body">
            <SectionTitle class="lx-card-title">{{ cardStr(r.card, 'bodyTitle') }}</SectionTitle>
            <div v-if="cardStr(r.card, 'bodySubTitle')" class="dv-hint">
              {{ cardStr(r.card, 'bodySubTitle') }}
            </div>
            <div v-for="(f, i) in cardFields(r.card)" :key="i" class="lx-field">
              <span class="lx-field-k">{{ f.key }}</span>
              <span class="lx-field-v u-num">{{ f.value }}</span>
            </div>
            <div v-if="cardStr(r.card, 'bodyContent')" class="lx-content">
              {{ cardStr(r.card, 'bodyContent') }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本组件特有:预览列表与卡片仿真 */
.lx-wrap { display: flex; flex-direction: column; gap: var(--gap-stack); }
.lx-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.lx-item { display: flex; align-items: center; gap: var(--sp-2); padding: 0 var(--sp-4); }
.lx-name { font-size: var(--fs-2); color: var(--txt); font-weight: 600; }
.lx-card-prev { border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3);
  display: flex; flex-direction: column; gap: var(--sp-2); }
.lx-card-body { background: var(--card2, var(--card)); border-radius: var(--r-sm); padding: var(--sp-3); }
/* 类名里虽有 card,但原值是 --fs-3 → 归 section 级;字号/字重/色已收归 SectionTitle,
   此处只剩底边距。写成 .st.lx-card-title 而非 .lx-card-title —— 父组件给子组件根节点加样式
   须同时带两边的类,否则与 SectionTitle 自身的 .st { margin: 0 } 同特异性、靠打包顺序决胜负。 */
.st.lx-card-title { margin-bottom: var(--sp-2); }
.lx-field { display: flex; justify-content: space-between; gap: var(--sp-3);
  padding: 2px 0; border-bottom: 1px dashed var(--line); }
.lx-field-k { color: var(--sub); font-size: var(--fs-1); }
.lx-field-v { color: var(--txt); font-size: var(--fs-1); }
.lx-content { margin-top: var(--sp-2); font-size: var(--fs-1); color: var(--sub);
  white-space: pre-wrap; line-height: var(--lh-base); }
</style>
