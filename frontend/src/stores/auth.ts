import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authenticate, fetchMe as apiFetchMe, logoutApi, type AuthUser, type AuthResult } from '@/lib/auth'
import { canAccess as pageCanAccess, type PageKey } from '@/lib/pageAccess'
import { PROJECT_LINKS, ANALYSIS_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'

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
  let readyPromise: Promise<void> | null = null
  function ensureReady(): Promise<void> {
    if (!readyPromise) readyPromise = fetchMe()
    return readyPromise
  }
  function canAccess(key: PageKey): boolean {
    if (!user.value) return false
    if (user.value.isSuper) return true
    return pageCanAccess(user.value.allowedPages, key)
  }
  function firstAllowedPath(): string {
    if (!user.value) return '/login'
    if (user.value.isSuper) return '/'
    const all = [...PROJECT_LINKS, ...ANALYSIS_LINKS, ...PAYMENT_LINKS, ...TOOL_LINKS]
    const hit = all.find((l) => canAccess(l.key))
    return hit ? hit.to : '/login'
  }
  return { user, isLoggedIn, isSuper, login, fetchMe, logout, ensureReady, canAccess, firstAllowedPath }
})
