# 概算工具 /budget 设计（V3.1.0）

> 把独立单体 HTML 工具 `CostBudgetEstimate.html`（3729 行）**完全重构**后并入项目管理平台，落成 `/budget` 页面。
> 重构 ≠ 移植：不复用原工具任何一行代码，不保留其 CDN 依赖与 localStorage，费率从硬编码提升为超管可配，并修正 8 处已确认缺陷。
> 原文件仅作为**领域知识与默认数据的来源**被读取，不进入产物。

---

## 1. 背景与定位

原工具是一份发给个人、双击打开的单体 HTML：销售/交付人员填入项目信息、产品清单、项目经理与服务人天、差旅天数，工具算出人工成本、直接成本、成本比例、CRM 审批建议和销售下单物料清单，最后导出 Excel 拿去 CRM 上单。存档写在浏览器 `localStorage`。

搬进平台后有三点根本变化：

1. **这是平台第一个「录入型」页面。** 其余页面都是「导入数据 → 只读分析」，`/budget` 是「人工填表 → 实时计算 → 存档/导出」。因此它**不进数据管线**（不产出 `analysis_data.json`、升级后**无需点「更新数据」**），也**不挂 L4 组织**（一份报价没有组织归属）。
2. **存档必须上服务端。** `localStorage` 在单机 HTML 里够用，在多人服务器上意味着换台电脑看不到、清缓存全丢、同事之间无法共享、无法审计。
3. **费率必须可配。** 原工具把汇率、人天单价、住宿差补标准、销售物料单价、成本比例阈值、产品/服务目录全部写死在代码里（多处还在 HTML 和 JS 各写一遍，两份真相源）。价格是会变的，且后继管理员根本无从得知这些数字从哪来。这正是 V3.0.0 倚天工时域确立的原则：**凡"影响关键结果却埋在代码里"的口径，一律提升为可见可配。**

### 导航位置与权限

- 侧栏「工具选项」分区：数据管理 → 数据治理 → **概算工具** → 关于产品
- 路由 `/budget`，新增 pageKey **`budget`**
- 未授权 `budget` 的账号：侧栏不显示该项，路由 guard 拦截
- **无 L4 数据隔离**（报价无组织属性），改为**按账号隔离**：普通管理员只见自己创建的存档；超管（账号记录上的 `isSuper` 标志，当前为 admin / zhangyingzhe / wangxutong）可切换查看全部账号的存档

> ⚠ 新增页面分区必须同时改三处：`nav.ts` + `pageAccess.PAGE_OPTIONS` + `auth.firstAllowedPath()` 的 nav 全集。漏第三处会让只授权该页的账号登录后找不到任何有权链接 → 弹回 `/login` → 死循环（V3.0.0 踩过，已有回归测试锁死此类）。本次 `/budget` 挂在既有的 `TOOL_LINKS` 下，`firstAllowedPath` 已覆盖该数组，但仍须确认。

---

## 2. 费率快照 —— 原工具没有、我们必须有的概念

原工具费率写死，所以"同一份报价什么时候打开都是同一个数"是白捡的保证。**一旦费率可配，这个保证就消失了**：明年调了人天单价，去年那份已经拿去 CRM 上过单的报价，重新打开会算出另一个数。

因此**每条存档记录冻结当时的费率快照**：

```
EstimateRecord = {
  id, account, quoteName, createdAt, updatedAt,
  data:         <表单输入原样>,
  rateSnapshot: <保存那一刻的完整 budget_config>,
  summary:      <当时算出的 totalCost / salesAmount / costRatio / ratioStatus>
}
```

打开旧存档时**用它自己的 `rateSnapshot` 计算**，并在页面顶部提示：

> 本报价基于 2026-07-13 的费率表；当前费率表已更新。〔按最新费率重算〕

点「按最新费率重算」才切换到当前配置（切换后须重新保存才落盘）。报价是对外正式产物，必须可复现。

---

## 3. 架构

