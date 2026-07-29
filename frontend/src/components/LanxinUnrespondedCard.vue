<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import StatusBadge from '@/components/StatusBadge.vue'
import { getLanxinUnresponded, type UnrespondedRow } from '@/lib/lanxinApi'

const ROUTE_LABELS: Record<string, string> = { project: '项目关注', timesheet: '工时填报' }
function routeLabel(key: string): string { return ROUTE_LABELS[key] ?? key }

// 角色列。'' 是 V4.5.8 之前的老台账(那时候台账不记 role)，如实显示「未记录」而不是
// 编一个——超管需要知道这行的角色是查不出来的，而不是被告知它是本人卡。
const ROLE_LABELS: Record<string, string> = {
  primary: '本人（明细卡）', supervisor: '上级（汇总卡）', '': '未记录',
}
function roleLabel(role: string): string { return ROLE_LABELS[role] ?? role }

/** 状态三态(淡底+深字):未响应=该催(danger)/已响应(ok)/未到期=尚未到判定时点、不是异常(warn)。 */
function statusOf(row: UnrespondedRow): { label: string; tone: 'ok' | 'warn' | 'danger' } {
  if (row.responded) return { label: '已响应', tone: 'ok' }
  if (row.overdue) return { label: '未响应', tone: 'danger' }
  return { label: '未到期', tone: 'warn' }
}

const rows = ref<UnrespondedRow[]>([])
const deadlineHours = ref(0)
const busy = ref(false)

// 默认「仅未响应」——这张表的用途是「谁该催」,默认就该是待办视图;切到「全部」查看完整台账。
const filterMode = ref<'pending' | 'all'>('pending')

// 【承重】待催视图必须排除上级汇总卡的收件人:汇总卡上【没有】动作要求、没有任何
// N 小时反馈承诺(build_summary_card 零改动,已核实),上级压根没被要求反馈。不排除的话
// 超管上线第一天打开这张表,看到的一部分是上级,去催得到的回答是「我这张卡没让我反馈」。
//
// 【向后兼容】只排除明确标了 'supervisor' 的行。V4.5.8 之前的台账没有 role 字段 →
// 后端退化成空串 → 这里【不排除、不丢行】,老数据的显示行为一字不变。
const displayRows = computed(() =>
  filterMode.value === 'pending'
    ? rows.value.filter((r) => r.overdue && !r.responded && r.role !== 'supervisor')
    : rows.value)

async function load() {
  busy.value = true
  try {
    const res = await getLanxinUnresponded()
    rows.value = res.rows ?? []
    deadlineHours.value = res.deadlineHours   // 后端下发的时限,不自带默认值
  } catch (e) {
    ElMessage.error('加载失败：' + (e instanceof Error ? e.message : String(e)))
  } finally {
    busy.value = false
  }
}

onMounted(load)

defineExpose({ rows, deadlineHours, filterMode, displayRows })
</script>

<template>
  <div class="dv-card" data-test="lu-card">
    <div class="dv-card-head">未响应清单</div>

    <div class="dv-row dv-hint">
      已推送但超过 <span class="u-num">{{ deadlineHours }}</span> 小时未收到任何回复的记录。
      判定为【人级】：该员工在推送后回复过任意消息即计为已响应（一期回流仅文本回复，回复正文不含项目信息）。
    </div>

    <div class="dv-row">
      <span class="dv-label">范围</span>
      <el-radio-group v-model="filterMode" size="small" data-test="lu-filter-mode">
        <el-radio-button value="pending">仅未响应</el-radio-button>
        <el-radio-button value="all">全部</el-radio-button>
      </el-radio-group>
      <span class="dv-hint">默认只列已超时且未响应的记录（谁该催）；切到「全部」查看完整台账</span>
    </div>
    <div class="dv-row dv-hint" data-test="lu-role-note">
      「仅未响应」不含角色为<b>上级（汇总卡）</b>的记录：汇总卡只做知会，卡上没有反馈时限要求，
      催了对方也无从反馈。需要核对完整推送台账时切到「全部」。
    </div>

    <el-table :data="displayRows" v-loading="busy" size="small" border stripe data-test="lu-table">
      <el-table-column prop="sentAt" label="推送时间" width="160" class-name="u-num" />
      <el-table-column prop="employId" label="工号" width="100" class-name="u-num" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column label="推送类型" width="110">
        <template #default="{ row }: { row: UnrespondedRow }">{{ routeLabel(row.routeKey) }}</template>
      </el-table-column>
      <el-table-column label="角色" width="130">
        <template #default="{ row }: { row: UnrespondedRow }">
          <span data-test="lu-role">{{ roleLabel(row.role) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="涉及项目数" width="100" class-name="u-num">
        <template #default="{ row }: { row: UnrespondedRow }">
          <span data-test="lu-projcount">{{ row.projectCount }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="dueAt" label="应反馈截止" width="160" class-name="u-num" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }: { row: UnrespondedRow }">
          <StatusBadge :label="statusOf(row).label" :tone="statusOf(row).tone" data-test="lu-status" />
        </template>
      </el-table-column>
      <el-table-column label="首次响应时间" width="160" class-name="u-num">
        <template #default="{ row }: { row: UnrespondedRow }">{{ row.firstResponseAt || '-' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';
</style>
