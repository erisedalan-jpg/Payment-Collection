# 蓝信回流闭环 + 推送内容增强 设计

> 日期：2026-07-28
> 基线：V4.5.7（生产 V4.5.6）
> 参照物：工作树下 `lanxin/`（他人基于 LTS-1.1.0 制作的督办系统蓝信对接副本，未跟踪、不入库）
> 分期：两期，**均为 Z 级**（用户钦定）→ 第一期 **V4.5.8**，第二期 **V4.5.9**

---

## 1. 要解决的两个问题

用户报障：

1. **蓝信上的回复无法正常对接回本系统** —— 入站半环从未跑通。
2. **推送内容量较小** —— 收卡人拿到的是统计，不是可执行的单据。

---

## 2. 现状盘点

### 2.1 `lanxin/` 与 master 的真实关系

`lanxin/` 不是「另一套实现」，而是 **master 蓝信域的后代 + 超集**：

| | master（V4.5.7） | `lanxin/`（督办，LTS-1.1.0 基线） |
|---|---|---|
| 蓝信文件日期 | 7/20（V4.0.5 后未动） | 7/23~7/27，**更新** |
| `lanxin_crypto` / `lanxin_callback` / `lanxin_inbox` | — | **逐字相同** |
| `lanxin.py` / `_config` / `_recipients` | 有倚天工时路由 | 删了倚天，加了 approveCard / `create_ws_endpoint` |
| 独有模块 | 倚天工时推送 | **多 9 个**：approveCard、失败重发、H5 反馈闭环、自动触发、未反馈管理、看板、字典 |

**master 的回调实现本身没有缺陷** —— 闸门顺序（① 大小上限 → ② 验签 → ②b 新鲜度 → ③ 存证 → ④ 解密 → ⑤ 解析 → ⑥ 去重 → ⑦ 落库）、GET 回 405，与副本逐字同构。问题①不是「代码写错了」。

`record_sent` 已接线（V4.0.5 记录的「定义了却没接线」债已还），故收件箱的身份反查与归因候选可用。

### 2.2 副本给出的真正答案：**不要把回流押在回调上**

督办的反馈闭环走 `/pm/supervision/review/<token>` —— H5 免登录页，卡片整卡可点，在蓝信内置 webview 打开，用户填表 POST 回来。回调对它只是锦上添花（标记已响应 + approveCard 按钮）。

副本 README 原文：§2.3「H5 反馈闭环**不依赖回调**」；§10 头号坑「回调收不到……可先用 appCard + cardLink 跳 H5 的方案」；§12「先用 appCard + cardLink 跳 H5，等回调通了再升级 approveCard」。

**master 的结构性弱点**：回调是**唯一**回流通道，不通即零回流；且回来的是自由文本，仍需超管人工归入。

### 2.3 问题①根因：**已实证定位** —— 回调地址漏了 `/pm` 前缀

生产取证（2026-07-28）：

| 证据 | 值 |
|---|---|
| `data/lanxin_callback_raw.jsonl` | **文件不存在**（不是 0 行，是从未创建） |
| `GET /api/lanxin/config` → `rejected` | `{count: 0, lastAt: "", lastFrom: "", lastReason: ""}` |
| 蓝信开发者中心填写的回调地址 | `http://10.248.105.95/api/lanxin/callback` —— **没有 `/pm`** |

**推理**：闸门顺序为 ① 大小上限 → ② 验签 → ②b 新鲜度 → ③ 存证。请求走到 ② 被拒则 `count+1`；走到 ③ 则**创建**存证文件。二者皆无 → **没有任何请求到达过 `handle_lanxin_callback`**。

**根因**：`deploy/nginx-pmplatform-port80-pm.conf` 只配了 `location /pm/`，其注释原文：「因服务器是共享的（根路径 `/` 与 `/api`、`/data` 可能被别的系统占用），本系统只接管 `/pm/` 这一段路径」。故 `http://10.248.105.95/api/lanxin/callback` 落在 nginx 根路径 —— 404，或**同机另一个系统**。蓝信确实推了，只是推到了别人家门口。

