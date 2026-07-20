# V4.0.2 设计：临时跟进多实例化 + 蓝信推送路由逐项拆分

日期：2026-07-19
版本：**V4.0.2**（Z 级：无新增页面/路由/pageKey，两处均为页内改造）
基线：V4.0.1

---

## 1. 目标

两件相互独立的事，同版本交付：

**Part A —— `/projects/temp` 多实例化**
一个跟进事项没结束就要开下一轮，现在只有一份 scope + current + archives，只能串行。改为页内多选项卡，每个事项一个独立实例（各带自己的范围、当前记录、归档）。

**Part B —— 蓝信推送路由逐项拆分**
现在「倚天工时问题」8 个问题码共用一套收件人规则，「项目关注原因」8 类同理。改为每一项各自配置启停 / 是否发本人 / 汇总到第几级。

两部分**不共享任何代码与数据**，可完全并行实施。

---

## Part A：临时跟进多实例化

### A1. 数据结构与迁移

`data/temp_followup.json` 从单实例改为实例数组：

```jsonc
// 旧（version 1）
{ "version": 1, "scope": {...}, "current": {...}, "archives": [...] }

// 新（version 2）
{
  "version": 2,
  "instances": [
    { "id": "inst-xxxxxxxx", "name": "默认跟进",
      "scope": {...}, "current": {...}, "archives": [...] }
  ]
}
```

**迁移在读取时自动完成**（`_load_temp_followup` 内），不写迁移脚本：判据是 **缺 `instances` 键**（不要写 `version != 2`——将来出 v3 时会把新格式当旧版回迁），把顶层的 `scope`/`current`/`archives` 原样包成**第一个实例**，命名 **「默认跟进」**，生成 id，随下一次写入落盘。

**迁移必须是幂等且无损的**：现网有 3 条归档（1 / 75 / 21 行）与一份已配好的 `orgL4 in [7 个 L4 组]` 范围条件，迁移后必须逐字保留在「默认跟进」实例里。

`id` 由后端生成（`uuid.uuid4().hex[:8]` 前缀 `inst-`），**前端不生成 id**——前端无法保证唯一性，且 id 是 localStorage key 的组成部分（见 A5），必须稳定。

**实例名约束**：非空、`strip()` 后 1..20 字符；**允许重名**（用户可能真的要两个「7月攻坚」，靠 id 区分即可，强制查重只会挡路）；名称仅用于展示，不参与任何 key。

### A2. 后端 API

**不动 `followup_store.py`**。该模块是 temp / risk / opportunity / payment_key **四个域共用的引擎**，给它加多实例维度会牵动另外三个域。多实例是 temp 独有的需求，做成 `temp_followup.py` 的一层包装：`followup_store` 继续负责"单个实例内部"的 scope 规整 / update / archive 语义，`temp_followup.py` 负责在 `instances` 数组里选中目标实例后转调。

现有 5 个端点全部**增加 `instanceId` 入参**，另增 3 个实例管理端点：

| 方法 | 路径 | 入参 | 权限 |
|---|---|---|---|
| GET | `/api/temp-followup` | 无 | 任意登录用户 |
| POST | `/api/temp-followup/instances/create` | `{name, copyFrom?}` | **超管** |
| POST | `/api/temp-followup/instances/rename` | `{instanceId, name}` | **超管** |
| POST | `/api/temp-followup/instances/delete` | `{instanceId}` | **超管** |
| POST | `/api/temp-followup/scope` | `{instanceId, combinator, groups}` | **超管** |
| POST | `/api/temp-followup/update` | `{instanceId, projectId, field, content}` | 任意登录用户 |
| POST | `/api/temp-followup/archive` | `{instanceId, rows}` | **超管** |
| POST | `/api/temp-followup/archive/delete` | `{instanceId, archiveIdx}` | **超管** |

权限沿用现状的分界：**读与填写进展**任意登录用户，**改结构**（范围/归档/实例增删改）超管专属。三个新端点加进 `_SUPER_ONLY_PATHS`。

