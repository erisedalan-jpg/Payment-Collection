# SP-C 成本分析页 /insight/costdetail — 设计文档

> 状态：自主执行（用户授权直至 SP-C 完成、按推荐执行、不逐步确认；见 memory autonomous-run-to-spc）。父设计 `…/2026-06-19-insight-analysis-hub-integration-design.md` §5；同事页 cost-detail.html 已实测清单。SP-A/B 已合入 master(118859a)。目标版本 V1.16.0。
> **这是 /insight 整合的最后一个子项目**；本 SP 收尾顺带清理 SP-A/B1 遗留的 AboutView 文案 + riskGroups 注释。

**Goal：** 把同事 `cost-detail.html`「预算超支预警」看板忠实移植到 `/insight/costdetail`（替换 SP-A 占的 stub）：4 计数 KPI + 超支分布堆叠柱 + L4 成本汇总表 + 项目成本明细表(13 列，多筛选/分页/导出)，超支三档用 `cost.剩余预算 ±5000` 复刻。数据全取自我方 `analysis_data.json`。

**Architecture：** 纯计算集中在新 `lib/costAnalysis.ts`（全 vitest 覆盖）；`views/CostDetailView.vue` 装配 KPI(MetricGrid) + 超支分布图(ChartBox) + L4 汇总表(DataTable) + 明细表(DataTable + 多筛选 + usePagedRows 分页 + exportRows 导出)。重度复用 SP-B1/B2 既有件，无需新建通用组件。`hideFilter:true`（SP-A 已设）。

---

## 1. 文件结构
| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/lib/costAnalysis.ts` | 新建 | `costStatusOf`/`isXs`/`buildCostRows`/`costKpis`/`costL4Dist`/`costL4Summary` + 行类型 |
| `frontend/src/views/CostDetailView.vue` | 替换 stub | 装配 KPI + 图 + 两表 + 筛选/分页/导出 |
| `frontend/src/views/AboutView.vue` | 改（收尾） | 重写 SECTIONS 文案反映 项目分析(5页)hub + 精简回款域 |
| `frontend/src/lib/riskGroups.ts` | 改（收尾） | 第 2 行注释 `/calendar` → `/insight/calendar` |
| 复用（不改） | — | `MetricGrid` / `ChartBox` / `DataTable` / `StatusBadge` / `usePagedRows` / `exportXlsx`(exportRows) / `echartsTheme`(STATUS_*) / `useDataStore` |

---

## 2. 口径（`lib/costAnalysis.ts`，纯函数）

**XS 前缀** = `projectId.toUpperCase().startsWith('XS')`（实测主域 3 个）。`isXs(projectId): boolean`。

**成本状态三档 `costStatusOf(remainingBudget, projectId)`**（`CostStatus = '超支大于5k'|'超支不足5k'|'未超支'`，忠实对方）：
- `isXs` → `'未超支'`（对方 XS 强制正常，不走阈值）；
- `rb` 为 null/缺失 → 视作 0 → `'未超支'`（对方 `parseFloat||0`）；
- `rb < -5000` → `'超支大于5k'`；
- `-5000 ≤ rb < 0` → `'超支不足5k'`（−5000 归不足5k，**排他下界**）；
- `rb ≥ 0` → `'未超支'`。

**`buildCostRows(projects, projectPmis)` → `CostRow[]`**（**全部**主域项目，明细表用；XS 保留）：
- 每项目字段：`projectId / projectName / projectType(status.项目类型) / orgL3(team.L3部门) / orgL3_1(Project.orgL3_1) / orgL4(Project.orgL4) / manager(projectManager) / amount(paymentPmis.contract ?? 0) / status(costStatusOf(cost.剩余预算, projectId)) / totalBudget(cost.总预算 ?? 0) / actualCost(cost.核算 ?? 0) / remaining(cost.剩余预算 ?? 0) / xs(isXs)`。

**聚合（KPI/图/汇总均剔 XS）**：
- `costKpis(rows)` → `{ total, normal, under5k, over5k }`：基数 = `rows.filter(r => !r.xs)`；total=非XS 数；normal/under5k/over5k 按 status 计数。
- `costL4Dist(rows)` → `[{ orgL4, under5k, over5k }]`：非XS 按 orgL4 分组（空 orgL4 → '未知'），两档计数；按 orgL4 升序（localeCompare）。
- `costL4Summary(rows)` → `[{ orgL4, total, normal, under5k, over5k, over5kRatio }]`：非XS 按 orgL4 分组；`over5kRatio = total>0 ? +(over5k/total*100).toFixed(1) : 0`；按 orgL4 升序。

---

## 3. CostDetailView 区块（忠实对方，从上到下）

### KPI（4 计数卡，MetricGrid）
基于 `costKpis(rows)`：成本统计项目数(`total`,主值 `--txt`) / 未超支(`normal`,`--ok`) / 超支不足5K(`under5k`,`--warn`) / 超支大于5K(`over5k`,`--danger`)。无副标（对方亦无占比）。

### 超支项目分布（ChartBox 堆叠柱，按 L4）
`costL4Dist(rows)`；x=orgL4（>6 个 rotate 30），y=超支项目数；两系列堆叠 `超支不足5k`(`STATUS.warn`)/`超支大于5k`(`STATUS.danger`)；数据标签 inside 白字、0 不显示；tooltip 合计。

### L4 成本汇总表（DataTable，无分页/无筛选）
`costL4Summary(rows)`，列：L4部门 / 项目总数 / 未超支(`--ok`) / 超支不足5k(`--warn`) / 超支大于5k(`--danger`) / 超支占比(`#cell` 渲染 `xx.x%`，>0 红 / =0 绿)。数字列挂 `.u-num`。

