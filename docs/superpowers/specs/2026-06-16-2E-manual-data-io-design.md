# 2E 人工数据导入导出 + 快照回滚设计

> 状态：设计已与用户确认（2026-06-16），进入 spec。下一步 `superpowers:writing-plans`。
> 这是「回款看板重建程序」的 **2E**（承 2D 跟进记录重调 e8d06f9，收口 2C 的 L-22 导出待办）。给项目清单一套**离线导入导出 + 轻量快照回滚**：`/projects` 按勾选范围导出多 sheet xlsx（清单 + 子项数据）；`/data` 导入**人工维护数据**（2C 标签 + 2D 跟进），强校验、导入前快照可回滚。
> 范围：前端导出/导入 UI + 后端校验/写入/快照。PMIS 取数只读不导入。版本 V1.5.0 → **V1.6.0**（整页级）。

## 0. 背景与不变量

- **人工维护数据**（可导入）：`data/project_tags.json`(2C 标签库+挂载) + `data/followup_records.json`(2D 跟进记录)。两者本地独占、纯本地、API 已就位（`GET/POST /api/tags`、`/api/followup/*`）。
- **PMIS 取数内容**（只读，禁止导入，只走「更新数据」）：`projects`/`projectPmis`/`paymentNodes`/`projectMilestones`/`projectProfit`/`paymentRecords` 等，由 `preprocess` 从 PMIS/云文档派生进 `analysis_data.json`。
- 现有可复用基建：`lib/exportXlsx.ts exportRows`(SheetJS)、`composables/useExcelImport.ts`(读文件/解析/上传流程)、`data_history.py`(整份 77MB×3 快照——**太重，2E 不复用**，新建轻量快照)。
- 注意：导入标签写 `project_tags.json`（**不动** `analysis_data.json.tagSeed`，后者是 preprocess 推导的首次播种源）。

## 1. 已确认的边界决策（用户钦定 2026-06-16）

1. **导出可扩展纳入子项数据**：在 /projects 清单基础上，按勾选把清单列 + 子项（/project:id 详情）数据导成多 sheet xlsx。
2. **可导入部分固化格式、单独成表**：标签/跟进两类用固定格式专用 sheet，与导入解析契约一致（支持往返：导出→Excel 编辑→回导）。
3. **导入强校验**：任一不通过即**整体不写入、直接报错并列出错误明细**（sheet/行/列/原因）。
4. **导入写入 = 整表替换**：导入的标签表/跟进表 = 该类**新全集**，覆盖写两文件（配合快照兜底）。
5. **子项只读导出范围 = 核心集**：清单 + 标签 + 跟进 + 回款节点 + 里程碑；**预算科目树留后续**（嵌套复杂，YAGNI）。
6. **轻量快照回滚**：导入前快照两小 JSON，可回滚；与整份 data_history 分开。
7. **版本 V1.6.0**（整页级）。

## 2. 导出（/projects，多 sheet，范围可勾选）

- `/projects` 加「导出」按钮 → 弹"导出范围"复选框（数据类别清单），勾哪类出哪个 sheet；**遵循当前清单筛选的行集**（`filterProjectRows` 后的项目，含搜索/多选筛选）。
- SheetJS 多表：`XLSX.utils.book_new()` + 多次 `book_append_sheet`，前端构造各 sheet 的 `rows`（沿用 exportRows 的 json_to_sheet，但扩展为多表——新增 `exportSheets(filename, sheets: {name, rows}[])` 或在 `lib/exportXlsx.ts` 加多表函数）。
- **导出 sheet 清单（核心集）**，均以 `项目编号` 关联：
  - **项目清单**（必选）：现 15 列骨架（项目名称/编号/合同金额(万)/经理/服务组/阶段/完工%/风险/级别/类型/预算消耗比/回款完成率/健康度/标签/…；"操作"列不导）。可再勾要哪些列（默认全列）。
  - **项目标签**（人工·可回导·**固定格式**）：列 = `项目编号 / 项目名称 / 标签`（标签 = 该项目标签名以 `、` 连接；无标签留空）。一项目一行。
  - **跟进记录**（人工·可回导·**固定格式**）：全量记录，列 = `记录编号 / 项目编号 / 项目名称 / 跟进人 / 跟进类型 / 跟进内容 / 跟进状态 / 下次跟进计划日期 / 跟进时间`。
  - **回款节点**（只读）：扁平 `paymentNodes`，列 = `项目编号 / 项目名称 / 阶段 / 计划日 / 实际日 / 计划比例 / 计划金额 / 状态`。
  - **里程碑**（只读）：扁平 `projectMilestones`，列按里程碑表字段（里程碑/计划/实际/关联回款阶段/状态等）。
