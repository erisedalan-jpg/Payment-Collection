# 倚天工时域 修复 + 数据累加 实施计划（V3.0.0 未发布，直接并入）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 修掉用户目验提出的 9 项问题，其中 #8（跨周数据累加）是新能力：倚天每周导出一份当周工时，要能累积成长期数据集做趋势分析。

**Architecture:** 新增服务端累积库 `data/yitian_store.json`（按 `工时ID` upsert，重复导入覆盖更新）。管线从「读 xlsx 直接建 JSON」改为「读 xlsx → upsert 进累积库 → 从累积库建 JSON」。前端补 `/data` 导入入口与累积管理，修排版与表格。

**Tech Stack:** Python 标准库 + openpyxl + pydantic（**禁 pandas**）；Vue3 + Vite + TS + Pinia + Element Plus 2.9 + ECharts。

**版本：** V3.0.0 尚未打包发布，本批直接并入 V3.0.0，**不升版本号**。

## 用户 9 项诉求 → 任务映射

| # | 诉求 | 任务 |
|---|---|---|
| 8 | 数据累加（每周一份当周数据 → 长期分析） | T1 / T2 / T3 |
| 5 | /data 没有倚天导入入口 | T4 |
| 6 | holidays.csv 支持导入 + 给出基础格式 | T4 |
| 9 | /data 两个新卡片贴边 | T4 |
| 1 | 5 页工具条：日期+L4 同一行、缩小、不贴边 | T5 |
| 7 | 5 页整体贴边、卡片拥挤 | T5 |
| 2 | /yitian 分层汇总：去括号、仅 L4、加固定汇总行、删层级列 | T6 |
| 4 | /yitian/customer TOP1000：去括号、仅 L4、加固定汇总行、去掉「未分配L4」行 | T6 |
| 3 | /yitian 工时类型占比新增柱状图 | T7 |

## Global Constraints

- 后端**只用 Python 标准库 + openpyxl + pydantic，禁止 pandas**。
- 注释与文案一律**简体中文**，**禁止 emoji**。
- 前端**禁止手写散值**：颜色/间距/字号/圆角/阴影一律用 `frontend/src/styles/theme.css` 令牌。**写错的令牌会被浏览器静默丢弃、肉眼看不出来**（V2.8.0 栽过）。
- 数字列必须挂 `.u-num`（DataTable 列配置写 `num: true`）。
- **Element Plus 2.9**：`el-radio-button` / `el-checkbox` 用 `value=`，不用废弃的 `label=` 绑值。
- **汇总行的比率列必须按 Σ分子 ÷ Σ分母 重算，绝不能把百分比相加**（V2.6.11 教训）。
- `_SUPER_ONLY_PATHS` **按 path 匹配、不分 method**：GET/POST 共用同一 path 的端点不能入闸；**POST-only 的 path 可以入闸**。
- 写路径基于 `BASE_DIR`。
- 提交信息结尾必须带：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## 关键设计：累积库（用户已拍板）

- **去重键 = `工时ID`**（实测 540/540 唯一、零空值；`ID` 列与 `工时ID` 列取值完全相同）。
- **重复导入同一批 → 按 `工时ID` 覆盖更新**（员工事后补填/修正了工作成果，重导一遍即可修正历史；重复导同一文件不会变双份）。
- **回退两条都要**：`/data` 给「清空倚天累积数据」按钮 + 「按日期区间删除」。并在 `/data` 展示累积状态（已累积多少行、覆盖哪段日期），否则管理员完全不知道库里有什么。
- 累积库 `data/yitian_store.json` 是**服务端私有**（含工作成果全文，供规则变更后重新判定），**绝不下发前端**；下发的仍是 `data/yitian_data.json`（隐私裁列 + 仅问题行带摘要）。

---

### Task 1: `yitian_store.py` — 累积库

**Files:**
- Create: `yitian_store.py`
- Test: `tests/test_yitian_store.py`

**Interfaces:**
- Produces：
  - `empty_store() -> dict` → `{"version": 1, "rows": []}`
  - `load_store(path) -> dict`（缺失/损坏 → `empty_store()`）
  - `save_store(path, store) -> None`（原子写）
  - `upsert_rows(store, rows) -> tuple[int, int]` → `(新增数, 更新数)`；按 `row["wid"]` 去重；无 `wid` 的行跳过
  - `store_stats(store) -> dict` → `{"rows": n, "start": "YYYY-MM-DD"|None, "end": ...|None}`
  - `delete_range(store, start, end) -> int` → 删除 `date ∈ [start, end]` 的行，返回删除数
  - `clear_store(path) -> None`

- [ ] **Step 1: 写失败测试**

`tests/test_yitian_store.py`：

```python
# -*- coding: utf-8 -*-
"""yitian_store.py:倚天工时累积库(按工时ID upsert)。"""
import json

import yitian_store as S


def _row(wid, date="2026-04-17", content="甲"):
    return {"wid": wid, "date": date, "emp_id": "A1", "content": content, "hours": 8.0}


class TestEmptyAndLoad:
    def test_empty_shape(self):
        assert S.empty_store() == {"version": 1, "rows": []}

    def test_missing_file(self, tmp_path):
        assert S.load_store(str(tmp_path / "nope.json")) == S.empty_store()

    def test_corrupt_file(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{坏", encoding="utf-8")
        assert S.load_store(str(p)) == S.empty_store()


class TestUpsert:
    def test_insert_new(self):
        st = S.empty_store()
        added, updated = S.upsert_rows(st, [_row("1"), _row("2")])
        assert (added, updated) == (2, 0)
        assert len(st["rows"]) == 2

    def test_reimport_same_file_does_not_duplicate(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1"), _row("2")])
        added, updated = S.upsert_rows(st, [_row("1"), _row("2")])
        assert (added, updated) == (0, 2)
        assert len(st["rows"]) == 2          # 不变成双份

    def test_update_overwrites_content(self):
        # 员工事后补填了工作成果 → 重导一遍必须能修正历史
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", content="旧")])
        S.upsert_rows(st, [_row("1", content="新")])
        assert st["rows"][0]["content"] == "新"

    def test_accumulates_across_weeks(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", date="2026-04-17")])
        added, _ = S.upsert_rows(st, [_row("2", date="2026-04-24")])
        assert added == 1
        assert {r["date"] for r in st["rows"]} == {"2026-04-17", "2026-04-24"}

    def test_skips_rows_without_wid(self):
        st = S.empty_store()
        added, updated = S.upsert_rows(st, [{"date": "2026-04-17"}, _row("1")])
        assert (added, updated) == (1, 0)


class TestStats:
    def test_empty(self):
        assert S.store_stats(S.empty_store()) == {"rows": 0, "start": None, "end": None}

    def test_range(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", date="2026-04-24"), _row("2", date="2026-01-05")])
        assert S.store_stats(st) == {"rows": 2, "start": "2026-01-05", "end": "2026-04-24"}


class TestDeleteRange:
    def test_deletes_inclusive(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", date="2026-04-17"), _row("2", date="2026-04-24"),
                           _row("3", date="2026-05-01")])
        n = S.delete_range(st, "2026-04-17", "2026-04-24")
        assert n == 2
        assert [r["wid"] for r in st["rows"]] == ["3"]

    def test_no_match(self):
        st = S.empty_store()
        S.upsert_rows(st, [_row("1", date="2026-04-17")])
        assert S.delete_range(st, "2026-06-01", "2026-06-30") == 0


class TestSaveClear:
    def test_roundtrip(self, tmp_path):
        p = str(tmp_path / "s.json")
        st = S.empty_store()
        S.upsert_rows(st, [_row("1")])
        S.save_store(p, st)
        assert S.load_store(p)["rows"][0]["wid"] == "1"
        with open(p, encoding="utf-8") as f:
            assert json.load(f)["version"] == 1

    def test_clear(self, tmp_path):
        p = str(tmp_path / "s.json")
        S.save_store(p, S.empty_store())
        S.clear_store(p)
        assert S.load_store(p) == S.empty_store()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian_store.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'yitian_store'`

