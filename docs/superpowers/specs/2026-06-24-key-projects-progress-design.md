# 「重点跟进」分区 + 重点项目进展页 设计文档（SP-2）

> 日期：2026-06-24　版本：V1.20.0（新增整页 + 新后端持久化，Y 位）
> 所属拆分：用户大需求(6 项)拆 4 子项目之 SP-2（旗舰件）。SP-1(侧边栏折叠)已完。余 SP-3(/insight/risk 透视下钻)、SP-4(/insight/milestone 到期提醒表) 后续独立。
> 状态：设计已与用户多轮确认，待用户复核本 spec 后转 writing-plans。

## 1. 目标

新增顶级导航分区「重点跟进」（项目分析下、回款上），其下新增页面 `/projects/key`「重点项目进展」：表格展示**重点项目集**（取数=TOP1000 大客户 &（合同>100万元 or 级别 P1）），两列「本周工作进展/后续工作计划」由管理员编辑、持久化、记录输入时间与账号；含派生「跟进日期/跟进人」；支持选列/筛选/排序/导出/点行跳详情；含「更新」归档（冻结当前为历史快照并清空两列、按取数范围重算）+ 历史快照查看 + 多数据集导出。

## 2. 取数与字段口径（用真实数据核对）

**重点项目过滤** `isKeyProject(p, pmis)`：
```
p.top1000 === '是' && ((p.paymentPmis?.contract ?? 0) > 1000000 || v(pmis.status?.项目级别) === 'P1')
```
当前数据 ≈ **21 个**项目。说明：
- `top1000` 已是售前→原项目口径（V1.19.1）。
- `paymentPmis.contract` **单位为元**，且对售前服务类**已是原项目合同**（实测 297 售前项目 207 个 `paymentPmis.contract`==原项目合同、自身合同全空），自动满足"售前合同取原项目"，无需额外逻辑。阈值 `> 1_000_000`（>100万元，严格大于）。
- 项目级别取值 P1/P2/P3/P4（`pmis.status.项目级别`），过滤 `=== 'P1'`。

**列字段来源**（14 列）：

| 列 key | 列名 | 取数 |
|---|---|---|
| projectId | 项目编号 | `p.projectId` |
| customer | 客户 | `pmis.customer.最终客户` |
| projectName | 项目名称 | `p.projectName` |
| projectLevel | 项目级别 | `pmis.status.项目级别` |
| projectManager | 项目经理 | `p.projectManager` |
| ar | AR | `pmis.team.AR`（全有值） |
| sr | SR | `pmis.team.SR`（部分空） |
| orgL4 | L4组织 | `p.orgL4` |
| contractWan | 合同金额(万) | `p.paymentPmis.contract / 10000` |
| risk | 风险 | **与 /projects 一致**：`riskLevel`=`pmis.risk.最高等级 \|\| '无'`、`openRisks`=`Number(pmis.risk.未关闭风险数 ?? 0)`，显示 `openRisks ? \`${riskLevel}(${openRisks})\` : riskLevel` |
| weekProgress | 本周工作进展 | 进展记录(可编辑)，见 §4 |
| nextPlan | 后续工作计划 | 进展记录(可编辑)，见 §4 |
| followDate | 跟进日期 | `max(weekProgressEditTime, nextPlanEditTime)`（空串忽略，取较大；皆空→空） |
| followBy | 跟进人 | `[weekProgressEditBy, nextPlanEditBy]` 去空去重；两者不同则 `、` 并列 |

空值统一用现有 `v()` helper（空→`'-'` 或 `''`，与 projectList 同款，表格列默认占位）。

## 3. 数据模型与后端

进展数据**独立持久化**，不进 `analysis_data.json`，「更新数据」(reprocess) 不影响它；改进展即时生效。

**新文件** `data/project_progress.json`（gitignore，含业务文本，禁提交）：
```json
{
  "version": 1,
  "current": {
    "<projectId>": {
      "weekProgress": "文本", "weekProgressEditTime": "2026-06-24 10:30:00", "weekProgressEditBy": "wangxutong",
      "nextPlan": "文本", "nextPlanEditTime": "2026-06-24 11:00:00", "nextPlanEditBy": "admin"
    }
  },
  "archives": [
    { "archiveTime": "2026-06-24 18:00:00", "rows": [ { ...冻结的结构化行... } ] }
  ]
}
```

