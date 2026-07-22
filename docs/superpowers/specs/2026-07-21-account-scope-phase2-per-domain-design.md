# 账号权限细粒度升级 — Phase 2：分数据域范围（default + per-domain override）设计

> 细粒度权限升级整体愿景的 **Phase 2** 设计（spec）。承接 Phase 1（V4.2.0，`allowedL4`+`allowedStaff` 全局范围）。
> master 分支，基线 V4.2.0。交流语言简体中文。

## 1. 背景与目标

Phase 1 交付了「一个全局数据范围（`allowedL4`+`allowedStaff`）」。Phase 2 要让**不同数据域看不同范围**（如「回款域看全部、工时域只看本组」）。

**为什么按域、不逐页**（brainstorm 拍板，基于 Explore 实测成本）：前端无集中数据访问层，~17–25 个 view 各自直读原始 store、零 scope 过滤；同域多页共享**同一份**服务端下发快照。故：
- **按域**：同域所有页共享一份服务端下发数据 → 服务端按域过滤即可、**前端业务页零改动、无漏页风险**——与 Phase 1 同量级的「后端 + 配置」小工程。且「回款域 vs 工时域」本就是域级差异，按域即满足。
- **逐页**：同域多页共享一份 fetch 却要各看不同子集 → 必须新建前端逐页收窄层（逐个改 view、无编译器强制、漏一个那页范围就偏）。成本高一个数量级，本期**不做**。

**Phase 2 目标（本 spec）**：账号在 Phase 1 全局范围之上，可为**三个数据域**各自设一个覆盖范围；缺省则用全局（默认）范围。全服务端强制、前端业务页零改动。

## 2. 数据模型（在 Phase 1 之上纯加字段）

账号对象保留 Phase 1 的 `allowedL4` + `allowedStaff`，语义正名为**默认范围**（未单独设置的域用它）。新增 `domainScopes`：

```
{
  ...Phase1: allowedL4, allowedStaff...,          // = 默认范围
  "domainScopes": {                               // 新增,默认 {}
    "project":     { "l4": [...], "staff": [...] },   // 缺省则不出现该键
    "yitian":      { "l4": [...], "staff": [...] },
    "opportunity": { "l4": [...], "staff": [] }        // 商机只用 l4,staff 恒忽略
  }
}
```

- **三个域键**（唯一合法键）：`project` / `yitian` / `opportunity`。
- **有效范围** = 「该域在 `domainScopes` 里 → 用它自己的 `{l4,staff}`；不在 → 回退默认范围 `{allowedL4, allowedStaff}`」。
- **「显式空覆盖」vs「缺省」是两种不同语义**（承重区分）：
  - 域**缺省**（`domainScopes` 无该键）→ 用默认范围。
  - 域**显式为** `{l4:[], staff:[]}` → 该域**看不到任何数据**（合法，如「此账号工时域看本组、项目域啥也不看」）。
- **`'*'` 语义不变**：某域有效 `l4` 含 `'*'` → 该域全部（`staff` 无意义）。默认范围 `allowedL4=['*']` 且该域缺省 → 该域全部。
- **迁移/向后兼容**：既有账号无 `domainScopes` 字段 → 读作 `{}` → 所有域走默认 → 行为与 Phase 1 **逐字一致**。`public_user` 补默认 `{}`。

## 3. 三个域的精确边界（关键，防范围蔓延）

三个 scoping 域**精确对应三个服务端已做 L4 过滤的数据源**，一一映射、不多不少：

| 域键 | 数据源 / 端点 | 过滤方式 |
|---|---|---|
| `project` | `analysis_data`（`handle_data_json`，`/data/analysis_data.json`）——项目/已关闭/回款节点/回款流水/里程碑/利润/**项目内跟进 followupRecords**/事件/治理质量页 | `filter_analysis_data(data, l4, pm_names)`（Phase 1 已支持） |
| `yitian` | `yitian_data`（`handle_yitian_data`，`/api/yitian/data`）——roster/entries/issues | `scope_yitian_data(data, l4, staff)`（Phase 1 已支持） |
| `opportunity` | 商机清单 `opportunities.json`（`handle_opportunities_get` 读、`handle_opportunities_create/update` 写越权 `can_access_l4`、delete 后 `filter_for_account`） | `_opp.filter_for_account(rows, l4, isSuper)` / `_opp.can_access_l4(l4, allowed, False)`；**只用 l4** |

