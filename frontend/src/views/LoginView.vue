<script setup lang="ts">
import { ref } from 'vue'
import LoginCharacters from '@/components/LoginCharacters.vue'
import { authenticate } from '@/lib/auth'

type Mood = 'idle' | 'account' | 'password' | 'reveal' | 'fail'
const account = ref('')
const password = ref('')
const showPassword = ref(false)
const mood = ref<Mood>('idle')
const error = ref('')

function onAccountFocus() { mood.value = 'account' }
function onPasswordFocus() { mood.value = showPassword.value ? 'reveal' : 'password' }
function onBlur() { if (mood.value !== 'fail') mood.value = 'idle' }
function toggleShow() {
  showPassword.value = !showPassword.value
  if (mood.value === 'password' || mood.value === 'reveal') {
    mood.value = showPassword.value ? 'reveal' : 'password'
  }
}
async function onSubmit() {
  error.value = ''
  if (!account.value || !password.value) { error.value = '请输入账号和密码'; return }
  const res = await authenticate(account.value, password.value)
  if (!res.ok) { mood.value = 'fail'; error.value = res.message || '登录失败' }
  // SP-1 不跳转/不存登录态;成功分支留 SP-2。
}
</script>

<template>
  <div class="lv">
    <section class="lv-left">
      <LoginCharacters :mood="mood" />
    </section>
    <section class="lv-right">
      <form class="lv-form" @submit.prevent="onSubmit">
        <h1 class="lv-title">项目管理平台</h1>
        <p class="lv-sub">登录以继续</p>
        <label class="lv-field">
          <span class="lv-label">账号</span>
          <input class="lv-input" v-model="account" type="text" autocomplete="username"
                 placeholder="请输入账号" @focus="onAccountFocus" @blur="onBlur" />
        </label>
        <label class="lv-field">
          <span class="lv-label">密码</span>
          <span class="lv-pw">
            <input class="lv-input" v-model="password" :type="showPassword ? 'text' : 'password'"
                   autocomplete="current-password" placeholder="请输入密码" @focus="onPasswordFocus" @blur="onBlur" />
            <button class="lv-eye-btn" type="button" @click="toggleShow">{{ showPassword ? '隐藏' : '显示' }}</button>
          </span>
        </label>
        <p v-if="error" class="lv-error" data-test="lv-error">{{ error }}</p>
        <button class="lv-submit" type="submit">
          <span class="lv-submit-text">登 录</span>
          <span class="lv-submit-arrow">→</span>
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.lv { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; background: var(--bg); }
.lv-left { display: flex; align-items: center; justify-content: center; background: var(--card2); padding: var(--sp-6); }
.lv-right { display: flex; align-items: center; justify-content: center; padding: var(--sp-6); }
.lv-form { width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-1); padding: var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-3); }
.lv-title { font-size: var(--fs-5); font-weight: 700; color: var(--txt); margin: 0; }
.lv-sub { font-size: var(--fs-1); color: var(--mut); margin: 0 0 var(--sp-2); }
.lv-field { display: flex; flex-direction: column; gap: var(--sp-1); }
.lv-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.lv-input { width: 100%; box-sizing: border-box; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--txt); font-size: var(--fs-2); font-family: var(--font-sans); transition: border-color var(--dur-1) var(--ease); }
.lv-input:focus { outline: none; border-color: var(--accent); }
.lv-pw { display: flex; align-items: center; gap: var(--sp-2); }
.lv-eye-btn { flex: none; padding: var(--sp-1) var(--sp-2); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.lv-eye-btn:hover { color: var(--accent); }
.lv-error { margin: 0; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-sm); background: var(--danger-bg); color: var(--danger-text); font-size: var(--fs-1); }
.lv-submit { position: relative; overflow: hidden; height: 40px; border: none; border-radius: var(--r-sm); background: var(--accent); color: var(--on-accent); cursor: pointer; font-size: var(--fs-2); font-weight: 600; }
.lv-submit-text { display: inline-block; transition: transform var(--dur-2) var(--ease), opacity var(--dur-2) var(--ease); }
.lv-submit-arrow { position: absolute; inset: 0; display: grid; place-items: center; transform: translateX(120%); transition: transform var(--dur-2) var(--ease); }
.lv-submit:hover .lv-submit-text { transform: translateX(-120%); opacity: 0; }
.lv-submit:hover .lv-submit-arrow { transform: translateX(0); }
@media (max-width: 768px) {
  .lv { grid-template-columns: 1fr; }
  .lv-left { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .lv-submit-text, .lv-submit-arrow, .lv-input { transition: none !important; }
}
</style>
