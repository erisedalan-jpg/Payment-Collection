# 账号权限细粒度升级 — Phase 1：数据范围下沉到员工级（全局范围，值升级为 L4+工号）设计

> 本文是**细粒度权限升级**整体愿景下的 **Phase 1** 设计（spec）。Phase 2（逐页范围）另出独立 spec。
> 面向 master 分支，当前基线 V4.1.3。交流语言简体中文。

## 1. 背景与目标

当前权限只有两个旋钮：① 页面级（`allowedPages`，27 个 pageKey 或 `*`）；② 数据级（一个**全局** `allowedL4`，对所有页面、所有数据域一刀切过滤）。隔离下限只到 **L4 组**（交付实施三部下的子组织）。

三个空白：账号模型无员工绑定字段（无法精确到人）、`allowedL4` 全局不可分页面、花名册无汇报线。

经 brainstorm 拍板，整体升级面向**少数管理者账号**（超管手工建），**不引入角色体系、不做员工自助登录、不做批量开通**，只做主轴「页面访问 + 逐页数据范围」；只读/字段级隐藏为**正交维度、本次不做**。

**Phase 1 目标（本 spec）**：把账号的数据范围值从「只能填 L4」升级为「可填 L4 组 + 具体工号」，实现**员工级隔离**——把某账号限定到某几个员工（工时）/某几个项目经理负责的项目。范围仍是**账号级一个全局范围**（等价今天的 `allowedL4`，只是能点名到人），先把「工号级过滤 + 两条 join」这套地基跑通。

## 2. 整体愿景与分期（终态，供上下文；本 spec 只交付 Phase 1）

终态：账号的数据范围值统一为 `Scope = '*' | { l4: string[], staff: string[] }`（`l4`=组织组，`staff`=工号），每页一个有效 Scope（`pageScopes[页]` 缺省回退全局），服务端按域求可见页 Scope 并集下发、前端逐页收窄。

分期（各期自成闭环、单独 spec/上线）：

- **Phase 1（本 spec）— 员工级隔离，全局范围**：账号增 `allowedStaff`（工号列表），与既有 `allowedL4` 并列构成**一个全局范围**。后端 `data_scope` 按并集过滤。配置 UI 升级为「可见范围 = L4 组 + 工号（显示姓名）」。**不做逐页、不做前端收窄**（全局范围下服务端下发即所见）。
- **Phase 2（后续）— 逐页范围**：在 Phase 1 全局之上**叠加** `pageScopes[pageKey]` 逐页覆盖；后端改为「按域求可见页有效 Scope 并集」；前端每页按本页 Scope 收窄；配置 UI 出逐页矩阵（默认「继承全局」）。Phase 1 的 `allowedL4`/`allowedStaff` 作为该账号的默认全局 Scope，Phase 2 纯**加字段**、不回迁 Phase 1 字段。

采用「flat 双字段（`allowedL4` + `allowedStaff`）」而非一次性引入 `Scope` 对象：Phase 1 零迁移、既有 `allowedL4` 代码/UI 原样留用，Phase 2 的 `pageScopes` 亦为纯加字段——两期都向后兼容。

## 3. 数据模型（account 记录）

`data/accounts.json` 的账号对象**新增一个字段** `allowedStaff`（工号列表，字符串数组），与既有 `allowedL4` 并列：

```
{
  ...salt/hash/isSuper/allowedPages/displayName/mustChangePassword...,
  "allowedL4":   ["<L4组名>", ...] | ["*"],   // 既有,不变
  "allowedStaff": ["<工号>", ...]             // 新增,默认 []
}
```

- **工号是稳定标识**，`allowedStaff` 存工号；前端选择/展示一律用**姓名**（见 §7），工号仅在重名消歧时出现。
- **全局范围 = L4 与工号的并集**：某数据项命中当前账号 ⟺ 它按 L4 命中（`orgL4/员工L4 ∈ allowedL4`）**或**按工号命中（见 §4 各域语义）。
- **`*` 短路不变**：`allowedL4` 含 `'*'` ⟹ 该账号看全部，`allowedStaff` 无意义（全部已含）。工号侧**无 `'*'`**——「全部员工」即 `allowedL4=['*']`。
- **「只看某几个人」= `allowedL4=[]` + `allowedStaff=[工号...]`**：无任何 L4、仅工号命中。
- **迁移**：既有账号无 `allowedStaff` 字段 ⟹ 读取时视作 `[]`，行为与今日**逐字一致**（back-compat 回归安全网）。`public_user` 补默认 `[]`。