- [ ] **Step 3: 实现 `yitian_store.py`**

```python
# yitian_store.py
"""倚天工时累积库:每周导出一份"当周工时" → 按工时ID upsert 累积成长期数据集。

为什么要它:倚天导出是当周快照,一次只有一周的行。要做长期趋势/累计分析,必须把历次导入攒起来。
去重键 = 工时ID(实测 540/540 唯一、零空值)。重复导入同一批 → 覆盖更新
(员工事后补填/修正了工作成果,重导一遍即可修正历史;重复导同一文件也不会变双份)。

本库是**服务端私有**(含工作成果全文,供规则变更后重新判定),绝不下发前端;
下发给前端的仍是 data/yitian_data.json(隐私裁列 + 仅问题行带摘要)。
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple

STORE_VERSION = 1


def empty_store() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "rows": []}


def load_store(path: str) -> Dict[str, Any]:
    """读累积库;缺失/损坏/结构不对 → 空库(降级不阻断)。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return empty_store()
    if not isinstance(data, dict) or not isinstance(data.get("rows"), list):
        return empty_store()
    return {"version": data.get("version", STORE_VERSION), "rows": data["rows"]}


def save_store(path: str, store: Dict[str, Any]) -> None:
    """原子写(先写 .tmp 再 replace),避免并发/崩溃留半截坏文件。"""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def upsert_rows(store: Dict[str, Any], rows: List[dict]) -> Tuple[int, int]:
    """按 wid(工时ID)upsert 进 store(就地改)。返回 (新增数, 更新数)。
    无 wid 的行跳过(没有去重键就无法保证不重复累积)。"""
    index: Dict[str, int] = {}
    for i, r in enumerate(store["rows"]):
        wid = str(r.get("wid") or "")
        if wid:
            index[wid] = i

    added = 0
    updated = 0
    for r in rows:
        wid = str(r.get("wid") or "").strip()
        if not wid:
            continue
        if wid in index:
            store["rows"][index[wid]] = r
            updated += 1
        else:
            index[wid] = len(store["rows"])
            store["rows"].append(r)
            added += 1
    return added, updated


def store_stats(store: Dict[str, Any]) -> Dict[str, Any]:
    """累积状态:行数 + 覆盖的日期区间(供 /data 展示,否则管理员不知道库里有什么)。"""
    dates = sorted(str(r.get("date") or "") for r in store["rows"] if r.get("date"))
    return {
        "rows": len(store["rows"]),
        "start": dates[0] if dates else None,
        "end": dates[-1] if dates else None,
    }


def delete_range(store: Dict[str, Any], start: str, end: str) -> int:
    """删除 date ∈ [start, end] 闭区间的行(就地改)。返回删除数。"""
    before = len(store["rows"])
    store["rows"] = [r for r in store["rows"]
                     if not (start <= str(r.get("date") or "") <= end)]
    return before - len(store["rows"])


def clear_store(path: str) -> None:
    """清空累积库(误导入的回退手段之一)。"""
    save_store(path, empty_store())
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_yitian_store.py -q && python -m ruff check yitian_store.py`
Expected: 全部 passed；ruff 无告警

- [ ] **Step 5: 提交**

```bash
git add yitian_store.py tests/test_yitian_store.py
git commit -m "feat(yitian): 工时累积库(按工时ID upsert,重复导入覆盖更新)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 管线改从累积库构建（`yitian.py` + `preprocess_data.py`）

**Files:**
- Modify: `yitian.py`（`COL_WID` + `REQUIRED_COLS` + `ingest()` + `build_yitian_data()` 改读累积库）
- Modify: `preprocess_data.py`（先 ingest 再 build）
- Modify: `.gitignore`（+ `data/yitian_store.json`）
- Test: `tests/test_yitian.py`（既有用例要改：现在数据来自累积库）

**Interfaces:**
- Consumes: `yitian_store`（Task 1）
- Produces：
  - `yitian.STORE_FILE_NAME = "yitian_store.json"`
  - `yitian.store_path(base_dir) -> str`
  - `yitian.ingest(base_dir) -> dict | None` → `{"added": n, "updated": n, "total": n}`；`input/yitian/工时.xlsx` 不存在 → `None`（不动累积库）
  - `yitian.build_yitian_data(base_dir) -> dict | None` → **从累积库构建**；累积库为空 → `None`
  - `meta` 新增 `storeStart` / `storeEnd`（累积库覆盖区间，与 `periodStart/periodEnd` 一致，但语义是"累积了多久"）

**关键**：`read_timesheet` 要多取一列 `工时ID` 落成 `wid`（去重键）。`REQUIRED_COLS` 要加上它——缺列校验会挡住没有该列的表。

- [ ] **Step 1: 写失败测试**

在 `tests/test_yitian.py` 追加（并改写既有用例，见 Step 3d）：

```python
class TestIngestAndAccumulate:
    def test_ingest_missing_file_returns_none(self, tmp_path):
        (tmp_path / "input" / "yitian").mkdir(parents=True)
        assert Y.ingest(str(tmp_path)) is None

    def test_ingest_then_build(self, tmp_path):
        base = _make_input(tmp_path, [_ts_row()])
        r = Y.ingest(base)
        assert r == {"added": 1, "updated": 1 - 1, "total": 1}
        data = Y.build_yitian_data(base)
        assert data["meta"]["rows"] == 1

    def test_second_week_accumulates(self, tmp_path):
        # 第一周导入
        base = _make_input(tmp_path, [_ts_row(ID="1", 工时ID="1", 工作日="2026-04-17")])
        Y.ingest(base)
        # 第二周:换一份只含当周数据的 xlsx,再导一次
        _write_timesheet(base, [_ts_row(ID="2", 工时ID="2", 工作日="2026-04-24")])
        r = Y.ingest(base)
        assert r["added"] == 1
        data = Y.build_yitian_data(base)
        assert data["meta"]["rows"] == 2                    # 两周累积
        assert data["meta"]["periodStart"] == "2026-04-17"
        assert data["meta"]["periodEnd"] == "2026-04-24"

    def test_reimport_same_week_updates_not_duplicates(self, tmp_path):
        base = _make_input(tmp_path, [_ts_row(ID="1", 工时ID="1", 工作成果="旧文本" + GOOD)])
        Y.ingest(base)
        _write_timesheet(base, [_ts_row(ID="1", 工时ID="1", 工作成果="新文本" + GOOD)])
        r = Y.ingest(base)
        assert r == {"added": 0, "updated": 1, "total": 1}
        data = Y.build_yitian_data(base)
        assert data["meta"]["rows"] == 1                    # 不变双份

    def test_build_on_empty_store_returns_none(self, tmp_path):
        (tmp_path / "input" / "yitian").mkdir(parents=True)
        (tmp_path / "data").mkdir()
        assert Y.build_yitian_data(str(tmp_path)) is None

    def test_missing_wid_column_rejected(self, tmp_path):
        # 缺 工时ID 列 → 缺列校验拦下,返回 None(不阻断主管线)
        base = _make_input(tmp_path, [_ts_row()], drop_cols=["工时ID"])
        assert Y.ingest(base) is None
