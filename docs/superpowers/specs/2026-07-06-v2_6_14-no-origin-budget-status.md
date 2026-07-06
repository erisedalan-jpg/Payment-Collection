# V2.6.14 「未获取原项目预算」状态 + 预算核算剩余负值标红 设计

> 版本：V2.6.14（Z 级，页内口径/展示）
> 日期：2026-07-06
> 背景来源：用户三条诉求，围绕一个新概念——**售前服务类且原项目预算缺失（原项目总预算=0）的项目**当前被错误呈现为「超支」，应改为中性的「未获取原项目预算」、不计入任何超支统计；外加 `/project/:id` 预算核算页剩余负值标红。

## 0. 判定（单一来源）与目标

- **新增共享谓词** `noOriginBudget(project, pmisMap): boolean`（放 `lib/costAnalysis.ts` 导出）：
  ```ts
  export function noOriginBudget(p: Project, pmis: Record<string, ProjectPmis>): boolean {
    if (!p.isPresale) return false
    const oc = (p.relatedClosedId && pmis[p.relatedClosedId]) ? ((pmis[p.relatedClosedId] as any).cost ?? {}) : {}
    return Number(oc.总预算 ?? 0) === 0
  }
  ```
  与 costAnalysis 现有 presale `totalBudget = oc.总预算 ?? 0` 同口径；无 `relatedClosedId`（原项目缺失）与原项目总预算为 0 两种都算「未获取」。
- **配色/语义**：新状态「未获取原项目预算」= **中性灰**（`mut`，同「数据异常」）；**不计入超支**。
- **纯前端**：谓词由 `isPresale`+`relatedClosedId`+`pmisMap` 前端导出；零后端/schema/preprocess。版本 **V2.6.14**（从 V2.6.13 增量），**升级无需点「更新数据」**。

## 1. 诉求1 — `/project/:id` 预算核算页

### 1.1 剩余列负值红字（`components/ProfitTree.vue`）
剩余单元格（`:34`）改为按负值挂类（非比率行）：
```html
        <td class="u-num" :class="{ 'pt-neg': !isRateRow(r) && (r.remaining ?? 0) < 0 }">{{ money(r, r.remaining) }}</td>
```
`<style>` 加：`.pt-neg { color: var(--danger-text); }`。（红字，与 costdetail 剩余列 `.cd-red` 一致。）

### 1.2 售前未获取原项目预算 → 上方标记改「未获取原项目预算」（`views/ProjectDetailView.vue`）
- 新增：`const noOrigBudget = computed(() => p.value ? noOriginBudget(p.value, (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>) : false)`（import `noOriginBudget` from `@/lib/costAnalysis`）。
- 模板（`:292-293` 的两个超支徽标）改为：
  ```html
  <template v-if="noOrigBudget">
    <span class="pd-badge mut">未获取原项目预算</span>
  </template>
  <template v-else>
    <span v-if="overBudget" class="pd-badge" :class="`over-${overBudget.level}`">总体预算超支 {{ fmtWan(overBudget.amount) }}万</span>
    <span v-for="cat in deliveryOverBadges" :key="cat" class="pd-badge over-danger">{{ cat }}超支</span>
  </template>
  ```
- `<style>` 若无 `.pd-badge.mut` 则加：`.pd-badge.mut { background: var(--card2); color: var(--mut); }`。

## 2. 诉求2 — `/insight/costdetail`

