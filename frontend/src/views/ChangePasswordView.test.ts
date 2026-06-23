import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChangePasswordView from './ChangePasswordView.vue'
import { useAuthStore } from '@/stores/auth'

const pushSpy = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

beforeEach(() => { setActivePinia(createPinia()); pushSpy.mockClear() })

function mountCPW() { return mount(ChangePasswordView) }

describe('ChangePasswordView', () => {
  it('两次新密码不一致→提示,不调 store', async () => {
    const s = useAuthStore()
    const spy = vi.spyOn(s, 'changePassword')
    const w = mountCPW()
    await w.find('[data-test="cpw-old"]').setValue('temp123')
    await w.find('[data-test="cpw-new"]').setValue('newpass456')
    await w.find('[data-test="cpw-confirm"]').setValue('mismatch')
    await w.find('form').trigger('submit')
    expect(spy).not.toHaveBeenCalled()
    expect(w.find('[data-test="cpw-error"]').text()).toContain('不一致')
  })
  it('合法提交→调 store.changePassword,成功跳转 firstAllowedPath', async () => {
    const s = useAuthStore()
    vi.spyOn(s, 'changePassword').mockResolvedValue({ ok: true, user: { account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [], mustChangePassword: false } } as any)
    vi.spyOn(s, 'firstAllowedPath').mockReturnValue('/data')
    const w = mountCPW()
    await w.find('[data-test="cpw-old"]').setValue('temp123')
    await w.find('[data-test="cpw-new"]').setValue('newpass456')
    await w.find('[data-test="cpw-confirm"]').setValue('newpass456')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick(); await w.vm.$nextTick()
    expect(s.changePassword).toHaveBeenCalledWith('temp123', 'newpass456')
    expect(pushSpy).toHaveBeenCalledWith('/data')
  })
})
