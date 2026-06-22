# PROGRESS.md — 开发进度与待办

> 本文件是 harness 的**状态层**（State）。跨会话续接的唯一进度来源。
> 规则：开工把要做的项标 `[~] 进行中`；完成改 `[x]` 并写一句结论；新发现的问题加到 Backlog。
> 配套机器可读清单见 `feature_list.json`。

- 当前版本：**V1.16.2**
- 最近更新：2026-06-22（数据管理界面调整：彻底移除 WPS + 双数据来源。拆除 WPS 同步/离线导入/PMIS 在线下载全部在线抓取入口与脚本、Playwright 依赖；数据来源收敛为两条：页面上传/本地放置后点「更新数据」；collection_stages.csv 纳入页面上传白名单+文件状态展示；yundocs 数据源下线，删死键 projectOverview/naguanMap/naguanExclude；pay_projects 换源到 collection_stages）
- 上一版本：V1.15.0（2026-06-19，回款口径修正：① 修 preprocess 售前收款阶段节点取数——本项目号优先、缺回退原项目号（找回被丢的售前计划节点，售前 Σ计划 0→21211 万）；② 全站「回款达成率/完成率」口径统一为 Σ流水净额(含负)/Σ合同总额（分母 计划→合同，修复 103% 失真，回落至合理区间）；③ 售前详情「回款数据」流水本项目优先缺回退原项目）
- 上上版本：V1.14.0（2026-06-19，SP5 /payment/board 多维看板重做：维度集改 L4部门/项目级别/行业/项目阶段/标签，指标改 项目数/合同总额/计划回款/完成率/延期节点；排名表去独立排序控件改 DataTable 表头排序；柱状图加数字；标签多值炸开分组；交叉/透视维度同步。**大需求 5 子项目收官**）
- 维护语言：简体中文

---

## 版本（单一来源约定，2026-06-12 起）

- **单一来源**：`frontend/src/version.ts`（APP_VERSION/RELEASE_DATE），改版本只改此处；本文件头部同步记录。
- **三位策略 `VX.Y.Z`（用户钦定）**：X（大版本）调整**须用户确认**；Y=整页级调整（新增页面/整页重设计）；Z=子页面、下钻页、页内局部调整。
- V1.16.2（2026-06-22）数据管理界面调整：彻底移除 WPS + 双数据来源
  - 拆除 WPS 同步/离线导入/PMIS 在线下载 全部在线抓取入口与脚本（fetch_yundocs_full.py、pmis_download.py）、Playwright 依赖。
  - 数据来源收敛为两条：页面上传 / 本地放置（cron 投放 input/ 与 input/pmis/ 后点「更新数据」）。
  - 核心回款源 collection_stages.csv 纳入页面上传白名单 + 文件状态展示。
  - 数据血缘清理：yundocs 数据源下线，删 projectOverview/naguanMap/naguanExclude（schema+类型）；pay_projects 换源到 collection_stages；followupRecords 改只读本地 json 重建（不写回）；tagSeed 置空。
  - 设计/计划：docs/superpowers/specs/2026-06-22-data-management-wps-removal-design.md、docs/superpowers/plans/2026-06-22-data-management-wps-removal.md。
- V1.15.0 回款口径修正（2026-06-19）：**A 售前节点取数**——新增 `preprocess._collection_nodes_for`(本项目号优先、缺回退原项目号、皆缺[])，9f 节点 lookup 改用它（`_eff`/合同来源/`_rec` 不动）；修复"售前收款阶段台账挂在本项目号下、却按原项目号查"导致售前 ~19429 万计划节点被丢（售前 Σ计划 0→21211 万）。**B 全站达成率/完成率口径**——统一 Σ流水净额(含负)/Σ合同总额：后端 `aggregate_payment_pmis.paymentRatio`→None、9f 用 `payment_ratio_from_records(流水,合同)` 覆盖项目级；前端 11 比率点分母 计划→合同（paymentRange/computeKpis/summaryByDim/progressBuckets/paymentBoard buildGroup/payDashSummary/payOrgRanking/ledgerRows/ledgerSummary/groupInsight/InsightDrillModal），分子流水不变；null 策略 number|null 点→null、纯number聚合+ledgerRows→:0；deriveProgress/rateColorPmis 阈值不动。修复回款达成率 103% 失真（回落 ~51% 量级）。**C 售前详情流水回退**——`ProjectDetailView.payRec` 本项目优先、缺回退 relatedClosedId。终审 opus With fixes（deriveProgress 注释口径一行已修）；遗留技术债：/insight 回款完成率口径(节点已收/PMIS合同)与主口径不同源，记 backlog。合并 SHA: d6302de
- V1.14.0 SP5 /payment/board 多维看板重做（2026-06-19，**大需求 5 子项目收官**）：维度集 6→5（dept『L4部门』/projectLevel『项目级别』/industry『行业』/stage『项目阶段』/tag『标签』multi；移除 项目经理/金额档/进度态），指标 7→5（项目数/合同总额/计划回款/完成率/延期节点，去已回款/待回款）；`paymentBoard.groupPayBoard` 改笛卡尔积多值炸开（含 tag 维一项目计入它每个标签组、组间重复计数、空标签『无标签』；非 tag 维零回归）；`PayBoardRow` 加 projectLevel/tags、buildPayBoardRows 追加 tagAssignments 参；排名模式去独立「排序」控件改 `DataTable` 表头排序（列 维度名+5指标、行下钻、无已回/待回列）；柱状图 已回(绿)/待回(黄) label inside + 透明总计 series 柱顶(已回+待回) 整数万、按计划回款降序 Top15；BoardView 接入 projectTags store(assignments 第7参)、deep-link orgL4→dept 别名；交叉/透视复用 groupPayBoard 自动获 tag 炸开。遗留维字段 manager/tier/progress 按需保留(BoardDrilldownModal 仍读)并加注释。纯前端零口径变更。合并 SHA: b690de3
- V1.13.0 SP4 /panalysis 五页拆分（2026-06-19）：旧 `/panalysis/:tab?` 单页（PayAnalysisView 内 tab 切换 5 组件）拆为 `/payment/{board,projects,nodes,plan,risk}` 五条独立平铺路由（name pay-*，不 hideFilter），去顶部 tab 栏；四 facet 组件 git mv 归位 `views/`(PayProjectsView/PayNodesView/PayPlanView/PayRiskView，保 rename 历史)、删 PayAnalysisView 宿主；维度控件仅留回款节点页（plan/risk/projects 删声明未用的死 dim prop、不加控件）；侧栏「回款」单入口展开 8 项；旧 `/panalysis/:tab?`(缺省→board)、`/board`、`/analysis/:tab` 兼容 redirect（保 query）、goBoard→/payment/board。纯前端纯结构搬迁，不动回款口径/数据层。合并 SHA: 19c0a36
- V1.12.0 SP3 /payment 页面重做（2026-06-19）：回款数据表按 L4 分组展示(11 列可排序、全宽铺满)；OrgRanking 展全部 L4 行不截断；待回款趋势图整数万刻度+容器横向滚动；去除 TierStrip 档位条；部门汇总迁出看板独立展示。合并 SHA: cb13883
- V1.11.0 SP2 日期范围筛选+口径统一（2026-06-19）：filter store 默认本年度(dateStart/dateEnd ref)；FilterBar 区间/预设；回款看板六卡/board/部门汇总/趋势/日历/台账随区间联动；SP1-followup 复核（computeKpis 已套 `!isAnomalous`、buildInsightRows 对异常项目回款字段置 0，口径安全，关闭）。合并 SHA: 190c385
- V1.10.2 纯展示标签改名：DashMetrics 延期→延期项目数、回款节点→回款节点数；BoardView 排序选项 延期数→延期节点数；LedgerView 统计卡 延期→延期项目数；InsightView RANK_COLS + projectPivot INSIGHT_METRICS 延期项目→延期项目数。合并 SHA: a7eae67
- V1.10.1 SP1 数据治理：识别 orgL4 空异常项目，回款看板(/payment + /panalysis 五页)硬排除、治理页新增告警、项目清单挂「数据异常」标记。合并 SHA: 38fe4bf
- 上一版本 V1.10.0 整体配色改版：全站令牌切换为钦定品牌色板(11 彩+4 黑白)，结构灰阶派生、散值归一、契约测试同步。合并 SHA: f1f0fed
- 上上版本 V1.9.0（见进行中「项目清单选列+表头筛选+横滚」）。合并 SHA: c846126
- V1.0.0 = 产品更名「项目管理平台」基线（此前 V5.x 旧前端与 V7.x Phase P/R 序列退役，历史见 git）。

---

## 已交付功能（V5.9.1，全部 = done）

详见 `feature_list.json`。概览：

- [x] 看板首页：汇总卡片、分层卡片、季度/月度待回款图、服务组排名、延期 Top10
- [x] 区间对比 / 回款日历 / 回款台账
- [x] 临期跟进：列表 + 跟进记录新增/编辑/删除 + 云文档异步回写 + 同步状态追踪
- [x] 业务分析（项目总览/回款节点/回款状态/风险项目/数据质检），各按 100万以上 / 50-100万 / 50万以下 三档
- [x] 项目经理视图、视角切换（L4 服务组 / 项目经理）、周期切换（年/季度）
- [x] 数据管理：云同步(SSE 进度)、离线 Excel 导入、清空数据、数据质量总览、纳管开关
- [x] 本地服务生命周期：自动开浏览器、端口占用清理、桌面快捷方式、停止服务

---

## 进行中

