# V2.3.1 实现计划：重点项目筛选口径 + 标签丢失修复 + 历史逐条删除 + 客户列售前取原项目

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 V2.3.1：①/projects/key 取数改 `P1 || (TOP1000 && 合同>100万)`；②修标签升级后丢失（reprocess 完成补刷前端标签 store + 后端防御）；③四个跟进页历史快照支持超管逐条删除（二次确认）；④key/temp/risk 客户列对售前服务类项目改取原项目客户。

**Architecture:** 后端加 3 个 followup 模块各一纯函数 + progress 同款 + 4 个 archive-delete 端点（超管）；其余为前端纯函数/视图改动。不触碰数据管线。

**Tech Stack:** Python 标准库 HTTP（server.py）+ pydantic；Vue3 + Vite + TS + Pinia + Element Plus；pytest + vitest。

## Global Constraints

- 版本单一来源 `frontend/src/version.ts`：本期 `APP_VERSION='V2.3.1'`、`RELEASE_DATE='2026-06-29'`（仅 Task 8 改）。
- **不改 `preprocess_data.py` / `schema.py` / 数据管线** → 升级不需点「更新数据」、无新依赖、无新页/新 pageKey。
- 删除类端点超管专属（入 `_SUPER_ONLY_PATHS`）；前端删除按钮 `v-if="auth.isSuper"` + 二次确认 Modal。
- 不使用 emoji；设计令牌只引用 `theme.css` 变量；表格数字列 `num:true`。
- 售前客户口径（同后端 `projects.py:237`）：售前服务类项目（`p.isPresale`）取**原项目**（`relatedClosedId`）最终客户；无原项目/原项目无客户 → '-'，**不回退本项目**。
- 每任务 TDD：先写失败测试 → 跑红 → 最小实现 → 跑绿 → 提交。完成定义＝该任务测试绿。全部完成后 `bash verify.sh` 全绿。
- **提交只 `git add` 本任务源/测试文件**，不得 `git add -A`，不得提交 `.superpowers/` 下任何文件。提交信息结尾加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

## 后端已确认事实（实现者直接用）

- server.py 模块别名：`import temp_followup as _temp`、`import opportunity_followup as _oppf`、`import risk_followup as _riskfu`（注意 `import opportunities as _opp` 是另一个商机模块，**别混用**）。
- 持久化读写（模块级函数）：`_load_progress`/`_save_progress`、`_load_temp_followup`/`_save_temp_followup`、`_load_opportunity_followup`/`_save_opportunity_followup`、`_load_risk_followup`/`_save_risk_followup`。
- 纯函数（模块级）：`_progress_apply_archive`（server.py）；`_temp.apply_archive`/`_oppf.apply_archive`/`_riskfu.apply_archive`（各模块）。
- handler 是请求类的**方法**（4 空格缩进，形如 `def handle_xxx(self):`），通过 `self.handle_xxx()` 在 `do_POST` 分发；`_load_*`/`_*_apply_*` 是模块级。新增时按相邻代码缩进放置。
- `_SUPER_ONLY_PATHS` 已含四套的 `/scope`、`/archive`；`_authz_gate` 对其中路径调 `_require_super()`。
- `_error_payload(code,msg)`、`ERR_PARSE/ERR_VALIDATION/ERR_INTERNAL`、`self._read_json_body()`、`self._send_json(status,payload)`、`self._json_response(data)` 均可用。

## 文件结构

**修改（无新建文件）：**
- 后端：`temp_followup.py`、`opportunity_followup.py`、`risk_followup.py`（各加 `apply_archive_delete`）、`server.py`（progress 纯函数 + 4 handler + 4 super-path + 4 路由）。
- 后端测试：`tests/test_temp_followup.py`?/新建、`tests/test_risk_followup.py`、`tests/test_opportunity_followup.py`?、`tests/test_project_tags*`（防御）——存在则追加、不存在则新建。
- 前端 lib：`keyProjects.ts`（isKeyProject + buildProgressRowBase）、`tempFollowup.ts`（buildTempRows 调用方）、`riskRows.ts`（客户）。
- 前端 api：`projectProgressApi.ts`、`tempFollowupApi.ts`、`opportunityFollowupApi.ts`、`riskFollowupApi.ts`（各加 deleteArchive）。
- 前端 store：`projectProgress.ts`、`tempFollowup.ts`、`opportunityFollowup.ts`、`riskFollowup.ts`（各加 deleteArchive）。
- 前端视图：`KeyProjectsView.vue`、`TempFollowupView.vue`、`OpportunityFollowupView.vue`、`RiskFollowupView.vue`（删除 UI；KeyProjectsView 还改空态文案；RiskFollowupView 加客户列）。
- 前端测试：`keyProjects.test.ts`、`riskRows.test.ts`、`RiskFollowupView.test.ts`、对应视图测试。
- `frontend/src/version.ts`、`PROGRESS.md`。