## 4. 各域匹配语义

| 数据域 | L4 命中 | 工号命中（`allowedStaff`） | 是否本期做工号 |
|---|---|---|---|
| **项目&回款**（`analysis_data`：项目/已关闭/回款节点/回款流水/里程碑/利润/项目内跟进/事件） | `orgL4 ∈ allowedL4` | **项目经理姓名 ∈ 姓名集**，姓名集 = `allowedStaff` 工号经花名册解析出的姓名 | 是 |
| **工时**（`yitian_data`：roster/entries/issues） | `员工所属 l4 ∈ allowedL4` | **员工工号(`entry.e`) ∈ allowedStaff**（工时行原生带工号，精确命中） | 是 |
| **商机**（`opportunities`） | `行 l4 ∈ allowedL4` | 不做（数据无天然工号归属） | 否 |

命中一律取**并集**（L4 命中 **或** 工号命中即保留）。项目/工时的 L4 侧行为与今日不变，工号侧为新增并集项。

**项目经理工号→姓名解析（关键 join）**：项目里 `projectManager` 存的是**姓名**、非工号。故服务端先把 `allowedStaff`（工号）经花名册（`组织架构.xlsx`，工号→姓名）解析为**姓名集** `pm_names`，项目按 `projectManager ∈ pm_names` 命中。**重名限制**：若两工号同名而仅其一在 `allowedStaff`，按姓名匹配会连带命中同名者管的项目（过匹配）——这是与既有「项目经理姓名 1:N」处理一致的已知边界，本期**记为限制、不做工号级精确解析**（Phase 2 若引入 `projectManagerId` 入管线可精确化）。工时侧无此问题（工时行原生带工号，精确）。

## 5. 后端设计

### 5.1 `data_scope.py`（纯函数扩展，保持不改入参）

- `filter_analysis_data(data, allowed_l4, pm_names=None)`：新增第三参 `pm_names`（服务端解析好的项目经理姓名集，`None`/空集 ⟹ 行为同今日）。
  - `allowed_project_ids` 与项目过滤：保留条件由 `orgL4 ∈ allow` 改为 `orgL4 ∈ allow or projectManager ∈ pm_names`。`relatedClosedId`、`_PID_KEYED` 各块、`events`、`meta` 重算逻辑不变，只是 `keep` 集因并集变大。
  - `'*' ∈ allowed_l4` 短路（原样返回）不变。
  - `closedProjects` 仅按 `orgL4`（已关闭项目无当前项目经理归属，工号侧不放大；保持 L4）。
- `scope_yitian_data(data, allowed_l4, allowed_staff=None)`：新增第三参 `allowed_staff`（工号集，`None`/空 ⟹ 行为同今日）。
  - `keep_ids`（保留员工工号集）由「`roster` 中 `l4 ∈ allow` 的工号」**并上** `allowed_staff ∩ 花名册工号`（只放行确在本数据花名册里的工号，避免脏值）。`keep_roster` 相应扩为「`l4 ∈ allow` 的 roster 项 ∪ 工号 ∈ allowed_staff 的 roster 项」。
  - `entries`/`issues` 保留 + `issues[].i` 下标重映射逻辑不变（仍按 `keep_ids`）。`'*'` 短路不变。
- **纯函数不读花名册文件**：`pm_names` 由 server 解析后传入（data_scope 不依赖 IO）。`allowed_staff` 直接传工号集（工时 join 只需工号，无需姓名）。

### 5.2 `auth.py`（账号模型）

- `_make_user(..., staff=None)`：记录增 `'allowedStaff': staff if staff is not None else []`。种子超管默认 `[]`（超管走 `'*'` 逻辑、不受限，见 §8）。
- `public_user`：增 `'allowedStaff': rec.get('allowedStaff', [])`（迁移默认 []）。
- `create_account`/`update_account`/`add_account`/`edit_account`：签名增 `staff`（update 为可选 kwarg，`None`=不改）。校验用新增 `_validate_staff_list`（同 `_validate_str_list` 的格式/去重逻辑，但**上限提升到可容纳整部门**，如 1000；工号 1-64 位字符串）。`update_account` 对超管账号的既有保护不变。

