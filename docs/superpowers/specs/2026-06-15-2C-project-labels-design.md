# 2C 项目标签体系设计（替代纳管，本地多标签 + 全局排除）

> 状态：设计已与用户确认（2026-06-15），进入 spec。下一步 `superpowers:writing-plans`。
> 这是「回款看板重建程序」的 **2C**（承 2B 回款看板重建 a4dfba0）。把云文档驱动的二态「纳管」换骨为**本地可编辑的项目多标签体系**：标签首次从云文档散落标记播种，此后纯本地维护；`/projects` 按标签筛选、`/project/:id` 逐项目编辑、`/data` 管理标签库并配置「按标签全局排除」替代旧纳管开关。
> 范围：后端（preprocess 播种 + 新本地 store + 2 API）+ 前端（标签 store + 三处 UI + 过滤集成）。版本 V1.3.0 → **V1.4.0**（整页级）。

## 0. 背景：旧「纳管」是什么、为何替代

- 旧机制（已核实，源 `preprocess_data.py:816-869 process_project_overview`）：云文档「项目验收日期、回款条件信息收集」Sheet 的 `纳管` 列，值 `是/否/空`。`否` → `naguanExclude[pid]=true`（实测 27 个），`是` → `naguanMap[pid]=true`（实测 0 个），空 → 都不置。
- 前端（`stores/filter.ts`）：全局二态开关 `naguanOn`（localStorage，默认开），开启时 `filterNodes`/`filterProjects` 排除所有 `naguanExclude` 项目。**单一全局开关，无逐项目编辑，纯云文档驱动每次重算。**
- 真实问题（用户指认）：项目的真实"管理类别"其实被人工散填在云文档的**截图列**里——本该放图片（DISPIMG）的「合同验收回款时间节点截图」「合同付款条件截图」两列，被手填了文字标记：`BH项目`×12、`框架合同`×16、`退换货项目`×2、`项目已关闭`×4、`SM项目`、`0元订单项目`、`佳杰`×23 等（混杂 `已100%回款`/`不需要贴图` 等状态/流程话）。这些类别标记在旧体系里就是"被不纳管"的真实原因。
- 2C 目标：把这批散落标记正规化为**本地多标签体系**，逐项目可编辑、可按标签筛选，并保留"按标签全局排除"能力替代旧纳管。**`纳管=否` 标志本身不作为标签。**

## 1. 已确认的边界决策（用户钦定 2026-06-15）

1. **多标签**：一项目可挂多个标签；初始化时把云文档里命中的那个标记值灌入即可。
2. **标签库可扩展**：本地可 增 / 重命名 / 停用 标签类型；不止改某项目挂哪些标签，也能管理标签库本身。
3. **既筛选又全局排除**：`/projects` 按标签**多选筛选**（取并集 OR）；同时保留全局排除——把旧二态纳管开关换成「按标签排除」开关 **+** 标签多选，用户自选要排除哪些标签，命中即从所有看板隐藏。
4. **纯本地**：标签只存本地 `data/project_tags.json`，同步/导入云数据时不覆盖、**不回写云文档**。
5. **标签库管理位置**：放 `/data`；逐项目挂载放 `/project/:id`；标签筛选放 `/projects`。
6. **导出**：本期不建。记录待办「/projects 清单导出支持勾选标签列导出（用 `lib/exportXlsx.exportRows`）」，待清单导出专项落地。
7. **版本**：V1.4.0（整页级，单一来源 `frontend/src/version.ts`）。

## 2. 种子白名单与扫描范围（已确认）

- 种子白名单（即初始标签库，用户钦定）：`BH项目 / 框架合同 / 退换货项目 / 项目已关闭 / SM项目 / 0元订单项目 / 佳杰`。
- 扫描列：「合同验收回款时间节点截图」+「合同付款条件截图」两列的**文字值**（`=DISPIMG(...)` 图片公式与状态/流程话忽略）。
- 匹配规则：某项目某扫描列文字 **完全等于** 白名单某项 → 给该项目挂该标签；两列取并集；同名去重。
- 实测计数参考（首次播种应接近）：BH项目 12、框架合同 16、退换货项目 2、项目已关闭 4、SM项目 1、0元订单项目 1、佳杰 23(列16)+11(列17)（去重后按项目计）。
- **`已100%回款`/`不需要贴图`/`未获取到合同`/`方正` 等不在白名单 → 不播种**（方正等可由用户后续手动加标签库）。

## 3. 数据模型

```
// data/project_tags.json（本地唯一真相源，server.py 管理）
{
  "version": 1,
  "tags": [ { "name": "BH项目", "disabled": false }, { "name": "框架合同" }, ... ],  // 标签库(有序)
  "assignments": { "WSGF-SF-xxx": ["BH项目"], "QABJ-SS-yyy": ["框架合同","退换货项目"], ... }
}
```

