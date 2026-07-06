# V2.6.13 成本明细风险两列 + 三页范围补齐 /projects 列 设计

> 版本：V2.6.13（Z 级，页内局部）
> 日期：2026-07-06
> 背景来源：用户两条诉求——①`/insight/costdetail` 项目成本明细加「项目风险」「风险大类」两列（多风险清单式全列）；②`/risk`、`/projects/temp`、`/payment/key` 三页范围设置的「项目」类字段补齐到 /projects 全部列。

## 0. 目标与边界（共通）

- **纯前端展示/筛选层**：不改后端/schema/preprocess；风险数据（`pmis.risk`、`pmis.riskRecords`）与项目字段（`ProjectRow`）均为现有数据。
- 版本 **V2.6.13**（Z 级，`frontend/src/version.ts` 单一来源，从 V2.6.12 增量）。**升级无需点「更新数据」**。
- 无新页/新 pageKey/新依赖。

## 1. 诉求1：`/insight/costdetail` 项目成本明细加两列

### 1.1 数据（`lib/costAnalysis.ts` — `CostRow` + `buildCostRows`）
`CostRow` 新增三个派生字段：
```ts
  riskLevel: string        // 项目最高风险等级（risk.最高等级，无则 '无'）
  openRisks: number        // 未关闭风险数（risk.未关闭风险数）
  riskMajorCats: string[]  // 项目 riskRecords 去重后的「风险大类」清单（全部风险，非仅未关闭）
```
`buildCostRows` 内（已有 `const m = pmis[id]`）补：
```ts
    const risk = (m.risk ?? {}) as Record<string, any>
    const riskRecords = (m.riskRecords ?? []) as Record<string, any>[]
    const riskMajorCats = [...new Set(
      riskRecords.map((r) => String(r['风险大类'] ?? '').trim()).filter((s) => s !== ''),
    )]
```
返回对象补：`riskLevel: String(risk.最高等级 ?? '') || '无'`、`openRisks: Number(risk.未关闭风险数 ?? 0)`、`riskMajorCats`。

- **口径说明**：`项目风险`=与 /projects「风险」列同源（`riskLevel`+未关闭数）；`风险大类`列出**全部**风险记录的大类去重（用户原话"全部列出"）。

### 1.2 视图（`views/CostDetailView.vue` — `DETAIL_COLS` + cell 插槽）
在 `DETAIL_COLS`（`:108-122`）末尾（`deliveryStatus` 之后）新增两列：
```ts
  { key: 'riskLevel', label: '项目风险', width: 110, sortable: true,
    formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'riskMajorCats', label: '风险大类', width: 180, wrap: true },
```
`风险大类` 用 cell 插槽渲染清单式（每个大类一行；空则 `-`）：
```html
        <template #cell-riskMajorCats="{ value }">
          <span v-if="!value || !value.length" class="cd-mut">-</span>
          <span v-else class="cd-majorcats">
            <span v-for="c in value" :key="c" class="cd-majorcat">{{ c }}</span>
          </span>
        </template>
```
`.cd-majorcats { display:flex; flex-direction:column; gap:2px }`（清单式，一行一项；令牌间距）。

- `项目风险` 列可排序（按 riskLevel 字符串）。是否纳入列头筛选（`FILTERABLE`）：`riskLevel` 加入（enum 值少、便于筛"有无风险"）；`riskMajorCats` 为数组列，**本期不纳入列筛选**（仅展示，避免数组列的 crossFilter 摊平改造，YAGNI）。
- 随现有排序/列筛选/导出机制；导出（`exportRows`/onExport）如逐列映射，`riskMajorCats` 以「、」连接为一个单元格字符串（导出友好）。

## 2. 诉求2：三页范围「项目」组补齐到 /projects 列

### 2.1 目标口径
三页范围设置的「项目」类字段 = **/projects 清单可列出的列集**（`ProjectRow` 支撑的列）：客户 / 合同金额 / 项目经理 / L4组 / 阶段 / 完工进展 / 项目风险等级(+未关闭数) / 级别 / 项目类型 / 预算消耗比 / 回款完成率 / 项目状态 / 健康度 / 关注原因 / 回款状态 / TOP1000 / 象限。（纯标识列 项目编号/项目名称 不作筛选项——页面已有搜索/单表已含编号。**「标签」不纳入本次**：scope 下拉选项需把 project-tags 注入 scope builder，而现有 `buildScopeInputs` 未接 assignments、temp 现有「标签」scope 本就取不到值＝既有空壳；不为 /risk 新增一个同样取不到值的死过滤，标签 scope 作为独立后续项。）

ScopeBuilder 完全通用（`components/ScopeBuilder.vue`）：catalog 驱动字段下拉，enum 选项由 `candidatesMap` 从 `inputs` 自动摊平（含数组字段，`Array.isArray` 分支）。故只需 **①catalog 增字段 + ②输入行携带对应键**，UI 自动出现、下拉自动填充。

### 2.2 `/projects/temp` + `/payment/key`（共用 `lib/tempScope.ts` + `buildScopeInputs`）
现 project 组已 25 字段、覆盖 /projects 列，**唯缺「关注原因」**。
- `tempScope.FIELD_CATALOG` project 组新增：
  ```ts
  { group: 'project', key: 'riskReasons', label: '关注原因', kind: 'enum' },
  ```
- `tempFollowup.buildScopeInputs` 的 `proj` 新增：
  ```ts
    riskReasons: (pr?.riskReasons ?? []).map((r) => r.category),
  ```
  （`pr` 即 `ProjectRow`，其 `riskReasons: RiskReason[]`；取 `category` 数组，enum 多值 in 匹配同 tags。）
