import type { Directive } from 'vue'

// 让任意非语义元素可由键盘激活：补 role/tabindex，Enter/Space 合成一次 click，
// 复用元素自身已绑定的 @click。用于表格行、富日格等下钻入口。
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).click()
  }
}

// 绑定值显式为 false 时跳过（用于条件可点击的单元/行，避免给无动作元素加焦点）。
export const vActivate: Directive<HTMLElement, boolean | undefined> = {
  mounted(el, binding) {
    if (binding.value === false) return
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    el.addEventListener('keydown', onKey)
  },
  unmounted(el) {
    el.removeEventListener('keydown', onKey)
  },
}
