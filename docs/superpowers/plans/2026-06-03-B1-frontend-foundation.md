# Plan B1：前端脚手架与基建 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `frontend/` 建立 Vue3 + Vite + TypeScript 前端工程地基：脚手架与工具链、由 `schema.py` 生成的 TS 类型（前后端类型同源）、统一 API 客户端（消费 A3 的 `{success,code,message}`）、数据加载 Pinia store（消费 A1 的 `analysis_data.json`）、最小可运行 shell，并接入 `verify.sh`。

**Architecture:** 新增独立 `frontend/` 工程，不动现有后端。开发期 Vite dev server(:5173) 代理 `/api` 与 `/data` 到 Python `server.py`(:8080)；类型从 `schema.py` 导出的 JSON Schema 生成。这是 Phase B 的第一块（基建），自成可运行/可测闭环，解锁后续页面里程碑。后续 B2（布局 + 通用组件 DataTable/ChartBox/Modal）、B3+（各页面）单独成计划。

**Tech Stack:** Vue 3.5 `<script setup>` + TypeScript 5.7 + Vite 6 + Pinia + Vue Router + Element Plus + ECharts/vue-echarts + Vitest + @vue/test-utils；类型生成用 json-schema-to-typescript。Node 24 / npm 11（本机已确认）。

参考：spec `docs/superpowers/specs/2026-06-03-payment-platform-refactor-design.md`（§3 架构、§4 数据契约、§6 前端内部架构）；契约源 `schema.py`（A1）；错误响应 `_error_payload`（A3）。

**前置条件：** 本机已装 Node 24 + npm 11。所有 `npm` 命令从 `frontend/` 目录运行（或用 `npm --prefix frontend ...`）。

---

## File Structure（B1 产出）

```
frontend/
├── package.json            # 依赖 + 脚本（dev/build/typecheck/test/gen:types）
├── vite.config.ts          # plugin-vue + dev 代理 /api,/data → :8080 + vitest 配置
├── tsconfig.json           # Vue + Vitest 类型
├── index.html              # Vite 入口，挂载 #app
├── vitest.setup.ts         # 测试环境初始化（如有需要）
└── src/
    ├── main.ts             # createApp + Pinia + Router + Element Plus
    ├── App.vue             # 根组件（router-view）
    ├── router/index.ts     # 路由（B1 仅一个占位首页）
    ├── api/client.ts       # 统一 fetch 客户端 + ApiRequestError
    ├── api/client.test.ts
    ├── stores/data.ts      # Pinia：加载 /data/analysis_data.json
    ├── stores/data.test.ts
    ├── types/analysis.ts   # 由 schema.py 的 JSON Schema 生成（提交入库）
    └── views/HomeView.vue  # 最小 shell：显示 meta + rawNodes 数，证明数据贯通
        └── HomeView.test.ts
```
根级改动：`.gitignore`（忽略 `frontend/node_modules/`、`frontend/dist/`、`schema.json`）、`verify.sh`（接入前端检查）、`CLAUDE.md`/`PROGRESS.md`。

约定：提交信息末尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。Windows，用 Bash 工具跑 npm/git。

---

### Task 1: 脚手架与工具链

**Files:** 创建 `frontend/package.json`、`frontend/vite.config.ts`、`frontend/tsconfig.json`、`frontend/index.html`、`frontend/src/main.ts`、`frontend/src/App.vue`、`frontend/src/router/index.ts`、`frontend/src/views/HomeView.vue`（占位）；修改根 `.gitignore`。

- [ ] **Step 1: 更新根 .gitignore**

在 `.gitignore` 末尾（"系统"段之前）加入：
```
# ── 前端（Vue/Vite）──
frontend/node_modules/
frontend/dist/
# schema.py 导出的中间产物（TS 类型生成用），不入库
schema.json
```

- [ ] **Step 2: 创建 `frontend/package.json`**

