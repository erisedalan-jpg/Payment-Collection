# V3.0.0 倚天工时域（/yitian）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `yitian-analyze/` 那个写死 2026 年、产出单体 HTML 的工时检查工具，重构进本平台：离线导入 `工时.xlsx` → 后端管线 → 独立 `data/yitian_data.json` → `/yitian` 总览 + 4 个子页，年度无关、按 L4 权限隔离、周期动态可选。

**Architecture:** 后端 4 个新纯函数模块（日历 / 规则 / 合规判定 / 管线组装）产出「码表 + 精简事实行」的独立 JSON；前端惰性拉取该 JSON，用 `lib/yitian/*.ts` 纯函数按任意日期区间现算全部指标。合规判定重（正则、关键词表、同工单关联）放后端，聚合与筛选放前端。

**Tech Stack:** Python 3.8+ 标准库 + openpyxl + pydantic（**本仓无 pandas，禁止引入**）；Vue3 + Vite + TS + Pinia + Element Plus 2.9 + ECharts；pytest + vitest。

**Spec:** `docs/superpowers/specs/2026-07-12-yitian-timesheet-domain-design.md`

## Global Constraints

- **无 pandas**。后端读 xlsx 一律用 openpyxl（复用 `projects.py:_read_header_sheet` 的按表头选 sheet 范式）。
- **连接键是工号，不是姓名**：工时表 `员工编号`（小写 `a000701`）与花名册 `工号`（大写 `A031492`），统一 `.strip().upper()` 后 join。姓名只用于展示。
- **组织/人员权威 = `input/组织架构.xlsx`**（仅 `新L3组织 == "交付实施三部"` 的行）。工时表自带的 `L2/L3/L3-1/L4组织` 列**一律忽略**。
- **隐私裁列**：`员工电话`/`员工所在省`/`员工所在市`/`员工入职省份`/`员工入职城市`/`岗位` 禁止读取与落盘。`工作成果` 正文**只对问题行**下发前 120 字摘要。
- **年度无关**：禁止在代码里写死任何年份。工作日来自 `input/yitian/holidays.csv`；服务方式生效日是 `yitian_rules.py` 里的常量。
- **降级不阻断**：`input/yitian/工时.xlsx` 缺失 → 跳过倚天段并打 `[INFO]`，主管线照常产出 `analysis_data.json`。`holidays.csv` 缺失 → `calendarSource="fallback"`，工作日退化为纯周一~周五。
- **写路径基于 `BASE_DIR`**（`server.py` / `preprocess_data.py` 里已有的 frozen 分支常量），绝不用 `STATIC_DIR` / `sys._MEIPASS`。
- **`_SUPER_ONLY_PATHS` 按 path 匹配、不分 method**：`/api/yitian/data` 是全员（授权账号）可读端点，**绝不能**加进该集合。
- **前端禁止手写散值**：颜色/间距/字号/圆角/阴影一律用 `frontend/src/styles/theme.css` 令牌。合规状态用状态语义色（合规 `--ok` / 提示 `--warn` / 问题 `--danger`），带文字的状态标识用「淡底+深字」（`--ok-bg` + `--ok-text` 等）。数字列必须挂 `.u-num`。**全站禁用 emoji**。
- **Element Plus 2.9**：`el-radio` / `el-radio-button` 用 `value=`（不是废弃的 `label=`）。
- **vitest**：`vi.mock` 工厂内不能引用 `const`（hoisting）→ 用 `vi.hoisted()`。
- 版本单一来源 `frontend/src/version.ts`，本期 **V3.0.0**（用户已确认 X 级）。
- 每个任务提交信息结尾必须带：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## 文件结构

**后端（新增）**
| 文件 | 职责 |
|---|---|
| `yitian_calendar.py` | 节假日 CSV 读取、工作日判定、ISO 周 / 计算周（周五~周四）标签、`days[]` 构建 |
| `yitian_rules.py` | 规则常量（无逻辑）：必填同义词正则、类型禁止词、产品线关键词表、二级产品名关键词表、排除词、本 BG 组织、服务方式生效日、问题码 |
| `yitian_check.py` | 合规判定纯函数：数据校正、6 类规则、同工单关联、二级复核、`ok` 三态 |
| `yitian.py` | 管线组装：读工时（白名单列）→ 工号 join 花名册 → 调 calendar/check → 码表压缩 → `YitianData` dict |

**后端（修改）**
`config.py`（倚天常量 + 上传子目录映射）、`projects.py`（`read_sheet_by_header` 公开包装 + `read_org_roster`）、`schema.py`（`YitianData` 模型 + 校验写出 + JSON Schema 导出）、`preprocess_data.py`（末段接入）、`server.py`（`/api/yitian/data` + 上传子目录 + 文件状态）、`data_scope.py`（`scope_yitian_data`）。

**前端（新增）**
`types/yitian.ts`（生成）、`lib/yitianApi.ts`、`lib/yitian/calendar.ts`、`lib/yitian/metrics.ts`、`lib/yitian/compliance.ts`、`lib/yitian/customer.ts`、`stores/yitian.ts`、`stores/yitianView.ts`、`components/YitianToolbar.vue`、`views/Yitian{Overview,Compliance,Analytics,Trend,Customer}View.vue`。

**前端（修改）**
`router/index.ts`、`nav.ts`、`lib/pageAccess.ts`、`views/DataView.vue`、`stores/auth.ts`、`version.ts`、`package.json`（`gen:types`）。

---

### Task 1: `yitian_calendar.py` — 工作日与双周口径

**Files:**
- Create: `yitian_calendar.py`
- Test: `tests/test_yitian_calendar.py`

**Interfaces:**
- Consumes: 无（叶子模块）
- Produces:
  - `parse_date(s) -> datetime.date | None`
  - `read_holidays(path: str) -> tuple[set[date], set[date]]` → `(休集合, 班集合)`
  - `is_workday(d: date, rest: set, work: set) -> bool`
  - `iso_week(d: date) -> str` → `"2026-W16"`
  - `calc_week(d: date) -> str` → `"2026-CW17"`
  - `build_days(start: date, end: date, rest: set, work: set) -> list[dict]` → `[{"d","workday","isoWeek","calcWeek"}]`

- [ ] **Step 1: 写失败测试**

`tests/test_yitian_calendar.py`：

```python
# -*- coding: utf-8 -*-
"""yitian_calendar.py 纯函数单测。不依赖 input/ 真文件——holidays.csv 用 tmp_path 造。"""
from datetime import date

import yitian_calendar as C


def _write_csv(tmp_path, rows):
    p = tmp_path / "holidays.csv"
    lines = ["日期,类型"] + [f"{d},{k}" for d, k in rows]
    p.write_text("\n".join(lines), encoding="utf-8")
    return str(p)


class TestParseDate:
    def test_iso(self):
        assert C.parse_date("2026-04-17") == date(2026, 4, 17)

    def test_slash_and_datetime_suffix(self):
        assert C.parse_date("2026/04/17") == date(2026, 4, 17)
        assert C.parse_date("2026-04-17 00:00:00") == date(2026, 4, 17)

    def test_bad_returns_none(self):
        assert C.parse_date("") is None
        assert C.parse_date("不是日期") is None
        assert C.parse_date(None) is None


class TestReadHolidays:
    def test_missing_file_degrades(self, tmp_path):
        rest, work = C.read_holidays(str(tmp_path / "nope.csv"))
        assert rest == set() and work == set()

    def test_reads_rest_and_work(self, tmp_path):
        p = _write_csv(tmp_path, [("2026-02-16", "休"), ("2026-02-14", "班"), ("2026-01-01", "休")])
        rest, work = C.read_holidays(p)
        assert rest == {date(2026, 2, 16), date(2026, 1, 1)}
        assert work == {date(2026, 2, 14)}

    def test_skips_bad_rows(self, tmp_path):
        p = _write_csv(tmp_path, [("坏日期", "休"), ("2026-02-16", "未知类型"), ("2026-02-17", "休")])
        rest, work = C.read_holidays(p)
        assert rest == {date(2026, 2, 17)}
        assert work == set()


class TestIsWorkday:
    def test_plain_weekday(self):
        assert C.is_workday(date(2026, 4, 17), set(), set()) is True   # 周五

    def test_plain_weekend(self):
        assert C.is_workday(date(2026, 4, 18), set(), set()) is False  # 周六

    def test_holiday_on_weekday_is_rest(self):
        d = date(2026, 2, 17)  # 周二
        assert C.is_workday(d, {d}, set()) is False

    def test_makeup_on_weekend_is_work(self):
        d = date(2026, 2, 14)  # 周六调休上班
        assert C.is_workday(d, set(), {d}) is True

    def test_work_wins_over_rest(self):
        d = date(2026, 2, 14)
        assert C.is_workday(d, {d}, {d}) is True


class TestWeeks:
    def test_iso_week(self):
        assert C.iso_week(date(2026, 4, 17)) == "2026-W16"

    def test_calc_week_friday_starts_new_week(self):
        # 计算周 = 上周五~本周四:周四(4/16) 与 周五(4/17) 必须分属不同计算周
        assert C.calc_week(date(2026, 4, 16)) != C.calc_week(date(2026, 4, 17))

    def test_calc_week_friday_to_thursday_same_bucket(self):
        # 4/17(周五) ~ 4/23(周四) 同一个计算周
        keys = {C.calc_week(date(2026, 4, d)) for d in range(17, 24)}
        assert len(keys) == 1

    def test_calc_week_label_shape(self):
        assert C.calc_week(date(2026, 4, 17)) == "2026-CW17"

    def test_calc_week_crosses_year(self):
        # 2026-12-31 是周四 → 归本周;2027-01-01 是周五 → 归下一个计算周(不得抛错)
        assert C.calc_week(date(2026, 12, 31)) != C.calc_week(date(2027, 1, 1))


class TestBuildDays:
    def test_builds_inclusive_range_with_labels(self):
        out = C.build_days(date(2026, 4, 17), date(2026, 4, 20), set(), set())
        assert [x["d"] for x in out] == ["2026-04-17", "2026-04-18", "2026-04-19", "2026-04-20"]
        assert [x["workday"] for x in out] == [True, False, False, True]
        assert out[0]["isoWeek"] == "2026-W16"
        assert out[0]["calcWeek"] == "2026-CW17"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_calendar.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'yitian_calendar'`

- [ ] **Step 3: 实现**

`yitian_calendar.py`：

```python
# yitian_calendar.py
"""倚天工时域:工作日与双周口径(年度无关,不写死任何年份)。纯函数,可单测。

工作日 = (周一~周五 且 不在「休」) 或 (在「班」)。「休」「班」来自 input/yitian/holidays.csv。
双周口径:isoWeek = ISO 自然周(周一~周日);calcWeek = 倚天计算周(上周五~本周四)。
"""
from __future__ import annotations

import csv
import os
from datetime import date, datetime, timedelta
from typing import List, Optional, Set, Tuple

REST = "休"   # 法定假日/调休放假(即使是周一~周五)
WORK = "班"   # 调休上班日(即使是周六/周日)


def parse_date(s) -> Optional[date]:
    """'2026-04-17' / '2026/04/17' / '2026-04-17 00:00:00' / datetime / date → date;不可解析 → None。"""
    if isinstance(s, datetime):
        return s.date()
    if isinstance(s, date):
        return s
    t = str(s or "").strip()
    if not t:
        return None
    t = t.split(" ")[0].replace("/", "-")
    try:
        return datetime.strptime(t, "%Y-%m-%d").date()
    except ValueError:
        return None


def read_holidays(path: str) -> Tuple[Set[date], Set[date]]:
    """holidays.csv(表头 日期,类型) → (休集合, 班集合)。
    文件缺失/不可读 → (set(), set())(降级为纯周一~周五);坏行静默跳过。"""
    rest: Set[date] = set()
    work: Set[date] = set()
    if not os.path.isfile(path):
        return rest, work
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                d = parse_date(row.get("日期"))
                if d is None:
                    continue
                kind = str(row.get("类型") or "").strip()
                if kind == REST:
                    rest.add(d)
                elif kind == WORK:
                    work.add(d)
    except OSError:
        return set(), set()
    return rest, work


def is_workday(d: date, rest: Set[date], work: Set[date]) -> bool:
    """「班」优先于「休」(同日两标以上班为准),其次「休」,再次周一~周五。"""
    if d in work:
        return True
    if d in rest:
        return False
    return d.weekday() < 5


def iso_week(d: date) -> str:
    """ISO 自然周标签,如 2026-W16。"""
    y, w, _ = d.isocalendar()
    return "%d-W%02d" % (y, w)


def calc_week(d: date) -> str:
    """倚天计算周(上周五~本周四)标签,如 2026-CW17。
    做法:把日期向后推到最近的周四,取该周四的 ISO 周序 —— 周五/六/日 推到下周四,周一~周四推到本周四。
    不依赖任何写死的 W1..W52 表,跨年自动正确。"""
    wd = d.weekday()                       # Mon=0 ... Sun=6
    delta = (3 - wd) if wd <= 3 else (10 - wd)
    thu = d + timedelta(days=delta)
    y, w, _ = thu.isocalendar()
    return "%d-CW%02d" % (y, w)


def build_days(start: date, end: date, rest: Set[date], work: Set[date]) -> List[dict]:
    """[start, end] 闭区间逐日 → [{"d","workday","isoWeek","calcWeek"}]。"""
    out: List[dict] = []
    d = start
    while d <= end:
        out.append({
            "d": d.isoformat(),
            "workday": is_workday(d, rest, work),
            "isoWeek": iso_week(d),
            "calcWeek": calc_week(d),
        })
        d += timedelta(days=1)
    return out
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian_calendar.py -q && python -m ruff check yitian_calendar.py`
Expected: 19 passed；ruff 无告警

- [ ] **Step 5: 提交**

```bash
git add yitian_calendar.py tests/test_yitian_calendar.py
git commit -m "feat(yitian): 工作日与双周口径(节假日CSV驱动,年度无关)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `yitian_rules.py` — 规则常量库

**Files:**
- Create: `yitian_rules.py`
- Test: `tests/test_yitian_rules.py`

**Interfaces:**
- Consumes: 无（纯数据）
- Produces（供 Task 3 `yitian_check.py` 与 Task 4 `yitian.py` 消费）：
  - `CHECKED_TYPES: tuple` / `MGMT_TYPE: str` / `EXCLUDED_TYPES: tuple`
  - `SUMMARY_RE / PROGRESS_RE / NEXT_RE: str`（正则源串）
  - `SERVICE_MODE_EFFECTIVE_DATE: str`
  - `TYPE_MISMATCH_RULES: dict[str, list[tuple[str, str]]]`
  - `PRODUCT_LINE_KEYWORDS: list[tuple[list[str], list[str]]]`
  - `PRODUCT_NAME_KEYWORDS: list[tuple[list[str], list[str]]]`
  - `EXCLUSIVE_KWS: set[str]`
  - `CUSTOMER_HINT_RE: str` / `PRESALE_SKIP_WORKTYPES: set[str]` / `PRESALE_PROJECT_TYPE_KEY: str`
  - `THIS_BG_L2_ORGS: list[str]`
  - `ISSUE_LABELS: dict[str, str]`（8 个问题码 → 中文）
  - `SNIPPET_MAX: int = 120`

**背景**：规则逐字迁自 `yitian-analyze/timesheet_checker_v3.py`（`CHECK_RULES` L23-47、`TYPE_MISMATCH_RULES` L52-80、`PRODUCT_LINE_KEYWORDS` L335-358、`PRODUCT_NAME_KEYWORDS` L364-369、必填正则 L263-274、客户提示 L326、售前提示 L481-486、`THIS_BG_L2_ORGS` L1056-1059）。**以脚本源码为准，不以其 README 为准**（README 漏了「用时」「登录」「资源池」等词）。

- [ ] **Step 1: 写失败测试**

`tests/test_yitian_rules.py`：

```python
# -*- coding: utf-8 -*-
"""yitian_rules.py 规则常量的结构性校验:防迁移过程中漏表/错型/码不齐。"""
import re

import yitian_rules as R


class TestTypes:
    def test_checked_types(self):
        assert R.CHECKED_TYPES == ("项目类", "售前类", "售后类")

    def test_excluded_and_mgmt(self):
        assert R.MGMT_TYPE == "管理类"
        assert set(R.EXCLUDED_TYPES) == {"业务类", "假期类"}


class TestRequiredPatterns:
    def test_summary_synonyms(self):
        for w in ["工作概述", "工作概况", "工作总结", "工作汇报", "工作总述", "工作述职"]:
            assert re.search(R.SUMMARY_RE, w), w

    def test_progress_includes_typo_and_yongshi(self):
        for w in ["工作进展", "工资进展", "已完成工作", "用时"]:
            assert re.search(R.PROGRESS_RE, w), w

    def test_next_synonyms(self):
        for w in ["下一步工作计划", "后续计划", "明日计划", "下期计划"]:
            assert re.search(R.NEXT_RE, w), w


class TestServiceMode:
    def test_effective_date_is_constant_string(self):
        assert R.SERVICE_MODE_EFFECTIVE_DATE == "2026-05-09"


class TestTypeMismatch:
    def test_presale_forbids_acceptance(self):
        pairs = dict(R.TYPE_MISMATCH_RULES["售前类"])
        assert pairs["项目验收"] == "项目类"
        assert pairs["投标书"] == "业务类"

    def test_aftersale_forbids_demo(self):
        pairs = dict(R.TYPE_MISMATCH_RULES["售后类"])
        assert pairs["方案演示"] == "售前类"
        assert pairs["安装部署"] == "项目类"

    def test_only_two_types_ruled(self):
        assert set(R.TYPE_MISMATCH_RULES) == {"售前类", "售后类"}


class TestProductTables:
    def test_line_table_has_21_entries(self):
        assert len(R.PRODUCT_LINE_KEYWORDS) == 21

    def test_ngsoc_keywords(self):
        pats, kws = R.PRODUCT_LINE_KEYWORDS[0]
        assert pats == ["NGSOC"]
        assert "SOAR" in kws and "探针" in kws

    def test_cloud_platform_has_exclusive_words(self):
        for pats, kws in R.PRODUCT_LINE_KEYWORDS:
            if "云安全管理平台" in pats:
                assert "组件" in kws and "租户" in kws
                break
        else:
            raise AssertionError("缺少云安全管理平台条目")

    def test_exclusive_kws(self):
        assert R.EXCLUSIVE_KWS == {"组件", "租户"}

    def test_name_table_level2(self):
        pats, kws = R.PRODUCT_NAME_KEYWORDS[0]
        assert "奇安信网神SSL编排控制网关系统V6.0" in pats
        assert "SSLO" in kws


class TestPresaleHint:
    def test_skip_worktypes(self):
        assert R.PRESALE_SKIP_WORKTYPES == {"文档编写与汇报", "项目管理", "项目验收"}

    def test_project_type_key(self):
        assert R.PRESALE_PROJECT_TYPE_KEY == "售前服务"


class TestBg:
    def test_this_bg_orgs(self):
        assert "交付中心" in R.THIS_BG_L2_ORGS
        assert len(R.THIS_BG_L2_ORGS) == 6


