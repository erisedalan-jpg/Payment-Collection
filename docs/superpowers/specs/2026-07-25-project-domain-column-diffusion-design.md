# 项目域字段扩散（A 期）设计

> 本期 = 用户需求 1 + 2.1 + 2.2。需求 2.3（跟进表时间差计算列）与需求 3（倚天饱和度口径）
> 各自独立成期，见文末「后续期次」，**不在本 spec 范围内**。
>
> 版本：**V4.4.4**（Z 级，用户钦定；基线 V4.4.3）。**纯前端，无需点「更新数据」。**

## 1. 目标

1. `/projects` 增加「计划关闭时间」「实际关闭时间」两列（默认隐藏）。
2. 「重点跟进」分组下四页（`/projects/key`、`/projects/temp`、`/risk`、`/payment/key`）的**选列**补齐项目域全量字段，默认不展示。
3. 上述四页中有「范围设置」的三页（`/projects/temp`、`/risk`、`/payment/key`）补齐项目域取值。
4. **建立结构性保证**：今后 `/projects` 新增任何项目域列，自动流入四页选列与范围设置，无需再逐页改一遍。

第 4 点是本期真正的交付物。1~3 是它的首批受益者。

## 2. 现状（实测）

### 2.1 关闭时间数据早已在手

`milestones.py:27` 已解析 `("项目关闭", "计划项目关闭时间", "实际项目关闭时间", None, None)`，产出进
`analysis_data.projectMilestones`（`Dict[项目编号, List[MilestoneItem]]`，`schema.py:330`）。
`/projects`、`/projects/temp`、`/payment/key` 三页**已经把该字典取到手**（分别见
`ProjectsView.vue:184`、`TempInstancePanel.vue:60`、`PaymentKeyFollowupView.vue:65`）。

→ **前端派生即可，后端与管线零改动。**

### 2.2 四页不是同构的，是两个命名体系

| 页面 | 行类型 | 行粒度 | 键体系 | 列模型 | 行构建器 |
|---|---|---|---|---|---|
| `/projects/key` | `KeyProjectRow` | 项目 | 英文 | 静态声明 | `buildKeyProjectRows`（`keyProjects.ts:76`） |
| `/projects/temp` | `TempRow extends KeyProjectRow` | 项目 | 英文 | 静态声明 | `buildTempRows`（`tempFollowup.ts:13`） |
| `/payment/key` | `PaymentKeyRow` | 项目 | 英文 | 静态声明 | `buildPaymentKeyRows`（`paymentKeyFollowup.ts:33`） |
| `/risk` | `RiskRow` | **风险记录**（一项目多行） | **中文** | **从行键动态推导**（§3.4） | `buildRiskRows`（`riskRows.ts:22`） |

`RiskRow` 用 `...rr` spread 了风险记录的全部原始中文键（`riskRows.ts:41`），其项目级字段也一律中文
（`'立项日期'`、`'项目阶段'`、`'项目最高风险等级'`…），且 `RISK_SCOPE_CATALOG` 注释明写
「key 必须与风险行键一致」。**risk 不能改用英文键**。

### 2.3 范围设置是两套实现

| 页面 | 实现 | 字段目录 |
|---|---|---|
| `/projects/temp`、`/payment/key` | 三组条件树（project / paymentNode / milestone），输入由 `buildScopeInputs` 构建 | `tempScope.FIELD_CATALOG`（单一来源，两页共用） |
| `/risk` | `single-table` 模式，条件直接作用于风险行 | `riskRows.RISK_SCOPE_CATALOG` |

`FIELD_CATALOG` 中 `{ key: 'tags', label: '标签' }` **已存在**（`tempScope.ts:55`）——用户点名的「标签」
无需新增，本期只补关闭时间与原项目立项日期。

### 2.4 合同金额：三种键、两种单位（本期最大的坑）

| 出处 | 键 | 单位 |
|---|---|---|
| `ProjectRow` / `/projects` 列 | `contractAmount` | **元**（列 formatter 里除 10000 显示万） |
| `KeyProjectRow` / `PaymentKeyRow` | `contractWan` | **万** |
| `RiskRow` | `'项目金额'` | **万** |

