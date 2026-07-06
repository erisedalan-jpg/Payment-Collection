# V2.6.12 关注原因「总成本超支」按 5000 元拆两档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/projects` 关注原因列的「总成本超支」按超支额 `overspendAmount > 5000元` 拆成「总成本超支大于5000」「总成本超支小于5000」两档，列与列筛选自动呈现两档，同时保持首页成本超支桶、下钻、costdetail 口径不变。

**Architecture:** 纯前端。核心是 `lib/riskReasons.ts` 的一个 `RiskCategory` 拆分（改联合类型 → 全仓消费方须一起改，否则 typecheck 红），用共享常量 `TOTAL_OVERSPEND_CATS` 对齐三处「是否总成本超支」判定消费方（riskClassify/projectList/costAnalysis）。因联合类型改动使整支波及原子耦合，Task 1 为一整块协调改动（改完 repo 才重新全绿），Task 2 收官。

**Tech Stack:** Vue3 + TS + Vitest。

## Global Constraints

- 交流与文案用**简体中文**；**不使用任何 emoji**。
- 版本单一来源 `frontend/src/version.ts`；本期 Z 级 → **V2.6.12**，从 V2.6.11 增量。
- **纯前端改动，升级无需点「更新数据」**（不改后端/schema/preprocess）。
- 阈值对齐平台既有口径：`overspendAmount > 5000`（元，严格 >）为「大于5000」档；`≤ 5000`（含 =5000，及 PMIS `项目超支` flag / 消耗比>1 命中但 `over ≤ 0` 的 flag 型）为「小于5000」档。
- 两个新标签字面量固定为 `'总成本超支大于5000'` / `'总成本超支小于5000'`（pill 与列筛选选项都用它）。
- 「是否总成本超支」判定的消费方一律用共享常量 `TOTAL_OVERSPEND_CATS`，勿散写字面量。
- 保证不变：首页「成本超支」桶计数与视觉、首页下钻 `/projects?riskCategory=成本超支`、costdetail「总成本超支数」口径。
- 完成定义：代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。

---

### Task 1: 拆分「总成本超支」两档 + 对齐三消费方 + 更新测试（原子）

**Files:**
- Modify: `frontend/src/lib/riskReasons.ts`（类型联合 `:5`、新增常量、生产段 `:48-54`）
- Modify: `frontend/src/lib/riskClassify.ts`（import `:1`、COST_SPLIT `:56`）
- Modify: `frontend/src/lib/projectList.ts`（import `:3`、成本超支桶 `:112`、注释 `:43`）
- Modify: `frontend/src/lib/costAnalysis.ts`（import `:2`、totalOverspend `:65`）
- Test: `frontend/src/lib/riskReasons.test.ts`（成本超支 describe `:115-153`、顺序 test `:202/207/208`）
- Test: `frontend/src/lib/riskClassify.test.ts`（fixture `:117/156/167/183`）
- Test: `frontend/src/lib/projectList.test.ts`（fixture `:203/229`、精确匹配 test `:215-217`）
- Test: `frontend/src/lib/crossFilter.test.ts`（fixture `:50`、断言 `:56`）

**Interfaces:**
- Produces: `RiskCategory` 联合含 `'总成本超支大于5000' | '总成本超支小于5000'`（替换 `'总成本超支'`）；`export const TOTAL_OVERSPEND_CATS = ['总成本超支大于5000', '总成本超支小于5000'] as const`。
- Consumes: 无上游任务；依赖既有 `riskReasons`/`riskClassify`/`projectList`/`costAnalysis` 现状。

- [ ] **Step 1: 改测试为期望两档（先红）——`riskReasons.test.ts`**

把 `frontend/src/lib/riskReasons.test.ts` 第 115-153 行整个 `describe('riskReasons — 成本超支拆分', ...)` 块替换为：

