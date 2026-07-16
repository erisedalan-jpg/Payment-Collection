# CLAUDE.md — 项目管理与回款跟踪平台（LTS 精简版）

> 本文件是 AI 代理在本仓库工作的**指令层**（harness: Instructions）。
> 每次开始任务前先读本文件；完成后按「验证」一节跑 `verify.sh`。
> 本项目以本文件为唯一代理指令入口。

## 1. 这是什么

一个**单机/内网离线**运行的项目管理与回款（收款）跟踪看板。后端是纯 Python 标准库的本地 HTTP 服务（`server.py`），前端是 `frontend/` 下的 **Vue3 + Vite + TS + Pinia + Element Plus + ECharts**。数据来源 = PMIS 导出 + CSV，经页面上传或本地放置进入 `input/`（PMIS 9 表放 `input/pmis/`，收款阶段/回款流水/预算等 CSV 放 `input/`），`组织架构.xlsx` 决定项目花名册，`A.xlsx` 售前↔原项目映射；登录后在「数据管理」页点「更新数据」（`/api/reprocess`，SSE 流式进度）生效。（可选）如需可用 PyInstaller 打包为单 exe 分发，须按当前保留模块自备打包 spec。

- 当前版本：见 `frontend/src/version.ts`（撰写时 **LTS-1.0.0**；单一来源，改版本只改此处）。
- 访问地址：`http://localhost:8080`
- 交流语言：**简体中文**

**功能范围**：项目总览首页（含首页门户快捷入口）· 在建项目 / 已关闭项目 / 项目详情 · 项目动态 · 项目分析（多维分析 + 里程碑管理 + 成本分析 + 风险看板 + 回款多维分析 + 回款日历）· 回款（总览 / 项目 / 节点）· 数据治理 · 账号管理 · 数据管理 · 关于。

## 2. 架构地图（按数据流）

```
主域管线 —— 在「数据管理」页点「更新数据」(/api/reprocess, SSE) 触发
  PMIS 9 表(input/pmis/*.xlsx) ┐
  组织架构.xlsx / A.xlsx(售前映射) │
  收款阶段 collection_stages.csv   ├─ preprocess_data.py(各域解析+计算+快照diff)
  回款流水 payment_records.csv     │    模块: pmis/projects/collection_stages/milestones/profit/snapshots
  预算 profit_loss_* / 预算科目 CSV ┘
     └──────────────> data/analysis_data.json  (前端主业务数据源, schema 校验, 按 allowedL4 切分)

配置/存档/跟进/门户 —— 不进管线; 经 server.py 的 /api/* 直接读写 data/*.json, 改完即时生效
  跟进记录 followup_records · 项目标签 project_tags · 首页门户 portal_links + portal_files/
  账号 accounts · 审计 audit_log.jsonl · 事件流 events

  产物统一下发:
  server.py(本地HTTP: 静态 dist + /data/*.json + /api/*)  ──fetch/请求──>
  frontend/ Vue3+Vite+TS (router / views / components / lib(纯计算口径) / stores / charts) + ECharts + xlsx
```

| 文件/目录 | 职责 |
|---|---|
| `server.py` | 本地 HTTP：静态 dist + `/data/*.json` + `/api/*`。含 `/api/reprocess`(更新数据,SSE) / `/api/inputs/upload` / `/api/pmis/upload` / `/api/files/status` / `/api/clear-data` / `/api/followup/*`(跟进记录) / `/api/tags` / `/api/portal/*` / `/api/admin/*`(超管账号+审计) / `/api/login`·`/api/auth/me` / `/api/manual/*` / 历史回滚 / `/api/stop`。**打包(frozen)/开发两套代码路径见 §5** |
| `preprocess_data.py` | **核心管线**：摄取各源→项目主域/回款/健康/治理指标→`data/analysis_data.json`（经 schema 校验）；末段系统核心口径回款回填 |
| `pmis.py` / `projects.py` / `collection_stages.py` / `milestones.py` / `profit.py` | 各数据域解析：PMIS 项目域 / 主域 join / 收款阶段节点 / 里程碑 / 预算流水 |
| `schema.py` | pydantic 数据契约 + 导出 JSON Schema 供前端 `npm run gen:types` |
| `snapshots.py` | 快照 diff → 事件流/周期对比（项目动态） |
| `data_history.py` / `manual_history.py` / `manual_import.py` | 数据历史快照回滚 / 人工数据备份与导入 |
| `portal.py` | 首页门户/快捷入口(Launchpad)：配置校验 + 可见性过滤 + 文件名消毒 + 下载头 |
| `auth.py` / `audit.py` / `data_scope.py` | 账号鉴权(PBKDF2+会话) / 操作审计(绝不记密码token) / 按 allowedL4 切 `analysis_data`(L4 数据隔离) |
| `config.py` / `pmis_config.py` | 集中配置常量(消除硬编码) / PMIS 下载 cookie 读写 |
| `frontend/` | Vue3 前端：`router/`(路由) `views/`(页面) `components/` `lib/`(纯计算口径) `stores/`(Pinia) `charts/` `styles/theme.css`(设计令牌单一落地) |
| `data/*.json` | 管线产物 `analysis_data.json`；配置/存档类 `followup_records`·`project_tags`·`portal_links`·`accounts`·`events`·`audit_log.jsonl`(部分含敏感数据,已 gitignore) |
| `input/` | 数据源输入：`input/pmis/`(PMIS 9 表 xlsx)、`input/`(收款阶段/回款流水/预算 CSV + 组织架构/A/TOP1000 xlsx)；经页面上传或本地放置，点「更新数据」生效 |
| `停止服务.py/.bat/.command`、`*_启动.bat/.command` | 启停脚本（Windows / macOS） |