```
超管 → 费率与目录配置抽屉 ──POST /api/budget/config──→ data/budget_config.json
                                                              │ GET
                                                              ▼
使用者 → /budget 填表 ──→ stores/budget (Pinia, reactive)
                              │
                              ├──→ lib/budget/calc.ts        (纯函数,实时重算)
                              ├──→ lib/budget/salesOrder.ts  (成本→物料数量逆运算)
                              ├──→ lib/budget/crmText.ts     (CRM 审批建议生成)
                              │
                              ├── 保存 ──POST /api/budget/estimates──→ data/budget_estimates.json
                              │            {输入 + 费率快照 + 计算摘要}
                              └── 导出 ──→ lib/budget/exportEstimate.ts ──→ 8-sheet xlsx(浏览器直接下载)
```

**计算全部在前端纯函数层**（每敲一个数字都要实时重算，往返服务端不现实），后端只负责存取与鉴权。这与平台既有的 `lib/` = "纯计算口径层、有 vitest 覆盖"的定位一致。

### 后端新增（2 个模块，无数据管线）

| 文件 | 职责 |
|---|---|
| `budget_config.py` | 费率与目录配置。`data/budget_config.json`。范式**照抄 `yitian_settings.py`**：`default_config()` / `validate_config()` / `load_config()` / `save_config()`（先写 `.tmp` 再 `os.replace` 原子写；文件缺失或损坏 → 静默回落默认，降级不阻断） |
| `budget_store.py` | 报价存档 CRUD。`data/budget_estimates.json`。纯函数 + 原子写：`load_store` / `save_store` / `upsert_estimate` / `delete_estimate` / `list_estimates(account, is_super, all_accounts)` |

### 端点（`server.py`）

| 方法 路径 | 鉴权 |
|---|---|
| `GET /api/budget/config` | 登录 + `budget` 页面权限 |
| `POST /api/budget/config` | **仅超管**（校验写在 handler 内） |
| `GET /api/budget/estimates` | 登录 + `budget`；默认只返回本账号的；超管可带 `?all=1` 取全部 |
| `POST /api/budget/estimates` | 登录 + `budget`；带 `id` → 覆盖（**后端校验 owner 或 isSuper**），无 `id` → 新建并返回 id |
| `POST /api/budget/estimates/delete` | 登录 + `budget`；**后端校验 owner 或 isSuper** |

> ⚠ **`_SUPER_ONLY_PATHS` 按 path 匹配、不分 method。** `/api/budget/config` 同一 path 上 GET 全体、POST 超管，**绝不能入闸**，否则普通管理员连读配置都会 403、页面直接白板。超管校验必须写在 handler 内。（V2.10.0 / V3.0.0 两次踩过同一条）

越权保护是**服务端强制**的，不是前端隐藏：普通管理员 POST 一个别人的 `id` → 403。

配置变更与存档删除进 `audit.py` 埋点（目标/详情富化，与 V2.8.1 一致）。

### 前端新增

| 文件 | 职责 |
|---|---|
| `lib/budget/types.ts` | 配置与表单的 TS 类型（前端唯一类型来源；本域不进 `schema.py`，因为不入 `analysis_data.json`） |
| `lib/budget/calc.ts` | 纯计算：各段人天汇总 → 人工成本；直接成本；总成本；销售下单金额；**成本比例与三态判定** |
| `lib/budget/salesOrder.ts` | 销售下单建议：成本 → 物料数量的逆运算（含差旅并单） |
| `lib/budget/crmText.ts` | CRM 审批建议自动生成 |
| `lib/budget/exportEstimate.ts` | 8-sheet xlsx（复用既有 `lib/exportXlsx.ts` 的 `exportSheets()`；**不引入 exceljs**） |
| `lib/budgetApi.ts` | `/api/budget/*` 封装 |
| `stores/budget.ts` | 表单 state + 脏标记 + 当前存档 id + 生效费率（当前配置 or 快照） |
| `stores/budgetConfig.ts` | 费率配置的读写 |
| `views/BudgetView.vue` | 单页 |
| `components/budget/*.vue` | BasicInfoCard / RateReferenceCard（只读费率速查，由配置渲染）/ ProductSection / PmSection / ServiceSection / DirectCostSection / RatioCard / CrmCard / SummaryCard / SalesOrderCard / EstimateDrawer（存档抽屉）/ RateConfigDrawer（费率配置抽屉，超管可见） |

