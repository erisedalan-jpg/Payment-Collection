# 概算工具 /budget 实施计划（V3.1.0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把独立单体 HTML 工具 `CostBudgetEstimate.html` 完全重构后并入平台，落成 `/budget` 概算工具页：服务端存档（按账号隔离）、费率超管可配、费率快照保证报价可复现、修正 8 处缺陷、导出 8-sheet Excel。

**Architecture:** 后端两个纯标准库模块（`budget_config.py` 配置、`budget_store.py` 存档）+ `server.py` 五个端点；**不进数据管线**（不产出 `analysis_data.json`，升级后无需点「更新数据」）。计算全部在前端纯函数层 `lib/budget/*`（有 vitest 覆盖），后端只负责存取与鉴权。

**Tech Stack:** Python 3.8+ 标准库（**禁用 pandas**）；Vue3 + Vite + TS + Pinia + Element Plus 2.9 + 既有 `xlsx`(SheetJS)。

**设计文档：** `docs/superpowers/specs/2026-07-13-budget-estimate-tool-design.md`（本计划的所有口径以它为准）

**原工具源文件：** `CostBudgetEstimate.html`（**只读取，不修改，不进产物**）。长文本默认数据从其中原样抄录，行号在任务里给出。

---

## Global Constraints

以下约束绑定**每一个**任务，不再逐任务重复：

- **交流与注释语言：简体中文。** 代码标识符、命令、文件名保持英文。
- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- **后端禁用 pandas / 任何新第三方依赖**。只用 Python 标准库（`json` / `os` / `threading` / `re` / `datetime`）。前端不新增依赖（`xlsx` 已在用，**禁止引入 exceljs / file-saver**）。
- **前端禁止手写样式散值**：颜色/间距/圆角/字号/阴影一律用 `frontend/src/styles/theme.css` 的设计令牌（`--sp-1..7`、`--fs-1..6`、`--r-sm/md/lg`、`--shadow-1/2`、`--card-pad`、`--gap-card`、`--gap-stack`、`--gap-section`、`--ok/--warn/--danger` 及其 `-bg`/`-text` 变体）。
- **`.app-main` 自身无内边距** —— 每个页面**自己**给 `padding: var(--sp-4)`（见 `.projects-view`）。忘了写就会全线贴边。
- **状态三态用「淡底+深字」**：`--ok-bg`+`--ok-text` / `--warn-bg`+`--warn-text` / `--danger-bg`+`--danger-text`。禁止实底 + 小号白字。
- **金额/百分比/人天等数字列必须挂 `.u-num`**（tabular-nums）。
- **`_SUPER_ONLY_PATHS` 按 path 匹配、不分 method。** `/api/budget/config` 与 `/api/budget/estimates` 都是同一 path 上 GET(全体) + POST(超管或 owner)，**绝不能加进 `_SUPER_ONLY_PATHS`**，否则普通管理员连读都 403、页面白板。超管/owner 校验一律写在 handler 内。
- **越权保护是服务端强制的，不是前端隐藏。** 普通管理员 POST 配置 → 403；覆盖/删除他人存档 → 403。
- **碰真实 `data/` 路径的 server 测试必须 monkeypatch 隔离。** 跑完用 md5 比对 `data/*.json` 确认零变化（V3.0.0 出过两次「测试删掉真实数据文件」的事故）。
- **破坏性写操作「先算通再落盘」**：先在内存里构造并校验完整记录，全部通过后才原子写（先写 `.tmp` 再 `os.replace`）；任一步失败，磁盘文件原样不动。
- **每个任务结束跑 `bash verify.sh` 全绿**（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）才算完成。单跑：`python -m pytest -q` / `cd frontend && npm run test:run && npm run typecheck`。
- **成本比例的分子必须含税**（`totalCost × (1 + margin)`）—— 这是本次修正原工具的**计算错误**，不是文案问题。任何地方写成未含税总成本都是 bug。
- **物料单价与毛利率解耦**：单价只有一套，毛利率只作为 `(1 + margin)` 的乘数。不存在「按毛利率查单价表」这回事。
- 版本号单一来源 `frontend/src/version.ts`，**只在最后一个任务改**。

---

## 文件结构

**后端（新增 2 个模块 + 改 server.py）**

| 文件 | 职责 |
|---|---|
| `budget_config.py` **(新)** | 费率与目录配置：默认值 / 校验 / 原子读写。`data/budget_config.json` |
| `budget_store.py` **(新)** | 报价存档：CRUD 纯函数 / 权限判定 / 原子读写。`data/budget_estimates.json` |
| `server.py` **(改)** | 5 个端点 + 2 个文件常量 + 2 把锁 + 审计埋点 |
| `tests/test_budget_config.py` **(新)** / `tests/test_budget_store.py` **(新)** / `tests/test_server_budget.py` **(新)** | 测试 |

**前端（新增）**

| 文件 | 职责 |
|---|---|
| `frontend/src/lib/budget/types.ts` | 配置与表单的 TS 类型（本域唯一类型来源；不进 `schema.py`，因为不入 `analysis_data.json`） |
| `frontend/src/lib/budget/calc.ts` | 纯计算：人天汇总 → 人工成本；直接成本；总成本；销售金额；**成本比例与三态** |
| `frontend/src/lib/budget/salesOrder.ts` | 销售下单建议：成本 → 物料数量的逆运算（含差旅并单） |
| `frontend/src/lib/budget/crmText.ts` | CRM 审批建议自动生成 |
| `frontend/src/lib/budget/exportEstimate.ts` | 8-sheet xlsx（复用 `lib/exportXlsx.ts` 的 `exportSheets()`） |
| `frontend/src/lib/budgetApi.ts` | `/api/budget/*` 封装 |
| `frontend/src/stores/budgetConfig.ts` | 费率配置 store |
| `frontend/src/stores/budget.ts` | 表单 state + 脏标记 + 当前存档 id + 生效费率（当前配置 or 快照） |
| `frontend/src/views/BudgetView.vue` | 单页 |
| `frontend/src/components/budget/BasicInfoCard.vue` | 项目基本信息（9 必填字段） |
| `frontend/src/components/budget/RateReferenceCard.vue` | 费率速查（只读，由配置渲染，可折叠） |
| `frontend/src/components/budget/ProductSection.vue` | 产品实施 |
| `frontend/src/components/budget/PmSection.vue` | 项目经理（可折叠） |
| `frontend/src/components/budget/ServiceSection.vue` | 其他服务 |
| `frontend/src/components/budget/DirectCostSection.vue` | 直接成本 |
| `frontend/src/components/budget/RatioCard.vue` | 成本比例 + 异常说明 |
| `frontend/src/components/budget/CrmCard.vue` | CRM 审批建议 + 恢复自动生成 |
| `frontend/src/components/budget/SummaryCard.vue` | 费用汇总 |
| `frontend/src/components/budget/SalesOrderCard.vue` | 销售下单建议表 |
| `frontend/src/components/budget/EstimateDrawer.vue` | 存档抽屉 |
| `frontend/src/components/budget/RateConfigDrawer.vue` | 费率与目录配置抽屉（仅超管） |

**前端（修改）**：`nav.ts`（TOOL_LINKS 插入）、`lib/pageAccess.ts`（PageKey 加 `budget`）、`router/index.ts`（路由）、`version.ts`（最后一个任务）

---

## 任务总览

| # | 任务 | 交付物 |
|---|---|---|
| 1 | `budget_config.py` 费率与目录配置 | 默认配置（19 产品 / 5 阶段 / 8 服务）+ 校验 + 原子读写 |
| 2 | `budget_store.py` 存档 CRUD | upsert / delete / list / 权限判定 + 原子读写 |
| 3 | `server.py` 五个端点 | GET/POST config、GET/POST/delete estimates + 审计 |
| 4 | `lib/budget/types.ts` + `calc.ts` | 全部计算公式（**含税成本比例**、三态、qty===1 分段） |
| 5 | `lib/budget/salesOrder.ts` | 物料逆运算 + 差旅并单（**全 0 不丢弃**） |
| 6 | `lib/budget/crmText.ts` | CRM 建议模板 |
| 7 | `lib/budget/exportEstimate.ts` | 8-sheet 导出（产品实施 sheet 补全列） |
| 8 | `lib/budgetApi.ts` + 两个 store | API 封装 + 配置/表单 store |
| 9 | 路由 / 导航 / 权限接线 + 页面骨架 | `/budget` 可访问、侧栏出现、pageKey 生效 |
| 10 | 表单输入区组件（基本信息 / 费率速查 / 产品 / PM / 服务 / 直接成本） | 能填、能实时算 |
| 11 | 结果区组件（成本比例 / CRM / 费用汇总 / 销售下单） | 结果实时联动 |
| 12 | 存档抽屉 + 保存/另存为/删除/恢复 + 费率快照横幅 | 端到端存档闭环 |
| 13 | 费率配置抽屉（超管） | 费率可改、改完立即生效 |
| 14 | 版本号 + 对拍验证 + PROGRESS | V3.1.0 收口 |

---

## Task 1: `budget_config.py` —— 费率与目录配置

**Files:**
- Create: `budget_config.py`
- Test: `tests/test_budget_config.py`

**Interfaces:**
- Consumes: 无（本任务是最底层）
- Produces:
  - `DEFAULT_CONFIG: dict` —— 完整默认配置（供 server 与测试引用）
  - `default_config() -> dict` —— 返回 `DEFAULT_CONFIG` 的深拷贝
  - `validate_config(cfg: Any) -> dict` —— 校验并归一化；非法抛 `ValueError`
  - `load_config(path: str) -> dict` —— 读；文件缺失/损坏/非法 → 静默回落默认
  - `save_config(path: str, cfg: Any) -> dict` —— 校验后原子写，返回落盘后的配置

> **范式照抄 `yitian_settings.py`**（同目录，先读一遍）：`default_* / validate_* / load_* / save_*` 四函数、`load` 降级不抛、`save` 先写 `.tmp` 再 `os.replace`。

- [ ] **Step 1: 先读原工具的默认数据**

读 `CostBudgetEstimate.html` 的这几段，**原样抄录**（含 `\n` 换行，不要改写、不要缩写长中文段落）：

- 行 1401-1412：`RATES` / `SALES_PRICES` / `HOTEL_RATES`
- 行 1426：`TRAVEL_ALLOWANCE`
- 行 1428-1447：`PRODUCTS` 19 条（`id` / `name` / `coefficient` / `stdDays` / `stdDesc` / `nonstdDesc`）
- 行 1450-1456：`PM_PHASES` 5 条（`name` / `content`）
- 行 1458-1467：`SERVICES` 8 条（`name` / `desc` / `isOther`）—— **丢弃 `defaultVal`**，它在原代码中从未被读取，是死字段
- 行 1334 / 1341 / 1348 / 1355：4 条物料编号 `JY-CPJF-*`

- [ ] **Step 2: 写失败的测试**

创建 `tests/test_budget_config.py`：

```python
import json
import pytest
import budget_config as bc


def test_默认配置的费率与原工具一致():
    cfg = bc.default_config()
    assert cfg["rates"]["city1"] == {"pm": 2000, "tech": 1300, "out": 1000}
    assert cfg["rates"]["city2"] == {"pm": 1500, "tech": 1000, "out": 800}
    assert cfg["salesPrices"] == {"pm": 2400, "pm2ndc": 1800, "eng1stc": 1500, "eng2ndc": 1200}
    assert cfg["hotel"] == {"type1": 450, "capital": 350, "other": 300,
                            "hk": 125, "outType1": 300, "outType2": 230}
    assert cfg["allowance"] == {"dom": 150, "intl": 75}
    assert cfg["fx"] == 6.8
    assert cfg["ratio"] == {"min": 3, "max": 15}
    assert [m["value"] for m in cfg["margins"]] == [0.13, 0.06]


def test_默认目录条目数与关键取值():
    cfg = bc.default_config()
    assert len(cfg["products"]) == 19
    assert len(cfg["pmPhases"]) == 5
    assert len(cfg["services"]) == 8
    assert len(cfg["materials"]) == 4
    # 物料 key 必须与 salesPrices 的键一一对应(销售下单逆运算靠这个对上)
    assert [m["key"] for m in cfg["materials"]] == ["pm", "pm2ndc", "eng1stc", "eng2ndc"]
    assert set(cfg["salesPrices"]) == {m["key"] for m in cfg["materials"]}
    # 抽查:CSMP 的标准人天是 6.375(非整数,最容易被抄错)
    csmp = next(p for p in cfg["products"] if p["id"] == "1.15")
    assert csmp["name"] == "云安全管理平台CSMP"
    assert csmp["coefficient"] == 0.6 and csmp["stdDays"] == 6.375
    # 产品说明是长中文段落,不能是空串
    assert all(p["stdDesc"] and p["nonstdDesc"] for p in cfg["products"])
    # 服务不再有死字段 defaultVal
    assert all("defaultVal" not in s for s in cfg["services"])
    assert cfg["services"][-1]["isOther"] is True


def test_default_config_返回深拷贝_改了不污染下一次():
    a = bc.default_config()
    a["rates"]["city1"]["pm"] = 999
    a["products"].clear()
    b = bc.default_config()
    assert b["rates"]["city1"]["pm"] == 2000
    assert len(b["products"]) == 19


def test_校验_合法配置原样通过():
    cfg = bc.default_config()
    cfg["fx"] = 7.2
    out = bc.validate_config(cfg)
    assert out["fx"] == 7.2


@pytest.mark.parametrize("mutate", [
    lambda c: c.update(fx=0),
    lambda c: c.update(fx=-1),
    lambda c: c.update(fx="六点八"),
    lambda c: c["rates"]["city1"].update(pm=0),
    lambda c: c["rates"]["city2"].update(tech=-5),
    lambda c: c["salesPrices"].update(pm=0),
    lambda c: c["hotel"].update(type1=-1),
    lambda c: c["allowance"].update(dom=-1),
    lambda c: c.update(ratio={"min": 15, "max": 3}),      # 下限 >= 上限
    lambda c: c.update(ratio={"min": -1, "max": 15}),
    lambda c: c.update(margins=[]),
    lambda c: c.update(margins=[{"value": 1.5, "label": "150%"}]),   # 毛利率必须在 [0,1)
    lambda c: c.update(products=[]),
    lambda c: c.update(pmPhases=[]),
    lambda c: c.update(services=[]),
    lambda c: c.update(materials=[]),
])
def test_校验_非法值抛ValueError(mutate):
    cfg = bc.default_config()
    mutate(cfg)
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_salesPrices的键必须与materials的key对齐():
    cfg = bc.default_config()
    cfg["salesPrices"]["多出来的键"] = 100
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_产品id不能重复也不能叫other():
    cfg = bc.default_config()
    cfg["products"][1]["id"] = cfg["products"][0]["id"]
    with pytest.raises(ValueError):
        bc.validate_config(cfg)
    cfg = bc.default_config()
    cfg["products"][0]["id"] = "other"   # other 保留给自定义产品
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_产品必填字段缺失即非法():
    cfg = bc.default_config()
    cfg["products"][0].pop("coefficient")
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_产品系数或标准人天为负即非法():
    cfg = bc.default_config()
    cfg["products"][0]["coefficient"] = -0.1
    with pytest.raises(ValueError):
        bc.validate_config(cfg)


def test_校验_非对象直接非法():
    with pytest.raises(ValueError):
        bc.validate_config([1, 2, 3])


def test_读写往返(tmp_path):
    p = str(tmp_path / "budget_config.json")
    cfg = bc.default_config()
    cfg["fx"] = 7.0
    saved = bc.save_config(p, cfg)
    assert saved["fx"] == 7.0
    assert bc.load_config(p)["fx"] == 7.0
    # 原子写:不留 .tmp 残file
    assert not (tmp_path / "budget_config.json.tmp").exists()


def test_读_文件不存在时回落默认(tmp_path):
    assert bc.load_config(str(tmp_path / "nope.json")) == bc.default_config()


def test_读_文件损坏时回落默认不抛(tmp_path):
    p = tmp_path / "broken.json"
    p.write_text("{ 这不是 json", encoding="utf-8")
    assert bc.load_config(str(p)) == bc.default_config()


def test_读_内容合法json但配置非法时回落默认(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text(json.dumps({"fx": -1}), encoding="utf-8")
    assert bc.load_config(str(p)) == bc.default_config()


def test_保存非法配置抛ValueError且不落盘(tmp_path):
    p = str(tmp_path / "c.json")
    with pytest.raises(ValueError):
        bc.save_config(p, {"fx": -1})
    import os
    assert not os.path.exists(p)
```

- [ ] **Step 3: 跑测试确认失败**

Run: `python -m pytest tests/test_budget_config.py -q`
Expected: FAIL —— `ModuleNotFoundError: No module named 'budget_config'`

- [ ] **Step 4: 实现 `budget_config.py`**

```python
# budget_config.py
"""概算工具:费率与目录配置(超管可配)。纯标准库 + 原子读写,可单测。

为什么要有这个文件:原工具 CostBudgetEstimate.html 把汇率(6.8,还直接写在函数体里)、
人天单价、住宿/差补标准、销售物料单价、成本比例阈值(3%~15%)、19 个产品与 8 项服务的
目录全部硬编码,多处还在 HTML 和 JS 里各写一遍(两份真相源)。价格是会变的,而后继管理员
根本无从得知这些数字从哪来。本模块把它们全部提升为服务端配置,超管在 /budget 页内可见可改,
改完立即生效(前端按配置现算,不必重跑任何管线)。

默认值 = 原工具现值,保证开箱即用时与历史报价口径一致。
"""
from __future__ import annotations

import copy
import json
import os
from typing import Any, Dict, List

CONFIG_VERSION = 1

# —— 防呆上限(挡住误操作/恶意超大 body,不是业务限制) ——
MAX_PRODUCTS = 200
MAX_PM_PHASES = 50
MAX_SERVICES = 100
MAX_NAME_LEN = 100
MAX_DESC_LEN = 4000

# 说明:长中文段落(stdDesc/nonstdDesc/PM content/service desc)从
# CostBudgetEstimate.html 行 1428-1467 原样抄录,含 \n 换行。
_PRODUCTS: List[Dict[str, Any]] = [
    {"id": "1.1", "name": "防火墙", "coefficient": 0.8, "stdDays": 1.5,
     "stdDesc": "……", "nonstdDesc": "……"},
    # …… 其余 18 条,逐条抄全 ……
]

_PM_PHASES: List[Dict[str, Any]] = [
    {"name": "项目启动阶段", "content": "……"},
    # …… 其余 4 条 ……
]

_SERVICES: List[Dict[str, Any]] = [
    {"name": "变更协调服务", "desc": "……"},
    # …… 其余 7 条;最后一条 {"name": "其他服务", "desc": "用户自定义服务项", "isOther": True} ……
]

_MATERIALS: List[Dict[str, str]] = [
    {"key": "pm",      "code": "JY-CPJF-OTHER-PM",
     "name": "其他交付服务 – 一线城市人天服务 - 项目经理"},
    {"key": "pm2ndc",  "code": "JY-CPJF-OTHER-PM-2NDC-PISN",
     "name": "其他交付服务 - 二线城市人天服务 - 项目经理"},
    {"key": "eng1stc", "code": "JY-CPJF-AZ-OTHER-1STC-ENG",
     "name": "其他交付服务 - 一线城市人天服务 - 工程师"},
    {"key": "eng2ndc", "code": "JY-CPJF-AZ-OTHER-2NDC-ENG",
     "name": "其他交付服务 - 二线城市人天服务 - 工程师"},
]

DEFAULT_CONFIG: Dict[str, Any] = {
    "version": CONFIG_VERSION,
    # 人天成本单价(内部成本)。城市分类:一类/二类
    "rates": {
        "city1": {"pm": 2000, "tech": 1300, "out": 1000},
        "city2": {"pm": 1500, "tech": 1000, "out": 800},
    },
    # 销售物料单价(对外报价)。与毛利率**无关** —— 原工具只配了 13% 一档,选 6% 会静默
    # 回退用 13% 的单价;重构后单价就是一套,毛利率只作为 (1 + margin) 的乘数。
    "salesPrices": {"pm": 2400, "pm2ndc": 1800, "eng1stc": 1500, "eng2ndc": 1200},
    "materials": _MATERIALS,
    # 住宿标准。注意:住宿的城市分类(一线/省会/其他/港澳)与人工成本的城市分类(一类/二类)
    # 是两套互不相干的口径,外包差旅又用回一类/二类。这是原工具的既定事实,不要合并。
    "hotel": {"type1": 450, "capital": 350, "other": 300,
              "hk": 125, "outType1": 300, "outType2": 230},
    "allowance": {"dom": 150, "intl": 75},   # 境内 元/天;境外 美金/天
    "fx": 6.8,                                # 美元汇率
    "margins": [
        {"value": 0.13, "label": "13%（含产品）"},
        {"value": 0.06, "label": "6%（纯服务）"},
    ],
    "ratio": {"min": 3, "max": 15},           # 成本比例正常区间(闭区间),单位 %
    "products": _PRODUCTS,
    "pmPhases": _PM_PHASES,
    "services": _SERVICES,
}


def default_config() -> Dict[str, Any]:
    """深拷贝 —— 调用方改了返回值不会污染下一次。"""
    return copy.deepcopy(DEFAULT_CONFIG)


def _pos_number(v: Any, label: str) -> float:
    """必须是 > 0 的数(bool 不算数,Python 里 True 是 int 的子类)。"""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError("%s 必须是数字" % label)
    if v <= 0:
        raise ValueError("%s 必须大于 0" % label)
    return float(v)


def _nonneg_number(v: Any, label: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError("%s 必须是数字" % label)
    if v < 0:
        raise ValueError("%s 不能为负" % label)
    return float(v)


def _text(v: Any, label: str, max_len: int, required: bool = True) -> str:
    if not isinstance(v, str):
        raise ValueError("%s 必须是字符串" % label)
    s = v.strip()
    if required and not s:
        raise ValueError("%s 不能为空" % label)
    if len(s) > max_len:
        raise ValueError("%s 过长(上限 %d)" % (label, max_len))
    return s


def validate_config(cfg: Any) -> Dict[str, Any]:
    """校验并归一化。非法 → ValueError(带可读原因,直接回给前端)。

    归一化:数值统一转 float;字符串 strip;缺失的可选字段补默认。
    """
    if not isinstance(cfg, dict):
        raise ValueError("配置必须是对象")

    out: Dict[str, Any] = {"version": CONFIG_VERSION}

    # 人天成本单价
    rates_in = cfg.get("rates")
    if not isinstance(rates_in, dict):
        raise ValueError("rates 必须是对象")
    rates: Dict[str, Any] = {}
    for city in ("city1", "city2"):
        blk = rates_in.get(city)
        if not isinstance(blk, dict):
            raise ValueError("rates.%s 必须是对象" % city)
        rates[city] = {k: _pos_number(blk.get(k), "%s.%s 人天单价" % (city, k))
                       for k in ("pm", "tech", "out")}
    out["rates"] = rates

    # 销售物料单价 + 物料目录(键必须一一对应,否则销售下单逆运算会对不上)
    materials_in = cfg.get("materials")
    if not isinstance(materials_in, list) or not materials_in:
        raise ValueError("materials 不能为空")
    materials: List[Dict[str, str]] = []
    for m in materials_in:
        if not isinstance(m, dict):
            raise ValueError("materials 条目必须是对象")
        materials.append({
            "key": _text(m.get("key"), "物料 key", MAX_NAME_LEN),
            "code": _text(m.get("code"), "物料编号", MAX_NAME_LEN),
            "name": _text(m.get("name"), "物料名称", MAX_NAME_LEN),
        })
    keys = [m["key"] for m in materials]
    if len(set(keys)) != len(keys):
        raise ValueError("物料 key 不能重复")
    out["materials"] = materials

    sp_in = cfg.get("salesPrices")
    if not isinstance(sp_in, dict):
        raise ValueError("salesPrices 必须是对象")
    if set(sp_in) != set(keys):
        raise ValueError("salesPrices 的键必须与 materials 的 key 一一对应")
    out["salesPrices"] = {k: _pos_number(sp_in.get(k), "%s 销售单价" % k) for k in keys}

    # 住宿 / 差补 / 汇率
    hotel_in = cfg.get("hotel")
    if not isinstance(hotel_in, dict):
        raise ValueError("hotel 必须是对象")
    out["hotel"] = {k: _pos_number(hotel_in.get(k), "%s 住宿标准" % k)
                    for k in ("type1", "capital", "other", "hk", "outType1", "outType2")}

    al_in = cfg.get("allowance")
    if not isinstance(al_in, dict):
        raise ValueError("allowance 必须是对象")
    out["allowance"] = {k: _pos_number(al_in.get(k), "%s 差补标准" % k) for k in ("dom", "intl")}

    out["fx"] = _pos_number(cfg.get("fx"), "汇率")

    # 毛利率档位
    margins_in = cfg.get("margins")
    if not isinstance(margins_in, list) or not margins_in:
        raise ValueError("毛利率档位不能为空")
    margins = []
    for m in margins_in:
        if not isinstance(m, dict):
            raise ValueError("毛利率档位必须是对象")
        v = m.get("value")
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0 or v >= 1:
            raise ValueError("毛利率必须是 [0, 1) 之间的小数")
        margins.append({"value": float(v), "label": _text(m.get("label"), "毛利率标签", MAX_NAME_LEN)})
    out["margins"] = margins

    # 成本比例阈值
    ratio_in = cfg.get("ratio")
    if not isinstance(ratio_in, dict):
        raise ValueError("ratio 必须是对象")
    rmin = _nonneg_number(ratio_in.get("min"), "成本比例区间下限")
    rmax = _nonneg_number(ratio_in.get("max"), "成本比例区间上限")
    if rmin >= rmax:
        raise ValueError("成本比例区间下限必须小于上限")
    out["ratio"] = {"min": rmin, "max": rmax}

    # 产品目录
    products_in = cfg.get("products")
    if not isinstance(products_in, list) or not products_in:
        raise ValueError("产品目录不能为空")
    if len(products_in) > MAX_PRODUCTS:
        raise ValueError("产品目录最多 %d 条" % MAX_PRODUCTS)
    products = []
    for p in products_in:
        if not isinstance(p, dict):
            raise ValueError("产品条目必须是对象")
        products.append({
            "id": _text(p.get("id"), "产品 id", MAX_NAME_LEN),
            "name": _text(p.get("name"), "产品名称", MAX_NAME_LEN),
            "coefficient": _nonneg_number(p.get("coefficient"), "设备系数"),
            "stdDays": _nonneg_number(p.get("stdDays"), "单台标准人天"),
            "stdDesc": _text(p.get("stdDesc"), "标准实施说明", MAX_DESC_LEN, required=False),
            "nonstdDesc": _text(p.get("nonstdDesc"), "非标实施说明", MAX_DESC_LEN, required=False),
        })
    pids = [p["id"] for p in products]
    if len(set(pids)) != len(pids):
        raise ValueError("产品 id 不能重复")
    if "other" in pids:
        raise ValueError("产品 id 不能用 other(该 id 保留给自定义产品)")
    out["products"] = products

    # 项目经理阶段
    phases_in = cfg.get("pmPhases")
    if not isinstance(phases_in, list) or not phases_in:
        raise ValueError("项目经理阶段不能为空")
    if len(phases_in) > MAX_PM_PHASES:
        raise ValueError("项目经理阶段最多 %d 条" % MAX_PM_PHASES)
    out["pmPhases"] = [{
        "name": _text(x.get("name") if isinstance(x, dict) else None, "阶段名称", MAX_NAME_LEN),
        "content": _text(x.get("content") if isinstance(x, dict) else None,
                         "阶段工作内容", MAX_DESC_LEN, required=False),
    } for x in phases_in]

    # 其他服务
    svc_in = cfg.get("services")
    if not isinstance(svc_in, list) or not svc_in:
        raise ValueError("其他服务目录不能为空")
    if len(svc_in) > MAX_SERVICES:
        raise ValueError("其他服务最多 %d 条" % MAX_SERVICES)
    services = []
    for s in svc_in:
        if not isinstance(s, dict):
            raise ValueError("服务条目必须是对象")
        item: Dict[str, Any] = {
            "name": _text(s.get("name"), "服务名称", MAX_NAME_LEN),
            "desc": _text(s.get("desc"), "服务说明", MAX_DESC_LEN, required=False),
        }
        if s.get("isOther"):
            item["isOther"] = True
        services.append(item)
    out["services"] = services

    return out


def load_config(path: str) -> Dict[str, Any]:
    """读配置;文件缺失/损坏/非法 → 静默回落默认(降级不阻断,页面不能因此白板)。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return validate_config(json.load(f))
    except (OSError, ValueError):
        return default_config()


def save_config(path: str, cfg: Any) -> Dict[str, Any]:
    """校验后原子写(先写 .tmp 再 replace,避免并发/崩溃留半截坏文件)。返回落盘后的配置。

    校验不过 → 抛 ValueError,**磁盘文件原样不动**(先算通再落盘)。
    """
    clean = validate_config(cfg)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return clean
```