三者是同一个业务概念。若纯按 key 去重借列，四页会**同时出现** `contractWan`（自有）与
`contractAmount`（借入）两列合同金额——key 不撞、去重逻辑放行，但语义重复。必须显式排除。

## 3. 设计

### 3.1 关闭时间取数

`ProjectRow` 新增两字段，`buildProjectRows` 增加**可选**第四参 `milestones`：

```ts
plannedCloseDate: string | null   // projectMilestones[pid] 中 name === '项目关闭' 的 planDate
actualCloseDate:  string | null   // 同上的 actualDate
```

- 与既有 `plannedFinalAcceptDate`（直取后端回填的 `prog.终验时间`）取数路径**不同**：关闭时间后端
  从未回填，只能查 `projectMilestones`。
- 参数设为**可选**（`milestones?`），缺省 `{}` → 两字段为 `null`。这样 `buildProjectRows` 现有
  **6 个调用点**（`ProjectsView.vue:42`、`OverviewView.vue:76`、`tempFollowup.ts:19`、
  `tempFollowup.ts:52`、`paymentKeyFollowup.ts:37`、`riskRows.ts:28`）与 20+ 处测试调用
  **无需同步改造即可编译通过**，避免改签名留下孤儿消费方。需要该值的调用点逐个显式传入。
- 边界：`row_to_milestones` 对全空类目 `continue` 跳过，没排过关闭节点的项目取不到该项 → 显示 `-`。
  这是源数据缺失，不是缺陷。

### 3.2 项目域列的单一来源

把 `/projects` 的列定义提为 `projectList.ts` 的导出常量：

```ts
// projectList.ts —— 项目域列定义唯一来源（不含 action 操作列）
export const PROJECT_DOMAIN_COLUMNS: DataColumn[] = [ ...26 列... ]
```

26 列 = `/projects` 现有 24 个数据列（`ALL_COLUMNS` 25 项减去 `action`）+ 本期新增
`plannedCloseDate`、`actualCloseDate`。
`ProjectsView.vue` 改为 `const ALL_COLUMNS = [...PROJECT_DOMAIN_COLUMNS, ACTION_COL]`
——`/projects` 自己也吃这份来源，不留第二套定义。

### 3.3 英文三页：借列 + decorate

```ts
// projectList.ts
export const BORROW_EXCLUDE = new Set(['contractAmount'])  // §2.4：三页已有 contractWan

export function borrowProjectColumns(ownKeys: Set<string>): DataColumn[] {
  return PROJECT_DOMAIN_COLUMNS.filter((c) => !ownKeys.has(c.key) && !BORROW_EXCLUDE.has(c.key))
}
```

- 三页 `ALL_COLUMNS = [...自有列, ...borrowProjectColumns(自有 keys)]`，借入列**一律不进
  `DEFAULT_VISIBLE`**（满足「默认不展示」，实现要点见 §3.3.1）。
- 行值用 decorate 补齐，**不改各行构建器的白名单**（白名单是刻意设计，V4.4.0 已确立）：

```ts
/** 英文三页：把 ProjectRow 的项目域字段并到行上；已有键不覆盖，只补差集。
 *  补的 key 集 = PROJECT_DOMAIN_COLUMNS 的 key − BORROW_EXCLUDE。 */
export function decorateProjectDomain<T extends { projectId: string }>(
  rows: T[], prMap: Map<string, ProjectRow>,
): T[]

/** risk 专用（§3.4）：按 keyMap 把 ProjectRow 字段写成【中文键】。
 *  绝不写英文键——risk 的列由行键动态推导，每个英文键都会变成一列。
 *  exclude 内的 key 不写；日期值写入前 slice(0,10)；已有键一律不覆盖。 */
export function decorateProjectDomainMapped<T extends { projectId: string }>(
  rows: T[], prMap: Map<string, ProjectRow>,
  keyMap: Record<string, string>, exclude: Set<string>,
): T[]
```

