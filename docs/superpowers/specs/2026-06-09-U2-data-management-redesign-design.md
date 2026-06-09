# U2 — 数据管理页重构(获取/更新解耦 + 全量入口整合)设计(Design)

> 设计文档(harness: Design)。2026-06-09。在 U1(前端统一)基础上,重构数据管理页:把"获取数据"与"更新数据(处理)"解耦,整合回款/项目域两类入口,删除冗余,并把全局筛选条按需收敛。

## 背景与目标

当前数据管理页有 5 张零散卡(设置 / 云同步 / 离线导入 / PMIS 下载 / 数据质量总览),且三种获取动作各自在末尾偷偷跑 preprocess,心智混乱;PMIS 下载与刷新耦合;离线导入只支持回款单文件;筛选条/纳管开关在所有页面全局显示(数据管理/治理/关于用不到)。

**目标:把数据管理页重组为"获取数据 → 更新数据"两段式 + 设置;PMIS 下载/上传与处理解耦;删除冗余质量表;数据更新时间从关于页移来并分源展示;筛选条仅在分析类页面显示。纳管开关本轮保留不动。**

## 已确认决策(来自 brainstorm)

- 入口按"**获取 / 更新**"分:所有获取动作(云同步、PMIS 下载、离线导入、PMIS 上传)**只把文件弄到本地,不自动处理**;一个全局**「更新数据」**按钮统一跑 preprocess。云同步也照此拆为两步。
- **回款保留现有两入口**:云同步(WPS) + 离线导入(浏览器 SheetJS 解析单 xlsx);两者均不改解析方式,只去掉末尾自动 preprocess。
- **PMIS 离线**:7 个 xlsx 走**原始多选上传**到 `input/pmis/`(不经浏览器解析)。
- **PMIS 链接**:来自配置文件 `data/pmis_links.json`;为空则页面录入并写回(即现有持久化机制,空态引导用户填写)。
- **纳管开关本轮保留**,逻辑不动,列为后续待办。
- **删除**数据质量总览卡(与 `/analysis` 数据质检、`/governance` 重复)。

## 页面结构(重构后 DataView)

- **顶部:数据更新时间(分源)** — `总处理时间`(`meta.lastUpdate`)+ `PMIS 数据时间`(`dataQuality.summary.lastPmisUpdate`,见下)。从 AboutView 移来(AboutView 不再展示)。
- **卡A 数据来源 · 获取**(两域,各在线/离线;均只落地文件):
  - 回款:`云同步`(WPS 网址输入 + 同步按钮 + 停止) | `离线导入`(单 xlsx,浏览器解析,需含 sheet「项目回款节点(里程碑)清单」)
  - 项目域 PMIS:`在线下载`(7 个链接录入/保存 + 下载按钮)| `离线上传`(多选 ≤7 个 xlsx,按文件名归位上传)
- **卡B 更新数据**:全局「更新数据(重新处理)」按钮 → `/api/reprocess` → 跑 preprocess(回款+PMIS 一起)→ 完成后 `data.reload()`。获取卡完成后提示"点[更新数据]生效"。
- **卡C 设置**:纳管开关(保留)+ 清空数据。

## 后端改动(server.py 等)

- **新增 `/api/reprocess`**(GET, SSE 进度):仅运行 `preprocess_data.py`(不抓取/不下载),frozen/dev 双路径(复用 `_find_script`/`_run_script_direct`/`subprocess` + `classify_progress_line`),完成置 100。与 sync/import/download 互斥(其一 running 时拒绝,返回 busy 状态)。
- **拆分 `/api/pmis/download`**:去掉末尾"重跑预处理"那段(只下载到 `input/pmis/`,完成即结束;不再调用 preprocess)。
- **拆分 `/api/import`(run_import)**:去掉末尾运行 preprocess 的逻辑(只保存上传的 sheets 到 yundocs_data;不再自动处理)。
- **拆分云同步 `/api/sync`(run_sync)**:去掉末尾运行 preprocess 的逻辑(只抓取到 yundocs_data;不再自动处理)。
- **新增 `/api/pmis/upload`**(POST,`application/octet-stream`,`?name=<文件名>`):body 为原始 xlsx 字节;校验 `name ∈ config.PMIS_FILES_ACTIVE/CLOSED 的 7 个值`,写入 `input/pmis/<name>`;非法名返回错误。(用原始字节 + query 名,避免 stdlib multipart 解析复杂度。)
- **PMIS 数据时间**:`pmis.py` 新增纯函数 `pmis_data_time(pmis_dir)` = `input/pmis/` 下 xlsx 的最大 mtime 格式化为 'YYYY-MM-DD HH:MM'(无文件返回 '');`load_project_pmis` 把它写入 `dataQuality.summary.lastPmisUpdate`(实现 U1 backlog 第③项);`schema.py` 的 `QualitySummary` 加 `lastPmisUpdate: str = ''`,重生成前端类型。

