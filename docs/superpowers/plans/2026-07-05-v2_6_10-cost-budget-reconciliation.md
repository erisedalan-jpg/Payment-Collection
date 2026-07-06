# V2.6.10 成本预算口径兜底 + 数据质量告警 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当 PMIS「项目总预算」与损益表「预算成本」分歧时，成本口径分母改用损益预算成本并连带重算，分歧清单入数据质量告警。

**Architecture:** 在 `pmis.py` 新增纯函数 `reconcile_cost_budget`，就地覆盖 `project_pmis[pid]["cost"]` 的分母并重算 剩余/消耗比/项目超支（只动分母、核算不变），返回分歧清单；`preprocess_data.py` 在组装 `final_data` 前调用它并把清单写入 `data_quality["budgetSourceMismatch"]`；前端 `governance.ts` 增一个告警组，治理页通用渲染。

**Tech Stack:** Python 3.8+ 标准库 + pydantic（schema，`extra="allow"` 免改）；前端 Vue3 + TS + Vitest；pytest。

## Global Constraints

- 交流语言简体中文；**不使用任何 emoji**（需要符号用 `→ ↓ ❌ ✕ ▾`）。
- 版本单一来源 `frontend/src/version.ts` → **V2.6.10**（Z 级）。
- 改了 `preprocess_data.py` 计算逻辑 → **升级须点「更新数据」**。
- **先补/改测试再改实现**（TDD）。
- 分歧判据（覆盖与告警共用）：`PMIS总预算 与 损益预算成本 皆非空 且 损益预算成本 > 0 且 |PMIS总预算 − 损益预算成本| > 1.0 元`。
- **不改** `derive_cost` 本体；**不改**分子「核算」来源；**不改** PMIS「成本状态」文本；**不填充** PMIS总预算为空的项目。
- schema 用宽松扩展（pydantic `extra="allow"`，同批2 `collectionParseErrors`）：**不改** `schema.py`、不跑 `gen:types`。
- `bash verify.sh` 全绿方为完成；`PROGRESS.md` 更新。
- 真实基线数据：全仓 7 个分歧项目（见 spec 表），改后超支数 36→35（`WSGF-SS-202603259038` 翻不超支）。

## File Structure

| 文件 | 职责 | 改动 |
|---|---|---|
| `pmis.py` | 成本域解析，含 `derive_cost` | **新增** `reconcile_cost_budget` 纯函数（`derive_cost` 之后） |
| `preprocess_data.py` | 主管线组装 `final_data` | **接线**：line 229 后调用 + 写 `data_quality["budgetSourceMismatch"]` |
| `frontend/src/lib/governance.ts` | 治理页视图模型 `buildHealthReport` | **新增** 一个 `budgetMismatch` 告警组 |
| `frontend/src/version.ts` | 版本单一来源 | bump V2.6.10 |
| `tests/test_pmis.py` | 成本域单测 | **新增** `reconcile_cost_budget` 单测 |
| `frontend/src/lib/governance.test.ts` | 治理页单测 | **新增** budgetMismatch 告警断言 |
| `PROGRESS.md` | 版本史/技术债 | **新增** V2.6.10 条目 |
| `deploy/升级手册-V2.6.10.md` | 升级手册 | **新增**（Task 5 打包） |

`DataQualityView.vue` **不改**：它对 `buildHealthReport().alerts` 通用迭代（columns/rows 模型），新告警组自动渲染。

---

## Task 1: `pmis.reconcile_cost_budget` 纯函数 + 单测

**Files:**
- Modify: `pmis.py`（在 `derive_cost` 结束后、`derive_risk` 之前，约 line 113 插入）
- Test: `tests/test_pmis.py`

**Interfaces:**
- Consumes: `project_pmis: Dict[str, Dict[str, Any]]`（每项 `dims["cost"]` 为 `derive_cost` 产出的 dict，键 `总预算/核算/剩余预算/消耗比/项目超支/交付超支/成本状态`）；`project_profit: Optional[Dict[str, Dict[str, Any]]]`（每项 `{"summary": {"预算成本": float|None, ...}, "rows": [...], "bridge": ...}`）。
- Produces: `reconcile_cost_budget(project_pmis, project_profit, tol: float = 1.0) -> List[Dict[str, Any]]`。**就地修改** `project_pmis[pid]["cost"]`；返回分歧清单 `[{"projectId", "pmisBudget", "profitBudget", "diff"}]`。