### 项目成本明细表（DataTable，13 列，多筛选 + 分页 + 导出；含 XS）
- 工具栏：L3部门 / L3-1部门 / L4部门 / 成本状态 / 项目类型 多选(`el-select multiple collapse-tags`，选项 = 非空去重升序；成本状态固定枚举 未超支/超支不足5k/超支大于5k) + 项目经理(text 含匹配) + 关键词(text 配编号/名称) + 重置 + 导出Excel。
- 列(13)：序号 / 项目编号(`#cell` 链跳 `/project/:id`) / 项目名称(wrap) / 类型 / L3部门 / L3-1部门 / L4部门 / 项目经理 / 项目金额(`¥`+toLocaleString,`.u-num`) / 成本状态(StatusBadge: 未超支 ok/超支不足5k warn/超支大于5k danger) / 总预算(元,`¥`,`.u-num`) / 已核算(元,`¥`,`.u-num`) / 剩余预算(元,`¥`,`.u-num`,`#cell` <0 红≥0 绿)。
- 序号列 = 跨页连续序号 `(currentPage-1)*pageSize + 页内index + 1`：在渲染前把 paged 行映射加 `_seq` 字段，DataTable 列 key=`_seq`。分页 20（页大小 20/50/100）；`:show-count="false"`，外层 pager 显 `共 N 条`。
- 默认排序：filtered 先按 L3→L3-1→L4 升序（localeCompare）再展示（对方默认序）。
- 导出 `exportRows('项目成本明细.xlsx', filtered→中文键)`：13 列（不含序号，按对方导出列；可加里程碑状态？**本期不加**，保持成本域纯净）。导出当前筛选全量。

---

## 4. 收尾清理（SP-A/B1 遗留，随 SP-C 一并交付）
- `AboutView.vue`：重写描述文案，反映新 IA——「项目分析」hub 下 5 子页（项目多维分析/里程碑管理/成本分析/回款多维分析/回款日历），回款域精简（不再含 board/calendar）。具体改 SECTIONS 数组里把"回款分析:多维看板 + …"等过时句订正。
- `riskGroups.ts:2`：注释 `被 /calendar、/ledger 共享消费` → `被 /insight/calendar、/ledger 共享消费`。

---

## 5. 设计规范 / 测试
- 仅 theme.css 令牌；成本状态用 StatusBadge 三态；金额/计数/百分比/预算列挂 `.u-num`；图色 STATUS_*；无 emoji；无散值。
- `costAnalysis.test.ts`：`costStatusOf`(各档边界 −5000/−5000.01/0/null/XS)、`isXs`、`buildCostRows`(字段映射/XS标记/null 预算→未超支)、`costKpis`/`costL4Dist`/`costL4Summary`(剔 XS、占比、空 orgL4→未知、排序)。`CostDetailView.test.ts`：KPI 文案+计数、ChartBox 存在、L4 汇总表行、明细表筛选缩小行+成本状态多选+经理/关键词+导出按钮+链接列+剩余预算染色。
- 真实数据冒烟：KPI(非XS 621 基数；超支大于5k≈15、不足5k≈12)、L4 分布、明细筛选/分页/导出。`bash verify.sh` 全绿。

## 6. 真实数据锚点（实测）
- 主域 624；XS 前缀 3（剔出 KPI/图/汇总，明细保留）。剩余预算 621 非空+3 空(→未超支)；三档(含空,未剔XS) 超支大于5k=15/不足5k=12/未超支=594。
- 字段：cost.{总预算,核算,剩余预算}=621、team.L3部门=621、orgL3_1=621、项目类型=621、paymentPmis.contract=508(余 116 取 0)。
- 我方 `cost.成本状态`(正常191/黄60/红50/空323) 与 ±5000 三档语义不同 → **不用**，按 §2 重算（忠实对方）。
