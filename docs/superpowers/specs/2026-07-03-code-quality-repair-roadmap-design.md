# 代码质量修复 Roadmap（V2.6.7 → V2.6.9）

> 类型：设计/分解文档（roadmap，非单一实现 spec）。每批在执行时各自派生 spec→plan→implement 循环。
> 日期：2026-07-03　基线：V2.6.6（已生产上线）
> 来源：整仓五维度并行代码审查（后端 API / 数据管线 / 前端计算层 / 前端视图 / 测试工具链），高危项已由主控逐条读码 + 真实数据复核。

## 1. 背景与范围

一次整仓质量审查产出约 30 条发现。用户裁定：**部署/安全类不修**（私有内网环境暂无该问题），**其余按紧迫度分 3 批修复**，两个大重构（后端 FollowupStore、前端 useFollowupPage）**本轮纳入**并折进对应批次。

打包策略（用户钦定）：**只在批3（V2.6.9）打一个累积更新包**（V2.6.6 → V2.6.9）+ 升级手册；批1/批2 仅 bump `version.ts`、合 master、`verify.sh` 全绿，不单独出包。保留每批可独立验证/回滚的粒度。

折入逻辑：后端 5 套 followup 处理器的逐行复制正是"部分加原子写、部分没加"等健壮性缺陷的根因 → FollowupStore 重构并入批2；前端 5 跟进页 60% 重复正是 `@click.stop` 漂移 / 保存无反馈 / store 漏 reset 等 bug 的根因 → useFollowupPage 重构并入批3。每个重构顺带消灭一簇 bug，而非独立空转。

## 2. 批次总览

| 批 | 版本 | 主题 | 打包 | 风险 |
|---|---|---|---|---|
| 批1 | V2.6.7 | 数据正确性与口径（纯函数 TDD） | 否 | 低（多为纯函数，有现成测试） |
| 批2 | V2.6.8 | 后端健壮性 + FollowupStore 重构 | 否 | 中（触碰并发/写盘/路由，须真机冒烟） |
| 批3 | V2.6.9 | 前端 useFollowupPage 重构 + 设计违例清理 | **是（累积包）** | 中（跨 5 页重构 + 大面积样式改动） |

## 3. 批1 → V2.6.7 · 数据正确性与口径

会算错数/显示错的缺陷，多在 `lib/` 与管线纯函数，有对应 `*.test.ts` / `test_*.py`。先补/改测试再改实现（TDD）。

### 3.1 高危
- **导出单位错 1 万倍**：`frontend/src/lib/projectExport.ts:20,37` 导出「合同金额(万)」直接写 `r.contractAmount`（元），视图 `ProjectsView.vue:50` 靠 `v/10000` 才显示为万 → 导出 xlsx 表头「万」单元格是元。修：导出该列 `/10000`（或表头去「(万)」改导出元），补 `projectExport.test.ts` 单位断言。
- **超支事件恒失效**：`snapshots.py:57` 读孤儿键 `cost.get("超支")`，而 `pmis.derive_cost`（pmis.py:105-107）现产 `项目超支`/`交付超支`，旧键已删 → `overspend` 恒 False → snapshots.py:178-189 的「超支出现/超支解除」项目级事件永不触发（真实数据 `newOverspendProjects=0`）。修：改读 `项目超支`（口径需要可 or 上 `交付超支`），补「derive_cost 产物直喂 build_snapshot」契约测试。

### 3.2 中危
- **范围筛选单位**：`tempScope.ts:71-73` 三个回款节点字段标「(万)」，`tempFollowup.ts:88` 传入的是元级原始节点，`leafMatch` 按元比较 → `/projects/temp`、`/payment/key` 配「计划回款 50~100 万」实际匹配 50~100 元。修：`buildScopeInputs` 对三字段 `/10000`（对齐同文件 project 组 `contractWan` 的换算）。
- **恒全时口径漏网**（V2.6.4 未收干净）：
  - `payDashboard.ts:127-143` payOrgRanking 达成率仍是区间分子/区间活动项目合同，注释还引用已废止的 S8 → /payment 顶部 KPI（全时）与下方服务组排名（默认本年度）同屏不同口径。修：分子 `actualInRange(records,'','')`、分母恒全量合同，或若为有意设计则改注释 + UI 标注口径。
  - `overview.ts:115-131` paymentBand「年度已回」只遍历有节点项目，漏约 81 个无阶段项目的流水 → 首页「年度已回」与 /payment 已回款对不上。修：改为遍历项目集（与 `computeKpis` 同源）。
  - `calendar.ts:51-56` `calDashboardStats` mAct 同型（只累计本月有计划节点项目的当月流水）。