**任务依赖**：Task 3（后端端点）→ Task 4（api/store）→ Task 5（视图）。其余独立。建议序 1→8。

---

### Task 1: /projects/key 筛选口径调整

**Files:** Modify `frontend/src/lib/keyProjects.ts`、`frontend/src/views/KeyProjectsView.vue`；Test `frontend/src/lib/keyProjects.test.ts`

**Interfaces:** Produces `isKeyProject(p, pmis)` 新口径（签名不变）。

- [ ] **Step 1: 写失败测试** —— `keyProjects.test.ts`（若已存在则追加该 describe）：

```ts
import { describe, it, expect } from 'vitest'
import { isKeyProject } from './keyProjects'

const mk = (top1000: string, contract: number | null, level: string) => ({
  p: { top1000, paymentPmis: { contract } } as any,
  pmis: { status: { 项目级别: level } } as any,
})

describe('isKeyProject 新口径: P1 || (TOP1000 && 合同>100万)', () => {
  it('P1 且非 TOP1000 → 入选(旧口径不入选)', () => {
    const { p, pmis } = mk('否', 50_000, 'P1'); expect(isKeyProject(p, pmis)).toBe(true)
  })
  it('TOP1000 且合同>100万且非 P1 → 入选', () => {
    const { p, pmis } = mk('是', 2_000_000, 'P2'); expect(isKeyProject(p, pmis)).toBe(true)
  })
  it('TOP1000 但合同<=100万且非 P1 → 不入选', () => {
    const { p, pmis } = mk('是', 1_000_000, 'P2'); expect(isKeyProject(p, pmis)).toBe(false)
  })
  it('非 TOP1000、非 P1、合同>100万 → 不入选', () => {
    const { p, pmis } = mk('否', 5_000_000, 'P3'); expect(isKeyProject(p, pmis)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/lib/keyProjects.test.ts`。预期第 1 条 FAIL（旧口径要求 TOP1000）。

- [ ] **Step 3: 实现** —— `keyProjects.ts` 的 `isKeyProject`（第 23-28 行）改为：

```ts
/** 重点项目:级别 P1 或(TOP1000 大客户 且 合同>100万元)。合同已由 paymentPmis.contract 上游回退原项目(售前)。 */
export function isKeyProject(p: Project, pmis: ProjectPmis | undefined): boolean {
  const contract = Number(p.paymentPmis?.contract ?? 0)
  const level = v((pmis?.status as Record<string, unknown> | undefined)?.['项目级别'])
  return level === 'P1' || (p.top1000 === '是' && contract > 1_000_000)
}
```

并改 `KeyProjectsView.vue` 空态文案（现 `暂无重点项目（取数：TOP1000 大客户 且 合同&gt;100万元 或 级别 P1）。`）为：
```
暂无重点项目（取数：级别 P1 或 TOP1000 大客户且合同&gt;100万元）。
```

- [ ] **Step 4: 跑绿** —— `cd frontend && npx vitest run src/lib/keyProjects.test.ts`。预期 PASS。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/lib/keyProjects.ts frontend/src/lib/keyProjects.test.ts frontend/src/views/KeyProjectsView.vue
git commit -m "feat(key): 重点项目取数改 P1 或(TOP1000且合同>100万)"
```

---

### Task 2: 标签丢失修复（reprocess 补刷 + 后端防御）

**Files:** Modify `frontend/src/views/DataView.vue`；Test `tests/test_project_tags_defensive.py`（新建）

**Interfaces:** 无对外接口变化。

- [ ] **Step 1: 写后端防御失败测试** —— `tests/test_project_tags_defensive.py`：

```python
import json, importlib
import server


