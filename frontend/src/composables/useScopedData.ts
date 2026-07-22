import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useYitianStore } from '@/stores/yitian'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { useAuthStore } from '@/stores/auth'
import { effectiveScope, narrowProjects, narrowYitian, narrowOpportunities } from '@/lib/pageScope'
import type { PageKey } from '@/lib/pageAccess'
import type { OppRow } from '@/lib/opportunitiesApi'

/** 当前路由页的有效范围 computed;超管/无 pageKey/无路由上下文 → null(不收窄)。
 *  ★ useRoute() 必须在 setup 期调用一次(组合式规则)——不能塞进下面各 computed 的 getter,
 *  否则渲染外的 effect 重算时 getCurrentInstance 为空、取不到路由 → 导航后收窄静默失效。
 *  部分既有组件测试用 vi.mock('vue-router') 只桩 useRouter、useRoute 变 undefined 调用即抛,故 try/catch 兜底。 */
function useCurrentScope() {
  const auth = useAuthStore()
  let route: ReturnType<typeof useRoute> | undefined
  try {
    route = useRoute()
  } catch {
    route = undefined
  }
  return computed(() => {
    const pk = route?.meta?.pageKey as PageKey | undefined
    if (!auth.user || auth.isSuper || !pk) return null
    return effectiveScope(auth.user, pk)
  })
}

export function useScopedProjects() {
  const data = useDataStore()
  const auth = useAuthStore()
  const scope = useCurrentScope()
  return computed(() =>
    scope.value ? narrowProjects(data.data, scope.value, auth.user?.staffNames ?? {}) : data.data,
  )
}

export function useScopedYitian() {
  const store = useYitianStore()
  const scope = useCurrentScope()
  return computed(() => (scope.value ? narrowYitian(store.data, scope.value) : store.data))
}

export function useScopedOpportunities() {
  const store = useOpportunitiesStore()
  const scope = useCurrentScope()
  // OppRow 是纯索引签名类型({[k:string]:any}),与 narrowOpportunities 的弱类型约束 {l4?:string}
  // 在结构上"无公共属性"(TS 弱类型检测忽略索引签名),经 any 收窄绕过、返回处转回 OppRow[] 保持外部类型。
  return computed(() =>
    scope.value ? (narrowOpportunities(store.rows as any, scope.value) as OppRow[]) : store.rows,
  )
}
