# 重点项目进展页 + 「重点跟进」分区 Implementation Plan (SP-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「重点跟进」导航分区 + `/projects/key`「重点项目进展」页：表格展示重点项目集（TOP1000 &（合同>100万元 or P1）），两列「本周工作进展/后续工作计划」可编辑持久化（记时间+账号）+ 派生跟进日期/跟进人 + 选列/筛选/排序/导出/跳详情 + 更新归档(超管) + 历史快照查看 + 多数据集导出(超管)。

**Architecture:** 后端新增 `data/project_progress.json`（current 可编 + archives 只读快照）+ 3 端点（GET 读 / update 编辑盖章 / archive 归档清空，archive 超管专属）；mutation 逻辑抽为纯函数便于 TDD。前端新增 lib/keyProjects(过滤+拼行)、store/api(projectProgress)、KeyProjectsView(复用 /projects 表格全套)、ProgressEditModal，接 nav/路由/门禁/侧边栏(沿用 SP-1 折叠)。

**Tech Stack:** Python 标准库 + http.server（后端）；Vue3+TS+Pinia+Element Plus+vitest（前端）；xlsx 导出。

## Global Constraints

> 每个任务隐含包含本节，值逐字照抄。

- **取数过滤** `isKeyProject(p, pmis)`：`p.top1000 === '是' && ((p.paymentPmis?.contract ?? 0) > 1000000 || v(pmis.status?.项目级别) === 'P1')`。合同单位**元**，阈值严格 `> 1_000_000`。售前合同已由 `paymentPmis.contract` 上游回退原项目，无需额外逻辑。
- **进展数据模型** `data/project_progress.json`：`{version:1, current:{<pid>:{weekProgress,weekProgressEditTime,weekProgressEditBy,nextPlan,nextPlanEditTime,nextPlanEditBy}}, archives:[{archiveTime, rows:[...]}]}`。字段名逐字。
- **可编辑字段** `field ∈ {'weekProgress','nextPlan'}`；盖章 `${field}EditTime`/`${field}EditBy`；时间格式 `%Y-%m-%d %H:%M:%S`。
- **派生**：`跟进日期 = max(weekProgressEditTime, nextProgressEditTime 中非空较大值)`；`跟进人 = [weekProgressEditBy, nextPlanEditBy] 去空去重，不同则 '、' 并列`。
- **权限**：编辑(`/api/progress/update`)=任意登录管理员；**归档(`/api/progress/archive`)=超管专属**（入 `_SUPER_ONLY_PATHS`，前端 `v-if="auth.isSuper"`）；**导出按钮=超管专属**（前端 `v-if="auth.isSuper"`，纯前端）。归档后**清空 current**（开始新一期）。
- **风险列口径** = 与 /projects 一致：`riskLevel = pmis.risk?.最高等级 || '无'`、`openRisks = Number(pmis.risk?.未关闭风险数 ?? 0)`，显示 `openRisks ? \`${riskLevel}(${openRisks})\` : riskLevel`。
- **接入**：nav「重点跟进」置 ANALYSIS 与 PAYMENT 间；路由 `/projects/key` pageKey `'projects-key'`；侧边栏分区 key `keyfollowup`（沿用 SP-1 折叠），`activeSectionKey` 加 `/projects/key→keyfollowup` 排 project 兜底前。
- **版本**：`frontend/src/version.ts` → `APP_VERSION='V1.20.0'`、`RELEASE_DATE='2026-06-24'`。
- 禁止 emoji；简体中文；commit message 末尾必须是 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`；spec/plan 文档写盘不 commit。

---

### Task 1: 后端进展持久化 + 编辑端点（GET/update）

**Files:**
- Modify: `server.py`（持久化常量/纯函数 + handler + 路由）
- Test: `tests/test_server_key_progress.py`（新建）

**Interfaces:**
- Produces: `server.PROGRESS_FILE`；`server._load_progress() -> dict`（缺/损坏→`{"version":1,"current":{},"archives":[]}`）；`server._save_progress(store)`；`server._progress_apply_update(store, project_id, field, content, account, now) -> dict`（field 非法 raise ValueError；返回该项目记录）；handler `handle_progress_get` / `handle_progress_update`；路由 `GET /api/progress`、`POST /api/progress/update`。

- [ ] **Step 1: 写失败测试**

新建 `tests/test_server_key_progress.py`：

```python
import json
import pytest
import server


def test_load_progress_missing_returns_default(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "PROGRESS_FILE", str(tmp_path / "none.json"))
    assert server._load_progress() == {"version": 1, "current": {}, "archives": []}


def test_load_progress_corrupt_returns_default(tmp_path, monkeypatch):
    f = tmp_path / "project_progress.json"
    f.write_text("{bad json", encoding="utf-8")
    monkeypatch.setattr(server, "PROGRESS_FILE", str(f))
    assert server._load_progress() == {"version": 1, "current": {}, "archives": []}


def test_save_load_roundtrip(tmp_path, monkeypatch):
    f = tmp_path / "project_progress.json"
    monkeypatch.setattr(server, "PROGRESS_FILE", str(f))
    store = {"version": 1, "current": {"P1": {"weekProgress": "x"}}, "archives": []}
    server._save_progress(store)
    assert server._load_progress()["current"]["P1"]["weekProgress"] == "x"


def test_apply_update_stamps_time_and_account():
    store = {"version": 1, "current": {}, "archives": []}
    rec = server._progress_apply_update(store, "P1", "weekProgress", "本周完成X", "wangxutong", "2026-06-24 10:30:00")
    assert rec["weekProgress"] == "本周完成X"
    assert rec["weekProgressEditTime"] == "2026-06-24 10:30:00"
    assert rec["weekProgressEditBy"] == "wangxutong"
    assert store["current"]["P1"]["weekProgress"] == "本周完成X"