**server.py 新增**（仿 followup/tags 内联模式）：
- 常量 `PROGRESS_FILE`（与 `FOLLOWUP_FILE`/`PROJECT_TAGS_FILE` 同目录解析，开发/frozen 双模式）；锁 `_progress_lock`。
- `_load_progress()`：缺文件→`{"version":1,"current":{},"archives":[]}`；损坏→同默认（不抛）。
- `_save_progress(store)`：`with _progress_lock` 落盘 `json.dump(..., ensure_ascii=False, indent=2)`。
- `_current_account(self)`：`auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))`，返回账号串或 None。

**端点**（路由接入 do_GET/do_POST 分发）：

| 端点 | 方法 | 鉴权 | 行为 |
|---|---|---|---|
| `/api/progress` | GET | 任意登录(`_auth_gate`) | 返回 `{success, current, archives}`（archives 含 archiveTime+rows） |
| `/api/progress/update` | POST | 任意登录 | body `{projectId, field, content}`，`field ∈ {weekProgress, nextPlan}`（非法→400）；`current[projectId][field]=content`、`[field+"EditTime"]=now`、`[field+"EditBy"]=_current_account`（账号空→401）；保存；返回 `{success, record}` |
| `/api/progress/archive` | POST | **超管专属**(入 `_SUPER_ONLY_PATHS`，非超管→403) | body `{rows:[...]}`；`archives.append({archiveTime:now, rows})`；`current={}`（清空两列开始新一期）；保存；返回 `{success, archives}` |

`now` 格式 `YYYY-MM-DD HH:MM:SS`（同 followup 跟进时间）。

## 4. 前端接入（nav / 路由 / 门禁 / 侧边栏）

- `nav.ts`：新增 `KEY_FOLLOWUP_LINKS = [{ label:'重点项目进展', to:'/projects/key', key:'projects-key' }]`，置于 `ANALYSIS_LINKS` 与 `PAYMENT_LINKS` 之间。
- `router/index.ts`：`{ path:'/projects/key', name:'projects-key', component: KeyProjectsView, meta:{ title:'重点项目进展', hideFilter:true, pageKey:'projects-key' } }`（静态路径，不与 `/projects`、`/projects/closed`、`/project/:id` 冲突）。
- `lib/pageAccess.ts`：`PageKey` 联合类型加 `'projects-key'`（与其它页同款；超管恒可见、普通管理员需 `allowedPages` 含此 key）。
- `layout/AppSidebar.vue`：新增「重点跟进」分区，**沿用 SP-1 折叠**（`<div class="section" :class="{collapsed:!expanded('keyfollowup')}">` + button + caret + `v-show` 包子链接），插在项目分析与回款之间；`activeSectionKey` **新增** `if (p.startsWith('/projects/key')) return 'keyfollowup'`，**排在 project 兜底前**（兑现 SP-1 终审提醒）。子链接用 `.nav-sub`（与相邻 analysis 视觉一致）→ `AppSidebar.test.ts` 的 `.nav-sub` 计数 12→13、加「重点项目进展」可见断言。

## 5. 页面 KeyProjectsView + lib/keyProjects.ts

**lib/keyProjects.ts**（纯函数）：
- `isKeyProject(p, pmis)`（§2 过滤）。
- `KeyProjectRow` 接口：14 列字段 + 原始进展字段（weekProgress/weekProgressEditTime/weekProgressEditBy/nextPlan/nextPlanEditTime/nextPlanEditBy）+ 派生 followDate/followBy + riskLevel/openRisks。
- `buildKeyProjectRows(projects, pmisMap, current)`：`projects.filter(isKeyProject).map(...)`，合并 `current[projectId]` 进展，算 followDate/followBy。
- `followDate(rec)`：两 editTime 取较大非空。`followBy(rec)`：两 editBy 去空去重，`、` 连接。

**views/KeyProjectsView.vue**：
- 复用 /projects 表格全套：`ALL_COLUMNS`(14 列 DataColumn) + `DEFAULT_VISIBLE` + `FILTERABLE` Set + `useColumnPrefs`(TABLE_ID `key-projects`) + `ColumnPicker` + `ColumnFilter` + `crossFilter` + `DataTable`(排序) + 行点击 `router.push('/project/'+id)`。
- 进展两列 formatter：有内容→`${editTime}：${content}`；空→`'点击填写'`（当前数据，超管/普通均可点编辑）/`'-'`（历史只读）。
- **数据集选择器**（SegToggle/下拉）：`当前数据`（默认，可编辑）｜ 各历史快照（label=archiveTime，**只读**）。选历史→行来自该 archive.rows、进展列不可点。
- **「更新」按钮**（`v-if="auth.isSuper"`）：点→确认弹窗（"将归档当前数据并清空两列进展，开始新一期？"）→ `store.archive(当前已构建行)` → 调 `/api/progress/archive` → 刷新；表格按取数范围重算（成员随项目数据增减）。
- **「导出」按钮**（`v-if="auth.isSuper"`）：点→导出弹窗，多选数据集（`当前数据` + 任意多个历史快照）→ 每个数据集一个 sheet 的 xlsx；导出行=该数据集经**当前表头列筛选**后的行（"旧数据支持筛选导出范围"=选哪些快照 + 列筛选）。复用 `exportXlsx`/`exportSheets`。
- 编辑入口：当前数据下点进展单元格 → `ProgressEditModal`。

