# 2C 项目标签体系（替代纳管，本地多标签 + 全局排除）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把云文档驱动的二态「纳管」换成**本地可编辑的项目多标签体系**：首次从云文档散落标记播种，此后纯本地维护；`/projects` 按标签多选筛选、`/project/:id` 逐项目编辑、`/data` 管理标签库并配置「按标签全局排除」替代旧纳管。

**Architecture:** 后端 `preprocess_data.py` 派生 `tagSeed`（白名单匹配两个截图列）写入 `analysis_data.json`；`server.py` 用本地 `data/project_tags.json`（沿用 followup 本地 JSON store 模式）承载标签库+挂载，首次按 tagSeed 播种、此后本地为准、不回写云；前端 `stores/projectTags.ts` 经 `GET/POST /api/tags` 读写；`stores/filter.ts` 派生 `excludedIds`（挂了所选排除标签的项目）取代 `naguanOn/naguanExclude`，喂给 `filterNodes`(旧链)+`filterProjects`(2B)；三处 UI 接入。

**Tech Stack:** Python 标准库 HTTP（server.py）+ pydantic（schema.py）；Vue3+Vite+TS+Pinia+Element Plus；Vitest + pytest；xlsx(SheetJS，导出本期仅记录待办)。

**版本：** `frontend/src/version.ts` 单一来源 **V1.3.0 → V1.4.0**（整页级）。

---

## 关键事实（已核实，落地照此）

后端（`server.py`/`preprocess_data.py`/`schema.py`）：
- `BASE_DIR` 双模式：`server.py:92-97`（frozen→`os.path.dirname(sys.executable)`；dev→`__file__` 目录）。
- followup 本地 store 范式：`server.py:162`（`FOLLOWUP_FILE`）、`server.py:182-196`（`_load/_save_followup_records`）、锁 `server.py:144-145`。
- 路由：`do_GET`（`server.py:344+`）、`do_POST`（`server.py:440+`）；**无 `do_PUT`** → 标签保存用 `POST /api/tags`。handler 范式 `handle_followup_add`（`server.py:638-712`），错误体 `_error_payload(code,msg)`（`server.py:177-179`），`_json_response`（`server.py:1094-1099`）。
- preprocess：`process_project_overview`（`preprocess_data.py:816-869`）动态读所有列，项目 dict 含中文键 `"合同验收回款时间节点截图"`、`"合同付款条件截图"`（且 col16 别名 `paymentSnapshot` 在 :857）；主流程组装 `final_data`（`preprocess_data.py:1270-1306`）后 `schema.validate_and_write_json`（`:1315`）。
- schema：`AnalysisData`（`schema.py:302-321`）；`validate_and_write_json`（`:324-332`）；类型同源命令 `cd frontend && npm run gen:types`（HX-9 漂移护栏）。
- pytest 范式：`tests/test_server_followup_state.py`（monkeypatch + fixture 隔离）。
- `.gitignore:31` `data/followup_records.json`（标签文件比照加一行）。

前端（`frontend/src`）：
- `stores/filter.ts`：`NAGUAN_KEY='naguan_on'`(:6)、`naguanOn`(:36)、`filteredNodes` 传 naguanExclude(:58-67)、`toggleNaguan`(:87-90)。
- `lib/filterNodes.ts`：`FilterOpts`(:5-12 含 naguanOn/naguanExclude)、过滤行(:20-24)。
- `lib/paymentPmis.ts`：`FilterOpts`(:57-63)、`filterProjects`(:64-71)。
- `lib/ledger.ts`：`naguanFilter(rawNodes, naguanOn, naguanExclude)`(:8-11)。
- `lib/dashboardStats.ts`：`computeDashboardSummary` opts 消费 naguanOn/naguanExclude(:151-155)。
- `filterProjects` 调用点：`BoardView.vue:55-58`、`PlanTab.vue:22-27`、`ProjectsOverviewTab.vue:17-22`、`RiskTab.vue:16-21`、`TierNodesTab.vue:16-21`。
- `naguanFilter` 调用点：`CalendarView.vue:54`、`LedgerView.vue:37-41`。
- store/api 范式：`stores/fuData.ts`、`lib/followupApi.ts`、`api/client.ts`（`api.get/api.post`，`ApiRequestError`）。
- `ProjectsView.vue`：列 `columns`(:54-69)、多选筛选范例 el-select(:79-87)、`filters` reactive(:22)、`buildProjectRows`(:16-21)、`filterProjectRows`(:37)。
- `ProjectDetailView.vue`：`buildProjectPage(..., route.params.id)`(:16-26)、`p`(:26)、TABS(:59-65)。
- `DataView.vue`：纳管开关 `naguanOn` computed(:88) + el-switch(:176)、`dv-card` 范式(:174-178)。

---

## File Structure

新增：
- `config.py` 增 `TAG_SEED_WHITELIST` + `TAG_SEED_COLUMNS`（单一来源，preprocess+server 共用）。
- `frontend/src/lib/projectTagsApi.ts` — `getTags()`/`saveTags(store)` HTTP 客户端。
- `frontend/src/stores/projectTags.ts` — 标签库 + 挂载的 Pinia store。
- `tests/test_tag_seed.py` — `derive_tag_seed` 纯函数 pytest。
- `tests/test_server_tags.py` — server 标签 store 读写/播种 pytest。
- 各前端 `.test.ts`（随任务）。