- **回款完成死分支**：`snapshots.py:217` 判 `sb == config.STATUS_FULL_PAID`（"已全额回款"），而换源后 `collection_stages.stage_status` 只产 {已回款,部分回款,质保期,延期,待回款} → 「回款完成」事件永不触发（相邻「延期发生」因字面量"延期"巧合幸存）。修：判 `"已回款"` 或让两模块共享状态常量。
- **日期时区**：`calendar.ts:153-154` calUpcoming 用 `new Date('YYYY-MM-DD')`（UTC 零点=东八区 08:00）与含时刻的本地 `now` 比较 → 8 点后今日到期节点从 15/30 天清单落出；同页 `calDashboardStats:48` 用 `Math.ceil(diff/86400000)` 补偿故不一致。修：改字符串日界比较或复用 `dayDiff`。

### 3.3 收尾低危（同域顺手）
- 除零回退 0 应为 null（`payDashboard.ts:65,142`、`ledger.ts:43,83`），对齐「合同≤0 → null 显 '-'」约定。
- Excel 日期误猜：`cellFormat.ts:34-37`、`crossFilter.ts:19-22` 对任意 4-5 位数字串强转日期，应限 `isDateKey(key)` 命中列。
- `milestoneDetailRows.ts:53` 'm1' 档 `new Date(y,m+1,d)` 月末溢出，钳位到目标月末。
- `profit.py:117-123` `budget_map` 收录空 pid 行、`budget_matched` 按行计数不去重致 matchRate 轻微失真。

### 3.4 防复发（治本）
给核心域产物加**键集契约测试**（对 `Project`/`PaymentNodePmis` 等快照 key set 或"上游 derive_* 产物直喂下游消费者"），锁住"改键必被测试抓到"——超支孤儿键漏网数月即因 `schema.py` `extra="allow"` + 自造 fixture 让三层校验全放行。暂不全局翻 `extra="forbid"`（避免真实 extra 数据破坏），以契约测试补盲区。

### 3.5 批1 验收
`verify.sh` 全绿（新增/改动测试先红后绿）；真机冒烟：/projects 导出核对合同列数值=屏显万值、动态页「新超支项目」出现非 0、/payment 排名与顶部 KPI 口径一致、日历今日节点全天可见。bump `version.ts` → V2.6.7，PROGRESS 记录，合 master。

## 4. 批2 → V2.6.8 · 后端健壮性 + FollowupStore 重构

### 4.1 FollowupStore 重构
抽泛型 `FollowupStore` + 表驱动路由，统一 5 套近乎逐行复制的后端（temp / opportunity / risk / paykey / progress 的 `_load_*/_save_*` + get/scope/update/archive/archive-delete）。领域模块（temp_followup / risk_followup / payment_key_followup / opportunity_followup）的 `normalize_scope`/`apply_update`/`apply_archive` 亦几近相同，收进泛型引擎。目标：消掉上千行重复，并把下列健壮性修复"一处生效"。
- 预留 L4 校验挂载点（#6 属排除项，本轮不实装，但重构后将来加一行即可）。

### 4.2 借重构统一的健壮性修复
- **写盘原子化**：全部 store 统一 `tmp+os.replace`（当前 `_save_followup_records`/`_save_project_tags`/`_save_progress`/`_save_temp_followup` 用 `open('w')` 直写，崩溃留截断坏 JSON，此后 `_load_*` 静默丢全部）。
- **事务锁**：load-modify-save 整体纳入每-store 锁（ThreadingHTTPServer，server.py:2519；当前锁只包写盘瞬间，两线程各 load 全量、后写者覆盖前者丢更新）。
- **reprocess/download 互斥**：`handle_reprocess`(1815) / `handle_pmis_download`(1792) 检查-置位加锁，防并发触发两次重处理。
- **错误响应状态一致**：`_json_response` 恒 200 → 错误统一走 4xx/5xx（当前同类错误码不统一，前端/监控难据 HTTP 状态判成败）。
- **输入护栏**：`int(Content-Length)` 包 try→400、body 大小上限；SSE `wfile.write` 客户端断连捕获 BrokenPipeError。