**注意：** `_PRODUCTS` / `_PM_PHASES` / `_SERVICES` 里的 `"……"` 是占位，**必须**用 Step 1 抄来的真实长文本替换。`test_默认目录条目数与关键取值` 里的 `assert all(p["stdDesc"] and p["nonstdDesc"] ...)` 会挡住空串。

- [ ] **Step 5: 跑测试确认通过**

Run: `python -m pytest tests/test_budget_config.py -q`
Expected: PASS（全部用例绿）

- [ ] **Step 6: ruff 与提交**

```bash
python -m ruff check budget_config.py tests/test_budget_config.py
git add budget_config.py tests/test_budget_config.py
git commit -m "feat(budget): 费率与目录配置模块(默认值=原工具现值,超管可配)"
```

---

## Task 2: `budget_store.py` —— 报价存档 CRUD

**Files:**
- Create: `budget_store.py`
- Test: `tests/test_budget_store.py`

**Interfaces:**
- Consumes: 无（不依赖 `budget_config`）
- Produces:
  - `STORE_VERSION = 1`
  - `new_store() -> dict` → `{"version": 1, "estimates": []}`
  - `load_store(path) -> dict` —— 缺失/损坏 → 空库（降级不抛）
  - `save_store(path, store) -> None` —— 原子写
  - `validate_estimate(rec: Any) -> dict` —— 校验并归一化一条待存记录；非法抛 `ValueError`
  - `meta_of(rec: dict) -> dict` —— 从整条记录抽出列表用的轻量元信息（**不含 `data` / `rateSnapshot`**）
  - `list_meta(store, account, is_super, all_accounts=False) -> list[dict]` —— 按 `updatedAt` 倒序
  - `find_estimate(store, eid) -> dict | None`
  - `can_touch(rec, account, is_super) -> bool` —— owner 或超管
  - `upsert_estimate(store, rec, account, now_iso) -> dict` —— 有 `id` 且存在 → 覆盖（保留原 `account` / `createdAt`）；否则新建
  - `delete_estimate(store, eid) -> bool`

**记录结构：**

```python
{
  "id": "e_1720000000000_ab12",     # 服务端生成
  "account": "zhangsan",            # owner,新建时固定,覆盖时不变
  "quoteName": "某某项目概算",
  "createdAt": "2026-07-13 10:00:00",
  "updatedAt": "2026-07-13 10:30:00",
  "data": {...},                    # 表单输入原样(前端给什么存什么,后端只校验是 dict 且不超限)
  "rateSnapshot": {...},            # 保存那一刻的完整 budget_config(报价可复现的根据)
  "summary": {                      # 列表页要用,避免打开每条记录重算
      "customerName": "...", "salesName": "...",
      "projectAmount": 100.0, "totalCost": 100000.0,
      "salesAmount": 113000.0, "costRatio": 11.3, "ratioStatus": "normal"
  }
}
```

> **为什么要存 `rateSnapshot`：** 费率一旦可配，"去年那份已经上过 CRM 的报价，今天打开还是同一个数"这个保证就没了。每条存档冻结当时的完整费率表，打开旧档用它自己的快照算。

- [ ] **Step 1: 写失败的测试**

创建 `tests/test_budget_store.py`：

```python
import json
import pytest
import budget_store as bs

NOW = "2026-07-13 10:00:00"
LATER = "2026-07-13 11:00:00"


def _rec(name="报价A", **kw):
    r = {
        "quoteName": name,
        "data": {"basic": {"quoteName": name}},
        "rateSnapshot": {"fx": 6.8},
        "summary": {"totalCost": 100000, "salesAmount": 113000,
                    "costRatio": 11.3, "ratioStatus": "normal"},
    }
    r.update(kw)
    return r


def test_新建_服务端补齐id与时间戳与owner():
    store = bs.new_store()
    saved = bs.upsert_estimate(store, _rec(), "zhangsan", NOW)
    assert saved["id"]
    assert saved["account"] == "zhangsan"
    assert saved["createdAt"] == NOW and saved["updatedAt"] == NOW
    assert len(store["estimates"]) == 1


def test_新建_id由服务端生成_前端传的id若不存在则当新建():
    store = bs.new_store()
    saved = bs.upsert_estimate(store, _rec(id="不存在的id"), "zhangsan", NOW)
    assert saved["id"] != "不存在的id"
    assert len(store["estimates"]) == 1


def test_覆盖_同id更新_不新增条目_保留owner与createdAt():
    store = bs.new_store()
    first = bs.upsert_estimate(store, _rec("原名"), "zhangsan", NOW)
    upd = _rec("改名", id=first["id"])
    # 即使是超管来覆盖,owner 仍是原作者
    saved = bs.upsert_estimate(store, upd, "admin", LATER)
    assert len(store["estimates"]) == 1
    assert saved["id"] == first["id"]
    assert saved["quoteName"] == "改名"
    assert saved["account"] == "zhangsan"       # owner 不变
    assert saved["createdAt"] == NOW            # 创建时间不变
    assert saved["updatedAt"] == LATER          # 更新时间变


def test_列表_普通管理员只见自己的():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec("A"), "zhangsan", NOW)
    bs.upsert_estimate(store, _rec("B"), "lisi", NOW)
    mine = bs.list_meta(store, "zhangsan", is_super=False)
    assert [m["quoteName"] for m in mine] == ["A"]


def test_列表_超管默认也只见自己的_带all才见全部():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec("A"), "zhangsan", NOW)
    bs.upsert_estimate(store, _rec("B"), "admin", NOW)
    assert [m["quoteName"] for m in bs.list_meta(store, "admin", is_super=True)] == ["B"]
    allm = bs.list_meta(store, "admin", is_super=True, all_accounts=True)
    assert sorted(m["quoteName"] for m in allm) == ["A", "B"]


def test_列表_all_accounts对普通管理员无效_仍只见自己的():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec("A"), "zhangsan", NOW)
    bs.upsert_estimate(store, _rec("B"), "lisi", NOW)
    got = bs.list_meta(store, "zhangsan", is_super=False, all_accounts=True)
    assert [m["quoteName"] for m in got] == ["A"]


def test_列表_按updatedAt倒序():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec("旧"), "u", NOW)
    bs.upsert_estimate(store, _rec("新"), "u", LATER)
    assert [m["quoteName"] for m in bs.list_meta(store, "u", False)] == ["新", "旧"]


def test_列表元信息不含大字段_data与rateSnapshot不下发():
    store = bs.new_store()
    bs.upsert_estimate(store, _rec(), "u", NOW)
    m = bs.list_meta(store, "u", False)[0]
    assert "data" not in m and "rateSnapshot" not in m
    assert m["customerName"] == "" or "customerName" in m  # summary 展平进 meta
    assert m["totalCost"] == 100000 and m["costRatio"] == 11.3


def test_权限判定_owner或超管可动_他人不可():
    rec = {"account": "zhangsan"}
    assert bs.can_touch(rec, "zhangsan", False) is True
    assert bs.can_touch(rec, "admin", True) is True
    assert bs.can_touch(rec, "lisi", False) is False


def test_删除():
    store = bs.new_store()
    r = bs.upsert_estimate(store, _rec(), "u", NOW)
    assert bs.delete_estimate(store, r["id"]) is True
    assert store["estimates"] == []
    assert bs.delete_estimate(store, r["id"]) is False


def test_校验_缺必填字段抛ValueError():
    for bad in ({}, {"quoteName": ""}, {"quoteName": "x"},
                {"quoteName": "x", "data": "不是对象", "rateSnapshot": {}, "summary": {}},
                {"quoteName": "x", "data": {}, "rateSnapshot": [], "summary": {}}):
        with pytest.raises(ValueError):
            bs.validate_estimate(bad)


def test_校验_报价名过长抛ValueError():
    with pytest.raises(ValueError):
        bs.validate_estimate(_rec("x" * 300))


def test_条目数上限():
    store = bs.new_store()
    store["estimates"] = [{"id": "e%d" % i, "account": "u", "quoteName": "n",
                           "createdAt": NOW, "updatedAt": NOW,
                           "data": {}, "rateSnapshot": {}, "summary": {}}
                          for i in range(bs.MAX_ESTIMATES)]
    with pytest.raises(ValueError):
        bs.upsert_estimate(store, _rec(), "u", NOW)


def test_读写往返(tmp_path):
    p = str(tmp_path / "budget_estimates.json")
    store = bs.new_store()
    bs.upsert_estimate(store, _rec(), "u", NOW)
    bs.save_store(p, store)
    assert len(bs.load_store(p)["estimates"]) == 1
    assert not (tmp_path / "budget_estimates.json.tmp").exists()


def test_读_文件缺失或损坏回落空库(tmp_path):
    assert bs.load_store(str(tmp_path / "nope.json")) == bs.new_store()
    p = tmp_path / "broken.json"
    p.write_text("{ 坏的", encoding="utf-8")
    assert bs.load_store(str(p)) == bs.new_store()


def test_读_脏条目被剔除不炸():
    # 库里混进非 dict 条目(手改坏了/旧版本残留) → 静默剔除,不能让整个页面挂掉
    import tempfile, os
    fd, p = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    with open(p, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "estimates": [1, "x", {"id": "ok", "account": "u",
                   "quoteName": "n", "createdAt": NOW, "updatedAt": NOW,
                   "data": {}, "rateSnapshot": {}, "summary": {}}]}, f)
    try:
        store = bs.load_store(p)
        assert [e["id"] for e in store["estimates"]] == ["ok"]
    finally:
        os.unlink(p)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_budget_store.py -q`
Expected: FAIL —— `ModuleNotFoundError: No module named 'budget_store'`

- [ ] **Step 3: 实现 `budget_store.py`**

```python
# budget_store.py
"""概算工具:报价存档(服务端持久化)。纯标准库 + 原子写,可单测。

为什么要有这个文件:原工具把存档写在浏览器 localStorage —— 单机 HTML 里够用,搬到多人
服务器上就意味着换台电脑看不到、清缓存全丢、同事之间无法共享、无法审计。本模块把存档
落到服务端,按账号隔离(普通管理员只见自己的;超管可看全部)。

每条记录冻结当时的完整费率快照(rateSnapshot):费率可配之后,"同一份报价什么时候打开都是
同一个数"不再是白捡的保证 —— 报价是对外正式产物(要拿去 CRM 上单),必须可复现。
"""
from __future__ import annotations

import json
import os
import secrets
from typing import Any, Dict, List, Optional

STORE_VERSION = 1

MAX_ESTIMATES = 2000          # 防呆上限:一份报价一条,2000 条远超实际用量
MAX_QUOTE_NAME_LEN = 200

_REQUIRED_KEYS = ("id", "account", "quoteName", "createdAt", "updatedAt",
                  "data", "rateSnapshot", "summary")


def new_store() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "estimates": []}


def _is_clean_record(e: Any) -> bool:
    return isinstance(e, dict) and all(k in e for k in _REQUIRED_KEYS)


def load_store(path: str) -> Dict[str, Any]:
    """读存档库;文件缺失/损坏 → 空库(降级不阻断)。脏条目静默剔除。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError):
        return new_store()
    if not isinstance(raw, dict):
        return new_store()
    items = raw.get("estimates")
    if not isinstance(items, list):
        return new_store()
    return {"version": STORE_VERSION,
            "estimates": [e for e in items if _is_clean_record(e)]}


def save_store(path: str, store: Dict[str, Any]) -> None:
    """原子写:先写 .tmp 再 os.replace,避免并发/崩溃留半截坏文件。"""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def validate_estimate(rec: Any) -> Dict[str, Any]:
    """校验一条待存记录(前端提交的)。非法 → ValueError。

    data / rateSnapshot / summary 的**内部结构不做深校验** —— 它们是前端表单与配置的
    原样快照,后端做深校验等于把口径复制一份到后端,两边必然漂移。这里只保证类型正确、
    体量可控;真正的口径由前端纯函数层(有 vitest)负责。
    """
    if not isinstance(rec, dict):
        raise ValueError("记录必须是对象")

    name = rec.get("quoteName")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("报价名称不能为空")
    if len(name) > MAX_QUOTE_NAME_LEN:
        raise ValueError("报价名称过长(上限 %d)" % MAX_QUOTE_NAME_LEN)

    for key, label in (("data", "表单数据"),
                       ("rateSnapshot", "费率快照"),
                       ("summary", "计算摘要")):
        if not isinstance(rec.get(key), dict):
            raise ValueError("%s 必须是对象" % label)

    return {
        "id": str(rec.get("id") or "").strip(),   # 空 → 新建;非空但不存在 → 也当新建
        "quoteName": name.strip(),
        "data": rec["data"],
        "rateSnapshot": rec["rateSnapshot"],
        "summary": rec["summary"],
    }


def _new_id() -> str:
    return "e_" + secrets.token_hex(8)


def find_estimate(store: Dict[str, Any], eid: str) -> Optional[Dict[str, Any]]:
    return next((e for e in store.get("estimates", []) if e.get("id") == eid), None)


def can_touch(rec: Dict[str, Any], account: str, is_super: bool) -> bool:
    """owner 或超管才能覆盖/删除/读取整条记录。"""
    return bool(is_super) or rec.get("account") == account


def upsert_estimate(store: Dict[str, Any], rec: Any,
                    account: str, now_iso: str) -> Dict[str, Any]:
    """有 id 且库中存在 → 覆盖(**owner 与 createdAt 保持不变**);否则新建。

    调用方(server)负责在覆盖前用 can_touch 判权 —— 本函数不判权,只管数据。
    """
    clean = validate_estimate(rec)
    eid = clean.pop("id")
    existing = find_estimate(store, eid) if eid else None

    if existing is not None:
        existing.update(clean)
        existing["updatedAt"] = now_iso        # owner/createdAt 刻意不动
        return existing

    if len(store.get("estimates", [])) >= MAX_ESTIMATES:
        raise ValueError("存档数量已达上限 %d,请先删除一些旧报价" % MAX_ESTIMATES)

    row = dict(clean)
    row["id"] = _new_id()
    row["account"] = account
    row["createdAt"] = now_iso
    row["updatedAt"] = now_iso
    store.setdefault("estimates", []).append(row)
    return row


def delete_estimate(store: Dict[str, Any], eid: str) -> bool:
    items = store.get("estimates", [])
    for i, e in enumerate(items):
        if e.get("id") == eid:
            items.pop(i)
            return True
    return False


def meta_of(rec: Dict[str, Any]) -> Dict[str, Any]:
    """列表用的轻量元信息:**不含 data / rateSnapshot**。

    rateSnapshot 是整份配置(含 19 个产品的长说明),一条就十几 KB;列表若把它一起下发,
    几十条就是几 MB。列表只给摘要,打开某一条时再单独取整条。
    """
    s = rec.get("summary") or {}
    return {
        "id": rec.get("id"),
        "account": rec.get("account"),
        "quoteName": rec.get("quoteName"),
        "createdAt": rec.get("createdAt"),
        "updatedAt": rec.get("updatedAt"),
        "customerName": s.get("customerName", ""),
        "salesName": s.get("salesName", ""),
        "projectAmount": s.get("projectAmount"),
        "totalCost": s.get("totalCost"),
        "salesAmount": s.get("salesAmount"),
        "costRatio": s.get("costRatio"),
        "ratioStatus": s.get("ratioStatus"),
    }


def list_meta(store: Dict[str, Any], account: str, is_super: bool,
              all_accounts: bool = False) -> List[Dict[str, Any]]:
    """按 updatedAt 倒序。all_accounts 只对超管生效 —— 普通管理员传 True 也只拿自己的
    (前端传什么都不能突破后端的隔离)。"""
    items = store.get("estimates", [])
    if not (is_super and all_accounts):
        items = [e for e in items if e.get("account") == account]
    rows = [meta_of(e) for e in items]
    rows.sort(key=lambda r: r.get("updatedAt") or "", reverse=True)
    return rows
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_budget_store.py -q`
Expected: PASS

- [ ] **Step 5: ruff 与提交**

```bash
python -m ruff check budget_store.py tests/test_budget_store.py
git add budget_store.py tests/test_budget_store.py
git commit -m "feat(budget): 报价存档模块(按账号隔离 + 费率快照 + 原子写)"
```

---

## Task 3: `server.py` —— 五个端点

**Files:**
- Modify: `server.py`（常量区 ~307 行附近、GET 分发 ~905 行、POST 分发 ~1010 行、handler 区 ~2472 行之后）
- Test: `tests/test_server_budget.py`

**Interfaces:**
- Consumes: Task 1 的 `budget_config.{load_config,save_config,default_config}`；Task 2 的 `budget_store.{load_store,save_store,upsert_estimate,delete_estimate,find_estimate,list_meta,can_touch}`
- Produces（前端 Task 8 消费）：

| 方法 路径 | 鉴权 | 响应 |
|---|---|---|
| `GET /api/budget/config` | 登录 + `budget` 页面权限 | `{success:true, config:{...}}` |
| `POST /api/budget/config` | **仅超管** | `{success:true, config:{...}}` |
| `GET /api/budget/estimates` | 登录 + `budget` | `{success:true, items:[meta...]}`；`?all=1` 且超管 → 全部账号 |
| `GET /api/budget/estimates?id=<id>` | 登录 + `budget` + owner/超管 | `{success:true, record:{...}}` |
| `POST /api/budget/estimates` | 登录 + `budget`；覆盖时 owner/超管 | `{success:true, record:{...}}` |
| `POST /api/budget/estimates/delete` | 登录 + `budget`；owner/超管 | `{success:true}` |

> ⚠ **三条路径一条都不许进 `_SUPER_ONLY_PATHS`。** 那个 frozenset 按 path 匹配、不分 method；`/api/budget/config` 上 GET 是全体、POST 才是超管，一旦入闸普通管理员连读配置都 403、`/budget` 直接白板。超管校验用 handler 内的 `self._require_super()`。（V2.10.0 与 V3.0.0 各踩过一次）

- [ ] **Step 1: 先读现有范式**

读 `server.py` 这几处，照抄写法，不要另起炉灶：
- 常量与锁：307-316 行（`YITIAN_SETTINGS_FILE` / `_yitian_settings_lock` / `_YITIAN_PAGE_KEYS`）
- GET / POST 分发链：905-925 行 / 1005-1025 行的 `elif parsed.path == ...` 链
- 配置读写 handler 范式：`handle_yitian_settings_get` / `handle_yitian_settings_save`（2440-2472 行）
- 登录 + owner 判权范式：`handle_opportunities_update`（2026-2060 行）
- 辅助：`self._require_super()`(2589) / `self._read_json_body()` / `self._send_json(status, payload)` / `self._audit_set(target=, detail=)` / `_error_payload(CODE, msg)`；错误码 `ERR_AUTH` / `ERR_FORBIDDEN` / `ERR_VALIDATION` / `ERR_NOT_FOUND`

