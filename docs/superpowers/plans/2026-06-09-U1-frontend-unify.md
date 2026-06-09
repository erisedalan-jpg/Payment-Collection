# U1 前端统一(后端服务 Vue dist + 删旧版 UI)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把系统统一到"Vue 应用 + Python API/数据后端"一套架构:后端服务 `frontend/dist`(含 SPA 回退),删除旧版原生 UI,并修复数据治理页因缓存导致的空白。

**Architecture:** `server.py` 的 Web 根从仓库根目录改为 `frontend/dist`(打包态走 `_MEIPASS/dist`),未命中文件回退 `dist/index.html` 以支持 Vue Router history 模式;`/api/*`、`/data/*` 优先级最高。前端数据仓库拉取防缓存,治理页空态按"未加载 / 无治理信息 / 未提供 PMIS"三态区分。删除旧 UI 文件与后端对 `analysis_data.js` 的残留引用。

**Tech Stack:** Python 标准库 http.server;Vue3 `<script setup>` + Pinia + Vitest;PyInstaller(.spec)。验证 `bash verify.sh`。

**关键既有事实(实现时遵循):**
- `server.py` 类名是 `CustomHandler`(不是 PaymentHandler);`__init__` 用 `directory=STATIC_DIR`;`translate_path` 已实现"STATIC_DIR 优先、找不到回退 BASE_DIR"。`STATIC_DIR` 定义:frozen=`sys._MEIPASS`,dev=`BASE_DIR`。
- `do_GET`(约 277-306):`/api/*` 分支在前,`.js/.css/.html` 走 `_serve_static_with_charset`,其余 `super().do_GET()`。
- `_get_node_action_date(project_id)`(约 160-181)正则扫 `data/analysis_data.js`;调用点在约 566(跟进新增时预填)。
- `handle_clear_data`(约 404-431)删 `data/analysis_data.js`。
- 前端 `stores/data.ts`:`load()` 用 `fetch('/data/analysis_data.json')`(无防缓存);`reload()` 已用 `?t=`。
- `DataQualityView.vue`:`provided = !!dq.value?.summary?.pmisProvided`,`v-if="!provided"` 单一空态。
- dist 结构:`frontend/dist/index.html` + `frontend/dist/assets/*`(由 `npm run build` 生成,gitignore)。
- 当前版本 `frontend/src/version.ts` = V6.1.0。
- 约定:frozen/dev 双路径;无 emoji;**禁止 `git add -A`/`git add .`**;`input/`、`data/`、`frontend/dist/` 不提交。

---

### Task 1: 数据治理页防缓存 + 空态三态(直接修复"治理页空白")

**Files:**
- Modify: `frontend/src/stores/data.ts`(`load()` 加 `?t=`)
- Modify: `frontend/src/stores/data.test.ts`(若存在则加用例;否则在该文件追加)
- Modify: `frontend/src/views/DataQualityView.vue`(空态三态)
- Modify: `frontend/src/views/DataQualityView.test.ts`(三态断言)

- [ ] **Step 1: 写失败测试 — data store load() 防缓存**