def test_apply_update_second_field_keeps_first():
    store = {"version": 1, "current": {}, "archives": []}
    server._progress_apply_update(store, "P1", "weekProgress", "A", "u1", "2026-06-24 10:00:00")
    server._progress_apply_update(store, "P1", "nextPlan", "B", "u2", "2026-06-24 11:00:00")
    r = store["current"]["P1"]
    assert r["weekProgress"] == "A" and r["nextPlan"] == "B"
    assert r["weekProgressEditBy"] == "u1" and r["nextPlanEditBy"] == "u2"


def test_apply_update_invalid_field_raises():
    with pytest.raises(ValueError):
        server._progress_apply_update({"version": 1, "current": {}, "archives": []},
                                      "P1", "badField", "x", "u", "t")
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_key_progress.py -v`
Expected: FAIL（`AttributeError: module 'server' has no attribute '_load_progress'`）

- [ ] **Step 3: 实现持久化 + 纯函数**

`server.py`，在 `_save_project_tags`（约 :257）之后新增：

```python
# ── 重点项目进展(SP-2,本地 JSON store:current 可编 + archives 只读快照) ──
PROGRESS_FILE = os.path.join(BASE_DIR, 'data', 'project_progress.json')
PROGRESS_FIELDS = ('weekProgress', 'nextPlan')
_progress_lock = threading.Lock()


def _load_progress():
    """加载重点项目进展 store;缺文件/损坏 → 默认空 store(不抛)。"""
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
                store = json.load(f)
            if isinstance(store, dict):
                store.setdefault('version', 1)
                store.setdefault('current', {})
                store.setdefault('archives', [])
                return store
        except Exception:
            pass
    return {"version": 1, "current": {}, "archives": []}


def _save_progress(store):
    with _progress_lock:
        os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
            json.dump(store, f, ensure_ascii=False, indent=2)


def _progress_apply_update(store, project_id, field, content, account, now):
    """纯函数:把单字段编辑写入 store.current[project_id],盖章时间+账号。
    field 须 ∈ PROGRESS_FIELDS,否则 ValueError。返回该项目记录。"""
    if field not in PROGRESS_FIELDS:
        raise ValueError("invalid field: %s" % field)
    rec = store.setdefault('current', {}).setdefault(project_id, {})
    rec[field] = content
    rec[field + 'EditTime'] = now
    rec[field + 'EditBy'] = account
    return rec
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_server_key_progress.py -v`
Expected: PASS（6 passed）

- [ ] **Step 5: 实现 handler + 路由**

`server.py`，在 `handle_tags_save`（约 :834）之后新增 handler：

```python
    def handle_progress_get(self):
        """GET /api/progress — 返回重点项目进展 {current, archives}。"""
        try:
            store = _load_progress()
            self._json_response({"success": True, "current": store.get("current", {}),
                                 "archives": store.get("archives", [])})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"读取进展失败: {e}"))

    def handle_progress_update(self):
        """POST /api/progress/update {projectId, field, content} — 编辑单格,盖章时间+当前账号。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        pid = str(data.get('projectId') or '').strip()
        field = data.get('field')
        if not pid or field not in PROGRESS_FIELDS:
            self._send_json(400, _error_payload(ERR_VALIDATION, "projectId 必填、field 须为 weekProgress/nextPlan"))
            return
        account = auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))
        if not account:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        try:
            store = _load_progress()
            rec = _progress_apply_update(store, pid, field, str(data.get('content') or ''),
                                         account, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            _save_progress(store)
            self._json_response({"success": True, "record": rec})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"保存进展失败: {e}"))
```

`server.py` do_GET（约 :368，`elif parsed.path == '/api/tags'` 之后）加：

```python
        elif parsed.path == '/api/progress':
            self.handle_progress_get()
```

`server.py` do_POST（约 :451，`elif parsed.path == '/api/tags'` 之后）加：

```python
        elif parsed.path == '/api/progress/update':
            self.handle_progress_update()
```

- [ ] **Step 6: py_compile + ruff + 全量 pytest**

Run: `python -m py_compile server.py && python -m ruff check server.py && python -m pytest tests/test_server_key_progress.py -q`
Expected: 全绿

- [ ] **Step 7: Commit**

```bash
git add server.py tests/test_server_key_progress.py
git commit -m "feat(backend): 重点项目进展持久化 + GET/update 端点(编辑盖章时间+账号)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 后端归档端点（超管专属）

**Files:**
- Modify: `server.py`（`_progress_apply_archive` + handler + 路由 + `_SUPER_ONLY_PATHS`）
- Test: `tests/test_server_key_progress.py`（追加）

**Interfaces:**
- Consumes: `server._load_progress`/`_save_progress`（Task 1）。
- Produces: `server._progress_apply_archive(store, rows, now) -> None`（append archive + 清空 current）；handler `handle_progress_archive`；路由 `POST /api/progress/archive`；`'/api/progress/archive' ∈ server._SUPER_ONLY_PATHS`。

- [ ] **Step 1: 写失败测试**

`tests/test_server_key_progress.py` 追加：

```python
def test_apply_archive_appends_and_clears_current():
    store = {"version": 1, "current": {"P1": {"weekProgress": "A"}}, "archives": []}
    rows = [{"projectId": "P1", "weekProgress": "A", "followBy": "u1"}]
    server._progress_apply_archive(store, rows, "2026-06-24 18:00:00")
    assert len(store["archives"]) == 1
    assert store["archives"][0]["archiveTime"] == "2026-06-24 18:00:00"
    assert store["archives"][0]["rows"] == rows
    assert store["current"] == {}   # 归档后清空


def test_archive_endpoint_is_super_only():
    assert '/api/progress/archive' in server._SUPER_ONLY_PATHS
    # update/read 不在超管专属(任意登录可用)
    assert '/api/progress/update' not in server._SUPER_ONLY_PATHS
    assert '/api/progress' not in server._SUPER_ONLY_PATHS
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_key_progress.py::test_apply_archive_appends_and_clears_current tests/test_server_key_progress.py::test_archive_endpoint_is_super_only -v`
Expected: FAIL（`_progress_apply_archive` 不存在 / 路径不在集合）

- [ ] **Step 3: 实现归档纯函数 + handler + 超管化**

`server.py`，`_progress_apply_update` 之后新增：

```python
def _progress_apply_archive(store, rows, now):
    """纯函数:把当前已构建行冻结为历史快照(archiveTime=now),并清空 current(开始新一期)。"""
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
    store['current'] = {}
```

`server.py` `handle_progress_update` 之后新增 handler：

```python
    def handle_progress_archive(self):
        """POST /api/progress/archive {rows} — 冻结当前为历史快照并清空 current。超管专属(由 _authz_gate 拦)。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        rows = data.get('rows')
        if not isinstance(rows, list):
            self._send_json(400, _error_payload(ERR_VALIDATION, "rows 须为数组"))
            return
        try:
            store = _load_progress()
            _progress_apply_archive(store, rows, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            _save_progress(store)
            self._json_response({"success": True, "archives": store.get("archives", [])})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"归档失败: {e}"))
