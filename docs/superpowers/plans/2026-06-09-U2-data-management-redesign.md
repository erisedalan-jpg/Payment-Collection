# U2 数据管理页重构(获取/更新解耦)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把数据管理页重组为"获取数据 → 更新数据"两段式:四种获取(云同步/PMIS下载/离线导入/PMIS上传)只落地文件,新增全局「更新数据」(`/api/reprocess`)统一跑 preprocess;删除冗余质量表;数据更新时间分源移来;筛选条仅在分析页显示;纳管不动。

**Architecture:** 后端把 preprocess 从 sync/import/pmis-download 的尾部剥离,集中到新的 `run_reprocess` + `/api/reprocess`;新增 PMIS 原始字节上传 `/api/pmis/upload`;`pmis_data_time` 由 input/pmis 文件 mtime 派生写入 dataQuality。前端 DataView 重构为获取/更新/设置三段,新增 `useReprocess`/PMIS 上传 composable,AppLayout 按路由隐藏 FilterBar。

**Tech Stack:** Python 标准库 http.server;Vue3 `<script setup>` + Pinia + Vitest;pydantic + json-schema-to-typescript。验证 `bash verify.sh`。

**关键既有事实(实现时遵循):**
- `server.py`:类名 `CustomHandler`;`do_GET`(约 277-)`/api/*` 分支在前;模块级状态 `sync_state`/`import_state`/`pmis_state`;`run_sync`(1000)/`run_import`(1271)/`run_pmis_download`(1207);各自尾部跑 preprocess(run_sync 1132-1197;run_import 类似;run_pmis_download 1234-1245)。helper:`_find_script`、`_run_script_direct`、`classify_progress_line`、`_json_response`。`json/os/sys/time/threading/subprocess/logger` 已可用。
- `pmis.py`:`load_project_pmis(pmis_dir, payment_projects_or_ids, dirty=None)` 返回 `(project_pmis, data_quality)`;`config.PMIS_FILES_ACTIVE`(4)/`PMIS_FILES_CLOSED`(3);`config.PMIS_DIRNAME='pmis'`。
- `schema.py`:`QualitySummary` 有 pmisProvided/joinRate/matchedActive/matchedClosed/unmatched;`dump_json_schema` 写 schema.json;前端 `npm run gen:types` 由 schema.json 生成 `src/types/analysis.ts`(schema.json 被 gitignore,需先 `python schema.py`)。
- 前端:`frontend/src/views/DataView.vue`(5 卡)、`AboutView.vue`(行 38 "数据更新"行)、`layout/AppLayout.vue`(行 14 `<FilterBar />`)、`composables/useCloudSync.ts`/`useExcelImport.ts`/`usePmisSync.ts`、`stores/data.ts`(有 `reload()`)。`router/index.ts` 路由 name:data/about/governance 等。`lib/dataQuality.ts` + `DataQualityTable.vue`/`DataDrillModal.vue` 仅 DataView 与 /analysis 用。
- 约定:frozen/dev 双路径;无 emoji;**禁止 `git add -A`**;`input/`/`data/`/`frontend/dist/` 不提交;检查命令的退出码不要被 `| tail` 掩盖。

---

### Task 1: 后端 — 剥离 preprocess + 新增 /api/reprocess

**Files:**
- Modify: `server.py`(新增 `reprocess_state`/`run_reprocess`/`handle_reprocess`/路由;删 sync/import/pmis-download 的 preprocess 尾)

本任务无纯函数单测(HTTP/进程编排);验证 = `py_compile` + `ruff` + 现有 pytest 不回归 + 冒烟说明。

- [ ] **Step 1: 加 `reprocess_state` 与 `run_reprocess`**

在 `server.py` 模块级 `pmis_state = {...}` 附近新增:
```python
reprocess_state = {"running": False, "progress": 0, "message": ""}
```

