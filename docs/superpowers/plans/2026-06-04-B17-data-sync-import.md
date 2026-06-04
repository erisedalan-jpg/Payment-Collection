# 数据管理：云同步(SSE 进度) + 离线 Excel 导入(上传+轮询) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 B16 数据管理页补上"从数据源刷新"：**云同步**（输入 WPS 云文档地址 → `/api/sync` SSE 流式进度 → 完成后重载数据）+ **离线 Excel 导入**（选 .xlsx → 客户端解析 → `/api/import` 上传 → `/api/import-status` 轮询 → 完成后重载）。两者互斥、各带停止。

**范围：** 承接 B16（质量/纳管/清空），本 B17 完成数据管理页剩余的 SSE/上传子系统。这是 EventSource + 文件解析(xlsx) + 上传 + 轮询的集成密集页。完成后数据管理页全功能；下一计划 B18 = 区间对比 + 关于。

**Architecture:** 纯解析/校验逻辑抽到 `lib/excelImport.ts`。SSE 与导入流程抽到组合式 `composables/useCloudSync.ts`（EventSource 状态机，**EventSource/fetch 可注入**）与 `composables/useExcelImport.ts`（读文件+解析+上传+轮询，**readFile/parseWorkbook/post/status/stop 可注入**）。`data` store 增 `reload()`（强制重拉 analysis_data.json）。`DataView.vue` 增"云同步""离线导入"两张卡（替换 B16 占位），完成回调接 `data.reload()`。客户端 Excel 解析用 `xlsx`(SheetJS) —— **新增依赖**。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Element Plus(el-input) + xlsx + Vitest（EventSource/FileReader/fetch/timer 注入 mock）。

**忠实移植基准（旧 app.js + server.py）：** `startSync`(3506)/`stopSync`(3657) / `importExcel`(3702)/`_pollImportStatus`(3809)/`stopImport`(3840) / `reloadData`(3442)；后端 `handle_sync`(350, SSE)/`handle_import`(439)/`handle_import_status`(485)/`handle_stop_sync`(463)/`handle_stop_import`(475)。

**后端 API 契约（已核对 server.py）：**
- `GET /api/sync?url=<encoded>` → **SSE** `text/event-stream`，每事件 `data: {running,progress,message}\n\n`，progress≥100 或 running=false 时流结束；导入进行中则改回普通 JSON `{running:false,progress:0,message:'导入正在进行中...'}`（前端 EventSource 会触发 onerror，归错误态）。
- `POST /api/import` body `{allSheets:{sheet:string[][]}, fileName}` → `{success, message}`；忙时 `{success:false, code:'busy', message}`。
- `GET /api/import-status` → `{running, progress, message}`。
- `GET /api/stop-sync` / `GET /api/stop-import` → JSON（best-effort，前端不依赖返回）。

**关键忠实性要点：**
- 云同步：url 为空 → 提示"请先输入数据源地址（WPS云文档网址）"不发起；EventSource onmessage 解析 {progress,message}，progress≥100 → 关闭 + 完成态 + reload；onerror → 连接中断错误文案。停止 → 关闭 ES + `GET /api/stop-sync` + "同步已停止"。
- 离线导入：扩展名仅 .xlsx/.xls；FileReader 读为 ArrayBuffer → `XLSX.read({type:'array'})`；**必需 Sheet** `项目回款节点（里程碑）清单` 缺失则报错；各 Sheet 经 `sheet_to_json({header:1,defval:''})` → 转**字符串二维数组**；POST /api/import；成功后轮询 import-status 每 1s：progress 单调增、≥100 → 完成 + reload、running=false 且含"失败" → 错误、否则停止。停止 → abort/清 timer + `GET /api/stop-import` + "导入已停止"。
- 同步/导入互斥（后端保证；前端两区按钮在对方进行中可禁用，本期以后端 busy 返回为准 + 完成/错误后复位）。
- 完成后数据刷新：`data.reload()`（强制重拉 `/data/analysis_data.json`，对应旧 reloadData 热更新）。
- 时间/外部依赖（EventSource/FileReader/XLSX/fetch/poll 间隔）一律注入参数，便于测试。

