import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { router } from './index'
import { useAuthStore } from '@/stores/auth'

beforeEach(async () => {
  setActivePinia(createPinia())
  await router.replace('/login')
  await router.isReady()
})

function setUser(u: any) {
  const a = useAuthStore()
  a.user = u
  vi.spyOn(a, 'ensureReady').mockResolvedValue()
}

describe('router 守卫', () => {
  it('未登录访问受控页→重定向 /login', async () => {
    setUser(null)
    await router.push('/projects')
    expect(router.currentRoute.value.path).toBe('/login')
  })
  it('登录超管访问任意页→放行', async () => {
    setUser({ account: 'a', displayName: 'a', isSuper: true, allowedPages: [], allowedL4: [] })
    await router.push('/data')
    expect(router.currentRoute.value.path).toBe('/data')
  })
  it('普通用户访问无权页→重定向首个可访问页', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [] })
    await router.push('/projects')
    expect(router.currentRoute.value.path).toBe('/data')
  })
  it('普通用户访问有权页→放行', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [] })
    await router.push('/data')
    expect(router.currentRoute.value.path).toBe('/data')
  })
  it('/login 始终放行', async () => {
    setUser(null)
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('requiresSuper 路由:超管放行', async () => {
    setUser({ account: 'a', displayName: 'a', isSuper: true, allowedPages: [], allowedL4: [] })
    await router.push('/admin')
    expect(router.currentRoute.value.path).toBe('/admin')
  })

  it('requiresSuper 路由:普通用户重定向到 firstAllowedPath', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['projects'], allowedL4: [] })
    await router.push('/admin')
    expect(router.currentRoute.value.path).not.toBe('/admin')
    expect(router.currentRoute.value.path).toBe('/projects')
  })

  it('未改密用户访问受控页→重定向 /change-password', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['projects'], allowedL4: [], mustChangePassword: true })
    await router.push('/projects')
    expect(router.currentRoute.value.path).toBe('/change-password')
  })
  it('未改密用户访问 /change-password 自身→放行', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['projects'], allowedL4: [], mustChangePassword: true })
    await router.push('/change-password')
    expect(router.currentRoute.value.path).toBe('/change-password')
  })
  it('已改密用户不被改密页拦截', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['projects'], allowedL4: [], mustChangePassword: false })
    await router.push('/projects')
    expect(router.currentRoute.value.path).toBe('/projects')
  })
})
