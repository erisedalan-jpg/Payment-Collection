# CLAUDE.md — 项目管理平台

> 本文件是 AI 代理在本仓库工作的**指令层**（harness: Instructions）。
> 每次开始任务前先读本文件 + `PROGRESS.md`；完成后按"验证"一节跑 `verify.sh`，并更新 `PROGRESS.md`。
> 本项目使用 Claude Code，**以本文件为唯一代理指令入口**（不另设 AGENTS.md，避免多份说明漂移）。

## 1. 这是什么

一个**单机/内网离线**运行的**项目管理平台**：从最初的回款（收款）跟踪看板，已扩展为覆盖 **项目主域 / 回款 / 商机 / 概算工具 / 倚天工时 / 首页门户** 的多域平台。后端是纯 Python 标准库的本地 HTTP 服务（`server.py`），前端是 `frontend/` 下的 **Vue3 + Vite + TS + Pinia + Element Plus + ECharts**（旧原生 JS 前端 app.js/index.html/analysis_data.js 已退役删除）。数据分**三条脉络**（数据血缘详见 §2）：① **主域管线** PMIS 导出 + CSV → `preprocess_data.py` → `data/analysis_data.json`（前端主业务数据源）；② **倚天工时管线** `input/yitian/工时.xlsx` → 累积库 `data/yitian_store.json` → `data/yitian_data.json`（独立数据源，脉络②在「更新数据」里与主域一并跑，只是产出独立文件）；③ **配置/存档/跟进/门户/蓝信类** 不进管线，经 `server.py` 的 `/api/*` 直接读写 `data/*.json`，改完即时生效（含 **蓝信双向闭环**：出站推送异常项目/工时提醒 + 入站回调接收员工回复进收件箱、超管归入各跟进域，见 §4 蓝信约定）。主域/倚天数据经页面上传或本地放置进入 `input/`（PMIS 9 表放 `input/pmis/`，收款阶段/回款流水/预算等 CSV 放 `input/`，倚天工时放 `input/yitian/`），`组织架构.xlsx` 决定项目/员工花名册，`A.xlsx` 售前↔原项目映射；点「更新数据」（`/api/reprocess`，SSE）生效。可用 PyInstaller 打包成单 exe 分发。

- 当前版本：见 `frontend/src/version.ts`（本文刷新时 **V4.0.5**；单一来源，改版本只改此处，本文件不逐版同步）；版本史/各期结论见 `PROGRESS.md`
- 产品名称：**项目管理平台**（2026-06-12 起；桌面快捷方式/.vbs/.bat/exe 文件名仍为旧名「项目回款跟踪与管控平台」，随下次打包专项更名）
- 访问地址：`http://localhost:8080`
- 交流语言：**简体中文**
- **LTS 精简变体**：`lts/` 目录为长期支持精简副本（版本 `LTS-1.0.0`，仅保留核心项目+回款；去除商机/倚天工时/概算/重点项目进展/临时跟进/风险跟进/回款重点跟进等域），自带独立 `lts/CLAUDE.md` 与部署手册（`lts/deploy/`），构建/运行数据不入库（见根 `.gitignore`）。master 全功能演进与 `lts/` 各自维护、互不影响。

## 2. 架构地图（按数据流）

