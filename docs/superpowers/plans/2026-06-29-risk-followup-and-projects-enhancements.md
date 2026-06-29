# V2.3.0 实现计划：风险跟进新页 + 标签排除补全 + 孤儿原项目告警 + /projects 增强

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 V2.3.0：①首页/成本分析补「按标签排除」；②新增「风险跟进」页 `/risk`（以风险为核心、可编辑跟进三字段、归档留存）；③治理页新增「原项目数据缺失」告警；④`/projects` 六列加排序 + 关注原因拆「总成本超支/交付成本超支」+ 列筛选。

**Architecture:** 纯前端派生风险行（拍平 `projectPmis[pid].riskRecords` join 项目列），后端新增 `risk_followup.py`（仿 `temp_followup.py`，但归档不清空 current）+ 4 个 HTTP 端点。其余三块为前端纯函数/视图改动，不触碰数据管线。

**Tech Stack:** Python 标准库 HTTP（server.py）+ pydantic；Vue3 + Vite + TS + Pinia + Element Plus + ECharts；pytest + vitest。

## Global Constraints

- 版本单一来源 `frontend/src/version.ts`：本期 `APP_VERSION='V2.3.0'`、`RELEASE_DATE='2026-06-29'`（仅 Task 11 改）。
- **不改 `preprocess_data.py` / `schema.py` / 数据管线** → 升级不需点「更新数据」、无新依赖。
- 唯一新页面访问 key：`risk-followup`（普通管理员需在「页面访问控制」授权才可见）。
- 不使用 emoji（符号用 `→ ↓ ✕ ▾`）；跟进类型术语用「邮件推动」。
- 设计令牌只引用 `theme.css`/`echartsTheme.ts` 变量，不手写散值；表格数字列必须挂 `.u-num`（DataColumn 用 `num:true`）。
- 权限：编辑类端点任意登录可写；范围设置/归档端点超管专属（入 `_SUPER_ONLY_PATHS`，由 `_authz_gate` 拦）。
- 每个任务 TDD：先写失败测试 → 跑红 → 最小实现 → 跑绿 → 提交。完成定义＝该任务测试绿。全部完成后 `bash verify.sh` 全绿。
- 提交信息结尾加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

## 文件结构（创建/修改一览）

**新建：**
- `risk_followup.py`（后端纯函数域）
- `tests/test_risk_followup.py`
- `frontend/src/lib/riskRows.ts`（拍平风险行 + 单表匹配 + 范围目录）
- `frontend/src/lib/riskRows.test.ts`
- `frontend/src/lib/riskFollowupApi.ts`（4 端点封装）
- `frontend/src/stores/riskFollowup.ts`（Pinia store）
- `frontend/src/views/RiskFollowupView.vue`（新页）
- `frontend/src/views/RiskFollowupView.test.ts`
- `frontend/src/lib/useColumnPrefsDynamic.test.ts`

**修改：**
- `server.py`（4 handler + 路由 + 文件常量/锁 + 超管路径 + import）
- `frontend/src/lib/useColumnPrefs.ts`（追加 `useColumnPrefsDynamic`，不改原 `useColumnPrefs`）
- `frontend/src/components/ProgressEditModal.vue`（加 `riskFollowup` store + 两文本字段 + `headText`）
- `frontend/src/components/ProgressEditModal.test.ts`（若存在则补；否则在 RiskFollowupView 测试覆盖）
- `frontend/src/router/index.ts`（加 `/risk` 路由）
- `frontend/src/nav.ts`（`KEY_FOLLOWUP_LINKS` 加风险跟进）
- `frontend/src/lib/pageAccess.ts`（`PageKey` 加 `'risk-followup'`）
- `frontend/src/views/OverviewView.vue` + `frontend/src/views/CostDetailView.vue`（标签排除）
- 新建/扩展 `frontend/src/views/OverviewView.test.ts`、`frontend/src/views/CostDetailView.test.ts`
- `frontend/src/lib/governance.ts` + `frontend/src/lib/governance.test.ts`（originMissing）
- `frontend/src/views/ProjectsView.vue`（六列 sortable + riskReasons 入 FILTERABLE）
- `frontend/src/lib/riskReasons.ts` + `frontend/src/lib/riskReasons.test.ts`（拆两类）
- `frontend/src/lib/riskClassify.ts` + `frontend/src/lib/riskClassify.test.ts`（remap 保首页不变）
- `frontend/src/lib/projectList.ts` + `frontend/src/lib/projectList.test.ts`（注释 + 测试类别名）
- `frontend/src/lib/crossFilter.ts` + `frontend/src/lib/crossFilter.test.ts`（riskReasons 多值筛选）
- `frontend/src/version.ts`、`PROGRESS.md`

**任务依赖：** Task 3（后端）→ Task 5（store/api 依赖端点契约）→ Task 7（视图）。其余任务互相独立，可任意顺序。建议序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11。

---

### Task 1: 标签排除补「项目总览」首页

**Files:**
- Modify: `frontend/src/views/OverviewView.vue`
- Test: `frontend/src/views/OverviewView.test.ts`（无则新建，mount 谐振参考任一现有 `*View.test.ts`）

**Interfaces:**
- Consumes: `useFilterStore().excludeOn:boolean`、`excludedIds:Record<string,boolean>`（`stores/filter.ts` 已导出）。
- Produces: 视图新增 `defineExpose({ baseProjects })`，供测试断言排除生效。

OverviewView 当前 `projects` 直接取 `data.data.projects`，且第 26 行 `band` 也直接读 `data.data?.projects ?? []`，均未消费排除。改为统一经 `baseProjects`。

- [ ] **Step 1: 写失败测试** —— `frontend/src/views/OverviewView.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import OverviewView from './OverviewView.vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useFilterStore } from '@/stores/filter'

function seed() {
  const data = useDataStore()
  ;(data as any).data = {
    projects: [
      { projectId: 'P1', projectName: '甲', orgL4: '一组', health: { overall: '健康' } },
      { projectId: 'P2', projectName: '乙', orgL4: '一组', health: { overall: '健康' } },
    ],
    projectPmis: {}, paymentNodes: {}, paymentRecords: [], events: [],
  }
}

describe('OverviewView 标签排除', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('开启排除后被排除项目不进 baseProjects', () => {
    seed()
    const tags = useProjectTagsStore(); tags.assignments = { P2: ['排除标签'] } as any
    const filter = useFilterStore(); filter.setExclude(true, ['排除标签'])
    const w = mount(OverviewView)
    const base = (w.vm as any).baseProjects as { projectId: string }[]
    expect(base.map((p) => p.projectId)).toEqual(['P1'])
  })
  it('关闭排除时回到全量', () => {
    seed()
    const tags = useProjectTagsStore(); tags.assignments = { P2: ['排除标签'] } as any
    const filter = useFilterStore(); filter.setExclude(false, ['排除标签'])
    const w = mount(OverviewView)
    expect(((w.vm as any).baseProjects as any[]).map((p) => p.projectId)).toEqual(['P1', 'P2'])
  })
})
```

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/views/OverviewView.test.ts`。预期 FAIL（`baseProjects` 未暴露/未定义）。

- [ ] **Step 3: 最小实现** —— `OverviewView.vue`：在 `const projects = computed(...)` 处改为派生 `baseProjects` 并全量替换下游入口。把原第 20 行：
```ts
const projects = computed(() => (data.data?.projects ?? []) as Project[])
```
改为：
```ts
const baseProjects = computed(() => {
  const all = (data.data?.projects ?? []) as Project[]
  return filter.excludeOn ? all.filter((p) => !filter.excludedIds[p.projectId]) : all
})
const projects = baseProjects
```
并把第 26 行 `band` 内 `data.data?.projects ?? []` 改为 `projects.value`：
```ts
const band = computed(() => paymentBand(
  paymentNodeRows(data.data?.paymentNodes, projects.value, data.data?.projectPmis),
  new Date(), filter.payRecordsAll, filter.dateStart, filter.dateEnd,
))
```
在 `<script setup>` 末尾追加：
```ts
defineExpose({ baseProjects })
```
（`filter` 已在第 15 行 `const filter = useFilterStore()` 存在，无需新增 import。）

- [ ] **Step 4: 跑绿** —— `cd frontend && npx vitest run src/views/OverviewView.test.ts`。预期 PASS。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/views/OverviewView.vue frontend/src/views/OverviewView.test.ts
git commit -m "feat(overview): 首页项目总览补按标签排除(继承全局排除状态)"
```

---

### Task 2: 标签排除补「成本分析」`/insight/costdetail`

**Files:**
- Modify: `frontend/src/views/CostDetailView.vue`
- Test: `frontend/src/views/CostDetailView.test.ts`（新建）

**Interfaces:**
- Consumes: `useFilterStore()`（同 Task 1）；`buildCostRows(projects, pmis)`（`lib/costAnalysis.ts`，签名不变）。
- Produces: `defineExpose({ baseProjects })`。

CostDetailView 未 import filter store；`rows` 直接 `buildCostRows(data.data.projects, ...)`。

