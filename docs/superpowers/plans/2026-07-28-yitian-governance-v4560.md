# 工时治理监控页 V4.5.6 实施计划（倚天三期收官）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/yitian/governance`「工时治理监控」页（异常指标监控 + 项目管理工时概况），并补齐 A 项最后两处：员工明细表 5 列拆分、趋势时间维度加半年/年。

**Architecture:** 纯前端。治理页两块的聚合口径下沉到 `lib/yitian/governance.ts` 纯函数；员工明细的 5 列拆分**另起 `lib/yitian/empSplit.ts` 并在视图里 decorate**，**不改 `metrics.ts`**（V4.4.5 双基准饱和度口径三期一贯禁改，这条不能因为「只是加几列」就破例）；趋势的半年/年沿用 `calendar.ts` 既有 `bucketBy` 模式各加一个分桶函数。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + ECharts + vitest。零后端改动、零新增依赖。

## Global Constraints

- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- 版本号 **V4.5.6**，单一来源 `frontend/src/version.ts`，只改此处。
- **绝不修改 `frontend/src/lib/yitian/metrics.ts`** —— 三期一贯承诺。5 列拆分走独立 lib + 视图 decorate，不进 `EmpStat`。
- **不改 V4.5.4 已定的任何口径**：五档枚举值、校准状态枚举、`transferable` 判定顺序。
- **不改 V4.5.5 已定的口径**：`selectCpEntries` 的筛选语义、`transferBuckets`。
- 新页 pageKey 是 **`yitian-governance`**，**不是 `governance`** —— 后者已被 `/governance`「数据治理」（项目域）占用（`config.py:119`、`nav.ts:90`、`router/index.ts:125`）。
- 新页挂 `tabGroup: 'yitian-analysis'`，**侧栏项数保持 23 不变**。
- 设计令牌：间距只用 `--sp-*`，数字列挂 `.u-num`，状态色只用 `--ok/--warn/--danger` 系列，不手写散值、不引入新色。**页面不得自绘页头与 tab 条**（`PageHeader` 由页面渲染、**`PageTabs` 由 `layout/AppLayout.vue:27` 统一渲染，页面绝不能再渲染一次**，否则出两条 tab 条且 typecheck 报缺 prop）。
- 测试里凡需要拼 localStorage 键/路径，**必须调用实现用的同一个函数**（如 `userScopedKey`），不得手写等价物 —— V4.5.5 因此产生过一条恒绿假测试。
- 完成定义：`bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
- 提交信息结尾附 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。
- **绝不 `git add -A`**；反向验证还原**绝不用 `git checkout <file>`**，用 Read+Edit 或 `cp` 备份到 scratchpad **并立刻验证备份文件存在**（Git Bash 下 `$TMPDIR` 为空，`cp` 会静默失败）。

## 三个判断调用（已定，实施勿改）

1. **5 列拆分不进 `metrics.ts`**：另起 `lib/yitian/empSplit.ts` 产出 `Map<工号, 五个数>`，视图 decorate 到行上。理由见 Architecture。
2. **新列默认隐藏**：`useColumnPrefs` 是持久化优先，加默认可见列对老用户不生效（V4.0.1 吃过）。
3. **年粒度当前只有 1 个桶**：数据跨度 2026-02-02~07-19，半年得 2 桶（H1/H2）、年得 1 桶。单点「趋势」是退化态但不是错误 —— 累积库逐周增长，会自己长出来。**照做，并在 backlog 记一笔。**

## 实测基线（设计期实跑，实施期对拍标准）

数据快照 `data/yitian_data.json`：11981 行，客户类工时 **10195 行 / 62314 h**。

**B-5① 售前服务类工时未关联产品**（即合规码 `HINT_PRESALE_PRODUCT`，**平台已有判定，本块只做聚合**）：命中 **969 条**。按 L4 前五 = 银行服务组 185条/1482h、小金融服务组 167/1248、浙江服务组 135/955、广东二服务组 111/806、京津服务组 92/715。

**B-5② 客户不可归属**（`tr === 0`）：**478 行 / 2810 h，跨 11 种工作类型三**。前五 = 升级加固 337行/1824h、安装部署 72/557、项目管理 25/141、产品故障处理 13/97、策略调整及优化 6/51。

**B-5③ 产品线校准覆盖率**：`raw 8756 / calibrated 307 / ambiguous 931 / unmatched 201`；待校准 **1439**，覆盖率 **21%**。

**B-6 项目管理工时概况**（分母=客户类工时，分子=`pm` 为真）：全域 **11082 / 62314 = 17.8%**。组织级 12 个 L4，占比区间 **0.0% ~ 55.7%**（最高 运营商服务组 2788/5003=55.7%、黑龙江服务组 33.0%、河北服务组 30.7%、广东二服务组 25.2%）。个人级 **83 人**，其中占比 100% 的 **3 人**、0% 的 **11 人**。

**5.3.1 员工明细 5 列**（全域合计）：非面向客户 **10586 h** / 面向客户 **62314 h**；项目类 **42986** / 售前类 **7933** / 售后类 **11395**（三者相加恰等于 62314）。

## 文件结构

| 文件 | 职责 | 任务 |
|---|---|---|
| 改 `config.py` / `server.py` / `frontend/src/lib/pageAccess.ts`(.test) / `pageScope.ts` / `nav.ts`(.test) / `router/index.ts` | 新 pageKey `yitian-governance` 全链路注册 | T1 |
| **新建** `frontend/src/views/YitianGovernanceView.vue` | 骨架（T1）→ 装配两块（T3） | T1 T3 |
| **新建** `frontend/src/lib/yitian/governance.ts`(.test) | B-5 三指标 + B-6 组织/个人占比（纯函数） | T2 |
| **新建** `frontend/src/lib/yitian/empSplit.ts`(.test) | 员工级五类工时拆分（**不进 metrics.ts**） | T4 |
| 改 `frontend/src/views/YitianAnalyticsView.vue`(.test) | 员工明细表 decorate 5 列 | T4 |
| 改 `frontend/src/lib/yitian/calendar.ts`(.test) | `halfYearBuckets` / `yearBuckets` | T5 |
| 改 `frontend/src/views/YitianTrendView.vue`(.test) | 粒度选项加半年/年 | T5 |
| 改 `frontend/src/version.ts` / `PROGRESS.md` | 收尾 | T6 |

---

### Task 1: 新页链路注册与骨架

**Files:**
- Modify: `config.py`（`PAGE_DOMAINS`）、`server.py`（`_YITIAN_PAGE_KEYS`）
- Modify: `frontend/src/lib/pageAccess.ts`、`frontend/src/lib/pageAccess.test.ts`、`frontend/src/lib/pageScope.ts`、`frontend/src/nav.ts`、`frontend/src/nav.test.ts`、`frontend/src/router/index.ts`
- Create: `frontend/src/views/YitianGovernanceView.vue`（骨架）

**Interfaces:**
- Consumes: 无
- Produces: pageKey `yitian-governance`，路由 `/yitian/governance`，`tabGroup: 'yitian-analysis'`，`hideFilter: true`

**背景**：V4.5.5 已把 `server.py` 那条「持有任一倚天页面授权即可读倚天数据」的元组改成**以 `config.DOMAIN_PAGES['yitian']` 为单一来源的守卫**。所以只在 `config.py` 加 key 而忘了同步 `_YITIAN_PAGE_KEYS`，`tests/test_server_yitian.py` 里那条守卫会**立刻变红** —— 这正是它存在的意义，别把它当障碍绕过去。

- [ ] **Step 1: 注册七处**

1. `config.py` 的 `PAGE_DOMAINS` 在 `'yitian-customer-product': 'yitian',` 之后增：
```python
    'yitian-governance': 'yitian',