修改：
- `preprocess_data.py` — `derive_tag_seed` + 管道写 `tagSeed`。
- `schema.py` — `AnalysisData.tagSeed`。
- `server.py` — 标签本地 store + 首次播种 + `GET/POST /api/tags`。
- `.gitignore` — 加 `data/project_tags.json`。
- `frontend/src/types/analysis.ts` — `gen:types` 再生（含 tagSeed）。
- `frontend/src/stores/filter.ts` — `excludeOn/excludeTags/excludedIds` 取代 naguan。
- `frontend/src/lib/filterNodes.ts` / `lib/paymentPmis.ts` / `lib/ledger.ts` / `lib/dashboardStats.ts` — `FilterOpts` 字段 naguan→exclude 更名。
- `BoardView.vue` / `PlanTab.vue` / `ProjectsOverviewTab.vue` / `RiskTab.vue` / `TierNodesTab.vue` / `CalendarView.vue` / `LedgerView.vue` — 调用点改喂 `filter.excludeOn/excludedIds`。
- `frontend/src/views/ProjectDetailView.vue` — 项目标签编辑块。
- `frontend/src/views/ProjectsView.vue` + `frontend/src/lib/projectList.ts` — 标签列 + 多选筛选。
- `frontend/src/views/DataView.vue` — 标签库管理卡 + 排除配置（替换纳管开关）。
- `frontend/src/version.ts` — V1.4.0。
- `PROGRESS.md` — 2C 标完成 + backlog（导出待办）。

**不做（YAGNI）**：标签回写云；/projects 清单导出（仅记录待办）；标签颜色/层级/图标；同步后自动再播种；2D 跟进。

---

## Task 1: 后端 `derive_tag_seed` + schema `tagSeed` + 管道接入

**难度：核心算法 + 管道 → opus。**

**Files:**
- Modify: `config.py`（加白名单常量）
- Modify: `preprocess_data.py`（`derive_tag_seed` + 管道写入）
- Modify: `schema.py`（`AnalysisData.tagSeed`）
- Test: `tests/test_tag_seed.py`

- [ ] **Step 1: 在 `config.py` 末尾加常量**

```python
# 2C 项目标签：从云文档截图列播种的种子标签白名单（用户钦定）与扫描列
TAG_SEED_WHITELIST = ["BH项目", "框架合同", "退换货项目", "项目已关闭", "SM项目", "0元订单项目", "佳杰"]
TAG_SEED_COLUMNS = ["合同验收回款时间节点截图", "合同付款条件截图"]
```

- [ ] **Step 2: 写失败测试 `tests/test_tag_seed.py`**

```python
import preprocess_data as pre


def test_derive_tag_seed_whitelist_match():
    rows = [
        {"项目编号": "A", "合同验收回款时间节点截图": "BH项目", "合同付款条件截图": ""},
        {"项目编号": "B", "合同验收回款时间节点截图": "框架合同", "合同付款条件截图": "佳杰"},
        {"项目编号": "C", "合同验收回款时间节点截图": "已100%回款", "合同付款条件截图": "=DISPIMG(x)"},
        {"项目编号": "D", "合同验收回款时间节点截图": "佳杰", "合同付款条件截图": "佳杰"},
        {"项目编号": "", "合同验收回款时间节点截图": "BH项目", "合同付款条件截图": ""},
    ]
    seed = pre.derive_tag_seed(rows)
    assert seed["A"] == ["BH项目"]
    assert set(seed["B"]) == {"框架合同", "佳杰"}
    assert "C" not in seed            # 状态话/图片不入种子
    assert seed["D"] == ["佳杰"]      # 两列同值去重
    assert "" not in seed            # 空 pid 跳过


def test_derive_tag_seed_empty():
    assert pre.derive_tag_seed([]) == {}
```

- [ ] **Step 3: 运行确认失败**

Run: `python -m pytest tests/test_tag_seed.py -q`
Expected: FAIL（`AttributeError: module 'preprocess_data' has no attribute 'derive_tag_seed'`）

- [ ] **Step 4: 实现 `derive_tag_seed`（加到 `preprocess_data.py`，建议紧邻 `process_project_overview` 之后）**

```python
def derive_tag_seed(project_rows):
    """2C 标签播种：扫 config.TAG_SEED_COLUMNS 两列文字，命中 config.TAG_SEED_WHITELIST
    的给项目挂对应标签（两列并集、去重、忽略图片公式与非白名单文字）。返回 {pid: [tag,...]}。"""
    wl = set(config.TAG_SEED_WHITELIST)
    seed = {}
    for p in project_rows or []:
        pid = str(p.get("项目编号", "")).strip()
        if not pid:
            continue
        tags = []
        for col in config.TAG_SEED_COLUMNS:
            val = str(p.get(col, "")).strip()
            if val in wl and val not in tags:
                tags.append(val)
        if tags:
            seed[pid] = tags
    return seed
```

- [ ] **Step 5: 管道接入——在 `preprocess_data.py` 主流程 `final_data` 组装处（约 :1270-1306）加一键**

在 `final_data = { ... }` 字典里加（用 `process_project_overview` 返回的项目列表变量；该变量含中文截图列键——实现前在 main 里确认其变量名，通常是 `projects` 或 `project_overview` 的源）：

```python
        "tagSeed": derive_tag_seed(<process_project_overview 返回的项目列表变量>),
```

> 注：必须传**含中文截图列键的原始项目 dict 列表**（`process_project_overview` 的第一个返回值），不是裁剪过的展示列表。若主流程里该列表已被覆盖，改在 `process_project_overview` 调用处先 `tag_seed = derive_tag_seed(projects)` 暂存再用。

- [ ] **Step 6: schema 加字段——`schema.py` `AnalysisData` 末尾（:321 `periodCompare` 之后）**

```python
    tagSeed: Dict[str, List[str]] = {}
```

- [ ] **Step 7: 运行 pytest + 重生类型**

Run: `python -m pytest tests/test_tag_seed.py -q`
Expected: PASS

Run: `cd frontend && npm run gen:types`
Expected: `src/types/analysis.ts` 新增 `tagSeed`，`git diff` 可见。

- [ ] **Step 8: 真实数据核验（可选但建议）**

Run: `python preprocess_data.py`（或现有重处理入口）后：
```bash
python -c "import json; d=json.load(open('data/analysis_data.json',encoding='utf-8')); ts=d.get('tagSeed',{}); from collections import Counter; c=Counter(t for v in ts.values() for t in v); print('项目数', len(ts), dict(c))"
```
Expected: 接近 BH项目 12 / 框架合同 16 / 退换货项目 2 / 项目已关闭 4 / 佳杰 ~。

- [ ] **Step 9: Commit**

```bash
git add config.py preprocess_data.py schema.py tests/test_tag_seed.py frontend/src/types/analysis.ts
git commit -m "feat(2c): derive_tag_seed 白名单播种 + schema tagSeed + 类型同源"
```