**明确不在任何 scoping 域**（既有设计边界，Phase 2 不改）：**独立 followup store**——`risk_followup` / `temp_followup` / `payment_key_followup` / `opportunity_followup`（商机跟进，≠ 商机清单）/ `project_progress`。这些 store **现状就不做 L4 隔离**（整份下发给任意登录用户、前端按用户自设 ScopeBuilder 现算，写操作才超管专属）。Phase 2 沿用此边界、**不把它们纳入任何域**。（注：项目内跟进 `followupRecords` 是 `analysis_data` 的一部分、随 `project` 域过滤；独立的 `*_followup` store 是另一套数据，勿混。）

## 4. 生效

- 新增纯函数 `auth.effective_scope(rec, domain) -> (l4_list, staff_list)`：域覆盖优先、否则回退默认范围。`domain` ∈ 三个域键。
  ```
  ds = (rec.get('domainScopes') or {}).get(domain)
  return (ds['l4'], ds['staff']) if isinstance(ds, dict) else (rec['allowedL4'], rec['allowedStaff'])
  ```
- 三个端点各按自己的域取 `effective_scope` 再过滤，**复用 Phase 1 既有过滤函数**：
  - `handle_data_json`：`l4, staff = effective_scope(rec, 'project')`；`if isSuper or '*' in l4: 原始文件`；否则 `filter_analysis_data(data, l4, _staff_pm_names(staff))`。
  - `handle_yitian_data`：`l4, staff = effective_scope(rec, 'yitian')`；`if isSuper or '*' in l4: 全量`；否则 `scope_yitian_data(data, l4, staff)`。
  - 商机（`handle_opportunities_get` / `_create` / `_update` / `_delete` 内的 filter）：`l4, _ = effective_scope(rec, 'opportunity')`，把原先各处的 `rec.get('allowedL4', [])` 换成这个 `l4`（读过滤 + 写越权 `can_access_l4` 一并换，保证「配到某域 L4 的账号只能读/写该域该 L4」一致）。
- **超管 / `'*'` 短路不变**：`isSuper` 恒全量；某域有效 l4 含 `'*'` → 该域全部。
- **前端业务页零改动**：域=服务端下发单位，过滤后即所见；不建逐页收窄层。

## 5. 配置 UX（AdminView）

- 现有「可见 L4」「可见员工」两项归拢到一个**「默认范围」**区块，加副标题「未单独设置的数据域用它」。
- 其下新增可折叠**「分域覆盖（可选）」**：三行对应 `项目&回款` / `工时` / `商机`，每行一个开关「**继承默认**（默认态）／**自定义**」：
  - 切到「自定义」→ 展开该域的 `可见 L4` 多选（复用默认区的 L4 选项源）+ `可见员工` 多选（复用 `/api/admin/roster`，显姓名存工号）。
  - **商机行只有 `可见 L4`**（无「可见员工」——商机不做工号级）。
- **表单 → 载荷**：`domainScopes = {}`；仅对开关=「自定义」的域写入 `domainScopes[domain] = {l4, staff}`（商机 `staff` 恒 `[]`）。「继承默认」的域不写入该键（= 缺省回退）。
- 账号表格「可见范围」列（Phase 1 已有）在有分域覆盖时于列尾追加一个标记「＋分域」（详情在编辑弹窗看），无覆盖则不变。
- **前端类型**：`admin.ts` 的 `AdminAccount` 加 `domainScopes?`；`createAccount`/`updateAccount` 载荷加 `domainScopes`。`AuthUser`（`lib/auth.ts`）**不加**（前端 gating/收窄不消费它，YAGNI；`/api/auth/me` 多下发一个字段无害、TS 忽略）。

## 6. 安全不变量