### 4.3 管线健壮性告警
- `collection_stages.py:15-51` 三解析器（`_num`/`_ms_to_date`/`_pct`）静默降级 → 解析失败行计数上报 dirty/治理告警（与已知"覆盖率告警"债互补）。`_num` 失败→0 且不剥千分位（`float("1,234.5")`→0）一并处理。
- `pmis.py:75-77` `read_pmis_sheet` 损坏/加密文件 `except: return []` → 区分"没给文件"与"文件坏了"并告警。
- `pmis.py:164-205` `_assemble` 对 base/center/status 单元格做类型归一（对齐 `_jsonable_row`），避免数字单元格在 schema 校验处"晚失败"崩溃。
- 低危（酌情）：`projects.read_mapping` 表头假映射防护、`pmis._index_by_pid` 重复 pid 静默告警。

### 4.4 死代码清理
- `compare_payment_sources.py`（一次性诊断脚本，硬依赖已退役 xlsx，`main()` 必 FileNotFoundError；仍进 make_deploy_zip 清单、被测试保活）→ 归档 `scripts/` 或删除（连同 `test_payment_compare.py`）。
- `preprocess_data.py:34-297` 约半文件 yundocs 退役死代码（`parse_header_and_data`/`excel_serial_to_date`/`assign_tier`/`parse_amount`/`compute_node_status` 等，仅测试保活）→ 删除或迁 legacy。注意 `parse_amount:105` 正则不匹配负号，勿被复用于金额。

### 4.5 批2 验收
`verify.sh` 全绿（5 套 followup 端点回归 + 新原子写/锁测试）；真机冒烟：五跟进页 get/update/archive/删除全通、并发编辑不丢、reprocess 期间二次触发被拒、台账解析失败告警可见。⚠️ server.py 改动**须重启进程**才生效（历史踩坑）。bump → V2.6.8，合 master。

## 5. 批3 → V2.6.9 · 前端 useFollowupPage 重构 + 设计违例清理

### 5.1 useFollowupPage 重构
抽 `useFollowupPage(store, opts)` composable（数据集切换 + 历史快照 + 归档/删除/导出 + 分页 + 单元格编辑）+ `FollowupToolbar`/`ArchiveModals` 公共组件 + 共享 `.kp-*` 样式。覆盖 `KeyProjectsView`/`TempFollowupView`/`RiskFollowupView`/`OpportunityFollowupView`/`PaymentKeyFollowupView`（约 60% 逐字重复、可压缩约 700 行）。消除已发生的行为漂移（`doDeleteArchive` 五份、导出块五份、三个 Modal 模板、`@click.stop` 只 PaymentKey 有）。

### 5.2 顺带收敛的散落三件套
- `useExternalSort(rows, numericKeys)`：`OpportunitiesView:76-97`/`CostDetailView:158-175`/`PayProjectsView:91-108`/`PayNodesView:73-90` 四份逐字。
- 统一走现有 `usePagedRows`：`KeyProjects`/`Temp`/`Risk`/`OpportunityFollowup`/`PaymentKey`/`ProjectsView`/`ClosedProjects`/`MilestoneReminderTab` 各自手写分页 → 收编（内含 watch 重置 + `pageSize` 变更钳位 currentPage，一并修 `usePagedRows.ts:7-11` 越界空页）。
- `useColumnPrefs` 增强吞「关列清筛选」不变式：约 9 处复制的 `visibleColumns/onToggle`，漏一处即隐形筛选 bug。

### 5.3 状态管理与交互修复
- **store 清理集中注册**：改 pinia 插件遍历带 `reset()` 的 store，根治 `stores/auth.ts:22-26,36-40` login/logout 漏挂 `riskFollowup`/`paymentKeyFollowup`（换账号沿用上一账号缓存，与 V1.17.1 修过的 L4 缓存泄露同型）。
- **保存失败反馈**：`OpportunityEditDrawer.vue:65-77`、`ProgressEditModal.vue:36-46` 补 catch + `ElMessage.error`（当前 403/网络错静默不弹错不关抽屉）。
- `ScopeBuilder.vue:130,141` v-for 数组索引作 key 且列表 splice → 生成稳定 uid（避免 el-select/date-picker 内部状态错位复用）。
- `stores/filter.ts:52` 裸 `JSON.parse(localStorage…)` 包 try/catch 回退 `[]`（localStorage 损坏时全站挂）。

