# S2 项目详情页修缮实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现本计划。步骤用 `- [ ]` 复选框追踪。

**Goal:** 修缮项目详情页 `/project/:id`：右栏动态长编号换行不出框，头部新增总体预算/交付外包/交付部门人工三类超支风险徽章。

**Architecture:** 总体超支金额经 `preprocess_data.py` 9e 段后端回填进 `Project.overspendAmount`（同源 `profit.overspend_amount`，避免前端复刻口径），schema 加字段后 `npm run gen:types` 同步 TS 类型；两类交付徽章前端从已有 `deliveryCosts` 白名单直算；右栏换行为 `EventTimeline.vue` 纯 CSS 修缮。依据 `docs/superpowers/specs/2026-06-14-S2-detail-fixes-design.md`（V1.0.2）。

**Tech Stack:** Python 标准库 + pydantic（后端）；Vue3 + Vite + TS + Vitest（前端）；theme.css 设计令牌。

**分级调度（用户钦定工作模式）：**

| 任务 | 难度 | 派发 | 理由 |
|---|---|---|---|
| T1 后端字段+9e 回填+gen:types | 常规 | sonnet 子代理 | 机械加字段+平凡循环，复用已测 `overspend_amount` |
| T2 EventTimeline 换行 CSS | 机械 | 主循环直做 | 3 行 CSS，无逻辑 |
| T3 详情页三类徽章+前端测试 | 常规偏易踩坑 | sonnet 子代理（opus 兜底） | TS 访问中文键 `deliveryCosts`+测试 harness 复用 |
| T4 版本+PROGRESS+全量 verify | 机械 | 主循环直做 | 收尾，需读现有 PROGRESS 精确改写 |

子代理产出一律经 git diff + pytest/vitest 核实，不取自报。

**任务顺序：** T1 →（T2 可并）→ T3（依赖 T1 的 `overspendAmount` TS 类型）→ T4。

---

### Task 1: 后端 `Project.overspendAmount` 字段 + 9e 回填 + 前端类型重生成

**Files:**
- Modify: `schema.py:157-166`（`Project` 模型加字段）
- Modify: `preprocess_data.py:1234-1243`（9e 回款率回填块之后加超支金额回填）
- Regenerate: `frontend/src/types/analysis.ts`（经 `npm run gen:types`，勿手改）

说明：`validate_and_write_json` 用 `json.dump(final_data)` 写原始 dict 且 `_Base` 为 `extra="allow"`，故运行期 `overspendAmount` 键设上即流入 JSON；schema 字段是为 `gen:types` 产出前端 TS 类型。两处都要。`overspend_amount`（`profit.py:217`）已有 pytest 覆盖（`tests/test_profit.py:116-130`），本任务复用不改其逻辑，不新增纯函数测试。

- [ ] **Step 1: `Project` 模型加 `overspendAmount` 字段**

`schema.py` 的 `Project` 类（`:157`），在 `deliveryCosts` 行后、`health` 行前插入一行：

```python
class Project(_Base):
    projectId: str
    projectName: str = ""
    projectManager: str = ""
    orgL4: str = ""
    isPresale: bool = False
    relatedClosedId: str = ""
    payment: ProjectPayment = ProjectPayment()
    deliveryCosts: List[DeliveryCostItem] = []
    overspendAmount: Optional[float] = None   # S2:整体超支金额(元,同源 profit.overspend_amount,可为负=未超支)
    health: ProjectHealth = ProjectHealth()
```

（`Optional` 已在 schema.py 导入并用于多处，无需改 import。）

- [ ] **Step 2: 校验 schema 可导入且接受新字段**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -c "import schema; p=schema.Project(projectId='x', overspendAmount=6000.0); print(p.overspendAmount)"`
Expected: 输出 `6000.0`，无异常。

- [ ] **Step 3: 9e 段加超支金额回填**

`preprocess_data.py` 的 9e 段，在「回款完成率切流水口径」块（`:1234-1243`，以 `print("  [OK] 回款完成率已切换为 流水累计÷合同总额 口径")` 结尾）之后、`# === 10. 构建最终数据 ===`（`:1245`）之前，插入：

```python

    # === S2: 整体超支金额回填(同源 profit.overspend_amount;无 profit 数据自动 None,供详情页风险徽章,与事件快照同口径) ===
    for p in dept_projects:
        p["overspendAmount"] = profit_mod.overspend_amount(project_profit.get(p["projectId"]))
```

要点：`project_profit` 已在 9e 段加载（`:1218`）；`overspend_amount(None)` 安全返回 `None`，故无条件遍历，不必 gate 文件 provided。

- [ ] **Step 4: 语法编译 + ruff**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m py_compile schema.py preprocess_data.py && python -m ruff check schema.py preprocess_data.py`
Expected: 无错误输出。

- [ ] **Step 5: 重生成前端类型并确认字段出现**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection/frontend" && npm run gen:types`
然后确认：`grep -n overspendAmount src/types/analysis.ts`
Expected: `analysis.ts` 的 `Project` 接口含 `overspendAmount?: number | null`（或等价生成形态），grep 有命中。