在 `frontend/src/stores/data.test.ts` 追加(若文件无 `setActivePinia` 初始化则补 `beforeEach`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from './data'

describe('useDataStore load 防缓存', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('load() 拉取 URL 带防缓存参数 ?t=', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock as any)
    const store = useDataStore()
    await store.load()
    const url = fetchMock.mock.calls[0][0] as string
    expect(url.startsWith('/data/analysis_data.json?t=')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/stores/data.test.ts`
Expected: 新用例 FAIL(URL 不含 `?t=`)。

- [ ] **Step 3: 实现 load() 防缓存**

`frontend/src/stores/data.ts` 的 `load()` 内,把:
```ts
      const res = await fetch('/data/analysis_data.json')
```
改为:
```ts
      const res = await fetch('/data/analysis_data.json?t=' + Date.now())
```
(只改 `load()`;`reload()` 保持不变。)

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/stores/data.test.ts`
Expected: PASS。

- [ ] **Step 5: 写失败测试 — 治理页空态三态**

把 `frontend/src/views/DataQualityView.test.ts` 替换为(在原有两个用例基础上补两态;保留原 seed 辅助):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import DataQualityView from './DataQualityView.vue'

function seed(d: any) {
  const store = useDataStore()
  ;(store as any).data = d
}

describe('DataQualityView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })) as any)
  })

  it('数据未加载时提示加载/后端', () => {
    seed(null)
    const w = mount(DataQualityView)
    expect(w.text()).toContain('加载')
  })

  it('数据无 dataQuality 时提示重新同步', () => {
    seed({ rawNodes: [], projectOverview: { projects: [], columns: [] } })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('不含治理信息')
  })

  it('PMIS 未提供时提示未提供 PMIS', () => {
    seed({ dataQuality: { summary: { pmisProvided: false }, themes: [], unmatched: [], backfill: [], conflicts: [], dirty: [] } })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('未提供 PMIS')
  })

  it('提供时渲染记分卡 + 未匹配计数', () => {
    seed({
      dataQuality: {
        summary: { pmisProvided: true, joinRate: 0.98, matchedActive: 462, matchedClosed: 158, unmatched: 8 },
        themes: [{ theme: '成本预算', verdict: 'yellow', coveragePct: 0.5, fields: [] }],
        unmatched: [{ projectId: 'SF-1', projectName: '甲', kind: 'SF售前' }],
        backfill: [], conflicts: [], dirty: [],
      },
    })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('98')
    expect(w.text()).toContain('成本预算')
    expect(w.find('[data-test="unmatched-count"]').text()).toContain('1')
  })
})
```

- [ ] **Step 6: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/DataQualityView.test.ts`
Expected: 新增的"加载""不含治理信息"两用例 FAIL(当前空态只有一句"未提供 PMIS")。

- [ ] **Step 7: 实现三态空态**

`frontend/src/views/DataQualityView.vue` `<script setup>` 内,在 `const dq = ...` 之后增加两个 computed:
```ts
const loaded = computed(() => !!data.data)
const hasQuality = computed(() => !!dq.value)
```
模板里,把原来的:
```html
    <div v-if="!provided" class="dq-empty">
      未提供 PMIS 数据。请到「数据管理」页录入下载链接并下载,或把 PMIS 七个 xlsx 放入 input/pmis/ 后重新同步。
    </div>
    <template v-else>
```
替换为:
```html
    <div v-if="!loaded" class="dq-empty">
      数据加载中或加载失败,请确认后端服务在运行。
    </div>
    <div v-else-if="!hasQuality" class="dq-empty">
      当前数据不含治理信息,请重新同步或导入后再查看。
    </div>
    <div v-else-if="!provided" class="dq-empty">
      未提供 PMIS 数据。请到「数据管理」页录入下载链接并下载,或把 PMIS 七个 xlsx 放入 input/pmis/ 后重新同步。
    </div>
    <template v-else>
```

- [ ] **Step 8: 运行确认通过 + typecheck**

Run: `cd frontend && npx vitest run src/views/DataQualityView.test.ts src/stores/data.test.ts && npm run typecheck`
Expected: 全 PASS;typecheck 0 错误。

- [ ] **Step 9: 提交**

```bash
git add frontend/src/stores/data.ts frontend/src/stores/data.test.ts frontend/src/views/DataQualityView.vue frontend/src/views/DataQualityView.test.ts
git commit -m "fix(U1): 治理页防缓存(load 加 ?t=)+ 空态三态诊断"
```

---

### Task 2: 后端服务 Vue dist + SPA 回退

**Files:**
- Modify: `server.py`(WEB_ROOT 常量、handler directory、SPA 回退、dist 缺失提示)
- Test: `tests/test_server_spa.py`(纯函数 SPA 判定)

- [ ] **Step 1: 写失败测试 — SPA 回退判定纯函数**

创建 `tests/test_server_spa.py`:
```python
# -*- coding: utf-8 -*-
import server as S


class TestShouldSpaFallback:
    def test_api_never_fallback(self):
        assert S.should_spa_fallback('/api/sync') is False
    def test_data_never_fallback(self):
        assert S.should_spa_fallback('/data/analysis_data.json') is False
    def test_static_asset_path_no_fallback(self):
        # 带扩展名的静态资源不回退(交给文件服务/404)
        assert S.should_spa_fallback('/assets/index-abc.js') is False
    def test_spa_route_fallback(self):
        assert S.should_spa_fallback('/governance') is True
        assert S.should_spa_fallback('/board') is True
    def test_root_fallback(self):
        assert S.should_spa_fallback('/') is True
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_spa.py -q`
Expected: FAIL(`AttributeError: module 'server' has no attribute 'should_spa_fallback'`)。