- [ ] **Step 1: 写失败测试** —— `frontend/src/views/CostDetailView.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import CostDetailView from './CostDetailView.vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useFilterStore } from '@/stores/filter'

function seed() {
  const data = useDataStore()
  ;(data as any).data = {
    projects: [{ projectId: 'P1', projectName: '甲', orgL4: '一组' }, { projectId: 'P2', projectName: '乙', orgL4: '一组' }],
    projectPmis: {},
  }
}

describe('CostDetailView 标签排除', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('开启排除后被排除项目不进 baseProjects', () => {
    seed()
    const tags = useProjectTagsStore(); tags.assignments = { P2: ['排除标签'] } as any
    useFilterStore().setExclude(true, ['排除标签'])
    const w = mount(CostDetailView)
    expect(((w.vm as any).baseProjects as any[]).map((p) => p.projectId)).toEqual(['P1'])
  })
})
```

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/views/CostDetailView.test.ts`。预期 FAIL。

- [ ] **Step 3: 最小实现** —— `CostDetailView.vue`：
  顶部 import 段（第 2-15 行附近）追加：
```ts
import { useFilterStore } from '@/stores/filter'
```
  `const data = useDataStore()` 之后加：
```ts
const filter = useFilterStore()
```
  把 `rows` computed（第 21-24 行）改为：
```ts
const baseProjects = computed(() => {
  const all = (data.data?.projects ?? []) as Project[]
  return filter.excludeOn ? all.filter((p) => !filter.excludedIds[p.projectId]) : all
})
const rows = computed(() => buildCostRows(
  baseProjects.value,
  (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
))
```
  `<script setup>` 末尾（`function onRow` 之后）追加：
```ts
defineExpose({ baseProjects })
```

- [ ] **Step 4: 跑绿** —— `cd frontend && npx vitest run src/views/CostDetailView.test.ts`。预期 PASS。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/views/CostDetailView.vue frontend/src/views/CostDetailView.test.ts
git commit -m "feat(cost): 成本分析页补按标签排除(继承全局排除状态)"
```

---

### Task 3: 后端 `risk_followup.py` + server 端点（归档不清空）

**Files:**
- Create: `risk_followup.py`
- Create: `tests/test_risk_followup.py`
- Modify: `server.py`

**Interfaces:**
- Produces（前端 Task 5 依赖的端点契约）：
  - `GET /api/risk-followup` → `{success, scope, current, archives}`
  - `POST /api/risk-followup/update {riskKey, field, content}` → `{success, record}`（field ∈ followAction/revConclusion/nextRevDate；任意登录）
  - `POST /api/risk-followup/scope {combinator, groups}` → `{success, scope}`（超管）
  - `POST /api/risk-followup/archive {rows}` → `{success, archives}`（超管，**不清空 current**）
- Produces（Python）：`risk_followup.new_store/normalize_scope/apply_update/apply_archive`、`PROGRESS_FIELDS=('followAction','revConclusion','nextRevDate')`。

`risk_followup.py` 仿 `opportunity_followup.py`（单表、条件无 group），差异：①空默认范围（默认展示全量由前端判空决定）；②`apply_archive` **不**执行 `store['current']={}`。

- [ ] **Step 1: 写失败测试** —— `tests/test_risk_followup.py`：

```python
import risk_followup as rf


def _store():
    return rf.new_store()


def test_new_store_empty_scope_and_buckets():
    s = rf.new_store()
    assert s["scope"] == {"combinator": "AND", "groups": []}
    assert s["current"] == {} and s["archives"] == []


def test_apply_update_writes_field_and_stamps():
    s = _store()
    rec = rf.apply_update(s, "P1::FX-1", "followAction", "已邮件推动", "admin", "2026-06-29 10:00")
    assert rec["followAction"] == "已邮件推动"
    assert rec["followActionEditTime"] == "2026-06-29 10:00" and rec["followActionEditBy"] == "admin"
    r2 = rf.apply_update(s, "P1::FX-1", "nextRevDate", "2026-07-15", "admin", "2026-06-29 10:05")
    assert r2["nextRevDate"] == "2026-07-15"
    assert s["current"]["P1::FX-1"]["followAction"] == "已邮件推动"  # 同 key 累积不互相覆盖


def test_apply_update_rejects_unknown_field():
    s = _store()
    try:
        rf.apply_update(s, "P1::FX-1", "weekProgress", "x", "admin", "t")
        assert False, "应拒绝非法 field"
    except ValueError:
        pass


def test_apply_archive_keeps_current():
    """关键差异:归档只追加快照,不清空 current(跟进数据留存)。"""
    s = _store()
    rf.apply_update(s, "P1::FX-1", "followAction", "推动中", "admin", "2026-06-29 10:00")
    rf.apply_archive(s, [{"riskKey": "P1::FX-1", "followAction": "推动中"}], "2026-06-29 18:00")
    assert len(s["archives"]) == 1 and s["archives"][0]["archiveTime"] == "2026-06-29 18:00"
    assert s["current"]["P1::FX-1"]["followAction"] == "推动中"  # 未被清空


def test_normalize_scope_accepts_grouplessconditions_and_drops_invalid():
    raw = {"combinator": "OR", "groups": [
        {"combinator": "AND", "conditions": [
            {"field": "风险等级", "op": "in", "values": ["高", "中"]},   # 单表:无 group 也收
            {"field": "", "op": "in", "values": []},                     # 非法 field → 丢
            {"op": "in"},                                                # 缺 field → 丢
        ]},
    ]}
    out = rf.normalize_scope(raw)
    assert out["combinator"] == "OR"
    conds = out["groups"][0]["conditions"]
    assert len(conds) == 1 and conds[0]["field"] == "风险等级" and conds[0]["values"] == ["高", "中"]


def test_normalize_scope_garbage_to_empty():
    assert rf.normalize_scope("not a dict") == {"combinator": "AND", "groups": []}
    assert rf.normalize_scope({"groups": "x"}) == {"combinator": "AND", "groups": []}
```

- [ ] **Step 2: 跑红** —— `python -m pytest tests/test_risk_followup.py -q`。预期 FAIL（`No module named 'risk_followup'`）。

- [ ] **Step 3: 实现 `risk_followup.py`** ——

```python
"""风险跟进(/risk)领域纯函数:范围条件规整 + 跟进编辑/归档。
单表(风险行)范围,条件无子表 group;匹配在前端做(数据已按 L4 裁剪),本模块只规整与存储。
与 temp/opportunity 的关键差异:apply_archive 只追加快照、不清空 current(跟进留存)。"""
from __future__ import annotations
from typing import Any, Dict, List

PROGRESS_FIELDS = ('followAction', 'revConclusion', 'nextRevDate')
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
    field = c.get('field')
    if not isinstance(field, str) or not field:
        return None
    op = c.get('op') if c.get('op') in _OPS else 'in'
    out: Dict[str, Any] = {"field": field, "op": op}
    if isinstance(c.get('values'), list):
        out['values'] = [str(x) for x in c['values']]
    if c.get('min') is not None:
        out['min'] = c['min']
    if c.get('max') is not None:
        out['max'] = c['max']
    return out


def normalize_scope(scope: Any) -> Dict[str, Any]:
    """宽容规整;结构非法 → 空范围 {combinator:'AND', groups:[]}。单表:条件无 group。"""
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


def apply_update(store, risk_key, field, content, account, now) -> Dict[str, Any]:
    if field not in PROGRESS_FIELDS:
        raise ValueError("invalid field: %s" % field)
    rec = store.setdefault('current', {}).setdefault(risk_key, {})
    rec[field] = content
    rec[field + 'EditTime'] = now
    rec[field + 'EditBy'] = account
    return rec


def apply_archive(store, rows, now) -> None:
    """只追加历史快照;不清空 current(跟进动作/rev结论/下次rev时间 留存)。"""
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
```

- [ ] **Step 4: 跑绿（纯函数）** —— `python -m pytest tests/test_risk_followup.py -q`。预期 PASS。

- [ ] **Step 5: 接入 server.py** —— 四处改动（参照现有 temp-followup 实现，逐字镜像）：

  (a) 顶部 import 区，在 `import temp_followup as _temp` 同处附近追加：
```python
import risk_followup as _riskfu
```
  (b) `_SUPER_ONLY_PATHS`（约第 161-176 行）集合内追加两条（与 temp 条目并列）：
```python
    '/api/risk-followup/scope', '/api/risk-followup/archive',
```
  (c) 在 `_load_temp_followup`/`_save_temp_followup` 之后追加文件常量、锁与读写（镜像 temp）：
```python
# ── 风险跟进(/risk;V2.3.0):scope 条件 + current 跟进 + archives 快照(归档不清空 current) ──
RISK_FOLLOWUP_FILE = os.path.join(BASE_DIR, 'data', 'risk_followup.json')
_risk_lock = threading.Lock()


def _load_risk_followup():
    """加载风险跟进 store;缺文件/损坏 → 默认(new_store)。不抛。"""
    if os.path.exists(RISK_FOLLOWUP_FILE):
        try:
            with open(RISK_FOLLOWUP_FILE, 'r', encoding='utf-8') as f:
                store = json.load(f)
            if isinstance(store, dict):
                store.setdefault('version', 1)
                store['scope'] = _riskfu.normalize_scope(store.get('scope'))
                store.setdefault('current', {})
                store.setdefault('archives', [])
                return store
        except Exception:
            pass
    return _riskfu.new_store()


def _save_risk_followup(store):
    with _risk_lock:
        os.makedirs(os.path.dirname(RISK_FOLLOWUP_FILE), exist_ok=True)
        with open(RISK_FOLLOWUP_FILE, 'w', encoding='utf-8') as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
```
  (d) 在 `handle_temp_followup_archive` 之后追加四个 handler（镜像 temp，注意 update 用 `riskKey`、archive 不清空）：
```python
def handle_risk_followup_get(self):
    """GET /api/risk-followup — {scope, current, archives}。任意登录用户(范围/筛选前端算)。"""
    account, rec = self._session_account_rec()
    if not rec:
        self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
        return
    try:
        store = _load_risk_followup()
        self._json_response({"success": True, "scope": store.get("scope"),
                             "current": store.get("current", {}), "archives": store.get("archives", [])})
    except Exception as e:
        self._json_response(_error_payload(ERR_INTERNAL, f"读取风险跟进失败: {e}"))


def handle_risk_followup_scope(self):
    """POST /api/risk-followup/scope {combinator, groups} — 保存范围。超管专属(_authz_gate 拦)。"""
    data = self._read_json_body()
    if data is None:
        self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
        return
    try:
        store = _load_risk_followup()
        store['scope'] = _riskfu.normalize_scope(data)
        _save_risk_followup(store)
        self._json_response({"success": True, "scope": store['scope']})
    except Exception as e:
        self._json_response(_error_payload(ERR_INTERNAL, f"保存范围失败: {e}"))


def handle_risk_followup_update(self):
    """POST /api/risk-followup/update {riskKey, field, content} — 编辑跟进单格。任意登录用户。"""
    data = self._read_json_body()
    if data is None:
        self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
        return
    rk = str(data.get('riskKey') or '').strip()
    field = data.get('field')
    if not rk or field not in _riskfu.PROGRESS_FIELDS:
        self._send_json(400, _error_payload(ERR_VALIDATION, "riskKey 必填、field 须为 followAction/revConclusion/nextRevDate"))
        return
    account = auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))
    if not account:
        self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
        return
    try:
        store = _load_risk_followup()
        rec = _riskfu.apply_update(store, rk, field, str(data.get('content') or ''),
                                   account, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        _save_risk_followup(store)
        self._json_response({"success": True, "record": rec})
    except Exception as e:
        self._json_response(_error_payload(ERR_INTERNAL, f"保存跟进失败: {e}"))


def handle_risk_followup_archive(self):
    """POST /api/risk-followup/archive {rows} — 归档快照,保留 current。超管专属。"""
    data = self._read_json_body()
    if data is None:
        self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
        return
    rows = data.get('rows')
    if not isinstance(rows, list):
        self._send_json(400, _error_payload(ERR_VALIDATION, "rows 须为数组"))
        return
    try:
        store = _load_risk_followup()
        _riskfu.apply_archive(store, rows, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        _save_risk_followup(store)
        self._json_response({"success": True, "archives": store.get("archives", [])})
    except Exception as e:
        self._json_response(_error_payload(ERR_INTERNAL, f"归档失败: {e}"))
```
  (e) `do_GET` 路由（约第 536-541 行 temp-followup 分支后）追加：
```python
elif parsed.path == '/api/risk-followup':
    self.handle_risk_followup_get()
```
  (f) `do_POST` 路由（约第 631-646 行 temp-followup 分支后）追加：
```python
elif parsed.path == '/api/risk-followup/scope':
    self.handle_risk_followup_scope()
elif parsed.path == '/api/risk-followup/update':
    self.handle_risk_followup_update()
elif parsed.path == '/api/risk-followup/archive':
    self.handle_risk_followup_archive()
```

- [ ] **Step 6: 验证 server 语法** —— `python -m py_compile server.py risk_followup.py && python -m pytest tests/test_risk_followup.py -q`。预期编译通过 + 测试 PASS。

- [ ] **Step 7: 提交** ——
```bash
git add risk_followup.py tests/test_risk_followup.py server.py
git commit -m "feat(risk-followup): 后端 risk_followup.py + 4 端点(归档不清空current,超管限范围/归档)"
```

---

### Task 4: 治理页「原项目数据缺失」告警

**Files:**
- Modify: `frontend/src/lib/governance.ts`
- Test: `frontend/src/lib/governance.test.ts`（无则新建）

**Interfaces:**
- Consumes: `buildHealthReport(data: AnalysisData)`；`data.projects[].relatedClosedId`、`data.projectPmis: Record<pid, ProjectPmis>`。
- Produces: `alerts` 数组多一项 `key:'originMissing'`。

孤儿 = 项目 `relatedClosedId` 非空 且 `projectPmis[relatedClosedId]` 不存在。

- [ ] **Step 1: 写失败测试** —— `frontend/src/lib/governance.test.ts`（若已存在则在其中追加该 describe）：

```ts
import { describe, it, expect } from 'vitest'
import { buildHealthReport } from './governance'

function baseData(extra: Record<string, unknown> = {}) {
  return {
    meta: {}, projects: [], projectPmis: {}, dataQuality: null, projectsQuality: null,
    ...extra,
  } as any
}

describe('governance — 原项目数据缺失(originMissing)', () => {
  it('relatedClosedId 命中 projectPmis 不算缺失,未命中才算', () => {
    const data = baseData({
      projects: [
        { projectId: 'A', projectName: '甲', projectManager: '张', orgL4: '一组', relatedClosedId: 'OLD-1' },
        { projectId: 'B', projectName: '乙', projectManager: '李', orgL4: '二组', relatedClosedId: 'OLD-X' },
        { projectId: 'C', projectName: '丙', projectManager: '王', orgL4: '三组', relatedClosedId: '' },
      ],
      projectPmis: { 'OLD-1': { matched: true } },
    })
    const rep = buildHealthReport(data)
    const g = rep.alerts.find((a) => a.key === 'originMissing')!
    expect(g).toBeTruthy()
    expect(g.count).toBe(1)
    expect((g.rows[0] as any).projectId).toBe('B')
    expect((g.rows[0] as any).relatedClosedId).toBe('OLD-X')
  })
})
```

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/lib/governance.test.ts`。预期 FAIL（无 originMissing 告警）。

- [ ] **Step 3: 实现** —— `governance.ts`：在 `const anomalies = anomalyRows(...)` 那段（约第 154-157 行）之后、`alerts.sort(...)`（约第 159 行）之前，追加：

```ts
  const orphanOrigin = (data.projects ?? [])
    .filter((p) => p.relatedClosedId && !(data.projectPmis ?? {})[p.relatedClosedId])
    .map((p) => ({
      projectId: p.projectId, projectName: p.projectName ?? '',
      projectManager: (p as Record<string, unknown>).projectManager ?? '', orgL4: p.orgL4 ?? '',
      relatedClosedId: p.relatedClosedId,
    }))
  alerts.push({ key: 'originMissing', label: '原项目数据缺失', severity: 'mid', count: orphanOrigin.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'projectName', label: '项目名称' },
              { key: 'projectManager', label: '项目经理' }, { key: 'orgL4', label: 'L4组' },
              { key: 'relatedClosedId', label: '原项目号' }],
    rows: orphanOrigin, exportName: '原项目数据缺失.xlsx' })