```json
{
  "name": "payment-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "vue-tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "gen:types": "cd .. && python schema.py && cd frontend && json2ts -i ../schema.json -o src/types/analysis.ts"
  },
  "dependencies": {
    "echarts": "^5.6.0",
    "element-plus": "^2.9.0",
    "pinia": "^2.3.0",
    "vue": "^3.5.13",
    "vue-echarts": "^7.0.3",
    "vue-router": "^4.5.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@vitejs/plugin-vue": "^5.2.0",
    "@vue/test-utils": "^2.4.6",
    "json-schema-to-typescript": "^15.0.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "vue-tsc": "^2.2.0"
  }
}
```
（`json2ts` 是 json-schema-to-typescript 的 CLI。）

- [ ] **Step 3: 创建 `frontend/vite.config.ts`**

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发期把 API 与数据文件代理到 Python server.py
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/data': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
})
```

- [ ] **Step 4: 创建 `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

- [ ] **Step 5: 创建 `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>项目回款跟踪与管控平台</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: 创建 `frontend/src/App.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <router-view />
</template>
```

- [ ] **Step 7: 创建占位 `frontend/src/views/HomeView.vue`**（Task 5 会替换为真正读数据的版本，这里先放可编译占位）

```vue
<script setup lang="ts"></script>

<template>
  <div class="home">项目回款平台（前端基建就绪）</div>
</template>
```

- [ ] **Step 8: 创建 `frontend/src/router/index.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', name: 'home', component: HomeView }],
})
```

- [ ] **Step 9: 创建 `frontend/src/main.ts`**

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app')
```

- [ ] **Step 10: 安装依赖**

Run（从 frontend 目录）: `cd frontend && npm install`
Expected: 安装成功（可能有 deprecation 警告，无 ERROR 即可）。若出现 peer-dependency 冲突导致失败，报告 DONE_WITH_CONCERNS 并附错误，不要擅自降级大版本。

- [ ] **Step 11: 构建与类型检查通过**

Run: `cd frontend && npm run typecheck`
Expected: 无类型错误（占位组件 + 配置应通过）。
Run: `cd frontend && npm run build`
Expected: 构建成功，产出 `frontend/dist/`。

- [ ] **Step 12: 提交**

```bash
git add .gitignore frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json frontend/index.html frontend/src
git commit -m "feat(frontend): Vue3+Vite+TS 脚手架与工具链（基建）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
（确认 `frontend/node_modules` 与 `frontend/dist` 未被提交——已 gitignore。`package-lock.json` 应提交以锁定依赖。）

---

### Task 2: 由 schema.py 生成 TS 类型（前后端类型同源）

**Files:** Create `frontend/src/types/analysis.ts`（生成并提交）。

- [ ] **Step 1: 生成类型**

Run（从 frontend 目录）: `cd frontend && npm run gen:types`
该脚本会：① 在仓库根运行 `python schema.py` 生成 `schema.json`；② 用 `json2ts` 把它转成 `frontend/src/types/analysis.ts`。
Expected: 生成 `frontend/src/types/analysis.ts`，内含 `export interface AnalysisData { ... }`（以及 Meta/RawNode/Dashboard/TierSummary/ProjectOverview 等子接口）。

- [ ] **Step 2: 验证生成内容**

Run: `cd frontend && node -e "const fs=require('fs'); const s=fs.readFileSync('src/types/analysis.ts','utf8'); console.log(/export interface AnalysisData/.test(s) ? 'HAS AnalysisData' : 'MISSING')"`
Expected: 打印 `HAS AnalysisData`。
若缺失（例如 json2ts 把根类型命名为别的），读 `analysis.ts` 确认根接口名；如不是 `AnalysisData`，在文件末尾追加一行 `export type { <实际根名> as AnalysisData }` 别名，或调整（pydantic 的 `title` 为 "AnalysisData"，正常应直接是该名）。报告实际情况。

- [ ] **Step 3: 类型检查仍通过**

Run: `cd frontend && npm run typecheck`
Expected: 通过（新类型文件不应引入错误）。

- [ ] **Step 4: 提交（提交生成的 analysis.ts；schema.json 已 gitignore）**

```bash
git add frontend/src/types/analysis.ts
git commit -m "feat(frontend): 由 schema.py 生成 TS 类型 analysis.ts（前后端类型同源）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
（确认 `schema.json` 未被提交——已 gitignore。约定：`schema.py` 改动后需 `npm run gen:types` 重新生成。）

