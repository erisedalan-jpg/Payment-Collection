<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const submitting = ref(false)
const router = useRouter()
const auth = useAuthStore()

async function onSubmit() {
  error.value = ''
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) { error.value = '请填写所有字段'; return }
  if (newPassword.value !== confirmPassword.value) { error.value = '两次输入的新密码不一致'; return }
  if (newPassword.value === oldPassword.value) { error.value = '新密码不能与原密码相同'; return }
  submitting.value = true
  const res = await auth.changePassword(oldPassword.value, newPassword.value)
  submitting.value = false
  if (res.ok) { router.push(auth.firstAllowedPath()) }
  else { error.value = res.message || '修改失败' }
}
</script>

<template>
  <div class="cpw">
    <form class="cpw-form" @submit.prevent="onSubmit">
      <h1 class="cpw-title">修改密码</h1>
      <p class="cpw-sub">首次登录请设置新密码</p>
      <label class="cpw-field">
        <span class="cpw-label">原密码</span>
        <input class="cpw-input" data-test="cpw-old" v-model="oldPassword" type="password"
               autocomplete="current-password" placeholder="请输入原密码" />
      </label>
      <label class="cpw-field">
        <span class="cpw-label">新密码</span>
        <input class="cpw-input" data-test="cpw-new" v-model="newPassword" type="password"
               autocomplete="new-password" placeholder="请输入新密码" />
      </label>
      <label class="cpw-field">
        <span class="cpw-label">确认新密码</span>
        <input class="cpw-input" data-test="cpw-confirm" v-model="confirmPassword" type="password"
               autocomplete="new-password" placeholder="请再次输入新密码" />
      </label>
      <p v-if="error" class="cpw-error" data-test="cpw-error">{{ error }}</p>
      <button class="cpw-submit" type="submit" :disabled="submitting">确认修改</button>
    </form>
  </div>
</template>

<style scoped>
.cpw { display: grid; place-items: center; min-height: 100vh; background: var(--bg); padding: var(--sp-6); }
.cpw-form { width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-1); padding: var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-3); }
.cpw-title { font-size: var(--fs-5); font-weight: 700; color: var(--txt); margin: 0; }
.cpw-sub { font-size: var(--fs-1); color: var(--mut); margin: 0 0 var(--sp-2); }
.cpw-field { display: flex; flex-direction: column; gap: var(--sp-1); }
.cpw-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.cpw-input { width: 100%; box-sizing: border-box; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--txt); font-size: var(--fs-2); font-family: var(--font-sans); transition: border-color var(--dur-1) var(--ease); }
.cpw-input:focus { outline: none; border-color: var(--accent); }
.cpw-error { margin: 0; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-sm); background: var(--danger-bg); color: var(--danger-text); font-size: var(--fs-1); }
.cpw-submit { width: 100%; box-sizing: border-box; height: 40px; border: none; border-radius: var(--r-sm); background: var(--accent); color: var(--on-accent); cursor: pointer; font-size: var(--fs-2); font-weight: 600; }
.cpw-submit:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .cpw-input { transition: none !important; } }
</style>
