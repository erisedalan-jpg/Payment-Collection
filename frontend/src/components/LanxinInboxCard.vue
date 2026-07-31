<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { usePaymentKeyFollowupStore } from '@/stores/paymentKeyFollowup'
import { useProjectTagsStore } from '@/stores/projectTags'
import type { Project, ProjectPmis } from '@/types/analysis'
import { getLanxinInbox, handleLanxinInboxItem, unhandleLanxinInboxItem,
         deleteLanxinInboxItem } from '@/lib/lanxinApi'
import { HANDLE_DOMAINS, HANDLE_FIELDS, needsInstance, needsRiskCode, riskChoices, canHandle,
         sourceLabel, handleVisibility,
         type HandleDomain, type LanxinInboxItem } from '@/lib/lanxinInbox'
import { buildScopeInputs } from '@/lib/tempFollowup'
import { isKeyProject } from '@/lib/keyProjects'
import { ISSUE_LABELS } from '@/lib/yitian/compliance'

const data = useDataStore()
const tempFollowup = useTempFollowupStore()
const paykey = usePaymentKeyFollowupStore()
const projectTags = useProjectTagsStore()

const items = ref<LanxinInboxItem[]>([])
const rejected = ref<{ count: number; lastAt: string; lastFrom?: string }>({ count: 0, lastAt: '' })
const received = ref(0)
const busy = ref(false)

const projects = computed(() => (data.data?.projects ?? []) as Project[])
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)

