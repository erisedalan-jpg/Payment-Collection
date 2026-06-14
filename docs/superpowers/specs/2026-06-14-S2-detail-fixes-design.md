# S2 项目详情页修缮设计（V1.0.2）

> 状态：设计已与用户口头确认，进入 spec。
> 范围：项目详情页 `/project/:id` 两处局部修缮——右栏动态换行 + 三类超支风险标记。
> 版本定级：子页面/页内局部调整 → Z 位递增，V1.0.1 → **V1.0.2**（发布日 2026-06-14）。
> 关联：复用 S1 已落地的 `profit.overspend_amount` 与 `projects.delivery_overspend_cats` 口径，不新造算法。

## 0. 背景

用户两条反馈：

1. **右栏「项目动态」栏目有内容超出 card 范围**，举例项目 `WSGF-SS-202603259038`。实测：该项目事件摘要仅 4 字（「超支出现」），**溢出根因不是长摘要，而是 `EventTimeline.vue` 的项目名链接 `.ev-proj` 设了 `flex-shrink: 0` 且无断行规则**——当 `projectName` 为空回退显示项目编号（`WSGF-SS-202603259038`，单个长 Latin/数字 token）时，在右栏窄卡（详情页右栏固定 300px）内既不收缩也不折行，撑出卡外。
2. **项目风险标记需区分三类超支**，每类只要超支即报风险并打对应标签：
   - 总体预算超支（沿用 S1 的 5000 元阈值分级）
   - 交付外包服务成本超支（只要超支即报）
   - 交付部门人工成本超支（只要超支即报）

## 1. 右栏动态换行适配（CSS-only，三处同组件受益）

`EventTimeline.vue` 被首页右栏、详情页右栏、`/activity` 三处复用，改其样式一处修缮三处受益。

**当前样式（`frontend/src/components/EventTimeline.vue:30,37,39`）：**

```css
.ev-item { display: flex; align-items: baseline; gap: var(--sp-2); padding: var(--sp-1) 0; font-size: var(--fs-2); flex-wrap: wrap; }
.ev-proj { color: var(--accent); text-decoration: none; font-weight: 600; flex-shrink: 0; }
.ev-summary { color: var(--txt); }
```

**改为：**

```css
.ev-proj { color: var(--accent); text-decoration: none; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.ev-summary { color: var(--txt); min-width: 0; overflow-wrap: anywhere; }
```

要点：
- `.ev-proj` 去掉 `flex-shrink: 0`（这是溢出根因——禁止收缩使其宽于容器时直接出框）。
- `.ev-proj`、`.ev-summary` 均加 `min-width: 0`（允许 flex 子项缩到内容宽度以下）+ `overflow-wrap: anywhere`（长编号 token 在任意位置断行）。
- `.ev-type`（类型徽标，`:31` 的 `flex-shrink: 0`）**保持不变**——短徽标应整体不拆。
- `.ev-item` 的 `flex-wrap: wrap` 保持不变。

此项为纯 CSS 布局修缮，jsdom 不计算布局，**无自动化测试**，以手动启动右栏渲染长编号项目目视确认（不出框、长编号折行）为验证手段。

## 2. 三类超支风险标记（详情页头部徽章）

落位：详情页头部徽章排 `.pd-head`（`ProjectDetailView.vue:204-211`），追加在现有「阶段/已暂停/评级/原项目/健康度」之后。徽章随头部常驻，不依赖当前 Tab，符合「风险标记」需随时可见的诉求。徽章一律「淡底+深字」三态（CLAUDE.md 设计规范）。

| 徽章 | 触发条件 | 颜色 | 文案 |
|---|---|---|---|
| 总体预算超支 | `overspendAmount > 5000`（元） | danger（`--danger-bg`/`--danger-text`） | `总体预算超支 {万值}万` |
| 总体预算超支 | `0 < overspendAmount ≤ 5000`（元） | warn（`--warn-bg`/`--warn-text`） | `总体预算超支 {万值}万` |
| 交付外包服务成本超支 | `交付外包服务成本` 类目 实际发生 > 预算金额 | danger | `交付外包服务成本超支` |
| 交付部门人工成本超支 | `交付部门人工成本` 类目 实际发生 > 预算金额 | danger | `交付部门人工成本超支` |

`overspendAmount ≤ 0`（未超支）或 `null`（缺数据）→ 不显示总体徽章。两类交付徽章无阈值，仅「超支即报」（与 S1 `delivery_overspend_cats` 同判据：预算/实际任一缺失不判）。

### 2.1 数据通路：总体超支金额后端回填（同源，避免口径漂移）

总体超支金额口径复杂（非售前=实际成本−预算成本；售前=当前消耗−桥接科目2原剩余预算），已封装在 `profit.overspend_amount`（`profit.py:217`），并已被快照/事件层使用（`snapshots.py:55`）。**为保证详情页徽章与事件/快照同口径、避免前端复刻算法漂移，超支金额由后端回填进 `Project` 模型，前端只读不算。**

`Project` 模型当前无该字段（仅快照条目有），需新增。

**`schema.py` — `Project` 模型（`schema.py:157-166`）追加字段：**

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

**`preprocess_data.py` 9e 段 — 在回款完成率回填块之后（`preprocess_data.py:1243` 后）追加回填：**

```python
    # === S2: 整体超支金额回填(同源 profit.overspend_amount;无 profit 数据自动 None,供详情页风险徽章,与事件快照同口径) ===
    for p in dept_projects:
        p["overspendAmount"] = profit_mod.overspend_amount(project_profit.get(p["projectId"]))
```