- [ ] **Step 2: 写失败的测试**

创建 `tests/test_server_budget.py`。**必须 monkeypatch 隔离** —— V3.0.0 出过两次「测试删掉真实 `data/*.json`」的事故。

**先打开 `tests/test_server_yitian.py`**，看它怎么起服务、怎么带登录 cookie、怎么断言状态码，然后**照抄那一套**到本文件（下面的用例按那套夹具的形态写；夹具名以该文件实际为准，不要改动 `tests/conftest.py` 的既有内容）。

```python
"""概算工具端点测试。

⚠ 所有用例把 server 的两个文件常量 monkeypatch 到 tmp_path,绝不允许碰真实
data/budget_config.json 与 data/budget_estimates.json。跑完 git status data/ 必须为空。
"""
import os
import pytest

import server
import budget_config
import budget_store


@pytest.fixture
def files(tmp_path, monkeypatch):
    cfg = str(tmp_path / "budget_config.json")
    est = str(tmp_path / "budget_estimates.json")
    monkeypatch.setattr(server, "BUDGET_CONFIG_FILE", cfg, raising=True)
    monkeypatch.setattr(server, "BUDGET_ESTIMATES_FILE", est, raising=True)
    return {"config": cfg, "estimates": est}


def _payload(name="报价A"):
    return {"quoteName": name,
            "data": {"basic": {"quoteName": name}},
            "rateSnapshot": budget_config.default_config(),
            "summary": {"customerName": "某客户", "salesName": "张三",
                        "projectAmount": 100.0, "totalCost": 100000.0,
                        "salesAmount": 113000.0, "costRatio": 11.3,
                        "ratioStatus": "normal"}}


# —— 配置端点 ——

def test_config_get_未登录401(client, files):
    assert client.get("/api/budget/config").status == 401


def test_config_get_登录但无budget权限403(client, files, login_normal):
    login_normal(pages=["projects"])
    assert client.get("/api/budget/config").status == 403


def test_config_get_有budget权限_返回默认配置(client, files, login_normal):
    login_normal(pages=["budget"])
    r = client.get("/api/budget/config")
    assert r.status == 200
    cfg = r.json()["config"]
    assert cfg["fx"] == 6.8
    assert len(cfg["products"]) == 19


def test_config_post_普通管理员403_且不落盘(client, files, login_normal):
    login_normal(pages=["budget"])
    body = budget_config.default_config()
    body["fx"] = 9.9
    assert client.post("/api/budget/config", body).status == 403
    assert not os.path.exists(files["config"])       # 越权请求不得留下任何痕迹


def test_config_post_超管可改_改完立即生效(client, files, login_super):
    login_super()
    body = budget_config.default_config()
    body["fx"] = 7.1
    r = client.post("/api/budget/config", body)
    assert r.status == 200 and r.json()["config"]["fx"] == 7.1
    assert client.get("/api/budget/config").json()["config"]["fx"] == 7.1


def test_config_post_非法值400_且磁盘原样不动(client, files, login_super):
    login_super()
    ok = budget_config.default_config()
    ok["fx"] = 7.1
    client.post("/api/budget/config", ok)
    bad = budget_config.default_config()
    bad["fx"] = -1
    assert client.post("/api/budget/config", bad).status == 400
    # 先算通再落盘:非法请求不能把已有配置写坏
    assert budget_config.load_config(files["config"])["fx"] == 7.1


# —— 存档端点 ——

def test_estimates_新建与列表(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    r = client.post("/api/budget/estimates", _payload())
    assert r.status == 200
    rid = r.json()["record"]["id"]
    items = client.get("/api/budget/estimates").json()["items"]
    assert [i["id"] for i in items] == [rid]
    # 列表不下发大字段(rateSnapshot 一条就十几 KB)
    assert "rateSnapshot" not in items[0] and "data" not in items[0]
    assert items[0]["costRatio"] == 11.3


def test_estimates_取整条带rateSnapshot(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload()).json()["record"]["id"]
    rec = client.get("/api/budget/estimates?id=%s" % rid).json()["record"]
    assert rec["rateSnapshot"]["fx"] == 6.8          # 快照随记录一起回来
    assert rec["data"]["basic"]["quoteName"] == "报价A"


def test_estimates_覆盖不新增条目(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload("原名")).json()["record"]["id"]
    body = _payload("改名")
    body["id"] = rid
    r = client.post("/api/budget/estimates", body)
    assert r.status == 200 and r.json()["record"]["id"] == rid
    assert len(client.get("/api/budget/estimates").json()["items"]) == 1


def test_estimates_普通管理员只见自己的(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    client.post("/api/budget/estimates", _payload("张三的"))
    login_normal(pages=["budget"], account="lisi")
    client.post("/api/budget/estimates", _payload("李四的"))
    items = client.get("/api/budget/estimates").json()["items"]
    assert [i["quoteName"] for i in items] == ["李四的"]


def test_estimates_超管带all可见全部_普通带all仍只见自己(client, files, login_normal, login_super):
    login_normal(pages=["budget"], account="zhangsan")
    client.post("/api/budget/estimates", _payload("张三的"))
    # 普通管理员传 all=1 也突破不了隔离(前端传什么都不能改变后端的切分)
    got = client.get("/api/budget/estimates?all=1").json()["items"]
    assert [i["quoteName"] for i in got] == ["张三的"]
    login_super()
    client.post("/api/budget/estimates", _payload("超管的"))
    mine = client.get("/api/budget/estimates").json()["items"]
    assert [i["quoteName"] for i in mine] == ["超管的"]      # 超管默认也只看自己的
    allnames = sorted(i["quoteName"] for i in
                      client.get("/api/budget/estimates?all=1").json()["items"])
    assert allnames == ["张三的", "超管的"]


def test_estimates_越权覆盖他人存档403_原记录原样(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload("张三的")).json()["record"]["id"]
    login_normal(pages=["budget"], account="lisi")
    body = _payload("李四篡改")
    body["id"] = rid
    assert client.post("/api/budget/estimates", body).status == 403
    store = budget_store.load_store(files["estimates"])
    assert store["estimates"][0]["quoteName"] == "张三的"


def test_estimates_越权读取他人整条403(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload()).json()["record"]["id"]
    login_normal(pages=["budget"], account="lisi")
    assert client.get("/api/budget/estimates?id=%s" % rid).status == 403


def test_estimates_越权删除他人403_超管可删(client, files, login_normal, login_super):
    login_normal(pages=["budget"], account="zhangsan")
    rid = client.post("/api/budget/estimates", _payload()).json()["record"]["id"]
    login_normal(pages=["budget"], account="lisi")
    assert client.post("/api/budget/estimates/delete", {"id": rid}).status == 403
    login_super()
    assert client.post("/api/budget/estimates/delete", {"id": rid}).status == 200
    assert budget_store.load_store(files["estimates"])["estimates"] == []


def test_estimates_不存在的id_取与删都404(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    assert client.get("/api/budget/estimates?id=e_nope").status == 404
    assert client.post("/api/budget/estimates/delete", {"id": "e_nope"}).status == 404


def test_estimates_报价名为空400(client, files, login_normal):
    login_normal(pages=["budget"], account="zhangsan")
    assert client.post("/api/budget/estimates", _payload("")).status == 400


def test_estimates_无budget权限403(client, files, login_normal):
    login_normal(pages=["projects"], account="zhangsan")
    assert client.get("/api/budget/estimates").status == 403
    assert client.post("/api/budget/estimates", _payload()).status == 403
```

- [ ] **Step 3: 跑测试确认失败**

Run: `python -m pytest tests/test_server_budget.py -q`
Expected: FAIL —— `AttributeError: module 'server' has no attribute 'BUDGET_CONFIG_FILE'`

- [ ] **Step 4: 加 import、常量与锁**

`server.py` 头部 import 区（与 `import yitian_settings` 同处）：

```python
import budget_config
import budget_store
```

常量区（307 行附近，紧挨 `YITIAN_SETTINGS_FILE`）：

```python
BUDGET_CONFIG_FILE = os.path.join(BASE_DIR, 'data', 'budget_config.json')
BUDGET_ESTIMATES_FILE = os.path.join(BASE_DIR, 'data', 'budget_estimates.json')
_budget_config_lock = threading.RLock()
_budget_store_lock = threading.RLock()
```

确认 `urllib.parse` 与 `time` 已在 `server.py` 顶部 import；缺则补上。

- [ ] **Step 5: 加权限辅助（handler 类内，`_require_super` 附近）**

```python
    def _require_budget(self):
        """概算工具:登录 + 持有 budget 页面授权。返回 (account, rec);无权则已发响应并返回 (None, None)。

        注意 /api/budget/* 的 GET 是全体授权账号可读、POST 才收紧 —— 同一 path 上两种
        method 权限不同,所以**不能**把这些 path 加进 _SUPER_ONLY_PATHS(那个闸按 path
        匹配、不分 method,加进去会让普通管理员连读都 403、页面白板)。
        """
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return None, None
        pages = rec.get('allowedPages', [])
        if not (rec.get('isSuper') or '*' in pages or 'budget' in pages):
            self._send_json(403, _error_payload(ERR_FORBIDDEN, "无概算工具页面权限"))
            return None, None
        return account, rec
```

- [ ] **Step 6: 加五个 handler（`handle_yitian_settings_save` 之后）**

```python
    # —— 概算工具 /budget ——

    def handle_budget_config_get(self):
        """GET /api/budget/config - 费率与目录配置。登录 + budget 授权即可读(页面要用它算);写须超管。"""
        _account, rec = self._require_budget()
        if rec is None:
            return
        with _budget_config_lock:
            cfg = budget_config.load_config(BUDGET_CONFIG_FILE)
        self._send_json(200, {"success": True, "config": cfg})

    def handle_budget_config_save(self):
        """POST /api/budget/config - 超管专属。改完立即生效,无需点「更新数据」。"""
        if self._require_super() is None:
            return
        body = self._read_json_body()
        if body is None:
            self._send_json(400, _error_payload(ERR_VALIDATION, "请求体不是合法 JSON"))
            return
        try:
            with _budget_config_lock:
                clean = budget_config.save_config(BUDGET_CONFIG_FILE, body)
        except ValueError as e:
            # save_config 先校验后写 → 校验不过时磁盘原样不动
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        self._audit_set(target='概算工具费率配置',
                        detail='汇率 %s / 成本比例区间 %s%%~%s%% / 产品 %d 条'
                               % (clean['fx'], clean['ratio']['min'],
                                  clean['ratio']['max'], len(clean['products'])))
        self._send_json(200, {"success": True, "config": clean})

    def handle_budget_estimates_get(self):
        """GET /api/budget/estimates        → 存档列表(仅元信息,不含 data/rateSnapshot)
           GET /api/budget/estimates?id=xxx → 整条记录(含 data 与 rateSnapshot)
           GET /api/budget/estimates?all=1  → 全部账号(仅超管;普通管理员传了也无效)"""
        account, rec = self._require_budget()
        if rec is None:
            return
        is_super = bool(rec.get('isSuper'))
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        eid = (qs.get('id') or [''])[0].strip()
        with _budget_store_lock:
            store = budget_store.load_store(BUDGET_ESTIMATES_FILE)
        if eid:
            row = budget_store.find_estimate(store, eid)
            if row is None:
                self._send_json(404, _error_payload(ERR_NOT_FOUND, "报价不存在: %s" % eid))
                return
            if not budget_store.can_touch(row, account, is_super):
                self._send_json(403, _error_payload(ERR_FORBIDDEN, "无权查看他人的报价"))
                return
            self._send_json(200, {"success": True, "record": row})
            return
        all_accounts = (qs.get('all') or [''])[0] in ('1', 'true')
        self._send_json(200, {"success": True,
                              "items": budget_store.list_meta(store, account, is_super,
                                                              all_accounts)})

    def handle_budget_estimates_save(self):
        """POST /api/budget/estimates - 带 id 覆盖(owner/超管),无 id 新建。"""
        account, rec = self._require_budget()
        if rec is None:
            return
        is_super = bool(rec.get('isSuper'))
        body = self._read_json_body()
        if not isinstance(body, dict):
            self._send_json(400, _error_payload(ERR_VALIDATION, "请求体不是合法 JSON 对象"))
            return
        eid = str(body.get('id') or '').strip()
        try:
            with _budget_store_lock:
                store = budget_store.load_store(BUDGET_ESTIMATES_FILE)
                if eid:
                    old = budget_store.find_estimate(store, eid)
                    if old is None:
                        self._send_json(404, _error_payload(ERR_NOT_FOUND, "报价不存在: %s" % eid))
                        return
                    if not budget_store.can_touch(old, account, is_super):
                        self._send_json(403, _error_payload(ERR_FORBIDDEN, "无权修改他人的报价"))
                        return
                now = time.strftime('%Y-%m-%d %H:%M:%S')
                row = budget_store.upsert_estimate(store, body, account, now)
                budget_store.save_store(BUDGET_ESTIMATES_FILE, store)
        except ValueError as e:
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        self._audit_set(target=row.get('quoteName', ''),
                        detail=('更新报价' if eid else '新建报价'))
        self._send_json(200, {"success": True, "record": row})

    def handle_budget_estimates_delete(self):
        """POST /api/budget/estimates/delete {id} - owner 或超管。"""
        account, rec = self._require_budget()
        if rec is None:
            return
        is_super = bool(rec.get('isSuper'))
        body = self._read_json_body()
        eid = str((body or {}).get('id') or '').strip()
        if not eid:
            self._send_json(400, _error_payload(ERR_VALIDATION, "id 必填"))
            return
        with _budget_store_lock:
            store = budget_store.load_store(BUDGET_ESTIMATES_FILE)
            row = budget_store.find_estimate(store, eid)
            if row is None:
                self._send_json(404, _error_payload(ERR_NOT_FOUND, "报价不存在: %s" % eid))
                return
            if not budget_store.can_touch(row, account, is_super):
                self._send_json(403, _error_payload(ERR_FORBIDDEN, "无权删除他人的报价"))
                return
            name = row.get('quoteName', '')
            budget_store.delete_estimate(store, eid)
            budget_store.save_store(BUDGET_ESTIMATES_FILE, store)
        self._audit_set(target=name, detail='删除报价')
        self._send_json(200, {"success": True})
```

- [ ] **Step 7: 接进 GET / POST 分发链**

GET（905 行附近，`elif parsed.path == '/api/yitian/store':` 之后）：

```python
        elif parsed.path == '/api/budget/config':
            self.handle_budget_config_get()
        elif parsed.path == '/api/budget/estimates':
            self.handle_budget_estimates_get()
```

POST（`elif parsed.path == '/api/yitian/store/delete-range':` 之后）：

```python
        elif parsed.path == '/api/budget/config':
            self.handle_budget_config_save()
        elif parsed.path == '/api/budget/estimates':
            self.handle_budget_estimates_save()
        elif parsed.path == '/api/budget/estimates/delete':
            self.handle_budget_estimates_delete()
```

**不要**动 `_SUPER_ONLY_PATHS`（见本任务开头的警告）。

- [ ] **Step 8: 跑测试 + 确认没碰真实数据**

```bash
python -m pytest tests/test_server_budget.py -q
git status --short data/
```
Expected: PASS；`git status --short data/` **无任何输出**（一个字节都不能变）。

- [ ] **Step 9: 全量回归 + 提交**

```bash
python -m pytest -q
python -m ruff check server.py tests/test_server_budget.py
git add server.py tests/test_server_budget.py
git commit -m "feat(budget): 5 个端点(配置读写 + 存档 CRUD),owner/超管校验在 handler 内"
```

---

## Task 4: `lib/budget/types.ts` + `lib/budget/calc.ts` —— 计算核心

**Files:**
- Create: `frontend/src/lib/budget/types.ts`
- Create: `frontend/src/lib/budget/calc.ts`
- Test: `frontend/src/lib/budget/calc.test.ts`

**Interfaces:**
- Consumes: 无
- Produces（Task 5/6/7/8/10/11 全都消费）：
  - 类型：`BudgetConfig` / `ProductDef` / `PmPhaseDef` / `ServiceDef` / `Material` / `MaterialKey` / `DayCells` / `ProductRow` / `PmPhaseRow` / `ServiceRow` / `DirectCostForm` / `BasicInfo` / `BudgetForm` / `CalcResult` / `RatioStatus`
  - `productTotalDays(qty: number, stdDays: number, coefficient: number): number`
  - `calcBudget(form: BudgetForm, cfg: BudgetConfig): CalcResult`
  - `emptyForm(cfg: BudgetConfig): BudgetForm` —— 按配置生成初始表单（PM 五阶段预填、margin 取首档）

- [ ] **Step 1: 写类型文件 `frontend/src/lib/budget/types.ts`**

```ts
// 概算工具的全部类型。本域不进 schema.py(不产出 analysis_data.json),
// 所以这里是前端唯一类型来源,不要跑 npm run gen:types。

// —— 配置(后端 budget_config.py 的镜像) ——
export interface CityRate { pm: number; tech: number; out: number }
export interface BudgetRates { city1: CityRate; city2: CityRate }

export type MaterialKey = 'pm' | 'pm2ndc' | 'eng1stc' | 'eng2ndc'
export interface Material { key: MaterialKey; code: string; name: string }
export type SalesPrices = Record<MaterialKey, number>

/** 住宿的城市分类(一线/省会/其他/港澳)与人工成本的城市分类(一类/二类)是两套互不相干的
 *  口径,外包差旅又用回一类/二类。这是原工具的既定事实,不要合并。 */
export interface HotelRates {
  type1: number; capital: number; other: number; hk: number
  outType1: number; outType2: number
}
export interface Allowance { dom: number; intl: number }
export interface MarginOption { value: number; label: string }
export interface RatioThreshold { min: number; max: number }

export interface ProductDef {
  id: string; name: string
  coefficient: number; stdDays: number
  stdDesc: string; nonstdDesc: string
}
export interface PmPhaseDef { name: string; content: string }
export interface ServiceDef { name: string; desc: string; isOther?: boolean }

export interface BudgetConfig {
  version: number
  rates: BudgetRates
  salesPrices: SalesPrices
  materials: Material[]
  hotel: HotelRates
  allowance: Allowance
  fx: number
  margins: MarginOption[]
  ratio: RatioThreshold
  products: ProductDef[]
  pmPhases: PmPhaseDef[]
  services: ServiceDef[]
}

// —— 表单 ——
/** 四格人天:技服一类/二类、外包一类/二类。人天一律手填 —— 系数只给参考值。 */
export interface DayCells { tech1: number; tech2: number; out1: number; out2: number }

export interface ProductRow {
  uid: string                 // 前端唯一键(列表渲染/删除用)
  id: string                  // 目录 id;自定义产品固定为 'other'
  name: string                // 自定义产品由用户填
  isCustom: boolean
  // 标准实施(仅非自定义)
  qty: number
  stdDays: number
  coefficient: number
  std: DayCells
  // 非标实施(仅非自定义)
  nonStdDesc: string
  nonStd: DayCells
  // 自定义产品(仅自定义)
  customDesc: string
  custom: DayCells
}

export interface PmPhaseRow {
  name: string
  pm1: number; pm2: number       // 项目经理人天:一类/二类
  tech1: number; tech2: number   // 技术服务人天:一类/二类
  note: string                   // 工作内容
}

export interface ServiceRow {
  uid: string
  name: string
  isOther: boolean
  content: string
  cells: DayCells
}

export interface DirectCostForm {
  allowanceDomDays: number      // 差补(境内)天数
  allowanceIntlDays: number     // 差补(境外)天数
  hotelType1: number            // 住宿:一线城市 晚数
  hotelCapital: number          // 住宿:省会城市 晚数
  hotelOther: number            // 住宿:其他城市 晚数
  hotelHk: number               // 住宿:港澳 晚数
  hotelOutType1: number         // 外包差旅:一类城市 晚数
  hotelOutType2: number         // 外包差旅:二类城市 晚数
  localTransportBase: number    // 本地交通(员工 base 地) —— 员工常驻地交通费
  localTransportTrip: number    // 当地交通(差旅期间) —— 差旅期间在目的地的交通费
  interCityTransport: number    // 城际交通
}

export interface BasicInfo {
  quoteName: string
  customerName: string
  salesName: string
  location: string              // 纯记录:与"一类/二类城市"无任何联动
  projectAmount: number | null  // 万元;成本比例的分母
  projectLevel: string          // P1 | P2 | P3 | P4
  customerLevel: string         // TOP1000 | 指名客户 | 非指名客户
  signType: string              // 直签 | 渠道 | 项目合作
  thirdParty: string            // 否 | 是
}

export interface BudgetForm {
  basic: BasicInfo
  products: ProductRow[]
  pmPhases: PmPhaseRow[]
  services: ServiceRow[]
  direct: DirectCostForm
  margin: number                // 毛利率:0.13 | 0.06
  ratioExplanation: string      // 成本比例异常说明(三态非 normal 时必填)
  crmText: string
  crmUserEdited: boolean        // 用户手改过 → 停止自动覆盖
}

// —— 计算结果 ——
export type RatioStatus = 'low' | 'normal' | 'high' | 'na'

export interface CalcResult {
  // 人天
  pmDays1: number; pmDays2: number
  pmTechDays1: number; pmTechDays2: number
  prodTechDays1: number; prodTechDays2: number
  prodOutDays1: number; prodOutDays2: number
  svcTechDays1: number; svcTechDays2: number
  svcOutDays1: number; svcOutDays2: number
  // 人工成本
  pmCost: number; pmTechCost: number
  prodTechCost: number; prodOutCost: number
  svcTechCost: number; svcOutCost: number
  laborCost: number
  // 直接成本
  travelAllowance: number; hotelCost: number; hotelOutCost: number
  directCost: number
  // 汇总
  totalCost: number            // 未含税总成本 = laborCost + directCost
  salesAmount: number          // 销售下单金额(含税) = totalCost × (1 + margin)
  costRatio: number | null     // 百分数;项目金额<=0 或 总成本=0 → null
  ratioStatus: RatioStatus
}
```

