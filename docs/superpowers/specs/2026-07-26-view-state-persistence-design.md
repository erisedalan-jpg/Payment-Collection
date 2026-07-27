# 1a-fix 页面视图状态持久化设计（V4.4.8，Z 级）

> V4.4.7 导航重组（1a）的补丁，插队处理、与 1b 并行。
> 起因是 1a 上线后的人工冒烟反馈，见 §1。

## 1. 背景：tab 化暴露了一个一直存在的缺陷

用户冒烟 V4.4.7 后反馈：「在 `/payment/board` 用某维度下钻 → 切到「回款日历」tab → 再切回来，回到默认页面，无点击下钻的持久化。」

查证结论 —— **不是 1a 引入的**：

`BoardView.vue:43-51` 中 `mode` / `dimKey` / `secondDim` / `metricKey` / `rowDims` / `colDims` / `sortKey` / `chartTypes` 八个用户选择全是组件内 `ref`，其中只有 `dimKey` 会在 setup 时从 `route.query.dim` 读一次初始值，此后用户在页面上的任何切换都不写回任何地方。而 `BoardView` 不在 `KEEPALIVE_ROUTES` 名单（那 7 个全是表格页）。所以离开页面即销毁、选择全丢 —— 1a 之前从侧栏点走再点回来同样如此。

`PageTabs` 传递 `route.query` 的实现是对的，但 query 里本来就没有东西可传。

**但这不构成免责**：tab 把两个页面呈现为「同一页的两个视图」，用户对状态保持的预期随之改变。是 tab 化把一个一直没人计较的缺陷变成了真问题。

**用户决策**：不等各页出现痛点再逐个修，**一次全面铺开**。

## 2. 方案选型：为什么不写回 URL

初次讨论时选定「写回 URL」，后经清点状态数量后由用户改选本方案。更正过程记录在此，因为它决定了设计走向：

| | 方案 | 得 | 失 |
|---|---|---|---|
| 甲 | 写回 URL query | 可分享链接、浏览器前进后退可用 | **8 个状态、其中 3 个是数组**，URL 长成 `?mode=single&dim=dept&secondDim=&metric=contractSum&rowDims=dept&colDims=&sort=projectCount&chartTypes=bar`；数组序列化易错；5 个页面各写一套 |
| **丙（采用）** | **store/localStorage 持久化**，复用倚天已验证的范式 | URL 干净；跨页 + 刷新都保持；按登录账号隔离；消除「两套状态模式并存」 | 不可分享链接 |

选丙的核心理由：本平台是**内网单机离线**系统，分享链接的场景几乎不存在，而「我上次看的视角还在」是天天发生的。且 `goBoard` 的 `?dim=` 予以保留（见 §4.3），两者不冲突。

**倚天域早已把这题做对**：`useYitianViewStore` + `localStorage` + `userScopedKey`，跨页保持、刷新保持、按用户隔离，已在生产跑了一年。本期是把这套范式推广到其余页面 —— 与 1a 发现 `YitianToolbar` 是「已验证原型」是同一回事。

## 3. 范围：8 个页面，不是 10 个

三个 tab 组共 10 页，逐页清点后实际需要改的是 8 个：

| 页面 | 需持久化的用户选择 | 说明 |
|---|---|---|
| `BoardView` | `mode` `dimKey` `secondDim` `metricKey` `rowDims` `colDims` `sortKey` `chartTypes` | 8 项，用户反馈的原始现场 |
| `InsightView` | `selectedTags` `mode` `dimKey` `secondDim` `metricKey` `rowDims` `colDims` `chartTypes` | 8 项 |
| `RiskBoardView` | `dimKey` `metricKey` `chartTypes` `levelFilter` `rowDims` `colDims` `ovMetric` | 7 项 |
| `MilestoneView` | `selectedTags` `faGran` `faYear` `nodeYear` `detailTab` | 5 项 |
| `CostDetailView` | `fKw` `selectedTags` `kpiFilter` | 3 项，**已在 keep-alive 名单但仍需改**，见下 |
| `CalendarView` | `view` | 1 项 |
| `YitianAnalyticsView` | `pageSize` | 仅页大小，`currentPage` 不持久化 |
| `YitianComplianceView` | `pageSize` | 同上 |

**不在范围内**：

