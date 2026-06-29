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

export interface ColumnPrefs {
  visibleKeys: Ref<string[]>
  toggle: (key: string) => void
  moveUp: (key: string) => void
  moveDown: (key: string) => void
  reset: () => void
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
  return { visibleKeys, toggle, moveUp, moveDown, reset }
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
  return { visibleKeys, toggle, moveUp, moveDown, reset }
}