### 页面结构

`/budget` 单页，自上而下：项目基本信息 → 费率速查（可折叠，只读）→ 产品实施 → 项目经理（可折叠）→ 其他服务 → 直接成本 → 成本比例 → CRM 审批建议 → 费用汇总 → 销售下单建议。

页面右上角两个按钮：**〔存档〕**（抽屉：列出历史报价，可搜索 / 恢复 / 删除；超管多一个「查看全部账号」开关）、**〔费率与目录配置〕**（仅超管可见；抽屉内编辑全部费率与目录，改完立即生效）。

底部操作区：**保存** / **另存为新报价** / **导出 Excel**。

> **费率配置为什么放在 `/budget` 而不是 `/data`：** 19 个产品 × 4 字段 + 8 项服务 + 4 条物料 + 十余个价格，塞进 `/data` 一张卡片会挤爆；且就近编辑能改完立刻在同一页看到结果。`/data` 保持为"数据源上传与运维"的定位。

---

## 4. 配置数据模型（`data/budget_config.json`）

默认值 = 原工具现值（开箱即用，与历史报价口径一致）。**所有数值均可由超管在页面上修改。**

```jsonc
{
  "version": 1,
  "rates": {                       // 人天成本单价（内部成本）
    "city1": { "pm": 2000, "tech": 1300, "out": 1000 },   // 一类城市
    "city2": { "pm": 1500, "tech": 1000, "out": 800  }    // 二类城市
  },
  "salesPrices": {                 // 销售物料单价（对外报价）——与毛利率无关，见 §6 修正 2
    "pm": 2400, "pm2ndc": 1800, "eng1stc": 1500, "eng2ndc": 1200
  },
  "materials": [                   // 销售下单物料编号（4 条，顺序即表格行序）
    { "key": "pm",      "code": "JY-CPJF-OTHER-PM",            "name": "其他交付服务 – 一线城市人天服务 - 项目经理" },
    { "key": "pm2ndc",  "code": "JY-CPJF-OTHER-PM-2NDC-PISN",  "name": "其他交付服务 - 二线城市人天服务 - 项目经理" },
    { "key": "eng1stc", "code": "JY-CPJF-AZ-OTHER-1STC-ENG",   "name": "其他交付服务 - 一线城市人天服务 - 工程师" },
    { "key": "eng2ndc", "code": "JY-CPJF-AZ-OTHER-2NDC-ENG",   "name": "其他交付服务 - 二线城市人天服务 - 工程师" }
  ],
  "hotel": {                       // 住宿标准（元/晚；hk 为美金/晚）
    "type1": 450, "capital": 350, "other": 300, "hk": 125,
    "outType1": 300, "outType2": 230
  },
  "allowance": { "dom": 150, "intl": 75 },   // 差补：境内 元/天；境外 美金/天
  "fx": 6.8,                                  // 美元汇率
  "margins": [                                // 毛利率档位
    { "value": 0.13, "label": "13%（含产品）" },
    { "value": 0.06, "label": "6%（纯服务）"  }
  ],
  "ratio": { "min": 3, "max": 15 },           // 成本比例正常区间（闭区间），单位 %
  "products": [ /* 19 条，见下 */ ],
  "pmPhases": [ /* 5 条，见下 */ ],
  "services": [ /* 8 条，见下 */ ]
}
```

> **住宿的城市分类（一线/省会/其他/港澳）与人工成本的城市分类（一类/二类）是两套互不相干的口径**，外包差旅又用回一类/二类。这是原工具的既定事实，重构后必须建**两个独立枚举**，不要合并。

### 产品目录（19 条）

`{ id, name, coefficient, stdDays, stdDesc, nonstdDesc }`。`stdDesc` / `nonstdDesc` 是 ℹ️ 提示用的长中文段落，**不参与计算**。

