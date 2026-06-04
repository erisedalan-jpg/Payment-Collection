import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FuFlag, FuData } from '@/lib/followup'

const FU_KEY = 'fu_data'
function load(): FuData {
  try {
    return JSON.parse(localStorage.getItem(FU_KEY) || '{}')
  } catch {
    return {}
  }
}

/** 本地跟进标记 store（响应式，持久化 localStorage 'fu_data'）。忠实移植 _fuData/_fuGet/_fuSet。 */
export const useFuDataStore = defineStore('fuData', () => {
  const data = ref<FuData>(load())

  function persist() {
    localStorage.setItem(FU_KEY, JSON.stringify(data.value))
  }
  function get(pid: string): FuFlag {
    return data.value[pid] || { flw: false, st: '', fb: '' }
  }
  function setFlw(pid: string, flw: boolean) {
    const cur: FuFlag = { ...(data.value[pid] || {}) }
    cur.flw = flw
    data.value = { ...data.value, [pid]: cur }
    persist()
  }
  function batchSetFlw(pids: string[], flw: boolean) {
    const next = { ...data.value }
    for (const pid of pids) next[pid] = { ...(next[pid] || {}), flw }
    data.value = next
    persist()
  }
  return { data, get, setFlw, batchSetFlw }
})
