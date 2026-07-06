# V2.6.12 关注原因「总成本超支」按 5000 元拆两档 设计

> 版本：V2.6.12（Z 级，页内口径细化）
> 日期：2026-07-06
> 背景来源：用户要求把 `/projects` 关注原因列的「总成本超支」一个判断拆成两个——「总成本超支大于5000」「总成本超支小于5000」，并在该列展示。

## 1. 问题与目标

- `/projects` 关注原因列的 pill 直接展示 `riskReason.category`（`ProjectsView.vue:189`，`:title` 挂 `detail`），列筛选（`crossFilter`）也按 `category` 去重取选项并匹配。
- 现「总成本超支」是单一 `category`（`riskReasons.ts:51/53`）。目标：按超支额 `overspendAmount` 是否 **> 5000 元** 拆成两个 `category`——`总成本超支大于5000` / `总成本超支小于5000`，pill 与列筛选自动呈现两档。
- **阈值对齐平台既有口径**：`costAnalysis.ts:11` 与 costdetail 卡「超支大于5000」已用 `overspendAmount > 5000`（元，严格 >）。`> 5000` → 大于档；`≤ 5000`（含 =5000，及 PMIS「项目超支」flag / 消耗比>1 命中但 `over ≤ 0` 的 flag 型）→ 小于档。
- **保证首页「成本超支」桶、首页下钻、costdetail「总成本超支数」口径不变**：两个新标签仍整体归为「总成本超支」语义。

## 2. 生产端改动（`lib/riskReasons.ts`）

第 3 段「总成本超支」保持原 if/else 结构，只把 `category` 由固定 `'总成本超支'` 改为按 `over > 5000` 取两档之一（`overCat` 在 else 分支必为小于档，因该分支 `over ≤ 0`）：

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

- `detail`（hover 提示）不变：有正超支额显「超支 X 万」，flag 型显「项目超支」。`tone` 仍 `danger`。位置仍在「交付成本超支」之前，顺序不变。

## 3. 类型与共享常量（防孤儿消费方）

`lib/riskReasons.ts`：
- `RiskCategory` 联合把 `'总成本超支'` 换成两个新字面量：
  ```ts
  export type RiskCategory = '回款延期' | '里程碑滞后' | '总成本超支大于5000' | '总成本超支小于5000' | '交付成本超支' | '风险未闭环' | '数据异常'
  ```
- 新增导出共享常量，供所有需要「是否总成本超支」判定的消费方复用：
  ```ts
  /** 「总成本超支」两档 category（按 overspendAmount 是否 > 5000 元拆分）。判定「是否总成本超支」的消费方须用此常量，勿散写字面量。 */
  export const TOTAL_OVERSPEND_CATS = ['总成本超支大于5000', '总成本超支小于5000'] as const
  ```

> 改 `RiskCategory` 联合后，任何残留的 `=== '总成本超支'` 字面量比较会被 typecheck 逮出（该字面量已不在联合内），作为孤儿消费方安全网。

## 4. 三处下游消费方一并对齐

均改为用 `TOTAL_OVERSPEND_CATS`（含 `as readonly string[]` 拓宽以过 TS `includes` 参数检查——`rr.category` 是更宽的 `RiskCategory`）：

### 4.1 `lib/riskClassify.ts`（首页「成本超支」桶 remap）
- import 由 type-only 改带值：`import { TOTAL_OVERSPEND_CATS, type RiskReason } from './riskReasons'`（第 1 行）。
- 第 56 行：
  ```ts
  const COST_SPLIT = new Set<string>([...TOTAL_OVERSPEND_CATS, '交付成本超支'])
  ```
- 效果：两个新标签仍 remap 进「成本超支」桶，**首页视觉与计数不变**。

### 4.2 `lib/projectList.ts`（`成本超支` 桶筛选 + 首页下钻）
- import 补常量：`import { riskReasons, TOTAL_OVERSPEND_CATS, type RiskReason } from './riskReasons'`（第 3 行）。
- 第 112 行：
  ```ts
        if (!r.riskReasons.some(rr => rr.category === '交付成本超支' || (TOTAL_OVERSPEND_CATS as readonly string[]).includes(rr.category))) return false
  ```