### 5.4 设计令牌违例清理
- **状态色当文字色**（对比 ≈1.4:1 不可读）改 `--*-text` 深字：`MetricGrid.vue:35-36`、`OverviewView.vue:197`、`CalendarView.vue:197-198`、`DashMetrics.vue:63-65`、`CostDetailView.vue:256`、`CalGrid.vue:82`。正确示范 `RiskBoardView.vue:181-183`。
- `CalendarView.vue:210-212` 实底黄 + 近白小字（违反"禁止实底+小号白字"）→ 淡底深字。
- `BoardView.vue:304-314`、`CalendarView.vue:190-212` 手写散值（padding/gap/radius/margin）→ `--sp-*`/`--r-*`/`--gap-*` 令牌。
- `ColumnFilter.vue:124-179`（9 页复用）、`FollowupRecords.vue`、`FollowupRecordForm.vue` 硬编码 px 字号/圆角 → rem 令牌（随三档字号缩放）。
- `PendingBarChart.vue:12` 状态色硬编码 `['#c8161d','#f9d46c','#6ecc54']` → 按 `settings.theme` 取 `charts/echartsTheme.ts` 的 `STATUS_LIGHT/STATUS_DARK`（暗色 danger 应为 `#d34947`），对齐 `MilestoneView.vue:45`。
- 可访问性：`DashMetrics.vue:46-48` 可点卡片补 tabindex/role/keydown（对齐 `MetricGrid.vue:14-20` 或 `v-activate`）；`ColumnFilter.vue:95`、`ProjectDetailView.vue:323` 触发 span 加 `v-activate`。
- 收尾低危：漏挂 `.u-num`（`CalNodeTable`/`CalendarView`/`CalGrid`/`OrgRanking` 金额列，兼修 `CalNodeTable.vue:67` 引用不存在的 `--font-mono`）、`ChartTypeSelector`/`DimPicker` 旧实底选中态同步为抬起 chip、`ProgressEditModal.vue:67` `#fff`→`--on-accent`、`DashMetrics` 越界圆角/字重、`window.confirm` 统一 `ElMessageBox`。

### 5.5 批3 验收与打包
`verify.sh` 全绿（5 跟进页重构回归 + composable 单测 + 令牌契约测试）；真机冒烟：五跟进页交互全通、换账号缓存重置、保存失败弹错、暗色下图表状态色/文字对比达标、全站无散值残留。bump → V2.6.9。**出累积更新包 `release/pmplatform-update-V2.6.9.zip`（V2.6.6→V2.6.9）+ `deploy/升级手册-V2.6.9.md`**：纯前端+后端代码改动，无 schema/preprocess 结构变化（批2 仅加告警字段，需确认是否触发"更新数据"）；升级手册头号注意需据实标注。

## 6. 排除项（私有环境暂不修，记 Backlog）

安全/部署类，用户裁定本轮不修：
- pmisdata `fetch_*.py`/`delivery_analysis.py` 未入 git、`config.json`（cookie）打进部署包（原审查 #4）。
- 根目录 `.py` 源码经 `translate_path` BASE_DIR 回退匿名下发（原 #5，仅源码部署暴露）。
- followup/progress 无后端 L4 隔离（原 #6，靠前端过滤，直连 API 可绕过）。
- 同类：`/DATA` 大小写敏感前缀绕过（Windows）、破坏性操作 GET + CSRF、登录用户名枚举时间侧信道、会话字典无界。
- `make_deploy_zip.py` 硬编码白名单漏 `risk_followup.py`/`payment_key_followup.py`（全新全量部署包 ImportError；增量包 `make_update_zip.py` 用 glob 不受影响）——**建议随手改为 glob**（低成本、防再犯），但不阻塞本轮。

其它已记录技术债（不重复）：`/insight` 回款完成率口径不同源、collection_stages 导出覆盖率无告警、analysis_data.json 全量 fetch/单 chunk。

## 7. 执行方式

按 SDD/TDD 逐批：每批开工在 PROGRESS 标 `[~]`，改计算/口径先补改测试再改实现，`verify.sh` 全绿 + 真机冒烟后合 master 并更新 PROGRESS。批1→批2→批3 顺序执行，批3 收尾统一打累积包。跨批不并行（避免同文件冲突：批2/批3 均涉 followup 域）。