```
脉络① 主域管线 —— 点「更新数据」(/api/reprocess, SSE) 触发
  PMIS 9 表(input/pmis/*.xlsx) ┐
  组织架构.xlsx / A.xlsx(售前映射) │
  收款阶段 collection_stages.csv   ├─ preprocess_data.py(各域解析+计算+快照diff)
  回款流水 payment_records.csv     │    模块: pmis/projects/collection_stages/milestones/profit/snapshots
  预算 profit_loss_*/budget/delivery┘
     └──────────────> data/analysis_data.json  (主业务数据源, schema 校验, 按 allowedL4 切分)

脉络② 倚天工时管线 —— 同在「更新数据」内一并跑(preprocess 末段调 yitian); 超管在 /data 增删累积库亦即时重建
  input/yitian/工时.xlsx(当周快照) ─yitian.ingest─> data/yitian_store.json(累积库, 按工时ID去重, 服务端私有不下发)
     └─ yitian.build_yitian_data(工号 join 花名册 + 合规判定) ─> data/yitian_data.json  (独立数据源, schema 校验, 按 allowedL4 切分)

脉络③ 配置/存档/跟进/门户 —— 不进管线; 经 server.py 的 /api/* 直接读写 data/*.json, 改完即时生效
  budget_config/budget_estimates(概算) · portal_links + portal_files/(门户) · opportunities(商机)
  followup_records + {risk,temp,payment_key,opportunity}_followup + project_progress(各域跟进)
  project_tags(标签) · accounts(账号) · audit_log.jsonl(审计) · yitian_settings/yitian_rules(倚天合规范围+规则, 超管可配)
  lanxin_config(蓝信凭证+路由,含回调双密钥) · lanxin_inbox(蓝信双向:发送台账+收件箱+去重) · lanxin_callback_raw.jsonl(回调存证,只增+滚动归档)

  三脉络产物统一下发:
  server.py(本地HTTP: 静态 dist + /data/*.json + /api/*)  ──fetch/请求──>
  frontend/ Vue3+Vite+TS (router / views / components / lib(纯计算口径) / stores / charts) + ECharts + xlsx
```

| 文件/目录 | 职责 |
|---|---|
| `server.py` | 本地 HTTP：静态 dist + `/data/*.json` + `/api/*`。含 `/api/reprocess`(更新数据,SSE) / `/api/inputs/upload` / `/api/pmis/upload` / `/api/files/status` / `/api/clear-data` / 各域跟进 `/api/{followup,risk-followup,temp-followup,payment-key-followup,opportunity-followup,progress}/*` / `/api/opportunities/*` / `/api/tags` / `/api/budget/*` / `/api/portal/*` / `/api/yitian/{data,store,settings,rules,cookie}` / `/api/lanxin/{config,selftest,preview,send,inbox,inbox/handle,inbox/delete}`(超管) + `/api/lanxin/callback`(**免登录**入站,验签边界见 §4) / `/api/admin/*`(超管账号+审计) / `/api/login`·`/api/auth/me` / `/api/manual/*` / 历史回滚 / `/api/stop`。**打包(frozen)/开发两套代码路径见 §5** |
| `preprocess_data.py` | **主域核心管线**：摄取各源→项目主域/回款/健康/治理指标→`data/analysis_data.json`（经 schema 校验）；末段 9f 系统核心口径回款回填；**末段并调 `yitian.ingest/build_yitian_data` 产出 `data/yitian_data.json`**（脉络②，缺倚天源不阻断主管线） |
| `pmis.py` / `projects.py` / `collection_stages.py` / `milestones.py` / `profit.py` | 主域各域解析：PMIS 项目域 / 主域 join / 收款阶段节点 / 里程碑 / 预算流水 |
| `yitian.py` + `yitian_calendar/check/rules/store/settings/config.py` | **倚天工时域**：`yitian.py` 管线组装(ingest 当周工时→累积库、build→`yitian_data.json`)；`calendar` 工作日/双周(年度无关,不写死年份)；`rules` 合规规则常量 + `check` 判定(纯函数)；`store` 累积库(按工时ID去重,服务端私有)；`settings` 合规检查范围(超管可配)；`config` cookie |
| `opportunities.py` / `opportunity_followup.py` / `risk_followup.py` / `temp_followup.py` / `payment_key_followup.py` / `followup_store.py` | 商机进展(线上可编辑表格) + 各域跟进(薄封装统一 `followup_store`：分组/单表 scope、归档留存或清空) |
| `portal.py` | 首页门户/快捷入口(Launchpad)：配置校验 + 可见性过滤 + 文件名消毒 + 下载头 |
| `lanxin.py` + `lanxin_config/recipients/crypto/callback/inbox.py` | **蓝信双向域**（脉络③,不进管线）：`lanxin.py` 客户端(urllib,`get_app_token`/`id_mapping`/`send_message`·`send_bot_message` 应用号‖机器人双身份/`build_plan`·`dispatch` 编排,产 sentLog 发送台账)；`config` 凭证+逐项路由(超管可配,含回调双密钥,`public_config` 三密钥脱敏)；`recipients` 卡片拼装(appCard 双重字节/字符截断 + 回复引导语)；`crypto` **零依赖 AES-256-CBC 解密 + SHA1 验签**(官方向量回归)；`callback` 回调报文解析(两套键名兼容,看不懂落「未解析」不丢)；`inbox` 收件箱+台账存储(身份反查/归因候选/去重/滚动清理,纯数据无 IO)。**凭证未申请,全链路从未联调** |
| `budget_config.py` / `budget_store.py` | 概算工具：费率与目录配置(超管可配,`budget_config.json`) / 报价存档(按账号隔离 + 费率快照,`budget_estimates.json`) |
| `auth.py` / `audit.py` / `data_scope.py` | 账号鉴权(PBKDF2+会话) / 操作审计(绝不记密码token) / 按 allowedL4 切 `analysis_data`(L4 数据隔离,SP-4) |
| `schema.py` | pydantic 数据契约(主域 + 倚天两套) + 导出 JSON Schema 供前端 `npm run gen:types` |
| `snapshots.py` | 快照 diff → 事件流/周期对比（项目动态） |
| `data_history.py` / `manual_history.py` / `manual_import.py` | 数据历史快照回滚 / 人工数据备份与导入 |
| `config.py` / `pmis_config.py` | 集中配置常量(消除硬编码) / PMIS 下载 cookie 读写 |
| `frontend/` | Vue3 前端：`router/`(路由) `views/`(页面) `components/` `lib/`(纯计算口径,含 `lib/yitian`·`lib/budget`) `stores/`(Pinia) `charts/` `styles/theme.css`(设计令牌单一落地) |
| `data/*.json` | 管线产物 `analysis_data`·`yitian_data`；配置/存档/跟进类 `budget_config`·`budget_estimates`·`portal_links`·`opportunities`·`followup_records`·`*_followup`·`project_progress`·`project_tags`·`yitian_settings`·`yitian_rules`·`yitian_store`(私有)·`accounts`·`events`·`lanxin_config`(含 AppSecret+回调双密钥)·`lanxin_inbox`(存员工回复正文)·`lanxin_callback_raw.jsonl`(回调存证) 等（部分含敏感数据/密钥,**已 gitignore**） |
| `input/` | 数据源输入：`input/pmis/`(PMIS 9 表 xlsx)、`input/`(收款阶段/回款流水/预算 CSV + 组织架构/A/TOP1000 xlsx)、`input/yitian/`(工时.xlsx)；经页面上传或本地放置，点「更新数据」生效 |
| `停止服务.py/.bat/.command`、`*_启动.bat/.command` | 启停脚本（Windows / macOS） |