---

## Task 2: server.py 标签本地 store + 首次播种 + `GET/POST /api/tags`

**难度：易踩坑（frozen 路径/播种/路由）→ opus。**

**Files:**
- Modify: `server.py`
- Modify: `.gitignore`
- Test: `tests/test_server_tags.py`

- [ ] **Step 1: 写失败测试 `tests/test_server_tags.py`**

```python
import json
import os
import server


def test_load_tags_seeds_from_analysis(tmp_path, monkeypatch):
    tags_file = tmp_path / "project_tags.json"
    analysis_file = tmp_path / "analysis_data.json"
    analysis_file.write_text(json.dumps({
        "tagSeed": {"A": ["BH项目"], "B": ["框架合同", "佳杰"]}
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(tags_file))
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(analysis_file))

    store = server._load_project_tags()
    assert store["version"] == 1
    assert {t["name"] for t in store["tags"]} == {"BH项目", "框架合同", "佳杰"}
    assert store["assignments"]["A"] == ["BH项目"]
    # 首次加载应落盘
    assert os.path.exists(str(tags_file))


def test_load_tags_local_wins(tmp_path, monkeypatch):
    tags_file = tmp_path / "project_tags.json"
    tags_file.write_text(json.dumps({
        "version": 1, "tags": [{"name": "自定义"}], "assignments": {"Z": ["自定义"]}
    }, ensure_ascii=False), encoding="utf-8")
    analysis_file = tmp_path / "analysis_data.json"
    analysis_file.write_text(json.dumps({"tagSeed": {"A": ["BH项目"]}}), encoding="utf-8")
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(tags_file))
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(analysis_file))

    store = server._load_project_tags()
    assert store["assignments"] == {"Z": ["自定义"]}   # 已存在不被播种覆盖


def test_save_tags_roundtrip(tmp_path, monkeypatch):
    tags_file = tmp_path / "project_tags.json"
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(tags_file))
    store = {"version": 1, "tags": [{"name": "X"}], "assignments": {"P": ["X"]}}
    server._save_project_tags(store)
    assert server._load_project_tags()["assignments"]["P"] == ["X"]
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_server_tags.py -q`
Expected: FAIL（`AttributeError: ... PROJECT_TAGS_FILE` / `_load_project_tags`）

- [ ] **Step 3: 在 `server.py` 加文件常量、锁、load/save、播种**（紧邻 followup 区，约 :162/:196 后）

```python
PROJECT_TAGS_FILE = os.path.join(BASE_DIR, 'data', 'project_tags.json')
ANALYSIS_FILE = os.path.join(BASE_DIR, 'data', 'analysis_data.json')
_tags_lock = threading.Lock()


def _build_initial_tags():
    """首次播种：读 analysis_data.json 的 tagSeed，标签库=实际出现的白名单项(按白名单序)。"""
    seed = {}
    try:
        with open(ANALYSIS_FILE, 'r', encoding='utf-8') as f:
            seed = json.load(f).get('tagSeed', {}) or {}
    except Exception:
        seed = {}
    appeared = set()
    for tags in seed.values():
        appeared.update(tags)
    vocab = [{"name": n} for n in config.TAG_SEED_WHITELIST if n in appeared]
    return {"version": 1, "tags": vocab, "assignments": seed}


def _load_project_tags():
    """本地标签 store；不存在则按 tagSeed 首次播种并落盘，此后本地为准。"""
    with _tags_lock:
        if os.path.exists(PROJECT_TAGS_FILE):
            try:
                with open(PROJECT_TAGS_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        store = _build_initial_tags()
    _save_project_tags(store)
    return store


def _save_project_tags(store):
    with _tags_lock:
        os.makedirs(os.path.dirname(PROJECT_TAGS_FILE), exist_ok=True)
        with open(PROJECT_TAGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
```

> 确认 `import config` 已在 server.py 顶部（preprocess 用了 config，server 大概率也已 import；若无则补 `import config`）。`BASE_DIR` 已在 :92-97 定义（frozen 双模式自动正确）。

- [ ] **Step 4: 运行 pytest 确认通过**

Run: `python -m pytest tests/test_server_tags.py -q`
Expected: PASS（3 项）

- [ ] **Step 5: 加路由 handler**

`do_GET`（约 :377，followup 路由附近）加：
```python
        elif parsed.path == '/api/tags':
            self.handle_tags_get()
```
`do_POST`（约 :455）加：
```python
        elif parsed.path == '/api/tags':
            self.handle_tags_save()
```
handler 方法（加在 followup handler 附近）：
```python
    def handle_tags_get(self):
        """GET /api/tags — 返回标签库与挂载（首次自动播种）。"""
        try:
            store = _load_project_tags()
            self._json_response({"success": True, "tags": store.get("tags", []),
                                 "assignments": store.get("assignments", {})})
        except Exception as e:
            self._json_response(_error_payload("internal_error", f"读取标签失败: {e}"))

    def handle_tags_save(self):
        """POST /api/tags — 整存标签库与挂载（不回写云）。"""
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:
            self._json_response(_error_payload("parse_error", f"请求解析失败: {e}"))
            return
        tags = body.get("tags")
        assignments = body.get("assignments")
        if not isinstance(tags, list) or not isinstance(assignments, dict):
            self._json_response(_error_payload("validation", "tags 须为数组、assignments 须为对象"))
            return
        try:
            _save_project_tags({"version": 1, "tags": tags, "assignments": assignments})
            self._json_response({"success": True})
        except Exception as e:
            self._json_response(_error_payload("internal_error", f"保存标签失败: {e}"))
```

> `_error_payload` 的 code 取值参照既有常量（如 `ERR_PARSE/ERR_VALIDATION`，见 server.py 顶部；若用常量则替换字符串）。frozen 与 dev 两分支共用同一 handler（路径基于 BASE_DIR 已正确），无需额外分支。

- [ ] **Step 6: `.gitignore` 加（:31 `data/followup_records.json` 之后）**

