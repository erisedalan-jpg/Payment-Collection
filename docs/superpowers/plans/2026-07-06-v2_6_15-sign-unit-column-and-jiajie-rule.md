# V2.6.15 签约单位列 + 售前回退 + 佳杰规则标签 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/projects` 增加默认隐藏的「签约单位」列；售前服务类签约单位回退原项目（后端 `Project.signUnit` 单一来源）；签约单位=「上海伟仕佳杰科技有限公司」的项目按规则自动派生「佳杰」标签，全站生效且不写标签文件。

**Architecture:** 后端 `projects.py` 新增 `effective_sign_unit` 落 `Project.signUnit`（仿 `effective_customer`）；`preprocess_data.py` 复活 `tagSeed`，按 `config.SIGN_UNIT_TAG_RULES` 精确匹配 `signUnit` 派生 `{pid:[tag]}`。前端 `projectTags` store 引入 seed/manual 分离：`assignments`（手动、可编辑、save 写入）与 `seed`（规则、只读、来自 `data.tagSeed`）合并出 `effectiveAssignments`/`tagsOf` 供全站展示筛选，`save()` 只写 `assignments`。

**Tech Stack:** Python 3.8+ 标准库 + pydantic（schema）；Vue3 + Pinia + Element Plus；pytest + vitest。

## Global Constraints

- 交流/文案一律**简体中文**；**不使用任何 emoji**（需符号用 `→ ↓ ❌ ✕ ▾`）。
- 版本单一来源 `frontend/src/version.ts` → 本次 **V2.6.15**；只改此处。
- 佳杰匹配**精确等于**全称「上海伟仕佳杰科技有限公司」（trim 后 `==`），不做包含/归一。
- 佳杰规则标签**绝不写入** `data/project_tags.json`：`save()` 只写 `assignments`；`seed` 只读派生。
- 售前签约单位回退**恒取原项目**（`relatedClosedId`），与 `effective_customer` 同模式（本项目值不覆盖原项目）。
- 现有 23 个手动佳杰 `assignments` **保留不动**（覆盖 7 个规则外特例）。
- 改了 `schema.py`/`preprocess_data.py` → 升级须点「更新数据」；改了计算逻辑先补/改测试再改实现。
- 完成定义：代码改完 且 `bash verify.sh` 全绿 且 `PROGRESS.md` 已更新。
- 数据文件（`data/*.json`）git 忽略，不提交。

---

### Task 1: 后端签约单位回退单一来源（`Project.signUnit`）

**Files:**
- Modify: `projects.py`（`effective_customer` 后加 `effective_sign_unit`；`build_projects` 循环落 `signUnit`，约 `projects.py:249-274`）
- Modify: `schema.py`（`Project` 加 `signUnit`，约 `schema.py:182` 后）
- Modify: `frontend/src/types/analysis.ts`（由 `npm run gen:types` 生成，勿手改）
- Test: `tests/test_projects.py`、`tests/test_schema.py`

**Interfaces:**
- Produces: `effective_sign_unit(is_presale: bool, own_su: str, orig_su: str) -> str`；`Project.signUnit: str`（前端 `Project.signUnit?: string`）。

- [ ] **Step 1: 写失败测试（纯函数 + schema 字段）**

`tests/test_projects.py` 追加：
```python
def test_effective_sign_unit():
    from projects import effective_sign_unit
    assert effective_sign_unit(False, "本单位", "原单位") == "本单位"   # 非售前取本项目
    assert effective_sign_unit(True, "", "原单位") == "原单位"          # 售前本空→原项目
    assert effective_sign_unit(True, "本单位", "原单位") == "原单位"    # 售前恒取原项目(本值不覆盖)
    assert effective_sign_unit(False, "", "") == ""
    assert effective_sign_unit(True, "", "") == ""
```

`tests/test_schema.py` 追加：
```python
def test_project_has_sign_unit_field():
    import schema
    assert "signUnit" in schema.Project.model_fields
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_projects.py::test_effective_sign_unit tests/test_schema.py::test_project_has_sign_unit_field -q`
Expected: FAIL（`ImportError`/`AttributeError`：`effective_sign_unit` 未定义、`signUnit` 字段不存在）。