**正确地址**：`http://10.248.105.95/pm/api/lanxin/callback`
（nginx `proxy_pass http://127.0.0.1:8080/;` 末尾斜杠会剥掉 `/pm`，app 收到 `/api/lanxin/callback`，与 `_AUTH_EXEMPT` 中登记的路径一致；query string 经 proxy_pass 原样保留，`timestamp/nonce/signature` 不丢。）

**处置**：改蓝信后台一处，零代码、零部署、零重启。**不采用**「改 nginx 代理 `/api/lanxin/callback`」的反向做法 —— 那台是共享服务器，`/api/` 可能已被别的系统占用，有冲突风险。

### 2.4 两条被此次取证推翻/更正的既有判断

**① 「timestamp 格式假设」不是当前阻塞点。** 本设计初稿把它列为「最可能的单点根因」。实证否定：`lastReason` 为空串，说明新鲜度闸门**一次都没执行过**。该假设**依然未证实**（地址修好后若出现 `lastReason=stale` 即是它），但它排在根因之后，不是并列项。

**② 可达性分析更正。** 初稿据「督办在 `10.248.107.234`、master 在 `10.248.105.95`、同网段且督办通」判定「可达性不是默认根因」。取证发现 `apiGateway = https://apigw.lx.qianxin.com` —— **蓝信是公有云，服务器在公网**，而 `10.248.x.x` 是 RFC1918 私网地址。**出站能通（推送已成功）完全不能证明入站能通** —— 两个方向：

| 通道 | 谁发起 | 需要什么可达性 |
|---|---|---|
| 回调 | **蓝信服务器（公网）** → 我方 | 需公网 IP 映射 / 端口转发才能进 `10.248.105.95` |
| H5 | **用户手机**（蓝信内置 webview，在公司网内）→ 我方 | 用户在公司网内即可 |

督办能通，README 原文是「部署到**有公网 IP 的服务器**（督办最终走的这条：10.248.107.234 + nginx 反代）」。master 那台是否有同等映射**尚未证实** —— 故修完地址后**必须实测**（见 §8 一期验收）。若结果是不可达，那是跨部门网络申请，周期不由代码决定，**而 H5 通道恰好不依赖它**（方向相反）。这是二期优先级应当提高的直接理由。

---

## 3. 关键约束（实测，不是推断）

### 3.1 「单项目单卡」不可照搬 —— 实测数据否决

用本机 638 个在建项目跑出的真实分布：

| | 现状聚合卡 | 照搬单项目单卡 |
|---|---|---|
| 一次发出 | 69 张 | **324 张** |
| 单人最多收 | 1 张 | **32 张**（3 人收 20+，7 人收 10+） |

督办能用单卡，因为它的触发是「计划回款日 T-15/T/T+15」，**天然稀疏**；master 的关注原因是**存量全量扫描**，天然稠密。照搬会刷屏，一次就砸掉功能信任。

> 用户已据此与督办侧设计人员沟通，督办侧亦调整为「推送聚合数据、点开后全部明细并单独反馈」。两边就此对齐。

**结论：卡片仍是一人一张，内容从「统计」换成「明细 + 入口」。**

### 3.2 蓝信 appCard 硬约束（副本 README §8 实测表）

| 约束 | 值 |
|---|---|
| `bodyTitle` | **必填非空**，空串被拒 `40060` |
| `headTitle` | **单行**，含 `\n` 被拒 `40060` |
| `bodyContent` | 渲染在 **fields 之前**（想显示在最下必须放 fields 末尾） |
| `fields.key` | ≤18 字节 / 6 汉字 |
| `fields.value` | ≤192 字节 / 64 字 |
| `fields` 对数 | ≤10 |
| 收件人 `userIdList` | ≤1000 |

**由 `fields.key` ≤6 汉字派生的一条设计决策**：项目名普遍超 6 字，若用项目名当 key 会被截断，且多个项目可能截成相同前缀（README 坑 7 实测过：「总成本超支大于5000」和「小于5000」都截成「总成本超支…」）。**故 key 用序号，项目名放进 value**（value 上限 64 字，放得下「项目名 · 原因(明细)」）。

### 3.3 关注原因已自带明细，卡片增强零新口径

