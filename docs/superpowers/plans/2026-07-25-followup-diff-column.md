# 跟进表「时间差计算」列（B 期 / V4.4.6）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 V4.4.0 的跟进表自定义列引擎加第三种列类型 `diff`，计算「指定日期 − 指定列」的天数差，超管配一次全表生效，作用于 `temp`/`risk`/`payment_key`/`opportunity` 四表。

**Architecture:** `diff` 是**派生列**而非存储列——值不进 `current`，每次渲染按行数据算。后端只负责存配置与校验，并新增 `writable_keys()` 把计算列挡在 `apply_update` 的 `extra_fields` 之外；前端新增纯函数 `computeDiffDays` 与 `useCustomColumns.decorate` 的计算分支；「指定列」候选由 `isDateKey()` 自动识别内置/借入日期列 + `defs` 里的自定义 `date` 列合并而成。

**Tech Stack:** Python 标准库（无第三方）+ Vue 3 + TypeScript + Element Plus + Vitest + pytest。

**Spec:** `docs/superpowers/specs/2026-07-25-followup-diff-column-design.md`

## Global Constraints

- **版本 V4.4.6**（Z 级，基线 V4.4.5）。版本号单一来源 `frontend/src/version.ts`，只改此处。
- **不新增端点、不新增 `data/*.json`**（复用 `data/followup_columns.json`，已 gitignore）；不动数据管线；**升级无需点「更新数据」**。
- **安全红线**：`diff` 列的 key **绝不能**出现在 `apply_update` 的 `extra_fields` 里。若放行，普通管理员可往计算列 POST 值，且该存储值会在 decorate 时压过计算值，产生无法解释的脏数据。
- `diff` 列的 `clearOnArchive` **恒 `False`**，不接受前端传值。
- **不使用任何 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`。代码注释用简体中文。
- 后端纯标准库，**不得引入第三方依赖**。
- 提交时**绝不 `git add -A` / `git add .`**；工作树有未跟踪的 `yitian/` 目录，只 add 本任务明确改动的文件。
- 命令：`python -m pytest -q`；前端 `npm --prefix frontend run test:run` / `run typecheck`；单文件 `npx vitest run <path>`（`--root frontend`）。**本仓 `frontend/` 无 `tsconfig.app.json`，不要给 `vue-tsc` 传 `-p`。**

---

## File Structure

| 文件 | 职责 | Task |
|---|---|---|
| `followup_columns.py` | `diff` 类型 + 配置校验 + `writable_keys` + `_normalize`/`clear_field_keys` 适配 | 1 |
| `tests/test_followup_columns.py` | 上述单测 | 1 |
| `server.py`（4 处） | `_extra` 由 `custom_keys` 改为 `writable_keys`（安全接线） | 2 |
| `tests/test_server_followup_columns.py` | 四域 `diff` 列写入被拒绝 | 2 |
| `frontend/src/lib/diffColumn.ts` | 纯函数：`pickDate` / `computeDiffDays` / `localToday` | 3 |
| `frontend/src/lib/followupColumns.ts` | 类型扩展 + api 传 `diff` | 3 |
| `frontend/src/stores/followupColumns.ts` | `add`/`update` 透传 `diff` | 3 |
| `frontend/src/composables/useCustomColumns.ts` | `toDataColumn` 加 diff 分支；`decorate` 加计算分支 | 4 |
| `frontend/src/components/FollowupColumnConfig.vue` | 配置 UI + `columns` prop | 5 |
| 四个 view | 传 `:columns` 给配置组件 | 5 |
| `version.ts` / `PROGRESS.md` / `deploy/升级手册-V4.4.6.md` | 收尾 | 6 |

---

## Task 1: 后端 `followup_columns.py` — `diff` 类型与安全 key 集

**Files:**
- Modify: `followup_columns.py`
- Test: `tests/test_followup_columns.py`

**Interfaces:**
- Produces（Task 2 依赖）：`writable_keys(cfg, table) -> Set[str]`（只含 `text`/`date` 列的 key）；`add_column(cfg, table, label, type_, clear_on_archive, diff=None)`；`update_column(..., diff=None)`。

- [ ] **Step 1: 写失败测试**

追加到 `tests/test_followup_columns.py`：

```python
DIFF_OK = {"anchor": {"kind": "today"}, "target": "setupDate"}


def test_add_diff_column_stores_config_and_forces_clear_false():
    cfg = fc._empty()
    col = fc.add_column(cfg, 'temp', '立项至今', 'diff', True, diff=DIFF_OK)
    assert col['type'] == 'diff'
    assert col['diff'] == DIFF_OK
    assert col['clearOnArchive'] is False   # diff 列强制 False,不接受传入的 True


@pytest.mark.parametrize("bad", [
    None,
    {},
    {"anchor": {"kind": "nope"}, "target": "a"},
    {"anchor": {"kind": "fixed"}, "target": "a"},                    # 缺 date
    {"anchor": {"kind": "fixed", "date": "2026/1/1"}, "target": "a"},  # 格式错
    {"anchor": {"kind": "column"}, "target": "a"},                   # 缺 key
    {"anchor": {"kind": "today"}},                                   # 缺 target
    {"anchor": {"kind": "today"}, "target": "  "},                   # target 空白
])
def test_add_diff_column_rejects_bad_config(bad):
    cfg = fc._empty()
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'temp', 'X', 'diff', False, diff=bad)


