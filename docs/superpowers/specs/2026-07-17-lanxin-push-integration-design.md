# V4.0.0 设计：蓝信推送集成（异常项目 / 工时问题提醒）

> 设计文档（spec）。落成后交 `writing-plans` 生成实施计划。
> 交流语言：简体中文。

**版本**：**V4.0.0（X 级 —— 用户已确认）**。线上基线 V3.5.0。
**性质**：**非纯前端**。新增后端模块 + 新增外部系统集成（蓝信开放平台）+ `/data` 加配置卡。
升级须换 `dist/` + 覆盖后端新增 `.py` + **重启后端**；**无需点「更新数据」**（本域不进数据管线）；**无新增页面/路由/pageKey/授权**。
**目标**：管理员在平台内一键把**项目关注原因**与**倚天工时填报问题**，通过蓝信应用号消息推送给相关人员。**发前可预览、所见即所发**。

**为何定 X 级**：引入平台此前不存在的能力面 —— **主动对外部系统发消息、且触达真实员工**。这不是新增一个页面，而是新增一条对外通道与一个新配置域。

---

## 0. 全局约束

- **不使用任何 emoji**（CLAUDE.md 铁律）。需要符号时用 `→ ↓ ❌ ✕ ▾`。
- **只引设计令牌，不手写散值**；**不引入第 16 个色号**；状态标识走「淡底+深字」三态。
- **口径单一来源**：项目关注原因与工时问题的判定**只在前端 `lib/`**，后端**不得**复刻（CLAUDE.md 红线；`/insight` 口径分叉是前车之鉴）。
- **绝不记密钥**：`AppSecret` / `appToken` / `userToken` **不得**进日志、审计、异常消息、前端下发。审计只记「谁在何时推给了多少人、结果如何」。
- **后端不接受前端传来的 staffId**：只接受 `projectId` / `employId`，收件人一律后端自行推导。
- **不静默丢弃**：未解析的收件人、被截断的内容、发送失败的条目，一律显式列出。
- **无新增第三方依赖**：HTTP 调用用 Python 标准库（`urllib.request`），与本仓「纯标准库后端」一致。
- **不改数据管线**：不动 `preprocess_data.py` / `schema.py` / `read_org_roster`；升级无需点「更新数据」。

---

## 1. 现状基线（调查结论 —— 实现前的事实锚点）

### 1.1 蓝信开放平台（已从官方文档实证，非推测）

文档站是 SPA，正文经 `POST /api/v1/h5/document/fetch/detail` `{"enName":"..."}` 取得；模块树经 `POST /api/v1/h5/document/en/fetch` `{"mName":"back-end-api"}`（220 篇）/ `{"mName":"development-help"}`（40 篇）取得。

**通用约定**：HTTPS + JSON + UTF-8；POST 须 `Content-Type: application/json`；所有返回含 `errCode` / `errMsg`，**`errCode == 0` 为成功**；文档中 `apigw-example.domain` / `passport-example.domain` **是占位符**，真实地址随部署实例不同，需向蓝信组织管理员索取。

**本设计用到的三个接口**：

| 接口 | 方法与路径 | 关键参数 | 返回 |
|---|---|---|---|
| 获取应用访问TOKEN | `GET /v1/apptoken/create` | `grant_type=client_credential` `appid` `secret` | `appToken` / `expiresIn`(**7200s**，官方建议缓存) |
| 通过唯一标识获取人员ID | `GET /v2/staffs/id_mapping/fetch` | `app_token` `org_id` `id_type` `id_value` | `staffId` |
| 发送应用消息（应用号通道） | `POST /v1/messages/create?app_token=` | body: `userIdList`(**≤1000**) / `departmentIdList`(≤100) 二选一、`msgType`、`msgData` | `invalidStaff[]` / `invalidDepartment[]` / `msgId` |

- `id_mapping` 的 `id_type` 枚举：**`employ_id`（人员编号，一般是 HR 系统的人员唯一编号）** / `mobile`（格式 `86-137xxxxxxx`）/ `mail` / `login` / `external_id`。**本设计用 `employ_id`**。
- `messages/create` 的 `msgType` **只支持 `text` / `oacard` / `linkCard` / `appCard` 四种**（`appArticles`/`document` 不在此端点）。
- 官方对本场景的选型推荐（原文）：「针对应用到人员的**单向提醒消息**的业务场景，我们推荐应用使用**发送应用号消息**进行提醒的方式。」