**展示从简（已记录，非偏差）：**
- 进度用简单进度条 + 文案（替代旧多处 DOM 拼装/错误富文本）；错误文案精简保留要点。
- 旧 reloadData 动态 `<script>` 热加载 → 用 data store `reload()` 重拉 JSON。
- 同步/导入按钮互禁的细粒度联动从简（以 busy 返回 + 各自状态复位保证不并发）。

---

## File Structure

| 文件 | 职责 | 任务 |
|---|---|---|
| `frontend/package.json`(+依赖) + `frontend/src/stores/data.ts`(改) | 新增 `xlsx` 依赖；data store 增 `reload()` | T1 |
| `frontend/src/lib/excelImport.ts` | 纯函数：validateExt / REQUIRED_SHEETS / missingSheets / toStringMatrix | T2 |
| `frontend/src/composables/useCloudSync.ts` | SSE 同步状态机（EventSource 可注入） | T3 |
| `frontend/src/composables/useExcelImport.ts` | 读文件+解析+上传+轮询（依赖可注入） | T4 |
| `frontend/src/views/DataView.vue`(改) | 增 云同步 + 离线导入 两张卡 | T5 |

新建文件配 `*.test.ts`。

---

### Task 1: 新增 xlsx 依赖 + data store reload + 测试

**Files:**
- Modify: `frontend/package.json`（+`xlsx`）
- Modify: `frontend/src/stores/data.ts`（+`reload`）
- Modify/Create: `frontend/src/stores/data.test.ts`（+`reload` 测试）

- [ ] **Step 1: 安装 xlsx** — `cd frontend && npm install xlsx`（写入 dependencies + lockfile）。确认 `node -e "require('xlsx')"` 不报错。

- [ ] **Step 2: 写失败测试** — 在 `frontend/src/stores/data.test.ts` 追加（保留已有用例）：

```ts
import { vi } from 'vitest'

describe('useDataStore.reload', () => {
  it('强制重拉并更新 data', async () => {
    const s = useDataStore()
    const fresh = { meta: { lastUpdate: 'new' }, rawNodes: [{ projectId: 'X' }] }
    vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => fresh } as any)
    await s.reload()
    expect(s.data!.rawNodes).toEqual([{ projectId: 'X' }])
    expect((s.data as any).meta.lastUpdate).toBe('new')
    vi.restoreAllMocks()
  })
})
```

（若文件顶部已 import vi 则不重复 import。）

- [ ] **Step 3: 实现** — `frontend/src/stores/data.ts` 在 `clearBusinessData` 之后、return 之前加 `reload`，并加入 return：

```ts
  /** 强制重拉 analysis_data.json（绕过 loading 守卫 + 时间戳防缓存）。忠实移植 reloadData 的数据热更新。 */
  async function reload() {
    error.value = null
    try {
      const res = await fetch('/data/analysis_data.json?t=' + Date.now())
      if (!res.ok) throw new Error(`加载数据失败 HTTP ${res.status}`)
      data.value = (await res.json()) as AnalysisData
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }
```

return 改为：`return { data, loading, error, load, clearBusinessData, reload }`

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/stores/data.test.ts`（全绿）
- [ ] **Step 5: typecheck** — `cd frontend && npm run typecheck`（无新增错误）。
- [ ] **Step 6: 提交**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/stores/data.ts frontend/src/stores/data.test.ts
git commit -m "feat(frontend): 新增 xlsx 依赖；data store 增 reload（强制重拉数据）"
```

---

### Task 2: lib/excelImport.ts（纯函数 + 测试）

**Files:**
- Create: `frontend/src/lib/excelImport.ts`
- Test: `frontend/src/lib/excelImport.test.ts`

- [ ] **Step 1: 写失败测试** — `frontend/src/lib/excelImport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateExt, REQUIRED_SHEETS, missingSheets, toStringMatrix } from './excelImport'

describe('validateExt', () => {
  it('仅 xlsx/xls', () => {
    expect(validateExt('a.xlsx')).toBe(true)
    expect(validateExt('a.XLS')).toBe(true)
    expect(validateExt('a.csv')).toBe(false)
    expect(validateExt('noext')).toBe(false)
  })
})

describe('missingSheets', () => {
  it('缺必需 Sheet 返回缺失项', () => {
    expect(missingSheets(['其他'])).toEqual(REQUIRED_SHEETS)
    expect(missingSheets(['项目回款节点（里程碑）清单', '其他'])).toEqual([])
  })
})

describe('toStringMatrix', () => {
  it('单元格转字符串，null/undefined→空串', () => {
    expect(toStringMatrix([[1, null, 'x'], [undefined, 0]])).toEqual([['1', '', 'x'], ['', '0']])
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/lib/excelImport.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/lib/excelImport.ts`:

```ts
/** 离线导入必需的 Sheet 页（V5.9：所有层级合并到一张表）。忠实移植 REQUIRED_SHEET_NAMES。 */
export const REQUIRED_SHEETS = ['项目回款节点（里程碑）清单']

/** 扩展名校验：仅 .xlsx / .xls。 */
export function validateExt(filename: string): boolean {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  return ext === 'xlsx' || ext === 'xls'
}

/** 缺失的必需 Sheet 名列表。 */
export function missingSheets(sheetNames: string[]): string[] {
  return REQUIRED_SHEETS.filter((n) => !sheetNames.includes(n))
}

/** 二维数组单元格转字符串（null/undefined→''），与 fetch_yundocs_full.py 输出格式一致。 */
export function toStringMatrix(rows: any[][]): string[][] {
  return rows.map((row) => row.map((cell) => (cell !== null && cell !== undefined ? String(cell) : '')))
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/lib/excelImport.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/excelImport.ts frontend/src/lib/excelImport.test.ts
git commit -m "feat(frontend): 新增 excelImport 纯函数（扩展名/必需Sheet/字符串矩阵）"
```

---

### Task 3: composables/useCloudSync.ts（SSE 同步 + 测试）

**Files:**
- Create: `frontend/src/composables/useCloudSync.ts`
- Test: `frontend/src/composables/useCloudSync.test.ts`

- [ ] **Step 1: 写失败测试** — `frontend/src/composables/useCloudSync.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { useCloudSync } from './useCloudSync'

class FakeES {
  url: string
  onmessage: ((e: any) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  static last: FakeES | null = null
  constructor(url: string) {
    this.url = url
    FakeES.last = this
  }
  close() {
    this.closed = true
  }
}

describe('useCloudSync', () => {
  it('url 为空 → 错误态，不创建 ES', () => {
    FakeES.last = null
    const s = useCloudSync({ eventSourceCtor: FakeES as any })
    s.start('  ')
    expect(s.phase.value).toBe('error')
    expect(FakeES.last).toBeNull()
  })
  it('正常流：onmessage 更新进度，100→完成+onDone', () => {
    const onDone = vi.fn()
    const s = useCloudSync({ eventSourceCtor: FakeES as any, onDone })
    s.start('http://doc')
    expect(s.phase.value).toBe('syncing')
    expect(FakeES.last!.url).toContain('/api/sync?url=')
    FakeES.last!.onmessage!({ data: JSON.stringify({ progress: 50, message: '抓取中' }) })
    expect(s.progress.value).toBe(50)
    FakeES.last!.onmessage!({ data: JSON.stringify({ progress: 100, message: '完成' }) })
    expect(s.phase.value).toBe('done')
    expect(FakeES.last!.closed).toBe(true)
    expect(onDone).toHaveBeenCalled()
  })
  it('onerror → 错误态', () => {
    const s = useCloudSync({ eventSourceCtor: FakeES as any })
    s.start('http://doc')
    FakeES.last!.onerror!()
    expect(s.phase.value).toBe('error')
  })
  it('stop → 停止态 + 调 stop-sync', () => {
    const fetchFn = vi.fn().mockResolvedValue({})
    const s = useCloudSync({ eventSourceCtor: FakeES as any, fetchFn: fetchFn as any })
    s.start('http://doc')
    s.stop()
    expect(s.phase.value).toBe('stopped')
    expect(fetchFn).toHaveBeenCalledWith('/api/stop-sync')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/composables/useCloudSync.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/composables/useCloudSync.ts`:

```ts
import { ref } from 'vue'

export type SyncPhase = 'idle' | 'syncing' | 'done' | 'error' | 'stopped'
export interface CloudSyncOpts {
  eventSourceCtor?: typeof EventSource
  fetchFn?: typeof fetch
  baseUrl?: string
  onDone?: () => void
}

/** 云同步 SSE 状态机。忠实移植 startSync/stopSync。EventSource/fetch 可注入便于测试。 */
export function useCloudSync(opts: CloudSyncOpts = {}) {
  const ESCtor = opts.eventSourceCtor ?? (globalThis as any).EventSource
  const fetchFn = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a))
  const base = opts.baseUrl ?? ''

  const phase = ref<SyncPhase>('idle')
  const progress = ref(0)
  const message = ref('')
  let es: { close: () => void; onmessage: any; onerror: any } | null = null

  function start(url: string) {
    const u = (url || '').trim()
    if (!u) {
      phase.value = 'error'
      message.value = '请先输入数据源地址（WPS云文档网址）'
      return
    }
    phase.value = 'syncing'
    progress.value = 0
    message.value = '正在连接WPS云文档...'
    es = new ESCtor(base + '/api/sync?url=' + encodeURIComponent(u))
    es!.onmessage = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data)
        if (typeof d.progress === 'number') progress.value = d.progress
        if (d.message) message.value = d.message
        if ((d.progress ?? 0) >= 100) {
          es?.close()
          phase.value = 'done'
          opts.onDone?.()
        }
      } catch {
        /* 忽略非 JSON 事件 */
      }
    }
    es!.onerror = () => {
      es?.close()
      phase.value = 'error'
      message.value = '同步连接中断，请检查浏览器/云文档地址/网络后重试'
    }
  }

  function stop() {
    es?.close()
    es = null
    phase.value = 'stopped'
    progress.value = 0
    message.value = '同步已停止'
    try {
      fetchFn(base + '/api/stop-sync')
    } catch {
      /* best-effort */
    }
  }

  return { phase, progress, message, start, stop }
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/composables/useCloudSync.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/composables/useCloudSync.ts frontend/src/composables/useCloudSync.test.ts
git commit -m "feat(frontend): 新增 useCloudSync SSE 同步状态机（EventSource 可注入）"
```

---

### Task 4: composables/useExcelImport.ts（导入流程 + 测试）

**Files:**
- Create: `frontend/src/composables/useExcelImport.ts`
- Test: `frontend/src/composables/useExcelImport.test.ts`

依赖：`@/lib/excelImport`；默认实现用 `xlsx` + FileReader + fetch（均可注入）。

- [ ] **Step 1: 写失败测试** — `frontend/src/composables/useExcelImport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useExcelImport } from './useExcelImport'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function fakeFile(name: string) {
  return { name } as any as File
}
const okParse = () => ({ SheetNames: ['项目回款节点（里程碑）清单'], sheetRows: () => [['h'], ['1']] })

describe('useExcelImport', () => {
  it('扩展名非法 → 错误', async () => {
    const imp = useExcelImport({})
    await imp.importFile(fakeFile('a.csv'))
    expect(imp.phase.value).toBe('error')
    expect(imp.message.value).toContain('xlsx')
  })
  it('缺必需 Sheet → 错误', async () => {
    const imp = useExcelImport({
      readFile: async () => new ArrayBuffer(0),
      parseWorkbook: () => ({ SheetNames: ['其他'], sheetRows: () => [] }),
    })
    await imp.importFile(fakeFile('a.xlsx'))
    expect(imp.phase.value).toBe('error')
    expect(imp.message.value).toContain('必需Sheet')
  })
  it('上传成功 + 轮询至 100 → 完成 + onDone', async () => {
    const onDone = vi.fn()
    const postFn = vi.fn().mockResolvedValue({ success: true })
    const statusFn = vi.fn().mockResolvedValue({ running: false, progress: 100, message: '完成' })
    const imp = useExcelImport({
      readFile: async () => new ArrayBuffer(0),
      parseWorkbook: okParse,
      postFn,
      statusFn,
      pollMs: 1000,
      onDone,
    })
    await imp.importFile(fakeFile('a.xlsx'))
    await flushPromises()
    expect(postFn).toHaveBeenCalled()
    expect(imp.phase.value).toBe('done')
    expect(onDone).toHaveBeenCalled()
  })
  it('上传 success=false → 错误', async () => {
    const imp = useExcelImport({
      readFile: async () => new ArrayBuffer(0),
      parseWorkbook: okParse,
      postFn: vi.fn().mockResolvedValue({ success: false, message: '同步进行中' }),
    })
    await imp.importFile(fakeFile('a.xlsx'))
    await flushPromises()
    expect(imp.phase.value).toBe('error')
    expect(imp.message.value).toContain('同步进行中')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/composables/useExcelImport.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/composables/useExcelImport.ts`:

```ts
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
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/composables/useExcelImport.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/composables/useExcelImport.ts frontend/src/composables/useExcelImport.test.ts
git commit -m "feat(frontend): 新增 useExcelImport 导入流程（读文件/解析/上传/轮询, 依赖可注入）"
```

---

### Task 5: DataView 增 云同步 + 离线导入 两张卡 + 测试

**Files:**
- Modify: `frontend/src/views/DataView.vue`
- Modify: `frontend/src/views/DataView.test.ts`

- [ ] **Step 1: 改 DataView.vue —— script 增同步/导入组合式 + 状态**

import 增加：

```ts
import { useCloudSync } from '@/composables/useCloudSync'
import { useExcelImport } from '@/composables/useExcelImport'
```

在 `<script setup>` 内（`onClear` 之后、`defineExpose` 之前）加入：

```ts
// 云同步
const syncUrl = ref('')
const cloudSync = useCloudSync({ onDone: () => data.reload() })
function onSync() {
  cloudSync.start(syncUrl.value)
}

// 离线导入
const importInput = ref<HTMLInputElement | null>(null)
const excelImport = useExcelImport({ onDone: () => data.reload() })
function onPickImport() {
  const f = importInput.value?.files?.[0]
  if (!f) return
  excelImport.importFile(f)
}
```

并把 `defineExpose({ onClear })` 改为 `defineExpose({ onClear, onSync, onPickImport })`。

- [ ] **Step 2: 改 DataView.vue —— 模板把 B16 占位行替换为两张卡**

把（B16 占位）：

```html
      <div class="dv-row dv-note">云同步 / 离线导入将在后续接入（B17）。</div>
```

替换为两张卡（放在"设置"卡之后、"数据质量总览"卡之前；即把上面这行删除，并在 `</div>`(设置卡结束) 之后插入下列两卡）：

```html
    <div class="dv-card">
      <div class="dv-card-head">云同步（WPS 云文档）</div>
      <div class="dv-row">
        <el-input v-model="syncUrl" size="small" placeholder="粘贴 WPS 云文档网址" style="flex:1" />
        <button class="dv-btn" :disabled="cloudSync.phase.value === 'syncing'" @click="onSync">同步最新数据</button>
        <button v-if="cloudSync.phase.value === 'syncing'" class="dv-btn" @click="cloudSync.stop">停止</button>
      </div>
      <div v-if="cloudSync.phase.value !== 'idle'" class="dv-progress">
        <div class="dv-bar"><div class="dv-bar-fill" :class="cloudSync.phase.value" :style="{ width: cloudSync.progress.value + '%' }"></div></div>
        <div class="dv-msg" :class="cloudSync.phase.value">{{ cloudSync.message.value }}</div>
      </div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">离线 Excel 导入</div>
      <div class="dv-row">
        <input ref="importInput" type="file" accept=".xlsx,.xls" class="dv-file" />
        <button class="dv-btn" :disabled="excelImport.phase.value === 'reading' || excelImport.phase.value === 'uploading' || excelImport.phase.value === 'processing'" @click="onPickImport">离线导入</button>
        <button v-if="['reading','uploading','processing'].includes(excelImport.phase.value)" class="dv-btn" @click="excelImport.stop">停止</button>
      </div>
      <div class="dv-row dv-note">需包含 Sheet 页「项目回款节点（里程碑）清单」</div>
      <div v-if="excelImport.phase.value !== 'idle'" class="dv-progress">
        <div class="dv-bar"><div class="dv-bar-fill" :class="excelImport.phase.value" :style="{ width: excelImport.progress.value + '%' }"></div></div>
        <div class="dv-msg" :class="excelImport.phase.value">{{ excelImport.message.value }}</div>
      </div>
    </div>
```

并在 `<style scoped>` 末尾追加进度条样式：

