# 倚天域数据底座 V4.5.4 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为倚天工时域接入产品大类、客户象限、市场BG、管理干部四类维度，产出「可转移非原厂支持」五档判定，并清偿 TOP1000 解析的静默降级债。

**Architecture:** 后端在 `yitian.build_yitian_data()` 内计算 8 个新派生字段（entry 级）+ 1 个员工级字段 + 1 组就绪度指标，随 `data/yitian_data.json` 下发；派生逻辑全部抽为 `yitian_derive.py` 纯函数便于单测；判定所用词表进 `data/yitian_rules.json`（超管可配、即时生效）。前端本期只做「可查、可见」：明细页加 10 个可选列、总览页加就绪度卡与可转移 KPI、`/data` 页显示两张源表解析状态。

**Tech Stack:** Python 3.8+ 标准库 + openpyxl + pydantic（后端）；Vue3 + TS + Pinia + Element Plus + vitest（前端）。无新增依赖。

## Global Constraints

- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- 版本号 **V4.5.4**，单一来源 `frontend/src/version.ts`，只改此处。
- **不改饱和度口径**（V4.4.5 双基准 `base`/`expectedBase` 已与用户确认）。本期不碰 `lib/yitian/metrics.ts` 的 `EmpStat` 计算。
- **不换 `input/TOP1000.xlsx`**；继续与项目主域同文件、同函数、同解析。
- **绝不把正则暴露给配置界面**：词表可配、骨架固定在代码，关键词一律 `re.escape`。
- 倚天域异常**绝不阻断主管线**：`preprocess_data.py` 第 11 段的 `try/except` 保持不动。
- **打包/开发两套路径**：本期不改「调用脚本/读写文件路径」的逻辑，无需同步 frozen 分支。
- 完成定义：`bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
- 提交信息结尾附 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。
- **绝不 `git add -A`**；每步只 `git add` 本任务明确改动的文件。

## 五档枚举（全计划统一，勿改动数值）

```
0 = 客户不可归属
1 = 不可转移：M1/M2 战略客户
2 = 不可转移：项目管理工时
3 = 不可转移：非渠道可交付产品
4 = ★可转移非原厂
```

## 校准状态枚举（全计划统一）

```
0 = raw        原始值有效，未触发校准
1 = calibrated 唯一命中，已校准
2 = ambiguous  命中 ≥2 条产品线，未校准
3 = unmatched  零命中，未校准
```

## 文件结构

| 文件 | 职责 | 任务 |
|---|---|---|
| **新建** `product_category.py` | 读 `input/产品分类.xlsx` → `{产品线: {category, channel}}` | T3 |
| **新建** `yitian_derive.py` | 派生纯函数：校准 / 项目管理标签 / 占位客户 / 五档判定 | T5 |
| **新建** `tests/test_product_category.py` | T3 的测试 | T3 |
| **新建** `tests/test_yitian_derive.py` | T5 的测试 | T5 |
| **新建** `frontend/src/lib/yitian/derived.ts` | 五档/校准状态的中文标签 + 就绪度取数 | T8 |
| **新建** `frontend/src/lib/yitian/derived.test.ts` | T8 的测试 | T8 |
| **新建** `frontend/src/components/YitianReadinessCard.vue` | 就绪度四数 + 可转移五档 KPI | T9 |
| **新建** `frontend/src/components/YitianReadinessCard.test.ts` | T9 的测试 | T9 |
| 改 `config.py` | 加 `PRODUCT_CATEGORY_FILE` 常量与上传白名单 | T3 |
| 改 `projects.py` | `read_top1000` 补 `bg`＋象限双列名；`read_org_roster` 补 `supId/supName`；新增 `manager_ids` | T1 T2 |
| 改 `yitian_rules.py` | 新增 `pmTag` / `placeholder` 默认常量 | T4 |
| 改 `yitian_rules_config.py` | `default_config` + `validate_config` 两节 | T4 |
| 改 `schema.py` | `YitianEntry` +8 / `YitianDims` +3 / `YitianRosterItem` +1 / `YitianMeta` +1 | T6 |
| 改 `yitian.py` | `build_yitian_data` 接线全部派生字段与就绪度 | T7 |
| 改 `preprocess_data.py` | 就绪度告警输出 | T7 |
| 改 `frontend/src/types/yitian.ts` | 由 `npm run gen:types` 生成，**不手改** | T8 |
| 改 `frontend/src/lib/yitian/detail.ts` | `DetailRow` +10 字段、`ALL_COLUMNS` +10 列、`FILTERABLE` | T8 |
| 改 `frontend/src/views/YitianOverviewView.vue` | 挂就绪度卡 | T9 |
| 改 `frontend/src/components/YitianSourceCard.vue` | `/data` 页显示两张源表解析状态 | T10 |
| 改 `frontend/src/version.ts` | `V4.5.4` | T11 |
| 改 `PROGRESS.md` | 版本条目 | T11 |

---

### Task 1: `read_top1000` 补市场BG 与象限双列名

**Files:**
- Modify: `projects.py`（`read_top1000`，约 145–160 行）
- Test: `tests/test_projects.py`（已有 `read_top1000` 用例在约 365–385 行，本任务追加）

**Interfaces:**
- Consumes: 无（本计划第一个任务）
- Produces: `projects.read_top1000(path: str) -> Dict[str, Dict[str, str]]`，值 dict 的键为 `"level"` / `"quad"` / `"bg"`（三个键**必然存在**，缺列时为空串）。既有消费方 `projects.load_dept_projects` 只读 `level`/`quad`，零改动。

**背景（勿跳过）**：本仓 `input/TOP1000.xlsx` 的象限列名为 `象限`，而同一业务字段在别处叫 `客户象限`（新版工时工具那份即是）。当前实现只认 `象限`，换一份表就会让全部 `quad` 静默变空、零报错。本任务同时补上 `市场BG` 列（文件里有，函数没读）。

- [ ] **Step 1: 写失败测试**

在 `tests/test_projects.py` 末尾追加。文件已有 `_write_xlsx` 之类的辅助，若无则用下面自带的 openpyxl 直写：

```python
def _top1000_xlsx(tmp_path, headers, rows, name="t.xlsx"):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    p = tmp_path / name
    wb.save(str(p))
    return str(p)


def test_read_top1000_象限列名兼容两种写法(tmp_path):
    """平台这份叫「象限」,新版工具那份叫「客户象限」——两种都必须认。"""
    p1 = _top1000_xlsx(tmp_path, ["客户名称", "客户级别", "象限", "市场BG"],
                       [["甲公司", "TOP1000大客户", "M1 战略核心区", "市场BG3"]], "a.xlsx")
    p2 = _top1000_xlsx(tmp_path, ["客户名称", "客户级别", "客户象限", "市场BG"],
                       [["甲公司", "TOP1000大客户", "M1 战略核心区", "市场BG3"]], "b.xlsx")
    for p in (p1, p2):
        m = P.read_top1000(p)
        assert m["甲公司"]["quad"] == "M1 战略核心区"
        assert m["甲公司"]["bg"] == "市场BG3"
        assert m["甲公司"]["level"] == "TOP1000大客户"


def test_read_top1000_缺象限与BG列时三个键仍在且为空串(tmp_path):
    """缺列必须降级为空串而非 KeyError——下游 v.get('quad') 之外还有直接下标的消费方。"""
    p = _top1000_xlsx(tmp_path, ["客户名称", "客户级别"], [["乙公司", "TOP1000大客户"]])
    m = P.read_top1000(p)
    assert m["乙公司"] == {"level": "TOP1000大客户", "quad": "", "bg": ""}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_projects.py -k "top1000" -v`
Expected: FAIL —— `KeyError: 'bg'` 或 `assert '' == '市场BG3'`

- [ ] **Step 3: 改实现**

`projects.py` 的 `read_top1000` 内层循环改为：

```python
        out[name] = {
            "level": str(r.get("客户级别") or "").strip(),
            # 象限列名双兼容:本仓 TOP1000.xlsx 叫「象限」,别处导出叫「客户象限」。
            # 只认一个的话,换一份表会让 quad 全部静默变空、零报错(V4.5.4 前的真实缺陷)。
            "quad": str(r.get("象限") or r.get("客户象限") or "").strip(),
            "bg": str(r.get("市场BG") or "").strip(),
        }
