# V2.3.1 设计：重点项目筛选口径调整 + 标签丢失修复 + 历史逐条删除 + 客户列售前取原项目

> 状态：设计已与用户确认（4 决策：标签诊断「不确定」→前端补载+后端防御+验证步骤 / /risk 新增客户列但默认隐藏 / 历史逐条删除）。
> 日期：2026-06-29　版本：V2.3.0 → **V2.3.1**（全为子页/局部级 Z + bug 修）。
> 交流语言：简体中文。沿用既有设计令牌/口径/打包约定（CLAUDE.md）。

## 0. 总览与全局约束

四块相互独立、共享一个发布：

| 编号 | 内容 | 规模 | 后端 |
|---|---|---|---|
| Item 1 | /projects/key 筛选口径调整 | 极小（1 纯函数+文案） | 无 |
| Item 2 | 标签丢失修复 | 小（前端 1 行 + 后端防御测试） | 核查无改 |
| Item 3 | 四页历史逐条删除（超管+二次确认） | 中大（4×后端纯函数/端点 + 4 api/store/视图） | 4 端点 |
| Item 4 | 客户列售前取原项目（key/temp/risk） | 中 | 无 |

**全局约束（每个任务隐含遵守）：**
- **不改 `preprocess_data.py` / `schema.py` / 数据管线** → 升级**不需点「更新数据」、无新依赖、无新页/新 pageKey**。
- 新增运行码仅 server.py 的 4 个 archive-delete 端点 + 三个 followup 模块各一纯函数（随 `*.py` 进更新包）。
- 不使用 emoji（符号用 `→ ↓ ✕ ▾`）；设计令牌只引用 `theme.css` 变量，不手写散值；表格数字列挂 `.u-num`（DataColumn `num:true`）。
- 删除类端点超管专属（入 `_SUPER_ONLY_PATHS`，由 `_authz_gate` 拦）；前端删除按钮 `v-if="auth.isSuper"` + 二次确认 Modal。
- 版本单一来源 `frontend/src/version.ts`：`APP_VERSION='V2.3.1'`、`RELEASE_DATE='2026-06-29'`。
- 验证：`bash verify.sh` 全绿。改后端纯函数先补测试再改实现。

---

## Item 1 — /projects/key 筛选口径调整

**现状** `frontend/src/lib/keyProjects.ts::isKeyProject`：
```ts
export function isKeyProject(p: Project, pmis: ProjectPmis | undefined): boolean {
  if (p.top1000 !== '是') return false
  const contract = Number(p.paymentPmis?.contract ?? 0)
  const level = v((pmis?.status as Record<string, unknown> | undefined)?.['项目级别'])
  return contract > 1_000_000 || level === 'P1'
}
```
旧口径 = `TOP1000 && (合同>100万 || P1)`。

**新口径** = `P1 || (TOP1000 && 合同>100万)`：
```ts
export function isKeyProject(p: Project, pmis: ProjectPmis | undefined): boolean {
  const contract = Number(p.paymentPmis?.contract ?? 0)
  const level = v((pmis?.status as Record<string, unknown> | undefined)?.['项目级别'])
  return level === 'P1' || (p.top1000 === '是' && contract > 1_000_000)
}
```
即 **P1 项目一律入选（不再要求 TOP1000）**，或 TOP1000 且合同>100万元。

**同步**：`KeyProjectsView.vue` 空态文案（现「取数：TOP1000 大客户 且 合同>100万元 或 级别 P1」）改为「取数：级别 P1 或（TOP1000 大客户 且 合同>100万元）」。

**测试**（`keyProjects.test.ts`）：
- P1 且非 TOP1000 → **入选**（旧口径不入选）。
- TOP1000 且合同>100万且非 P1 → 入选（不变）。
- TOP1000 但合同≤100万且非 P1 → **不入选**（旧口径同样不入选）。
- 非 TOP1000、非 P1、合同>100万 → 不入选。

---

## Item 2 — 标签丢失修复

**根因（最可能）**：`frontend/src/views/DataView.vue:57` 的 reprocess 完成回调漏刷标签：
```ts
useReprocess({ onDone: () => { data.reload(); loadFileStatus() } })
```
同文件人工导入（118）/回滚（125）处均有 `await projectTags.load()`，唯独 reprocess 漏。`projectTags` 已在第 17 行 `const projectTags = useProjectTagsStore()`。后端 `_load_project_tags` 本地文件存在即原样返回、`tagSeed` 仅首次播种——**后端数据不丢，是前端 store 未随 reprocess 刷新**。

**前端修复**：
```ts
useReprocess({ onDone: () => { data.reload(); loadFileStatus(); projectTags.load() } })
```

