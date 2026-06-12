# R3 数据管理页重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** /data 按「分组卡片+统一行结构」整页重排（用户已选版式 A）；4 个真实直链作默认值（可改可重置）；PMIS 九表（+里程碑两入口）与 input/ 根 5 CSV 上传白名单扩展；每文件最近更新时间。版本 V7.9.0。

**Architecture:** 后端三件——config.DEFAULT_LINKS + /api/pmis/links GET 默认值兜底合并（纯函数 merged_pmis_links）+ 新 GET /api/files/status（纯函数 collect_file_status，固定名单防任意路径）；pmis_download/上传白名单升九表。前端——useInputFiles/usePmisSync 名单扩展 + 新 useFileStatus + DataView 整页重写（五卡）。母 spec §4。

**Tech Stack:** Python 标准库 + Vue3/Vitest。分支 `feat/phase-r3-data-management`。

## 实测事实（写代码前必读）

- **两处既有缺口本期必修**：① 前端 `useInputFiles.INPUT_FILE_NAMES` 仍是旧三文件（含 delivery_analysis.xlsx），R1 后端白名单已扩 csv——现在从 UI 上传任何 CSV 会被**客户端静默跳过**；② `server.py:31 _PMIS_UPLOAD_NAMES` 仅七表，里程碑两表上传会被 400 拒。
- links 机制：`data/pmis_links.json` 形如 `{"links": {文件名: url}}`；GET/POST `/api/pmis/links`（server.py:839-869）；`pmis_download.plan_downloads` 只下载 `_ALL_PMIS_NAMES` 内且 URL 非空的项（pmis_download.py:18-23）→ links store 加非 PMIS 键（如 WPS）安全。
- `useCloudSync.start(url)` 接收 URL（composable 不管持久化）；`usePmisSync` 的 links/loadLinks/saveLinks/download/upload 已就绪（PMIS_FILE_NAMES 硬编码七表需扩九）。
- config 现状：`PMIS_FILES_ACTIVE/CLOSED`（七表）、`MILESTONE_FILE_ACTIVE/CLOSED`、`INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE, DELIVERY_FILE_LEGACY]`、四个 CSV 常量（PAYMENT_RECORDS_FILE/PROFIT_DIRECT_FILE/PROFIT_BRIDGE_FILE/BUDGET_FILE）。
- 四个真实直链（用户提供，作默认值）：
  - 回款数据(WPS)：`https://yundocs.qianxin-inc.cn/weboffice/l/sRs8GgCmE2ygb`
  - 项目状态信息数据.xlsx：`https://pmis.qianxin-inc.cn/design/cache/cacheProjectsStatus/exportProjectStatusExcel.pd?params=null&projSearch=&isArchive=0&isMyProject=0&projectType=&parentWbsId=&deptId=&advancedQueryArray=`
  - 项目状态信息数据-已关闭.xlsx：同上但 `isArchive=1`
  - 项目风险数据.xlsx：`https://pmis.qianxin-inc.cn/design/risk/projRisklibrary/exportProjExcel.pd?params=null&searchValue=&deleteFlag=0&riskLevel=&realm=&projStage=&status=&projIdType=1&parentWbsId=&deptId=&projId=&advancedQueryArray=`
- 其余 6 文件（基础信息×2/项目中心×2/里程碑×2）是 blob 临时地址不可下载 → 行内**徽章「无直链·需手动导出上传」**，不渲染链接输入（用户选定版式 A 如此）。
- 默认值合并规则：**已保存键胜出**（含显式空串），默认仅补未保存键；GET 响应同时带 defaults 供前端「重置」。
- 版式 A 五卡：回款数据 / PMIS 九表 / 项目域文件（input/ 根）/ 更新数据 / 设置。每文件行含最近更新时间（新 /api/files/status）。
- frozen：本期只改 server.py/config.py/pmis_download.py（均已在 .spec datas），无新 py 文件。

## 分级调度

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | 后端：DEFAULT_LINKS/九表白名单/links 合并/files-status + pytest | 中-高 | opus | 主循环核验 |
| T2 | 前端：composables 扩展 + useFileStatus + DataView 整页重写 + 测试 | 高 | opus | 主循环真实目检 |
| T3 | 版本 V7.9.0 + PROGRESS + verify + 终审 | 低 | 主循环 | opus 终审 |