```

同时把 docstring 首行改为：
```python
    """TOP1000.xlsx → {客户名称: {"level": 客户级别, "quad": 象限, "bg": 市场BG}}。
    象限列名兼容「象限」与「客户象限」两种写法。三个键必然存在,缺列为空串。
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_projects.py -k "top1000" -v`
Expected: PASS（含既有 3 条 `read_top1000` 用例）

- [ ] **Step 5: 反向验证**

把 `or r.get("客户象限")` 临时删掉，重跑 Step 4，**必须红**在 `test_read_top1000_象限列名兼容两种写法`。确认后改回。
> 还原用 Read+Edit 或 `cp` 备份，**绝不用 `git checkout <file>`**（工作树有其它未提交改动会被一并抹掉）。

- [ ] **Step 6: 跑主域回归**

Run: `python -m pytest tests/test_projects.py -q`
Expected: 全部 PASS（`build_projects` 的 TOP1000 判定不受影响）

- [ ] **Step 7: 提交**

```bash
git add projects.py tests/test_projects.py
git commit -m "feat(top1000): 补读市场BG + 象限列名双兼容

象限列名在本仓叫「象限」、在其它导出叫「客户象限」,只认一个会让 quad
静默全空且零报错。返回值新增 bg 键,既有消费方零改动。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 花名册补读直接上级，派生管理干部

**Files:**
- Modify: `projects.py`（`read_org_roster`，约 60–90 行；文件末尾加 `manager_ids`）
- Test: `tests/test_projects.py`

**Interfaces:**
- Consumes: 无
- Produces:
  - `projects.read_org_roster(path) -> List[Dict[str, str]]`，每项新增 `"supId"`（直接上级工号，大写归一）与 `"supName"`（直接上级姓名）。
  - `projects.manager_ids(roster: List[Dict[str, str]]) -> Set[str]` —— 纯函数，返回**出现在 `supId` 列且本身在花名册内**的工号集合。

**背景**：`组织架构.xlsx` 已有「直接上级工号」「直接上级姓名」两列，此前未读。用它派生「管理干部」，替代工具里硬编码的 14 个工号。设计期实测：派生结果 14 人，与工具硬编码**完全一致、零差异**。

- [ ] **Step 1: 写失败测试**

```python
def _roster_xlsx(tmp_path, rows):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["工号", "姓名", "员工类别", "新L2组织", "新L3组织",
               "新L3-1组织", "新L4组织", "直接上级工号", "直接上级姓名"])
    for r in rows:
        ws.append(r)
    p = tmp_path / "org.xlsx"
    wb.save(str(p))
    return str(p)


def test_read_org_roster_读出直接上级(tmp_path):
    p = _roster_xlsx(tmp_path, [
        ["a001", "老王", "正式", "L2", "交付实施三部", "三部一室", "一组", "a000", "老张"],
    ])
    r = P.read_org_roster(p)[0]
    assert r["supId"] == "A000"      # 工号大写归一
    assert r["supName"] == "老张"


def test_manager_ids_只收花名册内的上级(tmp_path):
    """上级若不在本部花名册(如跨部门上级),不计入管理干部——否则集合里会出现查无此人的工号。"""
    p = _roster_xlsx(tmp_path, [
        ["a000", "老张", "正式", "L2", "交付实施三部", "三部一室", "", "x999", "部门外"],
        ["a001", "老王", "正式", "L2", "交付实施三部", "三部一室", "一组", "a000", "老张"],
        ["a002", "小李", "正式", "L2", "交付实施三部", "三部一室", "一组", "a001", "老王"],
    ])
    roster = P.read_org_roster(p)
    assert P.manager_ids(roster) == {"A000", "A001"}   # X999 在册外,不收


def test_manager_ids_无直接上级列时返回空集():
    """老格式组织架构表没有该列 → 降级为空集,调用方据此把管理标签筛选置灰。"""
    roster = [{"id": "A001", "name": "老王", "supId": "", "supName": ""}]
    assert P.manager_ids(roster) == set()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_projects.py -k "roster or manager" -v`
Expected: FAIL —— `KeyError: 'supId'` 与 `AttributeError: module has no attribute 'manager_ids'`

- [ ] **Step 3: 改实现**

`read_org_roster` 的 `out.append({...})` 内追加两个键：

```python
            "category": str(r.get("员工类别") or "").strip(),
            # 直接上级(V4.5.4):用于派生「管理干部」,取代工具里硬编码的 14 个工号。
            "supId": str(r.get("直接上级工号") or "").strip().upper(),
            "supName": str(r.get("直接上级姓名") or "").strip(),
```

在 `read_org_roster` 之后新增：

```python
def manager_ids(roster: List[Dict[str, str]]) -> set:
    """管理干部 = 出现在「直接上级工号」列、且本身也在花名册内的工号集合。
    在册外的上级(跨部门)不收——否则集合里会出现本域查无此人的工号。
    组织架构表无该列时返回空集(调用方据此把「管理标签」筛选降级)。"""
    ids = {p["id"] for p in roster}
    return {p.get("supId", "") for p in roster if p.get("supId") and p.get("supId") in ids}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_projects.py -k "roster or manager" -v`
Expected: PASS

- [ ] **Step 5: 用真实数据核对（关键验收）**

```bash
python -c "
import sys; sys.stdout.reconfigure(encoding='utf-8'); sys.path.insert(0,'.')
from projects import read_org_roster, manager_ids
r = read_org_roster('input/组织架构.xlsx')
m = manager_ids(r)
print('花名册 %d 人, 管理干部 %d 人' % (len(r), len(m)))
print(sorted(m))
"
```
Expected: `花名册 85 人, 管理干部 14 人`，名单为
`A000683 A000701 A000727 A000968 A001164 A001227 A001373 A002296 A002424 A002606 A003885 A004878 A005134 A012804`
（与设计期实测一致；若数不为 14，先查花名册是否已更新，勿改实现迁就）

- [ ] **Step 6: 提交**

```bash
git add projects.py tests/test_projects.py
git commit -m "feat(roster): 补读直接上级并派生管理干部集合

组织架构.xlsx 早有「直接上级工号/姓名」两列未读。manager_ids 从中派生
管理干部,取代工具硬编码的 14 个工号;实测二者零差异,且组织调整后自动跟随。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 新增产品分类源表读取

**Files:**
- Create: `product_category.py`
- Create: `tests/test_product_category.py`
- Modify: `config.py`（约 65–90 行）

**Interfaces:**
- Consumes: `projects.read_sheet_by_header(path, key_header) -> List[Dict[str, Any]]`（公开包装，**勿调私有的 `_read_header_sheet`**）
- Produces:
  - `config.PRODUCT_CATEGORY_FILE = "产品分类.xlsx"`
  - `product_category.read_product_categories(path: str) -> Dict[str, Dict[str, Any]]`，形如 `{"NGSOC": {"category": "态势感知", "channel": False}}`。缺文件/无表头 → `{}`。
  - `product_category.CATEGORY_ORDER: List[str]` —— 产品大类展示顺序常量。

**源表结构（实测）**：三列 `产品线` | `产品大类` | `是否渠道商可交付`，108 条，覆盖工时表全部 81 个产品线。`是否渠道商可交付` 仅两个取值：空 与 `渠道商可交付产品`。

- [ ] **Step 1: 写失败测试**

新建 `tests/test_product_category.py`：

```python
"""产品分类表读取(V4.5.4)。"""
import openpyxl
import product_category as PC


def _xlsx(tmp_path, rows, headers=("产品线", "产品大类", "是否渠道商可交付")):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(headers))
    for r in rows:
        ws.append(list(r))
    p = tmp_path / "产品分类.xlsx"
    wb.save(str(p))
    return str(p)


def test_正常读取(tmp_path):
    p = _xlsx(tmp_path, [("NGSOC", "态势感知", None),
                         ("WAF", "传统等保", "渠道商可交付产品")])
    m = PC.read_product_categories(p)
    assert m["NGSOC"] == {"category": "态势感知", "channel": False}
    assert m["WAF"] == {"category": "传统等保", "channel": True}


def test_渠道列只认精确值(tmp_path):
    """空白、任意其它字样一律判 False——避免把'待评估'之类误判为可交付。"""
    p = _xlsx(tmp_path, [("A", "其他", "待评估"), ("B", "其他", "")])
    m = PC.read_product_categories(p)
    assert m["A"]["channel"] is False
    assert m["B"]["channel"] is False


def test_产品线为空的行跳过(tmp_path):
    p = _xlsx(tmp_path, [(None, "态势感知", None), ("NGSOC", "态势感知", None)])
    assert list(PC.read_product_categories(p)) == ["NGSOC"]


def test_重复产品线后者覆盖前者(tmp_path):
    p = _xlsx(tmp_path, [("NGSOC", "旧大类", None), ("NGSOC", "态势感知", None)])
    assert PC.read_product_categories(p)["NGSOC"]["category"] == "态势感知"


def test_缺文件返回空字典(tmp_path):
    assert PC.read_product_categories(str(tmp_path / "不存在.xlsx")) == {}


def test_无表头返回空字典(tmp_path):
    p = _xlsx(tmp_path, [("NGSOC", "态势感知", None)], headers=("甲", "乙", "丙"))
    assert PC.read_product_categories(p) == {}


def test_大类顺序常量其他恒末位():
    assert PC.CATEGORY_ORDER[-1] == "其他"
    assert "态势感知" in PC.CATEGORY_ORDER
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_product_category.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'product_category'`

- [ ] **Step 3: 建实现**

新建 `product_category.py`：

```python
# product_category.py
"""产品分类源表(V4.5.4):产品线 → 产品大类 / 是否渠道商可交付。