---

### Task 3: 统一 API 客户端

**Files:** Create `frontend/src/api/client.ts`、`frontend/src/api/client.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/api/client.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiRequestError } from './client'

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok, status, json: async () => body,
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('returns data on success', async () => {
    mockFetchOnce({ success: true, records: [1, 2] })
    const data = await api.get<{ success: boolean; records: number[] }>('/api/x')
    expect(data.records).toEqual([1, 2])
  })

  it('throws ApiRequestError with code on {success:false}', async () => {
    mockFetchOnce({ success: false, code: 'validation_error', message: '缺少必填字段' })
    await expect(api.get('/api/x')).rejects.toMatchObject({
      name: 'ApiRequestError', code: 'validation_error', message: '缺少必填字段',
    })
  })

  it('throws on non-ok HTTP without success flag', async () => {
    mockFetchOnce(null, false, 500)
    await expect(api.get('/api/x')).rejects.toBeInstanceOf(ApiRequestError)
  })

  it('post sends JSON body', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', f)
    await api.post('/api/y', { a: 1 })
    expect(f).toHaveBeenCalledWith('/api/y', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    }))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL（找不到 `./client`）。

- [ ] **Step 3: 写实现 `frontend/src/api/client.ts`**

```ts
// 统一 API 客户端：消费后端 {success, code, message} 错误约定（见 server.py _error_payload）
export class ApiRequestError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  let data: any = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (data && data.success === false) {
    throw new ApiRequestError(data.code ?? 'internal_error', data.message ?? '请求失败')
  }
  if (!res.ok) {
    throw new ApiRequestError(`http_${res.status}`, `HTTP ${res.status}`)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: PASS（4 passed）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/api/client.ts frontend/src/api/client.test.ts
git commit -m "feat(frontend): 统一 API 客户端（消费 {success,code,message}）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 数据加载 Pinia store

**Files:** Create `frontend/src/stores/data.ts`、`frontend/src/stores/data.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/stores/data.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDataStore } from './data'

const SAMPLE = {
  meta: { lastUpdate: '2026-06-03 10:00', totalProjects: 2, totalPaymentNodes: 3 },
  dashboard: { totalProjectCount: 2, totalPaymentNodes: 3, totalPaidNodes: 1 },
  summary: {}, rawNodes: [{ projectId: 'P1' }, { projectId: 'P2' }],
  projectOverview: { projects: [], columns: [] },
  naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
}

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

describe('data store', () => {
  it('loads analysis data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => SAMPLE }))
    const store = useDataStore()
    await store.load()
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.data?.meta.totalProjects).toBe(2)
    expect(store.data?.rawNodes.length).toBe(2)
  })

  it('records error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => null }))
    const store = useDataStore()
    await store.load()
    expect(store.data).toBeNull()
    expect(store.error).toContain('404')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/stores/data.test.ts`
Expected: FAIL（找不到 `./data`）。

- [ ] **Step 3: 写实现 `frontend/src/stores/data.ts`**

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AnalysisData } from '@/types/analysis'

// 数据源：preprocess_data.py 生成的 data/analysis_data.json（开发期经 Vite 代理到 :8080）
export const useDataStore = defineStore('data', () => {
  const data = ref<AnalysisData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch('/data/analysis_data.json')
      if (!res.ok) throw new Error(`加载数据失败 HTTP ${res.status}`)
      data.value = (await res.json()) as AnalysisData
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, load }
})
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/stores/data.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 类型检查**