```

`tests/test_yitian.py` 的辅助函数要相应扩展（`_make_input` 支持 `drop_cols`，并新增 `_write_timesheet` 只重写工时表；`TS_HEADERS` 加 `工时ID`，`_ts_row` 默认 `工时ID` 与 `ID` 同值）。既有用例里凡直接调 `Y.build_yitian_data(base)` 的，都要先 `Y.ingest(base)`（数据现在必须先进累积库）。

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_yitian.py -q`
Expected: FAIL — `AttributeError: module 'yitian' has no attribute 'ingest'`

- [ ] **Step 3a: `yitian.py` 加列与常量**

```python
import yitian_store as STORE

COL_WID = "工时ID"          # 累积库去重键(实测 540/540 唯一、零空值)

STORE_FILE_NAME = "yitian_store.json"


def store_path(base_dir: str) -> str:
    return os.path.join(base_dir, "data", STORE_FILE_NAME)
```

`REQUIRED_COLS` 加入 `COL_WID`。`read_timesheet` 的每行 dict 加：

```python
            "wid": str(r.get(COL_WID) or "").strip(),
```

- [ ] **Step 3b: `yitian.py` 新增 `ingest()`**

```python
def ingest(base_dir: str) -> Optional[dict]:
    """把 input/yitian/工时.xlsx 的行 upsert 进累积库。
    文件不存在 → None(不动累积库);缺列 → 打 [ERROR] 并 None(不阻断主管线)。
    返回 {"added": 新增, "updated": 更新, "total": 库内总行数}。"""
    input_dir = os.path.join(base_dir, "input")
    ts_path = os.path.join(input_dir, config.YITIAN_DIRNAME, config.YITIAN_TIMESHEET_FILE)
    if not os.path.isfile(ts_path):
        return None

    missing = _missing_columns(ts_path)      # 既有的缺列校验(I-3 加的),复用
    if missing:
        print("[ERROR] 倚天工时表缺列: %s,跳过导入" % "、".join(missing))
        return None

    rows = read_timesheet(ts_path)
    path = store_path(base_dir)
    store = STORE.load_store(path)
    added, updated = STORE.upsert_rows(store, rows)
    STORE.save_store(path, store)
    return {"added": added, "updated": updated, "total": len(store["rows"])}
```

> **实现注意**：`_missing_columns` 是 I-3 修复时加的缺列校验（`REQUIRED_COLS` 存在性检查）。**先打开 `yitian.py` 看它现在的真实函数名与签名再调用**，不要另造。若它当前是内联在 `build_yitian_data` 里的，就抽成一个函数供两处复用。

- [ ] **Step 3c: `yitian.py` 的 `build_yitian_data()` 改读累积库**

把「读 xlsx → rows」换成「读累积库 → rows」，其余（花名册 join、工作日、合规判定、码表压缩）**一字不动**：

```python
def build_yitian_data(base_dir: str) -> Optional[dict]:
    """从**累积库**构建下发数据;累积库为空 → None(调用方跳过,不阻断主管线)。"""
    input_dir = os.path.join(base_dir, "input")
    store = STORE.load_store(store_path(base_dir))
    rows = store["rows"]
    if not rows:
        return None
    # ↓ 以下与原实现完全一致:roster join / top1000 / holidays / days / peers / entries / issues
    roster = read_org_roster(os.path.join(input_dir, config.ORG_FILE))
    ...
```

`meta` 追加两个字段（累积状态，供 /data 展示）：

```python
    st = STORE.store_stats(store)
    ...
        "meta": {
            ...
            "storeRows": st["rows"],
            "storeStart": st["start"],
            "storeEnd": st["end"],
        },
```

同步在 `schema.py` 的 `YitianMeta` 加这三个字段（**必填、无默认值**——生产者恒定输出；`storeStart`/`storeEnd` 用 `Optional[str]` 但不给默认），然后 `python schema.py && cd frontend && npm run gen:types`。

- [ ] **Step 3d: `preprocess_data.py` 先 ingest 再 build**

把倚天段改成：

```python
    # === 11. 倚天工时域:先把当周导出 upsert 进累积库,再从累积库构建 ===
    try:
        ing = yitian_mod.ingest(BASE_DIR)
        if ing is None:
            print("[INFO] 未提供 input/yitian/工时.xlsx,本次不导入倚天工时(累积库保持原样)")
        else:
            print("[OK] 倚天工时导入: 新增 %d 行 / 更新 %d 行 / 累积库共 %d 行"
                  % (ing["added"], ing["updated"], ing["total"]))
        ydata = yitian_mod.build_yitian_data(BASE_DIR)
        if ydata is None:
            print("[INFO] 倚天累积库为空,跳过倚天工时域")
        else:
            ypath = schema.validate_and_write_yitian_json(ydata, OUTPUT_DIR)
            ymeta = ydata["meta"]
            print("[OK] 倚天工时域: %d 行 / %d 人 / %s ~ %s / 日历源 %s → %s"
                  % (ymeta["rows"], ymeta["employees"], ymeta["periodStart"],
                     ymeta["periodEnd"], ymeta["calendarSource"], ypath))
            if ymeta["droppedRows"]:
                print("  [WARN] 倚天工时 %d 行因工号不在组织架构花名册被丢弃" % ymeta["droppedRows"])
            if ymeta["calendarSource"] == "fallback":
                print("  [WARN] 未提供 input/yitian/holidays.csv,工作日退化为纯周一~周五")
    except Exception as e:
        print(f"  [WARN] 倚天工时域生成失败,本次跳过: {e}")
```

- [ ] **Step 3e: `.gitignore` 追加**

```
data/yitian_store.json
```

- [ ] **Step 4: 验证**

```bash
python -m pytest tests/test_yitian.py tests/test_yitian_store.py -q
python -m pytest -q                     # 全仓零回归
python -m ruff check yitian.py yitian_store.py preprocess_data.py schema.py
cd frontend && npm run gen:types && npx vue-tsc --noEmit
```

**真实数据验证（必须做）**：`input/yitian/工时.xlsx` 已就位。

```bash
rm -f data/yitian_store.json           # 从零开始
python preprocess_data.py              # 第一次:应打印 新增 540 行 / 更新 0 行 / 累积库共 540 行
python preprocess_data.py              # 第二次(同一文件):应打印 新增 0 行 / 更新 540 行 / 累积库共 540 行
python -X utf8 -c "
import json
d = json.load(open('data/yitian_data.json', encoding='utf-8'))
m = d['meta']
print('rows', m['rows'], '| 累积库', m['storeRows'], '|', m['storeStart'], '~', m['storeEnd'])
t = d['dims']['types']; EX = {'管理类','业务类','假期类'}
inc = [e for e in d['entries'] if t[e['t']] not in EX]; ok = [e for e in inc if e['ok'] <= 1]
print('合规率口径:', len(inc), len(ok), len(inc)-len(ok), f'{len(ok)/len(inc)*100:.1f}%')
"
```
Expected：第二次导入是 **0 新增 / 540 更新**（不变双份），且合规率仍是 **462 / 442 / 20 / 95.7%**（累积改造不得改变口径）。**对不上就停下来查。**