源表 input/产品分类.xlsx 三列:产品线 | 产品大类 | 是否渠道商可交付。
仅倚天域消费(校准后产品大类、渠道可交付判定)。缺文件/无表头 → {} 降级,
由调用方记入就绪度指标并打 [WARN],绝不阻断管线。
"""
from __future__ import annotations

from typing import Any, Dict

from projects import read_sheet_by_header

COL_LINE = "产研侧产品线"     # 兼容用:部分导出把首列写成全称
COL_LINE_SHORT = "产品线"
COL_CATEGORY = "产品大类"
COL_CHANNEL = "是否渠道商可交付"

CHANNEL_YES = "渠道商可交付产品"   # 精确值,其余一律 False

# 展示顺序(业务指定),"其他" 恒末位。未在此列中的大类按字典序排在 "其他" 之前。
CATEGORY_ORDER = [
    "传统等保", "终端安全", "云与服务器安全", "态势感知", "天眼",
    "工控安全", "数据安全", "电子取证", "AI等新方向", "其他",
]


def read_product_categories(path: str) -> Dict[str, Dict[str, Any]]:
    """产品分类.xlsx → {产品线: {"category": 产品大类, "channel": 是否渠道商可交付}}。
    按"表头含产品线"自动选 sheet;产品线为空的行跳过;重复产品线后者覆盖前者。
    缺文件/无表头 → {}。"""
    rows = read_sheet_by_header(path, COL_LINE_SHORT)
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        line = str(r.get(COL_LINE_SHORT) or r.get(COL_LINE) or "").strip()
        if not line:
            continue
        out[line] = {
            "category": str(r.get(COL_CATEGORY) or "").strip(),
            "channel": str(r.get(COL_CHANNEL) or "").strip() == CHANNEL_YES,
        }
    return out
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_product_category.py -v`
Expected: 7 passed

- [ ] **Step 5: 接入上传白名单**

`config.py` 在 `TOP1000_LEVEL` 之后加常量：

```python
PRODUCT_CATEGORY_FILE = "产品分类.xlsx"   # 产品线→产品大类/是否渠道商可交付(倚天域,V4.5.4)
```

并在 `INPUT_UPLOAD_NAMES` 列表中加入 `PRODUCT_CATEGORY_FILE`（放在 `TOP1000_FILE` 之后）：

```python
INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE, DELIVERY_FILE_LEGACY,
                      PAYMENT_RECORDS_FILE, PROFIT_DIRECT_FILE, PROFIT_BRIDGE_FILE, BUDGET_FILE,
                      COLLECTION_STAGES_FILE, TOP1000_FILE, PRODUCT_CATEGORY_FILE,
                      YITIAN_TIMESHEET_FILE, YITIAN_HOLIDAYS_FILE]
```

> 该文件落 `input/` 根（不进 `INPUT_SUBDIR_MAP`），与 `TOP1000.xlsx` 同级。`input/` 已 gitignore，无需改 `.gitignore`。

- [ ] **Step 6: 放置源表并用真实数据核对**

```bash
cp "yitian-new/工时检查工具v4.0/产品分类.xlsx" "input/产品分类.xlsx"
python -c "
import sys, json; sys.stdout.reconfigure(encoding='utf-8'); sys.path.insert(0,'.')
import product_category as PC
m = PC.read_product_categories('input/产品分类.xlsx')
d = json.load(open('data/yitian_data.json', encoding='utf-8'))
lines = set(d['dims']['products'])
print('映射 %d 条' % len(m))
print('工时表产品线 %d 个, 未覆盖 %d 个' % (len(lines), len([x for x in lines if x not in m])))
print('大类取值:', sorted({v['category'] for v in m.values()}))
print('渠道可交付条数:', sum(1 for v in m.values() if v['channel']))
"
```
Expected: `映射 108 条` / `工时表产品线 81 个, 未覆盖 0 个` / 大类 10 档

- [ ] **Step 7: 提交**

```bash
git add product_category.py tests/test_product_category.py config.py
git commit -m "feat(product-category): 新增产品分类源表读取

input/产品分类.xlsx 提供 产品线→产品大类/是否渠道商可交付。实测 108 条
映射覆盖工时表全部 81 个产品线。已进上传白名单,/data 页可传可查修改时间。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 规则配置新增 `pmTag` 与 `placeholder` 两节

**Files:**
- Modify: `yitian_rules.py`（文件末尾追加常量）
- Modify: `yitian_rules_config.py`（`default_config` 约 29–50 行；`validate_config` 约 167–175 行之后）
- Test: `tests/test_yitian_rules_config.py`

**Interfaces:**
- Consumes: 无
- Produces: `yitian_rules_config.default_config()["checks"]` 新增两个键：

```python
"pmTag": {
    "enabled": True,
    "workType3": ["项目管理", "项目验收", "文档编写与汇报"],
    "excludeTypes": ["售后类"],
    "rolePrefixes": ["担任角色", "【担任角色】", "本人角色", "角色"],
    "roleKeywords": ["项目经理"],
},
"placeholder": {
    "enabled": True,
    "customerWords": ["受影响的客户"],
},
```

- [ ] **Step 1: 写失败测试**

在 `tests/test_yitian_rules_config.py` 末尾追加：

```python
def test_默认配置含pmTag与placeholder两节():
    d = RC.default_config()
    pm = d["checks"]["pmTag"]
    assert pm["enabled"] is True
    assert pm["workType3"] == ["项目管理", "项目验收", "文档编写与汇报"]
    assert pm["excludeTypes"] == ["售后类"]
    assert "担任角色" in pm["rolePrefixes"]
    assert pm["roleKeywords"] == ["项目经理"]
    assert d["checks"]["placeholder"]["customerWords"] == ["受影响的客户"]


def test_pmTag可被覆盖并归一化():
    cfg = RC.validate_config({"checks": {"pmTag": {
        "enabled": False,
        "workType3": [" 项目管理 ", "项目管理", "产品培训"],   # 去空白 + 去重
        "excludeTypes": [],
        "rolePrefixes": ["担任角色"],
        "roleKeywords": ["项目经理", "PM"],
    }}})
    pm = cfg["checks"]["pmTag"]
    assert pm["enabled"] is False
    assert pm["workType3"] == ["项目管理", "产品培训"]
    assert pm["excludeTypes"] == []
    assert pm["roleKeywords"] == ["项目经理", "PM"]


def test_pmTag缺段回落默认():
    cfg = RC.validate_config({"checks": {"summary": {"enabled": True, "keywords": ["工作概述"]}}})
    assert cfg["checks"]["pmTag"]["roleKeywords"] == ["项目经理"]
    assert cfg["checks"]["placeholder"]["customerWords"] == ["受影响的客户"]


def test_placeholder非数组报错():
    import pytest
    with pytest.raises(ValueError):
        RC.validate_config({"checks": {"placeholder": {"customerWords": "受影响的客户"}}})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_rules_config.py -k "pmTag or placeholder" -v`
Expected: FAIL —— `KeyError: 'pmTag'`

- [ ] **Step 3: 加默认常量**

`yitian_rules.py` 末尾追加：

```python
# ── 项目管理工时标签(V4.5.4) ──
# 条件① 工时类型=项目类 且 工作类型三 ∈ PM_TAG_WORKTYPE3
# 条件② 工时类型 ∉ PM_TAG_EXCLUDE_TYPES 且 工作成果命中「角色槽位」
# 两条件任一成立即打标。**角色必须用槽位匹配,不可用裸关键词** —— 实测裸匹配会多吃
# 51 行/290h,抽查 6 条全是假阳性(「输出给项目经理」「同步至产品经理和项目经理」等,
# 这些人恰恰不是项目经理)。假阳性会让「可转移非原厂」被低估,宁窄勿宽。
PM_TAG_WORKTYPE3 = ("项目管理", "项目验收", "文档编写与汇报")
PM_TAG_EXCLUDE_TYPES = ("售后类",)
PM_TAG_ROLE_PREFIXES = ("担任角色", "【担任角色】", "本人角色", "角色")
PM_TAG_ROLE_KEYWORDS = ("项目经理",)

# ── 客户占位词(V4.5.4) ──
# 客户字段填了占位词 = 该条工时无法归属到真实客户 → 客户象限判不出 → 可转移结论为盲区。
# 实测全库唯一占位词为「受影响的客户」(478 行/2810h,跨 11 种工作类型三)。
PLACEHOLDER_CUSTOMERS = ("受影响的客户",)
```

- [ ] **Step 4: 加 `default_config` 两节**

`yitian_rules_config.py` 的 `default_config()` 里，在 `"presaleProductHint"` 之后追加：

```python
            "presaleProductHint": {"enabled": True, "skipWorkTypes": sorted(R.PRESALE_SKIP_WORKTYPES)},
            "pmTag": {"enabled": True,
                      "workType3": list(R.PM_TAG_WORKTYPE3),
                      "excludeTypes": list(R.PM_TAG_EXCLUDE_TYPES),
                      "rolePrefixes": list(R.PM_TAG_ROLE_PREFIXES),
                      "roleKeywords": list(R.PM_TAG_ROLE_KEYWORDS)},
            "placeholder": {"enabled": True,
                            "customerWords": list(R.PLACEHOLDER_CUSTOMERS)},
```

- [ ] **Step 5: 加 `validate_config` 两节**

在 `validate_config` 的 `presaleProductHint` 段之后、`return d` 之前插入：

```python
    pm = _seg(checks_in, "pmTag")
    if pm:
        cur = d["checks"]["pmTag"]
        d["checks"]["pmTag"] = {
            "enabled": _bool(pm.get("enabled", True), "pmTag.enabled"),
            "workType3": _norm_str_list(pm.get("workType3", cur["workType3"]), "pmTag.workType3"),
            "excludeTypes": _norm_str_list(pm.get("excludeTypes", cur["excludeTypes"]),
                                           "pmTag.excludeTypes"),
            "rolePrefixes": _norm_str_list(pm.get("rolePrefixes", cur["rolePrefixes"]),
                                           "pmTag.rolePrefixes"),
            "roleKeywords": _norm_str_list(pm.get("roleKeywords", cur["roleKeywords"]),
                                           "pmTag.roleKeywords"),
        }

    phd = _seg(checks_in, "placeholder")
    if phd:
        cur = d["checks"]["placeholder"]
        d["checks"]["placeholder"] = {
            "enabled": _bool(phd.get("enabled", True), "placeholder.enabled"),
            "customerWords": _norm_str_list(phd.get("customerWords", cur["customerWords"]),
                                            "placeholder.customerWords"),
        }
```

> `_norm_str_list` 已自带 strip / 去空 / 去重 / 长度与项数上限，无需另写校验。

- [ ] **Step 6: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian_rules_config.py -v`
Expected: 全部 PASS（含既有用例）

- [ ] **Step 7: 提交**

```bash
git add yitian_rules.py yitian_rules_config.py tests/test_yitian_rules_config.py
git commit -m "feat(yitian-rules): 新增 pmTag 与 placeholder 两节可配项

项目管理工时标签的工作类型三清单/角色槽位词表/角色词表/排除类型,以及客户
占位词表,全部超管可配。正则骨架固定在代码、只开放词表——用户可控正则会静默
命中 0 条且有 ReDoS 风险。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 派生纯函数 `yitian_derive.py`

**Files:**
- Create: `yitian_derive.py`
- Create: `tests/test_yitian_derive.py`

**Interfaces:**
- Consumes: `yitian_rules_config.default_config()["checks"]["pmTag"]` / `["placeholder"]`（T4）；`product_category.read_product_categories` 的返回结构（T3）
- Produces（T7 接线时按此签名调用）：
  - `calibrate_line(product_line: str, work_type: str, content: str, line_keywords: List[dict], checked_types: Iterable[str]) -> Tuple[str, int]` → `(生效产品线, 校准状态码 0-3)`
  - `pm_tag(work_type: str, work_type3: str, content: str, seg: dict) -> bool`
  - `is_placeholder_customer(customer: str, seg: dict) -> bool`
  - `transferable(cust_unknown: bool, quad: str, pm: bool, channel: bool) -> int` → `0-4`
  - 常量 `LINE_SRC_RAW/CALIBRATED/AMBIGUOUS/UNMATCHED = 0/1/2/3`
  - 常量 `TR_UNATTRIBUTED/TR_M12/TR_PM/TR_NOT_CHANNEL/TR_YES = 0/1/2/3/4`

- [ ] **Step 1: 写失败测试**

新建 `tests/test_yitian_derive.py`：

```python
"""倚天派生字段纯函数(V4.5.4)。"""
import yitian_derive as D

LK = [
    {"linePatterns": ["NGSOC"], "keywords": ["SOC", "SOAR", "告警"]},
    {"linePatterns": ["威胁感知"], "keywords": ["天眼", "沙箱", "探针"]},
    {"linePatterns": ["网络流量探针"], "keywords": ["探针", "传感器"]},
]
CHECKED = ("项目类", "售前类", "售后类")

PM_SEG = {"enabled": True,
          "workType3": ["项目管理", "项目验收", "文档编写与汇报"],
          "excludeTypes": ["售后类"],
          "rolePrefixes": ["担任角色", "【担任角色】", "本人角色", "角色"],
          "roleKeywords": ["项目经理"]}
PH_SEG = {"enabled": True, "customerWords": ["受影响的客户"]}


# ── calibrate_line ──

def test_校准_原值有效则原样返回且状态raw():
    assert D.calibrate_line("NGSOC", "项目类", "任意内容", LK, CHECKED) == ("NGSOC", D.LINE_SRC_RAW)


def test_校准_唯一命中则替换且状态calibrated():
    got = D.calibrate_line("其他", "项目类", "本周处理 SOAR 告警策略", LK, CHECKED)
    assert got == ("NGSOC", D.LINE_SRC_CALIBRATED)


def test_校准_多义则保持原值且状态ambiguous():
    """「探针」同时属于 威胁感知 与 网络流量探针 —— 必须留白,不可任选其一。"""
    got = D.calibrate_line("其他", "项目类", "现场部署探针设备", LK, CHECKED)
    assert got == ("其他", D.LINE_SRC_AMBIGUOUS)


def test_校准_零命中则保持原值且状态unmatched():
    got = D.calibrate_line("其他", "项目类", "参加部门例会", LK, CHECKED)
    assert got == ("其他", D.LINE_SRC_UNMATCHED)


def test_校准_大小写不敏感():
    got = D.calibrate_line("其他", "项目类", "处理 soar 队列", LK, CHECKED)
    assert got == ("NGSOC", D.LINE_SRC_CALIBRATED)


def test_校准_非客户类工时不触发():
    """管理类即使产品线为「其他」也不校准——校准只服务客户类工时口径。"""
    got = D.calibrate_line("其他", "管理类", "本周处理 SOAR 告警", LK, CHECKED)
    assert got == ("其他", D.LINE_SRC_RAW)


def test_校准_空产品线按其他处理():
    got = D.calibrate_line("", "项目类", "本周处理 SOAR 告警", LK, CHECKED)
    assert got == ("NGSOC", D.LINE_SRC_CALIBRATED)


# ── pm_tag ──

def test_pm条件一_项目类且工作类型三命中():
    assert D.pm_tag("项目类", "项目管理", "", PM_SEG) is True


def test_pm条件一_售前类同样工作类型三不命中():
    """条件① 明确限定 工时类型=项目类。"""
    assert D.pm_tag("售前类", "项目管理", "", PM_SEG) is False


def test_pm条件二_角色槽位四种写法均命中():
    for txt in ["担任角色：项目经理 服务方式：现场",
                "【担任角色】：项目经理  工作概述:升级",
                "本人角色 项目经理",
                "角色: 项目经理"]:
        assert D.pm_tag("项目类", "安装部署", txt, PM_SEG) is True, txt


def test_pm条件二_兼任写法命中():
    """「项目经理/工程师」兼任仍算项目管理工时(宁窄勿宽,兼任确带管理属性)。"""
    assert D.pm_tag("项目类", "安装部署", "担任角色：项目经理/工程师", PM_SEG) is True


def test_pm条件二_裸提及一律不命中():
    """真实假阳性样本:这些人恰恰不是项目经理。裸匹配会多吃 51 行/290h。"""
    for txt in ["编辑整理巡检报告并输出给项目经理，签字盖章发客户",
                "需求已同步至产品经理和项目经理，等待行内反馈",
                "把服务器降配操作的风险点同步给项目经理和客户",
                "由项目经理拟送说明邮件至行内技术部评估",
                "整理设备台帐发送个项目经理",
                "登记设备信息到设备清单表格，反馈给我司项目经理"]:
        assert D.pm_tag("项目类", "安装部署", txt, PM_SEG) is False, txt


def test_pm条件二_售后类被排除():
    assert D.pm_tag("售后类", "故障处理", "担任角色：项目经理", PM_SEG) is False


def test_pm_禁用时恒False():
    seg = dict(PM_SEG, enabled=False)
    assert D.pm_tag("项目类", "项目管理", "担任角色：项目经理", seg) is False


# ── is_placeholder_customer ──

def test_占位客户_命中词表():
    assert D.is_placeholder_customer("受影响的客户", PH_SEG) is True


def test_占位客户_空客户名也算不可归属():
    assert D.is_placeholder_customer("", PH_SEG) is True
    assert D.is_placeholder_customer("   ", PH_SEG) is True


def test_占位客户_真实客户名不命中():
    assert D.is_placeholder_customer("中国邮政集团有限公司", PH_SEG) is False


def test_占位客户_精确匹配不做子串():
    """「受影响的客户张三」是真实填写的变体,不按占位处理——子串匹配会误伤。"""
    assert D.is_placeholder_customer("受影响的客户张三", PH_SEG) is False


# ── transferable ──

def test_五档_不可归属优先于一切():
    """象限空 + 可交付 + 非项目管理 也必须落「不可归属」,不能被算成可转移。"""
    assert D.transferable(True, "", False, True) == D.TR_UNATTRIBUTED


def test_五档_M1M2前缀匹配():
    assert D.transferable(False, "M1 战略核心区", False, True) == D.TR_M12
    assert D.transferable(False, "M2 现金牛/打猎区", False, True) == D.TR_M12


def test_五档_M3M4不算战略客户():
    assert D.transferable(False, "M3 潜力培育区", False, True) == D.TR_YES
    assert D.transferable(False, "M4 待开拓/长尾区", False, True) == D.TR_YES


def test_五档_象限为空但客户可归属时不落M12():
    """未匹配上 TOP1000 清单的客户 = 非 TOP1000 = 定义上非 M1/M2,应继续往下判。"""
    assert D.transferable(False, "", False, True) == D.TR_YES


def test_五档_项目管理工时优先于渠道判定():
    assert D.transferable(False, "", True, True) == D.TR_PM


def test_五档_非渠道可交付():
    assert D.transferable(False, "", False, False) == D.TR_NOT_CHANNEL
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_derive.py -v`
Expected: FAIL —— `ModuleNotFoundError: No module named 'yitian_derive'`

- [ ] **Step 3: 建实现**

新建 `yitian_derive.py`：

```python
# yitian_derive.py
"""倚天工时域:派生字段(纯函数,V4.5.4)。