| id | name | coefficient | stdDays |
|---|---|---|---|
| 1.1 | 防火墙 | 0.8 | 1.5 |
| 1.2 | 天擎V10 | 0.6 | 2.0 |
| 1.3 | 天眼 | 0.8 | 1.0 |
| 1.4 | NGSOC | 0.6 | 2.0 |
| 1.5 | 入侵防御系统（IPS） | 0.8 | 1.5 |
| 1.6 | 日志审计（LAS） | 0.8 | 1.5 |
| 1.7 | 漏洞扫描 | 0.8 | 1.0 |
| 1.8 | 代码审计 | 0.8 | 1.0 |
| 1.9 | 准入 | 0.8 | 1.5 |
| 1.10 | 堡垒机 | 0.8 | 1.5 |
| 1.11 | WAF | 0.8 | 1.5 |
| 1.12 | 数据库审计与防护系统（DAS） | 0.8 | 1.2 |
| 1.13 | SSL VPN | 0.8 | 1.6 |
| 1.14 | 入侵检测系统（IDS） | 0.8 | 1.0 |
| 1.15 | 云安全管理平台CSMP | 0.6 | 6.375 |
| 1.16 | 椒图 | 0.6 | 1.6 |
| 1.17 | 网闸 | 0.8 | 1.4 |
| 1.18 | 零信任 | 0.8 | 3.0 |
| 1.19 | 上网行为管理 | 0.8 | 1.5 |

`stdDesc` / `nonstdDesc` 两段长文本**从 `CostBudgetEstimate.html` 行 1428-1447 原样抄录**（含 `\n` 换行），不要改写、不要缩写。

另有一个**伪产品「其他（自定义产品）」**（id `other`）：不在目录中，可重复添加多条，每条自带产品名 + 工作内容 + 4 格人天。

### 项目经理阶段（5 条）

`{ name, content }`。`content` 是预填进该阶段工作内容 textarea 的模板文本。**阶段只是分组标签，没有任何系数或工时基线** —— 人天全部手填。

1. 项目启动阶段
2. 项目规划阶段
3. 项目执行阶段
4. 项目收尾阶段
5. 其他工作

`content` 五段模板文本**从 `CostBudgetEstimate.html` 行 1450-1456 原样抄录**。

### 其他服务（8 条）

`{ name, desc, isOther? }`。同一服务可重复添加多条。

变更协调服务 / 变更驻场服务 / 巡检服务 / 设备搬迁服务 / 应急响应 / 特别值守服务 / 能力赋能服务 / 其他服务（`isOther: true`）

`desc` 从 `CostBudgetEstimate.html` 行 1458-1467 原样抄录。**丢弃 `defaultVal` 字段** —— 它在原工具全代码中从未被读取，是死字段。

---

## 5. 表单模型与计算链路

### 5.1 项目基本信息（9 个字段，全部必填）

| 字段 | 类型 | 取值 | 是否参与计算 |
|---|---|---|---|
| 报价名称 | text | 自由 | 否（用于文件名与存档标题） |
| 客户名称 | text | 自由 | 否 |
| 销售 | text | 自由 | 否 |
| 项目所在地 | text | 自由 | **否**（与"一类/二类城市"无联动，纯记录） |
| 项目金额（万元） | number ≥0 | — | **是**（成本比例的分母） |
| 项目级别 | select | P1 / P2 / P3 / P4 | 否 |
| 客户级别 | select | TOP1000 / 指名客户 / 非指名客户 | 否 |
| 签约类型 | select | 直签 / 渠道 / 项目合作 | 否 |
| 是否含第三方外采 | select | 否 / 是 | 否 |

后 4 个下拉与"项目所在地"是**审批用标签，没有任何计费含义**。这是原工具的既定事实，如实保留，不要臆造系数。

### 5.2 产品实施

每个已添加的产品卡片：

- **标准实施**：`qty`(数量) / `stdDays`(单台标准人天，预填自目录) / `coefficient`(设备系数，预填自目录) / `totalDays`(合计参考人天，只读自动算) + 4 格人天（技服一类 / 技服二类 / 外包一类 / 外包二类）
- **非标实施**：工作内容说明 + 4 格人天
- **自定义产品**（id `other`）：产品名 + 工作内容说明 + 4 格人天