```
2. `server.py` 的 `_YITIAN_PAGE_KEYS` 元组末尾增 `'yitian-governance'`。
3. `frontend/src/lib/pageScope.ts` 的 `PAGE_DOMAINS` 同步增一条（**与 `config.py` 有跨语言同步测试锁着，两边必须一致**）。
4. `frontend/src/lib/pageAccess.ts` 的 `PAGE_KEYS` 数组增 `'yitian-governance'`；把该文件里「31 个 PageKey」的注释改为「32 个 PageKey」。
5. `frontend/src/nav.ts` 的 `TAB_GROUPS['yitian-analysis']` 末尾增：
```ts
    { label: '工时治理监控', to: '/yitian/governance', key: 'yitian-governance' },
```
并把该文件里「全部可授权页面(31 个)」的注释改为 32。
6. `frontend/src/router/index.ts` 在 `/yitian/customer-product` 之后增：
```ts
    { path: '/yitian/governance', name: 'yitian-governance', component: YitianGovernanceView, meta: { title: '工时治理监控', hideFilter: true, pageKey: 'yitian-governance', tabGroup: 'yitian-analysis' } },
```
并在文件顶部按既有风格 import `YitianGovernanceView`。
7. `frontend/src/nav.test.ts` 里 tab 组总数的 `expect(groups.flat().length).toBe(11)` 改为 `toBe(12)`；该文件里含「31」的用例标题改 32。
   `frontend/src/lib/pageAccess.test.ts` 里两处倚天页面数组各补 `'yitian-governance'`，标题「六个」改「七个」。

> **`nav.test.ts` 里 `NAV_SECTIONS` 项数的 `toBe(23)` 不要改** —— 新页挂 tab 组、不进侧栏。它若变红说明第 5 步改错了地方（动到 `NAV_SECTIONS` 而非 `TAB_GROUPS`）。

- [ ] **Step 2: 跑契约测试确认全绿**

```bash
python -m pytest tests/test_server_yitian.py tests/test_server_page_scope.py -q
npm --prefix frontend run test:run -- src/lib/pageAccess.test.ts src/nav.test.ts src/lib/pageScope.test.ts
```
Expected: 全部 PASS。
> 若 `test_页键元组与倚天域页面集合一致` 红，说明 Step 1 第 2 步漏了 —— 补上而不是改断言。

- [ ] **Step 3: 反向验证守卫真的在工作**

把 `server.py` 的 `_YITIAN_PAGE_KEYS` 里刚加的 `'yitian-governance'` 临时删掉，重跑 `python -m pytest tests/test_server_yitian.py -k 页键 -v`，**必须红**。确认后改回。
> 还原用 Read+Edit，**不要 `git checkout`**。

- [ ] **Step 4: 建页面骨架**

`frontend/src/views/YitianGovernanceView.vue`。**先 Read `frontend/src/views/YitianCustomerProductView.vue`**，照抄它的外层结构（`.ycp-page` 那种容器类、`el-skeleton` 加载态、`PageHeader` 用法），**不要渲染 `PageTabs`**：

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import AppCard from '@/components/AppCard.vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import { useYitianStore } from '@/stores/yitian'

const store = useYitianStore()
onMounted(() => store.load())
</script>

<template>
  <div class="ygv-page">
    <PageHeader title="工时治理监控" />
    <YitianToolbar />
    <AppCard v-if="store.error"><p class="ygv-err">{{ store.error }}</p></AppCard>
    <AppCard v-else><p class="ygv-todo">分析块将在后续任务装配。</p></AppCard>
  </div>
</template>

<style scoped>
.ygv-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
.ygv-err { margin: 0; color: var(--danger-text); }
.ygv-todo { margin: 0; color: var(--mut); font-size: var(--fs-1); }
</style>
```
> 容器类名与内边距**照抄 `YitianCustomerProductView.vue` 实际用的那套**，别照抄本片段的字面值 —— 以仓库现状为准。

- [ ] **Step 5: typecheck 与全量前端测试**

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run test:run
```
Expected: 全绿。特别注意两个会扫描 `src/views/*.vue` 全目录的结构守卫（`__pageHeader.test.ts` / `__scopeGuard.test.ts`）—— 新页会被自动纳入，若红说明骨架违反了某条结构约束（如漏 `PageHeader`、或源码里出现了 `hideFilter` 字样）。

- [ ] **Step 6: 提交**

```bash
git add config.py server.py frontend/src/lib/pageAccess.ts frontend/src/lib/pageAccess.test.ts \
        frontend/src/lib/pageScope.ts frontend/src/nav.ts frontend/src/nav.test.ts \
        frontend/src/router/index.ts frontend/src/views/YitianGovernanceView.vue
git commit -m "feat(yitian): 新增工时治理监控页骨架与 pageKey 注册

pageKey 用 yitian-governance —— governance 已被项目域的「数据治理」页占用。
V4.5.5 那条以 DOMAIN_PAGES 为单一来源的守卫如期生效:只加 config 不同步
_YITIAN_PAGE_KEYS 会立刻变红。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 治理页两块的聚合口径

**Files:**
- Create: `frontend/src/lib/yitian/governance.ts`
- Create: `frontend/src/lib/yitian/governance.test.ts`

**Interfaces:**
- Consumes: V4.5.5 的 `lib/yitian/customerProduct.ts` 导出 `selectCpEntries(data, f)` / `CpFilter` —— **先 Read 该文件确认实际签名**
- Produces:

```ts
/** B-5① 售前服务类工时未关联产品:按 L4 汇总。判定复用既有合规码,不新写规则。 */
export interface PresaleHintRow { l4: string; count: number; hours: number }
export function presaleHintByL4(data: YitianData, f: CpFilter): PresaleHintRow[]

/** B-5② 客户不可归属:按工作类型三拆分(tr === 0)。 */
export interface UnattributedRow { workType3: string; count: number; hours: number }
export function unattributedByWorkType(data: YitianData, rows: YitianEntry[]): UnattributedRow[]

/** B-5③ 产品线校准覆盖率。 */
export interface CalibStat {
  raw: number; calibrated: number; ambiguous: number; unmatched: number
  pending: number; rate: number | null
}
export function calibStat(data: YitianData, rows: YitianEntry[]): CalibStat