## 前端改动(frontend/)

- **composables**:
  - `usePmisSync.download()`:去掉 `opts.onDone`(reprocess 不再由它触发);保留 `loadLinks/saveLinks/download(只下载)`。
  - 新增 `usePmisSync.upload(files)` 或独立 `usePmisUpload`:对选中的每个文件,按文件名匹配 7 个 canonical 名,逐个 `POST /api/pmis/upload?name=<name>`(body=ArrayBuffer);汇报成功/跳过(非 PMIS 名)。
  - `useExcelImport`:去掉自动处理后的 `onDone`(导入只落地)。
  - 新增 `useReprocess`:`GET /api/reprocess` SSE,phase/progress/message + `onDone: () => data.reload()`。
- **DataView.vue 重构**:按上面"页面结构"重排;删除数据质量总览卡(连带不再 import `DataQualityTable`/`DataDrillModal`/`dataQuality` 相关——仅 DataView 内删除,`lib/dataQuality.ts` 与 `/analysis` 数据质检不动);顶部加分源更新时间;获取卡两域;全局更新卡;设置卡。复用 token/暗色/字号,补 CSS 不引框架。
- **AboutView.vue**:移除"数据更新"行(已移到数据管理页)。
- **FilterBar 按路由收敛**:`AppLayout.vue` 根据当前路由隐藏 FilterBar(在 `/data`、`/governance`、`/about` 不渲染)。用路由 `meta.hideFilter: true`(在 `router/index.ts` 给这三条路由加)或按 route name 判断。分析类页面照常显示。

## 数据流(获取/更新解耦后)

```
获取(各自只落地本地文件):
  云同步  → fetch_yundocs_full → yundocs_data/
  离线导入 → 浏览器解析 → POST /api/import → yundocs_data/
  PMIS下载 → pmis_download(链接) → input/pmis/
  PMIS上传 → POST /api/pmis/upload?name= → input/pmis/
更新(显式一步):
  「更新数据」→ GET /api/reprocess → preprocess_data.py(读 yundocs_data + input/pmis)→ data/analysis_data.json → 前端 reload
```

## 测试

- 后端纯函数:`pmis_data_time(dir)`(给 tmp 目录造文件断言最大 mtime 格式);`/api/pmis/upload` 名校验(可抽纯函数 `is_valid_pmis_name(name)`)。
- 后端 HTTP 行为(reprocess/upload 路由、互斥):py_compile + 手动冒烟(分发态;起停受单线程限制,诚实标注)。
- schema:`QualitySummary.lastPmisUpdate` 校验 + 重生成类型 typecheck。
- 前端:`useReprocess`/`usePmisUpload` 单测(stub fetch 断言 URL/方法);`useExcelImport`/`usePmisSync` 改动不回归;DataView 重构后渲染(获取/更新/设置三区存在,质量表已移除)断言;AboutView 不再含"数据更新"。
- `bash verify.sh` 全绿。

## 完成定义

- 数据管理页呈现"获取 / 更新 / 设置"三段;云同步/下载/导入/上传四种获取均不自动处理;「更新数据」一键重处理并刷新。
- PMIS 离线多选上传可用;链接来自配置、空则页面录入。
- 数据更新时间在数据管理页分源可见;关于页不再展示。
- 数据质量总览卡删除;`/data`、`/governance`、`/about` 不再显示筛选条。
- 纳管开关保留(逻辑不变)。
- `verify.sh` 全绿;版本递增;PROGRESS 更新。

## 范围与不做

- 不改纳管逻辑(仅保留;后续单独一轮)。
- 不动 `/analysis` 数据质检 与 `/governance`(职责不同,保留)。
- 不改回款 xlsx 的浏览器解析方式。
- 打包(.spec)无需变动(无新增需打包的数据文件;新模块若有则补)。

## 约定遵守

- 获取/处理解耦;frozen/dev 双路径同时维护。
- 无 emoji(符号用 → ↓ ❌ ✕ ▾)。禁止 `git add -A`;`input/`、`data/`、`frontend/dist/` 不提交。
- 样式以 token/补 CSS 完善,不引框架;实现该页时可按需用前端 design 技能打磨布局。

## 可能的分解(执行时)

- 体量较大,plan 可分组:① 后端解耦(reprocess/upload/拆 download-import-sync + pmis_data_time + schema);② 前端 composables + DataView 重构 + AboutView;③ FilterBar 路由收敛。各自可独立验证。