```
# 项目标签库（运行时用户数据，2C）
data/project_tags.json
```

- [ ] **Step 7: 语法编译 + pytest 全量**

Run: `python -m py_compile server.py && python -m pytest -q`
Expected: PASS（含新 2 个测试文件）

- [ ] **Step 8: Commit**

```bash
git add server.py .gitignore tests/test_server_tags.py
git commit -m "feat(2c): server 本地标签 store + 首次播种 + GET/POST /api/tags"
```

---

## Task 3: 前端 `projectTagsApi` + `stores/projectTags`

**难度：常规 → sonnet。**

**Files:**
- Create: `frontend/src/lib/projectTagsApi.ts`
- Create: `frontend/src/stores/projectTags.ts`
- Test: `frontend/src/stores/projectTags.test.ts`

- [ ] **Step 1: 写失败测试 `frontend/src/stores/projectTags.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectTagsStore } from './projectTags'

vi.mock('@/lib/projectTagsApi', () => ({
  getTags: vi.fn(async () => ({ tags: [{ name: 'BH项目' }, { name: '框架合同' }], assignments: { A: ['BH项目'] } })),
  saveTags: vi.fn(async () => ({ success: true })),
}))
import { getTags, saveTags } from '@/lib/projectTagsApi'

describe('projectTags store', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('load 拉取标签库与挂载', async () => {
    const s = useProjectTagsStore()
    await s.load()
    expect(s.tags.map((t) => t.name)).toEqual(['BH项目', '框架合同'])
    expect(s.assignments.A).toEqual(['BH项目'])
    expect(s.activeTags.map((t) => t.name)).toEqual(['BH项目', '框架合同'])
  })

  it('addTag 去重；setProjectTags 设置；toggleTag 切换', async () => {
    const s = useProjectTagsStore(); await s.load()
    s.addTag('BH项目')                 // 已存在不重复
    s.addTag('退换货项目')
    expect(s.tags.map((t) => t.name)).toContain('退换货项目')
    s.setProjectTags('B', ['框架合同'])
    expect(s.assignments.B).toEqual(['框架合同'])
    s.toggleTag('B', '框架合同')        // 去掉
    expect(s.assignments.B ?? []).toEqual([])
  })

  it('renameTag 迁移挂载；disableTag 软停用', async () => {
    const s = useProjectTagsStore(); await s.load()
    s.renameTag('BH项目', 'BH重点')
    expect(s.tags.map((t) => t.name)).toContain('BH重点')
    expect(s.assignments.A).toEqual(['BH重点'])
    s.disableTag('框架合同', true)
    expect(s.activeTags.map((t) => t.name)).not.toContain('框架合同')
  })

  it('save 调用 api 整存', async () => {
    const s = useProjectTagsStore(); await s.load()
    await s.save()
    expect(saveTags).toHaveBeenCalledWith({ tags: s.tags, assignments: s.assignments })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/stores/projectTags.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `frontend/src/lib/projectTagsApi.ts`**

```ts
import { api } from '@/api/client'

export interface TagDef { name: string; disabled?: boolean }
export interface TagStore { tags: TagDef[]; assignments: Record<string, string[]> }

export function getTags(): Promise<TagStore & { success?: boolean }> {
  return api.get<TagStore & { success?: boolean }>('/api/tags')
}
export function saveTags(store: TagStore): Promise<{ success: boolean }> {
  return api.post<{ success: boolean }>('/api/tags', store)
}
```

- [ ] **Step 4: 实现 `frontend/src/stores/projectTags.ts`**

```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getTags, saveTags, type TagDef } from '@/lib/projectTagsApi'

export const useProjectTagsStore = defineStore('projectTags', () => {
  const tags = ref<TagDef[]>([])
  const assignments = ref<Record<string, string[]>>({})
  const loaded = ref(false)
  const saving = ref(false)

  const activeTags = computed(() => tags.value.filter((t) => !t.disabled))
  const tagsOf = (pid: string): string[] => assignments.value[pid] ?? []

  async function load() {
    const r = await getTags()
    tags.value = r.tags ?? []
    assignments.value = r.assignments ?? {}
    loaded.value = true
  }

  function addTag(name: string) {
    const n = name.trim()
    if (!n || tags.value.some((t) => t.name === n)) return
    tags.value = [...tags.value, { name: n }]
  }
  function renameTag(oldName: string, newName: string) {
    const nn = newName.trim()
    if (!nn || oldName === nn) return
    tags.value = tags.value.map((t) => (t.name === oldName ? { ...t, name: nn } : t))
    const next: Record<string, string[]> = {}
    for (const [pid, names] of Object.entries(assignments.value)) {
      next[pid] = names.map((x) => (x === oldName ? nn : x))
    }
    assignments.value = next
  }
  function disableTag(name: string, on: boolean) {
    tags.value = tags.value.map((t) => (t.name === name ? { ...t, disabled: on } : t))
  }
  function setProjectTags(pid: string, names: string[]) {
    assignments.value = { ...assignments.value, [pid]: [...new Set(names)] }
  }
  function toggleTag(pid: string, name: string) {
    const cur = new Set(assignments.value[pid] ?? [])
    cur.has(name) ? cur.delete(name) : cur.add(name)
    setProjectTags(pid, [...cur])
  }
  async function save() {
    saving.value = true
    try {
      await saveTags({ tags: tags.value, assignments: assignments.value })
    } finally {
      saving.value = false
    }
  }

  return { tags, assignments, loaded, saving, activeTags, tagsOf,
           load, addTag, renameTag, disableTag, setProjectTags, toggleTag, save }
})
```

- [ ] **Step 5: 运行测试 + typecheck**

Run: `cd frontend && npx vitest run src/stores/projectTags.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/projectTagsApi.ts frontend/src/stores/projectTags.ts frontend/src/stores/projectTags.test.ts
git commit -m "feat(2c): projectTags store + api(本地标签库/挂载 CRUD)"
```

---

## Task 4: filterStore 排除派生（excludeOn/excludeTags/excludedIds）

**难度：store 接线 → opus。** 新增不破坏既有：本任务只加新 state/getter，不动旧 naguan（Task 5 才切换消费方）。

**Files:**
- Modify: `frontend/src/stores/filter.ts`
- Test: `frontend/src/stores/filter.test.ts`（追加 describe）

- [ ] **Step 1: 追加失败测试到 `frontend/src/stores/filter.test.ts`**

```ts
import { useProjectTagsStore } from '@/stores/projectTags'