`frontend/src/lib/riskReasons.ts` 的 `RiskReason` 已返回 `detail` 字段：「3 个延期节点」/「超支 1.2 万」/「2 个未关闭风险」。工时侧 `IssueRow` 已含 `date` / `customer` / `workOrder` / `snippet`。

**卡片增强只需把已有的 `detail` 带过去，不新增任何计算口径。** 这是本设计刻意的风险控制 —— 口径变更是本仓最高危的改动类别。

---

## 4. 设计

### 4.0 总览

> **把「一人一张统计卡」升级为「一人一张明细卡 + 整卡点击进 H5 逐条反馈」。**

一个动作同时解决①②。分两期：

- **第一期（Z 级）**：卡片内容增强 + `reviewDeadlineHours` 配置项 + 未响应清单 + 回调诊断增强。**不新增免登录端点。**
- **第二期（Z 级）**：H5 反馈闭环。新增免登录端点 + `review.html` + token 签发校验 + 反馈落收件箱。

分期依据：第二期新增**免登录写入口**，安全面比第一期大一档，回滚粒度须更细。

---

### 4.1 【一期】卡片内容增强

#### 4.1.1 项目卡新结构

```
headTitle    推送时间：2026-07-28 09:00        ← 加粗最顶（学副本）
bodyTitle    你名下 5 个项目需要跟进            ← 必填非空
bodySubTitle （空）
fields
  1          XX智慧园区项目 · 回款延期(3个延期节点)
  2          YY数据中心 · 回款延期(2个延期节点)、风险未闭环(2个未关闭风险)
  …          （最多 8 项）
  其余        另有 2 个：ZZ项目、WW项目            ← 仅在超出时出现
  动作要求     见 4.1.3（按可用通道三态生成）        ← 仅在有可用通道时出现
bodyContent  （空 —— 动作要求已在 fields 末尾）
cardLink     一期为空；二期填 H5 token URL
```

排序：按原因条数降序（多原因的项目更需要关注），同数按项目名。

**明细行固定上限 8 行**，不因「动作要求」缺席而放宽到 9~10 —— 条件式上限会让「同一个人、配置一变，卡片行数就变」，排查时多一个变量。

**「其余」行的计数必须准确，即便名字列不下**：`fields.value` 上限 64 字，项目名多时必然截断，但 `另有 N 个` 的 **N 是全量计数**，与截断无关。

> 顺带消掉一类既有缺陷：现有 `build_project_card` 因「按原因分行」，同一项目命中多个原因时会在多行出现，故不得不用 `omitted = dropped - shown` 做去重，否则会出现「标题说 49 个、正文说另有 60 个未列出」的自相矛盾（代码注释里记着这次实测）。**新结构按项目分行，每个项目恰好出现一次，该类矛盾从结构上不再可能** —— 去重逻辑随之删除，而不是保留。

#### 4.1.2 入参契约变更

`build_plan` 的项目事项从：

```ts
{ kind: 'project'; projectId: string; reasons: string[] }
```

改为：

```ts
{ kind: 'project'; projectId: string; reasons: { category: string; detail: string }[] }
```

`build_project_card` 的入参从 `by_reason: Dict[原因, List[项目名]]` 改为
`by_project: List[{ name: str, reasons: List[{category, detail}] }]`。

**与「后端不接受前端传来的标识」这条承重约定的关系**（CLAUDE.md §4 蓝信约定）：该约定约束的是**标识**（决定推给谁、写到哪），不是展示文案。本变更只让前端多传 `detail` 这一**展示串**；`projectId → 项目经理 → 工号` 的解析链**完全不变**，仍由后端从 `project_pmis` + 组织树推导。前端出错最多是卡片上写错一句说明，**不会推给错的人**。

先例：`timesheet` 事项**早已**携带前端算好的展示串 —— `{code, label, count}`，其注释原文「label 一并带上，后端组卡不必再查表」。本变更与之同构。

#### 4.1.3 动作要求文案：按**实际可用通道**三态生成，绝不开空头支票

现有代码已有一个严谨先例：`reply_hint` 仅在**两个回调凭证都非空**时才为真，其注释原文「只配一个 = 验签或解密必然失败，此时引导用户回复只会让回复石沉大海」。本设计把它扩展成三态：

