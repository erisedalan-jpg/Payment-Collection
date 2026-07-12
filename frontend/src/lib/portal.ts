// 首页门户/快捷入口(Launchpad)类型 + 纯函数:分组分段、首字母、取色、URL 安全校验、id 生成。
export type PortalVisibility = { mode: 'all' } | { mode: 'accounts'; accounts: string[] }
export interface PortalFileRef { storedName: string; originalName: string; size: number }
export interface PortalItem {
  id: string
  type: 'url' | 'file'
  name: string
  group: string
  emoji: string
  featured: boolean
  url: string
  file: PortalFileRef | null
  visibility: PortalVisibility
}
export interface PortalConfig { version: number; groups: string[]; items: PortalItem[] }
export interface PortalSection { key: string; label: string; featured: boolean; items: PortalItem[] }

export function emptyConfig(): PortalConfig {
  return { version: 1, groups: [], items: [] }
}

export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function newItemId(): string {
  const a = new Uint8Array(6)
  crypto.getRandomValues(a)
  return 'pl_' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function initials(name: string): string {
  const s = (name || '').trim()
  if (!s) return '·'
  const ch = s[0]
  return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : ch
}

const PALETTE = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6', '--chart-7', '--chart-8']
export function avatarColor(name: string): string {
  let h = 0
  const s = name || ''
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `var(${PALETTE[h % PALETTE.length]})`
}

export function buildSections(config: PortalConfig): PortalSection[] {
  const items = config.items ?? []
  const sections: PortalSection[] = []
  const featured = items.filter((it) => it.featured)
  if (featured.length) sections.push({ key: '__featured__', label: '置顶', featured: true, items: featured })
  for (const g of config.groups ?? []) {
    const gi = items.filter((it) => !it.featured && it.group === g)
    if (gi.length) sections.push({ key: g, label: g, featured: false, items: gi })
  }
  return sections
}