- [ ] **/insight 项目分析中心整合（2026-06-19 设计已通过用户确认，待下次对话执行；目标 V1.16.0）**：把同事「项目数据运营工具」系统的里程碑管理、成本分析两看板整合进本平台，并把 `/insight` 重构为「项目分析」主入口下挂 5 子页——/insight 项目多维分析(现状默认)、/insight/milestone 里程碑管理(新)、/insight/costdetail 成本分析(新)、/insight/board 回款多维分析(迁自 /payment/board)、/insight/calendar 回款日历(迁自 /calendar)。数据全取自现有源、配色字体架构全遵循当前系统。**已拍板**：成本页忠实复刻对方「预算超支预警」(剩余预算±5000三档、不照搬"已剔除老OA迁移项目3个"无依据文案)；里程碑状态直接用现成 `progress.里程碑进度状态`(空归未发布)；拆 3 子项目顺序做(SP-A 路由/导航重构含 board/calendar 迁移+redirect → SP-B 里程碑页 → SP-C 成本页)。数据可得性已核实全部具备(里程碑状态/节点 805 项目13类、成本超支 621 非空、损益毛利 621 全覆盖本期不接入)。**完整设计(含逐页数据映射、迁移锚点、源系统分析结论)见 `docs/superpowers/specs/2026-06-19-insight-analysis-hub-integration-design.md`**。下一步：对 SP-A 调 writing-plans → subagent-driven-development(已授权多代理)。
- [x] **Phase P 项目主域整体看板**：P1-P6、P8 已合并 master（V7.0.0-V7.6.0，P8 合并提交 59ad935），P7 暂停取消出排期（回款子域待全量重设计立项）。spec：2026-06-10-project-domain-dashboard-design.md + 2026-06-12-P8-governance-tools-design.md。
- [x] **Phase R 数据源扩展批次**（spec：2026-06-12-R-batch-data-expansion-design.md）：R1-R4 四期全部合并（V7.7.0→V1.0.0；a11aceb / 1a0a39b / 997fe15 / 55a5aba），**Phase R 收官**。
- [x] **S1 反馈修缮批次**（spec：2026-06-12-S1-feedback-fixes-design.md，V1.0.1）：动态事件规则与 tone 染色/清单分页多选/科目树全量/回款完成率迁流水口径/分析配色，已合并 master（eb810b2）。
- [x] **S2 详情页修缮批次**（spec：2026-06-14-S2-detail-fixes-design.md，V1.0.2）：右栏动态长项目编号换行适配（EventTimeline overflow-wrap）；详情页头部三类超支风险徽章（总体预算超支 5000 元阈值分级红/黄；交付外包服务成本、交付部门人工成本超支即红）；总体超支金额经 9e 后端回填，同源 profit.overspend_amount。已合并 master（9d66a6e；真实数据核对 26 红/34 黄/572 不显示，抽样回填值==重算值）。
- [x] **三档字号统一+2**（V1.0.3）：settings store `FONT_PX` 小/中/大 14/16/18 → 16/18/20（单一来源），theme.css 默认 `--fs-base` 与 html 兜底同步为 18，六级 `--fs-1..6` rem 不变随之整体缩放；契约/store 测试与设计 spec/CLAUDE.md 文档同步；.gitignore 补 .omc/。已合并 master（7027797）。
- [x] **数据历史版本化与回滚**（spec：2026-06-15-data-history-rollback-design.md，V1.1.0）：每次"更新数据"成功自动存整份数据快照(产出 analysis_data/events/snapshots + 源 yundocs_data/input，实测单份~77MB)，按处理次数留近 3 份；新模块 `data_history.py`(归档/列表/回滚/撤销/剪枝，还原 copy-then-swap 近原子，pytest 7 项) + 3 API + DataView「数据历史/回滚」卡；回滚前自动备份 `_pre_rollback` 可撤销；终审补全 sync/import/pmis/reprocess 与回滚的双向互斥；.gitignore 加 data/history、.spec 入 data_history。已合并 master（be5f44e；真实数据冒烟 archive+rollback 跑通无残留）。后续候选：回款子域全量重设计（含 P7 移交项与 L-21 余量）、P-next 用户待办、打包专项（快捷方式/exe 更名随此期）、历史快照体积优化（已做，V1.6.1，已合并 master e13ca42：分组留存——JSON 产出 5 份/源共享 1 份/弃归档 yundocs，回滚仅还原产出；~228MB→~125MB、版本数 3→5；终审 HIGH=rollback 目录穿越合并前已修，余记 L-24）。
- [~] **回款看板重建程序（项目清单为底座，2026-06-15 立项）**：用户钦定 `/projects` 为平台唯一逐项目数据底座（项目管理/回款管理皆派生），PMIS 为核心源，废 `/panalysis` 5 tab。**关键修正**：节点级计划回款比例在 PMIS 里程碑 `关联回款阶段`（如"到货款1，70.00%"，milestones.py 未解析），实测 1823 项目有比例、与云文档 215一致/15分歧。分期：①第一期诊断比对报告 **已合并 master（39e3660）**：compare_payment_sources.py 一次性诊断，712项目(红38/黄225/绿449)，售前328取原项目、可比103；结论=售前财务走原项目、计划侧全 PMIS（节点比例解析里程碑关联回款阶段）、手填"已回款比例"口径弃用；212非售前无流水/40售前无合同经人工核验为可信。②**2A 数据底座（spec 2026-06-15-2A-data-foundation-design.md，V1.2.0，已合并 master f840147）**：milestones 解析节点级计划回款比例；项目行新增 `paymentPmis` 摘要 + `paymentNodes` map；节点三态(已达成/延期/待达成)，实际侧走项目流水不分摊；售前合同/里程碑取原项目、流水本项目优先(实测原项目0流水);/project/:id 回款 tab 接入；新增并存,旧 rawNodes/payment/panalysis 不动。实测售前 paymentRatio 非空 183/309、全域 337/633。③**2B 回款看板重建（spec 2026-06-15-2B-payment-dashboard-rebuild-design.md，V1.3.0）已合并 master(a4dfba0)**（plan 2026-06-15-2B-payment-dashboard-rebuild.md，feat/phase-2b-payment-dashboard，verify.sh 全绿 104 文件/494 vitest，真实数据冒烟口径一致，终审 APPROVE 无阻断+HIGH 两项已修）：/panalysis 整页 PMIS 化——新增 `lib/paymentPmis.ts`（派生 deriveTier/deriveProgress/deriveDept/deriveStage + filterProjects 视角纳管过滤不复用 filterNodes + projectPaymentRows/summaryByDim/paymentNodeRows/nodeSummary/progressBuckets/pmisRiskGroups）+ `lib/paymentBoard.ts`（board 项目级 PMIS 透视，镜像 projectPivot 复用泛型类型）；5 tab 换骨（项目总览=项目行+单维汇总+行下钻；回款节点=节点表+三态徽章已达成/延期/待达成；回款进度=3 互斥进度桶+CF 列筛；风险项目=延期节点/低回款<0.3/超支三类；多维看板 board 切 7 PMIS 指标）；删质检 tab，共享维度选择器（部门/阶段/金额档/进度态）；删 /panalysis 独占旧件（projectsOverview/planBoards/TierIntegrityTab/PlanBoard，剥离 riskGroups()/tierSummaryBar），保留 getNodeRemaining/groupByProject（其他页共享）、pivot.ts 泛型类型（/insight 共享）。数据质检→governance 低优先告警按 spec §4 授权暂弃（数据仍在 summary[].incompleteData）。④**2C 项目标签体系（spec 2026-06-15-2C-project-labels-design.md，V1.4.0）已合并 master(32ecca2)**（plan 2026-06-15-2C-project-labels.md，feat/phase-2c-project-labels，verify.sh 全绿 105 文件/501 vitest + 247 pytest，真实数据播种冒烟吻合，终审 APPROVE 无阻断+2 项 LOW 已修）：替代纳管的本地多标签——`config.TAG_SEED_WHITELIST`(BH项目/框架合同/退换货项目/项目已关闭/SM项目/0元订单项目/佳杰) + `preprocess.derive_tag_seed`(扫两个截图列白名单匹配→`analysis_data.json.tagSeed`)；`server` 本地 `data/project_tags.json`(首次按 tagSeed 播种、本地为准不覆盖、不回写云) + `GET/POST /api/tags`；前端 `stores/projectTags`(标签库+挂载 CRUD) + `/project/:id` 标签编辑块 + `/projects` 标签列与多选筛选(并集) + `/data` 标签库管理(增/改名/停用)与「按标签排除」(开关+多选)；过滤链 naguan→exclude(`filterNodes`/`filterProjects`/`ledger.excludeFilter`/`dashboardStats` 字段更名为 excludeActive/excludedIds，filterStore 派生 `excludedIds` 喂全链，删旧纳管开关含 FilterBar)。真实数据播种 58 项目命中(BH项目12/框架合同16/项目已关闭4/退换货2/0元订单1/佳杰23；SM项目无精确等值故未入库,可手动加)。**默认 excludeOn=false 净态起步**(旧 27 个纳管=否项目上线后默认不再隐藏,由用户在 /data 自配排除标签)。⑤**2D 跟进记录重调（spec 2026-06-15-2D-followup-rework-design.md，V1.5.0）已合并 master(e8d06f9)**（plan 2026-06-15-2D-followup-rework.md，feat/phase-2d-followup-rework，verify.sh 全绿 97 文件/469 vitest + 247 pytest，终审 APPROVE 无阻断+3 项 LOW 已修）：跟进记录**去云回写纯本地**——删 `write_followup.py`/`_write_followup_async`/`_update_followup_sync_status`/`followup_sync_state`/`handle_followup_sync_status` + `.spec` 入口，add/update/delete 三 handler 纯本地同步返回、不写 syncStatus（list 仍 pop 兼容旧记录）；`sync_url` 保守保留（数据抓取 fetch 仍用，仅删 followup 读取，未伤数据同步）；前端删 `useFollowupSync` 轮询改 `ElMessage` 本地 toast、`followupApi` 去 syncStatus/cloudUrl。**入口迁项目清单**：`/projects` 行内「跟进」按钮（`@click.stop`）→ 新增 `FollowupModal` 复用 `FollowupRecords` 全功能 CRUD，`/project:id` 记录区保留。**删 /followup 整页与临期信号链**（FollowupView/FollowupSignalRow/FollowupExpandModal/FuProjectRow/FuNodeTable + lib/followup·followupProjects + stores/fuData，−2219 行）+ nav/router，**废 fuData**（"已跟进"由有无记录派生）；OverviewView「7天临期」死链改跳 /payment。保留 FollowupRecords/Form/Modal/followupApi。⑥**2E 人工数据导入导出 + 快照回滚（spec 2026-06-16-2E-manual-data-io-design.md，plan 2026-06-16-2E-manual-data-io.md，V1.6.0）已合并 master(251722b)**（feat/phase-2e-manual-data-io，verify.sh 全绿 pytest 257 + 前端 vitest 474/99 文件 + typecheck + build；终审 opus code-reviewer 出 1 BLOCKER+1 HIGH 合并前已修：BLOCKER=`manual_history.rollback_manual` version_id 防目录穿越(basename 比对+穿越拒绝测试)、HIGH=DataView 导入/回滚后 `await projectTags.load()` 刷新标签 store 消 UI 滞后；余 MEDIUM/LOW/NIT 记 L-23）：导出——`/projects` 按勾选范围（项目清单/标签/跟进/回款节点/里程碑）出多 sheet xlsx，新增 `lib/exportXlsx.exportSheets`（多表）+ `lib/projectExport.buildExportSheets`（按范围构建行、遵循当前 filtered 项目集、跟进/节点/里程碑按筛选项目过滤、标签顿号连接）+ `followupApi.all`(GET /api/followup/all 全量供导出) + ProjectsView 导出按钮(pv-export-btn)+范围 Modal。导入——固定两 sheet「项目标签」「跟进记录」整表替换：后端纯函数 `manual_import.validate_and_build`（表头/必填/枚举(跟进类型 邮件推动等/跟进状态)/未知项目编号/长度强校验，失败返 errors 明细整体不写；空记录编号自动生成 FU-{today}-{NNNN} 避开已有、空跟进时间填 now）+ 轻量快照 `manual_history`（只备 project_tags.json+followup_records.json 两小 JSON，copy-then-swap 近原子，留 3 份，pytest 3 项）+ server `POST /api/manual/import|rollback`、`GET /api/manual/backups`（_apply_manual_import 先 backup 后替换写、复用 history_state+_history_lock 全站互斥、PMIS 其它 sheet 忽略只读护栏）；前端 `lib/manualImport`(复用 excelImport.toStringMatrix 解析两 sheet)+`lib/manualApi`(import 用裸 fetch 不走 api.post 抛错以保留 errors 明细)+ DataView「人工数据导入/回滚」卡(报错明细表+快照列表回滚)。verify.sh 全绿，2C L-22 导出待办随此并入关闭。每子项独立 spec→plan。
- [x] **全局下线 rawNodes 旧口径程序（2026-06-16 立项，2026-06-18 收官）**：用户钦定全局废弃云文档 rawNodes 旧口径、改由 PMIS/收款阶段台账驱动；拆解 3A（详情页回款换源+脱离 rawNodes）→3B 概览→3C 台账→3D 日历→3E 移除后端 rawNodes。①**3A 回款换源（spec/plan 2026-06-16-3A-collection-stages，V1.6.2，feat/3a-collection-stages，verify.sh 全绿：pytest 265 + 前端 99 文件/475 vitest + typecheck + build）**：用户提供 `input/collection_stages.csv`（收款阶段台账 575 项目/1172 行，一行=一收款阶段，含此前 PMIS 里程碑缺的 合同约定日期收款/阶段验收款/质保金 全 9 类）作系统核心口径回款唯一源。新增 `collection_stages.py`（CSV→回款节点；status 5 态 已回款/部分回款/质保期/延期/待回款 由「实际比例」唯一真值派生；**时间戳为东八区本地零点、须 UTC+8 转换否则整体早一天**；复用 profit.read_csv_rows、缺文件优雅留空）；`projects.build_payment_pmis`→`build_payment_summary`（仅聚合，删 _node_status/PAY_STAGES）；`preprocess` 9f 段换源（节点按 eff 取、保留售前回退原项目）；`schema.PaymentNodePmis` 增 category/receivedAmount/unpaidAmount/actualRatio/termDays + 重生成 TS。status 5 态跨页面契约传播（lib/paymentPmis.nodeSummary + TierNodesTab 计数/配色/标签）。详情页回款 tab 换主表+增列（已收/未收/账期）、删旧口径表与 chips、改 note；进度 tab 删回款里程碑表（NODE_COLS 保留供「原项目」tab 的 page.closedNodes）。真实数据冒烟：缺口项目 QABJ-SS-202506249001 正确解析（预付50%+合同约定日期收款1~4）。遗留：**86 项目「应有数据但导出端缺失」由用户修导出端、重导后自动填充**（其中 80 现有节点本为 0、多为售前 WSGF-SF）；33 项目 CSV 多出本期忽略；两清单存 `docs/superpowers/research/`；dashboard.totalPaymentNodes 仍按 rawNodes（3B 概览换源时处理）。终审 opus code-reviewer **APPROVE**（0 BLOCKER/HIGH/MEDIUM，2 LOW 含 projectExport fixture 旧串已顺手清理）；**已合并 master（dd226fe）**。②**3B 回款总览 /payment 换源（spec/plan 2026-06-17-3B-payment-dashboard-collection-source，V1.6.4，feat/3b-payment-dashboard-source）**：纯前端忠实换源——DashboardView 4 组件（DashMetrics/TierStrip/OrgRanking/TrendCard）从 rawNodes 旧口径(`filter.filteredNodes`)换到收款阶段节点级口径(`paymentNodes`+`projects`)，状态用 5 态、年份/视角/排除筛选保留。新增 `lib/payDashboard.ts`（`filterPayNodes` + `payDashSummary`/`payTierStats`/`payOrgRanking`/`payMonthly·QuarterlyTrend`，返回形态贴合既有组件契约 `DashSummary`/`OrgRank`/`PeriodSeries`/`expectedAmountWan` 使 `PendingBarChart`/`BoardDrilldownModal` 与 4 组件模板不动）；扩展 `PayNodeRow` 增 `receivedAmount`/`unpaidAmount`/`projectManager`；`filter` store 加 `filteredPayNodes`（不动 `filteredNodes`）；TierStrip 下钻改 `projectPaymentRows`。金额=节点已收/计划/未收、完成率=Σ已收÷Σ计划。**不动**后端（`dashboard` 对象前端未消费，留 3E 删）、不动 `filteredNodes` 及旧 `dashboardStats/dashboardCharts`（留 /ledger 3C、/calendar 3D）、不动 `l4Options/pmOptions`（仍 rawNodes，3E 清）。9 任务 TDD。**重要：collection_stages.csv 是纯手工投放文件，不在上传白名单/无下载直链，页面「数据更新」不刷新它**（86 缺口需用户手工放回新 CSV，残留清单见 docs/superpowers/research/3B-残留无收款阶段项目.csv）。verify.sh 全绿（99 文件/477 vitest + pytest + typecheck + build）；终审 opus code-reviewer **APPROVE 无阻断**（3 LOW + 3 NIT：「延期项目数口径由项目级终态→节点级去重，与旧值或有微差」已知会用户对账、接口重复(PeriodSeries/OrgRank)留 3E 统一清）；**已合并 master（d1ccc97）**。③**3C 回款台账 /ledger 换源（spec/plan 2026-06-17-3C-ledger-collection-source，V1.6.5，feat/3c-ledger-source）**：纯前端——LedgerView 从 rawNodes(`groupByProject` 旧 6 态)换到收款阶段口径(`paymentNodes` 按项目聚合)。新增 `lib/ledger` 收款阶段函数(`ledgerRows`/`filterLedgerRows`/`ledgerSummaryPmis`/`ledgerTierStatsPmis`/`ledgerStatusCountsPmis`)；`PayNodeRow` 增 `actualRatio`；状态 **6 态→进度 3 态(已全额/部分/未回款)+延期**（延期为正交卡+筛选项，非状态列值，因一项目可「部分回款」且含延期节点）；金额节点级(Σ已收/计划/未收，完成率=Σ已收÷Σ计划)；LedgerTable 下钻改读行自带 `nodes`(删 `rawNodes` prop)、列改 阶段/计划日/已收/未收/实际比例/状态(5 态)；CrossFilter 列筛选保留。**不动**后端、`filteredNodes`、`excludeFilter`(CalendarView 3D 共用)、`groupByProject`(旧 ProjectAgg 版 ledger 函数留死待 3E)。5 任务 TDD。verify.sh 全绿；终审 opus code-reviewer **APPROVE 无阻断**（2 LOW + 1 NIT：**待回款口径不一致(行用 expected-received、下钻用 Σ未收)已合并前修正为全程 ΣremainingAmount**，与下钻一致；NIT tier expWan fmtYuan 沿旧未改）；**已合并 master（80a8088）**。④**3D 回款日历 /calendar 换源（spec/plan 2026-06-17-3D-calendar-collection-source，V1.6.6，feat/3d-calendar-source）**：后端 `Project.orgL3`(组织架构经理→新L3-1组织,`projects.read_org_l3_map`) + 前端 `PayNodeRow.orgL3`；`lib/calendar.ts` 整体就地换源到 PayNodeRow——状态 5 态(日历排已回款=待回款/部分回款/质保期/延期 4 态着色+分组)、金额节点级(待回款=Σ未收/已回款=Σ已收)、orgL3/orgL4(dept)/pm 三筛保留；`calUpcoming` 顺修旧重叠异常(up30 改不重叠的 15-30 天 band，用户确认旧逻辑可修)；CalNodeTable(字段改名+去项目金额列)/CalGrid(statusClass 4 态)适配,CalDayDetail/CalAgenda/CalYearHeat 消费 lib 结构自动适配；CalendarView 删 `excludeFilter`+`filter.filteredNodes` 两路。**此后 `filter.filteredNodes` 全站无消费方**(连同 filterNodes/旧 dashboardStats·dashboardCharts/ledger ProjectAgg 函数/excludeFilter) 留 ⑤3E 随后端 rawNodes 统一清。7 任务 TDD。真实数据冒烟 631/631 项目带 orgL3、schema 通过；verify.sh 全绿；终审 opus **APPROVE 无阻断**（1 LOW 已修=org_l3_map 用 Optional 标注；2 NIT 沿旧覆盖未补）；**已合并 master（5a784c4）**。⑤**3E 分阶段（审计发现 3E 远大于"删后端 rawNodes"：除可直删的死代码外另有 6+ 处活 rawNodes 消费方未换源）**：**3E-1 死代码清扫（spec/plan 2026-06-17-3E-1-rawnodes-deadcode-sweep，V1.6.7，feat/3e-1-deadcode-sweep）**——纯前端零行为变更，删 `filteredNodes`(filter)/`filterNodes`+`FilterOpts`(filterNodes.ts，保留 ViewMode)/ledger 旧 ProjectAgg 5 函数/dashboardStats 两死函数+DashSummary+statusStats/**整文件 dashboardCharts.ts**/pivot 函数层(含 DimDef/MetricDef/PivotGroup，泛型默认改 unknown)及各自单测；approach A：PendingBarChart 的 PeriodSeries 改指 payDashboard.ts(消除 3B 遗留重复)后整删 dashboardCharts.ts。**保留**(被活消费挡)：`groupByProject`/`ProjectAgg`(dashboardStats)、`ViewMode`、pivot 类型层(CrossMatrix/PivotResult/PivotRow/PivotCol)、收款阶段 ledger 函数。删除全程 typecheck+全量 vitest 绿作零回归佐证；verify.sh 全绿；终审 opus **APPROVE 无阻断**（1 NIT：payDashboard.ts:53 注释提及已删 DashSummary，留 3E-2 顺手改）；**已合并 master（bc1c525）**。**3E-2 前端活消费换源（spec/plan 2026-06-17-3E-2-rawnodes-live-consumers-migration，V1.6.8，feat/3e-2-live-consumers）**：5 活消费方脱离 rawNodes——`l4Options`/`pmOptions`(filter) 换 projects、`governance` yundocsOk 换 `projects.length>0`、`paymentBand`(概览 OverviewView 回款带) 换 PayNodeRow(nodeName→stage)、`buildProjectDetail`(详情抽屉) 全面对齐 3C 台账(复用 ledgerRows;摘要去 projectType、节点表收款阶段列去 delayDays/nodeName→stage)、`buildProjectPage` 去 rawNodes 参数 + 原项目 tab 去恒空 closedNodes 表。**closedNodes 调研定论:结构性死功能**(relatedClosedId 指 PMIS 已关闭项目,与 WPS 回款节点 sheet 项目编号体系零交集,自 2026-06-11 引入起恒空、表 v-if 守卫从不渲染;原项目 tab 实显 originMilestones/originInfo,Path B 下线无损)。连带删 `groupByProject`/`ProjectAgg`/整文件 `dashboardStats.ts`(抽屉脱离后即死)。**教训**:Task1-3 各自只跑窄单测漏全量,致 FilterBar/DataQualityView/OverviewView 视图测试 fixture 仍 seed rawNodes 而回归,已统一修(只迁源不改断言)——删除/换源型任务须跑全量 vitest。**此后前端仅余 `RawNode` 类型本体 + stores/data.ts 的 rawNodes:[] 占位仍绑 rawNodes 键**(随 3E-3 删后端一并清)。6 任务;verify.sh 全绿;终审 opus **APPROVE 无阻断**（1 LOW：overview.test 延期Top3 截断专项断言重写时合并删除、slice 逻辑未改，留后续补;1 NIT）;**已合并 master（b2f23aa）**。**3E-3 后端移除 rawNodes（spec/plan 2026-06-18-3E-3-rawnodes-backend-removal，V1.6.9，feat/3e-3-backend-removal）**：完全 purge——截停 WPS 回款节点 sheet、删 all_nodes 链 + `rawNodes`/`dashboard`/`summary`/`displayColumns` 产出 + `compute_dashboard`/`compute_tier_summary` + schema `RawNode`/`Dashboard`/`TierSummary` + 前端死链(`dashboardSignals`/`dataQuality`/`DataQualityTable`)。换源：snapshots 稳定键→`projectId\|stage` 吃 paymentNodes；`totalPaymentNodes`→Σ paymentNodes 计数(550→678,口径变主域收款阶段数)；`pay_projects`→project_overview；dirty→paymentNodes actualRatio>1；**`projects.payment` 保留但 `aggregate_payment_pmis` 换收款阶段节点级(Σ已收÷Σ计划,删 S1 流水÷合同覆盖)**，4 前端消费方(概览KPI/清单/透视/详情页)不动自动得新口径、测试无需改断言；`health.paymentAbnormal` 用收款阶段 delayed 重算。**G1**:node_action+跟进 nextActionDate 自动填充抛弃(collection_stages 无该字段)。**G2 运维已执行**:清空 data/snapshots/+events.json、重跑 preprocess 重建 stage 键基线(events 0 条、无假事件)。Task7 顺并 schema 删(否则 model_validate 阻断)。11 任务(实 11 提交,含终审 LOW 修)TDD;verify.sh 全绿;产物无 4 键、payment 收款阶段、totalPaymentNodes=678;终审 opus **APPROVE 无阻断**(LOW 已修=删旧 aggregate_payment 死函数;2 NIT 测试 fixture 残留键/详情页两完成率并存 既存非回归);**已合并 master（9cdd454）**。**⭐ rawNodes 下线程序整体收官——3A 详情页/3B 概览/3C 台账/3D 日历/3E-1 死代码/3E-2 前端活消费/3E-3 后端移除 全数合并 master。**
- [x] **子项目1 PMIS 数据血缘扩展（2026-06-18，V1.7.0，feat/pmis-lineage-expansion，合并 1f27bd1）**：projectPmis team 字段+7列（签约单位/合同编号center优先/关键动作/交付物/项目超支/交付超支/终验时间）换源PMIS里程碑；在建项目universe仅保留中心项目；orgL3→orgL3_1换源PMIS；/projects详情页TeamBlock接入7新字段；/panalysis 回款完成率统一节点级口径(deriveProgress改节点级 Σ已收÷Σ计划)；meta totalProjects/totalClosed脱WPS改用PMIS计数。
- [x] **子项目2 在建/已关闭项目清单（2026-06-18，V1.8.0，feat/closed-projects-list，合并 e2189f3）**：已关闭全量摄取交付三部 closedProjects(轻量 PMIS 已关闭三表 + closeInfo)、meta.totalClosed=len、前端 /projects 在建 + /projects/closed 已关闭两路由 + /closed-project/:id 精简详情、导航在建项目/已关闭项目。注：导出 sheet 名/导出范围选项「项目清单」与 AboutView 描述属独立语境，有意保留不随导航改名（勿误改）。
- [x] **项目清单选列+表头筛选+横滚（2026-06-18，V1.9.0，feat/list-column-prefs，合并 c846126）**：/projects 在建 与 /projects/closed 已关闭两清单：列枚举筛选移入表头(复用 ColumnFilter)、新增选列菜单 ColumnPicker(显隐+上下排序+localStorage 持久化,useColumnPrefs)、在建增项目状态列(回款完成率与健康度间)+回款状态列、服务组(L4)→L4组、DataTable 加 fixed 列、横向滚动。
- [x] **详情页消费两列新数据（2026-06-17，V1.6.3，feat/pay-terms-bill-cols）**：源起用户重调 `input/` 下 5 个 CSV（budget_data/collection_stages/payment_records/profit_loss_bridge/profit_loss_direct）导出列。**精读+全管线实跑证实：5 文件代码引用列名/语义皆在、列变更全追加式、解析已对齐**（collection_stages 扩容 575→718 项目；时区不变量保持 UTC+8、`关联日期`=账期天数非多态；schema 校验通过、产物正确重生成），无"解析对齐"层面改动。本期仅消费两组新可用列：collection_stages「收款条件」（193 行自由文本）→ 回款 tab 阶段表新增换行列（`DataTable` 增按列 `wrap` 开关：wrap 列关 tooltip+换行）；payment_records「票据_*」（承兑/背书/到期日/互抵协议号，稀疏 6-16 行）→ 回款数据 tab 流水「票据」列（有才显示，`billType·billDueDate`，仅协议号兜底「互抵:号」）。扁平字段 `payTerm`/`billType`/`billDueDate`/`billProtocol` + schema + 重生成 TS；7 任务 TDD。**不做**：不进导出（projectExport）、其它 4 文件解析不动、`调整原因`(噪声)/`备注`/`订单号` 不消费。spec/plan：2026-06-17-pay-terms-bill-cols。verify.sh 全绿（99 文件/476 vitest + pytest + typecheck + build）；真实数据冒烟产物含 104 节点 payTerm / 11 记录票据信息、schema 校验通过；终审 opus code-reviewer **APPROVE 无阻断**（2 LOW + 2 NIT，其一「DataTable 双重打类加注释防误删」已采纳）；**已合并 master（9bbcf9a）**。

