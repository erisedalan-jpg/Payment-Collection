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

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const data = useDataStore()
const yitian = useYitianStore()
const yitianSettings = useYitianSettingsStore()

const plan = ref<LanxinPlan | null>(null)
const result = ref<LanxinSendResult | null>(null)
const busy = ref(false)
const items = ref<PushItem[]>([])

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
    out.push(...projectItems(data.data.projects ?? [],
                             (data.data.projectPmis ?? {}) as never,
                             rProj.reasons ?? []))
  }
  const rTs = cfg.routes.find((r) => r.key === 'timesheet')
  if (rTs?.enabled && yitian.data) {
    const rows = issueRows(yitian.data, '', '', [], yitianSettings.settings.excludedTypes ?? [])
    out.push(...timesheetItems(rows, rTs.issueCodes ?? [],
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
  } catch (e) {
    ElMessage.error('预览失败：' + (e instanceof Error ? e.message : String(e)))
    plan.value = null
  } finally { busy.value = false }
}

async function doSend() {
  if (!plan.value) return
  try {
    await ElMessageBox.confirm(
      `确定向 ${plan.value.totals.recipients} 人推送蓝信消息？该操作会真实触达员工，不可撤销。`,
      '确认推送', { type: 'warning' })
  } catch { return }
  busy.value = true
  try {
    // 与预览同一份 items → 后端同一个 build_plan → 所见即所发
    const r = await lanxinSend(items.value)
    plan.value = r.plan
    result.value = r.result
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
        <button class="dv-btn primary" data-test="lx-send" :disabled="busy || !plan?.recipients.length"
          @click="doSend">确认推送</button>
        <span v-if="plan" class="dv-hint">
          收件 {{ plan.totals.recipients }} 人 · 未解析 {{ plan.totals.unresolved }} 项
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
        <div v-for="r in plan.recipients" :key="r.role + r.employId" class="lx-card-prev">
          <div class="lx-item">
            <span class="dv-badge" :class="r.role === 'primary' ? 'ok' : 'warn'">
              {{ r.role === 'primary' ? '本人' : '汇总' }}
            </span>
            <span class="lx-name">{{ r.name }}（{{ r.employId }}）</span>
          </div>
          <div class="lx-card-body">
            <div class="lx-card-title">{{ cardStr(r.card, 'bodyTitle') }}</div>
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
.lx-card-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin-bottom: var(--sp-2); }
.lx-field { display: flex; justify-content: space-between; gap: var(--sp-3);
  padding: 2px 0; border-bottom: 1px dashed var(--line); }
.lx-field-k { color: var(--sub); font-size: var(--fs-1); }
.lx-field-v { color: var(--txt); font-size: var(--fs-1); }
.lx-content { margin-top: var(--sp-2); font-size: var(--fs-1); color: var(--sub);
  white-space: pre-wrap; line-height: var(--lh-base); }
</style>
