# SP2 周期日期范围 + 回款口径统一 设计

> 大需求 5 子项目中的 **SP2（跨切面基座）**。依赖 SP1（异常排除口径，已合并 V1.10.1）。SP3-SP5 依赖本 SP2 的筛选与口径。
> 同步关闭 PROGRESS backlog「SP1-followup」：computeKpis/InsightView 口径在本轮一并复核。

**日期:** 2026-06-19
**版本:** V1.11.0（Y 级：跨页回款口径 + 周期筛选重构，无新增页）
**范围:** 周期枚举→日期范围、且贯穿所有回款页面；已回款统一用流水；计划/待回款/延期统一用节点；项目级页面按区间动态重算。纯前端（paymentNodes 与 paymentRecords.records 均已在前端数据）。**不改** 后端/schema/数据。

---

## 1. 已敲定决策（brainstorm）

1. **日期口径**：计划侧（计划回款/待回款/延期/回款节点）看节点「计划回款时间」是否∈区间；已回款看流水「回款确认日期」是否∈区间。
2. **已回款源统一为流水** `payment_records.records[]`（付款金额 + 回款确认日期，2A 钦定实际侧真值）；/payment·总览由「节点已收金额」改为流水，与 board 一致。
3. **生效范围**：日期范围真正作用到项目级页面（board/部门汇总/进度/风险）——它们由「读静态 paymentPmis」改为「按区间从节点+流水动态重算」。
4. **项目数**（card1）= 区间内有回款活动的项目数（distinct：有节点计划日∈R 或 有流水到账日∈R，且在视角/排除后范围内）。
5. **默认本年度**（当年 01-01 .. 12-31）+ 预设（本月/本季/本年/全部/自定义）；「全部」=不限日期。

---

## 2. 日期范围模型

### 2.1 状态（filter store）
- `filterYear: string`（枚举）**移除**，改为 `dateStart: string` + `dateEnd: string`（`YYYY-MM-DD`；两者皆空=「全部」不限）。
- 默认：首次进入 = 本年度（`${year}-01-01` .. `${year}-12-31`，year 取运行时当年）。
- 预设：本月/本季/本年由 now 计算 [起,止]；全部=`['','']`；自定义=日期范围选择器自由选。
- API：`setDateRange(start, end)`、`setPreset(key)`；移除 `setYear`/`yearOptions`/`buildYearOptions`。

### 2.2 落区间判定（统一函数，新 `lib/paymentRange.ts`）
```ts
/** 日期是否落入 [start,end]（含端点）。两端皆空=「全部」→ 恒 true（含空日期）；
 * 否则要求 date 非空且在界内（空日期在限定区间下被排除，与旧 filterYear 行为一致）。 */
export function inRange(date: string, start: string, end: string): boolean {
  if (!start && !end) return true
  return !!date && (!start || date >= start) && (!end || date <= end)
}
```

### 2.3 关键不变式：`全部`（`['','']`）≡ 现状全时口径
区间为「全部」时，节点侧 `inRange` 恒真→等于不过滤；流水侧 Σ 全部 records = `paymentRecords.total`；故区间版聚合在「全部」下数值等于现有静态 `paymentPmis`/全量节点口径。契约测试强制此不变式（保证不回归现有数值）。

---

## 3. 区间 R=[起,止] 下的指标口径

| 指标 | 计算 | 源 · 日期字段 |
|---|---|---|
| 计划回款 | Σ 节点.`expectedPayment`，`inRange(planDate)` | collection_stages |
| 待回款 | Σ 节点.`unpaidAmount`，`inRange(planDate)` | collection_stages |
| 回款节点数 | count 节点，`inRange(planDate)` | collection_stages |
| 延期项目数 | distinct 项目，节点 status=延期 且 `inRange(planDate)` | collection_stages |
| 延期节点数 | count 节点，status=延期 且 `inRange(planDate)` | collection_stages |
| 已回款 | Σ 流水.`amount`，`inRange(回款确认日 date)` | payment_records.records |
| 完成率 | 已回款(到账∈R) ÷ 计划回款(计划日∈R)，分母 0/缺→null | 跨源跨窗（沿用 2A 跨源比率，各侧各自时窗） |
| 项目数 | distinct 项目：有节点 `inRange(planDate)` 或 有流水 `inRange(date)`，限视角/排除后 | 两源并集 |

> 延期项目数 vs 延期节点数：两单位并存（V1.10.2 已分别命名「延期项目数」「延期节点数」），均按计划日落区间。

---

## 4. 聚合架构（纯前端）

### 4.1 新 `frontend/src/lib/paymentRange.ts`
- `inRange(date,start,end)`（见 2.2）。
- `actualInRange(records, start, end): number` = Σ `amount`（`inRange(date)`）。
- `paymentPmisInRange(project, nodes, records, start, end)`：返回**区间版项目回款摘要**，形态对齐 `ProjectPaymentPmis`（`contract` 静态；`expectedTotal/remainingTotal/nodeCount/reachedCount/delayedCount` 取 `inRange(planDate)` 的节点；`actualTotal` = `actualInRange(records)`；`paymentRatio = actualTotal/expectedTotal | null`）。供 board/部门汇总/进度/风险按区间重算，替代读静态 `project.paymentPmis`。