---

## Backlog（按优先级，来源：2026-06-03 代码评审 + harness 评估）

- [x] **SP1-followup（2026-06-19，SP2 复核关闭）**：异常项目(orgL4 空)硬排除仅施于 `filterProjects`/`paymentNodeRows`；`overview.ts computeKpis` 已在 `!isAnomalous` 守卫下计算回款达成率，`buildInsightRows` 对异常项目回款字段置 0，口径安全，复核关闭。

### 🔴 严重（小改动、高收益，建议优先）
- [x] **B-1** `server.py:1319` 改 `ThreadingHTTPServer`：解决同步 SSE 期间全站阻塞、"停止同步"失效。（A2 完成：ThreadingHTTPServer + create_server）
- [x] **B-2** `server.py:1319` 绑定 `127.0.0.1` 而非 `""`：避免局域网无认证访问/触发同步/清空数据。（A2 完成：绑定 127.0.0.1）
- [x] **B-3** `server.py:751` `os.environ.get('PROGRAMFILES(X86)')` 补默认值 `''`：缺该环境变量时会 TypeError 崩溃。（A2 完成：PROGRAMFILES(X86) 缺省值 + 可测）
- [ ] **B-4** `index.html:9` 改用本地 `fonts/google-fonts.css`，移除外链 Google Fonts：离线环境消除超时/字体闪烁。

### 🟠 高（后端健壮性）
- [x] **A2-debt** 继续消除硬编码（A1 遗留）：compute_dashboard/compute_tier_summary 中 ~15 处 nodeStatus 字符串改用 config.STATUS_*；tier 迭代/校验改用 config.TIER_LABELS；集成测试 process_below100_nodes 的时间依赖改注入 now。（A2 完成：status/tier 去硬编码 + now 注入）
- [x] **H-5** `sync_state/import_state/followup_sync_state` 多线程读写加锁（配合 B-1）。（A2 完成：followup_sync_state 加锁；sync_state/import_state 整体重赋值原子）
- [x] **H-6** `followup_sync_state` 只增不删，成功后清理，防内存缓慢增长。（A2 完成：_set_followup_state 限容）
- [ ] **H-7** `server.py:130 _get_node_action_date` 不再用正则扫 2.2MB 的 JS 文本；让 `preprocess_data.py` 额外输出结构化 JSON 供后端直接读。 (部分由 A1 完成：已输出结构化 analysis_data.json + schema 校验)
- [ ] **H-8** 抽取 `run_sync`/`run_import` 重复的"双模式 + 进度解析"为公共函数。 (部分由 A3 完成：解析逻辑已提取复用)；上传 handler 镜像对(handle_pmis_upload/handle_inputs_upload)也一并抽取,并包 PermissionError/ValueError 返回 JSON 错误(文件被 Excel 占用/Content-Length 非法时现为裸断连接)
- [x] **A3** server.py API 契约与进度健壮性：统一错误响应 {success,code,message} 收口各 handler；进度解析提取为可测 classify_progress_line（run_sync/run_import 三处循环复用，含 ok/info 合并贴近原逻辑，H-8 部分达成）；跟进云写入串行锁 _write_followup_lock（防 WPS 并发覆盖）。
- [ ] **A4** Playwright 脚本健壮性（需浏览器/云文档手验）：fetch_yundocs_full.py 抓取分块超时/重试；write_followup.py 把手工引号/换行转义改为 json.dumps；脚本输出改 JSON 行协议（与 classify_progress_line 对接）。
- [ ] **P8-pre** 质量数据后端细分备忘（P8 治理页重设计为零后端改动，本项保留）：mappingFile matchRate 0.671 需拆分（75 条映射不在 PMIS=陈旧、68 条 closed、9 条被部门筛除）；增加"L4 命中但项目经理为空"告警；projectsQuality 三个 List[Dict] 收紧为带字段模型。注：P8 已落地告警注册表（lib/governance.ts buildHealthReport），新增告警类目只需后端补数据 + 注册表加一项，接入点就绪。

### 🟡 中（前端架构，较大重构，需在测试保护下分步做）
- [ ] **M-9** `app.js` 按页面拆分 ES Modules，事件委托替代内联 `onclick`。
- [ ] **M-10** `data/analysis_data.js` 改为 `.json` + `fetch()` 加载。
- [ ] **M-11** 统一 innerHTML 渲染处的转义（140 处），降低 XSS 与重排。
- [ ] **M-12** `app.js` 清理 24% 空行（Prettier 一遍）。

### 🟦 Phase B 前端（Vue3+TS 重写）
- [x] **B1** 前端脚手架与基建：Vue3+Vite+TS 工程、由 schema.py 生成 analysis.ts（类型同源）、统一 API 客户端、数据加载 Pinia store、最小 shell、verify.sh 接入前端检查（typecheck+vitest+build）。
- [x] **B2** 布局骨架与全页面路由：uiStore（侧边栏折叠持久化）、集中导航配置、全页面路由（占位视图）、AppHeader/AppSidebar/AppLayout，App.vue 接入。
- [x] **B3** 筛选状态与控件：lib/filterNodes（忠实移植 getFilteredNodes）、filterStore（年份/视角/纳管 + filteredNodes/选项派生，取代散落全局）、FilterBar 接入 AppLayout。
- [x] **B4** 通用组件：DataTable（封装 el-table：列配置/格式化/排序/截断 tooltip）、ChartBox（封装 vue-echarts + ent 主题）、Modal（封装 el-dialog）；并加 Vitest 的 ResizeObserver/matchMedia 垫片 + vue-echarts 测试桩。
- [x] **B5** 看板首页（卡片部分）：lib/format + lib/dashboardStats（groupByProject/computeTierStats/computeDashboardSummary 忠实移植）、DashSummaryCards、TierCards、DashboardView 挂到 '/'（替换 HomeView）。
- [x] **B6** 看板首页（图表部分）：lib/dashboardCharts（季度/月度聚合 + 服务组排名 + 延期Top 忠实移植）、PendingBarChart、OrgRanking、DelayedTop，接入 DashboardView。看板首页完成。
- [x] **B7** 分层页外壳 + 回款节点(nodes) + 数据质检(integrity)：lib/cellFormat、tierSummaryBar、TierView（/tier/:tab/:tier）、TierNodesTab、TierIntegrityTab。点亮 nodes×3 + integrity×3 入口。
- [x] **B8** 分层页：项目总览(projects) + 风险(risk) tab：lib/projectsOverview、lib/riskGroups、format.fmtRatio、ProjectsOverviewTab、RiskTab，TierView 接入分发。点亮 projects×3 + risk×3 入口。
- [x] **B9** 分层页：回款状态(plan) 6 看板 + CF 筛选联动：lib/crossFilter、stores/crossFilter、lib/planBoards、ColumnFilter、PlanBoard、PlanTab，TierView 接入分发。点亮 plan×3 入口（分层页 5 tab×3 档全通）。
- [x] **B10** 回款台账(ledger)：lib/ledger（纳管-only 数据源/搜索过滤/汇总/分层/状态计数）、LedgerTable（项目表 + CF 列头 + 行展开下钻节点明细）、LedgerView（汇总/状态/分层三条 + 搜索/区间/状态筛选），路由 /ledger 接入。复用 B9 的 CF。
- [x] **B11** 项目经理视图(pmview)：lib/pmView（排名聚合/下钻数据/列定义）、PmRankingTable（排名表+行点击下钻）、PmDrilldownModal（Modal+负责项目表+延期节点表）、PmView，路由 /pmview 接入。
- [x] **B12** 回款日历(calendar)：lib/calendar、CalNodeTable、CalGrid、CalendarView，路由 /calendar 接入。
- [x] **B13** 临期跟进 Signal Board(只读)：lib/followup、FollowupSignalRow、FollowupView，路由 /followup 接入。
- [x] **B14** 临期跟进：展开面板 + 项目列表 + 跟进标记：stores/fuData(响应式本地标记)、lib/followupProjects、FuNodeTable、FuProjectRow、FollowupExpandModal；信号行可点击开面板，视图改用 fuData store（标记联动看板跟进率）。
- [x] **B15** 临期跟进：跟进记录 CRUD + 云回写 + 轮询：lib/followupApi、composables/useFollowupSync、FollowupRecordForm、FollowupRecords，嵌入 FuProjectRow。临期跟进页全功能完成。
- [x] **B16** 数据管理：数据质量总览 + 纳管开关 + 清空数据：lib/dataQuality、data store clearBusinessData、DataQualityTable、DataDrillModal、DataView，路由 /data 接入。
- [x] **B17** 数据管理：云同步(SSE 进度) + 离线 Excel 导入(上传+轮询)：xlsx 依赖、lib/excelImport、useCloudSync、useExcelImport、data store reload、DataView 两卡。数据管理页全功能。
- [x] **B18** 区间对比(compare) + 关于(about)：version.ts 版本号单一来源、lib/compare（按档统计+四图表数据+服务组排名）、CompareCards、CompareView、AboutView，路由 /compare、/about 接入并移除 PageStub。Phase B 前端重写收官。
- [ ] **B-opt** 前端构建优化（Element Plus 按需导入 / manualChunks 拆包，解决 ~1MB chunk 警告）；npm audit 处理 json-schema-to-typescript 的 dev 依赖告警；DataTable 的 Excel 导出 + 列枚举筛选弹窗待页面需要时实现；看板图表点击钻取弹窗 + 延期项点击跳转项目节点；分层页列可见性持久化 UI、CF 列枚举筛选、Excel 导出、nodeStatus/tier 徽章配色、行点击钻取。

### 🟪 Phase D 前端展示重构（设计见 docs/superpowers/specs/2026-06-04-phase-d-frontend-redesign-design.md）
- [x] **D1** 全局地基：CSS 变量双主题（明/暗）+ settings store（字号三档 + 持久化）+ DisplaySettings 入口 + ECharts 双主题 + theme.css（EP 变量桥接/字号 rem 令牌/滚动条·选区·焦点适配）+ 外壳变量化。
- [x] **D2** 全局项目详情面板（projectDetail store + buildProjectDetail + ProjectDetailDrawer，AppLayout 全局挂载）。上下文跳转(navContext)按 YAGNI 挪到 D4（有真实消费者时）；各页"点项目→唤起面板"接入随 D3/D4/D7。
- [x] **D2.5** 审计地基修复（D3 前，来源 /impeccable audit）：P1 暗色 token 化（仅留存共享组件/页面：DataTable/ColumnFilter/FilterBar + 台账/数据管理/关于/临期跟进全链，共 16 文件）+ v-activate 键盘激活指令（全局注册，下钻入口键盘可达）+ theme.css `--mut` 对比度达 WCAG AA + 语义状态色/反白色/--c-urgent token；P2 `.u-grid-auto` 自适应栅格工具 + 去 side-stripe 彩色左边框。**延后给 D3–D10 在重做时按同套 token 映射+v-activate 处理的文件**：Dashboard 系(D3)、Compare/Pm 系(D4 删除)、Calendar 系(D7-9)、Analysis tab 系 Tier*/Plan*/Risk/ProjectsOverview(D10)。
- [x] **D3** 看板首页重做：6 指标(DashMetrics) + 统一档位条(TierStrip) + 服务组排名(OrgRanking，排序切换;带筛选跳 /board 留 D4) + 待回款趋势(TrendCard 月/季切换) + 延期 Top(DelayTopCard 天数/金额切换 + 点项目开 D2 详情面板) + SegToggle 共享分段控件;lib 增延期项目数与延期按金额排序。删除旧 DashSummaryCards/TierCards/DelayedTop。
- [x] **D4** 多维看板·单维核心：`lib/pivot`(DIMENSIONS 6维 + groupByDims，分桶→groupByProject 算指标，N维可扩展) + `BoardView`(/board：维度/排序切换 + ECharts 对比图 + 排名表行下钻) + `BoardDrilldownModal`(组内项目→D2 详情面板) + `lib/navContext.goBoard` + DataTable 加 row-click/clickable + OrgRanking 行接入跳转。删除 compare/pmview 整链(14 文件)与 /compare /pmview 路由;侧栏新增「分析·多维看板」。双维/N维留 D5/D6。
- [x] **D5.5** 目检打磨：echartsTheme 补全明/暗坐标轴·网格·tooltip(暗色图表可读);字号档位跨度 14/15/16→13/15/17(切换可感知);TierStrip 重设计为三档回款进度条(完成率条+已回/计划+延期，点档下钻 BoardDrilldownModal→D2 详情)。回款日历暗色按既定延后 D7-D9;ECharts 画布文字缩放未做。
- [x] **D5** 多维看板·双维交叉：lib/pivot 增 `METRICS` + `crossMatrix`(行×列透视，保留每格 PivotGroup);BoardView 加「次维度/指标」SegToggle，交叉模式渲染 `BoardMatrix`(矩阵表) + 可加性指标堆叠图，单元格点击复用 BoardDrilldownModal → D2 详情;次维度=无时维持 D4 单维。
- [x] **D6** 多维看板·N 维透视表：lib/pivot 增 `pivotTable`(多行多列);新增 `DimPicker`(有序多选)/`PivotTable`;BoardView 引入「排名/交叉/透视」三模式，透视=自选行×列+指标(列空→单列合计)，点格下钻该交叉组项目→D2 详情。cross 由 secondDim 隐式触发改为显式 mode 门控。
- [x] **D7** 回款日历重做 A：CalGrid 富日格(日号/笔数/待回款金额/状态点) + CalDayDetail 选中日明细(状态分组,点项目→D2 详情) + CalNodeTable token+行下钻 + CalendarView 整页 token 化(**补日历暗色**)+字号放大;lib/calendar 增每日待回款金额。议程列表(B)留 D8、年度热力条(C)留 D9。
- [x] **D8** 回款日历 B：lib/calendar 增 `calAgendaGroups`(按日期升序分组+每日小计);新增 `CalAgenda`(议程列表，复用 CalNodeTable 行下钻);CalendarView 加「网格/议程列表」SegToggle 视图切换。年度热力条(C)留 D9。
- [x] **D9** 回款日历 C：lib/calendar 增 `calYearHeat`(年度12月待回款汇总);新增 `CalYearHeat`(12月热力条，强度 color-mix tint，点月聚焦);CalendarView 抽 gridNodes 共享 + 接入热力条 + 月度下钻联动。回款日历 A/B/C 三件套收口。
- [x] **D10** 业务分析三档整合：AnalysisView(/analysis/:tab) tab 条 + 档位筛选(默认全部+3档) + nodes 汇总条;5 个 tab 支持全部档(4 个跨档过滤、数据质检跨档 concat[带档位标签])+ token 化(补暗色)+ 全部档档位列;filterOverviewProjects 空 tier=全部;删 /tier 路由 + TierView，侧栏「业务分析」收成 5 个 /analysis 链接(替代 15 入口)。
- 范围外（形态稳定后单独排）：C 打包（dist 接入 server.py + PyInstaller）、A4 Playwright 脚本健壮性、销售维度（需数据源补列）。