describe('filter excludedIds（按标签全局排除）', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
  it('excludeOn 关 → 空；开+选标签 → 命中项目集', () => {
    const tags = useProjectTagsStore()
    tags.assignments = { A: ['框架合同'], B: ['BH项目'], C: ['框架合同', 'BH项目'] } as any
    const f = useFilterStore()
    expect(f.excludedIds).toEqual({})           // 默认关
    f.setExclude(true, ['框架合同'])
    expect(f.excludedIds).toEqual({ A: true, C: true })
    expect(f.excludeOn).toBe(true)
    expect(f.excludeTags).toEqual(['框架合同'])
  })
  it('开但未选标签 → 空（不误排除）', () => {
    const f = useFilterStore()
    f.setExclude(true, [])
    expect(f.excludedIds).toEqual({})
  })
})
```

> 顶部若无 `useFilterStore`/pinia import 按文件现有补。

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts`
Expected: FAIL（`setExclude`/`excludedIds` 未定义）

- [ ] **Step 3: 改 `frontend/src/stores/filter.ts`——加排除 state/getter/action**

顶部 import 加：
```ts
import { useProjectTagsStore } from '@/stores/projectTags'
```
常量区加（与 `NAGUAN_KEY` 并列）：
```ts
const EXCLUDE_ON_KEY = 'pa_exclude_on'
const EXCLUDE_TAGS_KEY = 'pa_exclude_tags'
```
store 内加（在 return 之前）：
```ts
  const projectTags = useProjectTagsStore()
  const excludeOn = ref(localStorage.getItem(EXCLUDE_ON_KEY) === 'true')
  const excludeTags = ref<string[]>(JSON.parse(localStorage.getItem(EXCLUDE_TAGS_KEY) || '[]'))

  const excludedIds = computed<Record<string, boolean>>(() => {
    if (!excludeOn.value || excludeTags.value.length === 0) return {}
    const sel = new Set(excludeTags.value)
    const out: Record<string, boolean> = {}
    for (const [pid, names] of Object.entries(projectTags.assignments)) {
      if (names.some((n) => sel.has(n))) out[pid] = true
    }
    return out
  })

  function setExclude(on: boolean, tags: string[]) {
    excludeOn.value = on
    excludeTags.value = [...tags]
    localStorage.setItem(EXCLUDE_ON_KEY, on ? 'true' : 'false')
    localStorage.setItem(EXCLUDE_TAGS_KEY, JSON.stringify(tags))
  }
```
在 `return { ... }` 里追加导出：`excludeOn, excludeTags, excludedIds, setExclude`。

- [ ] **Step 4: 运行测试 + typecheck**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts && npm run typecheck`
Expected: PASS（旧 naguan 测试仍在、未动）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/filter.ts frontend/src/stores/filter.test.ts
git commit -m "feat(2c): filterStore 派生 excludedIds(按标签全局排除,localStorage 持久)"
```

---

## Task 5: naguan→exclude 切换（过滤函数更名 + 全调用点改喂标签排除 + 去旧纳管）

**难度：易踩坑（跨 11 文件机械更名 + 行为切换）→ opus。** 一次切净，typecheck 兜底。

**Files（全部）:**
- Modify: `lib/filterNodes.ts`、`lib/paymentPmis.ts`、`lib/ledger.ts`、`lib/dashboardStats.ts`（FilterOpts 字段 naguan→exclude）
- Modify: `stores/filter.ts`（filteredNodes 改喂 excludeOn/excludedIds；删 naguanOn/toggleNaguan）
- Modify: `BoardView.vue`、`PlanTab.vue`、`ProjectsOverviewTab.vue`、`RiskTab.vue`、`TierNodesTab.vue`、`CalendarView.vue`、`LedgerView.vue`、`DataView.vue`（调用点改喂；删纳管开关）
- Modify: 相关 `.test.ts`（filterNodes/paymentPmis/ledger 测试字段更名）

- [ ] **Step 1: grep 锁定全部调用点**

Run:
```bash
cd frontend && grep -rn "naguanOn\|naguanExclude\|toggleNaguan\|naguanFilter\|naguan_on" src --include=*.ts --include=*.vue
```
Expected: 命中清单 = 关键事实所列 11 文件；逐一在下列步骤处理。

- [ ] **Step 2: 更新 lib 测试（先改测试断言字段名）**

`lib/filterNodes.test.ts` / `lib/paymentPmis.test.ts` / `lib/ledger.test.ts` 内所有 `naguanOn` → `excludeActive`、`naguanExclude` → `excludedIds`（仅字段名，语义不变；逐文件替换）。`naguanFilter(rawNodes, naguanOn, naguanExclude)` 调用 → `excludeFilter(rawNodes, excludeActive, excludedIds)`。

- [ ] **Step 3: 改 `lib/filterNodes.ts`**

`FilterOpts`（:5-12）字段更名：`naguanOn: boolean` → `excludeActive: boolean`、`naguanExclude: Record<string, boolean>` → `excludedIds: Record<string, boolean>`。过滤行（:23）：
```ts
  if (opts.excludeActive && opts.excludedIds) nodes = nodes.filter((n) => !opts.excludedIds[n.projectId])
```

- [ ] **Step 4: 改 `lib/paymentPmis.ts`**

`FilterOpts`（:57-63）：`naguanOn`→`excludeActive`、`naguanExclude`→`excludedIds`。`filterProjects`（:64-71）第一行：
```ts
    if (opts.excludeActive && opts.excludedIds && opts.excludedIds[p.projectId]) return false
```

- [ ] **Step 5: 改 `lib/ledger.ts`**