- `tags`：标签库，每项 `{ name: string, disabled?: boolean }`。`disabled=true` = 停用（拣选器隐藏、已挂载保留、不参与新挂载与排除多选）。
- `assignments`：`{ [projectId]: string[] }`，标签名引用 `tags[].name`。
- 标签仅 `name`，**无颜色/层级/图标**（YAGNI）。
- 重命名：改 `tags[].name` 并同步迁移所有 `assignments` 内旧名→新名（原子整存）。

## 4. 存储与播种（关键）

- 本地文件 `data/project_tags.json`，`server.py` 读写（沿用 `followup_records.json` 模式：`_load_project_tags()`/`_save_project_tags()`，`getattr(sys,'frozen',False)` 双模式路径——基于 `sys.executable` 目录定位 data/）。**不回写云文档。**
- **一次性播种**（"首次按当前标签填写"）：
  - `preprocess_data.py`：新增纯函数 `derive_tag_seed(projects)`（或在 `process_project_overview` 后），扫描两列文字、白名单匹配，产出 `tag_seed: Dict[str, List[str]]`（pid → 命中标签名，去重）。写入 `data/analysis_data.json` 新键 `tagSeed`（体积极小）。
  - `server.py`：首次 `GET /api/tags` 时若 `project_tags.json` 不存在 → 由 `analysis_data.json.tagSeed` 建库（`tags` = 实际出现的白名单项按白名单序、`assignments` = tagSeed），落盘。**此后文件存在即本地为准，重同步/重导入不覆盖。**
  - *推荐此法*（播种逻辑在 preprocess、落地在 server，贴合现有管道 + 本地 store）。备选（独立迁移脚本 / 前端首载播种）不如此清晰，不采。
- **同步后新增项目不自动播种**（"首次"语义）；可选「从云标记再导入」动作**记录待办，本期不做**。

## 5. 后端改动

- `preprocess_data.py`：`derive_tag_seed`（纯函数，可单测：白名单匹配/两列并集/忽略 DISPIMG 与非白名单文字/去重）；管道末段写 `analysis_data.json.tagSeed`。
- `schema.py`：`AnalysisData` 加 `tagSeed: Dict[str, List[str]] = {}`（pydantic 契约 + JSON Schema 导出；前端 `npm run gen:types` 再生 `analysis.ts`）。
- `server.py`：
  - `PROJECT_TAGS_FILE = os.path.join(BASE_DIR, 'data', 'project_tags.json')`；`_load_project_tags()`/`_save_project_tags(store)`（frozen 感知，文件锁参照 followup 串行写）。
  - 首次播种逻辑（文件不存在 → 读 analysis_data.json tagSeed 建库）。
  - API：`GET /api/tags` → `{success, tags, assignments}`；`PUT /api/tags`（请求体 `{tags, assignments}` 整存校验后保存）。错误响应沿用 `{success,code,message}` 收口。**无云回写。**
  - **打包模式（frozen）两条路径分支都要覆盖**（CLAUDE.md §5 易踩坑）。
- 旧 `naguanMap/naguanExclude` 继续输出（避免动其它潜在消费方）；前端排除逻辑改走标签，不再消费 `naguanExclude`。plan 期 grep 全仓确认 `naguanExclude/naguanMap` 除 filter 链外无其它消费方后，再定是否连带清理（默认保留）。

## 6. 前端 store 与 API 客户端

- `lib/projectTagsApi.ts`：`getTags()` / `putTags(store)` HTTP 客户端（对接 /api/tags）。
- `stores/projectTags.ts`（Pinia）：
  - state：`tags: TagDef[]`、`assignments: Record<string, string[]>`、`loaded/saving`。
  - getters：`activeTags`（未停用）、`tagsOf(pid)`、`projectsWithTag(name)`。
  - actions：`load()`、`addTag(name)`、`renameTag(old,new)`（迁移 assignments）、`disableTag(name,on)`、`setProjectTags(pid,names)`、`toggleTag(pid,name)`、`save()`（PUT 整存，乐观更新 + 失败回滚）。
- 类型同源：`TagDef`/`store` 形状在前端定义；`tagSeed` 经 schema 生成。

## 7. 三处 UI

### A · `/project/:id` 详情页（`ProjectDetailView.vue`）——逐项目编辑主入口
- 新增「项目标签」块：当前标签以 chip 列出（每个可删 ✕）；「+ 加标签」控件 = 从 `activeTags` 下拉选 或 输入新名（新名即 `addTag` 建库再挂载）。
- 改动即调 store action 持久化（防抖 `save()`）。空态（无标签）显占位提示。
- chip 用设计令牌（淡底深字，参照状态徽章；标签无语义色，用中性 `--card2`/`--sub` 或统一 accent 浅底）。

### B · `/projects` 清单页（`ProjectsView.vue`）
- 新增「标签」列：chip 展示该项目标签（多枚，超出省略 + tooltip）。
- 筛选行新增**标签多选**控件：选中多个标签 → 保留"挂有任一选中标签"的项目（并集 OR，与现有多选筛选语义一致）；空选 = 不过滤。
- 与现有筛选（经理/服务组/阶段/…）AND 组合。