要点：
- `project_profit` 在 9e 段已加载（`preprocess_data.py:1218`），键为项目编号（售前项目含 bridge），与 `snapshots.py:55` 取法一致。
- `overspend_amount(None)` 安全返回 `None`，故**无条件遍历**，不必 gate 在文件 provided 上。
- 改 schema 后须重生成前端类型：`cd frontend && npm run gen:types`，使 `src/types/analysis.ts` 的 `Project` 含 `overspendAmount`。

### 2.2 数据通路：两类交付超支前端直算（已有数据，无需后端改动）

`deliveryCosts`（`DeliveryCostItem[]`，含 `类别/预算金额/实际发生/剩余预算/消耗率`，`schema.py:141-146`）已随 `Project` 下发前端，详情页 `costRows` 已在用（`ProjectDetailView.vue:172`）。两类交付徽章纯前端从该数组筛选，**不动后端**。

注意：用户只要这**两个具名类目**（`交付外包服务成本`、`交付部门人工成本`），不是 S1 `delivery_overspend_cats` 的「全部超支类目」。故前端用固定白名单筛选，不复用全量列表。

### 2.3 前端徽章实现（`ProjectDetailView.vue`）

**`<script setup>` 追加 computed（紧邻头部徽章区 `:31-35` 之后）：**

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

（阈值 5000 与 `overspendAmount` 同为元口径；`fmtWan` 已导入，`fmtWan(amt)`=元/10000 显示万。）

**模板 — 头部徽章排（`ProjectDetailView.vue:210` HealthBadge 之后）追加：**

```html
            <HealthBadge :overall="p.health?.overall || '无数据'" />
            <span v-if="overBudget" class="pd-badge" :class="`over-${overBudget.level}`">总体预算超支 {{ fmtWan(overBudget.amount) }}万</span>
            <span v-for="cat in deliveryOverBadges" :key="cat" class="pd-badge over-danger">{{ cat }}超支</span>
```

**样式 — 追加两个徽章类（`ProjectDetailView.vue` `<style>` 内 `.pd-badge.origin` 之后 `:338`）：**

```css
.pd-badge.over-danger { background: var(--danger-bg); color: var(--danger-text); }
.pd-badge.over-warn { background: var(--warn-bg); color: var(--warn-text); }
```

## 3. 测试与验证

**前端单测（`frontend/src/views/ProjectDetailView.test.ts` 追加）**。该文件已有 `seed()`（注入完整 mock `ds.data`，含项目 P-1 非售前/P-2 售前）与 `mountAt(path)`（push 路由后 `mount`）两个 helper。新测试沿用：`seed()` → 取 `const ds = useDataStore()` 直接改 `ds.data.projects` 上 P-1 的字段 → `mountAt('/project/P-1')` → 断言头部徽章。要覆盖：
- P-1 `overspendAmount = 60000` → 存在 `.pd-badge.over-danger`，文本含「总体预算超支」「6万」（`fmtWan(60000)`=6）。
- P-1 `overspendAmount = 3000` → 存在 `.pd-badge.over-warn`，文本含「总体预算超支」；无 `.pd-badge.over-danger`。
- P-1 `overspendAmount = -500`（及不设/`undefined`）→ 无 `.pd-badge.over-danger`、无 `.pd-badge.over-warn`、文本不含「总体预算超支」。
- P-1 `deliveryCosts` 置为含 `{ 类别:'交付外包服务成本', 预算金额:100, 实际发生:200, 剩余预算:-100, 消耗率:2 }` → 文本含「交付外包服务成本超支」；`交付部门人工成本`（实际>预算）同理出现；非白名单类目（如 `差旅费` 实际>预算）→ 文本不含其「超支」徽章。

（注：现有 seed 的 P-1 `deliveryCosts` 仅 `内部人员成本`、无 `overspendAmount`，故基线项目默认不渲染任何超支徽章——可顺带加一条「默认无超支徽章」断言守护回归。）

**后端**：`profit.overspend_amount` / `projects.delivery_overspend_cats` 已有 pytest 覆盖（`tests/test_profit.py:116-130`、`tests/test_projects.py:281-282`），本批不改其逻辑，无需新增纯函数测试。9e 回填为既测函数的平凡遍历，以**真实数据验证**兜底：跑一次 `preprocess_data.py`，确认 `data/analysis_data.json` 中 `projects[].overspendAmount` 已填充，抽样一个已知超支项目核对数值符号与量级。

**EventTimeline**：纯 CSS，无自动化测试，手动启动目视确认长编号折行不出框。

**全量门禁**：`bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。

## 4. 版本与收尾

- `frontend/src/version.ts`：`APP_VERSION` → `V1.0.2`，`RELEASE_DATE` → `2026-06-14`。
- `PROGRESS.md`：S2 收尾记录 + 进行中条目清理。
- 合并：`git checkout master && git merge --no-ff <branch>` → master 上 `verify.sh` 复跑全绿 → 删分支。

## 5. 不做清单（YAGNI）

- 不在「风险」Tab 内另做超支区块——头部徽章常驻已满足「随时可见的风险标记」诉求。
- 不显示交付超支的具体金额——用户只要「对应标签」，标签即类目名+超支。
- 不扩展到其余五类交付成本类目——用户明确只要外包服务、部门人工两类具名徽章。
- 不改 `EventTimeline` 结构/DOM，仅调样式。
- 不动 `delivery_overspend_cats`/事件层——其为「全部超支类目」用途，与本批「两具名类目徽章」不同语义，各自独立。