```

- [ ] **Step 4: 跑绿** —— `cd frontend && npx vitest run src/lib/governance.test.ts`。预期 PASS。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/lib/governance.ts frontend/src/lib/governance.test.ts
git commit -m "feat(governance): 新增「原项目数据缺失」告警(relatedClosedId 无对应 projectPmis)"
```

---

### Task 5: 风险行库 `riskRows.ts`（拍平 + 单表匹配 + 范围目录）

**Files:**
- Create: `frontend/src/lib/riskRows.ts`
- Create: `frontend/src/lib/riskRows.test.ts`

**Interfaces:**
- Consumes: `Project`、`ProjectPmis`（`@/types/analysis`）；`leafMatch`（`@/lib/scopeOps`）；`ScopeFilter/ScopeCondition/ScopeGroup/FieldLike`（`@/lib/tempScope`）。
- Produces: `RiskRow`、`RiskFollowRecord`、`buildRiskRows(projects, pmis, current)`、`riskRowMatches(row, scope)`、`RISK_SCOPE_CATALOG`。

- [ ] **Step 1: 写失败测试** —— `frontend/src/lib/riskRows.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildRiskRows, riskRowMatches } from './riskRows'
import type { ScopeFilter } from './tempScope'

const projects = [
  { projectId: 'P1', projectName: '甲项目', projectManager: '张三', orgL4: '一组',
    paymentPmis: { contract: 2_000_000 } },
  { projectId: 'P2', projectName: '乙项目', projectManager: '李四', orgL4: '二组',
    paymentPmis: { contract: null } },
] as any
const pmis = {
  P1: { status: { 项目级别: 'P1', 项目类型: '实施', 项目状态: '实施中' },
        riskRecords: [
          { 风险编码: 'FX-1', 风险名称: '进度风险', 风险等级: '高', 风险状态: '未关闭', 风险大类: '进度', 风险小类: '排期', 风险描述: '长文本', 项目编号: 'P1' },
          { 风险编码: 'FX-2', 风险名称: '成本风险', 风险等级: '中', 风险状态: '已关闭', 风险大类: '成本', 风险小类: '人力', 项目编号: 'P1' },
        ] },
  P2: { status: {}, riskRecords: [{ 风险编码: 'FX-9', 风险名称: '客户风险', 风险等级: '低', 风险状态: '未关闭', 项目编号: 'P2' }] },
} as any

describe('buildRiskRows', () => {
  it('拍平所有风险(含已关闭) + join 项目列 + 复合键 + 跟进字段', () => {
    const rows = buildRiskRows(projects, pmis, { 'P1::FX-1': { followAction: '推动中', followActionEditTime: '2026-06-29 10:00' } })
    expect(rows.length).toBe(3)
    const r1 = rows.find((r) => r.riskKey === 'P1::FX-1')!
    expect(r1['项目名称']).toBe('甲项目')
    expect(r1['项目经理']).toBe('张三')
    expect(r1['L4组织']).toBe('一组')
    expect(r1['项目级别']).toBe('P1')
    expect(r1['项目金额']).toBe(200)            // 200万
    expect(r1['风险编码']).toBe('FX-1')
    expect(r1.projectId).toBe('P1')
    expect(r1.followAction).toBe('推动中')
    expect(r1.followActionEditTime).toBe('2026-06-29 10:00')
    const r9 = rows.find((r) => r.riskKey === 'P2::FX-9')!
    expect(r9['项目金额']).toBeNull()           // contract null
    expect(r9.followAction ?? '').toBe('')
  })
})

describe('riskRowMatches(单表两级 AND/OR)', () => {
  const rows = buildRiskRows(projects, pmis, {})
  it('空范围 → false(由视图判空回退全量,本函数对空范围返回 false)', () => {
    expect(riskRowMatches(rows[0], { combinator: 'AND', groups: [] })).toBe(false)
  })
  it('按风险等级 in [高] 命中', () => {
    const scope: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [{ field: '风险等级', op: 'in', values: ['高'] }] }] }
    expect(riskRowMatches(rows.find((r) => r.riskKey === 'P1::FX-1')!, scope)).toBe(true)
    expect(riskRowMatches(rows.find((r) => r.riskKey === 'P2::FX-9')!, scope)).toBe(false)
  })
  it('两组 OR:风险状态=未关闭 或 L4组织=二组', () => {
    const scope: ScopeFilter = { combinator: 'OR', groups: [
      { combinator: 'AND', conditions: [{ field: '风险状态', op: 'in', values: ['未关闭'] }] },
      { combinator: 'AND', conditions: [{ field: 'L4组织', op: 'in', values: ['二组'] }] },
    ] }
    expect(riskRowMatches(rows.find((r) => r.riskKey === 'P1::FX-2')!, scope)).toBe(false) // 已关闭 且 一组
    expect(riskRowMatches(rows.find((r) => r.riskKey === 'P2::FX-9')!, scope)).toBe(true)  // 未关闭
  })
})
```

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/lib/riskRows.test.ts`。预期 FAIL。

- [ ] **Step 3: 实现 `riskRows.ts`** ——

```ts
// 风险跟进:把 projectPmis[pid].riskRecords 拍平为「风险行」(join 项目列),并提供单表范围匹配。
import type { Project, ProjectPmis } from '@/types/analysis'
import { leafMatch, type FieldKind } from './scopeOps'
import type { ScopeFilter, ScopeCondition, ScopeGroup, FieldLike } from './tempScope'