| 条件 | 动作要求文案 |
|---|---|
| 有 `h5_url`（二期） | `请点击卡片逐条反馈，{N}小时内未反馈将列入《未响应清单》` |
| 无 `h5_url`，但双回调凭证齐全 | `请直接回复本消息反馈，{N}小时内未反馈将列入《未响应清单》` |
| 两者皆无 | **不输出动作要求 field**（没有任何可用回流通道时，承诺反馈就是空头支票） |

由单一函数 `build_action_hint(n_hours, h5_url, reply_hint)` 生成，三处调用方（项目卡 / 工时卡 / 二期 H5）共用，**绝不散写**。

#### 4.1.4 工时卡同构改造

用户选择「保留并一并增强」。工时卡按项目卡同构改造：

```
headTitle    推送时间：2026-07-28 09:00
bodyTitle    你有 12 条工时填报存在问题
fields
  1          未填工作成果 · 5 条 · 最近 07-25
  2          工时超 8 小时 · 3 条 · 最近 07-24
  …
  动作要求     同 4.1.3
```

`build_timesheet_card` 入参从 `issues: [{label, count}]` 增加可选 `lastDate`（该问题码最近一次出现的日期，前端从 `IssueRow.date` 取最大值）。缺失则该段不显示 —— **宁可不显示，不显示空值**（沿用现有 `start`/`end` 的既有策略）。

---

### 4.2 【一期】`reviewDeadlineHours` 配置项

- **存放**：`data/lanxin_config.json` 顶层 `reviewDeadlineHours`，沿用副本命名（`supervision_config.rules.reviewDeadlineHours`）。
- **默认**：24。
- **校验**：整数，`1 <= N <= 720`（30 天）。越界 → `validate_config` 抛 `ValueError` → 400 明确拒绝，不静默。
- **界面**：`/data` → 配置 tab 的 `LanxinConfigCard.vue` 加一个数字输入。超管可配、即时生效、**不进数据管线、无需点「更新数据」**。
- **单一来源铁律**：**卡片文案里的 N 与未响应清单判定用的 N 必须是同一个值**。卡上写 24 小时、清单按 48 小时算，是必然会出的事故。二者都从 `cfg['reviewDeadlineHours']` 读，不各自默认。

`lanxin_config.json` 已在 `.gitignore`（含密钥），本次不新增文件，无需改 gitignore。

---

### 4.3 【一期】未响应清单

#### 4.3.1 纯派生视图，零新数据文件

所需数据已全部就位：

| 要什么 | 已有来源 |
|---|---|
| 推了谁 / 何时 / 涉及哪些项目 | `lanxin_inbox` store 的 `sent[]`：`{staffId, employId, name, routeKey, projectIds, msgId, sentAt}`，`record_sent` 已接线，留存 90 天，**只记成功项** |
| 谁回了 | 同 store 的 `items[]`（一期=文本回复；二期 H5 反馈也进这里） |

**不新增任何 `data/*.json`** —— 与 §4.4「反馈落收件箱、不新开台账」同一原则。新数据文件还要逐条确认 gitignore（本仓 gitignore 是显式列举、非通配），能不加就不加。

#### 4.3.2 判定口径

一条 `sent` 记录为「未响应」，当且仅当：

```
sentAt + N 小时 <= now
且  不存在 inbox item 满足：item.staffId == sent.staffId 且 item.receivedAt >= sent.sentAt
```

#### 4.3.3 精度边界（必须写死，不得含糊）

**一期判定是「人级」，不是「项目级」。** 因为一期唯一的回流是文本回复，而回复正文里**没有项目信息** —— 某人回了任意一条，该批次即算已响应。

二期 H5 反馈携带 `projectId`，届时可下钻到项目级。

**行模型（一期二期通用，二期只增下钻、不推倒重来）**：一行 = 一条 `sent` 记录（「某时刻推给某人的一张卡」）。