- 「项目标签」「跟进记录」两 sheet 的**表头与列顺序固化**，与 §3 导入解析契约**逐字一致**（往返）。

## 3. 导入（/data，固定格式 + 强校验 + 报错 + 替换）

- `/data` 新增「人工数据导入/回滚」卡：上传 xlsx → 复用 `useExcelImport` 读取/解析层得二维矩阵 → POST `/api/manual/import`。
- 后端**只认两类固定 sheet**：sheet 名 `项目标签`、`跟进记录`（缺某类则该类不导入；含其它任意 sheet 一律忽略，不报错不写入）。
- **强校验（任一失败→整体不写、返回错误明细列表）**：
  - 表头校验：存在的 `项目标签`/`跟进记录` sheet 表头必须与固定契约一致（缺列/错列 → 报"sheet 表头不符，缺列 X"）。
  - 标签行：`项目编号` 必填且必须 ∈ 当前 `projects`（否则"第 R 行：未知项目编号 X"）；标签列空=该项目无标签（合法）。
  - 跟进行：`项目编号`(∈projects)/`跟进人`/`跟进类型`/`跟进内容`/`跟进状态` 必填；`跟进类型` ∈ `FOLLOWUP_TYPES`(8 种含「邮件推动」)、`跟进状态` ∈ `FOLLOWUP_STATUSES`(5 种)；`跟进内容` ≤500、`跟进人` ≤20；否则"第 R 行 列Y：原因"。
  - 错误响应：`{success: false, errors: [{sheet, row, col?, message}], imported: false}`，**不写任何文件、不建快照**。
- **写入 = 整表替换（仅当全部校验通过）**：
  - 先建快照（§4），再写：
    - 标签：`project_tags.json` = `{version:1, tags: 由表中出现的去重标签名构成(全 enabled), assignments: {项目编号: [标签…]}}`。（注：导入按"用到的标签"重建词表；**独立停用标签/孤立词表项不往返**，用户可在 /data 再管理——spec 已知取舍。）
    - 跟进：`followup_records.json` = 表中各行；空 `记录编号` 自动生成 `FU-YYYYMMDD-NNNN`、空 `跟进时间` 填当前；其余字段照填。
  - 仅导入了其中一类时，**只替换该类文件**，另一类不动。
  - 返回 `{success: true, tags?: {projects, tagsCount}, followup?: {count}, backupId}`。
- 导入与「更新数据」/快照操作互斥（沿用 `_history_busy` 思路或轻量锁）；人工导入之间串行。

## 4. 轻量快照 + 回滚（独立于 data_history）

- 新模块 `manual_history.py`（或并入 server.py helper）：
  - `data/manual_backups/<YYYYMMDD-HHMMSS>/` 存 `project_tags.json` + `followup_records.json` 各一份副本 + `manifest.json`（时间/触发=import/导入文件名/标签项目数/跟进条数）。
  - `backup_manual()`：导入**写入前**调，复制当前两文件入新版本目录。
  - 保留**最近 3 份**（`prune`，超出删最旧）。
  - `rollback_manual(version_id)`：copy-then-swap 把该版本两文件覆盖回 live（先拷 `.tmp` 再 `os.replace` 近原子）。
- 文件极小（<10KB×2×3），无体积顾虑；与 `data/history/`(整份 77MB) **分目录、分卡片**，避免混淆。

## 5. 后端 API