### 2.1 riskReasons 联动（`lib/riskReasons.ts`，根信号）
- `RiskCategory` 联合**新增** `'未获取原项目预算'`（仅新增，不动既有值）。
- `riskReasons` 加第 3 参 `noOrigBudget = false`；成本维度（现「3. 总成本超支」+「3b. 交付成本超支」两块）改为：
  ```ts
  export function riskReasons(project: Project, pmis?: ProjectPmis, noOrigBudget = false): RiskReason[] {
    // ...数据异常短路、回款延期、里程碑 均不变...

    // 3. 成本维度:售前未获取原项目预算 → 中性单列(不计入超支),替代 总/交付成本超支
    if (noOrigBudget) {
      out.push({ category: '未获取原项目预算', detail: '售前原项目预算缺失', tone: 'mut' })
    } else {
      const over = project.overspendAmount ?? 0
      const overCat: RiskCategory = over > 5000 ? '总成本超支大于5000' : '总成本超支小于5000'
      if (over > 0) {
        out.push({ category: overCat, detail: `超支 ${(over / 10000).toFixed(1)} 万`, tone: 'danger' })
      } else if ((pmis?.cost?.['项目超支']) || ((pmis?.cost?.['消耗比'] ?? 0) > 1)) {
        out.push({ category: overCat, detail: '项目超支', tone: 'danger' })
      }
      if (pmis?.cost?.['交付超支'] === true) {
        out.push({ category: '交付成本超支', detail: '交付人工超支', tone: 'danger' })
      }
    }
    // 4. 风险未闭环 不变
  }
  ```
- 两处生产调用各算 `noOriginBudget` 并传入：
  - `lib/projectList.ts:93` → `riskReasons: riskReasons(p, pmisMap[p.projectId], noOriginBudget(p, pmisMap))`（import `noOriginBudget` from `./costAnalysis`；无循环：costAnalysis 不 import projectList）。
  - `lib/costAnalysis.ts:70` → `const cats = riskReasons(p, m as ProjectPmis, noOrig).map(...)`（`noOrig` 见 2.3）。
- `'未获取原项目预算'` **不**加入 `riskClassify.COST_SPLIT`、**不**在 `projectList` 成本超支桶——与「不计入超支」一致（union 仅新增、无 exhaustive switch，既有消费方不破）。

### 2.2 卡片（`views/CostDetailView.vue`）
- `costKpis` 加 `noOriginBudget` 计数（见 2.3）。`kpiItems`（`:64-65`）：`交付成本超支数` card 加 sub：
  ```ts
    { k: '交付成本超支数', v: String(k.deliveryOverspend), sub: `未获取原项目预算: ${k.noOriginBudget}`, cls: 'danger', clickable: true },
  ```
  （类比 `总成本超支数` card 的 `sub: 超支大于5000`。）

### 2.3 明细表状态列 + 计数（`lib/costAnalysis.ts` + `views/CostDetailView.vue`）
- `CostStatus` 联合加 `'未获取原项目预算'`；`DeliveryStatus` 联合加 `'未获取原项目预算'`。
- `CostRow` 加 `noOriginBudget: boolean`。
- `buildCostRows`：`const noOrig = noOriginBudget(p, pmis)`（`pmis` 为该函数第二参、全量 map）。返回对象：
  ```ts
      status: noOrig ? '未获取原项目预算' : costStatusOf(totalOverspend, overspendAmount),
      deliveryStatus: noOrig ? '未获取原项目预算' : deliveryStatusOf(deptRem, outRem),
      // ...
      noOriginBudget: noOrig,
  ```
  （`totalOverspend`/`deliveryOverspend` 天然 false——riskReasons 已不产超支类。）
- `CostKpis` 加 `noOriginBudget: number`；`costKpis` 循环：
  ```ts
    for (const r of rows) {
      k.total++
      if (r.noOriginBudget) { k.noOriginBudget++; continue }   // 未获取:不算超支也不算未超支
      if (!r.totalOverspend && !r.deliveryOverspend) k.notOverspent++
      if (r.totalOverspend) { k.totalOverspend++; if (r.overspendAmount > 5000) k.totalOverspendOver5k++ }
      if (r.deliveryOverspend) k.deliveryOverspend++
    }
  ```
- `CostDetailView` 的 `TONE`（`:129`）/`DELIVERY_TONE`（`:130`）各加 `未获取原项目预算: 'mut'`——成本状态/交付成本状态列走 `StatusBadge`，自动中性灰渲染。
- `CostDetailView` 的 KPI 就地筛选 `filtered`（`:152` `notOverspent` 分支）加 `&& !x.noOriginBudget`（点「未超支」卡不含这些项目）。