- [ ] **Step 6:（真实数据兜底，本机有 input/ 时执行）跑 preprocess 抽样核对**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && PYTHONIOENCODING=utf-8 python preprocess_data.py`
然后：`grep -o '"overspendAmount": [0-9.-]*' data/analysis_data.json | head`
Expected: `projects[].overspendAmount` 已填充（含正/负/0 与 null 混合），抽样一个已知超支项目核对数值符号与量级合理。
（若本机无 input/ 数据导致 preprocess 无法产出，跳过本步并在汇报中注明，由主循环在 T4 前补真实数据验证。）

- [ ] **Step 7: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add schema.py preprocess_data.py frontend/src/types/analysis.ts
git commit -m "feat(s2): Project.overspendAmount 字段+9e 后端回填(同源 overspend_amount)+前端类型同步"
```

---

### Task 2: 右栏动态换行适配（EventTimeline CSS）

**Files:**
- Modify: `frontend/src/components/EventTimeline.vue:37,39`

纯 CSS 布局修缮；jsdom 不计算布局，无新增断言，以现有 `EventTimeline.test.ts` 不回归 + 手动目视为验证。

- [ ] **Step 1: 改 `.ev-proj` 与 `.ev-summary` 样式**

`EventTimeline.vue` `<style scoped>` 内：

把（`:37`）
```css
.ev-proj { color: var(--accent); text-decoration: none; font-weight: 600; flex-shrink: 0; }
```
改为
```css
.ev-proj { color: var(--accent); text-decoration: none; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
```

把（`:39`）
```css
.ev-summary { color: var(--txt); }
```
改为
```css
.ev-summary { color: var(--txt); min-width: 0; overflow-wrap: anywhere; }
```

`.ev-type`（`:31` 的 `flex-shrink: 0`）与 `.ev-item`（`:30` 的 `flex-wrap: wrap`）保持不变。

- [ ] **Step 2: 跑 EventTimeline 既有测试防回归**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection/frontend" && npx vitest run src/components/EventTimeline.test.ts`
Expected: 全部通过。

- [ ] **Step 3: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add frontend/src/components/EventTimeline.vue
git commit -m "fix(s2): 右栏动态长项目编号换行适配(去 flex-shrink+overflow-wrap)"
```

---

### Task 3: 详情页三类超支风险徽章（TDD）

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.test.ts`（先写失败测试；沿用既有 `seed()`/`mountAt()`）
- Modify: `frontend/src/views/ProjectDetailView.vue`（computeds + 模板徽章 + CSS）

前置：Task 1 已生成 `Project.overspendAmount` TS 类型，故 `p.value?.overspendAmount` 可通过类型检查。

- [ ] **Step 1: 写失败测试**

在 `ProjectDetailView.test.ts` 的 `describe('ProjectDetailView', ...)` 末尾（`:238` 最后一个 `it` 之后、`})` 之前）追加：

```ts
  it('头部超支徽章:总体超支>5000 红', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].overspendAmount = 60000
    const w = await mountAt('/project/P-1')
    const badge = w.find('.pd-badge.over-danger')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('总体预算超支')
    expect(badge.text()).toContain('6万')
  })

  it('头部超支徽章:总体超支≤5000 黄', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].overspendAmount = 3000
    const w = await mountAt('/project/P-1')
    expect(w.find('.pd-badge.over-warn').exists()).toBe(true)
    expect(w.find('.pd-badge.over-danger').exists()).toBe(false)
    expect(w.text()).toContain('总体预算超支')
  })

  it('头部超支徽章:未超支(负/缺)不显示总体徽章', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].overspendAmount = -500
    const w = await mountAt('/project/P-1')
    expect(w.find('.pd-badge.over-danger').exists()).toBe(false)
    expect(w.find('.pd-badge.over-warn').exists()).toBe(false)
    expect(w.text()).not.toContain('总体预算超支')
  })

  it('头部超支徽章:两类交付超支按白名单出标签,非白名单不出', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].deliveryCosts = [
      { 类别: '交付外包服务成本', 预算金额: 100, 实际发生: 200, 剩余预算: -100, 消耗率: 2 },
      { 类别: '交付部门人工成本', 预算金额: 100, 实际发生: 150, 剩余预算: -50, 消耗率: 1.5 },
      { 类别: '差旅费', 预算金额: 100, 实际发生: 300, 剩余预算: -200, 消耗率: 3 },
    ]
    const w = await mountAt('/project/P-1')
    expect(w.text()).toContain('交付外包服务成本超支')
    expect(w.text()).toContain('交付部门人工成本超支')
    expect(w.text()).not.toContain('差旅费超支')
  })

  it('头部超支徽章:基线项目(无超支金额+无交付超支)不渲染任何超支徽章', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    expect(w.find('.pd-badge.over-danger').exists()).toBe(false)
    expect(w.find('.pd-badge.over-warn').exists()).toBe(false)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection/frontend" && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: 5 条新测试 FAIL（徽章不存在），既有测试仍 PASS。

- [ ] **Step 3: 加 computeds**

`ProjectDetailView.vue` `<script setup>`，在头部徽章区（`rating` 定义 `:34` 之后）追加：

```ts
// —— S2:三类超支风险标记 ——
const overBudget = computed(() => {
  const amt = p.value?.overspendAmount
  if (amt == null || amt <= 0) return null
  return { amount: amt, level: amt > 5000 ? 'danger' : 'warn' }
})
const DELIVERY_OVER_CATS = ['交付外包服务成本', '交付部门人工成本']
const deliveryOverBadges = computed(() =>
  (p.value?.deliveryCosts ?? [])
    .filter((c) => DELIVERY_OVER_CATS.includes(c.类别) && c.预算金额 != null && c.实际发生 != null && c.实际发生 > c.预算金额)
    .map((c) => c.类别),
)
```

- [ ] **Step 4: 加模板徽章**

`ProjectDetailView.vue` 模板头部，把 HealthBadge 行（`:210`）改为其后追加两行：

```html
            <HealthBadge :overall="p.health?.overall || '无数据'" />
            <span v-if="overBudget" class="pd-badge" :class="`over-${overBudget.level}`">总体预算超支 {{ fmtWan(overBudget.amount) }}万</span>
            <span v-for="cat in deliveryOverBadges" :key="cat" class="pd-badge over-danger">{{ cat }}超支</span>