def test_load_project_tags_returns_existing_file_unchanged(tmp_path, monkeypatch):
    """已存在且合法的 project_tags.json 须原样返回,不被重新播种覆盖(reprocess 后标签不丢)。"""
    f = tmp_path / "project_tags.json"
    data = {"version": 1, "tags": [{"name": "BH项目", "disabled": False}],
            "assignments": {"WSGF-SF-001": ["BH项目"]}}
    f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "PROJECT_TAGS_FILE", str(f))
    out = server._load_project_tags()
    assert out["assignments"] == {"WSGF-SF-001": ["BH项目"]}
    assert any(t["name"] == "BH项目" for t in out["tags"])
    # 复读仍一致(未被覆盖)
    again = json.loads(f.read_text(encoding="utf-8"))
    assert again["assignments"] == {"WSGF-SF-001": ["BH项目"]}
```

- [ ] **Step 2: 跑红/跑绿确认后端无缺陷** —— `python -m pytest tests/test_project_tags_defensive.py -q`。预期 **PASS**（后端本就保留本地文件——本测试是回归护栏，锁定 reprocess 不会破坏它）。若意外 FAIL，说明 `PROJECT_TAGS_FILE` 常量名或 `_load_project_tags` 签名与预期不符，先核对 server.py 再调整测试到真实接口（不要改后端实现去迁就）。

- [ ] **Step 3: 前端修复** —— `DataView.vue` 第 56-57 行的 reprocess onDone（`projectTags` 已在第 17 行实例化）：
```ts
const { progress: repProgress, message: repMessage, running: repRunning, start: startReprocess } =
  useReprocess({ onDone: () => { data.reload(); loadFileStatus(); projectTags.load() } })
```
（仅在原 `loadFileStatus()` 后补 `projectTags.load()`，与同文件第 118/125 行人工导入/回滚处一致。）

- [ ] **Step 4: typecheck** —— `cd frontend && npm run typecheck`。预期无新增错误。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/views/DataView.vue tests/test_project_tags_defensive.py
git commit -m "fix(tags): 更新数据完成后补刷 projectTags store(修升级后标签看似丢失)+后端保留护栏"
```

---

### Task 3: 后端历史逐条删除（四套端点）

**Files:** Modify `temp_followup.py`、`opportunity_followup.py`、`risk_followup.py`、`server.py`；Test `tests/test_archive_delete.py`（新建）

**Interfaces:** Produces（前端 Task 4 依赖）：4 端点 `POST /api/{progress,temp-followup,opportunity-followup,risk-followup}/archive/delete {archiveIdx}` → `{success, archives}`（超管；越界 idx → 400）。纯函数 `apply_archive_delete(store, idx) -> bool`（三模块）+ `_progress_apply_archive_delete(store, idx) -> bool`（server.py）。

- [ ] **Step 1: 写纯函数失败测试** —— `tests/test_archive_delete.py`：

```python
import temp_followup, opportunity_followup, risk_followup
import server


def _store_with_3():
    return {"version": 1, "current": {}, "archives": [
        {"archiveTime": "2026-06-01 10:00", "rows": [{"a": 1}]},
        {"archiveTime": "2026-06-02 10:00", "rows": [{"a": 2}]},
        {"archiveTime": "2026-06-03 10:00", "rows": [{"a": 3}]},
    ]}


def test_apply_archive_delete_removes_index_each_module():
    for mod in (temp_followup, opportunity_followup, risk_followup):
        s = _store_with_3()
        assert mod.apply_archive_delete(s, 1) is True
        assert [a["archiveTime"] for a in s["archives"]] == ["2026-06-01 10:00", "2026-06-03 10:00"]


def test_apply_archive_delete_rejects_out_of_range():
    for mod in (temp_followup, opportunity_followup, risk_followup):
        s = _store_with_3()
        assert mod.apply_archive_delete(s, 5) is False
        assert mod.apply_archive_delete(s, -1) is False
        assert mod.apply_archive_delete(s, "x") is False
        assert len(s["archives"]) == 3  # 未被改动


def test_progress_apply_archive_delete():
    s = _store_with_3()
    assert server._progress_apply_archive_delete(s, 0) is True
    assert [a["archiveTime"] for a in s["archives"]] == ["2026-06-02 10:00", "2026-06-03 10:00"]
    assert server._progress_apply_archive_delete(s, 9) is False and len(s["archives"]) == 2
```

- [ ] **Step 2: 跑红** —— `python -m pytest tests/test_archive_delete.py -q`。预期 FAIL（`apply_archive_delete` 不存在）。

- [ ] **Step 3: 实现三模块纯函数** —— 在 `temp_followup.py`、`opportunity_followup.py`、`risk_followup.py` 各自 `apply_archive` 之后追加（逐字相同）：

