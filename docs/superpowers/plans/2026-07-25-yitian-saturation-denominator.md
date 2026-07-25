# 倚天工时饱和度口径变更（C 期 / V4.4.5）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把倚天工时饱和度的分母由「区间工作日数 × 8」改为「该员工填写天数 × 8」，同时用新增的 `expectedBase` 保住 `diff` 的旧语义，使六处「欠填/加班」监控零改动继续有效。

**Architecture:** `EmpStat` 拆双基准——`base = filledDays × hoursPerDay` 只喂 `sat`，新增 `expectedBase = 区间工作日数 × hoursPerDay`（即旧 `base`）只喂 `diff`。`orgSummary` 因每人分母不同，必须由 `base × people` 改为累加各人 `base`。三处展示 label 从「基础工时」改为「填报基准」。

**Tech Stack:** Vue 3 + TypeScript + Vitest。纯前端，不动后端与数据管线。

**Spec:** `docs/superpowers/specs/2026-07-25-yitian-saturation-denominator-design.md`

## Global Constraints

- **版本 V4.4.5**（Z 级，基线 V4.4.4）。版本号单一来源 `frontend/src/version.ts`，只改此处。
- **纯前端，无需点「更新数据」**；不动 `yitian.py`、`holidays.csv` 读取逻辑或任何后端文件。
- **`diff` 的语义一字不可变**（`hours − expectedBase`）。它是六处欠填/加班判断的唯一来源：分析页「达标/欠填」分类、欠填发散条图、`unfilledList`、KPI 加班人数/工时、趋势页加班工时与未填人数。**这六处代码本期一行都不该改**——若你发现需要改它们，说明 `diff` 被误接到新 `base` 上了。
- **分子不变**：`hours` 仍是全量工时（含管理类/假期类）。
- **不使用任何 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`。代码注释用简体中文。
- 现有断言若因口径变更而红，**按新口径重算出正确值再改**，绝不放宽成 `toBeTruthy()` 之类。
- 提交时**绝不 `git add -A` / `git add .`**；工作树有未跟踪的 `yitian/` 目录，只 add 本任务明确改动的文件。
- 前端命令：测试 `npm --prefix frontend run test:run`，单文件 `npx vitest run <path>`（在 `frontend/` 下），类型 `npm --prefix frontend run typecheck`。**本仓 `frontend/` 只有单一 `tsconfig.json`，没有 `tsconfig.app.json`，不要给 `vue-tsc` 传 `-p`。**

---

## File Structure

| 文件 | 职责 | Task |
|---|---|---|
| `frontend/src/lib/yitian/metrics.ts` | 双基准核心：`EmpStat` 扩字段、`empStats` 算 `filledDays`、`orgSummary` 改累加 | 1 |
| `frontend/src/lib/yitian/metrics.test.ts` | 5 处断言按新口径重算 + 4 条新测试 | 1 |
| `frontend/src/views/YitianAnalyticsView.vue` | markLine 改取 `expectedBase`；明细表列 label 改「填报基准」 | 2 |
| `frontend/src/views/YitianOverviewView.vue` | 组织表列 label + 柱图系列名 改「填报基准」 | 2 |
| `frontend/src/views/YitianOverviewView.test.ts` | 柱图系列名断言跟随 | 2 |
| `version.ts` / `PROGRESS.md` / `deploy/升级手册-V4.4.5.md` | 收尾 | 3 |

---

## Task 1: `metrics.ts` 双基准核心

**Files:**
- Modify: `frontend/src/lib/yitian/metrics.ts:4-15`（`EmpStat`）、`:86-110`（`empStats`）、`:144-174`（`orgSummary`）
- Test: `frontend/src/lib/yitian/metrics.test.ts`

**Interfaces:**
- Consumes: `daysInRange`（`./calendar`，已存在，需新增到 import）、`baseHours`（本文件 `:82`，**保持不变**）。
- Produces: `EmpStat` 新增 `filledDays: number` 与 `expectedBase: number`；`base` 语义改为 `filledDays × hoursPerDay`；`OrgRow.base` 语义改为「该组各人 base 之和」。

- [ ] **Step 1: 更新 5 处因口径变更而失效的现有断言**

在 `frontend/src/lib/yitian/metrics.test.ts` 中按下表逐处改。fixture 未变（2 个工作日 6/1·6/2，`hoursPerDay=8`；A1 张三 6/1 填 12h + 6/2 填 8h = 20h，`filledDays=2` → `base=16`；A2 李四 6/1 填 8h，`filledDays=1` → `base=8`；A3 王五零记录 → `base=0`；`Σbase = 24`）：

`:75` —— 零记录的人饱和度由 0 变 null：
```ts
    expect(a3.sat).toBeNull()