---

### Task 1: 后端（config/server/pmis_download + pytest）

**Files:**
- Modify: `config.py`（CSV 常量区后）
- Modify: `server.py:31-36`（白名单）、`server.py:839-853`（links GET）、GET 路由区（345 附近）+ 新 handler
- Modify: `pmis_download.py:18`（九表）+ docstring
- Test: `tests/test_server_links_status.py`（新建）、`tests/test_pmis_download.py`（补断言）

- [ ] **Step 1: 写失败测试 tests/test_server_links_status.py**

```python
# -*- coding: utf-8 -*-
import os
import config
import server as S


class TestMergedPmisLinks:
    def test_default_fills_absent_keys_only(self):
        saved = {"项目状态信息数据.xlsx": "http://custom", "项目中心.xlsx": ""}
        m = S.merged_pmis_links(saved)
        assert m["项目状态信息数据.xlsx"] == "http://custom"          # 保存值胜出
        assert m["项目中心.xlsx"] == ""                               # 显式空串保留
        assert m["项目风险数据.xlsx"] == config.DEFAULT_LINKS["项目风险数据.xlsx"]  # 缺省键补默认
        assert m[config.WPS_LINK_KEY] == config.DEFAULT_LINKS[config.WPS_LINK_KEY]

    def test_none_saved(self):
        assert S.merged_pmis_links(None) == config.DEFAULT_LINKS


class TestCollectFileStatus:
    def test_known_files_mtime_and_missing_none(self, tmp_path):
        pmis_dir = tmp_path / "input" / config.PMIS_DIRNAME
        pmis_dir.mkdir(parents=True)
        (pmis_dir / config.MILESTONE_FILE_ACTIVE).write_bytes(b"x")
        (tmp_path / "input" / config.PAYMENT_RECORDS_FILE).write_bytes(b"y")
        st = S.collect_file_status(str(tmp_path))
        assert st[config.MILESTONE_FILE_ACTIVE] is not None        # 有文件 → 时间串
        assert len(st[config.MILESTONE_FILE_ACTIVE]) == 16          # 'YYYY-MM-DD HH:MM'
        assert st[config.PAYMENT_RECORDS_FILE] is not None
        assert st["项目中心.xlsx"] is None                           # 缺失 → None
        # 名单覆盖:九表 + input 根白名单全部在键中
        for name in config.PMIS_ALL_FILENAMES:
            assert name in st
        for name in config.INPUT_UPLOAD_NAMES:
            assert name in st


class TestWhitelists:
    def test_pmis_upload_allows_milestones(self):
        assert S.is_valid_pmis_name(config.MILESTONE_FILE_ACTIVE) is True
        assert S.is_valid_pmis_name(config.MILESTONE_FILE_CLOSED) is True
        assert S.is_valid_pmis_name("../evil.xlsx") is False

    def test_inputs_upload_allows_csvs(self):
        for name in [config.PAYMENT_RECORDS_FILE, config.PROFIT_DIRECT_FILE,
                     config.PROFIT_BRIDGE_FILE, config.BUDGET_FILE]:
            assert S.is_valid_input_name(name) is True
```

- [ ] **Step 2: 跑红**

Run: `python -m pytest tests/test_server_links_status.py -q`
Expected: FAIL（DEFAULT_LINKS/merged_pmis_links/collect_file_status/PMIS_ALL_FILENAMES 不存在；里程碑名 False）

- [ ] **Step 3: config.py 扩展（PAYMENT_RECORDS_FILE 行后）**