- `POST /api/manual/import`：请求体 `{sheets: {项目标签?: string[][], 跟进记录?: string[][]}}`（前端解析后的字符串矩阵，含表头行）。校验→（通过则）快照+替换写。返回成功摘要或 `{success:false, errors:[...]}`。
- `GET /api/manual/backups`：列 `data/manual_backups/` 版本（id/时间/导入文件名/条数）。
- `POST /api/manual/rollback {id}`：回滚两文件。
- `GET /api/followup/all`：返回全部跟进记录（供导出全量跟进 sheet；现仅有 `list/<pid>`，本期补此端点）。
- 复用：`_load/_save_project_tags`、`_load/_save_followup_records`、`config.FOLLOWUP_TYPES/STATUSES`、`config` 标签白名单非必需（导入词表由表数据定）。
- **frozen 双模式**：`data/manual_backups/` 路径基于 `BASE_DIR`（sys.executable 目录），与 followup/tags 同源；无新内嵌脚本。
- **PMIS 只读护栏**：import handler 只处理 `项目标签`/`跟进记录` 两 sheet，其它 sheet 名忽略——结构上禁止经此写入任何 PMIS 数据。

## 6. 前端

- `lib/exportXlsx.ts`：加多表导出 `exportSheets(filename, sheets)`（保留 exportRows）。
- 新 `lib/projectExport.ts`：从 `data.data`(projects/paymentNodes/projectMilestones) + `projectTags`(assignments) + followup（全量，新增 `GET /api/followup/all` 或前端聚合 list）构造各 sheet `rows`；按勾选范围产 sheets。
- `lib/manualImport.ts`：解析上传 xlsx 的 `项目标签`/`跟进记录` sheet 为矩阵（复用 excelImport 的 SheetJS 读取）。
- `lib/manualApi.ts`：`importManual(sheets)`/`listBackups()`/`rollbackManual(id)` HTTP 客户端。
- `views/ProjectsView.vue`：加「导出」按钮 + 导出范围复选弹窗（复用 `Modal`）。
- `views/DataView.vue`：加「人工数据导入/回滚」卡（上传+错误明细展示+快照列表+回滚）。
- 导出全量跟进记录需后端补 `GET /api/followup/all`（现仅 `list/<pid>`）；或导出时前端按 projects 逐个 list（量大不优）——**spec 定：后端加 `GET /api/followup/all` 返回全部记录**。

## 7. 测试

- **pytest**：导入校验（缺表头/未知项目编号/枚举越界/长度超限→精确 errors 明细且不写文件不建快照）；全通过→建快照+替换写（标签词表由表重建、空记录编号自动生成、跟进时间补全）；仅一类时只替换该类；`manual_history` 建/列/回滚 copy-then-swap；PMIS sheet 被忽略；`GET /api/followup/all`。
- **vitest**：导出范围复选→多 sheet rows 构造（清单/标签/跟进/节点/里程碑各列正确、遵循筛选行集）；`exportSheets` 多表；导入卡错误明细渲染、成功摘要、快照列表+回滚；`manualApi` 客户端。
- **真实数据冒烟**：导出含标签/跟进 sheet → Excel 改一行 → 回导，校验生效（构造一处错误看报错明细）、替换成功、`/projects` 标签/`/project:id` 跟进随之变；回滚恢复；PMIS sheet（如混入"回款节点"改值）被忽略不写。
- `bash verify.sh` 全绿。

## 8. 版本与不做（YAGNI 边界）

- 版本 **V1.6.0**（`frontend/src/version.ts` 单一来源）；`PROGRESS.md` 2E 标完成 + SHA；关闭 L-22（导出含标签列已实现）。
- **不做**：导入任何 PMIS 取数内容；预算科目树导出；自动/定时导入；云文档交互；标签"停用态/孤立词表项"的导入往返（已知取舍，用户在 /data 管理）；合并(upsert)导入（本期=替换）。

## 9. 实现注意（易踩坑）

- `server.py` 打包(frozen)/开发双分支：`data/manual_backups/` 走 `BASE_DIR`；`GET /api/followup/all` 与现有 followup handler 同文件。
- 导入"替换"语义有破坏性——快照必须在**写入前**成功建立，建快照失败则中止导入（不写）。
- 标签导入重建词表会丢 `disabled`/孤立词表项——spec §8 已声明；UI 导入成功提示里告知"标签词表按导入内容重建"。
- 导出"项目标签"sheet 的标签连接符 `、` 与导入拆分符必须一致；表头与列顺序两侧逐字对齐（往返契约，改一侧必改另一侧 + 测试）。
- 导出遵循 /projects 当前筛选行集——导出弹窗需取 `filtered`/`paged` 的**全集（filtered 非 paged）**，避免只导出当前页。
- 设计令牌：导出弹窗/导入卡/错误明细表一律引 theme.css 令牌，数字列 `.u-num`。