`instanceId` 不存在时返回 400 并明确指出（不要静默落到第一个实例——那会让用户在 A 实例里写的进展出现在 B 实例）。

**删除实例的约束**：
- 连同该实例的 `current` 与 `archives` 一并删除，前端须二次确认并显示"将同时删除 N 条归档"
- **不允许删除最后一个实例**（返回 400）。页面没有"零实例"这个合法状态，与其设计空态不如禁止

`copyFrom` 只复制 `scope`，**不复制** `current` 与 `archives`——复制别人的进展记录没有意义，且会让归档来源混淆。

### A3. 审计

`audit.py` 的 `_ACTION_MAP` 现有 4 条 temp 条目，需为 3 个新端点各加一条：

```python
('POST', '/api/temp-followup/instances/create'): ('temp_followup.instance_create', '新建临时跟进事项'),
('POST', '/api/temp-followup/instances/rename'): ('temp_followup.instance_rename', '重命名临时跟进事项'),
('POST', '/api/temp-followup/instances/delete'): ('temp_followup.instance_delete', '删除临时跟进事项'),
```

**漏加即审计静默失效**（本仓 V3.3.0 踩过：`_ACTION_MAP` 没有条目的端点不会报错，只是什么都不记）。删除实例是破坏性操作，审计 detail 里应带上实例名与归档条数。

### A4. 前端 store 与视图

**store**（`stores/tempFollowup.ts`）：
- state 增加 `instances: Instance[]` 与 `activeId: string`
- **保留** `scope` / `current` / `archives` 三个导出，改为指向当前实例的 computed —— 这样 `useFollowupPage(temp, ...)` 与视图里的既有引用**一行都不用改**（该 composable 只要求 store 满足 `{archives, deleteArchive}` 接口，被 5 个跟进页复用，不能为 temp 单独改它）
- actions 增加 `createInstance(name, copyFrom?)` / `renameInstance(id, name)` / `deleteInstance(id)` / `setActive(id)`；既有 4 个 action 内部自动带上 `activeId`

**视图**（`TempFollowupView.vue`）：
- 页面顶部加实例选项卡条：各实例名 + 「+ 新建」；实例多时**横向滚动**，不做折叠下拉（跟进事项通常个位数，滚动比二级菜单直观）
- 重命名 / 删除入口放在选项卡的右键或悬浮 `▾`，仅超管可见
- 新建弹窗：名称（必填）+ 范围来源单选（空白 / 复制自某实例）
- 切换实例时：重置分页与「当前/历史」模式到默认，**清空该表的列筛选**（`cf.clearAll`）——跨实例沿用筛选条件会让用户看到空表却不知为何
- **记住上次选中的实例**：`localStorage['temp-active:{account}']`。该 id 已不存在（实例被别人删了）时回落到第一个实例，不要留在空白页

### A5. ⚠ 硬约束：持久化 key 变更必须带迁移

`TABLE_ID` 现在是字面量 `'temp-followup'`（`TempFollowupView.vue:33`），派生出三处按表隔离的状态：

| 状态 | key | 存储 |
|---|---|---|
| 选列 | `colprefs:{account}:temp-followup` | localStorage |
| 排序 | `colsort:{account}:temp-followup` | localStorage |
| 列筛选 | `temp-followup` | 内存（crossFilter store） |

多实例后 `TABLE_ID` 必须变成 `` `temp-followup:${instanceId}` ``，否则各实例的列配置互相覆盖。**但改 key 会让用户已有的选列与排序偏好全部失效**——页面回落到默认列，用户会以为配置丢了。

**这是本仓第二次遇到同款陷阱**：V4.0.1 把 `tags` 加进 `/projects` 的 `DEFAULT_VISIBLE` 时，因为 `useColumnPrefs.loadKeys` 是持久化优先，老用户根本读不到新默认值，标签筛选入口凭空消失（终审 I-1）。教训是**任何影响持久化读取的改动都要问一句"老用户的存量数据怎么办"**。