```python
# PMIS 全量文件名(九表=七表+里程碑两表;上传白名单/下载候选,Phase R3)
PMIS_ALL_FILENAMES = (list(PMIS_FILES_ACTIVE.values()) + list(PMIS_FILES_CLOSED.values())
                      + [MILESTONE_FILE_ACTIVE, MILESTONE_FILE_CLOSED])

# 默认下载直链(Phase R3,用户 2026-06-12 提供;blob 类无直链文件不入此表,入口标注手动导出上传)
WPS_LINK_KEY = "回款数据"  # 非 PMIS 文件名键,pmis_download.plan_downloads 按九表名单过滤不受影响
DEFAULT_LINKS = {
    WPS_LINK_KEY: "https://yundocs.qianxin-inc.cn/weboffice/l/sRs8GgCmE2ygb",
    "项目状态信息数据.xlsx": "https://pmis.qianxin-inc.cn/design/cache/cacheProjectsStatus/exportProjectStatusExcel.pd?params=null&projSearch=&isArchive=0&isMyProject=0&projectType=&parentWbsId=&deptId=&advancedQueryArray=",
    "项目状态信息数据-已关闭.xlsx": "https://pmis.qianxin-inc.cn/design/cache/cacheProjectsStatus/exportProjectStatusExcel.pd?params=null&projSearch=&isArchive=1&isMyProject=0&projectType=&parentWbsId=&deptId=&advancedQueryArray=",
    "项目风险数据.xlsx": "https://pmis.qianxin-inc.cn/design/risk/projRisklibrary/exportProjExcel.pd?params=null&searchValue=&deleteFlag=0&riskLevel=&realm=&projStage=&status=&projIdType=1&parentWbsId=&deptId=&projId=&advancedQueryArray=",
}
```

并把 `INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE, DELIVERY_FILE_LEGACY]` 改为：

```python
INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE, DELIVERY_FILE_LEGACY,
                      PAYMENT_RECORDS_FILE, PROFIT_DIRECT_FILE, PROFIT_BRIDGE_FILE, BUDGET_FILE]
```

- [ ] **Step 4: server.py 修改**

行 31-36 白名单升九表：

```python
# ── PMIS 上传白名单（防目录穿越/任意写） ──
_PMIS_UPLOAD_NAMES = set(config.PMIS_ALL_FILENAMES)


def is_valid_pmis_name(name: str) -> bool:
    """仅允许 9 个 PMIS 固定文件名(七表+里程碑两表;防目录穿越/任意写)。"""
    return bool(name) and name in _PMIS_UPLOAD_NAMES
```

模块级纯函数（is_valid_input_name 之后追加；确认文件顶部已 `from datetime import datetime`，缺则补）：

```python
def merged_pmis_links(saved):
    """链接读取:默认直链兜底——仅补未保存的键,已保存键(含显式空串)胜出。"""
    return {**config.DEFAULT_LINKS, **(saved or {})}


def _mtime_str(path: str):
    try:
        return datetime.fromtimestamp(os.path.getmtime(path)).strftime('%Y-%m-%d %H:%M')
    except OSError:
        return None


def collect_file_status(base_dir: str):
    """已知数据文件 → 最近修改时间(显示用);固定名单防任意路径,缺失为 None。"""
    out = {}
    pmis_dir = os.path.join(base_dir, 'input', config.PMIS_DIRNAME)
    for name in config.PMIS_ALL_FILENAMES:
        out[name] = _mtime_str(os.path.join(pmis_dir, name))
    for name in config.INPUT_UPLOAD_NAMES:
        out[name] = _mtime_str(os.path.join(base_dir, 'input', name))
    return out
```

handle_pmis_links_get 的响应改为默认值合并 + defaults：

```python
        self.wfile.write(json.dumps({"links": merged_pmis_links(links),
                                     "defaults": config.DEFAULT_LINKS},
                                    ensure_ascii=False).encode('utf-8'))
```

GET 路由区（`elif parsed.path == '/api/pmis/links':` 之后）加：

```python
        elif parsed.path == '/api/files/status':
            self.handle_files_status()
```

新 handler（handle_pmis_links_get 之后）：

```python
    def handle_files_status(self):
        """GET /api/files/status - 已知数据文件的最近修改时间(数据管理页行内展示)"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"files": collect_file_status(BASE_DIR)},
                                    ensure_ascii=False).encode('utf-8'))
```

- [ ] **Step 5: pmis_download.py 升九表**

行 18 改：

```python
_ALL_PMIS_NAMES = set(config.PMIS_ALL_FILENAMES)
```

行 22 docstring「七表」改「九表」。tests/test_pmis_download.py 找到 plan_downloads 相关用例，追加断言：

