<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import type { Project, ProjectPmis } from '@/types/analysis'
import { getLanxinInbox, handleLanxinInboxItem, deleteLanxinInboxItem } from '@/lib/lanxinApi'
import { HANDLE_DOMAINS, needsInstance, needsRiskCode, riskChoices, canHandle,
         type HandleDomain, type LanxinInboxItem } from '@/lib/lanxinInbox'

const data = useDataStore()
const tempFollowup = useTempFollowupStore()

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

/** 来源展示：三种事件类型对应私聊/群聊(+群名)/应用号；未知类型(理论上必是未解析)原样显示。 */
function sourceLabel(item: LanxinInboxItem): string {
  if (item.eventType === 'bot_group_message') return item.groupName ? `群聊 · ${item.groupName}` : '群聊'
  if (item.eventType === 'bot_private_message') return '私聊'
  if (item.eventType === 'account_message') return '应用号'
  return item.eventType || '-'
}

function projectLabel(pid: string): string {
  const p = projects.value.find((x) => x.projectId === pid)
  return p?.projectName ? `${pid} ${p.projectName}` : pid
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

/** 换项目/换域后旧的风险编码必然失效（它属于上一个项目），一律清掉重选。 */
function onScopeChange() {
  handleForm.value.riskCode = ''
}

async function openHandle(item: LanxinInboxItem) {
  if (!canHandle(item)) return
  handleItem.value = item
  handleForm.value = { domain: '', instanceId: '', projectId: item.candidateProjects[0] ?? '', riskCode: '' }
  handleOpen.value = true
  // 提前把临时跟进实例列表拉起来:域下拉切到 temp 时不必再等一轮网络往返才看到实例选项。
  // 复用既有 store,不是本组件自己再起一份请求逻辑(V4.0.2 多实例化后实例列表的唯一来源)。
  if (!tempFollowup.loaded) {
    try { await tempFollowup.load() } catch { /* 静默:实例列表加载失败不阻塞归入其它域 */ }
  }
}

async function confirmHandle() {
  const item = handleItem.value
  if (!item) return
  const domain = handleForm.value.domain
  if (!domain) { ElMessage.warning('请先选择归入目标域'); return }
  if (!handleForm.value.projectId) { ElMessage.warning('请先选择项目'); return }
  if (needsInstance(domain) && !handleForm.value.instanceId) { ElMessage.warning('临时跟进须再选一个实例'); return }
  if (needsRiskCode(domain)) {
    if (riskEmpty.value) { ElMessage.warning('该项目无风险记录，无法归入风险跟进'); return }
    if (!handleForm.value.riskCode) { ElMessage.warning('风险跟进须再选一条风险记录'); return }
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
               riskOptions, riskEmpty, onScopeChange, openHandle, confirmHandle })
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
        <template #default="{ row }: { row: LanxinInboxItem }">{{ sourceLabel(row) }}</template>
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
      <el-table-column prop="text" label="回复内容" min-width="200" show-overflow-tooltip />
      <el-table-column label="归入去向" width="200">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <span v-if="row.handled">
            {{ row.handledInfo?.label }} · {{ row.handledInfo?.projectId }}
            <template v-if="row.handledInfo?.riskCode">· {{ row.handledInfo.riskCode }}</template>
          </span>
          <span v-else class="dv-hint">未归入</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <button class="dv-btn" data-test="li-handle-btn" :disabled="!canHandle(row)"
            @click="openHandle(row)">归入</button>
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
            该项目无风险记录，无法归入风险跟进。请改选其它项目或其它目标域。
          </span>
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