## 3. 运行 / 调试

```bash
# 开发模式启动（需 Python 3.8+）
python server.py            # 自动开浏览器，监听 8080
python server.py --stop     # 停止运行中的服务
```

- 数据更新走页面上传（`/api/inputs/upload` / `/api/pmis/upload`）或本地放置文件到 `input/` 与 `input/pmis/`，再点「更新数据」（`/api/reprocess`，SSE 流式进度）。
- 无 WPS/在线下载/Playwright 依赖（已于 V1.16.2 彻底移除）。

## 前端（Vue3 + Vite，frontend/）
- 安装：`cd frontend && npm install`
- 开发：先 `python server.py`(:8080) 提供 /api 与 /data，再 `cd frontend && npm run dev`(:5173，已代理 /api、/data)
- 类型同源：改了 `schema.py` 后运行 `cd frontend && npm run gen:types` 重新生成 `src/types/analysis.ts`
- 测试/构建：`npm run test:run` / `npm run typecheck` / `npm run build`（`dist/` 已接入 server.py 静态服务；打包见 `make_update_zip.py` / `make_deploy_zip.py`）

## 4. 关键约定（违反会被用户打回，来源：`.clinerules/memories.md`）

- **不使用任何 emoji** 装饰；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- 跟进类型术语用"**邮件推动**"（不是"邮件催收"）。
- 跟进记录表单只保留 `记录编号 / 项目编号 / 项目名称` 三个只读字段，**不要**金额区间(amountTier)字段（前后端都不传）。
- 云同步操作必须有**明确进度反馈**，不能让用户对成功与否无感知。
- **版本策略（2026-06-12 起，用户钦定）**：三位版本 `VX.Y.Z`——X（大版本）调整**须用户确认**；Y=整页级调整（新增页面/整页重设计）；Z=子页面、下钻页、页内局部调整。单一来源 `frontend/src/version.ts`，改版本只改此处。
- 前端样式改动倾向于补充 CSS 完善表现，而非引入框架。

