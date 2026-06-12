# P8 数据治理页整页重设计 + 工具组收尾 + 打包专项核验 设计

> 母 spec：`2026-06-10-project-domain-dashboard-design.md` §3.6/§7 P8。版本 **V7.6.0**。
> 期前小型 brainstorm 已完成（2026-06-12），本文为其产出。

## 0. 前置决策：P7 暂停

用户决定（2026-06-12）：**P7（日历/临期跟进/台账 V2 令牌逐页翻新）暂停**——回款子域预计后续**全量重新设计**，现在逐页翻新会被推翻。影响：

- P8 紧随 P6 启动，P7 取消出排期（回款子域重设计立项时整体覆盖）。
- L-21 令牌化扫尾**只清存活页**（见 §6），回款域遗留页移交未来回款重设计。

## 1. 定位（brainstorm 确认）

数据治理页 `/governance` = **同步后健康检查**：每次同步/导入后 30 秒内判断——数据齐不齐、质量过不过关、有什么必须处理的告警。结论先行，告警按严重度排序；明细折叠收纳（是线下补数依据，按需展开+导出）。

- 覆盖范围：**全源体检**——云文档（回款主数据）+ PMIS 七表 + 项目域三新文件（组织架构/售前映射/delivery）。
- 不做：体检得分/环形图等仪表盘装饰（无行动指向）；后端聚合（数据 S1/P1 已全部落地前端，零后端改动）。

## 2. 治理页信息架构（三层）

### 2.1 第一层·结论横幅

三态判定，集中在一个纯函数（阈值/规则可调）：

| 态 | 判定 | 横幅文案 |
|---|---|---|
| 红（--danger） | 云文档主数据缺失（rawNodes 为空） | 数据不可用：云文档主数据缺失 |
| 黄（--warn） | 任一辅源（PMIS/组织架构/售前映射/delivery）未提供，或存在高/中严重度告警 | N 类告警需关注 |
| 绿（--ok） | 全源就绪且无高/中告警（低优先告警不阻塞绿，副文案附注"N 条低优先提示"） | 数据就绪 |

横幅右侧：同步时间（meta.lastUpdate）+ 项目数/节点数。三态淡底+深字（规范 V2）。

> 注：绿态判定相对 brainstorm 口头版（"告警清零"）放宽为"无高/中告警"，否则仅存低优先提示时三态无解。

### 2.2 第二层·五张源状态卡

缺失=灰态「未提供」徽章；正常=「已提供」淡底 ok 徽章。卡内 1 主 2 辅（规范 V2）。

| 卡 | 数据出处 | 主信息 | 辅信息 |
|---|---|---|---|
| 云文档 | meta + rawNodes | 节点行数 | 项目数 · 更新时间（lastUpdate） |
| PMIS 七表 | dataQuality.summary / themes | 匹配率（joinRate） | 命中在建/已关闭 · 主题 N/M 可用（M=themes 总数） · 更新时间（lastPmisUpdate） |
| 组织架构 | projectsQuality.orgFile / deptProjectCount | 主域项目数 | 人员行数 · 匹配数 |
| 售前映射 | projectsQuality.mappingFile / presale* | 已映射/售前总数 | 映射行数 |
| delivery | projectsQuality.deliveryFile | 匹配率 | 行数 · 匹配数 |

### 2.3 第三层·折叠告警区（告警注册表）

排序：严重度 高→中→低，同级按条数降序；**0 条置灰沉底不可展开**（保留可见，传达"已检查且干净"）。展开=明细表+导出按钮（标"导出"列的类目）。

| 严重度 | 类目 | 数据出处 | 明细列 | 导出 |
|---|---|---|---|---|
| 高 | 辅源缺失（每缺失源一条） | 各 provided=false | 无表；展开显示降级影响说明（母 spec §3.4）+ 处理指引 | - |
| 高 | PMIS 未匹配 | dataQuality.unmatched | 项目编号/项目名称/类型 | PMIS未匹配清单.xlsx |
| 高 | 负责人不在人员清单 | projectsQuality.managerNotInOrg | 项目编号/项目名称/负责人 | 负责人告警.xlsx |
| 中 | 回填待办 | dataQuality.backfill | 项目编号/项目名称/缺失字段 | PMIS回填待办.xlsx |
| 中 | 售前未映射 | projectsQuality.presaleUnmapped | 项目编号/项目名称 | 售前未映射.xlsx |
| 中 | 口径冲突 | dataQuality.conflicts | 列/问题/建议 | - |
| 中 | 主题覆盖不足 | dataQuality.themes 中 verdict≠green | 主题/覆盖率/判定 | - |
| 低 | 人员清单无项目 | projectsQuality.staffNoProject | 姓名 | - |
| 低 | 脏值 | dataQuality.dirty | 类型/项目编号/字段/值 | - |

双向告警（母 spec §3.6）由「负责人不在人员清单」（高，影响主域归属）与「人员清单无项目」（低，提示性）落地。

## 3. 前端实现

