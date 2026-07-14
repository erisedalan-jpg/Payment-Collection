import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { calcBudget, emptyForm } from '@/lib/budget/calc'
import { calcSalesOrder } from '@/lib/budget/salesOrder'
import { genCrmText } from '@/lib/budget/crmText'
import type { BudgetConfig, BudgetForm, EstimateRecordLike } from '@/lib/budget/types'

/** 概算表单的唯一状态源。
 *
 *  费率快照:新建报价用**当前配置**算;打开旧存档用**它自己的快照**算 —— 费率可配之后,
 *  "同一份报价什么时候打开都是同一个数"不再是白捡的保证,而报价是要拿去 CRM 上单的对外
 *  产物,必须可复现。点「按最新费率重算」才切到当前配置(切完要重新保存才落盘)。
 */
export const useBudgetStore = defineStore('budget', () => {
  const form = ref<BudgetForm>({} as BudgetForm)
  const currentId = ref('')
  const rateSnapshot = ref<BudgetConfig | null>(null)
  const currentConfig = ref<BudgetConfig | null>(null)   // 当前生效的全局配置(由页面注入)
  const dirty = ref(false)

  function setCurrentConfig(cfg: BudgetConfig): void {
    currentConfig.value = cfg
    if (!form.value.basic) reset(cfg)
  }

  function reset(cfg: BudgetConfig): void {
    form.value = emptyForm(cfg)
    currentId.value = ''
    rateSnapshot.value = null
    dirty.value = false
  }

  /** 打开一条存档:表单来自记录,费率来自记录自己的快照。 */
  function loadRecord(rec: EstimateRecordLike): void {
    form.value = rec.data
    currentId.value = rec.id
    rateSnapshot.value = rec.rateSnapshot
    dirty.value = false
  }

  /** 按最新费率重算:丢掉快照,改用当前配置。标脏 —— 不重新保存就不会落盘。 */
  function useLatestRates(): void {
    rateSnapshot.value = null
    dirty.value = true
  }

  function touch(): void { dirty.value = true }

  /** 保存成功后落地:id + **本次实际提交上去的那份费率**(调用方从 toPayload() 里拿)。
   *
   *  快照必须在这里一起落:服务端那条记录冻的是 cfg,页面上这条报价若还跟着全局配置走,
   *  超管改完费率之后它的总成本/成本比例/下单金额会当场变、横幅不出、也不标脏 ——
   *  导出的 Excel 与存档列表里的数就对不上了,再点一次保存还会把服务端那条历史快照
   *  从 cfg 改写成新费率。cfg 由调用方在 toPayload() 时取,不在这里读 effectiveConfig:
   *  markSaved 是 API 返回**之后**才调的,这期间超管可能已经把全局配置换掉了。 */
  function markSaved(id: string, cfg: BudgetConfig): void {
    currentId.value = id
    rateSnapshot.value = cfg
    dirty.value = false
  }

  /** 算这份报价该用哪套费率:有快照用快照,没有用当前配置。 */
  const effectiveConfig = computed<BudgetConfig | null>(
    () => rateSnapshot.value ?? currentConfig.value)

  /** 快照与当前配置不同 → 页面提示「本报价基于旧费率表」。
   *  配置是纯数据、键序由后端 validate_config 固定,JSON 字符串比较不会因键序抖动误判。 */
  const snapshotStale = computed(() =>
    !!rateSnapshot.value && !!currentConfig.value
    && JSON.stringify(rateSnapshot.value) !== JSON.stringify(currentConfig.value))

  const result = computed(() => {
    const cfg = effectiveConfig.value
    if (!cfg || !form.value.basic) return null
    return calcBudget(form.value, cfg)
  })

  const salesOrder = computed(() => {
    const cfg = effectiveConfig.value
    if (!cfg || !result.value) return null
    return calcSalesOrder(result.value, form.value.margin, cfg)
  })

  /** 用户手改过 CRM 文案就不再自动覆盖(原工具同样行为,但它没有回头路)。 */
  function syncCrmText(): void {
    if (form.value.crmUserEdited || !result.value) return
    form.value.crmText = genCrmText(result.value)
  }

  /** 恢复自动生成 —— 原工具缺的那个回头路。 */
  function restoreCrmAuto(): void {
    form.value.crmUserEdited = false
    if (result.value) form.value.crmText = genCrmText(result.value)
    dirty.value = true
  }

  /** 提交体。saveAsNew=true → 强制不带 id(后端据此新建)。
   *  快照:打开的旧档带原快照;新建/已重算的带当前配置。 */
  function toPayload(saveAsNew: boolean) {
    const cfg = effectiveConfig.value as BudgetConfig
    const r = result.value
    const b = form.value.basic
    return {
      ...(saveAsNew || !currentId.value ? {} : { id: currentId.value }),
      quoteName: b.quoteName,
      data: form.value,
      rateSnapshot: cfg,
      summary: {
        customerName: b.customerName,
        salesName: b.salesName,
        projectAmount: b.projectAmount,
        totalCost: r?.totalCost ?? 0,
        salesAmount: r?.salesAmount ?? 0,
        costRatio: r?.costRatio ?? null,
        ratioStatus: r?.ratioStatus ?? 'na',
      },
    }
  }

  return {
    form, currentId, rateSnapshot, currentConfig, dirty,
    effectiveConfig, snapshotStale, result, salesOrder,
    setCurrentConfig, reset, loadRecord, useLatestRates,
    touch, markSaved, syncCrmText, restoreCrmAuto, toPayload,
  }
})