def test_writable_keys_excludes_diff():
    cfg = fc._empty()
    t = fc.add_column(cfg, 'temp', '文本列', 'text', False)
    d = fc.add_column(cfg, 'temp', '日期列', 'date', False)
    f = fc.add_column(cfg, 'temp', '差值列', 'diff', False, diff=DIFF_OK)
    assert fc.writable_keys(cfg, 'temp') == {t['key'], d['key']}
    assert fc.custom_keys(cfg, 'temp') == {t['key'], d['key'], f['key']}   # 语义不变


def test_clear_field_keys_never_includes_diff():
    cfg = fc._empty()
    f = fc.add_column(cfg, 'temp', '差值列', 'diff', False, diff=DIFF_OK)
    # 即便有人手改 JSON 把 diff 列的 clearOnArchive 设成 True,也不得进清空集合
    cfg['tables']['temp'][0]['clearOnArchive'] = True
    assert f['key'] not in fc.clear_field_keys(cfg, 'temp', ('a',), True)


def test_update_column_switch_type_drops_orphan_diff():
    cfg = fc._empty()
    c = fc.add_column(cfg, 'temp', '差值列', 'diff', False, diff=DIFF_OK)
    fc.update_column(cfg, 'temp', c['key'], type_='text')
    assert 'diff' not in fc.columns_for(cfg, 'temp')[0]


def test_normalize_drops_diff_column_with_broken_shape():
    raw = {"version": 1, "tables": {"temp": [
        {"key": "cf-1", "label": "好", "type": "diff", "diff": DIFF_OK},
        {"key": "cf-2", "label": "坏", "type": "diff"},              # 缺 diff
        {"key": "cf-3", "label": "更坏", "type": "diff", "diff": {"anchor": {"kind": "x"}, "target": "a"}},
    ]}}
    out = fc._normalize(raw)
    assert [c['key'] for c in out['tables']['temp']] == ['cf-1']
```

> 本文件顶部已 `import followup_columns as fc`；`pytest` 亦已导入（现有用例在用）。若缺 `import pytest` 请补上。

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_followup_columns.py -q`
Expected: FAIL —— `add_column() got an unexpected keyword argument 'diff'` / `module has no attribute 'writable_keys'`。

- [ ] **Step 3: 实现**

`followup_columns.py` 顶部补 `import re`，常量区改为：

```python
TABLE_IDS: Tuple[str, ...] = ('temp', 'risk', 'payment_key', 'opportunity')
COL_TYPES: Tuple[str, ...] = ('text', 'date', 'diff')
ANCHOR_KINDS: Tuple[str, ...] = ('today', 'fixed', 'column')
_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
```

新增校验函数（放在 `_check_type` 之后）：

```python
def _check_diff(spec: Any) -> Dict[str, Any]:
    """校验并规整 diff 配置(anchor + target);非法一律抛 ValueError。
    不校验 target/anchor.key 指向的列是否存在——后端不认识前端列模型,
    引用失效在前端表现为显示 '-'(见 spec §5)。"""
    if not isinstance(spec, dict):
        raise ValueError("时间差列必须提供 diff 配置")
    anchor = spec.get("anchor")
    if not isinstance(anchor, dict):
        raise ValueError("diff.anchor 必须是对象")
    kind = anchor.get("kind")
    if kind not in ANCHOR_KINDS:
        raise ValueError("diff.anchor.kind 须为 today/fixed/column")
    out_anchor: Dict[str, Any] = {"kind": kind}
    if kind == "fixed":
        d = anchor.get("date")
        if not isinstance(d, str) or not _DATE_RE.match(d):
            raise ValueError("diff.anchor.date 须为 YYYY-MM-DD")
        out_anchor["date"] = d
    elif kind == "column":
        k = anchor.get("key")
        if not isinstance(k, str) or not k.strip():
            raise ValueError("diff.anchor.key 必填")
        out_anchor["key"] = k.strip()
    target = spec.get("target")
    if not isinstance(target, str) or not target.strip():
        raise ValueError("diff.target 必填")
    return {"anchor": out_anchor, "target": target.strip()}
```

`add_column` 改为（签名末尾加可选 `diff`，不破坏现有调用点）：

```python
def add_column(cfg, table, label, type_, clear_on_archive, diff=None) -> Dict[str, Any]:
    _check_table(table)
    lbl = _clean_label(label)
    typ = _check_type(type_)
    cols = cfg["tables"].setdefault(table, [])
    if len(cols) >= MAX_COLS_PER_TABLE:
        raise ValueError("每张表最多 %d 个自定义列" % MAX_COLS_PER_TABLE)
    if any(c.get("label") == lbl for c in cols):
        raise ValueError("该表已有同名列: %s" % lbl)
    col = {"key": _new_key(), "label": lbl, "type": typ,
           # diff 是派生列,无值可清 —— clearOnArchive 恒 False,不接受传入值
           "clearOnArchive": False if typ == 'diff' else bool(clear_on_archive)}
    if typ == 'diff':
        col["diff"] = _check_diff(diff)
    cols.append(col)
    return dict(col)
```

`update_column` 改为：

```python
def update_column(cfg, table, key, *, label=None, type_=None, clear_on_archive=None, diff=None) -> Dict[str, Any]:
    _check_table(table)
    col = _find(cfg, table, key)
    if col is None:
        raise ValueError("列不存在: %s" % key)
    if label is not None:
        lbl = _clean_label(label)
        if any(c.get("label") == lbl and c.get("key") != key for c in cfg["tables"][table]):
            raise ValueError("该表已有同名列: %s" % lbl)
        col["label"] = lbl
    if type_ is not None:
        col["type"] = _check_type(type_)
    # 以【最终类型】为准:类型可能刚被改掉
    if col["type"] == 'diff':
        if diff is not None:
            col["diff"] = _check_diff(diff)
        elif "diff" not in col:
            raise ValueError("时间差列必须提供 diff 配置")
        col["clearOnArchive"] = False
    else:
        col.pop("diff", None)      # 改成非 diff 类型 → 丢弃孤儿配置
        if clear_on_archive is not None:
            col["clearOnArchive"] = bool(clear_on_archive)
    return dict(col)
```