- [ ] **Step 1: 写失败测试**

在 `tests/test_pmis.py` 末尾追加（文件已 `import pmis as M` 或类似；若导入名不同，按文件现有 `import` 约定引用，函数为 `M.reconcile_cost_budget`）：

```python
def _cost(总预算, 核算, 剩余预算, 消耗比, 项目超支, 成本状态="绿色预警"):
    return {"总预算": 总预算, "核算": 核算, "剩余预算": 剩余预算, "消耗比": 消耗比,
            "项目超支": 项目超支, "交付超支": False, "成本状态": 成本状态}


def test_reconcile_覆盖分歧项目并重算_只动分母():
    pp = {"P1": {"cost": _cost(5640.0, 5037.0, 603.0, 0.893, False)}}
    profit = {"P1": {"summary": {"预算成本": 7728.5}}}
    out = M.reconcile_cost_budget(pp, profit)
    c = pp["P1"]["cost"]
    assert c["总预算"] == 7728.5
    assert c["剩余预算"] == 2691.5            # 7728.5 - 5037.0
    assert abs(c["消耗比"] - 5037.0 / 7728.5) < 1e-9
    assert c["项目超支"] is False
    assert c["核算"] == 5037.0                # 分子不变
    assert c["成本状态"] == "绿色预警"          # PMIS 文本不变
    assert c["交付超支"] is False
    assert out == [{"projectId": "P1", "pmisBudget": 5640.0, "profitBudget": 7728.5, "diff": -2088.5}]


def test_reconcile_超支翻转():
    # PMIS: 核算205041>总预算192006 → 原超支;改用损益预算206357后 剩余>0 → 不超支
    pp = {"P2": {"cost": _cost(192006.4, 205041.2, -13034.8, 1.068, True)}}
    profit = {"P2": {"summary": {"预算成本": 206356.6}}}
    M.reconcile_cost_budget(pp, profit)
    c = pp["P2"]["cost"]
    assert c["总预算"] == 206356.6
    assert c["项目超支"] is False
    assert abs(c["剩余预算"] - (206356.6 - 205041.2)) < 1e-9


def test_reconcile_一致项目与容差内不变():
    before_eq = _cost(100000.0, 60000.0, 40000.0, 0.6, False)
    before_tol = _cost(100000.0, 60000.0, 40000.0, 0.6, False)
    pp = {"EQ": {"cost": dict(before_eq)}, "TOL": {"cost": dict(before_tol)}}
    profit = {"EQ": {"summary": {"预算成本": 100000.0}},      # 差 0
              "TOL": {"summary": {"预算成本": 100000.5}}}      # 差 0.5 ≤ 1
    out = M.reconcile_cost_budget(pp, profit)
    assert pp["EQ"]["cost"] == before_eq
    assert pp["TOL"]["cost"] == before_tol
    assert out == []


def test_reconcile_单边数据不变():
    before = _cost(5640.0, 5037.0, 603.0, 0.893, False)
    pp = {"NOPROF": {"cost": dict(before)}, "NOBUDGET": {"cost": dict(before)}}
    profit = {"NOPROF": {"summary": {}},                       # 无 预算成本
              "NOBUDGET": {"summary": {"预算成本": None}}}       # 预算成本 None
    out = M.reconcile_cost_budget(pp, profit)
    assert pp["NOPROF"]["cost"] == before
    assert pp["NOBUDGET"]["cost"] == before
    assert out == []


def test_reconcile_损益预算非正数不覆盖():
    before = _cost(5000.0, 3000.0, 2000.0, 0.6, False)
    pp = {"ZERO": {"cost": dict(before)}}
    profit = {"ZERO": {"summary": {"预算成本": 0.0}}}           # 差>1 但 ≤0 → 守卫跳过
    out = M.reconcile_cost_budget(pp, profit)
    assert pp["ZERO"]["cost"] == before
    assert out == []


def test_reconcile_核算None安全():
    pp = {"NULLUSED": {"cost": _cost(5640.0, None, None, None, False)}}
    profit = {"NULLUSED": {"summary": {"预算成本": 7728.5}}}
    out = M.reconcile_cost_budget(pp, profit)
    c = pp["NULLUSED"]["cost"]
    assert c["总预算"] == 7728.5
    assert c["剩余预算"] is None
    assert c["消耗比"] is None
    assert c["项目超支"] is False
    assert out[0]["projectId"] == "NULLUSED"


def test_reconcile_无损益数据返回空且不改():
    before = _cost(5640.0, 5037.0, 603.0, 0.893, False)
    pp = {"P1": {"cost": dict(before)}}
    assert M.reconcile_cost_budget(pp, None) == []
    assert pp["P1"]["cost"] == before


def test_reconcile_无cost维度不崩():
    pp = {"NOCOST": {}}                                        # 项目无 cost 键
    profit = {"NOCOST": {"summary": {"预算成本": 7728.5}}}
    assert M.reconcile_cost_budget(pp, profit) == []
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_pmis.py -k reconcile -q`
Expected: FAIL（`AttributeError: module 'pmis' has no attribute 'reconcile_cost_budget'`）