1. **服务端强制、按域**：每个域的过滤在服务端完成；账号在某域**永远拿不到**该域有效范围外的数据。前端零收窄 → **不存在漏页导致的范围偏差**（域内所有页拿的是同一份已按域过滤的数据）。
2. **商机读写一致**：商机域 L4 同时管读过滤与写越权（`can_access_l4`），避免「能写不能读」或反之的错配。
3. **超管不受限**：`isSuper` 三域恒全量。
4. **默认范围回退不放大**：域缺省仅回退到账号自己的默认范围（Phase 1 的 `allowedL4`/`allowedStaff`），绝不回退成「全部」。
5. **显式空覆盖 = 该域看不到**（§2），是特性不是 bug；校验允许空数组。

## 7. 边界与错误处理

- `domainScopes` 非 dict / 含未知域键（非三者之一）/ 某域值非 dict / l4·staff 非法 → 校验抛 `ValueError`，端点返 4xx。
- 域缺省 → 回退默认；域显式空 → 该域空。默认范围 `allowedL4=['*']` → 缺省域全部。
- 商机域即便配了 `staff` 也被忽略（下游只用 l4）；UI 不提供商机 staff 入口。
- 花名册缺失 → `project`/`yitian` 域的 staff→PM 姓名解析为空、员工选择器空（沿用 Phase 1，不阻断）。

## 8. 测试计划

- **`auth`（纯函数，先测后写）**：
  - `effective_scope`：域覆盖优先、缺省回退默认、显式空覆盖返回空、三域各测；`domainScopes` 为 None/{} 时全回退（迁移）。
  - `domainScopes` 校验：合法三域键通过、未知键拒、非 dict 拒、l4/staff 复用 `_validate_str_list`；`public_user` 含 `domainScopes`；无字段账号读作 `{}`。
  - create/update 带 `domainScopes` 落库；update `domainScopes=None` 不改。
- **`server`（集成，复用 Phase 1 test harness）**：
  - 账号 `allowedL4=['*']`（默认全部）+ `domainScopes.yitian={l4:[X]}` → `/data/analysis_data.json` 全量（project 域回退默认 `*`）、`/api/yitian/data` 仅 X 组员工。
  - 账号默认 `allowedL4=[D1]` + `domainScopes.project={l4:['*']}` → 项目域全部、工时域仅 D1。
  - 商机：`domainScopes.opportunity={l4:[D2]}` → `handle_opportunities_get` 仅 D2 行；create 一条 D1 商机 → `can_access_l4` 拒（403/校验）。
  - 显式空覆盖 `domainScopes.project={l4:[],staff:[]}` → 项目数据空。
  - 迁移:无 `domainScopes` 账号行为同 Phase 1（回归安全网）。
- **前端（vitest）**：AdminView「分域覆盖」开关：继承默认 → 载荷无该域键；切自定义 → 载荷含 `domainScopes[域]={l4,staff}`；商机行无员工选择器且载荷 `staff:[]`；编辑既有带 `domainScopes` 账号回显开关态。
- `verify.sh` 全绿；改 `auth.py`/`server.py` 计算逻辑先补/改测试；真实数据冒烟：建「默认全部 + 工时域仅某 L4」账号，核对 `/payment` 全量而 `/yitian` 仅该组。

## 9. 明确不做（本期范围外）

- **真·逐页范围**（同域内不同页不同子集）与前端逐页收窄层——按域已覆盖用例，页级留到真有需求。
- **独立 followup store（risk/temp/payment_key/opportunity-followup/progress）的 L4 隔离**——沿用既有「不隔离」边界。
- **只读/读写分离、字段/列级隐藏**——正交维度，后续独立开期。
- **`AuthUser` 加 `domainScopes`**——前端无消费者。
- **项目经理姓名→工号精确解析入管线**——Phase 1 遗留的重名过匹配限制不在本期清。

## 10. 验证

按 `CLAUDE.md` §6：`bash verify.sh` 全绿方算完成；改 `auth.py`/`server.py` 计算逻辑先补/改测试再改实现；前端至少手动启动核对 `/admin` 分域覆盖配置与某受限账号跨域的真实数据范围（默认全部 + 工时域仅某 L4 → `/payment` 全、`/yitian` 限）。