新增 `writable_keys`（放在 `custom_keys` 之后）：

```python
def writable_keys(cfg: Dict[str, Any], table: str) -> Set[str]:
    """可由管理员【填写】的自定义列 key —— 排除 diff 计算列。
    server 的 apply_update extra_fields 必须用本函数而非 custom_keys:
    diff 是派生列,一旦放行写入,存储值会在前端 decorate 时压过计算值。"""
    return {c["key"] for c in cfg["tables"].get(table, [])
            if c.get("key") and c.get("type") != 'diff'}
```

`clear_field_keys` 的循环体加跳过：

```python
    for c in cfg["tables"].get(table, []):
        if c.get("type") == 'diff':
            continue                      # 计算列无值可清(即便 JSON 被手改成 true)
        if c.get("clearOnArchive"):
            out.add(c["key"])
```

`_normalize` 的条目构建改为：

```python
        for c in items:
            if not isinstance(c, dict):
                continue
            k, lbl, typ = c.get("key"), c.get("label"), c.get("type")
            if not (isinstance(k, str) and k and isinstance(lbl, str) and lbl
                    and typ in COL_TYPES and k not in seen):
                continue
            entry = {"key": k, "label": lbl, "type": typ,
                     "clearOnArchive": False if typ == 'diff' else bool(c.get("clearOnArchive"))}
            if typ == 'diff':
                try:
                    entry["diff"] = _check_diff(c.get("diff"))
                except ValueError:
                    continue              # 形状损坏的 diff 列整条丢弃,不留半截配置
            seen.add(k)
            clean.append(entry)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_followup_columns.py -q`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add followup_columns.py tests/test_followup_columns.py
git commit -m "feat(followup-columns): V4.4.6 新增 diff 列类型 + writable_keys 排除计算列"
```

---

## Task 2: 后端接线 —— handler 透传 `diff` + 四处 `extra_fields` 改用 `writable_keys`

**Files:**
- Modify: `server.py:2494`（add handler）、`:2514`（update handler）—— 透传 `diff`
- Modify: `server.py:1985`（temp）、`:2178`（opportunity）、`:2293`（risk）、`:2404`（payment_key）—— 安全接线
- Test: `tests/test_server_followup_columns.py`

**Interfaces:**
- Consumes: Task 1 的 `followup_columns.writable_keys(cfg, table)`、`add_column(..., diff=None)`、`update_column(..., diff=None)`。

> **两件事**：
> ① **透传**：现有两个 handler 根本没读请求体里的 `diff`，不补则前端传了后端也收不到，
> `add_column(diff=None)` 会直接抛「时间差列必须提供 diff 配置」——功能完全不可用。
> ② **安全接线**：`_extra` 在各域 update handler 里**同时**用于前置校验
> （`if field not in _extra: 400`）与 `apply_update(extra_fields=_extra)`，
> 改用 `writable_keys` 后 `diff` 列的写入会在**第一道**就被 400 拒绝。

- [ ] **Step 1: 写失败测试**

追加到 `tests/test_server_followup_columns.py`（照本文件既有的 handler 调用范式；
若本文件用的是「构造 handler + 调用 handle_xxx」的方式，沿用之）：

```python
def test_diff_column_key_is_rejected_by_all_four_update_handlers(tmp_path, monkeypatch):
    """diff 是派生列:四域 update 必须拒绝对它的写入(400),否则存储值会压过计算值。"""
    import followup_columns as fc
    cfg = fc._empty()
    made = {}
    for table in ('temp', 'risk', 'payment_key', 'opportunity'):
        made[table] = fc.add_column(
            cfg, table, '差值列', 'diff', False,
            diff={"anchor": {"kind": "today"}, "target": "setupDate"})
    # 关键断言:任一表的 diff 列 key 都不在可写集合里
    for table in ('temp', 'risk', 'payment_key', 'opportunity'):
        assert made[table]['key'] not in fc.writable_keys(cfg, table)
        assert made[table]['key'] in fc.custom_keys(cfg, table)
```

- [ ] **Step 2: 跑测试确认（此条应在 Task 1 完成后即通过）**

Run: `python -m pytest tests/test_server_followup_columns.py -q`
Expected: PASS（它验的是 Task 1 的 `writable_keys` 语义）。

- [ ] **Step 3a: 两个 handler 透传 `diff`**

`server.py:2493-2496` 的 `_apply`（add）：

```python
        def _apply(cfg):
            holder['col'] = followup_columns.add_column(
                cfg, table, data.get('label'), data.get('type'),
                bool(data.get('clearOnArchive')), diff=data.get('diff'))
            return cfg["tables"][table]
```

`server.py:2513-2518` 的 `_apply`（update）：

```python
        def _apply(cfg):
            holder['col'] = followup_columns.update_column(
                cfg, table, key,
                label=data.get('label'), type_=data.get('type'),
                clear_on_archive=data.get('clearOnArchive'), diff=data.get('diff'))
            return cfg["tables"][table]
