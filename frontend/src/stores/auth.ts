import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authenticate, fetchMe as apiFetchMe, logoutApi, changePassword as apiChangePassword, type AuthUser, type AuthResult } from '@/lib/auth'
import { canAccess as pageCanAccess, type PageKey } from '@/lib/pageAccess'
import { PROJECT_LINKS, ANALYSIS_LINKS, KEY_FOLLOWUP_LINKS, PAYMENT_LINKS, YITIAN_LINKS, TOOL_LINKS } from '@/nav'
import { useDataStore } from './data'
import { useProjectProgressStore } from './projectProgress'
import { useOpportunitiesStore } from './opportunities'
import { useTempFollowupStore } from './tempFollowup'
import { useOpportunityFollowupStore } from './opportunityFollowup'
import { useRiskFollowupStore } from './riskFollowup'
import { usePaymentKeyFollowupStore } from './paymentKeyFollowup'
import { usePortalStore } from './portal'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isLoggedIn = computed(() => user.value !== null)
  const isSuper = computed(() => user.value?.isSuper === true)
  const mustChangePassword = computed(() => user.value?.mustChangePassword === true)

  async function login(account: string, password: string): Promise<AuthResult> {
    const res = await authenticate(account, password)
    if (res.ok && res.user) {
      user.value = res.user
      useDataStore().reset()  // 新身份:丢弃上一个用户的内存业务数据,强制下个页面按新会话重拉(后端按 L4 切数据)
      useProjectProgressStore().reset()
      useOpportunitiesStore().reset()
      useTempFollowupStore().reset()
      useOpportunityFollowupStore().reset()
      useRiskFollowupStore().reset()
      usePaymentKeyFollowupStore().reset()
      usePortalStore().reset()
      useYitianStore().reset()
      useYitianViewStore().reset()
    }
    return res
  }
  async function fetchMe(): Promise<void> {
    user.value = await apiFetchMe()
  }
  async function logout(): Promise<void> {
    await logoutApi()
    user.value = null
    useDataStore().reset()  // 登出即清业务数据,杜绝下个低权限账号复用全量缓存
    useProjectProgressStore().reset()
    useOpportunitiesStore().reset()
    useTempFollowupStore().reset()
    useOpportunityFollowupStore().reset()
    useRiskFollowupStore().reset()
    usePaymentKeyFollowupStore().reset()
    usePortalStore().reset()
    useYitianStore().reset()
    useYitianViewStore().reset()
  }
  async function changePassword(oldPassword: string, newPassword: string): Promise<AuthResult> {
    const res = await apiChangePassword(oldPassword, newPassword)
    if (res.ok && res.user) user.value = res.user
    return res
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
    const all = [...PROJECT_LINKS, ...ANALYSIS_LINKS, ...KEY_FOLLOWUP_LINKS, ...PAYMENT_LINKS, ...YITIAN_LINKS, ...TOOL_LINKS]
    const hit = all.find((l) => canAccess(l.key))
    return hit ? hit.to : '/login'
  }
  return { user, isLoggedIn, isSuper, mustChangePassword, login, fetchMe, logout, changePassword, ensureReady, canAccess, firstAllowedPath }
})
