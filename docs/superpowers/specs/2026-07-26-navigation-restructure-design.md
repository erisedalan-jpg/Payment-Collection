# 1a 导航重组设计（V4.4.7，Z 级）

> 本期是「整体前端优化」四期计划的第一期。设计前置由 `/grill-me` 逼问完成，共识已达成。
> 后续期次见文末「分期与本期边界」。

## 1. 背景：三条结构性诊断

用户诉求原话：「系统…新开发了多个页面、功能，也融合了多个其他小系统、小工具的功能。目前整体上不像一个整体系统，而是比较割裂…所有的页面均是堆砌…页面间逻辑性仅有我个人判断，无整体统一设计。」

逼问过程中查证，这不是主观感受，有三条可验证的结构证据：

**诊断一 —— 7 个分组混用 4 种分类轴**

| 分组 | 分类轴 |
|---|---|
| 项目主域 / 回款 / 倚天工时 | 数据域 |
| 项目分析中心 | 功能类型 |
| 重点跟进 | 工作方式 |
| 工具 / 系统管理 | 性质（权限） |

同一层级不存在单一组织原则 → 页面位置**不可推导**，只能靠记。这就是「逻辑性仅有个人判断」的根源。

**诊断二 —— 同一主题被切碎到多个分组**

| 主题 | 散落位置 |
|---|---|
| 回款（6 页） | 项目分析中心（多维分析、日历）／重点跟进（回款重点跟进）／回款（总览、项目、节点） |
| 商机（3 页） | 项目主域（清单）／项目分析中心（看板）／重点跟进（重点商机跟进） |
| 风险（2 页） | 项目分析中心（风险看板）／重点跟进（风险跟进） |

**诊断三 —— 路由结构与导航结构是两套，靠特判缝合**

`AppSidebar.vue:20-28` 有 8 行 `if-else` 专门把路由掰回导航分组：`/projects/key` 特判回 keyfollowup、`/opportunities/board` 特判回 analysis、`/insight/board` 名为 insight 实为回款。**每加一个页面就多一行特判** —— 这是「堆砌」最硬的技术表现。

## 2. 目标与非目标

**目标**

1. 侧栏按**业务对象**重组，组内顺序恒为「总览 → 明细 → 分析」，使页面位置可推导
2. 解散「项目分析中心」，10 个低频分析页收进页内 tab，侧栏项 **31 → 24**
3. 消除 `AppSidebar` 的 8 行特判，路由前缀与导航分组对齐
4. **权限粒度一格不降**：30 个 `pageKey` 一个不增不减，`pageScopes` 逐页数据范围完全不动

**非目标（本期明确不做）**

- 不动 34 个业务页面组件（见 §4.3，本期靠路由 meta 驱动）；唯一例外是配置页 `AdminView.vue`，仅换派生源、不改 UI 结构
- 不动视觉令牌与 `theme.css`（属第二期「视觉约束整体重写」）
- 不动筛选逻辑、不删 `hideFilter`、不拆全局单例 `filterStore`（属第三期）
- 不新增/删除任何业务页面与数据口径

## 3. 新导航结构

用户钦定保留三组不动：**重点跟进**（工作方式轴，普通管理员日常集中反馈处理）、**工具**、**系统管理**（后两者是超管权限边界）。其余 21 页由本设计重组。

重组依据：现有页面里本就藏着一条规则 —— 每个业务对象都自带「总览 / 明细 / 分析」三层，只是被「项目分析中心」横切开了。

| 分组 | 侧栏一级项（24） | 页内 tab（10） |
|---|---|---|
| **项目** | 项目总览 · 在建项目 · 已关闭项目 · 项目动态 · **项目分析** | 多维分析／里程碑管理／成本分析／风险看板 |
| **回款** | 回款总览 · 回款项目 · 回款节点 · **回款分析** | 回款多维分析／回款日历 |
| **商机** | 商机清单 · 商机看板 | — |
| **工时** | 工时总览 · 工时明细 · **工时分析** | 合规检查／统计分析／趋势分析／客户支持分析 |
| **重点跟进** | 重点项目进展 · 重点商机跟进 · 临时重点跟进 · 风险跟进 · 回款重点跟进 | —（钦定不动） |
| **工具** | 数据管理 · 数据治理 · 概算工具 · 关于产品 | —（钦定不动） |
| **系统管理** | 账号管理 | —（钦定不动） |