**合计参考人天的分段规则（刻意为之，原样保留）：**

```
totalDays = qty === 1 ? stdDays
          : qty  >  1 ? round(qty * stdDays * coefficient, 1位小数)
          : 0                       // qty === 0 或 0 < qty < 1 都得 0
```

> **`qty === 1` 时不乘系数**（直接取 stdDays）—— 这是一条真实的分段规则，不是 bug。

**关键：`totalDays` 不参与任何金额计算。** 它只是给填表人的参考值，人天必须**手动**分配到 4 个格子里。金额只认 4 格里的数。

```
prodTechDays1/2 = Σ 所有产品(标准+非标+自定义)的 技服一类/二类 人天
prodOutDays1/2  = Σ 所有产品的 外包一类/二类 人天
prodTechCost = prodTechDays1 × rates.city1.tech + prodTechDays2 × rates.city2.tech
prodOutCost  = prodOutDays1  × rates.city1.out  + prodOutDays2  × rates.city2.out
```

### 5.3 项目经理

5 个阶段 × (PM 一类 / PM 二类 / 技服一类 / 技服二类 人天 + 工作内容) —— 全部手填，无推导。

```
pmDays1/2     = Σ 各阶段 PM 一类/二类 人天
pmTechDays1/2 = Σ 各阶段 技服一类/二类 人天
pmCost     = pmDays1     × rates.city1.pm   + pmDays2     × rates.city2.pm
pmTechCost = pmTechDays1 × rates.city1.tech + pmTechDays2 × rates.city2.tech
```

### 5.4 其他服务

```
svcTechDays1/2, svcOutDays1/2 = Σ 各服务条目对应格子
svcTechCost = svcTechDays1 × rates.city1.tech + svcTechDays2 × rates.city2.tech
svcOutCost  = svcOutDays1  × rates.city1.out  + svcOutDays2  × rates.city2.out
```

### 5.5 直接成本

```
travelAllowance = 境内天数 × allowance.dom + 境外天数 × allowance.intl × fx
hotelCost       = 一线晚数 × hotel.type1 + 省会晚数 × hotel.capital
                + 其他晚数 × hotel.other + 港澳晚数 × hotel.hk × fx
hotelOutCost    = 外包一类晚数 × hotel.outType1 + 外包二类晚数 × hotel.outType2

directCost = travelAllowance + hotelCost + hotelOutCost
           + 本地交通(员工base地)      // 员工常驻地交通费
           + 当地交通(差旅期间)        // 差旅期间在目的地的交通费
           + 城际交通
```

> 「本地交通」与「当地交通」是**两个不同类目**（前者是员工 base 地交通费，后者属差旅费用），都要保留、都要累加。原工具的标签（"本地交通" vs "当地交通合计"）语义含混，重构后标签改为 **「本地交通（员工 base 地）」** 与 **「当地交通（差旅期间）」**。

### 5.6 汇总、销售金额与成本比例

```
laborCost  = pmCost + pmTechCost + prodTechCost + prodOutCost + svcTechCost + svcOutCost
totalCost  = laborCost + directCost                       // 总成本(未含税)

margin      = 选中的毛利率档 (0.13 | 0.06)
salesAmount = totalCost × (1 + margin)                    // 销售下单金额(含税)

costRatio   = salesAmount ÷ (项目金额万元 × 10000) × 100   // 单位 %   ★见 §6 修正 1
```

**成本比例三态**（阈值取自配置 `ratio.min` / `ratio.max`，默认 3 / 15）：

| 条件 | 状态 | 异常说明 |
|---|---|---|
| `costRatio < min` | ⚠ 比例偏低 | **必填** |
| `min ≤ costRatio ≤ max` | ✓ 比例正常 | 不需要 |
| `costRatio > max` | ⚠ 比例偏高 | **必填** |

`项目金额 ≤ 0` 或 `totalCost === 0` → 显示 `--`，不判定、不拦截。