| 列 | 来源 |
|---|---|
| 推送时间 | `sent.sentAt` |
| 工号 / 姓名 | `sent.employId` / `sent.name` |
| 推送类型 | `sent.routeKey`（project / timesheet） |
| 涉及项目数 | `len(sent.projectIds)` |
| 超时时长 | `now - sentAt - N 小时`，未到期显「未到期」 |
| 是否已响应 | 见 4.3.2 |
| 首次响应时间 | 满足条件的最早 `item.receivedAt`，无则空 |

UI 必须标明「响应判定为**人级**：该员工在推送后回复过任意消息即计为已响应」。**不标明就是让超管误以为是项目级精度。**

#### 4.3.4 实现落点

- 新建 `lanxin_unresponded.py`：纯函数，无 IO。`compute(store, deadline_hours, now) -> List[row]`。
  独立成文件而非塞进 `lanxin_inbox.py`：后者是**存储结构**，本模块是**派生分析**，职责不同，且需独立测试 N 参数与时间窗口。
- `GET /api/lanxin/unresponded` —— 超管专属，路径进 `_SUPER_ONLY_PATHS`。
- 前端：`/data` 页新增 `el-tab-pane`，与现有 `v-if="auth.isSuper"` 的「蓝信回复」tab 并列。

**为何是 tab 而非独立路由页**（用户原话是「页面」，此处为建议偏离，已当面说明且用户未反对）：
1. 零新 `pageKey` —— 新 pageKey 要给账号补勾，是部署时最容易漏的一步；
2. 零侧栏变化 —— 侧栏项数变动上一版本已被误判为「功能丢失」；
3. 「谁没回」与「谁回了什么」本就该挨着看；
4. `/data` 自 V3.5.0 即是 Tab 化范式，加 tab 是既有做法。

> `el-tab-pane` **绝不设 `lazy`**（EP 2.14.1 默认 false = 全渲染 + v-show 隐藏），沿用 DataView 现有注释里的既定约束。

---

### 4.4 【一期】回调诊断增强

#### 4.4.0 回调地址自显示（防复发，直接针对 §2.3 已定位的根因）

根因是**人工抄地址时漏了部署前缀**。这类错误无声、无日志、无告警，全靠人眼核对——已经吃过一次。

**改动**：`LanxinConfigCard.vue` 增加一行只读展示「回调地址（请原样填入蓝信开发者中心）」+ 一键复制：

```ts
// 绝不写死 —— 前缀由构建时的 vite base 决定(/ 或 /pm/),写死必然与部署漂移
window.location.origin + apiUrl('/api/lanxin/callback')
```

复用**既有**的 `frontend/src/lib/baseUrl.ts` 的 `apiUrl()`（`joinBase(import.meta.env.BASE_URL, path)`）。`/pm/` 构建下产出 `http://10.248.105.95/pm/api/lanxin/callback`，开发环境产出 `http://localhost:8080/api/lanxin/callback` —— **两种部署形态都自动正确**。

> 这一项是本期性价比最高的改动：三行代码，消灭一整类无声故障。

#### 4.4.1 被拒报文的 timestamp 原值可见

现状排查能力不足：新鲜度拒绝只写 `logger.warning`，生产上无人查 `journalctl`。

**改动**：`_lanxin_rejected` 增加 `lastTimestampSample` 字段，记录被拒报文的 `timestamp` **原值**，经 `GET /api/lanxin/config` 下发（该接口已超管专属）。

**安全论证**：`timestamp` 不是密钥、不是报文体、不是签名。三条铁律（`appSecret` / `callbackAesKey` / `callbackSignToken` / `app_token` 绝不外泄）不受影响。落入下发的仅此一个整数串。

**为什么值得做**：`PROGRESS.md` 挂着的债 —— 回调 `timestamp` 的单位/格式蓝信文档**从未记载**，`lanxin_timestamp_fresh` 按 epoch 秒解读是**未证实假设**。若蓝信实际发 ISO8601 或带小数毫秒，`isdigit()` 判断为假 → **每一条回调都被拒、入站半环全死**，而验签是通过的。这正是问题①最可能的单点根因，而现在**没有任何界面能看到它**。

**配套的生产诊断程序**（交付时随升级手册给出）：