```

两处 docstring 的参数说明同步补 `diff?`。`_check_diff` 抛的 `ValueError` 会被
`_followup_txn` 捕获并返回 400 + 中文原因，无需在 handler 里另加校验。

- [ ] **Step 3b: 改四处安全接线**

`server.py` 中把这四行的 `custom_keys` 换成 `writable_keys`（其余一字不动）：

```python
# :1985  temp
_extra = followup_columns.writable_keys(_cfg, 'temp')
# :2178  opportunity
_extra = followup_columns.writable_keys(_cfg, 'opportunity')
# :2293  risk
_extra = followup_columns.writable_keys(_cfg, 'risk')
# :2404  payment_key
_extra = followup_columns.writable_keys(_cfg, 'payment_key')
```

**注意**：同文件里 `clear_field_keys(...)` 的四处调用（`:2021 / :2210 / :2321 / :2432`）
**保持不动**——Task 1 已在函数内部跳过 `diff`。

- [ ] **Step 4: 跑后端全量**

Run: `python -m pytest -q`
Expected: 全部 PASS（含既有的 `test_server_followup_columns.py` 四域放行用例——
它们用的是 `text` 类型列，不受影响）。

- [ ] **Step 5: 提交**

```bash
git add server.py tests/test_server_followup_columns.py
git commit -m "feat(followup-columns): V4.4.6 handler 透传 diff + 四域改用 writable_keys 挡住对计算列的写入"
```

---

## Task 3: 前端纯函数 `diffColumn.ts` + 类型/接口透传

**Files:**
- Create: `frontend/src/lib/diffColumn.ts`
- Create: `frontend/src/lib/diffColumn.test.ts`
- Modify: `frontend/src/lib/followupColumns.ts`、`frontend/src/stores/followupColumns.ts`

**Interfaces:**
- Produces（Task 4/5 依赖）：`DiffAnchor` / `DiffConfig` 类型；`pickDate(row, key)`；`computeDiffDays(row, cfg, today)`；`localToday(now?)`；`CustomColumn.type` 增加 `'diff'`、可选字段 `diff?: DiffConfig`；`followupColumnsApi.add/update` 与 store 的 `add/update` 透传 `diff`。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/diffColumn.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { pickDate, computeDiffDays, localToday, type DiffConfig } from './diffColumn'

const ROW = { setupDate: '2026-01-01', nextRevDate: '2026-01-31 08:30:00', 立项日期: '2026-03-01', empty: '', bad: '不是日期' }

describe('pickDate', () => {
  it('取前 10 位;支持中文 key;空/坏值 → null', () => {
    expect(pickDate(ROW, 'setupDate')).toBe('2026-01-01')
    expect(pickDate(ROW, 'nextRevDate')).toBe('2026-01-31')   // 带时间也只取日期
    expect(pickDate(ROW, '立项日期')).toBe('2026-03-01')
    expect(pickDate(ROW, 'empty')).toBeNull()
    expect(pickDate(ROW, 'bad')).toBeNull()
    expect(pickDate(ROW, '不存在的列')).toBeNull()
  })
})

describe('computeDiffDays', () => {
  const cfg = (c: Partial<DiffConfig>): DiffConfig =>
    ({ anchor: { kind: 'today' }, target: 'setupDate', ...c }) as DiffConfig

  it('anchor=today', () => {
    expect(computeDiffDays(ROW, cfg({}), '2026-01-11')).toBe(10)
  })
  it('anchor=fixed', () => {
    expect(computeDiffDays(ROW, cfg({ anchor: { kind: 'fixed', date: '2026-02-01' } }), '2026-01-11')).toBe(31)
  })
  it('anchor=column', () => {
    expect(computeDiffDays(ROW, cfg({ anchor: { kind: 'column', key: 'nextRevDate' } }), '2026-01-11')).toBe(30)
  })
  it('anchor 早于 target → 负数', () => {
    expect(computeDiffDays(ROW, cfg({ target: '立项日期' }), '2026-01-11')).toBe(-49)
  })
  it('target 空/坏/不存在 → null', () => {
    for (const t of ['empty', 'bad', '不存在的列']) {
      expect(computeDiffDays(ROW, cfg({ target: t }), '2026-01-11')).toBeNull()
    }
  })
  it('anchor=column 但该列取不到 → null', () => {
    expect(computeDiffDays(ROW, cfg({ anchor: { kind: 'column', key: 'bad' } }), '2026-01-11')).toBeNull()
  })
  it('跨夏令时/跨年仍为整数天(按 UTC 零点相减)', () => {
    expect(computeDiffDays({ d: '2025-12-31' }, { anchor: { kind: 'today' }, target: 'd' }, '2026-01-01')).toBe(1)
    expect(computeDiffDays({ d: '2026-03-01' }, { anchor: { kind: 'today' }, target: 'd' }, '2026-11-01')).toBe(245)
  })
})

describe('localToday', () => {
  it('取本地日期,不用 toISOString(那是 UTC,东八区凌晨会差一天)', () => {
    expect(localToday(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/diffColumn.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现**

创建 `frontend/src/lib/diffColumn.ts`：

```ts
export type DiffAnchor =
  | { kind: 'today' }
  | { kind: 'fixed'; date: string }      // 'YYYY-MM-DD'
  | { kind: 'column'; key: string }

export interface DiffConfig {
  anchor: DiffAnchor
  target: string                          // 指定列的 key
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2})/
const DAY_MS = 86400000

/** 取行上某 key 的日期并规整为 'YYYY-MM-DD';取不到/非日期 → null。 */
export function pickDate(row: Record<string, any>, key: string): string | null {
  const v = row?.[key]
  if (v === null || v === undefined || v === '') return null
  const m = DATE_RE.exec(String(v))
  return m ? m[1] : null
}

/** 'YYYY-MM-DD' → UTC 零点毫秒。按 UTC 解析:两端同基准相减,
 *  避免本地时区/夏令时导致的 off-by-one(V3.0.0 踩过时区 off-by-one)。 */