- [ ] **Step 3: 写最小实现**

在 `pmis.py` 的 `derive_cost` 函数结束后（约 line 113，`derive_risk` 定义之前）插入：

```python
def reconcile_cost_budget(status_pmis: Dict[str, Dict[str, Any]],
                          project_profit: Optional[Dict[str, Dict[str, Any]]],
                          tol: float = 1.0) -> List[Dict[str, Any]]:
    """成本预算口径兜底:当 PMIS「项目总预算」与损益表「预算成本」分歧
    (两值皆存在 且 损益预算成本>0 且 |差|>tol 元)时,把成本口径分母改用损益预算成本,
    并连带重算 剩余预算/消耗比/项目超支(只动分母,核算不变);成本状态/交付超支 不动。
    一致的/单边数据/无损益的项目保持原样。就地修改 status_pmis[pid]["cost"],
    返回分歧清单供数据质量告警。"""
    mismatches: List[Dict[str, Any]] = []
    if not project_profit:
        return mismatches
    for pid, dims in status_pmis.items():
        cost = dims.get("cost")
        if not cost:
            continue
        pmis_total = cost.get("总预算")
        profit_budget = ((project_profit.get(pid) or {}).get("summary") or {}).get("预算成本")
        if pmis_total is None or profit_budget is None or profit_budget <= 0:
            continue
        if abs(pmis_total - profit_budget) <= tol:
            continue
        used = cost.get("核算")
        remain = (profit_budget - used) if used is not None else None
        cost["总预算"] = profit_budget
        cost["剩余预算"] = remain
        cost["消耗比"] = (used / profit_budget) if used is not None else None
        cost["项目超支"] = (remain is not None and remain < 0)
        mismatches.append({
            "projectId": pid,
            "pmisBudget": pmis_total,
            "profitBudget": profit_budget,
            "diff": round(pmis_total - profit_budget, 2),
        })
    return mismatches
```

确认 `pmis.py` 顶部已从 `typing` 导入 `Optional`（若无则加：`from typing import ..., Optional`）。

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_pmis.py -k reconcile -q`
Expected: PASS（8 passed）

- [ ] **Step 5: 提交**

```bash
git add pmis.py tests/test_pmis.py
git commit -m "feat(cost): reconcile_cost_budget 分歧改用损益预算成本并重算(只动分母) (V2.6.10)"
```

---

## Task 2: 接线 preprocess_data.py + 数据质量告警 + 真实数据冒烟

**Files:**
- Modify: `preprocess_data.py:229`（`data_quality["collectionParseErrors"] = ...` 之后）
- Verify: 真实数据跑全管线

**Interfaces:**
- Consumes: Task 1 的 `pmis.reconcile_cost_budget(project_pmis, project_profit)`（`project_pmis` 定义于 line 141、`project_profit` 定义于 line 174，此处两者皆在作用域）。
- Produces: `final_data["dataQuality"]["budgetSourceMismatch"] = {"count": int, "items": [...]}`。

- [ ] **Step 1: 接线**

在 `preprocess_data.py` line 229（`data_quality["collectionParseErrors"] = collection_parse_errors`）之后、line 231（`# === 10. 构建最终数据 ===`）之前插入：

```python
    # 成本预算口径兜底:PMIS总预算 与 损益预算成本 分歧时改用损益预算成本并重算,分歧清单入数据质量告警
    budget_mismatches = pmis.reconcile_cost_budget(project_pmis, project_profit)
    data_quality["budgetSourceMismatch"] = {"count": len(budget_mismatches), "items": budget_mismatches}
    if budget_mismatches:
        print(f"  [INFO] 预算口径分歧 {len(budget_mismatches)} 个项目,已改用损益预算成本并入数据质量告警")
```

