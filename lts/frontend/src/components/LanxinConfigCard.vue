<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getLanxinConfigFull, saveLanxinConfig, lanxinSelftest,
         type LanxinConfig } from '@/lib/lanxinApi'

const emit = defineEmits<{ (e: 'open-push'): void }>()

const cfg = ref<LanxinConfig | null>(null)
const busy = ref(false)
const newSecret = ref('')
const newCallbackAesKey = ref('')
const newCallbackSignToken = ref('')
// 验签被拒次数——回调端点免登录，验签失败时只记数不落报文体(见 lanxin_callback 设计)。
// 这是超管判断「回调签名令牌是否填对」的唯一线索。数据源是 GET /api/lanxin/config 的
// 顶层 rejected 字段(Task 6 提供);该任务落地前接口不含此字段,load() 里按 0 兜底。
// lastReason(Important-2)区分最近一次是验签失败还是时间戳新鲜度失败——两者共用
// 同一个 count，不分原因超管只看到计数在涨，会去查 signToken/aesKey/nginx，
// 而真正的原因可能是时间戳格式或两端时钟对不上。
const rejected = ref<{ count: number; lastAt: string; lastReason?: string }>(
  { count: 0, lastAt: '', lastReason: '' })
const selftestEmp = ref('')
const selftestSteps = ref<{ name: string; ok: boolean; msg: string }[]>([])

// 系统不知道自己的对外地址；但超管是从浏览器打开这个页面的，他看到的 origin
// 就是蓝信要访问的地址(同一张内网)，故直接用 location.origin 拼。
const callbackUrl = computed(() => `${location.origin}/api/lanxin/callback`)

async function copyCallbackUrl() {
  await navigator.clipboard.writeText(callbackUrl.value)
  ElMessage.success('回调地址已复制')
}

/** code → 展示名。项目关注原因的 code 本身就是中文,直接显示。
 *  items 恒为完整白名单长度(后端 lanxin_config._validate_items 按白名单补齐),不必在前端再拼全集。 */
function codeLabel(code: string): string {
  return code
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
  try {
    // 一次请求拿 config + rejected,不再对同一个端点分别发两次 GET。
    // Task 6 落地前响应不含 rejected 字段,undefined 时按 0 兜底——
    // 缺这个字段是预期状态,不能让整卡因此报错或渲染异常。
    const res = await getLanxinConfigFull()
    cfg.value = res.config
    rejected.value = res.rejected ?? { count: 0, lastAt: '', lastReason: '' }
  } catch { /* 未登录/缺接口静默 */ }
}

async function onSave() {
  if (!cfg.value) return
  busy.value = true
  try {
    const payload: LanxinConfig = JSON.parse(JSON.stringify(cfg.value))
    // 空串 = 不修改密钥(后端沿用旧值);填了才覆盖
    payload.credentials.appSecret = newSecret.value
    payload.credentials.callbackAesKey = newCallbackAesKey.value
    payload.credentials.callbackSignToken = newCallbackSignToken.value
    cfg.value = await saveLanxinConfig(payload)
    newSecret.value = ''
    newCallbackAesKey.value = ''
    newCallbackSignToken.value = ''
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

// 数据源为 GET /api/lanxin/config 的 rejected 字段(Task 6 提供)；测试仍需要能直接注入
// 取值，覆盖「接口暂缺该字段/超管排查凭证时数值恰好如此」等 load() 之外的展示逻辑分支。
defineExpose({ rejected })
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

      <div class="dv-row">
        <span class="dv-label">发送身份</span>
        <el-radio-group v-model="cfg.sendAs" size="small" data-test="lx-send-as">
          <el-radio-button value="account">应用号</el-radio-button>
          <el-radio-button value="bot">智能机器人</el-radio-button>
        </el-radio-group>
        <span class="dv-hint">机器人须由组织管理员额外开通「机器人能力」；应用号无需额外审批</span>
      </div>

      <div class="dv-sub-head">回调（员工回复回流本系统，向蓝信组织管理员申请，与 AppId/AppSecret 是另外两个凭证）</div>
      <div class="dv-row">
        <span class="dv-label">回调密钥</span>
        <el-input v-model="newCallbackAesKey" size="small" type="password" show-password
          style="width: 220px" data-test="lx-callback-aes-key"
          :placeholder="cfg.credentials.hasCallbackAesKey ? '已配置，留空则不修改' : '未配置'" />
        <span class="dv-hint" :class="cfg.credentials.hasCallbackAesKey ? 'ok' : 'warn'">
          {{ cfg.credentials.hasCallbackAesKey ? '已配置' : '未配置' }} · 不回显、不入日志与审计
        </span>
      </div>
      <div class="dv-row">
        <span class="dv-label">回调签名令牌</span>
        <el-input v-model="newCallbackSignToken" size="small" type="password" show-password
          style="width: 220px" data-test="lx-callback-sign-token"
          :placeholder="cfg.credentials.hasCallbackSignToken ? '已配置，留空则不修改' : '未配置'" />
        <span class="dv-hint" :class="cfg.credentials.hasCallbackSignToken ? 'ok' : 'warn'">
          {{ cfg.credentials.hasCallbackSignToken ? '已配置' : '未配置' }} · 不回显、不入日志与审计
        </span>
      </div>
      <div class="dv-row">
        <span class="dv-label">回调地址</span>
        <span class="lx-callback-url" data-test="lx-callback-url">{{ callbackUrl }}</span>
        <button class="dv-btn" data-test="lx-copy-callback" @click="copyCallbackUrl">复制</button>
        <span class="dv-hint">填到开发者中心「回调事件」页的「订阅事件回调地址」</span>
      </div>
      <div v-if="rejected.count > 0" class="dv-row" data-test="lx-rejected">
        <span class="dv-label">已拒绝</span>
        <span class="dv-hint warn" data-test="lx-rejected-reason">
          {{ rejected.count }} 次回调被拒 · 最近 {{ rejected.lastAt }} ——
          {{ rejected.lastReason === 'stale'
              ? '最近一次因时间戳超出有效窗口，多半是时间戳格式或两端时钟对不上，而非签名填错'
              : '最近一次是验签失败，通常意味着回调签名令牌填错了' }}
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
            <tr><th>关注原因</th>
                <th>启用</th><th>发本人</th><th>汇总级别</th></tr>
          </thead>
          <tbody>
            <tr v-for="it in r.items" :key="it.code" data-test="lx-item-row">
              <td class="lx-item-name">{{ codeLabel(it.code) }}</td>
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
.lx-callback-url { padding: var(--sp-1) var(--sp-2); background: var(--hover-tint);
  border-radius: var(--r-sm); color: var(--txt); font-size: var(--fs-1); }
</style>