/** B-6 项目管理工时占比。level 决定按 L4 还是按员工分组。 */
export interface PmShareRow { name: string; total: number; pm: number; share: number | null }
export function pmShare(
  data: YitianData, rows: YitianEntry[], level: 'l4' | 'emp',
): PmShareRow[]
```

**口径约定（勿改）**：
- B-5① 的判定**不新写规则** —— 直接读 `data.issues` 里含 `HINT_PRESALE_PRODUCT` 码的条目，用 `issues[].i` 回查 `entries` 下标。**`i` 是全量 `entries` 的原始下标，必须对全量数组取下标，不能先过滤再取**（`lib/yitian/detail.ts:38` 那条注释记的就是这个坑）。B-5① 的筛选走 `CpFilter` 的 `l4s`/日期两项，其余维度不适用（该码只在客户类工时上产生）。
- B-5②/③/B-6 一律只统计客户类工时（沿用 `selectCpEntries` 的产出）。
- 占比分母为 0 → `null`（前端显 "-"），**不得返回 0 或 NaN**。
- `pmShare` 按占比降序；占比相同按 `name` 升序（保证顺序稳定，否则快照式断言会随机红）。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/lib/yitian/governance.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { YitianData } from '@/types/yitian'
import { selectCpEntries, type CpFilter } from './customerProduct'
import {
  presaleHintByL4, unattributedByWorkType, calibStat, pmShare,
} from './governance'

/** 最小 fixture:2 人 x 5 条工时。issues 指向 entries 的【全量下标】。 */
const D = {
  meta: { top1000Named: {} },
  roster: [
    { id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: true },
    { id: 'A002', name: '小李', l2: '', l3: '', l31: '', l4: '二组', category: '正式', isMgr: false },
  ],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类'],
    workTypes: ['升级加固', '安装部署', '项目管理'],
    customers: ['甲公司'],
    custQuads: [], custBgs: [], prodCats: ['终端安全'],
    products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    // 0:一组 项目类 10h 已校准 pm=true
    { d: '2026-06-01', e: 'A001', t: 0, h: 10, wt: 2, cu: 0, ec: 0, tr: 4, ls: 1, pm: true,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 1, iss: ['HINT_PRESALE_PRODUCT'], ct: '' },
    // 1:二组 项目类 20h 多义 pm=false 客户不可归属(tr=0) 工作类型三=升级加固
    { d: '2026-06-02', e: 'A002', t: 0, h: 20, wt: 0, cu: null, ec: 0, tr: 0, ls: 2, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    // 2:二组 售后类 5h 零命中 tr=0 工作类型三=安装部署
    { d: '2026-06-03', e: 'A002', t: 2, h: 5, wt: 1, cu: null, ec: 0, tr: 0, ls: 3, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    // 3:一组 售前类 5h 原始 pm=false
    { d: '2026-06-04', e: 'A001', t: 1, h: 5, wt: 1, cu: 0, ec: 0, tr: 4, ls: 0, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 1, iss: ['HINT_PRESALE_PRODUCT'], ct: '' },
    // 4:管理类 100h —— 两块一律不得统计
    { d: '2026-06-05', e: 'A002', t: 3, h: 100, wt: 2, cu: null, ec: 0, tr: 0, ls: 0, pm: true,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
  ],
  issues: [
    { i: 0, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['x'], snippet: '' },
    { i: 3, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['x'], snippet: '' },
  ],
  days: [],
} as unknown as YitianData

const ALL: CpFilter = { start: '', end: '', l4s: [], prodCats: [], types: [], mgrMode: 'all' }
const ROWS = selectCpEntries(D, ALL)

describe('presaleHintByL4(B-5①)', () => {
  it('按 L4 汇总条数与工时', () => {
    const r = presaleHintByL4(D, ALL)
    const one = r.find((x) => x.l4 === '一组')
    expect(one).toMatchObject({ count: 2, hours: 15 })   // entries 0(10h) + 3(5h)
  })

  it('按 L4 筛选生效', () => {
    expect(presaleHintByL4(D, { ...ALL, l4s: ['二组'] })).toEqual([])
  })

  it('按日期区间筛选生效', () => {
    const r = presaleHintByL4(D, { ...ALL, start: '2026-06-04', end: '2026-06-04' })
    expect(r).toEqual([{ l4: '一组', count: 1, hours: 5 }])
  })
})

describe('unattributedByWorkType(B-5②)', () => {
  it('按工作类型三拆分,只看 tr===0 的客户类工时', () => {
    const r = unattributedByWorkType(D, ROWS)
    expect(r).toEqual([
      { workType3: '升级加固', count: 1, hours: 20 },
      { workType3: '安装部署', count: 1, hours: 5 },
    ])   // 管理类那条 tr=0 的 100h 不得混进来
  })

  it('按工时降序', () => {
    const r = unattributedByWorkType(D, ROWS)
    expect(r[0].hours).toBeGreaterThan(r[1].hours)
  })
})

describe('calibStat(B-5③)', () => {
  it('四档计数与覆盖率', () => {
    const s = calibStat(D, ROWS)
    expect(s).toMatchObject({ raw: 1, calibrated: 1, ambiguous: 1, unmatched: 1, pending: 3 })
    expect(s.rate).toBeCloseTo(1 / 3)
  })

  it('无待校准记录时 rate 为 null 而不是 0 或 NaN', () => {
    const s = calibStat(D, ROWS.filter((e) => e.ls === 0))
    expect(s.pending).toBe(0)
    expect(s.rate).toBeNull()
  })
})

describe('pmShare(B-6)', () => {
  it('按 L4 分组算占比', () => {
    const r = pmShare(D, ROWS, 'l4')
    const one = r.find((x) => x.name === '一组')
    expect(one).toMatchObject({ total: 15, pm: 10 })
    expect(one?.share).toBeCloseTo(10 / 15)
    const two = r.find((x) => x.name === '二组')
    expect(two).toMatchObject({ total: 25, pm: 0, share: 0 })   // 真的 0%,不是 null
  })

  it('按员工分组用姓名', () => {
    const r = pmShare(D, ROWS, 'emp')
    expect(r.map((x) => x.name).sort()).toEqual(['小李', '老张'])
  })

  it('按占比降序', () => {
    const r = pmShare(D, ROWS, 'l4')
    expect(r[0].name).toBe('一组')
  })

  it('管理类工时不进分母也不进分子', () => {
    const r = pmShare(D, ROWS, 'l4')
    expect(r.reduce((s, x) => s + x.total, 0)).toBe(40)   // 10+20+5+5,不含管理类 100
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/governance.test.ts`
Expected: FAIL —— 无法解析 `./governance`

- [ ] **Step 3: 建实现**

```ts
import type { YitianData, YitianEntry } from '@/types/yitian'
import { NO_L4 } from './metrics'
import { selectCpEntries, type CpFilter } from './customerProduct'

const PRESALE_HINT_CODE = 'HINT_PRESALE_PRODUCT'

function dv(arr: string[], i: number | null | undefined): string {
  return i === null || i === undefined ? '' : (arr[i] ?? '')
}

export interface PresaleHintRow { l4: string; count: number; hours: number }

/** B-5① 售前服务类工时未关联产品(产品线为「其他」)。
 *  **判定不新写规则** —— 直接读既有合规码 HINT_PRESALE_PRODUCT。合规检查页看的是
 *  「单条工时填得合不合规」,本块看的是「这类填报习惯的总量」,同源不同视角。 */
export function presaleHintByL4(data: YitianData, f: CpFilter): PresaleHintRow[] {
  const l4Of = new Map(data.roster.map((p) => [p.id, p.l4 || NO_L4]))
  const l4Set = new Set(f.l4s)
  const acc = new Map<string, { c: number; h: number }>()
  for (const it of data.issues) {
    if (!it.codes.includes(PRESALE_HINT_CODE)) continue
    // i 是【全量 entries】的原始下标,必须直接下标取,不能先过滤再取(下标会失配)
    const e = data.entries[it.i]
    if (!e) continue
    if (f.start && e.d < f.start) continue
    if (f.end && e.d > f.end) continue
    const l4 = l4Of.get(e.e) ?? NO_L4
    if (l4Set.size && !l4Set.has(l4)) continue
    const a = acc.get(l4) ?? { c: 0, h: 0 }
    a.c += 1
    a.h += e.h
    acc.set(l4, a)
  }
  return [...acc.entries()]
    .map(([l4, a]) => ({ l4, count: a.c, hours: a.h }))
    .sort((x, y) => y.hours - x.hours || x.l4.localeCompare(y.l4))
}

export interface UnattributedRow { workType3: string; count: number; hours: number }

/** B-5② 客户不可归属(tr===0):客户字段为空或填了占位词,导致该条工时无法归属真实客户,
 *  客户象限判不出 → 「可转移非原厂」对这批工时是结论盲区。按工作类型三拆分看填报习惯。 */
export function unattributedByWorkType(
  data: YitianData, rows: YitianEntry[],
): UnattributedRow[] {
  const acc = new Map<string, { c: number; h: number }>()
  for (const e of rows) {
    if (e.tr !== 0) continue
    const w = dv(data.dims.workTypes, e.wt) || '(空)'
    const a = acc.get(w) ?? { c: 0, h: 0 }
    a.c += 1
    a.h += e.h
    acc.set(w, a)
  }
  return [...acc.entries()]
    .map(([workType3, a]) => ({ workType3, count: a.c, hours: a.h }))
    .sort((x, y) => y.hours - x.hours || x.workType3.localeCompare(y.workType3))
}

export interface CalibStat {
  raw: number
  calibrated: number
  ambiguous: number
  unmatched: number
  pending: number
  rate: number | null
}

/** B-5③ 产品线校准覆盖率。待校准 = calibrated + ambiguous + unmatched(即产品线原本为空/其他的)。
 *  分母为 0 → rate 为 null(显 "-"),不得返回 0 —— 「没有待校准记录」与「一条都没校准成功」
 *  是两回事。 */
export function calibStat(data: YitianData, rows: YitianEntry[]): CalibStat {
  const c = [0, 0, 0, 0]
  for (const e of rows) {
    if (e.ls >= 0 && e.ls <= 3) c[e.ls] += 1
  }
  const pending = c[1] + c[2] + c[3]
  return {
    raw: c[0], calibrated: c[1], ambiguous: c[2], unmatched: c[3],
    pending, rate: pending > 0 ? c[1] / pending : null,
  }
}

export interface PmShareRow { name: string; total: number; pm: number; share: number | null }

/** B-6 项目管理工时占比。分母 = 客户类工时,分子 = pm 标签为真。
 *  分母为 0 → share 为 null;分子为 0 而分母有值 → 0(真的 0%)。两者不可混。 */
export function pmShare(
  data: YitianData, rows: YitianEntry[], level: 'l4' | 'emp',
): PmShareRow[] {
  const l4Of = new Map(data.roster.map((p) => [p.id, p.l4 || NO_L4]))
  const nameOf = new Map(data.roster.map((p) => [p.id, p.name || p.id]))
  const acc = new Map<string, { t: number; p: number }>()
  for (const e of rows) {
    const key = level === 'l4' ? (l4Of.get(e.e) ?? NO_L4) : (nameOf.get(e.e) ?? e.e)
    const a = acc.get(key) ?? { t: 0, p: 0 }
    a.t += e.h
    if (e.pm) a.p += e.h
    acc.set(key, a)
  }
  return [...acc.entries()]
    .map(([name, a]) => ({
      name, total: a.t, pm: a.p, share: a.t > 0 ? a.p / a.t : null,
    }))
    // 占比降序;相同则按名称升序,保证顺序稳定(否则断言会随机红)
    .sort((x, y) => (y.share ?? -1) - (x.share ?? -1) || x.name.localeCompare(y.name))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/governance.test.ts`