- 两页零改动（都经 `buildScopeInputs`+`projectMatches`+`FIELD_CATALOG`，自动获得新字段）。

### 2.3 `/risk`（`lib/riskRows.ts` — `RISK_SCOPE_CATALOG` + `buildRiskRows`，SINGLE 一行一风险）
现 project 类仅 9 项。补齐 /projects 列缺的 11 项（标签除外，见 2.1）。
- `buildRiskRows` 引入 `buildProjectRows` 造 `ProjectRow` 映射，给每条风险行挂项目级字段（键用中文，避开风险记录键 风险等级/风险状态/风险大类/风险小类/风险名称/风险描述/风险编码）：
  ```ts
  import { buildProjectRows } from './projectList'
  // ... 函数内：
  const prMap = new Map(buildProjectRows(projects, pmisMap).map((r) => [r.projectId, r]))
  // ... push 的行对象补（pr = prMap.get(p.projectId)）：
    '项目阶段': pr?.stage ?? '-',
    '完工进展': pr?.progress ?? null,
    '项目最高风险等级': pr?.riskLevel ?? '无',
    '未关闭风险数': pr?.openRisks ?? 0,
    '预算消耗比': pr?.costRatio ?? null,
    '回款完成率': pr?.paymentRatio ?? null,
    '健康度': pr?.health ?? '无数据',
    '关注原因': (pr?.riskReasons ?? []).map((r) => r.category),
    '回款状态': pr?.paymentStatus ?? '-',
    'TOP1000': pr?.top1000 ?? '否',
    '象限': pr?.quadrant ?? '',
  ```
- `RISK_SCOPE_CATALOG` 追加对应 11 条 FieldLike（enum/number）：
  ```ts
  { key: '项目阶段', label: '项目阶段', kind: 'enum' as FieldKind },
  { key: '完工进展', label: '完工进展', kind: 'number' as FieldKind },
  { key: '项目最高风险等级', label: '项目最高风险等级', kind: 'enum' as FieldKind },
  { key: '未关闭风险数', label: '未关闭风险数', kind: 'number' as FieldKind },
  { key: '预算消耗比', label: '预算消耗比', kind: 'number' as FieldKind },
  { key: '回款完成率', label: '回款完成率', kind: 'number' as FieldKind },
  { key: '健康度', label: '健康度', kind: 'enum' as FieldKind },
  { key: '关注原因', label: '关注原因', kind: 'enum' as FieldKind },
  { key: '回款状态', label: '回款状态', kind: 'enum' as FieldKind },
  { key: 'TOP1000', label: 'TOP1000', kind: 'enum' as FieldKind },
  { key: '象限', label: '象限', kind: 'enum' as FieldKind },
  ```
- `RiskFollowupView` 零改动（scope 走 `RISK_SCOPE_CATALOG`+`riskRowMatches`+`buildRiskRows`，`riskRowMatches` 用 `leafMatch(row[field])` 通用，新字段自动可筛；`标签/关注原因` 数组 enum 由 `leafMatch` 的 `Array.isArray` 分支匹配）。风险表格列（`RISK_COLUMNS`/`PROJECT_COLS`）不改——新增字段仅供 scope，不进表格。

> DRY：temp 与 /risk 的项目字段值均由**同一 `ProjectRow` 派生**（`buildProjectRows`），避免重复口径；两页 catalog 键命名空间不同（temp 英文键、/risk 中文键）故各自列 catalog，字段集对齐 /projects 列。

## 3. 影响面

- 诉求1：`/insight/costdetail` 明细表多两列；`costL4*`/卡片/口径不受影响（只加派生字段）。
- 诉求2：三页范围新增可选筛选字段；已保存的历史范围（旧字段）不受影响（新字段仅是可选项）。temp/paykey 现有字段保留。
- 无后端/schema/口径来源变化。

## 4. 测试与验证

**先补测试再改实现（TDD）：**
1. `costAnalysis.test.ts`：`buildCostRows` 产 `riskLevel`（risk.最高等级/无）、`openRisks`、`riskMajorCats`（多条去重、空数组、含 已关闭 也计入=全部）。
2. `tempScope`/`tempFollowup` 测试：`buildScopeInputs` 的 `proj.riskReasons` 为 category 数组；`FIELD_CATALOG` 含 `关注原因`；`projectMatches` 对 `关注原因 in [...]` 命中（数组 enum）。
3. `riskRows.test.ts`：`buildRiskRows` 行含新 11 键（值取自 ProjectRow，如 `健康度`/`关注原因`数组/`完工进展`number）；`RISK_SCOPE_CATALOG` 含新 11 条；`riskRowMatches` 对新字段（`关注原因` 数组 enum、`完工进展` number 区间）命中。
- `bash verify.sh` 全绿（含前端 typecheck/vitest/build）。真机冒烟：costdetail 明细两列（项目风险 `高(3)`、风险大类清单）；三页范围下拉出现新字段、选值命中数正确。

## 5. 版本与打包

- 版本 **V2.6.13**（Z 级）。纯前端，**升级无需点「更新数据」**。收尾出增量更新包（从 V2.6.12 增量）+ 升级手册。

## 6. 不做什么（明确排除）

- 不加 /project/:id 的 PMIS 原始明细字段（仅到 /projects 列，用户 Q1 选定）。
- `风险大类` 列本期只展示、不纳入列头筛选（数组列筛选改造 YAGNI）。
- 不改风险表格列、不移除 /risk 现有 9 个中文键项目字段、不动 temp 现有字段。
- 「标签」scope 字段不纳入本次（选项需 project-tags 注入 scope builder，temp 现有亦为空壳）——作为独立后续项，避免新增取不到值的死过滤。
- 不改 `overspendAmount`/风险数据来源口径、不改后端/schema。
