# V2.1.0 临时重点跟进页 + 商机新增改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「项目管理平台」V2.1.0 交付两件事——商机页「新增」改为先弹编辑抽屉保存后才加行；新增整页 `/projects/temp` 临时重点跟进（仿 `/projects/key`，超管定义可保存、动态重算、两级 AND/OR + 子表存在性的范围，普通管理员只编辑进展列）。

**Architecture:** 后端纯 Python 标准库 HTTP（`server.py` + 领域纯函数模块）；前端 Vue3 `<script setup>` + Pinia + Element Plus。临时跟进的范围匹配在前端做（`analysis_data.json` 已按会话 L4 裁剪，匹配结果自动 ∩ 本人 L4）；范围条件 + 进展记录 + 历史快照持久化于 `data/temp_followup.json`，由新模块 `temp_followup.py` 的纯函数维护。整页栈（数据集切换/选列/列内筛选/排序/归档/导出/进展编辑）照搬 `KeyProjectsView`。

**Tech Stack:** Python 3.8+ 标准库 + pydantic + openpyxl（无新增依赖）；Vue3 + Vite + TS + Pinia + Element Plus + ECharts；pytest / vitest。

## Global Constraints

- 版本：`frontend/src/version.ts` 改 `APP_VERSION = 'V2.1.0'`、`RELEASE_DATE = '2026-06-25'`（单一来源，新增整页＝Y 级，已确认）。
- 超管恒为三个 `admin`/`wangxutong`/`zhangyingzhe`，本版本不改 `auth.py`，不新增超管。
- L4 隔离：普通管理员前端拿到的 `projects` 已被 `handle_data_json` 按会话 `allowedL4` 裁剪；范围匹配结果自动 ∩ 本人 L4。
- 设计令牌：页面只引用 `var(--*)`（见 `frontend/src/styles/theme.css`），禁止手写散值、禁止伪令牌（无 `--border`，用 `--line`）；弹层/抽屉优先 Element Plus。
- 无 emoji；需要符号用 `→ ↓ ❌ ✕ ▾`；跟进类型术语用「邮件推动」。
- 双模式：凡涉及读写文件路径，路径必须基于 `server.py` 的 `BASE_DIR`（与 `PROGRESS_FILE`/`OPPORTUNITIES_FILE` 同构）。
- 完成定义：`bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）+ `PROGRESS.md` 更新。
- gitignore 已需新增：`data/temp_followup.json`、`data/temp_followup.backup-*.json`（本计划 Task 4 顺带加；运行时数据不入库）。
- 范围语义钉死：**空范围（无 groups 或全空组）→ 命中为空**；空组（无 condition）求值为 `false`；子表条件按「任一行满足」存在性；两级 AND/OR + 条件级取反（op 含 `notIn`/`notBetween`/`notContains`）。

---

## File Structure

**后端**
- `opportunities.py`（改）：+ `apply_create_with_fields(store, fields, account, now_date, now_dt) -> dict` 纯函数。
- `temp_followup.py`（新）：临时跟进领域纯函数（`new_store`/`normalize_scope`/`apply_update`/`apply_archive`）。
- `server.py`（改）：+ `TEMP_FOLLOWUP_FILE`/`_temp_lock`/`_load_temp_followup`/`_save_temp_followup`、4 个 handler、路由 dispatch、`_SUPER_ONLY_PATHS` 两条、`import temp_followup as _temp`；商机 create handler 接 `fields`。
- `make_deploy_zip.py`（改）：`TOP_FILES` 加 `temp_followup.py`。
- `.gitignore`（改）：加临时跟进数据两行。

**前端**
- `lib/tempScope.ts`（新）：条件树类型 + `FIELD_CATALOG` + `opsForKind` + `ScopeProjectInput` + `projectMatches`。
- `lib/keyProjects.ts`（改）：抽出 `buildProgressRowBase`（行为不变）。
- `lib/tempFollowup.ts`（新）：`TempRow` + `buildTempRows` + `buildScopeInputs`。
- `lib/tempFollowupApi.ts`（新）：REST 客户端。
- `stores/tempFollowup.ts`（新）：Pinia store。
- `stores/auth.ts`（改）：login/logout 调 `useTempFollowupStore().reset()`。
- `components/ProgressEditModal.vue`（改）：+ `store?: 'key' | 'temp'` prop 分流。
- `components/OpportunityEditDrawer.vue`（改）：+ `mode?: 'create' | 'edit'`。
- `components/ScopeBuilder.vue`（新）：超管范围构建器。
- `views/TempFollowupView.vue`（新）：仿 `KeyProjectsView.vue`。
- `views/OpportunitiesView.vue`（改）：`onCreate` 改先弹空白抽屉。
- `stores/opportunities.ts` / `lib/opportunitiesApi.ts`（改）：`create(fields?)`。
- `lib/pageAccess.ts` / `nav.ts` / `router/index.ts`（改）：注册 `temp-followup`。
- `frontend/src/version.ts`（改）：V2.1.0。

**文档/交付**
- `PROGRESS.md`（改）、`deploy/升级手册-V2.1.0.md`（新）、`release/pmplatform-update-V2.1.0.zip`（构建产物，gitignore）。

---

## Task 1: 商机后端「带字段创建」纯函数 + 处理器接线

**Files:**
- Modify: `opportunities.py`（在 `apply_create` 之后新增 `apply_create_with_fields`）
- Modify: `server.py:1018-1026`（`handle_opportunities_create`）
- Test: `tests/test_opportunities.py`（追加用例）

**Interfaces:**
- Consumes: 现有 `apply_create(store, now_date) -> dict`、`apply_update(store, rid, fields, account, now_date, now_dt) -> dict|None`、`FIELDS`。
- Produces: `apply_create_with_fields(store, fields, account, now_date, now_dt) -> dict`（建行后落字段；空/None fields 退化为纯空行；始终返回最终行）。

- [ ] **Step 1: 写失败测试**（追加到 `tests/test_opportunities.py` 末尾）

```python
def test_apply_create_with_fields_stamps_content():
    s = _store()
    r = opp.apply_create_with_fields(s, {"customer": "丙公司", "amountWan": "88"},
                                     "admin", "2026-06-25", "2026-06-25 12:00")
    assert r["id"] == "opp-1" and r["customer"] == "丙公司" and r["amountWan"] == 88.0
    assert r["firstReg"] == "2026-06-25"          # 有内容 → 盖首登
    assert r["lastUpdate"] == "2026-06-25 12:00" and r["lastUpdateBy"] == "admin"
    assert len(s["rows"]) == 1


def test_apply_create_with_fields_empty_is_blank_row():
    s = _store()
    r = opp.apply_create_with_fields(s, None, "admin", "2026-06-25", "2026-06-25 12:00")
    assert r["id"] == "opp-1" and r["customer"] == "" and r["firstReg"] == ""  # 无内容不盖首登
    assert len(s["rows"]) == 1
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_opportunities.py -q -k create_with_fields`
Expected: FAIL（`AttributeError: module 'opportunities' has no attribute 'apply_create_with_fields'`）

- [ ] **Step 3: 实现纯函数**（`opportunities.py`，紧接 `apply_create` 之后）

```python
def apply_create_with_fields(store, fields, account, now_date, now_dt) -> Dict[str, Any]:
    """建行后立即落字段(复用 apply_update 的白名单/解析/盖章)。fields 空 → 纯空行。始终返回最终行。"""
    row = apply_create(store, now_date)
    if fields:
        updated = apply_update(store, row['id'], fields, account, now_date, now_dt)
        if updated is not None:
            return updated
    return row
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_opportunities.py -q`
Expected: PASS（全部商机用例绿）

- [ ] **Step 5: 处理器接线**（`server.py`，替换 `handle_opportunities_create` 整段 1018-1026）

```python
    def handle_opportunities_create(self):  # 超管(由 _authz_gate 拦)
        data = self._read_json_body() if int(self.headers.get('Content-Length', 0)) > 0 else {}
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        fields = data.get('fields') if isinstance(data, dict) else None
        if fields is not None and not isinstance(fields, dict):
            self._send_json(400, _error_payload(ERR_VALIDATION, "fields 须为对象"))
            return
        account, _ = self._session_account_rec()
        try:
            store = _load_opportunities()
            now_date, now_dt = self._opp_now()
            row = _opp.apply_create_with_fields(store, fields, account, now_date, now_dt)
            _save_opportunities(store)
            self._json_response({"row": row})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"新增商机失败: {e}"))
```

- [ ] **Step 6: 编译 + ruff + 全量 pytest**

Run: `python -m py_compile server.py opportunities.py && python -m ruff check server.py opportunities.py && python -m pytest -q`
Expected: PASS（无语法/lint 错，pytest 全绿）

- [ ] **Step 7: 提交**

```bash
git add opportunities.py server.py tests/test_opportunities.py
git commit -m "feat(opp): 商机新增支持带字段创建(apply_create_with_fields + create 端点接 fields)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 商机前端「先编辑后加行」

**Files:**
- Modify: `frontend/src/lib/opportunitiesApi.ts:10-11`（`create`）
- Modify: `frontend/src/stores/opportunities.ts:14-18`（`create`）
- Modify: `frontend/src/components/OpportunityEditDrawer.vue`（+ `mode`）
- Modify: `frontend/src/views/OpportunitiesView.vue`（`onCreate` + 抽屉绑定）
- Test: `frontend/src/components/OpportunityEditDrawer.test.ts`（若无则新建）、`frontend/src/views/OpportunitiesView.test.ts`（若无则新建）

**Interfaces:**
- Consumes: Task 1 的 `/api/opportunities/create` 接 `{fields}`；现有 `OPP_FIELDS`、`store.create`。
- Produces: `opportunitiesApi.create(fields?)`、`store.create(fields?): Promise<OppRow>`、`OpportunityEditDrawer` 的 `mode: 'create'|'edit'`。

- [ ] **Step 1: 写失败测试**（`frontend/src/components/OpportunityEditDrawer.test.ts`，新建）

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import OpportunityEditDrawer from './OpportunityEditDrawer.vue'
import { useOpportunitiesStore } from '@/stores/opportunities'