```css
.dv-file { font-size: 12px; }
.dv-progress { padding: 0 16px 12px; }
.dv-bar { height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
.dv-bar-fill { height: 100%; background: #3b82f6; transition: width .3s ease; }
.dv-bar-fill.done { background: #10b981; }
.dv-bar-fill.error { background: #ef4444; }
.dv-msg { font-size: 12px; color: #64748b; margin-top: 6px; }
.dv-msg.done { color: #10b981; }
.dv-msg.error { color: #ef4444; }
```

- [ ] **Step 3: 改 DataView.test.ts —— 增云同步/导入结构断言**

在原 describe 内追加（保留 B16 既有用例不变）：

```ts
  it('渲染云同步与离线导入卡', () => {
    seed()
    const w = mount(DataView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('云同步')
    expect(w.text()).toContain('离线 Excel 导入')
    expect(w.find('input[type="file"]').exists()).toBe(true)
    expect(w.text()).toContain('项目回款节点（里程碑）清单')
  })

  it('同步 url 为空点击 → 错误提示，不创建连接', async () => {
    seed()
    const w = mount(DataView, { global: { plugins: [ElementPlus] } })
    await (w.vm as any).onSync() // syncUrl 为空
    expect(w.text()).toContain('请先输入数据源地址')
  })
```

注：`onSync` 在空 url 时走 `cloudSync.start('')` 的早返回分支（不创建 EventSource），故 jsdom 无 EventSource 也不报错。导入/同步的实际后端交互由组合式单测覆盖，本视图测试仅验证结构与空 url 防呆。

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/views/DataView.test.ts`（全绿，含 B16 原用例）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(frontend): DataView 增云同步(SSE)+离线导入(上传轮询)两张卡"
```

---

### Task 6: verify + PROGRESS

**Files:**
- Modify: `PROGRESS.md`

（路由 `/data` 已在 B16 指向 DataView，无需改路由。）

- [ ] **Step 1: 全量验证** — `bash verify.sh`，期望 `[PASS] verify.sh 全部通过 ✓`。注：新增 xlsx 会增大 chunk（已知 B-opt 警告，非失败）。

- [ ] **Step 2: 更新 PROGRESS.md**
  - "最近更新"改当日，注明 B17 数据管理 云同步/离线导入 完成（数据管理页全功能）。
  - Backlog：B17 行改 `[x] **B17** 数据管理：云同步(SSE 进度) + 离线 Excel 导入(上传+轮询)：xlsx 依赖、lib/excelImport、useCloudSync、useExcelImport、data store reload、DataView 两卡。数据管理页全功能。`；其余顺延 `[ ] **B18** 区间对比(compare) + 关于(about)`。
  - Handoff 追加 B17 完成段（提交 SHA；后端 SSE/import 契约；忠实性：url 空防呆/SSE onmessage 进度/100 完成+reload/onerror 错误、导入扩展名+必需 Sheet+字符串矩阵+上传+轮询、停止、互斥以 busy 返回为准；新增 xlsx 依赖；展示从简：进度条/reloadData→store.reload/EventSource-FileReader-XLSX 注入可测）。下一步指向 B18。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs: 更新 PROGRESS（B17 数据管理云同步+离线导入完成）"
```

---

## Self-Review

- **Spec 覆盖：** 云同步 SSE(url 输入/进度/完成 reload/停止)(`useCloudSync`+DataView)✓；离线导入(扩展名/必需 Sheet/解析/上传/轮询/停止/完成 reload)(`lib/excelImport`+`useExcelImport`+DataView)✓；data store reload✓；新增 xlsx 依赖✓。
- **占位符扫描：** 各 step 含完整代码/命令/精确改法；无 TODO/TBD。
- **类型一致性：** `SyncPhase`/`ImportPhase`/`ParsedWorkbook`/`ImportOpts`/`CloudSyncOpts` 在组合式与 DataView 一致；复用 `validateExt/missingSheets/toStringMatrix`(excelImport)、`data.reload`(store)；DataView 经 defineExpose 暴露 onSync/onPickImport 供测试。
- **范围/忠实性取舍：** url 空防呆、SSE 进度/完成/错误、导入校验+上传+轮询语义、停止、互斥(busy)、reload 热更新、依赖注入可测、xlsx 新依赖、进度条/store.reload 展示从简——均已在头部"关键忠实性/展示从简"列明。