risk 行是**风险记录粒度**（一个项目多行），同一个 `ProjectRow` 会被并到该项目的每一行上——
这是预期行为，与现有 `buildRiskRows` 用 `prMap` 逐行取值的做法一致。

必须并到**行对象**上而非渲染时现取——否则排序、列筛选、导出三处读不到值（V4.4.0 踩过）。
各构建器现有手工挑的字段（`stage`/`health`/`progress` 等）保留原样，decorate 只补缺失键，
避免既有行为漂移。

#### 3.3.1 必须先拆出 `OWN_KEYS`：`/projects/key` 的默认可见列是反推的

`KeyProjectsView.vue:79` 写的是 `const DEFAULT_VISIBLE = ALL_KEYS.filter((k) => k !== 'setupDate')`
——「除 `setupDate` 外全部默认可见」。若直接把借入列 concat 进 `ALL_COLUMNS`，`ALL_KEYS` 随之变大，
**全部借入列会自动变成默认可见**，直接违反「默认不展示」。

四页统一改成先声明自有列、再合并：

```ts
const OWN_COLUMNS: DataColumn[] = withSortable([ ...本页原有列... ])
const OWN_KEYS = OWN_COLUMNS.map((c) => c.key)
const ALL_COLUMNS = [...OWN_COLUMNS, ...borrowProjectColumns(new Set(OWN_KEYS))]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = OWN_KEYS.filter((k) => k !== 'setupDate')   // ← 基于 OWN_KEYS，不是 ALL_KEYS
```

另外三页（`/projects/temp`、`/risk`、`/payment/key`）的 `DEFAULT_VISIBLE` 本就是**显式白名单数组**
（如 `PaymentKeyFollowupView.vue:103`），concat 不影响它们；但仍按上式统一写法，避免下次有人
改成反推式又踩一遍。

### 3.4 `/risk`：值写进行即成列，不借列

`/risk` 的列模型与另外三页**根本不同**（`RiskFollowupView.vue:92-114`）：

```ts
const riskCols = computed(() => {   // 遍历 allRows 的所有键，排除 NON_RISK_KEYS，逐个生成列
  for (const r of allRows.value) for (const k of Object.keys(r)) { ... }
  return keys.map((k) => ({ key: k, label: known.get(k)?.label ?? k, width: 160, wrap: true, sortable: true, ... }))
})
const ALL_COLUMNS = computed(() =>
  data.data ? [...riskCols.value, ...PROJECT_COLS, ...FOLLOW_COLS, ...custom.columns.value] : [])
```

列是从**行对象的键**动态推导的。由此：

- **risk 不使用 `borrowProjectColumns`。** 只要 decorate 把中文键写进行，列自动出现
  （`label` 取 `RISK_COLUMNS` 中的定义，查不到则**回退为 key 本身**——中文 key 天然可读；
  `sortable: true`、`width: 160`、`wrap: true`）。现有 12 个中文项目级字段
  （`立项日期`/`项目阶段`/`完工进展`…）正是这样出现在选列里的，并非静态声明。
- **risk 行绝不能写入英文键。** 每个英文键都会被 `riskCols` 变成一列、label 即英文 key
  （`setupDate`、`orgL4`…），凭空多出 20+ 个与中文列重复的列。
- 因此 risk **不复用** `PROJECT_DOMAIN_COLUMNS` 的列定义，§3.3 那个「formatter 读兄弟字段
  `openRisks`」的问题在 risk 上**不存在**——它自己生成列，不带 formatter。

risk 仍与另外三页共用**同一份字段清单**（`PROJECT_DOMAIN_COLUMNS` 的 key 集），只是经映射层落成中文键：