```python
    def test_milestone_downloadable_and_wps_key_filtered(self):
        links = {"在建项目里程碑计划数据.xlsx": "http://x", "回款数据": "http://wps", "项目中心.xlsx": ""}
        plan = D.plan_downloads(links)
        assert {p["name"] for p in plan} == {"在建项目里程碑计划数据.xlsx"}
```

（D 为该测试文件中 pmis_download 的既有 import 别名，沿用。）

- [ ] **Step 6: 跑绿**

Run: `python -m pytest tests/test_server_links_status.py tests/test_pmis_download.py tests/test_server_inputs_upload.py -q` → PASS
Run: `python -m pytest -q` → 不回归（203+新增）

- [ ] **Step 7: Commit**

```bash
git add config.py server.py pmis_download.py tests/test_server_links_status.py tests/test_pmis_download.py
git commit -m "feat(r3): 默认直链 DEFAULT_LINKS+links GET 兜底合并+/api/files/status 文件时间+九表/CSV 上传白名单(修里程碑上传被拒缺口)"
```

---

### Task 2: 前端（composables + DataView 整页重写）

**Files:**
- Modify: `frontend/src/composables/usePmisSync.ts`（九表 + defaults）
- Modify: `frontend/src/composables/useInputFiles.ts`（8 文件白名单）
- Create: `frontend/src/composables/useFileStatus.ts`
- Rewrite: `frontend/src/views/DataView.vue`
- Rewrite: `frontend/src/views/DataView.test.ts`

- [ ] **Step 1: composables 修改（机械）**

usePmisSync.ts 顶部名单改九表 + defaults 暴露：

```ts
export const PMIS_FILE_NAMES = [
  '项目中心.xlsx', '项目基础信息数据.xlsx', '项目状态信息数据.xlsx', '项目风险数据.xlsx',
  '项目中心-已关闭.xlsx', '项目基础信息数据-已关闭.xlsx', '项目状态信息数据-已关闭.xlsx',
  '在建项目里程碑计划数据.xlsx', '已结项里程碑计划数据.xlsx',
]
```

函数内加 `const defaults = ref<Record<string, string>>({})`；loadLinks 改：

```ts
  async function loadLinks() {
    const res = await fetch('/api/pmis/links')
    if (res.ok) {
      const data = await res.json()
      links.value = data.links ?? {}
      defaults.value = data.defaults ?? {}
    }
  }
```

return 加 `defaults`。

useInputFiles.ts 名单改：

```ts
export const INPUT_FILE_NAMES = [
  '组织架构.xlsx', 'A.xlsx', 'delivery_analysis.csv', 'delivery_analysis.xlsx',
  'payment_records.csv', 'profit_loss_direct.csv', 'profit_loss_bridge.csv', 'budget_data.csv',
]
```

新建 useFileStatus.ts：

```ts
import { ref } from 'vue'

/** 已知数据文件的最近修改时间(数据管理页行内展示,/api/files/status) */
export function useFileStatus() {
  const files = ref<Record<string, string | null>>({})
  async function load() {
    try {
      const res = await fetch('/api/files/status')
      if (res.ok) files.value = (await res.json()).files ?? {}
    } catch { /* 离线/接口缺失时静默,行内显示 '-' */ }
  }
  return { files, load }
}
```

- [ ] **Step 2: 整文件替换 DataView.test.ts（跑红）**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import DataView from './DataView.vue'
import { useDataStore } from '@/stores/data'

const DEFAULTS = {
  回款数据: 'https://yundocs.qianxin-inc.cn/weboffice/l/sRs8GgCmE2ygb',
  '项目状态信息数据.xlsx': 'https://pmis.example/status0',
  '项目状态信息数据-已关闭.xlsx': 'https://pmis.example/status1',
  '项目风险数据.xlsx': 'https://pmis.example/risk',
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/pmis/links')) {
      return { ok: true, json: async () => ({ links: { ...DEFAULTS }, defaults: { ...DEFAULTS } }) } as any
    }
    if (u.includes('/api/files/status')) {
      return { ok: true, json: async () => ({ files: { '项目状态信息数据.xlsx': '2026-06-12 14:09', '项目中心.xlsx': null, 'payment_records.csv': '2026-06-12 14:46' } }) } as any
    }
    return { ok: true, json: async () => ({}) } as any
  }))
  const ds = useDataStore()
  ds.data = { meta: { lastUpdate: '2026-06-12 16:40' }, dataQuality: { summary: { lastPmisUpdate: '2026-06-09 12:23' } } } as any
})