export interface RiskFollowRecord {
  followAction?: string; followActionEditTime?: string; followActionEditBy?: string
  revConclusion?: string; revConclusionEditTime?: string; revConclusionEditBy?: string
  nextRevDate?: string; nextRevDateEditTime?: string; nextRevDateEditBy?: string
}

export interface RiskRow extends Record<string, any> {
  riskKey: string
  projectId: string
  followAction?: string; revConclusion?: string; nextRevDate?: string
}

const s = (raw: unknown): string => (raw == null ? '' : String(raw).trim())

/** 拍平全部项目的风险记录为风险行;默认含全部风险(已关闭也在内,由范围/筛选自控)。 */
export function buildRiskRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, RiskFollowRecord>,
): RiskRow[] {
  const out: RiskRow[] = []
  for (const p of projects) {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const recs = (m.riskRecords ?? []) as Record<string, any>[]
    if (!recs.length) continue
    const contract = (p.paymentPmis as Record<string, any> | null | undefined)?.contract
    const status = m.status ?? {}
    for (const rr of recs) {
      const riskCode = s(rr['风险编码'])
      const riskKey = `${p.projectId}::${riskCode}`
      const follow = current[riskKey] ?? {}
      out.push({
        ...rr,                                   // 风险记录全部原始中文键
        projectId: p.projectId,
        '项目编号': p.projectId,                 // 项目主域权威值,覆盖风险记录里可能存在的同名键
        '项目名称': p.projectName ?? '',
        '项目金额': typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,  // 万,1 位小数
        '项目级别': s(status['项目级别']),
        '项目经理': p.projectManager ?? '',
        'L4组织': p.orgL4 ?? '',
        '项目类型': s(status['项目类型']),
        '项目状态': s(status['项目状态']),
        riskKey,
        followAction: follow.followAction, followActionEditTime: follow.followActionEditTime, followActionEditBy: follow.followActionEditBy,
        revConclusion: follow.revConclusion, revConclusionEditTime: follow.revConclusionEditTime, revConclusionEditBy: follow.revConclusionEditBy,
        nextRevDate: follow.nextRevDate, nextRevDateEditTime: follow.nextRevDateEditTime, nextRevDateEditBy: follow.nextRevDateEditBy,
      })
    }
  }
  return out
}

/** 单表范围匹配(风险行级,两级 AND/OR)。空范围 → false(视图判空决定是否回退全量)。 */
export function riskRowMatches(row: Record<string, any>, scope: ScopeFilter): boolean {
  if (!scope || !Array.isArray(scope.groups) || !scope.groups.length) return false
  const evalCond = (c: ScopeCondition) => leafMatch(row[c.field], c)
  const evalGroup = (g: ScopeGroup) =>
    g.conditions && g.conditions.length
      ? (g.combinator === 'OR' ? g.conditions.some(evalCond) : g.conditions.every(evalCond))
      : false
  const rs = scope.groups.map(evalGroup)
  return scope.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}

/** ScopeBuilder 单表字段目录(key 必须与风险行键一致)。 */
export const RISK_SCOPE_CATALOG: FieldLike[] = [
  { key: '风险等级', label: '风险等级', kind: 'enum' as FieldKind },
  { key: '风险状态', label: '风险状态', kind: 'enum' as FieldKind },
  { key: '风险大类', label: '风险大类', kind: 'enum' as FieldKind },
  { key: '风险小类', label: '风险小类', kind: 'enum' as FieldKind },
  { key: '风险名称', label: '风险名称', kind: 'text' as FieldKind },
  { key: '项目编号', label: '项目编号', kind: 'enum' as FieldKind },
  { key: '项目名称', label: '项目名称', kind: 'text' as FieldKind },
  { key: '项目级别', label: '项目级别', kind: 'enum' as FieldKind },
  { key: '项目经理', label: '项目经理', kind: 'enum' as FieldKind },
  { key: 'L4组织', label: 'L4组织', kind: 'enum' as FieldKind },
  { key: '项目类型', label: '项目类型', kind: 'enum' as FieldKind },
  { key: '项目状态', label: '项目状态', kind: 'enum' as FieldKind },
  { key: '项目金额', label: '项目金额(万)', kind: 'number' as FieldKind },
]
```

> 注：若 `leafMatch` 不从 `@/lib/scopeOps` 具名导出，改从其实际导出位置导入（`tempScope.ts` 第 2 行即 `import { leafMatch } from './scopeOps'`，以该路径为准）。`FieldKind` 同源自 `./scopeOps`。

- [ ] **Step 4: 跑绿** —— `cd frontend && npx vitest run src/lib/riskRows.test.ts`。预期 PASS。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/lib/riskRows.ts frontend/src/lib/riskRows.test.ts
git commit -m "feat(risk-followup): riskRows 拍平风险行+join项目列+单表范围匹配+范围目录"
```

---

### Task 6: `riskFollowupApi.ts` + `riskFollowup` store + `useColumnPrefsDynamic`

**Files:**
- Create: `frontend/src/lib/riskFollowupApi.ts`
- Create: `frontend/src/stores/riskFollowup.ts`
- Modify: `frontend/src/lib/useColumnPrefs.ts`（追加 `useColumnPrefsDynamic`）
- Create: `frontend/src/lib/useColumnPrefsDynamic.test.ts`

**Interfaces:**
- Consumes: `api`（`@/api/client`，`api.get<T>(path)` / `api.post<T>(path, body)`）；Task 3 端点契约；Task 5 `RiskFollowRecord`。
- Produces: `riskFollowupApi`；`useRiskFollowupStore()`（`scope/current/archives/loaded/load/update/archive/saveScope/reset`，archive 不清空 current）；`useColumnPrefsDynamic(viewKey, allKeysRef, defaultVisible)`。

- [ ] **Step 1: 写失败测试（useColumnPrefsDynamic）** —— `frontend/src/lib/useColumnPrefsDynamic.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useColumnPrefsDynamic } from './useColumnPrefs'

describe('useColumnPrefsDynamic', () => {
  beforeEach(() => localStorage.clear())
  it('allKeys 异步到达后,按 defaultVisible∩allKeys 初始化', async () => {
    const allKeys = ref<string[]>([])
    const p = useColumnPrefsDynamic('t-view', allKeys, ['a', 'b', 'zzz'])
    expect(p.visibleKeys.value).toEqual([])            // 数据未到 → 空
    allKeys.value = ['a', 'b', 'c']
    await nextTick()
    expect(p.visibleKeys.value).toEqual(['a', 'b'])    // zzz 不在 allKeys 被滤
  })
  it('toggle 仅对 allKeys 内的键生效;reset 回默认', async () => {
    const allKeys = ref<string[]>(['a', 'b', 'c'])
    const p = useColumnPrefsDynamic('t-view2', allKeys, ['a'])
    await nextTick()
    p.toggle('c'); expect(p.visibleKeys.value).toEqual(['a', 'c'])
    p.toggle('zzz'); expect(p.visibleKeys.value).toEqual(['a', 'c'])  // 非 allKeys 无效
    p.reset(); expect(p.visibleKeys.value).toEqual(['a'])
  })
})
```

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/lib/useColumnPrefsDynamic.test.ts`。预期 FAIL（`useColumnPrefsDynamic` 不存在）。

- [ ] **Step 3: 实现 `useColumnPrefsDynamic`** —— 在 `frontend/src/lib/useColumnPrefs.ts` **文件末尾追加**（复用文件内已有的 `PREFIX/loadKeys/saveKeys/ColumnPrefs`，原 `useColumnPrefs` 不动）：

```ts
import { watch, type Ref } from 'vue'