- [ ] **Step 5: 提交**

```bash
git add yitian.py yitian_store.py preprocess_data.py schema.py frontend/src/types/yitian.ts .gitignore tests/test_yitian.py
git commit -m "feat(yitian): 管线改从累积库构建(每周导出 upsert 累加,支持长期分析)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 累积库的服务端管理（`server.py`）

**Files:**
- Modify: `server.py`（3 个端点 + clear-data 一并清累积库）
- Modify: `audit.py`（注册 2 个写动作）
- Test: `tests/test_server_yitian.py`（追加）

**Interfaces:**
- `GET /api/yitian/store` → `{"success": true, "stats": {"rows": n, "start": ..., "end": ...}}`（登录 + 任一倚天 pageKey）
- `POST /api/yitian/store/clear` → 清空累积库（**超管专属**）
- `POST /api/yitian/store/delete-range` `{start, end}` → 删区间（**超管专属**），返回 `{"deleted": n, "stats": {...}}`

**铁律：**
- `GET /api/yitian/store` 是**独立 path**，**不能**入 `_SUPER_ONLY_PATHS`。
- `/api/yitian/store/clear` 与 `/api/yitian/store/delete-range` 是 **POST-only 的独立 path**，**可以**入 `_SUPER_ONLY_PATHS`（也仍要在 handler 里 `_require_super()` 兜底）。
- **删/清累积库后必须让 `data/yitian_data.json` 与之保持一致**——否则页面还在展示已被删掉的数据。做法：这两个写端点在改完累积库后，**就地重建** `yitian_data.json`（调 `yitian.build_yitian_data` + `schema.validate_and_write_yitian_json`；返回 None 则删掉 `yitian_data.json`），并清 `_yitian_cache`。
- `handle_clear_data`（既有的"清空数据"）**也要一并清累积库**（员工级工时不能清了业务数据还留在盘上）。**但不要动 `data/yitian_settings.json`**（那是配置不是数据）。

- [ ] **Step 1: 写失败测试**

`tests/test_server_yitian.py` 追加：

```python
class TestYitianStoreEndpoints:
    def test_get_store_not_in_super_only(self):
        # GET 是全体授权账号要用的(页面要显示累积状态);该集合按 path 匹配不分 method
        assert '/api/yitian/store' not in S._SUPER_ONLY_PATHS

    def test_write_paths_are_super_only(self):
        # 这两个是 POST-only 的独立 path,入闸是安全且必要的
        assert '/api/yitian/store/clear' in S._SUPER_ONLY_PATHS
        assert '/api/yitian/store/delete-range' in S._SUPER_ONLY_PATHS

    def test_store_file_path(self):
        assert S.YITIAN_STORE_FILE.endswith('yitian_store.json')
        assert S.YITIAN_STORE_FILE != S.YITIAN_SETTINGS_FILE


class TestClearDataAlsoClearsStore:
    def test_clear_data_removes_store_but_keeps_settings(self, tmp_path, monkeypatch):
        import yitian_store, yitian_settings
        store_p = str(tmp_path / 'yitian_store.json')
        set_p = str(tmp_path / 'yitian_settings.json')
        st = yitian_store.empty_store()
        yitian_store.upsert_rows(st, [{"wid": "1", "date": "2026-04-17"}])
        yitian_store.save_store(store_p, st)
        yitian_settings.save_settings(set_p, {"excludedTypes": ["管理类"]})

        monkeypatch.setattr(S, 'YITIAN_STORE_FILE', store_p)
        monkeypatch.setattr(S, 'YITIAN_SETTINGS_FILE', set_p)
        S._clear_yitian_store()          # 清空数据流程里调用的那个函数

        assert yitian_store.load_store(store_p)["rows"] == []      # 累积数据清了
        assert yitian_settings.load_settings(set_p)["excludedTypes"] == ["管理类"]   # 配置留着
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_yitian.py -q`
Expected: FAIL — `AttributeError: module 'server' has no attribute 'YITIAN_STORE_FILE'`

- [ ] **Step 3: 实现**

`server.py` 常量区（`YITIAN_SETTINGS_FILE` 附近）：

```python
YITIAN_STORE_FILE = os.path.join(BASE_DIR, 'data', 'yitian_store.json')
_yitian_store_lock = threading.RLock()
```

顶部 import 区加 `import yitian_store`、`import yitian`（若尚未 import）。

三个 handler + 一个共享的重建函数：

```python
    def _rebuild_yitian_data(self):
        """累积库变更后就地重建 data/yitian_data.json,并清缓存 ——
        否则页面还在展示已被删掉的数据。累积库空 → 删掉下发文件。"""
        data = yitian.build_yitian_data(BASE_DIR)
        if data is None:
            try:
                os.remove(YITIAN_DATA_FILE)
            except OSError:
                pass
        else:
            schema.validate_and_write_yitian_json(data, os.path.join(BASE_DIR, 'data'))
        with _yitian_cache_lock:
            _yitian_cache['mtime'] = None
            _yitian_cache['data'] = None

    def handle_yitian_store_get(self):
        """GET /api/yitian/store - 累积状态(行数/覆盖区间)。登录 + 任一倚天页面授权。"""
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
        stats = yitian_store.store_stats(yitian_store.load_store(YITIAN_STORE_FILE))
        self._send_json(200, {"success": True, "stats": stats})

    def handle_yitian_store_clear(self):
        """POST /api/yitian/store/clear - 清空累积库(误导入的回退手段)。超管专属。"""
        if self._require_super() is None:
            return
        with _yitian_store_lock:
            yitian_store.clear_store(YITIAN_STORE_FILE)
            self._rebuild_yitian_data()
        self._audit_set(target='倚天工时累积库', detail='清空全部累积数据')
        self._send_json(200, {"success": True,
                              "stats": yitian_store.store_stats(yitian_store.empty_store())})

    def handle_yitian_store_delete_range(self):
        """POST /api/yitian/store/delete-range {start,end} - 按日期区间删累积数据。超管专属。"""
        if self._require_super() is None:
            return
        body = self._read_json_body()
        if not isinstance(body, dict):
            self._send_json(400, _error_payload(ERR_VALIDATION, "请求体不是合法 JSON"))
            return
        start = str(body.get('start') or '').strip()
        end = str(body.get('end') or '').strip()
        if not start or not end or start > end:
            self._send_json(400, _error_payload(ERR_VALIDATION, "起止日期非法"))
            return
        with _yitian_store_lock:
            store = yitian_store.load_store(YITIAN_STORE_FILE)
            n = yitian_store.delete_range(store, start, end)
            yitian_store.save_store(YITIAN_STORE_FILE, store)
            self._rebuild_yitian_data()
            stats = yitian_store.store_stats(store)
        self._audit_set(target='倚天工时累积库', detail='删除区间 %s ~ %s 共 %d 行' % (start, end, n))
        self._send_json(200, {"success": True, "deleted": n, "stats": stats})
```

清空数据流程：加一个可被测试 monkeypatch 的小函数，并在既有 `handle_clear_data` 里调用它：

```python
def _clear_yitian_store():
    """清空数据时一并清倚天累积库(员工级工时不能清了业务数据还留在盘上)。
    **不动 data/yitian_settings.json** —— 那是配置不是数据。"""
    try:
        yitian_store.clear_store(YITIAN_STORE_FILE)
    except OSError:
        pass
    try:
        os.remove(YITIAN_DATA_FILE)
    except OSError:
        pass