```python
def apply_archive_delete(store, idx) -> bool:
    """删除第 idx 条历史快照;越界/非法 idx → False(不动 store)。"""
    archives = store.setdefault('archives', [])
    if not isinstance(idx, int) or idx < 0 or idx >= len(archives):
        return False
    del archives[idx]
    return True
```

在 `server.py` 的 `_progress_apply_archive` 之后追加模块级纯函数：
```python
def _progress_apply_archive_delete(store, idx) -> bool:
    """纯函数:删除第 idx 条历史快照;越界/非法 idx → False(不动 store)。"""
    archives = store.setdefault('archives', [])
    if not isinstance(idx, int) or idx < 0 or idx >= len(archives):
        return False
    del archives[idx]
    return True
```

- [ ] **Step 4: 跑绿（纯函数）** —— `python -m pytest tests/test_archive_delete.py -q`。预期 PASS。

- [ ] **Step 5: 加 4 个 handler（请求类方法，缩进对齐相邻 handle_xxx_archive）** —— 在 `server.py` 对应 archive handler 旁各加一个。progress：
```python
    def handle_progress_archive_delete(self):
        """POST /api/progress/archive/delete {archiveIdx} — 删指定历史快照。超管专属。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        idx = data.get('archiveIdx')
        if not isinstance(idx, int) or idx < 0:
            self._send_json(400, _error_payload(ERR_VALIDATION, "archiveIdx 须为非负整数")); return
        try:
            store = _load_progress()
            if not _progress_apply_archive_delete(store, idx):
                self._send_json(400, _error_payload(ERR_VALIDATION, "archiveIdx 超出范围")); return
            _save_progress(store)
            self._json_response({"success": True, "archives": store.get("archives", [])})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"删除快照失败: {e}"))
```
temp（用 `_load_temp_followup`/`_save_temp_followup`/`_temp.apply_archive_delete`）：
```python
    def handle_temp_followup_archive_delete(self):
        """POST /api/temp-followup/archive/delete {archiveIdx} — 删指定历史快照。超管专属。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        idx = data.get('archiveIdx')
        if not isinstance(idx, int) or idx < 0:
            self._send_json(400, _error_payload(ERR_VALIDATION, "archiveIdx 须为非负整数")); return
        try:
            store = _load_temp_followup()
            if not _temp.apply_archive_delete(store, idx):
                self._send_json(400, _error_payload(ERR_VALIDATION, "archiveIdx 超出范围")); return
            _save_temp_followup(store)
            self._json_response({"success": True, "archives": store.get("archives", [])})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"删除快照失败: {e}"))
```
opportunity（`_load_opportunity_followup`/`_save_opportunity_followup`/`_oppf.apply_archive_delete`）与 risk（`_load_risk_followup`/`_save_risk_followup`/`_riskfu.apply_archive_delete`）同构，仅换 load/save 函数与模块别名、URL 文案。

- [ ] **Step 6: 注册超管路径 + 路由** —— `_SUPER_ONLY_PATHS` 集合内追加四条：
```python
    '/api/progress/archive/delete', '/api/temp-followup/archive/delete',
    '/api/opportunity-followup/archive/delete', '/api/risk-followup/archive/delete',
```
`do_POST` 在对应 archive 分发旁各加一条：
```python
elif parsed.path == '/api/progress/archive/delete':
    self.handle_progress_archive_delete()
elif parsed.path == '/api/temp-followup/archive/delete':
    self.handle_temp_followup_archive_delete()
elif parsed.path == '/api/opportunity-followup/archive/delete':
    self.handle_opportunity_followup_archive_delete()
elif parsed.path == '/api/risk-followup/archive/delete':
    self.handle_risk_followup_archive_delete()
```

- [ ] **Step 7: 验证** —— `python -m py_compile server.py temp_followup.py opportunity_followup.py risk_followup.py && python -m pytest tests/test_archive_delete.py -q`。预期编译通过 + 测试 PASS。

- [ ] **Step 8: 提交** ——
```bash
git add temp_followup.py opportunity_followup.py risk_followup.py server.py tests/test_archive_delete.py
git commit -m "feat(history): 四套跟进历史快照逐条删除端点(超管,按index,越界拒绝)"
```

---

### Task 4: 前端 api + store deleteArchive（四套）

**Files:** Modify `frontend/src/lib/{projectProgressApi,tempFollowupApi,opportunityFollowupApi,riskFollowupApi}.ts`、`frontend/src/stores/{projectProgress,tempFollowup,opportunityFollowup,riskFollowup}.ts`

**Interfaces:** Consumes Task 3 端点。Produces 四个 store 各 `deleteArchive(idx: number): Promise<void>`（删后更新 `archives`）。

