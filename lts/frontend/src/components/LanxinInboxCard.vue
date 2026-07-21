<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getLanxinInbox, markLanxinInboxHandled, deleteLanxinInboxItem } from '@/lib/lanxinApi'
import { canHandle, type LanxinInboxItem } from '@/lib/lanxinInbox'

const items = ref<LanxinInboxItem[]>([])
const rejected = ref<{ count: number; lastAt: string; lastFrom?: string }>({ count: 0, lastAt: '' })
const received = ref(0)
const busy = ref(false)

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

/** 来源展示：三种事件类型对应私聊/群聊(+群名)/应用号；未知类型原样显示。 */
function sourceLabel(item: LanxinInboxItem): string {
  if (item.eventType === 'bot_group_message') return item.groupName ? `群聊 · ${item.groupName}` : '群聊'
  if (item.eventType === 'bot_private_message') return '私聊'
  if (item.eventType === 'account_message') return '应用号'
  return item.eventType || '-'
}

async function onMark(item: LanxinInboxItem) {
  if (!canHandle(item)) return
  busy.value = true
  try {
    await markLanxinInboxHandled(item.id)
    ElMessage.success('已标记为已处理')
    await load()
  } catch (e) {
    ElMessage.error('标记失败：' + (e instanceof Error ? e.message : String(e)))
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

onMounted(() => { load() })

// 测试直接摆状态调用方法(参照 master InboxCard 的 defineExpose 做法)。
defineExpose({ items, rejected, received, load, onMark, onDelete })
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
      <el-table-column label="处理状态" width="180">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <span v-if="row.handled" class="dv-badge ok">
            已处理<template v-if="row.handledInfo?.at"> · {{ row.handledInfo.at }}</template>
          </span>
          <span v-else class="dv-hint">未处理</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }: { row: LanxinInboxItem }">
          <button class="dv-btn" data-test="li-mark-btn" :disabled="!canHandle(row)"
            @click="onMark(row)">标记已处理</button>
          <button class="dv-btn danger" data-test="li-delete-btn" @click="onDelete(row)">删除</button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

.li-staffid { font-size: var(--fs-1); }
.li-reason { font-size: var(--fs-1); margin-top: var(--sp-1); }
.dv-btn + .dv-btn { margin-left: var(--sp-2); }
</style>
