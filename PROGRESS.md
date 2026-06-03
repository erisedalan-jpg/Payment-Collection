# PROGRESS.md — 开发进度与待办

> 本文件是 harness 的**状态层**（State）。跨会话续接的唯一进度来源。
> 规则：开工把要做的项标 `[~] 进行中`；完成改 `[x]` 并写一句结论；新发现的问题加到 Backlog。
> 配套机器可读清单见 `feature_list.json`。

- 当前版本：**V5.9.1**
- 最近更新：2026-06-03
- 维护语言：简体中文

---

## 版本（单一来源约定）

版本号目前散落在多处（`app.js` 版本变量、`index.html` 的 `?v=` 静态资源戳、本文件）。
**约定**：以本文件 + `app.js` 为准；发版时三处一起改。后续应改为构建时统一注入（见 Backlog H-7）。

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

_（无）_

---

## Backlog（按优先级，来源：2026-06-03 代码评审 + harness 评估）

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
- [ ] **H-8** 抽取 `run_sync`/`run_import` 重复的"双模式 + 进度解析"为公共函数。 (部分由 A3 完成：解析逻辑已提取复用)
- [x] **A3** server.py API 契约与进度健壮性：统一错误响应 {success,code,message} 收口各 handler；进度解析提取为可测 classify_progress_line（run_sync/run_import 三处循环复用，含 ok/info 合并贴近原逻辑，H-8 部分达成）；跟进云写入串行锁 _write_followup_lock（防 WPS 并发覆盖）。
- [ ] **A4** Playwright 脚本健壮性（需浏览器/云文档手验）：fetch_yundocs_full.py 抓取分块超时/重试；write_followup.py 把手工引号/换行转义改为 json.dumps；脚本输出改 JSON 行协议（与 classify_progress_line 对接）。

### 🟡 中（前端架构，较大重构，需在测试保护下分步做）
- [ ] **M-9** `app.js` 按页面拆分 ES Modules，事件委托替代内联 `onclick`。
- [ ] **M-10** `data/analysis_data.js` 改为 `.json` + `fetch()` 加载。
- [ ] **M-11** 统一 innerHTML 渲染处的转义（140 处），降低 XSS 与重排。
- [ ] **M-12** `app.js` 清理 24% 空行（Prettier 一遍）。

### 🟢 低
- [ ] **L-13** 收紧 CORS（去掉 `Access-Control-Allow-Origin: *`）。
- [ ] **L-14** `index.html:143` 硬编码内网地址改为配置项/留空。
- [ ] **L-15** 跨平台一致性：macOS 下 taskkill/netstat/快捷方式逻辑失效，明确提示或补实现。

### 🧰 Harness 自身（持续完善）
- [x] **HX-1** 建立 `CLAUDE.md`（指令层；以其为唯一代理入口，不设 AGENTS.md）
- [x] **HX-2** 建立 `PROGRESS.md` + `feature_list.json`（状态层）
- [x] **HX-3** `preprocess_data.py` 纯函数 pytest + `verify.sh`（验证层）
- [x] **HX-4** `init.sh`/`init.bat` 固化环境搭建（venv + 依赖 + playwright + 浏览器检测）
- [x] **HX-7** 基础设施：`git init` + `.gitignore` + `requirements.txt`/`requirements-dev.txt` + `ruff.toml`（ruff 接入 verify.sh，渐进式规则）
- [ ] **HX-5** 扩展验证：Playwright 端到端冒烟（页面可加载、看板有数）
- [ ] **HX-6** 为 `preprocess_data.py` 的计算函数（compute_dashboard 等）补集成测试（需小样本 fixture）。注：compute_* 已接收数据参数=可测，仅 `process_followup_records()` 需先解耦 I/O (部分由 A1 完成：compute_node_status 已单测；计算层 compute_dashboard/tier 集成测试起步)
- [ ] **HX-8** ruff 渐进式扩规则：存量整改后逐步打开 F401→E→I
- [x] **A1** 数据契约与配置地基：config.py + schema.py（pydantic 契约/校验/JSON Schema 导出）+ assign_tier/compute_node_status 纯函数 + 管道集成测试 + preprocess 输出校验后的 analysis_data.json

> 验证基线：`bash verify.sh` 三步全绿（py_compile + ruff + 75 项 pytest）。

---

## 会话交接备注（Handoff）

- 测试只覆盖了 `preprocess_data.py` 的**纯函数**（解析层）；计算/聚合函数尚无测试（HX-6）。
- 改 `server.py`/脚本前务必读 `CLAUDE.md` 第 5 节"打包 vs 开发双模式"。