- [ ] **Step 3: 实现 `effective_sign_unit` + schema 字段**

`projects.py`，在 `effective_customer` 函数（约 209-216 行）之后新增：
```python
def effective_sign_unit(is_presale: bool, own_su: str, orig_su: str) -> str:
    """有效签约单位(单一来源):非售前=本项目签约单位;售前=原项目签约单位,空则空串。"""
    if not is_presale:
        return own_su or ""
    return orig_su or ""
```

`schema.py`，`Project` 类 `customer` 字段（约 182 行）之后新增：
```python
    signUnit: str = ""        # 有效签约单位(单一来源):非售前=本项目签约单位;售前=原项目签约单位
```

- [ ] **Step 4: `build_projects` 循环落 `signUnit`**

`projects.py` `build_projects` 内，`final_customer = effective_customer(...)`（约 256 行）之后新增：
```python
        own_su = str(customer.get("签约单位") or "").strip()
        orig_su = str(((project_pmis.get(related_closed) or {}).get("customer") or {}).get("签约单位") or "").strip()
        sign_unit = effective_sign_unit(is_presale, own_su, orig_su)
```
并在同循环的 `out.append({...})` 字典中、`"customer": final_customer,` 一行旁新增：
```python
            "signUnit": sign_unit,
```

- [ ] **Step 5: 加集成断言（signUnit 落值：售前回退 / 非售前取本项目）**

在 `tests/test_projects.py` 现有 `build_projects` 集成测试（构造 `project_pmis` + `mapping` 的用例，参照文件内既有 `test_build_projects*` 的 fixture 组织）中追加断言。示例断言（按现有 fixture 的项目号/字段对齐）：
```python
    # 非售前:signUnit = 本项目签约单位
    assert by_id["P-ACTIVE"]["signUnit"] == "本项目签约单位"
    # 售前:signUnit = 原项目签约单位(本项目该字段空)
    assert by_id["P-PRESALE"]["signUnit"] == "原项目签约单位"
```
若现有 fixture 未含「签约单位」，在其 `customer` dict 中补 `"签约单位": "本项目签约单位"`（本项目）与原项目 pmis 的 `"签约单位": "原项目签约单位"`。

- [ ] **Step 6: 运行后端测试**

Run: `python -m pytest tests/test_projects.py tests/test_schema.py -q`
Expected: PASS。

- [ ] **Step 7: 重新生成前端类型**

Run: `cd frontend && npm run gen:types`
Expected: `frontend/src/types/analysis.ts` 的 `Project` 出现 `signUnit?: string`。`git diff --stat` 应只动 `analysis.ts`。

- [ ] **Step 8: 提交**

```bash
git add projects.py schema.py frontend/src/types/analysis.ts tests/test_projects.py tests/test_schema.py
git commit -m "feat(projects): 签约单位回退单一来源 Project.signUnit(售前取原项目) (V2.6.15)"
```

---

### Task 2: 后端佳杰规则派生 `tagSeed`

**Files:**
- Modify: `config.py`（加 `SIGN_UNIT_TAG_RULES`，约 `config.py:89` `TAG_SEED_WHITELIST` 旁）
- Modify: `preprocess_data.py`（加 `derive_sign_unit_tag_seed`；`"tagSeed": {}` → 调用，约 `preprocess_data.py:256`）
- Test: `tests/test_preprocess.py`

**Interfaces:**
- Consumes: `dept_projects`（list[dict]，每项含 Task 1 的 `signUnit`）、`config.SIGN_UNIT_TAG_RULES`。
- Produces: `derive_sign_unit_tag_seed(project_rows) -> Dict[str, List[str]]`；`analysis_data.json.tagSeed` 填充。

- [ ] **Step 1: 写失败测试**