- [ ] **Step 2: 写失败的测试 `frontend/src/lib/budget/calc.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { productTotalDays, calcBudget, emptyForm } from './calc'
import type { BudgetConfig, BudgetForm, DayCells } from './types'

// 与后端 budget_config.DEFAULT_CONFIG 同值的最小配置(测试自带,不依赖网络)
const CFG: BudgetConfig = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [
    { key: 'pm', code: 'JY-CPJF-OTHER-PM', name: 'PM一线' },
    { key: 'pm2ndc', code: 'JY-CPJF-OTHER-PM-2NDC-PISN', name: 'PM二线' },
    { key: 'eng1stc', code: 'JY-CPJF-AZ-OTHER-1STC-ENG', name: '工程师一线' },
    { key: 'eng2ndc', code: 'JY-CPJF-AZ-OTHER-2NDC-ENG', name: '工程师二线' },
  ],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%（含产品）' }, { value: 0.06, label: '6%（纯服务）' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: '标准说明', nonstdDesc: '非标说明' }],
  pmPhases: [{ name: '项目启动阶段', content: '模板1' }, { name: '项目规划阶段', content: '模板2' },
             { name: '项目执行阶段', content: '模板3' }, { name: '项目收尾阶段', content: '模板4' },
             { name: '其他工作', content: '模板5' }],
  services: [{ name: '巡检服务', desc: '巡检说明' },
             { name: '其他服务', desc: '用户自定义服务项', isOther: true }],
}

const Z: DayCells = { tech1: 0, tech2: 0, out1: 0, out2: 0 }
const cells = (p: Partial<DayCells>): DayCells => ({ ...Z, ...p })

function form(patch: Partial<BudgetForm> = {}): BudgetForm {
  return { ...emptyForm(CFG), ...patch }
}

describe('productTotalDays:合计参考人天的分段规则', () => {
  it('qty===1 时不乘系数,直接取 stdDays(刻意为之,不是 bug)', () => {
    expect(productTotalDays(1, 1.5, 0.8)).toBe(1.5)
    expect(productTotalDays(1, 6.375, 0.6)).toBe(6.375)
  })
  it('qty>1 时乘系数并四舍五入到 1 位小数', () => {
    expect(productTotalDays(3, 1.5, 0.8)).toBe(3.6)      // 3*1.5*0.8 = 3.6
    expect(productTotalDays(2, 6.375, 0.6)).toBe(7.7)    // 7.65 → 7.7
  })
  it('qty===0 或 0<qty<1 一律得 0', () => {
    expect(productTotalDays(0, 1.5, 0.8)).toBe(0)
    expect(productTotalDays(0.5, 1.5, 0.8)).toBe(0)
  })
})

describe('calcBudget:人工成本', () => {
  it('产品人天只认手填的四格,合计参考人天不参与任何金额计算', () => {
    const r = calcBudget(form({
      products: [{
        uid: 'u1', id: '1.1', name: '防火墙', isCustom: false,
        qty: 100, stdDays: 10, coefficient: 1,        // 参考人天会很大…
        std: cells({ tech1: 2, out2: 3 }),            // …但金额只认这四格
        nonStdDesc: '', nonStd: Z,
        customDesc: '', custom: Z,
      }],
    }), CFG)
    expect(r.prodTechDays1).toBe(2)
    expect(r.prodOutDays2).toBe(3)
    expect(r.prodTechCost).toBe(2 * 1300)
    expect(r.prodOutCost).toBe(3 * 800)
    expect(r.laborCost).toBe(2 * 1300 + 3 * 800)
  })

  it('标准 + 非标 + 自定义三段人天全部累加', () => {
    const r = calcBudget(form({
      products: [
        { uid: 'u1', id: '1.1', name: '防火墙', isCustom: false,
          qty: 1, stdDays: 1.5, coefficient: 0.8,
          std: cells({ tech1: 1 }), nonStdDesc: '复杂场景', nonStd: cells({ tech1: 2 }),
          customDesc: '', custom: Z },
        { uid: 'u2', id: 'other', name: '自定义X', isCustom: true,
          qty: 0, stdDays: 0, coefficient: 0, std: Z, nonStdDesc: '', nonStd: Z,
          customDesc: '定制工作', custom: cells({ tech1: 4 }) },
      ],
    }), CFG)
    expect(r.prodTechDays1).toBe(7)                    // 1 + 2 + 4
    expect(r.prodTechCost).toBe(7 * 1300)
  })

  it('PM:五阶段求和,PM 人天与技服人天分别按各自单价计价', () => {
    const f = form()
    f.pmPhases[0].pm1 = 3
    f.pmPhases[1].pm2 = 2
    f.pmPhases[2].tech1 = 5
    f.pmPhases[3].tech2 = 1
    const r = calcBudget(f, CFG)
    expect(r.pmDays1).toBe(3)
    expect(r.pmDays2).toBe(2)
    expect(r.pmTechDays1).toBe(5)
    expect(r.pmTechDays2).toBe(1)
    expect(r.pmCost).toBe(3 * 2000 + 2 * 1500)
    expect(r.pmTechCost).toBe(5 * 1300 + 1 * 1000)
  })

  it('其他服务:按四格累加计价', () => {
    const r = calcBudget(form({
      services: [{ uid: 's1', name: '巡检服务', isOther: false, content: '巡检',
                   cells: cells({ tech2: 2, out1: 1 }) }],
    }), CFG)
    expect(r.svcTechDays2).toBe(2)
    expect(r.svcOutDays1).toBe(1)
    expect(r.svcTechCost).toBe(2 * 1000)
    expect(r.svcOutCost).toBe(1 * 1000)
  })
})

describe('calcBudget:直接成本', () => {
  it('差补/住宿/外包差旅/三项交通全部累加,美金项按汇率折算', () => {
    const r = calcBudget(form({
      direct: {
        allowanceDomDays: 2, allowanceIntlDays: 1,
        hotelType1: 1, hotelCapital: 1, hotelOther: 1, hotelHk: 1,
        hotelOutType1: 1, hotelOutType2: 1,
        localTransportBase: 100, localTransportTrip: 200, interCityTransport: 300,
      },
    }), CFG)
    expect(r.travelAllowance).toBeCloseTo(2 * 150 + 1 * 75 * 6.8, 6)     // 300 + 510 = 810
    expect(r.hotelCost).toBeCloseTo(450 + 350 + 300 + 125 * 6.8, 6)      // 1100 + 850 = 1950
    expect(r.hotelOutCost).toBe(300 + 230)
    expect(r.directCost).toBeCloseTo(810 + 1950 + 530 + 100 + 200 + 300, 6)
  })

  it('本地交通(base地)与当地交通(差旅)是两个类目,都要计入', () => {
    const r = calcBudget(form({
      direct: { ...emptyForm(CFG).direct, localTransportBase: 111, localTransportTrip: 222 },
    }), CFG)
    expect(r.directCost).toBe(333)
  })
})

describe('calcBudget:成本比例(分子必须含税)', () => {
  // ★这是本次重构对原工具的核心修正:原代码分子用未含税总成本,漏乘 (1 + margin)。
  it('成本比例 = 总成本 ×(1+毛利率) ÷ 项目金额 —— 分子含税', () => {
    const f = form({ margin: 0.13 })
    f.basic.projectAmount = 100                       // 100 万元
    f.pmPhases[0].pm1 = 40                            // 40 × 2000 = 80000 人工
    f.direct.localTransportBase = 20000               // 20000 直接成本
    const r = calcBudget(f, CFG)
    expect(r.totalCost).toBe(100000)
    expect(r.salesAmount).toBeCloseTo(113000, 6)
    expect(r.costRatio).toBeCloseTo(11.3, 6)          // 113000 / 1000000 = 11.3%
    // 反向钉死:绝不能是未含税的 10.0%
    expect(r.costRatio).not.toBeCloseTo(10.0, 6)
    expect(r.ratioStatus).toBe('normal')
  })

  it('毛利率会影响成本比例(原工具只影响下单金额)', () => {
    const f = form({ margin: 0.06 })
    f.basic.projectAmount = 100
    f.pmPhases[0].pm1 = 50                            // 100000 总成本
    const r = calcBudget(f, CFG)
    expect(r.costRatio).toBeCloseTo(10.6, 6)          // 106000 / 1000000
  })

  it('三态:低于下限 low、区间内 normal、高于上限 high', () => {
    // 项目金额 1000 万 → 分母 10,000,000 元;PM 一类人天 × 2000 = 总成本
    const mk = (pmDays: number) => {
      const f = form({ margin: 0.13 })
      f.basic.projectAmount = 1000
      f.pmPhases[0].pm1 = pmDays
      return calcBudget(f, CFG)
    }
    expect(mk(10).ratioStatus).toBe('low')      // 20000×1.13 = 22600 → 0.226%
    expect(mk(300).ratioStatus).toBe('normal')  // 600000×1.13 = 678000 → 6.78%
    expect(mk(1000).ratioStatus).toBe('high')   // 2000000×1.13 = 2260000 → 22.6%
  })

  it('三态边界:恰好等于下限/上限都判 normal(闭区间)', () => {
    // 构造 costRatio 恰好 = 3:  totalCost × 1.13 / (amount×10000) × 100 = 3
    const f = form({ margin: 0.13 })
    f.basic.projectAmount = 100                       // 分母 1,000,000
    // 需要 salesAmount = 30000 → totalCost = 30000/1.13
    f.direct.localTransportBase = 30000 / 1.13
    const lo = calcBudget(f, CFG)
    expect(lo.costRatio).toBeCloseTo(3, 6)
    expect(lo.ratioStatus).toBe('normal')

    f.direct.localTransportBase = 150000 / 1.13       // salesAmount = 150000 → 15%
    const hi = calcBudget(f, CFG)
    expect(hi.costRatio).toBeCloseTo(15, 6)
    expect(hi.ratioStatus).toBe('normal')
  })

  it('三态:略低于 3% → low;略高于 15% → high', () => {
    const f = form({ margin: 0.13 })
    f.basic.projectAmount = 100
    f.direct.localTransportBase = 20000 / 1.13        // 2%
    expect(calcBudget(f, CFG).ratioStatus).toBe('low')
    f.direct.localTransportBase = 200000 / 1.13       // 20%
    expect(calcBudget(f, CFG).ratioStatus).toBe('high')
  })

  it('项目金额为空或<=0 → costRatio 为 null,状态 na(不判定不拦截)', () => {
    const f = form()
    f.basic.projectAmount = null
    f.pmPhases[0].pm1 = 10
    const r1 = calcBudget(f, CFG)
    expect(r1.costRatio).toBeNull()
    expect(r1.ratioStatus).toBe('na')
    f.basic.projectAmount = 0
    expect(calcBudget(f, CFG).ratioStatus).toBe('na')
  })

  it('总成本为 0 → costRatio 为 null,状态 na', () => {
    const f = form()
    f.basic.projectAmount = 100
    const r = calcBudget(f, CFG)
    expect(r.totalCost).toBe(0)
    expect(r.costRatio).toBeNull()
    expect(r.ratioStatus).toBe('na')
  })

  it('阈值取自配置,不是写死的 3/15', () => {
    const cfg2 = { ...CFG, ratio: { min: 8, max: 20 } }
    const f = form({ margin: 0.13 })
    f.basic.projectAmount = 100
    f.direct.localTransportBase = 50000 / 1.13        // 5%
    expect(calcBudget(f, cfg2).ratioStatus).toBe('low')   // 用默认 3/15 会是 normal
  })
})

describe('emptyForm', () => {
  it('按配置预填 PM 五阶段(名称与工作内容模板来自配置)', () => {
    const f = emptyForm(CFG)
    expect(f.pmPhases.map((p) => p.name)).toEqual(
      ['项目启动阶段', '项目规划阶段', '项目执行阶段', '项目收尾阶段', '其他工作'])
    expect(f.pmPhases[0].note).toBe('模板1')
    expect(f.pmPhases.every((p) => p.pm1 === 0 && p.pm2 === 0)).toBe(true)
  })
  it('毛利率取配置里的第一档', () => {
    expect(emptyForm(CFG).margin).toBe(0.13)
  })
  it('产品/服务初始为空,直接成本全 0', () => {
    const f = emptyForm(CFG)
    expect(f.products).toEqual([])
    expect(f.services).toEqual([])
    expect(f.direct.localTransportBase).toBe(0)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/budget/calc.test.ts`
Expected: FAIL —— 找不到 `./calc`

- [ ] **Step 4: 实现 `frontend/src/lib/budget/calc.ts`**

```ts
import type {
  BudgetConfig, BudgetForm, CalcResult, DayCells, DirectCostForm, RatioStatus,
} from './types'

/** 合计参考人天。
 *
 *  分段规则(原工具刻意为之,不是 bug):qty === 1 时**不乘系数**,直接取 stdDays;
 *  qty > 1 才乘系数并四舍五入到 1 位小数;qty === 0 或 0 < qty < 1 一律得 0。
 *
 *  ⚠ 这个值**不参与任何金额计算** —— 它只是给填表人的参考,人天必须手动分配到四格里。
 */
export function productTotalDays(qty: number, stdDays: number, coefficient: number): number {
  const q = Number(qty) || 0
  const d = Number(stdDays) || 0
  const c = Number(coefficient) || 0
  if (q === 1) return d
  if (q > 1) return Math.round(q * d * c * 10) / 10
  return 0
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function addCells(acc: DayCells, c: DayCells): void {
  acc.tech1 += n(c.tech1); acc.tech2 += n(c.tech2)
  acc.out1 += n(c.out1);   acc.out2 += n(c.out2)
}

function directCostOf(d: DirectCostForm, cfg: BudgetConfig) {
  const { hotel, allowance, fx } = cfg
  const travelAllowance = n(d.allowanceDomDays) * allowance.dom
                        + n(d.allowanceIntlDays) * allowance.intl * fx
  const hotelCost = n(d.hotelType1) * hotel.type1
                  + n(d.hotelCapital) * hotel.capital
                  + n(d.hotelOther) * hotel.other
                  + n(d.hotelHk) * hotel.hk * fx
  const hotelOutCost = n(d.hotelOutType1) * hotel.outType1
                     + n(d.hotelOutType2) * hotel.outType2
  const directCost = travelAllowance + hotelCost + hotelOutCost
                   + n(d.localTransportBase)      // 本地交通:员工 base 地
                   + n(d.localTransportTrip)      // 当地交通:差旅期间
                   + n(d.interCityTransport)
  return { travelAllowance, hotelCost, hotelOutCost, directCost }
}

/** 全站唯一的概算计算口径。纯函数 —— 不碰 DOM、不读全局。 */
export function calcBudget(form: BudgetForm, cfg: BudgetConfig): CalcResult {
  const { rates } = cfg

  // 产品:标准 + 非标 + 自定义三段人天全部累加(合计参考人天不参与)
  const prod: DayCells = { tech1: 0, tech2: 0, out1: 0, out2: 0 }
  for (const p of form.products) {
    if (p.isCustom) {
      addCells(prod, p.custom)
    } else {
      addCells(prod, p.std)
      addCells(prod, p.nonStd)
    }
  }

  // 项目经理:五阶段求和。阶段只是分组标签,没有系数、没有工时基线。
  let pmDays1 = 0, pmDays2 = 0, pmTechDays1 = 0, pmTechDays2 = 0
  for (const ph of form.pmPhases) {
    pmDays1 += n(ph.pm1);     pmDays2 += n(ph.pm2)
    pmTechDays1 += n(ph.tech1); pmTechDays2 += n(ph.tech2)
  }

  const svc: DayCells = { tech1: 0, tech2: 0, out1: 0, out2: 0 }
  for (const s of form.services) addCells(svc, s.cells)

  const prodTechCost = prod.tech1 * rates.city1.tech + prod.tech2 * rates.city2.tech
  const prodOutCost  = prod.out1  * rates.city1.out  + prod.out2  * rates.city2.out
  const svcTechCost  = svc.tech1  * rates.city1.tech + svc.tech2  * rates.city2.tech
  const svcOutCost   = svc.out1   * rates.city1.out  + svc.out2   * rates.city2.out
  const pmCost       = pmDays1     * rates.city1.pm   + pmDays2     * rates.city2.pm
  const pmTechCost   = pmTechDays1 * rates.city1.tech + pmTechDays2 * rates.city2.tech

  const laborCost = pmCost + pmTechCost + prodTechCost + prodOutCost + svcTechCost + svcOutCost
  const { travelAllowance, hotelCost, hotelOutCost, directCost } = directCostOf(form.direct, cfg)

  const totalCost = laborCost + directCost
  const margin = n(form.margin)
  const salesAmount = totalCost * (1 + margin)

  // ★成本比例的分子是**销售下单金额(含税)**,不是未含税总成本。
  //  原工具页面文案写的是「销售下单金额/项目金额」,代码却漏乘 (1 + margin) —— 那是计算错误。
  //  修正后毛利率会影响成本比例(原来只影响下单金额)。
  const amountYuan = n(form.basic.projectAmount) * 10000
  let costRatio: number | null = null
  let ratioStatus: RatioStatus = 'na'
  if (amountYuan > 0 && totalCost !== 0) {
    costRatio = (salesAmount / amountYuan) * 100
    ratioStatus = costRatio < cfg.ratio.min ? 'low'
                : costRatio > cfg.ratio.max ? 'high'
                : 'normal'                                  // 闭区间:恰好等于上下限都算正常
  }

  return {
    pmDays1, pmDays2, pmTechDays1, pmTechDays2,
    prodTechDays1: prod.tech1, prodTechDays2: prod.tech2,
    prodOutDays1: prod.out1,   prodOutDays2: prod.out2,
    svcTechDays1: svc.tech1,   svcTechDays2: svc.tech2,
    svcOutDays1: svc.out1,     svcOutDays2: svc.out2,
    pmCost, pmTechCost, prodTechCost, prodOutCost, svcTechCost, svcOutCost,
    laborCost,
    travelAllowance, hotelCost, hotelOutCost, directCost,
    totalCost, salesAmount, costRatio, ratioStatus,
  }
}

/** 按配置生成初始表单:PM 五阶段按配置预填(名称 + 工作内容模板),毛利率取首档。 */
export function emptyForm(cfg: BudgetConfig): BudgetForm {
  return {
    basic: {
      quoteName: '', customerName: '', salesName: '', location: '',
      projectAmount: null, projectLevel: '', customerLevel: '',
      signType: '', thirdParty: '',
    },
    products: [],
    pmPhases: cfg.pmPhases.map((p) => ({
      name: p.name, pm1: 0, pm2: 0, tech1: 0, tech2: 0, note: p.content,
    })),
    services: [],
    direct: {
      allowanceDomDays: 0, allowanceIntlDays: 0,
      hotelType1: 0, hotelCapital: 0, hotelOther: 0, hotelHk: 0,
      hotelOutType1: 0, hotelOutType2: 0,
      localTransportBase: 0, localTransportTrip: 0, interCityTransport: 0,
    },
    margin: cfg.margins[0]?.value ?? 0.13,
    ratioExplanation: '',
    crmText: '',
    crmUserEdited: false,
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/budget/calc.test.ts && npm run typecheck`
Expected: PASS + typecheck 无错

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/budget/types.ts frontend/src/lib/budget/calc.ts frontend/src/lib/budget/calc.test.ts
git commit -m "feat(budget): 计算核心(成本比例分子改为含税,修正原工具计算错误)"
```

---

## Task 5: `lib/budget/salesOrder.ts` —— 销售下单建议

**Files:**
- Create: `frontend/src/lib/budget/salesOrder.ts`
- Test: `frontend/src/lib/budget/salesOrder.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `CalcResult` / `BudgetConfig` / `MaterialKey`
- Produces:
  - `interface SalesOrderRow { key: MaterialKey; code: string; name: string; price: number; qty: number; amount: number }`
  - `interface SalesOrder { rows: SalesOrderRow[]; grandTotal: number }`
  - `calcSalesOrder(r: CalcResult, margin: number, cfg: BudgetConfig): SalesOrder`

**口径（原样重建 + 两处修正）：**

四个物料各自归集成本。**PM 模块内的技术服务人天并入「工程师」物料，不算进 PM 物料**：

```
cost[pm]      = pmDays1 × rates.city1.pm
cost[pm2ndc]  = pmDays2 × rates.city2.pm
cost[eng1stc] = (prodTechDays1 + pmTechDays1 + svcTechDays1) × rates.city1.tech
              + (prodOutDays1  + svcOutDays1)                × rates.city1.out
cost[eng2ndc] = (prodTechDays2 + pmTechDays2 + svcTechDays2) × rates.city2.tech
              + (prodOutDays2  + svcOutDays2)                × rates.city2.out

qty[m] = ceil( cost[m] × (1 + margin) ÷ price[m] )

// 直接成本(差旅)并到「最便宜的、数量 > 0 的」物料上,只并一个
if directCost > 0:
    按单价升序找第一个 qty > 0 的物料 m → qty[m] = ceil((directCost + cost[m]) × (1+margin) ÷ price[m])
    ★若一个都没有(纯差旅、无人工) → 落到最便宜的物料上(原工具在这里把差旅费**静默丢弃**,合计变 0)
```

- [ ] **Step 1: 写失败的测试 `frontend/src/lib/budget/salesOrder.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { calcSalesOrder } from './salesOrder'
import type { BudgetConfig, CalcResult, MaterialKey } from './types'

const CFG: BudgetConfig = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [
    { key: 'pm', code: 'JY-CPJF-OTHER-PM', name: 'PM一线' },
    { key: 'pm2ndc', code: 'JY-CPJF-OTHER-PM-2NDC-PISN', name: 'PM二线' },
    { key: 'eng1stc', code: 'JY-CPJF-AZ-OTHER-1STC-ENG', name: '工程师一线' },
    { key: 'eng2ndc', code: 'JY-CPJF-AZ-OTHER-2NDC-ENG', name: '工程师二线' },
  ],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%' }, { value: 0.06, label: '6%' }],
  ratio: { min: 3, max: 15 },
  products: [], pmPhases: [], services: [],
}

const ZERO: CalcResult = {
  pmDays1: 0, pmDays2: 0, pmTechDays1: 0, pmTechDays2: 0,
  prodTechDays1: 0, prodTechDays2: 0, prodOutDays1: 0, prodOutDays2: 0,
  svcTechDays1: 0, svcTechDays2: 0, svcOutDays1: 0, svcOutDays2: 0,
  pmCost: 0, pmTechCost: 0, prodTechCost: 0, prodOutCost: 0, svcTechCost: 0, svcOutCost: 0,
  laborCost: 0,
  travelAllowance: 0, hotelCost: 0, hotelOutCost: 0, directCost: 0,
  totalCost: 0, salesAmount: 0, costRatio: null, ratioStatus: 'na',
}
const qtyOf = (rows: { key: MaterialKey; qty: number }[], k: MaterialKey) =>
  rows.find((r) => r.key === k)!.qty

describe('calcSalesOrder', () => {
  it('物料行的编号与名称来自配置,顺序与 materials 一致', () => {
    const o = calcSalesOrder({ ...ZERO }, 0.13, CFG)
    expect(o.rows.map((r) => r.key)).toEqual(['pm', 'pm2ndc', 'eng1stc', 'eng2ndc'])
    expect(o.rows[0].code).toBe('JY-CPJF-OTHER-PM')
    expect(o.rows[0].price).toBe(2400)
  })

  it('数量 = ceil(成本 ×(1+毛利率) ÷ 单价)', () => {
    const r = { ...ZERO, pmDays1: 10, pmCost: 20000 }          // 20000 × 1.13 = 22600
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'pm')).toBe(Math.ceil(22600 / 2400))   // 10
    expect(o.rows.find((x) => x.key === 'pm')!.amount).toBe(10 * 2400)
  })

  it('PM 模块内的技术服务人天并入工程师物料,不进 PM 物料', () => {
    const r = { ...ZERO, pmTechDays1: 4 }                       // 4 × 1300 = 5200
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'pm')).toBe(0)                         // PM 物料不受影响
    expect(qtyOf(o.rows, 'eng1stc')).toBe(Math.ceil(5200 * 1.13 / 1500))   // 4
  })

  it('工程师物料归集 技服 + 外包 两类成本', () => {
    const r = { ...ZERO, prodTechDays2: 2, svcOutDays2: 3 }     // 2×1000 + 3×800 = 4400
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'eng2ndc')).toBe(Math.ceil(4400 * 1.13 / 1200))   // 5
  })

  it('毛利率只作为 (1+margin) 的乘数,单价不随档位变', () => {
    const r = { ...ZERO, pmDays1: 10, pmCost: 20000 }
    const o6 = calcSalesOrder(r, 0.06, CFG)
    expect(o6.rows.find((x) => x.key === 'pm')!.price).toBe(2400)          // 单价不变
    expect(qtyOf(o6.rows, 'pm')).toBe(Math.ceil(20000 * 1.06 / 2400))      // 9
  })

  it('直接成本并到「最便宜的、数量>0 的」物料上,只并一个', () => {
    // eng2ndc(1200) 最便宜且有量 → 差旅并到它头上
    const r = { ...ZERO, prodTechDays2: 2, prodTechDays1: 1, directCost: 10000 }
    // eng2ndc 成本 2×1000=2000;eng1stc 成本 1×1300=1300
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'eng2ndc')).toBe(Math.ceil((10000 + 2000) * 1.13 / 1200))  // 12
    expect(qtyOf(o.rows, 'eng1stc')).toBe(Math.ceil(1300 * 1.13 / 1500))            // 1(未被并入)
  })

  it('最便宜的物料数量为 0 时,顺次并到下一个有量的物料', () => {
    const r = { ...ZERO, pmDays1: 10, pmCost: 20000, directCost: 5000 }
    // 只有 pm 有量 → 差旅并到 pm
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'pm')).toBe(Math.ceil((5000 + 20000) * 1.13 / 2400))       // 12
    expect(qtyOf(o.rows, 'eng2ndc')).toBe(0)
  })

  // ★原工具的 bug:所有物料数量都为 0 时,差旅费被静默丢弃,合计变 0。
  it('回归:纯差旅无人工时,差旅费不得丢失 —— 落到最便宜的物料上', () => {
    const r = { ...ZERO, directCost: 10000 }
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'eng2ndc')).toBe(Math.ceil(10000 * 1.13 / 1200))           // 10
    expect(o.grandTotal).toBe(10 * 1200)
    expect(o.grandTotal).toBeGreaterThan(0)                    // 绝不能是 0
  })

  it('全零输入 → 所有数量为 0,合计为 0', () => {
    const o = calcSalesOrder({ ...ZERO }, 0.13, CFG)
    expect(o.rows.every((x) => x.qty === 0 && x.amount === 0)).toBe(true)
    expect(o.grandTotal).toBe(0)
  })

  it('合计 = 各行金额之和', () => {
    const r = { ...ZERO, pmDays1: 5, pmCost: 10000, prodTechDays1: 3, directCost: 2000 }
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(o.grandTotal).toBe(o.rows.reduce((s, x) => s + x.amount, 0))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/budget/salesOrder.test.ts`
Expected: FAIL —— 找不到 `./salesOrder`