### 回款口径约定（2026-06-19 起，V1.15.0；改任一处先全仓核对）
- **回款达成率/完成率全站统一口径 = Σ流水净额 ÷ Σ合同总额**。分子=`payment_records` 流水（逐笔严格全加、**含负值/红冲、不取绝对值**）；分母=`paymentPmis.contract`（合同总额，售前回退原项目）。合同≤0 → 比率 `null`（前端显 "-"）。后端项目级 `payment.paymentRatio` 由 9f 用 `payment_ratio_from_records(流水, 合同)` 设置（`aggregate_payment_pmis` 自身 paymentRatio=None）；前端各聚合 rate 分母均为 Σ合同。**例外（已记技术债）**：`/insight` 项目分析的"回款完成率"仍用 节点已收/PMIS合同总额，与主口径不同源。
- **回款数据核心源 = `input/collection_stages.csv`**（PMIS 收款阶段台账导出，已入"数据更新"流程）。售前项目收款阶段节点**按本项目号优先取、缺再回退原项目号**（`_collection_nodes_for`）；台账把售前节点挂在本项目号下。
- **异常项目（`orgL4` 空）排除出回款统计**（`lib/anomaly.isAnomalous`）：回款看板硬排除、治理页告警、项目清单标「数据异常」。
- **回款节点只为在建主域（`dept_projects`=PMIS 在建∩组织架构交付三部）及售前原项目构建**；已关闭/域外项目的收款阶段不进在建回款看板（设计边界，非缺陷）。
- **回款子域路由**：`/payment`(总览) + `/payment/{board,projects,nodes,plan,risk}`（V1.13.0 由旧 `/panalysis` 拆分；旧路径仍 redirect 兼容）。
- **日期区间口径（V1.11.0）**：FilterBar 起止日期，计划侧按节点 planDate∈区间、已回款按流水到账日∈区间；"全部"区间≡全时口径（回归安全网）。

### 概算工具口径（2026-07-13 起，V3.1.0）
- **成本比例 = 销售下单金额（含税）÷ 项目金额**，即 `总成本 × (1 + 毛利率) ÷ (项目金额万元 × 10000)`。原工具此处**漏乘 `(1 + 毛利率)`**（页面文案对、代码错），V3.1.0 已修正 —— 同一份报价的比例比原工具高约 13%（选 6% 档时高 6%），**旧口径落在 13.28%~15% 的报价会翻成「偏高」并强制填异常说明**。
- **物料单价与毛利率解耦**：单价只有一套，毛利率只作为 `(1 + margin)` 的乘数（原工具选 6% 时会静默回退用 13% 的单价表）。
- **费率快照**：每条存档冻结当时的完整费率配置；打开旧档用它自己的快照算 —— **报价是要拿去 CRM 上单的对外产物，必须可复现**。改费率不会改写历史报价。
- 费率/系数/阈值/产品目录/服务目录/物料/PM阶段模板**全部超管可配**（`data/budget_config.json`，`/budget` 页内抽屉），改完立即生效、**无需点「更新数据」**（本域不进数据管线）。