| 存证行数 | `rejected.count` | 根因 | 处置 |
|---|---|---|---|
| 0 | 0 | 蓝信压根没推：回调 URL 没配/配错，或未订阅 `account_message` | 开发者中心配 URL + 订阅事件 |
| 0 | >0，`lastReason=signature` | 验签不过：`callbackSignToken` 未配或配错 | 重填凭证 |
| 0 | >0，`lastReason=stale` | **时间戳格式假设错误** → 看 `lastTimestampSample` 真容 | 按实际格式改 `lanxin_timestamp_fresh` |
| >0 | — | 已收到，卡在解密/解析/归入 | 查收件箱「未解析」条目 |

本期**不预先修改** `lanxin_timestamp_fresh` 的解析逻辑 —— 在拿到 `lastTimestampSample` 实证之前改它是猜测，违反「先根因后修复」。本期只让根因**可见**。

---

### 4.5 【二期】H5 反馈闭环

#### 4.5.1 流程

```
卡片(cardLink=/pm/review/<token>) → 用户点整卡 → 蓝信内置 webview
  → GET  /pm/review/<token>              免登录，服务 review.html
  → GET  /api/lanxin/review/items?token= 免登录，返回该员工待办清单（实时查，不冻结快照）
  → 用户逐条填写 → POST /api/lanxin/review/submit  免登录
  → 落收件箱（source='h5'，携带 projectId）
  → 超管在现有「蓝信回复」tab 一键归入四域
```

#### 4.5.2 反馈落点：收件箱，不新开台账

H5 提交落**现有** `lanxin_inbox`（标 `source='h5'`），而非像督办那样新开 `supervision_feedback`。四条理由：

1. 零新数据文件、零新权限面；
2. 复用已建好的归入逻辑，含两条铁律：**归入必须追加**（`followup_store.apply_update` 是 `rec[field]=content` 直接赋值，原样调用会抹掉既有跟进）、**必须 `html.escape` 且换行只用 `<br>`**（`<p>` 不在 `lib/richText.ts` 白名单，会被读端拆解）；
3. 文本回复与 H5 反馈**汇流一处**，超管不必两处巡检；
4. 万一回调后来修通，两条通道天然合并，不分裂成两套。

**红利**：未响应清单读的就是收件箱，故二期上线后**清单自动变准，清单代码零改动**。

#### 4.5.3 token 设计

格式沿用副本：`base64url(payload).exp.sig`（3 段，全 ASCII，URL 安全）

```
payload = JSON{emp, kind}          kind ∈ {project, timesheet}
exp     = 签发时刻 + ttl
sig     = HMAC-SHA256(tokenSecret, "payload_b64|exp").hexdigest()
```

- **用 base64url 而非明文**：副本实测教训 —— 明文中文进 URL path 会让 `http.client` ASCII 编码崩溃。
- **TTL**：48 小时，常量。
- **密钥**：`lanxin_config.json` 的 `reviewTokenSecret`，首次使用时以 `secrets` 自动生成。**绝不进日志/审计/异常消息/前端下发**，`public_config` 按现有三密钥同样方式脱敏（只透 `hasReviewTokenSecret` 布尔）。
- **校验用 `hmac.compare_digest`** 防时序攻击。
- **失败一律返回「链接失效」，绝不 500、绝不抛错**。

#### 4.5.4 免登录端点的安全边界

三个端点进 `_AUTH_EXEMPT`，与 `/api/lanxin/callback` 同级对待：

| 闸门 | 要求 |
|---|---|
| 身份 | token 是唯一凭据，验签失败即拒 |
| **越权写** | **服务端必须校验 `projectId` 确实属于该 token 绑定的工号** —— 否则任何人拿一个自己的 token 就能往任意项目写反馈。这是本期最容易漏的一条。 |
| 报文大小 | 提交内容长度上限（沿用 `LANXIN_CALLBACK_MAX_BYTES` 同级常量） |
| 转义 | 内容 `html.escape`，换行只用 `<br>` |
| 频率 | 单 token 提交次数上限，防止被当作写盘放大器 |

---

## 5. 明确不做（YAGNI）