### 🟢 低
- [ ] **L-13** 收紧 CORS（去掉 `Access-Control-Allow-Origin: *`）。
- [ ] **L-14** `index.html:143` 硬编码内网地址改为配置项/留空。
- [ ] **L-15** 跨平台一致性：macOS 下 taskkill/netstat/快捷方式逻辑失效，明确提示或补实现。
- [ ] **L-16** 上传卡反馈改进（pmis+inputs 两卡）：白名单外文件跳过时提示原因、ok=0 时去掉"请点[更新数据]"后缀、fetch 网络异常捕获提示。
- [ ] **L-17** CORS 收紧后续：上传/导入等写接口加 Origin/Host 校验，防跨站驱动写（配合 L-13）。
- [ ] **L-18** analysis_data.json 体积优化（现 **8.08MB**，R1 三新键增量 ~3.2MB，优先级上调）：indent=1 改紧凑 separators 约省 18%；deliveryCosts 结构精简（640×7 类目重复中文键）；projectProfit/projectMilestones 可考虑空值列剔除与字段名压缩。
- [ ] **L-19** P2 遗留小项：el-table 行下钻键盘可达性（清单/抽屉/台账等系列页统一处理,对齐 v-activate 约定）；详情页风险表「是否超期」为多行聚合串,70px 列宽靠 tooltip 可读（可加 formatter 摘要）；金额未填但有节点的项目（2/640）回款状态归「回款中」待业务确认是否单列。
- [ ] **L-20** P3 遗留小项：重复组节点（同项目同名,59 键）中间插/删行会致 #k 位移、diff 产生组内噪声事件（设计已声明,展示侧可考虑同节点多事件轻度合并）；单快照 ~280KB×90 天 ≈ 25MB（节点数翻倍时关注压缩）；/activity 时间范围筛选随事件量积累再加（现仅内嵌 100 条,YAGNI 裁剪）。
- [x] **L-21** 令牌化整改关闭（P5.5 字号 rem + P8 存活页扫尾）：项目域五页/数据管理/布局三件/共用组件 px 散值清零（42px 侧栏对齐缩进与 1-3px 微调按规范保留）；BoardView 两处状态 hex 入 echartsTheme STATUS_LIGHT/DARK 镜像（契约测试同步 theme.css）。**移交回款全量重设计**（实测规模远超原记录）：回款域遗留页约 230 处 px（Calendar/Followup/Ledger/Dashboard/PayAnalysis 及专属组件链）+ lib/calendar.ts、lib/planBoards.ts、nav.ts TIERS 回退 hex（--red/--orange/--green 未在 theme 定义，档位分类色语义待该期定）；ColumnFilter 经引用核实为回款专属（LedgerTable/PlanBoard），一并移交。
- [x] **L-22（2C 记录）** /projects 项目清单导出支持含「标签」列——**2E 已实现**：`lib/projectExport.buildExportSheets` + `exportXlsx.exportSheets` 多 sheet 导出，「项目清单」sheet 含标签列（顿号连接）、另出独立「项目标签」sheet，按范围勾选并遵循当前筛选。
- [ ] **P-next（用户待办,2026-06-11）**：① 回款金额数据源拟从云文档迁 PMIS——等用户给出 PMIS 侧数据出处后立项；② Insight 后端增列候选维度（项目级别/项目类型/省份/营销一级部门/项目一级分类/主责部门/销售,均在 PMIS 表头存在）——用户选定后做 pmis.py 摄取+schema+前端接入；③ 若期望 PMIS 侧项目里程碑明细,需 PMIS 补导出逐里程碑表（当前仅百分比/状态枚举）。
- [ ] **L-23（2E 终审遗留,非阻断）**：2E 合并前已修 BLOCKER（manual_history.rollback 防目录穿越）+ HIGH（导入/回滚后刷新 projectTags store）。余项记此：① **互斥不完整**——服务实为 ThreadingHTTPServer，`handle_manual_import/rollback` 的 `history_state["running"]=True` 设在 `_history_lock` 外、且 `_history_busy()` 未含 history_state；两个人工导入或人工导入 vs data-history 回滚不会在闸门互斥（仅靠共享锁串行，各自先快照不损坏数据，但第二个会静默覆盖且都返 success）。修法：抢锁后再置标志 + `_history_busy()` 纳入 history_state。② **`_save_project_tags/_save_followup_records` 非原子**（直接 open('w')，不同于 manual_history/data_history 的 copy-then-swap）：标签写成功而跟进写失败留半写态，有快照可回滚兜底但未告知用户 backupId。修法：两 `_save_*` 改 tmp+os.replace；失败提示已自动快照。③ **同秒连导快照撞名**（vid 秒级，`makedirs(exist_ok=True)` 复用同目录覆盖 manifest 丢还原点）：vid 追加 `%f`/递增后缀。④ **空行跳过吞错**（manual_import 跟进空行判定不含项目名称/日期列、标签 `if not pid: continue`）：空行判定应覆盖整行单元格。⑤ **手填重复记录编号不校验**：`_build_followup` 收尾对最终编号集合查重报错。⑥ 裸 fetch 无超时（大文件卡死 manBusy 永真）：加 AbortController。⑦ exportSheets 全空集静默无反馈、`_valid_project_ids` analysis 缺失时全行报"未知项目编号"：补 toast/顶层提示。
- [ ] **L-24（历史快照分组留存 V1.6.1 终审遗留,非阻断）**：合并前已修 HIGH（`data_history.rollback` 目录穿越——basename 防护+排除 `_source`/`_pre_rollback`+穿越拒绝测试，对齐 manual_history）+ LOW（`items: List[Tuple[str,str]]` 类型注解收紧）。余项记此：① **archive 半失败残目录**——`archive_version` 顺序为"建版本目录写 JSON→`_refresh_source`→写 manifest→prune"，若 `_refresh_source` 抛异常（磁盘满/源被占用）则版本目录已建但无 manifest、prune 未跑（可自愈：list 兜底 `{id}`、下次同 id archive 重建；跨日则残目录滞留占一个 prune 名额）。修法择一：archive 包 try 失败 rmtree 半成品再抛；或把 `_refresh_source` 移到 manifest+prune 之后（版本目录完整性优先，源刷新失败不影响回滚单元）。② **源刷新失败无 UI 感知**——`_refresh_source` 失败时 `_source` 停在旧内容，前端源说明行仍显示旧 `refreshedAt`，用户难辨"源最新"vs"刷新失败停旧版"；可在 UI 暴露或失败告警。

### 🧰 Harness 自身（持续完善）
- [x] **HX-1** 建立 `CLAUDE.md`（指令层；以其为唯一代理入口，不设 AGENTS.md）
- [x] **HX-2** 建立 `PROGRESS.md` + `feature_list.json`（状态层）
- [x] **HX-3** `preprocess_data.py` 纯函数 pytest + `verify.sh`（验证层）
- [x] **HX-4** `init.sh`/`init.bat` 固化环境搭建（venv + 依赖 + playwright + 浏览器检测）
- [x] **HX-7** 基础设施：`git init` + `.gitignore` + `requirements.txt`/`requirements-dev.txt` + `ruff.toml`（ruff 接入 verify.sh，渐进式规则）
- [ ] **HX-5** 扩展验证：Playwright 端到端冒烟（页面可加载、看板有数）
- [ ] **HX-6** 为 `preprocess_data.py` 的计算函数（compute_dashboard 等）补集成测试（需小样本 fixture）。注：compute_* 已接收数据参数=可测，仅 `process_followup_records()` 需先解耦 I/O (部分由 A1 完成：compute_node_status 已单测；计算层 compute_dashboard/tier 集成测试起步)
- [ ] **HX-8** ruff 渐进式扩规则：存量整改后逐步打开 F401→E→I
- [ ] **HX-9** verify.sh 加类型同源漂移护栏：跑 `npm run gen:types` 后 `git diff --exit-code frontend/src/types/analysis.ts`（本期曾发现 schema 改动漏再生成）。
- [x] **A1** 数据契约与配置地基：config.py + schema.py（pydantic 契约/校验/JSON Schema 导出）+ assign_tier/compute_node_status 纯函数 + 管道集成测试 + preprocess 输出校验后的 analysis_data.json

> 验证基线：`bash verify.sh` 四步全绿（py_compile + ruff + 75 项 pytest + 前端 typecheck/vitest/build）。

---

## 会话交接备注（Handoff）

### ✅ Plan S1 完成（2026-06-12）：反馈修缮批次（V1.0.1）
- 分支 **`feat/phase-s1-feedback-fixes`**，5 任务（T1/T2/T3 opus、T4 sonnet 两次早夭由主循环接管、T5 主循环），`verify.sh` 全绿。spec：`2026-06-12-S1-feedback-fixes-design.md`（含调查结论五条与用户决策四条）。
- **动态事件**：Event += tone（后端 diff 决定/前端染色）；评级变化停发；进入/移出主域改名「新增/关闭项目」标绿；里程碑变更落延期类标红；风险增红减绿；超支出现带整体超支金额（>5000 红/≤5000 黄/金额≤0 不显数仅黄——PMIS 分项标超但整体未超实测 38/45）；新事件「交付费用超支」（delivery 类目超支，红，**升级护栏**：旧快照缺 deliveryOver 字段不触发）。快照项目条目 += overspendAmount/deliveryOver(Cats)。
- **超支金额双口径（用户钦定）**：非售前=direct 实际成本−预算成本（弃顶部「剩余预算」列，225/632 不自洽）；售前=当前消耗−原剩余预算（bridge 科目 2，276/276 可得）。
- **回款完成率切流水口径**：paymentRatio=payment_records 累计÷合同总额（售前回退原项目合同总额；分母缺=null；文件缺失整体回退旧口径）。脏数据案例 WSGF-SF-202502100199：108.25%→**100%** 实测修复。/insight 与回款域仍云文档口径（两口径并存）。
- **清单**：分页 20/50/80/100 默认 50（卡慢根因=633 行×14 列全量 DOM 渲染）；筛选全多选（增经理/级别）按列序重排；删客户列；项目名去排序；健康度列头 i 悬浮定义+关于页「健康度规则」段。
- **详情页**：科目树剪枝改仅剪全 None（全零科目恢复，单项目 12→24 行）；里程碑表去三色（priority 留数据层）。/insight 柱图 colorBy:'data' 逐柱配色。
- **运行数据说明**：T2 验证时清理了 data/events.json（98 条开发期旧格式事件）与当日快照并重新生成（40 条新格式）——历史事件为今日反复跑管线的开发产物，无业务损失。
- 手工烟雾清单（需用户执行）：① /activity 事件染色与「新增/关闭项目」（需两次同步对比产生新事件）② /projects 分页/多选筛选/无客户列/健康度悬浮 ③ 详情页科目树全量（约 24 行）与里程碑无色 ④ 清单 WSGF-SF-202502100199 回款完成率=100% ⑤ /insight 柱图多色。

### ✅ Plan R4 完成（2026-06-12）：产品改名「项目管理平台」+ V1.0.0 版本策略（Phase R 收官）
- 分支 **`feat/phase-r4-rename-version`**，2 任务（改名 sonnet、约定与收尾主循环），`verify.sh` 全绿。计划：`2026-06-12-R4-rename-version.md`。
- **改名（展示层 8 处）**：index.html title / AppHeader 标题 / 关于页名称与产品名称行 / server.py 启动日志 / 停止服务.py docstring+print；关于页作者=王叙潼牛逼、**删数据来源行**；版本重置 **V1.0.0**（version.ts 单一来源）。
- **保留旧名（文件名兼容链，随下次打包专项更名）**：server.py:1502-1557 快捷方式区（.lnk/.vbs 名与 Description）、*_启动.bat/.command、PaymentReviewApp.spec exe 名。
- **版本策略入约定**（CLAUDE.md+本文件版本节）：`VX.Y.Z`——X 须用户确认 / Y=整页级 / Z=子页面级；单一来源 version.ts。
- 手工烟雾清单（需用户执行）：① 浏览器标题与侧栏头为「项目管理平台」；② 关于页：作者王叙潼牛逼、无数据来源行、版本 V1.0.0；③ `python server.py` 启动日志新名；④ 既有桌面快捷方式仍可启动（旧名 .vbs 链未动）。

### ✅ Plan R3 完成（2026-06-12）：数据管理页五卡重排 + 默认直链 + 白名单扩展（V7.9.0）
- 分支 **`feat/phase-r3-data-management`**，3 任务（后端/前端 opus、收尾主循环），`verify.sh` 全绿。计划：`2026-06-12-R3-data-management.md`，版式 A 经用户预览确认。
- **/data 五卡**：回款数据（WPS 链接预填+云同步+离线导入）/ PMIS 九表（统一文件行：直链项=输入+重置，blob 项=「无直链·需手动导出上传」琥珀徽章，行内最近更新时间；在线下载+多选上传）/ 项目域文件（input/ 根 7 文件+时间+多选上传）/ 更新数据 / 设置。
- **默认直链机制**：config.DEFAULT_LINKS（WPS 回款+项目状态×2+风险，用户 2026-06-12 提供）；GET /api/pmis/links 合并规则=**保存值胜出（含显式空串），默认仅补缺省键**，响应带 defaults 供前端「重置」；WPS 链接以「回款数据」键并入 pmis_links.json store（plan_downloads 按九表名单过滤不受影响）。
- 新 GET /api/files/status：九表+input 根 8 文件的 mtime（固定名单防任意路径）。
- **两处既有缺口修复**：① 前端 useInputFiles 白名单仍是旧 xlsx 三文件——CSV 上传被客户端静默跳过（R1 仅改了后端）；② PMIS 上传白名单七表——里程碑两表上传被 400 拒。教训：**白名单类常量前后端各有一份，改时必须 grep 两侧**。
- 手工烟雾清单（需用户执行）：① /data 五卡渲染、WPS/状态×2/风险四行默认链接预填；② 改链接→「重置」恢复默认；③ 「在线下载」四直链项（需内网登录态）；④ 上传里程碑 xlsx 与任一 CSV 成功落地、行内时间刷新；⑤ 「更新数据」后治理页/详情页数据联动；⑥ 已有 pmis_links.json 的机器上保存值优先于默认值。

### ✅ Plan R2 完成（2026-06-12）：详情页三 tab——里程碑双层三色 + 预算核算科目树 + 回款数据流水（V7.8.0）
- 分支 **`feat/phase-r2-detail-tabs`**，3 任务（组件三件套 sonnet、装配 opus、收尾主循环），`verify.sh` 全绿。计划：`2026-06-12-R2-detail-tabs.md`。
- **进度里程碑 tab 双层**：上=项目里程碑表（MilestoneTable，行级三段优先级淡底+深字：高 danger/中 warn(棕→琥珀)/低 ok；列=里程碑/计划/实际/关联回款阶段/状态[有实际时间=已完成]）；下=回款里程碑表（原 MILESTONE_COLS 保留，标题更名「回款里程碑」）。售前项目本 tab 显示自身（SF）里程碑，**原项目 tab 增原项目（SS）里程碑块**（按 relatedClosedId 取）。
- **预算核算 tab**：全预算汇总条（预算收入/实际成本/预算毛利/毛利率，出处 profit_loss_direct.csv）→ 科目树表 ProfitTree（列=预算/概算/核算/实际发生/剩余/消耗率；一二级恒显、三级默认折叠、默认展开 2.2/2.3；**毛利率行按比率格式化**不可 fmtWan）→ 售前桥接块（原项目科目树+汇总，标注桥接 SS 编码）→ PMIS 消耗比汇总与 delivery 明细保留（出处文案改 .csv）。
- **回款数据 tab（新，紧跟回款）**：汇总条（累计回款(万)/笔数/最近回款日）+ 流水表（类型/金额(元)/确认日期/单位/流水号/认领人；非 CNY 显示原币+汇率）。原回款 tab 并存。
- 实现期偏离（终审认可）：DataTable/ProfitTree 的 rows 必填 vs 生成类型可选 → `?? []` 最小弥合；计划误记原用例数 11（实为 10），现 15 例。
- **终审阻断项修正（786338e）**：CSV「消耗率」列是**百分点量级**（实测 字段=actual/budget×100，如 184.52=184.52%），而「毛利率」列是 0-1——同一 CSV 量纲混用；fmtRatio 再乘 100 曾致 100× 错显（fixture 取值 0.5 巧合掩盖）。修复=后端 profit.py 归一（科目树 rate 与 summary 成本消耗率 ÷100，毛利率不动），复审三方数值验证（CSV÷100==actual/budget==JSON）通过。教训：**比率字段必须用真实量级 fixture**（>100% 用例 184.52→1.8452 已入测）。
- 手工烟雾清单（需用户执行）：① 普通项目进度里程碑双层与三色行（高=红/中=琥珀/低=绿）；② 回款数据 tab 流水与非 CNY 汇率显示；③ 预算核算科目树默认展开 2.2/2.3、点击一/二级行展开三级、概算/核算列有值；④ 售前项目（如 WSGF-SF-202507140766）预算核算桥接块 + 原项目 tab 里程碑块；⑤ 无流水/无里程碑项目空态不崩。

### ✅ Plan R1 完成（2026-06-12）：数据地基——七文件摄取 + 治理源卡 5→9 + 清单三列（V7.7.0）
- 分支 **`feat/phase-r1-data-foundation`**，5 任务（里程碑/科目树/集成 opus，前端 sonnet 中途死亡由主循环接管补完，收尾主循环），`verify.sh` 全绿。spec：`2026-06-12-R-batch-data-expansion-design.md` §2，计划：`2026-06-12-R1-data-foundation.md`。
- **新模块**：milestones.py（宽转长 13 类目+三段优先级 高=终验/服务完成/关联回款非空、中=项目关闭、低=其他；**MilestoneItem.pct 为 0-100 原值**，真实数据百分比列当前全空；已结项 matched 排除被在建覆盖的 pid）；profit.py（direct/bridge 科目树 + budget 概算/核算按 **code+name 双键**合并、毛利编码别名 3.1→3/3.2→4——budget 与 direct 的 2.3.x/2.4.x 子科目**同码不同名不可合并**；payment_records 按项目分组 新→旧）。
- **集成**：preprocess 9e 段，keep_ids=主域∪relatedClosedId 体积护栏；analysis_data 三新键 projectMilestones(827)/paymentRecords(374)/projectProfit(632 含 bridge 276)；projectsQuality +6 统计；PmisStatus +项目级别/项目类型（基础信息表优先状态表兜底）；delivery_analysis 切 csv（读侧回退 legacy xlsx，上传白名单两式过渡）；**.spec datas +milestones.py/profit.py**（frozen 硬依赖）。
- 真实管线量级（2026-06-12）：里程碑在建 634 行命中 610 / 已结项 3915 命中 217、流水 622 命中 584、direct 903 命中 632、budget 607 命中 574（概算并入 574 个收入行）、桥接 285 命中 276。
- **坑位记录**：PMIS 导出 xlsx 的 dimension 元数据是假的，openpyxl read_only 会把 3915 行截成 1 行——一律走 pmis.read_pmis_sheet（非 read_only）。
- 前端：治理页源卡 9 张（+里程碑两表/回款流水/全预算 direct+budget/桥接预算），缺失告警 6 类分级（msActive/paymentRecords/profitDirect 高，msClosed/profitBridge/budget 中）；清单 +合同金额(万)/级别/项目类型 三列。
- 手工烟雾清单（需用户执行）：① /governance 九源卡数值与告警区（在建里程碑 634/流水 622/direct 903 等）；② /projects 三新列显示与合同金额排序；③ 数据管理页「更新数据」重跑后治理页数值刷新；④ analysis_data.json 含三新键（R2 才有页面消费，本期仅数据就绪）。
- analysis_data.json 4.86→**8.08MB**（R1 增量），L-18 体积优化优先级上调。

