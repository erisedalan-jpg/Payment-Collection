# /insight/risk 透视 + 下钻 + 筛选 设计文档（SP-3）

> 日期：2026-06-24　版本：V1.20.1（页内增强，Z 位）
> 所属拆分：用户大需求(6 项)拆 4 子项目之 SP-3。SP-1(侧边栏折叠)/SP-2(重点项目进展页)已完。余 SP-4(/insight/milestone 到期提醒表) 后续。
> 状态：设计已与用户确认，待用户复核本 spec 后转 writing-plans。

## 1. 目标

改造 `/insight/risk` 风险看板三处：
1. **风险统计分析**：加「风险等级筛选」（多选 高/中/低/无风险，默认全选，可去勾如无风险），**只作用于本块**（不影响顶部卡片与风险概览）。
2. **风险概览**：从"单维×风险等级"表升级为**类似 /insight 的行列自选透视**——维度按【风险维度】/【项目维度】两类，自选行/列维 + 指标，PivotTable 展示。
3. **全页下钻联动**：点图表柱 / 透视格 / 表行 → 弹窗列出该桶项目，点行跳 `/project/:id`。

顶部 4 张风险卡片（健康度/高/中/低）保持不变。

## 2. 数据模型扩展（lib/riskBoard.ts）

当前 `RiskRow`（每项目 1 行）有 7 维：riskLevel/orgL4/projectLevel/manager/industry/top1000/quadrant。本期扩展：

**新增项目维度字段**（1 对 1）：
- `projectStatus`：`v(pmis.status.项目状态)`
- `stage`：`v(pmis.progress.项目阶段)`
- `health`：`v(p.health?.overall, '无数据')`

**新增风险分类多值字段**（风险记录级，取**未关闭记录**=风险状态不含"已关闭"，与看板"仅未关闭风险"口径一致）：
- `riskMajorCats: string[]`：未关闭记录的去重 `风险大类`；有未关闭但大类全空→`['未分类']`；**无未关闭风险→`['无风险']`**（保证每项目至少落一桶）。
- `riskMinorCats: string[]`：同理用 `风险小类`。

数据事实（已核）：riskRecords 含 `风险大类`/`风险小类`；大类枚举约 7 类（客户侧风险/成本超支风险/范围与需求风险/交付条件风险/资源配置风险/技术与方案风险/质量风险）；43 个项目有风险记录、其余无风险；未关闭风险跨>1 大类的项目实测 4 个。

## 3. 维度分类与多值炸开（lib/riskBoard.ts）

`RiskDimDef` 加 `category: 'risk' | 'project'` 与 `multi?: boolean`。新 `RISK_DIMENSIONS`（12 维）：

| category | key | label | multi |
|---|---|---|---|
| risk | riskLevel | 风险等级 | |
| risk | riskMajorCats | 风险大类 | ✓ |
| risk | riskMinorCats | 风险小类 | ✓ |
| project | orgL4 | L4组织 | |
| project | projectLevel | 项目级别 | |
| project | manager | 项目经理 | |
| project | industry | 行业 | |
| project | top1000 | TOP1000 | |
| project | quadrant | 象限 | |
| project | projectStatus | 项目状态 | |
| project | stage | 项目阶段 | |
| project | health | 健康度 | |

**多值炸开**：新增 `dimValues(row, dimKey): string[]`——多值维（multi）返回该数组，单值维返回 `[String(row[dimKey])]`。`groupRisk` 与新 `riskPivot` 均按 `dimValues` 迭代：一个项目按其多个大类/小类分别计入对应桶。**后果：项目数会跨桶重复，∑各桶 > 总项目数**（与 /insight/board 标签维同款，风险分类分析的直觉行为）。单值维不受影响（每项目恰一桶）。

`RISK_METRICS` 不变（项目数/有风险项目数/未关闭风险数/合同总额），对炸开后的桶照常计（项目数=该桶去重项目数、未关闭风险数=ΣopenRisks 等）。

## 4. riskPivot（lib/riskBoard.ts，镜像 projectPivot.insightPivot）

新增 `riskPivot(rows: RiskRow[], rowDims: string[], colDims: string[], metricKey: RiskMetricKey): PivotResult<RiskGroup>`，复用 `lib/pivot` 泛型结构（同 insightPivot/payBoardPivot）：按 `dimValues` 对行/列多维分桶（多值维炸开），单元格=该 行键元组×列键元组 桶的 metric，`index[rowKey][colKey]` 留 `RiskGroup`（含 `.rows` 供下钻）。空桶单元格 NaN（展示层显 '-'，沿用 lib/pivot）。

