# 倚天工时饱和度口径变更（C 期）设计

> 本期 = 用户需求 3。A 期（项目域字段扩散）已随 V4.4.4 交付；B 期（跟进表时间差计算列）另立 spec。
>
> 版本：**建议 V4.4.5（Z 级）**，最终由用户拍板。**纯前端，无需点「更新数据」。**

## 1. 目标

把倚天工时「饱和度」的分母由「区间工作日数 × 8」改为「该员工填写天数 × 8」，
分子维持现状（全量工时，含管理类/假期类）。

- **填写天数** = 该员工在区间内**有工时记录**的**不同日期**数，且该日期在 `holidays.csv`
  口径下为**工作日**（`YitianDay.workday === true`）——即假期日填的工时不计入填写天数。
- 分子**不变**：`metrics.ts:93` 已是全量加总（注释明写「实际工时含全部工时类型」），本期不动。

## 2. 现状与矛盾（必须先解决的设计问题）

### 2.1 现状

```ts
base = workdayCount(days, start, end) × meta.hoursPerDay   // 全员同一个分母
sat  = hours / base
diff = hours − base                                        // 负=欠填,正=加班
```

### 2.2 `diff` 是六处「欠填/加班」判断的唯一来源

| 消费方 | 位置 | 用法 |
|---|---|---|
| 分析页「达标 / 欠填」分类 | `YitianAnalyticsView.vue:65-66` | `filled && diff >= 0` / `filled && diff < 0` |
| 欠填发散条图 | `YitianAnalyticsView.vue:147,157-158` | 按 `diff` 排序、正负着色 |
| 「未按时填写」清单 | `metrics.unfilledList:198` | `filled && diff < 0` |
| KPI 加班人数/工时 | `metrics.kpi:216,225` | `diff > 0` |
| 趋势页加班工时 | `YitianTrendView.vue:69` | `diff > 0` 求和 |
| 趋势页未填人数 | `YitianTrendView.vue:74` | `unfilledList + neverFilledList` |

### 2.3 矛盾

分母一旦改成「填写天数 × 8」，`diff` 的语义就从「欠填多少」退化为「填写的那几天里盈亏多少」——
**该填 20 天、只填 1 天且填满 8h 的人，`diff = 0`，被判定为「达标」**。上表六处监控同时失效。

用户已确认：**不接受这个后果**，欠填监控必须保住。

## 3. 设计：双基准，各司其职

`EmpStat` 拆成两个基准，一个喂饱和度、一个喂欠填：

```ts
export interface EmpStat {
  id: string; name: string; l3: string; l31: string; l4: string
  hours: number         // 不变:区间内该员工全部工时(含管理类/假期类)
  filledDays: number    // 【新增】有记录且 YitianDay.workday===true 的不同日期数
  base: number          // 【改】filledDays × hoursPerDay —— 只喂 sat
  expectedBase: number  // 【新增】workdayCount(区间) × hoursPerDay —— 即旧 base,只喂 diff
  sat: number | null    // 【口径变更】hours / base;base 为 0 → null
  diff: number          // 【语义不变】hours − expectedBase
  filled: boolean       // 不变:区间内是否有任何工时记录
}
```

要点：

- **`diff` 一字不变地保留旧语义**（相对「应填基准」），§2.2 的六处消费方**零改动**。
- **`sat` 换成新口径**，只反映「填的那些日子填得实不实」。
- 两个指标并存，回答两个不同问题：饱和度=填写日均强度；欠填=该填的日子填没填。

### 3.1 必须同步改的两处（不改就出错）

**① `orgSummary`（`metrics.ts:147,171`）**

```ts
// 现状:全员 base 相同,故组基础工时 = base × 人数
const base = baseHours(data, start, end)
const orgBase = base * b.people
```

新口径下**每人 base 不同**，`base × people` 直接算错。改为在 `bump()` 累加各人 `base`：

```ts
const bump = (level, name, parent, hrs, empBase) => { ...; b.hours += hrs; b.base += empBase; b.people += 1 }
// 三层调用各传 s.hours 与 s.base
return [...buckets.values()].map((b) => ({ ...b, sat: b.base > 0 ? b.hours / b.base : null }))
```

`orgL4SummaryRow`（:184）按 `Σbase` 重算，**自动跟随**，无需改动。

**② 分析页「基础工时均值参考线」（`YitianAnalyticsView.vue:132`）**

```ts
const base = rows[0]?.base ?? 0   // 取第一行的 base 当全员基准
```

旧口径下全员 `base` 相同故成立；新口径下每人不同，取第一行**没有意义**。
改为取 `rows[0]?.expectedBase ?? 0`——参考线含义变为「人均应填基准」，仍有比较价值。

### 3.2 展示文案必须同步（不改就会误导）

三处 label 现为「基础工时」，其值来自 `base`——口径变更后该值从「应填工时」变成
「按填报天数折算的基准」，label 不跟就是骗人：

| 位置 | 现 label | 改为 | 值 |
|---|---|---|---|
| `YitianOverviewView.vue:100` 组织汇总表列 | 基础工时 | **填报基准** | `r.base`（Σ各人 filledDays×8） |
| `YitianOverviewView.vue:132` 组织柱图系列名 | 基础工时 | **填报基准** | 同上 |
| `YitianAnalyticsView.vue:193` 员工明细表列 | 基础工时 | **填报基准** | `s.base`（该员工 filledDays×8） |

**例外——`YitianAnalyticsView.vue:140` 的 markLine 保持「基础工时」不变**：按 §3.1②
它已改取 `expectedBase`，那确实仍是「应填基准」，label 本就准确。