### ✅ Plan P8 完成（2026-06-12）：数据治理页健康检查重设计 + 工具组收尾 + 打包专项核验（V7.6.0）
- 分支 **`feat/phase-p8-governance`**，6 任务（视图模型/治理页 opus，关于页/令牌扫尾 sonnet，打包/收尾主循环），`verify.sh` 全绿。spec：`docs/superpowers/specs/2026-06-12-P8-governance-tools-design.md`（含 P7 暂停决策记录）。
- **治理页 /governance 整页重写**（「同步后健康检查」三层）：① 结论横幅三态（红=云文档主数据缺失 / 黄=辅源缺失或高中告警 / 绿=无高中告警，低优先附注不阻塞绿）；② 五张源状态卡（云文档/PMIS/组织架构/售前映射/delivery，缺失=灰态未提供）；③ 折叠分级告警区——九类静态+四类动态缺失告警，严重度 高(源缺失/PMIS未匹配/负责人不在清单)→中(回填/售前未映射/口径冲突/主题覆盖不足)→低(人员无项目/脏值)，0 条置灰沉底，展开=明细表(DataTable)+导出(四类目)，源缺失类展开为降级说明 note。双向告警(母 spec §3.6)落地为「负责人不在人员清单」(高)+「人员清单无项目」(低)。
- 架构：纯函数 `lib/governance.ts buildHealthReport(AnalysisData)→HealthReport`（10 项单测全分支），View 是薄渲染层（8 项组件测试），**零后端改动**；旧 coverageColor/verdictLabel 删除。
- 真实数据核验：joinRate 0-1 量纲、themes verdict 枚举吻合；当前真实数据呈黄横幅「6 类告警需关注·另有 12 条低优先提示」（负责人告警 21/未匹配 8/回填 250/售前未映射 7/冲突 3/覆盖不足 1，低优先：人员无项目 11+脏值 1）。
- **工具组收尾**：关于页双域刷新（项目域五页/回款域五页/工具组 + 三类数据来源）+ 全令牌化；数据管理页文案对齐（项目映射→售前映射、预算核算→预算核算明细）。
- **L-21 扫尾**：见 backlog L-21 关闭条目；BoardView 状态色入 echartsTheme STATUS_LIGHT/DARK 镜像（契约测试同步 theme.css，主题切换响应）。
- **打包专项核验**：① 修复 `.spec` **write_followup.py 缺件**（server.py:230 frozen 分支 _run_script_direct 依赖，打包版跟进回写此前必坏）+ exe 名 v7.6.0；② frozen 走查通过——四个 _run_script_direct 目标脚本（preprocess_data/fetch_yundocs_full/pmis_download/write_followup）BASE_DIR 均双模式正确（sys.executable 目录），可变数据（data/snapshots/events/input/yundocs_data/followup_records）全挂 exe 目录，内嵌脚本走 _MEIPASS+cwd=BASE_DIR；③ 本地 PyInstaller 6.20 实际构建成功（dist/PaymentReviewApp_v7.6.0.exe，76MB），exe 冒烟通过（/ 200、/data/analysis_data.json 200 5.1MB、浏览器实载成功、/api/stop 优雅停止）。注意：本机 curl 走系统代理会对 localhost 返回 503，测试需 `--noproxy '*'`。
- 手工烟雾清单（需用户执行）：① /governance 黄横幅「6 类告警需关注」+ 五源卡数值（更新时间对照数据管理页）；② 展开「PMIS 未匹配」明细表+导出 xlsx 可开；③ 0 条告警（如口径冲突清零后）置灰不可点；④ 展开「数据源缺失」类（可临时移走 input 文件重跑更新数据验证）显示降级说明；⑤ /about 双域文案 + V7.6.0；⑥ 字号三档在治理/关于页生效；⑦ dist/PaymentReviewApp_v7.6.0.exe 双击启动目检治理页渲染（exe 目录需有 data/）。

### ✅ Plan P6 完成（2026-06-11）：回款分析归并 + 回款总览瘦身（V7.5.0）
- 分支 **`feat/phase-p6-payment-redesign`**，3 任务（归并 opus / 瘦身 sonnet / 收尾主循环），`verify.sh` 全绿。
- **归并**：新 `/panalysis/:tab?`（默认 board）「回款分析」单页 = 多维看板（内嵌 BoardView,深链 query.dim 兼容）+ 业务分析五 tab（项目总览/回款节点/回款状态/风险项目/数据质检,tier 档位与汇总条原样迁移）；AnalysisView 删除；旧路由 `/board`、`/analysis/:tab` **函数式 redirect** 到新页（保 query,深链不破）；navContext.goBoard 改推新路径；导航「回款」组收为 5 项（总览/分析/日历/跟进/台账）,删多维看板项与回款分析子组。
- **瘦身**：/payment 删 DashSignals（临期信号行）与 DelayTopCard（延期 Top）整链（-198 行,组件+测试 4 文件;职能已由项目总览回款重点带 + /followup + /panalysis 风险 tab 覆盖）；保留 DashMetrics/TierStrip/OrgRanking/TrendCard（FilterBar 联动回款工作台）,TrendCard 通栏；lib 纯函数（delayedTopProjects 等）保留。
- 技术要点：vue-router 4 的 resolve() 不跟随函数式 redirect——redirect 测试用 push 后断言 currentRoute（含 redirectedFrom/query 透传）。
- 手工烟雾清单（需用户执行）：① 侧栏「回款」组 5 项,「回款分析」进 /panalysis 默认多维看板 tab,六 tab 可切；② 旧链接 /board?dim=orgL4 与 /analysis/plan 自动重定向落对应 tab（query 保留）；③ /payment 余四卡（指标/档位条/服务组排名/趋势通栏）,FilterBar 联动正常；④ 服务组排名行点击仍带 dim 落多维看板 tab。
- P6 归并后 pivot 双实现（回款 groupByDims/项目 projectPivot）保持并行——统一抽象无消费方需求,YAGNI 维持（P5 决策延续）。

### ✅ Plan P5.5 完成（2026-06-11）：实测反馈修缮（V7.4.1）
- 分支 **`fix/p5.5-feedback`**，用户对 P2-P5 的实测反馈批次（主循环亲做小改密集项 + sonnet 批量令牌化），`verify.sh` 全绿。
- **调查结论（答疑入档）**：① 字号三档机制=html font-size:var(--fs-base)+rem 令牌，项目域五页硬编码 px 不缩放（根因，本次兑现 L-21 字号部分）；② 色彩机制核查无异常——新页全 token/双主题/图表 palette 正常，"颜色少"=单系列图只取 chart-1 + 状态色按规范仅用于状态语义；/board 两处硬编码 hex 留 P6（L-21 余项：间距/色值）；③ **消耗比出处**=PMIS《项目状态信息数据》"项目核算（元）÷项目总预算（元）"（pmis.py 计算），与 delivery_analysis.xlsx 明细**不同源**（已在成本 Tab 标注两出处）；④ PMIS 无逐里程碑行（"里程碑进展"仅百分比 0/50/67/83/100,"里程碑进度"为状态枚举），里程碑明细采用《项目回款节点（里程碑）清单》行级数据（expectedMilestoneDate 387 非空/isMilestoneAchieved 618/actualDate 381/completionStatus 690）。
- 交付物：总览 KPI 六卡带筛选跳转（推翻 P4"不可点击"决策）+ 健康度计数行放大；清单加服务组(L4)列与筛选 + 六下拉 placeholder 修复（empty-values 含空串）；详情页进度里程碑明细表 + 成本 Tab 双出处标注；分析页 11 维（+服务组/评级/超支/暂停）+ 次维 SegToggle 点选（含「无」+主维联动复位,顺带闭掉 P5 已知缺口 M-1 交叉渲染测试）；项目域视图+侧栏字号 px→rem 令牌（字号三档全局生效）。
- backlog 新增见 P-next/L-22。

### ✅ Plan P5 完成（2026-06-11）：/insight 项目分析，项目域五页齐（V7.4.0）
- 分支 **`feat/phase-p5-insight`**，5 任务全完成（分级调度：泛型化/lib/弹窗 sonnet、页面 opus、双审合一 opus、设计与收尾主循环），`verify.sh` 全绿（188 pytest + 426 vitest + typecheck + build）。
- 交付物：`/insight` 三模式（排名柱图 top15+全量表 / 交叉矩阵 / 多行列透视）× 7 维度（阶段/项目状态/风险等级/项目经理/行业/签约形式/健康度，空值归一）× 6 指标（项目数/合同总额/平均完工/平均消耗比/回款完成率 Σ/Σ/延期项目数，rate 无数据=null）；下钻 InsightDrillModal 项目列表 → /project/:id；`lib/pivot` 的 CrossMatrix/PivotResult 泛型化（默认 PivotGroup 零破坏）后 BoardMatrix/PivotTable/DimPicker/ChartBox 直接复用；nav 项目组第四项。**项目域五页齐**（总览/清单/详情/动态/分析）。
- 设计决策：与回款域 pivot **并行**而非改造（groupByDims/PivotGroup 回款语义不动，P6 归并期再议统一）；交叉模式无堆叠图（rate 指标不可加，YAGNI）；排名图不设色走主题（不效仿 BoardView 硬编码 hex——L-21）。
- 真实数据验证（opus 双审 python 复算零误差）：项目数 640/合同总额 20418 万/平均完工 45.47%(337 非空)/平均消耗比 58.72%(297)/延期项目 25；行业 42 值（银行 212/运营商 80/金融 78）/项目经理 74 值/阶段 4+未指定。**签约形式当前 640/640 全空** → 单桶"未指定"（PMIS 源列"签约形式分类"无值,数据依赖非 bug）。
- 评审修正记录：交叉/透视格 rate 无数据曾随 ??0 误显 "0%"（真实 31/128 桶）——格值 NaN 标记、展示层 '-'，与排名表/下钻三处统一（双审 I-1）。
- 已知测试缺口（双审 M-1/M-2,与仓库既有模式一致暂不补）：交叉模式视图测试未驱动次维选择（BoardMatrix 渲染路径零覆盖,接线已两轮人工核对）；InsightDrillModal 标题格式化经 ModalStub 未直测。
- 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → ① 侧栏「项目」组四项,/insight 默认排名模式（阶段维×项目数,柱图无色板异常）；② 切"行业"维 42 组、表 Top3 银行 212/运营商 80/金融 78；③ 交叉模式选次维"健康度"出矩阵,rate 指标下无数据格显 '-' 非 0%；④ 透视模式选行维出表,点格弹项目列表,点行进详情页；⑤ 签约形式维呈单桶"未指定"（已知数据依赖）。

### ✅ Plan P4 完成（2026-06-11）：项目总览首页 + 旧首页迁 /payment（V7.3.0）
- 分支 **`feat/phase-p4-overview`**，4 任务全完成（分级调度：lib/清单扩展 sonnet、总览页+路由让位 opus 双审、设计与收尾主循环），`verify.sh` 全绿（188 pytest + 413 vitest + typecheck + build）。
- 交付物：`/` 驾驶舱式项目总览（spec 4.1 布局 2）——KPI 条六指标（不可点击）/ 项目健康度（三档+四维异常+风险卡→详情）/ 回款重点带（年度进度条+本月待回+7 天临期+延期 Top3，微块钻 /payment//followup/详情，accent 边框强调）/ 风险焦点行（高风险/暂停/超支带筛选跳清单）/ 右栏动态 10 条+查看全部；`lib/overview` 三纯函数（now 注入）；清单页路由 query 筛选初始化 + paused/overspend URL-only 筛选与可关闭标签；旧回款看板**零改动**平移 `/payment`（FilterBar 保留），catch-all 路由名 dashboard→overview（hideFilter）。
- 口径决策：KPI 达成率=主域 projects[] 聚合；回款重点带与 /payment 同口径（全 isPaymentRelated 节点）——两套口径并存是有意设计（微块钻的就是 /payment）；暂停=是否暂停 bool、高风险=riskAbnormal、超支=cost.超支。
- 真实数据基线（质量审 python 复算逐值零误差）：KPI 640/563/8/6/43/59.13%；健康度 547/82/11/0 + 四维 19/6/54/25；年度 4648/11055 万、本月待回 887 万、7 天临期 2、延期 35（Top1 1063 万）。
- 评审修正记录：延期 Top 项目名（真实 59 字）缺 flex:1+min-width:0 会撑破回款带卡片（对齐 DelayTopCard 既有约定）+ 风险卡 max-width/金额串 nowrap 溢出约束。
- 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → ① `/` 显示驾驶舱五区,数字对上基线（640/563/8/6/43/59.13%,年度 4648/11055 万）；② 侧栏「项目」组现"项目总览/项目清单/项目动态",「回款」组"回款总览"指 /payment 且旧看板原样（FilterBar 在）；③ 点风险焦点行"超支"卡 → 清单页带「超支项目 ✕」标签 43 行,关闭恢复；④ 健康度风险卡/延期 Top 项点击进详情页。
- backlog：无新增（风险卡视觉宽度差异为可选打磨,不立项）。

### ✅ Plan P3 完成（2026-06-11）：快照/diff/事件流 + 项目动态页（V7.2.0）
- 分支 **`feat/phase-p3-activity`**，9 任务全完成（分级调度：核心算法/集成 opus、常规 sonnet、设计与收尾主循环），`verify.sh` 全绿（py_compile + ruff + 187 pytest + 396 vitest + typecheck + build）。
- 交付物：`snapshots.py`（build_snapshot 精简快照[项目8字段+节点7字段+agg7项] / diff_snapshots 事件引擎[项目8类+回款5类,config 常量判定] / compute_period_compare_entry 六指标 / 90 天保留+三基线选择+events.json 截断500）；preprocess 9d 段集成（先 diff 旧快照→算对比→再覆盖写,内嵌最新 100 条新在前）；schema Event/PeriodCompare + STAGE_ORDER + 类型同源；前端 lib/activity + EventTimeline 共享组件 + `/activity`（三基线周期对比卡/置灰 + 域筛选/搜索 + 按日时间线）+ 详情页右栏动态（布局 B 完整态,≤1200px 落底,补 P2 推迟项）+ 导航「项目动态」。
- **节点稳定键决策（spec 3.3 留本期确认）**：`projectId|nodeName#k`，k=同名节点按 rawNodes 原始行序的第 k 次出现（真实数据无天然唯一键：projectId+nodeName 25 组重复/84 行，无期次字段；重复组中间插行仅影响该组内匹配）。
- 评审修正记录：① 快照管道 try/except 兜底——辅助特性 IO 异常（权限/磁盘满）不得阻断 analysis_data.json 主输出（exe 分发场景实测会连坐）；② load_snapshot 损坏 JSON 按缺失处理（与 append_events 防护一致）；③ 前端去 as any 走生成类型 + 周期对比缺字段 ??0 兜底；④ 零事件非首次运行文案区分"与上次快照相比无变化"。
- 真实数据验证结论（opus 质量审合成变化实验）：稳定键两次构建完全一致（550 键=isPaymentRelated 节点数，59 个重复序号）；注入 5 类变化恰好产出 6 条预期事件、其余 639 项目/节点零噪声；六指标精确对应注入值；550 节点 diff 0.67ms；状态常量与真实取值域字面一致（延期 35/已全额回款 186 实际存在，无"永不触发"陷阱）。
- 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → ① 首次[更新数据]后 /activity 显示"首次同步，暂无变化记录"、周期对比卡有 lastSync(全 0)；② 改动云文档或 PMIS 数据后再[更新数据]，/activity 出现事件时间线与非零对比值；③ 任一主域项目详情页右栏出现「项目动态」（无事件项目显示空态）；④ data/snapshots/ 出现当日 json、data/events.json 生成且二者不入库（git status 干净）。
- backlog（P3 遗留并入 🟢 L-20）。

### ✅ Plan P2 完成（2026-06-11）：导航收编 + 项目清单 + 项目详情（V7.1.0）
- 分支 **`feat/phase-p2-projects-nav`**，8 任务全完成，按分级调度执行（设计/计划主循环 Fable 5 亲做；实现 sonnet、核心页面 opus；审查按难度分级，T5 双审），`verify.sh` 全绿。
- 交付物：侧边导航三段分组（项目 / 回款·重点子域[缩进 + 回款分析子组] / 工具，旧路由全保留，旧首页 label 改「回款总览」暂留 `/`）；`/projects` 清单页（搜索 4 字段 + 阶段/项目状态/健康度/风险等级/回款状态/售前 六维筛选 + 健康度徽章 + 原项目* 徽章 + 行点击跳详情）；`/project/:id` 详情页（回款默认 Tab + 进度里程碑/风险/预算核算 Tab + 售前「原项目」Tab + 404 空态；右栏动态时间线按设计决策推迟 P3）；抽屉「查看完整详情 →」入口（仅主域项目显示）；基建：DataTable `cell-<key>` 插槽（向后兼容）、HealthBadge 三态徽章、lib/projectList 与 lib/projectPage 纯函数（vitest 全覆盖）。
- 评审修正记录：① 详情页回款表过滤 isPaymentRelated——与后端 aggregate_payment 口径一致（真实数据 214 个有节点项目 chips/表格计数 0 偏差）；② 路由参数变化（/project/A→B 同组件复用）重置回默认回款 Tab——否则售前→非售前留下无高亮孤立 origin 态；③ 清单搜索跳过占位 '-' 字段（53% 项目客户缺失）。
- 真实数据验证结论（opus 质量审）：空值降级 0 泄漏（340 客户缺失/303 完工缺失全部 '-' 兜底）；日期格式 100% slice(0,10) 安全；售前 closedPmis 命中 222/310（88 个无 PMIS 已关闭记录,页面有提示文案）；closedNodes 当前数据为 0/310 的备用路径（守卫住,数据接入后自动生效）。
- 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → ① 侧栏呈三段分组（项目/回款缩进/工具,无"看板首页"字样）；② /projects 显示 640 行,筛选/搜索/排序可用,行点击进详情；③ 详情页头部徽章/6 指标条/回款默认 Tab（节点表+跟进记录）/风险明细/预算核算,售前项目多「原项目」Tab；④ 任一回款页打开主域项目抽屉出现「查看完整详情 →」,点击跳全页。
- backlog（P2 遗留小项已并入 🟢 L-19）。