| 不做 | 理由 |
|---|---|
| **approveCard 按钮交互** | **理由已更正**：初稿写「需组织管理员额外审批开通机器人能力」，但生产配置实为 `sendAs: "bot"` —— 机器人能力**早已开通并在用**，该理由作废。真正的理由是：approveCard 的按钮点击**同样**靠 HTTP 回调回传，而回调正是当前不通的东西，收益与 H5 重叠而依赖更重。副本 README §12 亦建议「先用 H5，等回调通了再升级」。**回调修通后它是一个真实可选项**，届时无需再过审批 |
| **`supervision_*` 七个业务模块** | 督办的回款评审/里程碑督办/未响应清单，与 master「重点跟进四域」语义重叠但不相同，直接搬会撞车 |
| **自动触发调度（T-15/T/T+15）** | 用户已明确排除（选 A 档而非 C 档） |
| **`create_ws_endpoint`** | 副本里它就是**死代码**（定义了、零调用方），移过来只是给死代码换个家 |
| **失败重发台账** | 留待后续；本期先让「发失败无声丢弃」在推送结果里显式可见 |
| **本期修改 `lanxin_timestamp_fresh` 解析逻辑** | 在拿到 `lastTimestampSample` 实证前改它是猜测，违反「先根因后修复」 |

---

## 6. 测试策略

现有蓝信测试规模：`test_lanxin_recipients.py` 43 条、`test_lanxin.py` 61 条、`test_lanxin_config.py` 32 条，另有 `test_lanxin_wiring.py` / `test_server_lanxin*.py`。改卡片结构必然大面积触碰。

### 6.1 回归安全网（必须不变的断言）

以下现有断言**必须保持通过**，变红即说明改坏了承重逻辑：

- `fit_bytes` / `fit_field` 的截断行为（含「绝不切半个字符」）
- `bodyTitle` 非空、`headTitle` 无换行
- `fields` ≤10 对
- `resolve_project_manager` 1:N 时跳过并报告
- `sentLog` 只记成功项
- 回调七道闸门顺序与各自的返回码

### 6.2 本期必须新增的测试

| 测试 | 防的是什么 |
|---|---|
| 动作要求三态：有 h5 / 仅回调凭证 / 皆无 | **皆无时不得输出动作要求 field** —— 空头支票 |
| N 的单一来源：卡片文案里的 N == 清单判定用的 N | 卡上 24 小时、清单按 48 小时算 |
| 未响应判定边界：恰好 N 小时、N-1 秒、N+1 秒 | 边界 off-by-one |
| 未响应：响应时间早于推送时间的 item **不算**响应 | 用旧回复冒充新响应 |
| 项目名超 6 汉字时不进 `fields.key` | 截断撞名（README 坑 7） |
| （二期）token 绑 A 工号却提交 B 项目 → 拒 | **越权写**，本期最易漏 |
| （二期）token 过期/伪造/格式错 → 「链接失效」而非 500 | 免登录端点异常外泄 |

### 6.3 反向验证（本仓承重工序）

每一条新增契约测试**必须**做反向验证：临时把实现改错，确认该测试**真的变红**。

本仓已累计六种「假绿」成因，写测试时逐条自查：
1. 断言 `!== undefined` 而值退化成 `[]` / `''` / `0`（V4.5.7）
2. lib 层契约 ≠ 视图接线（V4.5.7）
3. `k in row` 恒真（V4.4.4）
4. `toContain` 碰瓷同页别处文案（V4.4.6）
5. 正则解析源码失配 → 循环空跑 → 恒真（V4.5.3）
6. 测试与实现读写不同 key（自己拼 key 而非复用实现的拼 key 函数）（V4.5.5）

**备份用 scratchpad 绝对路径，`cp` 后立刻验证存在**（`$TMPDIR` 在 Git Bash 下为空，曾致备份全失败仍跑完）。**绝不用 `git checkout` 还原**（会抹掉未提交改动）。

---

## 7. 安全红线（本期适用条款）