```

路由：`_dispatch_get` 加 `/api/yitian/store`；`_dispatch_post` 加 `/api/yitian/store/clear` 与 `/api/yitian/store/delete-range`。
`_SUPER_ONLY_PATHS` 加入后两个（**不要加 `/api/yitian/store`**）。

`audit.py` 的 `_ACTION_MAP` 追加：

```python
    ('POST', '/api/yitian/store/clear'): ('yitian.store.clear', '清空倚天工时累积库'),
    ('POST', '/api/yitian/store/delete-range'): ('yitian.store.delete', '删除倚天工时累积区间'),
```

- [ ] **Step 4: 验证**

```bash
python -m pytest tests/test_server_yitian.py -q
python -m pytest -q
python -m ruff check server.py audit.py
```

- [ ] **Step 5: 提交**

```bash
git add server.py audit.py tests/test_server_yitian.py
git commit -m "feat(yitian): 累积库服务端管理(状态/清空/按区间删,写后就地重建下发数据)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `/data` 倚天导入区 + 累积管理 + 两卡贴边（#5 #6 #9）

**Files:**
- Modify: `frontend/src/views/DataView.vue`（倚天上传按钮 + holidays 格式说明与模板下载 + 嵌入累积卡）
- Create: `frontend/src/components/YitianStoreCard.vue`（累积状态 + 清空 + 按区间删）
- Modify: `frontend/src/lib/yitianApi.ts`（+3 个函数）
- Modify: `frontend/src/components/PortalConfigCard.vue`、`frontend/src/components/YitianScopeCard.vue`（贴边修复）
- Test: `frontend/src/components/YitianStoreCard.test.ts`

**Interfaces:**
- `getYitianStore(): Promise<YitianStoreStats>`（`{rows, start, end}`）
- `clearYitianStore(): Promise<YitianStoreStats>`
- `deleteYitianStoreRange(start, end): Promise<{deleted: number; stats: YitianStoreStats}>`

**#5 的根因**：`/data` 的倚天区**只渲染了文件状态、没有上传输入框与按钮**（文件其实能从上面那个「上传项目域文件」按钮传进去，因为白名单已含，但没人猜得到）。给它自己的上传入口。

**#6**：`holidays.csv` 必须给出**基础格式**，否则管理员导进来识别不了。做法：区块内直接写明格式 + 一个「下载模板」按钮（前端生成 Blob，不需要后端）。

**#9 的根因**：`PortalConfigCard` / `YitianScopeCard` 根元素没有内边距，嵌进 `el-collapse-item` 后内容完全贴边。**各自补 `padding`（组件自足，不要依赖宿主的 scoped 类——V2.10.0 的教训）。**

- [ ] **Step 1: 写失败测试**

`frontend/src/components/YitianStoreCard.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

const { getSpy, clearSpy, delSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  clearSpy: vi.fn(),
  delSpy: vi.fn(),
}))
vi.mock('@/lib/yitianApi', () => ({
  getYitianStore: getSpy,
  clearYitianStore: clearSpy,
  deleteYitianStoreRange: delSpy,
}))

import YitianStoreCard from './YitianStoreCard.vue'

describe('YitianStoreCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getSpy.mockReset(); clearSpy.mockReset(); delSpy.mockReset()
    getSpy.mockResolvedValue({ rows: 540, start: '2026-04-17', end: '2026-04-23' })
    clearSpy.mockResolvedValue({ rows: 0, start: null, end: null })
    delSpy.mockResolvedValue({ deleted: 100, stats: { rows: 440, start: '2026-04-18', end: '2026-04-23' } })
  })

  it('挂载即显示累积状态', async () => {
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('540')
    expect(w.text()).toContain('2026-04-17')
  })

  it('空库时给出提示', async () => {
    getSpy.mockResolvedValue({ rows: 0, start: null, end: null })
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('尚未导入')
  })

  it('清空后刷新状态', async () => {
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    await (w.vm as any).onClear()
    expect(clearSpy).toHaveBeenCalled()
    expect((w.vm as any).stats.rows).toBe(0)
  })

  it('按区间删除', async () => {
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    ;(w.vm as any).range = ['2026-04-17', '2026-04-17']
    await (w.vm as any).onDeleteRange()
    expect(delSpy).toHaveBeenCalledWith('2026-04-17', '2026-04-17')
    expect((w.vm as any).stats.rows).toBe(440)
  })

  it('未选区间不发请求', async () => {
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    ;(w.vm as any).range = null
    await (w.vm as any).onDeleteRange()
    expect(delSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/YitianStoreCard.test.ts`
Expected: FAIL — 找不到组件

- [ ] **Step 3a: `frontend/src/lib/yitianApi.ts` 追加**

```ts
export interface YitianStoreStats {
  rows: number
  start: string | null
  end: string | null
}

/** 累积库状态(已累积多少行、覆盖哪段日期)。 */
export async function getYitianStore(): Promise<YitianStoreStats> {
  const r = await api.get<{ success: boolean; stats: YitianStoreStats }>('/api/yitian/store')
  return r.stats
}

/** 清空累积库(超管)。误导入的回退手段。 */
export async function clearYitianStore(): Promise<YitianStoreStats> {
  const r = await api.post<{ success: boolean; stats: YitianStoreStats }>('/api/yitian/store/clear', {})
  return r.stats
}

/** 按日期区间删除累积数据(超管)。 */
export async function deleteYitianStoreRange(
  start: string, end: string,
): Promise<{ deleted: number; stats: YitianStoreStats }> {
  const r = await api.post<{ success: boolean; deleted: number; stats: YitianStoreStats }>(
    '/api/yitian/store/delete-range', { start, end })
  return { deleted: r.deleted, stats: r.stats }
}
```