### ✅ Plan S1 完成（2026-06-09）：双域数据地基（V6.1.0）
- 分支 **`feat/s1-pmis-governance`**，13 任务全完成、`verify.sh` 全绿（py_compile + ruff + 106 pytest + 87 vitest + typecheck + build）。
- S1 双域数据地基完成：PMIS 七表(在建+已关闭)摄取 + 按 projectId join(覆盖约 98%，未匹配 8 全为售前 SF) + projectPmis/dataQuality 入库 + 数据治理视图(记分卡/未匹配/回填/冲突/脏值，可导出) + PMIS 在线下载(链接持久化 data/pmis_links.json)/离线放置(input/pmis/)。已关闭仅作回款补充(∩回款约 158)，不做历史看板。后续：P 项目域看板、S2 回款×项目详情(PMIS-主)、S3 多角色看板。
- backlog(S1 遗留小项)：① 前端 analysis.ts 中 PMIS Optional 字段经 json-schema-to-typescript 生成 46 个 NoName 别名(可编译，纯生成产物，后续可用 pydantic Field(title=...) 优化)；② 数据治理视图主题/未匹配等集合为 Dict[str,Any] 松类型，前端以局部 any 消费(如需强类型需补前端 item 接口)；③ spec 提到的 `lastPmisUpdate`(上次下载时间)未实现——`pmis_download` 未写时间戳、`dataQuality.summary` 未含该字段、视图未展示;当前无消费方,留待 S2/P 需要时补(写入 data/pmis_links.json + summary)。
- 手工端到端烟雾测试（需用户执行）：将 7 张 PMIS xlsx 放入 input/pmis/，运行 sync/import 或 python preprocess_data.py，打开 /governance → 期望 join≈98%、命中在建≈462/已关闭≈158/未匹配≈8，导出正常；input/pmis/ 为空时页面显示"未提供 PMIS"，回款各页不受影响。

### ✅ Plan P1 完成（2026-06-10）：项目主域数据地基（V7.0.0）
- 分支 **`feat/phase-p-project-domain`**，8 任务全完成（每任务经规范+质量双审），`verify.sh` 全绿（py_compile + ruff + 164 pytest + 348 vitest + typecheck + build）。
- 交付物：`projects.py`（三输入文件读表[自动选 sheet/无表头映射/优雅降级] + 筛三部 + 售前映射 + 回款/成本聚合 + 四维健康度 + 质量数据）；`pmis.py` 扩展（team 段/风险明细 jsonable[含 timedelta 兜底]/已关闭收录含售前映射目标）；schema 6 新模型（Project 链）+ main() 9a/9c 集成 + gen:types 同源；`/api/inputs/upload`（白名单防穿越）+ DataView「项目域数据」上传卡；打包 datas 补 projects.py（frozen 双模式坑）。
- 真实数据基线（回归哨兵，后续期次冒烟对照）：主域项目 **640**（在建 911 筛三部）、售前 317（已映射 310/未映射 7）、漏网告警 managerNotInOrg 21、无项目人员 11、org 85 行/mapping 462 条/delivery 910 行、健康度 547 健康/82 关注/11 风险；analysis_data.json 3.07→4.86MB。
- 评审修正记录（计划 bug 被双审拦截）：① 进度健康度判定由子串"滞后"改 config.MILESTONE_DELAYED_KEYWORDS 关键词集合（真实取值域 正常/延期/严重延期/超期未发布，原字面量 0/911 命中）；② PaymentReviewApp.spec datas 漏 projects.py（exe 版 ModuleNotFoundError，开发模式测不出）；③ DataView 新卡类名对齐 dv-card-head + 空选择守卫。
- 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → 数据管理页出现「项目域数据」卡；上传或放置三文件到 input/ 后点[更新数据]；确认 data/analysis_data.json 含 projects（640 个）与 projectsQuality（售前映射/漏网告警数字与上面基线一致）。
- backlog（P1 遗留小项已并入 Backlog 节）：上传 handler 异常包裹、CORS 校验、gen:types 漂移护栏、JSON 体积优化、治理页 matchRate 细分等，见 🟠/🟢 各节新条目。

### ✅ Plan design-foundation-v2 完成（2026-06-10）：设计底层规范 V2 增补（V6.5.0）
- 分支 **`feat/design-foundation-v2`**，3 任务全完成、`verify.sh` 全绿（py_compile + ruff + 125 pytest + 344 vitest + typecheck + build）。
- V6.5.0（2026-06-10）底层规范 V2：浅色 --mut 加深 #62707D（对比度达标）；状态色三态（填充+淡底 12%/16%+深字，--cyan 收编为 --c-advance，暗色 ok/danger 文字用提亮专值 #7DBFA3/#EA8B99）；交互状态层（--hover-tint/--selected-tint/--disabled-opacity）；数字排版（.u-num tabular-nums + 行高三档 + --ls-wide）；--font-sans 系统栈（移除 Inter）；z-index 三级阶梯；断点入规范。ECharts 主题重写为令牌同源（chart-1..8/结构映射/字体栈），双源契约测试强制一致。仅令牌+文档，现有页面未迁移。spec: docs/superpowers/specs/2026-06-10-design-foundation-design.md（V2）
- 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → 看板图表配色应变为蓝/紫/绿/棕/红等 8 支分类色（不再是旧紫蓝色系）；切换亮/暗模式图表轴线/文字随主题；列头等弱化文字略加深；字体不再依赖本机 Inter。
- backlog(V2 遗留小项)：echartsTheme 的 buildTheme 角色映射（axisLine→line2 等）暂无测试守护，待内容层新增图表页时补关键角色断言；双源契约测试 STRUCT 断言 TS 侧未 toLowerCase（失败方向安全，过严不漏放）；feature_list.json 的 version 字段(V5.9.1)与 CLAUDE.md 第 1 节版本描述长期未随升版更新,下次升版一并清理；C 级项：Element Plus size 档位统一、自绘控件高度令牌(spec 第 14 节指来,待内容层评估)。

### ✅ Plan design-foundation 完成（2026-06-10）：展示形式底层规范落地（V6.4.0）
- 分支 **`feat/design-foundation`**，3 任务全完成、`verify.sh` 全绿。
- V6.4.0（2026-06-10）展示形式底层规范落地：theme.css 令牌体系（蓝基调结构色/固定状态色/chart-1..8/六级字号/间距/卡片/圆角/阴影/动效），三档字号 14/16/18；仅令牌+文档，现有页面未迁移（留待内容层重构）。spec: docs/superpowers/specs/2026-06-10-design-foundation-design.md
- 手工端到端烟雾测试（需用户执行）：`python server.py` → 打开首页 → 切换亮/暗模式，观察蓝基调结构色与可读状态色；切换 小/中/大 字号，确认整页通过 :root font-size 14/16/18px 缩放。

### ✅ Plan U2 完成（2026-06-09）：数据管理页重构（V6.3.0）
- 分支 **`feat/u2-data-mgmt`**，7 任务全完成、`verify.sh` 全绿（py_compile + ruff + 125 pytest + 323 vitest + typecheck + build）。
- U2 数据管理页重构完成:获取(云同步/离线导入/PMIS下载/PMIS上传)与更新(/api/reprocess)解耦,一键「更新数据」重处理;PMIS 离线多选上传(/api/pmis/upload 原始字节);数据更新时间分源(数据处理时间 + PMIS 数据时间 lastPmisUpdate)移至数据管理页,关于页去除;删除数据质量总览卡;FilterBar 仅分析页显示(data/governance/about 隐藏)。纳管开关保留(后续单独调整)。
- 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → 数据管理页呈现 获取/更新/设置 三段;获取(云同步/导入/PMIS下载/上传)完成后提示"请点[更新数据]";点[更新数据]→治理页数据刷新;/data /governance /about 无筛选条;关于页无"数据更新"行;顶部分源时间可见。
- backlog(U2 遗留小项)：互斥单向——`/api/reprocess` 会拒绝 sync/import/pmis 进行中的请求,但 sync/import/pmis 三个 handler 未反向检查 reprocess 进行中(与既有 pairwise 松互斥一致,且受单线程 HTTPServer 限制,影响有限);后续做全互斥时一并收紧。

### ✅ Plan U1 完成（2026-06-09）：前端统一（V6.2.0）
- 分支 **`feat/u1-frontend-unify`**，6 任务全完成、`verify.sh` 全绿（py_compile + ruff + 117 pytest + 321 vitest + typecheck + build）。
- U1 前端统一完成:后端服务 frontend/dist + Vue Router SPA 回退(should_spa_fallback/_serve_spa_index,/data 路由用带斜杠前缀区分);删除旧版原生 UI(index.html/app.js/style.css/lib 图表库);后端改读 analysis_data.json(nextActionDate + 清空数据);数据治理页防缓存(load 加 ?t=)+ 空态三态诊断,修复治理页空白;打包内置 dist。修了 translate_path 基准(STATIC_DIR→WEB_ROOT)导致 /data 加载 404 的 bug。后续 U2:数据管理页重构 + 三处质量面整合。
- 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → 打开后端地址 → 首页即 Vue 应用；直接访问/刷新 `/governance`、`/data` 不 404；数据治理页显示数据（PMIS 已放置时；否则显"未提供 PMIS"，非空白）。

### ✅ Plan E2 完成（2026-06-09）：首页待办速览信号行
- 分支 **`refactor/e2-dashboard-signals`**，`verify.sh` 全绿。
- 产物：① `lib/dashboardSignals.ts` 纯函数算 4 信号（本月需回款/7天临期/延期额/待跟进，today 注入、复用 getNodeRemaining、过滤 isPaymentRelated、延期额防负值）；② `components/DashSignals.vue` 用 RouterLink 卡片导流（/calendar、/calendar、/analysis/risk、/followup），token 化（remaining/urgent/delayed/accent）；③ DashboardView 在 DashMetrics 之上接入。
- 设计说明：金额信号 lib 返回元、组件用 fmtWan 统一（与 DashMetrics 一致）；卡片用 RouterLink 原生键盘可达，未叠加 v-activate（避免双触发）；延期额用语义 token --c-delayed。

### ✅ Plan E1 完成（2026-06-08）：P0 一致性修复
- 分支 **`refactor/e1-consistency-fixes`**，`verify.sh` 全绿（75 pytest + 299 前端 vitest + typecheck + build）。
- 产物：① FilterBar 两处硬编码 `font-size: 13px` 改用 `var(--fs-1)` token，暗色 select 加 `background: var(--card2); color: var(--txt)` 深底；② DashMetrics 待回款指标（原 `var(--cyan)`，青色）改为 `var(--c-remaining)`；③ BoardView 待回款列（原 `var(--c-pending)`，橙）改为 `var(--c-remaining)`；④ AnalysisView 待回款汇总条拆分语义类：`.remaining`=待回款（`--c-remaining`）/ `.danger`=延期（`--danger`），两者当前同为红但语义分离。
- 刻意未动：已是正确红色的 LedgerView/ProjectsOverviewTab/PlanTab 的 `.sb-val.red`、PlanBoard 硬编码 `#ef4444`（涉共享 scoped 类，改取值有误伤风险），记入 backlog 待后续语义化。
- 需人工目检（无法自动验证）：暗色下 FilterBar select 深底、字号三档生效、首页/board/analysis 待回款均红色。

### ✅ Plan D10 完成（2026-06-08）：业务分析三档整合 —— Phase D 收尾
- 分支 **`refactor/d10-analysis-consolidation`**，计划 `docs/superpowers/plans/2026-06-08-D10-analysis-consolidation.md`，5 任务全完成、`verify.sh` 全绿。
- 产物：`AnalysisView`(/analysis/:tab：RouterLink tab 条 + 档位 SegToggle[全部+3档,默认全部] + nodes 汇总条);5 个 tab 组件(ProjectsOverview/TierNodes/Plan/Risk/TierIntegrity)支持 tier=''全部(4 个跨档、TierNodes/Plan 列用首档 displayColumns 回退、数据质检跨档 concat incompleteData[带 _tier+档位列])+ 全 token 化(补 D2.5 延后暗色)+ 全部档前置「档位」列;`filterOverviewProjects` 空 tier=全部。删 /tier 路由 + TierView(+test);nav 加 ANALYSIS_TAB_LINKS;侧栏「业务分析」由 15 入口收成 5 个 /analysis 链接。
- 计算口径忠实：复用既有 lib 未改算法。Task2 由 5 个并行子代理实现、controller 统一 grep/typecheck/测试后提交。
- **Phase D（前端展示重构）全部完成**：D1 地基 / D2 详情面板 / D2.5 审计修复 / D3 看板首页 / D4-D6 多维看板(单/双/N 维) / D5.5 打磨 / D7-D9 回款日历(网格/议程/热力条) / D10 业务分析整合。
- 范围外剩余（PROGRESS Backlog 另列，非 Phase D）：C 打包(dist 接入 server.py + PyInstaller)、A4 Playwright 脚本健壮性、旧页字号 px 债、ECharts 画布字号缩放、多维看板行=列同维度互斥。
- 整体进度：Phase D **全部完成（D10 待合并 master）**。

### ✅ Plan D9 完成（2026-06-08）：回款日历 C（年度热力条 + 月度下钻联动）
- 分支 **`refactor/d9-calendar-redo-c`**，计划 `docs/superpowers/plans/2026-06-08-D9-calendar-redo-c.md`，4 任务全完成、`verify.sh` 全绿。
- 产物：`lib/calendar.calYearHeat(nodes,year)`(年度12月待回款金额合计+笔数);`CalYearHeat.vue`(12月热力条，强度按金额 color-mix(accent) tint，当前月高亮，有金额月 v-activate 可点 emit select);`CalendarView` 抽 `gridNodes`(网格/热力条同源) + 接入 CalYearHeat(顶部) + onSelectMonth 点月聚焦(设 state.month、清 selectedDate)。
- 计算口径忠实：复用 getNodeRemaining;热力条与网格同源同筛选。CalendarView.test 加点月聚焦用例(断言 CalGrid month prop=5)。
- **回款日历 A(网格 D7)/B(议程 D8)/C(热力条 D9) 三件套收口。**
- 整体进度：Phase D：**…D9 完成（D9 待合并 master），仅余 D10**（业务分析三档整合，Phase D 收尾）。

### ✅ Plan D8 完成（2026-06-08）：回款日历 B（议程列表视图切换）
- 分支 **`refactor/d8-calendar-redo-b`**，计划 `docs/superpowers/plans/2026-06-08-D8-calendar-redo-b.md`，4 任务全完成、`verify.sh` 全绿。
- 产物：`lib/calendar.calAgendaGroups(nodes)`(按 planDate 升序分组 + 每日待回款小计);`CalAgenda.vue`(议程列表：每日 header + 复用 CalNodeTable 行点击下钻 D2 详情);`CalendarView` 加 `view`(grid/agenda) SegToggle，网格态=CalGrid+CalDayDetail(D7)、议程态=CalAgenda(数据源 calListNodes 双月、selectedDate 强制空、独立于网格选日)。
- 计算口径忠实：复用 calListNodes/getNodeRemaining。CalendarView.test 加议程切换用例。
- YAGNI：年度热力条(C)留 D9。
- 整体进度：Phase D：**…D7-D8 完成（D8 待合并 master）**。下一步 D9（回款日历 C：年度热力条 + 月度下钻联动）。

### ✅ Plan D7 完成（2026-06-08）：回款日历重做 A（富日格 + 选中日明细 + 日历暗色）
- 分支 **`refactor/d7-calendar-redo-a`**，计划 `docs/superpowers/plans/2026-06-08-D7-calendar-redo-a.md`，6 任务全完成、`verify.sh` 全绿。
- 产物：`lib/calendar` CalDayData/CalCell 增 `remaining`(每日待回款金额)、calDateData/calMonthGrid 同步;`CalGrid` 重写为富日格(日号 + 状态点[色按 statusClass] + N笔 + X万，色用语义 token 经 color-mix tint，有节点日 v-activate 可选中);`CalNodeTable` token 化 + 行 v-activate 点击 → projectDetail.open;`CalDayDetail` 新建(选中日/当月按状态分组 + 复用 CalNodeTable);`CalendarView` 重写(仪表卡/导航/筛选/临期全 token 化 + 字号放大 + 接入新组件)。
- **日历暗色补齐**：D2.5 审计延后的 CalendarView/CalGrid/CalNodeTable 硬编码色随重写全部 token 化，日历区 rg 零残留硬编码 hex。
- 计算口径忠实：全复用 lib/calendar，仅加每日金额。CalendarView.test 全量挂载断言仍通过(未改)。
- YAGNI：议程列表视图切换(B)留 D8、年度热力条(C)留 D9。
- 整体进度：Phase D：**D1-D2-D2.5-D3-D4-D5-D5.5-D6-D7 完成（D7 待合并 master）**。下一步 D8（回款日历 B：议程列表视图切换）。

### ✅ Plan D6 完成（2026-06-08）：多维看板·N 维透视表
- 分支 **`refactor/d6-multidim-board-pivot`**，计划 `docs/superpowers/plans/2026-06-08-D6-multidim-board-pivot.md`，5 任务全完成、`verify.sh` 全绿。
- 产物：`lib/pivot.pivotTable(nodes,rowDims[],colDims[],metricKey)`(对 [...rowDims,...colDims] 分组后透视成 rows/cols/cells+index;列空→单列「合计」;行列按指标合计降序);`DimPicker`(有序多选 chips，点加/删、显序号);`PivotTable`(行元组多列+列组合表头+数值格，有数据格 v-activate 可点 cell-click);`BoardView` 重写为「排名/交叉/透视」三模式（显式 mode SegToggle），透视模式 = 行/列 DimPicker + 指标 SegToggle + PivotTable，格点击复用 openDrill→BoardDrilldownModal→D2 详情。
- 模式重构：原 cross 由 `secondDim!==''` 隐式触发，改为显式 `mode` 门控;single/cross 计算逻辑不变，D5 cross 测试更新为"先切交叉模式再选次维度"。
- YAGNI：透视无小计/总计行;列表头用组合标签(`a / b`)非合并多层;透视不出 N×N 图(表格为主)。
- 整体进度：Phase D：**D1-D2-D2.5-D3-D4-D5-D5.5-D6 完成（D6 待合并 master）**。多维看板三层(单维/双维/N维)收口。下一步 D7（回款日历重做 A，含日历暗色）。

### ✅ Plan D5.5 完成（2026-06-08）：目检打磨（图表暗色 / 字号跨度 / 档位概览）
- 来源：D5 合并后 /board 与首页目检反馈。分支 **`refactor/d5.5-polish`**，计划 `docs/superpowers/plans/2026-06-08-D5.5-darkmode-fontscale-tierstrip-polish.md`，4 任务全完成、`verify.sh` 全绿。
- 产物：① echartsTheme 明/暗两套补全 categoryAxis/valueAxis(axisLine/axisLabel/splitLine) + tooltip 颜色 → 暗色图表坐标轴/网格/提示可读;② settings.FONT_PX 13/15/17 拉大跨度（rem 令牌缩放更明显），settings.test 同步;③ TierStrip 重设计为三档回款进度条（每档 完成率条[色按健康度] + 已回/计划万 + 延期数，点档 v-activate → BoardDrilldownModal 列该档项目 → 点项目开 D2 详情）。
- controller 修正：TierStrip 现内嵌 BoardDrilldownModal(el-dialog/el-table)，DashboardView.test 未装 ElementPlus 报错 → 该测试 stub BoardDrilldownModal。
- 已知延后/未做：回款日历暗色（D7-D9 整页重写时一并）;ECharts 画布文字随字号缩放;旧页(台账/跟进)字号 px 债（后续统一）。
- 整体进度：Phase D：**D1-D2-D2.5-D3-D4-D5-D5.5 完成（D5.5 待合并 master）**。下一步 D6（N 维透视表）或 D7（回款日历重做 A）。

