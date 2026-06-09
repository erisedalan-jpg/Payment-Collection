# U1 — 前端统一(后端服务 Vue dist + 删除旧版 UI)设计(Design)

> 设计文档(harness: Design)。2026-06-09。目标:消除"两套前端 + 两份数据文件"并存,统一到 **Vue 应用 + Python API/数据后端** 一套架构,并修复数据治理页加载为空。

## 背景与目标

当前并存两套前端:旧版原生 UI(根目录 `index.html`/`app.js`/`style.css` + `lib/`,读 `data/analysis_data.js`)与新版 Vue 应用(`frontend/`,读 `data/analysis_data.json`)。`server.py`(`:8080`)默认服务旧版根目录,新版只能靠 `npm run dev`(`:5174`,代理 `/api`、`/data` 到后端)。后果:新功能(数据治理 / PMIS)只在 Vue 应用里有;数据治理页因 `analysis_data.json` 旧缓存而显示为空。

**目标架构:一个 Web 应用 = Python 后端(`server.py`)服务 Vue 构建产物(`frontend/dist`)+ `/api/*` + `/data/*`。** 旧版 UI 全部删除。开发态仍用 `npm run dev`(:5174)代理到后端;分发态由打包内置的 dist 提供。

## 范围

做:
1. `server.py` 服务 `frontend/dist` 作为唯一 Web 根 + Vue Router history 模式的 SPA 回退。
2. 删除旧版 UI 文件,清理后端对 `analysis_data.js` 的残留引用。
3. 修复数据治理页加载:数据仓库 `load()` 防缓存 + 空态文案诊断化。
4. 打包(`PaymentReviewApp.spec`)改为内置 dist、移除旧 UI、补齐新增 .py 模块。

不做(留待 U2):数据管理页重构、三处质量面(数据管理「数据质量总览」/ `/governance` /「数据质检」tab)整合。不改回款业务逻辑。

## 改动设计

### 1. 后端服务 dist + SPA 回退(`server.py`)

- 新增 Web 根常量(与现有 `STATIC_DIR`/`BASE_DIR` 并列):
  - 打包态:`WEB_ROOT = os.path.join(sys._MEIPASS, 'dist')`
  - 开发态:`WEB_ROOT = os.path.join(BASE_DIR, 'frontend', 'dist')`
- `CustomHandler.__init__` 的 `directory=` 改为 `WEB_ROOT`;`translate_path` 保留"先 WEB_ROOT、找不到再回退 BASE_DIR"逻辑(使 `/data/*`、`/yundocs_data/*` 仍从 BASE_DIR 取运行时数据)。
- **SPA 回退**:`do_GET` 中,当路径不属于 `/api/*`、不是真实存在的静态文件、且不在 `/data` `/yundocs_data` 下时,返回 `WEB_ROOT/index.html`(HTTP 200)。这样刷新 `/governance`、`/board` 等 Vue 路由不再 404。`/api/*` 路由分支保持在最前,优先级最高。
- **dist 缺失降级**:若 `WEB_ROOT/index.html` 不存在(未构建),根路径返回一段明确提示页("前端尚未构建,请运行 `cd frontend && npm run build`"),而非空白/404。
- frozen/dev 两条路径都要正确(`WEB_ROOT` 已分别定义)。

### 2. 清理旧版引用(`server.py`)

- `_get_node_action_date(project_id)`(约 160-181 行):不再正则扫 `analysis_data.js`,改为读 `data/analysis_data.json`,`json.load` 后在 `rawNodes` 中按 `projectId` 找首个有值的 `nextActionDate` 返回;文件缺失/异常返回 `''`。
- `handle_clear_data`(约 404-431 行):删除目标由 `data/analysis_data.js` 改为 `data/analysis_data.json`;若旧 `analysis_data.js` 仍存在,一并删除(清理遗留)。

### 3. 删除旧版 UI 文件