- [ ] **Step 3: 实现 `frontend/src/lib/budget/salesOrder.ts`**

```ts
import type { BudgetConfig, CalcResult, MaterialKey } from './types'

export interface SalesOrderRow {
  key: MaterialKey
  code: string
  name: string
  price: number
  qty: number
  amount: number
}
export interface SalesOrder {
  rows: SalesOrderRow[]
  grandTotal: number
}

/** 销售下单建议:成本 → 物料数量的逆运算。
 *
 *  两处与原工具不同:
 *  1. directCost 由参数传入 —— 原工具从 DOM 文本 "¥12,345" 反解字符串。
 *  2. 所有物料数量都为 0 而差旅 > 0 时(纯差旅、无人工),原工具把差旅费**静默丢弃**、
 *     合计变 0。这里改为落到最便宜的物料上。
 */
export function calcSalesOrder(r: CalcResult, margin: number, cfg: BudgetConfig): SalesOrder {
  const { rates, salesPrices } = cfg
  const m = 1 + (Number(margin) || 0)

  // PM 模块内的技术服务人天并入「工程师」物料,不进 PM 物料 —— 原工具的既定口径。
  const cost: Record<MaterialKey, number> = {
    pm: r.pmDays1 * rates.city1.pm,
    pm2ndc: r.pmDays2 * rates.city2.pm,
    eng1stc: (r.prodTechDays1 + r.pmTechDays1 + r.svcTechDays1) * rates.city1.tech
           + (r.prodOutDays1 + r.svcOutDays1) * rates.city1.out,
    eng2ndc: (r.prodTechDays2 + r.pmTechDays2 + r.svcTechDays2) * rates.city2.tech
           + (r.prodOutDays2 + r.svcOutDays2) * rates.city2.out,
  }

  const qtyFor = (key: MaterialKey, extra = 0): number => {
    const price = salesPrices[key]
    if (!price || price <= 0) return 0
    return Math.ceil(((cost[key] + extra) * m) / price)
  }

  const qty: Record<MaterialKey, number> = {
    pm: qtyFor('pm'), pm2ndc: qtyFor('pm2ndc'),
    eng1stc: qtyFor('eng1stc'), eng2ndc: qtyFor('eng2ndc'),
  }

  // 直接成本(差旅)寄生到最便宜的、数量 > 0 的物料上,只并一个。
  if (r.directCost > 0) {
    const byPriceAsc = [...cfg.materials].sort((a, b) => salesPrices[a.key] - salesPrices[b.key])
    const host = byPriceAsc.find((x) => qty[x.key] > 0)
      // ★没有任何物料有量(纯差旅、无人工) → 落到最便宜的那个,绝不能把差旅费丢掉
      ?? byPriceAsc[0]
    if (host) qty[host.key] = qtyFor(host.key, r.directCost)
  }

  const rows: SalesOrderRow[] = cfg.materials.map((mat) => ({
    key: mat.key,
    code: mat.code,
    name: mat.name,
    price: salesPrices[mat.key],
    qty: qty[mat.key],
    amount: qty[mat.key] * salesPrices[mat.key],
  }))

  return { rows, grandTotal: rows.reduce((s, x) => s + x.amount, 0) }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/budget/salesOrder.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/budget/salesOrder.ts frontend/src/lib/budget/salesOrder.test.ts
git commit -m "feat(budget): 销售下单建议(修正:纯差旅无人工时差旅费不再被静默丢弃)"
```

---

## Task 6: `lib/budget/crmText.ts` —— CRM 审批建议

**Files:**
- Create: `frontend/src/lib/budget/crmText.ts`
- Test: `frontend/src/lib/budget/crmText.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `CalcResult`
- Produces: `genCrmText(r: CalcResult): string`

**模板（原样保留，逐字不改）：**

```
该项目评估后，
1.预计项目经理{PM人天}人天；
2.相关产品部署原厂工程师{原厂技服人天}人天、外包{产品外包人天}人天；
3.其他服务原厂工程师{服务技服人天}人天、外包{服务外包人天}人天；
4.直接成本{¥直接成本}
```

口径（注意第 2 条**含 PM 模块内的技术服务人天**）：

| 占位 | 口径 |
|---|---|
| PM人天 | `pmDays1 + pmDays2` |
| 原厂技服人天 | `prodTechDays1 + pmTechDays1 + prodTechDays2 + pmTechDays2` |
| 产品外包人天 | `prodOutDays1 + prodOutDays2` |
| 服务技服人天 | `svcTechDays1 + svcTechDays2` |
| 服务外包人天 | `svcOutDays1 + svcOutDays2` |
| 直接成本 | `directCost` |

人天 `toFixed(1)`；金额千分位、最多 2 位小数。

- [ ] **Step 1: 写失败的测试 `frontend/src/lib/budget/crmText.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { genCrmText } from './crmText'
import type { CalcResult } from './types'

const ZERO: CalcResult = {
  pmDays1: 0, pmDays2: 0, pmTechDays1: 0, pmTechDays2: 0,
  prodTechDays1: 0, prodTechDays2: 0, prodOutDays1: 0, prodOutDays2: 0,
  svcTechDays1: 0, svcTechDays2: 0, svcOutDays1: 0, svcOutDays2: 0,
  pmCost: 0, pmTechCost: 0, prodTechCost: 0, prodOutCost: 0, svcTechCost: 0, svcOutCost: 0,
  laborCost: 0, travelAllowance: 0, hotelCost: 0, hotelOutCost: 0, directCost: 0,
  totalCost: 0, salesAmount: 0, costRatio: null, ratioStatus: 'na',
}

