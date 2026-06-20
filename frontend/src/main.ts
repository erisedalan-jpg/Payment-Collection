import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/theme.css'
import App from './App.vue'
import { router } from './router'
import { useSettingsStore } from './stores/settings'
import { useAuthStore } from './stores/auth'
import { vActivate } from './directives/activate'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia).use(router).use(ElementPlus)
app.directive('activate', vActivate)
// 启动时按持久化的主题/字号应用到 <html>
useSettingsStore(pinia).init()
// 启动静默恢复登录态(失败不跳转,守卫是 SP-3)
useAuthStore(pinia).ensureReady()
app.mount('#app')