function utcMs(d: string): number | null {
  const m = DATE_RE.exec(d)
  if (!m) return null
  const t = Date.parse(m[1] + 'T00:00:00Z')
  return Number.isNaN(t) ? null : t
}

/** 本地时区的今天 'YYYY-MM-DD'。不用 toISOString —— 那是 UTC,东八区凌晨会差一天。 */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** anchor − target 的自然日天数差;任一端取不到 → null(前端显示 '-')。 */
export function computeDiffDays(
  row: Record<string, any>, cfg: DiffConfig, today: string,
): number | null {
  if (!cfg || !cfg.anchor || !cfg.target) return null
  const targetD = pickDate(row, cfg.target)
  if (!targetD) return null
  let anchorD: string | null
  if (cfg.anchor.kind === 'today') anchorD = today
  else if (cfg.anchor.kind === 'fixed') anchorD = cfg.anchor.date || null
  else anchorD = pickDate(row, cfg.anchor.key)
  if (!anchorD) return null
  const a = utcMs(anchorD)
  const b = utcMs(targetD)
  if (a === null || b === null) return null
  return Math.round((a - b) / DAY_MS)
}
```

`frontend/src/lib/followupColumns.ts` 改类型与 api：

```ts
import type { DiffConfig } from './diffColumn'
export type { DiffAnchor, DiffConfig } from './diffColumn'

export type CustomColumnType = 'text' | 'date' | 'diff'
export interface CustomColumn {
  key: string
  label: string
  type: CustomColumnType
  clearOnArchive: boolean
  diff?: DiffConfig
}
```

`followupColumnsApi.add` / `update` 末尾加可选 `diff`（放末尾保证现有调用点不破）：

```ts
  async add(table: FollowupTableId, label: string, type: CustomColumnType,
            clearOnArchive: boolean, diff?: DiffConfig): Promise<CustomColumn> {
    const r = await api.post<FollowupColumnMutateResp>('/api/followup-columns/add',
      { table, label, type, clearOnArchive, ...(diff ? { diff } : {}) })
    return r.column
  },
  async update(table: FollowupTableId, key: string,
               patch: Partial<Pick<CustomColumn, 'label' | 'type' | 'clearOnArchive' | 'diff'>>): Promise<CustomColumn> {
    const r = await api.post<FollowupColumnMutateResp>('/api/followup-columns/update', { table, key, ...patch })
    return r.column
  },
```

`frontend/src/stores/followupColumns.ts` 的 `add` 同步加末位可选参并透传：

```ts
  async function add(table: FollowupTableId, label: string, type: CustomColumnType,
                     clearOnArchive: boolean, diff?: DiffConfig) {
    const col = await followupColumnsApi.add(table, label, type, clearOnArchive, diff)
    configs.value = { ...configs.value, [table]: [...configs.value[table], col] }
    return col
  }
```

`update` 的 `patch` 类型同步加 `'diff'`（与 api 一致）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/diffColumn.test.ts` 然后 `npm --prefix frontend run typecheck`
Expected: 全部 PASS，typecheck 0 错误。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/diffColumn.ts frontend/src/lib/diffColumn.test.ts frontend/src/lib/followupColumns.ts frontend/src/stores/followupColumns.ts
git commit -m "feat(followup-columns): V4.4.6 前端时间差纯函数 + 类型/接口透传 diff"
```

---

## Task 4: `useCustomColumns` 接入计算

**Files:**
- Modify: `frontend/src/composables/useCustomColumns.ts:24-31`（`toDataColumn`）、`:45-60`（`decorate`）
- Test: `frontend/src/composables/useCustomColumns.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `computeDiffDays`、`localToday`、`CustomColumn.diff`。

> **本 Task 最易漏的一处**：现有 `decorate` 里 `if (!rec) return r` 会让**没有跟进记录的行**
> 直接跳过。`diff` 不依赖 `current`，**必须在 `rec` 缺失时照样计算**，否则表现为
> 「只有填过跟进的行才显示天数」，且极难一眼看出原因。

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/composables/useCustomColumns.test.ts`（沿用本文件既有的 store/挂载范式）：

```ts
describe('V4.4.6 diff 计算列', () => {
  const DIFF_COL = {
    key: 'cf-diff0001', label: '立项至今', type: 'diff' as const, clearOnArchive: false,
    diff: { anchor: { kind: 'today' as const }, target: 'setupDate' },
  }

  it('toDataColumn:diff 是数字列、可排序、不带「天」后缀', () => {
    // 通过 columns 计算属性间接验证(与本文件既有用例同风格)
    const c = makeColumns([DIFF_COL]).find((x: any) => x.key === 'cf-diff0001')!
    expect(c.num).toBe(true)
    expect(c.sortable).toBe(true)
    expect(c.formatter!(12, {})).toBe('12')
    expect(c.formatter!(null, {})).toBe('-')
  })

  it('【关键】没有跟进记录的行也要算出 diff 值', () => {
    // current 为空 → 旧实现 if (!rec) return r 会整行跳过
    const rows = makeDecorate([DIFF_COL], {})([{ projectId: 'P1', setupDate: '2026-01-01' }])
    expect(typeof (rows[0] as any)['cf-diff0001']).toBe('number')
  })

  it('diff 值不从 current 读:即便 current 里存了值也以计算结果为准', () => {
    const cur = { P1: { 'cf-diff0001': 99999 } }
    const rows = makeDecorate([DIFF_COL], cur)([{ projectId: 'P1', setupDate: '2026-01-01' }])
    expect((rows[0] as any)['cf-diff0001']).not.toBe(99999)
  })

  it('filterableKeys 不含 diff 列', () => {
    expect(makeFilterable([DIFF_COL]).has('cf-diff0001')).toBe(false)
  })
})
```

> `makeColumns` / `makeDecorate` / `makeFilterable` 是本文件里已有的辅助（或按本文件既有方式
> 直接构造 `useCustomColumns(...)` 后取 `columns.value` / `decorate` / `filterableKeys.value`）。
> **照本文件现有写法实现这三处取值，不要新造抽象。**

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/composables/useCustomColumns.test.ts`
Expected: FAIL —— 「没有跟进记录的行」用例得到 `undefined`。