- `appSecret` / `callbackAesKey` / `callbackSignToken` / `app_token` / **新增的 `reviewTokenSecret`** 绝不进日志、审计、异常消息、前端下发；`public_config` 一律脱敏，只透 `has*` 布尔。
- `data/lanxin_config.json` 已 gitignore；本期**不新增任何 `data/*.json`**。
- 后端不接受前端传来的**标识**；`detail` 是展示串、非标识（论证见 4.1.2）。
- 二期三个免登录端点须过 4.5.4 全部闸门，尤以**越权写校验**为重。
- 推送前用 `git status` + `git diff --cached --stat` 核暂存内容；**绝不 `git add -A`**（工作树常年散落 `client.zip` / `*.xlsx` / `lanxin/` 等未跟踪脏文件，部分含真实数据）。
- `lanxin/` 是未跟踪的他人副本，**只读不改、绝不入库**；根 `conftest.py` 的 `collect_ignore` 已含 `lanxin`。

---

## 8. 分期与验收

### 第一期（Z 级）

**交付**：卡片内容增强（项目卡 + 工时卡）、`reviewDeadlineHours` 配置项、未响应清单 tab、回调诊断增强。

**不含**：任何新增免登录端点。

**验收**：
1. `verify.sh` 全绿；
2. 超管在 `/data` 能配 N，超出 1~720 被明确拒绝；
3. 推送预览里项目卡按新结构呈现，含具体项目名 + 原因明细；
4. 两个回调凭证清空时，卡片**不出现**动作要求 field；
5. 未响应清单 tab 可见，且 UI 标明「人级判定」；
6. `GET /api/lanxin/config` 返回含 `lastTimestampSample`，且**不含任何密钥**；
7. 配置卡展示的回调地址在 `/pm` 部署下为 `http://<host>/pm/api/lanxin/callback`（**不是**写死值，改 base 重新构建应随之变化）。

**一期上线前可先行、且不依赖发版的三件事**（根因已定位，这三件事零代码）：

| # | 动作 | 期望 |
|---|---|---|
| 1 | 蓝信开发者中心回调地址改为 `http://10.248.105.95/pm/api/lanxin/callback` | —— |
| 2 | 核对订阅的事件类型**含 `bot_private_message`** | 生产 `sendAs: "bot"`，用户回复机器人触发的是 `bot_private_message` 而非 `account_message`；只勾后者则永远收不到。**代码侧无需改动**：`lanxin_callback.EVENT_TYPES` 三种全认 |
| 3 | 点开发者中心「发送测试回调」，再查存证与 `rejected` | 存证文件出现 → 通路打开；`rejected.count>0` 且 `lastReason=stale` → 命中 §2.4① 的 timestamp 假设；二者皆无 → 命中 §2.4② 的公网不可达，需走网络申请 |

### 第二期（Z 级）

**交付**：H5 反馈闭环。

**验收**：
1. `verify.sh` 全绿；
2. token 过期/伪造 → 「链接失效」，非 500；
3. **A 工号的 token 提交 B 项目 → 被拒**；
4. H5 提交后条目出现在「蓝信回复」tab，`source='h5'`，可一键归入四域；
5. 归入后既有跟进内容**未被抹掉**（追加语义）；
6. 未响应清单**代码未改**而判定自动变准。

### 跨期依赖

第一期卡片文案在有 H5 时才写「点击卡片」，故第一期文案走「回复本消息」或不输出两态；第二期上线后自动切到「点击卡片」态 —— 由 `build_action_hint` 单一函数按入参决定，无需二次改文案。

---

## 9. 遗留与后续

- 问题①的**首要根因已定位并可零成本修复**（§2.3 回调地址漏 `/pm`），但**修完是否即通尚未证实** —— 后面还串着两道未验证的关卡：事件类型订阅（`bot_private_message`）与公网可达性（§2.4②）。三者按 §8 的三步表逐一排除。
- `lanxin_timestamp_fresh` 的 epoch 秒假设**仍未证实**，一期只让它**可见**（`lastTimestampSample`）。若地址修好后出现 `lastReason=stale`，据实测值改解析，可能需要一个补丁版本。
- 失败重发台账（副本 `lanxin_resend.py` 是纯通用逻辑，可直接复用）未纳入本期。
- 项目级响应精度需二期 H5 上线后方可实现。
- approveCard 升级路径保留：若回调最终跑通且机器人能力获批，可在 H5 之上叠加。
