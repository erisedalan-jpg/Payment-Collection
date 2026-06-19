# SP3 /payment 页面重做 设计

> 大需求 5 子项目中的 **SP3**。依赖 SP1（异常排除）、SP2（日期范围 + 流水口径，已合并 V1.11.0）。SP4（路由拆分）、SP5（board 重做）在后。
> 对应原始需求 B3（中左 card 重设计）、B4（右侧 card 展全部 L4）、B5（待回款趋势）、B6（新增回款数据表格 + 布局重排）。

**日期:** 2026-06-19
**版本:** V1.12.0（Y 级：/payment 整页重设计）
**范围:** /payment 布局重排 + 新增按 L4 回款数据表格（合并 B3/B6）+ OrgRanking 展全部 L4 + TrendCard 整数万/横滑 + 数据层加 `delayedAmount` 与 L4 汇总新字段 + 从 ProjectsOverviewTab 迁出部门汇总。纯前端。

---

## 1. 已敲定决策（brainstorm）
1. **B3/B6 合并**为一张按 L4 的综合「回款数据表格」（去掉中左金额档位卡 TierStrip）。
2. 表格**固定按 L4**（orgL4，= `deriveDept`，空→未指定）聚合。
3. 待回款趋势金额**整数万**（四舍五入）。
4. 新表格在 **/payment 页内重排**（非新路由）。
5. 延期金额 = Σ 延期节点未收金额；从 ProjectsOverviewTab **移走**部门汇总（该 tab 保留明细表）。

---

## 2. /payment 布局重排（`views/DashboardView.vue`）

```
DashMetrics（6 卡，不变）
回款数据表格（按 L4，整宽，可排序）            ← 新增（B3+B6 合并）
[ 待回款趋势(TrendCard) | 服务组达成排名(OrgRanking) ]  ← 同一行各占一半
```

- 删除 `TierStrip` 引用与其卡片。
- `dash-grid` 重排：表格整宽区块 + 下方两列等宽（`1fr 1fr`，窄屏 `<=900px` 单列）。
- 重排时把现有散值归令牌：卡片 `border-radius` → `--r-lg`、间距 → `--gap-card`、内边距 → `--card-pad`、`padding` → `--sp-4`。

---

## 3. 回款数据表格（新组件 `components/PaymentL4Table.vue`）

按 L4 聚合，**全列可排序**（复用 `DataTable` 的 `sortable`），随顶部日期范围/视角/排除联动（复用 SP2 区间口径）。列（去 Σ、按 B6.1 改名）：

| 列 key | 列名 | 取值 |
|---|---|---|
| `value` | L4组 | orgL4（空→未指定） |
| `projectCount` | 项目数 | 该 L4 项目数 |
| `contractSum` | 合同额(万) | Σ合同 / 10000 |
| `actualSum` | 已回款(万) | Σ流水(到账∈区间) / 10000（SP2 流水口径） |
| `rate` | 回款额完成率 | 已回 / 计划（SP2；null→「-」） |
| `delayedProjectCount` | 延期项目数 | 该 L4 中有延期节点的项目数 |
| `delayedNodeSum` | 延期节点 | Σ延期节点数 |
| `delayedAmountSum` | 延期金额(万) | Σ延期节点未收金额 / 10000 |
| `nodeSum` | 回款节点数 | Σ节点数（计划日∈区间） |
| `reachedSum` | 完成节点数 | Σ已达成(reached)节点数 |
| `reachedRatio` | 完成节点比例 | 完成节点数 ÷ 回款节点数（分母 0→「-」） |

- 金额列挂 `.u-num`（tabular-nums）；完成率/比例用 `fmtRatio`；金额用 `fmtWan` 风格。
- 数据源：`summaryByDim(projectPaymentRows(filterProjects(projects, opts), pmisMap, paymentNodes, paymentRecords, dateStart, dateEnd), 'dept')`（dept = orgL4）。
- 表格容器 `overflow-x:auto`（11 列宽，窄屏横滚）。

---

## 4. 服务组达成排名（`components/OrgRanking.vue`，B4）

- 去掉 `.slice(0, 8)` —— 展示**全部 L4**（按当前 sortBy 降序全量）。
- 卡内列表区 `max-height` + `overflow-y:auto`（令牌化高度/间距），避免长列表撑爆卡片。
- 计划=节点 / 已回=流水 / 达成率口径 SP2 已就位，不动。

---

## 5. 待回款趋势（`components/TrendCard.vue` + `PendingBarChart.vue`，B5）

- **整数万**：趋势数据 `Σunpaid/10000` 四舍五入到整数；柱高与 tooltip 均显整数万。改在 `payMonthlyTrend`/`payQuarterlyTrend` 产出 `data` 处 `Math.round`（不改区间逻辑）。
- **横向滑动**：`PendingBarChart` 外层容器 `overflow-x:auto`；图表内层 `min-width: max(100%, 桶数 × 固定柱距)`（如每桶 48px），桶多时整体变宽、左右滑动看全；月/季切换保留。坐标轴标签不再挤压。

---

## 6. 数据层扩展（`lib/paymentPmis.ts` + `lib/paymentRange.ts`）

- `paymentRange.ts paymentPmisInRange` 的 `RangePmis` 加 `delayedAmount: number` = Σ `unpaidAmount`（节点计划日∈区间 且 `status==='延期'`）。
- `paymentPmis.ts`：`PayProjectRow` 加 `delayedAmount: number`（取 `rp.delayedAmount`）；`projectPaymentRows` 填该字段。
- `DimSummary` 加 4 字段：`nodeSum`(Σ nodeCount)、`reachedSum`(Σ reachedCount)、`delayedProjectCount`(count r.delayedCount>0)、`delayedAmountSum`(Σ delayedAmount)；`summaryByDim` 计算之。`完成节点比例` 由组件把 `summaryByDim` 结果映射成表格行时加 `reachedRatio = nodeSum>0 ? reachedSum/nodeSum : null` 字段（便于 DataTable 排序与展示）。
- **迁出部门汇总**：`components/ProjectsOverviewTab.vue` 删除其「部门汇总」section（保留下方明细 `DataTable`）；相关 import（summaryByDim）若明细不再用则清。

> 「全部≡现状」不变式延续：新字段在「全部」区间下 = 全量口径（与 SP2 一致）。

---

## 7. 版本 / 测试 / 边界 / 验证

- 版本：`frontend/src/version.ts` → `V1.12.0` / `2026-06-19`。
- 测试：
  - `paymentRange.test`：`paymentPmisInRange.delayedAmount`（区间内延期节点未收和；全部不变式）。
  - `paymentPmis.test`：`projectPaymentRows.delayedAmount`；`summaryByDim` 新 4 字段。
  - `PaymentL4Table` 组件测试：11 列渲染、可排序、随区间联动、空态。
  - `OrgRanking` 测试：展示全部 L4（>8 个不截断）。
  - `TrendCard`/`PendingBarChart` 测试：整数万、横滚容器 `min-width`。
  - `DashboardView`：含表格区块、TierStrip 已移除、[趋势|排名] 同行。
  - `ProjectsOverviewTab`：部门汇总已移除、明细仍在。
- 验证：`bash verify.sh` 全绿；手动 /payment 选区间/视角 → 表格/趋势/排名联动，切「全部」回现状；TierStrip 不再出现；/panalysis/projects 仅剩明细。
- 边界（不在本轮）：路由拆分（SP4）；/payment/board 排名维度·指标·柱状图重做（SP5）；后端/schema 变更（纯前端）。