describe('genCrmText', () => {
  it('四条编号句式齐备,人天保留 1 位小数', () => {
    const t = genCrmText({ ...ZERO, pmDays1: 3, pmDays2: 2 })
    expect(t).toContain('该项目评估后，')
    expect(t).toContain('1.预计项目经理5.0人天；')
    expect(t).toContain('2.相关产品部署原厂工程师')
    expect(t).toContain('3.其他服务原厂工程师')
    expect(t).toContain('4.直接成本')
  })

  it('第2条的原厂工程师人天**含 PM 模块内的技术服务人天**', () => {
    const t = genCrmText({ ...ZERO, prodTechDays1: 2, prodTechDays2: 1,
                          pmTechDays1: 3, pmTechDays2: 4, prodOutDays1: 5 })
    // 2 + 3 + 1 + 4 = 10.0;外包 5.0
    expect(t).toContain('2.相关产品部署原厂工程师10.0人天、外包5.0人天；')
  })

  it('第3条只统计其他服务的人天', () => {
    const t = genCrmText({ ...ZERO, svcTechDays1: 1, svcTechDays2: 2,
                          svcOutDays1: 3, svcOutDays2: 4 })
    expect(t).toContain('3.其他服务原厂工程师3.0人天、外包7.0人天；')
  })

  it('直接成本带千分位', () => {
    expect(genCrmText({ ...ZERO, directCost: 12345.6 })).toContain('4.直接成本¥12,345.6')
  })

  it('全零时各项显示 0.0 人天与 ¥0', () => {
    const t = genCrmText({ ...ZERO })
    expect(t).toContain('1.预计项目经理0.0人天；')
    expect(t).toContain('4.直接成本¥0')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/budget/crmText.test.ts`
Expected: FAIL —— 找不到 `./crmText`

- [ ] **Step 3: 实现 `frontend/src/lib/budget/crmText.ts`**

```ts
import type { CalcResult } from './types'

const d1 = (v: number): string => (Number(v) || 0).toFixed(1)

/** 金额:千分位,最多 2 位小数(整数不补 .00)。 */
function money(v: number): string {
  const n = Number(v) || 0
  return '¥' + n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

/** CRM 审批建议。模板逐字沿用原工具 —— 这段文字要贴进 CRM 走审批,不能改口径也不能改措辞。
 *
 *  注意第 2 条的「原厂工程师」人天**含 PM 模块内的技术服务人天**(pmTechDays1/2)。 */
export function genCrmText(r: CalcResult): string {
  const pmDays = r.pmDays1 + r.pmDays2
  const prodTech = r.prodTechDays1 + r.pmTechDays1 + r.prodTechDays2 + r.pmTechDays2
  const prodOut = r.prodOutDays1 + r.prodOutDays2
  const svcTech = r.svcTechDays1 + r.svcTechDays2
  const svcOut = r.svcOutDays1 + r.svcOutDays2
  return [
    '该项目评估后，',
    `1.预计项目经理${d1(pmDays)}人天；`,
    `2.相关产品部署原厂工程师${d1(prodTech)}人天、外包${d1(prodOut)}人天；`,
    `3.其他服务原厂工程师${d1(svcTech)}人天、外包${d1(svcOut)}人天；`,
    `4.直接成本${money(r.directCost)}`,
  ].join('\n')
}
```

- [ ] **Step 4: 跑测试确认通过并提交**

```bash
cd frontend && npx vitest run src/lib/budget/crmText.test.ts && npm run typecheck
cd .. && git add frontend/src/lib/budget/crmText.ts frontend/src/lib/budget/crmText.test.ts
git commit -m "feat(budget): CRM 审批建议自动生成"
```

---

## Task 7: `lib/budget/exportEstimate.ts` —— 8-sheet Excel 导出

**Files:**
- Create: `frontend/src/lib/budget/exportEstimate.ts`
- Test: `frontend/src/lib/budget/exportEstimate.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `BudgetForm` / `BudgetConfig` / `CalcResult`；Task 5 的 `SalesOrder`；既有 `lib/exportXlsx.ts` 的 `exportSheets(filename, sheets)`
- Produces:
  - `buildSheets(form, cfg, r, order): { name: string; rows: Record<string, unknown>[] }[]`（**纯函数，可测**）
  - `exportEstimate(form, cfg, r, order): void`（调 `exportSheets` 触发下载）
  - `estimateFileName(quoteName: string, today: Date): string` → `概算_{名称}_{YYYYMMDD}.xlsx`

> **禁止引入 exceljs / file-saver。** 原工具从 jsdelivr CDN 加载它们，内网必然失败。平台已内置 `xlsx`(SheetJS)，`lib/exportXlsx.ts` 的 `exportSheets()` 就是为多 sheet 导出准备的。

**8 个 sheet：**

| # | Sheet | 列 |
|---|---|---|
| 1 | 项目基本信息 | `字段` / `内容`：9 项基本信息 + 概算汇总（PM 一类/二类人天、技服一类/二类人天、外包一类/二类人天、直接成本、总成本、销售下单金额） |
| 2 | 成本比例 | `项目` / `数值`：成本比例、建议范围、状态、异常说明 |
| 3 | **产品实施** | `产品名称` / `类型` / `数量` / `单台标准人天` / `设备系数` / `合计参考人天` / `一类技服人天` / `二类技服人天` / `一类外包人天` / `二类外包人天` / `工作内容说明` |
| 4 | 项目经理 | `阶段` / `PM(一类人天)` / `PM(二类人天)` / `技术服务(一类人天)` / `技术服务(二类人天)` / `工作内容` |
| 5 | 其他服务 | `服务名称` / `工作内容` / `一类技服` / `二类技服` / `一类外包` / `二类外包` |
| 6 | 直接成本 | `项目` / `类型` / `数值`（差补 ×2、住宿 ×4、外包差旅 ×2、交通 ×3 = 11 行） |
| 7 | **CRM审批建议** | `审批建议` |
| 8 | **销售下单建议** | `物料编号` / `物料名称` / `单价` / `数量` / `金额`（+ 合计行） |

**产品实施 sheet 的三点补全**（原工具都漏了）：
1. 类型三态：`标准实施` / `非标准实施` / `自定义产品`
2. 补 `数量` / `单台标准人天` / `设备系数` / `合计参考人天` 四列 —— 让审批人看得到人天是怎么估出来的
3. `工作内容说明` 输出**真实内容**：标准实施 → 该产品在配置目录里的 `stdDesc`；非标实施 → 用户填的 `nonStdDesc`；自定义产品 → 用户填的 `customDesc`。**不再对所有产品输出同一句写死的通用文案**

一个产品若标准段与非标段都填了人天，导出**两行**（类型不同）；全零的段不导出。

- [ ] **Step 1: 写失败的测试 `frontend/src/lib/budget/exportEstimate.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { buildSheets, estimateFileName, exportEstimate } from './exportEstimate'
import { calcBudget, emptyForm } from './calc'
import { calcSalesOrder } from './salesOrder'
import type { BudgetConfig, BudgetForm, DayCells } from './types'

vi.mock('@/lib/exportXlsx', () => ({ exportSheets: vi.fn(), exportRows: vi.fn() }))
import { exportSheets } from '@/lib/exportXlsx'

const CFG: BudgetConfig = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [
    { key: 'pm', code: 'JY-CPJF-OTHER-PM', name: 'PM一线' },
    { key: 'pm2ndc', code: 'JY-CPJF-OTHER-PM-2NDC-PISN', name: 'PM二线' },
    { key: 'eng1stc', code: 'JY-CPJF-AZ-OTHER-1STC-ENG', name: '工程师一线' },
    { key: 'eng2ndc', code: 'JY-CPJF-AZ-OTHER-2NDC-ENG', name: '工程师二线' },
  ],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: '这是防火墙自己的标准实施说明', nonstdDesc: '目录里的非标说明' }],
  pmPhases: [{ name: '项目启动阶段', content: '启动模板' },
             { name: '项目规划阶段', content: '规划模板' }],
  services: [{ name: '巡检服务', desc: '巡检说明' }],
}

const Z: DayCells = { tech1: 0, tech2: 0, out1: 0, out2: 0 }
const cells = (p: Partial<DayCells>): DayCells => ({ ...Z, ...p })

function fullForm(): BudgetForm {
  const f = emptyForm(CFG)
  f.basic = { quoteName: '某某项目', customerName: '某客户', salesName: '张三',
              location: '北京', projectAmount: 100, projectLevel: 'P2',
              customerLevel: 'TOP1000', signType: '直签', thirdParty: '否' }
  f.products = [{
    uid: 'u1', id: '1.1', name: '防火墙', isCustom: false,
    qty: 3, stdDays: 1.5, coefficient: 0.8,
    std: cells({ tech1: 2 }),
    nonStdDesc: '用户填的非标工作内容', nonStd: cells({ tech2: 1 }),
    customDesc: '', custom: Z,
  }, {
    uid: 'u2', id: 'other', name: '自定义产品X', isCustom: true,
    qty: 0, stdDays: 0, coefficient: 0, std: Z, nonStdDesc: '', nonStd: Z,
    customDesc: '用户填的自定义工作内容', custom: cells({ out1: 4 }),
  }]
  f.pmPhases[0].pm1 = 5
  f.services = [{ uid: 's1', name: '巡检服务', isOther: false,
                  content: '季度巡检', cells: cells({ tech1: 2 }) }]
  f.direct.allowanceDomDays = 3
  f.direct.localTransportBase = 100
  f.direct.localTransportTrip = 200
  f.ratioExplanation = ''
  f.crmText = '该项目评估后，\n1.预计项目经理5.0人天；'
  return f
}

function sheetsOf() {
  const f = fullForm()
  const r = calcBudget(f, CFG)
  return { f, r, sheets: buildSheets(f, CFG, r, calcSalesOrder(r, f.margin, CFG)) }
}

describe('buildSheets', () => {
  it('恰好 8 个 sheet,名称与顺序固定', () => {
    const { sheets } = sheetsOf()
    expect(sheets.map((s) => s.name)).toEqual([
      '项目基本信息', '成本比例', '产品实施', '项目经理',
      '其他服务', '直接成本', 'CRM审批建议', '销售下单建议',
    ])
  })

  it('基本信息 sheet 含 9 项信息与概算汇总', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[0].rows as { 字段: string; 内容: unknown }[]
    const get = (k: string) => rows.find((x) => x.字段 === k)?.内容
    expect(get('报价名称')).toBe('某某项目')
    expect(get('客户名称')).toBe('某客户')
    expect(get('项目金额（万元）')).toBe(100)
    expect(get('项目级别')).toBe('P2')
    expect(get('是否含第三方外采')).toBe('否')
    expect(get('总成本')).toBeDefined()
    expect(get('销售下单金额')).toBeDefined()
  })

  it('产品实施 sheet:标准段与非标段各出一行,类型不同', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[2].rows as Record<string, unknown>[]
    const types = rows.map((x) => x['类型'])
    expect(types).toEqual(['标准实施', '非标准实施', '自定义产品'])
  })

  it('产品实施 sheet:补齐 数量/单台标准人天/设备系数/合计参考人天 四列', () => {
    const { sheets } = sheetsOf()
    const std = (sheets[2].rows as Record<string, unknown>[])[0]
    expect(std['数量']).toBe(3)
    expect(std['单台标准人天']).toBe(1.5)
    expect(std['设备系数']).toBe(0.8)
    expect(std['合计参考人天']).toBe(3.6)          // 3 × 1.5 × 0.8
    expect(std['一类技服人天']).toBe(2)
  })

  it('产品实施 sheet:工作内容说明取真实内容,不是一句写死的通用文案', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[2].rows as Record<string, unknown>[]
    expect(rows[0]['工作内容说明']).toBe('这是防火墙自己的标准实施说明')   // 标准 → 目录 stdDesc
    expect(rows[1]['工作内容说明']).toBe('用户填的非标工作内容')           // 非标 → 用户填的
    expect(rows[2]['工作内容说明']).toBe('用户填的自定义工作内容')         // 自定义 → 用户填的
    // 三行的说明必须互不相同(原工具三行是同一句)
    const descs = rows.map((x) => x['工作内容说明'])
    expect(new Set(descs).size).toBe(3)
  })

  it('产品实施 sheet:人天全零的段不导出', () => {
    const f = emptyForm(CFG)
    f.basic.quoteName = 'x'
    f.products = [{ uid: 'u', id: '1.1', name: '防火墙', isCustom: false,
                    qty: 1, stdDays: 1.5, coefficient: 0.8,
                    std: cells({ tech1: 1 }), nonStdDesc: '', nonStd: Z,
                    customDesc: '', custom: Z }]
    const r = calcBudget(f, CFG)
    const rows = buildSheets(f, CFG, r, calcSalesOrder(r, f.margin, CFG))[2].rows
    expect(rows.length).toBe(1)                     // 非标段全零 → 不出行
  })

  it('成本比例 sheet 含比例/建议范围/状态,建议范围取自配置', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[1].rows as { 项目: string; 数值: unknown }[]
    const get = (k: string) => rows.find((x) => x.项目 === k)?.数值
    expect(get('建议范围')).toBe('3% - 15%')
    expect(String(get('状态'))).toMatch(/正常|偏高|偏低/)
  })

  it('项目经理 sheet:每个阶段一行,含四类人天与工作内容', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[3].rows as Record<string, unknown>[]
    expect(rows.length).toBe(2)                     // CFG 里两个阶段
    expect(rows[0]['阶段']).toBe('项目启动阶段')
    expect(rows[0]['PM(一类人天)']).toBe(5)
  })

  it('直接成本 sheet:11 行,含两个独立的交通类目', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[5].rows as { 项目: string }[]
    expect(rows.length).toBe(11)
    const names = rows.map((x) => x.项目)
    expect(names).toContain('本地交通（员工base地）')
    expect(names).toContain('当地交通（差旅期间）')
    expect(names).toContain('城际交通')
  })

  it('CRM审批建议 sheet 输出正文', () => {
    const { sheets } = sheetsOf()
    expect(String((sheets[6].rows[0] as Record<string, unknown>)['审批建议']))
      .toContain('该项目评估后')
  })

  it('销售下单建议 sheet:4 个物料行 + 1 个合计行', () => {
    const { sheets } = sheetsOf()
    const rows = sheets[7].rows as Record<string, unknown>[]
    expect(rows.length).toBe(5)
    expect(rows[0]['物料编号']).toBe('JY-CPJF-OTHER-PM')
    expect(rows[4]['物料名称']).toBe('合计')
    const sum = rows.slice(0, 4).reduce((s, x) => s + Number(x['金额']), 0)
    expect(rows[4]['金额']).toBe(sum)
  })
})

describe('estimateFileName', () => {
  it('概算_{名称}_{YYYYMMDD}.xlsx —— 按本地日期,不用 toISOString(时区会退一天)', () => {
    expect(estimateFileName('某某项目', new Date(2026, 6, 13)))
      .toBe('概算_某某项目_20260713.xlsx')
  })
})

describe('exportEstimate', () => {
  it('调用 exportSheets 并传入 8 个 sheet', () => {
    const { f, r } = sheetsOf()
    exportEstimate(f, CFG, r, calcSalesOrder(r, f.margin, CFG), new Date(2026, 6, 13))
    expect(exportSheets).toHaveBeenCalledTimes(1)
    const [filename, sheets] = (exportSheets as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0] as [string, { name: string }[]]
    expect(filename).toBe('概算_某某项目_20260713.xlsx')
    expect(sheets.length).toBe(8)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/budget/exportEstimate.test.ts`
Expected: FAIL —— 找不到 `./exportEstimate`

- [ ] **Step 3: 实现 `frontend/src/lib/budget/exportEstimate.ts`**

```ts
import { exportSheets } from '@/lib/exportXlsx'
import { productTotalDays } from './calc'
import type { SalesOrder } from './salesOrder'
import type { BudgetConfig, BudgetForm, CalcResult, ProductRow } from './types'

type Row = Record<string, unknown>
export interface Sheet { name: string; rows: Row[] }

const STATUS_TEXT: Record<string, string> = {
  low: '比例偏低', normal: '比例正常', high: '比例偏高', na: '未判定',
}

/** 文件名里的日期用**本地**年月日拼 —— toISOString() 会把本地零点退回前一天(UTC+8 下 off-by-one)。 */
export function estimateFileName(quoteName: string, today: Date): string {
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `概算_${quoteName}_${y}${m}${d}.xlsx`
}

const hasDays = (c: { tech1: number; tech2: number; out1: number; out2: number }): boolean =>
  (c.tech1 || 0) + (c.tech2 || 0) + (c.out1 || 0) + (c.out2 || 0) > 0

/** 产品实施 sheet 的行。
 *
 *  原工具丢了 数量/单台标准人天/设备系数/合计参考人天 四列(审批人看不到人天是怎么估出来的),
 *  且「说明」列对 19 个产品输出**同一句写死的通用文案**。这里两处都补上:
 *  标准实施取该产品目录里的 stdDesc,非标与自定义取用户填的内容。
 */
function productRows(form: BudgetForm, cfg: BudgetConfig): Row[] {
  const rows: Row[] = []
  const defOf = (p: ProductRow) => cfg.products.find((x) => x.id === p.id)
  for (const p of form.products) {
    if (p.isCustom) {
      if (!hasDays(p.custom)) continue
      rows.push({
        产品名称: p.name, 类型: '自定义产品',
        数量: '', 单台标准人天: '', 设备系数: '', 合计参考人天: '',
        一类技服人天: p.custom.tech1, 二类技服人天: p.custom.tech2,
        一类外包人天: p.custom.out1, 二类外包人天: p.custom.out2,
        工作内容说明: p.customDesc,
      })
      continue
    }
    if (hasDays(p.std)) {
      rows.push({
        产品名称: p.name, 类型: '标准实施',
        数量: p.qty, 单台标准人天: p.stdDays, 设备系数: p.coefficient,
        合计参考人天: productTotalDays(p.qty, p.stdDays, p.coefficient),
        一类技服人天: p.std.tech1, 二类技服人天: p.std.tech2,
        一类外包人天: p.std.out1, 二类外包人天: p.std.out2,
        工作内容说明: defOf(p)?.stdDesc ?? '',       // 该产品自己的标准实施说明
      })
    }
    if (hasDays(p.nonStd)) {
      rows.push({
        产品名称: p.name, 类型: '非标准实施',
        数量: '', 单台标准人天: '', 设备系数: '', 合计参考人天: '',
        一类技服人天: p.nonStd.tech1, 二类技服人天: p.nonStd.tech2,
        一类外包人天: p.nonStd.out1, 二类外包人天: p.nonStd.out2,
        工作内容说明: p.nonStdDesc,                   // 用户填的
      })
    }
  }
  return rows
}

export function buildSheets(form: BudgetForm, cfg: BudgetConfig,
                            r: CalcResult, order: SalesOrder): Sheet[] {
  const b = form.basic

  const basicRows: Row[] = [
    { 字段: '报价名称', 内容: b.quoteName },
    { 字段: '客户名称', 内容: b.customerName },
    { 字段: '销售', 内容: b.salesName },
    { 字段: '项目所在地', 内容: b.location },
    { 字段: '项目金额（万元）', 内容: b.projectAmount ?? '' },
    { 字段: '项目级别', 内容: b.projectLevel },
    { 字段: '客户级别', 内容: b.customerLevel },
    { 字段: '签约类型', 内容: b.signType },
    { 字段: '是否含第三方外采', 内容: b.thirdParty },
    { 字段: '', 内容: '' },
    { 字段: '【概算汇总】', 内容: '' },
    { 字段: 'PM（一类人天）', 内容: r.pmDays1 },
    { 字段: 'PM（二类人天）', 内容: r.pmDays2 },
    { 字段: '技术服务（一类人天）', 内容: r.prodTechDays1 + r.pmTechDays1 + r.svcTechDays1 },
    { 字段: '技术服务（二类人天）', 内容: r.prodTechDays2 + r.pmTechDays2 + r.svcTechDays2 },
    { 字段: '外包服务（一类人天）', 内容: r.prodOutDays1 + r.svcOutDays1 },
    { 字段: '外包服务（二类人天）', 内容: r.prodOutDays2 + r.svcOutDays2 },
    { 字段: '直接成本', 内容: r.directCost },
    { 字段: '总成本（未含税）', 内容: r.totalCost },
    { 字段: '销售下单金额', 内容: r.salesAmount },
  ]

  const ratioRows: Row[] = [
    { 项目: '成本比例', 数值: r.costRatio === null ? '--' : `${r.costRatio.toFixed(2)}%` },
    { 项目: '建议范围', 数值: `${cfg.ratio.min}% - ${cfg.ratio.max}%` },
    { 项目: '状态', 数值: STATUS_TEXT[r.ratioStatus] },
  ]
  if (form.ratioExplanation.trim()) {
    ratioRows.push({ 项目: '异常说明', 数值: form.ratioExplanation })
  }

  const pmRows: Row[] = form.pmPhases.map((p) => ({
    阶段: p.name,
    'PM(一类人天)': p.pm1, 'PM(二类人天)': p.pm2,
    '技术服务(一类人天)': p.tech1, '技术服务(二类人天)': p.tech2,
    工作内容: p.note,
  }))

  const svcRows: Row[] = form.services.map((s) => ({
    服务名称: s.name, 工作内容: s.content,
    一类技服: s.cells.tech1, 二类技服: s.cells.tech2,
    一类外包: s.cells.out1, 二类外包: s.cells.out2,
  }))

  const d = form.direct
  const directRows: Row[] = [
    { 项目: '差补（境内）', 类型: '天数', 数值: d.allowanceDomDays },
    { 项目: '差补（境外）', 类型: '天数', 数值: d.allowanceIntlDays },
    { 项目: '住宿（一线城市）', 类型: '晚数', 数值: d.hotelType1 },
    { 项目: '住宿（省会城市）', 类型: '晚数', 数值: d.hotelCapital },
    { 项目: '住宿（其他城市）', 类型: '晚数', 数值: d.hotelOther },
    { 项目: '住宿（港澳）', 类型: '晚数', 数值: d.hotelHk },
    { 项目: '外包差旅（一类城市）', 类型: '晚数', 数值: d.hotelOutType1 },
    { 项目: '外包差旅（二类城市）', 类型: '晚数', 数值: d.hotelOutType2 },
    // 两个交通字段是两个类目:前者是员工常驻地交通费,后者属差旅费用。
    { 项目: '本地交通（员工base地）', 类型: '金额（元）', 数值: d.localTransportBase },
    { 项目: '当地交通（差旅期间）', 类型: '金额（元）', 数值: d.localTransportTrip },
    { 项目: '城际交通', 类型: '金额（元）', 数值: d.interCityTransport },
  ]

  const orderRows: Row[] = order.rows.map((x) => ({
    物料编号: x.code, 物料名称: x.name, 单价: x.price, 数量: x.qty, 金额: x.amount,
  }))
  orderRows.push({ 物料编号: '', 物料名称: '合计', 单价: '', 数量: '', 金额: order.grandTotal })

  return [
    { name: '项目基本信息', rows: basicRows },
    { name: '成本比例', rows: ratioRows },
    { name: '产品实施', rows: productRows(form, cfg) },
    { name: '项目经理', rows: pmRows },
    { name: '其他服务', rows: svcRows },
    { name: '直接成本', rows: directRows },
    { name: 'CRM审批建议', rows: [{ 审批建议: form.crmText }] },
    { name: '销售下单建议', rows: orderRows },
  ]
}

export function exportEstimate(form: BudgetForm, cfg: BudgetConfig, r: CalcResult,
                               order: SalesOrder, today: Date = new Date()): void {
  exportSheets(estimateFileName(form.basic.quoteName, today),
               buildSheets(form, cfg, r, order))
}
```

> ⚠ `exportSheets()` 会 **`.filter((s) => s.rows && s.rows.length)`** 丢掉空 sheet。若某份报价没填产品/服务，那两个 sheet 就不会出现在文件里 —— 这是既有工具的行为，可接受。测试里的 `fullForm()` 各段都填了，所以 8 个 sheet 齐备。

- [ ] **Step 4: 跑测试确认通过并提交**

```bash
cd frontend && npx vitest run src/lib/budget/exportEstimate.test.ts && npm run typecheck
cd .. && git add frontend/src/lib/budget/exportEstimate.ts frontend/src/lib/budget/exportEstimate.test.ts
git commit -m "feat(budget): 8-sheet Excel 导出(补 CRM/销售下单,产品实施补全列与真实说明)"
```

---

## Task 8: `lib/budgetApi.ts` + 两个 store

**Files:**
- Create: `frontend/src/lib/budgetApi.ts`
- Create: `frontend/src/stores/budgetConfig.ts`
- Create: `frontend/src/stores/budget.ts`
- Test: `frontend/src/stores/budget.test.ts`

**Interfaces:**
- Consumes: Task 3 的 5 个端点；Task 4 的类型与 `calcBudget` / `emptyForm`；Task 5 的 `calcSalesOrder`；Task 6 的 `genCrmText`
- Produces（Task 9-13 消费）：
  - `budgetApi`: `getBudgetConfig()` / `saveBudgetConfig(cfg)` / `listEstimates(all?)` / `getEstimate(id)` / `saveEstimate(body)` / `deleteEstimate(id)`；类型 `EstimateMeta` / `EstimateRecord`
  - `useBudgetConfigStore()`: `config` / `loaded` / `saving` / `load()` / `save(cfg)`
  - `useBudgetStore()`: `form` / `currentId` / `rateSnapshot` / `dirty` / `effectiveConfig`(computed) / `result`(computed) / `salesOrder`(computed) / `snapshotStale`(computed) / `reset(cfg)` / `loadRecord(rec)` / `useLatestRates(cfg)` / `markSaved(id)` / `syncCrmText()` / `restoreCrmAuto()` / `toPayload(saveAsNew)`

**费率快照的关键逻辑（`effectiveConfig`）：**

- 新建报价（`rateSnapshot === null`）→ 用**当前配置**算
- 打开旧存档（`rateSnapshot !== null`）→ 用**快照**算，页面顶部提示；点「按最新费率重算」调 `useLatestRates(cfg)` 把 `rateSnapshot` 置空并标脏
- `snapshotStale` = 快照存在 且 与当前配置不等（`JSON.stringify` 比较即可 —— 配置是纯数据、键序由后端 `validate_config` 固定，不会因键序抖动误判）

- [ ] **Step 1: 写 `frontend/src/lib/budgetApi.ts`**

```ts
import { api } from '@/api/client'
import type { BudgetConfig } from '@/lib/budget/types'

/** 存档列表的轻量元信息(后端 budget_store.meta_of)。不含 data / rateSnapshot。 */
export interface EstimateMeta {
  id: string
  account: string
  quoteName: string
  createdAt: string
  updatedAt: string
  customerName: string
  salesName: string
  projectAmount: number | null
  totalCost: number | null
  salesAmount: number | null
  costRatio: number | null
  ratioStatus: string
}

/** 整条存档记录。rateSnapshot = 保存那一刻的完整费率配置(报价可复现的根据)。 */
export interface EstimateRecord extends EstimateMeta {
  data: unknown
  rateSnapshot: BudgetConfig
  summary: Record<string, unknown>
}

/** 费率与目录配置。登录 + budget 授权即可读(页面要用它算);写须超管。 */
export async function getBudgetConfig(): Promise<BudgetConfig> {
  const r = await api.get<{ success: boolean; config: BudgetConfig }>('/api/budget/config')
  return r.config
}

/** 保存配置(超管专属)。改完立即生效,无需点「更新数据」。 */
export async function saveBudgetConfig(cfg: BudgetConfig): Promise<BudgetConfig> {
  const r = await api.post<{ success: boolean; config: BudgetConfig }>('/api/budget/config', cfg)
  return r.config
}

/** 存档列表。all=true 仅对超管有效 —— 普通管理员传了后端也只返回自己的。 */
export async function listEstimates(all = false): Promise<EstimateMeta[]> {
  const r = await api.get<{ success: boolean; items: EstimateMeta[] }>(
    '/api/budget/estimates' + (all ? '?all=1' : ''))
  return r.items
}

export async function getEstimate(id: string): Promise<EstimateRecord> {
  const r = await api.get<{ success: boolean; record: EstimateRecord }>(
    `/api/budget/estimates?id=${encodeURIComponent(id)}`)
  return r.record
}

/** 带 id → 覆盖(后端校验 owner/超管);不带 id → 新建。 */
export async function saveEstimate(body: {
  id?: string
  quoteName: string
  data: unknown
  rateSnapshot: BudgetConfig
  summary: Record<string, unknown>
}): Promise<EstimateRecord> {
  const r = await api.post<{ success: boolean; record: EstimateRecord }>(
    '/api/budget/estimates', body)
  return r.record
}

export async function deleteEstimate(id: string): Promise<void> {
  await api.post<{ success: boolean }>('/api/budget/estimates/delete', { id })
}
```

- [ ] **Step 2: 写 `frontend/src/stores/budgetConfig.ts`**

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBudgetConfig, saveBudgetConfig } from '@/lib/budgetApi'
import type { BudgetConfig } from '@/lib/budget/types'

/** 费率与目录配置。默认值在后端(budget_config.py);前端不备份一份默认,
 *  拿不到就报错让页面显示错误 —— 概算的每个数都依赖它,静默用猜的默认值会算出错的报价。 */
export const useBudgetConfigStore = defineStore('budgetConfig', () => {
  const config = ref<BudgetConfig | null>(null)
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')

  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return
    loading.value = true
    error.value = ''
    try {
      config.value = await getBudgetConfig()
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '费率配置加载失败'
    } finally {
      loading.value = false
    }
  }

  async function save(next: BudgetConfig): Promise<void> {
    saving.value = true
    try {
      config.value = await saveBudgetConfig(next)
    } finally {
      saving.value = false
    }
  }

  return { config, loaded, loading, saving, error, load, save }
})
```

- [ ] **Step 3: 写失败的测试 `frontend/src/stores/budget.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBudgetStore } from './budget'
import type { BudgetConfig, EstimateRecordLike } from '@/lib/budget/types'

const CFG: BudgetConfig = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [
    { key: 'pm', code: 'C1', name: 'PM一线' },
    { key: 'pm2ndc', code: 'C2', name: 'PM二线' },
    { key: 'eng1stc', code: 'C3', name: '工程师一线' },
    { key: 'eng2ndc', code: 'C4', name: '工程师二线' },
  ],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%' }, { value: 0.06, label: '6%' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: 's', nonstdDesc: 'n' }],
  pmPhases: [{ name: '项目启动阶段', content: '模板1' }],
  services: [{ name: '巡检服务', desc: 'd' }],
}
const OLD_CFG: BudgetConfig = { ...CFG, fx: 6.0, rates: {
  city1: { pm: 1000, tech: 800, out: 600 }, city2: { pm: 900, tech: 700, out: 500 } } }

describe('useBudgetStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('reset:按配置生成空表单,currentId 与 rateSnapshot 为空,不脏', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    expect(s.currentId).toBe('')
    expect(s.rateSnapshot).toBeNull()
    expect(s.dirty).toBe(false)
    expect(s.form.pmPhases.map((p) => p.name)).toEqual(['项目启动阶段'])
  })

  it('新建报价:effectiveConfig = 当前配置', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    expect(s.effectiveConfig?.fx).toBe(6.8)
  })

  it('打开旧存档:effectiveConfig = 快照(不是当前配置) —— 报价必须可复现', () => {
    const s = useBudgetStore()
    s.setCurrentConfig(CFG)
    s.loadRecord({
      id: 'e1', quoteName: '旧报价',
      data: { ...s.form, basic: { ...s.form.basic, quoteName: '旧报价' } },
      rateSnapshot: OLD_CFG,
    } as unknown as EstimateRecordLike)
    expect(s.currentId).toBe('e1')
    expect(s.effectiveConfig?.fx).toBe(6.0)                 // 用快照
    expect(s.effectiveConfig?.rates.city1.pm).toBe(1000)
    expect(s.dirty).toBe(false)                             // 刚打开不算改动
  })

  it('快照与当前配置不同 → snapshotStale 为真(页面据此提示费率已更新)', () => {
    const s = useBudgetStore()
    s.setCurrentConfig(CFG)
    s.loadRecord({ id: 'e1', quoteName: 'x', data: s.form,
                   rateSnapshot: OLD_CFG } as unknown as EstimateRecordLike)
    expect(s.snapshotStale).toBe(true)
  })

  it('快照与当前配置一致 → snapshotStale 为假(不该弹无谓的提示)', () => {
    const s = useBudgetStore()
    s.setCurrentConfig(CFG)
    s.loadRecord({ id: 'e1', quoteName: 'x', data: s.form,
                   rateSnapshot: { ...CFG } } as unknown as EstimateRecordLike)
    expect(s.snapshotStale).toBe(false)
  })

  it('useLatestRates:清空快照 → 改用当前配置算,并标脏(须重新保存才落盘)', () => {
    const s = useBudgetStore()
    s.setCurrentConfig(CFG)
    s.loadRecord({ id: 'e1', quoteName: 'x', data: s.form,
                   rateSnapshot: OLD_CFG } as unknown as EstimateRecordLike)
    s.useLatestRates()
    expect(s.rateSnapshot).toBeNull()
    expect(s.effectiveConfig?.fx).toBe(6.8)
    expect(s.dirty).toBe(true)
  })

  it('result 与 salesOrder 随表单实时重算', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.pmPhases[0].pm1 = 10
    s.form.basic.projectAmount = 100
    expect(s.result?.totalCost).toBe(20000)
    expect(s.result?.salesAmount).toBeCloseTo(22600, 6)
    expect(s.result?.costRatio).toBeCloseTo(2.26, 6)
    expect(s.salesOrder?.rows.find((r) => r.key === 'pm')?.qty).toBe(Math.ceil(22600 / 2400))
  })

  it('syncCrmText:未手改时自动覆盖;手改后不再覆盖;restoreCrmAuto 可恢复', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.pmPhases[0].pm1 = 3
    s.syncCrmText()
    expect(s.form.crmText).toContain('1.预计项目经理3.0人天；')

    s.form.crmText = '我手改的内容'
    s.form.crmUserEdited = true
    s.form.pmPhases[0].pm1 = 9
    s.syncCrmText()
    expect(s.form.crmText).toBe('我手改的内容')            // 手改后不被覆盖

    s.restoreCrmAuto()                                     // 原工具没有这个回头路
    expect(s.form.crmUserEdited).toBe(false)
    expect(s.form.crmText).toContain('1.预计项目经理9.0人天；')
  })

  it('toPayload:新建不带 id;另存为新报价强制不带 id', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = '某报价'
    expect(s.toPayload(false).id).toBeUndefined()

    s.markSaved('e9')
    expect(s.toPayload(false).id).toBe('e9')               // 保存 = 覆盖
    expect(s.toPayload(true).id).toBeUndefined()           // 另存为 = 新建
  })

  it('toPayload:快照随记录一起提交(新建时用当前配置作为快照)', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = '某报价'
    const p = s.toPayload(false)
    expect(p.rateSnapshot.fx).toBe(6.8)
    expect(p.summary.totalCost).toBe(0)
    expect(p.quoteName).toBe('某报价')
  })

  it('markSaved:落 id 并清脏', () => {
    const s = useBudgetStore()
    s.reset(CFG)
    s.setCurrentConfig(CFG)
    s.form.basic.quoteName = 'x'
    s.touch()
    expect(s.dirty).toBe(true)
    s.markSaved('e1')
    expect(s.currentId).toBe('e1')
    expect(s.dirty).toBe(false)
  })
})
```

> `EstimateRecordLike` 在 `types.ts` 里补一个最小类型：`export interface EstimateRecordLike { id: string; quoteName: string; data: BudgetForm; rateSnapshot: BudgetConfig }`。

- [ ] **Step 4: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/budget.test.ts`
Expected: FAIL —— 找不到 `./budget`

- [ ] **Step 5: 实现 `frontend/src/stores/budget.ts`**

```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { calcBudget, emptyForm } from '@/lib/budget/calc'
import { calcSalesOrder } from '@/lib/budget/salesOrder'
import { genCrmText } from '@/lib/budget/crmText'
import type { BudgetConfig, BudgetForm, EstimateRecordLike } from '@/lib/budget/types'

/** 概算表单的唯一状态源。
 *
 *  费率快照:新建报价用**当前配置**算;打开旧存档用**它自己的快照**算 —— 费率可配之后,
 *  "同一份报价什么时候打开都是同一个数"不再是白捡的保证,而报价是要拿去 CRM 上单的对外
 *  产物,必须可复现。点「按最新费率重算」才切到当前配置(切完要重新保存才落盘)。
 */
export const useBudgetStore = defineStore('budget', () => {
  const form = ref<BudgetForm>({} as BudgetForm)
  const currentId = ref('')
  const rateSnapshot = ref<BudgetConfig | null>(null)
  const currentConfig = ref<BudgetConfig | null>(null)   // 当前生效的全局配置(由页面注入)
  const dirty = ref(false)

  function setCurrentConfig(cfg: BudgetConfig): void {
    currentConfig.value = cfg
    if (!form.value.basic) reset(cfg)
  }

  function reset(cfg: BudgetConfig): void {
    form.value = emptyForm(cfg)
    currentId.value = ''
    rateSnapshot.value = null
    dirty.value = false
  }

  /** 打开一条存档:表单来自记录,费率来自记录自己的快照。 */
  function loadRecord(rec: EstimateRecordLike): void {
    form.value = rec.data
    currentId.value = rec.id
    rateSnapshot.value = rec.rateSnapshot
    dirty.value = false
  }

  /** 按最新费率重算:丢掉快照,改用当前配置。标脏 —— 不重新保存就不会落盘。 */
  function useLatestRates(): void {
    rateSnapshot.value = null
    dirty.value = true
  }

  function touch(): void { dirty.value = true }

  function markSaved(id: string): void {
    currentId.value = id
    dirty.value = false
  }

  /** 算这份报价该用哪套费率:有快照用快照,没有用当前配置。 */
  const effectiveConfig = computed<BudgetConfig | null>(
    () => rateSnapshot.value ?? currentConfig.value)

  /** 快照与当前配置不同 → 页面提示「本报价基于旧费率表」。
   *  配置是纯数据、键序由后端 validate_config 固定,JSON 字符串比较不会因键序抖动误判。 */
  const snapshotStale = computed(() =>
    !!rateSnapshot.value && !!currentConfig.value
    && JSON.stringify(rateSnapshot.value) !== JSON.stringify(currentConfig.value))

  const result = computed(() => {
    const cfg = effectiveConfig.value
    if (!cfg || !form.value.basic) return null
    return calcBudget(form.value, cfg)
  })

  const salesOrder = computed(() => {
    const cfg = effectiveConfig.value
    if (!cfg || !result.value) return null
    return calcSalesOrder(result.value, form.value.margin, cfg)
  })

  /** 用户手改过 CRM 文案就不再自动覆盖(原工具同样行为,但它没有回头路)。 */
  function syncCrmText(): void {
    if (form.value.crmUserEdited || !result.value) return
    form.value.crmText = genCrmText(result.value)
  }

  /** 恢复自动生成 —— 原工具缺的那个回头路。 */
  function restoreCrmAuto(): void {
    form.value.crmUserEdited = false
    if (result.value) form.value.crmText = genCrmText(result.value)
    dirty.value = true
  }

  /** 提交体。saveAsNew=true → 强制不带 id(后端据此新建)。
   *  快照:打开的旧档带原快照;新建/已重算的带当前配置。 */
  function toPayload(saveAsNew: boolean) {
    const cfg = effectiveConfig.value as BudgetConfig
    const r = result.value
    const b = form.value.basic
    return {
      ...(saveAsNew || !currentId.value ? {} : { id: currentId.value }),
      quoteName: b.quoteName,
      data: form.value,
      rateSnapshot: cfg,
      summary: {
        customerName: b.customerName,
        salesName: b.salesName,
        projectAmount: b.projectAmount,
        totalCost: r?.totalCost ?? 0,
        salesAmount: r?.salesAmount ?? 0,
        costRatio: r?.costRatio ?? null,
        ratioStatus: r?.ratioStatus ?? 'na',
      },
    }
  }

  return {
    form, currentId, rateSnapshot, currentConfig, dirty,
    effectiveConfig, snapshotStale, result, salesOrder,
    setCurrentConfig, reset, loadRecord, useLatestRates,
    touch, markSaved, syncCrmText, restoreCrmAuto, toPayload,
  }
})
```