```ts
describe('riskReasons — 总成本超支按 5000 拆两档', () => {
  it('overspendAmount > 5000 → 总成本超支大于5000(detail 显万)', () => {
    const p = baseProject({ overspendAmount: 12000 })
    const r = riskReasons(p).find((x) => x.category === '总成本超支大于5000')
    expect(r).toBeTruthy()
    expect(r!.detail).toContain('1.2')
  })
  it('0 < overspendAmount ≤ 5000 → 总成本超支小于5000', () => {
    const p = baseProject({ overspendAmount: 3000 })
    const r = riskReasons(p).find((x) => x.category === '总成本超支小于5000')
    expect(r).toBeTruthy()
    expect(r!.detail).toContain('0.3')
  })
  it('overspendAmount = 5000(边界,严格 >)→ 小于5000', () => {
    const p = baseProject({ overspendAmount: 5000 })
    expect(riskReasons(p).some((x) => x.category === '总成本超支小于5000')).toBe(true)
    expect(riskReasons(p).some((x) => x.category === '总成本超支大于5000')).toBe(false)
  })
  it('PMIS 项目超支 flag(无 overspendAmount)→ 小于5000(detail 项目超支)', () => {
    const p = baseProject({})
    const pmis = { cost: { 项目超支: true } } as any
    const r = riskReasons(p, pmis).find((x) => x.category === '总成本超支小于5000')
    expect(r).toBeTruthy()
    expect(r!.detail).toBe('项目超支')
  })
  it('消耗比>1 且 overspendAmount=0 且项目超支 false → 小于5000', () => {
    const p = baseProject({ overspendAmount: 0 })
    const pmis = basePmis({ cost: { 项目超支: false, 消耗比: 1.1 } })
    expect(riskReasons(p, pmis).some((x) => x.category === '总成本超支小于5000')).toBe(true)
  })
  it('cost.交付超支===true 命中交付成本超支', () => {
    const p = baseProject({})
    const pmis = { cost: { 交付超支: true } } as any
    expect(riskReasons(p, pmis).some((x) => x.category === '交付成本超支')).toBe(true)
  })
  it('总(某档)/交付可同时出现', () => {
    const p = baseProject({ overspendAmount: 5000 })
    const pmis = { cost: { 交付超支: true } } as any
    const cats = riskReasons(p, pmis).map((x) => x.category)
    expect(cats).toContain('总成本超支小于5000')
    expect(cats).toContain('交付成本超支')
  })
  it('overspendAmount ≤ 0、项目超支 false、消耗比 < 1 → 两档均不命中', () => {
    const p = baseProject({ overspendAmount: 0 })
    const pmis = basePmis({ cost: { 项目超支: false, 消耗比: 0.8 } })
    const cats = riskReasons(p, pmis).map((x) => x.category)
    expect(cats).not.toContain('总成本超支大于5000')
    expect(cats).not.toContain('总成本超支小于5000')
  })
})
```

在同文件顺序 test（`:188-210` 的 `'顺序为 回款延期→...'`，fixture `overspendAmount: 5000`）里，把 3 处 `'总成本超支'` 改为 `'总成本超支小于5000'`：
- `expect(categories).toContain('总成本超支')` → `expect(categories).toContain('总成本超支小于5000')`
- `expect(categories.indexOf('里程碑滞后')).toBeLessThan(categories.indexOf('总成本超支'))` → `...categories.indexOf('总成本超支小于5000'))`
- `expect(categories.indexOf('总成本超支')).toBeLessThan(categories.indexOf('交付成本超支'))` → `expect(categories.indexOf('总成本超支小于5000')).toBeLessThan(...)`

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/riskReasons.test.ts`
Expected: FAIL —— 找不到 `'总成本超支大于5000'/'小于5000'`（生产端仍产 `'总成本超支'`）。

- [ ] **Step 3: 实现生产端 `riskReasons.ts`**

3a. 第 5 行类型联合，把 `'总成本超支'` 换成两档：
```ts
export type RiskCategory = '回款延期' | '里程碑滞后' | '总成本超支大于5000' | '总成本超支小于5000' | '交付成本超支' | '风险未闭环' | '数据异常'
```

3b. 在 `RiskReason` 接口定义之后（`:15` 之后、`MILESTONE_LAG_KEYWORDS` 之前）新增导出常量：
```ts
/** 「总成本超支」两档 category（按 overspendAmount 是否 > 5000 元拆分）。判定「是否总成本超支」的消费方须用此常量，勿散写字面量。 */
export const TOTAL_OVERSPEND_CATS = ['总成本超支大于5000', '总成本超支小于5000'] as const
```

3c. 第 48-54 行「3. 总成本超支」段落替换为（保持原 if/else 结构，只把 category 改按 `over > 5000` 取档）：
```ts
  // 3. 总成本超支(整体预算维度):overspendAmount > 0 优先；否则 PMIS 项目超支 flag 或消耗比 > 1；
  //    再按 overspendAmount 是否 > 5000 元拆「大于5000/小于5000」两档(与 costdetail 卡「超支大于5000」同阈值)。
  const over = project.overspendAmount ?? 0
  const overCat: RiskCategory = over > 5000 ? '总成本超支大于5000' : '总成本超支小于5000'
  if (over > 0) {
    out.push({ category: overCat, detail: `超支 ${(over / 10000).toFixed(1)} 万`, tone: 'danger' })
  } else if ((pmis?.cost?.['项目超支']) || ((pmis?.cost?.['消耗比'] ?? 0) > 1)) {
    out.push({ category: overCat, detail: '项目超支', tone: 'danger' })
  }