- [ ] **Step 3: 实现 WEB_ROOT + should_spa_fallback + 服务 dist + 回退**

在 `server.py` 顶部 `STATIC_DIR` 定义之后(约 54 行后)新增 Web 根:
```python
# 前端 Web 根:打包态用内置 dist,开发态用 frontend/dist
if getattr(sys, 'frozen', False):
    WEB_ROOT = os.path.join(STATIC_DIR, 'dist')
else:
    WEB_ROOT = os.path.join(BASE_DIR, 'frontend', 'dist')
```

在模块级(`CustomHandler` 之前)新增纯函数:
```python
def should_spa_fallback(path: str) -> bool:
    """判断一个 GET 路径是否应回退到 dist/index.html(Vue Router history 模式)。
    规则:/api、/data、/yundocs_data 前缀不回退;带文件扩展名的(静态资源)不回退;其余视为前端路由,回退。"""
    if path.startswith('/api') or path.startswith('/data') or path.startswith('/yundocs_data'):
        return False
    last = path.rsplit('/', 1)[-1]
    if '.' in last:  # 形如 index-abc.js / x.css / favicon.ico
        return False
    return True
```

把 `CustomHandler.__init__` 的 `directory=STATIC_DIR` 改为 `directory=WEB_ROOT`。

在 `do_GET` 的最末 `else` 分支(原 `super().do_GET()`)替换为:先尝试真实文件,未命中且应回退则发 `dist/index.html`:
```python
        else:
            # 真实存在的文件(dist 内或 BASE_DIR 内运行时数据)正常服务
            translated = self.translate_path(parsed.path)
            if os.path.isfile(translated):
                super().do_GET()
                return
            # Vue Router history 回退
            if should_spa_fallback(parsed.path):
                self._serve_spa_index()
                return
            super().do_GET()  # 交给默认 404
```

新增 handler 方法 `_serve_spa_index`(在 `_serve_static_with_charset` 附近):
```python
    def _serve_spa_index(self):
        index_path = os.path.join(WEB_ROOT, 'index.html')
        if not os.path.isfile(index_path):
            # dist 未构建:给明确提示,而非空白/404
            msg = '前端尚未构建。请运行: cd frontend && npm run build'
            body = msg.encode('utf-8')
            self.send_response(503)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        with open(index_path, 'rb') as f:
            content = f.read()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)
```

- [ ] **Step 4: 运行确认通过 + 语法**

Run:
```bash
python -m pytest tests/test_server_spa.py -q
python -m py_compile server.py
python -m ruff check server.py
```
Expected: 测试 PASS;py_compile 无错;ruff 通过。

- [ ] **Step 5: 手动冒烟(分发态路径)**

```bash
cd frontend && npm run build && cd ..
python server.py   # 另开终端;或后台启动后 curl
```
浏览器/curl 验证:`GET /` 返回 Vue `index.html`;`GET /governance` 返回 `index.html`(200,不 404);`GET /data/analysis_data.json` 正常;`GET /api/pmis/links` 正常。验证后停止服务。
(若环境不便后台起停,跳过实测并在报告说明,改为逐行对照 `should_spa_fallback`/`_serve_spa_index` 逻辑确认。)

- [ ] **Step 6: 提交**

```bash
git add server.py tests/test_server_spa.py
git commit -m "feat(U1): 后端服务 frontend/dist + SPA 回退(WEB_ROOT, frozen/dev)"
```

---

### Task 3: 清理后端对 analysis_data.js 的引用

**Files:**
- Modify: `server.py`(`_get_node_action_date`、`handle_clear_data`)
- Test: `tests/test_server_node_action.py`

- [ ] **Step 1: 写失败测试 — 从 JSON 取 nextActionDate 的纯函数**