### 蓝信双向约定（2026-07-20 起，V4.0.5；改任一处先读本节，四条承重设计违一即缺陷）
- **绝不记密钥**：`appSecret` / `callbackAesKey` / `callbackSignToken` / `app_token` 绝不进日志、审计、异常消息、前端下发；读取接口一律脱敏（`public_config` 三密钥抹空只透 `has*` 布尔）。`data/lanxin_config.json` **必须 gitignore**。
- **后端不接受前端传来的标识**：只认 `projectId` / `employId` / `riskCode`；`staffId` 由服务端发送台账反查得出，`riskKey` 由后端拼（risk 归入是四域唯一复合键 `${projectId}::${风险编码}`，前端传 riskCode）。
- **① 验签必须先于存证**：`/api/lanxin/callback` 是全站唯一免登录写入口，安全边界是 SHA1 验签而非会话；先无条件落盘则同网段任何人可灌满磁盘。验签未过只记数（`_lanxin_rejected`，含 `lastReason` 区分 signature/stale）、绝不落 body。新鲜度检查插在验签之后、存证之前。
- **② 解析失败仍返回 `errCode 0`**：存证一旦落盘，重推毫无意义（内容一样会再失败三次，白烧蓝信 3 次重试额度）——「成功」定义为「我已持久化」而非「我已理解」；唯一返回非 0 的分支是**存证落盘失败**。看不懂的报文落 `status:"unparsed"` 进收件箱，**不静默丢弃**。
- **③ 归入必须追加、④ 必须全量转义**：`followup_store.apply_update` 是 `rec[field]=content` 直接赋值，原样调用会抹掉既有跟进——归入须读现有内容再拼接（`server.py` 内做，**不改 `followup_store.py`**）；回复是员工任意输入而跟进字段是富文本，必须 `html.escape` 后**换行只用 `<br>`**（`<p>` 不在 `lib/richText.ts` 白名单会被读端拆解）。progress 域不走 `followup_store`（store 逻辑内联 server.py），归入单开分支。
- **文档不可靠、凭证未联调**：蓝信文档字段表与真实密文键名对不上（`eventType/appId` vs `type/app_id`），解析两套键名都认；回调 `timestamp` 单位/格式文档未记载，代码按 epoch 秒解读是**未证实假设**（`lastReason=stale` 且收件箱空即疑此）。全链路从未联调，改动靠 `lanxin_crypto` 官方向量回归 + 伪造报文单测兜底。**债 L-31：nonce 重放缓存未做，依赖时间戳窗口+存证轮转两道叠加，摘窗口会无声重开此债**。

### 跟进表自定义列约定（2026-07-23 起，V4.4.0；改任一处先读本节）
- **超管可为 4 张跟进表配自定义列**（`temp`/`risk`/`payment_key`/`opportunity`，均走 `followup_store`；「重点项目进展」独立代码路径**不含**）：文本（富文本，复用 `RichTextCell`）或日期（`el-date-picker`），列名 + 归档是否清空可配。配置存 `data/followup_columns.json`（`followup_columns.py`，超管可配、即时生效、**不进数据管线、无需点更新数据**；已 gitignore）。**新增任何 `data/*.json` 前先确认 `.gitignore` 已逐文件覆盖**（本仓 gitignore 是显式列举、非 `data/*.json` 通配）。
- **① 值内联、不设第二数据源**：自定义列值存各 store 的 `current[记录键][customKey]`（+`EditTime`/`EditBy`），与内置列并排；`apply_update` 加 `extra_fields` 放行、`apply_archive` 加 `clear_fields` 按字段清（`clear_fields=None` 退化原表级行为，回归安全网）。行构建器白名单不 spread，前端用 `useCustomColumns.decorate` 把值并到行上（否则排序/筛选/导出读不到）。
- **② 归档按列清 + 前端须据后端回填**：内置列保持各表原行为、每个自定义列按自己的 `clearOnArchive`；归档 handler **回传 `current`**，前端 store `archive()` 用 `r.current` 回填（`?? current.value`/`?? {}` 缺省向后兼容）——**绝不再用「整表清/留」硬编码**，否则设了反向 clearOnArchive 的列归档后 UI 与后端错位。
- **③ 删列即删值**：删配置定义 + 清该 `customKey` 在 `current` 的全部值（temp 遍历**全部实例**）+ 提示影响行数；**历史归档 `archives` 冻结不动**。改名只改 `label`、`key` 不变故值不丢。
- **④ 端点用静态路径 + body 传参**（`/api/followup-columns/{add,update,reorder,delete}`，写端点进 `_SUPER_ONLY_PATHS`、`GET` 不进）：审计 `_ACTION_MAP` 与超管闸都按精确 path 匹配，带 `<key>` 变量路径挂不上。

## 设计底层规范（展示形式）