**components/ProgressEditModal.vue**：项目名/编号只读 + `field` 标题（本周工作进展/后续工作计划）+ textarea(多行) + 取消/保存；保存→`useProjectProgressStore().update(projectId, field, content)`。

**stores/projectProgress.ts**（仿 projectTags）：`current: Record<string, ProgressRecord>`、`archives: Archive[]`、`loaded`；`load()`、`update(projectId, field, content)`（调 api 后更新本地 current）、`archive(rows)`（调 api 后用返回的 archives 刷新、清空 current）。

**lib/projectProgressApi.ts**：`getProgress()`、`updateProgress(projectId, field, content)`、`archiveProgress(rows)`。

## 6. 权限模型

| 能力 | 谁 | 机制 |
|---|---|---|
| 看页面 / 选数据集 / 查历史 | 任意有 `projects-key` 页面权限的登录用户（超管恒有） | pageAccess + 路由守卫 |
| 编辑进展单元格 | 任意登录管理员 | 前端当前数据可点；`/api/progress/update` 走 `_auth_gate`（非超管专属） |
| **「更新」归档** | **仅超管** | 前端 `v-if="auth.isSuper"`；后端 `/api/progress/archive` 入 `_SUPER_ONLY_PATHS`（非超管 403） |
| **「导出」** | **仅超管** | 前端 `v-if="auth.isSuper"`（纯前端功能，无后端） |

超管即现有 `isSuper` 账号（admin/wangxutong/zhangyingzhe），按角色判定，不硬编码账号名。L4 隔离：页面读 `useDataStore().data.projects`（每请求 L4 切片），普通管理员只见/编自己 L4 的重点项目。**已知限制**：`/api/progress/update`/`GET` 不强制 L4（与 followup/tags 同款折中威胁模型）；archive 已超管专属。

## 7. 边界 / 错误

- 进展文件缺失→`current={}`、`archives=[]`，所有重点项目可编辑（首次写时建档）。
- 会话失效/未登录写→401，前端弹窗提示。
- 非法 `field`→400。
- 重点集随项目数据变化：`更新` 后新合格项目入表(进展空)、不再合格项目移出(其 current 记录保留但不显)。
- 历史快照只读，进展列不可编辑、无编辑入口。
- archives 全量随 GET 返回（每档 ~21 行，量小；后续如膨胀再分页，YAGNI）。
- 进展数据不进 analysis_data.json；reprocess 不动它。

## 8. 测试

- **后端 pytest**：`_load_progress` 缺文件/损坏降级；`/api/progress/update` 盖章(time+account)+落盘+非法 field 拒+账号空 401；`/api/progress/archive` 追加快照+清空 current+超管专属(非超管 403)+并发锁；GET 返回结构。
- **前端 vitest**：`isKeyProject` 四组合边界(top1000×(合同>100万/P1))；`buildKeyProjectRows` 列映射+合并进展；`followDate`(max/空)、`followBy`(去重/并列/单/空)；KeyProjectsView 渲染+点单元格开弹窗+保存+数据集切换(当前可编/历史只读)+更新按钮超管可见普通隐藏+导出按钮超管可见+导出多选多 sheet；ProgressEditModal 保存；store/api。
- **验证**：`bash verify.sh` 全绿；手动冒烟：超管登录走查重点集(~21)、编辑两列、更新归档+清空、切历史只读、多选导出；普通管理员登录确认看不到更新/导出按钮但可编辑。

## 9. 范围与非目标

- 非目标：进展富文本/附件（纯文本）；进展逐次历史(只存当前+归档快照，不存单格编辑流水)；archives 分页/检索；L4 强制于读/编端点（折中，仅 archive 超管化）；不实现 SP-3/SP-4。
- 版本 V1.20.0（`frontend/src/version.ts`），与累积未上线版本一并待打包。禁止 emoji；commit 末尾 `Co-Authored-By` 行；spec/plan 文档写盘不 commit。