```

`server.py` `_SUPER_ONLY_PATHS`（:149-157）末尾加入 `'/api/progress/archive'`：

```python
    '/api/manual/import', '/api/manual/rollback',
    '/api/progress/archive',
})
```

`server.py` do_POST（`elif parsed.path == '/api/progress/update'` 之后）加：

```python
        elif parsed.path == '/api/progress/archive':
            self.handle_progress_archive()
```

- [ ] **Step 4: 跑测试确认通过 + 全量**

Run: `python -m pytest tests/test_server_key_progress.py -q && python -m py_compile server.py && python -m ruff check server.py`
Expected: 全绿（8 passed）

- [ ] **Step 5: Commit**

```bash
git add server.py tests/test_server_key_progress.py
git commit -m "feat(backend): 重点项目进展归档端点(超管专属,冻结快照+清空current)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: lib/keyProjects.ts（过滤 + 拼行 + 派生）

**Files:**
- Create: `frontend/src/lib/keyProjects.ts`
- Test: `frontend/src/lib/keyProjects.test.ts`（新建）

**Interfaces:**
- Produces: `isKeyProject(p, pmis)`；`KeyProjectRow`；`buildKeyProjectRows(projects, pmisMap, current)`；`followDate(rec)`；`followBy(rec)`；`ProgressRecord` 类型。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/lib/keyProjects.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import { isKeyProject, buildKeyProjectRows, followDate, followBy } from './keyProjects'

const proj = (over: Partial<Project> = {}): Project => ({
  projectId: 'P1', projectName: '甲', projectManager: '何平', orgL4: 'A组',
  isPresale: false, relatedClosedId: '', top1000: '是',
  paymentPmis: { contract: 2_000_000 } as any,
  payment: {} as any, deliveryCosts: [], health: {} as any, ...over,
} as Project)
const pmis = (over: Record<string, any> = {}): ProjectPmis => ({
  status: { 项目级别: 'P3' }, risk: { 最高等级: '中', 未关闭风险数: 2 },
  customer: { 最终客户: '某客户' }, team: { AR: 'AR张', SR: 'SR李' }, ...over,
} as unknown as ProjectPmis)

describe('isKeyProject', () => {
  it('top1000=是 且 合同>100万 → 入选', () => {
    expect(isKeyProject(proj({ top1000: '是', paymentPmis: { contract: 1_000_001 } as any }), pmis())).toBe(true)
  })
  it('top1000=是 且 合同<=100万 但级别P1 → 入选', () => {
    expect(isKeyProject(proj({ top1000: '是', paymentPmis: { contract: 500_000 } as any }), pmis({ status: { 项目级别: 'P1' } }))).toBe(true)
  })
  it('top1000=是 但 合同<=100万 且非P1 → 不入选', () => {
    expect(isKeyProject(proj({ top1000: '是', paymentPmis: { contract: 1_000_000 } as any }), pmis({ status: { 项目级别: 'P3' } }))).toBe(false)
  })
  it('top1000=否 即便合同大 → 不入选', () => {
    expect(isKeyProject(proj({ top1000: '否', paymentPmis: { contract: 9_000_000 } as any }), pmis())).toBe(false)
  })
})

describe('buildKeyProjectRows', () => {
  it('拼行:列字段 + 合并进展 + 风险显示', () => {
    const current = { P1: { weekProgress: '本周X', weekProgressEditTime: '2026-06-24 10:00:00', weekProgressEditBy: 'u1' } }
    const [r] = buildKeyProjectRows([proj()], { P1: pmis() }, current)
    expect(r.projectId).toBe('P1')
    expect(r.customer).toBe('某客户')
    expect(r.ar).toBe('AR张')
    expect(r.sr).toBe('SR李')
    expect(r.contractWan).toBe(200)
    expect(r.riskLevel).toBe('中')
    expect(r.openRisks).toBe(2)
    expect(r.weekProgress).toBe('本周X')
    expect(r.followDate).toBe('2026-06-24 10:00:00')
    expect(r.followBy).toBe('u1')
  })
  it('只保留重点项目', () => {
    const rows = buildKeyProjectRows([proj({ projectId: 'A', top1000: '是' }), proj({ projectId: 'B', top1000: '否' })],
      { A: pmis(), B: pmis() }, {})
    expect(rows.map((r) => r.projectId)).toEqual(['A'])
  })
})