- [ ] **Step 3: 实现**

`useCustomColumns.ts` 顶部补 import：

```ts
import { computeDiffDays, localToday } from '@/lib/diffColumn'
```

`toDataColumn` 加 `diff` 分支（放在最前）：

```ts
function toDataColumn(col: CustomColumn): DataColumn {
  if (col.type === 'diff')
    // 纯数字、不加「天」后缀:列名已表达含义,加后缀会破坏排序与导出为数值
    return { key: col.key, label: col.label, width: 110, num: true, sortable: true,
             formatter: (v) => (v === null || v === undefined || v === '' ? '-' : String(v)) }
  if (col.type === 'date')
    return { key: col.key, label: col.label, width: 170, sortable: true,
             formatter: (v) => (v ? String(v).slice(0, 10) : '-') }
  // text: 富文本存储,列表显示纯文本
  return { key: col.key, label: col.label, width: 360, wrap: true,
           formatter: (v) => htmlToPlainText(String(v ?? '')) }
}
```

`decorate` 整个函数体替换为：

```ts
  function decorate(rows: any[]): any[] {
    if (!defs.value.length) return rows
    const cur = opts.current.value
    const stored = defs.value.filter((c) => c.type !== 'diff')
    const diffs = defs.value.filter((c) => c.type === 'diff')
    const today = localToday()          // 本批全部行共用一次,避免跨行跨日不一致
    return rows.map((r) => {
      const rec = cur[opts.rowKey(r)]
      const extra: Record<string, any> = {}
      // 存储列:仍需 rec
      if (rec) {
        for (const c of stored) {
          const k = c.key
          if (k in rec) extra[k] = rec[k]
          if ((k + 'EditTime') in rec) extra[k + 'EditTime'] = rec[k + 'EditTime']
          if ((k + 'EditBy') in rec) extra[k + 'EditBy'] = rec[k + 'EditBy']
        }
      }
      // 计算列:派生自行数据,【不依赖 current】—— rec 缺失也必须算
      for (const c of diffs) {
        if (c.diff) extra[c.key] = computeDiffDays(r, c.diff, today)
      }
      return Object.keys(extra).length ? { ...r, ...extra } : r
    })
  }
```

`filterableKeys` 保持原样（只收 `type === 'date'`），`defaultKeys` 保持原样（返回全部 key）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/composables/useCustomColumns.test.ts` 然后 `npm --prefix frontend run typecheck`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/composables/useCustomColumns.ts frontend/src/composables/useCustomColumns.test.ts
git commit -m "feat(followup-columns): V4.4.6 decorate 计算 diff 列(无跟进记录的行同样计算)"
```

---

## Task 5: 配置界面 + 四 view 传列模型

**Files:**
- Modify: `frontend/src/components/FollowupColumnConfig.vue`
- Modify: `frontend/src/components/TempInstancePanel.vue`、`frontend/src/views/RiskFollowupView.vue`、`frontend/src/views/PaymentKeyFollowupView.vue`、`frontend/src/views/OpportunityFollowupView.vue`（各加一个 `:columns` 绑定）
- Test: `frontend/src/components/FollowupColumnConfig.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `DiffConfig`；`isDateKey`（`@/lib/cellFormat`）。
- Produces: `FollowupColumnConfig` 新 prop `columns: { key: string; label: string }[]`。

- [ ] **Step 1: 写失败测试**

追加到 `frontend/src/components/FollowupColumnConfig.test.ts`：

```ts
it('V4.4.6 类型下拉含「时间差」', () => {
  const w = mountConfig()   // 沿用本文件既有挂载 helper
  expect(w.html()).toContain('时间差')
})

it('V4.4.6 指定列候选 = 内置日期列 + 自定义 date 列(非日期列不进)', () => {
  const w = mountConfig({
    columns: [
      { key: 'setupDate', label: '立项日期' },
      { key: '计划关闭时间', label: '计划关闭时间' },
      { key: 'projectName', label: '项目名称' },   // 非日期,不应出现
    ],
  })
  const opts = (w.vm as any).dateColumnOptions as { key: string }[]
  const keys = opts.map((o) => o.key)
  expect(keys).toContain('setupDate')
  expect(keys).toContain('计划关闭时间')       // isDateKey 认中文
  expect(keys).not.toContain('projectName')
})
```

> 若本文件的挂载 helper 尚不支持传 props，按其既有写法扩展；`dateColumnOptions` 需经
> `defineExpose` 暴露（见 Step 3）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/FollowupColumnConfig.test.ts`
Expected: FAIL —— 找不到「时间差」/ `dateColumnOptions` 为 undefined。

- [ ] **Step 3: 实现**

`FollowupColumnConfig.vue` 的 `<script setup>` 改动：