```

- [ ] **Step 5: 加徽章样式**

`ProjectDetailView.vue` `<style scoped>`，在 `.pd-badge.origin`（`:338`）之后追加：

```css
.pd-badge.over-danger { background: var(--danger-bg); color: var(--danger-text); }
.pd-badge.over-warn { background: var(--warn-bg); color: var(--warn-text); }
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection/frontend" && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: 全部 PASS（含 5 条新测试）。

- [ ] **Step 7: 类型检查 + 构建**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection/frontend" && npm run typecheck && npm run build`
Expected: 均无错误。

- [ ] **Step 8: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(s2): 详情页头部三类超支风险徽章(总体预算分级+交付外包/部门人工)+测试"
```

---

### Task 4: 版本号 + PROGRESS + 全量验证（收尾，主循环执行）

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 升版本号**

`frontend/src/version.ts` 改为：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.0.2'
export const RELEASE_DATE = '2026-06-14'
```

（`AboutView.vue` 动态读取 `APP_VERSION`/`RELEASE_DATE`，无需改；其测试 `toContain(APP_VERSION)` 随之自洽。）

- [ ] **Step 2: 更新 PROGRESS.md**

读取现有 `PROGRESS.md`，将 S2 从「进行中」移除，在「已完成/版本记录」相应位置加一条：

```
- V1.0.2（2026-06-14）S2 详情页修缮：右栏动态长编号换行适配；头部三类超支风险徽章（总体预算超支 5000 元阈值分级红/黄；交付外包服务成本、交付部门人工成本超支即红）。总体超支金额经 9e 后端回填，同源 profit.overspend_amount。
```

（精确措辞以现有 PROGRESS 的版本记录格式为准，保持风格一致。）

- [ ] **Step 3: 全量门禁**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。

- [ ] **Step 4: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(s2): 版本 V1.0.2(2026-06-14)+PROGRESS 收尾记录"
```

---

## 收尾

全部任务完成且 master 外分支 `verify.sh` 全绿后，用 superpowers:finishing-a-development-branch 收束（用户惯例选「1 合并回 master」：`git checkout master && git merge --no-ff <branch>` → master 上复跑 `verify.sh` → 删分支）。

## 自检（writing-plans 强制）

- **spec 覆盖**：spec §1 右栏换行→T2；§2.1 后端回填+schema→T1；§2.2 交付直算→T3 computeds；§2.3 徽章+CSS→T3；§3 测试→T1 Step6/T3 Step1-2/T4 Step3；§4 版本→T4。无遗漏。
- **占位符**：无 TBD/TODO；每代码步含完整代码。PROGRESS 精确措辞依赖现有文件格式，已标注由主循环读后改写（文档任务，非代码占位）。
- **类型一致**：`overspendAmount`（schema/preprocess/analysis.ts/`p.value?.overspendAmount`）、`overBudget.level`(`'danger'|'warn'`)→CSS `.over-danger`/`.over-warn`、`deliveryOverBadges` 返回 `string[]`→`v-for cat`，三处命名贯通一致。
- **依赖顺序**：T3 依赖 T1 的 TS 类型，计划已声明 T1→T3 顺序。