- **`lib/governance.ts` 重写**：纯函数 `buildHealthReport(data: AnalysisData) → HealthReport`，输出 `{ verdict: 'red'|'yellow'|'green', banner: {title, sub}, sources: SourceCard[], alerts: AlertGroup[] }`；对 dataQuality/projectsQuality 为 null 容错（对应卡「未提供」+ 缺失告警）。现有 `coverageColor`/`verdictLabel` 吸收进新函数或按需保留。Vitest 全覆盖（三态规则、源卡聚合、告警排序、0 条沉底、空数据容错）。
- **`DataQualityView.vue` 整页重写**：薄渲染层，消费 HealthReport；全 V2 令牌（间距 --sp-*、圆角 --r-*、字号 --fs-* rem、三态淡底徽章、.u-num）；明细表复用 `DataTable`，导出沿用 `exportRows`；折叠交互用原生展开（现 details 模式升级为受控折叠行，动效 --dur-2）。
- **零后端改动**：schema/preprocess/server 不动；不跑 gen:types。
- 路由/导航不变（/governance，工具组）。

## 4. 关于页刷新（/about）

- 内容重写：功能说明改为**双域世界观**——项目域五页（总览/清单/详情/动态/分析）+ 回款域五页（总览/分析/日历/跟进/台账）+ 工具组（数据管理/治理/关于）；数据来源改为三类（WPS 云文档回款节点清单 / PMIS 七表 / 项目域三新文件）。
- 保留版本号/发布日期/作者 grid（单一来源 version.ts 不变）。
- 样式全部令牌化（现 7 处 px 散值）。

## 5. 数据管理页小修（/data)

- 仅样式令牌化（14 处 px 散值）；复核 P1 新文件入口文案与新治理页口径一致（如"组织架构/售前映射/delivery"命名统一）。
- **不动功能**（U2 已重设计，无已知痛点）。

## 6. L-21 令牌化扫尾（存活页范围）

实测规模：px 散值 364 处/51 文件、theme 外 hex 72 处/14 文件（backlog 原记录严重低估）。按 §0 决策圈定：

- **清理（约 130 处 px + 约 8 处 hex）**：项目域五页（Overview/Projects/ProjectDetail/Activity/Insight）、工具组三页（Data/DataQuality/About，后两页随重写自带）、布局件（AppHeader/AppSidebar/FilterBar）、跨域共用组件（DataTable/SegToggle/HealthBadge/EventTimeline/PivotTable/DimPicker/ColumnFilter/DisplaySettings/PageStub 等，精确清单在实施计划中以 grep+引用核定）、backlog 点名的 BoardView 2 处 hex、nav.ts 3 处 hex。
- **跳过（约 230 处，移交回款全量重设计）**：日历/跟进/台账/回款总览/回款分析及其专属组件链（CalGrid/CalAgenda/CalDayDetail/CalYearHeat/CalNodeTable/PlanBoard/PlanTab/PendingBarChart/FollowupView 组件链/LedgerTable/TierStrip/OrgRanking/TrendCard/DashMetrics 等）与 lib/calendar.ts、lib/planBoards.ts 的 hex。
- **合法保留**：echartsTheme.ts（令牌桥接源）、theme.tokens.test.ts 等契约测试断言、4px 内联半步（规范允许）。
- PROGRESS backlog：L-21 关闭，余量注明"移交回款全量重设计"。

样式仅改动不动行为：现有测试应保持全绿；改后逐页目检无观感回退。

## 7. 打包专项核验（PyInstaller）

三步：

1. **`.spec` datas 静态审计**：PaymentReviewApp.spec 的 datas/hiddenimports 对照仓库现状逐项核对——py 模块（snapshots.py/projects.py/pmis.py/schema.py/config.py 等）、frontend 构建产物、静态资源齐全。
2. **frozen 分支代码走查**：`getattr(sys, 'frozen', False)` 全部分支——input/（含 pmis 子目录、三新文件）、data/snapshots/、data/events.json、analysis_data.json 读写路径在 _MEIPASS/exe 目录两套坐标下正确（CLAUDE.md §5 双路径同改约定的专项回查）。
3. **实际构建+冒烟**：本地 PyInstaller 构建 exe，启动后核验页面加载/数据加载/API 应答/治理页渲染。本地构建环境不可行则输出核验清单（含上述两步结论）由用户在打包机执行。

## 8. 错误处理与空态

| 场景 | 行为 |
|---|---|
| 前端数据未加载/加载失败 | 现状空态文案保留（"数据加载中或加载失败…"） |
| analysis_data 无 dataQuality 字段（旧数据） | PMIS 卡「未提供」+ 辅源缺失告警；页面不崩 |
| 无 projectsQuality（未提供三新文件） | 三卡「未提供」+ 各一条缺失告警 |
| rawNodes 为空 | 红横幅「数据不可用」，源卡/告警区照常渲染 |

## 9. 测试与验证

- 新增 `lib/governance.test.ts`（buildHealthReport 全分支）；`DataQualityView.test.ts` 重写（三层渲染/折叠/置灰/导出触发）；`AboutView.test.ts` 同步内容断言；其余 L-21 文件 style-only，原测试不动。
- pytest 零变化（无后端改动）。
- `verify.sh` 全绿门禁；PROGRESS 附手工烟雾清单（治理页三态/折叠/导出、关于页、打包 exe 冒烟）。

## 10. 范围外

- 回款子域全量重设计（独立立项，含本期跳过的 L-21 余量）。
- 回款数据源迁 PMIS、Insight 后端增列维度、PMIS 逐里程碑明细（PROGRESS P-next，等用户输入）。
- 治理页告警的页面内"处理"动作（如改名/映射编辑）——本工具数据维护在源头（云文档/PMIS/input 文件），页面只读+导出。
