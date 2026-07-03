import { ref, watch, type Ref } from 'vue'

const PREFIX = 'colprefs:'

function loadKeys(viewKey: string, allKeys: string[], defaultVisible: string[]): string[] {
  try {
    const raw = localStorage.getItem(PREFIX + viewKey)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        const valid = arr.filter((k: unknown): k is string => typeof k === 'string' && allKeys.includes(k))
        if (valid.length) return valid
      }
    }
  } catch {
    /* localStorage 不可用/损坏 → 降级默认 */
  }
  return defaultVisible.filter((k) => allKeys.includes(k))
}

function saveKeys(viewKey: string, keys: string[]): void {
  try {
    localStorage.setItem(PREFIX + viewKey, JSON.stringify(keys))
  } catch {
    /* 忽略写入失败(隐私模式/配额) */
  }
}

/** cf 只需具备 clearColumn(tableId, key)；宽松结构类型，不绑定具体 store 实现(crossFilter store 满足此形状)。 */
export interface ColumnClearer {
  clearColumn: (tableId: string, key: string) => void
}

export interface ColumnPrefs {
  visibleKeys: Ref<string[]>
  toggle: (key: string) => void
  moveUp: (key: string) => void
  moveDown: (key: string) => void
  reset: () => void
  /** 「关列清筛选」不变式：key 当前可见(即将被隐藏)时先 cf.clearColumn 清其表头筛选，再 toggle。 */
  makeToggle: (cf: ColumnClearer, tableId: string) => (key: string) => void
}

function buildMakeToggle(visibleKeys: Ref<string[]>, toggle: (key: string) => void): ColumnPrefs['makeToggle'] {
  return (cf, tableId) => (key) => {
    if (visibleKeys.value.includes(key)) cf.clearColumn(tableId, key)
    toggle(key)
  }
}

export function useColumnPrefs(viewKey: string, allKeys: string[], defaultVisible: string[]): ColumnPrefs {
  const visibleKeys = ref<string[]>(loadKeys(viewKey, allKeys, defaultVisible))

  function set(keys: string[]) {
    visibleKeys.value = keys
    saveKeys(viewKey, keys)
  }

  function toggle(key: string) {
    if (!allKeys.includes(key)) return
    set(
      visibleKeys.value.includes(key)
        ? visibleKeys.value.filter((k) => k !== key)
        : [...visibleKeys.value, key]
    )
  }
  function moveUp(key: string) {
    const i = visibleKeys.value.indexOf(key)
    if (i > 0) {
      const next = [...visibleKeys.value]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      set(next)
    }
  }
  function moveDown(key: string) {
    const i = visibleKeys.value.indexOf(key)
    if (i >= 0 && i < visibleKeys.value.length - 1) {
      const next = [...visibleKeys.value]
      ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
      set(next)
    }
  }
  function reset() {
    set(defaultVisible.filter((k) => allKeys.includes(k)))
  }
  return { visibleKeys, toggle, moveUp, moveDown, reset, makeToggle: buildMakeToggle(visibleKeys, toggle) }
}

/** 动态列版本:allKeys 为 Ref(数据异步到达后变化)。首次非空时从 localStorage 懒加载。 */
export function useColumnPrefsDynamic(
  viewKey: string,
  allKeys: Ref<string[]>,
  defaultVisible: string[],
): ColumnPrefs {
  const visibleKeys = ref<string[]>([])
  let inited = false
  function set(keys: string[]) { visibleKeys.value = keys; saveKeys(viewKey, keys) }
  function init(ks: string[]) {
    if (inited || !ks.length) return
    inited = true
    visibleKeys.value = loadKeys(viewKey, ks, defaultVisible)
  }
  init(allKeys.value)
  watch(allKeys, init)

  function toggle(key: string) {
    if (!allKeys.value.includes(key)) return
    set(visibleKeys.value.includes(key)
      ? visibleKeys.value.filter((k) => k !== key)
      : [...visibleKeys.value, key])
  }
  function moveUp(key: string) {
    const i = visibleKeys.value.indexOf(key)
    if (i > 0) { const n = [...visibleKeys.value]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n) }
  }
  function moveDown(key: string) {
    const i = visibleKeys.value.indexOf(key)
    if (i >= 0 && i < visibleKeys.value.length - 1) { const n = [...visibleKeys.value]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n) }
  }
  function reset() { set(defaultVisible.filter((k) => allKeys.value.includes(k))) }
  return { visibleKeys, toggle, moveUp, moveDown, reset, makeToggle: buildMakeToggle(visibleKeys, toggle) }
}
