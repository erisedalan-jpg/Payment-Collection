<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ISSUE_LABELS } from '@/lib/yitian/compliance'
import { ALL_RISK_CATEGORIES } from '@/lib/riskReasons'
import { getLanxinConfig, saveLanxinConfig, lanxinSelftest,
         type LanxinConfig } from '@/lib/lanxinApi'

const emit = defineEmits<{ (e: 'open-push'): void }>()

const cfg = ref<LanxinConfig | null>(null)
const busy = ref(false)
const newSecret = ref('')
const selftestEmp = ref('')
const selftestSteps = ref<{ name: string; ok: boolean; msg: string }[]>([])

// 全量选项源:必须是全集,不能拿 v-model 绑的子集当选项 —— 否则取消勾选后选项消失、再也勾不回来。
const ALL_ISSUE_CODES = Object.keys(ISSUE_LABELS)
const issueLabel = (c: string) => ISSUE_LABELS[c] ?? c
// 关注原因全集从 riskReasons.ts 引入(那里带编译期穷尽护栏),不在此另抄一份。
const ALL_REASONS = ALL_RISK_CATEGORIES

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
      <div v-for="r in cfg.routes" :key="r.key" class="dv-row lx-route">
        <span class="dv-label">{{ r.label }}</span>
        <el-switch v-model="r.enabled" />
        <el-checkbox v-model="r.recipients.primary">
          {{ r.key === 'timesheet' ? '发给填报人本人' : '发给项目经理' }}
        </el-checkbox>
        <el-select v-model="r.recipients.supervisorLevels" size="small" style="width: 220px">
          <el-option v-for="o in LEVEL_OPTS" :key="o.v" :value="o.v" :label="o.t" />
        </el-select>
        <el-checkbox-group v-if="r.key === 'timesheet'" v-model="r.issueCodes" class="lx-opts">
          <el-checkbox v-for="c in ALL_ISSUE_CODES" :key="c" :value="c" :label="c">{{ issueLabel(c) }}</el-checkbox>
        </el-checkbox-group>
        <el-checkbox-group v-else v-model="r.reasons" class="lx-opts">
          <el-checkbox v-for="c in ALL_REASONS" :key="c" :value="c" :label="c">{{ c }}</el-checkbox>
        </el-checkbox-group>
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

/* 本卡特有:路由行与自检步骤 */
.lx-route { gap: var(--sp-2); align-items: flex-start; }
.lx-opts { display: flex; flex-wrap: wrap; gap: 0 var(--sp-2); max-width: 420px; }
.lx-steps { flex-direction: column; align-items: stretch; gap: var(--sp-2); }
.lx-step { display: flex; align-items: center; gap: var(--sp-2); }
.lx-step-name { font-size: var(--fs-1); color: var(--txt); font-weight: 600; }
</style>