describe('followDate / followBy', () => {
  it('跟进日期取两格较大非空', () => {
    expect(followDate({ weekProgressEditTime: '2026-06-24 10:00:00', nextPlanEditTime: '2026-06-25 09:00:00' })).toBe('2026-06-25 09:00:00')
    expect(followDate({ weekProgressEditTime: '2026-06-24 10:00:00' })).toBe('2026-06-24 10:00:00')
    expect(followDate({})).toBe('')
  })
  it('跟进人去重并列', () => {
    expect(followBy({ weekProgressEditBy: 'u1', nextPlanEditBy: 'u1' })).toBe('u1')
    expect(followBy({ weekProgressEditBy: 'u1', nextPlanEditBy: 'u2' })).toBe('u1、u2')
    expect(followBy({ weekProgressEditBy: 'u1' })).toBe('u1')
    expect(followBy({})).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/keyProjects.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 lib/keyProjects.ts**

新建 `frontend/src/lib/keyProjects.ts`：

```typescript
import type { Project, ProjectPmis } from '@/types/analysis'

const v = (raw: unknown, fallback = ''): string => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? fallback : s
}

export interface ProgressRecord {
  weekProgress?: string; weekProgressEditTime?: string; weekProgressEditBy?: string
  nextPlan?: string; nextPlanEditTime?: string; nextPlanEditBy?: string
}

export interface KeyProjectRow {
  projectId: string; customer: string; projectName: string; projectLevel: string
  projectManager: string; ar: string; sr: string; orgL4: string
  contractWan: number | null; riskLevel: string; openRisks: number
  weekProgress: string; weekProgressEditTime: string; weekProgressEditBy: string
  nextPlan: string; nextPlanEditTime: string; nextPlanEditBy: string
  followDate: string; followBy: string
}

/** 重点项目:TOP1000 大客户 且(合同>100万元 或 级别 P1)。合同已由 paymentPmis.contract 上游回退原项目(售前)。 */
export function isKeyProject(p: Project, pmis: ProjectPmis | undefined): boolean {
  if (p.top1000 !== '是') return false
  const contract = Number(p.paymentPmis?.contract ?? 0)
  const level = v((pmis?.status as Record<string, unknown> | undefined)?.['项目级别'])
  return contract > 1_000_000 || level === 'P1'
}

export function followDate(rec: ProgressRecord): string {
  const a = v(rec.weekProgressEditTime), b = v(rec.nextPlanEditTime)
  return a > b ? a : b
}
export function followBy(rec: ProgressRecord): string {
  const list = [v(rec.weekProgressEditBy), v(rec.nextPlanEditBy)].filter((x) => x)
  return [...new Set(list)].join('、')
}

export function buildKeyProjectRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, ProgressRecord>,
): KeyProjectRow[] {
  return projects
    .filter((p) => isKeyProject(p, pmisMap[p.projectId]))
    .map((p) => {
      const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
      const st = m.status ?? {}, risk = m.risk ?? {}, cust = m.customer ?? {}, team = m.team ?? {}
      const rec: ProgressRecord = current[p.projectId] ?? {}
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
    })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/keyProjects.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/keyProjects.ts frontend/src/lib/keyProjects.test.ts
git commit -m "feat(fe): lib/keyProjects 重点项目过滤+拼行+派生跟进日期/人" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 前端 api + store（projectProgress）

**Files:**
- Create: `frontend/src/lib/projectProgressApi.ts`、`frontend/src/stores/projectProgress.ts`
- Test: `frontend/src/stores/projectProgress.test.ts`（新建）

**Interfaces:**
- Consumes: `ProgressRecord`（Task 3）。
- Produces: `projectProgressApi.{getProgress, updateProgress, archiveProgress}`；`useProjectProgressStore()` 暴露 `current/archives/loaded`、`load()`、`update(projectId, field, content)`、`archive(rows)`；`Archive` 类型。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/stores/projectProgress.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectProgressStore } from './projectProgress'
import * as apiMod from '@/lib/projectProgressApi'

beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks() })

describe('projectProgress store', () => {
  it('load 拉取 current/archives', async () => {
    vi.spyOn(apiMod.projectProgressApi, 'getProgress').mockResolvedValue({
      success: true, current: { P1: { weekProgress: 'x' } }, archives: [{ archiveTime: 't', rows: [] }],
    })
    const s = useProjectProgressStore()
    await s.load()
    expect(s.current.P1.weekProgress).toBe('x')
    expect(s.archives).toHaveLength(1)
    expect(s.loaded).toBe(true)
  })
  it('update 调 api 并更新本地 current', async () => {
    vi.spyOn(apiMod.projectProgressApi, 'updateProgress').mockResolvedValue({
      success: true, record: { weekProgress: 'A', weekProgressEditTime: 't', weekProgressEditBy: 'u' },
    })
    const s = useProjectProgressStore()
    await s.update('P1', 'weekProgress', 'A')
    expect(s.current.P1.weekProgress).toBe('A')
    expect(s.current.P1.weekProgressEditBy).toBe('u')
  })
  it('archive 调 api、用返回 archives 刷新、清空 current', async () => {
    vi.spyOn(apiMod.projectProgressApi, 'archiveProgress').mockResolvedValue({
      success: true, archives: [{ archiveTime: 't1', rows: [{ projectId: 'P1' }] }],
    })
    const s = useProjectProgressStore()
    s.current = { P1: { weekProgress: 'A' } }
    await s.archive([{ projectId: 'P1' } as any])
    expect(s.archives).toHaveLength(1)
    expect(s.current).toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/projectProgress.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 api + store**

新建 `frontend/src/lib/projectProgressApi.ts`：

```typescript
import { api } from '@/api/client'
import type { ProgressRecord, KeyProjectRow } from './keyProjects'

export interface Archive { archiveTime: string; rows: Partial<KeyProjectRow>[] }
export interface ProgressResp { success?: boolean; current: Record<string, ProgressRecord>; archives: Archive[] }
export interface UpdateResp { success: boolean; record: ProgressRecord }
export interface ArchiveResp { success: boolean; archives: Archive[] }

export const projectProgressApi = {
  getProgress: () => api.get<ProgressResp>('/api/progress'),
  updateProgress: (projectId: string, field: 'weekProgress' | 'nextPlan', content: string) =>
    api.post<UpdateResp>('/api/progress/update', { projectId, field, content }),
  archiveProgress: (rows: Partial<KeyProjectRow>[]) =>
    api.post<ArchiveResp>('/api/progress/archive', { rows }),
}
```

新建 `frontend/src/stores/projectProgress.ts`：

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { projectProgressApi, type Archive } from '@/lib/projectProgressApi'
import type { ProgressRecord } from '@/lib/keyProjects'

export const useProjectProgressStore = defineStore('projectProgress', () => {
  const current = ref<Record<string, ProgressRecord>>({})
  const archives = ref<Archive[]>([])
  const loaded = ref(false)

  async function load() {
    const r = await projectProgressApi.getProgress()
    current.value = r.current ?? {}
    archives.value = r.archives ?? []
    loaded.value = true
  }
  async function update(projectId: string, field: 'weekProgress' | 'nextPlan', content: string) {
    const r = await projectProgressApi.updateProgress(projectId, field, content)
    current.value = { ...current.value, [projectId]: r.record }
  }
  async function archive(rows: Parameters<typeof projectProgressApi.archiveProgress>[0]) {
    const r = await projectProgressApi.archiveProgress(rows)
    archives.value = r.archives ?? []
    current.value = {}
  }
  return { current, archives, loaded, load, update, archive }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/stores/projectProgress.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/projectProgressApi.ts frontend/src/stores/projectProgress.ts frontend/src/stores/projectProgress.test.ts
git commit -m "feat(fe): projectProgress api+store(读/编辑/归档)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 导航接入（nav / 路由 / 门禁 / 侧边栏）

**Files:**
- Modify: `frontend/src/nav.ts`、`frontend/src/lib/pageAccess.ts`、`frontend/src/router/index.ts`、`frontend/src/layout/AppSidebar.vue`
- Test: `frontend/src/layout/AppSidebar.test.ts`、`frontend/src/router/index.test.ts`、`frontend/src/lib/pageAccess.test.ts`（按现有补断言）

**Interfaces:**
- Consumes: `KeyProjectsView`（Task 7 创建；本任务路由先引入，Task 7 前该组件须已存在——**本任务依赖 Task 7 的组件文件**，故执行顺序上 Task 5 在 Task 7 之后；若先做 Task 5，临时用占位组件，见 Step 3 注）。
- Produces: nav `KEY_FOLLOWUP_LINKS`；PageKey `'projects-key'`；路由 `/projects/key`；侧边栏「重点跟进」分区(key keyfollowup) + activeSectionKey。

> 执行顺序注:本任务引用 `KeyProjectsView.vue`。**请在 Task 7 完成后再做 Task 5**(组件已存在),以保证 typecheck/build 通过。

- [ ] **Step 1: nav.ts 加分区**

`frontend/src/nav.ts`，在 `ANALYSIS_LINKS`(:36) 与 `PAYMENT_LINKS`(:39) 之间插入：

```typescript
// 重点跟进(SP-2):重点项目进展页
export const KEY_FOLLOWUP_LINKS: NavLink[] = [
  { label: '重点项目进展', to: '/projects/key', key: 'projects-key' },
]
```

- [ ] **Step 2: pageAccess.ts 加 PageKey + PAGE_OPTIONS 纳入**

`frontend/src/lib/pageAccess.ts`，`PageKey` 联合类型(:1-5)的 `'data' | 'governance' | 'about'` 行前加 `'projects-key'`：

```typescript
  | 'payment' | 'payment-projects' | 'payment-nodes' | 'payment-plan' | 'payment-risk' | 'ledger'
  | 'projects-key'
  | 'data' | 'governance' | 'about'
```

`PAGE_OPTIONS`(:15-21) 的 import 与展开加入 `KEY_FOLLOWUP_LINKS`：

```typescript
import { PROJECT_LINKS, ANALYSIS_LINKS, KEY_FOLLOWUP_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'

export const PAGE_OPTIONS: { key: string; label: string }[] = [
  { key: '*', label: '全部页面' },
  ...[...PROJECT_LINKS, ...ANALYSIS_LINKS, ...KEY_FOLLOWUP_LINKS, ...PAYMENT_LINKS, ...TOOL_LINKS].map((l) => ({
    key: l.key,
    label: l.label,
  })),
]
```

- [ ] **Step 3: router 加路由**

`frontend/src/router/index.ts`，import 区(:27 后)加 `import KeyProjectsView from '@/views/KeyProjectsView.vue'`；在 `/insight/calendar`(:57) 之后、`/ledger`(:58) 之前加路由：

```typescript
    { path: '/projects/key', name: 'projects-key', component: KeyProjectsView, meta: { title: '重点项目进展', hideFilter: true, pageKey: 'projects-key' } },
```

- [ ] **Step 4: AppSidebar 加分区 + activeSectionKey**

`frontend/src/layout/AppSidebar.vue`：
- import(:5) 加 `KEY_FOLLOWUP_LINKS`：`import { PROJECT_LINKS, ANALYSIS_LINKS, KEY_FOLLOWUP_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'`
- script 加 `const keyFollowupLinks = computed(() => KEY_FOLLOWUP_LINKS.filter((l) => auth.canAccess(l.key)))`
- `activeSectionKey` computed 在 `if (p.startsWith('/insight')) return 'analysis'` 之前加：`if (p.startsWith('/projects/key')) return 'keyfollowup'`
- 模板:在 analysis 分区 `</div>`(收尾) 与 payment 分区 `<div v-if="paymentLinks.length"...>` 之间插入：

```html
      <div v-if="keyFollowupLinks.length" class="section" :class="{ collapsed: !expanded('keyfollowup') }">
        <button type="button" class="section-label" @click="onToggle('keyfollowup')">
          <span class="section-caret">{{ expanded('keyfollowup') ? '▾' : '▸' }}</span>重点跟进
        </button>
        <div v-show="expanded('keyfollowup')" class="section-links">
          <RouterLink v-for="link in keyFollowupLinks" :key="link.to" :to="link.to"
            class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        </div>
      </div>
```

- [ ] **Step 5: 改测试（AppSidebar nav-sub 12→13 + 新分区可见）**

`frontend/src/layout/AppSidebar.test.ts`，`renders 项目/项目分析/回款/工具 四段分组` 用例：把 `expect(wrapper.findAll('.nav-sub').length).toBe(12)` 改 `toBe(13)`，并加 `expect(text).toContain('重点项目进展')`。`router/index.test.ts` 加 `/projects/key` 解析到 `projects-key` 的断言（照该文件现有断言风格）。`pageAccess.test.ts`（若有 PAGE_OPTIONS 数量断言）同步 +1。

具体断言（AppSidebar.test.ts 的 `it('renders ...')` 内）：

```typescript
    expect(text).toContain('重点项目进展')   // 重点跟进分区
    // 项目分析(6) + 重点跟进(1) + 回款子域(6) 均为 .nav-sub = 13
    expect(wrapper.findAll('.nav-sub').length).toBe(13)
```

- [ ] **Step 6: 跑相关测试 + typecheck**

Run: `cd frontend && npx vitest run src/layout/AppSidebar.test.ts src/router/index.test.ts src/lib/pageAccess.test.ts && npm run typecheck`
Expected: PASS（KeyProjectsView 已存在故 typecheck 过）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/nav.ts frontend/src/lib/pageAccess.ts frontend/src/lib/pageAccess.test.ts frontend/src/router/index.ts frontend/src/router/index.test.ts frontend/src/layout/AppSidebar.vue frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(fe): 重点跟进 导航分区+路由/projects/key+门禁+侧边栏(沿用折叠)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: ProgressEditModal 编辑弹窗

**Files:**
- Create: `frontend/src/components/ProgressEditModal.vue`
- Test: `frontend/src/components/ProgressEditModal.test.ts`（新建）

**Interfaces:**
- Consumes: `useProjectProgressStore().update`（Task 4）、`Modal.vue`。
- Produces: `ProgressEditModal` props `{ modelValue:boolean, projectId:string, projectName:string, field:'weekProgress'|'nextPlan', initial:string }`，emit `update:modelValue`；保存调 store.update。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/components/ProgressEditModal.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProgressEditModal from './ProgressEditModal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'

beforeEach(() => setActivePinia(createPinia()))

function mountModal() {
  return mount(ProgressEditModal, {
    props: { modelValue: true, projectId: 'P1', projectName: '甲', field: 'weekProgress', initial: '旧内容' },
    global: { plugins: [ElementPlus], stubs: { Modal: { template: '<div><slot/></div>' } } },
  })
}

describe('ProgressEditModal', () => {
  it('预填 initial、标题含字段名', () => {
    const w = mountModal()
    expect(w.text()).toContain('本周工作进展')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('旧内容')
  })
  it('保存调 store.update 并关闭', async () => {
    const s = useProjectProgressStore()
    const spy = vi.spyOn(s, 'update').mockResolvedValue(undefined as any)
    const w = mountModal()
    await w.find('textarea').setValue('新内容')
    await w.find('.pem-save').trigger('click')
    expect(spy).toHaveBeenCalledWith('P1', 'weekProgress', '新内容')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/ProgressEditModal.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 ProgressEditModal.vue**

新建 `frontend/src/components/ProgressEditModal.vue`：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import Modal from './Modal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'

const props = defineProps<{
  modelValue: boolean; projectId: string; projectName: string
  field: 'weekProgress' | 'nextPlan'; initial: string
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const store = useProjectProgressStore()
const text = ref(props.initial)
const saving = ref(false)
watch(() => props.modelValue, (v) => { if (v) text.value = props.initial })

const FIELD_LABEL = { weekProgress: '本周工作进展', nextPlan: '后续工作计划' } as const

async function save() {
  saving.value = true
  try {
    await store.update(props.projectId, props.field, text.value)
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal :model-value="modelValue" :title="'编辑 ' + FIELD_LABEL[field]" width="480px"
    @update:model-value="emit('update:modelValue', $event)">
    <div class="pem-head">{{ projectName }} / 编号 {{ projectId }}</div>
    <el-input v-model="text" type="textarea" :rows="6" placeholder="输入内容..." />
    <div class="pem-actions">
      <button class="pem-cancel" @click="emit('update:modelValue', false)">取消</button>
      <button class="pem-save" :disabled="saving" @click="save">保存</button>
    </div>
  </Modal>
</template>

<style scoped>
.pem-head { font-size: var(--fs-1); color: var(--sub); margin-bottom: var(--sp-2); }
.pem-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-3); }
.pem-cancel, .pem-save { font-size: var(--fs-1); border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 4px 14px; cursor: pointer; background: var(--card2); color: var(--txt); }
.pem-save { background: var(--accent); color: #fff; border-color: var(--accent); }
.pem-save:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/ProgressEditModal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProgressEditModal.vue frontend/src/components/ProgressEditModal.test.ts
git commit -m "feat(fe): ProgressEditModal 进展编辑弹窗" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: KeyProjectsView 重点项目进展页（表格+编辑+数据集+更新+导出）

> 本任务须在 Task 3/4/6 之后（消费 keyProjects/store/ProgressEditModal）。Task 5 在本任务之后做（路由引用本组件）。

**Files:**
- Create: `frontend/src/views/KeyProjectsView.vue`
- Test: `frontend/src/views/KeyProjectsView.test.ts`（新建）

**Interfaces:**
- Consumes: `buildKeyProjectRows/KeyProjectRow`（Task 3）、`useProjectProgressStore`（Task 4）、`ProgressEditModal`（Task 6）、`useDataStore`、`useAuthStore`、`useColumnPrefs`、`useCrossFilterStore`、`applyColumnFilters`、`cfUniqueValues`、`DataTable`、`ColumnPicker`、`ColumnFilter`、`Modal`、`SegToggle`、`exportSheets`。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/views/KeyProjectsView.test.ts`：

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import KeyProjectsView from './KeyProjectsView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useProjectProgressStore } from '@/stores/projectProgress'
import * as ppApi from '@/lib/projectProgressApi'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(ppApi.projectProgressApi, 'getProgress').mockResolvedValue({ success: true, current: {}, archives: [] })
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects/key', component: KeyProjectsView },
    { path: '/project/:id', component: { template: '<div/>' } },
  ] })
})

function seed(isSuper = true) {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [], displayColumns: {}, followupRecords: {},
    projects: [
      { projectId: 'K1', projectName: '重点甲', projectManager: '何平', orgL4: 'A组', top1000: '是',
        paymentPmis: { contract: 2000000 }, payment: {}, health: {} },
      { projectId: 'N1', projectName: '非重点', projectManager: '李四', orgL4: 'B组', top1000: '否',
        paymentPmis: { contract: 9000000 }, payment: {}, health: {} },
    ],
    projectPmis: {
      K1: { status: { 项目级别: 'P3' }, risk: { 最高等级: '中', 未关闭风险数: 2 }, customer: { 最终客户: '某客户' }, team: { AR: 'AR张', SR: 'SR李' } },
    },
  } as any
  const a = useAuthStore()
  a.user = { account: 's', displayName: 's', isSuper, allowedPages: ['projects-key'], allowedL4: [] }
}

async function mountView() {
  await router.push('/projects/key'); await router.isReady()
  const w = mount(KeyProjectsView, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  return w
}

describe('KeyProjectsView', () => {
  it('只渲染重点项目(K1),非重点(N1)不显', async () => {
    seed(); const w = await mountView()
    expect(w.text()).toContain('重点甲')
    expect(w.text()).not.toContain('非重点')
    expect(w.text()).toContain('AR张')
    expect(w.text()).toContain('200')   // 合同 200 万
  })
  it('超管见更新/导出按钮', async () => {
    seed(true); const w = await mountView()
    expect(w.find('.kp-archive-btn').exists()).toBe(true)
    expect(w.find('.kp-export-btn').exists()).toBe(true)
  })
  it('普通管理员不见更新/导出按钮', async () => {
    seed(false); const w = await mountView()
    expect(w.find('.kp-archive-btn').exists()).toBe(false)
    expect(w.find('.kp-export-btn').exists()).toBe(false)
  })
  it('点进展单元格(当前数据)打开编辑弹窗', async () => {
    seed(); const w = await mountView()
    await w.find('.kp-prog-cell').trigger('click')
    expect((w.vm as any).editOpen).toBe(true)
  })
  it('点行跳项目详情', async () => {
    seed(); const push = vi.spyOn(router, 'push'); const w = await mountView()
    await w.find('.el-table__row').trigger('click')
    expect(push).toHaveBeenCalledWith('/project/K1')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/KeyProjectsView.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 KeyProjectsView.vue**

新建 `frontend/src/views/KeyProjectsView.vue`（完整）：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useProjectProgressStore } from '@/stores/projectProgress'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildKeyProjectRows, type KeyProjectRow } from '@/lib/keyProjects'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import Modal from '@/components/Modal.vue'
import SegToggle from '@/components/SegToggle.vue'
import ProgressEditModal from '@/components/ProgressEditModal.vue'
import { exportSheets } from '@/lib/exportXlsx'

const TABLE_ID = 'key-projects'
const data = useDataStore()
const auth = useAuthStore()
const progress = useProjectProgressStore()
const cf = useCrossFilterStore()
const router = useRouter()

onMounted(() => {
  if (!data.data) data.load()
  if (!progress.loaded) progress.load()
})

// 数据集选择:当前数据 | 历史快照
const dataset = ref('current')
const datasetOpts = computed(() => [
  { value: 'current', label: '当前数据' },
  ...progress.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime })),
])
const isCurrent = computed(() => dataset.value === 'current')

const currentRows = computed<KeyProjectRow[]>(() =>
  buildKeyProjectRows((data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>, progress.current))

const rows = computed<KeyProjectRow[]>(() => {
  if (isCurrent.value) return currentRows.value
  const i = Number(dataset.value.slice(1))
  return (progress.archives[i]?.rows ?? []) as KeyProjectRow[]
})
const filtered = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as KeyProjectRow[])

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
  { key: 'risk', label: '风险', width: 96, formatter: (_v, r) => (r.openRisks ? `${r.riskLevel}(${r.openRisks})` : r.riskLevel) },
  { key: 'weekProgress', label: '本周工作进展', width: 240 },
  { key: 'nextPlan', label: '后续工作计划', width: 240 },
  { key: 'followDate', label: '跟进日期', width: 160, sortable: true },
  { key: 'followBy', label: '跟进人', width: 120 },
]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ALL_KEYS
const FILTERABLE = new Set(['projectLevel', 'projectManager', 'ar', 'sr', 'orgL4', 'risk', 'followBy', 'followDate'])
const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
function onToggle(key: string) { if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key); prefs.toggle(key) }

function progCell(row: KeyProjectRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  const c = row[field]
  if (!c) return isCurrent.value ? '点击填写' : '-'
  return `${t}：${c}`
}

function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }

// 编辑
const editOpen = ref(false)
const editCtx = reactive({ projectId: '', projectName: '', field: 'weekProgress' as 'weekProgress' | 'nextPlan', initial: '' })
function openEdit(row: KeyProjectRow, field: 'weekProgress' | 'nextPlan') {
  if (!isCurrent.value) return
  editCtx.projectId = row.projectId; editCtx.projectName = row.projectName
  editCtx.field = field; editCtx.initial = row[field]
  editOpen.value = true
}

// 更新归档(超管)
const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await progress.archive(currentRows.value); archiveConfirm.value = false; dataset.value = 'current' }
  finally { archiving.value = false }
}

// 导出(超管):多选数据集 → 多 sheet
const exportOpen = ref(false)
const exportSel = ref<string[]>(['current'])
function doExport() {
  const sheets = exportSel.value.map((sel) => {
    const opt = datasetOpts.value.find((o) => o.value === sel)
    const src: KeyProjectRow[] = sel === 'current' ? currentRows.value
      : (progress.archives[Number(sel.slice(1))]?.rows ?? []) as KeyProjectRow[]
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as KeyProjectRow[]
    return { name: opt?.label ?? sel, rows: fr.map(exportRow) }
  })
  exportSheets(`重点项目进展_${exportSel.value.length}集.xlsx`, sheets)
  exportOpen.value = false
}
function exportRow(r: KeyProjectRow): Record<string, unknown> {
  return {
    项目编号: r.projectId, 客户: r.customer, 项目名称: r.projectName, 项目级别: r.projectLevel,
    项目经理: r.projectManager, AR: r.ar, SR: r.sr, L4组织: r.orgL4,
    '合同金额(万)': r.contractWan, 风险: r.openRisks ? `${r.riskLevel}(${r.openRisks})` : r.riskLevel,
    本周工作进展: r.weekProgress ? `${r.weekProgressEditTime}：${r.weekProgress}` : '',
    后续工作计划: r.nextPlan ? `${r.nextPlanEditTime}：${r.nextPlan}` : '',
    跟进日期: r.followDate, 跟进人: r.followBy,
  }
}
</script>

<template>
  <div class="key-projects-view">
    <h2 class="kp-title">重点项目进展</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="dataset" :options="datasetOpts" />
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">更新（归档+清空）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="exportOpen = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!rows.length" class="kp-empty">暂无重点项目（取数：TOP1000 大客户 且 合同&gt;100万元 或 级别 P1）。</div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="filtered" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" /></span>
        </template>
        <template #cell-weekProgress="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }" @click.stop="openEdit(row, 'weekProgress')">{{ progCell(row, 'weekProgress') }}</span>
        </template>
        <template #cell-nextPlan="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }" @click.stop="openEdit(row, 'nextPlan')">{{ progCell(row, 'nextPlan') }}</span>
        </template>
      </DataTable>
    </div>

    <ProgressEditModal v-model="editOpen" :project-id="editCtx.projectId" :project-name="editCtx.projectName"
      :field="editCtx.field" :initial="editCtx.initial" />

    <Modal v-model="archiveConfirm" title="更新（归档）" width="420px">
      <div>将把当前数据归档为历史快照，并清空两列进展（开始新一期）。确认更新？</div>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="archiveConfirm = false">取消</button>
        <button class="kp-archive-btn" :disabled="archiving" @click="doArchive">确认更新</button>
      </div>
    </Modal>

    <Modal v-model="exportOpen" title="导出数据集" width="420px">
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
.key-projects-view { padding: var(--sp-4); }
.kp-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.kp-label { font-size: var(--fs-1); color: var(--sub); }
.kp-scroll { overflow-x: auto; }
.kp-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
.kp-empty { padding: var(--sp-5); color: var(--mut); text-align: center; }
.kp-prog-cell { display: inline-block; white-space: pre-wrap; }
.kp-prog-cell.editable { cursor: pointer; color: var(--accent); }
.kp-archive-btn, .kp-export-btn, .kp-cancel { font-size: var(--fs-1); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: 2px 10px; cursor: pointer; background: var(--card2); color: var(--accent); }
.kp-archive-btn:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
</style>
```

> 注:`SegToggle` props=`{modelValue, options:[{value,label}]}`；`DataTable` 列 `num` 标记数字列、`formatter:(value,row)=>string`；`ColumnFilter` props=`{tableId,colKey,sourceRows}`；`crossFilter` store 有 `tableFilters/clearColumn/clearAll/hasFilters`；均见 ProjectsView.vue 现有用法，照搬。若某 prop 名不符，以现有组件定义为准。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/KeyProjectsView.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/KeyProjectsView.vue frontend/src/views/KeyProjectsView.test.ts
git commit -m "feat(fe): KeyProjectsView 重点项目进展页(表格/编辑/数据集/更新归档/导出)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 版本 V1.20.0 + PROGRESS.md + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 改版本**

`frontend/src/version.ts`：

```typescript
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.20.0'
export const RELEASE_DATE = '2026-06-24'
```

- [ ] **Step 2: 更新 PROGRESS.md**

`PROGRESS.md` 头部当前/上一版本滚动 + 版本史区追加（照既有格式）：

```markdown
- V1.20.0（2026-06-24）重点跟进分区 + 重点项目进展页（feat/key-projects-progress，SDD + verify 全绿）
  - 新增「重点跟进」导航分区(项目分析下、回款上) + /projects/key 页：表格(选列/筛选/排序/导出/跳详情)展示重点项目集(TOP1000 &(合同>100万元 or P1)≈21)；两列本周进展/后续计划可编辑持久化(记时间+账号,/api/progress)+派生跟进日期/人；更新归档(超管,冻结快照+清空)+历史快照查看+多数据集导出(超管)。售前合同取原项目(paymentPmis.contract 上游已回退)。进展数据独立持久化不进 analysis_data.json。
```

- [ ] **Step 3: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V1.20.0 重点跟进分区+重点项目进展页" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 执行顺序

Task 1 → 2 → 3 → 4 → **6 → 7 → 5** → 8。（Task 5 路由引用 KeyProjectsView，须在 Task 7 之后；Task 6 ProgressEditModal 被 Task 7 消费，须在 7 之前。）

## Self-Review

**1. Spec coverage：**
- 取数/字段口径(§2) → Task 3 ✅；后端持久化+端点(§3) → Task 1/2 ✅；nav/路由/门禁/侧边栏(§4) → Task 5 ✅；页面+编辑+数据集+更新+导出(§5) → Task 6/7 ✅；权限(§6,编辑任意登录/归档+导出超管) → Task 1(update 非超管)/2(archive 超管化)/7(按钮 v-if isSuper) ✅；边界(§7) → Task 1/2 缺文件降级 + Task 7 历史只读 ✅；测试(§8) → 各任务 TDD + Task 8 verify ✅；版本(§9) V1.20.0 → Task 8 ✅。

**2. Placeholder scan：** 无 TBD/TODO；每步含完整代码。✅

**3. Type consistency：**
- `ProgressRecord`/`KeyProjectRow`/`Archive` 字段名全程一致（weekProgress/weekProgressEditTime/weekProgressEditBy/nextPlan/...）。✅
- `field ∈ {'weekProgress','nextPlan'}` 后端 `PROGRESS_FIELDS` 与前端 union 一致。✅
- 端点路径 `/api/progress`、`/api/progress/update`、`/api/progress/archive` 后端路由/超管集/前端 api 一致。✅
- `isKeyProject`/`buildKeyProjectRows`/`followDate`/`followBy` Task3 定义、Task7 消费签名一致。✅
- 侧边栏 key `keyfollowup` + activeSectionKey 前缀 `/projects/key` 与 SP-1 折叠机制一致。✅
- 执行顺序注明（5 在 7 后、6 在 7 前），避免 typecheck 因组件缺失失败。✅