- `YitianTrendView` / `YitianCustomerView` —— 组件内 `ref` 为 **0**，主状态全在 `useYitianViewStore`，没有会丢的东西
- 倚天四页的 `start` / `end` / `weekMode` / `l4s` —— 已由 `useYitianViewStore` 持久化，不动

**为什么 `CostDetailView` 已 keep-alive 仍要改**：`AppLayout.vue:30` 的 `<keep-alive :max="2">`，而 `project-analysis` 组有 **4 个 tab**。在 4 个 tab 之间轮换时 `max=2` 必然淘汰缓存，keep-alive 保不住。keep-alive 与本方案是互补而非重复：前者保住组件实例（连滚动位置一起），后者在实例被淘汰后兜底。

## 4. 技术设计

### 4.1 用 composable 而非 store

倚天用 store 是因为 **6 个页面共享同一份** `start`/`end`/`l4s`，必须靠 store 跨组件同步。而本期 8 个页面的状态**各自独立**（board 的 `dimKey` 与 insight 的 `dimKey` 无关），用 store 是杀鸡用牛刀，还要凭空多出 8 个 store 文件。

故新建 composable `frontend/src/composables/usePersistedRefs.ts`。

**关键设计：接收现有的一组 `ref`，而不要求页面把状态改写成单个对象。** 各页保持 `const mode = ref('single')` 原样，只在下方增加一行调用即可 —— 改动量最小，且不触碰任何计算逻辑。

```ts
import { watch, type Ref } from 'vue'
import { userScopedKey } from '@/lib/userScopedKey'

/** 把一组页面视图 ref 按登录账号持久化到 localStorage(V2.8.3 范式,与 useYitianViewStore 同源)。
 *  须在组件 setup 内调用(userScopedKey 需要 pinia active)。
 *  只收「用户选择」类状态 —— modal 开关/DOM 引用/分页页码绝不传进来,理由见 §4.2。 */
export function usePersistedRefs(baseKey: string, refs: Record<string, Ref<any>>): void {
  let hydrated = false
  try {
    const raw = localStorage.getItem(userScopedKey(baseKey))
    if (raw) {
      const p = JSON.parse(raw) as Record<string, unknown>
      for (const [k, r] of Object.entries(refs)) {
        const v = p[k]
        if (v === undefined) continue
        // 类型护栏:存档结构与当前代码不符时(改过默认值/换过类型)跳过该键,不污染运行时
        if (Array.isArray(r.value) !== Array.isArray(v)) continue
        if (!Array.isArray(v) && typeof r.value !== typeof v && r.value !== null) continue
        r.value = v
      }
    }
  } catch {
    /* 坏 JSON / 隐私模式:忽略,用默认值 */
  }
  hydrated = true

  watch(Object.values(refs), () => {
    if (!hydrated) return
    try {
      const out: Record<string, unknown> = {}
      for (const [k, r] of Object.entries(refs)) out[k] = r.value
      localStorage.setItem(userScopedKey(baseKey), JSON.stringify(out))
    } catch {
      /* 配额满:静默降级为不持久化 */
    }
  }, { deep: true })
}
```

沿用 `useYitianViewStore` 的三条既有做法：`hydrated` 标志防止未水合时把默认值糊掉存档、`try/catch` 静默降级、`deep: true` 监听数组变更。

新增一条它没有的**类型护栏**：存档里的值与当前 `ref` 类型不符时跳过该键。因为本期 8 个页面各存一份结构不同的档，未来任何一次「改默认值 / 换类型 / 删状态」都会让旧存档与新代码错位；没有护栏就会把 `string` 灌进本该是数组的 `ref`，页面直接崩。

### 4.2 三类状态绝不持久化

**① modal 开关与其载荷**（`drillOpen` / `drillTitle` / `drillGroup` / `drillRows` / `statusOpen` / `statusTitle` / `statusRows`）

持久化 `drillOpen: true` 会导致**下次进页面直接弹出一个空 modal** —— 载荷 `drillGroup` 是运行时算出的对象，存档里即使一并存了，反序列化后也与当前数据对不上。本期一律不收。

**② DOM 引用**（`CostDetailView` 的 `detailCardRef`）

`HTMLElement` 无法序列化，`JSON.stringify` 会得到 `{}` 或抛错。

**③ 分页页码 `currentPage`**

`pageSize`（每页显示多少条）是用户偏好，该记；`currentPage`（当前第几页）是浏览位置，不该记 —— 「回来还停在第 5 页」不符合预期，且数据量变化后页码可能越界。倚天两页只收 `pageSize`。