/** 动态列版本:allKeys 为 Ref(数据异步到达后变化)。首次非空时从 localStorage 懒加载。 */
export function useColumnPrefsDynamic(
  viewKey: string,
  allKeys: Ref<string[]>,
  defaultVisible: string[],
): ColumnPrefs {
  const visibleKeys = ref<string[]>([])
  let inited = false
  function set(keys: string[]) { visibleKeys.value = keys; saveKeys(viewKey, keys) }
  function init(ks: string[]) {
    if (inited || !ks.length) return
    inited = true
    visibleKeys.value = loadKeys(viewKey, ks, defaultVisible)
  }
  init(allKeys.value)
  watch(allKeys, init)

  function toggle(key: string) {
    if (!allKeys.value.includes(key)) return
    set(visibleKeys.value.includes(key)
      ? visibleKeys.value.filter((k) => k !== key)
      : [...visibleKeys.value, key])
  }
  function moveUp(key: string) {
    const i = visibleKeys.value.indexOf(key)
    if (i > 0) { const n = [...visibleKeys.value]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(n) }
  }
  function moveDown(key: string) {
    const i = visibleKeys.value.indexOf(key)
    if (i >= 0 && i < visibleKeys.value.length - 1) { const n = [...visibleKeys.value]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set(n) }
  }
  function reset() { set(defaultVisible.filter((k) => allKeys.value.includes(k))) }
  return { visibleKeys, toggle, moveUp, moveDown, reset }
}
```
> `useColumnPrefs.ts` 顶部第 1 行原为 `import { ref, type Ref } from 'vue'`——把它改成 `import { ref, watch, type Ref } from 'vue'`，并删除上面新增块里重复的 `import { watch, type Ref } from 'vue'` 行（保持单一 import）。

- [ ] **Step 4: 跑绿（prefs）** —— `cd frontend && npx vitest run src/lib/useColumnPrefsDynamic.test.ts`。预期 PASS。

- [ ] **Step 5: 实现 `riskFollowupApi.ts`** ——

```ts
import { api } from '@/api/client'
import type { ScopeFilter } from './tempScope'
import type { RiskFollowRecord } from './riskRows'

export interface RiskArchive { archiveTime: string; rows: Record<string, unknown>[] }
export interface RiskGetResp { success?: boolean; scope: ScopeFilter; current: Record<string, RiskFollowRecord>; archives: RiskArchive[] }
export interface RiskScopeResp { success: boolean; scope: ScopeFilter }
export interface RiskUpdateResp { success: boolean; record: RiskFollowRecord }
export interface RiskArchiveResp { success: boolean; archives: RiskArchive[] }

export const riskFollowupApi = {
  get: () => api.get<RiskGetResp>('/api/risk-followup'),
  saveScope: (scope: ScopeFilter) => api.post<RiskScopeResp>('/api/risk-followup/scope', scope),
  update: (riskKey: string, field: 'followAction' | 'revConclusion' | 'nextRevDate', content: string) =>
    api.post<RiskUpdateResp>('/api/risk-followup/update', { riskKey, field, content }),
  archive: (rows: Record<string, unknown>[]) => api.post<RiskArchiveResp>('/api/risk-followup/archive', { rows }),
}
```

- [ ] **Step 6: 实现 `riskFollowup` store** —— `frontend/src/stores/riskFollowup.ts`（注意 `archive` **不清空** current）：

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { riskFollowupApi, type RiskArchive } from '@/lib/riskFollowupApi'
import type { RiskFollowRecord } from '@/lib/riskRows'
import type { ScopeFilter } from '@/lib/tempScope'

const EMPTY_SCOPE: ScopeFilter = { combinator: 'AND', groups: [] }

export const useRiskFollowupStore = defineStore('riskFollowup', () => {
  const scope = ref<ScopeFilter>({ ...EMPTY_SCOPE })
  const current = ref<Record<string, RiskFollowRecord>>({})
  const archives = ref<RiskArchive[]>([])
  const loaded = ref(false)

  async function load() {
    const r = await riskFollowupApi.get()
    scope.value = r.scope ?? { ...EMPTY_SCOPE }
    current.value = r.current ?? {}
    archives.value = r.archives ?? []
    loaded.value = true
  }
  async function saveScope(next: ScopeFilter) {
    const r = await riskFollowupApi.saveScope(next)
    scope.value = r.scope ?? next
  }
  async function update(riskKey: string, field: 'followAction' | 'revConclusion' | 'nextRevDate', content: string) {
    const r = await riskFollowupApi.update(riskKey, field, content)
    current.value = { ...current.value, [riskKey]: { ...current.value[riskKey], ...r.record } }
  }
  async function archive(rows: Record<string, unknown>[]) {
    const r = await riskFollowupApi.archive(rows)
    archives.value = r.archives ?? []
    // 注意:不清空 current —— 跟进数据留存(与 temp/key 关键差异)
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

- [ ] **Step 7: typecheck** —— `cd frontend && npx vue-tsc --noEmit -p tsconfig.app.json`（或 `npm run typecheck`）。预期无新增类型错误。

- [ ] **Step 8: 提交** ——
```bash
git add frontend/src/lib/riskFollowupApi.ts frontend/src/stores/riskFollowup.ts frontend/src/lib/useColumnPrefs.ts frontend/src/lib/useColumnPrefsDynamic.test.ts
git commit -m "feat(risk-followup): api封装+store(归档不清空)+useColumnPrefsDynamic(动态列)"
```

---

### Task 7: 扩展 `ProgressEditModal` 支持风险跟进文本字段

**Files:**
- Modify: `frontend/src/components/ProgressEditModal.vue`

**Interfaces:**
- Consumes: `useRiskFollowupStore()`（Task 6）。
- Produces: `ProgressEditModal` 接受 `store='riskFollowup'`、`field ∈ {'weekProgress','nextPlan','followAction','revConclusion'}`、可选 `headText`。`projectId` 作为通用记录键透传给 `store.update`（风险页传 `riskKey`）。

- [ ] **Step 1: 改 props/store 映射/标签/头部** —— 把 `ProgressEditModal.vue` 的 `<script setup>` 改为：

```ts
import { ref, watch, computed } from 'vue'
import Modal from './Modal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useOpportunityFollowupStore } from '@/stores/opportunityFollowup'
import { useRiskFollowupStore } from '@/stores/riskFollowup'

const props = defineProps<{
  modelValue: boolean; projectId: string; projectName: string
  field: 'weekProgress' | 'nextPlan' | 'followAction' | 'revConclusion'; initial: string
  store?: 'key' | 'temp' | 'oppFollowup' | 'riskFollowup'
  headText?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const keyStore = useProjectProgressStore()
const tempStore = useTempFollowupStore()
const oppStore = useOpportunityFollowupStore()
const riskStore = useRiskFollowupStore()
const activeStore = computed(() =>
  props.store === 'temp' ? tempStore
    : props.store === 'oppFollowup' ? oppStore
      : props.store === 'riskFollowup' ? riskStore
        : keyStore)
const text = ref(props.initial)
const saving = ref(false)
watch(() => props.modelValue, (v) => { if (v) text.value = props.initial })

const FIELD_LABEL = { weekProgress: '本周工作进展', nextPlan: '后续工作计划',
  followAction: '跟进动作', revConclusion: 'rev结论' } as const

async function save() {
  saving.value = true
  try {
    // 各 store 的 update field 联合类型不同,此处用通用键透传(后端亦校验 field 合法性)
    await (activeStore.value as { update: (id: string, field: string, content: string) => Promise<unknown> })
      .update(props.projectId, props.field, text.value)
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
defineExpose({ save, text })
```
  并把 `<template>` 里头部那行：
```vue
    <div class="pem-head">{{ projectName }} / 编号 {{ projectId }}</div>
```
  改为：
```vue
    <div class="pem-head">{{ headText || (projectName + ' / 编号 ' + projectId) }}</div>
```

- [ ] **Step 2: typecheck** —— `cd frontend && npx vue-tsc --noEmit -p tsconfig.app.json`。预期无新增类型错误（key/temp/opp 页旧调用：field 仍是 `'weekProgress'|'nextPlan'` 子集，兼容；未传 `store`/`headText` 走默认）。

- [ ] **Step 3: 跑相关既有测试回归** —— `cd frontend && npx vitest run src/components/ProgressEditModal.test.ts src/views/KeyProjectsView.test.ts src/views/TempFollowupView.test.ts`（存在哪些跑哪些）。预期全 PASS（行为对旧页面不变）。

- [ ] **Step 4: 提交** ——
```bash
git add frontend/src/components/ProgressEditModal.vue
git commit -m "feat(risk-followup): ProgressEditModal 支持 riskFollowup store + 跟进动作/rev结论字段 + headText"
```

---

### Task 8: 新页 `RiskFollowupView.vue` + 路由/导航/pageKey

**Files:**
- Create: `frontend/src/views/RiskFollowupView.vue`
- Create: `frontend/src/views/RiskFollowupView.test.ts`
- Modify: `frontend/src/router/index.ts`、`frontend/src/nav.ts`、`frontend/src/lib/pageAccess.ts`

**Interfaces:**
- Consumes: Task 5 `buildRiskRows/riskRowMatches/RISK_SCOPE_CATALOG/RiskRow`；Task 6 `useRiskFollowupStore/useColumnPrefsDynamic`；Task 7 `ProgressEditModal`；`RISK_COLUMNS/fmtDateCell`（`@/lib/projectPage`）；`ScopeBuilder/DataTable/ColumnFilter/ColumnPicker/SegToggle/Modal`、`applyColumnFilters`、`exportSheets`。
- Produces: 路由 `/risk`（name `risk-followup`，meta `{title:'风险跟进', hideFilter:true, pageKey:'risk-followup'}`）；`PageKey` 增 `'risk-followup'`；导航条目。

- [ ] **Step 1: pageAccess + nav + router 注册** ——
  (a) `frontend/src/lib/pageAccess.ts` 第 1-6 行的 `PageKey` 联合类型，在 `'projects-key' | 'opportunities-progress' | 'temp-followup' | 'opportunity-followup'` 这一行追加 `| 'risk-followup'`：
```ts
  | 'projects-key' | 'opportunities-progress' | 'temp-followup' | 'opportunity-followup' | 'risk-followup'
```
  (b) `frontend/src/nav.ts` 的 `KEY_FOLLOWUP_LINKS`（第 40-44 行）追加一项：
```ts
export const KEY_FOLLOWUP_LINKS: NavLink[] = [
  { label: '重点项目进展', to: '/projects/key', key: 'projects-key' },
  { label: '重点商机跟进', to: '/opportunities/key', key: 'opportunity-followup' },
  { label: '临时重点跟进', to: '/projects/temp', key: 'temp-followup' },
  { label: '风险跟进', to: '/risk', key: 'risk-followup' },
]
```
  (c) `frontend/src/router/index.ts`：仿照 `/projects/temp` 既有写法，新增懒加载路由（放在重点跟进相关路由附近）：
```ts
{ path: '/risk', name: 'risk-followup', component: () => import('@/views/RiskFollowupView.vue'),
  meta: { title: '风险跟进', hideFilter: true, pageKey: 'risk-followup' } },
```

- [ ] **Step 2: 写失败测试** —— `frontend/src/views/RiskFollowupView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import RiskFollowupView from './RiskFollowupView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useRiskFollowupStore } from '@/stores/riskFollowup'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function seed(isSuper = true) {
  const data = useDataStore()
  ;(data as any).data = {
    projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '一组', paymentPmis: { contract: 2_000_000 } }],
    projectPmis: { P1: { status: { 项目级别: 'P1' }, riskRecords: [
      { 风险编码: 'FX-1', 风险名称: '进度风险', 风险等级: '高', 风险状态: '未关闭', 风险大类: '进度', 风险小类: '排期', 风险描述: '长文本', 备注: '附加列' },
      { 风险编码: 'FX-2', 风险名称: '成本风险', 风险等级: '中', 风险状态: '已关闭', 风险大类: '成本', 风险小类: '人力' },
    ] } },
  }
  const auth = useAuthStore(); (auth as any).user = { isSuper, allowedPages: ['*'], allowedL4: ['*'] }
  const risk = useRiskFollowupStore(); risk.loaded = true; risk.scope = { combinator: 'AND', groups: [] }
}

