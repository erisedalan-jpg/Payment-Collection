<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ISSUE_LABELS } from '@/lib/yitian/compliance'
import { getLanxinConfig, saveLanxinConfig, lanxinSelftest,
         type LanxinConfig } from '@/lib/lanxinApi'

const emit = defineEmits<{ (e: 'open-push'): void }>()

const cfg = ref<LanxinConfig | null>(null)
const busy = ref(false)
const newSecret = ref('')
const selftestEmp = ref('')
const selftestSteps = ref<{ name: string; ok: boolean; msg: string }[]>([])

/** code → 展示名。工时码查 ISSUE_LABELS(同表见 yitian_rules.py);项目关注原因的 code 本身就是中文,直接显示。
 *  items 恒为完整白名单长度(后端 lanxin_config._validate_items 按白名单补齐),不必在前端再拼全集。 */
function codeLabel(routeKey: string, code: string): string {
  return routeKey === 'timesheet' ? (ISSUE_LABELS[code] ?? code) : code
}

// 汇总级别:0=不发;1..5 向上累积。上限 5 —— 预留 5 级架构(推广到整团队后仍够用)。
const LEVEL_OPTS = [
  { v: 0, t: '不发汇总' },
  { v: 1, t: '直接上级（+1）' },
  { v: 2, t: '直接上级 + 隔级（+1、+2）' },
  { v: 3, t: '部门级（+1、+2、+3）' },
  { v: 4, t: '再上一级（+4，预留）' },
  { v: 5, t: '再上两级（+5，预留）' },
]

async function load() {
  try { cfg.value = await getLanxinConfig() } catch { /* 未登录/缺接口静默 */ }
}

async function onSave() {
  if (!cfg.value) return
  busy.value = true
  try {
    const payload: LanxinConfig = JSON.parse(JSON.stringify(cfg.value))
    // 空串 = 不修改密钥(后端沿用旧值);填了才覆盖
    payload.credentials.appSecret = newSecret.value
    cfg.value = await saveLanxinConfig(payload)
    newSecret.value = ''
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败：' + (e instanceof Error ? e.message : String(e)))
  } finally { busy.value = false }
}

async function onSelftest() {
  busy.value = true
  selftestSteps.value = []
  try {
    selftestSteps.value = (await lanxinSelftest(selftestEmp.value.trim())).steps
  } catch (e) {
    selftestSteps.value = [{ name: '自检', ok: false,
                             msg: e instanceof Error ? e.message : String(e) }]
  } finally { busy.value = false }
}

onMounted(load)
</script>

<template>
  <div class="dv-card" data-test="lx-card">
    <div class="dv-card-head">蓝信推送</div>

    <template v-if="cfg">
      <div class="dv-row">
        <span class="dv-label">总开关</span>
        <el-switch v-model="cfg.enabled" />
        <span class="dv-hint">关闭时预览仍可用（可离线看要发给谁），发送被拒绝</span>
      </div>

      <div class="dv-sub-head">凭证（向蓝信组织管理员申请，见 docs/2026-07-17-蓝信开放平台接入申请清单.md）</div>
      <div class="dv-row">
        <span class="dv-label">AppId</span>
        <el-input v-model="cfg.credentials.appId" size="small" style="width: 220px" />
        <span class="dv-label">组织ID</span>
        <el-input v-model="cfg.credentials.orgId" size="small" style="width: 140px" />
      </div>
      <div class="dv-row">
        <span class="dv-label">网关地址</span>
        <el-input v-model="cfg.credentials.apiGateway" size="small" style="width: 320px"
          placeholder="https://apigw-xxx.example.com" />
      </div>
      <div class="dv-row">
        <span class="dv-label">AppSecret</span>
        <el-input v-model="newSecret" size="small" type="password" show-password
          style="width: 220px" :placeholder="cfg.credentials.hasSecret ? '已配置，留空则不修改' : '未配置'" />
        <span class="dv-hint" :class="cfg.credentials.hasSecret ? 'ok' : 'warn'">
          {{ cfg.credentials.hasSecret ? '已配置' : '未配置' }} · 密钥不回显、不入日志与审计
        </span>
      </div>

      <div class="dv-sub-head">推送路由</div>
      <div v-for="r in cfg.routes" :key="r.key" class="lx-route">
        <div class="lx-route-head">
          <span class="dv-label">{{ r.label }}</span>
          <el-switch v-model="r.enabled" />
        </div>
        <table class="lx-items">
          <thead>
            <tr><th>{{ r.key === 'timesheet' ? '问题类型' : '关注原因' }}</th>
                <th>启用</th><th>发本人</th><th>汇总级别</th></tr>
          </thead>
          <tbody>
            <tr v-for="it in r.items" :key="it.code" data-test="lx-item-row">
              <td class="lx-item-name">{{ codeLabel(r.key, it.code) }}</td>
              <td><el-checkbox v-model="it.enabled" data-test="lx-item-enabled" /></td>
              <td><el-checkbox v-model="it.primary" :disabled="!it.enabled" data-test="lx-item-primary" /></td>
              <td>
                <el-select v-model="it.supervisorLevels" size="small" style="width: 150px"
                  :disabled="!it.enabled" data-test="lx-item-levels">
                  <el-option v-for="o in LEVEL_OPTS" :key="o.v" :value="o.v" :label="o.t" />
                </el-select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="dv-row dv-actions">
        <button class="dv-btn primary" data-test="lx-save" :disabled="busy" @click="onSave">保存配置</button>
        <span class="dv-label">自检工号</span>
        <el-input v-model="selftestEmp" data-test="lx-selftest-emp" size="small"
          style="width: 130px" placeholder="如 A000701" />
        <button class="dv-btn" data-test="lx-selftest" :disabled="busy" @click="onSelftest">连通性自检</button>
        <button class="dv-btn primary" data-test="lx-open-push" @click="emit('open-push')">预览并推送</button>
        <span class="dv-hint">自检只给该工号本人发一条测试消息，不触碰他人</span>
      </div>

      <div v-if="selftestSteps.length" class="dv-row lx-steps" data-test="lx-selftest-result">
        <div v-for="(s, i) in selftestSteps" :key="i" class="lx-step">
          <span class="dv-badge" :class="s.ok ? 'ok' : 'warn'">{{ s.ok ? '通过' : '失败' }}</span>
          <span class="lx-step-name">{{ s.name }}</span>
          <span class="dv-hint">{{ s.msg }}</span>
        </div>
      </div>
    </template>
    <div v-else class="dv-row dv-hint">配置加载中…</div>
  </div>
</template>

<style scoped>
@import '@/styles/dataview.css';

/* 本卡特有:路由行(逐项表格)与自检步骤 */
.lx-route { display: flex; flex-direction: column; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--line); }
.lx-route-head { display: flex; align-items: center; gap: var(--sp-3); }
.lx-items { width: 100%; border-collapse: collapse; margin-top: var(--sp-2); }
.lx-items th, .lx-items td { padding: var(--sp-1) var(--sp-2); text-align: left; font-size: var(--fs-1); }
.lx-items th { color: var(--mut); font-weight: 600; }
.lx-items tbody tr:hover { background: var(--hover-tint); }
.lx-item-name { color: var(--txt); }
.lx-steps { flex-direction: column; align-items: stretch; gap: var(--sp-2); }
.lx-step { display: flex; align-items: center; gap: var(--sp-2); }
.lx-step-name { font-size: var(--fs-1); color: var(--txt); font-weight: 600; }
</style>