异常说明为空时，**保存与导出都要阻断**并给出明确提示。

### 5.7 销售下单建议表（成本 → 物料数量的逆运算）

四个物料各自归集成本。**注意 PM 模块内的技术服务人天被并入「工程师」物料**，不算进 PM 物料：

```
cost[pm]      = pmDays1 × rates.city1.pm
cost[pm2ndc]  = pmDays2 × rates.city2.pm
cost[eng1stc] = (prodTechDays1 + pmTechDays1 + svcTechDays1) × rates.city1.tech
              + (prodOutDays1  + svcOutDays1)                × rates.city1.out
cost[eng2ndc] = (prodTechDays2 + pmTechDays2 + svcTechDays2) × rates.city2.tech
              + (prodOutDays2  + svcOutDays2)                × rates.city2.out

// 第一遍：按含税金额反推数量（向上取整）
for m of materials:
    qty[m]   = ceil( cost[m] × (1 + margin) ÷ salesPrices[m] )
    total[m] = qty[m] × salesPrices[m]

// 第二遍：直接成本(差旅)并到「最便宜的、数量 > 0 的」物料上，只并一个
if directCost > 0:
    for m of [eng2ndc, eng1stc, pm2ndc, pm]:        // 按单价升序
        if qty[m] > 0:
            qty[m]   = ceil( (directCost + cost[m]) × (1 + margin) ÷ salesPrices[m] )
            total[m] = qty[m] × salesPrices[m]
            break
    else:
        // ★见 §6 修正 3：全部物料数量为 0（纯差旅、无人工）时不再静默丢弃
        m = eng2ndc                                  // 落到最便宜的物料
        qty[m]   = ceil( directCost × (1 + margin) ÷ salesPrices[m] )
        total[m] = qty[m] × salesPrices[m]

grandTotal = Σ total[m]
```

`directCost` 由变量传入（★见 §6 修正 4）。

### 5.8 CRM 审批建议

每次重算后自动生成；用户一旦手动编辑，即停止自动覆盖（脏标记）。**新增「恢复自动生成」按钮**（★见 §6 修正 6）——原工具改一次就永远回不去了。

模板（原样保留）：

```
该项目评估后，
1.预计项目经理{pmDays1 + pmDays2}人天；
2.相关产品部署原厂工程师{prodTechDays1 + pmTechDays1 + prodTechDays2 + pmTechDays2}人天、外包{prodOutDays1 + prodOutDays2}人天；
3.其他服务原厂工程师{svcTechDays1 + svcTechDays2}人天、外包{svcOutDays1 + svcOutDays2}人天；
4.直接成本{¥directCost}
```

人天用 1 位小数；金额千分位。注意第 2 条的"原厂工程师"人天**含 PM 模块内的技术服务人天**。

---

## 6. 对原工具的 8 处修正