`naguanFilter(rawNodes, naguanOn, naguanExclude)`（:8-11）→ 函数重命名 `excludeFilter(rawNodes, excludeActive, excludedIds)`，内部：
```ts
  if (!excludeActive || !excludedIds) return rawNodes
  return rawNodes.filter((n) => !excludedIds[(n as any).projectId])
```

- [ ] **Step 6: 改 `lib/dashboardStats.ts`**

`computeDashboardSummary` 的 opts（:151-155 区）字段 `naguanOn`→`excludeActive`、`naguanExclude`→`excludedIds`，过滤行同构更名（保持语义）。

- [ ] **Step 7: 改 `stores/filter.ts`——filteredNodes 改喂、删旧 naguan**

- `filteredNodes` getter（:58-67）把 `naguanOn: naguanOn.value, naguanExclude: (data.data?.naguanExclude ?? {})` → `excludeActive: excludeOn.value, excludedIds: excludedIds.value`。
- 删 `NAGUAN_KEY`、`naguanOn` ref、`toggleNaguan`、return 里的 `naguanOn/toggleNaguan`。

- [ ] **Step 8: 改 5 个 filterProjects 调用点**（BoardView/PlanTab/ProjectsOverviewTab/RiskTab/TierNodesTab）

每处 `filterProjects(data.data?.projects ?? [], { viewMode:…, viewL4:…, viewPM:…, naguanOn: filter.naguanOn, naguanExclude: data.data?.naguanExclude ?? {} })` 的后两字段 →
```ts
      excludeActive: filter.excludeOn, excludedIds: filter.excludedIds,
```

- [ ] **Step 9: 改 Calendar/Ledger 的 naguanFilter 调用**（CalendarView:54 / LedgerView:37-41）

`naguanFilter(rawNodes.value, filter.naguanOn, data.data?.naguanExclude)` → `excludeFilter(rawNodes.value, filter.excludeOn, filter.excludedIds)`（import 名同步改）。

- [ ] **Step 10: 改 `DataView.vue`——删纳管开关行**

删 `naguanOn` computed（:88）与 el-switch 那一 `dv-row`（:176）。（新的「按标签排除」配置在 Task 8 加，本步只移除旧件，保持 DataView 可编译。）

- [ ] **Step 11: 全量 typecheck + vitest**

Run: `cd frontend && npm run typecheck && npx vitest run`
Expected: PASS（typecheck 0 错误是切净标志；任何漏改字段会被 TS 抓出）。grep 复核无 `naguan` 残留（除后端输出与 types/analysis.ts 的 naguanMap/naguanExclude 字段——那是 schema 字段，本期保留）。

- [ ] **Step 12: Commit**

```bash
git add -A frontend/src
git commit -m "refactor(2c): 过滤排除 naguan→exclude(标签驱动);filteredNodes/filterProjects/ledger 改喂 excludedIds;去旧纳管开关"
```

---

## Task 6: `/project/:id` 详情页标签编辑块

**难度：常规组件 → sonnet。**

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue`
- Test: `frontend/src/views/ProjectDetailView.test.ts`（追加或新增标签块断言）

- [ ] **Step 1: 写/追加失败测试**

在 `ProjectDetailView.test.ts`（无则新建，挂载样板照该文件现有或仿 ProjectsView.test.ts）追加：

```ts
import { useProjectTagsStore } from '@/stores/projectTags'
// ... 既有挂载样板（seed data store + route id=某项目）...