describe('RiskFollowupView', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('默认展示全部风险(含已关闭),16 默认列含跟进三列', () => {
    seed()
    const w = mount(RiskFollowupView)
    const vm = w.vm as any
    expect(vm.allRows.length).toBe(2)         // FX-1 + FX-2(已关闭)都在
    expect(vm.scopedRows.length).toBe(2)      // 空范围 → 全量
    expect(w.text()).toContain('风险跟进')
    // 跟进三列默认可见
    for (const lbl of ['跟进动作', 'rev结论', '下次rev时间']) expect(w.text()).toContain(lbl)
  })
  it('有范围条件时按风险行过滤', () => {
    seed()
    const risk = useRiskFollowupStore()
    risk.scope = { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [{ field: '风险状态', op: 'in', values: ['未关闭'] }] }] }
    const w = mount(RiskFollowupView)
    expect((w.vm as any).scopedRows.map((r: any) => r.riskKey)).toEqual(['P1::FX-1'])
  })
  it('普通管理员不见范围/归档/导出按钮', () => {
    seed(false)
    const w = mount(RiskFollowupView)
    expect(w.text()).not.toContain('范围设置')
    expect(w.text()).not.toContain('归档（留存跟进）')
  })
})
```

- [ ] **Step 3: 跑红** —— `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts`。预期 FAIL（组件不存在）。

- [ ] **Step 4: 实现 `RiskFollowupView.vue`** ——

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useRiskFollowupStore } from '@/stores/riskFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildRiskRows, riskRowMatches, RISK_SCOPE_CATALOG, type RiskRow } from '@/lib/riskRows'
import { RISK_COLUMNS, fmtDateCell } from '@/lib/projectPage'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefsDynamic } from '@/lib/useColumnPrefs'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import Modal from '@/components/Modal.vue'
import SegToggle from '@/components/SegToggle.vue'
import ProgressEditModal from '@/components/ProgressEditModal.vue'
import ScopeBuilder from '@/components/ScopeBuilder.vue'
import { exportSheets } from '@/lib/exportXlsx'

const TABLE_ID = 'risk-followup'
const data = useDataStore()
const auth = useAuthStore()
const risk = useRiskFollowupStore()
const cf = useCrossFilterStore()

onMounted(() => {
  if (!data.data) data.load()
  if (!risk.loaded) risk.load()
})

const mode = ref<'current' | 'history'>('current')
const historyIdx = ref(0)
const isCurrent = computed(() => mode.value === 'current')
const datasetOpts = computed(() => [{ value: 'current', label: '当前数据' },
  ...risk.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime }))])
const historyOpts = computed(() => risk.archives.map((a, i) => ({ value: i, label: a.archiveTime })))
watch(() => [mode.value, risk.archives.length] as const, () => {
  if (mode.value === 'history') historyIdx.value = Math.max(0, risk.archives.length - 1)
})

const projects = computed(() => (data.data?.projects ?? []) as Project[])
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)
const allRows = computed<RiskRow[]>(() => buildRiskRows(projects.value, pmisMap.value, risk.current))
const hasScope = computed(() => risk.scope.groups.some((g) => g.conditions.length))
const scopedRows = computed<RiskRow[]>(() => hasScope.value ? allRows.value.filter((r) => riskRowMatches(r, risk.scope)) : allRows.value)
const currentRows = computed<RiskRow[]>(() => scopedRows.value)
const rows = computed<RiskRow[]>(() => isCurrent.value ? currentRows.value : ((risk.archives[historyIdx.value]?.rows ?? []) as RiskRow[]))
const filtered = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as RiskRow[])

// —— 列模型:风险列(动态) + 项目列(固定) + 跟进列 ——
const PROJECT_COLS: DataColumn[] = [
  { key: '项目编号', label: '项目编号', width: 175, sortable: true },
  { key: '项目名称', label: '项目名称', width: 220, sortable: true },
  { key: '项目金额', label: '项目金额(万)', width: 110, sortable: true, num: true,
    formatter: (v) => (v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: '项目级别', label: '项目级别', width: 80, sortable: true },
  { key: '项目经理', label: '项目经理', width: 96, sortable: true },
  { key: 'L4组织', label: 'L4组织', width: 110, sortable: true },
  { key: '项目类型', label: '项目类型', width: 110, sortable: true },
  { key: '项目状态', label: '项目状态', width: 100, sortable: true },
]
const FOLLOW_COLS: DataColumn[] = [
  { key: 'followAction', label: '跟进动作', width: 240, wrap: true },
  { key: 'revConclusion', label: 'rev结论', width: 240, wrap: true },
  { key: 'nextRevDate', label: '下次rev时间', width: 170, sortable: true },
]
const NON_RISK_KEYS = new Set<string>([
  ...PROJECT_COLS.map((c) => c.key), ...FOLLOW_COLS.map((c) => c.key),
  'projectId', 'riskKey',
  'followActionEditTime', 'followActionEditBy', 'revConclusionEditTime', 'revConclusionEditBy', 'nextRevDateEditTime', 'nextRevDateEditBy',
])
const riskCols = computed<DataColumn[]>(() => {
  const known = new Map(RISK_COLUMNS.map((c) => [c.key, c]))
  const keys: string[] = []
  const seen = new Set<string>()
  for (const r of allRows.value) for (const k of Object.keys(r)) {
    if (!NON_RISK_KEYS.has(k) && !seen.has(k)) { seen.add(k); keys.push(k) }
  }
  return keys.map((k) => {
    const c = known.get(k)
    return { key: k, label: c?.label ?? k, width: c?.width ?? 160, wrap: true, sortable: true,
      formatter: c?.date ? (v: unknown) => fmtDateCell(v) : undefined } as DataColumn
  })
})
const ALL_COLUMNS = computed<DataColumn[]>(() => [...riskCols.value, ...PROJECT_COLS, ...FOLLOW_COLS])
const allKeys = computed(() => ALL_COLUMNS.value.map((c) => c.key))
const DEFAULT_VISIBLE = ['风险编码', '风险等级', '风险状态', '项目编号', '项目名称', '项目金额', '项目级别', '项目经理', 'L4组织',
  '风险名称', '风险大类', '风险小类', '风险描述', 'followAction', 'revConclusion', 'nextRevDate']
const FILTERABLE = new Set(['风险等级', '风险状态', '风险大类', '风险小类', '项目级别', '项目经理', 'L4组织', '项目类型', '项目状态'])
const prefs = useColumnPrefsDynamic(TABLE_ID, allKeys, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.value.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = computed(() => ALL_COLUMNS.value.map((c) => ({ key: c.key, label: c.label })))
function onToggle(key: string) { if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key); prefs.toggle(key) }

// —— 文本编辑(跟进动作/rev结论) ——
const editOpen = ref(false)
const editCtx = reactive({ riskKey: '', title: '', field: 'followAction' as 'followAction' | 'revConclusion', initial: '' })
function progCell(row: RiskRow, field: 'followAction' | 'revConclusion'): string {
  const t = field === 'followAction' ? row.followActionEditTime : row.revConclusionEditTime
  const c = (row as Record<string, any>)[field]
  if (!c) return isCurrent.value ? '点击填写' : '-'
  return `${t}：${c}`
}
function openEdit(row: RiskRow, field: 'followAction' | 'revConclusion') {
  if (!isCurrent.value) return
  editCtx.riskKey = row.riskKey
  editCtx.title = `${row['项目名称'] ?? ''} / 风险 ${row['风险编码'] ?? ''}`
  editCtx.field = field
  editCtx.initial = (row as Record<string, any>)[field] ?? ''
  editOpen.value = true
}

// —— 日期编辑(下次rev时间) ——
async function onDateChange(row: RiskRow, val: string | null) {
  if (!isCurrent.value) return
  await risk.update(row.riskKey, 'nextRevDate', val ?? '')
}

// —— 范围/归档/导出(超管) ——
const scopeOpen = ref(false)
const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await risk.archive(currentRows.value as unknown as Record<string, unknown>[]); archiveConfirm.value = false; mode.value = 'current' }
  finally { archiving.value = false }
}
const exportOpen = ref(false)
const exportSel = ref<string[]>(['current'])
const allSelected = computed(() => exportSel.value.length > 0 && exportSel.value.length === datasetOpts.value.length)
const exportIndeterminate = computed(() => exportSel.value.length > 0 && exportSel.value.length < datasetOpts.value.length)
function toggleAllExport(val: boolean) { exportSel.value = val ? datasetOpts.value.map((o) => o.value) : [] }
function exportRow(r: RiskRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of visibleColumns.value) {
    const v = (r as Record<string, any>)[col.key]
    out[col.label] = col.formatter ? col.formatter(v, r) : (v ?? '')
  }
  return out
}
function doExport() {
  const sheets = exportSel.value.map((sel) => {
    const opt = datasetOpts.value.find((o) => o.value === sel)
    const src: RiskRow[] = sel === 'current' ? currentRows.value : ((risk.archives[Number(sel.slice(1))]?.rows ?? []) as RiskRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as RiskRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`风险跟进_${exportSel.value.length}集.xlsx`, sheets)
  exportOpen.value = false
}

defineExpose({ editOpen, editCtx, mode, historyIdx, isCurrent, scopeOpen, exportSel, allSelected, datasetOpts, toggleAllExport, allRows, scopedRows, hasScope })
</script>

<template>
  <div class="risk-followup-view">
    <h2 class="kp-title">风险跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="mode" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="mode === 'history'" v-model="historyIdx" size="small" style="width: 200px"
        :disabled="!risk.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in historyOpts" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">归档（留存跟进）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="exportOpen = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!rows.length" class="kp-empty">暂无风险数据。</div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="filtered" :show-count="false">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" />
          </span>
        </template>
        <template #cell-followAction="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as RiskRow, 'followAction')">{{ progCell(row as RiskRow, 'followAction') }}</span>
        </template>
        <template #cell-revConclusion="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as RiskRow, 'revConclusion')">{{ progCell(row as RiskRow, 'revConclusion') }}</span>
        </template>
        <template #cell-nextRevDate="{ row }">
          <el-date-picker v-if="isCurrent" :model-value="(row as RiskRow).nextRevDate || ''" type="date"
            value-format="YYYY-MM-DD" size="small" style="width: 150px" placeholder="选择日期"
            @update:model-value="(v: string | null) => onDateChange(row as RiskRow, v)" />
          <span v-else>{{ (row as RiskRow).nextRevDate || '-' }}</span>
        </template>
      </DataTable>
    </div>

    <ProgressEditModal v-model="editOpen" store="riskFollowup"
      :project-id="editCtx.riskKey" :project-name="editCtx.title" :head-text="editCtx.title"
      :field="editCtx.field" :initial="editCtx.initial" />

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="allRows" :initial="risk.scope"
      single-table :catalog="RISK_SCOPE_CATALOG" :match-fn="riskRowMatches"
      title="范围设置（风险跟进）" count-unit="风险" @save="(s) => risk.saveScope(s)" />

    <Modal v-model="archiveConfirm" title="归档（留存跟进）" width="460px">
      <div>将当前风险跟进快照归档为历史；已填写的跟进动作 / rev结论 / 下次rev时间<strong>保留不清空</strong>（下次「更新数据」后按风险编码重新挂到最新风险上）。确认归档？</div>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="archiveConfirm = false">取消</button>
        <button class="kp-archive-btn" :disabled="archiving" @click="doArchive">确认归档</button>
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
.risk-followup-view { padding: var(--sp-4); }
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

- [ ] **Step 5: 跑绿** —— `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts`。预期 PASS。

- [ ] **Step 6: typecheck** —— `cd frontend && npx vue-tsc --noEmit -p tsconfig.app.json`。预期无新增错误。

- [ ] **Step 7: 提交** ——
```bash
git add frontend/src/views/RiskFollowupView.vue frontend/src/views/RiskFollowupView.test.ts frontend/src/router/index.ts frontend/src/nav.ts frontend/src/lib/pageAccess.ts
git commit -m "feat(risk-followup): 新页/risk(全列+换行+跟进三字段+范围设置+归档留存)+路由/导航/pageKey"
```

---

### Task 9: `/projects` 六列加排序

**Files:**
- Modify: `frontend/src/views/ProjectsView.vue`
- Test: `frontend/src/views/ProjectsView.test.ts`（无则新建一个最小列定义断言）

**Interfaces:**
- Produces: `ALL_COLUMNS` 中 `projectManager/orgL4/riskLevel/projectLevel/projectType/projectStatus` 六列 `sortable:true`。

- [ ] **Step 1: 写失败测试** —— `frontend/src/views/ProjectsView.test.ts`（若已存在则追加该 describe；该断言通过组件实例读取列定义）：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import ProjectsView from './ProjectsView.vue'
import { useDataStore } from '@/stores/data'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }))

describe('ProjectsView 列排序', () => {
  beforeEach(() => { setActivePinia(createPinia()); const d = useDataStore(); (d as any).data = { projects: [], projectPmis: {} } })
  it('六列开启 sortable', () => {
    const w = mount(ProjectsView)
    const cols = (w.vm as any).ALL_COLUMNS as { key: string; sortable?: boolean }[]
    for (const k of ['projectManager', 'orgL4', 'riskLevel', 'projectLevel', 'projectType', 'projectStatus']) {
      expect(cols.find((c) => c.key === k)?.sortable, k).toBe(true)
    }
  })
})
```
> 若 `ALL_COLUMNS` 未 expose，在 `defineExpose` 中加入 `ALL_COLUMNS`（仅测试用）。

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/views/ProjectsView.test.ts`。预期 FAIL。

- [ ] **Step 3: 实现** —— `ProjectsView.vue` 的 `ALL_COLUMNS`（第 41-63 行）给六列各加 `sortable: true`：
```ts
  { key: 'projectManager', label: '项目经理', width: 96, sortable: true },
  { key: 'orgL4', label: 'L4组', width: 110, sortable: true },
  { key: 'riskLevel', label: '风险', width: 96, sortable: true, formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'projectLevel', label: '级别', width: 80, sortable: true },
  { key: 'projectType', label: '项目类型', width: 110, sortable: true },
  { key: 'projectStatus', label: '项目状态', width: 100, sortable: true },