**后端防御**：核查 `/api/reprocess`（frozen + dev 两分支）与 `preprocess_data.py` 全程不写/不删 `data/project_tags.json`；加 pytest 锁定 `_load_project_tags` 对「已存在且合法 JSON」的文件原样返回、不重新播种覆盖（构造临时 PROJECT_TAGS_FILE 含 assignments → 调 `_load_project_tags` → 断言 assignments 原样）。

**交付给用户的验证步骤**（写进升级手册）：升级后 → 给某项目加标签 → 点「更新数据」→ **不刷新页面**就应仍见标签（修前需手动刷新才回来）。**若刷新后仍丢**=更深根因（项目编号变动 / 升级流程误清 data/），届时带该环境数据另查；本期先封住最常见的前端补载缺口。

**测试**：后端 pytest（防御）。前端可选：若 `DataView.test.ts` 存在或可低成本 mock `useReprocess`，加一条断言 onDone 调用 `projectTags.load()`；否则以后端测试 + 手动验证步骤覆盖（不强造脆弱 mount 测试）。

---

## Item 3 — 四页历史逐条删除（超管 + 二次确认）

四页：/projects/key（`progress` store，`/api/progress/*`）、/opportunities/key（`opportunityFollowup`）、/projects/temp（`tempFollowup`）、/risk（`riskFollowup`）。archives 均为 `[{archiveTime, rows}]` 列表，**按数组 index 删**（archiveTime 可能同秒重复）。

### 后端
三个 followup 模块（`temp_followup.py`/`opportunity_followup.py`/`risk_followup.py`）各加纯函数：
```python
def apply_archive_delete(store, idx) -> bool:
    """删除第 idx 条历史快照;越界/非法 idx → False(不动 store)。"""
    archives = store.setdefault('archives', [])
    if not isinstance(idx, int) or idx < 0 or idx >= len(archives):
        return False
    del archives[idx]
    return True
```
progress 在 `server.py` 内加同款 `_progress_apply_archive_delete(store, idx) -> bool`。

四个端点（handler 仿现有 archive handler；范式以 temp 为例）：
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
端点：`/api/progress/archive/delete`、`/api/temp-followup/archive/delete`、`/api/opportunity-followup/archive/delete`、`/api/risk-followup/archive/delete`。**四个全入 `_SUPER_ONLY_PATHS`**；do_POST 各加路由分发。risk 的 `_save_risk_followup` 已原子写（V2.3.0 修过），删除复用之。

pytest：每个 `apply_archive_delete` 覆盖「正常删第 i 条」「越界/负数 idx → False 且 archives 不变」；progress 的同款在 `tests/test_server_progress*`（或新建）覆盖。

### 前端
四个 api 各加：
```ts
deleteArchive: (archiveIdx: number) => api.post<{success:boolean;archives:Archive[]}>('/api/temp-followup/archive/delete', { archiveIdx }),
```
四个 store 各加：
```ts
async function deleteArchive(idx: number) {
  const r = await tempFollowupApi.deleteArchive(idx)
  archives.value = r.archives ?? []
}
```
（导出 `deleteArchive`。）

四个视图：历史模式下、历史下拉旁加超管删除按钮 + 二次确认 Modal（仿现有归档确认 Modal）；删后 clamp `historyIdx`、archives 空则切回当前：
```ts
const delConfirm = ref(false)
const deleting = ref(false)
async function doDeleteArchive() {
  deleting.value = true
  try {
    await temp.deleteArchive(historyIdx.value)
    delConfirm.value = false
    if (!temp.archives.length) mode.value = 'current'
    else historyIdx.value = Math.min(historyIdx.value, temp.archives.length - 1)
  } finally { deleting.value = false }
}
```
```vue
<button v-if="auth.isSuper && mode === 'history' && temp.archives.length" class="kp-archive-btn" @click="delConfirm = true">删除此历史</button>
...
<Modal v-model="delConfirm" title="删除历史快照" width="420px">
  <div>将永久删除该条历史快照（{{ historyOpts[historyIdx]?.label }}），不可恢复。确认删除？</div>
  <div style="...flex end gap..."><button class="kp-cancel" @click="delConfirm=false">取消</button>
    <button class="kp-archive-btn" :disabled="deleting" @click="doDeleteArchive">确认删除</button></div>
</Modal>
```
（各视图把 `temp`/`historyIdx` 换成本页对应：progress→`progress`、opp→`oppf`、risk→`risk`；KeyProjectsView 的 store 是 `progress`，api 是 `projectProgressApi`。）

vitest：每视图断言「普通管理员不见『删除此历史』按钮、超管在历史模式见」；store `deleteArchive` 调 api 后更新 archives（可在某一视图或 store 层测一处代表，四页结构同构）。

---

## Item 4 — 客户列售前取原项目（key/temp/risk）