Expected: 12 passed

- [ ] **Step 5: 反向验证（三条）**

用 Read+Edit 逐条制造违规、确认变红、改回：
1. `presaleHintByL4` 里把 `data.entries[it.i]` 换成先过滤客户类再按 `it.i` 取下标 → **必须红**（下标失配，条数/工时都会错）。
2. `calibStat` 的 `rate: pending > 0 ? ... : null` 改成 `c[1] / pending` → **必须红**在「无待校准记录时 rate 为 null」（会得 `NaN`）。
3. `unattributedByWorkType` 里删掉 `if (e.tr !== 0) continue` → **必须红**在「只看 tr===0」。

- [ ] **Step 6: 用真实数据对拍（关键验收）**

```bash
python -c "
# -*- coding: utf-8 -*-
import sys,json,collections; sys.stdout.reconfigure(encoding='utf-8')
d=json.load(open('data/yitian_data.json',encoding='utf-8'))
D=d['dims']; R={p['id']:p for p in d['roster']}; CT=('项目类','售前类','售后类'); E=d['entries']
def g(e,k,a):
    i=e[k]; return a[i] if i is not None else ''
rows=[e for e in E if g(e,'t',D['types']) in CT]
hint=[it for it in d['issues'] if 'HINT_PRESALE_PRODUCT' in it['codes']]
by=collections.Counter(); byh=collections.Counter()
for it in hint:
    e=E[it['i']]; l4=(R.get(e['e']) or {}).get('l4') or '未分配L4'
    by[l4]+=1; byh[l4]+=e['h']
print('B-5① 命中 %d 条;L4 前3:'%len(hint),[(k,by[k],round(byh[k])) for k,_ in byh.most_common(3)])
un=collections.Counter(); unn=collections.Counter()
for e in rows:
    if e['tr']!=0: continue
    w=g(e,'wt',D['workTypes']) or '(空)'; un[w]+=e['h']; unn[w]+=1
print('B-5② %d 行 / %.0f h / %d 种类型;前3:'%(sum(unn.values()),sum(un.values()),len(un)),
      [(k,unn[k],round(v)) for k,v in un.most_common(3)])
ls=collections.Counter()
for e in rows: ls[e['ls']]+=1
print('B-5③ raw %d / calib %d / ambig %d / unmatch %d;覆盖率 %.0f%%'%(ls[0],ls[1],ls[2],ls[3],ls[1]/(ls[1]+ls[2]+ls[3])*100))
tot=sum(e['h'] for e in rows); pm=sum(e['h'] for e in rows if e['pm'])
print('B-6 全域 %.0f / %.0f = %.1f%%'%(pm,tot,pm/tot*100))
org=collections.defaultdict(lambda:[0.0,0.0])
for e in rows:
    l4=(R.get(e['e']) or {}).get('l4') or '未分配L4'
    org[l4][0]+=e['h']
    if e['pm']: org[l4][1]+=e['h']
top=sorted(org.items(),key=lambda x:-(x[1][1]/x[1][0] if x[1][0] else 0))[0]
print('   组织级 %d 个 L4,最高 %s %.1f%%'%(len(org),top[0],top[1][1]/top[1][0]*100))
"
```

Expected（与「实测基线」一节逐项一致）：
- `B-5① 命中 969 条`，L4 前三 = 银行服务组 185/1482、小金融服务组 167/1248、浙江服务组 135/955
- `B-5② 478 行 / 2810 h / 11 种类型`，前三 = 升级加固 337/1824、安装部署 72/557、项目管理 25/141
- `B-5③ raw 8756 / calib 307 / ambig 931 / unmatch 201;覆盖率 21%`
- `B-6 全域 11082 / 62314 = 17.8%`；组织级 12 个 L4，最高 运营商服务组 55.7%

> **对不上就停下报告，不要改期望值，也不要改实现去凑。**

- [ ] **Step 7: typecheck 并提交**

```bash
npm --prefix frontend run typecheck
git add frontend/src/lib/yitian/governance.ts frontend/src/lib/yitian/governance.test.ts
git commit -m "feat(yitian-gov): 治理页两块的聚合口径

B-5① 直接读既有合规码 HINT_PRESALE_PRODUCT,不新写判定规则——合规页看「单条填得
合不合规」,本块看「这类填报习惯的总量趋势」,同源不同视角。issues[].i 是全量 entries
的原始下标,必须直接下标取。

占比类分母为 0 一律返回 null(显 "-"),分子为 0 而分母有值返回 0(真的 0%),两者不可混。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 治理页装配

**Files:**
- Modify: `frontend/src/views/YitianGovernanceView.vue`
- Create: `frontend/src/views/YitianGovernanceView.test.ts`

**Interfaces:**
- Consumes: T1 的骨架、T2 的四个函数、V4.5.5 的 `selectCpEntries`/`CpFilter`、`stores/yitianView` 的筛选成员
- Produces: 完整页面

**版面顺序**：页头 → 工具栏 → **异常指标监控**（三个指标卡 + 两张明细表）→ **项目管理工时概况**（组织级表 + 个人级表）。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/views/YitianGovernanceView.test.ts`。fixture 直接照抄 `src/lib/yitian/governance.test.ts` 里那个 `D`（**各自独立维护、勿跨文件 import**），并补 `meta.calendarSource: 'csv'`（工具栏要读）：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import YitianGovernanceView from './YitianGovernanceView.vue'
import { useYitianStore } from '@/stores/yitian'