新增模块级 `run_reprocess()`(把"跑 preprocess"集中到此;frozen/dev 双路径,沿用 run_sync 里那段的写法):
```python
def run_reprocess():
    """仅运行 preprocess_data.py(读 yundocs_data + input/pmis 重算 analysis_data)。
    不抓取、不下载。供"更新数据"按钮调用。"""
    global reprocess_state
    try:
        reprocess_state = {"running": True, "progress": 10, "message": "正在更新数据(预处理)..."}
        preprocess_script, pcwd = _find_script("preprocess_data.py")
        if not preprocess_script:
            reprocess_state = {"running": False, "progress": 0, "message": "预处理脚本不存在"}
            return
        if getattr(sys, 'frozen', False):
            try:
                old_argv = sys.argv[:]
                sys.argv = [preprocess_script]
                _run_script_direct(preprocess_script, 'preprocess_data', pcwd)
            except SystemExit as e:
                if e.code and e.code != 0:
                    reprocess_state = {"running": False, "progress": 0, "message": f"更新失败(退出码:{e.code})"}
                    return
            except Exception as e:
                reprocess_state = {"running": False, "progress": 0, "message": f"更新失败: {str(e)[:100]}"}
                logger.error(f"reprocess 失败: {e}", exc_info=True)
                return
            finally:
                sys.argv = old_argv
        else:
            process = subprocess.Popen(
                [sys.executable, '-u', preprocess_script],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                cwd=pcwd, encoding='utf-8', errors='replace')
            errs = []
            for raw in process.stdout:
                parsed = classify_progress_line(raw)
                if parsed is None:
                    continue
                level, text = parsed
                if level in ('ok', 'info'):
                    reprocess_state = {"running": True, "progress": min(reprocess_state["progress"] + 5, 95),
                                       "message": raw.strip().replace('[INFO] ', '').replace('[OK] ', '')}
                elif level == 'error':
                    errs.append(text)
            process.wait()
            if process.returncode != 0:
                reprocess_state = {"running": False, "progress": 0,
                                   "message": f"更新失败: {'; '.join(errs[-3:]) if errs else '详见日志'}"}
                return
        reprocess_state = {"running": True, "progress": 100, "message": "数据更新完成"}
    except Exception as e:
        reprocess_state = {"running": False, "progress": 0, "message": f"更新失败: {str(e)}"}
        logger.error(f"reprocess 失败: {e}", exc_info=True)
    finally:
        time.sleep(3)
        reprocess_state["running"] = False
```

- [ ] **Step 2: 加路由 + handler**

`do_GET` 中(followup/pmis 分支附近)加:
```python
        elif parsed.path == '/api/reprocess':
            self.handle_reprocess()
```
`CustomHandler` 内新增(SSE,仿 handle_sync;与 sync/import/pmis 下载互斥):
```python
    def handle_reprocess(self):
        global reprocess_state
        if sync_state.get("running") or import_state.get("running") or pmis_state.get("running"):
            self._json_response({"running": False, "progress": 0, "message": "其他数据操作进行中,请稍后再更新"})
            return
        if reprocess_state.get("running"):
            self._json_response(reprocess_state)
            return
        reprocess_state = {"running": True, "progress": 0, "message": "启动更新..."}
        threading.Thread(target=run_reprocess, daemon=True).start()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        while True:
            self.wfile.write(f"data: {json.dumps(reprocess_state)}\n\n".encode('utf-8'))
            self.wfile.flush()
            if reprocess_state["progress"] >= 100 or not reprocess_state["running"]:
                break
            time.sleep(0.5)
```

- [ ] **Step 3: 删 run_sync 的 preprocess 尾**

在 `run_sync` 中,把"Step 2: Run preprocessing"整段(从 `# Step 2: Run preprocessing` 到 `sync_state = {"running": True, "progress": 100, "message": "同步完成！"}` 之前)删除,替换为:
```python
        # 同步只负责抓取到 yundocs_data;处理由"更新数据"按钮触发
        sync_state = {"running": True, "progress": 100, "message": "云同步完成,请点[更新数据]生效"}
        logger.info("云同步(仅抓取)完成")
```
保留其后的 `except`/`finally`(finally 的 sleep3 + running=False 不变)。

- [ ] **Step 4: 删 run_import 的 preprocess 尾**

在 `run_import` 中,把运行 preprocess 的整段(从设置"正在预处理数据..."到其结束、`import_state` 置完成之前)删除,替换为:
```python
        # 导入只负责落地 yundocs_data;处理由"更新数据"按钮触发
        import_state = {"running": False, "progress": 100, "message": f"已导入 {len(sheet_list)} 个Sheet,请点[更新数据]生效"}
        logger.info("离线导入(仅落地)完成")
        return
```
(确保 `sheet_list` 变量在作用域内;若变量名不同则用实际名。)

- [ ] **Step 5: 删 run_pmis_download 的 reprocess 尾**

在 `run_pmis_download` 中,把"下载后立即重跑预处理"整段(`preprocess_script, pcwd = _find_script(...)` 到其结束)删除,把最终状态改为:
```python
        pmis_state = {"running": False, "progress": 100, "message": "PMIS 下载完成,请点[更新数据]生效"}
```
保留 `except`/`finally`。

- [ ] **Step 6: 验证(各命令分开看退出码)**

```bash
python -m py_compile server.py
python -m ruff check server.py
python -m pytest -q
```
全部通过(现有 server 相关纯函数测试不回归)。冒烟(可选,受单线程限制):起服务后 `GET /api/reprocess` 返回 SSE 且最终 message="数据更新完成"。

- [ ] **Step 7: 提交**

```bash
git add server.py
git commit -m "feat(U2): 剥离 preprocess 到 /api/reprocess,sync/import/download 仅获取"
```

---

### Task 2: 后端 — PMIS 原始上传 /api/pmis/upload