- 效果：首页下钻 `/projects?riskCategory=成本超支` 仍命中两档任一。第 43 行注释里的 riskCategory 取值列表把 `总成本超支` 更新为两档（仅注释）。

### 4.3 `lib/costAnalysis.ts`（costdetail「总成本超支数」口径）
- import 补常量：`import { riskReasons, TOTAL_OVERSPEND_CATS } from './riskReasons'`（第 2 行）。
- 第 65 行：
  ```ts
    const totalOverspend = cats.some((c) => (TOTAL_OVERSPEND_CATS as readonly string[]).includes(c))
  ```
- 第 83 行 `deliveryOverspend: cats.includes('交付成本超支')` 不动（交付不拆）。效果：costdetail「总成本超支数」及成本状态口径不变。

## 5. 自动生效、无需改动

- `ProjectsView.vue:189` pill 直接渲染 `r.category` → 自动显示两个新标签；`:title="r.detail"` 仍显金额。列宽 220px、pill 换行，容纳更长文案（展示性、无需改）。
- `crossFilter.ts:33-35/59-60` 对 riskReasons 通用摊平 `category` → 该列**列筛选选项自动变成两档**，筛选按新 `category` 匹配。
- **唯一直接渲染 riskReasons `category` 的视图是 `ProjectsView`**（已核对：`OverviewView` 渲染的是 `riskClassify` 桶名如「成本超支」，不受影响；`RiskBoardView`/`OpportunitiesBoardView` 的 `.category` 属别的域）。

## 6. 影响面

- 关注原因列与其列筛选：「总成本超支」→ 两档「大于5000/小于5000」。
- 首页风险分类「成本超支」桶、首页下钻、`/projects` `overspend` 布尔筛选、costdetail 四卡与成本状态：**口径与计数均不变**（两标签整体等价旧「总成本超支」）。
- 纯前端，不改后端/schema/preprocess；`overspendAmount` 来源口径（损益域 实际−预算）不动。

## 7. 测试与验证

**先补/改测试再改实现（TDD）：**
- `riskReasons.test.ts`：`overspendAmount=12000` → `总成本超支大于5000`（detail「超支 1.2 万」）；`overspendAmount=3000` → `总成本超支小于5000`；`overspendAmount=5000`（边界）→ `小于5000`（严格 >）；PMIS `项目超支` flag、`over≤0` → `小于5000`（detail「项目超支」）；顺序断言（原 `总成本超支` 出现处）改为两档标签之一；`≤0 且无 flag 且消耗比<1` → 不命中任一档。
- `riskClassify.test.ts`：把 fixture 里 `总成本超支` 改为某一档标签，断言仍进「成本超支」桶、去重逻辑不变。
- `projectList.test.ts`：`riskCategory='成本超支'` 桶命中两档任一；原 `riskCategory='总成本超支'` 精确匹配用例改为对应新标签（或删，因无 UI 以精确 `总成本超支` 下钻）。
- `costAnalysis.test.ts`：fixture `总成本超支` → 新标签，断言 `totalOverspend` 派生与分档卡计数不变。
- `crossFilter.test.ts`：`总成本超支` fixture → 新标签，断言摊平选项与筛选。
- `bash verify.sh` 全绿（含前端 typecheck/vitest/build）。真机冒烟：`/projects` 关注原因列出现两档标签、列筛选两选项；首页「成本超支」桶计数与下钻不变；costdetail「总成本超支数」不变。

## 8. 版本与打包

- 版本 **V2.6.12**（Z 级，`frontend/src/version.ts` 单一来源，从 V2.6.11 增量）。
- **纯前端、升级无需点「更新数据」**；无新页/新 pageKey/新依赖。收尾出增量更新包（从 V2.6.11 增量）+ 升级手册。

## 9. 不做什么（明确排除）

- 不拆「交付成本超支」（仅拆「总成本超支」）。
- 不改 `overspendAmount` 来源口径、不改 costStatusOf 的 5k 分档（`超支大于5k/超支不足5k`，与本次 category 拆分同阈值但各自独立字段）。
- 不改后端/schema/preprocess。
- 不新增列、不改列宽/pill 样式（长文案靠既有换行容纳）。