粗体项是 tab 容器入口，指向该组第一个**当前账号可见**的 tab。

**收益不在 31→24 这个数字，在于规则可推导**：任一页面的位置 =「它属于哪个业务对象」+「它是总览/明细/分析中的哪一层」，不再需要个人判断。

## 4. 技术设计

### 4.1 路由策略：路径基本不变，tab 是渲染层

有两条可选路径：把 tab 做成父子路由（`/insight/:tab?`），或保持现有扁平路由、tab 仅作渲染层。**本设计选后者**。

理由：现有 10 个分析页的路径（`/insight/milestone`、`/yitian/compliance` 等）**本来就已经是兄弟路径**，天然构成 tab 组。保持不变意味着：

- 零 redirect（跨域迁移的 2 个除外）
- 每个 tab 仍有独立 URL，可收藏、可直达、可深链
- 路由表改动最小，29 个断言路由的测试文件里**只有涉及那 2 个迁移路径的需要改**

**唯一的路径变更是回款两页迁回回款域：**

| 原路径 | 新路径 | 说明 |
|---|---|---|
| `/insight/board` | `/payment/board` | 回款多维分析 |
| `/insight/calendar` | `/payment/calendar` | 回款日历 |

这两页在 V1.16.0 曾从 payment 迁入 insight（因当时新建了「项目分析中心」组）。本期解散该组，故迁回其业务对象所属域 —— 是同一条逻辑的贯彻，不是反复横跳。

**redirect 清单（改动项）：**

```
新增：/insight/board          → /payment/board        （保留 query）
新增：/insight/calendar       → /payment/calendar     （保留 query）
反转：/payment/board  原为 → /insight/board，删除该 redirect，改为真实路由
修改：/calendar       原 → /insight/calendar，改为 → /payment/calendar
修改：/panalysis/:tab? 与 /analysis/:tab 内的 board 分支，目标由 /insight/board 改为 /payment/board
```

其余历史 redirect（`/board`、`/ledger`、`/payment/plan`、`/payment/risk`）目标不含本期变更路径，保持原样。

### 4.2 `nav.ts` 重构：侧栏项与 tab 项分离，但授权选项合并派生

**承重点 ①（违反则 10 个页面静默失去授权与数据范围配置能力）**

从 6 个侧栏 LINKS 常量派生的消费方共有**四处**，分析页收进 tab、不再出现在侧栏 LINKS 后，每一处都会静默失效（不报错、测试照绿）：

| 消费方 | 用途 | 失效后果 |
|---|---|---|
| `lib/pageAccess.ts:19` `PAGE_OPTIONS` | 账号「可访问页面」下拉唯一来源 | 超管无法为 10 个 tab 页授权 |
| `stores/auth.ts:78` `firstAllowedPath()` | 登录后落地页 | 只有 tab 页权限的账号登录后跳向错误路径 |
| `views/AdminView.vue:21-28` `NAV_GROUPS` | 组级选页 UI 分组 | 10 个 tab 页在配置界面里整个消失 |
| `views/AdminView.vue:30-36` `OVERRIDE_TARGETS` | 逐页数据范围覆盖下拉 | **V4.3.1 的 `pageScopes` 对这 10 页失效** |

解法：`nav.ts` 显式区分两类，并导出唯一的展开函数 `sectionPageLinks(section)`（一级 `NavLink` + 容器入口展开后的 tab 页），上述四处**全部**改用它派生。`ALL_PAGE_LINKS = NAV_SECTIONS.flatMap(sectionPageLinks)`。

```ts
export interface NavLink { label: string; to: string; key: PageKey }

// 容器入口：独立类型。既无固定 to 也无自己的 pageKey —— 两者都按权限动态求值（见 §4.4）
export interface NavTabEntry { label: string; group: string }

// 侧栏一级项（渲染侧栏用），元素类型为 NavLink | NavTabEntry
export const PROJECT_LINKS      // 项目总览/在建/已关闭/动态 + {label:'项目分析', group:'project-analysis'}
export const PAYMENT_LINKS      // 回款总览/项目/节点 + {label:'回款分析', group:'payment-analysis'}
export const OPPORTUNITY_LINKS  // 新增分组：商机清单/商机看板
export const YITIAN_LINKS       // 工时总览/明细 + {label:'工时分析', group:'yitian-analysis'}
export const KEY_FOLLOWUP_LINKS // 不变
export const TOOL_LINKS         // 不变

// tab 组（不进侧栏，但必须可授权）
export const TAB_GROUPS: Record<string, NavLink[]> = {
  'project-analysis': [多维分析, 里程碑管理, 成本分析, 风险看板],
  'payment-analysis': [回款多维分析, 回款日历],
  'yitian-analysis':  [合规检查, 统计分析, 趋势分析, 客户支持分析],
}
```

