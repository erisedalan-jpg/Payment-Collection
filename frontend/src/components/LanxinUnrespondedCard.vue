<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import StatusBadge from '@/components/StatusBadge.vue'
import { getLanxinUnresponded, type UnrespondedRow } from '@/lib/lanxinApi'

const ROUTE_LABELS: Record<string, string> = { project: '项目关注', timesheet: '工时填报' }
function routeLabel(key: string): string { return ROUTE_LABELS[key] ?? key }

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

const displayRows = computed(() =>
  filterMode.value === 'pending' ? rows.value.filter((r) => r.overdue && !r.responded) : rows.value)

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

    <el-table :data="displayRows" v-loading="busy" size="small" border stripe data-test="lu-table">
      <el-table-column prop="sentAt" label="推送时间" width="160" class-name="u-num" />
      <el-table-column prop="employId" label="工号" width="100" class-name="u-num" />
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column label="推送类型" width="110">
        <template #default="{ row }: { row: UnrespondedRow }">{{ routeLabel(row.routeKey) }}</template>
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