- [ ] **Step 6: 跑测试确认通过并提交**

```bash
cd frontend && npx vitest run src/stores/budget.test.ts && npm run typecheck
cd .. && git add frontend/src/lib/budgetApi.ts frontend/src/stores/budgetConfig.ts frontend/src/stores/budget.ts frontend/src/stores/budget.test.ts frontend/src/lib/budget/types.ts
git commit -m "feat(budget): API 封装 + 配置/表单 store(费率快照:旧档用旧费率算)"
```

---

## Task 9: 路由 / 导航 / 权限接线 + 页面骨架

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts:1-7`（PageKey 联合类型加 `budget`）
- Modify: `frontend/src/nav.ts:57-61`（TOOL_LINKS 插入）
- Modify: `frontend/src/router/index.ts`（加路由）
- Create: `frontend/src/views/BudgetView.vue`（骨架）
- Test: `frontend/src/views/BudgetView.test.ts`
- Test: 追加用例到 `frontend/src/stores/auth.test.ts`

**Interfaces:**
- Consumes: Task 8 的两个 store
- Produces: `/budget` 路由（`meta.pageKey === 'budget'`）；`BudgetView.vue` 骨架供 Task 10-13 填充

> ⚠ **新增页面必须同时改三处**：`nav.ts` + `pageAccess.PAGE_OPTIONS` + `auth.firstAllowedPath()` 的 nav 全集。漏第三处 → 只授权该页的账号登录后找不到任何有权链接 → 弹回 `/login` → **死循环**。
> 本次 `/budget` 挂在既有的 `TOOL_LINKS` 数组里，而 `firstAllowedPath()` 已经遍历该数组，**所以第三处不用改代码 —— 但必须补一条回归测试把它钉死**。

- [ ] **Step 1: 写失败的测试**

追加到 `frontend/src/stores/auth.test.ts`（放在既有「仅倚天权限」那条回归之后）：

```ts
  // 回归:只授权概算工具的账号必须落到 /budget,不得被踢回 /login(否则登录死循环)
  it('firstAllowedPath:普通账号仅 budget 权限→/budget', () => {
    const s = useAuthStore()
    s.user = { account: 'g', displayName: 'g', isSuper: false,
               allowedPages: ['budget'], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/budget')
  })
```

追加到 `frontend/src/lib/pageAccess.test.ts`：

```ts
it('PAGE_OPTIONS 含概算工具(账号管理里必须能勾选,否则谁都授权不了)', () => {
  expect(PAGE_OPTIONS.some((o) => o.key === 'budget' && o.label === '概算工具')).toBe(true)
})
```

创建 `frontend/src/views/BudgetView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { BudgetConfig } from '@/lib/budget/types'

const { getCfg } = vi.hoisted(() => ({ getCfg: vi.fn() }))
vi.mock('@/lib/budgetApi', () => ({
  getBudgetConfig: getCfg,
  saveBudgetConfig: vi.fn(),
  listEstimates: vi.fn().mockResolvedValue([]),
  getEstimate: vi.fn(),
  saveEstimate: vi.fn(),
  deleteEstimate: vi.fn(),
}))

import BudgetView from './BudgetView.vue'

const CFG = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [{ key: 'pm', code: 'C1', name: 'PM一线' },
              { key: 'pm2ndc', code: 'C2', name: 'PM二线' },
              { key: 'eng1stc', code: 'C3', name: '工程师一线' },
              { key: 'eng2ndc', code: 'C4', name: '工程师二线' }],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%（含产品）' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: 's', nonstdDesc: 'n' }],
  pmPhases: [{ name: '项目启动阶段', content: '模板1' }],
  services: [{ name: '巡检服务', desc: 'd' }],
} as unknown as BudgetConfig

describe('BudgetView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getCfg.mockReset()
    getCfg.mockResolvedValue(CFG)
  })

  it('挂载即拉配置', async () => {
    mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(getCfg).toHaveBeenCalledTimes(1)
  })

  it('页面有内边距(.app-main 自身无 padding,每页自己给)', async () => {
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('.budget-view').exists()).toBe(true)
  })

  it('配置加载失败 → 显示错误,不静默用猜的默认值算报价', async () => {
    getCfg.mockRejectedValue(new Error('无概算工具页面权限'))
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('无概算工具页面权限')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/BudgetView.test.ts src/stores/auth.test.ts src/lib/pageAccess.test.ts`
Expected: FAIL —— 找不到 `./BudgetView.vue`；`firstAllowedPath` 返回 `/login`；`PAGE_OPTIONS` 无 `budget`

- [ ] **Step 3: 改 `frontend/src/lib/pageAccess.ts`**

第 7 行改为：

```ts
  | 'data' | 'governance' | 'budget' | 'about'
```

（`PAGE_OPTIONS` 由 `TOOL_LINKS` 派生，改了 `nav.ts` 就自动带上，不用另改。）

- [ ] **Step 4: 改 `frontend/src/nav.ts`（57-61 行）**

```ts
export const TOOL_LINKS: NavLink[] = [
  { label: '数据管理', to: '/data', key: 'data' },
  { label: '数据治理', to: '/governance', key: 'governance' },
  { label: '概算工具', to: '/budget', key: 'budget' },
  { label: '关于产品', to: '/about', key: 'about' },
]
```

- [ ] **Step 5: 改 `frontend/src/router/index.ts`**

import 区加（与其余 view 同处）：

```ts
const BudgetView = () => import('@/views/BudgetView.vue')
```

> 若该文件的 view 是静态 import 的，就照它的写法静态 import；**跟着现有风格走**。

路由数组里，`/governance` 那条之后插入：

```ts
    { path: '/budget', name: 'budget', component: BudgetView,
      meta: { title: '概算工具', hideFilter: true, pageKey: 'budget' } },
```

`hideFilter: true` —— 概算页不用全局 FilterBar。

- [ ] **Step 6: 写 `frontend/src/views/BudgetView.vue` 骨架**

```vue
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useBudgetConfigStore } from '@/stores/budgetConfig'
import { useBudgetStore } from '@/stores/budget'

const cfgStore = useBudgetConfigStore()
const store = useBudgetStore()

onMounted(async () => {
  await cfgStore.load()
  if (cfgStore.config) {
    store.reset(cfgStore.config)
    store.setCurrentConfig(cfgStore.config)
  }
})

const ready = computed(() => !!cfgStore.config && !!store.form.basic)

// 表单任何变动 → 重新生成 CRM 建议(用户手改过就不覆盖)
watch(() => store.result, () => store.syncCrmText(), { deep: false })
</script>

<template>
  <div class="budget-view">
    <el-alert v-if="cfgStore.error" :title="cfgStore.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="cfgStore.loading && !ready" :rows="8" animated />

    <template v-if="ready">
      <!-- Task 10:BasicInfoCard / RateReferenceCard / ProductSection / PmSection
                   / ServiceSection / DirectCostSection
           Task 11:RatioCard / CrmCard / SummaryCard / SalesOrderCard
           Task 12:EstimateDrawer + 顶部操作条 + 费率快照横幅
           Task 13:RateConfigDrawer(超管) -->
      <h2 class="bd-title">概算工具</h2>
    </template>
  </div>
</template>

<style scoped>
/* .app-main 自身无内边距 —— 每个页面自己给(见 .projects-view) */
.budget-view {
  display: flex;
  flex-direction: column;
  gap: var(--gap-section);
  padding: var(--sp-4);
}
.bd-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
</style>
```

- [ ] **Step 7: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/BudgetView.test.ts src/stores/auth.test.ts src/lib/pageAccess.test.ts src/router && npm run typecheck`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add frontend/src/lib/pageAccess.ts frontend/src/nav.ts frontend/src/router/index.ts frontend/src/views/BudgetView.vue frontend/src/views/BudgetView.test.ts frontend/src/stores/auth.test.ts frontend/src/lib/pageAccess.test.ts
git commit -m "feat(budget): /budget 路由 + 侧栏入口 + pageKey(含 firstAllowedPath 死循环回归)"
```

---

## Task 10: 表单输入区组件

**Files:**
- Create: `frontend/src/components/budget/BasicInfoCard.vue`
- Create: `frontend/src/components/budget/RateReferenceCard.vue`
- Create: `frontend/src/components/budget/ProductSection.vue`
- Create: `frontend/src/components/budget/PmSection.vue`
- Create: `frontend/src/components/budget/ServiceSection.vue`
- Create: `frontend/src/components/budget/DirectCostSection.vue`
- Modify: `frontend/src/views/BudgetView.vue`（装配这 6 个组件）
- Test: `frontend/src/components/budget/inputs.test.ts`

**Interfaces:**
- Consumes: Task 8 的 `useBudgetStore()`（组件直接用 store，不走 props/emit 传表单 —— 表单层级太深，props 透传会变成噩梦）；Task 4 的 `productTotalDays`
- Produces: 6 个可挂载的组件，用户填完能让 `store.result` 实时变化

**各组件要点：**

**BasicInfoCard** —— 9 个必填字段（三列网格）。下拉取值固定（这几个选项是审批标签，不参与计算，也不进配置）：
- 项目级别 `P1 / P2 / P3 / P4`
- 客户级别 `TOP1000 / 指名客户 / 非指名客户`
- 签约类型 `直签 / 渠道 / 项目合作`
- 是否含第三方外采 `否 / 是`
- 项目金额（万元）：`el-input-number`，`:min="0"`

**RateReferenceCard** —— 只读费率速查，`el-collapse` 折叠，**全部由 `store.effectiveConfig` 渲染**（人天单价表、住宿标准、差补标准、汇率、销售物料单价）。原工具在 HTML 里另写了一份静态费率表，与 JS 常量是两份真相源，且 PM 那两格显示的是销售价而非成本价 —— 这里只有一个源。

**ProductSection** —— 顶部一个**可搜索的产品下拉**（`el-select` + `filterable`，选项来自 `store.effectiveConfig.products`，已添加的置灰不可重复选）+ 一个「添加自定义产品」按钮（可重复添加多条）。每个产品一张卡：
- 标准实施：数量 / 单台标准人天 / 设备系数（三者可改，预填自目录）→ **合计参考人天**（只读，`productTotalDays()` 实时算）+ 四格人天
- 非标实施：工作内容 textarea + 四格人天
- 自定义产品：产品名 + 工作内容 + 四格人天
- 卡右上角删除按钮
- 产品名旁一个 ℹ️ 提示（`el-tooltip`），内容是目录里的 `stdDesc` / `nonstdDesc`

**PmSection** —— `el-collapse` 折叠。按 `store.effectiveConfig.pmPhases` 渲染 N 行，每行：阶段名 + PM 一类/二类 + 技服一类/二类 + 工作内容 textarea（预填模板）。底部小结：各类人天合计 × 对应**成本单价**（不是销售价 —— 原工具这里显示错了）。

**ServiceSection** —— `el-select` 选服务 + 「添加」按钮（同一服务可重复添加）。每条：服务名 + 工作内容 textarea（预填 `desc`）+ 四格人天 + 删除按钮。

**DirectCostSection** —— 11 个数字输入，分三组：
- 差补：境内天数（`{{allowance.dom}}元/天`）、境外天数（`{{allowance.intl}}美金/天，汇率{{fx}}`）
- 住宿：一线 / 省会 / 其他 / 港澳 晚数；外包差旅：一类 / 二类 晚数
- 交通：**本地交通（员工base地）** / **当地交通（差旅期间）** / 城际交通（元）

> placeholder 里的价格**必须从配置读**（`450元/晚` 这种），不许写死 —— 否则超管改了费率，页面提示还是旧数字。

**共用要求：**
- 每张卡片：`background: var(--card)`、`border: 1px solid var(--line)`、`border-radius: var(--r-lg)`、`padding: var(--card-pad)`、`box-shadow: var(--shadow-1)`
- 所有数字输入/展示挂 `.u-num`
- 任何输入变动都要 `store.touch()`（标脏，供离开页面确认用）

- [ ] **Step 1: 写失败的测试 `frontend/src/components/budget/inputs.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useBudgetStore } from '@/stores/budget'
import ProductSection from './ProductSection.vue'
import DirectCostSection from './DirectCostSection.vue'
import RateReferenceCard from './RateReferenceCard.vue'
import PmSection from './PmSection.vue'
import type { BudgetConfig } from '@/lib/budget/types'

const CFG = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [{ key: 'pm', code: 'C1', name: 'PM一线' },
              { key: 'pm2ndc', code: 'C2', name: 'PM二线' },
              { key: 'eng1stc', code: 'C3', name: '工程师一线' },
              { key: 'eng2ndc', code: 'C4', name: '工程师二线' }],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%（含产品）' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: '防火墙标准说明', nonstdDesc: '防火墙非标说明' },
             { id: '1.15', name: '云安全管理平台CSMP', coefficient: 0.6, stdDays: 6.375,
               stdDesc: 'C说明', nonstdDesc: 'C非标' }],
  pmPhases: [{ name: '项目启动阶段', content: '启动模板' },
             { name: '项目规划阶段', content: '规划模板' }],
  services: [{ name: '巡检服务', desc: '巡检说明' }],
} as unknown as BudgetConfig

function setup() {
  setActivePinia(createPinia())
  const s = useBudgetStore()
  s.reset(CFG)
  s.setCurrentConfig(CFG)
  return s
}
const opts = { global: { plugins: [ElementPlus] } }

describe('ProductSection', () => {
  beforeEach(setup)

  it('addProduct:按目录预填 数量1/标准人天/系数,四格人天为 0', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.15')
    expect(s.form.products.length).toBe(1)
    const p = s.form.products[0]
    expect(p.name).toBe('云安全管理平台CSMP')
    expect(p.qty).toBe(1)
    expect(p.stdDays).toBe(6.375)
    expect(p.coefficient).toBe(0.6)
    expect(p.std).toEqual({ tech1: 0, tech2: 0, out1: 0, out2: 0 })
    expect(p.isCustom).toBe(false)
  })

  it('同一目录产品不可重复添加,自定义产品可重复添加', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.1')
    ;(w.vm as any).addProduct('1.1')
    expect(s.form.products.length).toBe(1)              // 目录产品去重
    ;(w.vm as any).addCustom()
    ;(w.vm as any).addCustom()
    expect(s.form.products.filter((p) => p.isCustom).length).toBe(2)
  })

  it('合计参考人天实时算,且只是参考 —— 不进金额', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.1')
    s.form.products[0].qty = 3                          // 3 × 1.5 × 0.8 = 3.6
    expect((w.vm as any).totalDaysOf(s.form.products[0])).toBe(3.6)
    expect(s.result?.prodTechCost).toBe(0)              // 四格没填 → 金额仍是 0
  })

  it('删除产品', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.1')
    ;(w.vm as any).removeProduct(s.form.products[0].uid)
    expect(s.form.products).toEqual([])
  })

  it('填四格人天 → 金额实时联动', () => {
    const s = useBudgetStore()
    const w = mount(ProductSection, opts)
    ;(w.vm as any).addProduct('1.1')
    s.form.products[0].std.tech1 = 2
    expect(s.result?.prodTechCost).toBe(2 * 1300)
  })
})

describe('PmSection', () => {
  beforeEach(setup)
  it('按配置渲染阶段,工作内容预填模板', () => {
    const s = useBudgetStore()
    mount(PmSection, opts)
    expect(s.form.pmPhases.map((p) => p.name))
      .toEqual(['项目启动阶段', '项目规划阶段'])
    expect(s.form.pmPhases[0].note).toBe('启动模板')
  })
  it('小结用的是成本单价(2000/1500/1300/1000),不是销售价', () => {
    const s = useBudgetStore()
    const w = mount(PmSection, opts)
    s.form.pmPhases[0].pm1 = 2
    expect((w.vm as any).pmCost1).toBe(2 * 2000)        // 不是 2 × 2400
  })
})

describe('DirectCostSection', () => {
  beforeEach(setup)

  it('两个交通字段独立且都计入直接成本', () => {
    const s = useBudgetStore()
    mount(DirectCostSection, opts)
    s.form.direct.localTransportBase = 111
    s.form.direct.localTransportTrip = 222
    s.form.direct.interCityTransport = 333
    expect(s.result?.directCost).toBe(666)
  })

  it('placeholder 里的价格取自配置,不是写死的', () => {
    const w = mount(DirectCostSection, opts)
    const html = w.html()
    expect(html).toContain('450')       // 一线住宿
    expect(html).toContain('150')       // 境内差补
    expect(html).toContain('6.8')       // 汇率
  })
})

describe('RateReferenceCard', () => {
  beforeEach(setup)
  it('费率表由配置渲染 —— 单一来源,不再 HTML/JS 各写一份', () => {
    const w = mount(RateReferenceCard, opts)
    const html = w.html()
    expect(html).toContain('2000')      // PM 一类成本单价
    expect(html).toContain('1300')      // 技服一类
    expect(html).toContain('2400')      // PM 销售单价
    expect(html).toContain('6.8')       // 汇率
  })
})
```

- [ ] **Step 2: 跑测试确认失败**（组件都不存在）

Run: `cd frontend && npx vitest run src/components/budget/inputs.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 6 个组件**

按上面「各组件要点」实现。`ProductSection` 的关键片段（其余组件同构，照此写）：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useBudgetStore } from '@/stores/budget'
import { productTotalDays } from '@/lib/budget/calc'
import type { ProductRow } from '@/lib/budget/types'

const store = useBudgetStore()
const cfg = computed(() => store.effectiveConfig!)

let seq = 0
const uid = (): string => `p${Date.now()}_${seq++}`

/** 已添加的目录产品置灰 —— 同一产品不可重复添加(自定义产品例外,可重复)。 */
const usedIds = computed(() => new Set(store.form.products.filter((p) => !p.isCustom).map((p) => p.id)))

const emptyCells = () => ({ tech1: 0, tech2: 0, out1: 0, out2: 0 })

function addProduct(id: string): void {
  if (usedIds.value.has(id)) return
  const def = cfg.value.products.find((p) => p.id === id)
  if (!def) return
  store.form.products.push({
    uid: uid(), id: def.id, name: def.name, isCustom: false,
    qty: 1, stdDays: def.stdDays, coefficient: def.coefficient,
    std: emptyCells(), nonStdDesc: '', nonStd: emptyCells(),
    customDesc: '', custom: emptyCells(),
  })
  store.touch()
}

function addCustom(): void {
  store.form.products.push({
    uid: uid(), id: 'other', name: '', isCustom: true,
    qty: 0, stdDays: 0, coefficient: 0,
    std: emptyCells(), nonStdDesc: '', nonStd: emptyCells(),
    customDesc: '', custom: emptyCells(),
  })
  store.touch()
}

function removeProduct(u: string): void {
  const i = store.form.products.findIndex((p) => p.uid === u)
  if (i >= 0) store.form.products.splice(i, 1)
  store.touch()
}

/** 合计参考人天:只读、只是参考 —— 人天必须手动分配到四格,金额只认四格。 */
function totalDaysOf(p: ProductRow): number {
  return productTotalDays(p.qty, p.stdDays, p.coefficient)
}

const descOf = (p: ProductRow) => cfg.value.products.find((x) => x.id === p.id)

defineExpose({ addProduct, addCustom, removeProduct, totalDaysOf })
</script>
```

模板部分用 `el-select`(filterable) + `el-input-number` + `el-input type=textarea`，卡片样式用令牌，数字挂 `.u-num`。**每个 `@change` 都调 `store.touch()`。**

- [ ] **Step 4: 在 `BudgetView.vue` 里装配这 6 个组件**（按顺序：基本信息 → 费率速查 → 产品实施 → 项目经理 → 其他服务 → 直接成本）

- [ ] **Step 5: 跑测试 + typecheck + 提交**

```bash
cd frontend && npx vitest run src/components/budget && npm run typecheck && npm run build
cd .. && git add frontend/src/components/budget frontend/src/views/BudgetView.vue
git commit -m "feat(budget): 表单输入区 6 个组件(费率表单一来源,两个交通类目分列)"
```

---

## Task 11: 结果区组件

**Files:**
- Create: `frontend/src/components/budget/RatioCard.vue`
- Create: `frontend/src/components/budget/CrmCard.vue`
- Create: `frontend/src/components/budget/SummaryCard.vue`
- Create: `frontend/src/components/budget/SalesOrderCard.vue`
- Modify: `frontend/src/views/BudgetView.vue`
- Test: `frontend/src/components/budget/results.test.ts`

**Interfaces:**
- Consumes: Task 8 的 `useBudgetStore()`（`result` / `salesOrder` / `restoreCrmAuto`）
- Produces: 4 个结果组件

**要点：**

**RatioCard** —— 显示成本比例（`--.-%` 或 `11.30%`）+ 三态徽标（**淡底深字**：`--ok-bg`/`--ok-text`、`--warn-bg`/`--warn-text`、`--danger-bg`/`--danger-text`）+ 建议范围（取自配置）。三态非 `normal` 且非 `na` 时展开「异常说明」textarea 并标必填；空则红字提示。
说明文案必须写对：**「成本比例 = 销售下单金额（含税）÷ 项目金额」** —— 原工具页面文案对、代码错，我们把代码改对了，文案照旧对。

**CrmCard** —— textarea 绑 `store.form.crmText`；`@input` 时置 `crmUserEdited = true`；右上角「恢复自动生成」按钮调 `store.restoreCrmAuto()`（仅在 `crmUserEdited` 为真时可点）。

**SummaryCard** —— 人工成本分项（PM 一类/二类、技服一类/二类、外包一类/二类，各显示人天 × 单价 = 金额）+ 直接成本 + **总成本（未含税）** + 毛利率下拉（`store.form.margin`，选项来自配置）+ **销售下单金额（含税）**。
> ⚠ 毛利率一改，成本比例会跟着变（这是本次修正的直接后果）—— `store.result` 是 computed，自动联动，但要在毛利率下拉旁加一句小字提示：「毛利率会影响成本比例」。

**SalesOrderCard** —— 表格：物料编号 / 物料名称 / 单价 / 数量 / 金额 + 合计行。数据来自 `store.salesOrder`。

- [ ] **Step 1: 写失败的测试 `frontend/src/components/budget/results.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useBudgetStore } from '@/stores/budget'
import RatioCard from './RatioCard.vue'
import CrmCard from './CrmCard.vue'
import SummaryCard from './SummaryCard.vue'
import SalesOrderCard from './SalesOrderCard.vue'
import type { BudgetConfig } from '@/lib/budget/types'

const CFG = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [{ key: 'pm', code: 'JY-CPJF-OTHER-PM', name: 'PM一线' },
              { key: 'pm2ndc', code: 'C2', name: 'PM二线' },
              { key: 'eng1stc', code: 'C3', name: '工程师一线' },
              { key: 'eng2ndc', code: 'C4', name: '工程师二线' }],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%（含产品）' }, { value: 0.06, label: '6%（纯服务）' }],
  ratio: { min: 3, max: 15 },
  products: [], pmPhases: [{ name: '项目启动阶段', content: 'x' }], services: [],
} as unknown as BudgetConfig

