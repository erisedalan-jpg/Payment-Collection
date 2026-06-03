import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppLayout from './AppLayout.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('AppLayout', () => {
  it('renders header, sidebar and routed content', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'dashboard', component: { template: '<div class="routed">ROUTED</div>' } },
        { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
      ],
    })
    router.push('/')
    await router.isReady()
    const wrapper = mount(AppLayout, { global: { plugins: [router] } })
    expect(wrapper.find('.app-header').exists()).toBe(true)
    expect(wrapper.find('.sidebar').exists()).toBe(true)
    expect(wrapper.find('.routed').exists()).toBe(true)
  })
})