- [ ] **Step 2: 语法编译**

Run: `python -m py_compile preprocess_data.py`
Expected: 无输出（成功）

- [ ] **Step 3: 真实数据跑全管线**

Run: `python preprocess_data.py`
Expected: 打印含 `[INFO] 预算口径分歧 7 个项目...`，末尾 `[OK] 数据已通过 schema 校验`

- [ ] **Step 4: 断言输出正确（真实基线）**

Run:
```bash
python -c "import json; d=json.load(open('data/analysis_data.json',encoding='utf-8')); bm=d['dataQuality']['budgetSourceMismatch']; assert bm['count']==7, bm['count']; c=d['projectPmis']['QAGD-SS-202603249009']['cost']; assert c['总预算']==7728.5, c['总预算']; assert abs(c['剩余预算']-2691.5)<0.01; assert c['项目超支'] is False; w=d['projectPmis']['WSGF-SS-202603259038']['cost']; assert w['项目超支'] is False, w['项目超支']; print('OK count=7, QAGD改后总预算7728.5/不超支, WSGF翻不超支')"
```
Expected: `OK count=7, QAGD改后总预算7728.5/不超支, WSGF翻不超支`

- [ ] **Step 5: 提交**

```bash
git add preprocess_data.py
git commit -m "feat(pipeline): 接入 reconcile_cost_budget + dataQuality.budgetSourceMismatch(7分歧项目) (V2.6.10)"
```

> 注：`data/analysis_data.json` 已 gitignore，Step 3 重算的产物不进提交；仅提交 `preprocess_data.py`。

---

## Task 3: 前端治理页告警组 + 单测

**Files:**
- Modify: `frontend/src/lib/governance.ts`（`dirty` 告警之后、约 line 152 之后追加）
- Test: `frontend/src/lib/governance.test.ts`

**Interfaces:**
- Consumes: `data.dataQuality.budgetSourceMismatch.items`（后端 Task 2 产出；TS 类型未含该键，用 `(dq as any)` 访问）。
- Produces: `buildHealthReport().alerts` 中新增一项 `{ key: 'budgetMismatch', ... }`。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/governance.test.ts` 内追加（沿用文件既有 `makeData`/`buildHealthReport` 引用；若辅助函数名不同，按文件现有约定构造 data）：

```ts
it('budgetSourceMismatch → 生成预算口径分歧告警组', () => {
  const d = makeData()
  ;(d.dataQuality as any).budgetSourceMismatch = {
    count: 1,
    items: [{ projectId: 'P-1', pmisBudget: 5640, profitBudget: 7728.5, diff: -2088.5 }],
  }
  const r = buildHealthReport(d)
  const g = r.alerts.find((a) => a.key === 'budgetMismatch')
  expect(g).toBeTruthy()
  expect(g!.count).toBe(1)
  expect(g!.rows).toHaveLength(1)
  expect((g!.rows[0] as any).projectId).toBe('P-1')
  expect(g!.columns.map((c) => c.key)).toContain('profitBudget')
})