```

- [ ] **Step 4: 跑 riskReasons 测试确认通过**

Run: `cd frontend && npx vitest run src/lib/riskReasons.test.ts`
Expected: PASS（本文件全绿）。此时全仓 typecheck 与其它 test 仍会红（消费方/其它 fixture 还引用旧字面量），下一步修。

- [ ] **Step 5: 对齐三消费方**

5a. `frontend/src/lib/riskClassify.ts` 第 1 行 import 由 type-only 改带值：
```ts
import { TOTAL_OVERSPEND_CATS, type RiskReason } from './riskReasons'
```
第 56 行：
```ts
  const COST_SPLIT = new Set<string>([...TOTAL_OVERSPEND_CATS, '交付成本超支'])
```

5b. `frontend/src/lib/projectList.ts` 第 3 行 import 补常量：
```ts
import { riskReasons, TOTAL_OVERSPEND_CATS, type RiskReason } from './riskReasons'
```
第 112 行：
```ts
        if (!r.riskReasons.some(rr => rr.category === '交付成本超支' || (TOTAL_OVERSPEND_CATS as readonly string[]).includes(rr.category))) return false
```
第 43 行注释里的取值列表把 `总成本超支` 更新为两档（仅注释，便于后人）：
```ts
  riskCategory: string  // '' 或 '回款延期'|'里程碑滞后'|'总成本超支大于5000'|'总成本超支小于5000'|'交付成本超支'|'风险未闭环'|'数据异常'|'健康度低'
```

5c. `frontend/src/lib/costAnalysis.ts` 第 2 行 import 补常量：
```ts
import { riskReasons, TOTAL_OVERSPEND_CATS } from './riskReasons'
```
第 65 行：
```ts
    const totalOverspend = cats.some((c) => (TOTAL_OVERSPEND_CATS as readonly string[]).includes(c))