口径（同后端 `projects.py:237`）：**售前服务类项目（`isPresale`）客户取「原项目（`relatedClosedId`）最终客户」；无原项目/原项目无客户 → '-'，不回退本项目**。非售前用本项目最终客户。原项目 PMIS 从 `pmisMap[relatedClosedId]` 取（已关闭项目也在 pmisMap 内）。

### key + temp（一处覆盖两页）
`keyProjects.ts::buildProgressRowBase` 加可选第 4 参 `closedPmis?: ProjectPmis`，客户取数改：
```ts
export function buildProgressRowBase(
  p: Project, pmis: ProjectPmis | undefined, rec: ProgressRecord,
  closedPmis?: ProjectPmis,
): KeyProjectRow {
  const m = (pmis ?? {}) as Record<string, any>
  const st = m.status ?? {}, risk = m.risk ?? {}, cust = m.customer ?? {}, team = m.team ?? {}
  const ccust = ((closedPmis ?? {}) as Record<string, any>).customer ?? {}
  const customer = p.isPresale ? v(ccust.最终客户, '-') : v(cust.最终客户, '-')
  return { ...,
    customer,   // 替换原 customer: v(cust.最终客户, '-')
    ... }
}
```
两个调用方传 closedPmis：
- `buildKeyProjectRows`：`buildProgressRowBase(p, pmisMap[p.projectId], current[p.projectId] ?? {}, pmisMap[p.relatedClosedId ?? ''])`
- `buildTempRows`（`tempFollowup.ts:24`）：`buildProgressRowBase(p, pmis, current[p.projectId] ?? {}, pmisMap[p.relatedClosedId ?? ''])`

> 边界（已知、不在本期处理）：temp 的**范围筛选**字段 `customer`（`buildScopeInputs` proj.customer）仍取本项目客户——item 4 只调整**显示列**，范围口径不动（避免扩面）。

### risk（新增客户列，默认隐藏）
`riskRows.ts::buildRiskRows` 在拍平行里加 `'客户'`：
```ts
const closedCust = ((pmisMap[p.relatedClosedId ?? ''] ?? {}) as Record<string, any>).customer ?? {}
const ownCust = (m.customer ?? {}) as Record<string, any>
// 行内:
'客户': p.isPresale ? s(closedCust['最终客户']) : s(ownCust['最终客户']),
```
`RiskFollowupView.vue`：`PROJECT_COLS` 加 `{ key: '客户', label: '客户', width: 180, sortable: true }`（放 项目名称 后即可）；**不进 `DEFAULT_VISIBLE`（默认隐藏，可选列）**；加入 `FILTERABLE`；`riskRows.ts` 的 `RISK_SCOPE_CATALOG` 加 `{ key:'客户', label:'客户', kind:'enum' }`。`NON_RISK_KEYS` 因派生自 `PROJECT_COLS.map(c=>c.key)` 自动含 '客户'（不会被当风险列重复）。

### 测试
- `keyProjects.test.ts`：售前项目（isPresale + relatedClosedId）→ customer 取 closedPmis.customer.最终客户；售前无原项目客户 → '-'（不回退本项目）；非售前 → 本项目客户。
- `riskRows.test.ts`：buildRiskRows 行含 `客户`；售前取原项目、非售前取本项目、缺失 → ''。
- `RiskFollowupView.test.ts`：客户列在 ALL_COLUMNS（可选）但不在默认可见 16。

---

## 实现拆解（4 工作流）
1. **WS-1 Item 1**：isKeyProject 新口径 + 空态文案 + 测试。
2. **WS-2 Item 2**：DataView onDone 补 projectTags.load() + 后端防御 pytest。
3. **WS-3 Item 3**：四页历史逐条删除（3 模块纯函数 + progress 纯函数 + 4 端点 + 超管路径 + 4 api + 4 store + 4 视图 UI + 测试）。最大，建议按「后端全做完→前端逐页」推进。
4. **WS-4 Item 4**：buildProgressRowBase 加 closedPmis + 两调用方；buildRiskRows 加客户 + RiskFollowupView 列；测试。

WS 间无强依赖（WS-3 前端依赖其后端端点契约）。

## 交付物（V2.3.1）
- `verify.sh` 全绿。
- 打包按用户发话（同上次「暂不打包」由用户决定）；若打包：PowerShell `--base=/pm/` 构建 → `make_update_zip.py` → 重建默认 base；升级手册重点写①标签修复+验证步骤（不刷新即在；若刷新仍丢另报）②四页历史可超管逐条删③/risk 新增可选「客户」列④/projects/key 取数口径变化（P1 一律入选）⑤无新依赖/不需更新数据/无新页。
- `PROGRESS.md` 同步版本史。