### 5.3 `server.py`（端点接线）

- **花名册提供**：新增/复用一个**工号→姓名 映射**与**花名册列表**的缓存访问器（读 `组织架构.xlsx`，字段 `{id(工号), name(姓名), l4}`；复用 `projects.read_org_roster` 或既有倚天花名册读取，避免二次解析）。供 §5.3 的 PM 解析与 §7 的选择器端点共用。花名册缺失 ⟹ 映射空、picker 空（不报错）。
- `handle_data_json`（现 ~2790）：取当前账号 `allowedStaff` → 经花名册解析为 `pm_names` → `filter_analysis_data(data, allowedL4, pm_names)`。超管/`'*'` 分支不变（原样返回，不必解析）。
- `handle_yitian_data`（现 ~2807）：`scope_yitian_data(data, allowedL4, allowedStaff)`。超管/`'*'`/倚天页权限判定不变。
- `handle_admin_account_create`/`handle_admin_account_update`（现 ~3775/~3794）：解析请求体 `staff`（缺省 `[]`/`None`），透传给 `auth.add_account`/`edit_account`。
- **新端点 `GET /api/admin/roster`**（超管专属，`/api/admin/` 前缀已被 `_authz_gate` 要求超管，无需另加 `_SUPER_ONLY_PATHS`）：返回 `[{id, name, l4}]` 花名册列表，供配置 UI 的员工选择器。仅返回工号/姓名/L4，**不含**电话/省市/岗位等隐私列（沿用倚天隐私列黑名单口径）。
- 审计：`account.create`/`account.update` 已在 `_ACTION_MAP`；范围含工号后可在详情里附「可见范围」变化（可选增强，不阻塞）。

## 6. 数据流

```
超管在 /admin 编辑账号
  → 选「可见范围」: L4 组多选 + 员工多选(显示姓名, 值=工号)
  → POST /api/admin/accounts/{create,update} { ..., l4:[...], staff:[工号...] }
  → auth 校验+落 accounts.json (allowedL4 + allowedStaff)

该账号请求数据:
  GET /data/analysis_data.json
    → allowedStaff --花名册--> pm_names(姓名集)
    → filter_analysis_data(data, allowedL4, pm_names)  // 项目: orgL4∈L4 或 PM∈pm_names
  GET /data/yitian_data.json
    → scope_yitian_data(data, allowedL4, allowedStaff)  // 工时: 员工L4∈L4 或 工号∈staff
  → 服务端下发已过滤数据 = 该账号全局范围(前端无需再收窄, Phase 1)
```

## 7. 前端设计

Phase 1 全局范围下，**服务端下发即所见**，业务页**无需改动**（不做逐页收窄）。前端改动集中在**账号配置界面** `AdminView.vue` 与 API/类型：

- **员工选择器（新）**：账号新建/编辑对话框「可见范围」区，在既有「可见 L4」多选下方增「可见员工」多选。
  - **选项显示姓名、值为工号**（`el-select` 的 label=姓名、value=工号）。数据源：`GET /api/admin/roster`。
  - **重名消歧**：同名多工号时 label 显示 `姓名（工号）`（工号是唯一稳定消歧标识，L4 仍可能同名相撞）；同名唯一时只显示姓名。
  - 可选：支持按姓名搜索、按 L4 分组，提升在 ~85 人中的选取体验。
- **表格「可见范围」列**：现列展示 L4 标签；增展示**员工姓名**（由 `allowedStaff` 工号经 roster 解析为姓名；工号已离册则回退显示工号并标注）。列名由「可见 L4」正名为「可见范围」。
- **API 封装** `lib/admin.ts`：`createAccount`/`updateAccount` 载荷增 `staff`。
- **类型**：`AuthUser`（`stores/auth.ts`）与 `public_user` 对齐增 `allowedStaff`（Phase 1 前端 gating 不依赖它，纯为一致性/未来 Phase 2 铺垫）。
- **不改**：路由守卫、`pageAccess`、各业务页取数逻辑一律不动。

## 8. 安全不变量