创建 `tests/test_server_node_action.py`:
```python
# -*- coding: utf-8 -*-
import server as S


class TestNodeActionDateFromData:
    def test_finds_next_action_date(self):
        data = {"rawNodes": [
            {"projectId": "P-1", "nextActionDate": ""},
            {"projectId": "P-1", "nextActionDate": "2026-07-01"},
            {"projectId": "P-2", "nextActionDate": "2026-08-01"},
        ]}
        assert S.node_action_date_from_data(data, "P-1") == "2026-07-01"
    def test_missing_project_returns_empty(self):
        assert S.node_action_date_from_data({"rawNodes": []}, "P-9") == ""
    def test_bad_data_returns_empty(self):
        assert S.node_action_date_from_data({}, "P-1") == ""
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_node_action.py -q`
Expected: FAIL(`has no attribute 'node_action_date_from_data'`)。

- [ ] **Step 3: 实现 + 改造调用**

在 `server.py` 模块级新增纯函数:
```python
def node_action_date_from_data(data: dict, project_id: str) -> str:
    """从 analysis_data.json 的数据结构里,取某项目首个非空 nextActionDate。"""
    try:
        for n in data.get('rawNodes', []):
            if str(n.get('projectId', '')) == str(project_id) and n.get('nextActionDate'):
                return n.get('nextActionDate')
    except Exception:
        return ''
    return ''
```

把 `_get_node_action_date`(约 160-181)整体替换为读 JSON 并委托上面纯函数:
```python
def _get_node_action_date(project_id):
    """从 analysis_data.json 读取项目的节点动作完成时间(nextActionDate)。"""
    data_file = os.path.join(BASE_DIR, 'data', 'analysis_data.json')
    if not os.path.exists(data_file):
        return ''
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return ''
    return node_action_date_from_data(data, project_id)
```

`handle_clear_data`(约 404-431):把 `data_file = os.path.join(BASE_DIR, 'data', 'analysis_data.js')` 改为 `'analysis_data.json'`;并在删除该文件后,顺带清理可能遗留的旧 `analysis_data.js`:
```python
        data_file = os.path.join(BASE_DIR, 'data', 'analysis_data.json')
        legacy_js = os.path.join(BASE_DIR, 'data', 'analysis_data.js')
```
在"删除分析数据文件"那段之后追加:
```python
        # 清理可能遗留的旧版数据文件
        if os.path.exists(legacy_js):
            try:
                os.remove(legacy_js)
            except Exception:
                pass
```

- [ ] **Step 4: 运行确认通过 + 语法**

Run:
```bash
python -m pytest tests/test_server_node_action.py -q
python -m py_compile server.py
python -m ruff check server.py
```
Expected: PASS;无错;ruff 通过。

- [ ] **Step 5: 提交**

```bash
git add server.py tests/test_server_node_action.py
git commit -m "refactor(U1): 后端改读 analysis_data.json(nextActionDate + 清空数据)"
```

---

### Task 4: 删除旧版 UI 文件

**Files:**
- Delete: `index.html`、`app.js`、`style.css`、`lib/echarts.min.js`、`lib/xlsx.full.min.js`