删除:根目录 `index.html`、`app.js`、`style.css`;`lib/echarts.min.js`、`lib/xlsx.full.min.js`(及空的 `lib/` 目录)。
- `fonts/` 暂不删:需先确认 Vue dist 是否引用;实现时若确认旧版专用再删,否则保留(本期不冒险)。
- 遗留运行时文件 `data/analysis_data.js` 由 `handle_clear_data` 兜底清理(本就 gitignore,不在删除清单)。

### 4. 修复数据治理页加载(`frontend/`)

- `stores/data.ts` 的 `load()`:`fetch('/data/analysis_data.json')` → `fetch('/data/analysis_data.json?t=' + Date.now())`,与 `reload()` 一致,杜绝浏览器缓存旧数据(当前治理页为空的直接原因)。
- `views/DataQualityView.vue` 空态分三种,文案各异(消除"数据没加载到"被误报成"未提供 PMIS"):
  - `data.data` 为空(加载中/失败)→ "数据加载中或加载失败,请确认后端服务在运行";
  - `data.data` 有、但无 `dataQuality`(旧数据)→ "当前数据不含治理信息,请重新同步/导入";
  - 有 `dataQuality` 但 `pmisProvided=false` → 原"未提供 PMIS"引导。

### 5. 打包(`PaymentReviewApp.spec`)

- `datas`:移除 `('index.html','.')`、`('style.css','.')`、`('app.js','.')`、`('lib','lib')`;新增 `('frontend/dist','dist')`。
- 确保动态执行的预处理链所需 .py 模块被打包:`preprocess_data.py`(已在)、新增 `pmis.py`、`pmis_download.py`,以及 `config.py`、`schema.py`(预处理在 frozen 下经 importlib 执行,需源文件随包)。按现有约定加入 `datas` 或 `hiddenimports`。
- 图标/字体/后端脚本/启停脚本/文档保持。
- 说明:frozen 完整验证需实际 `pyinstaller` 构建,本期只保证 spec 文件 `py_compile`/语法正确与 datas 路径存在;exe 实测留作分发前人工步骤。

## 数据流(目标)

```
开发态: 浏览器:5174 ──(vite proxy /api,/data)──> server.py:8080 ──> /api/* + data/analysis_data.json
        Vue 由 vite dev 提供
分发态: 浏览器:8080 ──> server.py ──┬─ 静态: frontend/dist(或 _MEIPASS/dist),未命中文件回退 dist/index.html
                                   ├─ /data/*: BASE_DIR/data(analysis_data.json)
                                   └─ /api/*: 同步/导入/PMIS/跟进
```

## 测试与验证

- `bash verify.sh` 全绿(py_compile + ruff + pytest + 前端 typecheck/vitest/build)。
- 前端单测:`stores/data.ts` `load()` 带防缓存(断言 fetch URL 含 `?t=`);`DataQualityView` 三种空态各一断言。
- 后端:`python -m py_compile server.py`;`_get_node_action_date` 若可抽纯函数则补 pytest(给定 JSON 找 nextActionDate)。
- 手动冒烟(分发态路径):`cd frontend && npm run build` → `python server.py` → 打开 `:8080`:首页为 Vue 应用;直接访问 `/governance` 刷新不 404 且显示数据(PMIS 已放置时);`/data/analysis_data.json` 正常;同步/导入/PMIS 按钮可用。
- 开发态回归:`npm run dev`(:5174)+ `python server.py`,治理页硬刷新后有数据。

## 完成定义

- 打开后端服务的单一地址即新 Vue 界面;Vue 路由深链可刷新;数据治理页能显示数据(防缓存生效)。
- 旧版 UI 文件与后端旧引用清零;`verify.sh` 全绿;`PROGRESS.md` 更新;版本号递增。

## 约定遵守

- 只保留/沿用新架构(Vue + Python API);不再维护旧版 UI。
- frozen/dev 两条路径同时维护。
- 不使用 emoji(符号用 `→ ↓ ❌ ✕ ▾`)。
- 禁止 `git add -A`/`git add .`;`input/`、`data/`、`frontend/dist/` 不提交。
- 样式以 token/补 CSS 完善,不引框架。

## 后续(U1 之外)

- **U2**:数据管理页重构 + 三处质量面整合(独立 brainstorm)。