class TestIssueLabels:
    def test_all_eight_codes_labeled(self):
        assert set(R.ISSUE_LABELS) == {
            "MISS_SUMMARY", "MISS_PROGRESS", "MISS_NEXT", "MISS_SERVICE_MODE",
            "TYPE_MISMATCH", "PRODUCT_MISMATCH", "MISS_CUSTOMER", "HINT_PRESALE_PRODUCT",
        }

    def test_hint_code_prefix(self):
        # 提示码必须以 HINT_ 开头——yitian_check.ok 三态判定依赖这个前缀
        assert [c for c in R.ISSUE_LABELS if c.startswith("HINT_")] == ["HINT_PRESALE_PRODUCT"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_rules.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'yitian_rules'`

- [ ] **Step 3: 实现**

`yitian_rules.py`：

```python
# yitian_rules.py
"""倚天工时域:合规规则常量库(纯数据,无逻辑)。规则调整只改本文件。

来源:yitian-analyze/timesheet_checker_v3.py(以源码为准,其 README 有漏词)。
唯一口径变更:服务方式改判「服务方式」列非空(原实现是在工作成果正文里搜"服务方式"四字,
实测 0/540 命中,生效日一过会全量误判)。生效日抽为下方常量。
"""
from __future__ import annotations

# ── 工时类型 ──
CHECKED_TYPES = ("项目类", "售前类", "售后类")   # 进入全量合规检查
MGMT_TYPE = "管理类"                              # 跳过检查、直接合规,但计入合规率分母
EXCLUDED_TYPES = ("业务类", "假期类")             # 不进合规检查(分子分母都不进),但仍进工时统计

# ── 必填字段(全文模糊匹配 工作成果),大小写不敏感 ──
SUMMARY_RE = r"(工作概述|工作概况|工作总结|工作汇报|工作总述|工作述职)"
PROGRESS_RE = (r"(工作进展|工作进度|工作内容|进展情况|进行的工作|今日工作|工资进展|工资进度"
               r"|工作已进|已完成工作|工作完成情况|工作当前|用时)")
NEXT_RE = (r"(下一步工作计划|下一步计划|下一步工作|下一步|后续计划|明日计划|工作计划"
           r"|下步计划|下步工作|后续工作|之后计划|下期计划)")

# ── 服务方式:读「服务方式」列非空;早于该日的记录豁免(导入早期历史数据不追溯问责) ──
SERVICE_MODE_EFFECTIVE_DATE = "2026-05-09"

# ── 工时类型一致性:命中禁止词 → 疑似填错类型。{工时类型: [(禁止词, 应归属类型)]} ──
TYPE_MISMATCH_RULES = {
    "售前类": [
        ("正式上线", "项目类"), ("割接上线", "项目类"), ("生产上线", "项目类"),
        ("生产环境部署", "项目类"), ("项目验收", "项目类"), ("系统验收", "项目类"),
        ("初验", "项目类"), ("终验", "项目类"), ("验收报告", "项目类"),
        ("投标书", "业务类"), ("标书制作", "业务类"), ("招标文件", "业务类"),
    ],
    "售后类": [
        ("方案演示", "售前类"), ("产品演示", "售前类"), ("需求调研", "售前类"),
        ("实施部署", "项目类"), ("安装部署", "项目类"), ("项目实施", "项目类"),
        ("项目验收", "项目类"), ("系统验收", "项目类"), ("验收报告", "项目类"),
        ("投标", "业务类"), ("标书", "业务类"),
    ],
}

# ── 一级:产研侧产品线 → 本产品线合法关键词。(产品线匹配子串列表, 合法关键词列表) ──
PRODUCT_LINE_KEYWORDS = [
    (["NGSOC"], ["SOC", "AISOC", "NGSOC", "SOAR", "SIEM", "告警", "解析", "解析规则", "传感器", "探针"]),
    (["一体化终端", "天擎"], ["天擎", "软件", "终端", "U盘", "移动存储", "DLP", "EDR", "杀毒",
                              "V6", "V10", "集群", "单机", "minio", "病毒", "信任区"]),
    (["新天擎"], ["天擎", "软件", "终端", "U盘", "移动存储", "DLP", "EDR", "杀毒",
                  "普罗米修斯", "跃迁", "minio", "病毒", "信任区"]),
    (["终端准入"], ["准入", "NAC", "跃迁", "终端入网", "认证"]),
    (["零信任"], ["零信任", "环境感知", "奇安信ID", "认证", "安全空间", "登录"]),
    (["威胁感知", "天眼"], ["天眼", "分析平台", "探针", "沙箱", "传感器", "es集群", "集群", "es",
                            "攻击渗透", "加特林"]),
    (["数据库安全"], ["数据库审计", "数据库", "API探针"]),
    (["NGFW"], ["FW", "防火墙", "NGFW", "vpn"]),
    (["保密监管", "保密监管与检查"], ["自监管"]),
    (["堡垒机"], ["堡垒机", "数据库堡垒机", "PAM", "特权账号"]),
    (["云安全管理平台"], ["CSMP", "CSC", "组件", "租户", "资源池", "安全资源池", "云平台", "云安全"]),
    (["网闸"], ["网闸", "光闸", "dse", "DSE", "后置机", "前置机", "数据安全交换"]),
    (["服务器安全管理", "椒图"], ["椒图", "服务器安全", "rasp防护"]),
    (["SSL VPN", "SSL_VPN", "SSLVPN"], ["VPN", "vpn"]),
    (["WAF"], ["WAF", "waf"]),
    (["漏洞扫描"], ["漏扫", "漏洞", "漏洞扫描"]),
    (["代码安全"], ["代码卫士", "开源卫士", "代码"]),
    (["上网行为管理"], ["ICG", "NBM", "行为管理", "上网行为"]),
    (["安全SD-WAN", "SD-WAN"], ["SD-WAN", "VPN", "vpn", "sdwan"]),
    (["网络流量探针"], ["探针", "传感器"]),
    (["虚拟化安全"], ["虚拟化"]),
]

# ── 二级复核:产研侧产品名称 → 合法关键词(一级报错时复核,命中则覆盖一级判合格) ──
# 现状即原表现状(原注释:更多产品关键词待补充);后续维护改这里一处。
PRODUCT_NAME_KEYWORDS = [
    (["奇安信网神SSL编排控制网关系统V6.0"], ["流量编排", "SSLO", "sslo", "加解密"]),
    (["网神工业控制安全网关系统V4.0"], ["防火墙", "工业", "工业安全监测", "网闸"]),
]

# 「组件」「租户」是云安全管理平台专属词,出现在其他产品线的工作成果里不算"含他家产品词"
EXCLUSIVE_KWS = {"组件", "租户"}

# ── 客户名称一致性:客户列为空但正文提到客户 ──
CUSTOMER_HINT_RE = r"(客户|用户|甲方|业主)"

# ── 售前服务产品类别提示(只提示,不计不合规) ──
PRESALE_PROJECT_TYPE_KEY = "售前服务"
PRESALE_SKIP_WORKTYPES = {"文档编写与汇报", "项目管理", "项目验收"}

# ── 跨 BG 支持:销售L2组织 ∈ 本列表 → 本 BG,否则跨 BG ──
THIS_BG_L2_ORGS = [
    "东北大区", "京津冀大区", "小金融集团军",
    "银行集团军", "运营商集团军", "交付中心",
]

# ── 问题码 → 中文标签。HINT_ 前缀 = 提示(ok=1),其余 = 问题(ok=2) ──
ISSUE_LABELS = {
    "MISS_SUMMARY": "缺少工作概述",
    "MISS_PROGRESS": "缺少工作进展",
    "MISS_NEXT": "缺少下一步工作计划",
    "MISS_SERVICE_MODE": "缺少服务方式",
    "TYPE_MISMATCH": "工时类型填报有误",
    "PRODUCT_MISMATCH": "产品类别填写错误",
    "MISS_CUSTOMER": "客户名称未填写",
    "HINT_PRESALE_PRODUCT": "售前服务类产品类别不应为「其他」",
}

HINT_PREFIX = "HINT_"

# 问题行下发的工作成果摘要长度上限(合规行不下发正文)
SNIPPET_MAX = 120
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian_rules.py -q && python -m ruff check yitian_rules.py`
Expected: 15 passed；ruff 无告警

- [ ] **Step 5: 提交**

```bash
git add yitian_rules.py tests/test_yitian_rules.py
git commit -m "feat(yitian): 合规规则常量库(逐字迁自原脚本,服务方式生效日抽常量)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `yitian_check.py` — 合规判定

**Files:**
- Create: `yitian_check.py`
- Test: `tests/test_yitian_check.py`

**Interfaces:**
- Consumes: `yitian_rules`（Task 2 全部常量）
- Produces（供 Task 4 `yitian.py` 消费）：
  - `corrected_work_type(project_type: str, work_type: str) -> str` — 数据校正
  - `is_checked(work_type: str, hours: float) -> bool` — 即 `chk`
  - `peer_contents(rows: list[dict]) -> dict[str, str]` — 工单编号 → 同工单全部工作成果拼接
  - `check_row(row: dict, peer: str = "") -> tuple[list[str], list[str]]` — `(codes, msgs)`
  - `ok_of(codes: list[str]) -> int` — 0 合规 / 1 合规(提示) / 2 问题

`row` 是**已归一化**的 dict，键固定为：`work_type`(校正后) / `content`(工作成果) / `date`(YYYY-MM-DD 字符串) / `service_mode` / `customer` / `product_line` / `product_name` / `project_type` / `work_type3` / `work_order`。

- [ ] **Step 1: 写失败测试**

`tests/test_yitian_check.py`：

```python
# -*- coding: utf-8 -*-
"""yitian_check.py 合规判定纯函数单测。"""
import yitian_check as K


def _row(**kw):
    base = {
        "work_type": "项目类", "content": "", "date": "2026-06-01",
        "service_mode": "远程", "customer": "某客户", "product_line": "",
        "product_name": "", "project_type": "交付实施", "work_type3": "安装部署",
        "work_order": "",
    }
    base.update(kw)
    return base


# 一份四段俱全的合格正文(避免各用例被必填项干扰)
GOOD = "工作概述:巡检。工作进展:已完成部署。下一步工作计划:回访。"


class TestCorrection:
    def test_presale_service_becomes_project_type(self):
        assert K.corrected_work_type("售前服务类", "售前类") == "项目类"

    def test_other_types_untouched(self):
        assert K.corrected_work_type("交付实施", "售后类") == "售后类"


class TestIsChecked:
    def test_project_with_hours(self):
        assert K.is_checked("项目类", 6) is True

    def test_management_counts_in_denominator(self):
        assert K.is_checked("管理类", 8) is True

    def test_business_and_holiday_excluded(self):
        assert K.is_checked("业务类", 8) is False
        assert K.is_checked("假期类", 8) is False

    def test_zero_hours_excluded(self):
        assert K.is_checked("项目类", 0) is False


class TestRequiredFields:
    def test_all_missing(self):
        codes, msgs = K.check_row(_row(content="今天干了点活"))
        assert "MISS_SUMMARY" in codes and "MISS_PROGRESS" in codes and "MISS_NEXT" in codes
        assert len(msgs) == len(codes)

    def test_all_present(self):
        codes, _ = K.check_row(_row(content=GOOD))
        assert codes == []

    def test_management_type_skips_all_checks(self):
        codes, _ = K.check_row(_row(work_type="管理类", content="开会", service_mode="", customer=""))
        assert codes == []


class TestServiceMode:
    def test_empty_column_after_effective_date_is_issue(self):
        codes, _ = K.check_row(_row(content=GOOD, service_mode="", date="2026-06-01"))
        assert "MISS_SERVICE_MODE" in codes

    def test_empty_column_before_effective_date_exempt(self):
        codes, _ = K.check_row(_row(content=GOOD, service_mode="", date="2026-04-17"))
        assert "MISS_SERVICE_MODE" not in codes

    def test_filled_column_ok_even_if_text_lacks_the_word(self):
        # 关键:正文里没有"服务方式"四个字,但列填了 → 合规(这是本次口径修正)
        codes, _ = K.check_row(_row(content=GOOD, service_mode="客户现场", date="2026-06-01"))
        assert "MISS_SERVICE_MODE" not in codes


class TestTypeMismatch:
    def test_presale_with_acceptance_word(self):
        codes, msgs = K.check_row(_row(work_type="售前类", content=GOOD + "完成项目验收"))
        assert "TYPE_MISMATCH" in codes
        assert "项目类" in msgs[-1]

    def test_project_type_not_ruled(self):
        codes, _ = K.check_row(_row(work_type="项目类", content=GOOD + "完成项目验收"))
        assert "TYPE_MISMATCH" not in codes


class TestCustomer:
    def test_empty_customer_but_text_mentions(self):
        codes, _ = K.check_row(_row(content=GOOD + "与客户沟通", customer=""))
        assert "MISS_CUSTOMER" in codes

    def test_empty_customer_and_no_mention(self):
        codes, _ = K.check_row(_row(content=GOOD, customer=""))
        assert "MISS_CUSTOMER" not in codes


class TestProductCategory:
    def test_own_keyword_hit_is_ok(self):
        codes, _ = K.check_row(_row(content=GOOD + "处理SOAR告警", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_other_product_keyword_only_is_mismatch(self):
        codes, msgs = K.check_row(_row(content=GOOD + "更换防火墙策略", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" in codes
        assert "NGSOC" in msgs[-1]

    def test_no_keyword_at_all_is_undecidable(self):
        codes, _ = K.check_row(_row(content=GOOD, product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_same_workorder_peer_content_rescues(self):
        codes, _ = K.check_row(
            _row(content=GOOD + "更换防火墙策略", product_line="NGSOC", work_order="WO1"),
            peer="另一条工时里写了SOAR告警处理",
        )
        assert "PRODUCT_MISMATCH" not in codes

    def test_level2_product_name_overrides(self):
        codes, _ = K.check_row(_row(
            content=GOOD + "完成流量编排配置,顺带看了防火墙",
            product_line="NGSOC",
            product_name="奇安信网神SSL编排控制网关系统V6.0",
        ))
        assert "PRODUCT_MISMATCH" not in codes

    def test_level2_miss_keeps_level1_error(self):
        codes, _ = K.check_row(_row(
            content=GOOD + "更换防火墙策略",
            product_line="NGSOC",
            product_name="奇安信网神SSL编排控制网关系统V6.0",
        ))
        assert "PRODUCT_MISMATCH" in codes

    def test_project_management_text_skips_check(self):
        codes, _ = K.check_row(_row(content=GOOD + "项目管理:更换防火墙策略", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_tianqing_special_case(self):
        # 天擎产品线,正文含"天擎"即命中本产品词 → 合格(即使同时出现天眼等他家词)
        codes, _ = K.check_row(_row(
            content=GOOD + "天擎升级,顺带查了天眼告警", product_line="一体化终端管理（天擎）"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_exclusive_words_dont_trigger_others(self):
        # "组件"是云安全专属词,出现在 NGSOC 的正文里不算"含他家产品词"
        codes, _ = K.check_row(_row(content=GOOD + "更新了组件", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_case_insensitive(self):
        codes, _ = K.check_row(_row(content=GOOD + "处理soar告警", product_line="NGSOC"))
        assert "PRODUCT_MISMATCH" not in codes

    def test_unknown_product_line_skipped(self):
        codes, _ = K.check_row(_row(content=GOOD + "更换防火墙", product_line="不在表里的产品线"))
        assert "PRODUCT_MISMATCH" not in codes


class TestPresaleHint:
    def test_hint_when_product_line_is_other(self):
        codes, _ = K.check_row(_row(
            work_type="项目类", content=GOOD, project_type="售前服务类",
            work_type3="环境调研", product_line="其他"))
        assert codes == ["HINT_PRESALE_PRODUCT"]

    def test_no_hint_for_skip_worktypes(self):
        codes, _ = K.check_row(_row(
            work_type="项目类", content=GOOD, project_type="售前服务类",
            work_type3="项目管理", product_line="其他"))
        assert "HINT_PRESALE_PRODUCT" not in codes


class TestPeerContents:
    def test_groups_by_workorder(self):
        rows = [
            {"work_order": "WO1", "content": "甲"},
            {"work_order": "WO1", "content": "乙"},
            {"work_order": "WO2", "content": "丙"},
            {"work_order": "", "content": "无工单"},
        ]
        peers = K.peer_contents(rows)
        assert "甲" in peers["WO1"] and "乙" in peers["WO1"]
        assert "" not in peers


class TestOkOf:
    def test_clean(self):
        assert K.ok_of([]) == 0

    def test_hint_only(self):
        assert K.ok_of(["HINT_PRESALE_PRODUCT"]) == 1

    def test_issue_wins(self):
        assert K.ok_of(["HINT_PRESALE_PRODUCT", "MISS_SUMMARY"]) == 2
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_check.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'yitian_check'`

- [ ] **Step 3: 实现**

`yitian_check.py`：

```python
# yitian_check.py
"""倚天工时域:合规判定(纯函数)。规则常量全部来自 yitian_rules,本模块只写判定逻辑。

入参 row 是归一化后的 dict,键:work_type/content/date/service_mode/customer/
product_line/product_name/project_type/work_type3/work_order。
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple

import yitian_rules as R

# 一级表的全量关键词(去掉云安全专属词),用于"正文是否含他家产品词"的判断
_ALL_LINE_KWS = {
    kw.lower()
    for _, kws in R.PRODUCT_LINE_KEYWORDS
    for kw in kws
    if kw not in R.EXCLUSIVE_KWS
}


def corrected_work_type(project_type: str, work_type: str) -> str:
    """数据校正:项目类型含「售前服务」→ 工时类型强制为「项目类」(纳入项目类检查与统计口径)。"""
    if R.PRESALE_PROJECT_TYPE_KEY in str(project_type or ""):
        return "项目类"
    return work_type


def is_checked(work_type: str, hours: float) -> bool:
    """是否进入合规检查(= 合规率的分母)。业务类/假期类/0 工时不进;管理类进(直接算合规)。"""
    if work_type in R.EXCLUDED_TYPES:
        return False
    try:
        h = float(hours)
    except (TypeError, ValueError):
        return False
    return h > 0


def peer_contents(rows: List[dict]) -> Dict[str, str]:
    """按工单编号合并同工单全部工作成果(同工单关联检查用)。无工单号的行不参与。"""
    out: Dict[str, str] = {}
    for r in rows:
        wo = str(r.get("work_order") or "").strip()
        if not wo or wo.lower() in ("nan", "none", "-"):
            continue
        out[wo] = out.get(wo, "") + " " + str(r.get("content") or "")
    return out


def _check_product(row: dict, peer: str) -> Tuple[List[str], List[str]]:
    """产品类别:两级复核 + 同工单关联。返回 ([code], [msg]) 或 ([], [])。"""
    line = str(row.get("product_line") or "").strip()
    name = str(row.get("product_name") or "").strip()
    content = str(row.get("content") or "")
    if not line or line.lower() in ("nan", "none", "-"):
        return [], []

    # 正文含"项目管理" → 不做产品归属判断
    if "项目管理" in content:
        return [], []

    own = None
    for patterns, kws in R.PRODUCT_LINE_KEYWORDS:
        if any(p in line for p in patterns):
            own = kws
            break
    if own is None:
        return [], []            # 产品线不在表中 → 跳过

    low = content.lower()
    if any(kw.lower() in low for kw in own):
        return [], []            # 一级命中本产品词 → 合格

    # 同工单关联:同工单其他工时的正文命中本产品词 → 合格
    if peer and any(kw.lower() in peer.lower() for kw in own):
        return [], []

    own_low = {kw.lower() for kw in own}
    hits = sorted(kw for kw in (_ALL_LINE_KWS - own_low) if kw in low)
    if not hits:
        return [], []            # 既无本产品词也无他家词 → 无法判断,不报错

    # 二级复核:按产研侧产品名称匹配,命中则覆盖一级报错
    if name and name.lower() not in ("nan", "none", "-", "其他"):
        for patterns, kws in R.PRODUCT_NAME_KEYWORDS:
            if any(p in name for p in patterns):
                if any(kw.lower() in low for kw in kws):
                    return [], []
                break

    own_str = "/".join('"%s"' % k for k in own[:3])
    hit_str = "、".join("[%s]" % k for k in hits[:3])
    msg = ('产品类别填写错误:产品线为"%s",工作成果不含%s等本产品关键词,却包含%s等其他产品内容'
           % (line, own_str, hit_str))
    return ["PRODUCT_MISMATCH"], [msg]


def check_row(row: dict, peer: str = "") -> Tuple[List[str], List[str]]:
    """单行合规判定 → (问题码列表, 中文消息列表),两者一一对应。管理类直接合规。"""
    work_type = str(row.get("work_type") or "")
    if work_type == R.MGMT_TYPE:
        return [], []
    if work_type not in R.CHECKED_TYPES:
        return [], []

    content = str(row.get("content") or "")
    codes: List[str] = []
    msgs: List[str] = []

    # 1) 必填三段(全文模糊匹配)
    for code, pattern in (
        ("MISS_SUMMARY", R.SUMMARY_RE),
        ("MISS_PROGRESS", R.PROGRESS_RE),
        ("MISS_NEXT", R.NEXT_RE),
    ):
        if not re.search(pattern, content, re.IGNORECASE):
            codes.append(code)
            msgs.append(R.ISSUE_LABELS[code])

    # 2) 服务方式:读列非空;早于生效日豁免(ISO 日期串字典序可直接比较)
    date_s = str(row.get("date") or "")
    if date_s >= R.SERVICE_MODE_EFFECTIVE_DATE:
        if not str(row.get("service_mode") or "").strip():
            codes.append("MISS_SERVICE_MODE")
            msgs.append(R.ISSUE_LABELS["MISS_SERVICE_MODE"])

    # 3) 工时类型一致性(仅售前类/售后类)
    forbidden = R.TYPE_MISMATCH_RULES.get(work_type)
    if forbidden:
        by_target: Dict[str, List[str]] = {}
        for kw, target in forbidden:
            if kw in content:
                by_target.setdefault(target, []).append(kw)
        if by_target:
            parts = []
            for target, kws in by_target.items():
                parts.append("%s工时疑似含%s内容:%s"
                             % (work_type, target, "、".join("[%s]" % k for k in kws)))
            codes.append("TYPE_MISMATCH")
            msgs.append(";".join(parts))

    # 4) 产品类别
    pcodes, pmsgs = _check_product(row, peer)
    codes.extend(pcodes)
    msgs.extend(pmsgs)

    # 5) 客户名称一致性
    if not str(row.get("customer") or "").strip():
        if re.search(R.CUSTOMER_HINT_RE, content):
            codes.append("MISS_CUSTOMER")
            msgs.append("客户名称未填写,但工作内容中提到客户")

    # 6) 售前服务产品类别提示(只提示,不计不合规)
    if R.PRESALE_PROJECT_TYPE_KEY in str(row.get("project_type") or ""):
        if str(row.get("work_type3") or "") not in R.PRESALE_SKIP_WORKTYPES:
            if str(row.get("product_line") or "").strip() == "其他":
                codes.append("HINT_PRESALE_PRODUCT")
                msgs.append(R.ISSUE_LABELS["HINT_PRESALE_PRODUCT"])

    return codes, msgs


def ok_of(codes: List[str]) -> int:
    """0=合规 / 1=合规(提示) / 2=问题。含任一非 HINT_ 码即为问题。"""
    if not codes:
        return 0
    if any(not c.startswith(R.HINT_PREFIX) for c in codes):
        return 2
    return 1
```

> **实现注意**：`date_s >= R.SERVICE_MODE_EFFECTIVE_DATE` 依赖 `date` 已被 Task 4 归一化为 `YYYY-MM-DD` 字符串。`date` 为空串时 `"" >= "2026-05-09"` 为 False，等于豁免——这是有意的（日期不可解析的行不因服务方式被问责）。

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian_check.py -q && python -m ruff check yitian_check.py`
Expected: 27 passed；ruff 无告警

- [ ] **Step 5: 提交**

```bash
git add yitian_check.py tests/test_yitian_check.py
git commit -m "feat(yitian): 合规判定(6类规则+同工单关联+二级复核+服务方式改读列)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `yitian.py` — 管线组装（读工时 → 工号 join 花名册 → 码表压缩）

**Files:**
- Create: `yitian.py`
- Modify: `projects.py`（追加 2 个公开函数，不动既有函数）
- Modify: `config.py`（追加倚天常量段）
- Test: `tests/test_yitian.py`

**Interfaces:**
- Consumes: `yitian_calendar`（Task 1）、`yitian_rules`（Task 2）、`yitian_check`（Task 3）、`projects.read_top1000`（既有）
- Produces（供 Task 5 schema/preprocess、Task 6 server 消费）：
  - `projects.read_sheet_by_header(path, key_header) -> list[dict]` — `_read_header_sheet` 的公开包装
  - `projects.read_org_roster(path) -> list[dict]` — 花名册，键 `id/name/l2/l3/l31/l4/category`，工号大写归一，仅交付实施三部
  - `yitian.read_timesheet(path) -> list[dict]` — 归一化行（白名单列）
  - `yitian.build_yitian_data(base_dir: str) -> dict | None` — 完整 `YitianData` dict；`input/yitian/工时.xlsx` 缺失 → `None`
  - `config.YITIAN_DIRNAME = "yitian"` / `YITIAN_TIMESHEET_FILE = "工时.xlsx"` / `YITIAN_HOLIDAYS_FILE = "holidays.csv"` / `INPUT_SUBDIR_MAP`

- [ ] **Step 1: 写失败测试**

`tests/test_yitian.py`：

```python
# -*- coding: utf-8 -*-
"""yitian.py 管线单测。不依赖真 input/——xlsx/csv 全部用 tmp_path 现造。"""
import os

import openpyxl
import pytest

import projects as P
import yitian as Y

TS_HEADERS = [
    "ID", "工时类型", "客户", "项目类型", "工作类型三", "产研侧产品线", "产研侧产品名称",
    "工作日", "工时", "销售L2组织", "员工编号", "员工", "员工电话", "L4组织",
    "工作成果", "工单编号", "服务方式",
]
GOOD = "工作概述:巡检。工作进展:已完成。下一步工作计划:回访。"


def _ts_row(**kw):
    base = {
        "ID": "1", "工时类型": "项目类", "客户": "某客户", "项目类型": "交付实施",
        "工作类型三": "安装部署", "产研侧产品线": "", "产研侧产品名称": "",
        "工作日": "2026-06-01", "工时": 8, "销售L2组织": "银行集团军",
        "员工编号": "a012804", "员工": "佘海龙", "员工电话": "13500000000",
        "L4组织": "工时表里的脏组织", "工作成果": GOOD, "工单编号": "WO1", "服务方式": "远程",
    }
    base.update(kw)
    return [base[h] for h in TS_HEADERS]


def _make_input(tmp_path, ts_rows, org_rows=None, top_rows=None, holidays=None):
    """造 input/ 目录树:input/yitian/工时.xlsx + input/组织架构.xlsx + input/TOP1000.xlsx。"""
    base = tmp_path
    ydir = base / "input" / "yitian"
    ydir.mkdir(parents=True)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(TS_HEADERS)
    for r in ts_rows:
        ws.append(r)
    wb.save(str(ydir / "工时.xlsx"))

    org = openpyxl.Workbook()
    ows = org.active
    ows.append(["工号", "姓名", "员工类别", "新L2组织", "新L3组织", "新L3-1组织", "新L4组织"])
    for r in (org_rows if org_rows is not None else
              [("A012804", "佘海龙", "正式员工", "交付中心", "交付实施三部", "服务二部", "银行服务组")]):
        ows.append(list(r))
    org.save(str(base / "input" / "组织架构.xlsx"))

    top = openpyxl.Workbook()
    tws = top.active
    tws.append(["客户编号", "客户名称", "客户级别"])
    for r in (top_rows if top_rows is not None else [("C1", "某客户", "TOP1000大客户")]):
        tws.append(list(r))
    top.save(str(base / "input" / "TOP1000.xlsx"))

    if holidays:
        (ydir / "holidays.csv").write_text(
            "\n".join(["日期,类型"] + [f"{d},{k}" for d, k in holidays]), encoding="utf-8")
    return str(base)


class TestReadOrgRoster:
    def test_upper_normalizes_and_filters_dept(self, tmp_path):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["工号", "姓名", "员工类别", "新L2组织", "新L3组织", "新L3-1组织", "新L4组织"])
        ws.append(["a012804", "佘海龙", "正式员工", "交付中心", "交付实施三部", "服务二部", "银行服务组"])
        ws.append(["B000001", "外部门", "正式员工", "交付中心", "交付实施一部", "别的部", "别的组"])
        ws.append(["", "无工号", "正式员工", "交付中心", "交付实施三部", "服务二部", "银行服务组"])
        path = str(tmp_path / "组织架构.xlsx")
        wb.save(path)

        roster = P.read_org_roster(path)
        assert [p["id"] for p in roster] == ["A012804"]        # 大写归一 + 只留三部 + 丢无工号
        assert roster[0]["l4"] == "银行服务组"
        assert roster[0]["l31"] == "服务二部"


class TestBuildYitianData:
    def test_missing_timesheet_returns_none(self, tmp_path):
        (tmp_path / "input").mkdir()
        assert Y.build_yitian_data(str(tmp_path)) is None

    def test_basic_shape(self, tmp_path):
        base = _make_input(tmp_path, [_ts_row()])
        data = Y.build_yitian_data(base)
        assert data["meta"]["rows"] == 1
        assert data["meta"]["employees"] == 1
        assert data["meta"]["periodStart"] == "2026-06-01"
        assert data["meta"]["calendarSource"] == "fallback"    # 没给 holidays.csv
        assert data["meta"]["hoursPerDay"] == 8
        assert "交付中心" in data["meta"]["thisBgL2"]
        e = data["entries"][0]
        assert e["e"] == "A012804"                              # 工号大写归一
        assert e["h"] == 8
        assert e["ok"] == 0 and e["iss"] == []
        assert e["top"] is True                                 # 客户命中 TOP1000
        assert data["dims"]["types"][e["t"]] == "项目类"
        assert data["issues"] == []

    def test_privacy_no_phone_and_no_content_for_clean_rows(self, tmp_path):
        base = _make_input(tmp_path, [_ts_row()])
        data = Y.build_yitian_data(base)
        blob = repr(data)
        assert "13500000000" not in blob                        # 电话绝不落盘
        assert GOOD not in blob                                 # 合规行不下发工作成果正文

    def test_issue_row_gets_snippet(self, tmp_path):
        base = _make_input(tmp_path, [_ts_row(工作成果="今天干了点活", 服务方式="")])
        data = Y.build_yitian_data(base)
        e = data["entries"][0]
        assert e["ok"] == 2
        assert "MISS_SUMMARY" in e["iss"] and "MISS_SERVICE_MODE" in e["iss"]
        iss = data["issues"][0]
        assert iss["i"] == 0
        assert iss["snippet"] == "今天干了点活"
        assert len(iss["codes"]) == len(iss["msgs"])

    def test_unchecked_row_carries_no_codes(self, tmp_path):
        # 假期类不进合规检查 → 即使正文空,也不得带问题码
        base = _make_input(tmp_path, [_ts_row(工时类型="假期类", 工作成果="", 客户="", 服务方式="")])
        data = Y.build_yitian_data(base)
        e = data["entries"][0]
        assert e["chk"] is False and e["ok"] == 0 and e["iss"] == []
        assert data["issues"] == []

    def test_org_columns_come_from_roster_not_timesheet(self, tmp_path):
        base = _make_input(tmp_path, [_ts_row()])
        data = Y.build_yitian_data(base)
        assert data["roster"][0]["l4"] == "银行服务组"           # 不是工时表里的"工时表里的脏组织"
        assert "工时表里的脏组织" not in repr(data)

    def test_unknown_employee_dropped_and_counted(self, tmp_path):
        base = _make_input(tmp_path, [_ts_row(), _ts_row(员工编号="Z999999", 员工="离职的")])
        data = Y.build_yitian_data(base)
        assert data["meta"]["rows"] == 1
        assert data["meta"]["droppedRows"] == 1

    def test_presale_service_corrected_to_project_type(self, tmp_path):
        base = _make_input(tmp_path, [_ts_row(工时类型="售前类", 项目类型="售前服务类")])
        data = Y.build_yitian_data(base)
        e = data["entries"][0]
        assert data["dims"]["types"][e["t"]] == "项目类"

    def test_holidays_csv_switches_source_and_days(self, tmp_path):
        base = _make_input(
            tmp_path,
            [_ts_row(工作日="2026-06-01"), _ts_row(ID="2", 工作日="2026-06-03")],
            holidays=[("2026-06-02", "休")],
        )
        data = Y.build_yitian_data(base)
        assert data["meta"]["calendarSource"] == "csv"
        by_d = {d["d"]: d["workday"] for d in data["days"]}
        assert by_d["2026-06-01"] is True
        assert by_d["2026-06-02"] is False                      # 法定假(本是周二)
        assert by_d["2026-06-03"] is True

    def test_same_workorder_peer_rescues_product(self, tmp_path):
        # 两条同工单:A 只写防火墙(他家词) / B 写了 SOAR(本产品词) → A 应被同工单关联救回
        base = _make_input(tmp_path, [
            _ts_row(ID="1", 产研侧产品线="NGSOC", 工作成果=GOOD + "更换防火墙策略", 工单编号="WO9"),
            _ts_row(ID="2", 产研侧产品线="NGSOC", 工作成果=GOOD + "处理SOAR告警", 工单编号="WO9"),
        ])
        data = Y.build_yitian_data(base)
        assert all("PRODUCT_MISMATCH" not in e["iss"] for e in data["entries"])

    def test_empty_timesheet_yields_empty_days(self, tmp_path):
        base = _make_input(tmp_path, [])
        data = Y.build_yitian_data(base)
        assert data["entries"] == [] and data["days"] == []
        assert data["meta"]["periodStart"] is None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'yitian'`

- [ ] **Step 3a: `config.py` 追加倚天常量段**

在 `config.py` 末尾追加：

```python
# ── 倚天工时域(V3.0.0,位于 input/yitian/)──
YITIAN_DIRNAME = "yitian"
YITIAN_TIMESHEET_FILE = "工时.xlsx"
YITIAN_HOLIDAYS_FILE = "holidays.csv"

# 上传白名单 → 子目录映射:命中则写 input/<subdir>/,未命中写 input/ 根(项目主域既有行为)
INPUT_SUBDIR_MAP = {
    YITIAN_TIMESHEET_FILE: YITIAN_DIRNAME,
    YITIAN_HOLIDAYS_FILE: YITIAN_DIRNAME,
}
```

并把两个新文件名并入既有的 `INPUT_UPLOAD_NAMES`（该列表当前在 `config.py` 的 `DELIVERY_FILE_LEGACY` 之后）：

```python
INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE, DELIVERY_FILE_LEGACY,
                      PAYMENT_RECORDS_FILE, PROFIT_DIRECT_FILE, PROFIT_BRIDGE_FILE, BUDGET_FILE,
                      COLLECTION_STAGES_FILE, TOP1000_FILE,
                      YITIAN_TIMESHEET_FILE, YITIAN_HOLIDAYS_FILE]
```

> 注意：`INPUT_UPLOAD_NAMES` 引用了 `YITIAN_*`，所以倚天常量段必须**定义在 `INPUT_UPLOAD_NAMES` 之前**（Python 顺序求值）。把上面那段常量插到 `INPUT_UPLOAD_NAMES` 上方即可。

- [ ] **Step 3b: `projects.py` 追加两个公开函数**

在 `projects.py` 的 `read_org_names` 之后追加（**不改动 `read_org_names` / `read_org_l3_map` 既有实现**）：

```python
def read_sheet_by_header(path: str, key_header: str) -> List[Dict[str, Any]]:
    """公开包装:按表头关键词自动选 sheet 读表(倚天工时域等跨域复用,避免跨模块引私有函数)。"""
    return _read_header_sheet(path, key_header)


def read_org_roster(path: str) -> List[Dict[str, str]]:
    """组织架构表 → 花名册 list[dict]。键:id(工号,大写归一)/name/l2/l3/l31/l4/category。
    仅收 新L3组织 == 交付实施三部 的行(同 read_org_names);工号为空的行跳过——工号是跨域连接键。"""
    rows = _read_header_sheet(path, "工号")
    if rows and any(r.get("新L3组织") for r in rows):
        rows = [r for r in rows if str(r.get("新L3组织") or "").strip() == config.DEPT_L3]
    out: List[Dict[str, str]] = []
    for r in rows:
        emp_id = str(r.get("工号") or "").strip().upper()
        if not emp_id:
            continue
        out.append({
            "id": emp_id,
            "name": str(r.get("姓名") or "").strip(),
            "l2": str(r.get("新L2组织") or "").strip(),
            "l3": str(r.get("新L3组织") or "").strip(),
            "l31": str(r.get("新L3-1组织") or "").strip(),
            "l4": str(r.get("新L4组织") or "").strip(),
            "category": str(r.get("员工类别") or "").strip(),
        })
    return out
```

- [ ] **Step 3c: 实现 `yitian.py`**

```python
# yitian.py
"""倚天工时域:管线组装。

读 input/yitian/工时.xlsx(白名单列) → 工号 join input/组织架构.xlsx 花名册 → 工作日/双周标签
→ 合规判定(yitian_check) → 码表压缩 → YitianData dict。
input/yitian/工时.xlsx 缺失 → 返回 None(调用方跳过,绝不阻断主管线)。
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import config
import yitian_calendar as CAL
import yitian_check as CHK
import yitian_rules as R
from projects import read_org_roster, read_sheet_by_header, read_top1000

# ── 工时.xlsx 取列白名单(全表 77 列,只读这 13 个) ──
# 严禁读取:员工电话/员工所在省/员工所在市/员工入职省份/员工入职城市/岗位(个人隐私,不得落盘)。
# 严禁使用:L2/L3/L3-1/L4组织(工时表自带的组织列)——组织权威是 input/组织架构.xlsx。
COL_EMP_ID = "员工编号"
COL_TYPE = "工时类型"
COL_HOURS = "工时"
COL_DATE = "工作日"
COL_CONTENT = "工作成果"
COL_CUSTOMER = "客户"
COL_PROJECT_TYPE = "项目类型"
COL_WORKTYPE3 = "工作类型三"
COL_PRODUCT_LINE = "产研侧产品线"
COL_PRODUCT_NAME = "产研侧产品名称"
COL_WORK_ORDER = "工单编号"
COL_SALES_L2 = "销售L2组织"
COL_SERVICE_MODE = "服务方式"

HOURS_PER_DAY = 8   # 基础工时 = 工作日数 × 8h


class _Dim:
    """码表:字符串 → 下标(空串 → None)。同一字符串只存一份,压 JSON 体积。"""

    def __init__(self) -> None:
        self.values: List[str] = []
        self._index: Dict[str, int] = {}

    def idx(self, v) -> Optional[int]:
        s = str(v or "").strip()
        if not s:
            return None
        if s not in self._index:
            self._index[s] = len(self.values)
            self.values.append(s)
        return self._index[s]


def _hours(v) -> float:
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return 0.0


def read_timesheet(path: str) -> List[Dict[str, Any]]:
    """工时.xlsx → 归一化行(仅白名单列)。表头在第 1 行,按"含工时类型"自动选 sheet。
    工号统一大写、日期统一 YYYY-MM-DD、工时类型已做售前服务校正。"""
    raw = read_sheet_by_header(path, COL_TYPE)
    out: List[Dict[str, Any]] = []
    for r in raw:
        d = CAL.parse_date(r.get(COL_DATE))
        project_type = str(r.get(COL_PROJECT_TYPE) or "").strip()
        work_type = CHK.corrected_work_type(project_type, str(r.get(COL_TYPE) or "").strip())
        out.append({
            "emp_id": str(r.get(COL_EMP_ID) or "").strip().upper(),
            "date": d.isoformat() if d else "",
            "work_type": work_type,
            "hours": _hours(r.get(COL_HOURS)),
            "content": str(r.get(COL_CONTENT) or ""),
            "customer": str(r.get(COL_CUSTOMER) or "").strip(),
            "project_type": project_type,
            "work_type3": str(r.get(COL_WORKTYPE3) or "").strip(),
            "product_line": str(r.get(COL_PRODUCT_LINE) or "").strip(),
            "product_name": str(r.get(COL_PRODUCT_NAME) or "").strip(),
            "work_order": str(r.get(COL_WORK_ORDER) or "").strip(),
            "sales_l2": str(r.get(COL_SALES_L2) or "").strip(),
            "service_mode": str(r.get(COL_SERVICE_MODE) or "").strip(),
        })
    return out


def build_yitian_data(base_dir: str) -> Optional[dict]:
    """完整倚天数据 dict;input/yitian/工时.xlsx 缺失 → None。"""
    input_dir = os.path.join(base_dir, "input")
    ts_path = os.path.join(input_dir, config.YITIAN_DIRNAME, config.YITIAN_TIMESHEET_FILE)
    if not os.path.isfile(ts_path):
        return None

    rows = read_timesheet(ts_path)
    roster = read_org_roster(os.path.join(input_dir, config.ORG_FILE))
    roster_ids = {p["id"] for p in roster}

    # 工号不在花名册(域外/离职)或日期不可解析 → 丢弃;计数供治理可见
    kept = [r for r in rows if r["emp_id"] in roster_ids and r["date"]]
    dropped = len(rows) - len(kept)

    top1000 = read_top1000(os.path.join(input_dir, config.TOP1000_FILE))
    top_names = {n for n, v in top1000.items() if v.get("level") == config.TOP1000_LEVEL}

    rest, work = CAL.read_holidays(
        os.path.join(input_dir, config.YITIAN_DIRNAME, config.YITIAN_HOLIDAYS_FILE))
    calendar_source = "csv" if (rest or work) else "fallback"

    dates = sorted(r["date"] for r in kept)
    days = (CAL.build_days(CAL.parse_date(dates[0]), CAL.parse_date(dates[-1]), rest, work)
            if dates else [])

    peers = CHK.peer_contents(kept)
    d_type, d_wt, d_cu, d_pl, d_pn, d_pt, d_bg, d_sm = (_Dim() for _ in range(8))
    entries: List[dict] = []
    issues: List[dict] = []

    for r in kept:
        chk = CHK.is_checked(r["work_type"], r["hours"])
        if chk:
            codes, msgs = CHK.check_row(r, peers.get(r["work_order"], ""))
            ok = CHK.ok_of(codes)
        else:
            codes, msgs, ok = [], [], 0   # 不进检查的行(业务类/假期类/0工时)不带任何问题码
        entries.append({
            "d": r["date"],
            "e": r["emp_id"],
            "t": d_type.idx(r["work_type"]),
            "h": round(r["hours"], 2),
            "wt": d_wt.idx(r["work_type3"]),
            "cu": d_cu.idx(r["customer"]),
            "pl": d_pl.idx(r["product_line"]),
            "pn": d_pn.idx(r["product_name"]),
            "pt": d_pt.idx(r["project_type"]),
            "sm": d_sm.idx(r["service_mode"]),
            "bg": d_bg.idx(r["sales_l2"]),
            "wo": r["work_order"],
            "top": bool(r["customer"]) and r["customer"] in top_names,
            "chk": chk,
            "ok": ok,
            "iss": codes,
        })
        if ok != 0:
            issues.append({
                "i": len(entries) - 1,
                "codes": codes,
                "msgs": msgs,
                "snippet": r["content"][:R.SNIPPET_MAX],   # 只有问题行下发正文摘要
            })

    return {
        "meta": {
            "periodStart": days[0]["d"] if days else None,
            "periodEnd": days[-1]["d"] if days else None,
            "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "rows": len(entries),
            "employees": len(roster),
            "droppedRows": dropped,
            "calendarSource": calendar_source,
            "hoursPerDay": HOURS_PER_DAY,
            "thisBgL2": list(R.THIS_BG_L2_ORGS),   # 跨BG判定常量随数据下发,前端不重复维护
        },
        "roster": roster,
        "days": days,
        "dims": {
            "types": d_type.values,
            "workTypes": d_wt.values,
            "customers": d_cu.values,
            "products": d_pl.values,
            "productNames": d_pn.values,
            "projectTypes": d_pt.values,
            "salesL2": d_bg.values,
            "serviceModes": d_sm.values,
        },
        "entries": entries,
        "issues": issues,
    }
```

> **对 spec 的两处增补**（有意为之，需在实现中保留）：`meta.droppedRows`（工号不在花名册而被丢弃的行数，供治理可见，避免静默丢数据）与 `meta.hoursPerDay` / `meta.thisBgL2`（把后端常量随数据下发，前端不重复维护一份，杜绝口径漂移）。

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian.py tests/test_projects.py -q && python -m ruff check yitian.py projects.py config.py`
Expected: 全部 passed（含既有 test_projects.py 不回归）；ruff 无告警

- [ ] **Step 5: 提交**

```bash
git add yitian.py projects.py config.py tests/test_yitian.py
git commit -m "feat(yitian): 管线组装(工号join花名册+码表压缩+隐私裁列)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 数据契约与管线接入（`schema.py` / `preprocess_data.py` / `gen:types`）

**Files:**
- Modify: `schema.py`（追加 `YitianData` 模型族 + 两个导出函数，不动 `AnalysisData`）
- Modify: `preprocess_data.py`（末段追加倚天段）
- Modify: `frontend/package.json`（`gen:types` 多生成一份类型）
- Modify: `.gitignore`（忽略 `data/yitian_data.json` 与 `yitian_schema.json`）
- Test: `tests/test_schema_yitian.py`

**Interfaces:**
- Consumes: `yitian.build_yitian_data(base_dir) -> dict | None`（Task 4）
- Produces:
  - `schema.validate_and_write_yitian_json(data: dict, output_dir: str) -> str` — 校验后写 `data/yitian_data.json`，返回路径
  - `schema.dump_yitian_schema(out_path: str) -> None`
  - `frontend/src/types/yitian.ts`（由 `npm run gen:types` 生成，导出 `YitianData` / `YitianEntry` / `YitianDay` / `YitianRosterItem` / `YitianDims` / `YitianIssue` / `YitianMeta`）

- [ ] **Step 1: 写失败测试**

`tests/test_schema_yitian.py`：

```python
# -*- coding: utf-8 -*-
"""YitianData 契约校验 + 落盘。"""
import json
import os

import pytest
from pydantic import ValidationError

import schema


def _minimal():
    return {
        "meta": {
            "periodStart": "2026-06-01", "periodEnd": "2026-06-01",
            "generatedAt": "2026-07-12 10:00", "rows": 1, "employees": 1,
            "droppedRows": 0, "calendarSource": "csv", "hoursPerDay": 8,
            "thisBgL2": ["交付中心"],
        },
        "roster": [{"id": "A1", "name": "张三", "l2": "交付中心", "l3": "交付实施三部",
                    "l31": "服务二部", "l4": "银行服务组", "category": "正式员工"}],
        "days": [{"d": "2026-06-01", "workday": True, "isoWeek": "2026-W23", "calcWeek": "2026-CW23"}],
        "dims": {"types": ["项目类"], "workTypes": [], "customers": [], "products": [],
                 "productNames": [], "projectTypes": [], "salesL2": [], "serviceModes": []},
        "entries": [{"d": "2026-06-01", "e": "A1", "t": 0, "h": 8.0, "wt": None, "cu": None,
                     "pl": None, "pn": None, "pt": None, "sm": None, "bg": None,
                     "wo": "", "top": False, "chk": True, "ok": 0, "iss": []}],
        "issues": [],
    }


class TestYitianSchema:
    def test_valid_minimal(self):
        schema.YitianData.model_validate(_minimal())

    def test_missing_meta_rejected(self):
        bad = _minimal()
        del bad["meta"]
        with pytest.raises(ValidationError):
            schema.YitianData.model_validate(bad)

    def test_entry_hours_must_be_number(self):
        bad = _minimal()
        bad["entries"][0]["h"] = "八小时"
        with pytest.raises(ValidationError):
            schema.YitianData.model_validate(bad)

    def test_write_json(self, tmp_path):
        out = schema.validate_and_write_yitian_json(_minimal(), str(tmp_path))
        assert os.path.basename(out) == "yitian_data.json"
        with open(out, encoding="utf-8") as f:
            back = json.load(f)
        assert back["meta"]["rows"] == 1

    def test_dump_schema(self, tmp_path):
        p = str(tmp_path / "yitian_schema.json")
        schema.dump_yitian_schema(p)
        with open(p, encoding="utf-8") as f:
            sch = json.load(f)
        assert "properties" in sch and "entries" in sch["properties"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_schema_yitian.py -q`
Expected: FAIL — `AttributeError: module 'schema' has no attribute 'YitianData'`

- [ ] **Step 3a: `schema.py` 追加模型族与导出**

在 `schema.py` 的 `AnalysisData` 之后、`validate_and_write_json` 之前插入：

```python
# ── 倚天工时域(V3.0.0):与 AnalysisData 并列的第二个根模型,独立产物 data/yitian_data.json ──

class YitianMeta(_Base):
    periodStart: Optional[str] = None
    periodEnd: Optional[str] = None
    generatedAt: str
    rows: int = 0
    employees: int = 0
    droppedRows: int = 0            # 工号不在花名册而被丢弃的行数(治理可见)
    calendarSource: str = "fallback"  # "csv" | "fallback"(holidays.csv 缺失,退化为纯周一~周五)
    hoursPerDay: int = 8
    thisBgL2: List[str] = []        # 本BG销售L2组织(跨BG判定常量,随数据下发)


class YitianRosterItem(_Base):
    id: str                          # 工号(大写归一),跨域连接键
    name: str = ""
    l2: str = ""
    l3: str = ""
    l31: str = ""
    l4: str = ""
    category: str = ""


class YitianDay(_Base):
    d: str
    workday: bool
    isoWeek: str
    calcWeek: str


class YitianDims(_Base):
    types: List[str] = []
    workTypes: List[str] = []
    customers: List[str] = []
    products: List[str] = []
    productNames: List[str] = []
    projectTypes: List[str] = []
    salesL2: List[str] = []
    serviceModes: List[str] = []


class YitianEntry(_Base):
    d: str                           # 工作日 YYYY-MM-DD
    e: str                           # 工号 → roster
    t: Optional[int] = None          # → dims.types
    h: float = 0
    wt: Optional[int] = None         # → dims.workTypes
    cu: Optional[int] = None         # → dims.customers
    pl: Optional[int] = None         # → dims.products
    pn: Optional[int] = None         # → dims.productNames
    pt: Optional[int] = None         # → dims.projectTypes
    sm: Optional[int] = None         # → dims.serviceModes
    bg: Optional[int] = None         # → dims.salesL2
    wo: str = ""                     # 工单编号
    top: bool = False                # 客户 ∈ TOP1000
    chk: bool = False                # 是否进合规检查(= 合规率分母)
    ok: int = 0                      # 0 合规 / 1 合规(提示) / 2 问题
    iss: List[str] = []              # 问题码


class YitianIssue(_Base):
    i: int                           # entries 下标
    codes: List[str] = []
    msgs: List[str] = []
    snippet: str = ""                # 工作成果前 120 字(仅问题行)


class YitianData(_Base):
    meta: YitianMeta
    roster: List[YitianRosterItem] = []
    days: List[YitianDay] = []
    dims: YitianDims
    entries: List[YitianEntry] = []
    issues: List[YitianIssue] = []
```

在 `dump_json_schema` 之后追加两个函数，并改写 `__main__`：

```python
def validate_and_write_yitian_json(data: dict, output_dir: str) -> str:
    """用 YitianData 校验后写出 yitian_data.json。返回输出文件路径。校验失败抛 ValidationError。

    注意:这里**不用** indent(与 analysis_data.json 的写法不同)。倚天 entries 每行 16 个键,
    indent=1 会把每个键各占一行 —— 实测同一份数据 indent=1 是 210KB/周、紧凑是 155KB/周(省 26%)。
    该文件是机器读的(前端 fetch),不需要人眼可读性。"""
    YitianData.model_validate(data)
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "yitian_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return out_path


def dump_yitian_schema(out_path: str) -> None:
    """导出倚天域 JSON Schema(供前端 json-schema-to-typescript 生成 TS 类型)。"""
    sch = YitianData.model_json_schema()
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(sch, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    dump_json_schema("schema.json")
    print("[OK] JSON Schema 已写出: schema.json")
    dump_yitian_schema("yitian_schema.json")
    print("[OK] JSON Schema 已写出: yitian_schema.json")
```

- [ ] **Step 3b: `frontend/package.json` 的 `gen:types` 多生成一份**

```json
"gen:types": "cd .. && python schema.py && cd frontend && json2ts -i ../schema.json -o src/types/analysis.ts && json2ts -i ../yitian_schema.json -o src/types/yitian.ts"
```

- [ ] **Step 3c: `preprocess_data.py` 末段接入**

顶部 import 区（与 `import collection_stages as collection_mod` 同段）追加：

```python
import yitian as yitian_mod
```

在 `main()` 末尾、`print(f"  输出文件: {output_file}")` 之后追加：

```python
    # === 11. 倚天工时域(V3.0.0):离线导入。缺 input/yitian/工时.xlsx 则跳过,绝不阻断主管线 ===
    try:
        ydata = yitian_mod.build_yitian_data(BASE_DIR)
        if ydata is None:
            print("[INFO] 未提供 input/yitian/工时.xlsx,跳过倚天工时域")
        else:
            ypath = schema.validate_and_write_yitian_json(ydata, OUTPUT_DIR)
            ymeta = ydata["meta"]
            print("[OK] 倚天工时域: %d 行 / %d 人 / 日历源 %s → %s"
                  % (ymeta["rows"], ymeta["employees"], ymeta["calendarSource"], ypath))
            if ymeta["droppedRows"]:
                print("  [WARN] 倚天工时 %d 行因工号不在组织架构花名册被丢弃" % ymeta["droppedRows"])
            if ymeta["calendarSource"] == "fallback":
                print("  [WARN] 未提供 input/yitian/holidays.csv,工作日退化为纯周一~周五(节假日周饱和度会偏低)")
    except Exception as e:   # 倚天域是附加特性,任何异常都不得影响 analysis_data.json
        print(f"  [WARN] 倚天工时域生成失败,本次跳过: {e}")
```

- [ ] **Step 3d: `.gitignore` 追加**

```
data/yitian_data.json
yitian_schema.json
```

- [ ] **Step 4: 跑测试 + 生成类型**

Run:
```bash
python -m pytest tests/test_schema_yitian.py -q
python schema.py                      # 应打印两行 [OK]，生成 schema.json + yitian_schema.json
cd frontend && npm run gen:types && npx vue-tsc --noEmit
```
Expected: 5 passed；`frontend/src/types/yitian.ts` 生成且含 `export interface YitianData`；typecheck 无错

- [ ] **Step 5: 提交**

```bash
git add schema.py preprocess_data.py frontend/package.json frontend/src/types/yitian.ts .gitignore tests/test_schema_yitian.py
git commit -m "feat(yitian): 数据契约YitianData + 管线接入(缺文件跳过) + 类型同源

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 后端端点与权限（`server.py` / `data_scope.py`）

**Files:**
- Modify: `data_scope.py`（追加 `scope_yitian_data`）
- Modify: `server.py`（`/api/yitian/data` 端点 + 上传子目录 + 文件状态）
- Test: `tests/test_data_scope_yitian.py`、`tests/test_server_yitian.py`

**Interfaces:**
- Consumes: `config.INPUT_SUBDIR_MAP`（Task 4）、`data/yitian_data.json`（Task 5 产出）
- Produces:
  - `data_scope.scope_yitian_data(data: dict, allowed_l4: list) -> dict` — 按 L4 裁 roster/entries/issues，**issues[].i 下标重映射**
  - `GET /api/yitian/data` — 登录 + 持有任一倚天 pageKey；超管/`*` 全量，否则按 `allowedL4` 切
  - `server.is_valid_input_name` 不变；`handle_inputs_upload` 按 `INPUT_SUBDIR_MAP` 落子目录
  - `collect_file_status` 覆盖 `input/yitian/` 两文件

**安全铁律**（违反即 Critical）：
- `/api/yitian/data` **绝不能**加进 `_SUPER_ONLY_PATHS`（该集合按 path 匹配、不分 method，加了就把普通授权账号一起 403）。
- `data/yitian_data.json` 的原始静态路径**已经**被 `_is_protected_data_path` 挡住（它只对 `/data/analysis_data.json` 开例外），**不要**去动那个函数。非超管只能走 `/api/yitian/data` 拿切过的数据。
- **`audit.py` 不需要改**：spec 提到要注册上传动作，但 `_ACTION_MAP` 已有 `('POST','/api/inputs/upload') → ('inputs.upload','上传数据文件')`，倚天两个文件走的正是这个端点，审计自动覆盖。不要新增重复动作码。

- [ ] **Step 1: 写失败测试**

`tests/test_data_scope_yitian.py`：

```python
# -*- coding: utf-8 -*-
"""scope_yitian_data:按 allowedL4 裁数据 + issues 下标重映射。"""
import data_scope as DS


def _data():
    return {
        "meta": {"rows": 3, "employees": 2, "periodStart": "2026-06-01"},
        "roster": [
            {"id": "A1", "name": "张三", "l4": "银行服务组"},
            {"id": "B1", "name": "李四", "l4": "浙江服务组"},
        ],
        "days": [{"d": "2026-06-01", "workday": True, "isoWeek": "2026-W23", "calcWeek": "2026-CW23"}],
        "dims": {"types": ["项目类"]},
        "entries": [
            {"d": "2026-06-01", "e": "B1", "h": 8, "ok": 2, "iss": ["MISS_SUMMARY"]},   # 0 越权
            {"d": "2026-06-01", "e": "A1", "h": 6, "ok": 0, "iss": []},                  # 1 可见
            {"d": "2026-06-01", "e": "A1", "h": 2, "ok": 2, "iss": ["MISS_NEXT"]},       # 2 可见
        ],
        "issues": [
            {"i": 0, "codes": ["MISS_SUMMARY"], "msgs": ["缺少工作概述"], "snippet": "李四的正文"},
            {"i": 2, "codes": ["MISS_NEXT"], "msgs": ["缺少下一步工作计划"], "snippet": "张三的正文"},
        ],
    }


class TestScopeYitian:
    def test_star_returns_as_is(self):
        d = _data()
        assert DS.scope_yitian_data(d, ["*"]) is d

    def test_filters_roster_entries_issues(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"])
        assert [p["id"] for p in out["roster"]] == ["A1"]
        assert [e["e"] for e in out["entries"]] == ["A1", "A1"]
        assert len(out["issues"]) == 1
        assert out["issues"][0]["snippet"] == "张三的正文"

    def test_issue_index_remapped(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"])
        # 原 entries[2] 被裁成 entries[1];issues[].i 必须跟着改,否则指错行
        assert out["issues"][0]["i"] == 1
        assert out["entries"][out["issues"][0]["i"]]["iss"] == ["MISS_NEXT"]

    def test_other_l4_content_not_leaked(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"])
        blob = repr(out)
        assert "李四" not in blob and "李四的正文" not in blob

    def test_meta_recounted(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"])
        assert out["meta"]["rows"] == 2
        assert out["meta"]["employees"] == 1

    def test_input_not_mutated(self):
        d = _data()
        DS.scope_yitian_data(d, ["银行服务组"])
        assert len(d["entries"]) == 3 and d["issues"][0]["i"] == 0

    def test_empty_allow_yields_nothing(self):
        out = DS.scope_yitian_data(_data(), [])
        assert out["roster"] == [] and out["entries"] == [] and out["issues"] == []
```

`tests/test_server_yitian.py`（仿既有 `tests/test_server_portal.py` 的集成范式）：

```python
# -*- coding: utf-8 -*-
"""/api/yitian/data 端点:pageKey 闸 + L4 切数据 + 上传落子目录。"""
import json

import pytest

import config
import server as S


class TestYitianPageGate:
    def test_yitian_data_not_in_super_only_paths(self):
        # 铁律:该集合按 path 匹配不分 method,加进去会把普通授权账号一起 403
        assert '/api/yitian/data' not in S._SUPER_ONLY_PATHS

    def test_raw_json_path_still_protected(self):
        # 非超管不得直链原始文件绕过 L4 切分
        assert S._is_protected_data_path('/data/yitian_data.json') is True
        assert S._is_protected_data_path('/data/analysis_data.json') is False

    def test_page_keys_cover_five_pages(self):
        assert set(S._YITIAN_PAGE_KEYS) == {
            'yitian', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer'}


class TestUploadSubdir:
    def test_timesheet_maps_to_yitian_subdir(self):
        assert config.INPUT_SUBDIR_MAP[config.YITIAN_TIMESHEET_FILE] == config.YITIAN_DIRNAME
        assert config.INPUT_SUBDIR_MAP[config.YITIAN_HOLIDAYS_FILE] == config.YITIAN_DIRNAME

    def test_main_domain_files_have_no_subdir(self):
        assert config.ORG_FILE not in config.INPUT_SUBDIR_MAP

    def test_upload_whitelist_includes_yitian_files(self):
        assert S.is_valid_input_name(config.YITIAN_TIMESHEET_FILE) is True
        assert S.is_valid_input_name(config.YITIAN_HOLIDAYS_FILE) is True
        assert S.is_valid_input_name("../../etc/passwd") is False

    def test_target_dir_helper(self, tmp_path):
        base = str(tmp_path)
        assert S._input_target_dir(base, config.YITIAN_TIMESHEET_FILE).endswith(
            "input" + __import__("os").sep + "yitian")
        assert S._input_target_dir(base, config.ORG_FILE).endswith("input")


class TestFileStatus:
    def test_status_covers_yitian_files(self, tmp_path):
        import os
        ydir = tmp_path / "input" / "yitian"
        ydir.mkdir(parents=True)
        (ydir / config.YITIAN_TIMESHEET_FILE).write_bytes(b"x")
        out = S.collect_file_status(str(tmp_path))
        assert out[config.YITIAN_TIMESHEET_FILE] is not None       # 在子目录里被找到
        assert out[config.YITIAN_HOLIDAYS_FILE] is None            # 未提供 → None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_data_scope_yitian.py tests/test_server_yitian.py -q`
Expected: FAIL — `AttributeError: module 'data_scope' has no attribute 'scope_yitian_data'` / `module 'server' has no attribute '_YITIAN_PAGE_KEYS'`

- [ ] **Step 3a: `data_scope.py` 追加**

在 `filter_analysis_data` 之后追加：

```python
def scope_yitian_data(data: dict, allowed_l4: list) -> dict:
    """按 allowed_l4 裁倚天数据(roster/entries/issues);'*' → 原样返回;不改入参。

    工时是员工级敏感数据:非本 L4 的员工、其工时行、其问题正文摘要,一律不下发。
    issues[].i 指向 entries 下标——裁行后必须重映射,否则指到别人头上。"""
    if not isinstance(data, dict):
        return data
    allow = set(allowed_l4 or [])
    if '*' in allow:
        return data

    roster = data.get('roster') or []
    keep_roster = [p for p in roster
                   if isinstance(p, dict) and str(p.get('l4') or '').strip() in allow]
    keep_ids = {p.get('id') for p in keep_roster}

    entries = data.get('entries') or []
    old_to_new = {}
    keep_entries = []
    for i, e in enumerate(entries):
        if isinstance(e, dict) and e.get('e') in keep_ids:
            old_to_new[i] = len(keep_entries)
            keep_entries.append(e)

    issues = data.get('issues') or []
    keep_issues = []
    for it in issues:
        if not isinstance(it, dict):
            continue
        ni = old_to_new.get(it.get('i'))
        if ni is None:
            continue
        nit = dict(it)
        nit['i'] = ni
        keep_issues.append(nit)

    out = dict(data)               # 浅拷顶层(days/dims 无个人信息,原样透传)
    out['roster'] = keep_roster
    out['entries'] = keep_entries
    out['issues'] = keep_issues

    meta = data.get('meta')
    if isinstance(meta, dict):
        nm = dict(meta)
        nm['rows'] = len(keep_entries)
        nm['employees'] = len(keep_roster)
        out['meta'] = nm

    return out
```

- [ ] **Step 3b: `server.py` 改动（4 处）**

**① 常量与缓存**（放在 `ANALYSIS_FILE` / `_load_analysis_cached` 那一段之后）：

```python
YITIAN_DATA_FILE = os.path.join(BASE_DIR, 'data', 'yitian_data.json')

_yitian_cache = {'mtime': None, 'data': None}
_yitian_cache_lock = threading.Lock()

# 持有任一倚天页面授权即可读倚天数据(纵深防御:工时是员工级数据,未授权页面的账号连 curl 也不该拿到)
_YITIAN_PAGE_KEYS = ('yitian', 'yitian-compliance', 'yitian-analytics',
                     'yitian-trend', 'yitian-customer')


def _load_yitian_cached():
    try:
        mtime = os.path.getmtime(YITIAN_DATA_FILE)
    except OSError:
        return None
    with _yitian_cache_lock:
        if _yitian_cache['mtime'] != mtime:
            try:
                with open(YITIAN_DATA_FILE, 'r', encoding='utf-8') as f:
                    _yitian_cache['data'] = json.load(f)
                _yitian_cache['mtime'] = mtime
            except Exception:
                return None
        return _yitian_cache['data']
```

**② 上传目标目录 helper**（放在 `is_valid_input_name` 之后）：

```python
def _input_target_dir(base_dir: str, name: str) -> str:
    """上传落盘目录:命中 INPUT_SUBDIR_MAP 则写 input/<subdir>/,否则写 input/ 根。
    name 已经过 is_valid_input_name 精确白名单校验,不存在拼接穿越面。"""
    sub = config.INPUT_SUBDIR_MAP.get(name)
    if sub:
        return os.path.join(base_dir, 'input', sub)
    return os.path.join(base_dir, 'input')
```

改 `collect_file_status`，让子目录文件也能被找到：

```python
def collect_file_status(base_dir: str):
    """已知数据文件 → 最近修改时间(显示用);固定名单防任意路径,缺失为 None。"""
    out = {}
    pmis_dir = os.path.join(base_dir, 'input', config.PMIS_DIRNAME)
    for name in config.PMIS_ALL_FILENAMES:
        out[name] = _mtime_str(os.path.join(pmis_dir, name))
    for name in config.INPUT_UPLOAD_NAMES:
        out[name] = _mtime_str(os.path.join(_input_target_dir(base_dir, name), name))
    return out
```

改 `handle_inputs_upload` 的落盘两行（其余不动）：

```python
        target_dir = _input_target_dir(BASE_DIR, name)
        os.makedirs(target_dir, exist_ok=True)
        with open(os.path.join(target_dir, name), 'wb') as f:
            f.write(body)
```

**③ 数据端点 handler**（放在 `handle_data_json` 之后）：

```python
    def handle_yitian_data(self):
        """GET /api/yitian/data - 倚天工时数据。登录 + 持有任一倚天页面授权;
        超管或 allowedL4 含 '*' → 全量,否则按 allowedL4 服务端切数据(员工级隐私,不靠前端隐藏)。"""
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        pages = rec.get('allowedPages', [])
        if not (rec.get('isSuper') or '*' in pages or any(k in pages for k in _YITIAN_PAGE_KEYS)):
            self._send_json(403, _error_payload(ERR_FORBIDDEN, "无倚天工时页面权限"))
            return
        data = _load_yitian_cached()
        if data is None:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, "倚天工时数据不存在,请先上传工时.xlsx并更新数据"))
            return
        allowed = rec.get('allowedL4', [])
        if rec.get('isSuper') or '*' in allowed:
            self._send_json(200, data)
            return
        self._send_json(200, data_scope.scope_yitian_data(data, allowed))
```

**④ 路由**：在 `_dispatch_get` 里，紧挨 `/api/yitian/cookie` 分支之后追加：

```python
        elif parsed.path == '/api/yitian/data':
            self.handle_yitian_data()
```

> **不要**把 `/api/yitian/data` 加进 `_SUPER_ONLY_PATHS`（`/api/yitian/cookie` 在里面是对的——它 GET/POST 都是超管专属；`data` 是全员授权可读）。

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_data_scope_yitian.py tests/test_server_yitian.py -q && python -m pytest -q && python -m ruff check server.py data_scope.py`
Expected: 新测全绿 + 既有全套 pytest 无回归；ruff 无告警

- [ ] **Step 5: 提交**

```bash
git add server.py data_scope.py tests/test_data_scope_yitian.py tests/test_server_yitian.py
git commit -m "feat(yitian): /api/yitian/data(pageKey闸+L4服务端切数据)+上传落input/yitian/

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 前端数据层（`lib/yitian/calendar.ts` + `lib/yitianApi.ts` + 两个 store）

**Files:**
- Create: `frontend/src/lib/yitian/calendar.ts`、`frontend/src/lib/yitianApi.ts`、`frontend/src/stores/yitian.ts`、`frontend/src/stores/yitianView.ts`
- Test: `frontend/src/lib/yitian/calendar.test.ts`、`frontend/src/stores/yitian.test.ts`

**Interfaces:**
- Consumes: `@/types/yitian`（Task 5 生成）、`@/api/client` 的 `api`、`@/lib/userScopedKey`
- Produces（供 Task 8-12 消费）：
  - `type WeekMode = 'iso' | 'calc'`
  - `daysInRange(days, start, end): YitianDay[]`
  - `workdayCount(days, start, end): number`
  - `weekKeyOf(day, mode): string`
  - `weekBuckets(days, start, end, mode): WeekBucket[]`（`{key, workdays, start, end}`，按 start 升序）
  - `dataRange(days): { start: string; end: string }`
  - `getYitianData(): Promise<YitianData>`
  - `useYitianStore()` → `{ data, loading, error, load(force?), reset() }`
  - `useYitianViewStore()` → `{ start, end, weekMode, l4s, hydrate(), ensureRange(ds, de), reset() }`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/yitian/calendar.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { daysInRange, workdayCount, weekKeyOf, weekBuckets, dataRange } from './calendar'
import type { YitianDay } from '@/types/yitian'

// 2026-06-01(周一) ~ 2026-06-07(周日);6/3 设为法定假(workday=false)
const DAYS: YitianDay[] = [
  { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  { d: '2026-06-03', workday: false, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  { d: '2026-06-04', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  { d: '2026-06-05', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
  { d: '2026-06-06', workday: false, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
  { d: '2026-06-07', workday: false, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
]

describe('daysInRange', () => {
  it('闭区间过滤', () => {
    expect(daysInRange(DAYS, '2026-06-02', '2026-06-04').map((d) => d.d))
      .toEqual(['2026-06-02', '2026-06-03', '2026-06-04'])
  })
  it('空区间视为全时', () => {
    expect(daysInRange(DAYS, '', '')).toHaveLength(7)
  })
})

describe('workdayCount', () => {
  it('只数 workday=true', () => {
    expect(workdayCount(DAYS, '2026-06-01', '2026-06-07')).toBe(4)
  })
  it('法定假不计入', () => {
    expect(workdayCount(DAYS, '2026-06-03', '2026-06-03')).toBe(0)
  })
})

describe('weekKeyOf / weekBuckets', () => {
  it('iso 与 calc 取不同字段', () => {
    expect(weekKeyOf(DAYS[4], 'iso')).toBe('2026-W23')
    expect(weekKeyOf(DAYS[4], 'calc')).toBe('2026-CW24')
  })
  it('iso 口径全周一桶', () => {
    const b = weekBuckets(DAYS, '2026-06-01', '2026-06-07', 'iso')
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ key: '2026-W23', workdays: 4, start: '2026-06-01', end: '2026-06-07' })
  })
  it('calc 口径周五切桶', () => {
    const b = weekBuckets(DAYS, '2026-06-01', '2026-06-07', 'calc')
    expect(b.map((x) => x.key)).toEqual(['2026-CW23', '2026-CW24'])
    expect(b[0].workdays).toBe(3)   // 6/1,6/2,6/4
    expect(b[1].workdays).toBe(1)   // 6/5
  })
  it('两种口径工作日总数一致(切法不同不改变总量)', () => {
    const sum = (m: 'iso' | 'calc') =>
      weekBuckets(DAYS, '2026-06-01', '2026-06-07', m).reduce((s, b) => s + b.workdays, 0)
    expect(sum('iso')).toBe(sum('calc'))
  })
})

describe('dataRange', () => {
  it('数据跨度', () => {
    expect(dataRange(DAYS)).toEqual({ start: '2026-06-01', end: '2026-06-07' })
  })
  it('空数据跨度为空串', () => {
    expect(dataRange([])).toEqual({ start: '', end: '' })
  })
})
```

`frontend/src/stores/yitian.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import { useYitianStore } from './yitian'
import { useYitianViewStore } from './yitianView'

const FAKE = { meta: { rows: 1 }, roster: [], days: [], dims: {}, entries: [], issues: [] }

describe('useYitianStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getSpy.mockReset()
    getSpy.mockResolvedValue(FAKE)
  })

  it('惰性加载:load 后有数据', async () => {
    const s = useYitianStore()
    expect(s.data).toBeNull()
    await s.load()
    expect(s.data).toEqual(FAKE)
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('已加载则不重拉', async () => {
    const s = useYitianStore()
    await s.load()
    await s.load()
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('force 强制重拉', async () => {
    const s = useYitianStore()
    await s.load()
    await s.load(true)
    expect(getSpy).toHaveBeenCalledTimes(2)
  })

  it('失败落 error 不抛', async () => {
    getSpy.mockRejectedValue(new Error('403'))
    const s = useYitianStore()
    await s.load()
    expect(s.data).toBeNull()
    expect(s.error).toBe('403')
  })

  it('reset 清空', async () => {
    const s = useYitianStore()
    await s.load()
    s.reset()
    expect(s.data).toBeNull()
  })
})

describe('useYitianViewStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('默认周口径为倚天计算周', () => {
    expect(useYitianViewStore().weekMode).toBe('calc')
  })

  it('ensureRange 用数据跨度兜底空区间', () => {
    const v = useYitianViewStore()
    v.ensureRange('2026-06-01', '2026-06-30')
    expect(v.start).toBe('2026-06-01')
    expect(v.end).toBe('2026-06-30')
  })

  it('ensureRange 把越界区间钳回数据跨度', () => {
    const v = useYitianViewStore()
    v.start = '2020-01-01'
    v.end = '2099-01-01'
    v.ensureRange('2026-06-01', '2026-06-30')
    expect(v.start).toBe('2026-06-01')
    expect(v.end).toBe('2026-06-30')
  })

  it('hydrate 后改动会持久化', async () => {
    const v = useYitianViewStore()
    v.hydrate()
    v.weekMode = 'iso'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('anon:yitian_view')).toContain('iso')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/calendar.test.ts src/stores/yitian.test.ts`
Expected: FAIL — 找不到模块 `./calendar` / `./yitian`

- [ ] **Step 3a: `frontend/src/lib/yitian/calendar.ts`**

```ts
import type { YitianDay } from '@/types/yitian'

export type WeekMode = 'iso' | 'calc'

export interface WeekBucket {
  key: string
  workdays: number
  start: string
  end: string
}

/** [start, end] 闭区间过滤。日期是 'YYYY-MM-DD',字典序即时序。空区间 = 全时。 */
export function daysInRange(days: YitianDay[], start: string, end: string): YitianDay[] {
  if (!start || !end) return days
  return days.filter((d) => d.d >= start && d.d <= end)
}

/** 区间内工作日天数(基础工时 = 本值 × meta.hoursPerDay)。 */
export function workdayCount(days: YitianDay[], start: string, end: string): number {
  return daysInRange(days, start, end).filter((d) => d.workday).length
}

/** 双周口径:iso = ISO 自然周(周一~周日);calc = 倚天计算周(上周五~本周四)。 */
export function weekKeyOf(day: YitianDay, mode: WeekMode): string {
  return mode === 'calc' ? day.calcWeek : day.isoWeek
}

/** 区间内按周分桶(按起始日升序);每桶带工作日数,供趋势图 X 轴与周维度汇总。 */
export function weekBuckets(days: YitianDay[], start: string, end: string, mode: WeekMode): WeekBucket[] {
  const map = new Map<string, WeekBucket>()
  for (const d of daysInRange(days, start, end)) {
    const k = weekKeyOf(d, mode)
    const b = map.get(k)
    if (!b) {
      map.set(k, { key: k, workdays: d.workday ? 1 : 0, start: d.d, end: d.d })
    } else {
      if (d.workday) b.workdays += 1
      if (d.d < b.start) b.start = d.d
      if (d.d > b.end) b.end = d.d
    }
  }
  return [...map.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

/** 数据实际跨度。日期选择器必须钳制在此范围内——超出范围没有工作日标注,基础工时算不出来。 */
export function dataRange(days: YitianDay[]): { start: string; end: string } {
  if (!days.length) return { start: '', end: '' }
  return { start: days[0].d, end: days[days.length - 1].d }
}
```

- [ ] **Step 3b: `frontend/src/lib/yitianApi.ts`**

```ts
import { api } from '@/api/client'
import type { YitianData } from '@/types/yitian'

/** 后端已按 allowedL4 切过数据;前端拿到什么就是该账号该看的全部。 */
export async function getYitianData(): Promise<YitianData> {
  return api.get<YitianData>('/api/yitian/data')
}
```

- [ ] **Step 3c: `frontend/src/stores/yitian.ts`**

```ts
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { YitianData } from '@/types/yitian'
import { getYitianData } from '@/lib/yitianApi'

export const useYitianStore = defineStore('yitian', () => {
  // 与 stores/data.ts 同款:大只读快照用 shallowRef,避免深层响应式代理拖慢聚合。
  // 全站只整体重赋值 data.value(load/reset),无深层字段写入,故安全。
  const data = shallowRef<YitianData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 惰性加载:只在进入 /yitian 时调用(不在首页 bootstrap)。已有数据且非 force 则不重拉。 */
  async function load(force = false): Promise<void> {
    if (loading.value) return
    if (data.value && !force) return
    loading.value = true
    error.value = null
    try {
      data.value = await getYitianData()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  /** 登录/登出复位:杜绝身份切换后复用上一个账号已按 L4 切过的内存数据。 */
  function reset(): void {
    data.value = null
    error.value = null
    loading.value = false
  }

  return { data, loading, error, load, reset }
})
```

- [ ] **Step 3d: `frontend/src/stores/yitianView.ts`**

```ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { userScopedKey } from '@/lib/userScopedKey'
import type { WeekMode } from '@/lib/yitian/calendar'

const BASE_KEY = 'yitian_view'

/** /yitian 各页共享的视图状态:日期区间 + 周口径 + L4 筛选。按登录账号持久化(V2.8.3 范式)。 */
export const useYitianViewStore = defineStore('yitianView', () => {
  const start = ref('')
  const end = ref('')
  const weekMode = ref<WeekMode>('calc')   // 默认倚天计算周(与倚天填报截止口径一致)
  const l4s = ref<string[]>([])
  let hydrated = false

  function persist(): void {
    if (!hydrated) return                  // 未 hydrate / 已 reset:不写,免把默认值糊到别人的 key 上
    try {
      localStorage.setItem(userScopedKey(BASE_KEY), JSON.stringify({
        start: start.value, end: end.value, weekMode: weekMode.value, l4s: l4s.value,
      }))
    } catch {
      /* 隐私模式/配额满:静默降级为不持久化 */
    }
  }

  watch([start, end, weekMode, l4s], persist, { deep: true })

  /** 组件 setup 内调用(需 pinia active 才能取到账号前缀)。幂等。 */
  function hydrate(): void {
    if (hydrated) return
    try {
      const raw = localStorage.getItem(userScopedKey(BASE_KEY))
      if (raw) {
        const p = JSON.parse(raw) as Partial<{ start: string; end: string; weekMode: WeekMode; l4s: string[] }>
        if (p.start) start.value = p.start
        if (p.end) end.value = p.end
        if (p.weekMode === 'iso' || p.weekMode === 'calc') weekMode.value = p.weekMode
        if (Array.isArray(p.l4s)) l4s.value = p.l4s
      }
    } catch {
      /* 坏 JSON:忽略,用默认值 */
    }
    hydrated = true
  }

  /** 把区间钳制到数据实际跨度内(首次进页面 / 换了数据后区间越界)。 */
  function ensureRange(dataStart: string, dataEnd: string): void {
    if (!dataStart || !dataEnd) return
    if (!start.value || start.value < dataStart || start.value > dataEnd) start.value = dataStart
    if (!end.value || end.value > dataEnd || end.value < dataStart) end.value = dataEnd
  }

  function reset(): void {
    hydrated = false
    start.value = ''
    end.value = ''
    weekMode.value = 'calc'
    l4s.value = []
  }

  return { start, end, weekMode, l4s, hydrate, ensureRange, reset }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/yitian/calendar.test.ts src/stores/yitian.test.ts && npx vue-tsc --noEmit`
Expected: 全部 passed；typecheck 无错

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/calendar.ts frontend/src/lib/yitian/calendar.test.ts frontend/src/lib/yitianApi.ts frontend/src/stores/yitian.ts frontend/src/stores/yitianView.ts frontend/src/stores/yitian.test.ts
git commit -m "feat(yitian): 前端数据层(双周口径calendar+惰性store+按账号持久化视图态)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `lib/yitian/metrics.ts` — 工时统计口径

**Files:**
- Create: `frontend/src/lib/yitian/metrics.ts`
- Test: `frontend/src/lib/yitian/metrics.test.ts`

**Interfaces:**
- Consumes: `./calendar` 的 `daysInRange` / `workdayCount`
- Produces（供 Task 10-12 视图消费）：
  - `rosterL4Map(data): Record<string, string>` — 工号 → L4
  - `selectEntries(data, start, end, l4s?): YitianEntry[]`
  - `selectRoster(data, l4s?): YitianRosterItem[]`
  - `baseHours(data, start, end): number` — 人均基础工时 = 工作日数 × `meta.hoursPerDay`
  - `empStats(data, start, end, l4s?): EmpStat[]`（`{id,name,l3,l31,l4,hours,base,sat,diff,filled}`）
  - `typeHours(data, entries): TypeHour[]`（`{type, hours, pct}`）
  - `complianceRate(entries): number | null` — 分母 = `chk` 行数
  - `orgSummary(data, start, end, l4s?): OrgRow[]`（`{level:'l3'|'l31'|'l4', name, parent, hours, people, base, sat}`）
  - `saturationTop(stats, n?): EmpStat[]` / `unfilledList(stats): EmpStat[]` / `neverFilledList(stats): EmpStat[]`
  - `kpi(data, start, end, l4s?): Kpi`

**「未分配 L4」口径（真实数据逼出来的，必须实现）**
花名册里**确实存在 L4 为空的人**（实测 85 人里有 3 个，应是部门负责人；他们有 16 条工时记录）。若按空串分组，L4 汇总表会直接吞掉这些工时 → **L3 合计 ≠ 各 L4 之和**，用户一眼就看出数字对不上。

因此：**前端展示层统一把空 L4 兜底为常量 `NO_L4 = '未分配L4'`**，让它成为一个正常分组，合计自然对得上。

```ts
/** 花名册里 L4 为空的人(部门负责人等)的兜底分组名。空串分组会让 L3 合计对不上各 L4 之和。 */
export const NO_L4 = '未分配L4'
```

- `rosterL4Map` 返回 `p.l4 || NO_L4`
- `selectRoster` 按 `p.l4 || NO_L4` 匹配 `l4s`
- `empStats` 的 `l4` 字段填 `p.l4 || NO_L4`
- `orgSummary` 的 l4 层用兜底后的名字（`bump('l4', s.l4, ...)` 因为 `s.l4` 已兜底，天然生效）

> 后端 `data_scope.scope_yitian_data` 仍按**原始空串**过滤——普通管理员无法被授权一个没有名字的组织，所以这 3 个人对非超管天然不可见（fail-closed，正确）。兜底只影响超管看到的展示分组。

**口径定义（与 spec §7 一致，实现时不得改）**
- 基础工时（人均）= 区间工作日数 × 8
- 实际工时 = 该员工区间内**全部工时类型**之和（含管理类/业务类/假期类）
- 饱和度 = 实际 ÷ 基础；基础为 0 → `null`
- 加班 = 实际 − 基础 > 0；未按时填写 = **有记录且** 实际 − 基础 < 0；完全未填 = 区间内零条记录
- KPI「未填人数」= 未按时填写人数 + 完全未填人数（两清单互斥）
- 补全后饱和度 = Σmax(实际, 基础) ÷ Σ基础（把欠填的人补齐到 100% 再平均）
- 合规率 = `chk && ok<=1` 行数 ÷ `chk` 行数

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/yitian/metrics.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  NO_L4, rosterL4Map, selectEntries, baseHours, empStats, typeHours,
  complianceRate, orgSummary, saturationTop, unfilledList, neverFilledList, kpi,
} from './metrics'
import type { YitianData } from '@/types/yitian'

// 两天工作日(6/1 6/2) → 人均基础 16h。三人:张三(银行,20h 加班) 李四(银行,8h 欠填) 王五(浙江,零记录)
const DATA = {
  meta: {
    periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 3,
    employees: 3, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: ['交付中心'],
  },
  roster: [
    { id: 'A1', name: '张三', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' },
    { id: 'A2', name: '李四', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' },
    { id: 'A3', name: '王五', l2: '交付中心', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '正式员工' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: {
    types: ['项目类', '管理类', '假期类'], workTypes: [], customers: [], products: [],
    productNames: [], projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 12, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 0, iss: [] },
    { d: '2026-06-02', e: 'A1', t: 1, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 2, iss: ['MISS_NEXT'] },
    { d: '2026-06-01', e: 'A2', t: 2, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: false, ok: 0, iss: [] },
  ],
  issues: [{ i: 1, codes: ['MISS_NEXT'], msgs: ['缺少下一步工作计划'], snippet: '正文' }],
} as unknown as YitianData

const R = ['2026-06-01', '2026-06-02'] as const

describe('selectEntries', () => {
  it('按区间过滤', () => {
    expect(selectEntries(DATA, '2026-06-02', '2026-06-02')).toHaveLength(1)
  })
  it('按 L4 过滤', () => {
    expect(selectEntries(DATA, R[0], R[1], ['浙江服务组'])).toHaveLength(0)
    expect(selectEntries(DATA, R[0], R[1], ['银行服务组'])).toHaveLength(3)
  })
  it('L4 为空 = 不筛组织', () => {
    expect(selectEntries(DATA, R[0], R[1], [])).toHaveLength(3)
  })
})

describe('baseHours', () => {
  it('工作日数 × 8', () => {
    expect(baseHours(DATA, R[0], R[1])).toBe(16)
  })
})

describe('empStats', () => {
  const stats = empStats(DATA, R[0], R[1])
  it('覆盖花名册全员(含零记录的人)', () => {
    expect(stats.map((s) => s.id).sort()).toEqual(['A1', 'A2', 'A3'])
  })
  it('实际工时含全部工时类型(管理类/假期类也算)', () => {
    expect(stats.find((s) => s.id === 'A1')!.hours).toBe(20)   // 项目类12 + 管理类8
    expect(stats.find((s) => s.id === 'A2')!.hours).toBe(8)    // 假期类8 也计入实际工时
  })
  it('饱和度与差值', () => {
    const a1 = stats.find((s) => s.id === 'A1')!
    expect(a1.sat).toBeCloseTo(1.25)
    expect(a1.diff).toBe(4)
  })
  it('零记录的人 filled=false', () => {
    const a3 = stats.find((s) => s.id === 'A3')!
    expect(a3.filled).toBe(false)
    expect(a3.hours).toBe(0)
    expect(a3.sat).toBe(0)
  })
  it('基础工时为 0 时饱和度为 null', () => {
    const s = empStats(DATA, '2026-06-06', '2026-06-07')   // 区间外无工作日
    expect(s[0].base).toBe(0)
    expect(s[0].sat).toBeNull()
  })
})

describe('清单', () => {
  const stats = empStats(DATA, R[0], R[1])
  it('未按时填写 = 有记录且欠填', () => {
    expect(unfilledList(stats).map((s) => s.id)).toEqual(['A2'])
  })
  it('完全未填 = 零记录', () => {
    expect(neverFilledList(stats).map((s) => s.id)).toEqual(['A3'])
  })
  it('两清单互斥', () => {
    const u = new Set(unfilledList(stats).map((s) => s.id))
    expect(neverFilledList(stats).every((s) => !u.has(s.id))).toBe(true)
  })
  it('饱和度榜降序', () => {
    expect(saturationTop(stats, 2).map((s) => s.id)).toEqual(['A1', 'A2'])
  })
})

describe('typeHours', () => {
  it('按类型占比', () => {
    const t = typeHours(DATA, selectEntries(DATA, R[0], R[1]))
    const proj = t.find((x) => x.type === '项目类')!
    expect(proj.hours).toBe(12)
    expect(proj.pct).toBeCloseTo(12 / 28)
  })
})

describe('complianceRate', () => {
  it('分母只算 chk 行', () => {
    // chk 行 2 条:1 条合规 + 1 条问题 → 50%
    expect(complianceRate(selectEntries(DATA, R[0], R[1]))).toBeCloseTo(0.5)
  })
  it('无 chk 行返回 null', () => {
    expect(complianceRate([])).toBeNull()
  })
})

describe('orgSummary', () => {
  it('三层汇总(L3/L3-1/L4),人数取花名册', () => {
    const rows = orgSummary(DATA, R[0], R[1])
    const l3 = rows.find((r) => r.level === 'l3')!
    expect(l3.name).toBe('交付实施三部')
    expect(l3.people).toBe(3)
    expect(l3.hours).toBe(28)
    const bank = rows.find((r) => r.level === 'l4' && r.name === '银行服务组')!
    expect(bank.people).toBe(2)
    expect(bank.hours).toBe(28)
    expect(bank.parent).toBe('服务二部')
    const zj = rows.find((r) => r.level === 'l4' && r.name === '浙江服务组')!
    expect(zj.hours).toBe(0)      // 零记录的组也要出现(否则看不到全员没填)
  })
})

describe('kpi', () => {
  const k = kpi(DATA, R[0], R[1])
  it('总工时/未填人数/加班', () => {
    expect(k.totalHours).toBe(28)
    expect(k.unfilledCount).toBe(2)      // 李四(欠填) + 王五(零记录)
    expect(k.overtimeCount).toBe(1)
    expect(k.overtimeHours).toBe(4)
  })
  it('平均饱和度 = Σ实际 ÷ Σ基础', () => {
    expect(k.avgSat).toBeCloseTo(28 / 48)
  })
  it('补全后饱和度 = Σmax(实际,基础) ÷ Σ基础', () => {
    expect(k.avgSatFilled).toBeCloseTo((20 + 16 + 16) / 48)
  })
  it('合规率与问题数', () => {
    expect(k.complianceRate).toBeCloseTo(0.5)
    expect(k.issueCount).toBe(1)
  })
})

describe('rosterL4Map', () => {
  it('工号 → L4', () => {
    expect(rosterL4Map(DATA)['A3']).toBe('浙江服务组')
  })
})

describe('空 L4 兜底(真实花名册里有 L4 为空的部门负责人)', () => {
  // A4 无 L4 且有 8h 工时:必须归入「未分配L4」,不能被吞掉
  const WITH_EMPTY = {
    ...DATA,
    roster: [
      ...DATA.roster,
      { id: 'A4', name: '赵六', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '', category: '正式员工' },
    ],
    entries: [
      ...DATA.entries,
      { d: '2026-06-01', e: 'A4', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 0, iss: [] },
    ],
  } as unknown as YitianData

  it('空 L4 归入「未分配L4」', () => {
    expect(rosterL4Map(WITH_EMPTY)['A4']).toBe(NO_L4)
    const s = empStats(WITH_EMPTY, R[0], R[1]).find((x) => x.id === 'A4')!
    expect(s.l4).toBe(NO_L4)
  })

  it('L3 合计 = 各 L4 之和(空 L4 不得被吞掉)', () => {
    const rows = orgSummary(WITH_EMPTY, R[0], R[1])
    const l3 = rows.find((r) => r.level === 'l3')!
    const l4Sum = rows.filter((r) => r.level === 'l4').reduce((s, r) => s + r.hours, 0)
    expect(l4Sum).toBe(l3.hours)
    expect(rows.some((r) => r.level === 'l4' && r.name === NO_L4)).toBe(true)
  })

  it('可按「未分配L4」筛选', () => {
    expect(selectEntries(WITH_EMPTY, R[0], R[1], [NO_L4]).map((e) => e.e)).toEqual(['A4'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/metrics.test.ts`
Expected: FAIL — 找不到模块 `./metrics`

- [ ] **Step 3: 实现 `frontend/src/lib/yitian/metrics.ts`**

```ts
import type { YitianData, YitianEntry, YitianRosterItem } from '@/types/yitian'
import { workdayCount } from './calendar'

export interface EmpStat {
  id: string
  name: string
  l3: string
  l31: string
  l4: string
  hours: number
  base: number
  sat: number | null      // 饱和度(小数);基础工时为 0 → null
  diff: number            // 实际 − 基础(正=加班,负=欠填)
  filled: boolean         // 区间内是否有任何工时记录
}

export interface TypeHour {
  type: string
  hours: number
  pct: number
}

export interface OrgRow {
  level: 'l3' | 'l31' | 'l4'
  name: string
  parent: string
  hours: number
  people: number
  base: number
  sat: number | null
}

export interface Kpi {
  totalHours: number
  avgSat: number | null
  avgSatFilled: number | null
  unfilledCount: number
  neverFilledCount: number
  overtimeCount: number
  overtimeHours: number
  complianceRate: number | null
  issueCount: number
  baseHours: number
}

/** 花名册里 L4 为空的人(部门负责人等)的兜底分组名。
 *  实测 85 人里有 3 个 L4 为空且有工时——按空串分组会让 L3 合计对不上各 L4 之和。 */
export const NO_L4 = '未分配L4'

/** 工号 → L4(组织权威是花名册,不是工时表;空 L4 兜底为 NO_L4)。 */
export function rosterL4Map(data: YitianData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of data.roster) out[p.id] = p.l4 || NO_L4
  return out
}

/** L4 筛选后的花名册。l4s 为空 = 不筛。 */
export function selectRoster(data: YitianData, l4s: string[] = []): YitianRosterItem[] {
  if (!l4s.length) return data.roster
  const allow = new Set(l4s)
  return data.roster.filter((p) => allow.has(p.l4 || NO_L4))
}

/** 区间 + L4 筛选后的工时行。 */
export function selectEntries(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): YitianEntry[] {
  const allow = new Set(l4s)
  const l4Of = rosterL4Map(data)
  return data.entries.filter((e) => {
    if (start && e.d < start) return false
    if (end && e.d > end) return false
    if (allow.size && !allow.has(l4Of[e.e] ?? '')) return false
    return true
  })
}

/** 人均基础工时 = 区间工作日数 × meta.hoursPerDay。 */
export function baseHours(data: YitianData, start: string, end: string): number {
  return workdayCount(data.days, start, end) * (data.meta.hoursPerDay || 8)
}

/** 员工级统计。覆盖花名册全员——零记录的人也要出现(那正是"完全未填"清单的来源)。 */
export function empStats(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): EmpStat[] {
  const base = baseHours(data, start, end)
  const hours: Record<string, number> = {}
  for (const e of selectEntries(data, start, end, l4s)) {
    hours[e.e] = (hours[e.e] ?? 0) + e.h      // 实际工时含全部工时类型
  }
  return selectRoster(data, l4s).map((p) => {
    const h = hours[p.id] ?? 0
    return {
      id: p.id,
      name: p.name,
      l3: p.l3,
      l31: p.l31,
      l4: p.l4 || NO_L4,   // 空 L4 兜底,否则 L3 合计对不上各 L4 之和
      hours: h,
      base,
      sat: base > 0 ? h / base : null,
      diff: h - base,
      filled: p.id in hours,
    }
  })
}

/** 工时类型占比(含管理类/业务类/假期类)。 */
export function typeHours(data: YitianData, entries: YitianEntry[]): TypeHour[] {
  const types = data.dims.types
  const acc: Record<string, number> = {}
  let total = 0
  for (const e of entries) {
    const name = e.t === null || e.t === undefined ? '未知' : (types[e.t] ?? '未知')
    acc[name] = (acc[name] ?? 0) + e.h
    total += e.h
  }
  return Object.entries(acc)
    .map(([type, hrs]) => ({ type, hours: hrs, pct: total > 0 ? hrs / total : 0 }))
    .sort((a, b) => b.hours - a.hours)
}

/** 合规率 = (chk 且 ok<=1) ÷ chk。分母含管理类,不含业务类/假期类/0 工时。 */
export function complianceRate(entries: YitianEntry[]): number | null {
  const checked = entries.filter((e) => e.chk)
  if (!checked.length) return null
  return checked.filter((e) => e.ok <= 1).length / checked.length
}

/** L3 → L3-1 → L4 三层汇总。人数取花名册(不是"有记录的人数")。零记录的组也保留。 */
export function orgSummary(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): OrgRow[] {
  const base = baseHours(data, start, end)
  const stats = empStats(data, start, end, l4s)
  const buckets = new Map<string, { level: OrgRow['level']; name: string; parent: string; hours: number; people: number }>()

  const bump = (level: OrgRow['level'], name: string, parent: string, hrs: number) => {
    if (!name) return
    const k = level + '|' + name
    const b = buckets.get(k)
    if (!b) buckets.set(k, { level, name, parent, hours: hrs, people: 1 })
    else {
      b.hours += hrs
      b.people += 1
    }
  }

  for (const s of stats) {
    bump('l3', s.l3, '', s.hours)
    bump('l31', s.l31, s.l3, s.hours)
    bump('l4', s.l4, s.l31, s.hours)
  }

  return [...buckets.values()].map((b) => {
    const orgBase = base * b.people
    return { ...b, base: orgBase, sat: orgBase > 0 ? b.hours / orgBase : null }
  })
}

/** 饱和度榜(降序),取前 n。 */
export function saturationTop(stats: EmpStat[], n = 10): EmpStat[] {
  return [...stats].sort((a, b) => b.hours - a.hours).slice(0, n)
}

/** 未按时填写:有记录但欠填。 */
export function unfilledList(stats: EmpStat[]): EmpStat[] {
  return stats.filter((s) => s.filled && s.diff < 0).sort((a, b) => a.diff - b.diff)
}

/** 完全未填:区间内一条记录都没有(原工具的盲区)。 */
export function neverFilledList(stats: EmpStat[]): EmpStat[] {
  return stats.filter((s) => !s.filled)
}

export function kpi(data: YitianData, start: string, end: string, l4s: string[] = []): Kpi {
  const entries = selectEntries(data, start, end, l4s)
  const stats = empStats(data, start, end, l4s)
  const base = baseHours(data, start, end)

  const totalHours = entries.reduce((s, e) => s + e.h, 0)
  const sumBase = stats.reduce((s, x) => s + x.base, 0)
  const sumFilled = stats.reduce((s, x) => s + Math.max(x.hours, x.base), 0)
  const overtime = stats.filter((s) => s.diff > 0)

  return {
    totalHours,
    avgSat: sumBase > 0 ? totalHours / sumBase : null,
    avgSatFilled: sumBase > 0 ? sumFilled / sumBase : null,
    unfilledCount: unfilledList(stats).length + neverFilledList(stats).length,
    neverFilledCount: neverFilledList(stats).length,
    overtimeCount: overtime.length,
    overtimeHours: overtime.reduce((s, x) => s + x.diff, 0),
    complianceRate: complianceRate(entries),
    issueCount: entries.filter((e) => e.chk && e.ok === 2).length,
    baseHours: base,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/yitian/metrics.test.ts && npx vue-tsc --noEmit`
Expected: 全部 passed；typecheck 无错

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/metrics.ts frontend/src/lib/yitian/metrics.test.ts
git commit -m "feat(yitian): 工时统计口径(饱和度/加班/未填/分层汇总/合规率)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `lib/yitian/compliance.ts` + `lib/yitian/customer.ts` — 合规明细与客户维度口径

**Files:**
- Create: `frontend/src/lib/yitian/compliance.ts`、`frontend/src/lib/yitian/customer.ts`
- Test: `frontend/src/lib/yitian/compliance.test.ts`、`frontend/src/lib/yitian/customer.test.ts`

**Interfaces:**
- Consumes: `./metrics` 的 `rosterL4Map` / `selectEntries` / `selectRoster`
- Produces（供 Task 11-12 视图消费）：
  - `ISSUE_LABELS: Record<string, string>`（8 个问题码 → 中文；与 `yitian_rules.py` 的 `ISSUE_LABELS` 同表）
  - `issueRows(data, start, end, l4s?): IssueRow[]`（`{date, empId, empName, l4, l31, type, customer, workOrder, hours, ok, codes, msgs, snippet}`）
  - `countByCode(rows): { code, label, count }[]`（降序）
  - `countByL4(rows): { l4, count }[]`（降序）
  - `top1000ByL4(data, start, end, l4s?): Top1000Row[]`（`{l4, hours, topHours, pct, topCustomers}`，按 topHours 降序）
  - `bgSupport(data, start, end, l4s?): BgSupport`（`{thisBg, crossBg, thisPct, crossPct, total}`）

**口径（spec §7）**
- TOP1000：只统计 `项目类/售前类/售后类`；`entry.top` 由后端算好（客户 ∈ `TOP1000.xlsx` 且级别 = TOP1000大客户）；组织维度**按花名册 L4 分组**（原工具那份写死的 13 组织清单 + `if org in l4 or l4 in org` 模糊匹配已废弃）。
- 跨 BG：只统计 `项目类/售前类`；本 BG = `dims.salesL2[entry.bg] ∈ meta.thisBgL2`（常量随数据下发，前端不另维护一份）。

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/yitian/compliance.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { ISSUE_LABELS, issueRows, countByCode, countByL4 } from './compliance'
import type { YitianData } from '@/types/yitian'

const DATA = {
  meta: { hoursPerDay: 8, thisBgL2: ['交付中心'] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' },
    { id: 'A2', name: '李四', l2: '', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: {
    types: ['项目类'], workTypes: [], customers: ['某客户'], products: [], productNames: [],
    projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO1', top: false, chk: true, ok: 2, iss: ['MISS_SUMMARY', 'MISS_NEXT'] },
    { d: '2026-06-02', e: 'A2', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 2, iss: ['MISS_SUMMARY'] },
    { d: '2026-06-02', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 0, iss: [] },
  ],
  issues: [
    { i: 0, codes: ['MISS_SUMMARY', 'MISS_NEXT'], msgs: ['缺少工作概述', '缺少下一步工作计划'], snippet: '张三的正文' },
    { i: 1, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '李四的正文' },
  ],
} as unknown as YitianData

describe('ISSUE_LABELS', () => {
  it('八码齐全', () => {
    expect(Object.keys(ISSUE_LABELS).sort()).toEqual([
      'HINT_PRESALE_PRODUCT', 'MISS_CUSTOMER', 'MISS_NEXT', 'MISS_PROGRESS',
      'MISS_SERVICE_MODE', 'MISS_SUMMARY', 'PRODUCT_MISMATCH', 'TYPE_MISMATCH',
    ])
  })
})

describe('issueRows', () => {
  it('只出问题行,并挂上员工/组织/客户', () => {
    const rows = issueRows(DATA, '2026-06-01', '2026-06-02')
    expect(rows).toHaveLength(2)
    const r0 = rows.find((r) => r.empId === 'A1')!
    expect(r0.empName).toBe('张三')
    expect(r0.l4).toBe('银行服务组')       // 组织取自花名册
    expect(r0.customer).toBe('某客户')
    expect(r0.workOrder).toBe('WO1')
    expect(r0.snippet).toBe('张三的正文')
    expect(r0.codes).toEqual(['MISS_SUMMARY', 'MISS_NEXT'])
  })

  it('按区间过滤', () => {
    expect(issueRows(DATA, '2026-06-01', '2026-06-01')).toHaveLength(1)
  })

  it('按 L4 过滤', () => {
    const rows = issueRows(DATA, '2026-06-01', '2026-06-02', ['浙江服务组'])
    expect(rows.map((r) => r.empId)).toEqual(['A2'])
  })

  it('合规行不出现在问题清单', () => {
    const rows = issueRows(DATA, '2026-06-01', '2026-06-02')
    expect(rows.every((r) => r.ok !== 0)).toBe(true)
  })
})

describe('countByCode / countByL4', () => {
  const rows = issueRows(DATA, '2026-06-01', '2026-06-02')
  it('按问题码计数(一行多码则各计一次)', () => {
    const c = countByCode(rows)
    expect(c[0]).toMatchObject({ code: 'MISS_SUMMARY', label: '缺少工作概述', count: 2 })
    expect(c.find((x) => x.code === 'MISS_NEXT')!.count).toBe(1)
  })
  it('按 L4 计数(问题行数,不是问题码数)', () => {
    const c = countByL4(rows)
    expect(c).toHaveLength(2)
    expect(c.every((x) => x.count === 1)).toBe(true)
  })
})
```

`frontend/src/lib/yitian/customer.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { top1000ByL4, bgSupport } from './customer'
import type { YitianData } from '@/types/yitian'

const DATA = {
  meta: { hoursPerDay: 8, thisBgL2: ['银行集团军', '交付中心'] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' },
    { id: 'A2', name: '李四', l2: '', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: {
    types: ['项目类', '管理类', '售前类'], workTypes: [], customers: ['大客户', '小客户'],
    products: [], productNames: [], projectTypes: [],
    salesL2: ['银行集团军', '政企大区'], serviceModes: [],
  },
  entries: [
    // 张三:项目类 6h 大客户(TOP1000) 本BG
    { d: '2026-06-01', e: 'A1', t: 0, h: 6, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: 0, wo: '', top: true, chk: true, ok: 0, iss: [] },
    // 张三:项目类 2h 小客户 跨BG
    { d: '2026-06-01', e: 'A1', t: 0, h: 2, wt: null, cu: 1, pl: null, pn: null, pt: null, sm: null, bg: 1, wo: '', top: false, chk: true, ok: 0, iss: [] },
    // 张三:管理类 8h —— TOP1000 与跨BG 都不该统计管理类
    { d: '2026-06-02', e: 'A1', t: 1, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: 0, wo: '', top: false, chk: true, ok: 0, iss: [] },
    // 李四:售前类 4h 大客户 本BG
    { d: '2026-06-02', e: 'A2', t: 2, h: 4, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: 0, wo: '', top: true, chk: true, ok: 0, iss: [] },
  ],
  issues: [],
} as unknown as YitianData

const S = '2026-06-01'
const E = '2026-06-02'

describe('top1000ByL4', () => {
  const rows = top1000ByL4(DATA, S, E)
  it('按花名册 L4 分组(不做模糊匹配)', () => {
    expect(rows.map((r) => r.l4).sort()).toEqual(['浙江服务组', '银行服务组'])
  })
  it('只统计项目类/售前类/售后类(管理类不算)', () => {
    const bank = rows.find((r) => r.l4 === '银行服务组')!
    expect(bank.hours).toBe(8)        // 6 + 2,管理类 8h 被排除
  })
  it('TOP1000 工时与占比', () => {
    const bank = rows.find((r) => r.l4 === '银行服务组')!
    expect(bank.topHours).toBe(6)
    expect(bank.pct).toBeCloseTo(0.75)
    expect(bank.topCustomers).toBe(1)
  })
  it('零工时的组也保留(看得见谁没投入)', () => {
    const zj = rows.find((r) => r.l4 === '浙江服务组')!
    expect(zj.hours).toBe(4)
    expect(zj.topHours).toBe(4)
  })
})

describe('bgSupport', () => {
  const b = bgSupport(DATA, S, E)
  it('只统计项目类/售前类', () => {
    expect(b.total).toBe(12)          // 6 + 2 + 4;管理类 8h 排除
  })
  it('本BG判定读 meta.thisBgL2', () => {
    expect(b.thisBg).toBe(10)         // 6(银行集团军) + 4(银行集团军)
    expect(b.crossBg).toBe(2)         // 2(政企大区)
    expect(b.thisPct).toBeCloseTo(10 / 12)
  })
  it('无数据时占比为 0 不是 NaN', () => {
    const empty = bgSupport(DATA, '2026-07-01', '2026-07-02')
    expect(empty.total).toBe(0)
    expect(empty.thisPct).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/compliance.test.ts src/lib/yitian/customer.test.ts`
Expected: FAIL — 找不到模块 `./compliance` / `./customer`

- [ ] **Step 3a: `frontend/src/lib/yitian/compliance.ts`**

```ts
import type { YitianData } from '@/types/yitian'
import { rosterL4Map } from './metrics'

// 注意:本模块不能用 selectEntries —— issues[].i 是 entries 的**原始下标**,
// 必须在原数组上带 index 遍历才能对得上;先过滤会让下标失配。

/** 问题码 → 中文标签。与后端 yitian_rules.py 的 ISSUE_LABELS 同表(改一处须同步改另一处)。 */
export const ISSUE_LABELS: Record<string, string> = {
  MISS_SUMMARY: '缺少工作概述',
  MISS_PROGRESS: '缺少工作进展',
  MISS_NEXT: '缺少下一步工作计划',
  MISS_SERVICE_MODE: '缺少服务方式',
  TYPE_MISMATCH: '工时类型填报有误',
  PRODUCT_MISMATCH: '产品类别填写错误',
  MISS_CUSTOMER: '客户名称未填写',
  HINT_PRESALE_PRODUCT: '售前服务类产品类别不应为「其他」',
}

export interface IssueRow {
  date: string
  empId: string
  empName: string
  l4: string
  l31: string
  type: string
  customer: string
  workOrder: string
  hours: number
  ok: number
  codes: string[]
  msgs: string[]
  snippet: string
}

/** 问题明细行(仅 ok≠0 的行)。组织/姓名取自花名册,问题正文摘要取自 issues[]。 */
export function issueRows(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): IssueRow[] {
  const byId = new Map(data.roster.map((p) => [p.id, p]))
  const l4Of = rosterL4Map(data)
  const allow = new Set(l4s)

  // issues[].i 是 entries 下标 → 建下标 → issue 的查表
  const issueAt = new Map<number, { codes: string[]; msgs: string[]; snippet: string }>()
  for (const it of data.issues) {
    issueAt.set(it.i, { codes: it.codes ?? [], msgs: it.msgs ?? [], snippet: it.snippet ?? '' })
  }

  const out: IssueRow[] = []
  data.entries.forEach((e, i) => {
    if (e.ok === 0) return
    if (start && e.d < start) return
    if (end && e.d > end) return
    const l4 = l4Of[e.e] ?? ''
    if (allow.size && !allow.has(l4)) return
    const p = byId.get(e.e)
    const iss = issueAt.get(i)
    out.push({
      date: e.d,
      empId: e.e,
      empName: p?.name ?? e.e,
      l4,
      l31: p?.l31 ?? '',
      type: e.t === null || e.t === undefined ? '' : (data.dims.types[e.t] ?? ''),
      customer: e.cu === null || e.cu === undefined ? '' : (data.dims.customers[e.cu] ?? ''),
      workOrder: e.wo ?? '',
      hours: e.h,
      ok: e.ok,
      codes: iss?.codes ?? e.iss ?? [],
      msgs: iss?.msgs ?? [],
      snippet: iss?.snippet ?? '',
    })
  })
  return out
}

/** 按问题码计数(一行多码 → 每码各计一次),降序。 */
export function countByCode(rows: IssueRow[]): { code: string; label: string; count: number }[] {
  const acc: Record<string, number> = {}
  for (const r of rows) {
    for (const c of r.codes) acc[c] = (acc[c] ?? 0) + 1
  }
  return Object.entries(acc)
    .map(([code, count]) => ({ code, label: ISSUE_LABELS[code] ?? code, count }))
    .sort((a, b) => b.count - a.count)
}

/** 按 L4 计问题行数(不是问题码数),降序。 */
export function countByL4(rows: IssueRow[]): { l4: string; count: number }[] {
  const acc: Record<string, number> = {}
  for (const r of rows) acc[r.l4] = (acc[r.l4] ?? 0) + 1
  return Object.entries(acc)
    .map(([l4, count]) => ({ l4, count }))
    .sort((a, b) => b.count - a.count)
}

```

- [ ] **Step 3b: `frontend/src/lib/yitian/customer.ts`**

```ts
import type { YitianData, YitianEntry } from '@/types/yitian'
import { NO_L4, rosterL4Map, selectEntries, selectRoster } from './metrics'

// TOP1000 支持只看客户类工时;跨 BG 只看项目类/售前类(与原工具口径一致)
const CUSTOMER_TYPES = ['项目类', '售前类', '售后类']
const BG_TYPES = ['项目类', '售前类']

export interface Top1000Row {
  l4: string
  hours: number
  topHours: number
  pct: number          // TOP1000 工时占比(小数)
  topCustomers: number // 产生工时的 TOP1000 客户数(去重)
}

export interface BgSupport {
  thisBg: number
  crossBg: number
  thisPct: number
  crossPct: number
  total: number
}

function typeNameOf(data: YitianData, e: YitianEntry): string {
  return e.t === null || e.t === undefined ? '' : (data.dims.types[e.t] ?? '')
}

/** TOP1000 大客户支持:按花名册 L4 分组(废弃原工具写死的 13 组织清单 + 模糊匹配)。 */
export function top1000ByL4(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): Top1000Row[] {
  const l4Of = rosterL4Map(data)
  const acc = new Map<string, { hours: number; topHours: number; custs: Set<number> }>()

  // 花名册里的 L4 先全部建桶——零工时的组也要露面(那正是"这个组没投入 TOP1000"的信号)。
  // 空 L4 兜底为 NO_L4,否则这些人的工时会被 acc.get() 落空直接丢掉。
  for (const p of selectRoster(data, l4s)) {
    const name = p.l4 || NO_L4
    if (!acc.has(name)) acc.set(name, { hours: 0, topHours: 0, custs: new Set() })
  }

  for (const e of selectEntries(data, start, end, l4s)) {
    if (!CUSTOMER_TYPES.includes(typeNameOf(data, e))) continue
    const l4 = l4Of[e.e] ?? ''
    const b = acc.get(l4)
    if (!b) continue
    b.hours += e.h
    if (e.top) {
      b.topHours += e.h
      if (e.cu !== null && e.cu !== undefined) b.custs.add(e.cu)
    }
  }

  return [...acc.entries()]
    .map(([l4, b]) => ({
      l4,
      hours: b.hours,
      topHours: b.topHours,
      pct: b.hours > 0 ? b.topHours / b.hours : 0,
      topCustomers: b.custs.size,
    }))
    .sort((a, b) => b.topHours - a.topHours)
}

/** 跨 BG 支持:本 BG = 销售L2组织 ∈ meta.thisBgL2(常量随数据下发,前端不另维护一份)。 */
export function bgSupport(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): BgSupport {
  const own = new Set(data.meta.thisBgL2 ?? [])
  let thisBg = 0
  let crossBg = 0

  for (const e of selectEntries(data, start, end, l4s)) {
    if (!BG_TYPES.includes(typeNameOf(data, e))) continue
    const org = e.bg === null || e.bg === undefined ? '' : (data.dims.salesL2[e.bg] ?? '')
    if (own.has(org)) thisBg += e.h
    else crossBg += e.h
  }

  const total = thisBg + crossBg
  return {
    thisBg,
    crossBg,
    total,
    thisPct: total > 0 ? thisBg / total : 0,
    crossPct: total > 0 ? crossBg / total : 0,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/yitian/ && npx vue-tsc --noEmit`
Expected: calendar / metrics / compliance / customer 四组全 passed；typecheck 无错

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/compliance.ts frontend/src/lib/yitian/compliance.test.ts frontend/src/lib/yitian/customer.ts frontend/src/lib/yitian/customer.test.ts
git commit -m "feat(yitian): 合规明细口径 + TOP1000/跨BG客户维度口径

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `YitianToolbar.vue` + `YitianOverviewView.vue` — 工具条与总览页

**Files:**
- Create: `frontend/src/components/YitianToolbar.vue`、`frontend/src/views/YitianOverviewView.vue`
- Test: `frontend/src/components/YitianToolbar.test.ts`、`frontend/src/views/YitianOverviewView.test.ts`

**Interfaces:**
- Consumes: `useYitianStore` / `useYitianViewStore`（Task 7）、`lib/yitian/calendar` 的 `dataRange`、`lib/yitian/metrics` 的 `kpi` / `typeHours` / `orgSummary` / `selectEntries`、既有 `MetricGrid.vue` / `DataTable.vue` / `ChartBox.vue`
- Produces: `YitianToolbar`（`/yitian` 全部子页复用的顶部工具条：日期区间 + 周口径 + L4 筛选 + 降级告警）

**组件契约（`YitianToolbar`）**：无 props、无 emit——直接读写 `useYitianViewStore`。挂载时调用 `view.hydrate()` 与 `view.ensureRange(dataRange(days))`。日期选择器用 `disabledDate` 钳制在数据实际跨度内。

**既有组件用法**（照抄，不要臆造）：
- `MetricGrid`：`:items="[{ k: '标题', v: '值', sub?: '副标题', cls?: 'ok|warn|danger' }]"`
- `DataTable`：`:columns="[{ key, label, width?, sortable?, num?, wrap?, formatter? }]" :rows="rows"`
- `ChartBox`：`:option="echartsOption" height="320px"`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/YitianToolbar.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import YitianToolbar from './YitianToolbar.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import type { YitianData } from '@/types/yitian'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-05', hoursPerDay: 8, calendarSource: 'csv', thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '', l31: '服务二部', l4: '银行服务组', category: '' },
    { id: 'A2', name: '李四', l2: '', l3: '', l31: '服务一部', l4: '浙江服务组', category: '' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-05', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
  ],
  dims: { types: [], workTypes: [], customers: [], products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [],
  issues: [],
} as unknown as YitianData

function mountBar(data: YitianData) {
  setActivePinia(createPinia())
  useYitianStore().data = data
  return mount(YitianToolbar, { global: { plugins: [ElementPlus] } })
}

describe('YitianToolbar', () => {
  beforeEach(() => localStorage.clear())

  it('挂载后把区间兜底为数据跨度', () => {
    mountBar(DATA)
    const v = useYitianViewStore()
    expect(v.start).toBe('2026-06-01')
    expect(v.end).toBe('2026-06-05')
  })

  it('L4 选项取自花名册(去重升序)', () => {
    const w = mountBar(DATA)
    expect((w.vm as any).l4Options).toEqual(['浙江服务组', '银行服务组'])
  })

  it('日历源为 csv 时不显示降级告警', () => {
    const w = mountBar(DATA)
    expect(w.find('.yt-warn').exists()).toBe(false)
  })

  it('日历源为 fallback 时显示降级告警', () => {
    const w = mountBar({ ...DATA, meta: { ...DATA.meta, calendarSource: 'fallback' } } as YitianData)
    expect(w.find('.yt-warn').exists()).toBe(true)
    expect(w.text()).toContain('holidays.csv')
  })

  it('数据跨度外的日期被禁用', () => {
    const w = mountBar(DATA)
    const fn = (w.vm as any).disabledDate as (d: Date) => boolean
    expect(fn(new Date('2026-05-31'))).toBe(true)
    expect(fn(new Date('2026-06-03'))).toBe(false)
  })
})
```

`frontend/src/views/YitianOverviewView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianOverviewView from './YitianOverviewView.vue'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '2026-07-12 10:00',
          rows: 2, employees: 1, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [{ id: 'A1', name: '张三', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' }],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: [], products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 0, iss: [] },
    { d: '2026-06-02', e: 'A1', t: 0, h: 10, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 2, iss: ['MISS_NEXT'] },
  ],
  issues: [{ i: 1, codes: ['MISS_NEXT'], msgs: ['缺少下一步工作计划'], snippet: '正文' }],
} as unknown as YitianData

describe('YitianOverviewView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('挂载即拉数据并渲染 KPI', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('总工时')
    expect(w.text()).toContain('18')          // 8 + 10
  })

  it('渲染分层汇总表', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('交付实施三部')
    expect(w.text()).toContain('银行服务组')
  })

  it('加载失败显示错误', async () => {
    getSpy.mockRejectedValue(new Error('无倚天工时页面权限'))
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('无倚天工时页面权限')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/YitianToolbar.test.ts src/views/YitianOverviewView.test.ts`
Expected: FAIL — 找不到组件文件

- [ ] **Step 3a: `frontend/src/components/YitianToolbar.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { dataRange } from '@/lib/yitian/calendar'
import { NO_L4 } from '@/lib/yitian/metrics'

const store = useYitianStore()
const view = useYitianViewStore()

const days = computed(() => store.data?.days ?? [])
const range = computed(() => dataRange(days.value))

// 空 L4 兜底为「未分配L4」——花名册里确有 L4 为空的部门负责人,直接 filter 掉会让他们的工时筛不出来
const l4Options = computed(() => {
  const set = new Set((store.data?.roster ?? []).map((p) => p.l4 || NO_L4))
  return [...set].sort()
})

const isFallback = computed(() => store.data?.meta.calendarSource === 'fallback')

/** 数据跨度外的日期禁选——没有工作日标注就算不出基础工时。 */
function disabledDate(d: Date): boolean {
  const r = range.value
  if (!r.start || !r.end) return false
  const s = d.toISOString().slice(0, 10)
  return s < r.start || s > r.end
}

const rangeModel = computed<[string, string] | null>({
  get: () => (view.start && view.end ? [view.start, view.end] : null),
  set: (v) => {
    view.start = v?.[0] ?? ''
    view.end = v?.[1] ?? ''
    view.ensureRange(range.value.start, range.value.end)
  },
})

onMounted(() => {
  view.hydrate()
  view.ensureRange(range.value.start, range.value.end)
})

defineExpose({ l4Options, disabledDate })
</script>

<template>
  <div class="yt-bar">
    <div class="yt-row">
      <el-date-picker v-model="rangeModel" type="daterange" value-format="YYYY-MM-DD" unlink-panels
        range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
        :disabled-date="disabledDate" :clearable="false" />

      <el-radio-group v-model="view.weekMode" size="default">
        <el-radio-button value="calc">计算周(周五~周四)</el-radio-button>
        <el-radio-button value="iso">自然周(周一~周日)</el-radio-button>
      </el-radio-group>

      <el-select v-model="view.l4s" multiple collapse-tags collapse-tags-tooltip clearable
        placeholder="全部 L4 组织" class="yt-l4">
        <el-option v-for="o in l4Options" :key="o" :label="o" :value="o" />
      </el-select>

      <span class="yt-hint u-num">数据跨度 {{ range.start || '-' }} ~ {{ range.end || '-' }}</span>
    </div>

    <div v-if="isFallback" class="yt-warn">
      未提供 input/yitian/holidays.csv，工作日按「周一~周五」近似计算；含法定节假日的周期，饱和度会偏低、未填名单会误报。
    </div>
  </div>
</template>

<style scoped>
.yt-bar { margin-bottom: var(--gap-section); }
.yt-row { display: flex; flex-wrap: wrap; gap: var(--gap-stack); align-items: center; }
.yt-l4 { min-width: 220px; }
.yt-hint { color: var(--mut); font-size: var(--fs-1); }
.yt-warn {
  margin-top: var(--gap-stack);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  background: var(--warn-bg);
  color: var(--warn-text);
  font-size: var(--fs-2);
}
</style>
```

- [ ] **Step 3b: `frontend/src/views/YitianOverviewView.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { kpi, typeHours, orgSummary, selectEntries } from '@/lib/yitian/metrics'

const store = useYitianStore()
const view = useYitianViewStore()

onMounted(() => { store.load() })

const ready = computed(() => !!store.data)

const k = computed(() => (store.data ? kpi(store.data, view.start, view.end, view.l4s) : null))

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '-' : (v * 100).toFixed(1) + '%'
}
function hrs(v: number): string {
  return v.toFixed(1)
}

const metrics = computed(() => {
  const x = k.value
  if (!x) return []
  return [
    { k: '总工时', v: hrs(x.totalHours), sub: `人均基础 ${x.baseHours}h` },
    { k: '平均饱和度', v: pct(x.avgSat), sub: `补全后 ${pct(x.avgSatFilled)}` },
    { k: '未填人数', v: String(x.unfilledCount), sub: `其中一条未填 ${x.neverFilledCount} 人`,
      cls: x.unfilledCount > 0 ? 'danger' : undefined },
    { k: '加班人数', v: String(x.overtimeCount), sub: `累计 ${hrs(x.overtimeHours)}h` },
    { k: '合规率', v: pct(x.complianceRate), sub: `问题 ${x.issueCount} 条`,
      cls: x.complianceRate !== null && x.complianceRate < 0.9 ? 'warn' : 'ok' },
  ]
})

const typeRows = computed(() =>
  store.data ? typeHours(store.data, selectEntries(store.data, view.start, view.end, view.l4s)) : [])

const typeOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    data: typeRows.value.map((t) => ({ name: t.type, value: Number(t.hours.toFixed(1)) })),
    label: { formatter: '{b} {d}%' },
  }],
}))

const ORG_LEVEL_LABEL: Record<string, string> = { l3: 'L3', l31: 'L3-1', l4: 'L4' }

const orgCols: DataColumn[] = [
  { key: 'levelLabel', label: '层级', width: 80 },
  { key: 'name', label: '组织', width: 160 },
  { key: 'parent', label: '上级组织', width: 140 },
  { key: 'people', label: '人数', width: 90, num: true, sortable: true },
  { key: 'hoursText', label: '实际工时', width: 110, num: true, sortable: true },
  { key: 'baseText', label: '基础工时', width: 110, num: true },
  { key: 'satText', label: '饱和度', width: 110, num: true, sortable: true },
]

const orgRows = computed(() => {
  if (!store.data) return []
  return orgSummary(store.data, view.start, view.end, view.l4s).map((r) => ({
    ...r,
    levelLabel: ORG_LEVEL_LABEL[r.level] ?? r.level,
    hoursText: hrs(r.hours),
    baseText: hrs(r.base),
    satText: pct(r.sat),
  }))
})
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <MetricGrid :items="metrics" col-min="180px" />

      <div class="yt-grid">
        <section class="yt-card">
          <h3 class="yt-h">工时类型占比</h3>
          <ChartBox :option="typeOption" height="300px" />
        </section>

        <section class="yt-card">
          <h3 class="yt-h">分层汇总（L3 → L3-1 → L4）</h3>
          <DataTable :columns="orgCols" :rows="orgRows" :show-count="false" />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); }
.yt-grid { display: grid; grid-template-columns: minmax(320px, 1fr) minmax(480px, 2fr); gap: var(--gap-card); }
@media (max-width: 1200px) { .yt-grid { grid-template-columns: 1fr; } }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
</style>
```

> **实现注意**：`MetricGrid` 的 `cls` 值用既有状态类（`ok`/`warn`/`danger`），不要新造类名。若 `theme.css` 无 `--warn-bg`/`--warn-text` 令牌，**先去 `frontend/src/styles/theme.css` 确认真实令牌名再写**——写错的 CSS 变量会被浏览器静默丢弃，肉眼看不出来（V2.8.0 踩过这个坑）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/YitianToolbar.test.ts src/views/YitianOverviewView.test.ts && npx vue-tsc --noEmit`
Expected: 全部 passed；typecheck 无错

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/YitianToolbar.vue frontend/src/components/YitianToolbar.test.ts frontend/src/views/YitianOverviewView.vue frontend/src/views/YitianOverviewView.test.ts
git commit -m "feat(yitian): 工具条(区间/周口径/L4/降级告警) + 总览页(KPI+类型占比+分层汇总)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `YitianComplianceView.vue` + `YitianAnalyticsView.vue` — 合规检查页与工时统计页

**Files:**
- Create: `frontend/src/views/YitianComplianceView.vue`、`frontend/src/views/YitianAnalyticsView.vue`
- Test: `frontend/src/views/YitianComplianceView.test.ts`、`frontend/src/views/YitianAnalyticsView.test.ts`

**Interfaces:**
- Consumes: `YitianToolbar`（Task 10）、`lib/yitian/compliance` 的 `issueRows` / `countByCode` / `ISSUE_LABELS`、`lib/yitian/metrics` 的 `empStats` / `saturationTop` / `unfilledList` / `neverFilledList` / `EmpStat`、既有 `DataTable`、`lib/exportXlsx` 的 `exportRows`
- Produces: 两个视图组件（无对外接口）

**页面内容**
- **合规检查页**：问题码分布（横向条）+ 问题明细表（日期/员工/L4/工时类型/客户/工单/问题/摘要），支持按问题码筛选、列排序、导出 xlsx（复用既有 `lib/exportXlsx.ts`）。
- **工时统计页**：员工明细表（工号/姓名/L3-1/L4/实际/基础/饱和度/差值）+ 饱和度 TOP10 + **未按时填写清单** + **完全未填清单**（两清单互斥并列，后者是原工具的盲区）。

- [ ] **Step 1: 写失败测试**

`frontend/src/views/YitianComplianceView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianComplianceView from './YitianComplianceView.vue'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 2,
          employees: 2, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' },
    { id: 'A2', name: '李四', l2: '', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: ['某客户'], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO1', top: false, chk: true, ok: 2, iss: ['MISS_SUMMARY'] },
    { d: '2026-06-02', e: 'A2', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 1, iss: ['HINT_PRESALE_PRODUCT'] },
  ],
  issues: [
    { i: 0, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '张三的正文' },
    { i: 1, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['售前服务类产品类别不应为「其他」'], snippet: '李四的正文' },
  ],
} as unknown as YitianData

describe('YitianComplianceView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('渲染问题明细(含提示行)', async () => {
    const w = mount(YitianComplianceView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('缺少工作概述')
    expect(w.text()).toContain('李四')
  })

  it('按问题码筛选', async () => {
    const w = mount(YitianComplianceView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    ;(w.vm as any).codeFilter = ['MISS_SUMMARY']
    await flushPromises()
    const rows = (w.vm as any).rows as { empName: string }[]
    expect(rows.map((r) => r.empName)).toEqual(['张三'])
  })

  it('问题码分布计数', async () => {
    const w = mount(YitianComplianceView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const dist = (w.vm as any).codeDist as { code: string; count: number }[]
    expect(dist.find((d) => d.code === 'MISS_SUMMARY')!.count).toBe(1)
  })
})
```

`frontend/src/views/YitianAnalyticsView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianAnalyticsView from './YitianAnalyticsView.vue'

// 两天工作日 → 基础 16h。张三 20h(加班) 李四 8h(欠填) 王五 零记录(完全未填)
const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 2,
          employees: 3, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' },
    { id: 'A2', name: '李四', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' },
    { id: 'A3', name: '王五', l2: '', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '正式员工' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: [], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 20, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 0, iss: [] },
    { d: '2026-06-01', e: 'A2', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 0, iss: [] },
  ],
  issues: [],
} as unknown as YitianData

describe('YitianAnalyticsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('员工明细覆盖花名册全员', async () => {
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).empRows as { name: string }[]
    expect(rows.map((r) => r.name).sort()).toEqual(['张三', '李四', '王五'].sort())
  })

  it('未按时填写清单只含有记录且欠填的人', async () => {
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).unfilledRows as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['李四'])
  })

  it('完全未填清单含零记录的人(原工具盲区)', async () => {
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).neverRows as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['王五'])
    expect(w.text()).toContain('完全未填')
  })

  it('饱和度榜降序', async () => {
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).topRows as { name: string }[]
    expect(rows[0].name).toBe('张三')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/YitianComplianceView.test.ts src/views/YitianAnalyticsView.test.ts`
Expected: FAIL — 找不到视图文件

- [ ] **Step 3a: `frontend/src/views/YitianComplianceView.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { issueRows, countByCode, ISSUE_LABELS } from '@/lib/yitian/compliance'
import { exportRows } from '@/lib/exportXlsx'

const store = useYitianStore()
const view = useYitianViewStore()

onMounted(() => { store.load() })

const ready = computed(() => !!store.data)
const codeFilter = ref<string[]>([])

const allRows = computed(() =>
  store.data ? issueRows(store.data, view.start, view.end, view.l4s) : [])

const codeDist = computed(() => countByCode(allRows.value))

const codeOptions = computed(() =>
  codeDist.value.map((c) => ({ value: c.code, label: `${c.label} (${c.count})` })))

const rows = computed(() => {
  const keep = new Set(codeFilter.value)
  const src = keep.size
    ? allRows.value.filter((r) => r.codes.some((c) => keep.has(c)))
    : allRows.value
  return src.map((r) => ({
    ...r,
    okText: r.ok === 2 ? '问题' : '提示',
    issueText: r.msgs.length ? r.msgs.join('；') : r.codes.map((c) => ISSUE_LABELS[c] ?? c).join('；'),
  }))
})

const cols: DataColumn[] = [
  { key: 'date', label: '工作日', width: 110, sortable: true },
  { key: 'empName', label: '员工', width: 90, sortable: true },
  { key: 'l4', label: 'L4 组织', width: 130, sortable: true },
  { key: 'type', label: '工时类型', width: 100, sortable: true },
  { key: 'hours', label: '工时', width: 80, num: true, sortable: true },
  { key: 'customer', label: '客户', width: 160 },
  { key: 'workOrder', label: '工单编号', width: 140 },
  { key: 'okText', label: '状态', width: 80, sortable: true },
  { key: 'issueText', label: '问题', width: 320, wrap: true },
  { key: 'snippet', label: '工作成果摘要', width: 360, wrap: true },
]

function onExport() {
  // 既有签名是 exportRows(filename, rows) —— 文件名在前,别写反
  exportRows(
    `倚天工时合规问题_${view.start}_${view.end}.xlsx`,
    rows.value.map((r) => ({
      工作日: r.date, 员工: r.empName, L4组织: r.l4, 工时类型: r.type, 工时: r.hours,
      客户: r.customer, 工单编号: r.workOrder, 状态: r.okText, 问题: r.issueText, 工作成果摘要: r.snippet,
    })),
  )
}

defineExpose({ codeFilter, rows, codeDist })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <section class="yt-card">
        <div class="yt-head">
          <h3 class="yt-h">问题分布</h3>
          <div class="yt-actions">
            <el-select v-model="codeFilter" multiple collapse-tags clearable placeholder="全部问题类型"
              class="yt-code">
              <el-option v-for="o in codeOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <el-button @click="onExport">导出</el-button>
          </div>
        </div>
        <div v-if="!codeDist.length" class="yt-empty">本区间无合规问题</div>
        <ul v-else class="yt-dist">
          <li v-for="c in codeDist" :key="c.code">
            <span class="yt-dist-label">{{ c.label }}</span>
            <span class="yt-dist-count u-num">{{ c.count }}</span>
          </li>
        </ul>
      </section>

      <section class="yt-card">
        <h3 class="yt-h">问题明细</h3>
        <DataTable :columns="cols" :rows="rows" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-head { display: flex; justify-content: space-between; align-items: center; gap: var(--gap-stack); flex-wrap: wrap; }
.yt-actions { display: flex; gap: var(--gap-stack); align-items: center; }
.yt-code { min-width: 240px; }
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
.yt-dist { display: flex; flex-wrap: wrap; gap: var(--gap-stack); list-style: none; }
.yt-dist li {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-3);
  border-radius: var(--r-full);
  background: var(--danger-bg);
  color: var(--danger-text);
  font-size: var(--fs-2);
}
.yt-dist-count { font-weight: 700; }
</style>
```

> **实现注意**：`exportRows` 的真实签名是 `exportRows(filename: string, rows: Record<string, unknown>[])`——**文件名在第一个参数**（`ActivityView.vue` / `CostDetailView.vue` 均如此调用）。不要另造导出函数。

- [ ] **Step 3b: `frontend/src/views/YitianAnalyticsView.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { empStats, saturationTop, unfilledList, neverFilledList, type EmpStat } from '@/lib/yitian/metrics'

const store = useYitianStore()
const view = useYitianViewStore()

onMounted(() => { store.load() })

const ready = computed(() => !!store.data)

function pct(v: number | null): string {
  return v === null ? '-' : (v * 100).toFixed(1) + '%'
}
function hrs(v: number): string {
  return v.toFixed(1)
}
function shape(s: EmpStat) {
  return {
    ...s,
    hoursText: hrs(s.hours),
    baseText: hrs(s.base),
    satText: pct(s.sat),
    diffText: (s.diff > 0 ? '+' : '') + hrs(s.diff),
  }
}

const stats = computed(() =>
  store.data ? empStats(store.data, view.start, view.end, view.l4s) : [])

const empRows = computed(() => stats.value.map(shape))
const topRows = computed(() => saturationTop(stats.value, 10).map(shape))
const unfilledRows = computed(() => unfilledList(stats.value).map(shape))
const neverRows = computed(() => neverFilledList(stats.value).map(shape))

const empCols: DataColumn[] = [
  { key: 'id', label: '工号', width: 100 },
  { key: 'name', label: '姓名', width: 90, sortable: true },
  { key: 'l31', label: 'L3-1', width: 110, sortable: true },
  { key: 'l4', label: 'L4 组织', width: 130, sortable: true },
  { key: 'hoursText', label: '实际工时', width: 110, num: true, sortable: true },
  { key: 'baseText', label: '基础工时', width: 110, num: true },
  { key: 'satText', label: '饱和度', width: 100, num: true, sortable: true },
  { key: 'diffText', label: '差值', width: 100, num: true, sortable: true },
]

const shortCols: DataColumn[] = [
  { key: 'name', label: '姓名', width: 90 },
  { key: 'l4', label: 'L4 组织', width: 130 },
  { key: 'hoursText', label: '实际工时', width: 100, num: true },
  { key: 'diffText', label: '差值', width: 100, num: true },
]

const neverCols: DataColumn[] = [
  { key: 'id', label: '工号', width: 100 },
  { key: 'name', label: '姓名', width: 90 },
  { key: 'l31', label: 'L3-1', width: 110 },
  { key: 'l4', label: 'L4 组织', width: 130 },
]

defineExpose({ empRows, topRows, unfilledRows, neverRows })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <div class="yt-grid">
        <section class="yt-card">
          <h3 class="yt-h">饱和度 TOP10</h3>
          <DataTable :columns="shortCols" :rows="topRows" :show-count="false" />
        </section>

        <section class="yt-card">
          <h3 class="yt-h">未按时填写<span class="yt-sub">（有记录但工时不足）</span></h3>
          <div v-if="!unfilledRows.length" class="yt-empty">无</div>
          <DataTable v-else :columns="shortCols" :rows="unfilledRows" :show-count="false" />
        </section>

        <section class="yt-card">
          <h3 class="yt-h">完全未填<span class="yt-sub">（本区间一条记录都没有）</span></h3>
          <div v-if="!neverRows.length" class="yt-empty">无</div>
          <DataTable v-else :columns="neverCols" :rows="neverRows" :show-count="false" />
        </section>
      </div>

      <section class="yt-card">
        <h3 class="yt-h">员工工时明细</h3>
        <DataTable :columns="empCols" :rows="empRows" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); }
.yt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--gap-card); }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-sub { font-size: var(--fs-1); font-weight: 400; color: var(--mut); margin-left: var(--sp-2); }
.yt-empty { color: var(--mut); font-size: var(--fs-2); padding: var(--sp-3) 0; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/YitianComplianceView.test.ts src/views/YitianAnalyticsView.test.ts && npx vue-tsc --noEmit`
Expected: 全部 passed；typecheck 无错

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/YitianComplianceView.vue frontend/src/views/YitianComplianceView.test.ts frontend/src/views/YitianAnalyticsView.vue frontend/src/views/YitianAnalyticsView.test.ts
git commit -m "feat(yitian): 合规检查页 + 工时统计页(含完全未填清单)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `YitianTrendView.vue` + `YitianCustomerView.vue` — 趋势页与客户支持页

**Files:**
- Create: `frontend/src/views/YitianTrendView.vue`、`frontend/src/views/YitianCustomerView.vue`
- Test: `frontend/src/views/YitianTrendView.test.ts`、`frontend/src/views/YitianCustomerView.test.ts`

**Interfaces:**
- Consumes: `YitianToolbar`、`lib/yitian/calendar` 的 `weekBuckets`、`lib/yitian/metrics` 的 `selectEntries` / `empStats` / `complianceRate` / `unfilledList` / `neverFilledList`、`lib/yitian/customer` 的 `top1000ByL4` / `bgSupport`、`ChartBox`、`MetricGrid`、`DataTable`
- Produces: 两个视图组件

**趋势页 7 图**（X 轴 = 周口径分桶，随工具条的周口径切换）：合规问题数、合规率、总工时、加班工时、平均饱和度、未填人数、工时类型占比（堆叠）。

- [ ] **Step 1: 写失败测试**

`frontend/src/views/YitianTrendView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))
// ChartBox 内部依赖 canvas,单测里替身掉,只断言 option
vi.mock('@/charts/ChartBox.vue', () => ({
  default: { name: 'ChartBox', props: ['option', 'height'], template: '<div class="chart-stub" />' },
}))

import YitianTrendView from './YitianTrendView.vue'
import { useYitianViewStore } from '@/stores/yitianView'

// 6/1~6/4 全工作日;张三 6/1 8h(合规) 6/5 8h(问题)。calc 口径下 6/5 属下一个计算周
const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-05', generatedAt: '', rows: 2,
          employees: 1, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [{ id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' }],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-03', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-04', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-05', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: [], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 0, iss: [] },
    { d: '2026-06-05', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 2, iss: ['MISS_NEXT'] },
  ],
  issues: [{ i: 1, codes: ['MISS_NEXT'], msgs: ['缺少下一步工作计划'], snippet: '正文' }],
} as unknown as YitianData

describe('YitianTrendView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('渲染 7 张图', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.findAll('.chart-stub')).toHaveLength(7)
  })

  it('calc 口径下按计算周分桶(6/5 单独一桶)', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = (w.vm as any).series as { weeks: string[]; issues: number[]; hours: number[] }
    expect(s.weeks).toEqual(['2026-CW23', '2026-CW24'])
    expect(s.issues).toEqual([0, 1])
    expect(s.hours).toEqual([8, 8])
  })

  it('切成 iso 口径后并成一桶', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    useYitianViewStore().weekMode = 'iso'
    await flushPromises()
    const s = (w.vm as any).series as { weeks: string[]; hours: number[] }
    expect(s.weeks).toEqual(['2026-W23'])
    expect(s.hours).toEqual([16])
  })
})
```

`frontend/src/views/YitianCustomerView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))
vi.mock('@/charts/ChartBox.vue', () => ({
  default: { name: 'ChartBox', props: ['option', 'height'], template: '<div class="chart-stub" />' },
}))

import YitianCustomerView from './YitianCustomerView.vue'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-01', generatedAt: '', rows: 2,
          employees: 1, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8,
          thisBgL2: ['银行集团军'] },
  roster: [{ id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' }],
  days: [{ d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' }],
  dims: { types: ['项目类'], workTypes: [], customers: ['大客户', '小客户'], products: [],
          productNames: [], projectTypes: [], salesL2: ['银行集团军', '政企大区'], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 6, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: 0, wo: '', top: true, chk: true, ok: 0, iss: [] },
    { d: '2026-06-01', e: 'A1', t: 0, h: 2, wt: null, cu: 1, pl: null, pn: null, pt: null, sm: null, bg: 1, wo: '', top: false, chk: true, ok: 0, iss: [] },
  ],
  issues: [],
} as unknown as YitianData

describe('YitianCustomerView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('TOP1000 按 L4 汇总', async () => {
    const w = mount(YitianCustomerView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).topRows as { l4: string; pctText: string }[]
    expect(rows[0].l4).toBe('银行服务组')
    expect(rows[0].pctText).toBe('75.0%')
  })

  it('跨 BG 占比', async () => {
    const w = mount(YitianCustomerView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const bg = (w.vm as any).bg as { thisBg: number; crossBg: number }
    expect(bg.thisBg).toBe(6)
    expect(bg.crossBg).toBe(2)
    expect(w.text()).toContain('跨 BG')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/YitianTrendView.test.ts src/views/YitianCustomerView.test.ts`
Expected: FAIL — 找不到视图文件

- [ ] **Step 3a: `frontend/src/views/YitianTrendView.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { weekBuckets } from '@/lib/yitian/calendar'
import { selectEntries, empStats, complianceRate, unfilledList, neverFilledList } from '@/lib/yitian/metrics'

const store = useYitianStore()
const view = useYitianViewStore()

onMounted(() => { store.load() })

const ready = computed(() => !!store.data)

/** 按周口径分桶,逐桶重算各指标。桶内区间 = [bucket.start, bucket.end],口径与总览页完全同源。 */
const series = computed(() => {
  const data = store.data
  const empty = {
    weeks: [] as string[], issues: [] as number[], okRate: [] as number[],
    hours: [] as number[], overtime: [] as number[], sat: [] as number[],
    unfilled: [] as number[], typeStack: [] as { name: string; data: number[] }[],
  }
  if (!data) return empty

  const buckets = weekBuckets(data.days, view.start, view.end, view.weekMode)
  const types = data.dims.types
  const typeAcc: Record<string, number[]> = {}
  for (const t of types) typeAcc[t] = []

  const out = { ...empty, weeks: buckets.map((b) => b.key) }
  buckets.forEach((b, bi) => {
    const es = selectEntries(data, b.start, b.end, view.l4s)
    const stats = empStats(data, b.start, b.end, view.l4s)

    out.issues.push(es.filter((e) => e.chk && e.ok === 2).length)
    const r = complianceRate(es)
    out.okRate.push(r === null ? 0 : Number((r * 100).toFixed(1)))
    out.hours.push(Number(es.reduce((s, e) => s + e.h, 0).toFixed(1)))
    out.overtime.push(Number(stats.filter((s) => s.diff > 0).reduce((s, x) => s + x.diff, 0).toFixed(1)))

    const sumBase = stats.reduce((s, x) => s + x.base, 0)
    const sumHours = stats.reduce((s, x) => s + x.hours, 0)
    out.sat.push(sumBase > 0 ? Number(((sumHours / sumBase) * 100).toFixed(1)) : 0)
    out.unfilled.push(unfilledList(stats).length + neverFilledList(stats).length)

    for (const t of types) typeAcc[t][bi] = 0
    for (const e of es) {
      const name = e.t === null || e.t === undefined ? null : types[e.t]
      if (name && typeAcc[name]) typeAcc[name][bi] += e.h
    }
  })

  out.typeStack = types.map((t) => ({
    name: t,
    data: (typeAcc[t] ?? []).map((v) => Number((v ?? 0).toFixed(1))),
  }))
  return out
})

function lineOption(name: string, data: number[], unit = '') {
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v}${unit}` },
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    xAxis: { type: 'category', data: series.value.weeks },
    yAxis: { type: 'value' },
    series: [{ name, type: 'line', smooth: true, data }],
  }
}

const charts = computed(() => [
  { title: '合规问题数趋势', option: lineOption('问题数', series.value.issues, ' 条') },
  { title: '合规率趋势', option: lineOption('合规率', series.value.okRate, '%') },
  { title: '总工时趋势', option: lineOption('总工时', series.value.hours, ' h') },
  { title: '加班工时趋势', option: lineOption('加班工时', series.value.overtime, ' h') },
  { title: '平均饱和度趋势', option: lineOption('饱和度', series.value.sat, '%') },
  { title: '未填人数趋势', option: lineOption('未填人数', series.value.unfilled, ' 人') },
  {
    title: '工时类型占比趋势',
    option: {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: 48, right: 16, top: 24, bottom: 48 },
      xAxis: { type: 'category', data: series.value.weeks },
      yAxis: { type: 'value' },
      series: series.value.typeStack.map((s) => ({
        name: s.name, type: 'bar', stack: 'total', data: s.data,
      })),
    },
  },
])

defineExpose({ series })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <div v-if="ready" class="yt-grid">
      <section v-for="c in charts" :key="c.title" class="yt-card">
        <h3 class="yt-h">{{ c.title }}</h3>
        <ChartBox :option="c.option" height="280px" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); }
.yt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: var(--gap-card); }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
</style>
```

- [ ] **Step 3b: `frontend/src/views/YitianCustomerView.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import YitianToolbar from '@/components/YitianToolbar.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import { top1000ByL4, bgSupport } from '@/lib/yitian/customer'

const store = useYitianStore()
const view = useYitianViewStore()

onMounted(() => { store.load() })

const ready = computed(() => !!store.data)

function hrs(v: number): string {
  return v.toFixed(1)
}
function pct(v: number): string {
  return (v * 100).toFixed(1) + '%'
}

const topRows = computed(() => {
  if (!store.data) return []
  return top1000ByL4(store.data, view.start, view.end, view.l4s).map((r) => ({
    ...r,
    hoursText: hrs(r.hours),
    topHoursText: hrs(r.topHours),
    pctText: pct(r.pct),
  }))
})

const topCols: DataColumn[] = [
  { key: 'l4', label: 'L4 组织', width: 150 },
  { key: 'hoursText', label: '客户类总工时', width: 130, num: true, sortable: true },
  { key: 'topHoursText', label: 'TOP1000 工时', width: 130, num: true, sortable: true },
  { key: 'pctText', label: 'TOP1000 占比', width: 130, num: true, sortable: true },
  { key: 'topCustomers', label: 'TOP1000 客户数', width: 140, num: true, sortable: true },
]

const bg = computed(() =>
  store.data ? bgSupport(store.data, view.start, view.end, view.l4s)
             : { thisBg: 0, crossBg: 0, thisPct: 0, crossPct: 0, total: 0 })

const bgMetrics = computed(() => [
  { k: '本 BG 工时', v: hrs(bg.value.thisBg), sub: pct(bg.value.thisPct) },
  { k: '跨 BG 工时', v: hrs(bg.value.crossBg), sub: pct(bg.value.crossPct), cls: 'warn' },
  { k: '合计（项目类+售前类）', v: hrs(bg.value.total) },
])

const bgOption = computed(() => ({
  tooltip: { trigger: 'item', valueFormatter: (v: number) => `${v} h` },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    data: [
      { name: '本 BG', value: Number(bg.value.thisBg.toFixed(1)) },
      { name: '跨 BG', value: Number(bg.value.crossBg.toFixed(1)) },
    ],
    label: { formatter: '{b} {d}%' },
  }],
}))

defineExpose({ topRows, bg })
</script>

<template>
  <div class="yt-page">
    <YitianToolbar v-if="ready" />

    <el-alert v-if="store.error" :title="store.error" type="error" show-icon :closable="false" />
    <el-skeleton v-else-if="store.loading && !ready" :rows="6" animated />

    <template v-if="ready">
      <section class="yt-card">
        <h3 class="yt-h">TOP1000 大客户支持<span class="yt-sub">（仅项目类 / 售前类 / 售后类）</span></h3>
        <DataTable :columns="topCols" :rows="topRows" :show-count="false" />
      </section>

      <section class="yt-card">
        <h3 class="yt-h">跨 BG 支持<span class="yt-sub">（仅项目类 / 售前类；本 BG 按销售 L2 组织判定）</span></h3>
        <MetricGrid :items="bgMetrics" col-min="200px" />
        <ChartBox :option="bgOption" height="280px" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.yt-page { display: flex; flex-direction: column; gap: var(--gap-section); }
.yt-card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  box-shadow: var(--shadow-1);
}
.yt-h { font-size: var(--fs-3); font-weight: 600; color: var(--txt); margin-bottom: var(--gap-stack); }
.yt-sub { font-size: var(--fs-1); font-weight: 400; color: var(--mut); margin-left: var(--sp-2); }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/YitianTrendView.test.ts src/views/YitianCustomerView.test.ts && npx vue-tsc --noEmit`
Expected: 全部 passed；typecheck 无错

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/YitianTrendView.vue frontend/src/views/YitianTrendView.test.ts frontend/src/views/YitianCustomerView.vue frontend/src/views/YitianCustomerView.test.ts
git commit -m "feat(yitian): 趋势页(7图,随周口径切换) + 客户支持页(TOP1000+跨BG)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: 装配（路由 / 侧栏 / pageKey / 上传卡 / 登出复位 / 版本 V3.0.0）+ 全量验证

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts`（`PageKey` 联合类型 +5）
- Modify: `frontend/src/nav.ts`（新增 `YITIAN_LINKS` 分区）
- Modify: `frontend/src/router/index.ts`（5 条路由 + `pageKey`）
- Modify: `frontend/src/composables/useInputFiles.ts`（上传白名单 +2）+ `frontend/src/composables/useInputFiles.test.ts`（既有断言要跟着改）
- Modify: `frontend/src/views/DataView.vue`（倚天文件状态展示）
- Modify: `frontend/src/stores/auth.ts`（登录/登出复位 yitian 两个 store）
- Modify: `frontend/src/version.ts`（`V3.0.0`）
- Modify: `frontend/src/App.vue` 或侧栏组件（渲染新分区——**先找到实际渲染 `PAYMENT_LINKS` 的那个文件**，照它的写法加）

**Interfaces:**
- Consumes: Task 10-12 的 5 个视图组件
- Produces: 可访问的 `/yitian`、`/yitian/compliance`、`/yitian/analytics`、`/yitian/trend`、`/yitian/customer`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/pageAccess.test.ts` 追加（不要动既有用例）：

```ts
describe('倚天 pageKey', () => {
  it('五个倚天页面都能被单独授权', () => {
    const keys = ['yitian', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer'] as const
    for (const k of keys) {
      expect(canAccess([k], k)).toBe(true)
      expect(canAccess(['overview'], k)).toBe(false)
      expect(canAccess(['*'], k)).toBe(true)
    }
  })

  it('PAGE_OPTIONS 含倚天五页(账号管理表单能勾到)', () => {
    const keys = PAGE_OPTIONS.map((o) => o.key)
    for (const k of ['yitian', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer']) {
      expect(keys).toContain(k)
    }
  })
})
```

`frontend/src/composables/useInputFiles.test.ts` 的既有断言改为（**这是既有测试，必须同步改，否则红**）：

```ts
    expect(INPUT_FILE_NAMES).toEqual([
      '组织架构.xlsx', 'A.xlsx', 'delivery_analysis.csv', 'delivery_analysis.xlsx',
      'payment_records.csv', 'profit_loss_direct.csv', 'profit_loss_bridge.csv', 'budget_data.csv',
      'collection_stages.csv', 'TOP1000.xlsx', '工时.xlsx', 'holidays.csv',
    ])
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/pageAccess.test.ts src/composables/useInputFiles.test.ts`
Expected: FAIL — `canAccess(['yitian'], 'yitian')` 类型报错 / `INPUT_FILE_NAMES` 数组不含新两项

- [ ] **Step 3a: `frontend/src/lib/pageAccess.ts`**

```ts
export type PageKey =
  | 'overview' | 'projects' | 'projects-closed' | 'activity'
  | 'insight' | 'insight-milestone' | 'insight-costdetail' | 'insight-risk' | 'insight-board' | 'insight-calendar' | 'opportunities-board'
  | 'payment' | 'payment-projects' | 'payment-nodes'
  | 'projects-key' | 'opportunities-progress' | 'temp-followup' | 'opportunity-followup' | 'risk-followup' | 'payment-key'
  | 'yitian' | 'yitian-compliance' | 'yitian-analytics' | 'yitian-trend' | 'yitian-customer'
  | 'data' | 'governance' | 'about'
```

并把 `YITIAN_LINKS` 并进 `PAGE_OPTIONS` 的展开列表（它是账号管理表单"可访问页面"的单一来源）：

```ts
import { PROJECT_LINKS, ANALYSIS_LINKS, KEY_FOLLOWUP_LINKS, PAYMENT_LINKS, YITIAN_LINKS, TOOL_LINKS } from '@/nav'

export const PAGE_OPTIONS: { key: string; label: string }[] = [
  { key: '*', label: '全部页面' },
  ...[...PROJECT_LINKS, ...ANALYSIS_LINKS, ...KEY_FOLLOWUP_LINKS, ...PAYMENT_LINKS, ...YITIAN_LINKS, ...TOOL_LINKS].map((l) => ({
    key: l.key,
    label: l.label,
  })),
]
```

- [ ] **Step 3b: `frontend/src/nav.ts` 新增分区**（放在 `PAYMENT_LINKS` 之后、`TOOL_LINKS` 之前）

```ts
// 倚天工时域(V3.0.0):离线导入工时.xlsx → 合规检查 / 工时统计 / 趋势 / 客户支持
export const YITIAN_LINKS: NavLink[] = [
  { label: '倚天工时总览', to: '/yitian', key: 'yitian' },
  { label: '工时合规检查', to: '/yitian/compliance', key: 'yitian-compliance' },
  { label: '工时统计分析', to: '/yitian/analytics', key: 'yitian-analytics' },
  { label: '工时趋势分析', to: '/yitian/trend', key: 'yitian-trend' },
  { label: '客户支持分析', to: '/yitian/customer', key: 'yitian-customer' },
]
```

- [ ] **Step 3c: `frontend/src/router/index.ts` 挂 5 条路由**

顶部 import：

```ts
import YitianOverviewView from '@/views/YitianOverviewView.vue'
import YitianComplianceView from '@/views/YitianComplianceView.vue'
import YitianAnalyticsView from '@/views/YitianAnalyticsView.vue'
import YitianTrendView from '@/views/YitianTrendView.vue'
import YitianCustomerView from '@/views/YitianCustomerView.vue'
```

在 `routes` 数组里（放在 `/payment` 那几条之后、`/data` 之前）：

```ts
    // 倚天工时域(V3.0.0):hideFilter —— 本域用自己的 YitianToolbar,不吃全站 FilterBar
    { path: '/yitian', name: 'yitian', component: YitianOverviewView, meta: { title: '倚天工时总览', hideFilter: true, pageKey: 'yitian' } },
    { path: '/yitian/compliance', name: 'yitian-compliance', component: YitianComplianceView, meta: { title: '工时合规检查', hideFilter: true, pageKey: 'yitian-compliance' } },
    { path: '/yitian/analytics', name: 'yitian-analytics', component: YitianAnalyticsView, meta: { title: '工时统计分析', hideFilter: true, pageKey: 'yitian-analytics' } },
    { path: '/yitian/trend', name: 'yitian-trend', component: YitianTrendView, meta: { title: '工时趋势分析', hideFilter: true, pageKey: 'yitian-trend' } },
    { path: '/yitian/customer', name: 'yitian-customer', component: YitianCustomerView, meta: { title: '客户支持分析', hideFilter: true, pageKey: 'yitian-customer' } },
```

- [ ] **Step 3d: 侧栏渲染新分区**

先定位实际渲染 `PAYMENT_LINKS` 的文件：

```bash
grep -rn "PAYMENT_LINKS" frontend/src --include=*.vue
```

在该文件里照抄回款子域那一段的写法（`nav-item` / `nav-sub` 结构与 `canAccess` 过滤逻辑），加一个「倚天工时」分区渲染 `YITIAN_LINKS`。**不要新造样式类**，复用既有 `nav-sub`（V2.5.3 已统一六分区）。

- [ ] **Step 3e: `frontend/src/composables/useInputFiles.ts` 上传白名单 +2**

```ts
export const INPUT_FILE_NAMES = [
  '组织架构.xlsx', 'A.xlsx', 'delivery_analysis.csv', 'delivery_analysis.xlsx',
  'payment_records.csv', 'profit_loss_direct.csv', 'profit_loss_bridge.csv', 'budget_data.csv',
  'collection_stages.csv', 'TOP1000.xlsx',
  // 倚天工时域(V3.0.0):后端按 config.INPUT_SUBDIR_MAP 落到 input/yitian/,前端仍走同一个上传端点
  '工时.xlsx', 'holidays.csv',
]
```

> 上传按钮无需改动——`onUploadInputs` 按白名单过滤后逐个 POST，后端按文件名决定落哪个目录。

- [ ] **Step 3f: `frontend/src/views/DataView.vue` 展示倚天文件状态**

在「项目域文件（input/ 根）」那块之后追加一小段（`ftime()` / `dv-fgrid` / `dv-fcell` 全是既有类，直接复用）：

```vue
          <div class="dv-sub-head">倚天工时域（input/yitian/）</div>
          <div class="dv-fgrid">
            <div v-for="name in YITIAN_FILE_NAMES" :key="name" class="dv-fcell" :title="name">
              <span class="dv-fname2">{{ name }}</span>
              <span class="dv-ftime2 u-num">{{ ftime(name) }}</span>
            </div>
          </div>
```

script 里（`INPUT_DISPLAY_NAMES` 那行附近）加：

```ts
const YITIAN_FILE_NAMES = ['工时.xlsx', 'holidays.csv']
const INPUT_DISPLAY_NAMES = INPUT_FILE_NAMES
  .filter((n) => n !== 'delivery_analysis.xlsx')
  .filter((n) => !YITIAN_FILE_NAMES.includes(n))   // 倚天两文件单独成组展示
```

- [ ] **Step 3g: `frontend/src/stores/auth.ts` 复位两个 store**

在登录复位批次（`usePortalStore().reset()` 那行后）与登出复位批次各加两行：

```ts
      useYitianStore().reset()
      useYitianViewStore().reset()
```

顶部 import：

```ts
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
```

> 必须两个都复位：`yitian` 存的是按上一个账号 L4 切过的数据，`yitianView` 存的是上一个账号的区间/组织筛选。

- [ ] **Step 3h: `frontend/src/version.ts`**

```ts
export const APP_VERSION = 'V3.0.0'
export const RELEASE_DATE = '2026-07-12'
```

（保持文件里既有的其它导出不变。）

- [ ] **Step 4: 全量验证**

```bash
bash verify.sh
```
Expected: 全绿（python 语法编译 + ruff + pytest 全套 + 前端 typecheck + vitest 全套 + build）

**真实数据冒烟**（必须做，不能只靠单测）：

```bash
mkdir -p input/yitian
cp yitian-analyze/工时.xlsx input/yitian/工时.xlsx
python preprocess_data.py          # 末尾应出现 [OK] 倚天工时域: 540 行 / 85 人 / 日历源 fallback
python server.py                   # 另开终端:cd frontend && npm run dev
```
浏览器（超管 admin 登录）逐项核对：
1. `/data` 「倚天工时域（input/yitian/）」显示 `工时.xlsx` 有时间、`holidays.csv` 为 `-`
2. `/yitian` 顶部出现**黄色降级告警**（没给 holidays.csv）；KPI 总工时非 0；分层汇总出现「交付实施三部 / 服务一部 / 服务二部」与 11 个 L4 组织
3. 周口径在「计算周 / 自然周」间切换，趋势页 X 轴随之变化，两种口径下**总工时一致**
4. `/yitian/analytics` 「完全未填」清单（样本周 85 人全填过，预期为空——这是对的）
5. `/yitian/compliance` 问题明细能按问题码筛选、能导出 xlsx
6. **与原工具报告对比**：`yitian-analyze/输出结果/工时检查报告_完整版.html` 的总工时 / 合规数 / 各 L4 工时应与本页一致；**唯一允许的差异是「服务方式」相关的问题数**（本次口径修正：改读列 + 生效日常量）。若出现其它差异，**停下来查清楚再继续**。
7. 建一个普通管理员账号（只授权 `yitian` + 某个 L4），登录后：`/yitian` 只见该 L4 的员工与问题；`curl` 直取 `/data/yitian_data.json` 应 403；不授权任何倚天页面的账号 `curl /api/yitian/data` 应 403。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/pageAccess.ts frontend/src/lib/pageAccess.test.ts frontend/src/nav.ts frontend/src/router/index.ts frontend/src/composables/useInputFiles.ts frontend/src/composables/useInputFiles.test.ts frontend/src/views/DataView.vue frontend/src/stores/auth.ts frontend/src/version.ts
git commit -m "feat(yitian): 装配5路由+侧栏分区+pageKey+上传白名单+登出复位+版本V3.0.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 交付与升级要点（供最终打包参考）

- **版本 V3.0.0**（X 级，用户已确认）
- **非纯前端**：新增 `yitian_calendar.py` / `yitian_rules.py` / `yitian_check.py` / `yitian.py`；改 `config.py` / `projects.py` / `schema.py` / `preprocess_data.py` / `server.py` / `data_scope.py`
- **升级动作**：换 `frontend/dist` → 覆盖后端 `*.py` → **重启后端** → 超管在 `/data` 上传 `工时.xlsx`（`holidays.csv` 可选）→ **点一次「更新数据」** → 超管给需要的账号授权 5 个新 pageKey
- **不需要**：新依赖（openpyxl/pydantic 已在）、数据库变更、`analysis_data.json` 重算口径变化（倚天域与主域完全解耦）
- `yitian-analyze/` 目录本期**保留**（上线后作口径比对基准），核对无误后再单独清理
