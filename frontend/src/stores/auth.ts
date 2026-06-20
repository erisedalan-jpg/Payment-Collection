import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authenticate, fetchMe as apiFetchMe, logoutApi, type AuthUser, type AuthResult } from '@/lib/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isLoggedIn = computed(() => user.value !== null)
  const isSuper = computed(() => user.value?.isSuper === true)

  async function login(account: string, password: string): Promise<AuthResult> {
    const res = await authenticate(account, password)
    if (res.ok && res.user) user.value = res.user
    return res
  }
  async function fetchMe(): Promise<void> {
    user.value = await apiFetchMe()
  }
  async function logout(): Promise<void> {
    await logoutApi()
    user.value = null
  }
  return { user, isLoggedIn, isSuper, login, fetchMe, logout }
})