```
  并在 `<script setup>` 的 `defineExpose({...})` 加入 `ALL_COLUMNS`（若该视图原无 defineExpose，新增 `defineExpose({ ALL_COLUMNS })`）。

- [ ] **Step 4: 跑绿** —— `cd frontend && npx vitest run src/views/ProjectsView.test.ts`。预期 PASS。

- [ ] **Step 5: 提交** ——
```bash
git add frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts
git commit -m "feat(projects): 项目经理/L4组/风险/级别/项目类型/项目状态 六列加排序"
```

---

### Task 10: 关注原因拆「总成本超支/交付成本超支」+ 列筛选

**Files:**
- Modify: `frontend/src/lib/riskReasons.ts` + `frontend/src/lib/riskReasons.test.ts`
- Modify: `frontend/src/lib/riskClassify.ts` + `frontend/src/lib/riskClassify.test.ts`
- Modify: `frontend/src/lib/projectList.ts` + `frontend/src/lib/projectList.test.ts`
- Modify: `frontend/src/lib/crossFilter.ts` + `frontend/src/lib/crossFilter.test.ts`
- Modify: `frontend/src/views/ProjectsView.vue`

**Interfaces:**
- Produces: `RiskCategory` 增 `'总成本超支' | '交付成本超支'`、去 `'成本超支'`；`riskClassify` 把两新类 remap 回单一「成本超支」桶（首页不变）；`crossFilter` 对 `riskReasons` 列做多值（按类别）筛选；ProjectsView `FILTERABLE` 含 `'riskReasons'`。

- [ ] **Step 1: 写失败测试（riskReasons 拆分）** —— 改 `frontend/src/lib/riskReasons.test.ts` 的「成本超支」一节为：

```ts
describe('riskReasons — 成本超支拆分', () => {
  it('overspendAmount > 0 命中总成本超支', () => {
    const p = baseProject({ overspendAmount: 12000 })
    const result = riskReasons(p)
    const r = result.find((x) => x.category === '总成本超支')
    expect(r).toBeTruthy()
    expect(r!.detail).toContain('1.2')
  })
  it('PMIS 项目超支 flag 命中总成本超支(无 overspendAmount 时)', () => {
    const p = baseProject({})
    const pmis = { cost: { 项目超支: true } } as any
    expect(riskReasons(p, pmis).some((x) => x.category === '总成本超支')).toBe(true)
  })
  it('cost.交付超支===true 命中交付成本超支', () => {
    const p = baseProject({})
    const pmis = { cost: { 交付超支: true } } as any
    expect(riskReasons(p, pmis).some((x) => x.category === '交付成本超支')).toBe(true)
  })
  it('总/交付可同时出现', () => {
    const p = baseProject({ overspendAmount: 5000 })
    const pmis = { cost: { 交付超支: true } } as any
    const cats = riskReasons(p, pmis).map((x) => x.category)
    expect(cats).toContain('总成本超支')
    expect(cats).toContain('交付成本超支')
  })
})
```
  并把该文件中「组合顺序」用例里对 `'成本超支'` 的断言改为 `'总成本超支'`（顺序 `回款延期→里程碑滞后→总成本超支→交付成本超支→风险未闭环`）。

- [ ] **Step 2: 跑红** —— `cd frontend && npx vitest run src/lib/riskReasons.test.ts`。预期 FAIL。

- [ ] **Step 3: 实现 riskReasons 拆分** —— `riskReasons.ts`：
  第 5 行类型：
```ts
export type RiskCategory = '回款延期' | '里程碑滞后' | '总成本超支' | '交付成本超支' | '风险未闭环' | '数据异常'
```
  第 48-54 行「成本超支」块替换为：
```ts
  // 3. 总成本超支(整体预算维度):overspendAmount > 0 优先；否则 PMIS 项目超支 flag 或消耗比 > 1
  const over = project.overspendAmount ?? 0
  if (over > 0) {
    out.push({ category: '总成本超支', detail: `超支 ${(over / 10000).toFixed(1)} 万`, tone: 'danger' })
  } else if ((pmis?.cost?.['项目超支']) || ((pmis?.cost?.['消耗比'] ?? 0) > 1)) {
    out.push({ category: '总成本超支', detail: '项目超支', tone: 'danger' })
  }
  // 3b. 交付成本超支(交付部门人工成本):PMIS 现成布尔 flag
  if (pmis?.cost?.['交付超支'] === true) {
    out.push({ category: '交付成本超支', detail: '交付人工超支', tone: 'danger' })
  }