Run: `cd frontend && npm run typecheck`
Expected: 通过（store 正确 import `@/types/analysis` 的 `AnalysisData`）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/stores/data.ts frontend/src/stores/data.test.ts
git commit -m "feat(frontend): 数据加载 Pinia store（typed AnalysisData）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 最小 shell（证明数据贯通）

**Files:** Modify `frontend/src/views/HomeView.vue`；Create `frontend/src/views/HomeView.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/views/HomeView.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import HomeView from './HomeView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => setActivePinia(createPinia()))

describe('HomeView', () => {
  it('renders meta lastUpdate and rawNodes count from store', async () => {
    const store = useDataStore()
    store.data = {
      meta: { lastUpdate: '2026-06-03 10:00', totalProjects: 2, totalPaymentNodes: 3 },
      dashboard: { totalProjectCount: 2, totalPaymentNodes: 3, totalPaidNodes: 1 },
      summary: {}, rawNodes: [{ projectId: 'P1' }, { projectId: 'P2' }],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const wrapper = mount(HomeView)
    expect(wrapper.text()).toContain('2026-06-03 10:00')
    expect(wrapper.text()).toContain('2')  // rawNodes 数
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/HomeView.test.ts`
Expected: FAIL（占位组件不含这些文本）。

- [ ] **Step 3: 写实现 `frontend/src/views/HomeView.vue`**

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useDataStore } from '@/stores/data'

const store = useDataStore()
onMounted(() => {
  if (!store.data) store.load()
})
</script>

<template>
  <div class="home">
    <h1>项目回款跟踪与管控平台</h1>
    <p v-if="store.loading">加载中…</p>
    <p v-else-if="store.error" class="error">数据加载失败：{{ store.error }}</p>
    <div v-else-if="store.data">
      <p>数据更新时间：{{ store.data.meta.lastUpdate }}</p>
      <p>回款节点数：{{ store.data.rawNodes.length }}</p>
    </div>
    <p v-else>暂无数据，请先在数据管理中同步/导入。</p>
  </div>
</template>
```

- [ ] **Step 4: 运行确认通过 + 全量前端测试 + 类型检查 + 构建**

Run: `cd frontend && npx vitest run src/views/HomeView.test.ts`（PASS）
Run: `cd frontend && npm run test:run`（全部前端测试通过）
Run: `cd frontend && npm run typecheck`（通过）
Run: `cd frontend && npm run build`（构建成功）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/HomeView.vue frontend/src/views/HomeView.test.ts
git commit -m "feat(frontend): 最小 shell 渲染数据（meta + rawNodes 数）+ 组件测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 接入 verify.sh + 文档收尾

**Files:** Modify `verify.sh`、`CLAUDE.md`、`PROGRESS.md`。

- [ ] **Step 1: verify.sh 增加前端检查（node 不在则跳过，镜像现有 skip 模式）**

在 `verify.sh` 的 pytest 步骤之后、最终判定之前，插入一段（步骤编号相应改为 4 步）：
```bash
echo "==> [4/4] 前端检查 (typecheck + vitest + build)"
if [ -f frontend/package.json ] && command -v npm >/dev/null 2>&1; then
  if [ ! -d frontend/node_modules ]; then
    echo "    [SKIP] frontend/node_modules 不存在，先运行 cd frontend && npm install"
  elif ( cd frontend && npm run typecheck --silent && npm run test:run --silent && npm run build --silent ); then
    echo "    OK: 前端检查通过"
  else
    echo "    [FAIL] 前端检查未通过"; fail=1
  fi
else
  echo "    [SKIP] 未检测到 frontend 或 npm，跳过前端检查"