> 约束**展示形式**(配色/排版/间距/卡片/圆角/阴影/动效/密度)，不规定展示内容。
> 令牌落地于 `frontend/src/styles/theme.css`(CSS 唯一落地)与 `frontend/src/charts/echartsTheme.ts`(canvas 同源桥接，契约测试强制一致)；页面只准引用令牌，**不准手写散值**。
> 完整取值表见 `docs/superpowers/specs/2026-06-10-design-foundation-design.md`。

- **配色**：以钦定品牌色板为唯一来源(蓝色系做基调,`--accent` 浅 `#0D3A69`/暗 `#7891AC`)，light/dark 两套；结构灰阶由 4 个黑白中性色(柔纸白/米白/炭黑/深海石)明度·透明度派生,全站不引入第 16 个色号。**结构色与状态色分离**：状态语义色固定(已回款 `--ok #6ECC54` / 待回款 `--warn #F9D46C` / 风险延期 `--danger #C8161D` / 可提前 `--c-advance` 浅 青绿`#018B8D`/暗 蓝绿`#71E2D1`)，不随基调变。图表分类用 `--chart-1..8`，表达回款状态的图表系列必须用状态色。
- **状态三态**：带文字的状态标识一律「淡底+深字」(`--ok-bg`+`--ok-text` 等，warn/danger/urgent/advance 同构)；实底 100% 状态色只用于无文字色块；禁止实底+小号白字。
- **8pt grid**：间距只取 `--sp-1..7`(4/8/12/16/24/32/48)，4px 仅内联半步。
- **排版严格层级**：六级 `--fs-1..6`(12/14/16/19/25/34 @16基准)，每级字号·字重·色锁定，不混用。
- **三档字号**：`--fs-base` 小16 / 中18(默认) / 大20（2026-06-15 三档统一+2），六级按 rem 整体缩放。
- **card 1 主 2 辅**：一卡 1 主信息(`--fs-6`/`--fs-5`，700，`--txt`)+ 最多 2 辅信息(`--fs-2`/`--fs-1`，`--sub`/`--mut`)；禁止一卡两个 700 大号主值。
- **统一卡片**：内边距 `--card-pad 20` / 卡间距 `--gap-card 16` / 卡内堆叠 `--gap-stack 12` / 区块 `--gap-section 24`。
- **圆角**：`--r-sm 6` / `--r-md 10` / `--r-lg 14` / `--r-full 999`。
- **阴影最多两层**：仅 `--shadow-1`(静置) / `--shadow-2`(悬浮)，每级 ≤2 层投影；扁平元素用边框，不加第三种阴影。
- **可访问性护栏**：muted 蓝/紫(`--accent`/`--accent2`/`--highlight`)不用于小号正文，仅用于大号粗体/图标/填充/图表/边框；小号文字用 `--txt`/`--sub`。
- **交互状态**：自绘交互件五态齐全(default/hover/selected/disabled/focus)，hover 用 `--hover-tint`、选中用 `--selected-tint`、禁用用 `--disabled-opacity .45`，focus 用全局 `:focus-visible` 规则。
- **动效**：时长只用 `--dur-1 120ms`(状态反馈)/`--dur-2 200ms`(展开浮层)，缓动 `--ease`，尊重 `prefers-reduced-motion`。
- **表格密度**：单元格内边距纵 8 横 12，行高随字号档缩放，不另设密度开关。
- **数字排版**：金额/百分比/KPI/表格数字列必须挂 `.u-num`(tabular-nums)；行高三档 `--lh-tight 1.15`/`--lh-dense 1.4`/`--lh-base 1.6`；大写+字距(`--ls-wide`)仅限拉丁/数字标签，中文不大写不加字距。
- **字体**：`--font-sans` 系统栈(无 Inter)，body 与 ECharts 同源；前端**禁止外链字体**。
- **z-index**：自绘浮层只用 `--z-sticky 100`/`--z-panel 1500`/`--z-toast 4000` 三级，弹窗抽屉优先用 Element Plus；禁止散写数字。
- **断点**：窄屏 `<=768px` / 常规 `<=1200px`(文档常量，优先靠 `.u-grid-auto` 自动换列少写断点)。

## 5. ⚠️ 最易踩坑：打包模式 vs 开发模式