- [ ] **Step 1: 加 api deleteArchive** —— 四个 api 对象各加一项（复用各自 ArchiveResp 类型）：
  - `projectProgressApi.ts`：`deleteArchive: (archiveIdx: number) => api.post<ArchiveResp>('/api/progress/archive/delete', { archiveIdx }),`
  - `tempFollowupApi.ts`：`deleteArchive: (archiveIdx: number) => api.post<TempArchiveResp>('/api/temp-followup/archive/delete', { archiveIdx }),`
  - `opportunityFollowupApi.ts`：`deleteArchive: (archiveIdx: number) => api.post<OppFollowupArchiveResp>('/api/opportunity-followup/archive/delete', { archiveIdx }),`
  - `riskFollowupApi.ts`：`deleteArchive: (archiveIdx: number) => api.post<RiskArchiveResp>('/api/risk-followup/archive/delete', { archiveIdx }),`

- [ ] **Step 2: 加 store deleteArchive** —— 四个 store 各加并导出。`projectProgress.ts`：
```ts
async function deleteArchive(idx: number) {
  const r = await projectProgressApi.deleteArchive(idx)
  archives.value = r.archives ?? []
}
```
在 `return { ... }` 里加 `deleteArchive`。`tempFollowup.ts`/`opportunityFollowup.ts`/`riskFollowup.ts` 同构（换 `tempFollowupApi`/`opportunityFollowupApi`/`riskFollowupApi`），同样加进 return。

- [ ] **Step 3: typecheck** —— `cd frontend && npm run typecheck`。预期无新增错误。

- [ ] **Step 4: 提交** ——
```bash
git add frontend/src/lib/projectProgressApi.ts frontend/src/lib/tempFollowupApi.ts frontend/src/lib/opportunityFollowupApi.ts frontend/src/lib/riskFollowupApi.ts frontend/src/stores/projectProgress.ts frontend/src/stores/tempFollowup.ts frontend/src/stores/opportunityFollowup.ts frontend/src/stores/riskFollowup.ts
git commit -m "feat(history): 四套 followup api/store 加 deleteArchive(idx)"
```

---

### Task 5: 前端四视图历史删除 UI（超管 + 二次确认）

**Files:** Modify `frontend/src/views/{KeyProjectsView,TempFollowupView,OpportunityFollowupView,RiskFollowupView}.vue`；Test `frontend/src/views/RiskFollowupView.test.ts`

**Interfaces:** Consumes Task 4 各 store `deleteArchive`。各视图 store 变量名：KeyProjectsView=`progress`、TempFollowupView=`temp`、OpportunityFollowupView=`oppf`、RiskFollowupView=`risk`。四视图均已 import `auth`、`Modal`、有 `mode`/`historyIdx`/`historyOpts`。

- [ ] **Step 1: 写失败测试（以 risk 页为代表）** —— `RiskFollowupView.test.ts` 追加：

```ts
it('历史模式:超管见「删除此历史」按钮,普通管理员不见', async () => {
  seed(true)  // 复用本文件既有 seed(isSuper)
  const risk = useRiskFollowupStore()
  risk.archives = [{ archiveTime: '2026-06-01 10:00', rows: [] }] as any
  const w = mount(RiskFollowupView)
  ;(w.vm as any).mode = 'history'
  await w.vm.$nextTick()
  expect(w.text()).toContain('删除此历史')
})
it('普通管理员历史模式不见删除按钮', async () => {
  seed(false)
  const risk = useRiskFollowupStore()
  risk.archives = [{ archiveTime: '2026-06-01 10:00', rows: [] }] as any
  const w = mount(RiskFollowupView)
  ;(w.vm as any).mode = 'history'
  await w.vm.$nextTick()
  expect(w.text()).not.toContain('删除此历史')
})
```
> 若该文件 `seed` 不接受 isSuper 或 mount 细节不同，按文件现有写法对齐（断言文案不变）。

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts`。预期新用例 FAIL。

- [ ] **Step 3: 四视图统一加删除 UI** —— 每个视图 `<script setup>` 加（store 变量名按上表替换，下用 `STORE` 占位说明，**实际写具体名**）：
```ts
const delConfirm = ref(false)
const deleting = ref(false)
async function doDeleteArchive() {
  deleting.value = true
  try {
    await STORE.deleteArchive(historyIdx.value)
    delConfirm.value = false
    if (!STORE.archives.length) mode.value = 'current'
    else historyIdx.value = Math.min(historyIdx.value, STORE.archives.length - 1)
  } finally { deleting.value = false }
}
```
模板：历史 `el-select` 之后加按钮（`STORE` 换具体名）：
```vue
<button v-if="auth.isSuper && mode === 'history' && STORE.archives.length" class="kp-archive-btn"
  @click="delConfirm = true">删除此历史</button>