fi
```
同时把前面三步的 `[1/3]/[2/3]/[3/3]` 标题改为 `[1/4]/[2/4]/[3/4]`。

- [ ] **Step 2: 运行 verify.sh**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（含后端 75 pytest + 前端 typecheck/vitest/build 全绿）。

- [ ] **Step 3: 更新 CLAUDE.md（补前端开发说明）**

在 `CLAUDE.md` 的"运行/调试"附近新增一节：
```markdown
## 前端（Vue3 + Vite，frontend/）
- 安装：`cd frontend && npm install`
- 开发：先 `python server.py`(:8080) 提供 /api 与 /data，再 `cd frontend && npm run dev`(:5173，已代理 /api、/data)
- 类型同源：改了 `schema.py` 后运行 `cd frontend && npm run gen:types` 重新生成 `src/types/analysis.ts`
- 测试/构建：`npm run test:run` / `npm run typecheck` / `npm run build`（dist/ 由 Phase C 接入 server.py 与打包）
```

- [ ] **Step 4: 更新 PROGRESS.md**

- 在 Backlog 适当位置（新建 "Phase B 前端" 小节或并入）追加：
  ```
  - [x] **B1** 前端脚手架与基建：Vue3+Vite+TS 工程、由 schema.py 生成 analysis.ts（类型同源）、统一 API 客户端、数据加载 Pinia store、最小 shell、verify.sh 接入前端检查。
  - [ ] **B2** 布局（header/sidebar/年份·视角 dock）+ 通用组件（DataTable 封装 el-table / ChartBox 封装 vue-echarts / Modal）。
  - [ ] **B3+** 各页面迁移：看板 → 分层五页 → 台账/PM → 日历 → 临期跟进 → 数据管理 → 区间对比/关于。
  ```
- 更新"最近更新"为 `2026-06-03`；"验证基线"补充"+ 前端 typecheck/vitest/build"。

- [ ] **Step 5: 提交**

```bash
git add verify.sh CLAUDE.md PROGRESS.md
git commit -m "chore: verify.sh 接入前端检查；文档记录前端开发流程与 B1 完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（对照 spec §6 前端基建子里程碑 1 的"脚手架 + dataStore + API 层 + 类型同源"部分）：**
- 脚手架（Vite+Vue+TS+Pinia+Router+Element Plus+vue-echarts）→ Task 1 ✓
- 类型同源（schema.py → JSON Schema → analysis.ts）→ Task 2 ✓
- 统一 API 客户端（消费 {success,code,message}）→ Task 3 ✓
- 数据加载 store（消费 analysis_data.json）→ Task 4 ✓
- 最小可运行 shell → Task 5 ✓
- 接入 harness 验证 → Task 6 ✓
- **明确留给后续计划**：布局（header/sidebar/docks）+ 通用组件 DataTable/ChartBox/Modal → **B2**；各页面 → **B3+**；server.py 服务 dist/ + PyInstaller 打包 → **Phase C**。

**Placeholder scan：** 所有配置/源码/测试均给出完整内容；npm/git 命令含预期输出。Task 2 Step 2 对"生成根类型名非 AnalysisData"的兜底已给出别名方案并要求报告实际情况。无 TBD/TODO。

**一致性：** `useDataStore`/`api`/`ApiRequestError`/`AnalysisData`(来自 analysis.ts) 在各任务定义与引用一致；路径别名 `@/*` 在 tsconfig 与 vite.config 同时配置；data store 与 HomeView、测试一致；API 客户端错误约定与 A3 的 `_error_payload`(code/message) 对齐；数据路径 `/data/analysis_data.json` 与 A1 输出、Vite 代理一致。

**风险点：**
- npm 依赖版本：用 caret 范围，本机 Node 24 应可装；若某 peer 冲突导致 `npm install` 失败，Task 1 Step 10 要求报告而非擅自降级（控制器决定调整版本）。
- `json2ts` 生成的根接口名理论上为 `AnalysisData`（pydantic title），Task 2 已含兜底。
- 前端测试用 jsdom + mock fetch，确定性好；不依赖运行中的后端。

---

## Execution Handoff

见会话中执行方式选择（建议同前：subagent-driven-development）。