**`appCard` 规格上限（逐条来自官方参数表，实现时必须遵守）**：

| 字段 | 上限 | 备注 |
|---|---|---|
| `bodyTitle` | 600 字节 | 必填 |
| `bodySubTitle` | 1200 字节（两行） | |
| `bodyContent` | **3000 字节（八行）** | 松散内容 |
| `fields` | **≤10 对** | `key` ≤18 字节；`value` ≤192 字节（两行），value 不可脱离 key 单独存在 |
| `links` | ≤3 对 | |
| `signature` | 96 字节 | |
| `headStatusInfo.description` | 30 字节 | `isDynamic=true` 时必填 |

`fields`/`bodyTitle` 等支持 `<div style="color/font-size/text-align/text-indent">` 内联样式。

**相关错误码**（来自官方错误码表）：`10005` API服务无权限 / `40060` 消息为空或格式错 / `40062` 消息接收者为空或格式错 / `45000` 请求参数错误 / `50084` 非法的 msgType / `52051` 组织id格式异常 / **`56008` 触发限流**。

**兜底能力**：存在「撤回消息」接口（`back-end-api` 模块，文档 id `646ed9de3d4e4adb7039c149`），第一期不实现，但记录在案作为事故预案。

### 1.2 平台侧数据（已用真实数据实测）

**组织架构（`input/组织架构.xlsx`，读取入口 `projects.read_sheet_by_header(path, "工号")`）**
- 列：`工号` `姓名` `员工类别` `新L2组织` `新L3组织` `新L3-1组织` `新L4组织` **`直接上级工号`** **`直接上级姓名`**
- **实测 85 行，`新L3组织` 全部为「交付实施三部」**；`config.DEPT_L3 == '交付实施三部'`
- 汇报树（实测，与用户口述一致）：
  ```
  [0] 张英哲  A000701  L2=交付中心 L3=交付实施三部 L3-1=(空) L4=(空) 直接上级工号=(空)  直属2人
    [1] 于岩    L3-1=服务二部   直属6人 → 6 个 L4 组（黑龙江/吉林/辽宁/浙江/上海一/广东二服务组）
    [1] 隋文宇  L3-1=服务一部   直属5人 → 5 个 L4 组（河北/小金融/运营商/银行/京津服务组）
    [3] 员工 71 人
  ```
- 链长分布 `{0级:1人, 1级:2人, 2级:11人, 3级:71人}`；**无环**；84/85 有直接上级工号（缺的 1 个就是根 张英哲）；**上级工号 100% 落在本花名册内，无悬挂引用**
- 从**员工级（71 人）**看各级收件人（实测）：**+1 → 11 位 L4 组长**（最多带 13 人：耿磊磊13 / 许德金12 / 陶俊10 / 齐兵8 / 顾秀臣7 / 黎浩骏6 / 耿言6 / 王鹏03·张召01 各3 / 孙艳飞2 / 佘海龙1）；**+2 → 2 位 L3-1**（隋文宇 42 人、于岩 29 人）；**+3 → 1 位 张英哲**（71 人）。**链长全部够，无人因断链收不到**。
- **姓名 → 工号在当前花名册内 1:1（实测 0 重名）**。这是**当下**事实，不是不变量 —— 设计必须防 1:N。

**项目域（`data/analysis_data.json`）**
- **实测 PMIS 1260 个项目，全部有 `项目经理`（0 缺失），172 位不同经理**
- **主域 `projects` 638 个，74 位不同经理，人均 8.6 个，单人最多 49 个**
- `projectsQuality.managerNotInOrg` **实测 6 个项目**（项目经理不在花名册）
- `projects[]` 键：`projectId` `projectName` `projectManager` `customer` `orgL4` `orgL3_1` `health` `payment` `paymentPmis` `overspendAmount` `isPresale` `top1000` `quadrant` `signUnit` `deliveryCosts` `合同金额` `relatedClosedId`
- `projectPmis[pid].team.项目经理` 是**姓名字符串**（`schema.PmisTeam`），非工号
- **`analysis_data.json` 顶层无花名册**（键：`meta` `projects` `projectPmis` `projectProfit` `projectMilestones` `paymentNodes` `paymentRecords` `closedProjects` `followupRecords` `events` `periodCompare` `dataQuality` `projectsQuality` `tagSeed`）