`tests/test_preprocess.py` 追加：
```python
def test_derive_sign_unit_tag_seed():
    from preprocess_data import derive_sign_unit_tag_seed
    rows = [
        {"projectId": "A", "signUnit": "上海伟仕佳杰科技有限公司"},
        {"projectId": "B", "signUnit": "别家公司"},
        {"projectId": "C", "signUnit": ""},
        {"projectId": "D"},  # 无 signUnit 键
        {"projectId": "E", "signUnit": " 上海伟仕佳杰科技有限公司 "},  # 前后空格 trim 后命中
    ]
    seed = derive_sign_unit_tag_seed(rows)
    assert seed == {"A": ["佳杰"], "E": ["佳杰"]}
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_preprocess.py::test_derive_sign_unit_tag_seed -q`
Expected: FAIL（`ImportError`：`derive_sign_unit_tag_seed` 未定义）。

- [ ] **Step 3: 加 config 规则表**

`config.py`，`TAG_SEED_WHITELIST`（约 89 行）之后新增：
```python
# 签约单位 → 自动标签 规则(精确等于全称,trim 后比对)。当前仅佳杰一条。
SIGN_UNIT_TAG_RULES = {"上海伟仕佳杰科技有限公司": "佳杰"}
```

- [ ] **Step 4: 实现 `derive_sign_unit_tag_seed`**

`preprocess_data.py`，helper 区（如 `_collection_nodes_for` 附近，约 93 行后）新增：
```python
def derive_sign_unit_tag_seed(project_rows):
    """按 config.SIGN_UNIT_TAG_RULES 精确匹配 signUnit(trim 后) → {pid: [tag]}。规则派生,不写标签文件。"""
    seed = {}
    for p in project_rows:
        tag = config.SIGN_UNIT_TAG_RULES.get((p.get("signUnit") or "").strip())
        if tag:
            seed[p["projectId"]] = [tag]
    return seed
```

- [ ] **Step 5: 填充 `tagSeed`**

`preprocess_data.py`，`final_data` 组装处将 `"tagSeed": {},`（约 256 行）改为：
```python
        "tagSeed": derive_sign_unit_tag_seed(dept_projects),
```
（`dept_projects` 已含 `signUnit`——Task 1 落值经 `load_dept_projects`/`build_projects` 透传。）

- [ ] **Step 6: 运行测试**

Run: `python -m pytest tests/test_preprocess.py -q`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add config.py preprocess_data.py tests/test_preprocess.py
git commit -m "feat(tags): 复活tagSeed,签约单位=佳杰规则派生「佳杰」标签 (V2.6.15)"
```

---

### Task 3: 前端 projectTags store —— seed/manual 分离

**Files:**
- Modify: `frontend/src/stores/projectTags.ts`
- Test: `frontend/src/stores/projectTags.test.ts`

**Interfaces:**
- Consumes: `useDataStore().data?.tagSeed`（`Record<string, string[]>`，Task 2 产物）。
- Produces: store 暴露 `seed`、`effectiveAssignments`（合并 map）、`tagsOf(pid)`（合并）、`manualTagsOf(pid)`（仅手动）、`seedTagsOf(pid)`（仅规则）；`save()` 只写 `assignments`。

- [ ] **Step 1: 写失败测试**

`frontend/src/stores/projectTags.test.ts` 追加（沿用文件内既有 `beforeEach` setActivePinia + `getTags`/`saveTags` mock）：
```ts
import { useDataStore } from '@/stores/data'

it('effectiveAssignments/tagsOf 合并 seed, manualTagsOf/seedTagsOf 分离', () => {
  const data = useDataStore(); data.$patch({ data: { tagSeed: { A: ['佳杰'] } } as any })
  const s = useProjectTagsStore()
  s.assignments = { A: ['BH项目'], B: ['框架合同'] }
  expect([...s.tagsOf('A')].sort()).toEqual(['BH项目', '佳杰'])
  expect(s.manualTagsOf('A')).toEqual(['BH项目'])
  expect(s.seedTagsOf('A')).toEqual(['佳杰'])
  expect([...s.effectiveAssignments.A].sort()).toEqual(['BH项目', '佳杰'])
  expect(s.effectiveAssignments.B).toEqual(['框架合同'])
  expect(s.tagsOf('B')).toEqual(['框架合同'])
})