**要求**：实现时必须做一次性迁移——把旧 key `colprefs:{account}:temp-followup` 与 `colsort:{account}:temp-followup` 的值，复制到**「默认跟进」实例**的新 key 下，并打迁移标记位（带账号前缀）避免重复执行。迁移后不必删除旧 key（留着无害，且回滚时还能用）。

**新建的实例没有历史包袱**，其选列回落到 `DEFAULT_VISIBLE` 即可，无需迁移。

### A6. Part A 明确不做

- **不改 `lib/tempFollowup.ts` 与 `lib/tempScope.ts` 的对外签名**。这两个文件名义上是 temp 域专属，实际被 `/payment/key` 直接 import（`PaymentKeyFollowupView.vue` 引用了 `buildScopeInputs` 与 `projectMatches`）。多实例是"同一套纯计算跑多份数据"，这两个模块本就无状态，不需要改。
- **不给其余 4 个跟进页做多实例**。只有临时跟进有"并行多轮"的诉求。
- **不做实例级权限**（谁能看哪个实例）。所有实例对所有能进本页的账号可见，与现状一致。
- **不做实例排序 / 拖拽**。按创建顺序排列。

---

## Part B：蓝信推送路由逐项拆分

### B1. 配置结构与迁移

保留 `routes` 的**两条域级路由**（工时 / 项目），把每条的 `issueCodes` / `reasons` 字符串数组换成 `items` 对象数组，收件人规则下沉到每一项：

```jsonc
// 旧
{ "key": "timesheet", "label": "倚天工时问题", "enabled": true,
  "issueCodes": ["MISS_SUMMARY", "MISS_PROGRESS", ...],
  "recipients": { "primary": true, "supervisorLevels": 0 } }

// 新
{ "key": "timesheet", "label": "倚天工时问题", "enabled": true,
  "items": [
    { "code": "MISS_SUMMARY", "enabled": true,  "primary": true,  "supervisorLevels": 0 },
    { "code": "TYPE_MISMATCH", "enabled": true, "primary": true,  "supervisorLevels": 2 },
    { "code": "HINT_PRESALE_PRODUCT", "enabled": false, "primary": true, "supervisorLevels": 0 },
    ...共 8 条
  ] }
```

项目路由同构，`code` 取 `REASON_WHITELIST` 的 8 类中文原因。

**为什么保留两条域级路由而不是拉平成 16 条**：`_route(cfg, key)` 与前端 `cfg.routes.find(r => r.key === 'project')` 都依赖「一个 kind 对应一条路由」，拉平会让这些查找全部重写；而且域级 `enabled` 是个有用的总闸（一键停掉整个工时推送）。保留两层的改动面显著更小。

**迁移**（`load_config` 内自动完成，与 Part A 同样不写迁移脚本）：旧 `issueCodes` / `reasons` 里出现的项 → `enabled: true`，白名单里其余项 → `enabled: false`；每项的 `primary` / `supervisorLevels` **一律继承原路由的 `recipients`**。这样迁移后的推送行为与迁移前**逐字节等价**，管理员不动配置就不会有任何行为变化。

**校验**（`validate_config`）：
- `items` 的 `code` 必须 ⊆ 对应白名单（工时 `ISSUE_LABELS` 键、项目 `REASON_WHITELIST`），不允许重复
- 每项 `enabled` / `primary` 为 bool，`supervisorLevels` 为 0..5 的 int（**显式排除 bool**，`isinstance(True, int)` 为真）
- **`items` 允许缺项**：白名单里没出现在 `items` 的 code，按 `enabled: false` 处理并在返回值里补齐。这样将来新增问题码不会让旧配置校验失败（V4.0.0 吃过 `ISSUE_LABELS` 从 7 项变 8 项的亏）

### B2. `build_plan` 算法改造

这是 Part B 的核心，现有实现有一处硬假设必须拆掉。