**口径归属（决定架构的关键事实）**
- **后端完全没有 `riskReasons` 口径** —— 8 类关注原因只活在前端 `frontend/src/lib/riskReasons.ts`：`回款延期` `里程碑滞后` `总成本超支大于5000` `总成本超支小于5000` `交付成本超支` `风险未闭环` `数据异常` `未获取原项目预算`
- 后端只有粗口径 `projects[].health`（`progressAbnormal`/`riskAbnormal`/`costAbnormal`/`paymentAbnormal`/`overall`），**与前端「关注原因」不同源**
- 倚天问题码在**后端** `yitian_rules.ISSUE_LABELS`（7 类）：`MISS_SUMMARY` 缺少工作概述 / `MISS_PROGRESS` 缺少工作进展 / `MISS_NEXT` 缺少下一步工作计划 / `MISS_SERVICE_MODE` 缺少服务方式 / `TYPE_MISMATCH` 工时类型填报有误 / `PRODUCT_MISMATCH` 产品类别填写错误 / `MISS_CUSTOMER` 客户名称未填写；前端消费口径在 `lib/yitian/compliance.ts`（`issueRows`/`countByCode`/`countByL4`）
- 倚天花名册 `YitianRosterItem`：`id`(工号,大写归一,跨域连接键) `name` `l2` `l3` `l31` `l4` `category` —— **无直接上级**
- `projects.read_org_roster` / `read_org_names` **均硬过滤 `新L3组织 == config.DEPT_L3`**
- **`schema._Base` 是 `extra="allow"`** —— 给花名册加字段**不会报错**，但会**静默流进 `yitian_data.json`**（本仓已有「`extra=allow` 让 typecheck 假绿」的教训）

### 1.3 凭证现状
**尚未申请**。`appId` / `appSecret` / `orgId` / 真实网关地址全部缺失 → **无法联调**。
申请清单见 `docs/2026-07-17-蓝信开放平台接入申请清单.md`。
**设计必须做到：无凭证时代码完整可测（纯函数 + mock），凭证到位后经「自检」一键验证。**

---

## 2. 架构

```
前端（口径层 —— 复用现有 lib/，零新口径）
  lib/lanxin/items.ts  纯计算：从 riskReasons / anomaly / yitian compliance 派生待推事项
      { kind:'project',   projectId, reasons:string[] }
      { kind:'timesheet', employId,  issues:{code,label,count}[] }
  components/LanxinConfigCard.vue   凭证 + 路由配置 + 自检（/data「配置」签）
  components/LanxinPushDrawer.vue   预览 → 确认 → 推送（el-drawer）

        POST /api/lanxin/preview {items}   只解析不发送
        POST /api/lanxin/send    {items}   同一解析 + 真发

后端（收件人 + 通道 —— 新增 3 个模块）
  lanxin_config.py      凭证与路由配置（data/lanxin_config.json，原子写，进 .gitignore）
  lanxin_recipients.py  读 input/组织架构.xlsx → 工号/姓名/直接上级；解析三条收件链；组卡
  lanxin.py             蓝信 API 客户端：appToken 缓存 / id_mapping / messages.create
  server.py             /api/lanxin/{config,selftest,preview,send} —— 全部超管专属 + 审计
```

### 2.1 职责边界（本设计的核心决策）

- **前端只回答「哪些项目/工时行有什么异常」**（口径，单一来源仍是 `lib/`）
- **后端只回答「这些异常该发给谁、卡片长什么样、怎么发出去」**（收件人解析 + 通道）

**为何这么切**（三个理由，实现时不得擅自调换）：
1. 口径若下沉后端 = 双份必然漂移（CLAUDE.md 红线）
2. 花名册（工号/姓名/直接上级）**只在后端**，`analysis_data.json` 里根本没有 → 前端算不了收件人
3. 后端不信任前端传来的收件人 → 前端出错最多是「算错哪些项目异常」（预览时看得见），**不可能变成「推给了不该推的人」**