// 与 governance.test.ts 的 D 同构但**各自独立维护、勿跨文件 import**。用 `as never` 绕过
// 类型完整性 —— 视图只读:meta.calendarSource(工具栏日历降级提示) / dims / roster / entries /
// issues / days(工具栏日期选择器)。其余 meta 字段视图一概不读,不必构造。
const DATA = {
  meta: { top1000Named: {}, calendarSource: 'csv' },
  days: [],
  roster: [
    { id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: true },
    { id: 'A002', name: '小李', l2: '', l3: '', l31: '', l4: '二组', category: '正式', isMgr: false },
  ],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类'],
    workTypes: ['升级加固', '安装部署', '项目管理'],
    customers: ['甲公司'],
    custQuads: [], custBgs: [], prodCats: ['终端安全'],
    products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    { d: '2026-06-01', e: 'A001', t: 0, h: 10, wt: 2, cu: 0, ec: 0, tr: 4, ls: 1, pm: true,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 1, iss: ['HINT_PRESALE_PRODUCT'], ct: '' },
    { d: '2026-06-02', e: 'A002', t: 0, h: 20, wt: 0, cu: null, ec: 0, tr: 0, ls: 2, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    { d: '2026-06-03', e: 'A002', t: 2, h: 5, wt: 1, cu: null, ec: 0, tr: 0, ls: 3, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
    { d: '2026-06-04', e: 'A001', t: 1, h: 5, wt: 1, cu: 0, ec: 0, tr: 4, ls: 0, pm: false,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 1, iss: ['HINT_PRESALE_PRODUCT'], ct: '' },
    { d: '2026-06-05', e: 'A002', t: 3, h: 100, wt: 2, cu: null, ec: 0, tr: 0, ls: 0, pm: true,
      cq: null, cbg: null, el: null, ch: true, top: false, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', ok: 0, iss: [], ct: '' },
  ],
  issues: [
    { i: 0, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['x'], snippet: '' },
    { i: 3, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['x'], snippet: '' },
  ],
}

beforeEach(() => setActivePinia(createPinia()))

function mountView() {
  useYitianStore().data = DATA as never
  return mount(YitianGovernanceView, {
    global: { plugins: [ElementPlus], stubs: { RouterLink: true } },
  })
}

describe('YitianGovernanceView', () => {
  it('两大块的标题都在', () => {
    const t = mountView().text()
    for (const s of ['异常指标监控', '售前服务类工时未关联产品', '客户不可归属',
                     '产品线校准覆盖率', '项目管理工时概况']) {
      expect(t, s).toContain(s)
    }
  })

  it('三个异常指标卡显示实际数值', () => {
    const t = mountView().text()
    expect(t).toContain('2')      // B-5① 命中 2 条
    expect(t).toContain('33%')    // B-5③ 覆盖率 1/3
  })

  it('组织级与个人级两张表都在', () => {
    const w = mountView()
    expect(w.find('[data-test="ygv-pm-l4"]').exists()).toBe(true)
    expect(w.find('[data-test="ygv-pm-emp"]').exists()).toBe(true)
  })

  it('store 无数据时不炸', () => {
    setActivePinia(createPinia())
    const w = mount(YitianGovernanceView, {
      global: { plugins: [ElementPlus], stubs: { RouterLink: true } },
    })
    expect(w.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/views/YitianGovernanceView.test.ts`
Expected: FAIL —— 找不到区块标题

- [ ] **Step 3: 装配页面**

`<script setup>`（**props 用法先 Read `YitianCustomerProductView.vue` 照抄**）：

```ts
import { computed, onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import AppCard from '@/components/AppCard.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { useScopedYitian } from '@/composables/useScopedData'
import { selectCpEntries, type CpFilter } from '@/lib/yitian/customerProduct'
import { presaleHintByL4, unattributedByWorkType, calibStat, pmShare } from '@/lib/yitian/governance'

const store = useYitianStore()
const scoped = useScopedYitian()
const view = useYitianViewStore()

onMounted(() => { view.hydrate(); store.load() })

const filter = computed<CpFilter>(() => ({
  start: view.start, end: view.end, l4s: view.l4s,
  prodCats: view.prodCats, types: view.types, mgrMode: view.mgrMode,
}))
const rows = computed(() => (scoped.value ? selectCpEntries(scoped.value, filter.value) : []))

const hintRows = computed(() => (scoped.value ? presaleHintByL4(scoped.value, filter.value) : []))
const unattrRows = computed(() => (scoped.value ? unattributedByWorkType(scoped.value, rows.value) : []))
const calib = computed(() => (scoped.value
  ? calibStat(scoped.value, rows.value)
  : { raw: 0, calibrated: 0, ambiguous: 0, unmatched: 0, pending: 0, rate: null }))
const pmL4 = computed(() => (scoped.value ? pmShare(scoped.value, rows.value, 'l4') : []))
const pmEmp = computed(() => (scoped.value ? pmShare(scoped.value, rows.value, 'emp') : []))

const fmtH = (v: unknown) => (typeof v === 'number' ? Math.round(v).toLocaleString() : '')
const fmtPct = (v: unknown) => (v === null || v === undefined ? '-' : `${Math.round(Number(v) * 100)}%`)

/** 三个异常指标卡。数值越大越该关注,故一律走 warn 色(为 0 时不上色)。 */
const abnormalKpi = computed(() => {
  const hint = hintRows.value.reduce((s, r) => s + r.count, 0)
  const unattrH = unattrRows.value.reduce((s, r) => s + r.hours, 0)
  const c = calib.value
  return [
    { k: '售前服务类未关联产品', v: String(hint), sub: '条(产品线填「其他」)',
      cls: hint ? 'warn' : '' },
    { k: '客户不可归属', v: String(Math.round(unattrH)), sub: `h · ${unattrRows.value.reduce((s, r) => s + r.count, 0)} 条`,
      cls: unattrH ? 'warn' : '' },
    { k: '产品线校准覆盖率', v: c.rate === null ? '-' : `${Math.round(c.rate * 100)}%`,
      sub: c.pending ? `已校准 ${c.calibrated} / 待校准 ${c.pending}` : '无待校准记录' },
  ]
})

const HINT_COLS: DataColumn[] = [
  { key: 'l4', label: 'L4 组织', width: 160 },
  { key: 'count', label: '条数', width: 100, num: true, sortable: true },
  { key: 'hours', label: '工时', width: 110, num: true, sortable: true, formatter: fmtH },
]
const UNATTR_COLS: DataColumn[] = [
  { key: 'workType3', label: '工作类型三', width: 160 },
  { key: 'count', label: '条数', width: 100, num: true, sortable: true },
  { key: 'hours', label: '工时', width: 110, num: true, sortable: true, formatter: fmtH },
]
const PM_L4_COLS: DataColumn[] = [
  { key: 'name', label: 'L4 组织', width: 160 },
  { key: 'total', label: '客户类工时', width: 130, num: true, sortable: true, formatter: fmtH },
  { key: 'pm', label: '项目管理工时', width: 130, num: true, sortable: true, formatter: fmtH },
  { key: 'share', label: '占比', width: 100, num: true, sortable: true, formatter: fmtPct },
]
const PM_EMP_COLS: DataColumn[] = [
  { key: 'name', label: '员工', width: 120 },
  { key: 'total', label: '客户类工时', width: 130, num: true, sortable: true, formatter: fmtH },
  { key: 'pm', label: '项目管理工时', width: 130, num: true, sortable: true, formatter: fmtH },
  { key: 'share', label: '占比', width: 100, num: true, sortable: true, formatter: fmtPct },
]
```

模板：

```vue
<template>
  <div class="ygv-page">
    <PageHeader title="工时治理监控" />
    <YitianToolbar />

    <AppCard v-if="store.error"><p class="ygv-err">{{ store.error }}</p></AppCard>
    <template v-else>
      <AppCard>
        <SectionTitle level="section">异常指标监控</SectionTitle>
        <p class="ygv-note">
          看的是「某类填报习惯的总量」，不是待整改的单条问题 ——
          单条合规判定见「合规检查」页。三项数值越大，「可转移非原厂」的结论水分越大。
        </p>
        <MetricGrid :items="abnormalKpi" col-min="200px" />
      </AppCard>

      <AppCard>
        <SectionTitle level="section">售前服务类工时未关联产品</SectionTitle>
        <p class="ygv-note">项目类型含「售前服务」、工作类型三非项目管理类、且产研侧产品线填「其他」。</p>
        <DataTable :columns="HINT_COLS" :rows="hintRows" row-key="l4" />
      </AppCard>

      <AppCard>
        <SectionTitle level="section">客户不可归属</SectionTitle>
        <p class="ygv-note">
          客户字段为空或填了占位词，该条工时无法归属真实客户 → 客户象限判不出 →
          对「可转移非原厂」是结论盲区。
        </p>
        <DataTable :columns="UNATTR_COLS" :rows="unattrRows" row-key="workType3" />
      </AppCard>

      <AppCard>
        <SectionTitle level="section">项目管理工时概况</SectionTitle>
        <p class="ygv-note">分母 = 客户类工时（项目类/售前类/售后类），分子 = 带项目管理标签的工时。</p>
        <SectionTitle level="section" class="ygv-t2">按 L4 组织</SectionTitle>
        <div data-test="ygv-pm-l4">
          <DataTable :columns="PM_L4_COLS" :rows="pmL4" row-key="name" />
        </div>
        <SectionTitle level="section" class="ygv-t2">按员工</SectionTitle>
        <div data-test="ygv-pm-emp">
          <DataTable :columns="PM_EMP_COLS" :rows="pmEmp" row-key="name" />
        </div>
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.ygv-page { display: flex; flex-direction: column; gap: var(--gap-section); padding: var(--sp-4); }
.ygv-err { margin: 0; color: var(--danger-text); }
.ygv-note { margin: 0 0 var(--sp-3); font-size: var(--fs-1); color: var(--mut); }
.ygv-t2 { margin-top: var(--sp-4); }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/views/YitianGovernanceView.test.ts`
Expected: 4 passed

- [ ] **Step 5: typecheck 并跑全部倚天前端测试**

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run test:run -- src/lib/yitian/ src/views/Yitian src/components/Yitian
```
Expected: 全绿

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/YitianGovernanceView.vue frontend/src/views/YitianGovernanceView.test.ts
git commit -m "feat(yitian-gov): 装配工时治理监控页两大块

异常指标监控刻意不塞进合规检查页:合规页讲「单条工时填得合不合规」(969 个待整改
的单条问题),本页讲「某类填报习惯的总量趋势」,放一起会让人以为是同一件事的两种视图。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 员工明细表 5 列拆分

**Files:**
- Create: `frontend/src/lib/yitian/empSplit.ts`
- Create: `frontend/src/lib/yitian/empSplit.test.ts`
- Modify: `frontend/src/views/YitianAnalyticsView.vue`
- Modify: `frontend/src/views/YitianAnalyticsView.test.ts`

**Interfaces:**
- Consumes: 无（与其它任务文件零重叠）
- Produces:

```ts
export interface EmpSplit {
  nonCustomer: number   // 非面向客户(管理类/业务类/假期类等)
  customer: number      // 面向客户合计(= project + presale + postsale)
  project: number
  presale: number
  postsale: number
}
/** 工号 → 五类工时。区间/L4 过滤由调用方先做好(传进来的 entries 已是选定范围)。 */
export function empSplit(data: YitianData, entries: YitianEntry[]): Map<string, EmpSplit>
```

**为什么不改 `metrics.ts`**：`EmpStat` 承载的是饱和度双基准口径（V4.4.5 与用户确认过），三期一贯禁改。5 列是**纯展示派生**，走独立 lib + 视图 decorate，与 V4.4.4 的 `decorateProjectDomain` 同款。**decorate 必须把值并到行对象上**，否则排序/列筛选/导出三处都读不到。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/lib/yitian/empSplit.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { YitianData } from '@/types/yitian'
import { empSplit } from './empSplit'

const D = {
  roster: [{ id: 'A001', name: '老张', l2: '', l3: '', l31: '', l4: '一组', category: '正式', isMgr: false }],
  dims: {
    types: ['项目类', '售前类', '售后类', '管理类', '假期类'],
    workTypes: [], customers: [], custQuads: [], custBgs: [], prodCats: [],
    products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    { d: '2026-06-01', e: 'A001', t: 0, h: 10 }, { d: '2026-06-02', e: 'A001', t: 1, h: 4 },
    { d: '2026-06-03', e: 'A001', t: 2, h: 6 }, { d: '2026-06-04', e: 'A001', t: 3, h: 8 },
    { d: '2026-06-05', e: 'A001', t: 4, h: 8 },
  ],
  meta: {}, days: [], issues: [],
} as unknown as YitianData

describe('empSplit', () => {
  it('五类工时各自归位,面向客户 = 三类之和', () => {
    const m = empSplit(D, D.entries)
    const s = m.get('A001')
    expect(s).toEqual({ nonCustomer: 16, customer: 20, project: 10, presale: 4, postsale: 6 })
    expect(s!.customer).toBe(s!.project + s!.presale + s!.postsale)
  })

  it('工时类型为空的行计入非面向客户', () => {
    const d2 = { ...D, entries: [{ d: '2026-06-01', e: 'A001', t: null, h: 3 }] } as unknown as YitianData
    expect(empSplit(d2, d2.entries).get('A001')).toMatchObject({ nonCustomer: 3, customer: 0 })
  })

  it('无记录的员工不出现在 Map 里(调用方用 ?? 缺省)', () => {
    expect(empSplit(D, []).size).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/empSplit.test.ts`
Expected: FAIL —— 无法解析 `./empSplit`

- [ ] **Step 3: 建实现**

```ts
import type { YitianData, YitianEntry } from '@/types/yitian'

/** 面向客户的三类工时。与后端 transferable 判定、V4.5.5 的 selectCpEntries 同一口径。 */
const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']

export interface EmpSplit {
  nonCustomer: number
  customer: number
  project: number
  presale: number
  postsale: number
}

/** 工号 → 五类工时拆分。
 *  **刻意不进 metrics.ts 的 EmpStat** —— 那里承载的是 V4.4.5 双基准饱和度口径,
 *  三期一贯禁改。本函数是纯展示派生,由视图 decorate 到行上(值必须并到行对象,
 *  否则排序/列筛选/导出三处都读不到)。 */
export function empSplit(data: YitianData, entries: YitianEntry[]): Map<string, EmpSplit> {
  const out = new Map<string, EmpSplit>()
  for (const e of entries) {
    const t = e.t === null || e.t === undefined ? '' : (data.dims.types[e.t] ?? '')
    let s = out.get(e.e)
    if (!s) {
      s = { nonCustomer: 0, customer: 0, project: 0, presale: 0, postsale: 0 }
      out.set(e.e, s)
    }
    const i = CUSTOMER_TYPES.indexOf(t)
    if (i < 0) { s.nonCustomer += e.h; continue }
    s.customer += e.h
    if (i === 0) s.project += e.h
    else if (i === 1) s.presale += e.h
    else s.postsale += e.h
  }
  return out
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/empSplit.test.ts`
Expected: 3 passed

- [ ] **Step 5: 接进分析页员工明细表**

`YitianAnalyticsView.vue`：
1. `import { empSplit } from '@/lib/yitian/empSplit'`
2. 建 decorate：**先 Read 该文件找到员工明细表的行数据 computed（约在 `EMP_COLS` 附近，行里已有 `id`/`name`/`l4`/`hoursText`/`baseText`/`satText`/`diffText`）**，在它之后加：
```ts
/** 5 列拆分 decorate:值必须并到行对象上,否则排序/列筛选/导出三处都读不到(V4.4.4 教训)。 */
const empRowsWithSplit = computed(() => {
  const d = scopedYitian.value
  if (!d) return []
  const m = empSplit(d, selectEntries(d, view.start, view.end, view.l4s))
  const zero = { nonCustomer: 0, customer: 0, project: 0, presale: 0, postsale: 0 }
  return empRows.value.map((r) => ({ ...r, ...(m.get(r.id) ?? zero) }))
})
```
> `empRows` 与 `selectEntries` 的实际名字以该文件现状为准 —— **先 Read 再改**，勿臆造。表格的 `:rows` 改绑 `empRowsWithSplit`。
3. `EMP_COLS`（员工明细表列定义）在 `diffText` 之后、`detailAction` 之前插入五列：
```ts
  { key: 'nonCustomer', label: '非面向客户', width: 120, num: true, sortable: true, formatter: fmtH },
  { key: 'customer', label: '面向客户', width: 110, num: true, sortable: true, formatter: fmtH },
  { key: 'project', label: '项目类', width: 100, num: true, sortable: true, formatter: fmtH },
  { key: 'presale', label: '售前类', width: 100, num: true, sortable: true, formatter: fmtH },
  { key: 'postsale', label: '售后类', width: 100, num: true, sortable: true, formatter: fmtH },
```
`fmtH` 若该文件已有同名格式化函数则复用；没有就加 `const fmtH = (v: unknown) => (typeof v === 'number' ? Math.round(v).toLocaleString() : '')`。
4. **新列默认隐藏**：若该表接了 `useColumnPrefs`，把五个 key **不要**加进 `DEFAULT_VISIBLE`（持久化优先，加默认列对老用户不生效）。若该表没有选列功能，则五列直接显示，并在 `ygv`/`yt` 样式里确认表格能横向滚动。

- [ ] **Step 6: 加视图测试**

在 `frontend/src/views/YitianAnalyticsView.test.ts` 追加：

该文件**已有 `function mountView()`（约第 74 行）**，直接用。若其 fixture 的 `dims.types` 不含「管理类」，
补一个管理类工时条目进 `entries`，否则 `nonCustomer` 恒为 0、断言证明不了拆分真的生效：

```ts
it('员工明细行带上五类工时拆分且值不为 undefined', () => {
  const w = mountView()
  const table = w.findAllComponents({ name: 'DataTable' })
    .find((t) => (t.props('columns') as { key: string }[]).some((c) => c.key === 'satText'))
  const rows = table!.props('rows') as Record<string, unknown>[]
  expect(rows.length).toBeGreaterThan(0)
  for (const k of ['nonCustomer', 'customer', 'project', 'presale', 'postsale']) {
    expect(rows[0][k], k).not.toBeUndefined()   // 写 `k in row` 会恒真:赋 undefined 也算自有属性
  }
})
```

- [ ] **Step 7: 跑测试并核实 metrics 零改动**

```bash
npm --prefix frontend run test:run -- src/lib/yitian/empSplit.test.ts src/views/YitianAnalyticsView.test.ts src/lib/yitian/metrics.test.ts
npm --prefix frontend run typecheck
git diff --numstat frontend/src/lib/yitian/metrics.ts | wc -l
```
Expected: 测试全绿；**`metrics.ts` 改动行数为 `0`**。非 0 即违反本期承诺，回退重做。

- [ ] **Step 8: 反向验证**

把 decorate 里 `...(m.get(r.id) ?? zero)` 改成 `...(m.get(r.id) as never)`（无匹配时展开 `undefined`，五个键都不会出现），重跑 Step 6 那条测试 → **必须红**在「值不为 undefined」。确认后改回。

- [ ] **Step 9: 用真实数据对拍**

```bash
python -c "
# -*- coding: utf-8 -*-
import sys,json,collections; sys.stdout.reconfigure(encoding='utf-8')
d=json.load(open('data/yitian_data.json',encoding='utf-8'))
T=d['dims']['types']; CT=('项目类','售前类','售后类')
non=cus=0.0; t=collections.Counter()
for e in d['entries']:
    ty=T[e['t']] if e['t'] is not None else ''
    if ty in CT: cus+=e['h']; t[ty]+=e['h']
    else: non+=e['h']
print('非面向客户 %.0f h / 面向客户 %.0f h'%(non,cus))
print('项目类 %.0f / 售前类 %.0f / 售后类 %.0f (三者和 %.0f)'%(t['项目类'],t['售前类'],t['售后类'],sum(t.values())))
"
```
Expected：`非面向客户 10586 h / 面向客户 62314 h`；`项目类 42986 / 售前类 7933 / 售后类 11395 (三者和 62314)`。

- [ ] **Step 10: 提交**

```bash
git add frontend/src/lib/yitian/empSplit.ts frontend/src/lib/yitian/empSplit.test.ts \
        frontend/src/views/YitianAnalyticsView.vue frontend/src/views/YitianAnalyticsView.test.ts
git commit -m "feat(yitian-analytics): 员工明细表补五类工时拆分列

刻意不进 metrics.ts 的 EmpStat——那里承载 V4.4.5 双基准饱和度口径,三期一贯禁改。
本组是纯展示派生,走独立 lib + 视图 decorate(值必须并到行对象,否则排序/列筛选/
导出三处都读不到)。metrics.ts 实测零改动。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 趋势时间维度补半年与年

**Files:**
- Modify: `frontend/src/lib/yitian/calendar.ts`
- Modify: `frontend/src/lib/yitian/calendar.test.ts`
- Modify: `frontend/src/views/YitianTrendView.vue`
- Modify: `frontend/src/views/YitianTrendView.test.ts`

**Interfaces:**
- Consumes: `calendar.ts` 既有私有辅助 `bucketBy(days, start, end, keyFn)` 与类型 `WeekBucket` —— **先 Read 该文件确认签名**
- Produces:
```ts
export function halfYearBuckets(days: YitianDay[], start: string, end: string): WeekBucket[]
export function yearBuckets(days: YitianDay[], start: string, end: string): WeekBucket[]
```

**背景**：`calendar.ts` 已有 `weekBuckets` / `monthBuckets` / `quarterBuckets`，三者都是 `bucketBy` + 一个 keyFn 的薄封装。本任务照此加两个。趋势页的 `gran` 是**局部 ref、不入 store**（注释明写「只影响本页分桶」），加两个枚举值即可。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/yitian/calendar.test.ts` 追加（沿用该文件既有的 `days` 构造方式）：

```ts
import { halfYearBuckets, yearBuckets } from './calendar'

function mkDays(dates: string[]) {
  return dates.map((d) => ({ d, workday: true, isoWeek: '', calcWeek: '' }))
}

describe('halfYearBuckets', () => {
  it('1-6 月为 H1、7-12 月为 H2', () => {
    const days = mkDays(['2026-02-02', '2026-06-30', '2026-07-01', '2026-12-31'])
    const b = halfYearBuckets(days, '', '')
    expect(b.map((x) => x.key)).toEqual(['2026-H1', '2026-H2'])
  })

  it('跨年各自成桶且按起始日升序', () => {
    const days = mkDays(['2026-08-01', '2026-03-01'])
    expect(yearBuckets(days, '', '').map((x) => x.key)).toEqual(['2026'])
    const days2 = mkDays(['2027-01-05', '2026-03-01'])
    expect(yearBuckets(days2, '', '').map((x) => x.key)).toEqual(['2026', '2027'])
  })

  it('区间过滤生效', () => {
    const days = mkDays(['2026-02-02', '2026-07-01'])
    expect(halfYearBuckets(days, '2026-07-01', '2026-07-01').map((x) => x.key)).toEqual(['2026-H2'])
  })
})
```
> 若该文件已有 `mkDays` 之类的辅助，**复用它**，不要再写一份。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/calendar.test.ts`
Expected: FAIL —— `halfYearBuckets is not a function`

- [ ] **Step 3: 加两个分桶函数**

`calendar.ts` 在 `quarterBuckets` 之后追加：

```ts
/** 按半年分桶(key='YYYY-Hn';1-6 月=H1,7-12 月=H2)。 */
export function halfYearBuckets(days: YitianDay[], start: string, end: string): WeekBucket[] {
  return bucketBy(days, start, end, (d) => `${d.d.slice(0, 4)}-H${Number(d.d.slice(5, 7)) <= 6 ? 1 : 2}`)
}

/** 按自然年分桶(key='YYYY')。累积库跨度不足一年时只会得到 1 个桶,属退化态非缺陷。 */
export function yearBuckets(days: YitianDay[], start: string, end: string): WeekBucket[] {
  return bucketBy(days, start, end, (d) => d.d.slice(0, 4))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/calendar.test.ts`
Expected: 全绿（含既有用例）

- [ ] **Step 5: 接进趋势页**

`YitianTrendView.vue`：
1. import 补 `halfYearBuckets, yearBuckets`
2. `gran` 类型改为 `ref<'week' | 'month' | 'quarter' | 'half' | 'year'>('week')`
3. `GRAN_OPTS` 追加两项：
```ts
  { value: 'half', label: '半年' },
  { value: 'year', label: '年' },
```
4. `bucketsList` 的三元链补两个分支（放在 `quarter` 之后、`week` 兜底之前）：
```ts
  return gran.value === 'month' ? monthBuckets(data.days, view.start, view.end)
    : gran.value === 'quarter' ? quarterBuckets(data.days, view.start, view.end)
    : gran.value === 'half' ? halfYearBuckets(data.days, view.start, view.end)
    : gran.value === 'year' ? yearBuckets(data.days, view.start, view.end)
    : weekBuckets(data.days, view.start, view.end, view.weekMode)
```
5. 该文件里凡出现「周/月/季」字样的注释（如 `bucketsList` 与 `series` 上方那两条），改为「周/月/季/半年/年」—— **注释不改就是骗人**，本仓 V4.4.5 记过这条。

- [ ] **Step 6: 加趋势页测试**

在 `frontend/src/views/YitianTrendView.test.ts` 的既有 `describe` 内追加。
**该文件的挂载辅助叫 `mountAndCharts()`（async，返回 `{ w, charts }`），不是 `mountView()`**；
粒度控件是自绘的 **`SegToggle`**（`YitianTrendView.vue:175` 的 `<SegToggle v-model="gran" :options="GRAN_OPTS" />`），
**不是 `el-select`**，所以读它的 `options` prop 最稳：

```ts
it('粒度选项含五档且顺序为 周-月-季-半年-年', async () => {
  const { w } = await mountAndCharts()
  const seg = w.findComponent({ name: 'SegToggle' })
  expect(seg.exists()).toBe(true)
  const opts = seg.props('options') as { value: string; label: string }[]
  expect(opts.map((o) => o.value)).toEqual(['week', 'month', 'quarter', 'half', 'year'])
  expect(opts.map((o) => o.label)).toEqual(['周', '月', '季', '半年', '年'])
})

it('切到半年粒度后 X 轴按 YYYY-Hn 分桶', async () => {
  const { w, charts } = await mountAndCharts()
  await w.findComponent({ name: 'SegToggle' }).vm.$emit('update:modelValue', 'half')
  await flushPromises()
  const opt = charts[0].props('option') as { xAxis?: { data?: string[] } }
  for (const k of opt.xAxis?.data ?? []) {
    expect(k, k).toMatch(/^\d{4}-H[12]$/)
  }
})
```
> 第二条依赖 `ChartBox` 的 prop 名为 `option` —— 该文件既有用例已用 `charts[0].vm.$emit(...)`，**先 Read 确认 `ChartBox` 的 props 再写**；若 prop 名不同就按实际的改，或退化为只断言第一条。

- [ ] **Step 7: 跑测试并 typecheck**

```bash
npm --prefix frontend run test:run -- src/lib/yitian/calendar.test.ts src/views/YitianTrendView.test.ts
npm --prefix frontend run typecheck
```
Expected: 全绿

- [ ] **Step 8: 反向验证**

把 `halfYearBuckets` 的 `<= 6 ? 1 : 2` 改成 `<= 7 ? 1 : 2`，重跑 Step 4 → **必须红**在「1-6 月为 H1、7-12 月为 H2」。确认后改回。

- [ ] **Step 9: 提交**

```bash
git add frontend/src/lib/yitian/calendar.ts frontend/src/lib/yitian/calendar.test.ts \
        frontend/src/views/YitianTrendView.vue frontend/src/views/YitianTrendView.test.ts
git commit -m "feat(yitian-trend): 时间维度补半年与年两档

沿用 calendar.ts 既有 bucketBy 模式各加一个薄封装。当前累积库跨度不足一年,
年粒度只得 1 个桶,属退化态非缺陷——累积库逐周增长会自己长出来。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 全量验证、版本号与 PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 三期一贯的回归安全网**

```bash
npm --prefix frontend run test:run -- src/lib/yitian/metrics.test.ts src/components/YitianReadinessCard.test.ts
git diff --numstat frontend/src/lib/yitian/metrics.ts | wc -l
```
Expected: 测试全绿且断言一字未改；**`metrics.ts` 改动行数为 `0`**。非 0 即违反承诺，回退。

- [ ] **Step 2: 改版本号**

`frontend/src/version.ts` 改为 `V4.5.6`，`RELEASE_DATE` 改为当天日期。

- [ ] **Step 3: 跑全量验证**

```bash
bash verify.sh
```
Expected: 全绿。已知非本期引入的噪声（可忽略但要如实记）：`tests/test_server_download.py::test_super_download_missing_script_reports` 与 `tests/test_server_budget.py::test_config_post_未登录401` 是既有 flake（backlog L-32）；`el-link` 的 `underline` 弃用警告、build 的 `>500KB` 单 chunk 与 esbuild CSS 注释警告均为既有。除此之外有红**必须修**。

- [ ] **Step 4: 最终对拍**

依次跑 Task 2 Step 6 与 Task 4 Step 9 的两个对拍脚本，确认与「实测基线」一节逐项一致。

- [ ] **Step 5: 更新 PROGRESS.md**

顶部版本区插入 V4.5.6 条目，「当前版本」改 V4.5.6、V4.5.5 降「上一版本」、V4.5.4 降「更早版本」。条目须含：
- 本期范围：新页两块 + 员工明细 5 列 + 趋势半年/年
- **实测基线**：B-5① 969 条、B-5② 478行/2810h/11种、B-5③ 覆盖率 21%、B-6 全域 17.8%（组织级 0.0%~55.7%）、5 列拆分 非面向客户 10586h/面向客户 62314h
- **纯前端、零后端改动 → 无需点「更新数据」**（与 V4.5.4/V4.5.5 不同，本期不进数据管线）
- **新增 pageKey `yitian-governance`**：已有账号不会自动获得该页，超管需逐个勾选；`'*'` 账号自动可见
- **`metrics.ts` 三期累计零改动**（饱和度口径承诺兑现）
- **倚天域功能扩充三期收官**，回指 spec

backlog 新增：
```
- [ ] **L-47（V4.5.6 遗留：年粒度当前只有 1 个桶）** 累积库跨度 2026-02-02~07-19 不足一年，
      趋势页选「年」只得 1 个桶、「半年」得 2 个桶，单点/双点「趋势」是退化态。
      累积库逐周增长会自己长出来，无需改代码；但在跨度满一年前，这两档的信息量有限。
```
同时新增人工目验清单（照 L-46 体例）。

- [ ] **Step 6: 提交并推送**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.5.6 工时治理监控页(倚天三期收官)

新页两块 + 员工明细 5 列拆分 + 趋势半年/年。纯前端,无需点「更新数据」。
metrics.ts 三期累计零改动,V4.4.5 双基准饱和度口径承诺兑现。
verify.sh 全绿。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin master
```
> 推送前 `git status` + `git diff --cached --stat` 核一眼：**不得出现 `data/`、`input/`、`release/`、`yitian*/` 下的任何文件**。

---

## 人工验证清单（AI 无浏览器，须用户执行）

1. 侧栏「倚天工时 → 工时分析」下出现第 6 个 tab「工时治理监控」，**侧栏项数仍为 23**。
2. 治理页三个异常指标卡：售前服务类未关联产品 **969 条**、客户不可归属 **2810 h / 478 条**、产品线校准覆盖率 **21%**。
3. 两张明细表：售前提示按 L4（银行服务组 185 条居首）、不可归属按工作类型三（升级加固 337 条居首）。
4. 项目管理工时概况：组织级最高 **运营商服务组 55.7%**；个人级表能排序。
5. **筛选联动**：选一个 L4 → 四块数字全部跟着变。
6. `/yitian/analytics` 员工明细表：**选列面板里出现五个新列且默认不勾选**；勾上后有值、可排序。
7. `/yitian/trend` 粒度选择器出现「半年」「年」；切「半年」得 2 个点、切「年」得 1 个点（当前数据跨度所致，非缺陷）。
8. **权限**：用 `allowedPages` 不含新页的普通管理员登录 → 看不到该 tab。