**现状**：`_rollup(counts_by_emp, levels, tree)` 的 `levels` 是**对整条路由生效的单一标量**（`lanxin.py:288`），调用一次就把所有 label 一起卷上去。逐项配置后，同一个人名下「回款延期」可能配 +1、「数据异常」配 +3，一次调用表达不了。

**新算法**：

```
1. 分桶（与现状同）：proj_by_emp[emp][reason] = [项目名...]，ts_by_emp[emp] = [issues...]
   但过滤条件从「code ∈ issueCodes」改为「该 code 对应的 item.enabled 为真」

2. primary 卡：组卡前先按 item.primary 过滤 label
   —— 某人可能只有部分原因需要通知本人；过滤后 label 全空则不出卡

3. supervisor 汇总：
   a. 把 enabled 的 label 按 supervisorLevels 分组：{1: [labelA, labelC], 3: [labelB]}
      levels == 0 的组直接跳过（不发汇总）
   b. 对每组切出 counts_by_emp 的子集，各调一次 _rollup(subset, levels, tree)
   c. 把多次调用的结果按 sup → owner → label 三层深度合并（label 集合天然互斥，同 key 直接相加即可）
   d. 每个 sup 出一张卡 —— 「按人合并」正是在这一步成立：某人因多项被卷中，仍只收一张
```

**`_descend_owner` 一个字都不用改**（纯拓扑查找，与 levels 无关）。`_rollup` 的**输出数据结构**也不用改，改的只是"调用一次"变成"按 levels 分组调用多次再合并"——阻碍在编排层，不在聚合层。

**primary 与 supervisor 仍是两条独立的收件人记录**，同一个人可能既收自己的 primary 卡又收下属的汇总卡。这是现状行为，不改：两张卡性质不同（"你自己的问题" vs "你团队的问题"），合并反而费解。

### B3. 汇总卡副标题改中性文案（顺带清 M-2 技术债）

一张合并汇总卡里的行可能来自不同 levels 分组（张三行来自 +1、李四行来自 +3），现有"这张卡属于第几级"的表达方式失去意义。

- 副标题固定为 **「团队汇总」**
- **删除** `_level_of()` 与 `_LEVEL_LABELS`（`lanxin.py:145-146, 308-316`）

这顺带清掉 V4.0.0 终审记下的 **M-2**（`_level_of` 取全局最小值、探测深度写死 5）——那个不精确在逐项拆分后会放大成明显错误，与其修不如连同它服务的文案一起删掉。

`build_summary_card` 的 `level_label` 形参**保留**（改传固定字符串），不动函数签名，避免波及卡片字节上限的既有测试。

### B4. 前端

**`LanxinConfigCard.vue`**：每条路由的渲染从"一组复选框 + 一个下拉"改为**每项一行的表格**：

```
倚天工时问题                                    [域总开关 ●]
┌────────────────────┬──────┬────────┬──────────┐
│ 问题类型            │ 启用 │ 发本人 │ 汇总级别 │
├────────────────────┼──────┼────────┼──────────┤
│ 缺少工作概述        │  ☑   │   ☑    │  0 不发 ▾│
│ 工时类型填报有误    │  ☑   │   ☑    │  2 隔级 ▾│
│ 售前服务类产品类别… │  ☐   │   ☑    │  0 不发 ▾│
└────────────────────┴──────┴────────┴──────────┘
```

选项源仍用**全集常量**（`ISSUE_LABELS` / `ALL_RISK_CATEGORIES`），不能拿已勾选子集当选项源——V4.0.0 踩过这个坑（取消勾选后选项消失、再也勾不回来）。

**`LanxinPushDrawer.vue` 与 `lib/lanxin/items.ts`**：前端只需知道"哪些项启用"用于算事项，`primary` / `supervisorLevels` 是后端的事。把 `rProj.reasons` 改为 `rProj.items.filter(i => i.enabled).map(i => i.code)`，`items.ts` 的两个函数签名**不变**（仍收 `allowedCodes: string[]`）。