### 2.2 preview / send 的等价性（结构保证，非约定）

`preview` 与 `send` **必须吃同一份 payload、走同一条解析与组卡代码路径**，唯一差别是 `send` 在最后一步调用蓝信 API、`preview` 不调。
实现上抽出 `build_plan(items, cfg) -> Plan`，两个端点都调它；`send` 额外执行 `dispatch(plan)`。
**禁止**为预览另写一份简化逻辑 —— 那会让「所见即所发」退化成约定。

### 2.3 花名册读取（不动现有管线）

推送模块**自带读取器** `lanxin_recipients.read_org_tree(path)`，复用 `projects.read_sheet_by_header(path, "工号")` 取原始行，但：
- **不套用 `新L3组织 == DEPT_L3` 过滤** —— 今天全表 85 行本就都是三部，**行为零差异**；等花名册扩到整个团队，+4/+5 级**不改代码自动生效**（张英哲的上级必然不属三部，套过滤会被挡掉）
- **不修改 `read_org_roster` / `read_org_names`** —— 那两个函数的 `DEPT_L3` 过滤是主域/倚天的业务口径，不该被推送需求牵动；且 `_Base` 是 `extra="allow"`，给花名册加字段会**静默流进 `yitian_data.json`**
- 产出：`{工号: {name, supId, l4, l31}}` + 反向索引 `{姓名: [工号...]}`（**故意用 list，为 1:N 重名留位**）

---

## 3. 可配置收件链

`data/lanxin_config.json`，超管在 `/data`「配置」签编辑，**改完即时生效、无需点「更新数据」**（本域不进管线，与 `yitian_rules_config` / `budget_config` 同构）。

```jsonc
{
  "enabled": false,
  "credentials": {
    "appId": "", "appSecret": "", "orgId": "",
    "apiGateway": "",        // 如 https://apigw-xxx.example.com,不含末尾斜杠
    "idType": "employ_id"    // 预留:若「人员编号」与我方工号编码不一致,可切 mobile/mail
  },
  "sendIntervalMs": 200,     // 串行发送间隔,应对 56008 限流(阈值未知,可调)
  "routes": [
    {
      "key": "timesheet", "label": "倚天工时问题", "enabled": true,
      "issueCodes": ["MISS_SUMMARY","MISS_PROGRESS","MISS_NEXT","MISS_SERVICE_MODE",
                     "TYPE_MISMATCH","PRODUCT_MISMATCH","MISS_CUSTOMER"],
      "recipients": { "primary": true, "supervisorLevels": 0 }
    },
    {
      "key": "project", "label": "项目关注原因", "enabled": true,
      "reasons": ["回款延期","里程碑滞后","总成本超支大于5000","总成本超支小于5000",
                  "交付成本超支","风险未闭环","数据异常","未获取原项目预算"],
      "recipients": { "primary": true, "supervisorLevels": 1 }
    }
  ]
}
```

**三层可配**：
- **哪个消息** → `route.enabled` 管大类；`issueCodes` / `reasons` 管到**每一个具体原因**是否参与推送
- **是否发给本人 / 项目经理** → `recipients.primary`（timesheet 的 primary = 填报人本人；project 的 primary = 项目经理）
- **汇总给谁** → `recipients.supervisorLevels`：**0 = 不发汇总；1..5 = 从 primary 那个人向上累积 N 级**

**`supervisorLevels` 语义**（累积，非单级）：`2` 表示同时发给 +1 与 +2。
**取值范围 0..5，上限 5**（用户钦定：预留 5 级架构 —— 系统若推广到整个团队，张英哲之上仍有两级）。
今天实测：`1`→11 位 L4 组长；`2`→再加 2 位 L3-1；`3`→再加 1 位张英哲；**`4`/`5`→当前数据走到根即停，与 `3` 等效，不报错**。

**默认值**：timesheet `supervisorLevels: 0`、project `supervisorLevels: 1`。理由：+3 意味着张英哲一人收覆盖全部 71 人的卡，应由人显式开启而非默认。