## 5. RiskBoardView.vue 三块改造

### 5.1 风险统计分析（加筛选 + 下钻）
- 工具栏加「风险等级」多选筛选（值 高/中/低/无风险，默认全选）。`statRows = rows.filter(r => levelFilter.includes(r.riskLevel))`，**仅本块用 statRows**；卡片/概览仍用全量 rows。
- 维度选择器扩到 12 维（沿用 SegToggle，12 项换行）；指标/图表沿用。`groupRisk(statRows, dimKey)`（dimKey 为多值维时炸开）。
- **下钻**：点图表柱（ECharts 点击事件，category→桶）或点表行 → 打开 `RiskDrillModal`，传该桶（该 dim 值）的 `RiskGroup.rows`。

### 5.2 风险概览（升级为透视）
- 替换原 `riskOverview` 单维表为 **PivotTable**：
  - `DimPicker` 选行维/列维。维度在选择器中**按【风险维度】/【项目维度】两组分区展示**——给 DimPicker 加最小增强：`options` 支持可选 `group` 字段，渲染分组小标题（不破坏现有 /insight 用法：无 group 字段时平铺如旧）。
  - `SegToggle` 选指标（RISK_METRICS）。
  - 默认 行维=`['orgL4']`、列维=`['riskLevel']`、指标=`projectCount`（≈复现旧概览的"高/中/低/无风险"矩阵）。旧的"健康度%"派生列退场——整体健康度仍由顶部卡片承载，按需把"风险等级"放列维即可看分布。
  - `pivot = riskPivot(rows, rowDims, colDims, metricKey)`，`PivotTable` 渲染。
- **下钻**：点透视格（PivotTable `@cell-click {rowKey,colKey}`）→ `RiskDrillModal`，传 `pivot.index[rowKey][colKey].rows`。

### 5.3 RiskDrillModal（下钻弹窗）
- 新建 `components/RiskDrillModal.vue`（参照 InsightDrillModal 范式）。props `{ modelValue:boolean, title:string, rows: RiskRow[] }`，emit `update:modelValue`。
- 渲染小表（项目编号/项目名称/L4组织/风险等级/未关闭数/合同(万)），点行 → `router.push('/project/'+row.projectId)` 并关闭。
- **口径准确**：直接用该桶 `RiskRow`（看板"仅未关闭"口径），规避 /projects riskLevel（最高等级含已关闭）口径不同源——故不走 /projects 深链。

## 6. 边界 / 错误

- 多值风险维：项目跨大类/小类重复计（∑>总数）；无未关闭风险→'无风险'桶；有风险但大类空→'未分类'桶。
- 大类/小类口径=仅未关闭记录（与看板一致）。
- 风险等级筛选全去勾 → statRows 空 → 图/表空，不报错。
- 透视空桶 NaN→'-'；无项目数据→沿用现有空态提示。
- 下钻桶为空（理论上不会，桶由实际行构成）→ 弹窗空表。

## 7. 测试

- **lib/riskBoard（vitest）**：
  - buildRiskRows 新增 projectStatus/stage/health 映射；riskMajorCats/riskMinorCats 三态（未关闭多类去重 / 有风险但大类空→未分类 / 无未关闭→无风险）。
  - `dimValues` 单值维与多值维。
  - `groupRisk` 多值维炸开（项目跨桶重复，∑>总数）+ 单值维零回归（∑=总数）。
  - `riskPivot` 行列分桶、多值炸开、指标计算、index 下钻引用、空桶 NaN。
  - RISK_DIMENSIONS 12 维 + category/multi 标注。
- **组件（vitest）**：RiskBoardView 风险等级筛选只作用本块（卡片/概览不变）、透视 DimPicker 切行列维、点柱/格/行开下钻弹窗；RiskDrillModal 点行跳详情；DimPicker 分组渲染（有 group 字段分组、无则平铺回归）。
- **验证**：`bash verify.sh` 全绿；手动冒烟：切风险/项目维度透视、多值大类透视看跨桶、风险等级去勾无风险、点格下钻看桶项目。

## 8. 范围与非目标

- 非目标：风险大类/小类用"全部记录"口径（本期仅未关闭，与看板一致）；交叉(cross)选项卡（保持概览=透视一种，不引 /insight 的三选项卡）；下钻走 /projects 深链（用弹窗，规避口径不同源）；风险维度再扩（就这 3 个）。
- 版本 V1.20.1（`frontend/src/version.ts`），与累积未上线版本一并待打包。禁止 emoji；commit 末尾 Co-Authored-By 行；spec/plan 文档写盘不 commit。