**Files:**
- Modify: `server.py`(`is_valid_pmis_name` 纯函数 + 路由 + handler)
- Test: `tests/test_server_pmis_upload.py`

- [ ] **Step 1: 写失败测试(文件名校验纯函数)**

创建 `tests/test_server_pmis_upload.py`:
```python
# -*- coding: utf-8 -*-
import server as S


class TestIsValidPmisName:
    def test_active_name_ok(self):
        assert S.is_valid_pmis_name("项目中心.xlsx") is True
    def test_closed_name_ok(self):
        assert S.is_valid_pmis_name("项目状态信息数据-已关闭.xlsx") is True
    def test_unknown_name_rejected(self):
        assert S.is_valid_pmis_name("随便.xlsx") is False
    def test_path_traversal_rejected(self):
        assert S.is_valid_pmis_name("../evil.xlsx") is False
    def test_empty_rejected(self):
        assert S.is_valid_pmis_name("") is False
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_pmis_upload.py -q`
Expected: FAIL(no attribute is_valid_pmis_name)。

- [ ] **Step 3: 实现纯函数 + 路由 + handler**

`server.py` 顶部 `import config`(若无则加)后,模块级新增:
```python
_PMIS_UPLOAD_NAMES = set(config.PMIS_FILES_ACTIVE.values()) | set(config.PMIS_FILES_CLOSED.values())


def is_valid_pmis_name(name: str) -> bool:
    """仅允许 7 个 PMIS 固定文件名(防目录穿越/任意写)。"""
    return bool(name) and name in _PMIS_UPLOAD_NAMES
```
`do_POST` 中新增:
```python
        elif parsed.path == '/api/pmis/upload':
            self.handle_pmis_upload()
```
`CustomHandler` 内新增:
```python
    def handle_pmis_upload(self):
        from urllib.parse import urlparse, parse_qs
        qs = parse_qs(urlparse(self.path).query)
        name = (qs.get('name', [''])[0] or '').strip()
        if not is_valid_pmis_name(name):
            self.send_response(400)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "message": f"非法文件名: {name}"}, ensure_ascii=False).encode('utf-8'))
            return
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else b''
        pmis_dir = os.path.join(BASE_DIR, 'input', config.PMIS_DIRNAME)
        os.makedirs(pmis_dir, exist_ok=True)
        with open(os.path.join(pmis_dir, name), 'wb') as f:
            f.write(body)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "name": name, "bytes": len(body)}, ensure_ascii=False).encode('utf-8'))
```

- [ ] **Step 4: 验证**

```bash
python -m pytest tests/test_server_pmis_upload.py -q
python -m py_compile server.py
python -m ruff check server.py tests/test_server_pmis_upload.py
```
全通过。

- [ ] **Step 5: 提交**

```bash
git add server.py tests/test_server_pmis_upload.py
git commit -m "feat(U2): /api/pmis/upload 原始字节上传(文件名白名单校验)"
```

---

### Task 3: 后端 — PMIS 数据时间 lastPmisUpdate

**Files:**
- Modify: `pmis.py`(`pmis_data_time` + 写入 summary)
- Modify: `schema.py`(`QualitySummary.lastPmisUpdate`)
- Modify: `tests/test_pmis.py`
- Generated: `schema.json`、`frontend/src/types/analysis.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/test_pmis.py` 追加:
```python
import os as _os
import time as _time


class TestPmisDataTime:
    def test_empty_dir_returns_blank(self, tmp_path):
        assert M.pmis_data_time(str(tmp_path)) == ''
    def test_returns_formatted_max_mtime(self, tmp_path):
        d = tmp_path / "pmis"
        d.mkdir()
        p = d / "项目中心.xlsx"
        p.write_bytes(b"x")
        ts = _os.path.getmtime(str(p))
        out = M.pmis_data_time(str(d))
        # 形如 YYYY-MM-DD HH:MM
        assert len(out) == 16 and out[4] == '-' and out[13] == ':'
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_pmis.py::TestPmisDataTime -q`
Expected: FAIL(no attribute pmis_data_time)。

- [ ] **Step 3: 实现 pmis_data_time + 写入 summary**