**配置校验**（`lanxin_config.validate`，落盘前）：
- `supervisorLevels` ∈ 0..5，否则拒绝
- `issueCodes` ⊆ `yitian_rules.ISSUE_LABELS` 的键集合；`reasons` ⊆ 前端 8 类白名单（后端存一份**常量白名单**用于校验，**这不是口径复刻** —— 只校验取值合法性，不做任何判定）
- `apiGateway` 须 `https://` 开头
- 未通过 → 400 + 明确 errMsg，**不落盘**

---

## 4. 收件人解析

### 4.1 三条链（均已实测）

| 事项 | 链路 | 实测 |
|---|---|---|
| timesheet → primary | `employId` →（`id_type=employ_id`）→ staffId | 直连，无中间匹配 |
| project → primary | `projectId` → `projectPmis[pid].team.项目经理`(姓名) → 花名册姓名索引 → 工号 → staffId | 74 位；当前 0 重名 |
| 任一 → supervisor | primary 工号 → `直接上级工号` → 逐级向上 | 14 位上级、100% 在册、无环 |

### 4.2 护栏（每条都由实测事实倒逼）

- **姓名 → 多个工号（1:N）**：**跳过并计入 `unresolved`，绝不猜**。当前花名册 0 重名，但那是数据现状不是不变量。
- **姓名 → 0 个工号**：计入 `unresolved`（实测 `managerNotInOrg` 有 6 个项目会走到这里）。
- **上级链**：**必须带环检测（`seen` 集合）+ 深度上限 5**。当前数据无环，但花名册是人工维护的 xlsx，填错即死循环。
- **链长不足**：走到根或上级为空/册外 → **停止，不报错**（这是正常情形：L4 组长的 +3 就没有对象）。
- **`unresolved` 必须在预览里显式列出**：`{kind, id, name?, reason: '经理不在花名册'|'姓名映射到多个工号'|'工号未匹配蓝信人员'}`。

### 4.3 staffId 解析
- 逐个工号调 `id_mapping`；**结果按 `工号 → staffId` 在内存缓存**（单次推送内复用，不跨请求持久化）。
- 某个工号换不到 staffId（`errCode != 0`）→ 计入 `unresolved`，**不影响其他人**。

---

## 5. 卡片形态

统一 `msgType: "appCard"`，`isDynamic: false`（第一期不做状态更新）。

### 5.1 工时卡 → 填报人本人
```
headTitle    工时填报提醒
bodyTitle    你有 6 条工时填报存在问题
bodySubTitle 统计区间 2026-07-01 ~ 2026-07-15
fields       缺少工作进展     | 3 条
             工时类型填报有误 | 2 条
             客户名称未填写   | 1 条
signature    项目管理平台
```
问题类型共 7 类 → **`fields` 恒 ≤10 对，永不撞线**。

### 5.2 项目卡 → 项目经理本人
**不能用「项目名 → 原因」**：实测单人最多背 49 个项目，必爆 10 对。故反排：
```
bodyTitle    你名下 8 个项目存在关注原因
fields       回款延期        | 3 个项目        ← 原因共 8 类,恒 ≤10 对
             总成本超支>5000 | 4 个项目
             里程碑滞后      | 1 个项目
bodyContent  回款延期：XX银行核心系统、YY数据中心、ZZ运维
             总成本超支>5000：AA平台、BB集成…
signature    项目管理平台
```
- `fields` 给**分布**（≤8 行）；`bodyContent` 给**具体项目名**（按原因分组，3000 字节/八行内）
- `bodyContent` 超限 → 截断并显式追加「另有 N 个项目未列出」

### 5.3 汇总卡 → 上级（+1..+5）
**按「直接下属 × 原因」嵌套聚合**（用户钦定形态）：
```
bodyTitle    你的团队有 23 个项目存在关注原因
bodySubTitle 部门级汇总（+3）
fields       隋文宇 | 14 项：回款延期 6 · 成本超支 5 · 里程碑滞后 3
             于岩   |  9 项：回款延期 3 · 风险未闭环 4 · 成本超支 2
signature    项目管理平台
```
- **「下属」= 直接下属，数字是该下属整棵子树的合计**（逐层卷上去）。张英哲只收 2 行；想往下究就找于岩/隋文宇。
- **只列有异常的直属**。行数 = 有异常的直属人数，实测上界 13（耿磊磊）。
- `key` = 姓名（≤18 字节；`王鹏03` = 11 字节，够）
- `value` = `N 项：原因 n · 原因 n`（**≤192 字节 ≈ 64 汉字**）；原因按项数降序，放不下则取前几个 + 「等」