### C · `/data` 数据管理页（`DataView.vue`）——标签库管理 + 全局排除
- 把现「设置」卡里的二态纳管开关替换为「项目标签」区块，含两部分：
  1. **标签库管理**：`tags` 列表（增：输入新名；改名：行内编辑；停用：开关）。
  2. **按标签排除**：`「按标签排除」开关 + 标签多选`（仅列 `activeTags`）。开启 + 选中若干标签 → 全局生效。
- 文案：开关提示"开启后，挂有所选标签的项目从所有看板隐藏（替代旧纳管）"。

## 8. 过滤集成（关键，影响多页）

- `stores/filter.ts`：
  - 新增 state（localStorage 持久化，替代 `naguanOn`）：`excludeOn: boolean`、`excludeTags: string[]`。
  - 派生 getter `excludedIds: Record<string, boolean>`：`excludeOn` 时，凡 `projectTags.assignments[pid]` 与 `excludeTags` 有交集的 pid → true；否则空。
  - 移除对 `data.naguanExclude` / `naguanOn` 的排除消费，改用 `excludedIds`/`excludeOn`。
- `lib/filterNodes.ts`（旧 rawNodes 链：/payment·日历·台账）与 `lib/paymentPmis.ts filterProjects`（2B /panalysis）：
  - 入参 `naguanOn/naguanExclude` 泛化更名为 `excludeActive/excludedIds`（语义不变：`excludeActive && excludedIds[pid]` → 排除），连带改其全部调用点与测试。
- 护栏：标签 store 未加载时 `excludedIds` 为空（不误排除）；`excludeOn=false` 时全量。

## 9. 替代纳管——旧件去留

- 前端：删 `/data` 二态纳管开关 UI、`filter.ts` 的 `naguanOn`/`naguanExclude` 排除消费。
- 后端：`naguanMap/naguanExclude` 暂留输出（schema/preprocess 不动），plan 期 grep 确认无其它消费方后再定清理（默认保留，避免破其它页/治理）。
- `localStorage` 旧键 `naguan_on` 弃用（新键 `pa_exclude_on`/`pa_exclude_tags`）。

## 10. 导出（本期不做，记录待办）

- 不建清单导出。PROGRESS backlog 加：「**L-xx** /projects 项目清单导出（`lib/exportXlsx.exportRows`）支持勾选列含『标签』列导出」，待清单导出专项时落地。

## 11. 测试

- **pytest**：`derive_tag_seed`（白名单完全匹配 / 两列并集 / 忽略 DISPIMG 与非白名单文字 / 同名去重 / 空安全）；server 首次播种（文件不存在→按 tagSeed 建库；文件存在→不覆盖）；`PUT /api/tags` 整存校验。
- **vitest**：`projectTags` store（addTag/renameTag 迁移 assignments/disableTag/setProjectTags/save 乐观回滚）；`filter.ts excludedIds` 派生（交集/excludeOn 关闭→空/store 未载→空）；`filterNodes`/`filterProjects` 改名后排除语义；详情页标签编辑（加/删 chip、输入新名建库）；清单页标签列+多选筛选（并集）；/data 标签库管理 + 排除开关+多选 薄渲染。
- **真实数据冒烟**：`python server.py` 首次启动播种 → `data/project_tags.json` 生成，BH项目12/框架合同16/退换货2/项目已关闭4 等计数吻合；/data 选中某排除标签 → 对应项目在 /panalysis 与 /payment·日历·台账全部隐藏；本地编辑后重同步不被覆盖。
- `bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。

## 12. 版本与不做（YAGNI 边界）

- 版本 **V1.4.0**（`frontend/src/version.ts` 单一来源）；`PROGRESS.md` 2C 项标完成 + SHA。
- **不做**：标签回写云文档；/projects 清单导出（仅记录待办）；标签颜色/层级/图标；同步后自动再播种（"从云标记再导入"记录待办）；2D 跟进记录（独立）；动 2B 的 PMIS 口径/看板结构（仅在 filter 层接入排除）。

## 13. 实现注意（易踩坑）

- `server.py` 打包(frozen)/开发两套路径分支都要维护（CLAUDE.md §5）：`project_tags.json` 走 `sys.executable` 目录、首次播种读 analysis_data.json。
- `data/project_tags.json` 是**本地用户数据**（同 `followup_records.json`），须加入 `.gitignore`（确认 followup 的忽略规则范式，比照加 `data/project_tags.json`）。
- 改 `filterNodes`/`filterProjects` 入参名（naguan→exclude）牵动多页调用点与测试——plan 期先 grep 全部调用点，逐处同步改，确保 /payment·日历·台账·/panalysis 全绿。
- `.spec`(PyInstaller) 若新增 py 依赖需补 datas（本期 preprocess/server 内改，无新模块，确认 `data/project_tags.json` 在 frozen 数据目录可写）。
- 标签 chip / 控件一律引 `theme.css` 令牌，数字无关；标签无语义色用中性令牌，禁手写散值。
- 类型同源：改 `schema.py` 后 `cd frontend && npm run gen:types`，`git diff` 确认 `analysis.ts` 同步（HX-9 漂移护栏）。
