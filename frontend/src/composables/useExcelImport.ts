import { ref } from 'vue'
import * as XLSX from 'xlsx'
import { validateExt, missingSheets, toStringMatrix } from '@/lib/excelImport'

export type ImportPhase = 'idle' | 'reading' | 'uploading' | 'processing' | 'done' | 'error' | 'stopped'

export interface ParsedWorkbook {
  SheetNames: string[]
  sheetRows: (name: string) => any[][]
}
export interface ImportOpts {
  readFile?: (f: File) => Promise<ArrayBuffer>
  parseWorkbook?: (buf: ArrayBuffer) => ParsedWorkbook
  postFn?: (body: unknown) => Promise<{ success: boolean; message?: string }>
  statusFn?: () => Promise<{ running: boolean; progress: number; message: string }>
  stopFn?: () => void
  baseUrl?: string
  pollMs?: number
  onDone?: () => void
}

function defaultReadFile(f: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsArrayBuffer(f)
  })
}
function defaultParse(buf: ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  return {
    SheetNames: wb.SheetNames,
    sheetRows: (name: string) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as any[][],
  }
}

/** 离线导入流程（读文件→解析→校验→上传→轮询）。忠实移植 importExcel/_pollImportStatus/stopImport。依赖可注入便于测试。 */
export function useExcelImport(opts: ImportOpts = {}) {
  const base = opts.baseUrl ?? ''
  const pollMs = opts.pollMs ?? 1000
  const readFile = opts.readFile ?? defaultReadFile
  const parseWorkbook = opts.parseWorkbook ?? defaultParse
  const postFn =
    opts.postFn ??
    ((body: unknown) =>
      globalThis
        .fetch(base + '/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        .then((r) => r.json()))
  const statusFn =
    opts.statusFn ?? (() => globalThis.fetch(base + '/api/import-status').then((r) => r.json()))
  const stopFn = opts.stopFn ?? (() => void globalThis.fetch(base + '/api/stop-import'))

  const phase = ref<ImportPhase>('idle')
  const progress = ref(0)
  const message = ref('')
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  async function importFile(file: File) {
    if (!validateExt(file.name)) {
      phase.value = 'error'
      message.value = '仅支持 .xlsx 或 .xls 格式的Excel文件'
      return
    }
    phase.value = 'reading'
    progress.value = 0
    message.value = '正在读取Excel文件...'
    let wb: ParsedWorkbook
    try {
      const buf = await readFile(file)
      wb = parseWorkbook(buf)
    } catch (e) {
      phase.value = 'error'
      message.value = 'Excel解析失败: ' + (e instanceof Error ? e.message : '') + '。请确认为标准Excel格式且未加密损坏'
      return
    }
    const miss = missingSheets(wb.SheetNames)
    if (miss.length) {
      phase.value = 'error'
      message.value = '文件缺少必需Sheet页：' + miss.join('、') + '（名称需完全一致）'
      return
    }
    const allSheets: Record<string, string[][]> = {}
    for (const name of wb.SheetNames) allSheets[name] = toStringMatrix(wb.sheetRows(name))

    phase.value = 'uploading'
    progress.value = 20
    message.value = '正在上传数据到服务器...'
    let res: { success: boolean; message?: string }
    try {
      res = await postFn({ allSheets, fileName: file.name })
    } catch (e) {
      phase.value = 'error'
      message.value = '上传失败: ' + (e instanceof Error ? e.message : '')
      return
    }
    if (!res.success) {
      phase.value = 'error'
      message.value = '✕ ' + (res.message || '导入失败')
      return
    }
    phase.value = 'processing'
    progress.value = 30
    message.value = '导入数据已上传，正在处理...'
    poll()
  }

  function poll() {
    statusFn()
      .then((st) => {
        if (st.progress > progress.value) progress.value = st.progress
        message.value = st.message || '处理中...'
        if (st.progress >= 100) {
          progress.value = 100
          phase.value = 'done'
          message.value = '导入完成！正在刷新数据...'
          opts.onDone?.()
        } else if (!st.running) {
          phase.value = (st.message || '').includes('失败') ? 'error' : 'stopped'
        } else {
          pollTimer = setTimeout(poll, pollMs)
        }
      })
      .catch(() => {
        pollTimer = setTimeout(poll, pollMs * 2)
      })
  }

  function stop() {
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
    phase.value = 'stopped'
    progress.value = 0
    message.value = '导入已停止'
    try {
      stopFn()
    } catch {
      /* best-effort */
    }
  }

  return { phase, progress, message, importFile, stop }
}