async function mountView() {
  const w = mount(DataView, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
  await flushPromises()
  return w
}

describe('DataView(R3 重排)', () => {
  it('五卡结构与时间行', async () => {
    const w = await mountView()
    const heads = w.findAll('.dv-card-head').map((n) => n.text())
    expect(heads.some((t) => t.includes('回款数据'))).toBe(true)
    expect(heads.some((t) => t.includes('PMIS'))).toBe(true)
    expect(heads.some((t) => t.includes('项目域文件'))).toBe(true)
    expect(heads.some((t) => t.includes('更新数据'))).toBe(true)
    expect(heads.some((t) => t.includes('设置'))).toBe(true)
    expect(w.text()).toContain('2026-06-12 16:40')
  })

  it('WPS 默认链接预填+重置按钮', async () => {
    const w = await mountView()
    const input = w.find('[data-test="wps-input"]').element as HTMLInputElement
    expect(input.value).toContain('yundocs.qianxin-inc.cn')
    expect(w.find('[data-test="wps-reset"]').exists()).toBe(true)
  })

  it('PMIS 九行:直链项有输入+重置,无直链项有徽章,行内时间', async () => {
    const w = await mountView()
    const rows = w.findAll('[data-test="pmis-row"]')
    expect(rows).toHaveLength(9)
    const statusRow = rows.find((r) => r.text().includes('项目状态信息数据.xlsx'))!
    expect((statusRow.find('input').element as HTMLInputElement).value).toContain('pmis.example/status0')
    expect(statusRow.text()).toContain('2026-06-12 14:09')
    const centerRow = rows.find((r) => r.text().includes('项目中心.xlsx'))!
    expect(centerRow.find('input').exists()).toBe(false)
    expect(centerRow.text()).toContain('需手动导出上传')
    expect(centerRow.text()).toContain('-')   // 无文件时间
    const msRow = rows.find((r) => r.text().includes('在建项目里程碑计划数据'))
    expect(msRow).toBeTruthy()
  })

  it('重置把链接恢复为默认值', async () => {
    const w = await mountView()
    const statusRow = w.findAll('[data-test="pmis-row"]').find((r) => r.text().includes('项目状态信息数据.xlsx'))!
    const input = statusRow.find('input')
    await input.setValue('http://changed')
    await statusRow.find('[data-test="link-reset"]').trigger('click')
    expect((input.element as HTMLInputElement).value).toBe('https://pmis.example/status0')
  })

  it('项目域文件卡列出 7 文件与时间', async () => {
    const w = await mountView()
    const card = w.find('[data-test="inputs-card"]')
    expect(card.text()).toContain('组织架构.xlsx')
    expect(card.text()).toContain('payment_records.csv')
    expect(card.text()).toContain('budget_data.csv')
    expect(card.text()).toContain('2026-06-12 14:46')
  })

  it('挂载即拉 links 与 files/status', async () => {
    await mountView()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/pmis/links'))).toBe(true)
    expect(calls.some((u: string) => u.includes('/api/files/status'))).toBe(true)
  })
})
```

Run: `cd frontend && npx vitest run src/views/DataView.test.ts` → FAIL（旧页无 data-test 锚点）

- [ ] **Step 3: 整文件替换 DataView.vue（版式 A 五卡）**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { api } from '@/api/client'
import { useCloudSync } from '@/composables/useCloudSync'
import { useExcelImport } from '@/composables/useExcelImport'
import { usePmisSync } from '@/composables/usePmisSync'
import { useInputFiles } from '@/composables/useInputFiles'
import { useFileStatus } from '@/composables/useFileStatus'
import { useReprocess } from '@/composables/useReprocess'

const data = useDataStore()
const filter = useFilterStore()

const lastUpdate = computed(() => (data.data?.meta as any)?.lastUpdate || '-')
const lastPmis = computed(() => (data.data as any)?.dataQuality?.summary?.lastPmisUpdate || '-')

const WPS_KEY = '回款数据'
const { links: pmisLinks, defaults: linkDefaults, progress: pmisProgress, message: pmisMessage,
        running: pmisRunning, loadLinks: pmisLoadLinks, saveLinks: pmisSaveLinks,
        download: pmisDownload, upload: pmisUpload, PMIS_FILE_NAMES } = usePmisSync()
const { files: fileStatus, load: loadFileStatus } = useFileStatus()

const ftime = (name: string) => fileStatus.value[name] || '-'
const hasDefault = (name: string) => !!linkDefaults.value[name]
function resetLink(name: string) { pmisLinks.value[name] = linkDefaults.value[name] || '' }

// —— 回款数据(WPS 云同步 + 离线导入) ——
const { phase: syncPhase, progress: syncProgress, message: syncMessage, start: startCloudSync, stop: stopCloudSync } = useCloudSync()
function onSync() {
  pmisSaveLinks()   // 链接修改随同步动作持久化
  startCloudSync(pmisLinks.value[WPS_KEY] || '')
}
const importInput = ref<HTMLInputElement | null>(null)
const { phase: importPhase, progress: importProgress, message: importMessage, importFile, stop: stopExcelImport } = useExcelImport()
function onPickImport() { const f = importInput.value?.files?.[0]; if (f) importFile(f) }
const importing = computed(() => ['reading', 'uploading', 'processing'].includes(importPhase.value))

// —— PMIS 九表 ——
const pmisInput = ref<HTMLInputElement | null>(null)
const pmisUploadMsg = ref('')
async function onPmisUpload() {
  const files = Array.from(pmisInput.value?.files || [])
  if (!files.length) return
  const ok = await pmisUpload(files)
  pmisUploadMsg.value = `已上传 ${ok}/${files.length} 个 PMIS 文件,请点[更新数据]生效`
  if (pmisInput.value) pmisInput.value.value = ''
  loadFileStatus()
}
async function onPmisDownload() {
  await pmisDownload()
  loadFileStatus()
}

// —— 项目域文件(input/ 根) ——
const { upload: inputsUpload, INPUT_FILE_NAMES } = useInputFiles()
// 展示名单:legacy xlsx 仅作上传兼容不展示
const INPUT_DISPLAY_NAMES = INPUT_FILE_NAMES.filter((n) => n !== 'delivery_analysis.xlsx')
const inputsInput = ref<HTMLInputElement | null>(null)
const inputsUploadMsg = ref('')
async function onUploadInputs() {
  const files = Array.from(inputsInput.value?.files || [])
  if (!files.length) return
  const ok = await inputsUpload(files)
  inputsUploadMsg.value = `已上传 ${ok}/${files.length} 个项目域文件,请点[更新数据]生效`
  if (inputsInput.value) inputsInput.value.value = ''
  loadFileStatus()
}

// —— 更新数据 / 设置 ——
const { progress: repProgress, message: repMessage, running: repRunning, start: startReprocess } =
  useReprocess({ onDone: () => { data.reload(); loadFileStatus() } })
const naguanOn = computed({ get: () => filter.naguanOn, set: (v: boolean) => filter.toggleNaguan(v) })
const clearState = ref('')
const clearing = ref(false)
async function onClear() {
  if (!window.confirm('确定要清空所有数据吗？此操作不可撤销!')) return
  if (!window.confirm('再次确认：是否清空所有数据？')) return
  clearing.value = true
  data.clearBusinessData()
  try { await api.get('/api/clear-data'); clearState.value = '已清空(含数据文件)' }
  catch { clearState.value = '内存已清空' }
  clearing.value = false
  setTimeout(() => { clearState.value = '' }, 2000)
}

onMounted(() => { if (!data.data) data.load(); pmisLoadLinks(); loadFileStatus() })
</script>

<template>
  <div class="data-view">
    <div class="dv-top">
      <h2 class="dv-title">数据管理</h2>
      <div class="dv-times u-num">处理 <b>{{ lastUpdate }}</b> · PMIS <b>{{ lastPmis }}</b></div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">回款数据（WPS 云文档）</div>
      <div class="dv-row">
        <span class="dv-label">下载链接</span>
        <input v-model="pmisLinks[WPS_KEY]" data-test="wps-input" type="text" class="dv-link" placeholder="WPS 云文档网址" />
        <button v-if="hasDefault(WPS_KEY)" class="dv-btn ghost" data-test="wps-reset" @click="resetLink(WPS_KEY)">重置</button>
        <button class="dv-btn primary" :disabled="syncPhase === 'syncing'" @click="onSync">云同步</button>
        <button v-if="syncPhase === 'syncing'" class="dv-btn" @click="stopCloudSync">停止</button>
      </div>
      <div v-if="syncPhase !== 'idle'" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :class="syncPhase" :style="{ width: syncProgress + '%' }"></div></div><div class="dv-msg" :class="syncPhase">{{ syncMessage }}</div></div>
      <div class="dv-row">
        <span class="dv-label">离线导入</span>
        <input ref="importInput" type="file" accept=".xlsx,.xls" class="dv-file" />
        <button class="dv-btn" :disabled="importing" @click="onPickImport">导入</button>
        <button v-if="importing" class="dv-btn" @click="stopExcelImport">停止</button>
        <span class="dv-hint">需含 Sheet「项目回款节点（里程碑）清单」</span>
      </div>
      <div v-if="importPhase !== 'idle'" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :class="importPhase" :style="{ width: importProgress + '%' }"></div></div><div class="dv-msg" :class="importPhase">{{ importMessage }}</div></div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">PMIS 数据（九表 · 有直链可在线下载，其余从 PMIS 手动导出后上传）</div>
      <div v-for="name in PMIS_FILE_NAMES" :key="name" class="dv-frow" data-test="pmis-row">
        <span class="dv-fname">{{ name }}</span>
        <template v-if="hasDefault(name)">
          <input v-model="pmisLinks[name]" type="text" class="dv-link" placeholder="下载链接" />
          <button class="dv-btn ghost" data-test="link-reset" @click="resetLink(name)">重置</button>
        </template>
        <span v-else class="dv-badge">无直链 · 需手动导出上传</span>
        <span class="dv-ftime u-num">{{ ftime(name) }}</span>
      </div>
      <div class="dv-row dv-actions">
        <button class="dv-btn primary" :disabled="pmisRunning" @click="onPmisDownload()">在线下载（有链接项）</button>
        <input ref="pmisInput" type="file" accept=".xlsx" multiple class="dv-file" />
        <button class="dv-btn" @click="onPmisUpload">离线上传</button>
      </div>
      <div v-if="pmisRunning || pmisProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: pmisProgress + '%' }"></div></div><div class="dv-msg">{{ pmisMessage || '处理中...' }}</div></div>
      <div v-if="pmisUploadMsg" class="dv-row dv-hint">{{ pmisUploadMsg }}</div>
    </div>

    <div class="dv-card" data-test="inputs-card">
      <div class="dv-card-head">项目域文件（input/ 根 · 手动导出后上传）</div>
      <div v-for="name in INPUT_DISPLAY_NAMES" :key="name" class="dv-frow">
        <span class="dv-fname">{{ name }}</span>
        <span class="dv-ftime u-num">{{ ftime(name) }}</span>
      </div>
      <div class="dv-row dv-actions">
        <input ref="inputsInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
        <button class="dv-btn" @click="onUploadInputs">多选上传</button>
      </div>
      <div v-if="inputsUploadMsg" class="dv-row dv-hint">{{ inputsUploadMsg }}</div>
    </div>

    <div class="dv-grid2">
      <div class="dv-card">
        <div class="dv-card-head">更新数据</div>
        <div class="dv-row">
          <button class="dv-btn primary" :disabled="repRunning" @click="startReprocess()">更新数据（重新处理）</button>
          <span class="dv-hint">读取已获取的全部数据文件,重算看板</span>
        </div>
        <div v-if="repRunning || repProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: repProgress + '%' }"></div></div><div class="dv-msg">{{ repMessage }}</div></div>
      </div>
      <div class="dv-card">
        <div class="dv-card-head">设置</div>
        <div class="dv-row"><span class="dv-label">纳管开关</span><el-switch v-model="naguanOn" /><span class="dv-hint">关闭后不再排除纳管项目(全站联动)</span></div>
        <div class="dv-row"><span class="dv-label">清空数据</span><button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button><span v-if="clearState" class="dv-hint ok">{{ clearState }}</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-view { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--gap-card); }
.dv-top { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-2); }
.dv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.dv-times { font-size: var(--fs-1); color: var(--sub); }
.dv-times b { color: var(--txt); }
.dv-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-1); }
.dv-card-head { font-weight: 700; font-size: var(--fs-2); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--line); color: var(--txt); }
.dv-row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); font-size: var(--fs-2); flex-wrap: wrap; }
.dv-actions { border-top: 1px solid var(--line); }
.dv-frow { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-4); font-size: var(--fs-2); border-bottom: 1px dashed var(--line); }
.dv-frow:last-of-type { border-bottom: none; }
.dv-fname { width: 230px; flex-shrink: 0; color: var(--txt); word-break: break-all; }
.dv-ftime { margin-left: auto; color: var(--mut); font-size: var(--fs-1); flex-shrink: 0; }
.dv-label { width: 70px; flex-shrink: 0; color: var(--sub); font-weight: 600; font-size: var(--fs-1); }
.dv-link { flex: 1; min-width: 200px; border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-2); font-size: var(--fs-1); color: var(--txt); outline: none; }
.dv-link:focus { border-color: var(--accent); }
.dv-badge { font-size: var(--fs-1); padding: 1px var(--sp-2); border-radius: var(--r-full); background: var(--warn-bg); color: var(--warn-text); white-space: nowrap; }
.dv-btn { border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm); padding: var(--sp-1) var(--sp-3); font-size: var(--fs-2); cursor: pointer; color: var(--txt); }
.dv-btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.dv-btn.ghost { color: var(--sub); }
.dv-btn.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
.dv-btn:disabled { opacity: var(--disabled-opacity); cursor: default; }
.dv-hint { font-size: var(--fs-1); color: var(--mut); }
.dv-hint.ok { color: var(--ok-text); }
.dv-file { font-size: var(--fs-1); }
.dv-progress { padding: 0 var(--sp-4) var(--sp-3); }
.dv-bar { height: 8px; background: var(--line); border-radius: var(--r-sm); overflow: hidden; }
.dv-bar-fill { height: 100%; background: var(--accent); transition: width var(--dur-2) var(--ease); }
.dv-bar-fill.done { background: var(--ok); }
.dv-bar-fill.error { background: var(--danger); }
.dv-msg { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-2); }
.dv-msg.done { color: var(--ok-text); }
.dv-msg.error { color: var(--danger-text); }
.dv-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-card); }
@media (max-width: 768px) { .dv-grid2 { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 4: 跑绿 + 全量**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts` → PASS 6 项
Run: `cd frontend && npm run test:run 2>&1 | tail -3 && npm run typecheck` → 全绿（usePmisSync/useInputFiles 若有旧测试断言名单长度 7/3，按新九表/8 文件同步并报告）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(r3): 数据管理页整页重排(五卡/统一文件行/默认直链预填可重置/无直链徽章/文件时间)+九表与 CSV 前端白名单(修 CSV 上传被静默跳过缺口)"
```

---

### Task 3: 版本 + PROGRESS + verify + 终审（主循环）

- [ ] **Step 1**: `frontend/src/version.ts` → `V7.9.0`
- [ ] **Step 2**: PROGRESS.md——头部；「进行中」R3 完成待合并、下一期 R4；Handoff R3（五卡版式 A、默认链接合并规则[保存值胜出含空串]、两缺口修复[前端 CSV 白名单/PMIS 里程碑上传被拒]、/api/files/status、烟雾清单：① /data 五卡渲染与默认链接预填 ② 改链接→重置恢复默认 ③ 在线下载四直链项（需内网）④ 上传里程碑 xlsx 与 CSV 成功落 input/ ⑤ 每文件时间随上传刷新 ⑥ 旧 pmis_links.json 存在时保存值优先）。
- [ ] **Step 3**: `bash verify.sh` 全绿
- [ ] **Step 4**: Commit `chore(r3): 版本 V7.9.0 + PROGRESS`；opus 整体终审（diff master..HEAD 对照母 spec §4 + 安全复查：白名单仍封目录穿越、defaults 不泄漏敏感信息[内网 URL 本属用户配置]）；终审过后 finishing-a-development-branch 四选项菜单。