### 4.2 filter store（`stores/filter.ts`）
- 去 `filterYear/yearOptions/setYear`；加 `dateStart/dateEnd/setDateRange/setPreset`，默认本年度。
- `filteredPayNodes`：年份分支改为 `inRange(planDate, dateStart, dateEnd)`（视角/排除/异常不变）。
- 新增供消费方取数的派生：`payRecordsAll`（`data.paymentRecords`）与区间聚合入口（或由各消费方调 `paymentRange` 帮助函数）。

### 4.3 受影响消费方（计划阶段逐一改）
| 文件 | 改动 |
|---|---|
| `payDashboard.ts payDashSummary` | 已回款改流水（`actualInRange`）；项目数改「区间内有回款活动」；其余节点指标随 `filteredPayNodes`（已含计划日∈R） |
| `components/DashMetrics.vue` | 消费上面新口径（标签 V1.10.2 已就位） |
| `components/TierStrip.vue` | 档位聚合：计划/待回款/延期随节点区间；已回款档位用流水（需档位↔项目↔流水映射） |
| `components/OrgRanking.vue` + `payOrgRanking` | 达成排名：计划=Σ节点(计划日∈R) 按 L4；已回款=Σ流水(到账∈R) 按 L4；达成率=两者比 |
| `components/TrendCard.vue` + 趋势函数 | 数据接区间（fill 骨架由区间推导，替代 filterYear）；**视觉留 SP3** |
| `views/BoardView.vue` + `paymentBoard.ts` | `buildPayBoardRows` 由静态 paymentPmis 改 `paymentPmisInRange`；排名/交叉/透视指标随之 |
| `components/ProjectsOverviewTab.vue` + `summaryByDim`/`projectPaymentRows` | 部门汇总按区间重算（计划/待回款/延期=节点区间，已回款=流水区间） |
| `components/TierNodesTab.vue` | 节点表随 `filteredPayNodes`（计划日∈R） |
| `components/PlanTab.vue` + `progressBuckets` | 进度桶按区间重算 |
| `components/RiskTab.vue` + `pmisRiskGroups` | 延期节点随计划日∈R；低回款/超支按区间口径复核 |
| `views/CalendarView.vue` | 节点按计划日∈R（日历本就按月，区间叠加） |
| `views/LedgerView.vue` + `ledger.ts` | 台账行(按项目)：计划/待回款/延期按节点计划日∈R；已回款列改流水、按到账日∈R |
| `views/OverviewView.vue` + `overview.ts paymentBand`/`computeKpis` | 回款带：计划/待回款按计划日∈R、已回款按流水到账∈R；computeKpis「回款达成率」改流水+排除（关闭 SP1-followup backlog）|
| `layout/FilterBar.vue` | 「周期」`<select>` → 日期范围选择器 + 预设按钮；`data-test` 钩子更新 |

> InsightView（/insight 项目主域，非回款看板）：本轮一并把回款列口径与排除对齐（关闭 SP1-followup backlog 第二点），但日期范围不施于 /insight（它属项目分析，不在回款看板范围）。

---

## 5. 生效范围与边界

**施加日期范围**：/payment、/panalysis 五页、/calendar、/ledger、总览(/)回款带。
**不施加**：/projects 在建·/closed 清单（项目清单非回款看板）；/insight（仅对齐口径与排除，不加日期）。

**不在本轮（SP3+）**：
- 待回款趋势卡视觉（横滑/坐标压缩，B5）；新增回款数据表页（B6）；/payment 中左/右 card 重设计（B3/B4）。
- 路由拆分（SP4）、/payment/board 排名维度/指标重做（SP5）。
- 后端导出/schema 变更（本轮纯前端）。

---

## 6. 测试

- `paymentRange.test.ts`：`inRange`（全部/单端/双端/空日期边界）；`actualInRange`（按到账日窗求和）；`paymentPmisInRange`（区间聚合 + **「全部」≡静态 paymentPmis 不变式**）。
- `payDashboard`/`paymentBoard`/`paymentPmis` 既有测试扩区间用例 + 已回款改流水后的数值。
- 各 view 测试：注入日期范围 → 断言指标随区间变化；「全部」下与改前数值一致（防回归）。
- `FilterBar` 测试：日期范围选择器 + 预设；移除 year-select 钩子相应更新。
- `bash verify.sh` 全绿。

---

## 7. 验证

1. `bash verify.sh` 全绿（前端 typecheck/vitest/build + 后端 ruff/pytest 不受影响）。
2. 手动：FilterBar 选区间 → /payment 六 card、board、部门汇总、趋势、日历、台账、总览带 全部随区间变化；切「全部」数值回到改前；视角/排除与日期叠加正确；/projects·/closed 不受影响。
3. 口径核对：/payment「已回款」与 board「已回款」在同区间下一致（均流水）；延期项目数/延期节点数各自正确。