```ts
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import type { CustomColumnType, FollowupTableId, DiffConfig } from '@/lib/followupColumns'
import { isDateKey } from '@/lib/cellFormat'

const props = withDefaults(defineProps<{
  modelValue: boolean
  table: FollowupTableId
  columns?: { key: string; label: string }[]
}>(), { columns: () => [] })

// ...既有 store / cols / open 不变...

// 「指定列」候选两路合并:内置/借入日期列(isDateKey 认中英文) + 自定义 date 列。
// isDateKey 认不出 cf-xxxxxxxx,故自定义 date 列必须单独并入。
const dateColumnOptions = computed(() => [
  ...(props.columns ?? []).filter((c) => isDateKey(c.key)).map((c) => ({ key: c.key, label: c.label })),
  ...cols.value.filter((c) => c.type === 'date').map((c) => ({ key: c.key, label: c.label })),
])

const newAnchorKind = ref<'today' | 'fixed' | 'column'>('today')
const newAnchorDate = ref('')
const newAnchorKey = ref('')
const newTarget = ref('')

function buildDiff(): DiffConfig | null {
  if (!newTarget.value) return null
  if (newAnchorKind.value === 'fixed') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newAnchorDate.value)) return null
    return { anchor: { kind: 'fixed', date: newAnchorDate.value }, target: newTarget.value }
  }
  if (newAnchorKind.value === 'column') {
    if (!newAnchorKey.value) return null
    return { anchor: { kind: 'column', key: newAnchorKey.value }, target: newTarget.value }
  }
  return { anchor: { kind: 'today' }, target: newTarget.value }
}

const addDisabled = computed(() =>
  cols.value.length >= 8 || !newLabel.value.trim() ||
  (newType.value === 'diff' && buildDiff() === null))

/** 列表行内展示引用关系,如「今天 − 立项日期」——
 *  引用的列被改名会静默失效(显示 '-'),把引用摆出来是对该债的可见性补偿。 */
function diffText(c: { diff?: DiffConfig }): string {
  const d = c.diff
  if (!d) return ''
  const labelOf = (k: string) => dateColumnOptions.value.find((o) => o.key === k)?.label ?? k
  const a = d.anchor.kind === 'today' ? '今天'
    : d.anchor.kind === 'fixed' ? d.anchor.date
    : labelOf(d.anchor.key)
  return `${a} − ${labelOf(d.target)}`
}

defineExpose({ dateColumnOptions, diffText })
```

`onAdd` 改为传 `diff`：

```ts
async function onAdd() {
  const label = newLabel.value.trim()
  if (!label) return
  const diff = newType.value === 'diff' ? buildDiff() : undefined
  if (newType.value === 'diff' && !diff) { ElMessage.error('请选择指定日期与指定列'); return }
  try {
    await store.add(props.table, label, newType.value, newClear.value, diff ?? undefined)
    newLabel.value = ''; newType.value = 'text'; newClear.value = false
    newAnchorKind.value = 'today'; newAnchorDate.value = ''; newAnchorKey.value = ''; newTarget.value = ''
  } catch (e) {
    ElMessage.error((e as Error).message || '新增失败')
  }
}
```

模板改动三处：

```html
<!-- 1) 提示语 -->
<div class="fcc-hint">超管可为本表增加供其他管理员填写的列（文本/日期），或自动计算的时间差列。每表最多 8 列。</div>

<!-- 2) 已有列行:类型文案 + diff 显示引用关系、且不渲染「归档清空」 -->
<span class="fcc-type">{{ c.type === 'date' ? '日期' : c.type === 'diff' ? '时间差' : '文本' }}</span>
<span v-if="c.type === 'diff'" class="fcc-diff">{{ diffText(c) }}</span>
<el-checkbox v-else :model-value="c.clearOnArchive" label="归档清空"
  @update:model-value="(v: boolean) => onToggleClear(c.key, v)" />

<!-- 3) 新建区:类型多一项,选中时展开 anchor/target -->
<el-select v-model="newType" size="small" style="width: 90px">
  <el-option label="文本" value="text" />
  <el-option label="日期" value="date" />
  <el-option label="时间差" value="diff" />
</el-select>
<el-checkbox v-if="newType !== 'diff'" v-model="newClear" label="归档清空" />
<template v-if="newType === 'diff'">
  <el-select v-model="newAnchorKind" size="small" style="width: 110px">
    <el-option label="当前日期" value="today" />
    <el-option label="指定日期" value="fixed" />
    <el-option label="选择列" value="column" />
  </el-select>
  <el-date-picker v-if="newAnchorKind === 'fixed'" v-model="newAnchorDate" type="date"
    size="small" style="width: 150px" value-format="YYYY-MM-DD" placeholder="指定日期" />
  <el-select v-if="newAnchorKind === 'column'" v-model="newAnchorKey" size="small"
    style="width: 150px" placeholder="被减列">
    <el-option v-for="o in dateColumnOptions" :key="o.key" :label="o.label" :value="o.key" />
  </el-select>
  <span class="fcc-type">−</span>
  <el-select v-model="newTarget" size="small" style="width: 150px" placeholder="指定列">
    <el-option v-for="o in dateColumnOptions" :key="o.key" :label="o.label" :value="o.key" />
  </el-select>
</template>
<el-button size="small" type="primary" :disabled="addDisabled" data-test="fcc-add" @click="onAdd">添加</el-button>
```

样式追加：

```css
.fcc-diff { font-size: var(--fs-1); color: var(--mut); }
```

四个 view 各给配置组件加 `:columns` 绑定（其余 props 不动）：