```
并加二次确认 Modal（放在该视图既有归档确认 Modal 旁）：
```vue
<Modal v-model="delConfirm" title="删除历史快照" width="420px">
  <div>将永久删除该条历史快照（{{ historyOpts[historyIdx]?.label }}），不可恢复。确认删除？</div>
  <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
    <button class="kp-cancel" @click="delConfirm = false">取消</button>
    <button class="kp-archive-btn" :disabled="deleting" @click="doDeleteArchive">确认删除</button>
  </div>
</Modal>
```
四视图对应替换：KeyProjectsView→`progress`、TempFollowupView→`temp`、OpportunityFollowupView→`oppf`、RiskFollowupView→`risk`。（`ref` 已在各视图 import；`Modal` 已 import。）

- [ ] **Step 4: 跑绿 + typecheck** —— `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts && npm run typecheck`。预期 PASS + 无新增类型错误。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/views/KeyProjectsView.vue frontend/src/views/TempFollowupView.vue frontend/src/views/OpportunityFollowupView.vue frontend/src/views/RiskFollowupView.vue frontend/src/views/RiskFollowupView.test.ts
git commit -m "feat(history): 四页历史快照超管逐条删除(二次确认+删后clamp historyIdx)"
```

---

### Task 6: 客户列售前取原项目（key + temp）

**Files:** Modify `frontend/src/lib/keyProjects.ts`、`frontend/src/lib/tempFollowup.ts`；Test `frontend/src/lib/keyProjects.test.ts`

**Interfaces:** Produces `buildProgressRowBase(p, pmis, rec, closedPmis?)`（加可选第 4 参）；`buildKeyProjectRows`/`buildTempRows` 调用方传 `pmisMap[p.relatedClosedId ?? '']`。

- [ ] **Step 1: 写失败测试** —— `keyProjects.test.ts` 追加：

```ts
import { buildProgressRowBase } from './keyProjects'

describe('buildProgressRowBase 客户列售前取原项目', () => {
  const own = { customer: { 最终客户: '本项目客户' } } as any
  const closed = { customer: { 最终客户: '原项目客户' } } as any
  it('售前服务类 → 取原项目客户', () => {
    const p = { projectId: 'A', isPresale: true, relatedClosedId: 'OLD', paymentPmis: { contract: 0 } } as any
    expect(buildProgressRowBase(p, own, {}, closed).customer).toBe('原项目客户')
  })
  it('售前但原项目无客户 → "-"(不回退本项目)', () => {
    const p = { projectId: 'A', isPresale: true, relatedClosedId: 'OLD', paymentPmis: { contract: 0 } } as any
    expect(buildProgressRowBase(p, own, {}, {} as any).customer).toBe('-')
  })
  it('非售前 → 取本项目客户', () => {
    const p = { projectId: 'A', isPresale: false, paymentPmis: { contract: 0 } } as any
    expect(buildProgressRowBase(p, own, {}, closed).customer).toBe('本项目客户')
  })
})
```

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/lib/keyProjects.test.ts`。预期售前用例 FAIL（现取本项目客户）。

- [ ] **Step 3: 实现** —— `keyProjects.ts buildProgressRowBase` 加 `closedPmis?` 参并改 customer：
```ts
export function buildProgressRowBase(
  p: Project,
  pmis: ProjectPmis | undefined,
  rec: ProgressRecord,
  closedPmis?: ProjectPmis,
): KeyProjectRow {
  const m = (pmis ?? {}) as Record<string, any>
  const st = m.status ?? {}, risk = m.risk ?? {}, cust = m.customer ?? {}, team = m.team ?? {}
  const ccust = ((closedPmis ?? {}) as Record<string, any>).customer ?? {}
  const contract = p.paymentPmis?.contract
  return {
    projectId: p.projectId,
    customer: p.isPresale ? v(ccust.最终客户, '-') : v(cust.最终客户, '-'),
    projectName: p.projectName || p.projectId,
    // …其余字段保持不变（projectLevel/projectManager/ar/sr/orgL4/contractWan/riskLevel/openRisks/
    //   weekProgress…/nextPlan…/followDate/followBy 原样）…
  }
}
```
`buildKeyProjectRows` 末行调用改：
```ts
.map((p) => buildProgressRowBase(p, pmisMap[p.projectId], current[p.projectId] ?? {}, pmisMap[p.relatedClosedId ?? '']))
```
`tempFollowup.ts` 第 24 行调用改：
```ts
const base = buildProgressRowBase(p, pmis, current[p.projectId] ?? {}, pmisMap[p.relatedClosedId ?? ''])
```

- [ ] **Step 4: 跑绿 + typecheck** —— `cd frontend && npx vitest run src/lib/keyProjects.test.ts && npm run typecheck`。预期 PASS + 无新增类型错误。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/lib/keyProjects.ts frontend/src/lib/tempFollowup.ts frontend/src/lib/keyProjects.test.ts
git commit -m "feat(customer): key/temp 客户列对售前服务类取原项目最终客户"
```