### 5.4 长度护栏（`lanxin_card.py` 或 `lanxin_recipients` 内，纯函数）
- **主动不越限**：`fields` ≤10 对；超出按项数降序取前 10 + 在 `bodyContent` 追加「另有 N 人共 M 项未列出」
- 每个字段落盘前按 **UTF-8 字节数**校验（中文 3 字节/字，不能按字符数算）
- **超限一律主动截断，绝不把超限内容发给蓝信** —— 理由见 §10「待实测」：蓝信超限行为未知（拒绝？静默截断？），不去赌

---

## 6. 端点

全部 **超管专属**（进 `server._SUPER_ONLY_PATHS`）+ 审计。

| 端点 | 方法 | 作用 |
|---|---|---|
| `/api/lanxin/config` | GET | 读配置。**`appSecret` 必须脱敏下发**（返回 `"***"` 或 `hasSecret: true`，绝不回传明文） |
| `/api/lanxin/config` | POST | 存配置（校验见 §3）。**`appSecret` 传空串表示「不修改」**，避免脱敏读回后误清空 |
| `/api/lanxin/selftest` | POST | `{employId}` → 自检三步：① 取 appToken ② 用**传入的测试工号**换 staffId ③ 给**该工号本人**发一条 `text` 测试消息。**全程不触碰他人** |
| `/api/lanxin/preview` | POST | `{items}` → `{plan: {recipients:[{employId,name,role,card}], unresolved:[...]}, totals}` |
| `/api/lanxin/send` | POST | `{items}` → 同一解析 + 真发 → `{sent, failed:[{employId,name,errCode,errMsg}], msgIds}` |

**审计埋点**：`audit._ACTION_MAP` 是按 `(method, path)` 查表的 —— **新端点必须加表条目，否则埋点是死的**（V3.3.0 实际踩过：新端点没加 map 条目，`_audit_set` 形同虚设）。

**自检的测试工号由超管手填，不改账号模型**（已核实：`data/accounts.json` 的账号记录只有 `account` / `displayName` / `isSuper` / `allowedPages` / `allowedL4` / `hash` / `salt`，**没有工号字段**，故无法自动取调用者工号）。超管在自检时手填自己的工号（如 `A000701`），三步全绿即接入完成。

---

## 7. 发送与错误处理

- **串行**发送，每条间隔 `sendIntervalMs`（默认 200ms，可配）。**不并发** —— `server.py` 是单线程 `HTTPServer`，且限流阈值未知。
- **`56008 触发限流`** → 指数退避重试（最多 3 次：1s / 2s / 4s）；仍失败则计入 `failed`，**继续发后面的人，不中断整批**。
- **其他 `errCode != 0`** → 计入 `failed`，继续。
- **`invalidStaff`**（返回体字段）→ 计入 `failed`，标注「蓝信侧认为该人员 ID 无效」。
- **网络异常 / 超时** → 计入 `failed`，`errMsg` 记异常类型（**不记 token**）。
- **appToken 缓存**：内存缓存 + `expiresIn`（7200s）；提前 5 分钟视为过期；`10005 无权限` 不重试（是权限问题，重试无用）。
- **返回体如实报告**：`{sent: N, failed: [...], unresolved: [...]}`，前端**必须把 failed / unresolved 展示出来**，不吞。
- **配置 `enabled: false` 或凭证缺失** → `preview` 仍可用（可以离线看要发给谁），`send` 直接 400 拒绝并说明原因。

---

## 8. 测试