it('渲染项目标签块，显示已挂标签', async () => {
  // seed: 当前项目 projectId='A'
  const tags = useProjectTagsStore()
  tags.tags = [{ name: 'BH项目' }, { name: '框架合同' }] as any
  tags.assignments = { A: ['BH项目'] } as any
  const w = mount(ProjectDetailView, { /* 既有 global/router 桩 */ })
  expect(w.text()).toContain('项目标签')
  expect(w.text()).toContain('BH项目')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: FAIL（无"项目标签"文案）

- [ ] **Step 3: 改 `ProjectDetailView.vue`——加标签块**

`<script setup>` 增：
```ts
import { useProjectTagsStore } from '@/stores/projectTags'
const projectTags = useProjectTagsStore()
onMounted(() => { if (!projectTags.loaded) projectTags.load() })
const myTags = computed(() => projectTags.tagsOf(String(route.params.id || '')))
const addInput = ref('')
function addOne() {
  const name = addInput.value.trim()
  if (!name) return
  projectTags.addTag(name)
  projectTags.toggleTag(String(route.params.id), name) // 确保挂上（toggleTag 若已挂会取消→改用 ensure）
  addInput.value = ''
  projectTags.save()
}
function removeOne(name: string) {
  projectTags.setProjectTags(String(route.params.id), myTags.value.filter((t) => t !== name))
  projectTags.save()
}
function assignExisting(name: string) {
  if (!myTags.value.includes(name)) {
    projectTags.setProjectTags(String(route.params.id), [...myTags.value, name])
    projectTags.save()
  }
}
```
> `addOne` 用 `assignExisting` 语义更稳（避免 toggle 把刚加的又取消）：
```ts
function addOne() {
  const name = addInput.value.trim(); if (!name) return
  projectTags.addTag(name); assignExisting(name); addInput.value = ''
}
```

template 在头部徽章后、Tab(:59-65 区)前插入：
```vue
    <section class="pd-tags">
      <span class="pdt-label">项目标签</span>
      <span v-for="t in myTags" :key="t" class="tag-chip">{{ t }}<span class="tag-x" @click="removeOne(t)">✕</span></span>
      <span v-if="!myTags.length" class="pdt-empty">未打标签</span>
      <el-select v-model="addInput" size="small" filterable allow-create default-first-option
                 placeholder="加标签" style="width: 150px" @change="addOne">
        <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
      </el-select>
    </section>
```

`<style scoped>` 增：
```css
.pd-tags { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); margin: var(--sp-2) 0 var(--gap-section); }
.pdt-label { font-size: var(--fs-2); color: var(--sub); }
.pdt-empty { font-size: var(--fs-1); color: var(--mut); }
.tag-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--r-sm); background: var(--card2); color: var(--sub); font-size: var(--fs-1); }
.tag-x { cursor: pointer; color: var(--mut); }
.tag-x:hover { color: var(--danger-text); }
```

- [ ] **Step 4: 运行测试 + typecheck**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(2c): /project/:id 项目标签编辑块(加/删/新建即建库,本地持久)"
```

---

## Task 7: `/projects` 标签列 + 多选标签筛选

**难度：常规组件 → sonnet。**

**Files:**
- Modify: `frontend/src/lib/projectList.ts`（行加 tags 字段 + 筛选）
- Modify: `frontend/src/views/ProjectsView.vue`（列 + 多选筛选控件）
- Test: `frontend/src/lib/projectList.test.ts` / `frontend/src/views/ProjectsView.test.ts`

- [ ] **Step 1: 写失败测试（lib 层标签筛选）**

在 `frontend/src/lib/projectList.test.ts` 追加（确认 `filterProjectRows` 与 `ProjectFilters` 导出名后）：

```ts
it('按标签多选过滤(并集 OR)', () => {
  const rows = [
    { projectId: 'A', tags: ['BH项目'] },
    { projectId: 'B', tags: ['框架合同'] },
    { projectId: 'C', tags: [] },
  ] as any
  expect(filterProjectRows(rows, { ...EMPTY_FILTERS, tags: ['BH项目', '框架合同'] }).map((r) => r.projectId)).toEqual(['A', 'B'])
  expect(filterProjectRows(rows, { ...EMPTY_FILTERS, tags: [] }).length).toBe(3)
})
```
> `EMPTY_FILTERS` = 该文件测试里现有的空 filters 基准（无则按 `ProjectFilters` 全空构造）。

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts`
Expected: FAIL（`tags` 未在 filter 处理 / 行无 tags）

- [ ] **Step 3: 改 `lib/projectList.ts`**

- `ProjectFilters` 接口加 `tags: string[]`。
- `ProjectRow` 加 `tags?: string[]`。
- `buildProjectRows` 增形参 `assignments?: Record<string, string[]>`，行内 `tags: assignments?.[p.projectId] ?? []`。
- `filterProjectRows` 增标签分支：
```ts
  if (f.tags && f.tags.length) {
    const sel = new Set(f.tags)
    rows = rows.filter((r) => (r.tags ?? []).some((t) => sel.has(t)))
  }
```

- [ ] **Step 4: 改 `views/ProjectsView.vue`**

- `buildProjectRows(...)` 传第三参 `projectTags.assignments`：先 `import { useProjectTagsStore } from '@/stores/projectTags'`、`const projectTags = useProjectTagsStore()`、`onMounted` load。
- `filters` reactive 加 `tags: []`。
- `columns` 加（适当位置，如健康度后）：`{ key: 'tags', label: '标签', width: 160 }`，并用具名插槽渲染 chip：
```vue
  <template #cell-tags="{ value }">
    <span v-for="t in (value || [])" :key="t" class="lst-tag">{{ t }}</span>
  </template>
```
- 筛选行加标签多选（仿 :79-87 范例）：
```vue
  <el-select v-model="filters.tags" size="small" multiple collapse-tags clearable placeholder="标签" style="width: 140px">
    <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
  </el-select>
```
- `<style>` 加 `.lst-tag { display:inline-block; padding:1px 6px; margin:1px; border-radius:var(--r-sm); background:var(--card2); color:var(--sub); font-size:var(--fs-1); }`

- [ ] **Step 5: 测试 + typecheck**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts src/views/ProjectsView.test.ts && npm run typecheck`
Expected: PASS（ProjectsView.test 若断旧列数需同步 +1）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/projectList.ts frontend/src/views/ProjectsView.vue frontend/src/lib/projectList.test.ts frontend/src/views/ProjectsView.test.ts
git commit -m "feat(2c): /projects 标签列 + 标签多选筛选(并集)"
```

---

## Task 8: `/data` 标签库管理卡 + 按标签排除配置

**难度：常规偏接线 → sonnet（CF/store 联动 opus 可接管）。**

**Files:**
- Modify: `frontend/src/views/DataView.vue`
- Test: `frontend/src/views/DataView.test.ts`（追加标签卡断言）

- [ ] **Step 1: 写失败测试**

`DataView.test.ts` 追加（挂载样板照现有）：

```ts
import { useProjectTagsStore } from '@/stores/projectTags'
it('渲染标签库管理 + 按标签排除配置', async () => {
  const tags = useProjectTagsStore()
  tags.tags = [{ name: 'BH项目' }, { name: '框架合同' }] as any
  const w = mount(DataView, { /* 既有 global 桩 */ })
  expect(w.text()).toContain('项目标签')
  expect(w.text()).toContain('按标签排除')
  expect(w.text()).toContain('BH项目')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts`
Expected: FAIL

- [ ] **Step 3: 改 `DataView.vue`——加「项目标签」卡**

`<script setup>` 增：
```ts
import { useProjectTagsStore } from '@/stores/projectTags'
import { useFilterStore } from '@/stores/filter'
const projectTags = useProjectTagsStore()
const filter = useFilterStore()
onMounted(() => { if (!projectTags.loaded) projectTags.load() })
const newTag = ref('')
function onAddTag() { const n = newTag.value.trim(); if (n) { projectTags.addTag(n); projectTags.save(); newTag.value = '' } }
function onRename(oldN: string, e: Event) { const v = (e.target as HTMLInputElement).value.trim(); if (v && v !== oldN) { projectTags.renameTag(oldN, v); projectTags.save() } }
function onDisable(name: string, on: boolean) { projectTags.disableTag(name, on); projectTags.save() }
const excludeOn = computed({ get: () => filter.excludeOn, set: (v: boolean) => filter.setExclude(v, filter.excludeTags) })
const excludeTags = computed({ get: () => filter.excludeTags, set: (v: string[]) => filter.setExclude(filter.excludeOn, v) })
```

template 在「设置」卡之后、数据历史卡之前插入：
```vue
    <div class="dv-card">
      <div class="dv-card-head">项目标签</div>
      <div class="dv-row dv-tags-mgr">
        <span class="dv-label">标签库</span>
        <span v-for="t in projectTags.tags" :key="t.name" class="dv-tag" :class="{ off: t.disabled }">
          <input class="dv-tag-name" :value="t.name" @change="onRename(t.name, $event)" />
          <el-switch :model-value="!t.disabled" size="small" @update:model-value="(v:boolean) => onDisable(t.name, !v)" />
        </span>
        <el-input v-model="newTag" size="small" placeholder="新标签" style="width: 120px" @keyup.enter="onAddTag" />
        <button class="dv-btn" @click="onAddTag">添加</button>
      </div>
      <div class="dv-row">
        <span class="dv-label">按标签排除</span>
        <el-switch v-model="excludeOn" />
        <el-select v-model="excludeTags" size="small" multiple collapse-tags clearable placeholder="选要排除的标签" style="width: 220px">
          <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
        </el-select>
        <span class="dv-hint">开启后，挂有所选标签的项目从所有看板隐藏（替代旧纳管）</span>
      </div>
    </div>
```

`<style>` 增：
```css
.dv-tags-mgr { flex-wrap: wrap; gap: var(--sp-2); }
.dv-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border: 1px solid var(--line); border-radius: var(--r-sm); }
.dv-tag.off { opacity: .5; }
.dv-tag-name { width: 84px; border: none; background: transparent; color: var(--txt); font-size: var(--fs-1); }
```

- [ ] **Step 4: 测试 + typecheck**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(2c): /data 标签库管理(增/改名/停用) + 按标签排除配置(开关+多选,替代纳管)"
```

---

## Task 9: 版本 V1.4.0 + 全量验证 + 真实数据冒烟 + PROGRESS

**难度：机械 + 核实 → 主循环。**

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 版本号** — `frontend/src/version.ts`：`APP_VERSION = 'V1.4.0'`。

- [ ] **Step 2: 全量 verify**

Run: `bash verify.sh`
Expected: 四步全绿（py_compile + ruff + pytest[含 test_tag_seed/test_server_tags] + 前端 typecheck/vitest/build）。

- [ ] **Step 3: 真实数据冒烟（人工，spec §11）**

`python server.py` 首次启动 → 确认 `data/project_tags.json` 生成且 BH项目12/框架合同16/退换货2/项目已关闭4 等计数吻合；`cd frontend && npm run dev` →
- `/project/:id` 给某项目加/删标签 → 刷新仍在（本地持久）。
- `/projects` 标签列显示、标签多选筛选生效。
- `/data` 标签库增/改名/停用；开「按标签排除」+ 选标签 → 对应项目在 /panalysis 与 /payment·日历·台账全部隐藏；关闭恢复。
- 重新「更新数据」后本地标签不被覆盖。

> 默认 `excludeOn=false`、`excludeTags=[]`（净态，旧 27 个纳管隐藏项目默认不再隐藏，由用户在 /data 自行配置排除标签）——冒烟时确认此默认，并在交付说明里提示用户。

- [ ] **Step 4: 更新 `PROGRESS.md`**

- 头部「当前版本」→ **V1.4.0**、「最近更新」补 2C 一句。
- 第 43 行 2C 项标完成 + SHA。
- Backlog 加：`[ ] **L-xx** /projects 项目清单导出（lib/exportXlsx.exportRows）支持勾选列含「标签」列导出（2C 记录，待清单导出专项）`。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(2c): 版本 V1.4.0 + PROGRESS(2C 项目标签体系) + 导出待办"
```

---

## 合并（finishing-a-development-branch）

全部任务完成且 `bash verify.sh` 全绿后，用 **superpowers:finishing-a-development-branch** 的**选项 1（合回 master）**：`git checkout master && git merge --no-ff feat/phase-2c-project-labels`，补 PROGRESS 合并 SHA。

---

## Self-Review（写完计划后自查）

**1. Spec 覆盖**：
- §1 多标签(Task3 store assignments)✓ / 词表可扩展(addTag/renameTag/disableTag, Task3+8)✓ / 既筛选(Task7)又全局排除(Task4+5+8)✓ / 纯本地(Task2 不回写云)✓ / 标签库管理在 /data(Task8)、挂载在 /project/:id(Task6)、筛选在 /projects(Task7)✓ / 导出仅记录待办(Task9 backlog)✓ / 版本 V1.4.0(Task9)✓。
- §2 种子白名单与两列扫描(Task1 config + derive_tag_seed)✓。
- §4 本地 store + 首次播种 + 本地为准(Task2)✓。
- §5 后端 derive/schema/server(Task1,2)✓。§6 store/api(Task3)✓。§8 过滤集成 excludedIds 喂 filterNodes+filterProjects(Task4,5)✓。§9 替代纳管(Task5 去开关/Task8 新配置)✓。§11 测试(各任务 pytest/vitest + Task9 冒烟)✓。
- §13 frozen 路径(Task2 BASE_DIR)、.gitignore(Task2)、类型同源(Task1 gen:types)、令牌(Task6/7/8 CSS)✓。

**2. 占位扫描**：无 TBD/TODO。Task1 Step5 的「process_project_overview 返回项目列表变量名」与 Task7 的 `EMPTY_FILTERS`/`ProjectFilters` 导出名标「实现前确认实际」——指向**现有可读文件**的校准，非占位。Task9 backlog 的 `L-xx` 为待分配 ID（实现期取下一个），非内容缺失。

**3. 类型一致**：`TagDef{name,disabled?}`/`TagStore{tags,assignments}` 在 api(Task3)/store(Task3)/server(Task2 同构 JSON) 一致；过滤字段 `excludeActive`/`excludedIds` 在 filterNodes/paymentPmis/dashboardStats/ledger(excludeFilter) 与 filterStore 喂值(Task5)一致；`assignments: Record<string,string[]>` 全链一致；`setExclude(on,tags)`/`excludeOn`/`excludeTags`/`excludedIds`(Task4) 与 DataView 消费(Task8)一致。

> 偏离 spec 记录：标签保存用 **POST /api/tags**（非 spec 的 PUT）——server.py 仅有 do_GET/do_POST，POST 避免新增 do_PUT 管道、与 followup 变更范式一致；语义等价（整存）。