- [ ] **Step 1: 确认无代码再引用这些旧文件(fonts 暂留)**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
grep -rn "app.js\|style.css\|lib/echarts\|lib/xlsx" --include=*.py . | grep -v "frontend/" || echo "OK: 无 .py 引用"
```
Expected: 仅可能出现在 `PaymentReviewApp.spec`(Task 5 处理);若 `server.py` 等仍直接引用则说明遗漏,需回到 Task 2/3 处理(预期不出现)。

- [ ] **Step 2: 删除旧 UI 文件**

```bash
git rm index.html app.js style.css lib/echarts.min.js lib/xlsx.full.min.js
```
(若 `lib/` 删空后仍有其他文件则保留目录;`fonts/` 本期不动。)

- [ ] **Step 3: 验证前端构建与后端语法不受影响**

Run:
```bash
python -m py_compile server.py
cd frontend && npm run build
```
Expected: server 语法 OK;前端 dist 构建成功(Vue 不依赖被删的旧文件)。

- [ ] **Step 4: 提交**

```bash
git commit -m "chore(U1): 删除旧版原生 UI(index.html/app.js/style.css/lib 图表库)"
```

---

### Task 5: 打包配置改为内置 dist

**Files:**
- Modify: `PaymentReviewApp.spec`

- [ ] **Step 1: 改 datas — 去旧 UI、加 dist、补新模块**

在 `PaymentReviewApp.spec` 的 `datas=[...]` 中:
- 删除三行:`('index.html', '.')`、`('style.css', '.')`、`('app.js', '.')`、以及 `('lib', 'lib')`。
- 新增:`('frontend/dist', 'dist')`。
- 在"后端脚本"区新增(供 frozen 下 importlib 动态执行的预处理链使用):
  ```python
        ('pmis.py', '.'),
        ('pmis_download.py', '.'),
        ('config.py', '.'),
        ('schema.py', '.'),
  ```
（若这些已在别处声明则不重复。）

- [ ] **Step 2: 语法校验 spec + datas 路径存在**

Run:
```bash
python -c "compile(open('PaymentReviewApp.spec',encoding='utf-8').read(), 'PaymentReviewApp.spec', 'exec'); print('spec syntax OK')"
ls frontend/dist/index.html pmis.py pmis_download.py config.py schema.py
```
Expected: 打印 `spec syntax OK`;列出的文件都存在(dist 需先 `npm run build`)。
说明:frozen 完整验证需实际 `pyinstaller` 构建 exe,属分发前人工步骤,本任务不在 CI 内执行。

- [ ] **Step 3: 提交**

```bash
git add PaymentReviewApp.spec
git commit -m "build(U1): 打包内置 frontend/dist,移除旧 UI,补 pmis/config/schema 模块"
```

---

### Task 6: 全量验证 + 版本 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: 末尾 `[PASS] verify.sh 全部通过`(py_compile + ruff + pytest + 前端 typecheck/vitest/build 全绿)。如失败,读输出最小修正。

- [ ] **Step 2: 端到端冒烟(分发态)**

```bash
cd frontend && npm run build && cd ..
python server.py
```
打开后端单一地址:首页即 Vue 应用;`/governance` 直接访问/刷新显示数据(PMIS 已放置时;空 PMIS 时显"未提供 PMIS",非空白);同步/导入/PMIS/清空均可用。验证后停止。

- [ ] **Step 3: 版本 + PROGRESS**

`frontend/src/version.ts`:
```ts
export const APP_VERSION = 'V6.2.0'
export const RELEASE_DATE = '2026-06-09'
```

`PROGRESS.md` 进度处追加(沿用现有格式):
```
- U1 前端统一完成:后端服务 frontend/dist + Vue Router SPA 回退;删除旧版 UI(index.html/app.js/style.css/lib 图表库);后端改读 analysis_data.json(nextActionDate + 清空数据);数据治理页防缓存(load 加 ?t=)+ 空态三态诊断,修复治理页空白;打包内置 dist。后续 U2:数据管理页重构 + 三处质量面整合。
```
若有顶部"最近更新/当前版本"行,同步为 U1 / V6.2.0。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "docs(U1): 版本 V6.2.0 + PROGRESS 记录前端统一完成"
```

---

## Self-Review

**1. Spec coverage(对照 U1 spec):**
- 后端服务 dist + SPA 回退 → Task 2 ✓
- 删旧版 UI 文件 → Task 4 ✓
- 清理后端旧引用(_get_node_action_date / clear-data → json)→ Task 3 ✓
- 治理页防缓存 + 空态三态 → Task 1 ✓
- 打包内置 dist + 补模块 → Task 5 ✓
- 验证 / 版本 / PROGRESS → Task 6 ✓
- frozen/dev 双路径 → Task 2(WEB_ROOT 双分支)✓
- fonts 暂不删 → Task 4 明确不动 ✓

**2. Placeholder scan:** 无 TBD/TODO;每个改动给出完整代码与可执行命令、预期输出。后端 HTTP 行为以纯函数(`should_spa_fallback`/`node_action_date_from_data`)做 TDD,HTTP 整体走 py_compile + 手动冒烟(诚实标注 frozen/起停限制)。✓

**3. Type/命名一致性:**
- `WEB_ROOT`、`should_spa_fallback`、`_serve_spa_index`、`node_action_date_from_data` 全程一致。
- Task 1 `loaded`/`hasQuality`/`provided` 三 computed 与模板 `v-if/v-else-if` 链一致。
- `load()` 改 URL 与其测试断言(`?t=` 前缀)一致。
- 删除清单(Task 4)与打包移除项(Task 5)一致(index.html/app.js/style.css/lib)。✓