**后端（pytest）**
- `lanxin_recipients`：树解析（用固定 fixture，不读真实 xlsx）——正常链、**环**、断链、姓名 1:N、姓名 0 匹配、`supervisorLevels` 0..5 各档、+4/+5 走到根即停
- 卡片组装：`fields` 恰好 10 / 超 10 截断 / `value` 超 192 字节截断 / `bodyContent` 超 3000 字节截断 / **中文按字节非字符计**
- `lanxin_config`：校验（越界 `supervisorLevels`、非法 `issueCodes`/`reasons`、非 https 网关）、原子写、`appSecret` 空串=不修改
- `lanxin` 客户端：**mock HTTP** —— appToken 缓存命中/过期重取、`56008` 退避重试、`errCode != 0` 归入 failed、异常不泄漏 token
- `build_plan` 的 **preview/send 等价性**：同一 payload 两条路径产出的 `plan` 必须逐字段相等（这是「所见即所发」的回归锚点）
- **审计**：断言 `_ACTION_MAP` 含四个新端点条目（防 V3.3.0 那种死埋点）

**前端（vitest）**
- `lib/lanxin/items.ts`：从固定 fixture 派生事项；路由配置的 `reasons`/`issueCodes` 过滤生效
- `LanxinConfigCard` / `LanxinPushDrawer`：渲染、`unresolved` 与 `failed` 必须出现在 DOM（防「静默吞掉」回归）
- **禁止假绿**：断言可见性用 `isVisible()`（V3.5.0 教训）

**验证**
- `bash verify.sh` 全绿且**退出码 0**（不能只看用例绿 —— V3.3.0 因子组件 onMounted 拒绝逸出导致「全绿但退出码非零」）
- **凭证到位后**：跑一次 `selftest` 三步全绿，再用 `preview` 目视核对收件清单，最后小范围 `send` 给自己确认卡片渲染

---

## 9. 明确不做（YAGNI）

- **不做 H5 页面与内容回填**（第二期；依赖「蓝信客户端能否访问我方内网」未确认）
- **不做定时推送**（第一期只手动 + 预览；定时需要后端有口径，与 §2.1 的切法冲突，届时另议）
- **不做消息撤回**（能力存在，记录在案作预案，不实现）
- **不做动态卡片状态更新**（`isDynamic`；无 H5 回填就没有状态可更新）
- **不做机器人 / 群消息 / webhook / 事件回调 / 工作台红点**
- **不新增页面 / 路由 / pageKey**（配置卡与推送抽屉都挂在 `/data`「配置」签）
- **不改账号模型**（自检的测试工号由超管手填）
- **不动 `read_org_roster` / `read_org_names` / 数据管线 / `schema.py`**
- **不引入第三方 HTTP 库**（用标准库 `urllib.request`）

---

## 10. 待实测清单（凭证到位后必须验，现在无法验）

| 项 | 未知点 | 现在的兜底 |
|---|---|---|
| `appCard.fields` 超 10 对的行为 | 文档只写「上限10对」，未写超限是**拒绝**还是**静默截断**；错误码表也无专码（最接近仅 `45000` / `40060`）。对比之下短信有专码 `57000`，说明蓝信在乎处会给专码 —— 此处没给，行为不可推定 | **主动不越限**，永不触发 |
| `56008` 限流阈值 | 文档未写。单次推送约 80~90 次 `messages/create` | 串行 + 可配间隔 + 退避重试 + 失败如实报告 |
| `employ_id` 编码一致性 | **蓝信「人员编号」是否等于我方「工号」（如 `A000701`）未经证实** | `credentials.idType` 可切 `mobile`/`mail`；自检第②步即验证此项 |
| `orgId` 从哪取 | 应用详情页不一定直接展示 | 申请清单已列；可由任意 staffId（`524288-xxx`）横杠前段反推 |

---

## 11. 发版

- `frontend/src/version.ts`：`APP_VERSION = 'V4.0.0'`
- `PROGRESS.md`：动手前标 `in_progress`，完成后记结论
- **升级路径**：换 `dist/` + 覆盖后端（新增 `lanxin.py` / `lanxin_config.py` / `lanxin_recipients.py`，改 `server.py` / `audit.py` / `.gitignore`）+ **重启后端**；**无需点「更新数据」**；**无新增 pageKey/授权**
- `.gitignore` 须加 **`data/lanxin_config.json`**（含 AppSecret）与 `data/lanxin_config.json.tmp`（原子写临时文件）—— V3.1.0 曾因 `.gitignore` 漏新 data 文件导致客户数据进库，opus 终审才逮到
- 线上基线 V3.5.0