`PAGE_OPTIONS` 改为 `[全部页面, ...侧栏 LINKS 中的 NavLink, ...TAB_GROUPS 全部 tab]` 派生。

**容器入口之所以单列一个类型，是为了让「不重复」成为结构保证而非补丁**：若容器入口也是 `NavLink`、带自己的 `key`，它必然与所属 tab 组的某一项撞 `pageKey`（「项目分析」入口和「多维分析」tab 指向同一页），派生时就得额外去重。`NavTabEntry` 不带 `key`，天然不进 `PAGE_OPTIONS`，无需去重逻辑。

**tab 标签与页签标题相互独立**：`router meta.title` 一律保持现值不变（它还被浏览器页签、面包屑等消费），tab 显示文案由 `TAB_GROUPS` 单独定义。例如 `/insight` 的 `meta.title` 仍是「项目分析」，而它在 tab 条里显示为「多维分析」。二者不同步、不互相派生。

**契约测试（必须写）**：`PAGE_OPTIONS` 覆盖的 `pageKey` 集合，必须与 `PageKey` 联合类型的全部 30 个成员**严格相等**。这条测试是承重点 ① 的安全网 —— 今后任何人把页面移入/移出 tab，漏改 `PAGE_OPTIONS` 都会立刻变红。

`lib/pageAccess.ts:16` 的注释写「27 个 PageKey」，实际是 30 个，注释已陈旧，本期顺手订正。

### 4.3 `PageTabs` 组件：由路由 meta 驱动，业务页面零改动

**承重点 ③**

> 订正：本节初稿称「35 个 view 零改动」，实测有误 —— `views/AdminView.vue` 消费 6 个侧栏 LINKS 常量（见 §4.2 承重点 ① 表格后两行），**必须改**。准确表述是：**34 个业务页面零改动，仅 AdminView 一个配置页需同步派生源**。

tab 条**不由页面组件自己渲染**，而是在 `AppLayout` 中根据路由 meta 统一渲染：

```ts
// router meta 新增可选字段
meta: { title: '里程碑管理', pageKey: 'insight-milestone', tabGroup: 'project-analysis' }
```

```vue
<!-- AppLayout.vue，插在 FilterBar 之上 -->
<PageTabs v-if="route.meta.tabGroup" :group="route.meta.tabGroup as string" />
<FilterBar v-if="showFilter" />
<router-view ... />
```

这样 **34 个业务页面（`views/*.vue`）零改动**，唯一需要动的 view 是配置页 `AdminView.vue`（且只改派生源，不改 UI 结构）。风险因此集中在 `nav.ts`、路由表、`AppSidebar`、`AppLayout`、`AdminView` 五处，故障定位容易。

`PageTabs.vue` 职责（新建，预计 40 行内）：
- 入参 `group: string`，从 `TAB_GROUPS[group]` 取 tab 列表
- 按 `auth.canAccess(tab.key)` 过滤（超管全见）
- 当前路由 `path === tab.to` 者高亮
- 点击 `router.push(tab.to)`，**保留当前 query**（下钻参数如 `dL4` 不能因切 tab 丢失）
- 过滤后仅剩 1 个 tab 时**不渲染** tab 条（单 tab 无切换意义，避免视觉噪音）

样式复用现有令牌与 `SegToggle.vue`（29 行）的抬起 chip 形态：`--card` 底 + `--accent` 字 + `--shadow-1`，选中态 `--selected-tint`。**不引入新令牌**（新令牌属第二期）。

tab 切换本质是路由切换，走现有 `keep-alive` 机制（`AppLayout:30`，`max=2`），切回来保持状态 —— 这是期望行为，无需特殊处理。

### 4.4 侧栏：tab 容器入口的可见性与归属

**承重点 ②**

tab 容器入口（「项目分析」「回款分析」「工时分析」）的显示条件与 `to` 目标都是**动态的**：

- **显示条件**：该组至少有一个 tab 可访问。全组不可访问则整个入口不渲染
- **`to` 目标**：指向该组第一个**当前账号可见**的 tab，而非硬编码首项