---

### Task 7: /risk 新增客户列（售前取原项目，默认隐藏）

**Files:** Modify `frontend/src/lib/riskRows.ts`、`frontend/src/views/RiskFollowupView.vue`；Test `frontend/src/lib/riskRows.test.ts`、`frontend/src/views/RiskFollowupView.test.ts`

**Interfaces:** Consumes `buildRiskRows` 既有签名（pmisMap 在手）。Produces 风险行多 `客户` 键；`RiskFollowupView` PROJECT_COLS 多客户列（不入默认可见）。

- [ ] **Step 1: 写失败测试** —— `riskRows.test.ts` 追加（复用本文件既有 projects/pmis fixture 风格）：

```ts
it('风险行客户列:售前取原项目、非售前取本项目', () => {
  const projects = [
    { projectId: 'A', projectName: '甲', isPresale: true, relatedClosedId: 'OLD', paymentPmis: { contract: 0 } },
    { projectId: 'B', projectName: '乙', isPresale: false, paymentPmis: { contract: 0 } },
  ] as any
  const pmis = {
    A: { status: {}, customer: { 最终客户: 'A本项目' }, riskRecords: [{ 风险编码: 'X1', 风险状态: '未关闭' }] },
    OLD: { customer: { 最终客户: 'A原项目' } },
    B: { status: {}, customer: { 最终客户: 'B本项目' }, riskRecords: [{ 风险编码: 'X2', 风险状态: '未关闭' }] },
  } as any
  const rows = buildRiskRows(projects, pmis, {})
  expect(rows.find((r) => r.riskKey === 'A::X1')!['客户']).toBe('A原项目')
  expect(rows.find((r) => r.riskKey === 'B::X2')!['客户']).toBe('B本项目')
})
```
并在 `RiskFollowupView.test.ts` 追加：
```ts
it('客户列存在于 ALL_COLUMNS 但不在默认可见 16 列', () => {
  seed()
  const w = mount(RiskFollowupView)
  const vm = w.vm as any
  expect(vm.allKeys).toContain('客户')                       // 可选列存在
  expect(vm.prefs.visibleKeys.value).not.toContain('客户')   // 默认隐藏
})
```
> 若 `allKeys`/`prefs` 未 expose，在该视图 `defineExpose` 里补 `allKeys, prefs`（仅测试用）。

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/lib/riskRows.test.ts src/views/RiskFollowupView.test.ts`。预期 FAIL（无客户键/列）。

- [ ] **Step 3: 实现 riskRows 客户** —— `riskRows.ts buildRiskRows` 循环内，在 `out.push({...})` 前算原/本项目客户，并在 push 对象里加 `'客户'`：
```ts
    const status = m.status ?? {}
    const ownCust = (m.customer ?? {}) as Record<string, any>
    const closedCust = ((pmisMap[p.relatedClosedId ?? ''] ?? {}) as Record<string, any>).customer ?? {}
    for (const rr of recs) {
      // …既有 riskCode/riskKey/follow…
      out.push({
        ...rr,
        projectId: p.projectId,
        '项目编号': p.projectId,
        '项目名称': p.projectName ?? '',
        '客户': p.isPresale ? s(closedCust['最终客户']) : s(ownCust['最终客户']),
        '项目金额': typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,
        // …其余项目列与跟进字段保持不变…
      })
    }