it('无 budgetSourceMismatch → 告警组存在但 count=0(沉底)', () => {
  const r = buildHealthReport(makeData())
  const g = r.alerts.find((a) => a.key === 'budgetMismatch')
  expect(g).toBeTruthy()
  expect(g!.count).toBe(0)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/governance.test.ts -t budgetSourceMismatch`
Expected: FAIL（找不到 `budgetMismatch` 告警组，`g` 为 undefined）

- [ ] **Step 3: 写实现**

在 `frontend/src/lib/governance.ts` 的 `dirty` 告警块（约 line 149-152）之后追加：

```ts
  const budgetMismatch = ((dq as any)?.budgetSourceMismatch?.items ?? []) as Record<string, unknown>[]
  alerts.push({ key: 'budgetMismatch', label: '预算口径分歧：总预算≠损益预算成本', severity: 'mid', count: budgetMismatch.length,
    columns: [{ key: 'projectId', label: '项目编号' }, { key: 'pmisBudget', label: 'PMIS总预算' },
              { key: 'profitBudget', label: '损益预算成本' }, { key: 'diff', label: '差额' }],
    rows: budgetMismatch, exportName: '预算口径分歧.xlsx' })
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/governance.test.ts`
Expected: PASS（含新增 2 例，且既有用例不回归）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/governance.ts frontend/src/lib/governance.test.ts
git commit -m "feat(governance): 治理页新增预算口径分歧告警组 (V2.6.10)"
```

---

## Task 4: 版本 bump + verify 全绿 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: bump 版本**

`frontend/src/version.ts`：
```ts
export const APP_VERSION = 'V2.6.10'
export const RELEASE_DATE = '2026-07-05'
```

- [ ] **Step 2: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）。
（注：server 测试首跑偶发并行超时，若非本改动相关的 server 用例 flaky，重跑一次应确定性转绿。）

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md` 版本史顶部按现有条目格式新增 V2.6.10 一条，要点：
- 成本预算口径兜底：7 个 PMIS总预算≠损益预算成本 的分歧项目，分母改用损益预算成本并重算（只动分母、核算不变），超支数 36→35（`WSGF-SS-202603259038` 翻不超支）。
- 新增 `dataQuality.budgetSourceMismatch` 告警（治理页汇总+清单）。
- 根因在 PMIS 源数据（周期长走平台兜底）；**升级须点「更新数据」**。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: bump V2.6.10 + PROGRESS(成本预算口径兜底+分歧告警)"
```

---

## Task 5: 打包（控制者执行，PowerShell）

> 非 TDD 步骤，由控制者收尾执行；出增量更新包 + 升级手册。**⚠️ /pm 构建必须用 PowerShell**（Git Bash 会把 `--base=/pm/` 篡改成 `/Program Files/Git/pm/`）。

- [ ] **Step 1: 合分支到 master**

```bash
git checkout master && git merge --no-ff feat/v2_6_10-cost-budget-reconciliation
```

- [ ] **Step 2: PowerShell 构建 /pm 版 dist 并校验**

PowerShell：`cd frontend; npx vite build --base=/pm/`
校验 `frontend/dist/index.html` 内资源路径为 `="/pm/assets`（Grep 确认）。

- [ ] **Step 3: 生成更新包**

`python make_update_zip.py`（读 `version.ts` → `release/pmplatform-update-V2.6.10.zip`，glob 全根 `.py` + dist + 升级手册 + pmisdata）。校验 zip 含 `pmis.py`、`preprocess_data.py`、`deploy/升级手册-V2.6.10.md`。

- [ ] **Step 4: 重建默认 dist（否则本地 :8080 白屏）**

PowerShell：`cd frontend; npx vite build`，校验 `="/assets`。

- [ ] **Step 5: 写升级手册 + 提交**

新建 `deploy/升级手册-V2.6.10.md`（从 V2.6.9 增量；**头号注意=升级须点「更新数据」**、纯后端+前端 dist、无新页/依赖）。

```bash
git add deploy/升级手册-V2.6.10.md PROGRESS.md
git commit -m "docs(deploy): V2.6.10 升级手册(成本预算口径兜底) + 更新包"
```

---

## Self-Review（写完自查）

**1. Spec 覆盖：**
- spec §2 目标/边界 → Task 1（判据、只动分母、profit>0 守卫、不填空、核算不变）✓
- spec §3.1 落点 pmis.py 纯函数 → Task 1 ✓
- spec §3.1 preprocess 接线 → Task 2 ✓
- spec §3.2 dataQuality.budgetSourceMismatch → Task 2（后端）+ Task 3（前端渲染）✓
- spec §3.3 前端治理页 → Task 3 ✓
- spec §4 影响面（36→35、QAGD/WSGF）→ Task 2 Step 4 断言 ✓
- spec §5 测试（7 场景 + 真实冒烟）→ Task 1 单测 8 例 + Task 2 Step 3/4 ✓
- spec §6 版本 V2.6.10 + 更新数据 + 打包 → Task 4/5 ✓
- spec §7 不做什么 → Global Constraints 逐条约束 ✓

**2. 占位符扫描：** 无 TBD/TODO；每个代码步骤含完整代码。✓

**3. 类型一致：** `reconcile_cost_budget(project_pmis, project_profit, tol=1.0)` 签名在 Task 1 定义、Task 2 以 `pmis.reconcile_cost_budget(project_pmis, project_profit)` 调用一致；返回 `[{projectId,pmisBudget,profitBudget,diff}]` 键与 Task 3 前端列 `projectId/pmisBudget/profitBudget/diff` 一致。✓