## 3. 运行 / 调试

```bash
# 开发模式启动（需 Python 3.8+）
python server.py            # 自动开浏览器，监听 8080
python server.py --stop     # 停止运行中的服务
```

- 数据更新走页面上传（`/api/inputs/upload` / `/api/pmis/upload`）或本地放置文件到 `input/` 与 `input/pmis/`，再点「更新数据」（`/api/reprocess`，SSE 流式进度）。

### 前端（Vue3 + Vite，frontend/）
- 安装：`cd frontend && npm install`
- 开发：先 `python server.py`(:8080) 提供 /api 与 /data，再 `cd frontend && npm run dev`(:5173，已代理 /api、/data)
- 类型同源：改了 `schema.py` 后运行 `cd frontend && npm run gen:types` 重新生成 `src/types/analysis.ts`
- 测试/构建：`npm run test:run` / `npm run typecheck` / `npm run build`（`dist/` 已接入 server.py 静态服务）

## 4. 关键约定

- **不使用任何 emoji** 装饰；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- 跟进类型术语用「**邮件推动**」（不是「邮件催收」）。
- 云同步/数据更新操作必须有**明确进度反馈**，不能让用户对成功与否无感知。
- **版本策略**：单一来源 `frontend/src/version.ts`，改版本只改此处。
- 前端样式改动倾向于补充 CSS 完善表现，而非引入框架。

### 回款口径约定（改任一处先全仓核对）
- **回款达成率/完成率全站统一口径 = Σ流水净额 ÷ Σ合同总额**。分子=`payment_records` 流水（逐笔严格全加、**含负值/红冲、不取绝对值**）；分母=`paymentPmis.contract`（合同总额，售前回退原项目）。合同≤0 → 比率 `null`（前端显 "-"）。
- **回款数据核心源 = `input/collection_stages.csv`**（PMIS 收款阶段台账导出，已入「数据更新」流程）。
- **异常项目（`orgL4` 空）排除出回款统计**（`lib/anomaly.isAnomalous`）：回款看板硬排除、治理页告警、项目清单标「数据异常」。
- **日期区间口径**：FilterBar 起止日期，计划侧按节点 planDate∈区间、已回款按流水到账日∈区间；「全部」区间≡全时口径。

## 5. ⚠️ 最易踩坑：打包模式 vs 开发模式

`server.py` / 各脚本里大量 `if getattr(sys, 'frozen', False):` 分支，**两套代码路径必须同时维护**：
- **开发模式**：用 `subprocess` 调子脚本，可解析 `[OK]/[INFO]/[WARN]/[ERROR]` 进度。
- **打包模式(frozen)**：目标机无 Python，改为进程内 `importlib` 直接执行；路径基于 `sys._MEIPASS`(静态) 与 `sys.executable` 目录(数据)。

改任何「调用脚本/读写文件路径」的逻辑时，**两条分支都要改**，否则 exe 版会坏而本地测不出来。

## 6. 验证（声称完成前必须执行）

```bash
bash verify.sh          # 语法编译 + ruff + pytest + 前端 typecheck/vitest/build，全绿才算 done
# 或单独跑：
python -m pytest -q
```

- `preprocess_data.py` 的纯函数（金额/日期/比例解析）有 pytest 覆盖，见 `tests/`。
- 改了 `preprocess_data.py` 的计算逻辑，**先补/改测试再改实现**。
- 改了前端，至少手动启动一次（`python server.py` + `cd frontend && npm run dev`）确认相关页面能加载、无 console 报错；改口径/数据层时用真实数据冒烟核对关键指标（如回款达成率落在合理区间）。

## 7. 设计底层规范（展示形式）

约束**展示形式**(配色/排版/间距/卡片/圆角/阴影/动效/密度)，不规定展示内容。令牌落地于 `frontend/src/styles/theme.css`(CSS 唯一落地)与 `frontend/src/charts/echartsTheme.ts`(canvas 同源桥接)；页面只准引用令牌，**不准手写散值**。品牌蓝色系为基调，light/dark 两套；状态语义色固定（已回款 `--ok` / 待回款 `--warn` / 风险延期 `--danger` / 可提前 `--c-advance`）。间距只取 `--sp-*`(8pt grid)，字号六级 `--fs-1..6`，圆角 `--r-*`，阴影最多两层。金额/百分比/表格数字列挂 `.u-num`(tabular-nums)。前端**禁止外链字体**。