```
（第 83 行 `deliveryOverspend: cats.includes('交付成本超支')` 不动。）

- [ ] **Step 6: 更新其它 test fixture 里的旧字面量**

6a. `frontend/src/lib/riskClassify.test.ts`：把 4 处 `category: '总成本超支'` 改为 `category: '总成本超支大于5000'`（`:117` makeRow fixture、`:156`、`:167`、`:183` 的 `as any` fixture；这些测试只断言 remap 进「成本超支」桶，用任一档标签均成立）。

6b. `frontend/src/lib/projectList.test.ts`：
- 第 203 行 `makeRow('B', '关注', ['里程碑滞后', '总成本超支'])` → `makeRow('B', '关注', ['里程碑滞后', '总成本超支大于5000'])`
- 第 215-217 行精确匹配 test 改为对新标签：
  ```ts
  it('riskCategory="总成本超支大于5000" → 只含命中行', () => {
    const res = filterProjectRows(rows, { ...F0, riskCategory: '总成本超支大于5000' })
    expect(res.map(r => r.projectId)).toEqual(['B'])
  })
  ```
- 第 229 行 `makeRow('X1', '健康', ['总成本超支'])` → `makeRow('X1', '健康', ['总成本超支大于5000'])`

6c. `frontend/src/lib/crossFilter.test.ts`：
- 第 50 行 `{ category: '总成本超支' }` → `{ category: '总成本超支大于5000' }`
- 第 56 行 `expect(u).toContain('总成本超支')` → `expect(u).toContain('总成本超支大于5000')`

- [ ] **Step 7: 全仓类型检查 + 全量 vitest**

Run: `cd frontend && npm run typecheck && npx vitest run`
Expected: typecheck 无错（`RiskCategory` 联合改动后无残留旧字面量比较）；vitest 全绿（无回归）。

- [ ] **Step 8: 真机冒烟（人工，控制者/人工负责，实现子代理跳过）**

`python server.py` + `cd frontend && npm run dev`，`/projects`：关注原因列出现「总成本超支大于5000」「总成本超支小于5000」两档 pill、列筛选出现两选项；首页「成本超支」桶计数与下钻不变；`/insight/costdetail`「总成本超支数」不变。

- [ ] **Step 9: 提交**

```bash
git add frontend/src/lib/riskReasons.ts frontend/src/lib/riskClassify.ts frontend/src/lib/projectList.ts frontend/src/lib/costAnalysis.ts frontend/src/lib/riskReasons.test.ts frontend/src/lib/riskClassify.test.ts frontend/src/lib/projectList.test.ts frontend/src/lib/crossFilter.test.ts
git commit -m "feat(projects): 关注原因「总成本超支」按5000元拆大于/小于两档(共享常量对齐首页桶/下钻/costdetail口径) (V2.6.12)"
```

---

### Task 2: bump V2.6.12 + verify 全绿 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts` 改为：
```ts
export const APP_VERSION = 'V2.6.12'
export const RELEASE_DATE = '2026-07-06'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法 + ruff + pytest + 前端 typecheck/vitest/build）。若前端未跑到，另跑 `cd frontend && npm run typecheck && npx vitest run && npm run build`。

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md` 顶部新增 V2.6.12 条目、旧条目降为「上一版本」，一句话概述：`/projects` 关注原因列「总成本超支」按 `overspendAmount>5000元` 拆「大于5000/小于5000」两档（列与列筛选自动两档），共享常量 `TOTAL_OVERSPEND_CATS` 对齐首页成本超支桶/下钻/costdetail 口径不变；纯前端、升级无需点更新数据。照现有条目格式风格写。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: bump V2.6.12 + PROGRESS(关注原因总成本超支拆5000两档)"
```

---

## 打包（控制者收尾，PowerShell）

> 非实现任务；两任务全绿合 master 后由控制者执行，照 V2.6.11 惯例（纯前端）。

- 合 `master`：`git checkout master && git merge --no-ff <feat 分支>`。
- **PowerShell** 构建 /pm：`cd frontend; npx vite build --base=/pm/`，校验 `dist/index.html` 含 `="/pm/assets`。
- 写 `deploy/升级手册-V2.6.12.md`（从 V2.6.11 增量；**头号注意=纯前端、升级无需点「更新数据」**，覆盖 dist 强刷即生效；无新页/pageKey/依赖；关注原因列多出两档标签、旧「总成本超支」不再出现）。
- `python make_update_zip.py` 出 `release/pmplatform-update-V2.6.12.zip`。
- **构建后重建默认 dist**：`cd frontend; npx vite build`（校验 `="/assets`），否则本地 :8080 白屏。

---

## Self-Review

**Spec 覆盖：**
- 生产端拆两档（阈值 >5000、flag 型归小于、detail/tone/顺序不变）→ Task 1 Step 3。✓
- 类型联合 + 共享常量 → Task 1 Step 3a/3b。✓
- 三消费方对齐（riskClassify/projectList/costAnalysis 口径不变）→ Task 1 Step 5。✓
- 自动生效（ProjectsView pill、crossFilter 两选项）→ 无需改代码，Step 8 冒烟核。✓
- 测试更新（riskReasons/riskClassify/projectList/crossFilter）→ Task 1 Step 1/6。✓
- 版本/验证/打包 → Task 2 + 打包段。✓

**Placeholder 扫描：** 无 TBD/TODO；每个改代码步骤含完整代码或确切 old→new 与命令。✓

**类型一致：** `TOTAL_OVERSPEND_CATS`（Step 3b 产出，`readonly ['总成本超支大于5000','总成本超支小于5000']`）在 Step 5a/5b/5c 三消费方以 `as readonly string[]` 拓宽后 `.includes(...)` 消费，签名一致；`RiskCategory` 联合两新字面量在生产端 `overCat` 与各测试断言中一致。✓