## 3. 诉求3 — `/projects` 关注原因列（零改动自动生效）
riskReasons 已产 `未获取原项目预算` 分类 → `ProjectsView` pill 直接渲染（`r.category`，中性灰 `rr-pill--mut`）、`crossFilter` 列筛选自动出该选项。它不在 `TOTAL_OVERSPEND_CATS`、不进首页成本超支桶、不被 `成本超支` 下钻命中。

## 4. 统计口径连锁（用户关切：各处统计对应减少）

改「根信号」（riskReasons 分类 + costAnalysis `totalOverspend`/`deliveryOverspend`）→ 凡派生自它们的统计自动减少：
- **/insight/costdetail**：`总成本超支数`↓（totalOverspend=false）、`交付成本超支数`↓（deliveryOverspend=false）、`未超支`不误增（costKpis `continue` 排除 + 就地筛选排除）、L4 分布图不含（status 非 超支不足/大于5k）。
- **首页「成本超支」风险分类桶**（`classifyProjects`/`OverviewView` 卡「总/交付成本超支的项目」）↓；下钻 `/projects?riskCategory=成本超支` 不再命中这些项目。
- **本就不含、无需改**：首页 `overview.computeKpis` 的 `overspend` KPI 走 PMIS `cost.项目超支` flag（`overview.ts:35`），售前 PMIS 成本全空 → 这些项目本就不在该计数（既有「成本超支两不重叠源」），不受影响、无双算。

## 5. 测试与验证

**先补/改测试再改实现（TDD）：**
1. `costAnalysis.test.ts`：
   - `noOriginBudget` 谓词：售前+原项目总预算=0→true；售前+原项目总预算>0→false；非售前→false；售前无 relatedClosedId→true。
   - `buildCostRows`：noOrig 项目 → `status='未获取原项目预算'`、`deliveryStatus='未获取原项目预算'`、`totalOverspend=false`、`deliveryOverspend=false`、`noOriginBudget=true`。
   - `costKpis`：noOriginBudget 计数正确、`notOverspent` 排除 noOrig 项目（mk 助手补 `noOriginBudget: false` 默认）。
   - **既有售前测试忠实更新**：现有「售前超支(overspendAmount>0)无原项目 → 成本状态=超支/totalOverspend=true」等用例（`:161` 等）正是本次改判的场景——按新行为改为 `未获取原项目预算`（这是用户钦定的行为变更，非削弱）。
2. `riskReasons.test.ts`：`noOrigBudget=true` → 产 `未获取原项目预算`(tone mut)、不产 总成本超支/交付成本超支；其它原因（回款延期等）仍在。第 3 参默认 false，既有用例不受影响。
3. `ProfitTree`（若有 `ProfitTree.test.ts`）：剩余<0 行挂 `.pt-neg`；否则真机冒烟核。
4. `ProjectDetailView.test.ts`：noOrig 项目 → 显「未获取原项目预算」徽标、不显 总体预算超支/交付超支徽标。
- `bash verify.sh` 全绿（含前端 typecheck/vitest/build）。真机冒烟：售前无原项目预算的项目——`/project/:id` 预算核算页上方显「未获取原项目预算」、剩余负值红字；`/insight/costdetail` 该项目成本/交付状态列显「未获取原项目预算」、交付超支数卡下 sub 计数、总/交付超支数与首页成本超支桶相应减少；`/projects` 关注原因列该项目显「未获取原项目预算」。

## 6. 版本与打包

- 版本 **V2.6.14**（Z 级）。纯前端，**升级无需点「更新数据」**。收尾出增量更新包（从 V2.6.13 增量）+ 升级手册。

## 7. 不做什么（明确排除）

- 不改后端/schema/preprocess；不改 `overspendAmount` 来源口径。
- 不改首页 `overspend` KPI 的取数（PMIS flag，本就不含售前）。
- 不新增页面/pageKey/依赖。
- 「未获取原项目预算」不做成单独可点击筛选卡（仅作交付超支数卡的 sub 计数，同「超支大于5000」）。