function setup(pmDays = 0, amount: number | null = null) {
  setActivePinia(createPinia())
  const s = useBudgetStore()
  s.reset(CFG)
  s.setCurrentConfig(CFG)
  s.form.pmPhases[0].pm1 = pmDays
  s.form.basic.projectAmount = amount
  return s
}
const opts = { global: { plugins: [ElementPlus] } }

describe('RatioCard', () => {
  it('正常区间 → 显示比例与「比例正常」,不要求填异常说明', () => {
    setup(40, 100)                                    // 80000×1.13/1000000 = 9.04%
    const w = mount(RatioCard, opts)
    expect(w.text()).toContain('9.04%')
    expect(w.text()).toContain('比例正常')
    expect(w.text()).not.toContain('异常原因')
  })

  it('偏高 → 展开异常说明且必填', () => {
    setup(200, 100)                                   // 400000×1.13/1000000 = 45.2%
    const w = mount(RatioCard, opts)
    expect(w.text()).toContain('比例偏高')
    expect(w.find('textarea').exists()).toBe(true)
  })

  it('偏低 → 展开异常说明', () => {
    setup(5, 100)                                     // 10000×1.13/1000000 = 1.13%
    const w = mount(RatioCard, opts)
    expect(w.text()).toContain('比例偏低')
    expect(w.find('textarea').exists()).toBe(true)
  })

  it('项目金额未填 → 显示 -- 且不判定', () => {
    setup(40, null)
    const w = mount(RatioCard, opts)
    expect(w.text()).toContain('--')
    expect(w.find('textarea').exists()).toBe(false)
  })

  it('说明文案写的是「销售下单金额 ÷ 项目金额」(与修正后的代码一致)', () => {
    setup(40, 100)
    expect(mount(RatioCard, opts).text()).toContain('销售下单金额')
  })

  it('建议范围取自配置', () => {
    setup(40, 100)
    expect(mount(RatioCard, opts).text()).toContain('3%')
    expect(mount(RatioCard, opts).text()).toContain('15%')
  })
})

describe('SummaryCard', () => {
  it('总成本未含税、销售下单金额含税', () => {
    setup(10, 100)                                    // 20000 总成本
    const w = mount(SummaryCard, opts)
    expect(w.text()).toContain('20,000')
    expect(w.text()).toContain('22,600')              // ×1.13
  })

  it('切毛利率 → 销售金额与成本比例同时变(原工具只变金额)', () => {
    const s = setup(10, 100)
    const w = mount(SummaryCard, opts)
    expect(s.result?.costRatio).toBeCloseTo(2.26, 6)
    s.form.margin = 0.06
    expect(s.result?.salesAmount).toBeCloseTo(21200, 6)
    expect(s.result?.costRatio).toBeCloseTo(2.12, 6)  // 比例也跟着变
    expect(w.text()).toContain('毛利率')
  })
})

describe('CrmCard', () => {
  it('未手改时展示自动生成的建议', () => {
    const s = setup(3, 100)
    s.syncCrmText()
    expect(mount(CrmCard, opts).text()).toContain('该项目评估后')
  })

  it('恢复自动生成:清掉手改标记并重新生成', async () => {
    const s = setup(3, 100)
    s.form.crmText = '我手改的'
    s.form.crmUserEdited = true
    const w = mount(CrmCard, opts)
    await (w.vm as any).restore()
    expect(s.form.crmUserEdited).toBe(false)
    expect(s.form.crmText).toContain('1.预计项目经理3.0人天；')
  })
})

describe('SalesOrderCard', () => {
  it('渲染 4 个物料行 + 合计', () => {
    setup(10, 100)
    const w = mount(SalesOrderCard, opts)
    expect(w.text()).toContain('JY-CPJF-OTHER-PM')
    expect(w.text()).toContain('合计')
  })
})
```

- [ ] **Step 2: 跑测试确认失败 → 实现 4 个组件 → 跑测试通过**

Run: `cd frontend && npx vitest run src/components/budget/results.test.ts && npm run typecheck`

- [ ] **Step 3: 在 `BudgetView.vue` 里装配（成本比例 → CRM → 费用汇总 → 销售下单建议）并提交**

```bash
git add frontend/src/components/budget frontend/src/views/BudgetView.vue
git commit -m "feat(budget): 结果区 4 个组件(成本比例三态 + CRM 恢复自动生成 + 销售下单表)"
```

---

## Task 12: 存档抽屉 + 保存/另存为/删除/恢复 + 费率快照横幅

**Files:**
- Create: `frontend/src/components/budget/EstimateDrawer.vue`
- Modify: `frontend/src/views/BudgetView.vue`（顶部操作条 + 快照横幅 + 校验 + 离开确认 + 导出）
- Test: `frontend/src/components/budget/EstimateDrawer.test.ts`
- Test: 追加到 `frontend/src/views/BudgetView.test.ts`

**Interfaces:**
- Consumes: Task 8 的 `budgetApi` 与两个 store；Task 7 的 `exportEstimate`
- Produces: 端到端的存档闭环

**要点：**

**EstimateDrawer** —— `el-drawer`，列出存档（报价名称 / 客户 / 销售 / 项目金额 / 成本比例 / 更新时间 / 操作）。
- 搜索框（按报价名/客户过滤）
- 超管多一个「查看全部账号」开关 → `listEstimates(true)`，并多显示一列「创建人」
- 每行「恢复」→ `getEstimate(id)` → `store.loadRecord(rec)`；若当前表单有未保存改动，先 `ElMessageBox.confirm`
- 每行「删除」→ 二次确认 → `deleteEstimate(id)` → 刷新列表

**BudgetView 顶部操作条** —— 「存档」按钮（打开抽屉）、「费率与目录配置」按钮（**仅 `auth.user?.isSuper` 时渲染**，Task 13 实现抽屉）、「新建报价」按钮。

**费率快照横幅** —— `store.snapshotStale` 为真时显示 `el-alert type="warning"`：
> 本报价基于保存时的费率表；当前费率表已更新。〔按最新费率重算〕

按钮调 `store.useLatestRates()`。

**底部操作区** —— 「保存」/「另存为新报价」/「导出 Excel」。三个动作前都跑同一套校验：

```ts
/** 保存与导出前的统一校验。返回错误文案;通过返回 ''。 */
function validate(): string {
  const b = store.form.basic
  const required: [string, unknown][] = [
    ['报价名称', b.quoteName], ['客户名称', b.customerName], ['销售', b.salesName],
    ['项目所在地', b.location], ['项目金额（万元）', b.projectAmount],
    ['项目级别', b.projectLevel], ['客户级别', b.customerLevel],
    ['签约类型', b.signType], ['是否含第三方外采', b.thirdParty],
  ]
  for (const [label, v] of required) {
    if (v === null || v === undefined || String(v).trim() === '') return `请填写「${label}」`
  }
  // 成本比例异常时必须填说明 —— 保存与导出都拦
  const st = store.result?.ratioStatus
  if ((st === 'low' || st === 'high') && !store.form.ratioExplanation.trim()) {
    return '成本比例异常,请填写异常原因'
  }
  return ''
}
```

**离开确认** —— `onBeforeRouteLeave`：`store.dirty` 为真时 `ElMessageBox.confirm('有未保存的改动,确定离开吗?')`。

- [ ] **Step 1: 写失败的测试**

`frontend/src/components/budget/EstimateDrawer.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

const { listSpy, getSpy, delSpy } = vi.hoisted(() => ({
  listSpy: vi.fn(), getSpy: vi.fn(), delSpy: vi.fn(),
}))
vi.mock('@/lib/budgetApi', () => ({
  listEstimates: listSpy, getEstimate: getSpy, deleteEstimate: delSpy,
  getBudgetConfig: vi.fn(), saveBudgetConfig: vi.fn(), saveEstimate: vi.fn(),
}))

import EstimateDrawer from './EstimateDrawer.vue'

const ITEMS = [
  { id: 'e1', account: 'zhangsan', quoteName: 'A项目', customerName: '客户甲',
    salesName: '张三', projectAmount: 100, totalCost: 100000, salesAmount: 113000,
    costRatio: 11.3, ratioStatus: 'normal', createdAt: '2026-07-01 10:00:00',
    updatedAt: '2026-07-01 10:00:00' },
  { id: 'e2', account: 'lisi', quoteName: 'B项目', customerName: '客户乙',
    salesName: '李四', projectAmount: 50, totalCost: 60000, salesAmount: 67800,
    costRatio: 13.56, ratioStatus: 'normal', createdAt: '2026-07-02 10:00:00',
    updatedAt: '2026-07-02 10:00:00' },
]

describe('EstimateDrawer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listSpy.mockReset(); getSpy.mockReset(); delSpy.mockReset()
    listSpy.mockResolvedValue(ITEMS)
  })

  const mountIt = (isSuper = false) => mount(EstimateDrawer, {
    props: { modelValue: true, isSuper },
    global: { plugins: [ElementPlus] },
  })

  it('打开即拉列表,展示报价名/客户/成本比例', async () => {
    const w = mountIt()
    await flushPromises()
    expect(listSpy).toHaveBeenCalledWith(false)
    expect(w.text()).toContain('A项目')
    expect(w.text()).toContain('客户甲')
    expect(w.text()).toContain('11.3')
  })

  it('普通管理员没有「查看全部账号」开关', async () => {
    const w = mountIt(false)
    await flushPromises()
    expect(w.text()).not.toContain('查看全部账号')
  })

  it('超管有「查看全部账号」开关,打开后按 all=true 重拉并显示创建人列', async () => {
    const w = mountIt(true)
    await flushPromises()
    expect(w.text()).toContain('查看全部账号')
    await (w.vm as any).toggleAll(true)
    expect(listSpy).toHaveBeenLastCalledWith(true)
    expect(w.text()).toContain('创建人')
  })

  it('搜索按报价名与客户过滤', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).keyword = '客户乙'
    await flushPromises()
    expect((w.vm as any).filtered.map((x: any) => x.id)).toEqual(['e2'])
  })

  it('恢复:取整条记录后 emit restore', async () => {
    const rec = { ...ITEMS[0], data: {}, rateSnapshot: {}, summary: {} }
    getSpy.mockResolvedValue(rec)
    const w = mountIt()
    await flushPromises()
    await (w.vm as any).restore('e1')
    expect(getSpy).toHaveBeenCalledWith('e1')
    expect(w.emitted('restore')?.[0]?.[0]).toEqual(rec)
  })

  it('删除后刷新列表', async () => {
    delSpy.mockResolvedValue(undefined)
    const w = mountIt()
    await flushPromises()
    listSpy.mockResolvedValue([ITEMS[1]])
    await (w.vm as any).doDelete('e1')
    expect(delSpy).toHaveBeenCalledWith('e1')
    expect((w.vm as any).items.map((x: any) => x.id)).toEqual(['e2'])
  })
})
```

追加到 `frontend/src/views/BudgetView.test.ts`：

```ts
  it('必填项没填 → 保存被拦下,不发请求', async () => {
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const err = (w.vm as any).validate()
    expect(err).toContain('报价名称')
  })

  it('成本比例异常但没填说明 → 保存被拦下', async () => {
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = useBudgetStore()
    s.form.basic = { quoteName: 'A', customerName: 'B', salesName: 'C', location: 'D',
                     projectAmount: 100, projectLevel: 'P1', customerLevel: 'TOP1000',
                     signType: '直签', thirdParty: '否' }
    s.form.pmPhases[0].pm1 = 500          // 比例远超 15%
    expect(s.result?.ratioStatus).toBe('high')
    expect((w.vm as any).validate()).toContain('异常原因')
    s.form.ratioExplanation = '客户要求驻场'
    expect((w.vm as any).validate()).toBe('')
  })

  it('快照过期 → 显示横幅;点重算后横幅消失', async () => {
    const w = mount(BudgetView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = useBudgetStore()
    s.loadRecord({ id: 'e1', quoteName: 'x', data: s.form,
                   rateSnapshot: { ...CFG, fx: 6.0 } } as any)
    await flushPromises()
    expect(s.snapshotStale).toBe(true)
    expect(w.text()).toContain('按最新费率重算')
    s.useLatestRates()
    await flushPromises()
    expect(s.snapshotStale).toBe(false)
  })
```

- [ ] **Step 2: 跑测试确认失败 → 实现 → 跑测试通过**

Run: `cd frontend && npx vitest run src/components/budget src/views/BudgetView.test.ts && npm run typecheck && npm run build`

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/budget/EstimateDrawer.vue frontend/src/components/budget/EstimateDrawer.test.ts frontend/src/views/BudgetView.vue frontend/src/views/BudgetView.test.ts
git commit -m "feat(budget): 存档抽屉 + 保存/另存为/删除/恢复 + 费率快照横幅 + 必填校验"
```

---

## Task 13: 费率与目录配置抽屉（超管）

**Files:**
- Create: `frontend/src/components/budget/RateConfigDrawer.vue`
- Modify: `frontend/src/views/BudgetView.vue`（挂载抽屉，仅超管渲染入口）
- Test: `frontend/src/components/budget/RateConfigDrawer.test.ts`

**Interfaces:**
- Consumes: Task 8 的 `useBudgetConfigStore()`
- Produces: 超管可在页面上改全部费率与目录，保存后立即生效

**要点：**
- `el-drawer`（宽一些，`size="60%"`），内部 `el-tabs`：**价格与阈值** / **产品目录** / **服务目录** / **物料**
- 价格与阈值：人天单价（2×3）、销售物料单价（4）、住宿（6）、差补（2）、汇率、成本比例区间（min/max）、毛利率档位（可增删）
- 产品目录：`el-table` 可编辑（产品名 / 系数 / 标准人天 / 标准说明 / 非标说明），可增删行
- 服务目录：可编辑（服务名 / 说明），可增删行
- 物料：可编辑（物料编号 / 名称 / 单价）—— **物料 key 不可改**（它是 `salesPrices` 的键，改了后端会拒）
- 保存 → `cfgStore.save(draft)` → 成功后 `ElMessage.success('费率已更新,立即生效')`；失败把后端的校验文案原样弹出（后端 `ValueError` 的文案是可读中文）
- **入口按钮仅在 `auth.user?.isSuper` 时渲染**；但真正的闸在后端（普通管理员 POST → 403）

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn() }))
vi.mock('@/lib/budgetApi', () => ({
  getBudgetConfig: vi.fn(), saveBudgetConfig: saveSpy,
  listEstimates: vi.fn(), getEstimate: vi.fn(), saveEstimate: vi.fn(), deleteEstimate: vi.fn(),
}))

import RateConfigDrawer from './RateConfigDrawer.vue'
import { useBudgetConfigStore } from '@/stores/budgetConfig'
import type { BudgetConfig } from '@/lib/budget/types'

const CFG = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [{ key: 'pm', code: 'C1', name: 'PM一线' },
              { key: 'pm2ndc', code: 'C2', name: 'PM二线' },
              { key: 'eng1stc', code: 'C3', name: '工程师一线' },
              { key: 'eng2ndc', code: 'C4', name: '工程师二线' }],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: 's', nonstdDesc: 'n' }],
  pmPhases: [{ name: '项目启动阶段', content: 'x' }],
  services: [{ name: '巡检服务', desc: 'd' }],
} as unknown as BudgetConfig

describe('RateConfigDrawer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    saveSpy.mockReset()
    saveSpy.mockImplementation(async (c: BudgetConfig) => c)
    const s = useBudgetConfigStore()
    s.config = JSON.parse(JSON.stringify(CFG))
    s.loaded = true
  })

  const mountIt = () => mount(RateConfigDrawer, {
    props: { modelValue: true },
    global: { plugins: [ElementPlus] },
  })

  it('打开时把当前配置复制成草稿 —— 改了不保存不影响页面正在用的配置', async () => {
    const w = mountIt()
    await flushPromises()
    const s = useBudgetConfigStore()
    ;(w.vm as any).draft.fx = 9.9
    expect(s.config!.fx).toBe(6.8)             // 草稿与生效配置解耦
  })

  it('保存 → 调 saveBudgetConfig 并把新配置写回 store(立即生效)', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).draft.fx = 7.2
    await (w.vm as any).save()
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy.mock.calls[0][0].fx).toBe(7.2)
    expect(useBudgetConfigStore().config!.fx).toBe(7.2)
  })

  it('产品目录可增删行', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).addProduct()
    expect((w.vm as any).draft.products.length).toBe(2)
    ;(w.vm as any).removeProduct(1)
    expect((w.vm as any).draft.products.length).toBe(1)
  })

  it('服务目录可增删行', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).addService()
    expect((w.vm as any).draft.services.length).toBe(2)
  })

  it('后端拒绝时把可读的校验文案弹出来', async () => {
    saveSpy.mockRejectedValue(new Error('成本比例区间下限必须小于上限'))
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).draft.ratio = { min: 20, max: 5 }
    await (w.vm as any).save()
    expect((w.vm as any).error).toContain('下限必须小于上限')
  })
})
```

- [ ] **Step 2: 跑测试确认失败 → 实现 → 跑测试通过 → 提交**

```bash
cd frontend && npx vitest run src/components/budget/RateConfigDrawer.test.ts && npm run typecheck && npm run build
cd .. && git add frontend/src/components/budget/RateConfigDrawer.vue frontend/src/components/budget/RateConfigDrawer.test.ts frontend/src/views/BudgetView.vue
git commit -m "feat(budget): 费率与目录配置抽屉(超管,改完立即生效)"
```

---

## Task 14: 对拍验证 + 版本号 + PROGRESS 收口

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`
- Modify: `CLAUDE.md`（架构地图 + 关键约定各补一条）

**Interfaces:**
- Consumes: 前 13 个任务的全部产物

- [ ] **Step 1: 全量验证**

```bash
bash verify.sh
```
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）。任何一项红都不许往下走。

- [ ] **Step 2: 起服务，浏览器目验**

```bash
python server.py            # :8080
cd frontend && npm run dev  # :5173
```

用超管（admin / wxtnb）登录，逐项核对：

- [ ] 侧栏「工具选项」里出现「概算工具」，位置在**数据治理下方、关于产品上方**
- [ ] 页面**不贴边**（各卡片四周有 16px 内边距）
- [ ] 选一个产品 → 数量填 3 → 合计参考人天显示 **3.6**（3 × 1.5 × 0.8）；数量改成 1 → 显示 **1.5**（不乘系数）
- [ ] 四格人天填数 → 费用汇总、成本比例、CRM 建议、销售下单表**全部实时联动**
- [ ] 切毛利率 13% ↔ 6% → **销售下单金额和成本比例同时变**（这是本次修正的直接后果）
- [ ] 成本比例超出 3%~15% → 弹出异常说明且必填；不填时点保存被拦下
- [ ] 手改 CRM 建议 → 不再被自动覆盖；点「恢复自动生成」→ 恢复
- [ ] 保存 → 存档抽屉里出现该条；改个名再保存 → **仍是一条**（覆盖）；点「另存为新报价」→ 变两条
- [ ] 导出 Excel → 打开文件确认 **8 个 sheet**；产品实施 sheet 有数量/系数/合计参考人天，且三行的「工作内容说明」**互不相同**
- [ ] 超管改一个费率（比如汇率改成 7.0）→ 保存 → 页面费率速查表立刻变；打开刚才那条旧存档 → **顶部出现「本报价基于保存时的费率表」横幅**，金额仍按旧费率算；点「按最新费率重算」→ 金额变化
- [ ] 用一个只授权 `budget` 的普通管理员登录 → 能进 `/budget`，**看不到「费率与目录配置」按钮**；存档抽屉里只有自己的报价、**没有「查看全部账号」开关**
- [ ] console 无报错

- [ ] **Step 3: 对拍原工具（本次重构的安全网）**

在浏览器里同时打开 `CostBudgetEstimate.html`（双击即可，它是单体 HTML）和新的 `/budget`，**用同一组输入**各填一遍（建议：2 个产品 + PM 三个阶段 + 1 项服务 + 若干差旅天数 + 项目金额），逐项核对：

| 项 | 预期 |
|---|---|
| 各类人天合计 | **逐位相同** |
| 人工成本各分项 | **逐位相同** |
| 直接成本 | **逐位相同** |
| 总成本 | **逐位相同** |
| 销售下单金额 | **逐位相同** |
| 销售下单表的物料数量与合计 | **逐位相同** |
| CRM 审批建议正文 | **逐字相同** |
| **成本比例** | 新值 = **旧值 × (1 + 毛利率)** |

> **只有成本比例应该不同**，且必须恰好是这个倍数关系。如果不是，说明改坏了别的东西 —— 停下来查，别往下走。
> 这是 V3.0.0 用过的手法：被重构的旧工具还在时，让它当场重跑，逐项对拍，而不是比总数、更不是信它的历史产物。

- [ ] **Step 4: 改版本号 `frontend/src/version.ts`**

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V3.1.0'
export const RELEASE_DATE = '2026-07-13'    // 改成实际完成日期
```

- [ ] **Step 5: 更新 `CLAUDE.md`**

架构地图的文件表里补两行：

```
| `budget_config.py` / `budget_store.py` | 概算工具:费率与目录配置(超管可配) / 报价存档(按账号隔离 + 费率快照) |
```

「关键约定」补一条：

```
### 概算工具口径（2026-07-13 起，V3.1.0）
- **成本比例 = 销售下单金额（含税）÷ 项目金额**，即 `总成本 × (1 + 毛利率) ÷ (项目金额万元 × 10000)`。原工具此处漏乘 `(1 + 毛利率)`（页面文案对、代码错），V3.1.0 已修正 —— 同一份报价的比例比原工具高约 13%（选 6% 档时高 6%）。
- **物料单价与毛利率解耦**：单价只有一套，毛利率只作为 `(1 + margin)` 的乘数。
- **费率快照**：每条存档冻结当时的完整费率配置；打开旧档用它自己的快照算，报价必须可复现。改了费率不会改写历史报价。
- 费率/系数/阈值/产品目录/服务目录/物料**全部超管可配**（`data/budget_config.json`，`/budget` 页内抽屉），改完立即生效、无需点「更新数据」。
```

- [ ] **Step 6: 更新 `PROGRESS.md`**

头部「当前版本」改为 V3.1.0，写清：新增 `/budget` 概算工具（`CostBudgetEstimate.html` 完全重构）；修正 8 处缺陷（**成本比例分子漏乘毛利率是计算错误**）；服务端存档按账号隔离 + 费率快照；只导出不导入（8 sheet）。V3.0.0 降为「上一版本」。

技术债里补一条：

```
- `/budget` 概算工具的项目级别/客户级别/签约类型/第三方/项目所在地 五个字段**不参与任何计算**（原工具即如此，纯审批标签）。若日后要让它们影响系数，需先明确业务口径。
```

- [ ] **Step 7: 最终验证 + 提交**

```bash
bash verify.sh
git add frontend/src/version.ts PROGRESS.md CLAUDE.md
git commit -m "chore(budget): V3.1.0 版本号 + PROGRESS/CLAUDE 口径归档"
```

---

## 部署须知（写进升级手册时照抄）

- **非纯前端** —— 新增 `budget_config.py` / `budget_store.py`，改动 `server.py`。**必须覆盖后端 `*.py` 并重启后端**，只换 dist 会让 `/api/budget/*` 全部 404。
- **必须授权新 pageKey `budget`** —— 超管自动可见；普通管理员需在「账号管理」里勾选「概算工具」。
- **不需要点「更新数据」** —— 本域不进数据管线，与 `analysis_data.json` 完全解耦。
- `data/budget_config.json`（费率配置）与 `data/budget_estimates.json`（报价存档）由后端首次读写时自动创建，无需手工建。
- **无新增第三方依赖**（`xlsx` 早已在用；**未引入 exceljs / file-saver / pandas**）。
- **上线后第一次有人问「怎么成本比例变高了」** —— 那是修正 1 的必然结果（分子补上了含税），不是新 bug。