反例：某账号只被授予 `insight-risk`（风险看板）。若入口硬编码指向 `/insight`（多维分析），该账号点进去会被路由守卫弹回 —— 入口可见却点不动。故 `to` 必须按权限动态求值。

**消除 8 行特判**：`activeSectionKey` 改为从 nav 常量反查 —— 遍历「侧栏 LINKS + 其 tab 组」，命中当前路径（精确相等或以 `to + '/'` 开头）者即为所属 section。今后新增页面只需登记进 nav 常量，无需再加特判分支。

### 4.5 权限模型：不改模型，只改归集方式

`pageKey` 集合、`canAccess` 逻辑、`allowedPages` 存储格式、`pageScopes` 逐页数据范围 —— **全部不变**。本期唯一的权限相关改动是 `PAGE_OPTIONS` 的派生来源（§4.2）与 tab 的可见性过滤（§4.3）。

V4.3.1 建立的逐页授权与逐页数据范围能力完整保留：账号可以只被授予「里程碑管理」而不给「成本分析」，此时「项目分析」入口可见、但 tab 条只显示里程碑管理一项（且按 §4.3 单 tab 不渲染 tab 条）。

## 5. 测试影响与验收

**必然变红、需同步更新的既有测试**

| 位置 | 现状 | 改为 |
|---|---|---|
| `AppSidebar.test.ts:95` | `expect(findAll('.nav-sub').length).toBe(31)` | `toBe(24)`，并更新其上方的分组计数注释 |
| 断言 `/insight/board`、`/insight/calendar` 的测试 | 旧路径 | 新路径 `/payment/board`、`/payment/calendar` |

29 个断言路由的测试文件中，只有涉及上述两条路径的需要改动；其余因 §4.1 路径不变而不受影响。

**新增测试**

1. **`PAGE_OPTIONS` 契约**：其 `pageKey` 集合与 `PageKey` 全部 30 个成员严格相等（承重点 ① 安全网）
2. **tab 权限过滤**：账号仅授予组内部分 tab 时，tab 条只渲染被授权项
3. **容器入口动态 `to`**：账号仅授予组内非首项时，入口 `to` 指向该项而非硬编码首项
4. **单 tab 不渲染**：过滤后仅剩 1 项时 tab 条不出现
5. **切 tab 保留 query**：带 `dL4` 等下钻参数切换 tab，query 不丢
6. **section 归属反查**：10 个 tab 页与 24 个侧栏页各自解析到正确 section（替代原 8 行特判的回归网）
7. **redirect**：`/insight/board`、`/insight/calendar`、`/calendar`、`/panalysis/board`、`/analysis/board` 五条各自落到 `/payment/board` 或 `/payment/calendar`，且 query 保留

**验收标准**

- `bash verify.sh` 全绿（后端零改动，前端 typecheck / vitest / build）
- 侧栏一级项恰为 24
- 超管账号在「账号管理」页能看到全部 30 个可授权页面（含 10 个 tab 页）
- 真机冒烟：以受限账号登录，确认 tab 条按权限过滤、入口不出现死链

## 6. 分期与本期边界

| 期 | 内容 | 版本 | 状态 |
|---|---|---|---|
| **1a** | **本期**：导航重组 | V4.4.7（Z） | 本 spec |
| 1b | 统一页头 `PageHeader` + 35 页接入 | Z | 待开 |
| 2 | 视觉约束整体推翻重写 | Z | 待开 |
| 3+ | 按域迁筛选（**回款域先**，拆全局单例 `filterStore`、删 26 处 `hideFilter` 与 `showFilter`），一域一版 | Z | 待开 |

第 2 期刻意卡在架构定型之后、逐页改造之前 —— 放最后会导致三期迁完的页面全部返工，放最前则无依据可循。

版本级别由用户钦定全部 Z 级（判据：功能不变、仅作优化）。

## 7. 升级注意事项

本期纯前端，仅换 `dist`，无需重启后端、无需点「更新数据」、无新增 `pageKey`。

**升级手册须在最显眼处写明**：回款多维分析与回款日历的访问路径已变更（旧链接自动跳转，但浏览器收藏栏的显示地址会变）。侧栏结构调整后，原「项目分析中心」下的页面分别移入「项目」与「回款」分组，10 个分析页改为在对应分组的「…分析」入口内以 tab 切换。使用者可能因找不到熟悉的入口而误判为功能丢失，须提前告知。