```ts
// riskRows.ts —— 英文 key → risk 行的中文 key。键集必须与 PROJECT_DOMAIN_COLUMNS 一一对应（26 条）。
export const RISK_KEY_MAP: Record<string, string> = {
  // ①（19 条）目标键已存在于 RiskRow：只做映射，不新增列。
  //    值必须与现网 RiskRow / RISK_SCOPE_CATALOG 逐字一致，严禁改动。
  projectId: '项目编号',      projectName: '项目名称',    projectLevel: '项目级别',
  projectManager: '项目经理', orgL4: 'L4组织',            projectType: '项目类型',
  projectStatus: '项目状态',  setupDate: '立项日期',      stage: '项目阶段',
  progress: '完工进展',       riskLevel: '项目最高风险等级',
  costRatio: '预算消耗比',    paymentRatio: '回款完成率', health: '健康度',
  riskReasons: '关注原因',    paymentStatus: '回款状态',  top1000: 'TOP1000',
  quadrant: '象限',           contractAmount: '项目金额',
  // ②（7 条）本期新增到 risk 的列与 RISK_SCOPE_CATALOG
  signUnit: '签约单位',       tags: '标签',
  originSetupDate: '原项目立项日期',
  plannedFinalAcceptDate: '计划终验时间',
  actualFinalAcceptDate: '实际终验时间',
  plannedCloseDate: '计划关闭时间',
  actualCloseDate: '实际关闭时间',
}
```

- **`riskLevel → '项目最高风险等级'` 不可写成 `'风险等级'`**：后者是风险记录自身的等级，是另一个概念，
  且已在 `RISK_SCOPE_CATALOG` 里占位。写错会让两个概念静默串值。
- **`contractAmount → '项目金额'` 只做映射、不新增列**：目标键已存在且单位为万；`buildRiskRows`
  现有的 `Math.round(contract / 1000) / 10` 换算保持不动，decorate **不得**用 `ProjectRow` 的元值覆盖它。
- `customer` / `openRisks` 等 `ProjectRow` 有、但 `/projects` 未做成列的字段**不进本映射表**——
  本表的职责是给 `PROJECT_DOMAIN_COLUMNS` 的每个 key 找到 risk 侧对应键，与列集严格同构。

#### 3.4.1 risk 侧的取值细节

- **日期值写入前 `.slice(0, 10)`**：`prog.终验时间` 等源值可能带时间部分，而 risk 的动态列
  **不会**套 `fmtDateCell`（`riskCols` 只对 `RISK_COLUMNS` 中标了 `date` 的键加该 formatter，
  新增的项目域键不在其中）。不切片就会在单元格里露出时间戳。
- **数组值（`tags`）按原样写入**，显示为逗号分隔——与 risk 已有的 `关注原因`（同为数组）行为一致，
  本期不为其单独加 formatter。
- `contractAmount → '项目金额'`：目标键已由 `buildRiskRows` 写入（单位万），decorate 的
  「已有键不覆盖」规则天然跳过它；仍在 `exclude` 中显式列出，避免日后有人改动覆盖规则时踩到
  元/万混淆。

### 3.5 结构性保证：契约测试

光靠代码结构不足以保证「后续新增列自动搬入」——有人在某页硬编码列清单就会退化。加四条测试：

1. **映射完备（双向严格相等）**：`RISK_KEY_MAP` 的键集 **===** `PROJECT_DOMAIN_COLUMNS` 的 key 集。
   将来 `/projects` 加列却忘了给 risk 映射（或映射表留了已删列的残条），测试直接红。
2. **列覆盖（英文三页）**：各自 `ALL_KEYS` ⊇（`PROJECT_DOMAIN_COLUMNS` 的 key − `BORROW_EXCLUDE`）。
   risk 不适用——它的列由行键推导，改由第 3 条覆盖。
3. **值可达**：对四页各造样本数据跑完整构建链（含 decorate），断言：
   - 英文三页：每个借入列的 key 在行对象上**确实取得到值**。
   - `/risk`：`RISK_KEY_MAP` 的全部**值**（26 个中文键）都在行上；且行上**不含**
     `RISK_KEY_MAP` 的任何**键**（英文键），`projectId`/`riskKey` 等既有例外除外。
     后半条是防回归的关键——写错成英文键不会报错，只会让选列面板多出 20+ 个重复列。

   只测列定义不测行，会漏掉「列加了但行上没值」这一类——那正是 decorate 存在的理由。