**跨语言白名单同步测试**（`reasonWhitelistSync.test.ts`，真读 `lanxin_config.py` 源码比对）**继续有效**：`REASON_WHITELIST` 本身不变，只是用法从"reasons 数组的合法取值"变成"items[].code 的合法取值"。

### B5. Part B 明确不做

- **不拆成 16 条独立路由**（见 B1 理由）
- **不做按人合并 primary 与 supervisor 卡**（性质不同）
- **不加撤回**。蓝信有撤回接口，但本版不实现，与 V4.0.0 的判断一致
- **不动收件人解析链**（`resolve_project_manager` / `supervisor_chain` / 花名册读取）

---

## 3. 测试

**Part A**
- 迁移：v1 结构 → v2 且 scope/current/archives 逐字保留；**幂等**（对 v2 结构再跑一次不变）；缺文件 / 损坏 JSON → 单个空实例
- `instanceId` 不存在 → 400；删最后一个实例 → 400；删除连带清 archives
- `copyFrom` 只复制 scope、不复制 current/archives
- 权限矩阵：3 个新端点非超管 403；`update` 普通用户可用
- 审计：3 个新端点在 `_ACTION_MAP` 中（比照 `test_lanxin_wiring.py` 的写法，直接断言映射表有条目）
- **前端 key 迁移回归**：预置旧 key 的选列值 → 挂载后「默认跟进」实例读到的正是旧值；二次挂载不重复迁移

**Part B**
- 迁移：旧 `issueCodes`/`reasons` → `items`，勾选项 `enabled: true`、其余 `false`，`primary`/`supervisorLevels` 继承原 `recipients`
- **行为等价性**（本 Part 最重要的一条）：对同一份 items，用"迁移后的配置"跑 `build_plan`，结果与"迁移前的配置跑旧实现"**逐字段相等**。管理员不动配置就不该有任何行为变化
- 逐项 `primary=false` → 该 label 不进 primary 卡、但仍进汇总
- **不同 levels 混合**：labelA 配 +1、labelB 配 +3，断言 +1 上级只看到 A、+3 上级只看到 B，且同一上级若两者都命中则**只出一张卡、卡内两行**
- `levels=0` 的项不产出任何汇总
- 白名单缺项自动补 `enabled: false`（新增问题码不炸旧配置）
- 汇总卡副标题恒为「团队汇总」；`_level_of`/`_LEVEL_LABELS` 已删除（grep 零残留）

**变异验证**（本仓惯例，防假绿）：至少对"行为等价性"与"不同 levels 混合"两条做变异——把合并逻辑改回单次 `_rollup`，确认测试变红。

---

## 4. 部署影响

- **无需点「更新数据」**：两处都不进数据管线，改的是 `data/temp_followup.json` 与 `data/lanxin_config.json`，经 `/api/*` 直接读写
- **需要重启后端**：改了 `temp_followup.py` / `lanxin.py` / `lanxin_config.py` / `server.py` / `audit.py`
- **无新增页面 / 路由 / pageKey / 授权项**
- **两份 data JSON 会被自动迁移**。建议升级手册要求升级前手动备份 `data/temp_followup.json` 与 `data/lanxin_config.json`——迁移是读取时自动完成、随下次写入落盘，一旦落盘就无法用旧版读取（旧版会把 v2 结构当损坏文件降级成空 store，**归档会看起来"丢了"**）。这是回滚时的真实风险，必须在手册里写明"回滚前先还原备份"
- 蓝信凭证仍未申请，Part B **无法联调**，能验到的边界与 V4.0.0 相同（配置读写、预览、被闸拒绝）

---

## 5. 本版明确不做

- 不给 `/risk`、`/opportunities/key`、`/payment/key`、`/projects/key` 做多实例
- 不做蓝信消息撤回
- 不重构 `TempFollowupView` 的"两份手工字段清单"（`tempScope.FIELD_CATALOG` 与本地 `ALL_COLUMNS`）——V4.0.1 已记该债，与本版无关
- 不动 `lts/`（精简变体已去除临时跟进域，且无蓝信）