在 `pmis.py` 追加:
```python
def pmis_data_time(pmis_dir: str) -> str:
    """input/pmis 下 xlsx 的最大修改时间,格式 'YYYY-MM-DD HH:MM';无文件返回 ''。"""
    import datetime
    if not os.path.isdir(pmis_dir):
        return ''
    mtimes = []
    for fn in os.listdir(pmis_dir):
        if fn.lower().endswith('.xlsx'):
            try:
                mtimes.append(os.path.getmtime(os.path.join(pmis_dir, fn)))
            except OSError:
                pass
    if not mtimes:
        return ''
    return datetime.datetime.fromtimestamp(max(mtimes)).strftime('%Y-%m-%d %H:%M')
```
在 `load_project_pmis` 里,拿到 `dq` 后、return 前写入(无论是否降级都给个值):
```python
    dq['summary']['lastPmisUpdate'] = pmis_data_time(pmis_dir)
```
注意三个 return 分支(目录缺失/全空/正常)都要带上该字段;最简做法:在每个 `return {}, compute_data_quality(...)` 后改为先算 dq 再补字段再 return,或在函数末尾统一。推荐改为:
```python
    # 目录缺失
    if not os.path.isdir(pmis_dir):
        dq = compute_data_quality({}, pay_projects, dirty)
        dq['summary']['lastPmisUpdate'] = ''
        return {}, dq
    ...
    # 全空
    if not any(active.values()) and not any(closed.values()):
        dq = compute_data_quality({}, pay_projects, dirty)
        dq['summary']['lastPmisUpdate'] = pmis_data_time(pmis_dir)
        return {}, dq
    project_pmis = build_project_pmis(active, closed, pay_ids)
    dq = compute_data_quality(project_pmis, pay_projects, dirty)
    dq['summary']['lastPmisUpdate'] = pmis_data_time(pmis_dir)
    return project_pmis, dq
```

- [ ] **Step 4: schema 加字段 + 测试**

`schema.py` 的 `class QualitySummary` 追加:
```python
    lastPmisUpdate: str = ''
```
在 `tests/test_schema.py` 的 `TestPmisSchema.test_with_pmis_and_quality` 的 summary 里加 `"lastPmisUpdate": "2026-06-09 10:00"` 并断言 `m.dataQuality.summary.lastPmisUpdate == "2026-06-09 10:00"`。

- [ ] **Step 5: 跑测试 + 重生成类型**

```bash
python -m pytest tests/test_pmis.py tests/test_schema.py -q
python schema.py
cd frontend && npm run gen:types && npm run typecheck
```
全绿;`analysis.ts` 的 `QualitySummary` 含 `lastPmisUpdate`。

- [ ] **Step 6: 提交**

```bash
git add pmis.py schema.py tests/test_pmis.py tests/test_schema.py frontend/src/types/analysis.ts
git commit -m "feat(U2): lastPmisUpdate(按 input/pmis 文件 mtime)+ schema/类型"
```

---

### Task 4: 前端 — composables(useReprocess / PMIS 上传 + 解耦)

**Files:**
- Create: `frontend/src/composables/useReprocess.ts` + `.test.ts`
- Modify: `frontend/src/composables/usePmisSync.ts`(download 去 reprocess;加 upload)+ `.test.ts`
- Modify: `frontend/src/composables/useExcelImport.ts`(去自动处理 onDone 语义)

- [ ] **Step 1: 写失败测试(useReprocess)**

创建 `frontend/src/composables/useReprocess.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useReprocess } from './useReprocess'

afterEach(() => vi.unstubAllGlobals())

describe('useReprocess', () => {
  it('start() 命中 /api/reprocess 并在完成时回调 onDone', async () => {
    const enc = new TextEncoder()
    let n = 0
    const reader = { read: vi.fn(async () => {
      n++
      if (n === 1) return { done: false, value: enc.encode('data: {"progress":100,"message":"数据更新完成","running":false}\n\n') }
      return { done: true, value: undefined }
    }) }
    const fetchMock = vi.fn(async () => ({ ok: true, body: { getReader: () => reader } }))
    vi.stubGlobal('fetch', fetchMock as any)
    const onDone = vi.fn()
    const s = useReprocess({ onDone })
    await s.start()
    expect(fetchMock).toHaveBeenCalledWith('/api/reprocess')
    expect(s.progress.value).toBe(100)
    expect(s.running.value).toBe(false)
    expect(onDone).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行失败 → 实现 useReprocess**

Run: `cd frontend && npx vitest run src/composables/useReprocess.test.ts`(FAIL)。
创建 `frontend/src/composables/useReprocess.ts`:
```ts
import { ref } from 'vue'