async function load() {
  busy.value = true
  try {
    const res = await getLanxinInbox()
    items.value = res.items ?? []
    rejected.value = res.rejected ?? { count: 0, lastAt: '' }
    received.value = res.received ?? 0
  } catch (e) {
    ElMessage.error('加载失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

/** 渠道展示：三种蓝信原生事件类型对应私聊/群聊(+群名)/应用号；H5 填报页反馈的
 *  eventType 恒为内部枚举 h5_review，展示成「H5 填报页」而非原始枚举值——超管
 *  不该看到内部实现细节(【复审 M-1】此前兜底分支会把 h5_review 原样显示出来)；
 *  再往后的未知类型原样兜底 eventType，不静默隐藏(排查蓝信真实回调报文的线索)。
 *  与 lib/lanxinInbox.ts 的 sourceLabel(H5 反馈/蓝信回复二选一)是两个不同维度，不要混同——
 *  改名 channelLabel 就是为了让两者能在同一处并列使用而不撞名。 */
function channelLabel(item: LanxinInboxItem): string {
  if (item.eventType === 'bot_group_message') return item.groupName ? `群聊 · ${item.groupName}` : '群聊'
  if (item.eventType === 'bot_private_message') return '私聊'
  if (item.eventType === 'account_message') return '应用号'
  if (item.eventType === 'h5_review') return 'H5 填报页'
  return item.eventType || '-'
}

/** 【复审 M-2】H5 工时反馈自带的问题码(如 MISS_SUMMARY)→ 中文标签。issueCode
 *  落库且 TS 类型已声明，但界面此前从未显示——同一员工对不同问题码的反馈原本
 *  长得一模一样，超管看不出针对哪一类。复用既有单一来源(与后端 yitian_rules.py
 *  同表)，不新造一份映射；找不到就原样兜底显示 code，不静默隐藏。 */
function issueLabel(code: string): string {
  return ISSUE_LABELS[code] ?? code
}

function projectLabel(pid: string): string {
  const p = projects.value.find((x) => x.projectId === pid)
  return p?.projectName ? `${pid} ${p.projectName}` : pid
}

/** 【V4.5.10】收件箱列表上的「涉及项目」。此前整张表【一列项目信息都没有】——
 *  超管看到一条回复，要判断它说的是哪个项目，只能点开归入抽屉才看得到预填的项目号。
 *  H5 项目侧反馈自带确定的 projectId(结构化信息，不该丢回给人工)；
 *  文本回复只有台账推测出来的候选，必须【标明是推测】，不能和确定的混为一谈。 */
function projectCells(item: LanxinInboxItem): { text: string; guess: boolean }[] {
  if (item.projectId) return [{ text: projectLabel(item.projectId), guess: false }]
  return (item.candidateProjects ?? []).map((pid) => ({ text: projectLabel(pid), guess: true }))
}

// —— 归入抽屉 ——
const handleOpen = ref(false)
const handleItem = ref<LanxinInboxItem | null>(null)
const handleForm = ref<{ domain: HandleDomain | ''; instanceId: string; projectId: string; riskCode: string }>({
  domain: '', instanceId: '', projectId: '', riskCode: '',
})

/** 当前所选项目的风险记录。域切到 risk、或改选项目时都要跟着重算。 */
const riskOptions = computed(() =>
  handleForm.value.projectId ? riskChoices(pmisMap.value, handleForm.value.projectId) : [])

/** 选了 risk 域但该项目一条风险记录都没有 —— 必须显式告知，不能给个空下拉让人干瞪眼。 */
const riskEmpty = computed(() =>
  needsRiskCode(handleForm.value.domain) && !!handleForm.value.projectId && !riskOptions.value.length)

/** riskOptions 已经把没有风险编码的记录过滤掉了(见 riskChoices)，riskEmpty 因此分不清
 *  「项目真的一条风险记录都没有」和「记录都在，只是全部没填风险编码」——后一种情况
 *  /risk 页(riskRows.ts)明明会渲染出行，统一提示「无风险记录」会让人以为看错了页面。 */
const riskCodeless = computed(() => {
  if (!riskEmpty.value || !handleForm.value.projectId) return false
  const raw = pmisMap.value[handleForm.value.projectId]?.riskRecords ?? []
  return raw.length > 0
})

/** 换项目/换域后旧的风险编码必然失效（它属于上一个项目），一律清掉重选。 */
function onScopeChange() {
  handleForm.value.riskCode = ''
}

// —— 归入可见性（V4.5.10 核心修复，成因与判据见 lib/lanxinInbox.handleVisibility）——
// 归入按 projectId 直接写 store，写入永远成功；但 payment_key/temp 的行集由范围设置
// 决定、progress 的行集只含重点项目 —— 项目不在行集里，写进去的内容【永远渲染不出来】，
// 而条目已被标 handled、按钮转灰。现网报障「归入后在对应位置找不到内容」正是这个。
//
// buildScopeInputs 要遍历全部项目，故【只在抽屉打开且确实需要范围判定时才算】：
// computed 本身惰性，这里再加两道短路，避免 /data 页一挂载就白算一遍。
const scopeInput = computed(() => {
  const d = handleForm.value.domain
  if (!handleOpen.value || !handleForm.value.projectId) return undefined
  if (d !== 'temp' && d !== 'payment_key') return undefined
  const src = data.data as unknown as Record<string, unknown> | null
  return buildScopeInputs(projects.value, pmisMap.value,
    (src?.paymentNodes ?? {}) as never, (src?.projectMilestones ?? {}) as never,
    projectTags.effectiveAssignments).find((i) => i.id === handleForm.value.projectId)
})

/** 所选临时跟进实例的 scope。未选实例 → undefined（此时不下"不可见"的判断）。 */
const tempScope = computed(() =>
  tempFollowup.instances.find((i) => i.id === handleForm.value.instanceId)?.scope)
const tempInstanceName = computed(() =>
  tempFollowup.instances.find((i) => i.id === handleForm.value.instanceId)?.name ?? '')

const visibility = computed(() => {
  const pid = handleForm.value.projectId
  const p = projects.value.find((x) => x.projectId === pid)
  return handleVisibility(handleForm.value.domain, {
    projectId: pid,
    scopeInput: scopeInput.value,
    paymentKeyScope: paykey.scope,
    tempScope: tempScope.value,
    tempInstanceName: tempInstanceName.value,
    isKeyProject: !!p && isKeyProject(p, pmisMap.value[pid]),
  })
})

/** 归入后内容落在目标页的哪一列。抽屉里明说，省得超管到了页面还要自己找。 */
const targetField = computed(() =>
  handleForm.value.domain ? HANDLE_FIELDS[handleForm.value.domain].label : '')

async function openHandle(item: LanxinInboxItem) {
  if (!canHandle(item)) return
  handleItem.value = item
  // H5 反馈自带项目号(project 侧,item.projectId)时优先预选它——结构化信息就不该
  // 再丢回给人工判断；缺失(老回调条目/H5 的 timesheet 侧)则维持原有候选项目预填。
  handleForm.value = { domain: '', instanceId: '', projectId: item.projectId || (item.candidateProjects[0] ?? ''), riskCode: '' }
  handleOpen.value = true
  // 提前把临时跟进实例列表拉起来:域下拉切到 temp 时不必再等一轮网络往返才看到实例选项。
  // 复用既有 store,不是本组件自己再起一份请求逻辑(V4.0.2 多实例化后实例列表的唯一来源)。
  // 回款重点跟进的 scope 与标签同理 —— 可见性判定要用它们,没加载出来会把
  // 「范围其实配了」误判成「尚未设置范围」。三个都静默失败:加载不上不该卡住归入。
  await Promise.all([
    tempFollowup.loaded ? null : tempFollowup.load().catch(() => {}),
    paykey.loaded ? null : paykey.load().catch(() => {}),
    projectTags.loaded ? null : projectTags.load().catch(() => {}),
  ])
}

async function confirmHandle() {
  const item = handleItem.value
  if (!item) return
  const domain = handleForm.value.domain
  if (!domain) { ElMessage.warning('请先选择归入目标域'); return }
  if (!handleForm.value.projectId) { ElMessage.warning('请先选择项目'); return }
  if (needsInstance(domain) && !handleForm.value.instanceId) { ElMessage.warning('临时跟进须再选一个实例'); return }
  if (needsRiskCode(domain)) {
    if (riskEmpty.value) {
      ElMessage.warning(riskCodeless.value
        ? '该项目风险记录均未填风险编码，无法归入风险跟进（风险编码为空）'
        : '该项目无风险记录，无法归入风险跟进')
      return
    }
    if (!handleForm.value.riskCode) { ElMessage.warning('风险跟进须再选一条风险记录'); return }
  }
  // 【V4.5.10】目标页渲染不出这一行时二次确认，不再默默写进去让它蒸发。
  // 这里【不做硬拦截】—— 与 risk 无编码那种"写进去永远读不到"不同，范围/重点项目
  // 判定是会变的：超管完全可能打算先归入、再去把范围调过来。硬拦会把这条路堵死，
  // 所以只要把后果说清楚并要他确认。
  if (!visibility.value.visible) {
    try {
      await ElMessageBox.confirm(visibility.value.reason, '目标页当前看不到这条内容',
        { type: 'warning', confirmButtonText: '仍然归入', cancelButtonText: '返回修改' })
    } catch { return }
  }
  busy.value = true
  try {
    await handleLanxinInboxItem(item.id, domain, handleForm.value.projectId,
      needsInstance(domain) ? handleForm.value.instanceId : undefined,
      needsRiskCode(domain) ? handleForm.value.riskCode : undefined)
    ElMessage.success('已归入')
    handleOpen.value = false
    await load()
  } catch (e) {
    ElMessage.error('归入失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

/** 【V4.5.10】撤销归入。归入原本是一次性的:选错域/项目/实例后按钮就转灰，
 *  唯一出路是把整条回复删掉、连员工原话一起丢。
 *  【只解除标记，不删已写进跟进域的正文】—— 那段正文是追加进富文本字段的，
 *  可能已被人工续写，按内容反删不可靠，失手就是删掉别人手写的跟进。
 *  所以必须把旧去向明明白白告诉超管，让他自己决定要不要去清。 */
async function onUnhandle(item: LanxinInboxItem) {
  const info = (item.handledInfo ?? {}) as Record<string, unknown>
  const where = `${info.label ?? '-'} · 项目 ${info.projectId ?? '-'}`
  try {
    await ElMessageBox.confirm(
      `将解除本条的「已归入」标记，使其可以重新归入。\n\n`
      + `注意：此前已写入【${where}】的内容【不会】被自动删除，`
      + `如需清理请到该页自行编辑。`,
      '确认撤销归入', { type: 'warning', confirmButtonText: '撤销归入' })
  } catch {
    return
  }
  busy.value = true
  try {
    await unhandleLanxinInboxItem(item.id)
    ElMessage.success('已撤销归入，可重新归入')
    await load()
  } catch (e) {
    ElMessage.error('撤销失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

async function onDelete(item: LanxinInboxItem) {
  try {
    await ElMessageBox.confirm('确定删除这条蓝信回复？删除后不可恢复。', '确认删除', { type: 'warning' })
  } catch {
    return
  }
  busy.value = true
  try {
    await deleteLanxinInboxItem(item.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

onMounted(() => { if (!data.data) data.load(); load() })

// 测试需要绕过 el-select 的真实 popper 交互,直接摆状态调用这两个方法(参照
// YitianRulesCard.test.ts 对 draft/onSave/applyImport 的既有做法)。
defineExpose({ items, rejected, received, handleOpen, handleItem, handleForm,
               riskOptions, riskEmpty, riskCodeless, onScopeChange, openHandle, confirmHandle,
               visibility, targetField, onUnhandle, projectCells })
</script>

<template>
  <div class="dv-card" data-test="li-card">
    <div class="dv-card-head">蓝信回复</div>

    <div class="dv-row dv-hint">
      共 <span class="u-num">{{ received }}</span> 条回复
      <template v-if="rejected.count > 0">
        · 验签被拒 <span class="dv-hint warn u-num">{{ rejected.count }}</span> 次(最近 {{ rejected.lastAt }})
      </template>
    </div>

    <el-table :data="items" v-loading="busy" size="small" border stripe data-test="li-table">
      <el-table-column prop="receivedAt" label="接收时间" width="160" class-name="u-num" />
      <el-table-column label="姓名" width="140">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <span>{{ row.name ?? '未知' }}</span>
          <div v-if="!row.name" class="li-staffid dv-hint u-num">{{ row.staffId }}</div>
        </template>
      </el-table-column>
      <el-table-column label="工号" width="100" class-name="u-num">
        <template #default="{ row }: { row: LanxinInboxItem }">{{ row.employId ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="来源" width="140">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <div :data-test="`lx-item-channel-${row.id}`">{{ channelLabel(row) }}</div>
          <!-- H5 反馈 vs 蓝信文本回复:超管要能一眼区分哪条自带项目号、可直接归入 -->
          <div class="dv-hint" :data-test="`lx-item-source-${row.id}`">{{ sourceLabel(row) }}</div>
          <!-- H5 工时反馈自带问题码(8 类之一):同一员工对不同问题码的反馈原本长得
               一模一样,超管看不出针对哪一类——显示中文标签让它们可区分。
               项目侧反馈/蓝信文本回复没有这个字段,不渲染此行。 -->
          <div v-if="row.issueCode" class="dv-hint" :data-test="`lx-item-issue-${row.id}`">
            {{ issueLabel(row.issueCode) }}
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="200">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <span class="dv-badge" :class="row.status === 'parsed' ? 'ok' : 'warn'">
            {{ row.status === 'parsed' ? '已解析' : '未解析' }}
          </span>
          <!-- 不静默隐藏:未解析原因必须显式展示,是排查蓝信真实回调报文的唯一线索 -->
          <div v-if="row.status === 'unparsed'" class="li-reason dv-hint warn">{{ row.unparsedReason }}</div>
        </template>
      </el-table-column>
      <!-- 涉及项目:此前整张表没有任何项目信息,超管看不出一条回复说的是哪个项目 -->
      <el-table-column label="涉及项目" width="220">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <div v-for="(c, i) in projectCells(row)" :key="i" :data-test="`lx-item-proj-${row.id}`">
            <span>{{ c.text }}</span>
            <span v-if="c.guess" class="dv-hint"> （推测）</span>
          </div>
          <span v-if="!projectCells(row).length" class="dv-hint">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="text" label="回复内容" min-width="200" show-overflow-tooltip />
      <el-table-column label="归入去向" width="200">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <span v-if="row.handled">
            {{ row.handledInfo?.label }} · {{ row.handledInfo?.projectId }}
            <template v-if="row.handledInfo?.riskCode">· {{ row.handledInfo.riskCode }}</template>
          </span>
          <span v-else class="dv-hint">未归入</span>
          <!-- 撤销【不删】已写入的正文,所以旧去向必须留在界面上:不然超管不知道
               上次写到哪儿了,那段残留内容就再也没人去清。 -->
          <div v-if="!row.handled && row.unhandledFrom" class="li-reason dv-hint warn"
            :data-test="`lx-item-unhandled-${row.id}`">
            曾归入 {{ (row.unhandledFrom.info as Record<string, unknown> | null)?.label ?? '-' }} ·
            {{ (row.unhandledFrom.info as Record<string, unknown> | null)?.projectId ?? '-' }}
            （已撤销，该处内容未自动删除）
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <button class="dv-btn" data-test="li-handle-btn" :disabled="!canHandle(row)"
            @click="openHandle(row)">归入</button>
          <button v-if="row.handled" class="dv-btn" data-test="li-unhandle-btn" :disabled="busy"
            @click="onUnhandle(row)">撤销归入</button>
          <button class="dv-btn danger" data-test="li-delete-btn" @click="onDelete(row)">删除</button>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="handleOpen" title="归入蓝信回复" size="420px">
      <div v-if="handleItem" class="li-handle-form">
        <div class="dv-row">
          <span class="dv-label">回复内容</span>
          <span class="li-text-prev">{{ handleItem.text }}</span>
        </div>
        <div class="dv-row">
          <span class="dv-label">归入目标域</span>
          <el-select v-model="handleForm.domain" data-test="li-domain-select"
            placeholder="选择归入目标域" style="width: 220px" @change="onScopeChange">
            <el-option v-for="d in HANDLE_DOMAINS" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </div>
        <div v-if="needsInstance(handleForm.domain)" class="dv-row">
          <span class="dv-label">实例</span>
          <el-select v-model="handleForm.instanceId" data-test="li-instance-select"
            placeholder="选择临时跟进实例" style="width: 220px">
            <el-option v-for="inst in tempFollowup.instances" :key="inst.id" :label="inst.name" :value="inst.id" />
          </el-select>
        </div>
        <div class="dv-row">
          <span class="dv-label">项目</span>
          <el-select v-model="handleForm.projectId" data-test="li-project-select"
            filterable placeholder="选择项目" style="width: 280px" @change="onScopeChange">
            <el-option-group v-if="handleItem.candidateProjects.length" label="推测候选(可改)">
              <el-option v-for="pid in handleItem.candidateProjects" :key="`c-${pid}`"
                :value="pid" :label="projectLabel(pid)" />
            </el-option-group>
            <el-option-group label="全部项目">
              <el-option v-for="p in projects" :key="p.projectId" :value="p.projectId"
                :label="projectLabel(p.projectId)" />
            </el-option-group>
          </el-select>
        </div>
        <!-- 风险跟进按「项目号::风险编码」复合键存储（四域里唯一），故须再选一条风险记录 -->
        <div v-if="needsRiskCode(handleForm.domain)" class="dv-row">
          <span class="dv-label">风险记录</span>
          <el-select v-if="!riskEmpty" v-model="handleForm.riskCode" data-test="li-risk-select"
            filterable placeholder="选择风险记录" style="width: 280px">
            <el-option v-for="r in riskOptions" :key="r.code" :label="r.label" :value="r.code" />
          </el-select>
          <span v-else class="dv-hint warn" data-test="li-risk-empty">
            {{ riskCodeless
                ? '该项目风险记录均未填风险编码，无法归入风险跟进（风险编码为空）。请改选其它项目或其它目标域。'
                : '该项目无风险记录，无法归入风险跟进。请改选其它项目或其它目标域。' }}
          </span>
        </div>

        <!-- 内容会落到哪一页哪一列,直接写出来 —— 归入完就该知道去哪儿看 -->
        <div v-if="handleForm.domain" class="dv-row dv-hint" data-test="li-target-hint">
          将追加到「{{ HANDLE_FIELDS[handleForm.domain as HandleDomain].label }}」列
        </div>
        <!-- 【V4.5.10】目标页渲染不出这一行时的显式告警。此前这里什么都不说,
             写进去的内容在目标页永远看不到,而条目已标 handled、按钮转灰。 -->
        <div v-if="!visibility.visible" class="dv-row dv-hint warn" data-test="li-invisible-warn">
          {{ visibility.reason }}
        </div>
        <div class="dv-row dv-hint">
          候选项目按「最近推给此人的蓝信卡片涉及哪些项目」推测得出，仅供参考，可改选任意项目。
        </div>
        <div class="dv-row dv-actions">
          <button class="dv-btn primary" data-test="li-confirm-handle" :disabled="busy" @click="confirmHandle">确认归入</button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

.li-staffid { font-size: var(--fs-1); }
.li-reason { font-size: var(--fs-1); margin-top: var(--sp-1); }
.li-text-prev { color: var(--txt); white-space: pre-wrap; word-break: break-all; }
.li-handle-form { display: flex; flex-direction: column; gap: var(--gap-stack); padding: 0 var(--sp-2); }
.dv-btn + .dv-btn { margin-left: var(--sp-2); }
</style>