- [ ] **Step 3b: `frontend/src/components/YitianStoreCard.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getYitianStore, clearYitianStore, deleteYitianStoreRange,
         type YitianStoreStats } from '@/lib/yitianApi'

const stats = ref<YitianStoreStats>({ rows: 0, start: null, end: null })
const range = ref<[string, string] | null>(null)
const busy = ref(false)
const msg = ref('')
const err = ref(false)

async function refresh() {
  try {
    stats.value = await getYitianStore()
  } catch (e) {
    err.value = true
    msg.value = e instanceof Error ? e.message : '读取累积状态失败'
  }
}

onMounted(refresh)

async function onClear() {
  msg.value = ''; err.value = false
  busy.value = true
  try {
    stats.value = await clearYitianStore()
    msg.value = '累积库已清空，下次导入从零开始'
  } catch (e) {
    err.value = true
    msg.value = e instanceof Error ? e.message : '清空失败'
  } finally {
    busy.value = false
  }
}

async function onConfirmClear() {
  try {
    await ElMessageBox.confirm(
      '将删除全部已累积的倚天工时数据（不可撤销）。倚天合规检查范围等配置不受影响。',
      '清空倚天累积数据', { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' })
  } catch {
    return   // 用户取消
  }
  await onClear()
}

async function onDeleteRange() {
  msg.value = ''; err.value = false
  const r = range.value
  if (!r || !r[0] || !r[1]) {
    err.value = true
    msg.value = '请先选择要删除的日期区间'
    return
  }
  busy.value = true
  try {
    const res = await deleteYitianStoreRange(r[0], r[1])
    stats.value = res.stats
    msg.value = `已删除 ${res.deleted} 行（${r[0]} ~ ${r[1]}）`
  } catch (e) {
    err.value = true
    msg.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    busy.value = false
  }
}

defineExpose({ stats, range, onClear, onDeleteRange })
</script>

<template>
  <div class="ys-card">
    <p class="ys-hint">
      倚天每周导出的是<strong>当周</strong>工时。系统按<strong>工时ID</strong>累加：新行追加、
      已存在的行覆盖更新（员工事后补填/修正后重导一遍即可修正历史，重复导入同一份文件也不会变双份）。
    </p>

    <div class="ys-stat">
      <template v-if="stats.rows">
        已累积 <strong class="u-num">{{ stats.rows }}</strong> 行，
        覆盖 <strong class="u-num">{{ stats.start }}</strong> ~ <strong class="u-num">{{ stats.end }}</strong>
      </template>
      <template v-else>尚未导入任何倚天工时数据</template>
    </div>

    <div class="ys-row">
      <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" unlink-panels
        range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" size="default" />
      <el-button :loading="busy" @click="onDeleteRange">删除该区间</el-button>
      <el-button type="danger" plain :loading="busy" @click="onConfirmClear">清空全部累积数据</el-button>
    </div>

    <p v-if="msg" class="ys-msg" :class="{ 'ys-msg-err': err }">{{ msg }}</p>
  </div>
</template>

<style scoped>
.ys-card { display: flex; flex-direction: column; gap: var(--gap-stack); padding: var(--sp-3) var(--sp-4); }
.ys-hint { font-size: var(--fs-2); color: var(--sub); line-height: var(--lh-base); }
.ys-stat { font-size: var(--fs-2); color: var(--txt); }
.ys-row { display: flex; flex-wrap: wrap; gap: var(--gap-stack); align-items: center; }
.ys-msg { font-size: var(--fs-1); color: var(--ok-text); }
.ys-msg-err { color: var(--danger-text); }
</style>
```

- [ ] **Step 3c: `DataView.vue` 倚天导入区（#5 #6）**

倚天文件状态块下面，补上传入口与 holidays 格式说明：

```vue
          <div class="dv-row dv-actions">
            <input ref="yitianInput" type="file" accept=".xlsx,.csv" multiple class="dv-file" />
            <button class="dv-btn" @click="onUploadYitian">上传倚天文件</button>
            <button class="dv-btn" @click="onDownloadHolidayTemplate">下载 holidays.csv 模板</button>
            <span v-if="yitianUploadMsg" class="dv-hint">{{ yitianUploadMsg }}</span>
          </div>
          <div class="dv-hint dv-fmt">
            holidays.csv 格式（UTF-8，两列）：<code>日期,类型</code>；类型只有两种——
            <code>休</code>=法定假/调休放假（即使落在周一~周五），<code>班</code>=调休上班（即使落在周末）。
            未列出的日期按「周一~周五为工作日」处理。不提供该文件时全站按纯周一~周五近似，
            含节假日的周期饱和度会偏低。
          </div>
```

script：

```ts
const yitianInput = ref<HTMLInputElement | null>(null)
const yitianUploadMsg = ref('')

async function onUploadYitian() {
  const files = Array.from(yitianInput.value?.files || [])
  if (!files.length) return
  const ok = await inputsUpload(files)      // 复用既有 useInputFiles().upload,白名单已含倚天两文件
  yitianUploadMsg.value = `已上传 ${ok}/${files.length} 个倚天文件，请点[更新数据]生效`
  if (yitianInput.value) yitianInput.value.value = ''
  await refreshStatus()                      // 复用既有的文件状态刷新(若函数名不同,先 grep 真名)
}

/** holidays.csv 模板:前端生成 Blob 下载,不需要后端。 */
function onDownloadHolidayTemplate() {
  const lines = [
    '日期,类型',
    '2026-01-01,休',
    '2026-02-16,休',
    '2026-02-14,班',
  ]
  // BOM 让 Excel 打开不乱码
  const blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'holidays.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
```

并在 `/data` 的 `el-collapse` 里追加（仅超管）：

```vue
        <el-collapse-item v-if="auth.isSuper" name="yitian-store" title="倚天工时 · 累积数据管理">
          <YitianStoreCard />
        </el-collapse-item>
```

- [ ] **Step 3d: 两个新卡片贴边修复（#9）**

`PortalConfigCard.vue` 与 `YitianScopeCard.vue` 的根元素各补内边距（**组件自足，不依赖宿主 scoped 类**）：

```css
/* PortalConfigCard.vue 根类 */
.pc-card { padding: var(--sp-3) var(--sp-4); }
/* YitianScopeCard.vue 根类 */
.ys-card { padding: var(--sp-3) var(--sp-4); }
```

> **先打开这两个文件确认根元素的真实类名再改**，不要臆造类名。

- [ ] **Step 4: 验证**

```bash
cd frontend && npx vitest run src/components/YitianStoreCard.test.ts src/views/DataView.test.ts
cd frontend && npx vue-tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/YitianStoreCard.vue frontend/src/components/YitianStoreCard.test.ts frontend/src/lib/yitianApi.ts frontend/src/views/DataView.vue frontend/src/components/PortalConfigCard.vue frontend/src/components/YitianScopeCard.vue
git commit -m "feat(yitian): /data 倚天导入入口 + holidays 模板 + 累积数据管理;修两卡贴边

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 五页排版 + 工具条紧凑单行（#1 #7）

**Files:**
- Modify: `frontend/src/components/YitianToolbar.vue`
- Modify: `frontend/src/views/Yitian{Overview,Compliance,Analytics,Trend,Customer}View.vue`（各加页面内边距）
- Modify: `frontend/src/components/YitianToolbar.test.ts`（补断言）

**根因**：`layout/AppLayout.vue` 的 `.app-main` **自身没有内边距**——本仓每个页面自己给（如 `views/ProjectsView.vue` 的 `.projects-view { padding: var(--sp-4); }`）。5 个倚天页只写了 `gap`、没写 `padding`，所以全线贴边、卡片挤在窗口边缘。

**改法：**
1. 五个视图的 `.yt-page` 统一加 `padding: var(--sp-4);`（与 `.projects-view` 同款）。
2. `YitianToolbar`：日期区间 + 周口径 + L4 筛选**排成一行**并整体缩小——控件加 `size="small"`，L4 选择器收窄（`min-width: 180px; max-width: 240px`），行内 `gap` 用 `--gap-stack`，`flex-wrap: wrap` 保留（窄屏才换行）。工具条与下方内容的间距用 `--gap-section`。

```vue
      <el-date-picker v-model="rangeModel" type="daterange" value-format="YYYY-MM-DD" unlink-panels
        range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期"
        :disabled-date="disabledDate" :clearable="false" size="small" class="yt-date" />

      <el-radio-group v-model="view.weekMode" size="small">
        <el-radio-button value="calc">计算周</el-radio-button>
        <el-radio-button value="iso">自然周</el-radio-button>
      </el-radio-group>

      <el-select v-model="view.l4s" multiple collapse-tags collapse-tags-tooltip clearable
        placeholder="全部 L4 组织" size="small" class="yt-l4">
        <el-option v-for="o in l4Options" :key="o" :label="o" :value="o" />
      </el-select>