export function useReprocess(opts: { onDone?: () => void } = {}) {
  const progress = ref(0)
  const message = ref('')
  const running = ref(false)

  async function start() {
    running.value = true; progress.value = 0
    try {
      const res = await fetch('/api/reprocess')
      if (!res.ok) { message.value = `更新失败 (${res.status})`; return }
      const reader = res.body?.getReader()
      if (!reader) { message.value = '无响应体'; return }
      const dec = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n')) {
          const t = line.startsWith('data:') ? line.slice(5).trim() : ''
          if (!t) continue
          try {
            const s = JSON.parse(t)
            progress.value = s.progress; message.value = s.message; running.value = s.running
          } catch { /* 跳过半包 */ }
        }
      }
      opts.onDone?.()
    } finally {
      running.value = false
    }
  }
  return { progress, message, running, start }
}
```
Run vitest → PASS。

- [ ] **Step 3: usePmisSync —— download 去 reprocess + 加 upload**

在 `frontend/src/composables/usePmisSync.test.ts` 追加 upload 测试:
```ts
it('upload() 对每个 PMIS 文件 POST /api/pmis/upload?name=', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
  vi.stubGlobal('fetch', fetchMock as any)
  const s = usePmisSync()
  const f = new File([new Uint8Array([1, 2, 3])], '项目中心.xlsx')
  // jsdom File.arrayBuffer 兜底
  ;(f as any).arrayBuffer = async () => new Uint8Array([1, 2, 3]).buffer
  const ok = await s.upload([f])
  expect(ok).toBe(1)
  const url = fetchMock.mock.calls[0][0] as string
  expect(url).toContain('/api/pmis/upload?name=')
})
```
在 `usePmisSync.ts`:`download()` 已无 onDone-reprocess(U1 时仍调 onDone→reload;现改为 download 不触发处理——把 `opts.onDone?.()` 从 download 末尾移除)。新增:
```ts
  async function upload(files: File[]): Promise<number> {
    let ok = 0
    for (const f of files) {
      if (!PMIS_FILE_NAMES.includes(f.name)) continue
      const buf = await f.arrayBuffer()
      const res = await fetch('/api/pmis/upload?name=' + encodeURIComponent(f.name), {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
      })
      if (res.ok) ok++
    }
    return ok
  }
```
并把 `upload` 加入 return。`usePmisSync` 的 `opts.onDone` 不再用于 download(数据刷新改由"更新数据"负责);若签名仍接收 opts 可保留但不在 download 调用。

- [ ] **Step 4: useExcelImport —— 去自动处理语义**

`useExcelImport.ts`:导入完成后不再期望后端自动 preprocess(后端 Task 1 已改为仅落地)。把成功态文案改为"导入完成,请点更新数据";`opts.onDone` 不再用于触发 reload(数据刷新由"更新数据")。保留停止/进度逻辑。其测试若断言 onDone 被调用则相应调整为不调用(或保留 onDone 仅作"完成回调"语义,DataView 不传 reload)。

- [ ] **Step 5: 验证**

```bash
cd frontend && npx vitest run src/composables && npm run typecheck
```
全绿。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/composables/useReprocess.ts frontend/src/composables/useReprocess.test.ts frontend/src/composables/usePmisSync.ts frontend/src/composables/usePmisSync.test.ts frontend/src/composables/useExcelImport.ts frontend/src/composables/useExcelImport.test.ts
git commit -m "feat(U2): useReprocess + PMIS 上传;导入/下载与处理解耦"
```

---

### Task 5: 前端 — DataView 重构 + AboutView 去更新行

**Files:**
- Modify: `frontend/src/views/DataView.vue`(整体重构)
- Modify: `frontend/src/views/DataView.test.ts`
- Modify: `frontend/src/views/AboutView.vue`(删"数据更新"行)

- [ ] **Step 1: 重构 DataView.vue 为获取/更新/设置三段**

把 `frontend/src/views/DataView.vue` 整体替换为(获取卡:回款云同步/离线导入 + 项目域 PMIS 下载/上传;更新卡:全局更新按钮;设置卡:纳管+清空;顶部分源时间;删除质量总览):

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { api } from '@/api/client'
import { useCloudSync } from '@/composables/useCloudSync'
import { useExcelImport } from '@/composables/useExcelImport'
import { usePmisSync } from '@/composables/usePmisSync'
import { useReprocess } from '@/composables/useReprocess'

const data = useDataStore()
const filter = useFilterStore()

const lastUpdate = computed(() => (data.data?.meta as any)?.lastUpdate || '-')
const lastPmis = computed(() => (data.data as any)?.dataQuality?.summary?.lastPmisUpdate || '-')

// 更新数据(全局重处理)
const { progress: repProgress, message: repMessage, running: repRunning, start: startReprocess } =
  useReprocess({ onDone: () => data.reload() })

// 回款 - 云同步(仅抓取)
const syncUrl = ref('')
const { phase: syncPhase, progress: syncProgress, message: syncMessage, start: startCloudSync, stop: stopCloudSync } = useCloudSync()
function onSync() { startCloudSync(syncUrl.value) }

// 回款 - 离线导入(仅落地)
const importInput = ref<HTMLInputElement | null>(null)
const { phase: importPhase, progress: importProgress, message: importMessage, importFile, stop: stopExcelImport } = useExcelImport()
function onPickImport() { const f = importInput.value?.files?.[0]; if (f) importFile(f) }

// 项目域 PMIS - 在线下载 / 离线上传
const { links: pmisLinks, progress: pmisProgress, message: pmisMessage, running: pmisRunning,
        loadLinks: pmisLoadLinks, download: pmisDownload, upload: pmisUpload, PMIS_FILE_NAMES } = usePmisSync()