```

- [ ] **Step 4: 跑绿（riskReasons）** —— `cd frontend && npx vitest run src/lib/riskReasons.test.ts`。预期 PASS。

- [ ] **Step 5: riskClassify remap（首页保持单一「成本超支」桶）** —— 先在 `frontend/src/lib/riskClassify.test.ts` 追加用例：
```ts
it('总成本超支/交付成本超支 都计入首页「成本超支」桶', () => {
  const rows = [
    { projectId: 'A', projectName: '甲', health: '健康', isAnomalous: false, riskReasons: [{ category: '总成本超支', detail: '超支 1.0 万', tone: 'danger' }] },
    { projectId: 'B', projectName: '乙', health: '健康', isAnomalous: false, riskReasons: [{ category: '交付成本超支', detail: '交付人工超支', tone: 'danger' }] },
  ] as any
  const res = classifyProjects(rows)
  expect(res.find((e) => e.category === '成本超支')!.count).toBe(2)
})
```
  跑红：`cd frontend && npx vitest run src/lib/riskClassify.test.ts`（新用例 FAIL：新类别未计入）。
  实现 `riskClassify.ts`：在 `classifyProjects` 内匹配前加 remap（`CATEGORIES` 与既有 6 桶不变）：
```ts
const COST_SPLIT = new Set(['总成本超支', '交付成本超支'])
```
  把匹配循环（第 52-57 行）改为：
```ts
    for (const rr of riskReasons) {
      const cat = COST_SPLIT.has(rr.category) ? '成本超支' : rr.category
      const bucket = buckets.get(cat)
      if (bucket) {
        bucket.projects.push({ projectId, projectName, detail: rr.detail })
      }
    }
```
  跑绿：`cd frontend && npx vitest run src/lib/riskClassify.test.ts`。预期 PASS（旧用例 + 新用例均绿）。

- [ ] **Step 6: projectList 注释与测试类别名** —— `projectList.ts` 第 42 行注释更新为列出新类别：
```ts
  riskCategory: string  // '' 或 '回款延期'|'里程碑滞后'|'总成本超支'|'交付成本超支'|'风险未闭环'|'数据异常'|'健康度低'
```
  `projectList.test.ts`：把 `riskCategory='成本超支'` 用例（第 148/160-162 行）中的 `'成本超支'` 改为 `'总成本超支'`（makeRow 的 riskReasons 与 filter 入参一并改）。跑：`cd frontend && npx vitest run src/lib/projectList.test.ts`。预期 PASS（filterProjectRows 逻辑通用，无需改实现）。

- [ ] **Step 7: crossFilter 支持 riskReasons 多值列筛选** —— 先在 `frontend/src/lib/crossFilter.test.ts` 追加：
```ts
import { cfUniqueValues, applyColumnFilters } from './crossFilter'

describe('crossFilter — riskReasons 多值(按类别)', () => {
  const rows = [
    { projectId: 'A', riskReasons: [{ category: '回款延期' }, { category: '总成本超支' }] },
    { projectId: 'B', riskReasons: [{ category: '交付成本超支' }] },
    { projectId: 'C', riskReasons: [] },
  ] as any[]
  it('唯一值=摊平后的各类别', () => {
    const u = cfUniqueValues(rows, 'riskReasons').map((x) => x.display)
    expect(u).toContain('回款延期'); expect(u).toContain('总成本超支'); expect(u).toContain('交付成本超支')
  })
  it('筛选「交付成本超支」只留 B', () => {
    const res = applyColumnFilters(rows, { riskReasons: { value: ['交付成本超支'] } })
    expect(res.map((r: any) => r.projectId)).toEqual(['B'])
  })
})
```
  跑红：`cd frontend && npx vitest run src/lib/crossFilter.test.ts`（FAIL：当前把数组 String 化成 `[object Object]`）。
  实现 `crossFilter.ts`：在 `cfUniqueValues` 与 `applyColumnFilters` 顶部各加 riskReasons 特例。
  `cfUniqueValues` 改为：
```ts
export function cfUniqueValues(rows: Record<string, any>[], colKey: string): UniqueValue[] {
  if (colKey === 'riskReasons') {
    const set = new Set<string>()
    for (const r of rows) for (const rr of (r.riskReasons ?? [])) if (rr?.category) set.add(String(rr.category))
    return [...set].sort().map((display) => ({ display, raw: display }))
  }
  const uvMap: Record<string, unknown> = {}
  for (const r of rows) {
    const v = r[colKey]
    uvMap[cfFormatValue(colKey, v)] = v
  }
  return Object.keys(uvMap)
    .sort()
    .map((display) => ({ display, raw: uvMap[display] }))
}
```
  `applyColumnFilters` 的行匹配循环里，在 `const sel = filters[ck].value` 之后、`const cv = ...` 之前加特例：
```ts
      const sel = filters[ck].value
      if (ck === 'riskReasons') {
        const cats = ((row.riskReasons ?? []) as { category?: string }[]).map((rr) => rr.category)
        if (!sel.some((c) => cats.includes(c))) return false
        continue
      }
      const cv = row[ck]
```
  跑绿：`cd frontend && npx vitest run src/lib/crossFilter.test.ts`。预期 PASS。

- [ ] **Step 8: ProjectsView 把 riskReasons 纳入可筛选列** —— `ProjectsView.vue` 第 66 行 `FILTERABLE` 集合追加 `'riskReasons'`：
```ts
const FILTERABLE = new Set(['projectManager', 'orgL4', 'stage', 'projectStatus', 'riskLevel', 'projectLevel', 'projectType', 'paymentStatus', 'health', 'top1000', 'quadrant', 'riskReasons'])
```
  （表头筛选自动出现；`#cell-riskReasons` slot 与 ColumnFilter 共存，ColumnFilter 用 `cfUniqueValues(rows,'riskReasons')` 取类别选项。）

- [ ] **Step 9: 全量回归** —— `cd frontend && npx vitest run src/lib/riskReasons.test.ts src/lib/riskClassify.test.ts src/lib/projectList.test.ts src/lib/crossFilter.test.ts`。预期全 PASS。

- [ ] **Step 10: 提交** ——
```bash
git add frontend/src/lib/riskReasons.ts frontend/src/lib/riskReasons.test.ts frontend/src/lib/riskClassify.ts frontend/src/lib/riskClassify.test.ts frontend/src/lib/projectList.ts frontend/src/lib/projectList.test.ts frontend/src/lib/crossFilter.ts frontend/src/lib/crossFilter.test.ts frontend/src/views/ProjectsView.vue
git commit -m "feat(projects): 关注原因拆总/交付成本超支+列按类别筛选(首页分类remap保持不变)"
```

---

### Task 11: 版本号 + PROGRESS.md + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 版本号** —— `frontend/src/version.ts`：
```ts
export const APP_VERSION = 'V2.3.0'
export const RELEASE_DATE = '2026-06-29'
```

- [ ] **Step 2: PROGRESS.md** —— 同步头部「当前版本/最近更新/上一版本」为 V2.3.0；在版本史顶部加一条 V2.3.0 摘要（四块：首页/成本分析补标签排除；新页 /risk 风险跟进；治理页 originMissing；/projects 六列排序+关注原因拆两类+列筛选；无 preprocess/schema 改动→升级不需更新数据；新 pageKey risk-followup）。

- [ ] **Step 3: 全量验证** —— `bash verify.sh`。预期全绿：py 编译 + ruff + pytest（含 test_risk_followup）+ 前端 typecheck + vitest + build。

- [ ] **Step 4: 提交** ——
```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.3.0 版本号+PROGRESS(风险跟进新页+标签排除补全+孤儿告警+/projects增强)"
```

---

## 交付（实现全绿后，非 TDD 任务，合并后执行）

1. PowerShell 出 `/pm` 构建：`cd frontend; npx vite build --base=/pm/`，校验 `dist/index.html` 含 `="/pm/assets`。
2. `python make_update_zip.py` → `release/pmplatform-update-V2.3.0.zip`（含改动 `*.py`+`risk_followup.py`+`/pm` dist；校验含 `risk_followup.py`、不含 data/input/tests/docs）。
3. **重建默认 base dist**：`cd frontend; npx vite build`，校验 `="/assets`、0 处 `/pm`。
4. 写 `deploy/升级手册-V2.3.0.md`：重点写①新 pageKey `risk-followup` 需在「页面访问控制」授权；②归档为「留存跟进」语义；③关注原因新增「交付成本超支」类；④无新依赖、不需点「更新数据」、无 preprocess/schema 改动；⑤验证清单（/risk 全列+换行+三字段编辑+归档留存、首页/成本分析排除生效、治理页原项目缺失告警、/projects 六列排序+关注原因两类+列筛选）。
5. 走 superpowers:finishing-a-development-branch 合并。

## Self-Review 摘要

- **Spec 覆盖**：Item1=Task1/2；Item2=Task3(后端)/5/6/7/8(前端)；Item3=Task4；Item4.1=Task9；Item4.2=Task10；交付/版本=Task11+交付节。全覆盖。
- **类型一致**：`RiskFollowRecord`/`RiskRow`(Task5) ↔ store(Task6) ↔ api(Task6) ↔ 视图(Task8) 字段名一致（followAction/revConclusion/nextRevDate + EditTime/EditBy）；端点契约 `{riskKey, field, content}`(Task3) ↔ api(Task6) 一致；`useColumnPrefsDynamic`(Task6) ↔ 视图(Task8) 签名一致。
- **关键差异点已显式标注**：归档不清空 current（Task3 后端 + Task6 store + Task8 文案三处一致）；首页分类 remap 保持不变（Task10 Step5）；动态列 prefs（Task6）。