```

```css
.yt-row { display: flex; flex-wrap: wrap; gap: var(--gap-stack); align-items: center; }
.yt-date { width: 260px; }
.yt-l4 { min-width: 180px; max-width: 240px; }
.yt-hint { color: var(--mut); font-size: var(--fs-1); }
```

> 周口径按钮文案由「计算周(周五~周四)」「自然周(周一~周日)」缩短为「计算周」「自然周」（口径解释移到 `title` 属性，鼠标悬停可见），否则一行放不下。

- [ ] **Step 1: 写失败测试**

`YitianToolbar.test.ts` 追加：

```ts
  it('控件为 small 尺寸且排在同一行(不换行容器)', () => {
    const w = mountBar(DATA)
    expect(w.find('.yt-row').exists()).toBe(true)
    // 三个控件都在同一个 .yt-row 里
    const row = w.find('.yt-row')
    expect(row.findComponent({ name: 'ElDatePicker' }).exists()).toBe(true)
    expect(row.findComponent({ name: 'ElRadioGroup' }).exists()).toBe(true)
    expect(row.findComponent({ name: 'ElSelect' }).exists()).toBe(true)
  })
```

五个视图各补一条（以 `YitianOverviewView.test.ts` 为例，其余同款）：

```ts
  it('页面有内边距(不贴边)', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('.yt-page').exists()).toBe(true)
  })
```

> 注：vitest/jsdom 下拿不到真实 computed style（scoped CSS 不注入），所以断言只能锁住结构（`.yt-page` 存在）。**内边距是否真的生效，必须靠浏览器目验**——这一条写进任务报告，提醒最后人工确认。

- [ ] **Step 2: 跑测试确认失败**（新断言会红）

Run: `cd frontend && npx vitest run src/components/YitianToolbar.test.ts`

- [ ] **Step 3: 实现**（见上）

- [ ] **Step 4: 验证**

```bash
cd frontend && npx vitest run src/components/YitianToolbar.test.ts src/views/Yitian*.test.ts
cd frontend && npx vue-tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/YitianToolbar.vue frontend/src/components/YitianToolbar.test.ts frontend/src/views/YitianOverviewView.vue frontend/src/views/YitianComplianceView.vue frontend/src/views/YitianAnalyticsView.vue frontend/src/views/YitianTrendView.vue frontend/src/views/YitianCustomerView.vue frontend/src/views/Yitian*.test.ts
git commit -m "fix(yitian): 五页补页面内边距(app-main 自身无 padding) + 工具条紧凑单行

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 两张表改造 — 仅 L4 + 固定汇总行（#2 #4）

**Files:**
- Modify: `frontend/src/lib/yitian/metrics.ts`（+ `orgL4SummaryRow`）
- Modify: `frontend/src/lib/yitian/customer.ts`（+ `top1000TotalsRow`）
- Modify: `frontend/src/views/YitianOverviewView.vue`（分层汇总表）
- Modify: `frontend/src/views/YitianCustomerView.vue`（TOP1000 表）
- Modify: 对应 `.test.ts`

**#2 分层汇总**：标题「分层汇总（L3 → L3-1 → L4）」→ **「分层汇总」**（去括号）；表格**只展示 L4 层**；**删掉「层级」列**（只剩一层了，该列无用）；**加固定汇总行**（`el-table` 原生 `show-summary`，恒在表底、不随排序移动）。

**#4 TOP1000**：标题「TOP1000 大客户支持（仅项目类 / 售前类 / 售后类）」→ **「TOP1000 大客户支持」**（去括号；口径说明移到表格上方一行小字，不占标题）；**去掉「未分配L4」行**；**加固定汇总行**。

**汇总行铁律（V2.6.11 教训）**：比率列**必须按 Σ分子 ÷ Σ分母 重算**，绝不能把各行百分比相加或求平均。TOP1000 的「客户数」也**不能相加**（同一个客户可能被多个组服务）——必须全局去重重算。

- [ ] **Step 1: 写失败测试**

`metrics.test.ts` 追加：

```ts
describe('orgL4SummaryRow', () => {
  it('比率按 Σ实际 ÷ Σ基础 重算(不是把各行饱和度相加/平均)', () => {
    const rows = orgSummary(DATA, R[0], R[1]).filter((r) => r.level === 'l4')
    const t = orgL4SummaryRow(rows)
    expect(t.people).toBe(3)
    expect(t.hours).toBe(28)
    expect(t.base).toBe(48)          // 3 人 × 16h
    expect(t.sat).toBeCloseTo(28 / 48)
  })
  it('基础工时为 0 时比率为 null', () => {
    expect(orgL4SummaryRow([]).sat).toBeNull()
  })
})
```

`customer.test.ts` 追加：

```ts
describe('top1000TotalsRow', () => {
  it('占比按 ΣTOP工时 ÷ Σ总工时 重算,客户数全局去重(不相加)', () => {
    const rows = top1000ByL4(DATA, S, E)
    const t = top1000TotalsRow(DATA, S, E, [], rows)
    expect(t.hours).toBe(12)         // 8(银行) + 4(浙江)
    expect(t.topHours).toBe(10)      // 6 + 4
    expect(t.pct).toBeCloseTo(10 / 12)
    expect(t.topCustomers).toBe(1)   // 两个组服务的是同一个"大客户" → 去重后 1,不是 1+1=2
  })
})
```

`YitianOverviewView.test.ts` / `YitianCustomerView.test.ts` 各补：表格行只含 L4 层、不含「层级」列、TOP1000 不含「未分配L4」行。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3a: `metrics.ts` 追加**

```ts
export interface OrgTotals {
  people: number
  hours: number
  base: number
  sat: number | null
}

/** L4 行的合计。比率按 Σ实际 ÷ Σ基础 重算 —— 绝不能把各行饱和度相加或求平均。 */
export function orgL4SummaryRow(l4Rows: OrgRow[]): OrgTotals {
  const people = l4Rows.reduce((s, r) => s + r.people, 0)
  const hours = l4Rows.reduce((s, r) => s + r.hours, 0)
  const base = l4Rows.reduce((s, r) => s + r.base, 0)
  return { people, hours, base, sat: base > 0 ? hours / base : null }
}
```

- [ ] **Step 3b: `customer.ts` 追加**

```ts
export interface Top1000Totals {
  hours: number
  topHours: number
  pct: number
  topCustomers: number
}

/** TOP1000 表的合计。占比按 ΣTOP ÷ Σ总 重算;客户数**全局去重**(同一客户可能被多个组服务,不能相加)。
 *  入参 rows 是已剔除「未分配L4」后的可见行,合计与表格所见一致。 */
export function top1000TotalsRow(
  data: YitianData, start: string, end: string, l4s: string[], rows: Top1000Row[],
): Top1000Totals {
  const visible = new Set(rows.map((r) => r.l4))
  const l4Of = rosterL4Map(data)
  const custs = new Set<number>()
  for (const e of selectEntries(data, start, end, l4s)) {
    if (!CUSTOMER_TYPES.includes(typeNameOf(data, e))) continue
    if (!visible.has(l4Of[e.e] ?? '')) continue
    if (e.top && e.cu !== null && e.cu !== undefined) custs.add(e.cu)
  }
  const hours = rows.reduce((s, r) => s + r.hours, 0)
  const topHours = rows.reduce((s, r) => s + r.topHours, 0)
  return { hours, topHours, pct: hours > 0 ? topHours / hours : 0, topCustomers: custs.size }
}
```

- [ ] **Step 3c: `YitianOverviewView.vue` 分层汇总表**