const pmisInput = ref<HTMLInputElement | null>(null)
const pmisUploadMsg = ref('')
async function onPmisUpload() {
  const files = Array.from(pmisInput.value?.files || [])
  if (!files.length) return
  const ok = await pmisUpload(files)
  pmisUploadMsg.value = `已上传 ${ok}/${files.length} 个 PMIS 文件,请点[更新数据]生效`
}

onMounted(() => { if (!data.data) data.load(); pmisLoadLinks() })

// 设置 - 纳管 + 清空
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
</script>

<template>
  <div class="data-view">
    <h2 class="dv-title">数据管理</h2>

    <div class="dv-times">
      <span>总处理时间:<b>{{ lastUpdate }}</b></span>
      <span>PMIS 数据时间:<b>{{ lastPmis }}</b></span>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">数据来源 · 获取(获取后点"更新数据"生效)</div>
      <div class="dv-sub">回款数据</div>
      <div class="dv-row">
        <el-input v-model="syncUrl" size="small" placeholder="粘贴 WPS 云文档网址" style="flex:1" />
        <button class="dv-btn" :disabled="syncPhase === 'syncing'" @click="onSync">云同步</button>
        <button v-if="syncPhase === 'syncing'" class="dv-btn" @click="stopCloudSync">停止</button>
      </div>
      <div v-if="syncPhase !== 'idle'" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :class="syncPhase" :style="{ width: syncProgress + '%' }"></div></div><div class="dv-msg" :class="syncPhase">{{ syncMessage }}</div></div>
      <div class="dv-row">
        <input ref="importInput" type="file" accept=".xlsx,.xls" class="dv-file" />
        <button class="dv-btn" :disabled="['reading','uploading','processing'].includes(importPhase)" @click="onPickImport">离线导入</button>
        <button v-if="['reading','uploading','processing'].includes(importPhase)" class="dv-btn" @click="stopExcelImport">停止</button>
      </div>
      <div class="dv-row dv-note">离线导入需含 Sheet「项目回款节点（里程碑）清单」</div>
      <div v-if="importPhase !== 'idle'" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :class="importPhase" :style="{ width: importProgress + '%' }"></div></div><div class="dv-msg" :class="importPhase">{{ importMessage }}</div></div>

      <div class="dv-sub">项目域(PMIS)</div>
      <div class="dv-row dv-note">在线:配置 7 个下载链接(空则在此录入);离线:多选 7 个 xlsx 上传到 input/pmis/。</div>
      <div v-for="name in PMIS_FILE_NAMES" :key="name" class="dv-row dv-pmis-row">
        <span class="dv-label dv-pmis-label">{{ name }}</span>
        <input v-model="pmisLinks[name]" type="text" class="dv-pmis-input" placeholder="下载链接(可选)" />
      </div>
      <div class="dv-row">
        <button class="dv-btn" :disabled="pmisRunning" @click="pmisDownload()">在线下载</button>
        <input ref="pmisInput" type="file" accept=".xlsx" multiple class="dv-file" />
        <button class="dv-btn" @click="onPmisUpload">离线上传</button>
      </div>
      <div v-if="pmisRunning || pmisProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: pmisProgress + '%' }"></div></div><div class="dv-msg">{{ pmisMessage || '处理中...' }}</div></div>
      <div v-if="pmisUploadMsg" class="dv-row dv-note">{{ pmisUploadMsg }}</div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">更新数据</div>
      <div class="dv-row">
        <button class="dv-btn primary" :disabled="repRunning" @click="startReprocess()">更新数据(重新处理)</button>
        <span class="dv-hint">读取已获取的回款 + PMIS 文件,重算看板数据</span>
      </div>
      <div v-if="repRunning || repProgress > 0" class="dv-progress"><div class="dv-bar"><div class="dv-bar-fill" :style="{ width: repProgress + '%' }"></div></div><div class="dv-msg">{{ repMessage }}</div></div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">设置</div>
      <div class="dv-row"><span class="dv-label">纳管开关</span><el-switch v-model="naguanOn" /><span class="dv-hint">关闭后不再排除纳管项目(全站联动)</span></div>
      <div class="dv-row"><span class="dv-label">清空数据</span><button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button><span v-if="clearState" class="dv-clear-state">{{ clearState }}</span></div>
    </div>
  </div>
</template>