```
（`ownCust`/`closedCust` 在 `for (const rr ...)` 外、`for (const p ...)` 内算一次即可。）

`RiskFollowupView.vue` 的 `PROJECT_COLS`（项目名称后）加客户列：
```ts
  { key: '项目名称', label: '项目名称', width: 220, sortable: true },
  { key: '客户', label: '客户', width: 180, sortable: true },
  { key: '项目金额', label: '项目金额(万)', width: 110, sortable: true, num: true,
    formatter: (v) => (v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
```
`FILTERABLE` 集合加 `'客户'`。`DEFAULT_VISIBLE` **不动**（客户默认隐藏）。`riskRows.ts` 的 `RISK_SCOPE_CATALOG` 加（项目名称后）：
```ts
  { key: '客户', label: '客户', kind: 'enum' as FieldKind },
```
（`NON_RISK_KEYS` 派生自 `PROJECT_COLS.map(c=>c.key)`，自动含 '客户'，不会重复进 riskCols。）

- [ ] **Step 4: 跑绿 + typecheck** —— `cd frontend && npx vitest run src/lib/riskRows.test.ts src/views/RiskFollowupView.test.ts && npm run typecheck`。预期 PASS + 无新增类型错误。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/lib/riskRows.ts frontend/src/lib/riskRows.test.ts frontend/src/views/RiskFollowupView.vue frontend/src/views/RiskFollowupView.test.ts
git commit -m "feat(customer): /risk 新增客户列(售前取原项目,默认隐藏,可筛选/可入范围)"
```

---

### Task 8: 版本号 + PROGRESS.md + 全量验证

**Files:** Modify `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 版本号** —— `frontend/src/version.ts`：
```ts
export const APP_VERSION = 'V2.3.1'
export const RELEASE_DATE = '2026-06-29'
```

- [ ] **Step 2: PROGRESS.md** —— 同步头部「当前版本/最近更新/上一版本(V2.3.0)」为 V2.3.1；版本史顶部加 V2.3.1 摘要：①/projects/key 取数改 P1 或(TOP1000且合同>100万)②标签升级后看似丢失=reprocess 完成漏刷前端 store,已补 projectTags.load()(后端数据未丢)③四个跟进页历史可超管逐条删(二次确认)④key/temp/risk 客户列对售前服务类取原项目最终客户(risk 新增客户列默认隐藏)。注明无 preprocess/schema 改动→升级不需更新数据/无新依赖/无新页。风格同现有条目，不使用 emoji。

- [ ] **Step 3: 全量验证** —— `bash verify.sh`。预期全绿：py 编译 + ruff + pytest + 前端 typecheck + vitest + build。

- [ ] **Step 4: 提交** ——
```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.3.1 版本号+PROGRESS(筛选口径+标签修复+历史逐条删+客户列售前取原项目)"
```

---

## 交付（实现全绿后，按用户发话决定是否打包）

1. PowerShell 出 `/pm` 构建：`cd frontend; npx vite build --base=/pm/`，校验 `dist/index.html` 含 `="/pm/assets`。
2. `python make_update_zip.py` → `release/pmplatform-update-V2.3.1.zip`（含改动 `*.py` + `/pm` dist；不含 data/input/tests/docs）。
3. **重建默认 base dist**：`cd frontend; npx vite build`，校验 `="/assets`。
4. 写 `deploy/升级手册-V2.3.1.md`：①标签修复 + 验证步骤（升级后加标签→更新数据→不刷新即在；若刷新仍丢另报）②四页历史超管逐条删③/risk 新增可选「客户」列④/projects/key 取数口径变化（P1 一律入选，重点项目进展列表可能变多）⑤无新依赖、不需点「更新数据」、无新页。
5. 走 superpowers:finishing-a-development-branch。

## Self-Review 摘要

- **Spec 覆盖**：Item1=Task1；Item2=Task2；Item3=Task3(后端)/4(api·store)/5(视图)；Item4=Task6(key·temp)/7(risk)；版本=Task8。全覆盖。
- **类型一致**：`apply_archive_delete(store,idx)->bool`(三模块) + `_progress_apply_archive_delete`(server) 与 4 handler 一致；4 api `deleteArchive(archiveIdx)` ↔ 4 store `deleteArchive(idx)` ↔ 视图 `STORE.deleteArchive(historyIdx)` 一致；`buildProgressRowBase` 第 4 参 `closedPmis?` ↔ 两调用方传 `pmisMap[relatedClosedId??'']` 一致；客户口径（售前取原项目不回退）在 key/temp/risk 三处一致。
- **占位**：视图 Task 5 用 `STORE` 占位仅作说明，已列四视图具体替换名（progress/temp/oppf/risk），实现时写具体名。
