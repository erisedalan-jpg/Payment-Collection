import { useAuthStore } from '@/stores/auth'

/** 把持久化 base key(如 TABLE_ID)按当前登录账号加前缀,实现按用户隔离。
 *  须在组件 setup(pinia active)内调用;user 为空(极端兜底)用 'anon'。 */
export function userScopedKey(base: string): string {
  const account = useAuthStore().user?.account || 'anon'
  return `${account}:${base}`
}