```

`:153-154` —— `orgL4SummaryRow` 的 base 由「3 人 × 16h」变为「Σ各人 base」：
```ts
    expect(t.base).toBe(24)           // 16(A1 填2天) + 8(A2 填1天) + 0(A3 零记录)
    expect(t.sat).toBeCloseTo(28 / 24)
```

`:170` —— 平均饱和度分母同步：
```ts
    expect(k.avgSat).toBeCloseTo(28 / 24)
```

`:173` —— 补全后饱和度：`max(20,16)+max(8,8)+max(0,0) = 28`：
```ts
    expect(k.avgSatFilled).toBeCloseTo((20 + 8 + 0) / 24)
```

**以下断言必须保持原样、且实施后仍绿**（它们是本期的回归安全网，证明 `diff` 语义没被动）：
`:68` `a1.sat` 仍 `1.25`（A1 填满 2 天，分母恰好不变）、`:69` `a1.diff` 仍 `4`、
`:79-80` 空区间 `base=0`/`sat=null`、`:87` `unfilledList` 仍 `['A2']`、
`:96-97` `saturationTop` 仍 `['A1','A2']`、`:164-167` `kpi` 的总工时/未填人数/加班人数/加班工时。

- [ ] **Step 2: 追加 4 条新测试**

追加到 `frontend/src/lib/yitian/metrics.test.ts` 末尾：

```ts
describe('V4.4.5 双基准（填写天数分母）', () => {
  // 三天:6/1 6/2 工作日,6/3 假期日(workday:false)
  const D3 = {
    ...DATA,
    meta: { ...DATA.meta, periodEnd: '2026-06-03' },
    days: [
      ...DATA.days,
      { d: '2026-06-03', workday: false, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    ],
  } as unknown as YitianData
  const mkEntry = (d: string, e: string, h: number) => ({
    d, e, t: 0, h, wt: null, cu: null, pl: null, pn: null, pt: null,
    sm: null, bg: null, wo: '', top: false, ok: 0, iss: [],
  })

  it('填写天数排除假期日:假期日工时进分子、不进分母', () => {
    const data = { ...D3, entries: [mkEntry('2026-06-01', 'A1', 8), mkEntry('2026-06-03', 'A1', 4)] } as unknown as YitianData
    const a1 = empStats(data, '2026-06-01', '2026-06-03').find((s) => s.id === 'A1')!
    expect(a1.hours).toBe(12)      // 12h 全进分子(含假期日那 4h)
    expect(a1.filledDays).toBe(1)  // 只有 6/1 是工作日
    expect(a1.base).toBe(8)
    expect(a1.sat).toBeCloseTo(1.5) // 12/8 —— 节假日加班拉高饱和度,是本口径的预期后果
  })

  it('同一天多条记录只算一天', () => {
    const data = { ...D3, entries: [mkEntry('2026-06-01', 'A1', 3), mkEntry('2026-06-01', 'A1', 5)] } as unknown as YitianData
    const a1 = empStats(data, '2026-06-01', '2026-06-02').find((s) => s.id === 'A1')!
    expect(a1.filledDays).toBe(1)
    expect(a1.hours).toBe(8)
    expect(a1.base).toBe(8)
  })

  // 本条正面锁死双基准的设计意图:只填 1 天且填满的人,饱和度 100% 但仍算欠填。
  it('sat 与 diff 解耦:只填一天且填满 → sat=100% 但仍在欠填清单', () => {
    const data = { ...DATA, entries: [mkEntry('2026-06-01', 'A1', 8)] } as unknown as YitianData
    const a1 = empStats(data, '2026-06-01', '2026-06-02').find((s) => s.id === 'A1')!
    expect(a1.sat).toBe(1)              // 新口径:填的那天填满了
    expect(a1.expectedBase).toBe(16)    // 应填 2 天
    expect(a1.diff).toBe(-8)            // 旧语义:欠填 8h
    expect(unfilledList([a1]).map((s) => s.id)).toEqual(['A1'])
  })

  it('orgSummary 组 base = Σ各人 base(不是 base × 人数)', () => {
    const rows = orgSummary(DATA, R[0], R[1]).filter((r) => r.level === 'l4')
    const bank = rows.find((r) => r.name === '银行服务组')!
    expect(bank.people).toBe(2)
    expect(bank.base).toBe(24)          // A1 16 + A2 8;若误用 base×people 会是 32
    expect(bank.sat).toBeCloseTo(28 / 24)
  })
})
```

> `unfilledList` 已在本文件顶部 import（`:4`），无需新增 import。

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/metrics.test.ts`
Expected: FAIL —— 新用例报 `filledDays` / `expectedBase` 为 undefined；Step 1 改过的 4 处断言也红（实现还没跟上）。

- [ ] **Step 4: 实现**

`metrics.ts:2` 的 import 补 `daysInRange`：

```ts
import { workdayCount, daysInRange } from './calendar'
```

`EmpStat` 接口（`:4-15`）改为：

```ts
export interface EmpStat {
  id: string
  name: string
  l3: string
  l31: string
  l4: string
  hours: number
  filledDays: number      // 有工时记录且当天是工作日的【不同日期】数
  base: number            // filledDays × hoursPerDay —— 只喂 sat
  expectedBase: number    // 区间工作日数 × hoursPerDay —— 只喂 diff(旧 base)
  sat: number | null      // hours / base;base 为 0 → null
  diff: number            // hours − expectedBase(语义不变:负=欠填,正=加班)
  filled: boolean         // 区间内是否有任何工时记录
}
```

`baseHours`（`:82`）**保持不变**——它仍是「应填基准」的来源，`kpi.baseHours` 与 `expectedBase` 都用它。

`empStats`（`:86-110`）整个函数体替换为：

```ts
/** 员工级统计。覆盖花名册全员——零记录的人也要出现(那正是"完全未填"清单的来源)。
 *  V4.4.5 双基准:base 按各人【填写天数】折算只喂 sat;expectedBase 是全员统一的应填基准只喂 diff。 */
export function empStats(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): EmpStat[] {
  const expectedBase = baseHours(data, start, end)
  const hoursPerDay = data.meta.hoursPerDay || 8
  // 只有 workday===true 的日期才计入填写天数:假期日填的工时进分子、不进分母。
  const workdays = new Set(daysInRange(data.days, start, end).filter((d) => d.workday).map((d) => d.d))
  const hours: Record<string, number> = {}
  const filledDates: Record<string, Set<string>> = {}
  for (const e of selectEntries(data, start, end, l4s)) {
    hours[e.e] = (hours[e.e] ?? 0) + e.h      // 实际工时含全部工时类型
    if (workdays.has(e.d)) {
      const set = filledDates[e.e] ?? (filledDates[e.e] = new Set<string>())
      set.add(e.d)                             // Set 去重:同一天多条记录只算一天
    }
  }
  return selectRoster(data, l4s).map((p) => {
    const h = hours[p.id] ?? 0
    const filledDays = filledDates[p.id]?.size ?? 0
    const base = filledDays * hoursPerDay
    return {
      id: p.id,
      name: p.name,
      l3: p.l3 || NO_L3,
      l31: p.l31 || NO_L31,   // 空 L3-1 兜底,否则该层合计对不上 L3 合计(40h 会凭空消失)
      l4: p.l4 || NO_L4,      // 空 L4 兜底,否则 L3 合计对不上各 L4 之和
      hours: h,
      filledDays,
      base,
      expectedBase,
      sat: base > 0 ? h / base : null,
      diff: h - expectedBase,
      filled: p.id in hours,
    }
  })
}
```

`orgSummary`（`:144-174`）：删掉 `const base = baseHours(...)`，`bump` 增加 `empBase` 形参并累加，最后不再乘人数：

```ts
export function orgSummary(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): OrgRow[] {
  const stats = empStats(data, start, end, l4s)
  const buckets = new Map<string, { level: OrgRow['level']; name: string; parent: string; hours: number; base: number; people: number }>()

  // V4.4.5:每人 base 各不相同(按各自填写天数折算),故必须逐人累加;
  // 旧写法 base × people 在新口径下直接算错。
  const bump = (level: OrgRow['level'], name: string, parent: string, hrs: number, empBase: number) => {
    // 桶键含 parent:同名但不同上级(如两个不同 L3-1 下各自的「未分配L4」)不得合桶,
    // 否则 parent 只会记首次插入值,把工时错记到错误的上级组织名下。
    const k = level + '|' + parent + '|' + name
    const b = buckets.get(k)
    if (!b) buckets.set(k, { level, name, parent, hours: hrs, base: empBase, people: 1 })
    else {
      b.hours += hrs
      b.base += empBase
      b.people += 1
    }
  }

  for (const s of stats) {
    bump('l3', s.l3, '', s.hours, s.base)
    bump('l31', s.l31, s.l3, s.hours, s.base)
    bump('l4', s.l4, s.l31, s.hours, s.base)
  }

  return [...buckets.values()].map((b) => ({ ...b, sat: b.base > 0 ? b.hours / b.base : null }))
}
```

`orgL4SummaryRow`（`:184`）、`kpi`（`:206`）、`unfilledList`、`neverFilledList`、`saturationTop`
**全部保持不变**——它们已按 `Σ x.base` 或 `diff` 写，自动跟随。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/yitian/metrics.test.ts` 然后 `npm --prefix frontend run typecheck`
Expected: 全部 PASS，typecheck 0 错误。

> 若 `:87` 的 `unfilledList` 断言变红，**不要改断言**——那说明 `diff` 被误写成 `h - base`，回到 Step 4 修实现。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/yitian/metrics.ts frontend/src/lib/yitian/metrics.test.ts
git commit -m "feat(yitian): V4.4.5 饱和度分母改填写天数×8(双基准,diff 语义不变)"
```

---

## Task 2: 展示层同步（参考线取应填基准 + 三处 label）

**Files:**
- Modify: `frontend/src/views/YitianAnalyticsView.vue:132`、`:193`
- Modify: `frontend/src/views/YitianOverviewView.vue:100`、`:132`
- Test: `frontend/src/views/YitianOverviewView.test.ts:116`

**Interfaces:**
- Consumes: Task 1 的 `EmpStat.expectedBase`、`EmpStat.base`、`OrgRow.base`。
- Produces: 无新导出。

> 口径变了、文案不跟 = 骗人。`base` 的值已从「应填工时」变成「按填报天数折算的基准」，
> 三处叫「基础工时」的 label 必须改；而分析页 markLine 改取 `expectedBase` 后，
> 它那句「基础工时」反而**正确了**，保持不动。

- [ ] **Step 1: 改分析页参考线取数（`YitianAnalyticsView.vue:132`）**

现状取第一行的 `base` 当全员基准——旧口径下全员相同才成立，新口径下每人不同，取第一行没有意义：

```ts
  const base = rows[0]?.expectedBase ?? 0
```

`:140` 的 markLine 文案 `name: '基础工时'` 与 `formatter: '基础 {c}h'` **保持不动**（此处确为应填基准）。

- [ ] **Step 2: 改三处 label**

`YitianAnalyticsView.vue:193`（员工明细表列）：
```ts
  { key: 'baseText', label: '填报基准', width: 110, num: true },
```

`YitianOverviewView.vue:100`（组织汇总表列）：
```ts
  { key: 'baseText', label: '填报基准', width: 110, num: true },
```

`YitianOverviewView.vue:132`（组织柱图系列名）：
```ts
      { name: '填报基准', type: 'bar', data: rows.map((r) => Number(r.base.toFixed(1))) },
```

列 `key` 一律不动（仍是 `baseText`），故 `YitianAnalyticsView.vue:29` 的 `FILTERABLE`
与各账号的选列持久化不受影响。

- [ ] **Step 3: 更新柱图系列名断言（`YitianOverviewView.test.ts:116`）**

```ts
    expect(opt.series.map((s: any) => s.name)).toEqual(['实际工时', '填报基准'])
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/YitianOverviewView.test.ts src/views/YitianAnalyticsView.test.ts src/views/YitianTrendView.test.ts`
Expected: 全部 PASS。

其中这两条**必须保持绿且值不变**，是回归安全网：
- `YitianOverviewView.test.ts:77` 与 `:263` 的 `112.5%`——该 fixture 里张三 18h 正好分布在 6/1、6/2 两个工作日，`filledDays=2` → `base=16` → `18/16` 仍是 112.5%。**若这里变了，说明 `filledDays` 算错了。**
- `YitianTrendView.test.ts:121` 假期周 `sat` 仍为 `null`（该周零工作日且零填报）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/YitianAnalyticsView.vue frontend/src/views/YitianOverviewView.vue frontend/src/views/YitianOverviewView.test.ts
git commit -m "feat(yitian): V4.4.5 参考线改取应填基准 + 三处 label 改「填报基准」"
```

---

## Task 3: 版本号 + 文档 + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`
- Create: `deploy/升级手册-V4.4.5.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V4.4.5'
export const RELEASE_DATE = '2026-07-25'
```

- [ ] **Step 2: 跑全量验证**

Run: `bash verify.sh`
Expected: 语法编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

- [ ] **Step 3: 写升级手册**

创建 `deploy/升级手册-V4.4.5.md`，照 `deploy/升级手册-V4.4.4.md` 的结构，要点：

- **本次改什么**：倚天工时「饱和度」分母由「区间工作日数 × 8」改为「该员工填写天数 × 8」（填写天数 = 有工时记录的不同日期数，**排除 `holidays.csv` 标记的非工作日**）；分子不变（全量工时含管理类）。
- **口径变更的直观后果**（必须写，让使用者看得懂数字为何变）：
  - 只填了少数几天但填满的人，饱和度会**显著上升**（例：应填 2 天只填 1 天填满 8h，旧口径 50% → 新口径 100%）。
  - 完全没填的人饱和度显示 `-`（原为 0%），但仍出现在「完全未填」名单中。
  - 节假日加班会**拉高**饱和度（工时进分子、当天不进分母）。
- **「欠填 / 达标 / 未按时填写 / 加班」全部维持原口径不变**——它们相对「应填基准（区间工作日 × 8）」计算，与饱和度解耦。
- **三处列名/图例由「基础工时」改为「填报基准」**（概览页组织汇总表与柱图、统计分析页员工明细表），因其数值含义已变；统计分析页饱和度 TOP10 图的参考线仍叫「基础工时」，那里确为应填基准。
- **纯前端**：换 `dist` + 重启 + `Ctrl+F5`，**无需点「更新数据」**；既有账号/数据零影响。
- 验证清单：版本号 V4.4.5；概览「平均饱和度」与组织表「填报基准」列自洽（组合计 = 各人之和）；「未按时填写」清单与升级前**逐人一致**；零记录员工饱和度显示 `-`。
- 回滚：换回 `dist.bak-$TS` 并重启。

- [ ] **Step 4: 更新 PROGRESS.md**

在文件顶部按现有格式新增 V4.4.5 条目（把原「当前版本 V4.4.4」那行降为普通 `- **V4.4.4**` 条目），记录：双基准设计（`base` 喂 `sat`、`expectedBase` 喂 `diff`）、为何必须双基准（`diff` 是六处欠填/加班判断的唯一来源，单基准会让「该填 20 天只填 1 天」被判达标）、`orgSummary` 必须由 `base × people` 改为 `Σ各人 base`、三处 label 改「填报基准」而 markLine 保持「基础工时」、以及三条边界后果（节假日加班拉高饱和度／零记录 `sat=null`／`avgSatFilled` 价值下降但保留不动）。

- [ ] **Step 5: 提交并推送**

```bash
git add frontend/src/version.ts PROGRESS.md deploy/升级手册-V4.4.5.md
git commit -m "docs(deploy): V4.4.5 升级手册 + PROGRESS(纯前端换 dist,无需更新数据)"
git status --short
git diff --cached --stat
git push origin master
```

> 推送前确认 `yitian/` 等未跟踪目录未被暂存；不应有任何 `data/`、`input/`、`release/` 文件进入暂存区。

---

## 附：手工冒烟（Task 3 之后，上线前）

启动 `python server.py` + `cd frontend && npm run dev`，逐项确认：

1. `/yitian` 概览 → 「平均饱和度」KPI 有值；组织汇总表**「填报基准」**列的合计 = 各行之和（**不是** 某个数 × 人数）。
2. `/yitian/analytics` → 员工明细表**「填报基准」**列各人不同（旧版全员相同，这是最直观的差异）；饱和度 TOP10 图的参考线仍标**「基础工时」**且为一个固定值（应填基准），与各人「填报基准」不同。
3. **回归安全网**：「未按时填写」清单、「达标/欠填」分类、加班人数与工时 —— 与升级前**逐人完全一致**。这四处若有任何变化，说明 `diff` 被误接到新 `base`。
4. 找一个只填了少数几天的员工：饱和度应明显高于升级前，但他仍在「未按时填写」清单里。
5. 找一个零记录员工：饱和度显示 `-`，且仍在「完全未填」名单与欠填统计中。
6. `/yitian/trend` → 饱和度趋势曲线有值；含假期的周不应画成 0%。