it('seed 与手动同名去重(不重复)', () => {
  const data = useDataStore(); data.$patch({ data: { tagSeed: { A: ['佳杰'] } } as any })
  const s = useProjectTagsStore()
  s.assignments = { A: ['佳杰'] }
  expect(s.tagsOf('A')).toEqual(['佳杰'])
  expect(s.effectiveAssignments.A).toEqual(['佳杰'])
})

it('save 只写手动 assignments,不含 seed', async () => {
  const data = useDataStore(); data.$patch({ data: { tagSeed: { A: ['佳杰'] } } as any })
  const s = useProjectTagsStore()
  s.assignments = { A: ['BH项目'] }
  await s.save()
  expect(saveTags).toHaveBeenCalledWith({ tags: s.tags, assignments: { A: ['BH项目'] } })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/stores/projectTags.test.ts`
Expected: FAIL（`effectiveAssignments`/`manualTagsOf`/`seedTagsOf` 不存在；`tagsOf` 未合并 seed）。

- [ ] **Step 3: 实现 seed/manual 分离**

`frontend/src/stores/projectTags.ts` 全量替换为：
```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getTags, saveTags, type TagDef } from '@/lib/projectTagsApi'
import { useDataStore } from '@/stores/data'

export const useProjectTagsStore = defineStore('projectTags', () => {
  const tags = ref<TagDef[]>([])
  const assignments = ref<Record<string, string[]>>({})
  const loaded = ref(false)
  const saving = ref(false)

  const dataStore = useDataStore()
  // 规则派生标签(只读):来自 analysis_data.json 的 tagSeed(签约单位规则),不写回标签文件
  const seed = computed<Record<string, string[]>>(() => dataStore.data?.tagSeed ?? {})

  const activeTags = computed(() => tags.value.filter((t) => !t.disabled))
  const manualTagsOf = (pid: string): string[] => assignments.value[pid] ?? []
  const seedTagsOf = (pid: string): string[] => seed.value[pid] ?? []
  // 合并去重:手动 ∪ 规则。用于全站展示/筛选/导出
  const tagsOf = (pid: string): string[] => [...new Set([...manualTagsOf(pid), ...seedTagsOf(pid)])]
  const effectiveAssignments = computed<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {}
    for (const [pid, names] of Object.entries(assignments.value)) out[pid] = [...names]
    for (const [pid, names] of Object.entries(seed.value)) {
      out[pid] = [...new Set([...(out[pid] ?? []), ...names])]
    }
    return out
  })

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
    if (tags.value.some((t) => t.name === nn)) return
    tags.value = tags.value.map((t) => (t.name === oldName ? { ...t, name: nn } : t))
    const next: Record<string, string[]> = {}
    for (const [pid, names] of Object.entries(assignments.value)) {
      next[pid] = [...new Set(names.map((x) => (x === oldName ? nn : x)))]
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
      // 只写手动 assignments,规则 seed 不落文件
      await saveTags({ tags: tags.value, assignments: assignments.value })
    } finally {
      saving.value = false
    }
  }

  return { tags, assignments, loaded, saving, seed, activeTags,
           effectiveAssignments, tagsOf, manualTagsOf, seedTagsOf,
           load, addTag, renameTag, disableTag, setProjectTags, toggleTag, save }
})
```

- [ ] **Step 4: 运行 store 测试（含既有回归）**

Run: `cd frontend && npx vitest run src/stores/projectTags.test.ts`
Expected: PASS（新增 3 例 + 既有全过）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/projectTags.ts frontend/src/stores/projectTags.test.ts
git commit -m "feat(tags): projectTags引入seed/manual分离,save只写手动 (V2.6.15)"
```

---

### Task 4: `/projects` 签约单位列（默认隐藏）+ 接入合并标签

**Files:**
- Modify: `frontend/src/lib/projectList.ts`（`ProjectRow` + `buildProjectRows`）
- Modify: `frontend/src/views/ProjectsView.vue`（列定义、FILTERABLE、传 `effectiveAssignments`）
- Test: `frontend/src/lib/projectList.test.ts`、`frontend/src/views/ProjectsView.test.ts`