1. **服务端强制**：范围过滤在服务端完成，账号**永远拿不到**其全局范围外的数据（沿用今日 L4 隔离的服务端边界，`allowedStaff` 只**并集放大到本人有权的工号**，绝不越界）。`_is_protected_data_path` 对 `analysis_data.json` 走过滤下发的既有防绕过不变。
2. **超管不受限**：超管 `isSuper` 恒走全量/`'*'` 分支，`allowedStaff` 对超管无效（与 `allowedL4` 一致）。
3. **绝不泄露隐私列**：`/api/admin/roster` 只出工号/姓名/L4，倚天隐私列（电话/省市/岗位）绝不下发。
4. **工号脏值防御**：`allowed_staff` 命中前先 `∩ 花名册工号`，离册/伪造工号不放行任何数据。
5. **重名过匹配为已知有界限制**（§4）：仅影响「项目经理姓名匹配」，工时侧精确；记入技术债，Phase 2 可精确化。

## 9. 边界与错误处理

- `allowedL4=['*']`：全部，`allowedStaff` 忽略（短路）。
- `allowedL4=[]` 且 `allowedStaff=[]`：看不到任何 L4 项目/工时（与今日空 L4 一致）——空范围合法、不报错。
- `allowedStaff` 含离册工号：过滤时被 `∩ 花名册` 剔除，不放行；表格显示回退为工号+标注。
- 项目经理姓名重复：按姓名并集匹配，可能过匹配（§4 限制）。
- 花名册（`组织架构.xlsx`）缺失：`pm_names` 为空、roster 端点空 → 工号侧不放大、picker 空；L4 侧照常；不阻断。
- `staff` 参数非数组/超长/非法工号：`_validate_staff_list` 抛 `ValueError`，端点返 4xx。

## 10. 测试计划

- **`data_scope`（核心，先测后写 + 变异回归）**：
  - `filter_analysis_data`：`pm_names` 命中 PM 的项目（并 L4 一起保留、`_PID_KEYED`/`events`/`meta` 随之）；`pm_names=None/空` ⟹ 与今日逐字一致（back-compat）；`'*'` 短路；`allowedL4=[]` + `pm_names` 仅留 PM 项目。
  - `scope_yitian_data`：`allowed_staff` 命中员工工时行（并 L4 一起）、`issues[].i` 重映射正确指向；`allowed_staff=None/空` ⟹ 同今日；离册工号不放行；`'*'` 短路。
  - 变异验证：去掉工号并集分支 → 相关断言变红；破坏 `i` 重映射 → 变红。
- **`auth`**：create/update 带 `staff` 落库；`_validate_staff_list` 格式/去重/上限；`public_user` 含 `allowedStaff`；无字段账号读取返 `[]`（迁移）。超管保护不受影响。
- **`server`**：`/api/admin/accounts/{create,update}` 持久化 `staff`；`/api/admin/roster` 超管返回、非超管 403、不含隐私列；`/data/analysis_data.json` 对含 `staff` 账号应用 `pm_names`（集成，含 PM 命中/L4 命中/并集）；`/data/yitian_data.json` 应用 `allowedStaff`。
- **前端（vitest）**：`AdminView` 选择器**显示姓名而非工号**、值提交为工号；表格「可见范围」列渲染姓名；`admin.ts` 载荷含 `staff`；重名消歧展示。
- `verify.sh` 全绿（后端 pytest + ruff + 前端 typecheck/vitest/build）。

## 11. 明确不做（本期范围外）

- **逐页范围 / `pageScopes` / 前端逐页收窄**（Phase 2）。
- **只读/读写分离、字段/列级隐藏**（正交维度，后续独立开期）。
- **角色(role)体系、员工自助登录、账号批量/从花名册自动开通**（已拍板不做）。
- **商机域工号级**（数据无天然工号归属）。
- **项目经理姓名→工号精确解析入管线**（重名过匹配作为已知限制保留）。
- **已关闭项目按项目经理工号放大**（保持 L4）。

## 12. 验证

按 `CLAUDE.md` §6：`bash verify.sh` 全绿方算完成；改 `data_scope.py`/`auth.py` 计算逻辑**先补/改测试再改实现**；改前端至少手动启动核对 `/admin` 配置与某受限账号的真实数据范围（用真实花名册冒烟：建一个「仅某工号」账号，核对其 `/yitian/detail` 只见该员工、`/projects` 只见其管的项目）。