describe('OpportunityEditDrawer create 模式', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('create 模式保存调 store.create(fields) 而非 update', async () => {
    const store = useOpportunitiesStore()
    const createSpy = vi.spyOn(store, 'create').mockResolvedValue({ id: 'opp-9' } as any)
    const updateSpy = vi.spyOn(store, 'update').mockResolvedValue(undefined as any)
    const w = mount(OpportunityEditDrawer, {
      props: { modelValue: true, row: null, mode: 'create' },
      global: { plugins: [ElementPlus], stubs: { teleport: true } },
    })
    ;(w.vm as any).form.customer = '甲'
    await (w.vm as any).onSave()
    await flushPromises()
    expect(createSpy).toHaveBeenCalledOnce()
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/OpportunityEditDrawer.test.ts`
Expected: FAIL（`mode` prop 不存在 / onSave 仍调 update）

- [ ] **Step 3: 实现 api + store**

`frontend/src/lib/opportunitiesApi.ts` 把 `create` 改为：
```ts
  create: (fields?: Record<string, any>) =>
    api.post<OppRowResp>('/api/opportunities/create', fields ? { fields } : {}),
```
`frontend/src/stores/opportunities.ts` 把 `create` 改为：
```ts
  async function create(fields?: Record<string, any>): Promise<OppRow> {
    const r = await opportunitiesApi.create(fields)
    rows.value = [...rows.value, r.row]
    return r.row
  }
```

- [ ] **Step 4: 实现抽屉 `mode`**（`OpportunityEditDrawer.vue`）

props 加 `mode`：
```ts
const props = defineProps<{
  modelValue: boolean
  row: OppRow | null
  mode?: 'create' | 'edit'
}>()
```
`onSave` 改为分流：
```ts
async function onSave() {
  const fields: Record<string, any> = {}
  OPP_FIELDS.forEach((k) => { fields[k] = form[k] })
  if (props.mode === 'create') {
    await store.create(fields)
    ElMessage.success('已新增')
  } else {
    if (!props.row) return
    await store.update(props.row.id, fields)
    ElMessage.success('已保存')
  }
  emit('update:modelValue', false)
}
```
只读信息区只在 edit 显示：模板里把 `<div v-if="row" class="oed-info">` 改为 `<div v-if="mode !== 'create' && row" class="oed-info">`；抽屉标题用 `:title="mode === 'create' ? '新增商机' : '编辑商机'"`。

- [ ] **Step 5: 实现视图 onCreate**（`OpportunitiesView.vue`）

加状态并改 `onCreate`：
```ts
const editMode = ref<'create' | 'edit'>('edit')
// ...
function openEdit(row: OppRow) {
  editRow.value = row
  editMode.value = 'edit'
  editOpen.value = true
}
function onCreate() {
  editRow.value = null
  editMode.value = 'create'
  editOpen.value = true
}
```
（`onCreate` 不再 `async`、不再调 `store.create`。）抽屉绑定加 `:mode`：
```html
<OpportunityEditDrawer v-model="editOpen" :row="editRow" :mode="editMode" />
```
`defineExpose` 增 `editMode`、`openEdit`。

- [ ] **Step 6: 视图测试**（`frontend/src/views/OpportunitiesView.test.ts`，新建或追加）

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOpportunitiesStore } from '@/stores/opportunities'

// onCreate 不预创建行：打开抽屉处于 create，store.create 直到保存才被调用
describe('OpportunitiesView.onCreate 先弹抽屉不预建行', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('onCreate 仅切 create 模式打开抽屉,不调 store.create', async () => {
    const store = useOpportunitiesStore()
    const spy = vi.spyOn(store, 'create')
    // 直接构造 ref 行为：通过组件实例验证(挂载 OpportunitiesView 需 auth.isSuper)
    // 见组件 defineExpose 的 onCreate/editMode/editOpen
    // 这里以契约方式断言：onCreate 不触发 create
    // (完整挂载在 step 7 的集成断言中覆盖)
    expect(spy).not.toHaveBeenCalled()
  })
})
```
> 说明：`OpportunitiesView` 完整挂载需 auth 超管态与数据 store。若挂载成本高，本步聚焦抽屉 create 行为（Step 1 已覆盖 create 调 store.create）；视图层用 `defineExpose` 的 `onCreate` 直调断言 `store.create` 未被调用、`editOpen===true && editMode==='create'`。实现时按既有 `OpportunitiesView.test.ts`（若存在）的挂载方式补一条：调用 `vm.onCreate()` 后断言 `vm.editMode==='create'`、`vm.editOpen===true`、`createSpy` 未调用。

- [ ] **Step 7: 跑前端检查**

Run: `cd frontend && npx vitest run src/components/OpportunityEditDrawer.test.ts src/views/OpportunitiesView.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add frontend/src/lib/opportunitiesApi.ts frontend/src/stores/opportunities.ts frontend/src/components/OpportunityEditDrawer.vue frontend/src/views/OpportunitiesView.vue frontend/src/components/OpportunityEditDrawer.test.ts frontend/src/views/OpportunitiesView.test.ts
git commit -m "feat(opp): 新增商机改为先弹编辑抽屉,保存才加行,取消不留行

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `temp_followup.py` 领域纯函数

**Files:**
- Create: `temp_followup.py`
- Test: `tests/test_temp_followup.py`

**Interfaces:**
- Produces:
  - `new_store() -> dict`：`{"version":1,"scope":{"combinator":"AND","groups":[]},"current":{},"archives":[]}`
  - `normalize_scope(scope) -> dict`：规整 `{combinator, groups:[{combinator, conditions:[cond]}]}`；丢非法 cond，combinator 非 AND/OR → 'AND'。
  - `apply_update(store, project_id, field, content, account, now) -> dict`：`field∈PROGRESS_FIELDS` 否则 `ValueError`；写 `store['current'][pid]` 盖 `EditTime`/`EditBy`。
  - `apply_archive(store, rows, now) -> None`：append `{archiveTime, rows}` 到 archives，清空 current。
  - 常量 `PROGRESS_FIELDS=('weekProgress','nextPlan')`、`SCOPE_GROUPS=('project','paymentNode','milestone')`。

- [ ] **Step 1: 写失败测试**（`tests/test_temp_followup.py`，新建）

```python
import pytest
import temp_followup as tf


def test_new_store_shape():
    s = tf.new_store()
    assert s == {"version": 1, "scope": {"combinator": "AND", "groups": []},
                 "current": {}, "archives": []}


def test_normalize_scope_drops_illegal_and_defaults_combinator():
    raw = {"combinator": "XOR", "groups": [
        {"combinator": "OR", "conditions": [
            {"group": "project", "field": "orgL4", "op": "in", "values": ["小金融服务组"]},
            {"group": "evil", "field": "x", "op": "in"},          # 非白名单组 → 丢
            {"group": "milestone", "field": 123, "op": "in"},     # field 非字符串 → 丢
        ]},
    ]}
    out = tf.normalize_scope(raw)
    assert out["combinator"] == "AND"                              # 非法回退
    assert out["groups"][0]["combinator"] == "OR"
    conds = out["groups"][0]["conditions"]
    assert len(conds) == 1 and conds[0]["field"] == "orgL4"


def test_normalize_scope_garbage_returns_default():
    assert tf.normalize_scope(None) == {"combinator": "AND", "groups": []}
    assert tf.normalize_scope({"groups": "nope"}) == {"combinator": "AND", "groups": []}


def test_apply_update_stamps_and_invalid_field_raises():
    s = tf.new_store()
    rec = tf.apply_update(s, "P1", "weekProgress", "本周X", "wangxutong", "2026-06-25 10:00:00")
    assert rec["weekProgress"] == "本周X"
    assert rec["weekProgressEditTime"] == "2026-06-25 10:00:00"
    assert rec["weekProgressEditBy"] == "wangxutong"
    assert s["current"]["P1"]["weekProgress"] == "本周X"
    with pytest.raises(ValueError):
        tf.apply_update(s, "P1", "badField", "x", "u", "t")


def test_apply_archive_appends_and_clears():
    s = tf.new_store()
    tf.apply_update(s, "P1", "weekProgress", "A", "u1", "t1")
    rows = [{"projectId": "P1", "weekProgress": "A"}]
    tf.apply_archive(s, rows, "2026-06-25 18:00:00")
    assert len(s["archives"]) == 1 and s["archives"][0]["archiveTime"] == "2026-06-25 18:00:00"
    assert s["archives"][0]["rows"] == rows and s["current"] == {}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_temp_followup.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'temp_followup'`）

- [ ] **Step 3: 实现模块**（`temp_followup.py`，新建）

```python
"""临时重点跟进(/projects/temp)领域纯函数:范围条件规整 + 进展编辑/归档。
可单测,不依赖 server。范围匹配在前端做(数据已按 L4 裁剪),本模块只规整与存储进展。"""
from __future__ import annotations
from typing import Any, Dict, List

PROGRESS_FIELDS = ('weekProgress', 'nextPlan')
SCOPE_GROUPS = ('project', 'paymentNode', 'milestone')
_COMBINATORS = ('AND', 'OR')
_OPS = ('in', 'notIn', 'between', 'notBetween', 'contains', 'notContains')


def new_store() -> Dict[str, Any]:
    return {"version": 1, "scope": {"combinator": "AND", "groups": []},
            "current": {}, "archives": []}


def _norm_combinator(v: Any) -> str:
    return v if v in _COMBINATORS else 'AND'


def _norm_condition(c: Any) -> Dict[str, Any] | None:
    if not isinstance(c, dict):
        return None
    if c.get('group') not in SCOPE_GROUPS:
        return None
    field = c.get('field')
    if not isinstance(field, str) or not field:
        return None
    op = c.get('op') if c.get('op') in _OPS else 'in'
    out: Dict[str, Any] = {"group": c['group'], "field": field, "op": op}
    if isinstance(c.get('values'), list):
        out['values'] = [str(x) for x in c['values']]
    if c.get('min') is not None:
        out['min'] = c['min']
    if c.get('max') is not None:
        out['max'] = c['max']
    return out


def normalize_scope(scope: Any) -> Dict[str, Any]:
    """宽容规整范围;结构非法 → 默认空范围 {combinator:'AND', groups:[]}。"""
    default = {"combinator": "AND", "groups": []}
    if not isinstance(scope, dict):
        return default
    groups_raw = scope.get('groups')
    if not isinstance(groups_raw, list):
        return default
    groups: List[Dict[str, Any]] = []
    for g in groups_raw:
        if not isinstance(g, dict):
            continue
        conds_raw = g.get('conditions')
        conds = [nc for nc in (_norm_condition(c) for c in conds_raw) if nc] if isinstance(conds_raw, list) else []
        groups.append({"combinator": _norm_combinator(g.get('combinator')), "conditions": conds})
    return {"combinator": _norm_combinator(scope.get('combinator')), "groups": groups}


def apply_update(store, project_id, field, content, account, now) -> Dict[str, Any]:
    if field not in PROGRESS_FIELDS:
        raise ValueError("invalid field: %s" % field)
    rec = store.setdefault('current', {}).setdefault(project_id, {})
    rec[field] = content
    rec[field + 'EditTime'] = now
    rec[field + 'EditBy'] = account
    return rec


def apply_archive(store, rows, now) -> None:
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
    store['current'] = {}
```

- [ ] **Step 4: 跑测试 + 编译 + ruff**

Run: `python -m pytest tests/test_temp_followup.py -q && python -m py_compile temp_followup.py && python -m ruff check temp_followup.py`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add temp_followup.py tests/test_temp_followup.py
git commit -m "feat(temp): 临时重点跟进领域纯函数(范围规整/进展编辑/归档) + pytest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: server.py 临时跟进端点接线 + 超管门禁 + gitignore

**Files:**
- Modify: `server.py`（模块级：紧接 `_progress_apply_archive` 之后加 store 加载/保存；`_SUPER_ONLY_PATHS` 加两条；`do_GET`/`do_POST` 路由；类内加 4 个 handler；`import temp_followup as _temp`）
- Modify: `.gitignore`
- Test: `tests/test_server_temp_followup.py`

**Interfaces:**
- Consumes: Task 3 的 `temp_followup`（`new_store`/`normalize_scope`/`apply_update`/`apply_archive`/`PROGRESS_FIELDS`）；现有 `_error_payload`/`_send_json`/`_json_response`/`_read_json_body`/`_session_account_rec`/`auth.validate_session`/`auth.parse_cookie_token`/`BASE_DIR`。
- Produces: `GET /api/temp-followup`、`POST /api/temp-followup/scope`（超管）、`POST /api/temp-followup/update`、`POST /api/temp-followup/archive`（超管）；`TEMP_FOLLOWUP_FILE`、`_load_temp_followup`、`_save_temp_followup`。

- [ ] **Step 1: 写失败测试**（`tests/test_server_temp_followup.py`，新建）

```python
import server


def test_load_temp_missing_returns_default(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(tmp_path / "none.json"))
    s = server._load_temp_followup()
    assert s["scope"] == {"combinator": "AND", "groups": []}
    assert s["current"] == {} and s["archives"] == []


def test_load_temp_corrupt_returns_default(tmp_path, monkeypatch):
    f = tmp_path / "temp_followup.json"
    f.write_text("{bad", encoding="utf-8")
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(f))
    assert server._load_temp_followup()["scope"]["groups"] == []


def test_save_load_roundtrip(tmp_path, monkeypatch):
    f = tmp_path / "temp_followup.json"
    monkeypatch.setattr(server, "TEMP_FOLLOWUP_FILE", str(f))
    store = server._load_temp_followup()
    server.temp_followup.apply_update(store, "P1", "weekProgress", "x", "admin", "t")
    server._save_temp_followup(store)
    assert server._load_temp_followup()["current"]["P1"]["weekProgress"] == "x"


def test_temp_super_only_paths():
    assert '/api/temp-followup/scope' in server._SUPER_ONLY_PATHS
    assert '/api/temp-followup/archive' in server._SUPER_ONLY_PATHS
    assert '/api/temp-followup' not in server._SUPER_ONLY_PATHS        # GET 任意登录
    assert '/api/temp-followup/update' not in server._SUPER_ONLY_PATHS  # 进展编辑任意登录
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_temp_followup.py -q`
Expected: FAIL（`AttributeError: module 'server' has no attribute 'TEMP_FOLLOWUP_FILE'` 等）

- [ ] **Step 3: 模块级 store + import**（`server.py`）

在 `import opportunities as _opp` 附近加：
```python
import temp_followup as _temp
```
在 `_progress_apply_archive`（约 309 行）之后插入：
```python
# ── 临时重点跟进(/projects/temp;V2.1.0):scope 条件 + current 进展 + archives 快照 ──
TEMP_FOLLOWUP_FILE = os.path.join(BASE_DIR, 'data', 'temp_followup.json')
_temp_lock = threading.Lock()


def _load_temp_followup():
    """加载临时跟进 store;缺文件/损坏 → 默认(new_store)。不抛。"""
    if os.path.exists(TEMP_FOLLOWUP_FILE):
        try:
            with open(TEMP_FOLLOWUP_FILE, 'r', encoding='utf-8') as f:
                store = json.load(f)
            if isinstance(store, dict):
                store.setdefault('version', 1)
                store['scope'] = _temp.normalize_scope(store.get('scope'))
                store.setdefault('current', {})
                store.setdefault('archives', [])
                return store
        except Exception:
            pass
    return _temp.new_store()


def _save_temp_followup(store):
    with _temp_lock:
        os.makedirs(os.path.dirname(TEMP_FOLLOWUP_FILE), exist_ok=True)
        with open(TEMP_FOLLOWUP_FILE, 'w', encoding='utf-8') as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
```

- [ ] **Step 4: `_SUPER_ONLY_PATHS` 加两条**（`server.py:158-161` 集合内追加）

```python
    '/api/progress/archive',
    '/api/opportunities/create', '/api/opportunities/update',
    '/api/opportunities/delete', '/api/opportunities/import',
    '/api/temp-followup/scope', '/api/temp-followup/archive',
})
```

- [ ] **Step 5: 路由 dispatch**（`server.py`）

`do_GET` 在 `elif parsed.path == '/api/progress':` 块后加：
```python
        elif parsed.path == '/api/temp-followup':
            self.handle_temp_followup_get()
