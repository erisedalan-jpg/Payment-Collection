import { reactive } from 'vue'

// 需要"下钻返回保持视图状态"的列表页（路由 name）
export const KEEPALIVE_ROUTES = [
  'projects',
  'insight-costdetail',
  'closed-projects',
  'insight-milestone',
] as const

// keep-alive :include 需要"组件 name"，须与各 SFC 的 defineOptions({name}) 一致
export const KEEPALIVE_COMPONENTS = [
  'ProjectsView',
  'CostDetailView',
  'ClosedProjectsView',
  'MilestoneView',
] as const

// 下钻目标（详情）路由 = 返回来源
const DETAIL_ROUTES = ['project-detail', 'closed-project-detail']

const tokens = reactive<Record<string, number>>({})
let armed: string | null = null // 最近一次从哪个 keep-alive 列表下钻出去

export function isKeepAliveRoute(name?: unknown): boolean {
  return typeof name === 'string' && (KEEPALIVE_ROUTES as readonly string[]).includes(name)
}

function isDetailRoute(name?: unknown): boolean {
  return typeof name === 'string' && DETAIL_ROUTES.includes(name)
}

// 供 router.beforeResolve 调用：先登记（列表→详情），再解析（→列表：判定返回/菜单）
export function trackNavigation(toName: unknown, fromName: unknown): void {
  if (isKeepAliveRoute(fromName) && isDetailRoute(toName)) {
    armed = String(fromName)
  }
  if (isKeepAliveRoute(toName)) {
    const isReturn = armed === String(toName) && isDetailRoute(fromName)
    armed = null
    if (!isReturn) tokens[String(toName)] = (tokens[String(toName)] ?? 0) + 1
  } else if (!isDetailRoute(toName)) {
    // 离开到既非 keep-alive 列表、又非详情的路由(首页/回款/台账等)→ 作废登记,
    // 避免残留 armed 让之后从无关详情返回该列表时被误判为"返回"而不重置。
    // detail→detail 连跳(to 仍是详情)保留登记,不伤"详情A→详情B→返回列表"的保持。
    armed = null
  }
}

export function token(name: string): number {
  return tokens[name] ?? 0
}

// keep-alive 路由 → 带 token 后缀（菜单进入 bump → 新 key → 新实例=重置）；其余 → 原 name
export function viewKey(name?: unknown): string {
  const n = String(name ?? '')
  return isKeepAliveRoute(n) ? `${n}:${token(n)}` : n
}

// 仅供测试重置内部状态
export function __resetViewReturn(): void {
  armed = null
  for (const k of Object.keys(tokens)) delete tokens[k]
}