| # | 缺陷 | 修正 |
|---|---|---|
| **1** | **成本比例算错了。** 页面文案写「3%＜销售下单金额/项目金额＜15%」，代码分子却用**未含税总成本**，漏乘 `(1 + 毛利率)` | **改代码**：`costRatio = totalCost × (1 + margin) ÷ 项目金额`。后果：同一份报价的比例比原工具**高约 13%**（选 6% 档时高 6%），3%~15% 阈值不变，**部分原判「正常」的报价会变成「偏高」并要求填异常说明——这是修正的必然结果，不是新 bug**。且**毛利率下拉从此会影响成本比例**（原来只影响下单金额），切换档位必须触发比例重算与三态重判 |
| **2** | 毛利率选 6% 时 `SALES_PRICES[0.06]` 是 `undefined`，代码静默回退用 13% 的单价表 | **物料单价与毛利率解耦**：单价就是一套（2400/1800/1500/1200），毛利率只作为 `(1 + margin)` 的乘数。消除静默回退这条路径 |
| **3** | 差旅并单时若**所有物料数量都为 0**（纯差旅、无人工），差旅费被**静默丢弃**，合计变 0 | 落到最便宜的物料（eng2ndc）上。见 §5.7 的 `else` 分支 |
| **4** | `directCost` 从 DOM 文本 `¥12,345` 反解字符串取得 | 由变量传递。整个计算层是纯函数，不碰 DOM |
| **5** | 「本地交通（元）」与「当地交通合计（元）」标签语义含混，看起来像重复计费 | 保留两个字段（确属两个类目），标签改为「本地交通（员工 base 地）」「当地交通（差旅期间）」 |
| **6** | CRM 审批建议手改一次后永不再自动更新，且没有回头路 | 新增「恢复自动生成」按钮 |
| **7** | 费率在 JS 常量和 HTML 静态表格里**各写一遍**（两份真相源，且 HTML 里 PM 单价格子写的是销售价 2400/1800，首次渲染前显示的是错的） | 费率单一来源 = 配置。页面上的费率速查表由配置渲染 |
| **8** | Excel 导出漏了 CRM 审批建议、销售下单建议两个 sheet（**恰恰是拿去 CRM 上单要用的**）；产品实施 sheet 丢掉了数量/系数/合计人天三列，且「说明」列输出的是一段**写死的通用文案**，19 个产品输出同一句话 | 导出 **8 个 sheet**；产品实施 sheet 补全列并输出真实说明。见 §7 |

### 一并丢弃的死代码（不要移植）

`cityType` 变量与 `.city-toggle` 样式（DOM 中无对应元素）、`addedOtherServices`、`SERVICES[].defaultVal`、`resetAll()`、`updateSalesMargin()`、`togglePM()`（引用不存在的 DOM）、`updateCardSubtotal()` 中匹配不到的选择器、`calculateCostRatio()` 里每次调用都重复 `addEventListener` 的监听器泄漏。

### 明确不做

- **不做 Excel 导入。** 原导入的用途是把记录搬到另一台电脑，存档上服务端后这个需求消失；且原导入有确认的丢数据 bug（项目经理 sheet 导出列是 `[阶段, days1, days2, tech1, tech2, note]`，导入却读 `note = r[4]`，实际读到的是 `tech1` → note 被写成 tech1 的值、tech1/tech2 全丢）。
- **不迁移历史数据。** 原存档只在各人浏览器的 localStorage 里，无法也无需迁移。

---

## 7. Excel 导出（8 个 sheet）

复用 `lib/exportXlsx.ts` 的 `exportSheets()`（SheetJS，已内置）。**不引入 exceljs / file-saver** —— 原工具从 jsdelivr CDN 加载它们，内网必然失败。

文件名：`概算_{报价名称}_{YYYYMMDD}.xlsx`。导出前跑必填校验与成本比例异常说明校验。

| # | Sheet | 列 |
|---|---|---|
| 1 | 项目基本信息 | 字段 / 内容（9 项基本信息 + 概算汇总：PM 一类/二类人天、技服一类/二类人天、外包一类/二类人天、直接成本、总成本、销售下单金额） |
| 2 | 成本比例 | 项目 / 数值（成本比例、建议范围、状态、异常说明） |
| 3 | **产品实施（补全）** | 产品名称 / 类型 / **数量** / **单台标准人天** / **设备系数** / **合计参考人天** / 一类技服人天 / 二类技服人天 / 一类外包人天 / 二类外包人天 / **工作内容说明** |
| 4 | 项目经理 | 阶段 / PM(一类) / PM(二类) / 技服(一类) / 技服(二类) / 工作内容 |
| 5 | 其他服务 | 服务名称 / 工作内容 / 一类技服 / 二类技服 / 一类外包 / 二类外包 |
| 6 | 直接成本 | 项目 / 类型 / 数值（差补 ×2、住宿 ×4、外包差旅 ×2、交通 ×3） |
| 7 | **CRM 审批建议**（新增） | 审批建议正文 |
| 8 | **销售下单建议**（新增） | 物料编号 / 物料名称 / 单价 / 数量 / 金额（+ 合计行） |

**产品实施 sheet 的三点补全：**