```ts
const orgCols: DataColumn[] = [
  { key: 'name', label: 'L4 组织', width: 160, sortable: true },
  { key: 'parent', label: '上级组织', width: 140, sortable: true },
  { key: 'people', label: '人数', width: 90, num: true, sortable: true },
  { key: 'hoursText', label: '实际工时', width: 110, num: true, sortable: true },
  { key: 'baseText', label: '基础工时', width: 110, num: true },
  { key: 'satText', label: '饱和度', width: 110, num: true, sortable: true },
]

const l4Rows = computed(() =>
  store.data ? orgSummary(store.data, view.start, view.end, view.l4s).filter((r) => r.level === 'l4') : [])

const orgRows = computed(() => l4Rows.value.map((r) => ({
  ...r,
  hoursText: hrs(r.hours),
  baseText: hrs(r.base),
  satText: pct(r.sat),
})))

/** 固定汇总行(el-table 原生 show-summary,恒在表底、不随排序移动)。 */
function orgSummaryMethod({ columns }: { columns: { property: string }[] }): string[] {
  const t = orgL4SummaryRow(l4Rows.value)
  const disp: Record<string, string> = {
    name: '合计',
    parent: '',
    people: String(t.people),
    hoursText: hrs(t.hours),
    baseText: hrs(t.base),
    satText: pct(t.sat),
  }
  return columns.map((c) => disp[c.property] ?? '')
}
```

模板：

```vue
        <section class="yt-card">
          <h3 class="yt-h">分层汇总</h3>
          <DataTable :columns="orgCols" :rows="orgRows" :show-count="false"
            :show-summary="true" :summary-method="orgSummaryMethod" />
        </section>
```

- [ ] **Step 3d: `YitianCustomerView.vue` TOP1000 表**

```ts
import { NO_L4 } from '@/lib/yitian/metrics'

const topRowsRaw = computed(() => {
  if (!store.data) return []
  // 去掉「未分配L4」行(部门负责人,无客户支持归属)
  return top1000ByL4(store.data, view.start, view.end, view.l4s).filter((r) => r.l4 !== NO_L4)
})

const topRows = computed(() => topRowsRaw.value.map((r) => ({
  ...r, hoursText: hrs(r.hours), topHoursText: hrs(r.topHours), pctText: pct(r.pct),
})))

function topSummaryMethod({ columns }: { columns: { property: string }[] }): string[] {
  if (!store.data) return columns.map(() => '')
  const t = top1000TotalsRow(store.data, view.start, view.end, view.l4s, topRowsRaw.value)
  const disp: Record<string, string> = {
    l4: '合计',
    hoursText: hrs(t.hours),
    topHoursText: hrs(t.topHours),
    pctText: pct(t.pct),
    topCustomers: String(t.topCustomers),
  }
  return columns.map((c) => disp[c.property] ?? '')
}
```

模板（标题去括号，口径说明降为表上小字）：

```vue
      <section class="yt-card">
        <h3 class="yt-h">TOP1000 大客户支持</h3>
        <p class="yt-note">仅统计项目类 / 售前类 / 售后类工时；客户数按客户去重。</p>
        <DataTable :columns="topCols" :rows="topRows" :show-count="false"
          :show-summary="true" :summary-method="topSummaryMethod" />
      </section>
```

```css
.yt-note { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--gap-stack); }
```

跨 BG 卡的标题同样去括号：「跨 BG 支持」，口径说明移到 `.yt-note`。

- [ ] **Step 4: 验证**

```bash
cd frontend && npx vitest run src/lib/yitian/ src/views/YitianOverviewView.test.ts src/views/YitianCustomerView.test.ts
cd frontend && npx vue-tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/metrics.ts frontend/src/lib/yitian/metrics.test.ts frontend/src/lib/yitian/customer.ts frontend/src/lib/yitian/customer.test.ts frontend/src/views/YitianOverviewView.vue frontend/src/views/YitianOverviewView.test.ts frontend/src/views/YitianCustomerView.vue frontend/src/views/YitianCustomerView.test.ts
git commit -m "feat(yitian): 分层汇总/TOP1000 改仅L4+固定汇总行(比率按Σ分子÷Σ分母重算)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 工时类型占比新增柱状图（#3）

**Files:**
- Modify: `frontend/src/views/YitianOverviewView.vue`
- Modify: `frontend/src/views/YitianOverviewView.test.ts`

环图（占比）之外**再加一张柱状图**（各类型的工时数，绝对值），两张图并列在同一张卡里：环图看结构、柱状图看量级。

- [ ] **Step 1: 写失败测试**

```ts
  it('工时类型占比同时给出环图与柱状图', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as any
    expect(vm.typeOption.series[0].type).toBe('pie')
    expect(vm.typeBarOption.series[0].type).toBe('bar')
    // 柱状图的类目与数据必须与占比同源(同一批 typeRows)
    expect(vm.typeBarOption.xAxis.data).toEqual(vm.typeRows.map((t: any) => t.type))
  })
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

```ts
const typeBarOption = computed(() => ({
  tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v} h` },
  grid: { left: 48, right: 16, top: 24, bottom: 32 },
  xAxis: { type: 'category', data: typeRows.value.map((t) => t.type) },
  yAxis: { type: 'value' },
  series: [{
    name: '工时',
    type: 'bar',
    data: typeRows.value.map((t) => Number(t.hours.toFixed(1))),
  }],
}))

defineExpose({ typeOption, typeBarOption, typeRows })
```

模板（同卡内并列，窄屏自动堆叠）：

```vue
        <section class="yt-card">
          <h3 class="yt-h">工时类型占比</h3>
          <div class="yt-charts">
            <ChartBox :option="typeOption" height="300px" />
            <ChartBox :option="typeBarOption" height="300px" />
          </div>
        </section>
```

```css
.yt-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap-card); }
```

> 颜色不要手写——`ChartBox` 已注入全站 ECharts 主题（`charts/echartsTheme.ts`），分类色自动来自 `--chart-1..8` 令牌。

- [ ] **Step 4: 验证 + 全量**

```bash
cd frontend && npx vitest run src/views/YitianOverviewView.test.ts
cd .. && bash verify.sh
```
`verify.sh` 必须全绿。

**真实数据回归（必须做）**：确认这一整批改造**没有动口径**——
```bash
python -X utf8 -c "
import json
d = json.load(open('data/yitian_data.json', encoding='utf-8'))
t = d['dims']['types']; EX = {'管理类','业务类','假期类'}
inc = [e for e in d['entries'] if t[e['t']] not in EX]; ok = [e for e in inc if e['ok'] <= 1]
print('合规率:', len(inc), len(ok), len(inc)-len(ok), f'{len(ok)/len(inc)*100:.1f}%')
"
```
Expected：仍是 **462 / 442 / 20 / 95.7%**。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/YitianOverviewView.vue frontend/src/views/YitianOverviewView.test.ts
git commit -m "feat(yitian): 工时类型占比新增柱状图(环图看结构,柱状图看量级)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 收尾（全部任务完成后）

- `bash verify.sh` 全绿
- **浏览器目验**（这批一半是视觉改动，单测锁不住）：起 `python server.py` + `cd frontend && npm run dev`，逐项核对用户提的 9 条
- 累积功能真机验证：连续导入两份不同周的 `工时.xlsx`，确认行数累加、区间扩大；重复导同一份确认只更新不翻倍；试一次「按区间删」与「清空」
