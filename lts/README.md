# 项目管理平台（ LTS-1.0.0）

单机/内网离线运行的项目管理与回款（收款）跟踪看板。聚焦项目主域管理与回款分析两条主线。

## 功能清单

**项目域**
- 项目总览首页：KPI 总览 / 健康度分布 / 回款达成环 / 异常计分板 / 动态流，支持超管配置首页门户快捷入口（跳转链接 / 文件下载）
- 在建项目：多条件筛选 + 全列搜索，行点击下钻项目详情
- 已关闭项目：独立清单 + 详情
- 项目详情：回款 / 进度里程碑 / 风险 / 预算核算 / 原项目多 Tab + 动态时间线
- 项目动态：数据快照 diff 事件流 + 周期对比（上次同步 / 上周 / 上月）

**项目分析**（`/insight` 及子页）
- 多维分析：多维度 × 多指标排名 / 交叉 / 透视，支持下钻
- 里程碑管理：状态 KPI + 到期提醒 / 终验完成 / 部门合规率 / 节点分布下钻 + 延期清单等明细表
- 成本分析：预算超支预警、超支分布、部门汇总、项目成本明细
- 风险看板：全列风险指标展示 + 下钻
- 回款多维分析：多维看板（排名 / 交叉 / 透视），支持下钻
- 回款日历：双月视图 / 年度热力图 / 到期提醒

**回款域**（`/payment` 及子页）
- 回款总览：核心指标 / 档位进度 / 服务组排名 / 月度趋势
- 回款项目 / 回款节点：分维明细看板

**平台与治理**
- 数据治理：全数据源健康检查（结论横幅 / 源状态卡 / 分级告警与导出）
- 账号管理：超管创建/管理账号，按部门（L4）与页面维度授权
- 数据管理（`/data`）：上传 PMIS 九表与 CSV、点击「更新数据」重新生成分析数据、项目标签维护、首页门户配置、数据历史/人工数据导入回滚等维护功能
- 关于：版本信息与功能说明

## 技术栈

- **后端**：纯 Python 标准库 HTTP 服务（`server.py`），监听 `:8080`，无第三方 Web 框架依赖；`pydantic` 做数据契约校验，`openpyxl` 读写 xlsx（仅「更新数据」流程需要）
- **前端**：Vue 3 + Vite + TypeScript + Pinia + Element Plus + ECharts

## 数据流

```
PMIS 九表(input/pmis/*.xlsx)
组织架构.xlsx / A.xlsx(售前项目映射) / TOP1000.xlsx
收款阶段/回款流水/预算等 CSV(input/*.csv)
                    │
                    ├─ preprocess_data.py（各域解析 + 计算 + 快照 diff）
                    ▼
      data/analysis_data.json（前端唯一数据源，经 schema 校验）
                    │  fetch('/data/analysis_data.json')
                    ▼
frontend/（Vue3 + Vite + TS，router / views / components / lib / stores / charts）
                    ▲
      server.py（本地 HTTP：静态 + /data + /api/*）
```

数据源通过页面「数据管理」上传或本地放置到 `input/`（PMIS 九表放 `input/pmis/`），点击「更新数据」触发 `/api/reprocess` 重新处理生效。

## 快速开始

```bash
# 1. 安装后端依赖（Python 3.8+）
pip install -r requirements.txt

# 2. 安装并构建前端（Node 18+）
cd frontend
npm install
npm run build
cd ..

# 3. 启动服务（自动打开浏览器，监听 8080）
python server.py

# 停止服务
python server.py --stop
```

首次启动会自动建立种子账号（见 `auth.py`），登录后进入首页。

## 数据更新方式

1. 登录后进入「数据管理」（`/data`）页面
2. 上传 PMIS 九表（拖拽或选择文件，写入 `input/pmis/`）与各项 CSV / 组织架构 / 项目映射等文件（写入 `input/`）
3. 点击「更新数据」，后端以 SSE 流式返回处理进度，完成后前端自动刷新

也可以直接把文件放到 `input/` 与 `input/pmis/` 目录下，再在页面点击「更新数据」。

## 目录结构简述

| 路径 | 说明 |
|---|---|
| `server.py` | 本地 HTTP 服务：静态资源 + `/data` + `/api/*`（更新数据 / 文件上传 / 文件状态 / 清空数据 / 跟进 / 标签 / 门户配置 / 账号管理 / 历史回滚 / 停止服务） |
| `preprocess_data.py` | 核心数据处理管线：摄取各数据源 → 项目主域 / 回款 / 健康度 / 治理指标 → `data/analysis_data.json` |
| `pmis.py` / `projects.py` / `collection_stages.py` / `milestones.py` / `profit.py` | 各数据域解析：PMIS 项目域 / 主域关联 / 收款阶段节点 / 里程碑 / 预算流水 |
| `schema.py` | pydantic 数据契约，导出 JSON Schema 供前端类型生成 |
| `snapshots.py` | 快照 diff，供项目动态页使用 |
| `data_history.py` / `manual_history.py` / `manual_import.py` | 数据历史快照回滚 / 人工数据备份与导入 |
| `auth.py` / `data_scope.py` / `audit.py` | 账号鉴权、按 L4 的数据范围控制、操作审计 |
| `portal.py` | 首页门户快捷入口配置 |
| `frontend/` | Vue3 前端：`router/`（路由）`views/`（页面）`components/`（组件）`lib/`（纯计算口径）`stores/`（Pinia）`charts/`（ECharts 封装） |
| `data/` | 本地持久化数据：`analysis_data.json`、账号、标签、跟进记录、门户配置、历史快照、审计日志 |
| `input/` | 数据源输入（PMIS 九表 + CSV + 组织架构/映射表），经页面上传或本地放置 |
| `reset_super_password.py` | 部署期重置超级管理员口令的助手脚本 |
| `deploy/` | 部署相关文档与配置（本地验证手册、服务器部署手册） |

## 验证

```bash
bash verify.sh
```

包含语法编译检查、ruff 静态检查、pytest 单元测试、前端 typecheck / vitest / build。全绿方可视为改动完成。