### ✅ Plan D5 完成（2026-06-08）：多维看板·双维交叉
- 分支 **`refactor/d5-multidim-board-cross`**，计划 `docs/superpowers/plans/2026-06-08-D5-multidim-board-cross.md`，4 任务全完成、`verify.sh` 全绿。
- 产物：`lib/pivot` 增 `METRICS`(6 指标 + kind:money/count/rate) / `METRIC_BY_KEY` / `crossMatrix(nodes,rowDim,colDim,metricKey)`(复用 groupByDims 双维分组→透视成 rows/cols/cells + index 每格 PivotGroup;行列按指标合计降序);`BoardMatrix.vue`(矩阵表，有数据格 v-activate 可点 emit cell-click，空格 v-activate=false 不可点);`BoardView` 加「次维度」「指标」SegToggle，crossOn 时渲染 BoardMatrix + 可加性指标堆叠图(比例类不出图)，格点击复用 openDrill→BoardDrilldownModal→D2 详情。
- YAGNI 延后：N 维任意行/列/指标透视表留 D6。
- 测试要点：BoardView 测试中 seg-tier 同时存在于「维度」「次维度」两组，用 findAll 取最后一个=次维度。
- 整体进度：Phase D：**D1-D2-D2.5-D3-D4-D5 完成（D5 待合并 master）**。下一步 D6（N 维透视表）或 D7（回款日历重做 A）。

### ✅ Plan D4 完成（2026-06-08）：多维看板·单维核心
- 分支 **`refactor/d4-multidim-board-single`**，计划 `docs/superpowers/plans/2026-06-08-D4-multidim-board-single.md`，10 任务全完成、`verify.sh` 全绿。
- 产物：`lib/pivot`（`DIMENSIONS` 6 维[orgL4/orgL3/projectManager/projectType/signUnit/tier] + `groupByDims(nodes,dimKeys[])`：按维度取值分桶→每桶 `groupByProject` 算 项目数/计划/已回/待回/完成率/延期数/延期率 + 保留 projects 供下钻;N 维可扩展，本期单维）;`lib/navContext.goBoard(router,dim)`;`BoardView`(/board：维度 SegToggle + 排序 SegToggle + ChartBox 堆叠对比图 + 自定义排名表，行 v-activate 点击下钻);`BoardDrilldownModal`（Modal+DataTable 列项目，行点击 → D2 `projectDetail.open`）;`DataTable` 加可选 `row-click`/`clickable`;`OrgRanking` 行点击 `goBoard(router,'orgL4')`。
- 删除（被吸收）：CompareView/CompareCards/lib·compare、PmView/PmRankingTable/PmDrilldownModal/lib·pmView 及各自测试（14 文件）;路由去 /compare /pmview;侧栏去「区间对比/项目经理视图」，加「分析·多维看板」。
- 计算口径忠实：pivot 复用 groupByProject（dim=tier 即旧 compare、dim=projectManager 即旧 pmview 的口径），未改算法。
- YAGNI 延后：双维交叉(D5)/N 维透视表(D6);navContext 暂一个消费者(OrgRanking)，年/视角靠全局 filter 自动跨页保留。
- 执行中 controller 修正：pivot 测试数据初版让「已全额回款」与「延期」同项目（前者优先级更高致项目非延期），改为「正常实施中」+「延期」才正确判延期;BoardView/BoardDrilldownModal/OrgRanking 测试改用 `vi.mock('vue-router')` 与 stub/ElementPlus 处理组合式 API 与 el-table teleport。
- 整体进度：Phase D：**D1-D2-D2.5-D3-D4 完成（D4 待合并 master）**。下一步 D5（多维看板·双维交叉）。

### ✅ Plan D3 完成（2026-06-08）：看板首页重做
- 分支 **`refactor/d3-dashboard-home-rebuild`**，计划 `docs/superpowers/plans/2026-06-08-D3-dashboard-home-rebuild.md`，10 任务全完成、`verify.sh` 全绿。
- 布局（草图 home-v2）：6 指标行 → 档位条(1.3fr)/服务组排名(1fr) → 趋势卡(1.3fr)/延期Top(1fr)，全用主题 token、随窗口自适应、暗色生效。
- 产物：`lib/dashboardStats`(+延期项目数)、`lib/dashboardCharts`(delayedTopProjects 加 sortBy='amount' + remainingAmount);新组件 `SegToggle`(共享分段控件)、`DashMetrics`、`TierStrip`、`TrendCard`(月/季)、`DelayTopCard`(天数/金额 + 接 D2 详情面板);重写 `OrgRanking`、`DashboardView`;删除 `DashSummaryCards`/`TierCards`/`DelayedTop`(+测试)。
- 计算口径忠实：月/季聚合、服务组排名、延期 Top 均复用既有纯函数，仅小幅派生(均有 Vitest)。
- YAGNI 延后：OrgRanking「点行→带筛选跳多维看板」依赖 `/board` 与 `navContext`(D4)，本期行不可点、留 D4 接入(与 D2 同款)。延期 Top「点项目开详情面板」已全量接入 D2 面板。
- 整体进度：Phase D：**D1-D2-D2.5-D3 完成（D3 待合并 master）**。下一步 D4（多维看板·单维核心 + lib/pivot + 吸收 compare/pmview + navContext 落地）。

### ✅ Plan D2.5 完成（2026-06-08）：审计地基修复（D3 前）
- 来源：对已合并的 D1/D2 界面跑 `/impeccable audit`（全局新装 skill：impeccable + design-taste-frontend）。审计得分 11/20，根因=旧 app.js 内联样式逐字移植致颜色写死、交互用 div@click、对比度沿用旧值。用户决策：三条 P1 全做（对比度单列）、暗色 token 化仅迁留存共享组件、P2 做自适应基线+去 side-stripe。
- 分支 **`refactor/d2.5-audit-foundation`**，计划 `docs/superpowers/plans/2026-06-08-D2.5-audit-foundation.md`，10 任务全完成、`verify.sh` 全绿（前端 282 测试，新增 v-activate 4 测试）。
- 产物：① `theme.css` `--mut` 浅 #64748b(4.76:1)/暗 #8595ad(5.48:1) 达 AA + 语义 token（--c-paid/--c-pending/--c-remaining/--c-delayed/--c-plan/--on-accent/--c-urgent）+ `.u-grid-auto` 自适应栅格工具;② `directives/activate.ts` v-activate 指令（补 role/tabindex + Enter/Space 合成 click，main.ts + vitest.setup 双注册）;③ 16 个留存文件硬编码 hex 按语义映射为 token，暗色模式在这些页面生效;④ 下钻入口（台账行/质检单元/信号行/列筛选行）挂 v-activate;⑤ 去 LedgerView/FuProjectRow 的 side-stripe 彩色左边框。
- 关键修正（controller 复核）：子代理把"7天内(橙#f97316)"误并入 var(--danger)，与 FollowupView 图例"橙色7天…红色延期"自相矛盾;新增 `--c-urgent`(橙) token 并修 STAT_CARDS/BARS/URG 三处，保留四档紧急度区分。
- **交棒**：延后文件（Dashboard/Compare/Pm/Calendar/Analysis-tab 系）的 token 化+键盘可达+side-stripe，由 D3–D10 各自重做时按本计划同套"颜色 Token 映射表 + v-activate 模式"处理（映射表见计划文档）。
- 整体进度：Phase D：**D1-D2-D2.5 完成（D2.5 待合并 master）**。下一步 D3（看板首页重做）。

### ✅ Plan D2 完成（2026-06-05）：全局项目详情面板
- 分支 **`refactor/d2-project-detail-panel`** 全部 4 任务完成、`verify.sh` 全绿（前端 +5 单测），待合并 master。
- 提交：T1 `49544a8`(lib/projectDetail) / T2 `53e296d`(projectDetail store) / T3 `184f5a0`(ProjectDetailDrawer) / T4 AppLayout 挂载 + 本 PROGRESS。
- 产物：`lib/projectDetail`（buildProjectDetail：复用 groupByProject，按 projectId 从全量 rawNodes 聚合项目 + 其全部节点，2 单测）、`stores/projectDetail`（全局单例 openId/open/close/visible，1 单测）、`components/ProjectDetailDrawer`（el-drawer：12 项汇总网格 + 节点明细 DataTable + 空态，颜色吃 D1 主题变量，2 单测）、`AppLayout` 全局挂载一次。
- 范围（按 YAGNI，已记录非缺口）：本计划仅交付面板地基；**navContext 上下文跳转挪到 D4**（目标路由 /board 尚不存在、无现存消费者）；各页"点项目→唤起面板"接入随 D3（看板延期项）/D4（多维看板下钻）/D7（日历选中日）；§4.2 的"跟进记录嵌入"未纳入（复用 followup 重组件、偏离快速下钻定位），记为后续可选增强。
- 数据源口径：详情用全量 rawNodes（不经纳管/年份/视角），展示项目完整面貌。
- 执行中一处测试修正（非组件偏差）：el-table 行在 jsdom 异步渲染，组件测试加 `await flushPromises()`（与现有 DataTable.test 同款），组件保持逐字。
- 整体进度：Phase D：**D1-D2 完成（D2 待合并 master）**。下一步 D3（看板首页重做）。

### ✅ Plan D1 完成（2026-06-05）：全局地基（明暗主题 + 字号三档 + 响应式基线）—— Phase D 启动
- 分支 **`refactor/d1-global-foundation`** 全部 6 任务完成、`verify.sh` 全绿（72 前端文件 / 273 单测 + typecheck + build），待合并 master。
- 提交：T1 `0ddcd50`(settings store) / T2 `ba25259`(theme.css + main 接线) / T3 `78915d1`(ECharts 双主题 + ChartBox) / T4 `b8afafa`(DisplaySettings) / T5 `5ff1437`(AppHeader 挂载 + 外壳变量化) + 本 PROGRESS 提交。
- 产物：`stores/settings`（theme/fontScale + localStorage 持久化 + 写 `<html>.dark` 与 `--fs-base`，4 单测）、`styles/theme.css`（明/暗变量体系 + EP 变量桥接[主色=accent、暗色 bg/text/border 统一]+ 字号 rem 令牌 --fs-1..5 + 滚动条/选区/焦点适配 + box-sizing reset）、`charts/echartsTheme`（新增 'ent-dark'）、`ChartBox`（getActivePinia 守卫 + 随 settings.theme 选主题，3 单测）、`components/DisplaySettings`（主题/字号分段控件，无 emoji，3 单测）、`main.ts`（引入 EP 暗色 css-vars + theme.css + settings.init）、外壳 AppHeader/AppLayout/AppSidebar 颜色改吃变量。
- 设计取舍（已记录）：浅色 ECharts 主题保持原名 `'ent'`，新增 `'ent-dark'`，且 ChartBox 用 `getActivePinia()` 守卫无 pinia 时回退浅色——既让暗色生效又不破坏既有图表测试（全部仍取 'ent'）。EP 主色色阶用 color-mix 派生，不支持的浏览器安全回退 EP 内置值。
- 范围边界：D1 立地基（变量 + 控件 + 机制）；既有 px 文本不随字号档缩放，新组件用 rem，各页 D3-D10 重做时逐步转 rem。响应式仅基线（reset + 断点约定注释），各页具体响应式在其 plan 落地。
- 待人工目检（不阻塞合并）：启动后切换明/暗主题与字号三档、刷新保持、各页无 JS 报错——自动门禁已覆盖核心（settings 单测验证 dark class 与 --fs-base）。
- 整体进度：Phase B 前端 ✅；**Phase D 启动，D1 完成（待合并 master）**。下一步 D2（全局项目详情面板 + 上下文跳转）。

### ✅ Plan B18 完成（2026-06-04）：区间对比(compare) + 关于(about) —— Phase B 前端重写收官
- 分支 **`refactor/b18-compare-about`** 全部 6 任务完成、`verify.sh` 全绿，待合并 master。
- 提交：计划 / T1 `6ccf956`(version.ts 单一来源+AppHeader) / T2 `4f977cd`(lib/compare) / T3 `7d2e702`(CompareCards) / T4 `7522665`(CompareView) / T5 `26d2d8a`(AboutView) + 路由接入/PROGRESS 提交。
- 产物：`version.ts`（APP_VERSION/RELEASE_DATE 单一来源，AppHeader 接入，满足"版本号单一来源"约定）、`lib/compare`（compareTierStats 按档统计 + compareProgressSeries/StatusSeries/TrendSeries 三图数据 + compareOrgRanks 服务组 TOP5/BOTTOM5，8 单测）、`CompareCards`（三档卡片）、`CompareView`（卡片+3 ChartBox+HTML 排名榜）、`AboutView`（信息网格+版本+meta.lastUpdate+功能说明）；路由 /compare、/about 由 PageStub 改真实视图（PageStub 已无引用）。
- 经规范+质量审查（逐项核对 app.js initCompare 3164-3400 / initAbout 3859-3949）：可合并 ✓，无 Critical/Important（3 Minor 可接受：About 版本号去掉冗余小写 v 前缀更合理、卡片头部颜色展示从简、透传后端字段用索引签名+as any 与全项目风格一致）。
- 两处对 app.js 既有缺陷的"忠实但修正"（已记录，非偏差）：(1) 进度图"已回款"系列改裸数值——app.js 误用 fmt() 千分位字符串致 ECharts 无法解析；(2) compareStatusSeries 保留 6 状态全命中后不可达的兜底分支（无害、最大化忠实）。
- 关键忠实性（已核对一致）：数据源 = 后端预计算 summary/dashboard.orgRanking/rawNodes，**不经** filterStore（年/视角/纳管），与 app.js 一致；卡片 5 指标与色阈（完成率>=.8/.5、延期率>.2/.1）；状态图 6 状态映射与配色；趋势图 monthlyPlan 键并集/升序/过滤 <= '2027-12'；排名 slice(0,5)/slice(-5).reverse()/max(...,1)、bar 与 rate 色阈 .45/.3、名称>8 裁剪、金额 fmtYuan(actualTotalWan)（app.js fmtW=fmtYuan，594）；About 版本 V6.0.0、发布日期 2026-06-02、作者、数据来源、数据更新=meta.lastUpdate||'-'。
- 整体进度：A1-A3 后端 ✅；**B1-B18 前端全部完成 ✅（B18 待合并 master）。Phase B 前端重写收官**。后续可推进 C（dist 接入 server.py + 打包）、A4（Playwright 脚本健壮性）、B-opt（构建拆包/列筛选/导出等）。

### ✅ Plan B17 完成（2026-06-04）：数据管理 云同步(SSE) + 离线 Excel 导入(上传+轮询)
- 分支 **`refactor/b17-data-sync-import`** 全部 6 任务完成、`verify.sh` 全绿，待合并 master。
- 提交：计划 `4c43584` / T1 `9a214af`(xlsx 依赖+data reload) / T2 `c1bbe20`(excelImport) / T3 `501b7b8`(useCloudSync) / T4 `c636721`(useExcelImport) / T5 `8e201d5`(DataView 两卡) + `2855520`(审查修正) + 本 PROGRESS 提交。
- 产物：新增 `xlsx` 依赖；`lib/excelImport`（扩展名/必需Sheet/字符串矩阵）、`composables/useCloudSync`（SSE 状态机，EventSource 可注入）、`composables/useExcelImport`（读文件/解析/上传/轮询，依赖可注入）、`data store reload`、`DataView` 云同步+离线导入两卡。数据管理页全功能（B16 质量/纳管/清空 + B17 同步/导入）。
- 经规范+质量审查：发现 1 Critical + Important 并修复——C1：后端互斥拒绝(SSE {running:false,message})被 onerror 覆盖导致原因丢失 → onmessage 处理 running:false 保留 message + onerror 守卫(仅 syncing 才视为中断) + 补测；I2：DataView 模板用嵌套 ref `.value` 易踩坑 → 解构组合式返回值（模板自动解包）。I1(文件未选静默)降 Minor 接受。
- 关键忠实性（已核对 app.js/server.py）：SSE `/api/sync?url=`、onmessage 进度/100 完成+reload/onerror 中断、stop+/api/stop-sync；导入扩展名+必需 Sheet+字符串矩阵+POST /api/import+轮询 /api/import-status(1s)+stop+/api/stop-import；完成 data.reload 热更新；互斥以后端 busy 返回为准。
- 展示从简：进度条替代旧 DOM 富文本；reloadData 动态 script→store.reload；time/EventSource/FileReader/XLSX/fetch/poll 注入可测。新增 xlsx 依赖（chunk 增大属已知 B-opt 警告）。
- 整体进度：A1-A3 后端 ✅；B1-B17 前端 ✅（B17 待合并 master）。仅剩 B18（区间对比 + 关于）。

### ✅ Plan B16 完成（2026-06-04）：数据管理 数据质量总览 + 纳管开关 + 清空数据
- 分支 **`refactor/b16-data-quality`** 全部 6 任务完成、`verify.sh` 全绿，待合并 master。
- 提交：计划 `55782e9` / T1 `60750f5`+`a4f6184`(dataQuality，含 ratioOver 忠实修正) / T2 `91ff133`(data store clearBusinessData) / T3 `368aa49`(DataQualityTable) / T4 `e1fa404`(DataDrillModal) / T5 `f9c6ee6`(DataView) + 本 PROGRESS/路由提交。
- 产物：`lib/dataQuality`（5 检查定义/按档计数/下钻）、`data store clearBusinessData`、`DataQualityTable`（单元格可点下钻）、`DataDrillModal`（Modal+DataTable）、`DataView`（纳管开关+清空+质量总览+下钻），路由 `/data` 接入。
- 经规范+质量审查：可合并 ✓，无 Critical/Important（2 Minor 可接受：下钻"共 X 条"在 >200 条时显示 200、TIER_LABELS 三处重复）。
- 执行中一处忠实性修正：T1 子代理为迁就测试把 ratioOver 从 `pctToNum>1` 改成 `Number>1`；根因是计划测试数据用裸数 1.5（pctToNum 把 >1 裸数当百分数除以 100）。已还原为忠实 `pctToNum>1` + 改测试数据为 '150%'（`a4f6184`）。
- 关键忠实性（已核对 app.js）：数据源全量 rawNodes；5 检查去死检查；比例>100% 用 pctToNum；合计=scope 全量计数；单元格 count>0 下钻；双确认清空+保留平台配置(displayColumns/meta)+best-effort /api/clear-data；纳管开关绑 filterStore 全站联动。
- 范围：云同步(SSE)/离线导入拆 B17（DataView 留占位说明）。展示从简：tier 徽章配色省略；reloadData 脚本重载改为 store 内存清空。
- 整体进度：A1-A3 后端 ✅；B1-B16 前端 ✅（B16 待合并 master）。下一步 B17（云同步 SSE + 离线导入）。