四组:产品线校准 / 项目管理工时标签 / 客户占位词识别 / 可转移非原厂五档判定。
判定所用词表全部来自传入的 cfg 段(yitian_rules_config 结构),本模块只写逻辑。
"""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Tuple

# 校准状态
LINE_SRC_RAW = 0          # 原值有效,未触发校准
LINE_SRC_CALIBRATED = 1   # 唯一命中,已校准
LINE_SRC_AMBIGUOUS = 2    # 命中 >=2 条产品线,留白
LINE_SRC_UNMATCHED = 3    # 零命中,留白

# 可转移五档(数值写死,前端标签按下标取,勿调整顺序)
TR_UNATTRIBUTED = 0
TR_M12 = 1
TR_PM = 2
TR_NOT_CHANNEL = 3
TR_YES = 4

_EMPTY_LINE = ("", "其他", "nan", "none", "-")


def calibrate_line(product_line: str, work_type: str, content: str,
                   line_keywords: List[dict], checked_types: Iterable[str]) -> Tuple[str, int]:
    """校准后产研侧产品线。返回 (生效产品线, 校准状态码)。

    触发条件:产品线 ∈ {空, 其他} 且 工时类型 ∈ checked_types(客户类)。
    命中判定:拿工作成果去撞【全部】产品线的关键词集合(大小写不敏感)——
      恰好 1 条 → 采纳;>=2 条 → 留白(ambiguous);0 条 → 留白(unmatched)。

    **只采纳唯一命中**。词库是为反方向设计的(已知产品线验内容),反过来猜产品线时
    实测多义率 67%(86 个关键词里 19 个被多条产品线共用)。按优先级表强选一个,
    等于把 2/3 的下游结论建在无业务依据的猜测上,且错了无任何信号。
    """
    line = str(product_line or "").strip()
    if line.lower() not in _EMPTY_LINE:
        return line, LINE_SRC_RAW
    if str(work_type or "") not in set(checked_types):
        return line, LINE_SRC_RAW

    low = str(content or "").lower()
    hits = []
    for entry in line_keywords:
        pats = entry.get("linePatterns") or []
        kws = entry.get("keywords") or []
        if not pats:
            continue
        if any(str(k).lower() in low for k in kws):
            hits.append(str(pats[0]))
    uniq = sorted(set(hits))
    if len(uniq) == 1:
        return uniq[0], LINE_SRC_CALIBRATED
    if len(uniq) > 1:
        return line, LINE_SRC_AMBIGUOUS
    return line, LINE_SRC_UNMATCHED


def _role_re(prefixes: List[str], keywords: List[str]):
    """角色槽位正则:前缀词 + 至多 4 个分隔符 + 至多 12 字 + 角色词。
    骨架固定在代码、只有词表可配 —— 用户可控正则会静默命中 0 条,且有 ReDoS 风险。"""
    if not prefixes or not keywords:
        return None
    p = "(" + "|".join(re.escape(x) for x in prefixes) + ")"
    k = "(" + "|".join(re.escape(x) for x in keywords) + ")"
    return re.compile(p + r"[】\]\s:：]{0,4}[^。；\n]{0,12}?" + k)


def pm_tag(work_type: str, work_type3: str, content: str, seg: dict) -> bool:
    """项目管理工时标签。两条件任一成立即为真。

    ① 工时类型 == 项目类 且 工作类型三 ∈ seg["workType3"]
    ② 工时类型 ∉ seg["excludeTypes"] 且 工作成果命中角色槽位

    **条件② 必须用角色槽位、不可用裸关键词**:实测裸匹配多吃 51 行/290h,
    抽查 6 条全是假阳性(「输出给项目经理」「反馈给我司项目经理」等)。
    假阳性会让「可转移非原厂」被低估,宁窄勿宽。
    """
    if not seg.get("enabled", True):
        return False
    wt = str(work_type or "")
    if wt == "项目类" and str(work_type3 or "") in set(seg.get("workType3") or []):
        return True
    if wt in set(seg.get("excludeTypes") or []):
        return False
    rx = _role_re(list(seg.get("rolePrefixes") or []), list(seg.get("roleKeywords") or []))
    return bool(rx and rx.search(str(content or "")))


def is_placeholder_customer(customer: str, seg: dict) -> bool:
    """客户不可归属:客户字段为空,或**精确等于**占位词表中某一项。

    精确匹配、不做子串 —— 「受影响的客户张三」是真实填写的变体,子串匹配会误伤。
    seg 禁用时只判空(空客户名永远是不可归属,与词表无关)。
    """
    c = str(customer or "").strip()
    if not c:
        return True
    if not seg.get("enabled", True):
        return False
    return c in set(seg.get("customerWords") or [])


def transferable(cust_unknown: bool, quad: str, pm: bool, channel: bool) -> int:
    """可转移非原厂支持,五档。判定顺序不可调整。

    ① 客户不可归属 —— **必须先判**。这批工时的客户象限必然为空,若按字面
       「象限 != M1/M2」往下走会被判成「可转移」,那是编出来的结论。
    ② 客户象限 M1/M2 → 战略客户仍原厂支持(前缀匹配,象限值后半段是描述文案会变)
    ③ 项目管理工时 → 仍原厂支持
    ④ 非渠道商可交付产品 → 无法转移
    ⑤ 以上皆否 → 可转移
    """
    if cust_unknown:
        return TR_UNATTRIBUTED
    q = str(quad or "").strip()
    if q.startswith("M1") or q.startswith("M2"):
        return TR_M12
    if pm:
        return TR_PM
    if not channel:
        return TR_NOT_CHANNEL
    return TR_YES
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian_derive.py -v`
Expected: 24 passed

- [ ] **Step 5: 反向验证（两条，spec §8.3 强制）**

**① 校准的多义分支**：把 `calibrate_line` 里
```python
    if len(uniq) > 1:
        return line, LINE_SRC_AMBIGUOUS
```
临时改成
```python
    if len(uniq) > 1:
        return uniq[0], LINE_SRC_CALIBRATED
```
重跑，**必须红**在 `test_校准_多义则保持原值且状态ambiguous`。确认后改回。

**② `transferable` 的 ① 优先级**：把 `if cust_unknown: return TR_UNATTRIBUTED` 整段移到 `if q.startswith(...)` 之后，重跑，**必须红**在 `test_五档_不可归属优先于一切`。确认后改回。

> 还原用 Read+Edit，**绝不用 `git checkout <file>`**。

- [ ] **Step 6: 用真实数据核对（关键验收，对拍 spec §3.4/§3.7/§3.8）**

```bash
python -c "
import sys, json, collections; sys.stdout.reconfigure(encoding='utf-8'); sys.path.insert(0,'.')
import yitian_derive as D, yitian_rules_config as RC
cfg = RC.load_config('data/yitian_rules.json')
lk = cfg['checks']['product']['lineKeywords']
pm_seg, ph_seg = cfg['checks']['pmTag'], cfg['checks']['placeholder']
d = json.load(open('data/yitian_data.json', encoding='utf-8'))
pl, ty, wt, cu = d['dims']['products'], d['dims']['types'], d['dims']['workTypes'], d['dims']['customers']
CT = ('项目类','售前类','售后类')
src = collections.Counter(); srch = collections.Counter()
pmn = pmh = 0; phn = phh = 0
for e in d['entries']:
    t = ty[e['t']] if e['t'] is not None else ''
    if t not in CT: continue
    p = pl[e['pl']] if e['pl'] is not None else ''
    c = cu[e['cu']] if e['cu'] is not None else ''
    w = wt[e['wt']] if e['wt'] is not None else ''
    ct = e.get('ct') or ''
    _, s = D.calibrate_line(p, t, ct, lk, CT)
    src[s] += 1; srch[s] += e['h']
    if D.pm_tag(t, w, ct, pm_seg): pmn += 1; pmh += e['h']
    if D.is_placeholder_customer(c, ph_seg): phn += 1; phh += e['h']
print('校准状态 raw/calibrated/ambiguous/unmatched 行数:', [src[i] for i in range(4)])
print('  其中待校准合计 %d 行 / %.0f h' % (sum(src[i] for i in (1,2,3)), sum(srch[i] for i in (1,2,3))))
print('项目管理工时: %d 行 / %.0f h' % (pmn, pmh))
print('客户不可归属: %d 行 / %.0f h' % (phn, phh))
"
```

Expected（与 spec §10 实测基线对拍）：
- 校准 `calibrated=307` / `ambiguous=931` / `unmatched=201`，待校准合计 `1439 行 / 10380 h`
- 项目管理工时 ≈ `1999 行 / 11342 h`（条件① 1466 行 8516 h ∪ 条件② 954 行 5362 h，交集 421 行）
- 客户不可归属 `478 行 / 2810 h`

> **对不上就停下查口径，不要改测试迁就。** 校准三数与不可归属两数是硬基线；项目管理工时因并集去重，只需落在 1900–2100 行区间。

- [ ] **Step 7: 提交**

```bash
git add yitian_derive.py tests/test_yitian_derive.py
git commit -m "feat(yitian-derive): 派生纯函数(校准/项目管理标签/占位客户/可转移五档)

校准只采纳唯一命中(多义率 67%,强选一个是无依据的猜测);项目管理标签用角色
槽位而非裸关键词(裸匹配 6/6 抽样均为假阳性);可转移五档必须先判不可归属,
否则象限为空的 2810h 会被编成「可转移」。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `schema.py` 契约扩展

**Files:**
- Modify: `schema.py`（`YitianMeta` 341–354、`YitianRosterItem` 356–364、`YitianDims` 373–382、`YitianEntry` 384–401）
- Test: `tests/test_schema_yitian.py`

**Interfaces:**
- Consumes: T5 的枚举取值范围
- Produces: `YitianData` 新增字段，T7 产出的 dict 必须能通过 `schema.validate_and_write_yitian_json`

**字段清单**（新增 8 entry + 3 dims + 1 roster + 1 meta）：

| 位置 | 字段 | 类型 | 说明 |
|---|---|---|---|
| Entry | `cq` | `Optional[int]` | → `dims.custQuads` 客户象限 |
| Entry | `cbg` | `Optional[int]` | → `dims.custBgs` 市场BG |
| Entry | `el` | `Optional[int]` | → `dims.products`（**复用产品线码表**）校准后产品线 |
| Entry | `ls` | `int` | 校准状态 0-3 |
| Entry | `ec` | `Optional[int]` | → `dims.prodCats` 校准后产品大类 |
| Entry | `ch` | `bool` | 渠道商可交付 |
| Entry | `pm` | `bool` | 项目管理工时 |
| Entry | `tr` | `int` | 可转移五档 0-4 |
| Dims | `custQuads` | `List[str]` | |
| Dims | `custBgs` | `List[str]` | |
| Dims | `prodCats` | `List[str]` | |
| Roster | `isMgr` | `bool` | 管理干部（员工属性，不放 entry） |
| Meta | `dataReadiness` | `YitianReadiness` | 就绪度指标 |

- [ ] **Step 1: 写失败测试**

在 `tests/test_schema_yitian.py` 末尾追加：

```python
def test_entry新增八字段与dims三码表(minimal_yitian):
    """minimal_yitian 是本文件既有 fixture;若无,按下方 _minimal() 自建。"""
    d = minimal_yitian
    e = d["entries"][0]
    for k in ("cq", "cbg", "el", "ls", "ec", "ch", "pm", "tr"):
        assert k in e, k
    for k in ("custQuads", "custBgs", "prodCats"):
        assert k in d["dims"], k
    assert "isMgr" in d["roster"][0]
    assert "dataReadiness" in d["meta"]
    S.YitianData.model_validate(d)      # 不抛异常即通过


def test_缺dataReadiness必须报错(minimal_yitian):
    """就绪度是本期护栏的载体,缺它等于护栏没接上,必须硬失败而非静默默认。"""
    import pytest
    from pydantic import ValidationError
    d = dict(minimal_yitian)
    d["meta"] = {k: v for k, v in d["meta"].items() if k != "dataReadiness"}
    with pytest.raises(ValidationError):
        S.YitianData.model_validate(d)
```

若 `tests/test_schema_yitian.py` 没有 `minimal_yitian` fixture，在文件顶部加：

```python
import pytest


@pytest.fixture
def minimal_yitian():
    return {
        "meta": {"periodStart": "2026-01-01", "periodEnd": "2026-01-02",
                 "generatedAt": "2026-01-02 10:00", "rows": 1, "employees": 1,
                 "droppedRows": 0, "calendarSource": "csv", "hoursPerDay": 8,
                 "thisBgL2": ["交付中心"], "storeRows": 1,
                 "storeStart": "2026-01-01", "storeEnd": "2026-01-02",
                 "dataReadiness": {
                     "top1000": {"provided": True, "rows": 139, "matchedCustomers": 97,
                                 "hasQuad": True, "hasBg": True},
                     "productCategory": {"provided": True, "rows": 108,
                                         "coveredLines": 81, "totalLines": 81},
                     "calibration": {"pending": 1439, "calibrated": 307,
                                     "ambiguous": 931, "unmatched": 201},
                     "unattributed": {"rows": 478, "hours": 2810.0},
                     "roster": {"hasSupColumn": True, "managers": 14},
                 }},
        "roster": [{"id": "A001", "name": "老王", "l2": "", "l3": "", "l31": "",
                    "l4": "一组", "category": "正式", "isMgr": False}],
        "days": [{"d": "2026-01-01", "workday": True, "isoWeek": "2026-W01",
                  "calcWeek": "W1"}],
        "dims": {"types": ["项目类"], "workTypes": [], "customers": [], "products": [],
                 "productNames": [], "projectTypes": [], "salesL2": [], "serviceModes": [],
                 "custQuads": [], "custBgs": [], "prodCats": []},
        "entries": [{"d": "2026-01-01", "e": "A001", "t": 0, "h": 8.0, "wt": None,
                     "cu": None, "pl": None, "pn": None, "pt": None, "sm": None,
                     "bg": None, "wo": "", "top": False, "ok": 0, "iss": [], "ct": "",
                     "cq": None, "cbg": None, "el": None, "ls": 0, "ec": None,
                     "ch": False, "pm": False, "tr": 0}],
        "issues": [],
    }
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_schema_yitian.py -k "八字段 or dataReadiness" -v`
Expected: FAIL —— pydantic 拒绝额外字段（`_Base` 应为 `extra="forbid"`；若实为 `allow`，第一条会因 `assert "cq" in e` 前置通过而第二条失败）

- [ ] **Step 3: 改 schema**

`schema.py` 在 `YitianMeta` **之前**插入三个嵌套模型：

```python
class YitianReadinessTop1000(_Base):
    provided: bool                   # 文件是否存在
    rows: int                        # 解析出的客户数
    matchedCustomers: int            # 工时表客户中匹配上清单的个数
    hasQuad: bool                    # 象限列是否解析到值(全空且 rows>0 → False)
    hasBg: bool                      # 市场BG 列同上


class YitianReadinessProductCat(_Base):
    provided: bool
    rows: int                        # 映射条数
    coveredLines: int                # 工时表产品线中被覆盖的个数
    totalLines: int                  # 工时表产品线总数


class YitianReadinessCalib(_Base):
    pending: int                     # 待校准行数(产品线为空/其他 且客户类)
    calibrated: int
    ambiguous: int
    unmatched: int


class YitianReadinessUnattr(_Base):
    rows: int
    hours: float


class YitianReadinessRoster(_Base):
    hasSupColumn: bool               # 组织架构表是否有「直接上级工号」列
    managers: int                    # 派生出的管理干部人数


class YitianReadiness(_Base):
    top1000: YitianReadinessTop1000
    productCategory: YitianReadinessProductCat
    calibration: YitianReadinessCalib
    unattributed: YitianReadinessUnattr
    roster: YitianReadinessRoster
```

`YitianMeta` 末尾加：
```python
    dataReadiness: YitianReadiness   # 源表解析就绪度(V4.5.4),/data 与总览卡消费
```

`YitianRosterItem` 末尾加：
```python
    isMgr: bool                      # 管理干部(由「直接上级工号」派生,V4.5.4)
```

`YitianDims` 末尾加：
```python
    custQuads: List[str]             # 客户象限(V4.5.4)
    custBgs: List[str]               # 市场BG(V4.5.4)
    prodCats: List[str]              # 校准后产品大类(V4.5.4)
```

`YitianEntry` 在 `ct` 之后加：
```python
    # ── V4.5.4 派生字段 ──
    cq: Optional[int]                # → dims.custQuads 客户象限(可空)
    cbg: Optional[int]               # → dims.custBgs 市场BG(可空)
    el: Optional[int]                # → dims.products 校准后产品线(复用产品线码表,可空)
    ls: int                          # 校准状态 0 raw / 1 calibrated / 2 ambiguous / 3 unmatched
    ec: Optional[int]                # → dims.prodCats 校准后产品大类(可空)
    ch: bool                         # 渠道商可交付
    pm: bool                         # 项目管理工时
    tr: int                          # 可转移五档 0 不可归属 /1 M1M2 /2 项目管理 /3 非渠道 /4 可转移
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_schema_yitian.py -v`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add schema.py tests/test_schema_yitian.py
git commit -m "feat(schema): 倚天契约扩展 8 entry 字段 + 3 码表 + isMgr + dataReadiness

dataReadiness 为必填(非 Optional):它是本期护栏的载体,缺它等于护栏没接上,
必须硬失败而非静默默认。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `yitian.py` 接线与就绪度告警

**Files:**
- Modify: `yitian.py`（`build_yitian_data` 151–257 行）
- Modify: `preprocess_data.py`（第 11 段，约 325–352 行）
- Test: `tests/test_yitian.py`

**Interfaces:**
- Consumes: T1 `read_top1000`（含 `bg`）、T2 `read_org_roster`+`manager_ids`、T3 `read_product_categories`、T4 配置两节、T5 四个纯函数、T6 schema
- Produces: `data/yitian_data.json` 含全部新字段；`build_yitian_data` 返回值的 `meta.dataReadiness` 供 `preprocess_data.py` 打告警

- [ ] **Step 1: 写失败测试**

在 `tests/test_yitian.py` 末尾追加（沿用该文件既有的构造方式；若它用 monkeypatch 替换 `read_top1000` 等，照此模式）：

```python
def test_build接出派生字段与就绪度(tmp_path, monkeypatch):
    """最小闭环:一条客户类工时,产品线为「其他」但正文含唯一产品关键词 → 应被校准。"""
    import yitian as Y
    monkeypatch.setattr(Y, "read_org_roster", lambda p: [
        {"id": "A001", "name": "老王", "l2": "", "l3": "", "l31": "", "l4": "一组",
         "category": "正式", "supId": "", "supName": ""},
        {"id": "A002", "name": "老张", "l2": "", "l3": "", "l31": "", "l4": "一组",
         "category": "正式", "supId": "A001", "supName": "老王"},
    ])
    monkeypatch.setattr(Y, "read_top1000", lambda p: {
        "甲公司": {"level": "TOP1000大客户", "quad": "M3 潜力培育区", "bg": "市场BG3"}})
    monkeypatch.setattr(Y, "read_product_categories", lambda p: {
        "NGSOC": {"category": "态势感知", "channel": True}})

    store = {"rows": [{
        "wid": "1", "emp_id": "A002", "date": "2026-06-01", "work_type": "项目类",
        "hours": 8.0, "content": "处理 SOAR 告警策略 担任角色：工程师", "customer": "甲公司",
        "project_type": "", "work_type3": "安装部署", "product_line": "其他",
        "product_name": "", "work_order": "WO1", "sales_l2": "交付中心",
        "service_mode": "现场",
    }]}
    d = Y.build_yitian_data(str(tmp_path), store=store)
    e = d["entries"][0]
    assert d["dims"]["products"][e["el"]] == "NGSOC"       # 校准生效
    assert e["ls"] == 1                                    # calibrated
    assert d["dims"]["prodCats"][e["ec"]] == "态势感知"
    assert e["ch"] is True
    assert e["pm"] is False                                # 角色是工程师,不是项目经理
    assert d["dims"]["custQuads"][e["cq"]] == "M3 潜力培育区"
    assert d["dims"]["custBgs"][e["cbg"]] == "市场BG3"
    assert e["tr"] == 4                                    # M3 + 可交付 + 非项目管理 → 可转移

    r = {p["id"]: p for p in d["roster"]}
    assert r["A001"]["isMgr"] is True                      # 有下属
    assert r["A002"]["isMgr"] is False

    rd = d["meta"]["dataReadiness"]
    assert rd["top1000"]["hasQuad"] is True and rd["top1000"]["hasBg"] is True
    assert rd["productCategory"]["totalLines"] >= 1
    assert rd["calibration"]["calibrated"] == 1
    assert rd["roster"]["managers"] == 1


def test_产品分类缺失时降级不炸(tmp_path, monkeypatch):
    import yitian as Y
    monkeypatch.setattr(Y, "read_org_roster", lambda p: [
        {"id": "A001", "name": "老王", "l2": "", "l3": "", "l31": "", "l4": "一组",
         "category": "正式", "supId": "", "supName": ""}])
    monkeypatch.setattr(Y, "read_top1000", lambda p: {})
    monkeypatch.setattr(Y, "read_product_categories", lambda p: {})
    store = {"rows": [{
        "wid": "1", "emp_id": "A001", "date": "2026-06-01", "work_type": "项目类",
        "hours": 8.0, "content": "巡检", "customer": "乙公司", "project_type": "",
        "work_type3": "产品巡检", "product_line": "NGSOC", "product_name": "",
        "work_order": "", "sales_l2": "", "service_mode": "",
    }]}
    d = Y.build_yitian_data(str(tmp_path), store=store)
    e = d["entries"][0]
    assert e["ec"] is None and e["ch"] is False
    assert e["tr"] == 3                                    # 查不到大类 → 非渠道可交付
    assert d["meta"]["dataReadiness"]["productCategory"]["provided"] is False
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian.py -k "派生 or 降级" -v`
Expected: FAIL —— `KeyError: 'el'`

- [ ] **Step 3: 改 `yitian.py`**

**3a. 顶部导入**（在既有 import 区）：
```python
import yitian_derive as DRV
from projects import (read_org_roster, read_sheet_by_header, read_sheet_headers,
                      read_top1000, manager_ids)
from product_category import read_product_categories
```
> 三个函数都 import 到本模块名下，是为了让测试能用 `monkeypatch.setattr(Y, "read_top1000", ...)` 之类替换。
> **不要 `import product_category as PCAT`** —— 本期用不到 `CATEGORY_ORDER`（它是二期展示排序用的），
> 未使用的 import 会被 `ruff` 判 F401，`verify.sh` 直接红。

**3b. `build_yitian_data` 内，读源表段**（现有 `top1000 = read_top1000(...)` 附近）改为：

```python
    # 路径单独留变量:就绪度要区分「文件不存在」与「文件在但解析出 0 行」——
    # 二者的处置完全不同(前者是没放文件,后者是表头/格式坏了),用同一句
    # 「未提供」会给出事实错误的告警,正是本期要清偿的那类静默/误导降级。
    top1000_path = os.path.join(input_dir, config.TOP1000_FILE)
    pcat_path = os.path.join(input_dir, config.PRODUCT_CATEGORY_FILE)
    top1000 = read_top1000(top1000_path)
    top_names = {n for n, v in top1000.items() if v.get("level") == config.TOP1000_LEVEL}
    prod_cats = read_product_categories(pcat_path)
    mgr_ids = manager_ids(roster)
    pm_seg = rules_cfg["checks"].get("pmTag", {})
    ph_seg = rules_cfg["checks"].get("placeholder", {})
    line_kws = rules_cfg["checks"]["product"]["lineKeywords"]
    checked = tuple(rules_cfg["checkedTypes"])
```

**3c. 码表**：把 `_Dim` 元组扩为 11 个：
```python
    d_type, d_wt, d_cu, d_pl, d_pn, d_pt, d_bg, d_sm = (_Dim() for _ in range(8))
    d_quad, d_cbg, d_cat = (_Dim() for _ in range(3))
```

**3d. 就绪度累计器**（循环前）：
```python
    calib = {"pending": 0, "calibrated": 0, "ambiguous": 0, "unmatched": 0}
    unattr_rows = 0
    unattr_hours = 0.0
    seen_lines = set()
```

**3e. 每行循环内**，在 `entries.append({...})` 之前插入：

```python
        cust = r["customer"]
        t1 = top1000.get(cust) or {}
        quad = t1.get("quad", "")
        eff_line, line_src = DRV.calibrate_line(
            r["product_line"], r["work_type"], r["content"], line_kws, checked)
        pc = prod_cats.get(eff_line) or {}
        eff_cat = pc.get("category", "")
        channel = bool(pc.get("channel"))
        is_pm = DRV.pm_tag(r["work_type"], r["work_type3"], r["content"], pm_seg)
        unknown = DRV.is_placeholder_customer(cust, ph_seg)
        tr = DRV.transferable(unknown, quad, is_pm, channel)

        if r["product_line"].strip():
            seen_lines.add(r["product_line"].strip())
        if r["work_type"] in checked:
            if line_src == DRV.LINE_SRC_CALIBRATED:
                calib["pending"] += 1; calib["calibrated"] += 1
            elif line_src == DRV.LINE_SRC_AMBIGUOUS:
                calib["pending"] += 1; calib["ambiguous"] += 1
            elif line_src == DRV.LINE_SRC_UNMATCHED:
                calib["pending"] += 1; calib["unmatched"] += 1
            if unknown:
                unattr_rows += 1
                unattr_hours += r["hours"]
```

**3f. `entries.append` 的 dict 内**，在 `"ct": r["content"],` 之后加：

```python
            # ── V4.5.4 派生字段 ──
            "cq": d_quad.idx(quad),
            "cbg": d_cbg.idx(t1.get("bg", "")),
            "el": d_pl.idx(eff_line),      # 复用产品线码表
            "ls": line_src,
            "ec": d_cat.idx(eff_cat),
            "ch": channel,
            "pm": is_pm,
            "tr": tr,
```

**3g. roster 加 `isMgr`**（返回 dict 的 `"roster"` 处）：
```python
        "roster": [dict(p, isMgr=p["id"] in mgr_ids) for p in roster],
```

**3h. dims 加三个码表**：
```python
            "salesL2": d_bg.values,
            "serviceModes": d_sm.values,
            "custQuads": d_quad.values,
            "custBgs": d_cbg.values,
            "prodCats": d_cat.values,
```

**3i. meta 加 `dataReadiness`**：
```python
            "storeEnd": st["end"],
            "dataReadiness": {
                "top1000": {
                    # provided 看文件是否存在,rows 看解析结果 —— 两者分开才能区分
                    # 「没放文件」与「文件在但表头坏了」,告警文案才不会说反。
                    "provided": os.path.isfile(top1000_path),
                    "rows": len(top1000),
                    "matchedCustomers": len({c for c in d_cu.values if c in top1000}),
                    # 有行但象限/BG 全空 → 判定为列缺失(静默降级的唯一可观测信号)
                    "hasQuad": bool(top1000) and any(v.get("quad") for v in top1000.values()),
                    "hasBg": bool(top1000) and any(v.get("bg") for v in top1000.values()),
                },
                "productCategory": {
                    "provided": os.path.isfile(pcat_path),
                    "rows": len(prod_cats),
                    "coveredLines": len([x for x in seen_lines if x in prod_cats]),
                    "totalLines": len(seen_lines),
                },
                "calibration": dict(calib),
                "unattributed": {"rows": unattr_rows, "hours": round(unattr_hours, 2)},
                "roster": {
                    "hasSupColumn": any(p.get("supId") for p in roster),
                    "managers": len(mgr_ids),
                },
            },
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian.py -v`
Expected: 全部 PASS（含既有用例）

- [ ] **Step 5: `preprocess_data.py` 加告警**

在第 11 段 `print("[OK] 倚天工时域: ...")` 之后、`droppedRows` 告警之前插入：

```python
            rd = ymeta["dataReadiness"]
            t1r = rd["top1000"]
            if not t1r["provided"]:
                print("  [WARN] 未提供 input/%s,客户分类/象限/市场BG 将全部为空"
                      % config.TOP1000_FILE)
            elif t1r["rows"] == 0:
                # 文件在、却一行都没解析出来 —— 表头改名/格式坏,与「没放文件」是两码事,
                # 文案必须分开,否则运维会去放一个已经在那儿的文件。
                print("  [WARN] %s 存在但解析出 0 行(表头是否含「客户名称」?),"
                      "客户分类/象限/市场BG 将全部为空" % config.TOP1000_FILE)
            else:
                if not t1r["hasQuad"]:
                    print("  [WARN] %s 未找到「象限」或「客户象限」列,可转移判定将失真"
                          % config.TOP1000_FILE)
                if not t1r["hasBg"]:
                    print("  [WARN] %s 未找到「市场BG」列" % config.TOP1000_FILE)
            pcr = rd["productCategory"]
            if not pcr["provided"]:
                print("  [WARN] 未提供 input/%s,产品大类与渠道可交付判定将全部落空"
                      % config.PRODUCT_CATEGORY_FILE)
            elif pcr["rows"] == 0:
                print("  [WARN] %s 存在但解析出 0 行(表头是否含「产品线」?),"
                      "产品大类与渠道可交付判定将全部落空" % config.PRODUCT_CATEGORY_FILE)
            elif pcr["totalLines"] and pcr["coveredLines"] / pcr["totalLines"] < 0.9:
                print("  [WARN] %s 未覆盖 %d/%d 个产品线(覆盖率 %.0f%%)"
                      % (config.PRODUCT_CATEGORY_FILE,
                         pcr["totalLines"] - pcr["coveredLines"], pcr["totalLines"],
                         pcr["coveredLines"] / pcr["totalLines"] * 100))
            if not rd["roster"]["hasSupColumn"]:
                print("  [WARN] 组织架构表无「直接上级工号」列,管理干部识别不可用")
            cal = rd["calibration"]
            if cal["pending"]:
                print("  [INFO] 产品线校准: 待校准 %d 行,已校准 %d 行(%.0f%%),多义 %d,零命中 %d"
                      % (cal["pending"], cal["calibrated"],
                         cal["calibrated"] / cal["pending"] * 100,
                         cal["ambiguous"], cal["unmatched"]))
            ua = rd["unattributed"]
            if ua["rows"]:
                print("  [INFO] 客户不可归属: %d 行 / %.0f h(可转移判定的盲区)"
                      % (ua["rows"], ua["hours"]))
```

- [ ] **Step 6: 端到端跑一次真实管线（关键验收，对拍 spec §3.9）**

```bash
python preprocess_data.py 2>&1 | tail -30
```
Expected 日志含 `[INFO] 产品线校准: 待校准 1439 行,已校准 307 行(21%),多义 931,零命中 201` 与 `[INFO] 客户不可归属: 478 行 / 2810 h`，且**无 `[WARN]`**（两张源表齐全）。

然后对拍五档分布：

```bash
python -c "
import sys, json, collections; sys.stdout.reconfigure(encoding='utf-8')
d = json.load(open('data/yitian_data.json', encoding='utf-8'))
ty = d['dims']['types']; CT = ('项目类','售前类','售后类')
LB = ['客户不可归属','不可转移:M1M2战略客户','不可转移:项目管理工时','不可转移:非渠道可交付产品','★可转移非原厂']
acc = collections.Counter()
for e in d['entries']:
    t = ty[e['t']] if e['t'] is not None else ''
    if t in CT: acc[e['tr']] += e['h']
tot = sum(acc.values())
for i in range(5): print('%-24s %8.0f h  %5.1f%%' % (LB[i], acc[i], acc[i]/tot*100))
print('合计 %.0f h' % tot)
"
```

Expected（spec §3.9 基线，允许 ±1 h 舍入）：
```
客户不可归属                  2810 h    4.5%
不可转移:M1M2战略客户        24504 h   39.3%
不可转移:项目管理工时          4988 h    8.0%
不可转移:非渠道可交付产品     13277 h   21.3%
★可转移非原厂                16734 h   26.9%
合计 62314 h
```

> **对不上就停下查口径，不要改基线迁就实现。**

- [ ] **Step 7: 提交**

```bash
git add yitian.py preprocess_data.py tests/test_yitian.py
git commit -m "feat(yitian): 接线派生字段与就绪度指标

build_yitian_data 产出 8 个 entry 派生字段 + isMgr + dataReadiness;
preprocess 按就绪度打 WARN/INFO,补上 TOP1000 解析此前完全没有的告警。
五档分布与设计期基线对拍一致(可转移 16734h/26.9%)。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 前端类型生成与明细页 10 个可选列

**Files:**
- Modify: `frontend/src/types/yitian.ts`（**生成，不手改**）
- Create: `frontend/src/lib/yitian/derived.ts`
- Create: `frontend/src/lib/yitian/derived.test.ts`
- Modify: `frontend/src/lib/yitian/detail.ts`（`DetailRow` 6–29、`buildDetailRows` 37–、`ALL_COLUMNS` 122–145、`FILTERABLE` 147）
- Test: `frontend/src/lib/yitian/detail.test.ts`

**Interfaces:**
- Consumes: T6/T7 产出的 `YitianData` 新字段
- Produces:
  - `lib/yitian/derived.ts`：`TRANSFER_LABELS: string[]`（下标 = `tr`）、`LINE_SRC_LABELS: string[]`（下标 = `ls`）、`transferLabel(tr: number): string`、`lineSrcLabel(ls: number): string`
  - `DetailRow` 新增 10 个字段（见下）

- [ ] **Step 1: 重新生成类型**

```bash
npm --prefix frontend run gen:types
git diff --stat frontend/src/types/yitian.ts
```
Expected: `yitian.ts` 出现 `Cq` / `Cbg` / `El` / `Ls` / `Ec` / `Ch` / `Pm` / `Tr` / `Custquads` / `Custbgs` / `Prodcats` / `Ismgr` / `YitianReadiness` 等生成类型。
> 若 `json2ts` 未安装，先 `npm --prefix frontend install`。

- [ ] **Step 2: 写失败测试（标签模块）**

新建 `frontend/src/lib/yitian/derived.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { TRANSFER_LABELS, LINE_SRC_LABELS, transferLabel, lineSrcLabel } from './derived'

describe('derived 标签', () => {
  it('五档标签下标与后端枚举一一对应', () => {
    expect(TRANSFER_LABELS).toHaveLength(5)
    expect(TRANSFER_LABELS[0]).toBe('客户不可归属')
    expect(TRANSFER_LABELS[4]).toBe('可转移非原厂')
  })

  it('校准状态四档', () => {
    expect(LINE_SRC_LABELS).toHaveLength(4)
    expect(LINE_SRC_LABELS[1]).toBe('已校准')
  })

  it('越界下标返回空串而不是 undefined', () => {
    expect(transferLabel(99)).toBe('')
    expect(lineSrcLabel(-1)).toBe('')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/derived.test.ts`
Expected: FAIL —— 无法解析 `./derived`

- [ ] **Step 4: 建 `derived.ts`**

```ts
/** V4.5.4 派生字段的展示标签。下标必须与后端 yitian_derive.py 的枚举严格一一对应。 */

/** 可转移五档,下标 = entry.tr */
export const TRANSFER_LABELS = [
  '客户不可归属',
  '不可转移：M1/M2 战略客户',
  '不可转移：项目管理工时',
  '不可转移：非渠道可交付产品',
  '可转移非原厂',
]

/** 校准状态四档,下标 = entry.ls */
export const LINE_SRC_LABELS = ['原始', '已校准', '多义未校准', '无匹配']

export function transferLabel(tr: number): string {
  return TRANSFER_LABELS[tr] ?? ''
}

export function lineSrcLabel(ls: number): string {
  return LINE_SRC_LABELS[ls] ?? ''
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/derived.test.ts`
Expected: 3 passed

- [ ] **Step 6: 写明细页失败测试**

在 `frontend/src/lib/yitian/detail.test.ts` 追加（沿用该文件既有的 `YitianData` 构造 fixture，补上新字段）：

```ts
it('派生 10 列并入明细行且值不为 undefined', () => {
  const rows = buildDetailRows(dataWithDerived)   // fixture 见下方说明
  const r = rows[0]
  for (const k of ['custClass', 'custQuad', 'custBg', 'effLine', 'lineSrcText',
                   'prodCat', 'channelText', 'pmText', 'mgrText', 'transferText'] as const) {
    expect(r[k], k).not.toBeUndefined()
  }
  expect(r.transferText).toBe('可转移非原厂')
  expect(r.lineSrcText).toBe('已校准')
  expect(r.custClass).toBe('TOP1000')
})

it('十个新列全部进 ALL_COLUMNS 且默认不可见', () => {
  const keys = ['custClass', 'custQuad', 'custBg', 'effLine', 'lineSrcText',
                'prodCat', 'channelText', 'pmText', 'mgrText', 'transferText']
  for (const k of keys) {
    expect(ALL_KEYS, k).toContain(k)
    expect(DEFAULT_VISIBLE, k).not.toContain(k)   // 持久化优先,新列必须默认隐藏
    expect(FILTERABLE.has(k), k).toBe(true)
  }
})
```

> fixture 需在既有 `YitianData` mock 上补：`dims.custQuads/custBgs/prodCats`、`roster[].isMgr`、`entries[].{cq,cbg,el,ls,ec,ch,pm,tr}`、`meta.dataReadiness`。构造一条 `tr:4, ls:1, top:true` 的记录。

- [ ] **Step 7: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/detail.test.ts`
Expected: FAIL

- [ ] **Step 8: 改 `detail.ts`**

`DetailRow` 接口在 `content: string` 之后加：
```ts
  // ── V4.5.4 派生列 ──
  custClass: string      // TOP1000 / 非TOP1000
  custQuad: string       // M1~M4 原值,未匹配为空
  custBg: string
  effLine: string        // 校准后产品线
  lineSrcText: string    // 原始 / 已校准 / 多义未校准 / 无匹配
  prodCat: string        // 校准后产品大类
  channelText: string    // 是 / 空
  pmText: string         // 是 / 空
  mgrText: string        // 是 / 空(员工属性)
  transferText: string   // 五档中文
```

`buildDetailRows` 的行对象内追加（`dv` 为该函数内既有的码表取值辅助；`p` 为花名册项）：
```ts
    custClass: e.top ? 'TOP1000' : '非TOP1000',
    custQuad: dv(d.custQuads, e.cq),
    custBg: dv(d.custBgs, e.cbg),
    effLine: dv(d.products, e.el),
    lineSrcText: lineSrcLabel(e.ls),
    prodCat: dv(d.prodCats, e.ec),
    channelText: e.ch ? '是' : '',
    pmText: e.pm ? '是' : '',
    mgrText: p?.isMgr ? '是' : '',
    transferText: transferLabel(e.tr),
```
顶部加 `import { transferLabel, lineSrcLabel } from './derived'`。

`ALL_COLUMNS` 末尾追加（**放在 `content` 之后**，`content` 保持最后一个宽列的位置感不受影响；顺序即选列面板顺序）：
```ts
  { key: 'custClass', label: '客户分类', width: 110 },
  { key: 'custQuad', label: '客户象限', width: 130 },
  { key: 'custBg', label: '市场BG', width: 100 },
  { key: 'effLine', label: '校准后产品线', width: 140 },
  { key: 'lineSrcText', label: '校准状态', width: 110 },
  { key: 'prodCat', label: '产品大类', width: 120 },
  { key: 'channelText', label: '渠道可交付', width: 110 },
  { key: 'pmText', label: '项目管理工时', width: 120 },
  { key: 'mgrText', label: '管理干部', width: 100 },
  { key: 'transferText', label: '可转移判定', width: 180 },
```

`FILTERABLE` 加十个 key：
```ts
export const FILTERABLE = new Set(['l4', 'l2', 'l3', 'l31', 'category', 'type', 'workType3',
  'projectType', 'serviceMode', 'salesL2', 'top', 'okText', 'customer', 'empName',
  'custClass', 'custQuad', 'custBg', 'effLine', 'lineSrcText', 'prodCat',
  'channelText', 'pmText', 'mgrText', 'transferText'])
```

`DEFAULT_VISIBLE` **保持不动**（新列默认隐藏 —— `useColumnPrefs` 持久化优先，加默认列对老用户不生效，V4.0.1 已吃过这个亏）。

- [ ] **Step 9: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/lib/yitian/`
Expected: 全部 PASS

- [ ] **Step 10: 反向验证**

把 `mgrText: p?.isMgr ? '是' : ''` 临时改成 `mgrText: undefined as unknown as string`，重跑 Step 9，**必须红**在「值不为 undefined」那条。确认后改回。
> 这条守的是 V4.4.4 记录过的假绿形态：`k in row` 恒真（无条件赋 `undefined` 也算自有属性），所以断言必须写 `not.toBeUndefined()` 而非 `in`。

- [ ] **Step 11: typecheck 并提交**

```bash
npm --prefix frontend run typecheck
git add frontend/src/types/yitian.ts frontend/src/lib/yitian/derived.ts \
        frontend/src/lib/yitian/derived.test.ts frontend/src/lib/yitian/detail.ts \
        frontend/src/lib/yitian/detail.test.ts
git commit -m "feat(yitian-detail): 明细页新增 10 个派生可选列

全部默认隐藏(useColumnPrefs 持久化优先,加默认列对老用户不生效),
十列全部可筛选。标签下标与后端枚举一一对应。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 总览页就绪度卡与可转移 KPI

**Files:**
- Create: `frontend/src/components/YitianReadinessCard.vue`
- Create: `frontend/src/components/YitianReadinessCard.test.ts`
- Modify: `frontend/src/views/YitianOverviewView.vue`

**Interfaces:**
- Consumes: `YitianData['meta']['dataReadiness']`（T6/T7）、`entries[].tr`、`lib/yitian/derived.ts` 的 `TRANSFER_LABELS`（T8）
- Produces: 组件 `<YitianReadinessCard :data="scopedYitian" />`，无 emit

**设计约束（`docs/superpowers/specs/2026-06-10-design-foundation-design.md`）**：
- 卡片用 `AppCard`，标题用 `SectionTitle level="section"`，KPI 用 `MetricGrid`
- 数字挂 `.u-num`（`MetricGrid` 内部已挂）
- 间距只用 `--sp-*` 令牌，不手写散值
- 状态色只用于无文字色块或「淡底+深字」；**可转移** 用 `--ok`，**不可归属** 用 `--warn`

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/components/YitianReadinessCard.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import YitianReadinessCard from './YitianReadinessCard.vue'

const readiness = {
  top1000: { provided: true, rows: 139, matchedCustomers: 97, hasQuad: true, hasBg: true },
  productCategory: { provided: true, rows: 108, coveredLines: 81, totalLines: 81 },
  calibration: { pending: 1439, calibrated: 307, ambiguous: 931, unmatched: 201 },
  unattributed: { rows: 478, hours: 2810 },
  roster: { hasSupColumn: true, managers: 14 },
}
const data = {
  meta: { dataReadiness: readiness },
  dims: { types: ['项目类'] },
  entries: [
    { t: 0, h: 10, tr: 4 }, { t: 0, h: 30, tr: 1 }, { t: 0, h: 60, tr: 0 },
  ],
} as never

/** 按标签取指定 grid 内该 KPI 卡的值 —— 不用整页 toContain(会碰瓷同页别处的相同数字),
 *  也必须限定 grid:「客户不可归属」在五档与就绪度两个 grid 里都有,不限定会取到第一个。
 *  MetricGrid 的 DOM:每张卡 .mg-card 内 .mg-k(标签) / .mg-v(主值) / .mg-sub(辅值)。 */
function cardOf(w: ReturnType<typeof mount>, grid: '.rc-grid' | '.rc-grid2', label: string) {
  const card = w.find(grid).findAll('.mg-card').find((c) => c.find('.mg-k').text() === label)
  if (!card) throw new Error(`${grid} 内未找到标签为「${label}」的 KPI 卡`)
  return { v: card.find('.mg-v').text(), sub: card.find('.mg-sub').text() }
}

describe('YitianReadinessCard', () => {
  it('渲染就绪度四数', () => {
    const w = mount(YitianReadinessCard, { props: { data } })
    expect(cardOf(w, '.rc-grid2', '产品大类覆盖').v).toBe('81/81')
    expect(cardOf(w, '.rc-grid2', 'TOP1000 匹配客户').v).toBe('97')
    expect(cardOf(w, '.rc-grid2', '产品线校准覆盖').v).toBe('21%')   // 307/1439
    expect(cardOf(w, '.rc-grid2', '客户不可归属').v).toBe('2810')
  })

  it('可转移五档按工时聚合且比例正确', () => {
    const w = mount(YitianReadinessCard, { props: { data } })
    expect(cardOf(w, '.rc-grid', '可转移非原厂')).toEqual({ v: '10', sub: '10%' })
    expect(cardOf(w, '.rc-grid', '不可转移：M1/M2 战略客户')).toEqual({ v: '30', sub: '30%' })
    // 同名标签在两个 grid 里值不同:五档那张是本区间的 60h,就绪度那张是全量 2810h
    expect(cardOf(w, '.rc-grid', '客户不可归属').v).toBe('60')
  })

  it('五档只统计客户类工时', () => {
    const withMgmt = { ...data, dims: { types: ['项目类', '管理类'] },
      entries: [...(data as { entries: unknown[] }).entries, { t: 1, h: 900, tr: 4 }] } as never
    const w = mount(YitianReadinessCard, { props: { data: withMgmt } })
    expect(cardOf(w, '.rc-grid', '可转移非原厂').v).toBe('10')   // 管理类那 900h 不得混进来
  })

  it('源表缺失时给出告警文案而非静默显示 0', () => {
    const bad = { ...data, meta: { dataReadiness: {
      ...readiness, productCategory: { provided: false, rows: 0, coveredLines: 0, totalLines: 81 },
    } } } as never
    const w = mount(YitianReadinessCard, { props: { data: bad } })
    expect(w.text()).toContain('未提供')
  })

  it('data 为 null 时不炸', () => {
    const w = mount(YitianReadinessCard, { props: { data: null } })
    expect(w.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/components/YitianReadinessCard.test.ts`
Expected: FAIL —— 无法解析组件

- [ ] **Step 3: 建组件**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import AppCard from './AppCard.vue'
import SectionTitle from './SectionTitle.vue'
import MetricGrid from './MetricGrid.vue'
import { TRANSFER_LABELS } from '@/lib/yitian/derived'
import type { YitianData } from '@/types/yitian'

const props = defineProps<{ data: YitianData | null }>()

const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']

const rd = computed(() => props.data?.meta?.dataReadiness ?? null)

/** 就绪度四数。任一源表缺失时给明确文案,不静默显示 0 —— 0 与「没提供」是两回事。 */
const readiness = computed(() => {
  const r = rd.value
  if (!r) return []
  const pc = r.productCategory
  const cal = r.calibration
  return [
    { k: '产品大类覆盖',
      v: pc.provided ? `${pc.coveredLines}/${pc.totalLines}` : '未提供',
      sub: pc.provided && pc.totalLines
        ? `${Math.round((pc.coveredLines / pc.totalLines) * 100)}%` : '产品分类.xlsx 缺失',
      cls: pc.provided ? '' : 'rc-warn' },
    { k: 'TOP1000 匹配客户',
      v: r.top1000.provided ? String(r.top1000.matchedCustomers) : '未提供',
      sub: r.top1000.provided ? `清单 ${r.top1000.rows} 家` : 'TOP1000.xlsx 缺失',
      cls: r.top1000.provided && r.top1000.hasQuad ? '' : 'rc-warn' },
    { k: '产品线校准覆盖',
      v: cal.pending ? `${Math.round((cal.calibrated / cal.pending) * 100)}%` : '-',
      sub: cal.pending ? `已校准 ${cal.calibrated} / 待校准 ${cal.pending}` : '无待校准记录' },
    { k: '客户不可归属',
      v: String(Math.round(r.unattributed.hours)),
      sub: `${r.unattributed.rows} 行 · 可转移判定盲区`,
      cls: r.unattributed.rows ? 'rc-warn' : '' },
  ]
})

/** 可转移五档按工时聚合(仅客户类工时,与后端判定口径一致)。 */
const transfer = computed(() => {
  const d = props.data
  if (!d) return []
  const acc = [0, 0, 0, 0, 0]
  for (const e of d.entries) {
    const t = e.t === null || e.t === undefined ? '' : (d.dims.types[e.t] ?? '')
    if (!CUSTOMER_TYPES.includes(t)) continue
    acc[e.tr] = (acc[e.tr] ?? 0) + e.h
  }
  const tot = acc.reduce((a, b) => a + b, 0)
  return acc.map((h, i) => ({
    k: TRANSFER_LABELS[i],
    v: String(Math.round(h)),
    sub: tot ? `${Math.round((h / tot) * 100)}%` : '-',
    cls: i === 4 ? 'rc-ok' : i === 0 ? 'rc-warn' : '',
  }))
})
</script>

<template>
  <AppCard v-if="rd">
    <SectionTitle level="section">可转移非原厂支持</SectionTitle>
    <MetricGrid :items="transfer" col-min="170px" class="rc-grid" />
    <SectionTitle level="section" class="rc-t2">数据就绪度</SectionTitle>
    <p class="rc-note">
      以上判定的可信度由下列四项决定：校准覆盖率越低、不可归属工时越多，结论水分越大；
      TOP1000 清单不全会让「可转移」偏高。
    </p>
    <!-- 两个 grid 的 class 必须不同:「客户不可归属」标签在两处都有,测试要靠 class 区分 -->
    <MetricGrid :items="readiness" col-min="170px" class="rc-grid2" />
  </AppCard>
</template>

<style scoped>
.rc-grid, .rc-grid2 { margin-bottom: var(--sp-4); }
.rc-t2 { margin-top: var(--sp-4); }
.rc-note { margin: 0 0 var(--sp-3); font-size: var(--fs-1); color: var(--mut); }
.rc-ok { color: var(--ok-text); }
.rc-warn { color: var(--warn-text); }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/components/YitianReadinessCard.test.ts`
Expected: 4 passed

- [ ] **Step 5: 挂进总览页**

`YitianOverviewView.vue`：
1. `import YitianReadinessCard from '@/components/YitianReadinessCard.vue'`
2. 模板中 **紧接在「工时类型占比」卡之前** 插入：
```vue
      <YitianReadinessCard :data="scopedYitian" />
```
> 放在顶部 KPI 带之后、既有分析卡之前 —— 本期唯一的新结论应当先被看见。

- [ ] **Step 6: 跑总览页既有测试**

Run: `npm --prefix frontend run test:run -- src/views/YitianOverviewView.test.ts`
Expected: PASS。若因新增子组件导致 mock 缺字段而红，**在 fixture 里补 `meta.dataReadiness` 与 `entries[].tr`**，不要给组件加兜底默认值掩盖。

- [ ] **Step 7: typecheck 并提交**

```bash
npm --prefix frontend run typecheck
git add frontend/src/components/YitianReadinessCard.vue \
        frontend/src/components/YitianReadinessCard.test.ts \
        frontend/src/views/YitianOverviewView.vue frontend/src/views/YitianOverviewView.test.ts
git commit -m "feat(yitian-overview): 就绪度卡与可转移五档 KPI

一期唯一的可见结论。四个就绪度数字与结论同屏 —— 单给结论不给分母,
就是 V4.5.3 刚修过的「标签与数据不符」。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `/data` 页显示两张源表解析状态

**Files:**
- Modify: `frontend/src/components/YitianSourceCard.vue`
- Test: `frontend/src/components/YitianSourceCard.test.ts`

**Interfaces:**
- Consumes: `useYitianStore()` 提供的 `YitianData`（`meta.dataReadiness`）
- Produces: 无对外接口

- [ ] **Step 1: 写失败测试**

该文件既有的 `mountCard` 是 **无参 async 函数**（`const mountCard = async () => {...}`），且 `beforeEach` 里已 `setActivePinia(createPinia())`。注入数据靠**挂载前直接给 store 赋值**（`stores/yitian.ts` 是 setup store，`data` 为 `shallowRef`，经 Pinia 代理可直接赋值）。

在 `frontend/src/components/YitianSourceCard.test.ts` 顶部补 import：
```ts
import { useYitianStore } from '@/stores/yitian'
```

在 `describe` 内追加：

```ts
const READINESS = {
  top1000: { provided: true, rows: 139, matchedCustomers: 97, hasQuad: true, hasBg: true },
  productCategory: { provided: true, rows: 108, coveredLines: 81, totalLines: 81 },
  calibration: { pending: 0, calibrated: 0, ambiguous: 0, unmatched: 0 },
  unattributed: { rows: 0, hours: 0 },
  roster: { hasSupColumn: true, managers: 14 },
}

/** 挂载前把就绪度塞进 store。beforeEach 已建好 pinia,这里取到的就是同一个实例。 */
const seedReadiness = (rd: unknown) => {
  useYitianStore().data = { meta: { dataReadiness: rd } } as never
}

it('显示两张源表解析状态', async () => {
  seedReadiness(READINESS)
  const w = await mountCard()
  expect(w.text()).toContain('TOP1000.xlsx')
  expect(w.text()).toContain('139')
  expect(w.text()).toContain('产品分类.xlsx')
  expect(w.text()).toContain('108')
  expect(w.text()).toContain('81/81')
})

it('象限列缺失时显式告警', async () => {
  seedReadiness({ ...READINESS, top1000: { ...READINESS.top1000, hasQuad: false } })
  const w = await mountCard()
  expect(w.text()).toContain('未找到象限列')
})

it('产品分类未提供时显式告警而非显示 0 条', async () => {
  seedReadiness({ ...READINESS,
    productCategory: { provided: false, rows: 0, coveredLines: 0, totalLines: 81 } })
  const w = await mountCard()
  expect(w.text()).toContain('未提供')
})

it('store 无数据时不渲染就绪度区且不炸', async () => {
  const w = await mountCard()          // 不 seed
  expect(w.text()).not.toContain('未找到象限列')
  expect(w.text()).toContain('工时.xlsx')   // 卡片其余部分正常
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm --prefix frontend run test:run -- src/components/YitianSourceCard.test.ts`
Expected: FAIL

- [ ] **Step 3: 改组件**

`<script setup>` 加：
```ts
import { useYitianStore } from '@/stores/yitian'
const yStore = useYitianStore()
const rd = computed(() => yStore.data?.meta?.dataReadiness ?? null)
```
（`computed` 若未导入则补进 `import { ref, computed, onMounted } from 'vue'`）

模板中在既有文件时间行之后加：
```vue
      <div v-if="rd" class="ysc-rd">
        <div class="ysc-rd-row">
          <span>TOP1000.xlsx</span>
          <span v-if="!rd.top1000.provided" class="ysc-warn">未提供</span>
          <span v-else>
            {{ rd.top1000.rows }} 家 · 匹配 {{ rd.top1000.matchedCustomers }}
            <span v-if="!rd.top1000.hasQuad" class="ysc-warn">· 未找到象限列</span>
            <span v-if="!rd.top1000.hasBg" class="ysc-warn">· 未找到市场BG列</span>
          </span>
        </div>
        <div class="ysc-rd-row">
          <span>产品分类.xlsx</span>
          <span v-if="!rd.productCategory.provided" class="ysc-warn">未提供</span>
          <span v-else>
            {{ rd.productCategory.rows }} 条 · 覆盖产品线
            {{ rd.productCategory.coveredLines }}/{{ rd.productCategory.totalLines }}
          </span>
        </div>
      </div>
```

样式：
```css
.ysc-rd { display: flex; flex-direction: column; gap: var(--sp-1); margin-top: var(--sp-2); }
.ysc-rd-row { display: flex; justify-content: space-between; gap: var(--sp-2);
              font-size: var(--fs-1); color: var(--sub); }
.ysc-warn { color: var(--warn-text); }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm --prefix frontend run test:run -- src/components/YitianSourceCard.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/YitianSourceCard.vue frontend/src/components/YitianSourceCard.test.ts
git commit -m "feat(data-page): /data 页显示 TOP1000 与产品分类解析状态

补上 TOP1000 此前完全没有的可观测性:列缺失会显式告警,而不是让客户
分类/象限静默全空。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 全量验证、版本号与 PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts` 改为 `V4.5.4`（只改此处，全站单一来源）。

- [ ] **Step 2: 饱和度口径回归安全网（先单独跑，spec §8.2 强制）**

```bash
npm --prefix frontend run test:run -- src/lib/yitian/metrics.test.ts
```
Expected: 全绿且**断言值一字未改** —— 尤其 `a1.sat = 1.25`、`a1.diff = 4`、`orgL4SummaryRow.base = 24`、`unfilledList = ['A2']`。
本期承诺「不改饱和度口径」（V4.4.5 双基准已与用户确认），**这条一旦变红或需要改断言，说明有人动了 `metrics.ts`，立即回退**。

- [ ] **Step 3: 跑全量验证**

```bash
bash verify.sh
```
Expected: 全绿 —— py_compile OK、ruff OK、pytest 全过、前端 typecheck OK、vitest 全过、build OK。

已知非本期引入的噪声（出现可忽略，但要在 PROGRESS 里如实记）：
- `tests/test_server_download.py::test_super_download_missing_script_reports` 是既有竞态 flake（backlog L-32）
- `tests/test_server_budget.py::test_config_post_未登录401` 曾偶发 ConnectionAborted（L-32 第二例）
- build 的 `>500KB` 单 chunk 与 esbuild CSS 注释两条警告为既有

若上述之外有红，**必须修**，不得以 flake 为由放行。

- [ ] **Step 4: 重跑管线并最终对拍**

```bash
python preprocess_data.py 2>&1 | tail -20
```
再执行 Task 7 Step 6 的五档对拍脚本，确认与 spec §3.9 基线一致。

- [ ] **Step 5: 更新 PROGRESS.md**

在文件顶部版本区插入 V4.5.4 条目，把「上一版本」改为 V4.5.3。条目须含：
- 本期范围：三张源表接入 + 9 个派生字段 + 两组可配项 + 前端三处可见交付
- **实测基线**：可转移 16734 h / 26.9%，校准覆盖 307/1439（21%），不可归属 478 行 / 2810 h，管理干部 14 人
- **口径代价（必须写，勿省）**：沿用 139 行 TOP1000 清单，「可转移」相对虚高约 1636 h（+10.8%）；收敛路径是生产覆盖一份更全的 `TOP1000.xlsx`，零代码改动
- **部署提示**：新增 `input/产品分类.xlsx`，**升级后必须先放这个文件再点「更新数据」**，否则产品大类与渠道可交付全部落空（页面会显式告警，不会静默）
- **需点「更新数据」**：本期改了 `preprocess_data.py` / `yitian.py` / `schema.py`，属数据管线变更，与前几版纯前端不同
- 未做项：二期（客户与产品分析页）、三期（治理页 + A 项补全）

同时在 backlog 区新增一条：
```
- [ ] **L-40（V4.5.4 遗留）** 「可转移非原厂支持」当前基于 139 行 TOP1000 清单，
      相对虚高约 1636 h（+10.8%，实测）。生产覆盖一份更全的 TOP1000.xlsx 即自动收敛，
      无需改代码。页面脚注已提示，但使用者仍可能把 26.9% 当精确值——二期做下钻分析时
      需在页面显著位置重申此口径边界。
```

- [ ] **Step 6: 提交并推送**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.5.4 倚天域数据底座

三张源表接入(TOP1000 扩读/产品分类新增/花名册直接上级) + 9 个派生字段
+ pmTag/placeholder 两组可配项;前端明细页 10 列、总览就绪度卡与可转移
KPI、/data 解析状态。实测可转移 16734h/26.9%,与设计期基线一致。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin master
```

> 推送前 `git status` + `git diff --cached --stat` 核一眼：**绝不能出现 `data/`、`input/`、`release/`、`yitian*/` 下的任何文件**。

---

## 人工验证清单（AI 无浏览器，须用户执行）

按重要性排序，**第 1 条是本期唯一的新结论，不过就说明接线有问题**：

1. 打开 `/yitian` 总览页 → 顶部出现「可转移非原厂支持」卡，五档合计等于客户类工时总量，「可转移非原厂」约 26.9%。
2. 同卡下半区「数据就绪度」四数：产品大类覆盖 `81/81`、TOP1000 匹配 `97`、校准覆盖 `21%`、不可归属 `2810`。
3. `/yitian/detail` → 选列面板底部出现 10 个新列，**默认全部不勾选**；勾上「可转移判定」后该列有值且可筛选。
4. `/data` 页倚天卡 → 显示 `TOP1000.xlsx 139 家 · 匹配 97` 与 `产品分类.xlsx 108 条 · 覆盖产品线 81/81`。
5. **降级验证**：把 `input/产品分类.xlsx` 临时改名 → 点「更新数据」→ 日志出现 `[WARN] 未提供 input/产品分类.xlsx`，`/data` 卡显示「未提供」，总览卡该项显示「未提供」而非 `0`。改回后重跑恢复。