列 `key` 一律不改（仍是 `baseText`），故 `FILTERABLE`（`YitianAnalyticsView.vue:29`）
与选列持久化不受影响。

### 3.3 自动跟随、无需改动的

- `kpi.avgSat` / `avgSatFilled`（:214-215 已是 `Σ x.base`）
- `kpi.baseHours`（:228）仍取 `baseHours(...)` = 应填基准，概览页「人均基础 Xh」语义不变
- `orgL4SummaryRow`、`saturationTop`（按 `hours` 降序，与 `sat` 无关）、`neverFilledList`（看 `filled`）
- 趋势页 `sat` 序列（`YitianTrendView.vue:71-73` 已是 `Σ x.base`）

## 4. 边界后果（已与用户确认）

1. **节假日加班拉高饱和度**：该日工时进分子，但该日不计入 `filledDays`（用户定义的「排除假期日」）→ 分子有、分母无。
2. **完全没填的人 `sat = null`**（旧为 0），从饱和度统计中消失；但 `filled=false` 不变，仍在「完全未填」名单里，且 `diff = 0 − expectedBase` 仍为负，仍在欠填统计内。
3. **「补全后饱和度」`avgSatFilled` 实用价值下降**：其值恒 ≥ 100%（新旧口径皆然，因分子取 `max(hours, base)`），新口径下只反映「填写日内的加班程度」。**保留不动**（YAGNI），不为它单开改动。

## 5. 受影响的现有测试（须按新口径重算，非放宽）

以 `metrics.test.ts` 现有 fixture 为准（2 个工作日 6/1·6/2，`hoursPerDay=8` → `expectedBase=16`；
A1 张三 6/1 填 12h + 6/2 填 8h = 20h；A2 李四 6/1 填 8h = 8h；A3 王五零记录）：

| 位置 | 断言 | 旧值 | 新值 | 说明 |
|---|---|---|---|---|
| `metrics.test.ts:68` | `a1.sat` | 1.25 | **1.25** | A1 填满 2 天 → `base=16`，恰好不变 |
| `metrics.test.ts:69` | `a1.diff` | 4 | **4** | `diff` 语义不变 |
| `metrics.test.ts:75` | `a3.sat` | `0` | **`null`** | 零记录 → `filledDays=0` → `base=0` → **须改** |
| `metrics.test.ts:153` | `orgL4SummaryRow().base` | 48（3×16） | **24**（16+8+0） | Σ各人 base → **须改** |
| `metrics.test.ts:154` | 同行 `sat` | 28/48 | **28/24** | 随之 |
| `metrics.test.ts:169` | `kpi.avgSat` | 28/48 | **28/24** | 随之 |
| `metrics.test.ts:172` | `kpi.avgSatFilled` | 52/48 | **28/24** | `max(20,16)+max(8,8)+max(0,0)=28` |

> 该 fixture 下 A2 的饱和度由 `8/16=50%` 变为 `8/8=100%`——正是本次口径变更的直观体现：
> 李四只填了 1 天但填满了 8h，新口径判他「填写日饱和」，旧口径判他「欠填一半」。
> 他的 `diff = 8 − 16 = −8` 不变，仍在「未按时填写」清单里。这正是双基准要达到的效果。

另需核对（值可能变，实施时按实际重算）：`YitianOverviewView.test.ts` 的固定汇总行断言、
`YitianAnalyticsView.test.ts`、`YitianTrendView.test.ts` 中涉及 `sat`/`base` 的用例。

## 6. 新增测试（本期必须补）

1. **填写天数排除假期日**：某员工在 `workday:false` 的日期填了工时 → 该日不计入 `filledDays`，
   但工时仍计入 `hours`（分子）→ `sat` 因此 > 100%。
2. **同一天多条记录只算一天**：`filledDays` 按**不同日期**去重。
3. **`diff` 与 `sat` 解耦**：构造「只填 1 天且填满」的员工，断言 `sat === 1` 且 `diff < 0`
   且该员工出现在 `unfilledList` 中——这条正面锁死双基准的设计意图。
4. **`orgSummary` 按 Σ各人 base**：构造同组两人（一人填 2 天、一人填 1 天），断言组 `base`
   为两人之和而非 `base × 2`。

## 7. 明确不做

- 不动分子口径（已是全量工时含管理类）。
- 不动 `diff` 语义，§2.2 六处欠填/加班消费方全部零改动。
- 不动 `complianceRate`、`typeHours`、`issues` 等与饱和度无关的指标。
- 不动后端与数据管线（`yitian.py` / `holidays.csv` 读取逻辑均不改）；**升级无需点「更新数据」**。
- 不为 `avgSatFilled` 单开改动（§4.3）。

## 8. 验证

- `bash verify.sh` 全绿。
- §5 全部断言按新口径更新且通过；§6 四条新测试通过。
- 手工冒烟：
  - `/yitian` 概览「平均饱和度」、组织汇总表**「填报基准」**列与柱图、`/yitian/analytics`
    饱和度 TOP10 与分布散点、员工明细表**「填报基准」**列、`/yitian/trend` 饱和度趋势
    ——数字自洽（组合计 = Σ各人，绝非 `base × 人数`）。
  - 分析页饱和度 TOP10 的 markLine 仍标**「基础工时」**且取应填基准（区间工作日×8），
    与三处「填报基准」是两个不同的数，不应相等（除非全员填满全部工作日）。
  - **「未按时填写」清单与「欠填 / 达标」分类与升级前逐人完全一致**——`diff` 未动，
    这是本期最重要的回归安全网；若这里变了，说明 `diff` 被误接到新 `base` 上。
  - 零记录员工：饱和度显示 `-`（`null`），但仍出现在「完全未填」名单与欠填统计中。