`server.py` / 各脚本里大量 `if getattr(sys, 'frozen', False):` 分支，**两套代码路径必须同时维护**：
- **开发模式**：用 `subprocess` 调子脚本，可解析 `[OK]/[INFO]/[WARN]/[ERROR]` 进度。
- **打包模式(frozen)**：目标机无 Python，改为 `_run_script_direct()` 进程内 `importlib` 直接执行；路径基于 `sys._MEIPASS`(静态) 与 `sys.executable` 目录(数据)。

改任何"调用脚本/读写文件路径"的逻辑时，**两条分支都要改**，否则 exe 版会坏而本地测不出来。

## 6. 验证（harness: Verification — 声称完成前必须执行）

```bash
bash verify.sh          # 语法编译 + ruff + pytest + 前端 typecheck/vitest/build，全绿才算 done
# 或单独跑：
python -m pytest -q
```

- `preprocess_data.py` 的纯函数（金额/日期/比例解析）有 pytest 覆盖，见 `tests/`。
- 改了 `preprocess_data.py` 的计算逻辑，**先补/改测试再改实现**。
- 改了前端，至少手动启动一次（`python server.py` + `cd frontend && npm run dev`）确认相关页面能加载、无 console 报错；改口径/数据层时用真实数据冒烟核对关键指标（如回款达成率落在合理区间）。

## 7. 范围与完成定义（harness: Scope）

- **一次只做一个功能/修复**；动手前在 `PROGRESS.md` 标 `in_progress`。
- "完成"= 代码改完 **且** `verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
- 已知技术债与待办集中在 `PROGRESS.md`，不要顺手扩大改动面。

## 8. 已知重大技术债（详见 PROGRESS.md backlog）

- 长任务（`/api/reprocess` 等 SSE）期间，跨域互斥锁采用「抢不到立即 400、绝不排队」策略；调用方需自行重试。
- `data/analysis_data.json` 全量 fetch（~2MB），前端一次性加载；vite 构建产物单 chunk >500KB（未做代码分割）。
- `/insight` 项目分析"回款完成率"口径（节点已收/PMIS合同）与主域口径（流水/合同）不同源，待归并统一。
- `collection_stages.csv` 导出端覆盖风险：导出脚本若漏在建项目则其回款节点静默缺失（无校验告警）——建议加"在建项目收款阶段覆盖率"治理告警。

## 9. GitHub 远端与定期上传（2026-07-21 起，用户钦定）

- **远端**：`origin` = `https://github.com/erisedalan-jpg/Payment-Collection.git`，**public 公开仓库**；默认推送分支 `master`（全功能演进与 `lts/` 精简副本同仓，一并上传）。
- **定期上传约定**：每完成一个版本/功能且 `verify.sh` 全绿、`PROGRESS.md` 已更新后，`git push origin master`。不要攒一堆再推；一个可交付单元一提交一推送。
- **⚠ 上传前安全红线（public 仓库，全网可读，一旦推出洗不掉）**：
  - **绝不 push 任何密钥/凭证/真实业务数据**。`data/*.json`（含 `lanxin_config`/`accounts`/`audit_log`/`budget_*`/各 `*_followup`/`analysis_data`/`yitian_*` 等）、`input/`、`release/`、`lts/data/`、`lts/input/`、`pmisdata/`、`lts/pmisdata/`、`client/config.json` 等**均已 gitignore**。
  - 新增任何数据文件/配置文件前，**先确认 `.gitignore` 已覆盖**再提交；宁可漏推、绝不误推。
  - **绝不 `git add -A` / `git add .` 无差别暂存**——工作树里常年散落 `client.zip`/`*.xlsx`/`*.pdf`/临时抓数脚本等未跟踪脏文件（部分含真实数据），无差别暂存会把它们一并入库。只 `git add` 本次明确改动的文件。
  - 推送前用 `git status` + `git diff --cached --stat` 核一眼暂存内容，确认无敏感项。
- **历史教训（2026-07-21 首次接入时）**：`lts/pmisdata/` 曾误随「复制精简副本」进库，内含真实 PMIS 会话 cookie + 项目数据；接入 GitHub 前用 `git filter-repo --path lts/pmisdata --invert-paths` 从全历史清除后才首推。该目录是临时 PMIS 抓数脚本、非平台组成部分，已 gitignore。