```html
<!-- TempInstancePanel.vue / PaymentKeyFollowupView.vue / OpportunityFollowupView.vue：ALL_COLUMNS 是 computed -->
<FollowupColumnConfig v-if="auth.isSuper" v-model="colCfgOpen" table="temp" :columns="ALL_COLUMNS" />
<!-- RiskFollowupView.vue：同样传 ALL_COLUMNS(中文 key,isDateKey 认中文) -->
<FollowupColumnConfig v-if="auth.isSuper" v-model="colCfgOpen" table="risk" :columns="ALL_COLUMNS" />
```

> 各 view 的 `table` 值与变量名照其现有代码，勿改；只加 `:columns` 一个绑定。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/FollowupColumnConfig.test.ts src/components/TempInstancePanel.test.ts src/views/RiskFollowupView.test.ts src/views/PaymentKeyFollowupView.test.ts src/views/OpportunityFollowupView.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/FollowupColumnConfig.vue frontend/src/components/FollowupColumnConfig.test.ts frontend/src/components/TempInstancePanel.vue frontend/src/views/RiskFollowupView.vue frontend/src/views/PaymentKeyFollowupView.vue frontend/src/views/OpportunityFollowupView.vue
git commit -m "feat(followup-columns): V4.4.6 时间差列配置界面 + 四表传列模型作候选"
```

---

## Task 6: 版本号 + 文档 + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`
- Create: `deploy/升级手册-V4.4.6.md`

- [ ] **Step 1: 改版本号**

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V4.4.6'
export const RELEASE_DATE = '2026-07-25'
```

- [ ] **Step 2: 跑全量验证**

Run: `bash verify.sh`
Expected: 语法编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

- [ ] **Step 3: 写升级手册**

创建 `deploy/升级手册-V4.4.6.md`，照 `deploy/升级手册-V4.4.5.md` 的结构，要点：

- **本次加什么**：四张跟进表（临时重点跟进 / 风险跟进 / 回款重点跟进 / 重点商机跟进）的「列设置」里，超管可新建**时间差**列，自动算「指定日期 − 指定列」的天数。指定日期可选**当前日期 / 某个固定日期 / 另一个日期列**；指定列可选该表任一日期列（含 V4.4.4 新增的计划/实际关闭时间、原项目立项日期等）。
- **典型用法**：新建「立项至今天数」= 当前日期 − 立项日期。
- **它是自动算出来的、不能填写**：其他管理员看得到、可排序、可导出，但不能编辑；也没有「归档清空」选项（没有值可清）。
- **归档历史视图里按当前日期计算**——例如「立项至今天数」在历史归档里显示的是「到今天」而非「到归档当时」，看历史时请注意这一点。
- **注意**：若把被引用的那一列删除或改名，时间差列会显示 `-`；列设置里每行会显示其引用关系（如「今天 − 立项日期」）便于核对。
- **纯前端 + 后端小改**：换 `dist` + 覆盖 `.py` + 重启 + `Ctrl+F5`，**无需点「更新数据」**；既有自定义列与已填数据零影响。
- 验证清单：版本号 V4.4.6；四表列设置里出现「时间差」类型；新建一个「当前日期 − 立项日期」列后值正确、可排序、导出为数字、列头无筛选入口、单元格不可编辑；删除该列提示「清除 0 行值」。
- 回滚：换回 `dist.bak-$TS` 与 `.py`，重启。

- [ ] **Step 4: 更新 PROGRESS.md**

在文件顶部按现有格式新增 V4.4.6 条目（把原「当前版本 V4.4.5」那行降为普通 `- **V4.4.5**` 条目），记录：第三种列类型 `diff` 是**派生列**（值不进 `current`）及由此派生的全部设计；**安全边界** `writable_keys` 把计算列挡在 `apply_update` 的 `extra_fields` 之外（否则存储值会压过计算值）；`decorate` 必须在**无跟进记录的行**上照样计算；「指定列」候选由 `isDateKey` 自动识别 + 自定义 `date` 列合并（V4.4.4 借入的六个项目域日期列自动成为候选）；归档历史视图按当前日期算的取舍；引用列改名会静默失效的已知债与「行内显示引用关系」的缓解。

- [ ] **Step 5: 提交并推送**

```bash
git add frontend/src/version.ts PROGRESS.md deploy/升级手册-V4.4.6.md
git commit -m "docs(deploy): V4.4.6 升级手册 + PROGRESS(换 dist + 覆盖 .py,无需更新数据)"
git status --short
git diff --cached --stat
git push origin master
```

> 推送前确认 `yitian/` 等未跟踪目录未被暂存；不应有任何 `data/`、`input/`、`release/` 文件进入暂存区。

---

## 附：手工冒烟（Task 6 之后，上线前）

启动 `python server.py` + `cd frontend && npm run dev`，逐项确认：

1. 四张跟进表各打开「列设置」→ 类型下拉有「时间差」；选中后出现「指定日期」与「指定列」两个下拉。
2. 「指定列」下拉里应出现该表的日期列（`/risk` 是中文列名如「立项日期」「计划关闭时间」），**不应**出现「项目名称」这类非日期列。
3. 新建「立项至今天数」（当前日期 − 立项日期）→ 表格出现该列、数值合理、右对齐、可点列头排序、导出 xlsx 里是数字。
4. **该列单元格不可编辑**（无输入框/日期选择器）；列头**无筛选入口**。
5. 找一条**从未填过任何跟进**的记录 → 该行的时间差列**同样有值**（这是 Task 4 的易漏点）。
6. 把某条记录的立项日期置空（或选一个本就没有立项日期的项目）→ 该行显示 `-`，不报错。
7. 列设置里该行显示引用关系「今天 − 立项日期」；改列名后值不变。
8. 删除该列 → 提示「清除 0 行值」（计算列本就无存储值）。
9. 归档一次 → 历史视图里该列仍显示，且按当前日期计算。