### ✅ Plan B15 完成（2026-06-04）：临期跟进 跟进记录 CRUD + 云回写 + 轮询
- 分支 **`refactor/b15-followup-records`** 全部 5 任务完成、`verify.sh` 全绿，待合并 master。
- 提交：计划 `c9c3a87` / T1 `3299ac4`(followupApi) / T2 `87f6d0d`(useFollowupSync) / T3 `0f58c75`(FollowupRecordForm) / T4 `64030e5`(FollowupRecords) + 本 PROGRESS/嵌入提交。
- 产物：`lib/followupApi`（类型化 types/list/add/update/delete/syncStatus，基于 api 客户端）、`composables/useFollowupSync`（同步 toast + 轮询，time/poll 注入）、`FollowupRecordForm`（3 只读+5 可编辑+校验）、`FollowupRecords`（列表+增删改+反馈），嵌入 FuProjectRow 展开区。临期跟进页全功能（看板 B13 + 展开/标记 B14 + 记录 CRUD/云同步 B15）。
- 经规范+质量审查：可合并 ✓，无 Critical/Important。两处子代理小调整均判可接受：(a) 记录编号只读值额外用 span 显示(让 text() 可读)；(b) onSubmit 把 loadRecords 放 finally(成功/失败都重载，操作后回到服务端真实状态，良性差异)。
- 关键忠实性（已核对 app.js/server.py）：API 路径/方法/编码；轮询状态机(syncing 更新/success 绿 5s/failed 红 8s/超时 8s/本地 4s)；表单只读仅 记录编号/项目编号/项目名称(无 amountTier)、可编辑含"邮件推动"、校验跟进人&内容(≤500)；列表降序+最新详情+历史展开；提交分流 add/update、删除 confirm。新实现还规避了旧 _pollFollowupSyncStatus 超时分支引用未定义 msgEl 的潜在 bug。
- 范围：cloudUrl 由 B16 数据管理页提供，本期表单不传，后端回退全局 sync_url（已设则云同步、未设则仅本地）。展示从简：toast 组件化、原生表单+内联校验、记录角标等纯样式从简。
- 整体进度：A1-A3 后端 ✅；B1-B15 前端 ✅（B15 待合并 master）。下一步 B16（数据管理）。

### ✅ Plan B14 完成（2026-06-04）：临期跟进 展开面板 + 项目列表 + 跟进标记
- 分支 **`refactor/b14-followup-expand`** 全部 6 任务完成、`verify.sh` 全绿，待合并 master。
- 提交：计划 `a648b41` / T1 `5f38130`(fuData store) / T2 `98b0d4e`(followupProjects) / T3 `9c916a9`(FuNodeTable) / T4 `87e618d`+`6644c71`(FuProjectRow,含fixture类型修正) / T5 `485789e`+`df78902`(FollowupExpandModal,含批量作用域忠实修正) + 本 PROGRESS/接入提交。
- 产物：`stores/fuData`（本地标记升级为**响应式** Pinia store，标记切换联动看板/面板）、`lib/followupProjects`（部门项目聚合/档位过滤/紧迫度/下拉/待跟进节点）、`FuNodeTable`（9 列待跟进节点表）、`FuProjectRow`（项目卡+节点表展开+标记切换）、`FollowupExpandModal`（左统计+右项目列表）；FollowupSignalRow 部门名/档位条可点击→开面板；FollowupView 改用 fuData store。复用 B4 Modal。
- 经规范+质量审查：发现 1 个 Important 并修复——批量标记旧版作用于**部门全部项目**(`_fuDeptProjects`)，初版误用 window 过滤后的 projs；已改 `allProjs` + 补测（`df78902`）。其余 Minor 可接受（节点表 index key、紧迫度条高度）。
- 一处有意简化（已确认非回归）：左侧跟进率恒基于 window 项目集，不随下拉(flw/noflw)变化——比旧 `_updateFuLeftStats`(切到"已跟进"跳 100%) 更合理；右列表仍受下拉影响。
- 关键忠实性（已核对一致）：数据源 filteredNodes.filter(isPaymentRelated)；部门项目聚合(金额万/最早日期/最大完成率/flw)；档位 delay/d7/d15/d30(planDate>=today&&ratio<1)；紧迫度延期优先；下拉 all/flw/noflw/7d/15d；项目集=window 节点 projectId 集；节点表过滤+9 列；标记写 fu_data 持久化并联动看板（即 B13 跟进率为 0 的写入侧）；today 注入。
- 范围（两步拆分第 1 步）：本期读+本地标记；**B15=跟进记录 CRUD(/api/followup/*)+云回写+轮询**。展示从简：记录区/添加编辑删除/下钻跳转拆 B15；环形 SVG→大号百分数；"跟进动态"菜单省略；全屏侧滑→Modal。
- 整体进度：A1-A3 后端 ✅；B1-B14 前端 ✅（B14 待合并 master）。下一步 B15。

### ✅ Plan B13 完成（2026-06-04）：临期跟进 Signal Board(只读看板)
- 分支 **`refactor/b13-followup-board`** 全部 4 任务完成、`verify.sh` 全绿，待合并 master。
- 提交：计划 `4dff615` / T1 `da3cb18`(lib/followup) / T2 `e1a1a3d`(FollowupSignalRow) / T3 `47a2699`(FollowupView) + `317938e`(cycleLabel 分支测试补充) + 本 PROGRESS/路由提交。
- 产物：`lib/followup`（部门信号统计/总计/季度聚合/本地标记 loadFuData/周期标签，6 单测）、`FollowupSignalRow`（4 档进度条 + 跟进率）、`FollowupView`（季度概览 4 卡 + 6 统计卡 + 部门搜索 + 信号板），路由 `/followup` 接入。
- 经规范+质量审查：可合并 ✓，无 Critical/Important（5 Minor 可接受：cycleLabel 分支序等价已补测、fuData 非响应式属 B13 接受范围、as any 类型逃逸）。
- 关键忠实性（已核对一致）：数据源 filteredNodes.filter(isPaymentRelated)；部门 orgL4||未分配；延期 delay++ 后不 return 继续档位；档位前提 planDate>=today && ratio<1，diff ≤7/≤15/≤30 互斥；排序 delay→d7→d15→d30；6 卡公式含 totalNotFlw=max(0,signalBase-totalFlw)；季度分桶+项目去重；进度条 max 取自搜索后 filteredStats；today 注入可测。
- 范围拆分：临期跟进页含两大子系统——B13=只读看板已完成；**B14=行展开面板 + 跟进记录 CRUD(/api/followup/*) + 云文档异步回写 + 同步状态轮询**（首个写操作 + 后端联动）。看板"已跟进/跟进率"来自 localStorage['fu_data']，其写入在 B14；故 B13 阶段跟进率通常为 0（忠实读取，B14 接入后自动反映）。
- 展示从简（已记录，非偏差）：信号行点击展开、"跟进动态"菜单延后 B14（本期行不可点击）；季度标题纯样式细节从简。
- 整体进度：A1-A3 后端 ✅；B1-B13 前端 ✅（B13 待合并 master）。下一步 B14（临期跟进 CRUD + 云回写）。

### ✅ Plan B12 完成（2026-06-04）：回款日历(calendar)
- 分支 **`refactor/b12-calendar`** 全部 5 任务完成、`verify.sh` 全绿，待合并 master。
- 提交：计划 `e2b7c9f` / T1 `23d0c94`+`6f272ab`(calendar 纯函数，含排序忠实修正) / T2 `bda4d27`(CalNodeTable) / T3 `88fc730`(CalGrid) / T4 `de54583`(CalendarView) + 本 PROGRESS/路由提交。
- 产物：`lib/calendar`（excludePaid/选项/三筛选/仪表卡/日期统计/月网格生成器/列表分组/临期/悬浮文本，11 单测）、`CalNodeTable`（13 列节点表，列表与临期复用）、`CalGrid`（双月网格：配色/角标/title 悬浮/点选）、`CalendarView`（状态+仪表卡+筛选条+网格+列表+临期），路由 `/calendar` 接入。复用 B10 naguanFilter、B8 getNodeRemaining。
- 经规范+质量审查：可合并 ✓，无 Critical/Important（3 Minor 均可接受：index key、today 时间源、轻微冗余过滤）。
- 执行中一处忠实性修正：T1 子代理为迁就测试把选项排序从 `.sort()` 改成 `localeCompare('zh')`（拼音序，偏离 app.js）；根因是计划测试数据 orgL4 期望写错（应按 Unicode 序 `['上海','北京']`）。已还原为忠实 `.sort()` + 修正测试（`6f272ab`）。
- 关键忠实性（已核对一致）：双数据源口径（仪表卡=filteredNodes 年/视角/纳管；网格/列表/临期=naguanFilter+calExcludePaid）；仪表卡"当月"按真实 now、7天[0,7]；网格周一为首/8桶/配色优先级+mixed；列表 selectedDate vs 双月范围/排除已付/分组小计；临期 [now,15]/(now,30] 未满额/maxShow 50-100；日历年月独立于全局年份；now/today 注入可测。
- 展示从简（已记录，非偏差）：网格富悬浮→title 文本；tier/status 徽章配色、行点击跳转、导出 Excel 延后 B-opt。
- 整体进度：A1-A3 后端 ✅；B1-B12 前端 ✅（B12 待合并 master）。下一步 B13（临期跟进）。

### ✅ Plan B11 完成（2026-06-04）：项目经理视图(pmview)
- 分支 **`refactor/b11-pmview`** 全部 5 任务完成、`verify.sh` 全绿，待合并 master。
- 提交：计划 `4bd121d` / T1 `a05a9c9`(lib/pmView) / T2 `52ea719`(PmRankingTable) / T3 `45d7143`(PmDrilldownModal) / T4 `ee018c9`(PmView) + 本 PROGRESS/路由提交。
- 产物：`lib/pmView`（pmRanking 排名聚合 / pmDrilldown 下钻 / PM_PROJ_COLS+PM_DELAY_COLS）、`PmRankingTable`（排名表 + 行点击 select + 高亮）、`PmDrilldownModal`（复用 Modal + 两张 DataTable）、`PmView`（搜索 + 展开态 + 装配），路由 `/pmview` 由 PageStub 改 PmView。复用 B10 naguanFilter、groupByProject、B4 Modal/DataTable。
- 经规范+质量审查：可合并 ✓，无 Critical/Important（4 Minor 均可接受：as any 断言、保留完成率配色属多做无害）。
- 关键忠实性（已核对一致）：排名表聚合 **全量 rawNodes**（无纳管/年份/视角）、`totalAmount` 逐节点累加 projectAmount、未指定默认、完成率降序；下钻用 **纳管-only**（naguanFilter）+ groupByProject + 延期过滤 + slice(0,100)；列定义 8+8 与旧一致；行点击切换收起。
- 展示从简（已记录，非偏差）：下钻列可见性 UI、tier/status 徽章配色延后 B-opt；旧全屏遮罩改 Modal(el-dialog width 90%)。
- 整体进度：A1-A3 后端 ✅；B1-B11 前端 ✅（B11 待合并 master）。下一步 B12（回款日历）。

### ✅ Plan B10 完成（2026-06-04）：回款台账(ledger)
- 分支 **`refactor/b10-ledger`** 全部 4 任务完成、`verify.sh` 全绿（前端 typecheck/vitest/build），待合并 master。
- 提交：计划 `556e659` / T1 `55a7c51`(lib/ledger) / T2 `679ed9f`(LedgerTable) + `fdf240b`(下钻收起忠实修正) / T3 `49410d8`(LedgerView) + 本 PROGRESS/路由提交。
- 产物：`lib/ledger`、`components/LedgerTable`（项目表 + CF 列头 + 行展开下钻"回款节点明细"）、`views/LedgerView`（汇总/状态/分层三条 + 搜索/区间/状态筛选），路由 `/ledger` 由 PageStub 改 LedgerView。CF 复用 B9（单表 ledgerTable，无联动）。
- 经规范+质量审查：可合并 ✓，无 Critical/Important。审查发现并已修：旧版 filterLedger 每次过滤 `_expandedLedgerIdx=-1`（过滤即收起下钻），新版补 watch(props.projects) 重置 expandedIdx（`fdf240b`）。
- 关键忠实性（已核对一致）：台账数据源=**纳管-only**（`naguanFilter`，不含年份/视角，对应 `_filteredRawNodes`）；三组指标条基于搜索/区间/状态/CF 过滤后的 displayed 重算；区间过滤按 `nodes.some(tier)`、搜索四字段拼接；按 projectAmount 降序、slice(0,500)；CF 列枚举源=纳管过滤后全部项目 baseProjs；下钻字段与旧一致；待回款列=exp-act、完成率列=exp>0?act/exp:0。
- 展示从简（已记录，非偏差）：下钻只渲"回款节点明细"（项目全字段横行 + 列可见性 UI 延后 B-opt）；tier/status 徽章配色、导出 Excel 延后 B-opt；CF 修正旧版 `remainAmount`→`remainingAmount` 笔误。
- 范围：路线图原"台账/PM"已拆分——台账=B10 独立完成；**项目经理视图=B11**；日历/临期跟进/数据管理/对比/关于顺延 B12+。
- 整体进度：A1-A3 后端 ✅；B1-B10 前端 ✅（B10 待合并 master）。

### ✅ Plan B9 完成（2026-06-04）：分层页 回款状态(plan) + CF 联动
- 分支 **`refactor/b9-tier-plan-tab`** 全部 7 任务完成、`verify.sh` 全绿（36 文件 / 133 前端单测 + typecheck + build），待合并 master。
- 提交：计划 `dd3054c` / T1 `f25dd9d`(crossFilter 纯函数) / T2 `756a361`(crossFilter store) / T3 `21eba3f`(planBoards) / T4 `28c1ae4`(ColumnFilter) / T5 `3ec5fcb`(PlanBoard) / T6 `de72084`(PlanTab) + 本 PROGRESS/TierView 提交。
- 架构：把旧全局 `CF` 对象拆三层——纯函数 `lib/crossFilter`(格式化/去重/列过滤) + Pinia `stores/crossFilter`(各表筛选状态 + 联动开关 + 跨表同步) + 组件 `ColumnFilter`(列头▾下拉)；plan 计算纯函数化 `lib/planBoards`(6看板定义/单板统计/汇总求和/状态计数)；`PlanBoard`(单板) + `PlanTab`(汇总条+状态格+工具栏+6看板, 切档重置筛选)；TierView 分发 plan→PlanTab。分层页 5 个 tab×3 档全通。
- 三组件经规范+质量审查：可合并 ✓，无 Critical/Important（5 Minor 均可读性/B-opt：冗余 as 断言、行 index key、保留未用的 clearAll API）。逐行核对忠实移植：列枚举源=全量关联节点、汇总取 boardAgg 求和、状态计数取 combined(空回退 allNodes)、先按 status 过滤再 CF、slice(0,100)、6 看板顺序配色、navTier 重置。
- 展示从简取舍（已记录，非偏差）：CF 搜索的"即时自动勾选+即时 apply"简化为搜索仅过滤列表、统一「确定」apply；列可见性设置 UI / 导出 Excel / 状态卡点击下钻滚动+"来自看板下钻"高亮延后 B-opt，状态卡为纯计数展示。
- 下一步：B10+(台账/PM/日历/临期跟进/数据管理/对比/关于)、A4(Playwright 脚本)、C(打包)。
- 整体进度：A1-A3 后端 ✅；B1-B9 前端 ✅（B9 待合并 master）。

### ✅ Plan B8 完成（2026-06-04）：分层页 projects/risk
- 分支 **`refactor/b8-tier-projects-risk`** 全部 6 任务完成、`verify.sh` 全绿（110 前端单测），待最终整体审查 + 合并 master。
- 提交：Task1 `6229bd1`(fmtRatio) / Task2 `a3c84c0`(projectsOverview) / Task3 `339fe63`(ProjectsOverviewTab) / Task4 `8e2e870`+`30d8ab2`(riskGroups，含忠实性修正) / Task5 `9367f89`(RiskTab) / Task6 `39d632f`(TierView 接入) + 本 PROGRESS 提交。
- 产物：`lib/projectsOverview`、`lib/riskGroups`、`format.fmtRatio`、`ProjectsOverviewTab`、`RiskTab`，TierView 增加 projects/risk 分发。侧边栏"业务分析"下 projects×3 + risk×3 共 6 入口已点亮（连同 B7 的 nodes/integrity，目前 4 个 tab×3 档已通；仅 plan tab 留 B9）。
- 执行中一处技术判断：Task4 子代理为迁就测试给 highRisk 加了原版没有的 `projectAmount>0` 条件；根因是计划测试数据 P2/P3 完成率为 0（按忠实逻辑本应入 highRisk）。已还原为忠实实现 + 修正测试数据（`30d8ab2`）。
- 下一步：B9(plan 回款状态 6 看板，CF 联动)、B10+(台账/PM/日历/临期跟进/数据管理/对比/关于)、A4(Playwright 脚本)、C(打包)。
- 整体进度：A1-A3 后端 ✅；B1-B8 前端 ✅（B8 待合并 master）。

### 通用
- 测试只覆盖了 `preprocess_data.py` 的**纯函数**（解析层）；计算/聚合函数尚无测试（HX-6）。
- 改 `server.py`/脚本前务必读 `CLAUDE.md` 第 5 节"打包 vs 开发双模式"。
- 前端忠实移植自旧 `app.js`；改前端计算逻辑前对照旧函数，单测是迁移正确性护栏。
