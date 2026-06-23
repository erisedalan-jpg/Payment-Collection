import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LoginView from './LoginView.vue'
import LoginCharacters from '@/components/LoginCharacters.vue'

const pushSpy = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

const authMock = vi.fn(async (_account: string, _password: string) => ({ ok: false, message: '账号或密码错误' }))
vi.mock('@/lib/auth', () => ({
  authenticate: (a: string, b: string) => authMock(a, b),
  fetchMe: async () => null,
  logoutApi: async () => {},
}))

beforeEach(() => { setActivePinia(createPinia()); pushSpy.mockClear(); authMock.mockClear() })

function mountLV() {
  return mount(LoginView, { global: { stubs: { LoginCharacters: false } } })
}

describe('LoginView', () => {
  it('渲染角色 + 账号/密码输入 + 登录按钮', () => {
    const w = mountLV()
    expect(w.findComponent(LoginCharacters).exists()).toBe(true)
    expect(w.find('input[autocomplete="username"]').exists()).toBe(true)
    expect(w.find('input[autocomplete="current-password"]').exists()).toBe(true)
    expect(w.find('.lv-submit').exists()).toBe(true)
  })
  it('账号聚焦→mood=account;密码聚焦→mood=password', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="username"]').trigger('focus')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('account')
    await w.find('input[autocomplete="current-password"]').trigger('focus')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('password')
  })
  it('显示密码切换:type 变 text + mood=reveal', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="current-password"]').trigger('focus')
    await w.find('.lv-eye-btn').trigger('click')
    expect(w.find('input[autocomplete="current-password"]').attributes('type')).toBe('text')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('reveal')
  })
  it('空表单提交:不调 authenticate,显示校验提示', async () => {
    const w = mountLV()
    await w.find('form').trigger('submit')
    expect(authMock).not.toHaveBeenCalled()
    expect(w.find('[data-test="lv-error"]').text()).toContain('请输入账号和密码')
  })
  it('非空提交失败:mood=fail+显示 message,不跳转', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="username"]').setValue('admin')
    await w.find('input[autocomplete="current-password"]').setValue('bad')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(authMock).toHaveBeenCalledWith('admin', 'bad')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('fail')
    expect(w.find('[data-test="lv-error"]').text()).toContain('账号或密码错误')
    expect(pushSpy).not.toHaveBeenCalled()
  })
  it('非空提交成功:跳转 /', async () => {
    authMock.mockResolvedValueOnce({ ok: true, user: { account: 'admin', displayName: 'x', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] } } as any)
    const w = mountLV()
    await w.find('input[autocomplete="username"]').setValue('admin')
    await w.find('input[autocomplete="current-password"]').setValue('wxtnb')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(pushSpy).toHaveBeenCalledWith('/')
  })
  it('登录成功且须改密→跳转 /change-password', async () => {
    authMock.mockResolvedValueOnce({ ok: true, user: { account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [], mustChangePassword: true } } as any)
    const w = mountLV()
    await w.find('input[autocomplete="username"]').setValue('b')
    await w.find('input[autocomplete="current-password"]').setValue('temp123')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick(); await w.vm.$nextTick()
    expect(pushSpy).toHaveBeenCalledWith('/change-password')
  })
  it('失败提交后重新聚焦账号→清除错误提示', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="username"]').setValue('admin')
    await w.find('input[autocomplete="current-password"]').setValue('bad')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(w.find('[data-test="lv-error"]').exists()).toBe(true)
    await w.find('input[autocomplete="username"]').trigger('focus')
    await w.vm.$nextTick()
    expect(w.find('[data-test="lv-error"]').exists()).toBe(false)
  })
})