1. **补「类型」的三态**：标准实施 / 非标准实施 / 自定义产品（原样保留）
2. **补数量、单台标准人天、设备系数、合计参考人天四列** —— 让审批人看得到人天是怎么估出来的，原工具只给结果不给依据
3. **「工作内容说明」输出真实内容**：标准实施 → 该产品目录里的 `stdDesc`；非标实施 → 用户填的说明；自定义产品 → 用户填的说明。**不再对所有产品输出同一句写死的通用文案**

---

## 8. 校验与错误处理

**前端**
- 9 个基本信息必填 → 保存 / 导出前校验，滚动定位到第一个空字段
- 成本比例落在 `[min, max]` 之外 → 异常说明必填，否则阻断保存与导出
- 表单有未保存改动时离开页面 → 确认提示（路由 `beforeRouteLeave`）
- 加载配置失败 → 页面显示错误，不静默用默认值蒙混

**后端**
- 请求体大小上限；字段类型与范围校验；非法 → 400 且返回可读原因
- 配置校验：数值必须 > 0（阈值 `min < max`）、产品/服务目录条目上限、字符串长度上限
- 存档：`id` 不存在 → 404；owner 不匹配且非超管 → **403**
- 文件损坏 / 缺失 → 配置回落默认（降级不阻断）；存档回落空列表

**破坏性写操作"先算通再落盘"**：覆盖存档时先在内存里构造并校验完整记录，全部通过后才原子写；任一步失败则磁盘文件原样不动。

---

## 9. 测试

**pytest**
- `budget_config.py`：校验（合法 / 非法 / 缺键回落）、原子写、文件损坏降级
- `budget_store.py`：新建 / 覆盖 / 删除 / 按账号过滤 / 超管取全部
- `server.py` 端点：未登录 401；无 `budget` 权限 403；普通管理员 POST 配置 → **403**；普通管理员覆盖/删除他人存档 → **403**；超管可以
- ⚠ **碰真实 `data/` 路径的 server 测试必须 monkeypatch 隔离**。V3.0.0 出过两次事故：测试删掉了真实的 `yitian_data.json` / `yitian_store.json`，配置被写脏。跑完用 md5 比对 `data/*.json` 确认零变化

**vitest**
- `calc.ts`：全部公式，**含「成本比例分子必须含税」的回归**（钉死修正 1）、`qty === 1` 不乘系数的分段规则、汇率换算、比例三态阈值边界（恰好 3% / 恰好 15% 判正常）
- `salesOrder.ts`：向上取整、差旅并到最便宜且数量>0 的物料、**「所有物料数量为 0 时差旅不丢失」的回归**（钉死修正 3）
- `crmText.ts`：模板与"原厂工程师人天含 PM 技服"的口径
- `exportEstimate.ts`：8 个 sheet 齐备、产品实施 sheet 的列与真实说明
- 费率快照：打开旧存档用快照算、点「按最新费率重算」后切当前配置

**对拍验证（关键一步）**

拿一份原工具跑出来的真实报价，同样的输入喂进新系统，**逐项核对每个金额**。预期：除成本比例外**全部逐位相同**；成本比例应恰好等于原值 × (1 + 毛利率)。这是修正 1 的正向确认 —— 如果比例不是这个关系，说明改坏了别的东西。

> V3.0.0 就是靠对拍原脚本证明重构没走样，并顺带证实了仓库里那份"基准"报告其实是陈旧产物。**别信旧产物，让旧工具当场重跑。**

---

## 10. 版本与部署

**V3.1.0**（Y 级：新增整页）。

升级须知：

- **非纯前端** —— 新增 `budget_config.py` / `budget_store.py`，改动 `server.py` / `auth.py`(nav) / `audit.py`。**必须覆盖后端 `*.py` 并重启后端**
- **必须授权新 pageKey `budget`**（超管自动可见；普通管理员需在账号管理里勾选）
- **不需要点「更新数据」** —— 本域不进数据管线
- `data/budget_config.json` 与 `data/budget_estimates.json` 由后端首次读写时自动创建，无需手工建
- 无新增第三方依赖（xlsx 早已在用；**未引入 exceljs**）