### 4.3 优先级：默认值 → localStorage → URL

`goBoard(router, dim)` 会带 `?dim=xxx` 跳转，这是**显式的跳转意图**，必须压过「上次的选择」。

`BoardView` 改造后的顺序：

```ts
const dimKey = ref('dept')                                  // ① 默认值
usePersistedRefs('view_board', { mode, dimKey, secondDim, metricKey, rowDims, colDims, sortKey, chartTypes })
                                                            // ② localStorage 覆盖默认值
const rawDim = typeof route.query.dim === 'string' ? route.query.dim : ''
const aliasDim = rawDim === 'orgL4' ? 'dept' : rawDim        // 既有别名映射,保留
if (aliasDim && DIMENSIONS.some((d) => d.key === aliasDim)) dimKey.value = aliasDim   // ③ URL 最高
```

三层顺序在代码里就是自上而下的三行，无需额外机制。既有的 `orgL4 → dept` 别名映射原样保留。

**其余 7 个页面没有 URL 入参**，只有 ① ② 两层。

### 4.4 localStorage key 命名

`view_<页面标识>`，经 `userScopedKey` 加账号前缀：

```
view_board · view_insight · view_risk · view_milestone
view_costdetail · view_calendar · view_yitian_analytics · view_yitian_compliance
```

与倚天既有的 `yitian_view` 不冲突（那是域级共享状态，本期不动）。

**不提供 `reset()`，登出时也不清存档。** `useYitianViewStore` 有 `reset()` 是因为它是常驻 store，换账号时内存里的旧值会残留；而 composable 随组件卸载即销毁，不存在内存残留。存档本身已由 `userScopedKey` 按账号隔离，换号只会读到自己的那份，留着下次登录还能用。

## 5. 测试

**`usePersistedRefs` 单测**（新建 `composables/usePersistedRefs.test.ts`）：

1. 写入后读回：改 ref → localStorage 有值 → 新实例 hydrate 后 ref 恢复
2. **按账号隔离**：账号 A 写入的存档，账号 B hydrate 拿不到
3. 坏 JSON 不崩，回落默认值
4. **类型护栏**：存档里 `dimKey` 是数组而当前 ref 是字符串 → 跳过该键、其余键正常恢复
5. `localStorage.setItem` 抛错（配额满）时不冒泡
6. 数组类状态（`rowDims`）变更能触发持久化（验证 `deep: true` 生效）

**页面级测试**（每页一条，共 8 条）：模拟「设置状态 → 卸载 → 重新挂载」，断言状态恢复。

**反向验证（必做）**：临时把某页的 `usePersistedRefs` 调用注释掉，对应页面级测试必须变红。否则该测试是空转 —— 本仓已有多次「测试全绿但功能从未接线」的先例（V4.0.5 的 `record_sent`、V4.4.4 的恒真断言）。

**BoardView 专项**：断言 URL `?dim=` 压过 localStorage 存档（§4.3 的三层顺序）。

**回归安全网**：`drillOpen` 等 modal 状态**不得**出现在任何 `usePersistedRefs` 调用的参数里 —— 加一条扫描测试，遍历 8 个 view 源码，若发现 `usePersistedRefs` 的参数对象里含 `drill`/`Open`/`Ref` 字样的键即失败。这条防的是今后有人图省事把整组 ref 一股脑传进去。

## 6. 验收

- `bash verify.sh` 全绿
- 人工冒烟（本期的核心验收，自动化测试盖不到）：
  1. `/payment/board` 选维度「客户」+ 图表类型「饼图」→ 切到「回款日历」→ 切回 → **维度与图表类型仍在**
  2. 同上，按 F5 刷新 → 状态仍在
  3. 从 `/payment` 总览点某维度下钻进 board（走 `goBoard`）→ **URL 的 dim 生效**，而非上次存档的维度
  4. 换个账号登录 → 看到的是自己的存档，不是前一个账号的
  5. `/insight` 的四个 tab 来回切 → 各自状态互不干扰（验证 8 个 key 未串档）

## 7. 升级

纯前端，仅换 `dist`，无需重启后端、无需点「更新数据」、无新增 `pageKey`。

首次升级后各页仍是默认状态（无存档），使用一次后开始生效。旧版本无 `view_*` 键，不存在迁移问题。