4. **默认不展示**：四页各自 `DEFAULT_VISIBLE` ∩ 新增列 key = ∅。专防 `/projects/key` 那种反推式
   写法（§3.3.1）——它不会让任何现有断言变红，只会让新列静默地全部默认可见。

### 3.6 范围设置

| 目标 | 改动 |
|---|---|
| `/projects/temp`、`/payment/key` | `FIELD_CATALOG` 新增 `plannedCloseDate`/`actualCloseDate`/`originSetupDate`（均 `kind: 'date'`）；`buildScopeInputs` 的 `proj` 对象同步产出这三个键 |
| `/risk` | `RISK_SCOPE_CATALOG` 新增 §3.4 ②组 7 个中文键条目，kind 按字段类型 |

**红线（`tempScope.ts:63` 原注释）**：已存的范围条件按 key 序列化在 `data/temp_followup.json` 等文件里，
改名会让用户配好的范围**静默失效**（条件仍显示、永远匹配不到、无报错）。
本期**只新增 key，绝不改动任何现有 key**——包括 `RISK_SCOPE_CATALOG` 的中文键。

### 3.7 老用户兼容：本期不需要迁移标记位

V4.0.1 需要写一次性迁移标记位，是因为要把 `tags` 加进**默认可见**，而 `useColumnPrefs` 持久化优先、
`DEFAULT_VISIBLE` 仅在无持久化时兜底。

本期所有新列（含 `/projects` 的两个关闭时间列，用户已确认**默认隐藏**）都不进 `DEFAULT_VISIBLE`：
老用户 persisted `visibleKeys` 里没有它们，正好即是期望行为；新列出现在选列面板中可勾选。
`/risk` 用的是 `useColumnPrefsDynamic`，须回归验证新增静态列不被过早锁定（V3.2.3 修过同类问题）。

## 4. 明确不做

- 不动 `preprocess_data.py` 及任何后端管线；不新增 `data/*.json`；**升级无需点「更新数据」**。
- 不改任何现有列/字段 key 的名称。
- 不改 `/opportunities/key`（商机域，非项目域，用户已排除）。
- 不改各页 `DEFAULT_VISIBLE`（除 `/projects` 沿用原值不变外，四页均只追加隐藏列）。
- 不重构 `RiskRow` 的中文键体系（改造面过大且触发 §3.6 红线）。

## 5. 验证

- `bash verify.sh` 全绿（含 typecheck、vitest、build、pytest）。
- 契约测试（§3.5）四条全部通过。
- 手工回归：
  - 四页勾出借入列后，**排序 / 列筛选 / 导出**三处均能读到值（decorate 的核心风险点）。
  - 三页范围设置存旧条件 → 重开 → 条件仍在且匹配数不变（key 未漂移）。
  - `/projects` 两个关闭时间列与 `/project/:id` 里程碑 tab 的「项目关闭」行**逐项目对拍一致**。
  - `/risk` 的「项目金额」仍为万、数值与升级前一致（未被元值覆盖）。

## 6. 后续期次（本 spec 不含）

- **C 期：倚天工时饱和度口径变更。** 分母由「区间工作日数 × 8」改为「该员工填写天数 × 8」，
  填写天数 = 有工时记录的不同日期数，且排除 `holidays.csv` 标记为假期的日期；分子维持现状
  （全量工时含管理类）。属破坏性口径变更，影响 `metrics.ts` 及全部倚天页面，需独立 spec。
- **B 期：跟进表「时间差计算」列。** 给 `followup_columns.py` 现有 `text`/`date` 之外增加第三种
  列类型，计算「指定日期（列 / 固定日期 / 当前日期）− 指定列」的天数差；超管配置一次全表生效。
  作用于 `temp`/`risk`/`payment_key`/`opportunity` 四表。需独立 spec。

执行顺序（用户已确认）：**A → C → B**。