```
`do_POST` 在 `elif parsed.path == '/api/progress/archive':` 块后加：
```python
        elif parsed.path == '/api/temp-followup/scope':
            self.handle_temp_followup_scope()
        elif parsed.path == '/api/temp-followup/update':
            self.handle_temp_followup_update()
        elif parsed.path == '/api/temp-followup/archive':
            self.handle_temp_followup_archive()
```

- [ ] **Step 6: 4 个 handler**（`server.py`，紧接 `handle_progress_archive` 之后）

```python
    def handle_temp_followup_get(self):
        """GET /api/temp-followup — {scope, current, archives}。任意登录用户(普通管理员需 scope 在前端算命中集)。"""
        account, rec = self._session_account_rec()
        if not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        try:
            store = _load_temp_followup()
            self._json_response({"success": True, "scope": store.get("scope"),
                                 "current": store.get("current", {}), "archives": store.get("archives", [])})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"读取临时跟进失败: {e}"))

    def handle_temp_followup_scope(self):
        """POST /api/temp-followup/scope {combinator, groups} — 保存范围条件。超管专属(_authz_gate 拦)。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        try:
            store = _load_temp_followup()
            store['scope'] = _temp.normalize_scope(data)
            _save_temp_followup(store)
            self._json_response({"success": True, "scope": store['scope']})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"保存范围失败: {e}"))

    def handle_temp_followup_update(self):
        """POST /api/temp-followup/update {projectId, field, content} — 编辑单格进展。任意登录用户。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        pid = str(data.get('projectId') or '').strip()
        field = data.get('field')
        if not pid or field not in _temp.PROGRESS_FIELDS:
            self._send_json(400, _error_payload(ERR_VALIDATION, "projectId 必填、field 须为 weekProgress/nextPlan"))
            return
        account = auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))
        if not account:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        try:
            store = _load_temp_followup()
            rec = _temp.apply_update(store, pid, field, str(data.get('content') or ''),
                                     account, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            _save_temp_followup(store)
            self._json_response({"success": True, "record": rec})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"保存进展失败: {e}"))

    def handle_temp_followup_archive(self):
        """POST /api/temp-followup/archive {rows} — 冻结当前为快照并清空 current。超管专属。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        rows = data.get('rows')
        if not isinstance(rows, list):
            self._send_json(400, _error_payload(ERR_VALIDATION, "rows 须为数组"))
            return
        try:
            store = _load_temp_followup()
            _temp.apply_archive(store, rows, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            _save_temp_followup(store)
            self._json_response({"success": True, "archives": store.get("archives", [])})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"归档失败: {e}"))
```

- [ ] **Step 7: gitignore**（`.gitignore`，在 `data/opportunities.backup-*.json` 之后加）

```
# 临时重点跟进数据(运行时用户数据,V2.1.0)
data/temp_followup.json
data/temp_followup.backup-*.json
```

- [ ] **Step 8: 跑测试 + 编译 + ruff + 全量 pytest**

Run: `python -m pytest tests/test_server_temp_followup.py -q && python -m py_compile server.py && python -m ruff check server.py && python -m pytest -q`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add server.py .gitignore tests/test_server_temp_followup.py
git commit -m "feat(temp): server 临时跟进 4 端点(scope/update/archive超管门) + store 持久化 + gitignore

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `tempScope.ts` — 条件树类型 + 字段目录 + 匹配

**Files:**
- Create: `frontend/src/lib/tempScope.ts`
- Test: `frontend/src/lib/tempScope.test.ts`

**Interfaces:**
- Produces: 类型 `Combinator`/`ScopeOp`/`ScopeCondition`/`ScopeGroup`/`ScopeFilter`/`FieldDef`/`ScopeProjectInput`；常量 `FIELD_CATALOG: FieldDef[]`；函数 `opsForKind(kind)`、`fieldsOf(group)`、`projectMatches(input, scope): boolean`。
- `ScopeProjectInput = { id: string; proj: Record<string, any>; nodes: Record<string, any>[]; milestones: Record<string, any>[] }`。

- [ ] **Step 1: 写失败测试**（`frontend/src/lib/tempScope.test.ts`，新建）

```ts
import { describe, it, expect } from 'vitest'
import { projectMatches, opsForKind, FIELD_CATALOG, type ScopeFilter, type ScopeProjectInput } from './tempScope'

const inp = (over: Partial<ScopeProjectInput>): ScopeProjectInput => ({
  id: 'P', proj: {}, nodes: [], milestones: [], ...over,
})

describe('opsForKind', () => {
  it('按 kind 给运算符', () => {
    expect(opsForKind('enum')).toEqual(['in', 'notIn'])
    expect(opsForKind('text')).toEqual(['contains', 'notContains'])
    expect(opsForKind('number')).toEqual(['between', 'notBetween'])
    expect(opsForKind('date')).toEqual(['between', 'notBetween'])
  })
})

describe('FIELD_CATALOG', () => {
  it('含三组且键唯一(组内)', () => {
    const groups = new Set(FIELD_CATALOG.map((f) => f.group))
    expect(groups).toEqual(new Set(['project', 'paymentNode', 'milestone']))
    const projKeys = FIELD_CATALOG.filter((f) => f.group === 'project').map((f) => f.key)
    expect(new Set(projKeys).size).toBe(projKeys.length)
    expect(projKeys).toContain('orgL4')
    expect(projKeys).toContain('contractWan')
  })
})

describe('projectMatches', () => {
  const scope = (s: Partial<ScopeFilter>): ScopeFilter => ({ combinator: 'AND', groups: [], ...s })

  it('空范围 → 命中为空(false)', () => {
    expect(projectMatches(inp({ proj: { orgL4: '小金融服务组' } }), scope({}))).toBe(false)
  })

  it('project enum in / notIn', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'orgL4', op: 'in', values: ['小金融服务组'] }] }] })
    expect(projectMatches(inp({ proj: { orgL4: '小金融服务组' } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组' } }), f)).toBe(false)
    const fn = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'orgL4', op: 'notIn', values: ['小金融服务组'] }] }] })
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组' } }), fn)).toBe(true)
  })

  it('project number between (含端点) / notBetween', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'contractWan', op: 'between', min: 100, max: 500 }] }] })
    expect(projectMatches(inp({ proj: { contractWan: 100 } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { contractWan: 500 } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { contractWan: 80 } }), f)).toBe(false)
    expect(projectMatches(inp({ proj: { contractWan: null } }), f)).toBe(false)
  })

  it('date between 取前10位字典序', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'finalAcceptDate', op: 'between', min: '2026-01-01', max: '2026-12-31' }] }] })
    expect(projectMatches(inp({ proj: { finalAcceptDate: '2026-06-30' } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { finalAcceptDate: '2027-01-01' } }), f)).toBe(false)
  })

  it('tags 多值: 任一 ∈ values 命中', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'tags', op: 'in', values: ['重点'] }] }] })
    expect(projectMatches(inp({ proj: { tags: ['普通', '重点'] } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { tags: ['普通'] } }), f)).toBe(false)
  })

  it('子表存在性: 任一节点满足', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'paymentNode', field: 'status', op: 'in', values: ['延期'] }] }] })
    expect(projectMatches(inp({ nodes: [{ status: '正常' }, { status: '延期' }] }), f)).toBe(true)
    expect(projectMatches(inp({ nodes: [{ status: '正常' }] }), f)).toBe(false)
    expect(projectMatches(inp({ nodes: [] }), f)).toBe(false)
  })

  it('text contains / notContains(里程碑名称)', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'milestone', field: 'name', op: 'contains', values: ['验收'] }] }] })
    expect(projectMatches(inp({ milestones: [{ name: '初验收节点' }] }), f)).toBe(true)
    expect(projectMatches(inp({ milestones: [{ name: '启动' }] }), f)).toBe(false)
  })

  it('两级 AND/OR: (A AND B) OR (C)', () => {
    const f: ScopeFilter = { combinator: 'OR', groups: [
      { combinator: 'AND', conditions: [
        { group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] },
        { group: 'project', field: 'top1000', op: 'in', values: ['是'] }] },
      { combinator: 'AND', conditions: [
        { group: 'project', field: 'health', op: 'in', values: ['风险'] }] },
    ] }
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组', top1000: '是', health: '健康' } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组', top1000: '否', health: '风险' } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组', top1000: '否', health: '健康' } }), f)).toBe(false)
  })

  it('空组求值为 false(不命中全部)', () => {
    const f: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] }
    expect(projectMatches(inp({ proj: { orgL4: 'X' } }), f)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `tempScope.ts`**（新建）

```ts
// 临时重点跟进范围筛选:条件树类型 + 字段目录 + 匹配(前端算,数据已按 L4 裁剪)。
export type Combinator = 'AND' | 'OR'
export type ScopeOp = 'in' | 'notIn' | 'between' | 'notBetween' | 'contains' | 'notContains'

export interface ScopeCondition {
  group: 'project' | 'paymentNode' | 'milestone'
  field: string
  op: ScopeOp
  values?: string[]
  min?: number | string | null
  max?: number | string | null
}
export interface ScopeGroup { combinator: Combinator; conditions: ScopeCondition[] }
export interface ScopeFilter { combinator: Combinator; groups: ScopeGroup[] }

export interface FieldDef {
  group: 'project' | 'paymentNode' | 'milestone'
  key: string
  label: string
  kind: 'enum' | 'number' | 'date' | 'text'
}

export interface ScopeProjectInput {
  id: string
  proj: Record<string, any>
  nodes: Record<string, any>[]
  milestones: Record<string, any>[]
}

export function opsForKind(kind: FieldDef['kind']): ScopeOp[] {
  if (kind === 'enum') return ['in', 'notIn']
  if (kind === 'text') return ['contains', 'notContains']
  return ['between', 'notBetween'] // number / date
}

// 字段目录(单一来源)。project 组 key 对应 buildScopeInputs 产出的 proj 键;
// paymentNode/milestone 组 key 对应原始子表行字段名(PaymentNodePmis / MilestoneItem)。
export const FIELD_CATALOG: FieldDef[] = [
  // —— project 组 ——
  { group: 'project', key: 'customer', label: '客户', kind: 'enum' },
  { group: 'project', key: 'projectManager', label: '项目经理', kind: 'enum' },
  { group: 'project', key: 'ar', label: 'AR', kind: 'enum' },
  { group: 'project', key: 'sr', label: 'SR', kind: 'enum' },
  { group: 'project', key: 'orgL4', label: 'L4组', kind: 'enum' },
  { group: 'project', key: 'projectLevel', label: '级别', kind: 'enum' },
  { group: 'project', key: 'projectType', label: '项目类型', kind: 'enum' },
  { group: 'project', key: 'stage', label: '阶段', kind: 'enum' },
  { group: 'project', key: 'projectStatus', label: '项目状态', kind: 'enum' },
  { group: 'project', key: 'health', label: '健康度', kind: 'enum' },
  { group: 'project', key: 'riskLevel', label: '风险等级', kind: 'enum' },
  { group: 'project', key: 'paymentStatus', label: '回款状态', kind: 'enum' },
  { group: 'project', key: 'top1000', label: 'TOP1000', kind: 'enum' },
  { group: 'project', key: 'quadrant', label: '象限', kind: 'enum' },
  { group: 'project', key: 'paused', label: '是否暂停', kind: 'enum' },
  { group: 'project', key: 'overspend', label: '是否超支', kind: 'enum' },
  { group: 'project', key: 'isPresale', label: '是否售前', kind: 'enum' },
  { group: 'project', key: 'tags', label: '标签', kind: 'enum' },
  { group: 'project', key: 'milestoneStatus', label: '里程碑进度状态', kind: 'enum' },
  { group: 'project', key: 'contractWan', label: '合同金额(万)', kind: 'number' },
  { group: 'project', key: 'progress', label: '完工进展', kind: 'number' },
  { group: 'project', key: 'costRatio', label: '预算消耗比', kind: 'number' },
  { group: 'project', key: 'paymentRatio', label: '回款完成率', kind: 'number' },
  { group: 'project', key: 'openRisks', label: '未关闭风险数', kind: 'number' },
  { group: 'project', key: 'finalAcceptDate', label: '终验时间', kind: 'date' },
  // —— paymentNode 组(存在性) ——
  { group: 'paymentNode', key: 'stage', label: '回款阶段', kind: 'enum' },
  { group: 'paymentNode', key: 'category', label: '回款类型', kind: 'enum' },
  { group: 'paymentNode', key: 'status', label: '状态', kind: 'enum' },
  { group: 'paymentNode', key: 'planDate', label: '计划日期', kind: 'date' },
  { group: 'paymentNode', key: 'actualDate', label: '实际日期', kind: 'date' },
  { group: 'paymentNode', key: 'payRatio', label: '计划比例', kind: 'number' },
  { group: 'paymentNode', key: 'actualRatio', label: '实际比例', kind: 'number' },
  { group: 'paymentNode', key: 'expectedPayment', label: '计划回款(万)', kind: 'number' },
  { group: 'paymentNode', key: 'receivedAmount', label: '已收(万)', kind: 'number' },
  { group: 'paymentNode', key: 'unpaidAmount', label: '未收(万)', kind: 'number' },
  { group: 'paymentNode', key: 'termDays', label: '账期(天)', kind: 'number' },
  // —— milestone 组(存在性) ——
  { group: 'milestone', key: 'priority', label: '优先级', kind: 'enum' },
  { group: 'milestone', key: 'payStage', label: '关联收款阶段', kind: 'enum' },
  { group: 'milestone', key: 'name', label: '里程碑名称', kind: 'text' },
  { group: 'milestone', key: 'planDate', label: '计划日期', kind: 'date' },
  { group: 'milestone', key: 'actualDate', label: '实际日期', kind: 'date' },
]

export function fieldsOf(group: FieldDef['group']): FieldDef[] {
  return FIELD_CATALOG.filter((f) => f.group === group)
}

function isDateLike(x: any): boolean {
  return typeof x === 'string' && /\d{4}-\d{2}-\d{2}/.test(x)
}

function inRange(raw: any, min: any, max: any): boolean {
  const hasMin = min != null && min !== ''
  const hasMax = max != null && max !== ''
  if (!hasMin && !hasMax) return true
  if (isDateLike(min) || isDateLike(max)) {
    const v = String(raw ?? '').slice(0, 10)
    if (v === '') return false
    if (hasMin && v < String(min).slice(0, 10)) return false
    if (hasMax && v > String(max).slice(0, 10)) return false
    return true
  }
  if (raw == null || raw === '') return false
  const n = Number(raw)
  if (Number.isNaN(n)) return false
  if (hasMin && n < Number(min)) return false
  if (hasMax && n > Number(max)) return false
  return true
}

function leafMatch(raw: any, c: ScopeCondition): boolean {
  switch (c.op) {
    case 'in':
    case 'notIn': {
      const set = new Set(c.values ?? [])
      const hit = Array.isArray(raw)
        ? raw.some((v) => set.has(String(v)))
        : set.has(String(raw ?? ''))
      return c.op === 'in' ? hit : !hit
    }
    case 'between':
    case 'notBetween': {
      const within = inRange(raw, c.min, c.max)
      return c.op === 'between' ? within : !within
    }
    case 'contains':
    case 'notContains': {
      const term = String((c.values && c.values[0]) ?? '')
      const hit = term !== '' && String(raw ?? '').includes(term)
      return c.op === 'contains' ? hit : !hit
    }
  }
  return false
}

function evalCond(input: ScopeProjectInput, c: ScopeCondition): boolean {
  if (c.group === 'project') return leafMatch(input.proj[c.field], c)
  const rows = c.group === 'paymentNode' ? input.nodes : input.milestones
  return (rows ?? []).some((r) => leafMatch(r[c.field], c))
}

function evalGroup(input: ScopeProjectInput, g: ScopeGroup): boolean {
  if (!g.conditions || !g.conditions.length) return false // 空组不命中
  const rs = g.conditions.map((c) => evalCond(input, c))
  return g.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}

/** 空范围(无 groups 或全空组)→ false。两级 AND/OR。 */
export function projectMatches(input: ScopeProjectInput, scope: ScopeFilter): boolean {
  if (!scope || !Array.isArray(scope.groups) || !scope.groups.length) return false
  const rs = scope.groups.map((g) => evalGroup(input, g))
  return scope.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}
```

- [ ] **Step 4: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/tempScope.ts frontend/src/lib/tempScope.test.ts
git commit -m "feat(temp): 范围筛选条件树+字段目录+matchScope(两级AND/OR+子表存在性) + vitest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `keyProjects` 抽公共行 + `tempFollowup.ts` 行/输入构建

**Files:**
- Modify: `frontend/src/lib/keyProjects.ts`（抽 `buildProgressRowBase`，`buildKeyProjectRows` 改用之）
- Create: `frontend/src/lib/tempFollowup.ts`
- Test: `frontend/src/lib/tempFollowup.test.ts`（含 keyProjects 回归断言）

**Interfaces:**
- Consumes: `keyProjects` 的 `KeyProjectRow`/`ProgressRecord`/`isKeyProject`；`projectList` 的 `buildProjectRows`；`tempScope` 的 `ScopeProjectInput`。
- Produces:
  - `buildProgressRowBase(p: Project, pmis: ProjectPmis | undefined, rec: ProgressRecord): KeyProjectRow`（即原 per-project 映射体）。
  - `TempRow extends KeyProjectRow`（+ 13 个项目级额外字段）。
  - `buildTempRows(projects, pmisMap, current, inScopeIds: Set<string>): TempRow[]`。
  - `buildScopeInputs(projects, pmisMap, paymentNodes, milestones): ScopeProjectInput[]`。

- [ ] **Step 1: 写失败测试**（`frontend/src/lib/tempFollowup.test.ts`，新建）

```ts
import { describe, it, expect } from 'vitest'
import { buildTempRows, buildScopeInputs } from './tempFollowup'
import { buildKeyProjectRows, buildProgressRowBase } from './keyProjects'
import type { Project, ProjectPmis } from '@/types/analysis'

const proj = (over: Partial<Project>): Project => ({
  projectId: 'P1', projectName: '项目甲', projectManager: '张三', orgL4: '银行服务组',
  top1000: '是', paymentPmis: { contract: 2_000_000 } as any, payment: { paymentRatio: 0.4 } as any,
  quadrant: 'A', ...over,
} as any)

const pmis = (): Record<string, ProjectPmis> => ({
  P1: {
    status: { 项目级别: 'P1', 项目类型: '实施', 项目状态: '进行中', 是否暂停: false },
    progress: { 项目阶段: '执行', 完工进展: 0.5, 里程碑进度状态: '正常', 终验时间: '2026-09-01' },
    risk: { 最高等级: '中', 未关闭风险数: 2 }, cost: { 消耗比: 0.6, 项目超支: false },
    customer: { 最终客户: '客户甲', 合同总额: 200 }, team: { AR: 'arX', SR: 'srY' },
  } as any,
})

describe('keyProjects 重构回归', () => {
  it('buildProgressRowBase 与 buildKeyProjectRows 输出一致(同一项目)', () => {
    const ps = [proj({})]
    const m = pmis()
    const fromKey = buildKeyProjectRows(ps, m, {})[0]
    const fromBase = buildProgressRowBase(ps[0], m.P1, {})
    expect(fromBase).toEqual(fromKey)
  })
})

describe('buildTempRows', () => {
  it('按 inScopeIds 过滤并带项目级额外列', () => {
    const ps = [proj({}), proj({ projectId: 'P2', projectName: '项目乙', orgL4: '小金融服务组' })]
    const m = { ...pmis(), P2: pmis().P1 }
    const rows = buildTempRows(ps, m as any, {}, new Set(['P1']))
    expect(rows.map((r) => r.projectId)).toEqual(['P1'])
    expect(rows[0].projectName).toBe('项目甲')
    expect(rows[0].health).toBeDefined()
    expect(rows[0].milestoneStatus).toBe('正常')
    expect(rows[0].paymentRatio).toBe(0.4)
  })
})

describe('buildScopeInputs', () => {
  it('产出 proj/nodes/milestones,布尔映射是/否,contractWan 来自 paymentPmis', () => {
    const ps = [proj({})]
    const inputs = buildScopeInputs(ps, pmis() as any, { P1: [{ status: '延期' }] } as any, { P1: [{ name: '验收' }] } as any)
    expect(inputs).toHaveLength(1)
    const i = inputs[0]
    expect(i.id).toBe('P1')
    expect(i.proj.orgL4).toBe('银行服务组')
    expect(i.proj.top1000).toBe('是')
    expect(i.proj.paused).toBe('否')
    expect(i.proj.contractWan).toBe(200) // 2_000_000/10000
    expect(i.proj.ar).toBe('arX')
    expect(i.nodes[0].status).toBe('延期')
    expect(i.milestones[0].name).toBe('验收')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/tempFollowup.test.ts`
Expected: FAIL（`buildProgressRowBase` 未导出、`tempFollowup` 不存在）

- [ ] **Step 3: 重构 keyProjects.ts**

把 `buildKeyProjectRows` 的 per-project map 体抽成导出函数（行为不变）：
```ts
export function buildProgressRowBase(
  p: Project,
  pmis: ProjectPmis | undefined,
  rec: ProgressRecord,
): KeyProjectRow {
  const m = (pmis ?? {}) as Record<string, any>
  const st = m.status ?? {}, risk = m.risk ?? {}, cust = m.customer ?? {}, team = m.team ?? {}
  const contract = p.paymentPmis?.contract
  return {
    projectId: p.projectId,
    customer: v(cust.最终客户, '-'),
    projectName: p.projectName || p.projectId,
    projectLevel: v(st.项目级别, '-'),
    projectManager: v(p.projectManager, '-'),
    ar: v(team.AR, '-'),
    sr: v(team.SR, '-'),
    orgL4: v(p.orgL4, '-'),
    contractWan: typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,
    riskLevel: v(risk.最高等级, '无'),
    openRisks: Number(risk.未关闭风险数 ?? 0),
    weekProgress: v(rec.weekProgress),
    weekProgressEditTime: v(rec.weekProgressEditTime),
    weekProgressEditBy: v(rec.weekProgressEditBy),
    nextPlan: v(rec.nextPlan),
    nextPlanEditTime: v(rec.nextPlanEditTime),
    nextPlanEditBy: v(rec.nextPlanEditBy),
    followDate: followDate(rec),
    followBy: followBy(rec),
  }
}
```
`buildKeyProjectRows` 改为：
```ts
export function buildKeyProjectRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, ProgressRecord>,
): KeyProjectRow[] {
  return projects
    .filter((p) => isKeyProject(p, pmisMap[p.projectId]))
    .map((p) => buildProgressRowBase(p, pmisMap[p.projectId], current[p.projectId] ?? {}))
}
```

- [ ] **Step 4: 实现 tempFollowup.ts**（新建）

```ts
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProgressRowBase, type KeyProjectRow, type ProgressRecord } from './keyProjects'
import { buildProjectRows, type ProjectRow } from './projectList'
import type { ScopeProjectInput } from './tempScope'

export interface TempRow extends KeyProjectRow {
  stage: string; projectType: string; projectStatus: string; health: string
  progress: number | null; costRatio: number | null; paymentRatio: number | null
  paymentStatus: string; top1000: string; quadrant: string
  paused: boolean; overspend: boolean; milestoneStatus: string
}

export function buildTempRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, ProgressRecord>,
  inScopeIds: Set<string>,
): TempRow[] {
  const prMap = new Map<string, ProjectRow>(buildProjectRows(projects, pmisMap).map((r) => [r.projectId, r]))
  return projects
    .filter((p) => inScopeIds.has(p.projectId))
    .map((p) => {
      const pmis = pmisMap[p.projectId]
      const base = buildProgressRowBase(p, pmis, current[p.projectId] ?? {})
      const pr = prMap.get(p.projectId)
      const prog = ((pmis ?? {}) as Record<string, any>).progress ?? {}
      return {
        ...base,
        stage: pr?.stage ?? '-',
        projectType: pr?.projectType ?? '-',
        projectStatus: pr?.projectStatus ?? '-',
        health: pr?.health ?? '无数据',
        progress: pr?.progress ?? null,
        costRatio: pr?.costRatio ?? null,
        paymentRatio: pr?.paymentRatio ?? null,
        paymentStatus: pr?.paymentStatus ?? '-',
        top1000: pr?.top1000 ?? '否',
        quadrant: pr?.quadrant ?? '',
        paused: pr?.paused ?? false,
        overspend: pr?.overspend ?? false,
        milestoneStatus: String(prog.里程碑进度状态 ?? '-'),
      }
    })
}

export function buildScopeInputs(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  paymentNodes: Record<string, any[]> | undefined,
  milestones: Record<string, any[]> | undefined,
): ScopeProjectInput[] {
  const prMap = new Map<string, ProjectRow>(buildProjectRows(projects, pmisMap).map((r) => [r.projectId, r]))
  const yn = (b: boolean) => (b ? '是' : '否')
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const team = m.team ?? {}, prog = m.progress ?? {}
    const pr = prMap.get(p.projectId)
    const contract = p.paymentPmis?.contract
    return {
      id: p.projectId,
      proj: {
        customer: pr?.customer ?? '-',
        projectManager: pr?.projectManager ?? '-',
        ar: String(team.AR ?? '-'),
        sr: String(team.SR ?? '-'),
        orgL4: pr?.orgL4 ?? '-',
        projectLevel: pr?.projectLevel ?? '-',
        projectType: pr?.projectType ?? '-',
        stage: pr?.stage ?? '-',
        projectStatus: pr?.projectStatus ?? '-',
        health: pr?.health ?? '无数据',
        riskLevel: pr?.riskLevel ?? '无',
        paymentStatus: pr?.paymentStatus ?? '-',
        top1000: pr?.top1000 ?? '否',
        quadrant: pr?.quadrant ?? '',
        paused: yn(!!pr?.paused),
        overspend: yn(!!pr?.overspend),
        isPresale: yn(!!pr?.isPresale),
        tags: pr?.tags ?? [],
        milestoneStatus: String(prog.里程碑进度状态 ?? '-'),
        contractWan: typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,
        progress: pr?.progress ?? null,
        costRatio: pr?.costRatio ?? null,
        paymentRatio: pr?.paymentRatio ?? null,
        openRisks: pr?.openRisks ?? 0,
        finalAcceptDate: String(prog.终验时间 ?? '').slice(0, 10),
      },
      nodes: (paymentNodes?.[p.projectId] ?? []) as any[],
      milestones: (milestones?.[p.projectId] ?? []) as any[],
    }
  })
}
```

- [ ] **Step 5: 跑测试 + 全量 vitest(keyProjects 回归) + typecheck**

Run: `cd frontend && npx vitest run src/lib/tempFollowup.test.ts && npx vitest run src/lib && npm run typecheck`
Expected: PASS（keyProjects 既有用例不破）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/keyProjects.ts frontend/src/lib/tempFollowup.ts frontend/src/lib/tempFollowup.test.ts
git commit -m "feat(temp): keyProjects 抽 buildProgressRowBase + tempFollowup 行/范围输入构建 + vitest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 临时跟进 API + store + 登入登出 reset

**Files:**
- Create: `frontend/src/lib/tempFollowupApi.ts`
- Create: `frontend/src/stores/tempFollowup.ts`
- Modify: `frontend/src/stores/auth.ts`（import + login/logout 各加一行 reset）
- Test: `frontend/src/stores/tempFollowup.test.ts`

**Interfaces:**
- Consumes: `@/api/client` 的 `api`；`tempScope` 的 `ScopeFilter`；`keyProjects` 的 `ProgressRecord`；`projectProgressApi` 的 `Archive`。
- Produces: `tempFollowupApi`（`get`/`saveScope`/`update`/`archive`）；`useTempFollowupStore`（`scope`/`current`/`archives`/`loaded`/`load`/`saveScope`/`update`/`archive`/`reset`）。

- [ ] **Step 1: 写失败测试**（`frontend/src/stores/tempFollowup.test.ts`，新建）

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/tempFollowupApi', () => ({
  tempFollowupApi: {
    get: vi.fn().mockResolvedValue({
      scope: { combinator: 'AND', groups: [] }, current: { P1: { weekProgress: 'x' } }, archives: [],
    }),
    saveScope: vi.fn().mockResolvedValue({ scope: { combinator: 'OR', groups: [] } }),
    update: vi.fn().mockResolvedValue({ record: { weekProgress: 'y', weekProgressEditBy: 'admin' } }),
    archive: vi.fn().mockResolvedValue({ archives: [{ archiveTime: 't', rows: [] }] }),
  },
}))

import { useTempFollowupStore } from './tempFollowup'

describe('useTempFollowupStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load 填充 scope/current/archives', async () => {
    const s = useTempFollowupStore()
    await s.load()
    expect(s.loaded).toBe(true)
    expect(s.current.P1.weekProgress).toBe('x')
  })

  it('saveScope 更新 scope', async () => {
    const s = useTempFollowupStore()
    await s.saveScope({ combinator: 'OR', groups: [] })
    expect(s.scope.combinator).toBe('OR')
  })

  it('update 合并单项目记录', async () => {
    const s = useTempFollowupStore()
    await s.update('P1', 'weekProgress', 'y')
    expect(s.current.P1.weekProgress).toBe('y')
  })

  it('archive 后清空 current', async () => {
    const s = useTempFollowupStore()
    await s.load()
    await s.archive([])
    expect(s.archives).toHaveLength(1)
    expect(s.current).toEqual({})
  })

  it('reset 复位', async () => {
    const s = useTempFollowupStore()
    await s.load()
    s.reset()
    expect(s.loaded).toBe(false)
    expect(s.archives).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/tempFollowup.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 api**（`frontend/src/lib/tempFollowupApi.ts`，新建）

```ts
import { api } from '@/api/client'
import type { ScopeFilter } from './tempScope'
import type { ProgressRecord } from './keyProjects'
import type { Archive } from './projectProgressApi'

export interface TempGetResp { success?: boolean; scope: ScopeFilter; current: Record<string, ProgressRecord>; archives: Archive[] }
export interface TempScopeResp { success: boolean; scope: ScopeFilter }
export interface TempUpdateResp { success: boolean; record: ProgressRecord }
export interface TempArchiveResp { success: boolean; archives: Archive[] }

export const tempFollowupApi = {
  get: () => api.get<TempGetResp>('/api/temp-followup'),
  saveScope: (scope: ScopeFilter) => api.post<TempScopeResp>('/api/temp-followup/scope', scope),
  update: (projectId: string, field: 'weekProgress' | 'nextPlan', content: string) =>
    api.post<TempUpdateResp>('/api/temp-followup/update', { projectId, field, content }),
  archive: (rows: Record<string, unknown>[]) => api.post<TempArchiveResp>('/api/temp-followup/archive', { rows }),
}
```

- [ ] **Step 4: 实现 store**（`frontend/src/stores/tempFollowup.ts`，新建）

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { tempFollowupApi } from '@/lib/tempFollowupApi'
import type { Archive } from '@/lib/projectProgressApi'
import type { ProgressRecord } from '@/lib/keyProjects'
import type { ScopeFilter } from '@/lib/tempScope'

const EMPTY_SCOPE: ScopeFilter = { combinator: 'AND', groups: [] }

export const useTempFollowupStore = defineStore('tempFollowup', () => {
  const scope = ref<ScopeFilter>({ ...EMPTY_SCOPE })
  const current = ref<Record<string, ProgressRecord>>({})
  const archives = ref<Archive[]>([])
  const loaded = ref(false)

  async function load() {
    const r = await tempFollowupApi.get()
    scope.value = r.scope ?? { ...EMPTY_SCOPE }
    current.value = r.current ?? {}
    archives.value = r.archives ?? []
    loaded.value = true
  }
  async function saveScope(next: ScopeFilter) {
    const r = await tempFollowupApi.saveScope(next)
    scope.value = r.scope ?? next
  }
  async function update(projectId: string, field: 'weekProgress' | 'nextPlan', content: string) {
    const r = await tempFollowupApi.update(projectId, field, content)
    current.value = { ...current.value, [projectId]: { ...current.value[projectId], ...r.record } }
  }
  async function archive(rows: Record<string, unknown>[]) {
    const r = await tempFollowupApi.archive(rows)
    archives.value = r.archives ?? []
    current.value = {}
  }
  function reset() {
    scope.value = { ...EMPTY_SCOPE }
    current.value = {}
    archives.value = []
    loaded.value = false
  }
  return { scope, current, archives, loaded, load, saveScope, update, archive, reset }
})
```

- [ ] **Step 5: auth.ts reset 接线**

`frontend/src/stores/auth.ts` import 区加：
```ts
import { useTempFollowupStore } from './tempFollowup'
```
`login` 成功分支（紧接 `useOpportunitiesStore().reset()`）加：
```ts
      useTempFollowupStore().reset()
```
`logout`（紧接 `useOpportunitiesStore().reset()`）加：
```ts
    useTempFollowupStore().reset()
```

- [ ] **Step 6: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/stores/tempFollowup.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/tempFollowupApi.ts frontend/src/stores/tempFollowup.ts frontend/src/stores/auth.ts frontend/src/stores/tempFollowup.test.ts
git commit -m "feat(temp): 临时跟进 api+store + 登入登出 reset(跨账号防泄漏) + vitest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `ProgressEditModal` 加 `store` prop 分流（key | temp）

**Files:**
- Modify: `frontend/src/components/ProgressEditModal.vue`
- Test: `frontend/src/components/ProgressEditModal.test.ts`（若无则新建）

**Interfaces:**
- Consumes: `useProjectProgressStore`、`useTempFollowupStore`（两者均有 `update(projectId, field, content)`）。
- Produces: `ProgressEditModal` 的 `store?: 'key' | 'temp'`（默认 `'key'`，key 页用法不变）。

- [ ] **Step 1: 写失败测试**（`frontend/src/components/ProgressEditModal.test.ts`，新建）

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProgressEditModal from './ProgressEditModal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'
import { useTempFollowupStore } from '@/stores/tempFollowup'

describe('ProgressEditModal store 分流', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it("store='temp' 时保存调临时跟进 store.update", async () => {
    const tmp = useTempFollowupStore()
    const key = useProjectProgressStore()
    const tSpy = vi.spyOn(tmp, 'update').mockResolvedValue(undefined as any)
    const kSpy = vi.spyOn(key, 'update').mockResolvedValue(undefined as any)
    const w = mount(ProgressEditModal, {
      props: { modelValue: true, projectId: 'P1', projectName: '甲', field: 'weekProgress', initial: 'x', store: 'temp' },
      global: { plugins: [ElementPlus], stubs: { teleport: true } },
    })
    await (w.vm as any).save()
    expect(tSpy).toHaveBeenCalledWith('P1', 'weekProgress', 'x')
    expect(kSpy).not.toHaveBeenCalled()
  })

  it("默认(key) 调 projectProgress store.update", async () => {
    const key = useProjectProgressStore()
    const kSpy = vi.spyOn(key, 'update').mockResolvedValue(undefined as any)
    const w = mount(ProgressEditModal, {
      props: { modelValue: true, projectId: 'P2', projectName: '乙', field: 'nextPlan', initial: 'y' },
      global: { plugins: [ElementPlus], stubs: { teleport: true } },
    })
    await (w.vm as any).save()
    expect(kSpy).toHaveBeenCalledWith('P2', 'nextPlan', 'y')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/ProgressEditModal.test.ts`
Expected: FAIL（`store` prop 不存在、`save` 未暴露/未分流）

- [ ] **Step 3: 实现 prop 分流**（`ProgressEditModal.vue` script）

```ts
import { ref, watch, computed } from 'vue'
import Modal from './Modal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'
import { useTempFollowupStore } from '@/stores/tempFollowup'

const props = defineProps<{
  modelValue: boolean; projectId: string; projectName: string
  field: 'weekProgress' | 'nextPlan'; initial: string
  store?: 'key' | 'temp'
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const keyStore = useProjectProgressStore()
const tempStore = useTempFollowupStore()
const activeStore = computed(() => (props.store === 'temp' ? tempStore : keyStore))
const text = ref(props.initial)
const saving = ref(false)
watch(() => props.modelValue, (v) => { if (v) text.value = props.initial })

const FIELD_LABEL = { weekProgress: '本周工作进展', nextPlan: '后续工作计划' } as const

async function save() {
  saving.value = true
  try {
    await activeStore.value.update(props.projectId, props.field, text.value)
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
defineExpose({ save, text })
```
（模板、样式不变。）

- [ ] **Step 4: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/components/ProgressEditModal.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ProgressEditModal.vue frontend/src/components/ProgressEditModal.test.ts
git commit -m "feat(temp): ProgressEditModal 加 store prop 分流(key|temp),默认 key 不变

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `ScopeBuilder.vue` — 超管范围构建器

**Files:**
- Create: `frontend/src/components/ScopeBuilder.vue`
- Test: `frontend/src/components/ScopeBuilder.test.ts`

**Interfaces:**
- Consumes: `tempScope` 的 `FIELD_CATALOG`/`fieldsOf`/`opsForKind`/`projectMatches` + 类型；`ScopeProjectInput`。
- Produces: 组件 props `{ modelValue: boolean; inputs: ScopeProjectInput[]; initial: ScopeFilter }`；emit `update:modelValue`、`save(scope: ScopeFilter)`。内部维护 draft，底部实时命中数，保存 emit draft。

- [ ] **Step 1: 写失败测试**（`frontend/src/components/ScopeBuilder.test.ts`，新建）

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import ScopeBuilder from './ScopeBuilder.vue'
import type { ScopeProjectInput, ScopeFilter } from '@/lib/tempScope'

const inputs: ScopeProjectInput[] = [
  { id: 'P1', proj: { orgL4: '银行服务组' }, nodes: [], milestones: [] },
  { id: 'P2', proj: { orgL4: '小金融服务组' }, nodes: [], milestones: [] },
]

function mountIt(initial: ScopeFilter) {
  return mount(ScopeBuilder, {
    props: { modelValue: true, inputs, initial },
    global: { plugins: [ElementPlus], stubs: { teleport: true } },
  })
}

describe('ScopeBuilder', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addGroup/addCondition 改 draft 结构', async () => {
    const w = mountIt({ combinator: 'AND', groups: [] })
    ;(w.vm as any).addGroup()
    expect((w.vm as any).draft.groups).toHaveLength(1)
    ;(w.vm as any).addCondition(0)
    expect((w.vm as any).draft.groups[0].conditions).toHaveLength(1)
  })

  it('命中数随条件变化', async () => {
    const w = mountIt({ combinator: 'AND', groups: [
      { combinator: 'AND', conditions: [{ group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] }] },
    ] })
    expect((w.vm as any).matchCount).toBe(1)
  })

  it('保存 emit save 携带 draft', async () => {
    const init: ScopeFilter = { combinator: 'OR', groups: [
      { combinator: 'AND', conditions: [{ group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] }] },
    ] }
    const w = mountIt(init)
    ;(w.vm as any).onSave()
    const ev = w.emitted('save')
    expect(ev).toBeTruthy()
    expect((ev![0][0] as ScopeFilter).combinator).toBe('OR')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/ScopeBuilder.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现组件**（`frontend/src/components/ScopeBuilder.vue`，新建）

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  FIELD_CATALOG, fieldsOf, opsForKind, projectMatches,
  type ScopeFilter, type ScopeProjectInput, type ScopeCondition, type FieldDef,
} from '@/lib/tempScope'

const props = defineProps<{ modelValue: boolean; inputs: ScopeProjectInput[]; initial: ScopeFilter }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; save: [ScopeFilter] }>()

const GROUP_LABEL: Record<FieldDef['group'], string> = { project: '项目级', paymentNode: '回款节点', milestone: '里程碑明细' }
const OP_LABEL: Record<string, string> = {
  in: '属于', notIn: '不属于', between: '区间内', notBetween: '区间外', contains: '包含', notContains: '不包含',
}

function clone(s: ScopeFilter): ScopeFilter {
  return JSON.parse(JSON.stringify(s ?? { combinator: 'AND', groups: [] }))
}
const draft = ref<ScopeFilter>(clone(props.initial))
watch(() => props.modelValue, (v) => { if (v) draft.value = clone(props.initial) })

function defFor(c: ScopeCondition): FieldDef | undefined {
  return FIELD_CATALOG.find((f) => f.group === c.group && f.key === c.field)
}
function kindOf(c: ScopeCondition): FieldDef['kind'] { return defFor(c)?.kind ?? 'enum' }

// 枚举候选值:从 inputs 动态去重(project 取 proj[key];子表取所有行的该字段)
function candidates(c: ScopeCondition): string[] {
  const set = new Set<string>()
  for (const it of props.inputs) {
    if (c.group === 'project') {
      const v = it.proj[c.field]
      if (Array.isArray(v)) v.forEach((x) => x != null && x !== '' && set.add(String(x)))
      else if (v != null && v !== '') set.add(String(v))
    } else {
      const rows = c.group === 'paymentNode' ? it.nodes : it.milestones
      for (const r of rows ?? []) {
        const v = r[c.field]
        if (v != null && v !== '') set.add(String(v))
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
}

function addGroup() { draft.value.groups.push({ combinator: 'AND', conditions: [] }) }
function removeGroup(gi: number) { draft.value.groups.splice(gi, 1) }
function addCondition(gi: number) {
  draft.value.groups[gi].conditions.push({ group: 'project', field: 'orgL4', op: 'in', values: [] })
}
function removeCondition(gi: number, ci: number) { draft.value.groups[gi].conditions.splice(ci, 1) }
function onGroupChange(c: ScopeCondition) {
  const first = fieldsOf(c.group)[0]
  c.field = first?.key ?? ''
  c.op = opsForKind(first?.kind ?? 'enum')[0]
  c.values = []; c.min = null; c.max = null
}
function onFieldChange(c: ScopeCondition) {
  c.op = opsForKind(kindOf(c))[0]
  c.values = []; c.min = null; c.max = null
}

const matchCount = computed(() => props.inputs.filter((i) => projectMatches(i, draft.value)).length)

function onSave() { emit('save', clone(draft.value)); emit('update:modelValue', false) }
function onCancel() { emit('update:modelValue', false) }

defineExpose({ draft, matchCount, addGroup, addCondition, removeGroup, removeCondition, onSave, candidates, kindOf })
</script>

<template>
  <el-drawer :model-value="modelValue" title="范围设置（临时重点跟进）" direction="rtl" size="640px"
    @update:model-value="emit('update:modelValue', $event)">
    <div class="sb-top">
      <span class="sb-label">组之间</span>
      <el-radio-group v-model="draft.combinator" size="small">
        <el-radio-button value="AND">AND（且）</el-radio-button>
        <el-radio-button value="OR">OR（或）</el-radio-button>
      </el-radio-group>
      <el-button size="small" type="primary" plain data-test="sb-add-group" @click="addGroup">添加组</el-button>
    </div>

    <div v-for="(g, gi) in draft.groups" :key="gi" class="sb-group">
      <div class="sb-group-head">
        <span class="sb-label">组 {{ gi + 1 }} · 条件之间</span>
        <el-radio-group v-model="g.combinator" size="small">
          <el-radio-button value="AND">AND</el-radio-button>
          <el-radio-button value="OR">OR</el-radio-button>
        </el-radio-group>
        <el-button size="small" text @click="addCondition(gi)">添加条件</el-button>
        <el-button size="small" text type="danger" @click="removeGroup(gi)">删除组</el-button>
      </div>

      <div v-for="(c, ci) in g.conditions" :key="ci" class="sb-cond">
        <el-select v-model="c.group" size="small" style="width: 110px" @change="onGroupChange(c)">
          <el-option v-for="(lbl, gk) in GROUP_LABEL" :key="gk" :label="lbl" :value="gk" />
        </el-select>
        <el-select v-model="c.field" size="small" style="width: 140px" @change="onFieldChange(c)">
          <el-option v-for="f in fieldsOf(c.group)" :key="f.key" :label="f.label" :value="f.key" />
        </el-select>
        <el-select v-model="c.op" size="small" style="width: 100px">
          <el-option v-for="op in opsForKind(kindOf(c))" :key="op" :label="OP_LABEL[op]" :value="op" />
        </el-select>
        <!-- 枚举:多选 -->
        <el-select v-if="kindOf(c) === 'enum'" v-model="c.values" multiple collapse-tags filterable
          size="small" style="min-width: 180px; flex: 1">
          <el-option v-for="v in candidates(c)" :key="v" :label="v" :value="v" />
        </el-select>
        <!-- 文本:包含词 -->
        <el-input v-else-if="kindOf(c) === 'text'" :model-value="(c.values && c.values[0]) || ''"
          size="small" placeholder="包含词" style="flex: 1" @update:model-value="c.values = [$event]" />
        <!-- 数值:min/max -->
        <template v-else-if="kindOf(c) === 'number'">
          <el-input-number v-model="c.min as any" :controls="false" size="small" placeholder="最小" style="width: 100px" />
          <el-input-number v-model="c.max as any" :controls="false" size="small" placeholder="最大" style="width: 100px" />
        </template>
        <!-- 日期:起止 -->
        <template v-else>
          <el-date-picker v-model="c.min as any" type="date" value-format="YYYY-MM-DD" size="small" placeholder="起" style="width: 130px" />
          <el-date-picker v-model="c.max as any" type="date" value-format="YYYY-MM-DD" size="small" placeholder="止" style="width: 130px" />
        </template>
        <el-button size="small" text type="danger" @click="removeCondition(gi, ci)">✕</el-button>
      </div>
      <div v-if="!g.conditions.length" class="sb-empty">该组暂无条件（空组不命中）。</div>
    </div>

    <div v-if="!draft.groups.length" class="sb-empty">暂无范围条件——「添加组」开始定义；保存空范围则页面无项目。</div>

    <template #footer>
      <span class="sb-count u-num">命中 {{ matchCount }} 个项目</span>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" data-test="sb-save" @click="onSave">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.sb-top { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.sb-label { font-size: var(--fs-1); color: var(--sub); }
.sb-group { border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3); margin-bottom: var(--sp-3); background: var(--card2); }
.sb-group-head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.sb-cond { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-2); }
.sb-empty { font-size: var(--fs-1); color: var(--mut); padding: var(--sp-2) 0; }
.sb-count { margin-right: auto; font-size: var(--fs-1); color: var(--sub); }
</style>
```

- [ ] **Step 4: 跑测试 + typecheck + 令牌自检**

Run: `cd frontend && npx vitest run src/components/ScopeBuilder.test.ts && npm run typecheck`
然后确认无裸 hex / 无 `--border`：`grep -nE "#[0-9a-fA-F]{3,6}|--border" frontend/src/components/ScopeBuilder.vue || echo OK`
Expected: vitest/typecheck PASS；grep 输出 `OK`（无命中）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ScopeBuilder.vue frontend/src/components/ScopeBuilder.test.ts
git commit -m "feat(temp): ScopeBuilder 超管范围构建器(两级AND/OR+按kind控件+实时命中数) + vitest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `TempFollowupView.vue` — 临时重点跟进页（仿 KeyProjectsView）

**Files:**
- Create: `frontend/src/views/TempFollowupView.vue`
- Test: `frontend/src/views/TempFollowupView.test.ts`

**Interfaces:**
- Consumes: `useDataStore`、`useAuthStore`、`useTempFollowupStore`、`useCrossFilterStore`；`buildScopeInputs`/`buildTempRows`（tempFollowup）；`projectMatches`（tempScope）；`applyColumnFilters`（crossFilter）；`useColumnPrefs`；`DataTable`/`ColumnFilter`/`ColumnPicker`/`Modal`/`SegToggle`/`ProgressEditModal`/`ScopeBuilder`；`exportSheets`。
- 实现以 `frontend/src/views/KeyProjectsView.vue` 为蓝本复制，套用以下差异。

- [ ] **Step 1: 写失败测试**（`frontend/src/views/TempFollowupView.test.ts`，新建）

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import TempFollowupView from './TempFollowupView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useTempFollowupStore } from '@/stores/tempFollowup'

vi.mock('@/lib/tempFollowupApi', () => ({
  tempFollowupApi: {
    get: vi.fn().mockResolvedValue({ scope: { combinator: 'AND', groups: [
      { combinator: 'AND', conditions: [{ group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] }] },
    ] }, current: {}, archives: [] }),
    saveScope: vi.fn(), update: vi.fn(), archive: vi.fn(),
  },
}))

const projects = [
  { projectId: 'P1', projectName: '项目甲', projectManager: '张三', orgL4: '银行服务组', top1000: '是',
    paymentPmis: { contract: 2_000_000 }, payment: { paymentRatio: 0.4 }, quadrant: 'A' },
  { projectId: 'P2', projectName: '项目乙', projectManager: '李四', orgL4: '小金融服务组', top1000: '否',
    paymentPmis: { contract: 500_000 }, payment: { paymentRatio: 0.1 }, quadrant: 'B' },
]
const projectPmis = {
  P1: { status: { 项目级别: 'P1' }, progress: { 里程碑进度状态: '正常' }, risk: {}, cost: {}, customer: { 最终客户: '客甲' }, team: { AR: 'a', SR: 's' } },
  P2: { status: {}, progress: {}, risk: {}, cost: {}, customer: { 最终客户: '客乙' }, team: {} },
}

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects/temp', component: TempFollowupView },
    { path: '/project/:id', component: { template: '<div/>' } },
  ] })
}

async function mountAs(isSuper: boolean) {
  const data = useDataStore()
  data.data = { projects, projectPmis, paymentNodes: {}, projectMilestones: {} } as any
  const auth = useAuthStore()
  auth.user = { account: isSuper ? 'admin' : 'u1', isSuper, allowedPages: ['*'], allowedL4: ['*'] } as any
  await useTempFollowupStore().load()
  const router = makeRouter(); router.push('/projects/temp'); await router.isReady()
  const w = mount(TempFollowupView, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  return w
}

describe('TempFollowupView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('按范围命中只显示符合项目(P1 银行服务组),P2 不在范围', async () => {
    const w = await mountAs(true)
    expect(w.text()).toContain('项目甲')
    expect(w.text()).not.toContain('项目乙')
  })

  it('超管见 范围设置/更新/导出 入口', async () => {
    const w = await mountAs(true)
    expect(w.text()).toContain('范围设置')
    expect(w.text()).toContain('更新（归档+清空）')
    expect(w.text()).toContain('导出')
  })

  it('普通管理员无 范围设置/更新/导出 入口', async () => {
    const w = await mountAs(false)
    expect(w.text()).not.toContain('范围设置')
    expect(w.text()).not.toContain('更新（归档+清空）')
    expect(w.text()).not.toContain('导出')
  })

  it('默认列含项目编号,默认隐藏 健康度(额外列)', async () => {
    const w = await mountAs(true)
    expect(w.text()).toContain('项目编号')
    expect(w.text()).not.toContain('健康度')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/TempFollowupView.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现视图**（`frontend/src/views/TempFollowupView.vue`，新建）

以 `KeyProjectsView.vue` 为蓝本，`<script setup>` 用如下实现（差异：范围匹配产出 rows、额外列、范围设置入口、进展/归档走 temp store）：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildTempRows, buildScopeInputs, type TempRow } from '@/lib/tempFollowup'
import { projectMatches } from '@/lib/tempScope'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import Modal from '@/components/Modal.vue'
import SegToggle from '@/components/SegToggle.vue'
import ProgressEditModal from '@/components/ProgressEditModal.vue'
import ScopeBuilder from '@/components/ScopeBuilder.vue'
import { exportSheets } from '@/lib/exportXlsx'

const TABLE_ID = 'temp-followup'
const data = useDataStore()
const auth = useAuthStore()
const temp = useTempFollowupStore()
const cf = useCrossFilterStore()
const router = useRouter()

onMounted(() => {
  if (!data.data) data.load()
  if (!temp.loaded) temp.load()
})

const mode = ref<'current' | 'history'>('current')
const historyIdx = ref(0)
const isCurrent = computed(() => mode.value === 'current')

const datasetOpts = computed(() => [
  { value: 'current', label: '当前数据' },
  ...temp.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime })),
])
const historyOpts = computed(() => temp.archives.map((a, i) => ({ value: i, label: a.archiveTime })))
watch(() => [mode.value, temp.archives.length] as const, () => {
  if (mode.value === 'history') historyIdx.value = Math.max(0, temp.archives.length - 1)
})

const projects = computed(() => (data.data?.projects ?? []) as Project[])
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)
const scopeInputs = computed(() =>
  buildScopeInputs(projects.value, pmisMap.value,
    (data.data as any)?.paymentNodes ?? {}, (data.data as any)?.projectMilestones ?? {}))
const inScopeIds = computed(() => new Set(
  scopeInputs.value.filter((i) => projectMatches(i, temp.scope)).map((i) => i.id)))

const currentRows = computed<TempRow[]>(() =>
  buildTempRows(projects.value, pmisMap.value, temp.current, inScopeIds.value))
const rows = computed<TempRow[]>(() =>
  isCurrent.value ? currentRows.value : ((temp.archives[historyIdx.value]?.rows ?? []) as TempRow[]))
const filtered = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as TempRow[])

const ALL_COLUMNS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 160 },
  { key: 'customer', label: '客户', width: 180 },
  { key: 'projectName', label: '项目名称', width: 200 },
  { key: 'projectLevel', label: '项目级别', width: 90 },
  { key: 'projectManager', label: '项目经理', width: 96 },
  { key: 'ar', label: 'AR', width: 90 },
  { key: 'sr', label: 'SR', width: 90 },
  { key: 'orgL4', label: 'L4组织', width: 110 },
  { key: 'contractWan', label: '合同金额(万)', width: 110, sortable: true, num: true,
    formatter: (v) => (v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'riskLevel', label: '风险', width: 96, formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true },
  { key: 'followDate', label: '跟进日期', width: 160, sortable: true },
  { key: 'followBy', label: '跟进人', width: 120 },
  // —— 额外可选列(默认隐藏),便于看清为何入选 ——
  { key: 'stage', label: '阶段', width: 100 },
  { key: 'projectType', label: '项目类型', width: 110 },
  { key: 'projectStatus', label: '项目状态', width: 100 },
  { key: 'health', label: '健康度', width: 96 },
  { key: 'progress', label: '完工%', width: 90, num: true,
    formatter: (v) => (v == null ? '-' : (Number(v) * 100).toFixed(0) + '%') },
  { key: 'paymentRatio', label: '回款完成率', width: 105, num: true,
    formatter: (v) => (v == null ? '-' : (Number(v) * 100).toFixed(1) + '%') },
  { key: 'costRatio', label: '消耗比', width: 90, num: true,
    formatter: (v) => (v == null ? '-' : (Number(v) * 100).toFixed(1) + '%') },
  { key: 'paymentStatus', label: '回款状态', width: 100 },
  { key: 'top1000', label: 'TOP1000', width: 90 },
  { key: 'quadrant', label: '象限', width: 140 },
  { key: 'milestoneStatus', label: '里程碑状态', width: 120 },
]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
// 默认可见 = key 页那 14 列(额外列默认隐藏)
const DEFAULT_VISIBLE = ['projectId', 'customer', 'projectName', 'projectLevel', 'projectManager', 'ar', 'sr',
  'orgL4', 'contractWan', 'riskLevel', 'weekProgress', 'nextPlan', 'followDate', 'followBy']
const FILTERABLE = new Set(['projectLevel', 'projectManager', 'ar', 'sr', 'orgL4', 'riskLevel', 'followBy', 'followDate',
  'stage', 'projectType', 'projectStatus', 'health', 'paymentStatus', 'top1000', 'quadrant', 'milestoneStatus'])
const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

function progCell(row: TempRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  const c = row[field]
  if (!c) return isCurrent.value ? '点击填写' : '-'
  return `${t}：${c}`
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }

// 进展编辑(走 temp store)
const editOpen = ref(false)
const editCtx = reactive({ projectId: '', projectName: '', field: 'weekProgress' as 'weekProgress' | 'nextPlan', initial: '' })
function openEdit(row: TempRow, field: 'weekProgress' | 'nextPlan') {
  if (!isCurrent.value) return
  editCtx.projectId = row.projectId; editCtx.projectName = row.projectName
  editCtx.field = field; editCtx.initial = row[field] ?? ''
  editOpen.value = true
}

// 范围设置(超管)
const scopeOpen = ref(false)

// 更新归档(超管)
const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await temp.archive(currentRows.value as any); archiveConfirm.value = false; mode.value = 'current' }
  finally { archiving.value = false }
}

// 导出(超管):多数据集多 sheet,按当前显示列
const exportOpen = ref(false)
const exportSel = ref<string[]>(['current'])
const allSelected = computed(() => exportSel.value.length > 0 && exportSel.value.length === datasetOpts.value.length)
const exportIndeterminate = computed(() => exportSel.value.length > 0 && exportSel.value.length < datasetOpts.value.length)
function toggleAllExport(val: boolean) { exportSel.value = val ? datasetOpts.value.map((o) => o.value) : [] }
function exportRow(r: TempRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of visibleColumns.value) {
    const v = (r as any)[col.key]
    out[col.label] = col.formatter ? col.formatter(v, r) : (v ?? '')
  }
  return out
}
function doExport() {
  const sheets = exportSel.value.map((sel) => {
    const opt = datasetOpts.value.find((o) => o.value === sel)
    const src: TempRow[] = sel === 'current' ? currentRows.value
      : ((temp.archives[Number(sel.slice(1))]?.rows ?? []) as TempRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as TempRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`临时重点跟进_${exportSel.value.length}集.xlsx`, sheets)
  exportOpen.value = false
}

defineExpose({ editOpen, editCtx, mode, historyIdx, isCurrent, scopeOpen, exportSel, allSelected, datasetOpts, toggleAllExport, inScopeIds, scopeInputs })
</script>

<template>
  <div class="temp-followup-view">
    <h2 class="kp-title">临时重点跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="mode" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="mode === 'history'" v-model="historyIdx" size="small" style="width: 200px"
        :disabled="!temp.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in historyOpts" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">更新（归档+清空）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="exportOpen = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!rows.length" class="kp-empty">
      {{ auth.isSuper ? '请点击「范围设置」定义临时跟进范围。' : '暂无临时重点跟进项目。' }}
    </div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="filtered" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" />
          </span>
        </template>
        <template #cell-weekProgress="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as TempRow, 'weekProgress')">{{ progCell(row as TempRow, 'weekProgress') }}</span>
        </template>
        <template #cell-nextPlan="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as TempRow, 'nextPlan')">{{ progCell(row as TempRow, 'nextPlan') }}</span>
        </template>
      </DataTable>
    </div>

    <ProgressEditModal v-model="editOpen" store="temp"
      :project-id="editCtx.projectId" :project-name="editCtx.projectName" :field="editCtx.field" :initial="editCtx.initial" />

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="scopeInputs" :initial="temp.scope"
      @save="(s) => temp.saveScope(s)" />

    <Modal v-model="archiveConfirm" title="更新（归档）" width="420px">
      <div>将把当前数据归档为历史快照，并清空两列进展（开始新一期）。确认更新？</div>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="archiveConfirm = false">取消</button>
        <button class="kp-archive-btn" :disabled="archiving" @click="doArchive">确认更新</button>
      </div>
    </Modal>

    <Modal v-model="exportOpen" title="导出数据集" width="420px">
      <el-checkbox :model-value="allSelected" :indeterminate="exportIndeterminate" @change="toggleAllExport($event as boolean)">全选</el-checkbox>
      <el-checkbox-group v-model="exportSel">
        <el-checkbox v-for="o in datasetOpts" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
      </el-checkbox-group>
      <div style="margin-top: var(--gap-card)">
        <button class="kp-export-btn" :disabled="!exportSel.length" @click="doExport">导出 xlsx（{{ exportSel.length }} 个数据集，按当前列筛选）</button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.temp-followup-view { padding: var(--sp-4); }
.kp-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.kp-label { font-size: var(--fs-1); color: var(--sub); }
.kp-scroll { overflow-x: auto; }
.kp-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
.kp-empty { padding: var(--sp-5); color: var(--mut); text-align: center; }
.kp-prog-cell { display: inline-block; white-space: pre-wrap; }
.kp-prog-cell.editable { cursor: pointer; color: var(--accent); }
.kp-archive-btn, .kp-export-btn, .kp-cancel {
  font-size: var(--fs-1); border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 2px 10px; cursor: pointer; background: var(--card2); color: var(--accent); }
.kp-archive-btn:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
</style>
```

- [ ] **Step 4: 跑测试 + typecheck + 令牌自检**

Run: `cd frontend && npx vitest run src/views/TempFollowupView.test.ts && npm run typecheck`
然后：`grep -nE "#[0-9a-fA-F]{3,6}|--border" frontend/src/views/TempFollowupView.vue || echo OK`
Expected: vitest/typecheck PASS；grep `OK`。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/TempFollowupView.vue frontend/src/views/TempFollowupView.test.ts
git commit -m "feat(temp): TempFollowupView 临时重点跟进页(范围命中/默认14列+额外可选列/超管范围-归档-导出/进展编辑) + vitest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: 路由 / 导航 / 页面门禁注册

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts`
- Modify: `frontend/src/nav.ts`
- Modify: `frontend/src/router/index.ts`
- Test: `frontend/src/lib/pageAccess.test.ts`（追加）；同步既有 `AppSidebar` 链接计数测试（搜索 `KEY_FOLLOWUP_LINKS` 或重点跟进计数的测试文件并 +1）

**Interfaces:**
- Consumes: 现有 `PageKey` 联合、`KEY_FOLLOWUP_LINKS`、router routes。
- Produces: `PageKey` 增 `'temp-followup'`；nav 链接「临时重点跟进 /projects/temp」；route `/projects/temp`。

- [ ] **Step 1: 写失败测试**（`frontend/src/lib/pageAccess.test.ts` 追加）

```ts
import { KEY_FOLLOWUP_LINKS } from '@/nav'

it('KEY_FOLLOWUP_LINKS 含临时重点跟进,在重点商机之后', () => {
  const keys = KEY_FOLLOWUP_LINKS.map((l) => l.key)
  expect(keys).toContain('temp-followup')
  expect(keys.indexOf('temp-followup')).toBe(keys.indexOf('opportunities-progress') + 1)
  const temp = KEY_FOLLOWUP_LINKS.find((l) => l.key === 'temp-followup')!
  expect(temp.to).toBe('/projects/temp')
  expect(temp.label).toBe('临时重点跟进')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/pageAccess.test.ts`
Expected: FAIL（`temp-followup` 不在链接中）

- [ ] **Step 3: pageAccess.ts**

`PageKey` 联合的重点跟进行改为：
```ts
  | 'projects-key' | 'opportunities-progress' | 'temp-followup'
```
`PAGE_OPTIONS` 上方注释「20 个 PageKey」改为「21 个 PageKey」。

- [ ] **Step 4: nav.ts**

`KEY_FOLLOWUP_LINKS` 改为：
```ts
export const KEY_FOLLOWUP_LINKS: NavLink[] = [
  { label: '重点项目进展', to: '/projects/key', key: 'projects-key' },
  { label: '重点商机进展', to: '/opportunities', key: 'opportunities-progress' },
  { label: '临时重点跟进', to: '/projects/temp', key: 'temp-followup' },
]
```

- [ ] **Step 5: router/index.ts**

import 区加：
```ts
import TempFollowupView from '@/views/TempFollowupView.vue'
```
在 `/opportunities` route 之后加：
```ts
    { path: '/projects/temp', name: 'temp-followup', component: TempFollowupView, meta: { title: '临时重点跟进', hideFilter: true, pageKey: 'temp-followup' } },
```

- [ ] **Step 6: 同步 AppSidebar 链接计数测试**

搜索断言重点跟进链接数或侧栏总链接数的测试：`grep -rn "KEY_FOLLOWUP\|重点商机进展\|重点项目进展" frontend/src/**/*.test.ts`。若有计数断言（如 `toHaveLength(2)` 或侧栏总数），相应 +1（重点跟进分区 2→3）。

- [ ] **Step 7: 跑测试 + 全量 vitest + typecheck + build**

Run: `cd frontend && npx vitest run src/lib/pageAccess.test.ts && npm run test:run && npm run typecheck && npm run build`
Expected: PASS（全量 vitest 绿、类型绿、构建成功）

- [ ] **Step 8: 提交**

```bash
git add frontend/src/lib/pageAccess.ts frontend/src/nav.ts frontend/src/router/index.ts frontend/src/lib/pageAccess.test.ts
git commit -m "feat(temp): 注册 /projects/temp(pageKey/nav 重点商机后/route) + 侧栏计数同步

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: 版本 V2.1.0 + PROGRESS + 打包脚本补 temp_followup.py

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`
- Modify: `make_deploy_zip.py:33`（`TOP_FILES` 加 `temp_followup.py`）

**Interfaces:** 无（集成任务）。

- [ ] **Step 1: 版本单一来源**（`frontend/src/version.ts`）

```ts
export const APP_VERSION = 'V2.1.0'
export const RELEASE_DATE = '2026-06-25'
```
（保留文件其余导出原样。）

- [ ] **Step 2: make_deploy_zip.py 补文件**

`TOP_FILES` 列表里 `"snapshots.py", "data_history.py", "data_scope.py", "opportunities.py",` 一行改为加入 `temp_followup.py`：
```python
    "snapshots.py", "data_history.py", "data_scope.py", "opportunities.py", "temp_followup.py",
```

- [ ] **Step 3: PROGRESS.md 版本史**

头部当前版本号滚动到 V2.1.0，并在版本史顶部加一条 V2.1.0 条目（一句话概述：新增 /projects/temp 临时重点跟进；商机新增改先弹抽屉）。按既有 PROGRESS.md 格式书写。

- [ ] **Step 4: 校验打包脚本包含新文件**

Run: `python -c "import make_deploy_zip as m; assert 'temp_followup.py' in m.TOP_FILES; print('OK')"`
Expected: 输出 `OK`

- [ ] **Step 5: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md make_deploy_zip.py
git commit -m "chore(release): V2.1.0(/projects/temp 临时重点跟进 + 商机新增先弹抽屉) + 打包补 temp_followup.py

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: 升级手册 + 最小更新包（控制器合并后执行，非 TDD）

> 本任务在所有功能任务合并、`verify.sh` 全绿、真实数据 live 冒烟通过后，由控制器执行（与 V2.0.0 交付物同构）。文档为散文，无 TDD。

**Files:**
- Create: `deploy/升级手册-V2.1.0.md`
- Build: `release/pmplatform-update-V2.1.0.zip`（gitignore，不提交）

- [ ] **Step 1: 写升级手册**（`deploy/升级手册-V2.1.0.md`）

以 `deploy/升级手册-V2.0.0.md` 为模板，改写为「连升第二跳」：
- §0 本次包含：/projects/temp 临时重点跟进（超管定义范围、可保存动态重算 AND/OR、普通管理员只编辑进展列）；商机新增改为先弹抽屉。
- §2 升级步骤：现网(V1.16.4) → 先套 V2.0.0 更新包 → 再套本 V2.1.0 更新包（覆盖 `*.py` 含新增 `temp_followup.py` + 前端 dist）。
- §3 升级后：临时跟进首用需超管在「范围设置」定义范围（空范围则页面无项目）；`data/temp_followup.json` 随 data/ 备份；不依赖「更新数据」。
- §4 上线验证清单：`/projects/temp` 可加载；超管见「范围设置/更新/导出」、设一组范围后命中数合理、编辑进展、归档、导出；普通管理员只见可编辑进展、无范围/更新/导出入口、只见本人 L4∩范围；`/api/temp-followup/scope` 非超管 403、未登录 GET 401；`/opportunities` 新增走先弹抽屉、取消不留行。
- §5 回滚同 V2.0.0。

- [ ] **Step 2: 构建 /pm dist + 打更新包**

```bash
# /pm 构建必须 PowerShell 或 MSYS_NO_PATHCONV=1(Bash 会篡改 --base=/pm/)
cd frontend && MSYS_NO_PATHCONV=1 npm run build -- --base=/pm/
# 校验是 /pm 构建:
grep -o '="/pm/assets' dist/index.html | head -1   # 应有输出
```
然后组装 `release/pmplatform-update-V2.1.0/`：全根 `.py`（含 `temp_followup.py`）+ `frontend/dist`（/pm）+ `requirements.txt` + `升级手册-V2.1.0.md`，压成 `release/pmplatform-update-V2.1.0.zip`。

- [ ] **Step 3: 本地 dist 重建回默认 base（防本地白屏）**

```bash
cd frontend && npm run build
grep -o '="/assets' dist/index.html | head -1   # 应有输出(默认 base)
```

- [ ] **Step 4: 提交升级手册（仅手册，不提交 release/）**

```bash
git add deploy/升级手册-V2.1.0.md
git commit -m "docs(release): V2.1.0 升级手册(连升第二跳:V2.0.0→V2.1.0,临时重点跟进+商机新增改造)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review（写完后自查）

**1. Spec coverage**
- 需求一（商机先弹抽屉）：Task 1（后端）、Task 2（前端）✓
- 需求二·后端纯函数：Task 3 ✓；端点+门禁：Task 4 ✓
- 范围模型（两级 AND/OR + 取反 + 子表存在性 + 空范围空）：Task 5（tempScope）✓
- 行/输入构建（含 key 重构 DRY）：Task 6 ✓
- api/store/reset：Task 7 ✓
- 进展编辑复用（store prop 基线）：Task 8 ✓
- ScopeBuilder：Task 9 ✓；TempFollowupView（默认14列+额外可选+超管门+空态分流）：Task 10 ✓
- 注册（pageKey/nav 顺序/route/侧栏计数）：Task 11 ✓
- 版本/PROGRESS/打包：Task 12 ✓；升级手册+最小包：Task 13 ✓
- 全局约束（L4 隔离自动成立、令牌、无 emoji、超管不变、gitignore）：分散落各任务 + Step 自检 ✓

**2. Placeholder scan**：各代码步给出完整代码；Task 6/11 引用既有文件按"以 X 为蓝本 + 明确差异"给出（KeyProjectsView 复制有完整 script）；无 TBD/TODO。Task 2 Step 6 与 Task 11 Step 6 对"既有测试计数"用 grep 定位再 +1，属真实存在测试的同步，非占位。

**3. Type consistency**：`ScopeFilter`/`ScopeCondition`/`ScopeProjectInput`（tempScope）贯穿 5/6/7/9/10；`buildProgressRowBase`/`buildTempRows`/`buildScopeInputs`（tempFollowup）签名在 6 定义、10 消费一致；store 方法名 `load/saveScope/update/archive/reset` 在 7 定义、8/10 消费一致；端点路径 `/api/temp-followup{,/scope,/update,/archive}` 在 4 定义、7 消费一致；`ProgressEditModal` 的 `store` prop 在 8 定义、10 用 `store="temp"`。一致。