**Interfaces:**
- Consumes: `Project.signUnit`（Task 1）、`projectTags.effectiveAssignments`（Task 3）。

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/projectList.test.ts`，在既有 `buildProjectRows` 用例的 fixture Project 上补 `signUnit`，并追加断言：
```ts
it('buildProjectRows 带出 signUnit(占位 -)', () => {
  const rows = buildProjectRows(
    [{ projectId: 'P1', signUnit: '上海伟仕佳杰科技有限公司' } as any,
     { projectId: 'P2' } as any],
    {},
  )
  expect(rows[0].signUnit).toBe('上海伟仕佳杰科技有限公司')
  expect(rows[1].signUnit).toBe('-')
})
```

`frontend/src/views/ProjectsView.test.ts` 追加（沿用文件内 mount + mock 约定）：
```ts
it('签约单位列默认隐藏,不在默认表头', async () => {
  const w = await mountProjectsView()  // 用文件内既有挂载 helper/写法
  expect(w.text()).not.toContain('签约单位')
  const vm: any = w.findComponent({ name: 'ProjectsView' }).vm
  expect(vm.ALL_COLUMNS.map((c: any) => c.key)).toContain('signUnit')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts src/views/ProjectsView.test.ts`
Expected: FAIL（`ProjectRow` 无 `signUnit`；`ALL_COLUMNS` 无该列）。

- [ ] **Step 3: `projectList.ts` 加字段**

`ProjectRow` 接口在 `customer` 附近加：
```ts
  signUnit: string
```
`buildProjectRows` 的返回对象中（`customer:` 附近）加：
```ts
      signUnit: p.signUnit || '-',
```

- [ ] **Step 4: `ProjectsView.vue` 加列 + 接入合并标签**

`ALL_COLUMNS`（约 46-68 行）在 `tags` 列一项之前插入：
```ts
  { key: 'signUnit', label: '签约单位', width: 180, sortable: true },
```
`DEFAULT_VISIBLE`（约 70 行）**不加** `signUnit`（保持默认隐藏）。
`FILTERABLE`（约 71 行）集合中加入 `'signUnit'`。
`rows` computed（约 39 行）第三参：`projectTags.assignments` → `projectTags.effectiveAssignments`。
导出（约 130 行）：`assignments: projectTags.assignments,` → `assignments: projectTags.effectiveAssignments,`。

- [ ] **Step 5: 运行测试**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts src/views/ProjectsView.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/projectList.ts frontend/src/views/ProjectsView.vue frontend/src/lib/projectList.test.ts frontend/src/views/ProjectsView.test.ts
git commit -m "feat(projects): /projects加签约单位列(默认隐藏)+接入合并标签 (V2.6.15)"
```

---

### Task 5: `/project/:id` 签约单位回退展示 + 标签编辑安全（seed 只读）

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue`
- Test: `frontend/src/views/ProjectDetailView.test.ts`

**Interfaces:**
- Consumes: `p.signUnit`（Task 1）、`projectTags.manualTagsOf`/`seedTagsOf`（Task 3）。

- [ ] **Step 1: 写失败测试**

`frontend/src/views/ProjectDetailView.test.ts` 追加（沿用文件内既有 mount helper + 数据注入方式）：
```ts
it('售前项目签约单位显示回退后的 signUnit', async () => {
  const w = await mountDetail({ projectId: 'P-1', isPresale: true, signUnit: '上海伟仕佳杰科技有限公司' })
  expect(w.text()).toContain('上海伟仕佳杰科技有限公司')
})

it('规则标签(seed)只读展示,无删除入口;删手动标签不写入 seed', async () => {
  const data = useDataStore(); data.$patch({ data: { tagSeed: { 'P-1': ['佳杰'] } } as any })
  const tags = useProjectTagsStore(); tags.assignments = { 'P-1': ['BH项目'] } as any
  const saveSpy = vi.spyOn(tags, 'save').mockResolvedValue()
  const w = await mountDetail({ projectId: 'P-1' })
  // 两个标签都显示
  expect(w.text()).toContain('佳杰')
  expect(w.text()).toContain('BH项目')
  // 删除 BH项目后,写入的手动 assignments 不含佳杰
  await removeTagChip(w, 'BH项目')  // 用文件内既有工具或触发 removeOne
  expect(tags.assignments['P-1']).toEqual([])
  expect(tags.assignments['P-1']).not.toContain('佳杰')
})
```
（若文件无 `mountDetail`/`removeTagChip` helper，用其既有挂载写法与 `find('.tag-x')` 触发 click 等价实现。）

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: FAIL（签约单位仍读本项目 `m.customer.签约单位`；删手动标签会把 seed 佳杰写入 assignments）。

- [ ] **Step 3: 签约单位改读回退字段**

`ProjectDetailView.vue` 约 308 行：
```html
<span>签约单位 <b>{{ m.customer?.签约单位 || '-' }}</b></span>
```
改为：
```html
<span>签约单位 <b>{{ p.signUnit || '-' }}</b></span>
```

- [ ] **Step 4: 标签区 script 改 seed/manual 分离**

`ProjectDetailView.vue` `<script setup>`，将 `myTags`/`assignExisting`/`removeOne`（约 27-45 行）替换为：
```ts
const manualTags = computed(() => projectTags.manualTagsOf(pid.value))
const seedTags = computed(() => projectTags.seedTagsOf(pid.value))
const addInput = ref('')
function assignExisting(name: string) {
  if (!manualTags.value.includes(name)) {
    projectTags.setProjectTags(pid.value, [...manualTags.value, name])
    projectTags.save()
  }
}
function addOne() {
  const name = addInput.value.trim()
  if (!name) return
  projectTags.addTag(name)
  assignExisting(name)
  addInput.value = ''
}
function removeOne(name: string) {
  projectTags.setProjectTags(pid.value, manualTags.value.filter((t) => t !== name))
  projectTags.save()
}
```

- [ ] **Step 5: 标签区模板拆手动/规则两组**

`ProjectDetailView.vue` `<section class="pd-tags">`（约 328-336 行）替换为：
```html
          <section class="pd-tags">
            <span class="pdt-label">项目标签</span>
            <span v-for="t in manualTags" :key="'m-' + t" class="tag-chip">{{ t }}<span class="tag-x" v-activate @click="removeOne(t)">✕</span></span>
            <span v-for="t in seedTags" :key="'s-' + t" class="tag-chip tag-chip-rule" title="按签约单位自动标记,不可手动删除">{{ t }}</span>
            <span v-if="!manualTags.length && !seedTags.length" class="pdt-empty">未打标签</span>
            <el-select v-model="addInput" size="small" filterable allow-create default-first-option
                       placeholder="加标签" style="width: 150px" @change="addOne">
              <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
            </el-select>
          </section>
```

- [ ] **Step 6: 加规则标签样式（中性、区别手动）**

`ProjectDetailView.vue` `<style scoped>` 追加：
```css
.tag-chip-rule { background: var(--card2); color: var(--mut); }
```

- [ ] **Step 7: 运行测试**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(detail): 签约单位回退展示+规则标签只读(编辑不写seed) (V2.6.15)"
```

---

### Task 6: 全站标签消费点接入合并值（需求 3 全站一致）

**Files:**
- Modify: `frontend/src/stores/filter.ts:71`、`frontend/src/views/BoardView.vue:66`、`frontend/src/views/CostDetailView.vue:153`、`frontend/src/views/InsightView.vue:35`、`frontend/src/views/MilestoneView.vue:62`、`frontend/src/views/PayNodesView.vue:70`、`frontend/src/views/PayProjectsView.vue:86`
- Test: 相关既有 test 若因合并逻辑失败则忠实修正（多数设 `assignments` 未设 `tagSeed`，无 seed 时 `tagsOf`≡`assignments`，预期不破坏）

**Interfaces:**
- Consumes: `projectTags.effectiveAssignments`（整表遍历/传参处）、`projectTags.tagsOf(pid)`（单项目 `tagMatch` 处）。
- 说明：`lib/projectExport.ts` **不改**——其 `ctx.assignments` 由 `ProjectsView`（Task 4 已传 `effectiveAssignments`）注入，`list` sheet 用 `r.tags`（已含 seed）。

- [ ] **Step 1: 逐处替换（整表遍历/传参 → `effectiveAssignments`）**

`frontend/src/stores/filter.ts:71`：
```ts
    for (const [pid, names] of Object.entries(projectTags.assignments)) {
```
→
```ts
    for (const [pid, names] of Object.entries(projectTags.effectiveAssignments)) {
```

`frontend/src/views/BoardView.vue:66`：
```ts
    projectTags.assignments,
```
→
```ts
    projectTags.effectiveAssignments,
```

- [ ] **Step 2: 逐处替换（单项目 `tagMatch` → `tagsOf(pid)`）**

分别改：
- `CostDetailView.vue:153`：`tagMatch(projectTags.assignments[x.projectId] ?? [], selectedTags.value)` → `tagMatch(projectTags.tagsOf(x.projectId), selectedTags.value)`
- `InsightView.vue:35`：`tagMatch(projectTags.assignments[p.projectId] ?? [], selectedTags.value)` → `tagMatch(projectTags.tagsOf(p.projectId), selectedTags.value)`
- `MilestoneView.vue:62`：`tagMatch(projectTags.assignments[m.projectId] ?? [], selectedTags.value)` → `tagMatch(projectTags.tagsOf(m.projectId), selectedTags.value)`
- `PayNodesView.vue:70`：`tagMatch(tags.assignments[r.projectId] ?? [], selectedTags.value)` → `tagMatch(tags.tagsOf(r.projectId), selectedTags.value)`
- `PayProjectsView.vue:86`：`tagMatch(tags.assignments[r.projectId] ?? [], selectedTags.value)` → `tagMatch(tags.tagsOf(r.projectId), selectedTags.value)`

- [ ] **Step 3: 运行受影响页面测试**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts src/views/CostDetailView.test.ts src/views/InsightView.test.ts src/views/MilestoneView.test.ts src/views/PayNodesView.test.ts src/views/PayProjectsView.test.ts src/views/BoardView.test.ts`
Expected: PASS。若某 test 断言了"读 assignments"的具体路径而失败，确认失败原因是"改用 tagsOf/effectiveAssignments 的等价读取"，忠实修正断言（不得为迁就而弱化标签筛选语义）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/stores/filter.ts frontend/src/views/BoardView.vue frontend/src/views/CostDetailView.vue frontend/src/views/InsightView.vue frontend/src/views/MilestoneView.vue frontend/src/views/PayNodesView.vue frontend/src/views/PayProjectsView.vue
git commit -m "feat(tags): 全站标签消费点接入合并值(佳杰规则全站一致) (V2.6.15)"
```

---

### Task 7: 版本号 + 全量验证 + PROGRESS（控制者直接完成）

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: bump 版本**

`frontend/src/version.ts` 版本号改为 `V2.6.15`，日期改为当日。

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（python 编译 + ruff + pytest + 前端 typecheck/vitest/build）。

- [ ] **Step 3: 更新 PROGRESS.md**

`PROGRESS.md` 顶部新增 V2.6.15 条目（签约单位列 + 售前回退 + 佳杰规则标签；升级须点更新数据），旧版本条目下移。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.6.15 签约单位列+售前回退+佳杰规则标签 收官"
```

---

## 执行说明（模型分级建议）

- Task 1/2：后端多文件 + gen:types → sonnet。
- Task 3：store seed/manual 分离是正确性核心 → sonnet。
- Task 4/5：view + lib，Task 5 含编辑安全 → sonnet。
- Task 6：7 处替换，需逐处判断 `effectiveAssignments` vs `tagsOf` → sonnet。
- Task 7：控制者直接做（收尾 verify 类前几版被 executor 截断）。
- 每任务后控制者内联审查（精简 SDD），结束 opus 整支终审。

## 部署提示（非任务，供收尾打包参考）

- 本次改 `schema.py` + `preprocess_data.py` → **升级须点「更新数据」**（同 V2.3.2），不是纯前端包。升级手册须显著标注。
- 无新增页面/pageKey/依赖/授权；`server.py` 无业务改动。