<style scoped>
.data-view { padding: 16px; }
.dv-title { font-size: 18px; font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.dv-times { display: flex; gap: 24px; font-size: var(--fs-1); color: var(--sub); margin-bottom: 14px; }
.dv-times b { color: var(--txt); }
.dv-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 14px; }
.dv-card-head { font-weight: 700; padding: 10px 16px; border-bottom: 1px solid var(--line); color: var(--txt); }
.dv-sub { padding: 10px 16px 0; font-size: var(--fs-1); color: var(--mut); font-weight: 700; }
.dv-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; font-size: 13px; }
.dv-label { width: 84px; flex-shrink: 0; color: var(--sub); font-weight: 600; }
.dv-hint, .dv-note { font-size: 12px; color: var(--mut); }
.dv-btn { border: 1px solid var(--line); background: var(--card); border-radius: 6px; padding: 5px 14px; font-size: 13px; cursor: pointer; color: var(--txt); }
.dv-btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
.dv-btn.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
.dv-btn:disabled { opacity: 0.5; cursor: default; }
.dv-clear-state { font-size: 12px; color: var(--c-paid); }
.dv-file { font-size: 12px; }
.dv-progress { padding: 0 16px 12px; }
.dv-bar { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
.dv-bar-fill { height: 100%; background: var(--accent); transition: width .3s ease; }
.dv-bar-fill.done { background: var(--c-paid); }
.dv-bar-fill.error { background: var(--danger); }
.dv-msg { font-size: 12px; color: var(--mut); margin-top: 6px; }
.dv-msg.done { color: var(--c-paid); }
.dv-msg.error { color: var(--danger); }
.dv-pmis-row { align-items: center; }
.dv-pmis-label { width: 200px; flex-shrink: 0; word-break: break-all; white-space: normal; line-height: 1.4; }
.dv-pmis-input { flex: 1; border: 1px solid var(--line); background: var(--card); border-radius: 6px; padding: 4px 8px; font-size: 12px; color: var(--txt); outline: none; }
.dv-pmis-input:focus { border-color: var(--accent); }
</style>
```

- [ ] **Step 2: 改写 DataView.test.ts**

把 `frontend/src/views/DataView.test.ts` 调整为新结构断言(stub fetch;断言三段存在、质量表已无):
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DataView from './DataView.vue'

describe('DataView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ links: {} }) })) as any)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('呈现 获取/更新/设置 三段,且无数据质量总览', () => {
    const w = mount(DataView)
    const text = w.text()
    expect(text).toContain('数据来源')
    expect(text).toContain('更新数据')
    expect(text).toContain('设置')
    expect(text).not.toContain('数据质量总览')
  })
})
```
(若旧测试 import 了 DataQualityTable 等,移除相关断言/import。)

- [ ] **Step 3: AboutView 删"数据更新"行**

`frontend/src/views/AboutView.vue`:删除第 38 行 `<div class="about-k">数据更新</div><div class="about-v">{{ lastUpdate }}</div>`,并删除不再使用的 `lastUpdate` computed(第 7 行)及其相关 import(若 `data` 仅为此用则一并清理;否则保留)。`AboutView.test.ts` 若断言"数据更新"则改为断言其不存在。

- [ ] **Step 4: 验证**

```bash
cd frontend && npx vitest run src/views/DataView.test.ts src/views/AboutView.test.ts && npm run typecheck
```
全绿。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts frontend/src/views/AboutView.vue frontend/src/views/AboutView.test.ts
git commit -m "feat(U2): DataView 获取/更新/设置三段重构 + 分源时间;AboutView 去更新行"
```

---

### Task 6: 前端 — FilterBar 按路由收敛

**Files:**
- Modify: `frontend/src/layout/AppLayout.vue`
- Modify: `frontend/src/router/index.ts`(给 data/about/governance 加 `meta.hideFilter`)
- Test: `frontend/src/layout/AppLayout.test.ts`(新建或追加)

- [ ] **Step 1: 给三条路由加 meta.hideFilter**

`frontend/src/router/index.ts`:给 `/data`、`/about`、`/governance` 三条路由的 `meta` 加 `hideFilter: true`,例如:
```ts
    { path: '/data', name: 'data', component: DataView, meta: { title: '数据管理', hideFilter: true } },
    { path: '/governance', name: 'governance', component: DataQualityView, meta: { title: '数据治理', hideFilter: true } },
    { path: '/about', name: 'about', component: AboutView, meta: { title: '关于产品', hideFilter: true } },
```

- [ ] **Step 2: 写失败测试(AppLayout 条件渲染)**

创建 `frontend/src/layout/AppLayout.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppLayout from './AppLayout.vue'

const Blank = { template: '<div/>' }
function makeRouter(routes: any[]) {
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('AppLayout FilterBar 按路由', () => {
  it('hideFilter 路由不渲染 FilterBar', async () => {
    const router = makeRouter([
      { path: '/', component: Blank, meta: {} },
      { path: '/data', component: Blank, meta: { hideFilter: true } },
    ])
    router.push('/data'); await router.isReady()
    const w = mount(AppLayout, { global: { plugins: [createPinia(), router] } })
    expect(w.findComponent({ name: 'FilterBar' }).exists()).toBe(false)
  })
  it('普通路由渲染 FilterBar', async () => {
    const router = makeRouter([{ path: '/', component: Blank, meta: {} }])
    router.push('/'); await router.isReady()
    const w = mount(AppLayout, { global: { plugins: [createPinia(), router] } })
    expect(w.findComponent({ name: 'FilterBar' }).exists()).toBe(true)
  })
})
```
(FilterBar 组件需有 name;若无,在 `FilterBar.vue` 加 `defineOptions({ name: 'FilterBar' })`,或测试改用 `w.find('.filter-bar').exists()`。优先用 class 选择器更稳:把断言改为 `w.find('.filter-bar').exists()`。)

- [ ] **Step 3: 运行失败 → 实现条件渲染**

`frontend/src/layout/AppLayout.vue` 脚本加路由判断,模板条件渲染:
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import FilterBar from './FilterBar.vue'
import ProjectDetailDrawer from '@/components/ProjectDetailDrawer.vue'
const route = useRoute()
const showFilter = computed(() => !route.meta?.hideFilter)
</script>
```
模板 `<FilterBar />` 改为 `<FilterBar v-if="showFilter" />`。

- [ ] **Step 4: 验证**

```bash
cd frontend && npx vitest run src/layout/AppLayout.test.ts src/router/index.test.ts && npm run typecheck
```
全绿(router 既有测试若断言路由数量/不含 meta 则相应更新)。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/layout/AppLayout.vue frontend/src/router/index.ts frontend/src/layout/AppLayout.test.ts
git commit -m "feat(U2): FilterBar 仅分析页显示(data/governance/about 隐藏)"
```

---

### Task 7: 全量验证 + 版本 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`。失败则读输出最小修正。

- [ ] **Step 2: 端到端冒烟(分发态)**

```bash
cd frontend && npm run build && cd ..
python server.py
```
打开后端地址→数据管理页:三段(获取/更新/设置)呈现;放置/上传 PMIS 后点"更新数据"→治理页有数据;`/data`、`/governance`、`/about` 无筛选条;关于页无"数据更新"行;顶部分源时间可见。验证后停止。

- [ ] **Step 3: 版本 + PROGRESS**

`frontend/src/version.ts`:
```ts
export const APP_VERSION = 'V6.3.0'
export const RELEASE_DATE = '2026-06-09'
```
`PROGRESS.md` 追加:
```
- U2 数据管理页重构完成:获取(云同步/离线导入/PMIS下载/PMIS上传)与更新(/api/reprocess)解耦,一键「更新数据」重处理;PMIS 离线多选上传(/api/pmis/upload);数据更新时间分源(总处理时间 + PMIS 数据时间 lastPmisUpdate)移至数据管理页;删除数据质量总览卡;FilterBar 仅分析页显示(data/governance/about 隐藏)。纳管开关保留(后续单独调整)。
```
顶部"最近更新/当前版本"行同步 U2 / V6.3.0。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "docs(U2): 版本 V6.3.0 + PROGRESS 记录数据管理页重构完成"
```

---

## Self-Review

**1. Spec coverage(对照 U2 spec):**
- 获取/更新解耦(sync/import/download 去自动处理 + /api/reprocess + 全局更新按钮)→ Task 1(后端)+ Task 4(useReprocess)+ Task 5(DataView 更新卡)✓
- PMIS 离线多选上传(/api/pmis/upload)→ Task 2(后端)+ Task 4(usePmisSync.upload)+ Task 5(离线上传 UI)✓
- PMIS 在线下载(去 reprocess)+ 链接配置/空态录入 → Task 4 + Task 5 ✓
- lastPmisUpdate 分源时间 → Task 3(后端+schema)+ Task 5(顶部展示)✓
- 删数据质量总览 → Task 5 ✓
- 数据更新时间从关于页移来 → Task 5 ✓
- FilterBar 路由收敛 → Task 6 ✓
- 纳管保留不动 → 各任务均不改 filter 纳管逻辑 ✓
- 验证/版本/PROGRESS → Task 7 ✓

**2. Placeholder scan:** 无 TBD;后端编排走 py_compile+ruff+现有测试+冒烟(诚实标注单线程限制);纯函数(is_valid_pmis_name/pmis_data_time)与 composables/视图均有真实测试。✓

**3. Type/命名一致性:**
- `/api/reprocess`、`/api/pmis/upload`、`is_valid_pmis_name`、`pmis_data_time`、`lastPmisUpdate`、`useReprocess`、`usePmisSync.upload` 全程一致。
- DataView 解构的 composable 返回名(repProgress/repRunning/startReprocess、pmisUpload 等)与各 composable 的 return 一致。
- `reprocess_state` 与 handler/SSE 循环一致;互斥检查引用 sync/import/pmis_state。
- schema `lastPmisUpdate` 与 pmis.py 写入键、前端读取路径 `dataQuality.summary.lastPmisUpdate` 一致。✓
