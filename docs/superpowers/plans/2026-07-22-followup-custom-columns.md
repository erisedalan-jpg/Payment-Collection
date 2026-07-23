# 跟进表超管自定义列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让超级管理员为 4 张跟进表（`/projects/temp`、`/risk`、`/payment/key`、`/opportunities/key`）配置「由其他管理员填写」的文本/日期自定义列，含列名与「归档时是否清空」可配。

**Architecture:** 新增 `followup_columns.py`（配置模型 + CRUD + 校验，纯逻辑）产出 `data/followup_columns.json`；自定义列的值**内联**进各跟进 store 记录（复用 `apply_update`/归档/导出/选列全套机器）；`followup_store` 两处签名扩展（`apply_update` 加 `extra_fields` 放行自定义 key、`apply_archive` 加 `clear_fields` 按字段清除）；server 加 5 个端点 + 4 处更新/归档接线 + 删列清值；前端新增 `lib/followupColumns` + Pinia store + `useCustomColumns` composable + `FollowupCustomCell` + `FollowupColumnConfig` 抽屉，接入 4 视图。

**Tech Stack:** Python 3.8 标准库（后端）；Vue3 + TS + Pinia + Element Plus（前端）；pytest / vitest。

## Global Constraints

- **不使用任何 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`。
- **绝不记密钥/敏感值**：本域无密钥，但审计详情只记列名/类型/表，不记列值。
- **值内联，不新建第二份值源**：自定义列值存 `store.current[记录键][customKey]`（+`EditTime`/`EditBy`），与内置列并排。
- **向后兼容**：`data/followup_columns.json` 缺失 → 各表空列表 → 行为与升级前逐字一致；`apply_archive(clear_fields=None)` 退化为原表级行为。
- **打包/开发双路径**：本域纯读写 `data/*.json`，路径解析沿用既有 `data` 目录常量（与 `budget_config.json`/`*_followup.json` 同源），`frozen` 分支无需特判。
- **表键**（后端 `TABLE_IDS`，也是配置文件 key、API path 参数、前端 `FollowupTableId`）：`temp` / `risk` / `payment_key` / `opportunity`。
- **列上限** `MAX_COLS_PER_TABLE=8`；**列名** strip 后 1..20 字、表内不重名；**类型** `text`/`date`；**key** 格式 `cf-`+8 位 hex（`secrets.token_hex(4)`）。
- **改任一处口径先补/改测试再改实现**；每个可交付单元一提交。
- **版本号**由用户钦定；`frontend/src/version.ts` 单一来源，**先升版本号再跑 verify**（否则本地 dist 落后一版）。
- **验证**：声称完成前 `bash verify.sh` 全绿。

## 关键接口约定（跨任务类型一致性锚点）

**后端 `followup_columns.py`：**
```python
TABLE_IDS = ('temp', 'risk', 'payment_key', 'opportunity')
COL_TYPES = ('text', 'date')
MAX_COLS_PER_TABLE = 8
LABEL_MAX = 20
KEY_PREFIX = 'cf-'
STORE_VERSION = 1

def load(path: str) -> dict            # {version, tables:{每个 TABLE_ID: [列定义...]}}
def save(path: str, cfg: dict) -> None
def columns_for(cfg, table) -> list[dict]                 # 该表列定义副本
def custom_keys(cfg, table) -> set[str]                   # 该表全部列 key
def add_column(cfg, table, label, type_, clear_on_archive) -> dict
def update_column(cfg, table, key, *, label=None, type_=None, clear_on_archive=None) -> dict
def reorder_columns(cfg, table, ordered_keys) -> list[dict]
def delete_column(cfg, table, key) -> dict                # 返回被删列定义
def clear_field_keys(cfg, table, builtin_fields, table_level_clear) -> set[str]
# 违规一律 ValueError；load 对损坏文件降级为空结构
```

**后端 `followup_store.py`（签名扩展，向后兼容默认值）：**
```python
def apply_update(cfg, store, key, field, content, account, now, extra_fields=()) -> dict
def apply_archive(cfg, store, rows, now, clear_fields=None) -> None
```

**前端 `lib/followupColumns.ts`：**
```typescript
export type FollowupTableId = 'temp' | 'risk' | 'payment_key' | 'opportunity'
export interface CustomColumn { key: string; label: string; type: 'text' | 'date'; clearOnArchive: boolean }
export const followupColumnsApi = {
  getAll(): Promise<Record<FollowupTableId, CustomColumn[]>>,
  add(table, label, type, clearOnArchive): Promise<CustomColumn>,
  update(table, key, patch: Partial<Pick<CustomColumn,'label'|'type'|'clearOnArchive'>>): Promise<CustomColumn>,
  reorder(table, keys: string[]): Promise<CustomColumn[]>,
  remove(table, key): Promise<{ affectedRows: number }>,
}
```

**前端 `composables/useCustomColumns.ts`：**
```typescript
useCustomColumns(tableId: FollowupTableId, opts: {
  current: Ref<Record<string, Record<string, any>>>,   // store.current
  rowKey: (row: any) => string,                        // 行 → 记录键
}) => {
  columns: ComputedRef<DataColumn[]>,      // date: sortable+date fmt; text: wrap+htmlToPlainText
  keys: ComputedRef<string[]>,
  filterableKeys: ComputedRef<Set<string>>,// 仅 date 列
  loaded: Ref<boolean>,
  defaultKeys: () => string[],             // 全部自定义 key（喂默认可见 getter）
  decorate: (rows: any[]) => any[],        // 把 current[rowKey][colKey](+EditTime) 并到行上
}
```

**HTTP 端点（静态路径 + body 传参，与 `/api/temp-followup/instances/*` 同范式，便于审计精确匹配）：**
| 方法 路径 | 权限 | body |
|---|---|---|
| `GET /api/followup-columns` | 登录管理员 | — |
| `POST /api/followup-columns/add` | 超管 | `{table,label,type,clearOnArchive}` |
| `POST /api/followup-columns/update` | 超管 | `{table,key,label?,type?,clearOnArchive?}` |
| `POST /api/followup-columns/reorder` | 超管 | `{table,keys:[...]}` |
| `POST /api/followup-columns/delete` | 超管 | `{table,key}` |

---

### Task 1: `followup_columns.py` 配置模型 + CRUD + 校验（纯逻辑）

**Files:**
- Create: `followup_columns.py`
- Test: `tests/test_followup_columns.py`

**Interfaces:**
- Produces: 见「关键接口约定」全部 `followup_columns.*` 函数与常量。
- Consumes: 标准库 `json` / `os` / `secrets`。

- [ ] **Step 1: 写失败测试**

`tests/test_followup_columns.py`：
```python
import json
import pytest
import followup_columns as fc


def _empty():
    return {"version": fc.STORE_VERSION, "tables": {t: [] for t in fc.TABLE_IDS}}


def test_add_generates_prefixed_key_and_appends():
    cfg = _empty()
    col = fc.add_column(cfg, 'risk', ' 责任人 ', 'text', False)
    assert col['key'].startswith(fc.KEY_PREFIX) and len(col['key']) == len(fc.KEY_PREFIX) + 8
    assert col['label'] == '责任人' and col['type'] == 'text' and col['clearOnArchive'] is False
    assert fc.columns_for(cfg, 'risk') == [col]
    assert fc.custom_keys(cfg, 'risk') == {col['key']}


def test_add_rejects_bad_table_type_label():
    cfg = _empty()
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'nope', 'x', 'text', False)          # 未知表
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', 'x', 'select', False)        # 未知类型
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', '   ', 'text', False)        # 空名
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', 'x' * 21, 'text', False)     # 超 20


def test_add_rejects_duplicate_label_within_table_only():
    cfg = _empty()
    fc.add_column(cfg, 'risk', '进度', 'text', False)
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', '进度', 'date', True)        # 表内重名
    fc.add_column(cfg, 'temp', '进度', 'text', False)           # 跨表可重名，不抛


def test_add_rejects_over_cap():
    cfg = _empty()
    for i in range(fc.MAX_COLS_PER_TABLE):
        fc.add_column(cfg, 'risk', f'列{i}', 'text', False)
    with pytest.raises(ValueError):
        fc.add_column(cfg, 'risk', '再一列', 'text', False)


def test_update_changes_label_type_clear_keeps_key():
    cfg = _empty()
    col = fc.add_column(cfg, 'risk', 'A', 'text', False)
    out = fc.update_column(cfg, 'risk', col['key'], label='B', type_='date', clear_on_archive=True)
    assert out['key'] == col['key'] and out['label'] == 'B' and out['type'] == 'date' and out['clearOnArchive'] is True


def test_update_rejects_duplicate_label_and_unknown_key():
    cfg = _empty()
    a = fc.add_column(cfg, 'risk', 'A', 'text', False)
    fc.add_column(cfg, 'risk', 'B', 'text', False)
    with pytest.raises(ValueError):
        fc.update_column(cfg, 'risk', a['key'], label='B')      # 撞另一列
    with pytest.raises(ValueError):
        fc.update_column(cfg, 'risk', 'cf-deadbeef', label='X') # 未知 key


def test_reorder_by_keys():
    cfg = _empty()
    a = fc.add_column(cfg, 'risk', 'A', 'text', False)
    b = fc.add_column(cfg, 'risk', 'B', 'text', False)
    out = fc.reorder_columns(cfg, 'risk', [b['key'], a['key']])
    assert [c['key'] for c in out] == [b['key'], a['key']]
    with pytest.raises(ValueError):
        fc.reorder_columns(cfg, 'risk', [a['key']])             # 键集不全


def test_delete_returns_col_and_removes():
    cfg = _empty()
    col = fc.add_column(cfg, 'risk', 'A', 'text', False)
    got = fc.delete_column(cfg, 'risk', col['key'])
    assert got['key'] == col['key'] and fc.columns_for(cfg, 'risk') == []
    with pytest.raises(ValueError):
        fc.delete_column(cfg, 'risk', col['key'])               # 已不存在


def test_clear_field_keys_four_quadrants():
    cfg = _empty()
    keep = fc.add_column(cfg, 'risk', '留', 'text', False)      # clearOnArchive False
    wipe = fc.add_column(cfg, 'risk', '清', 'date', True)       # clearOnArchive True
    builtin = ('followAction', 'revConclusion', 'nextRevDate')
    # 表级留存(risk/paykey): 只清 clearOnArchive=True 的自定义列
    assert fc.clear_field_keys(cfg, 'risk', builtin, False) == {wipe['key']}
    # 表级清空(temp/opp): 清全部内置 + clearOnArchive=True 的自定义列(留 keep)
    assert fc.clear_field_keys(cfg, 'risk', builtin, True) == set(builtin) | {wipe['key']}
    assert keep['key'] not in fc.clear_field_keys(cfg, 'risk', builtin, True)


def test_load_missing_or_corrupt_returns_empty(tmp_path):
    p = tmp_path / "none.json"
    cfg = fc.load(str(p))
    assert cfg == {"version": fc.STORE_VERSION, "tables": {t: [] for t in fc.TABLE_IDS}}
    p.write_text("{ broken", encoding="utf-8")
    assert fc.load(str(p))["tables"]["risk"] == []


def test_save_load_roundtrip(tmp_path):
    p = str(tmp_path / "fc.json")
    cfg = _empty()
    fc.add_column(cfg, 'temp', '责任人', 'text', False)
    fc.save(p, cfg)
    back = fc.load(p)
    assert back['tables']['temp'][0]['label'] == '责任人'
    assert json.loads(open(p, encoding="utf-8").read())['version'] == fc.STORE_VERSION
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_followup_columns.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'followup_columns'`）

- [ ] **Step 3: 实现 `followup_columns.py`**

```python
"""跟进表超管自定义列:配置模型 + CRUD + 校验(纯逻辑 + 原子读写)。

值不在这里 —— 列的【值】内联在各跟进 store 的 current 记录里(server 侧写)。本模块只管
「有哪些列」及其属性(列名/类型/归档清空)。参照 budget_config/followup_store 的薄封装风格。
"""
from __future__ import annotations

import json
import os
import secrets
from typing import Any, Dict, List, Optional, Set, Tuple

TABLE_IDS: Tuple[str, ...] = ('temp', 'risk', 'payment_key', 'opportunity')
COL_TYPES: Tuple[str, ...] = ('text', 'date')
MAX_COLS_PER_TABLE = 8
LABEL_MAX = 20
KEY_PREFIX = 'cf-'
STORE_VERSION = 1


def _empty() -> Dict[str, Any]:
    return {"version": STORE_VERSION, "tables": {t: [] for t in TABLE_IDS}}


def _check_table(table: str) -> None:
    if table not in TABLE_IDS:
        raise ValueError("未知跟进表: %s" % table)


def _clean_label(label: Any) -> str:
    if not isinstance(label, str):
        raise ValueError("列名必须是字符串")
    s = label.strip()
    if not s or len(s) > LABEL_MAX:
        raise ValueError("列名须为 1..%d 个字符" % LABEL_MAX)
    return s


def _check_type(type_: Any) -> str:
    if type_ not in COL_TYPES:
        raise ValueError("列类型须为 text 或 date")
    return type_


def _find(cfg: Dict[str, Any], table: str, key: str) -> Optional[Dict[str, Any]]:
    for c in cfg["tables"].get(table, []):
        if c.get("key") == key:
            return c
    return None


def columns_for(cfg: Dict[str, Any], table: str) -> List[Dict[str, Any]]:
    _check_table(table)
    return [dict(c) for c in cfg["tables"].get(table, [])]


def custom_keys(cfg: Dict[str, Any], table: str) -> Set[str]:
    return {c["key"] for c in cfg["tables"].get(table, []) if c.get("key")}


def _new_key() -> str:
    return KEY_PREFIX + secrets.token_hex(4)


def add_column(cfg, table, label, type_, clear_on_archive) -> Dict[str, Any]:
    _check_table(table)
    lbl = _clean_label(label)
    typ = _check_type(type_)
    cols = cfg["tables"].setdefault(table, [])
    if len(cols) >= MAX_COLS_PER_TABLE:
        raise ValueError("每张表最多 %d 个自定义列" % MAX_COLS_PER_TABLE)
    if any(c.get("label") == lbl for c in cols):
        raise ValueError("该表已有同名列: %s" % lbl)
    col = {"key": _new_key(), "label": lbl, "type": typ, "clearOnArchive": bool(clear_on_archive)}
    cols.append(col)
    return dict(col)


def update_column(cfg, table, key, *, label=None, type_=None, clear_on_archive=None) -> Dict[str, Any]:
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
    if clear_on_archive is not None:
        col["clearOnArchive"] = bool(clear_on_archive)
    return dict(col)


def reorder_columns(cfg, table, ordered_keys) -> List[Dict[str, Any]]:
    _check_table(table)
    cols = cfg["tables"].get(table, [])
    if not isinstance(ordered_keys, list) or set(ordered_keys) != {c["key"] for c in cols}:
        raise ValueError("重排 keys 必须与现有列 key 集合完全一致")
    by_key = {c["key"]: c for c in cols}
    cfg["tables"][table] = [by_key[k] for k in ordered_keys]
    return columns_for(cfg, table)


def delete_column(cfg, table, key) -> Dict[str, Any]:
    _check_table(table)
    col = _find(cfg, table, key)
    if col is None:
        raise ValueError("列不存在: %s" % key)
    cfg["tables"][table] = [c for c in cfg["tables"][table] if c.get("key") != key]
    return dict(col)


def clear_field_keys(cfg, table, builtin_fields, table_level_clear) -> Set[str]:
    """归档时该表待清字段集:表级清空 → 全部内置;每个自定义列按自己的 clearOnArchive。"""
    _check_table(table)
    out: Set[str] = set(builtin_fields) if table_level_clear else set()
    for c in cfg["tables"].get(table, []):
        if c.get("clearOnArchive"):
            out.add(c["key"])
    return out


def _normalize(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict) or not isinstance(raw.get("tables"), dict):
        return _empty()
    out = _empty()
    for t in TABLE_IDS:
        items = raw["tables"].get(t)
        if not isinstance(items, list):
            continue
        clean: List[Dict[str, Any]] = []
        seen: Set[str] = set()
        for c in items:
            if not isinstance(c, dict):
                continue
            k, lbl, typ = c.get("key"), c.get("label"), c.get("type")
            if not (isinstance(k, str) and k and isinstance(lbl, str) and lbl
                    and typ in COL_TYPES and k not in seen):
                continue
            seen.add(k)
            clean.append({"key": k, "label": lbl, "type": typ, "clearOnArchive": bool(c.get("clearOnArchive"))})
        out["tables"][t] = clean
    return out


def load(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return _normalize(json.load(f))
    except (OSError, ValueError):
        return _empty()


def save(path: str, cfg: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_followup_columns.py -q`
Expected: PASS（全部）

- [ ] **Step 5: 提交**

```bash
git add followup_columns.py tests/test_followup_columns.py
git commit -m "feat(followup-cols): 自定义列配置模型 followup_columns.py(CRUD+校验+归档字段集)"
```

---

### Task 2: `followup_store` 两处签名扩展 + 4 域薄封装透传

**Files:**
- Modify: `followup_store.py`（`apply_update` 加 `extra_fields`、`apply_archive` 加 `clear_fields`）
- Modify: `risk_followup.py` / `payment_key_followup.py` / `opportunity_followup.py`（`apply_update`/`apply_archive` 透传）
- Modify: `temp_followup.py`（`apply_update`/`apply_archive` 透传，操作 instance）
- Test: `tests/test_followup_store.py`（扩充）

**Interfaces:**
- Consumes: 无（纯引擎）。
- Produces: `apply_update(cfg, store, key, field, content, account, now, extra_fields=())`；`apply_archive(cfg, store, rows, now, clear_fields=None)`；各域 `apply_update(..., extra_fields=())` / `apply_archive(..., clear_fields=None)`。

- [ ] **Step 1: 写失败测试**（追加到 `tests/test_followup_store.py` 末尾）

```python
def test_apply_update_accepts_extra_fields():
    cfg = _single_retain()
    store = fs.new_store(cfg)
    rec = fs.apply_update(cfg, store, "K1", "cf-aaaa1111", "值", "admin", "t", extra_fields={"cf-aaaa1111"})
    assert rec["cf-aaaa1111"] == "值" and rec["cf-aaaa1111EditBy"] == "admin"
    import pytest
    with pytest.raises(ValueError):
        fs.apply_update(cfg, store, "K1", "cf-notallowed", "x", "admin", "t", extra_fields={"cf-aaaa1111"})


def test_apply_archive_clear_fields_selective_on_retain_table():
    cfg = _single_retain()      # 表级留存
    s = fs.new_store(cfg)
    s["current"] = {"K1": {"followAction": "keep", "cf-x": "wipe", "cf-xEditTime": "t", "cf-xEditBy": "a"}}
    fs.apply_archive(cfg, s, [{"row": 1}], "t", clear_fields={"cf-x"})
    assert s["current"] == {"K1": {"followAction": "keep"}}       # 只清 cf-x + 其 EditTime/EditBy
    assert len(s["archives"]) == 1


def test_apply_archive_clear_fields_drops_emptied_records():
    cfg = _grouped()            # 表级清空
    s = fs.new_store(cfg)
    s["current"] = {"P1": {"weekProgress": "a", "cf-keep": "survive"}, "P2": {"weekProgress": "b"}}
    # 表级清空内置 weekProgress/nextPlan;cf-keep 不在 clear_fields → 留存 → P1 保留、P2 清空后为空被丢弃
    fs.apply_archive(cfg, s, [{"row": 1}], "t", clear_fields={"weekProgress", "nextPlan"})
    assert s["current"] == {"P1": {"cf-keep": "survive"}}


def test_apply_archive_none_retains_legacy_behavior():
    grouped = _grouped()
    s1 = fs.new_store(grouped); s1["current"] = {"P1": {"weekProgress": "a"}}
    fs.apply_archive(grouped, s1, [{"row": 1}], "t")              # clear_fields 缺省
    assert s1["current"] == {}                                   # 与旧行为逐字一致
    retain = _single_retain()
    s2 = fs.new_store(retain); s2["current"] = {"K1": {"followAction": "b"}}
    fs.apply_archive(retain, s2, [{"row": 1}], "t")
    assert s2["current"] == {"K1": {"followAction": "b"}}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_followup_store.py -q`
Expected: FAIL（`apply_update() got an unexpected keyword argument 'extra_fields'` 等）

- [ ] **Step 3: 改 `followup_store.py`**

替换 `apply_update` 与 `apply_archive`：
```python
def apply_update(cfg, store, key, field, content, account, now, extra_fields=()) -> Dict[str, Any]:
    if field not in cfg.progress_fields and field not in extra_fields:
        raise ValueError("invalid field: %s" % field)
    rec = store.setdefault('current', {}).setdefault(key, {})
    rec[field] = content
    rec[field + 'EditTime'] = now
    rec[field + 'EditBy'] = account
    return rec


def apply_archive(cfg, store, rows, now, clear_fields=None) -> None:
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
    if clear_fields is None:
        # 向后兼容:无自定义列时退化为原表级行为
        if cfg.clear_on_archive:
            store['current'] = {}
        return
    current = store.setdefault('current', {})
    for rec in current.values():
        for f in clear_fields:
            rec.pop(f, None)
            rec.pop(f + 'EditTime', None)
            rec.pop(f + 'EditBy', None)
    store['current'] = {k: v for k, v in current.items() if v}   # 丢弃清空后为空的记录
```

- [ ] **Step 4: 改 4 域薄封装透传**

`risk_followup.py`：
```python
def apply_update(store, risk_key, field, content, account, now, extra_fields=()) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, store, risk_key, field, content, account, now, extra_fields=extra_fields)


def apply_archive(store, rows, now, clear_fields=None) -> None:
    _fs.apply_archive(_CFG, store, rows, now, clear_fields=clear_fields)
```
`payment_key_followup.py`（同形，参数名 `project_id`）：
```python
def apply_update(store, project_id, field, content, account, now, extra_fields=()) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, store, project_id, field, content, account, now, extra_fields=extra_fields)


def apply_archive(store, rows, now, clear_fields=None) -> None:
    _fs.apply_archive(_CFG, store, rows, now, clear_fields=clear_fields)
```
`opportunity_followup.py`（参数名 `opp_id`）：
```python
def apply_update(store, opp_id, field, content, account, now, extra_fields=()) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, store, opp_id, field, content, account, now, extra_fields=extra_fields)


def apply_archive(store, rows, now, clear_fields=None) -> None:
    _fs.apply_archive(_CFG, store, rows, now, clear_fields=clear_fields)
```
`temp_followup.py`（操作 instance）：
```python
def apply_update(instance, project_id, field, content, account, now, extra_fields=()) -> Dict[str, Any]:
    return _fs.apply_update(_CFG, instance, project_id, field, content, account, now, extra_fields=extra_fields)


def apply_archive(instance, rows, now, clear_fields=None) -> None:
    _fs.apply_archive(_CFG, instance, rows, now, clear_fields=clear_fields)
```

- [ ] **Step 5: 跑全部后端测试确认通过**

Run: `python -m pytest tests/test_followup_store.py tests/test_risk_followup.py tests/test_payment_key_followup.py -q`
Expected: PASS（新老全绿；老测试因默认参数不受影响）

- [ ] **Step 6: 提交**

```bash
git add followup_store.py risk_followup.py payment_key_followup.py opportunity_followup.py temp_followup.py tests/test_followup_store.py
git commit -m "feat(followup-cols): followup_store 加 extra_fields/clear_fields,4 域透传(向后兼容)"
```

---

### Task 3: server 配置端点（GET + add/update/reorder，不碰值）

**Files:**
- Modify: `server.py`（config 文件常量 + load/save + 锁；`_SUPER_ONLY_PATHS`；do_GET/do_POST 分发；4 个 handler；`import followup_columns`）
- Modify: `audit.py`（`_ACTION_MAP` 加 4 条）

**Interfaces:**
- Consumes: `followup_columns.*`（Task 1）。
- Produces: `GET /api/followup-columns`、`POST /api/followup-columns/{add,update,reorder}`；模块级 `_load_followup_columns()` / `_save_followup_columns()` / `_followup_columns_lock`；`FOLLOWUP_COLUMNS_FILE`。

- [ ] **Step 1: 加 import + 文件常量 + 锁 + load/save**

`server.py` 顶部 import 区（`import projects` 附近）加：
```python
import followup_columns
```
`BUDGET_CONFIG_FILE = ...`（server.py:345）附近加：
```python
FOLLOWUP_COLUMNS_FILE = os.path.join(BASE_DIR, 'data', 'followup_columns.json')
```
在其它 followup 锁定义处（`_risk_lock` 等附近）加：
```python
_followup_columns_lock = threading.Lock()
```
在模块级 load/save helper 区（`_load_risk_followup` 等附近）加：
```python
def _load_followup_columns():
    return followup_columns.load(FOLLOWUP_COLUMNS_FILE)


def _save_followup_columns(cfg):
    followup_columns.save(FOLLOWUP_COLUMNS_FILE, cfg)
```
> 打包/开发双路径：`BASE_DIR` 已按 `frozen` 分支解析（与 `BUDGET_CONFIG_FILE` 同源），无需额外特判。

- [ ] **Step 2: `_SUPER_ONLY_PATHS` 加写端点（server.py:209 集合内）**

在 `'/api/payment-key-followup/...'` 那几行附近追加：
```python
    '/api/followup-columns/add', '/api/followup-columns/update',
    '/api/followup-columns/reorder', '/api/followup-columns/delete',
```
> 注:`GET /api/followup-columns`（读）**不入**本集合——普通管理员要用它渲染列。

- [ ] **Step 3: do_GET 分发（server.py:1091 `/api/budget/config` 附近）**

```python
        elif parsed.path == '/api/followup-columns':
            self.handle_followup_columns_get()
```

- [ ] **Step 4: do_POST 分发（server.py:1264 `/api/budget/config` 附近）**

```python
        elif parsed.path == '/api/followup-columns/add':
            self.handle_followup_columns_add()
        elif parsed.path == '/api/followup-columns/update':
            self.handle_followup_columns_update()
        elif parsed.path == '/api/followup-columns/reorder':
            self.handle_followup_columns_reorder()
        elif parsed.path == '/api/followup-columns/delete':
            self.handle_followup_columns_delete()
```
（`delete` 的 handler 在 Task 4 实现；这一步先把分发写全，Task 4 只补方法体，避免二次改分发。）

- [ ] **Step 5: 实现 GET + add/update/reorder handler**

在 followup 处理器区（`handle_paykey_followup_archive_delete` 之后）加：
```python
    def handle_followup_columns_get(self):
        """GET /api/followup-columns — 全部 4 表自定义列配置。任意登录管理员(渲染列要用)。"""
        account, rec = self._session_account_rec()
        if not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期")); return
        try:
            cfg = _load_followup_columns()
            self._json_response({"success": True, "tables": cfg.get("tables", {})})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"读取自定义列配置失败: {e}"))

    def handle_followup_columns_add(self):
        """POST /api/followup-columns/add {table,label,type,clearOnArchive} — 超管专属(_authz_gate 拦)。"""
        data = self._read_json_body()
        if not isinstance(data, dict):
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        table = str(data.get('table') or '')
        self._audit_set(target=table, detail='新增自定义列「%s」(%s)' % (str(data.get('label') or ''), str(data.get('type') or '')))
        holder = {}

        def _apply(cfg):
            holder['col'] = followup_columns.add_column(
                cfg, table, data.get('label'), data.get('type'), bool(data.get('clearOnArchive')))
            return cfg["tables"][table]

        ok, res = self._followup_txn(_followup_columns_lock, _load_followup_columns, _apply, _save_followup_columns)
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL, res or "新增失败")); return
        self._json_response({"success": True, "column": holder.get('col'), "columns": res})

    def handle_followup_columns_update(self):
        """POST /api/followup-columns/update {table,key,label?,type?,clearOnArchive?} — 超管专属。"""
        data = self._read_json_body()
        if not isinstance(data, dict):
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        table, key = str(data.get('table') or ''), str(data.get('key') or '')
        self._audit_set(target='%s/%s' % (table, key), detail='修改自定义列')
        holder = {}

        def _apply(cfg):
            holder['col'] = followup_columns.update_column(
                cfg, table, key,
                label=data.get('label'), type_=data.get('type'),
                clear_on_archive=data.get('clearOnArchive'))
            return cfg["tables"][table]

        ok, res = self._followup_txn(_followup_columns_lock, _load_followup_columns, _apply, _save_followup_columns)
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL, res or "修改失败")); return
        self._json_response({"success": True, "column": holder.get('col'), "columns": res})

    def handle_followup_columns_reorder(self):
        """POST /api/followup-columns/reorder {table,keys:[...]} — 超管专属。"""
        data = self._read_json_body()
        if not isinstance(data, dict):
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        table = str(data.get('table') or '')
        self._audit_set(target=table, detail='重排自定义列')

        def _apply(cfg):
            return followup_columns.reorder_columns(cfg, table, data.get('keys'))

        ok, res = self._followup_txn(_followup_columns_lock, _load_followup_columns, _apply, _save_followup_columns)
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL, res or "重排失败")); return
        self._json_response({"success": True, "columns": res})
```

- [ ] **Step 6: `audit.py` `_ACTION_MAP` 加 4 条（`_ACTION_MAP` 内，followup 段附近）**

```python
    ('POST', '/api/followup-columns/add'): ('followup_columns.add', '新增跟进自定义列'),
    ('POST', '/api/followup-columns/update'): ('followup_columns.update', '修改跟进自定义列'),
    ('POST', '/api/followup-columns/reorder'): ('followup_columns.reorder', '重排跟进自定义列'),
    ('POST', '/api/followup-columns/delete'): ('followup_columns.delete', '删除跟进自定义列'),
```

- [ ] **Step 7: 语法编译 + 冒烟**

Run: `python -c "import server, followup_columns, audit; print('ok')"`
Expected: 打印 `ok`（无 import/语法错）
Run: `python -m pytest tests/test_audit.py -q`
Expected: PASS（若 test_audit 有「每个 POST 端点须在 _ACTION_MAP」类断言，新端点已覆盖）

- [ ] **Step 8: 提交**

```bash
git add server.py audit.py
git commit -m "feat(followup-cols): server 配置端点(GET+add/update/reorder)+审计埋点"
```

---

### Task 4: server 更新/归档接线 + 删列清值

**Files:**
- Modify: `server.py`（4 处 update handler 放行 + 传 `extra_fields`；4 处 archive handler 传 `clear_fields`；`handle_followup_columns_delete`）

**Interfaces:**
- Consumes: `followup_columns.custom_keys` / `clear_field_keys` / `delete_column`；各域 `PROGRESS_FIELDS`；`apply_update(..., extra_fields=)` / `apply_archive(..., clear_fields=)`。
- Produces: `handle_followup_columns_delete`（含清值 + 影响行数）。

- [ ] **Step 1: 4 处 update handler 放行自定义 key + 传 extra_fields**

对 `handle_temp_followup_update`（server.py:1948）：把校验行
```python
        if not pid or field not in _temp.PROGRESS_FIELDS:
```
改为：
```python
        _cfg = _load_followup_columns()
        _extra = followup_columns.custom_keys(_cfg, 'temp')
        if not pid or (field not in _temp.PROGRESS_FIELDS and field not in _extra):
```
并把 `_apply` 内 `_temp.apply_update(inst, pid, field, ..., account, now)` 改为传 `extra_fields=_extra`：
```python
            return _temp.apply_update(inst, pid, field, str(data.get('content') or ''), account, now, extra_fields=_extra)
```
对 `handle_opportunity_followup_update`（server.py:2134，表 `'opportunity'`，`_oppf`，字段 `oppId`→`oid`）：
```python
        _cfg = _load_followup_columns()
        _extra = followup_columns.custom_keys(_cfg, 'opportunity')
        if not oid or (field not in _oppf.PROGRESS_FIELDS and field not in _extra):
            self._send_json(400, _error_payload(ERR_VALIDATION, "oppId 必填、field 非法")); return
        ...
        ok, res = self._followup_txn(
            _opp_followup_lock, _load_opportunity_followup,
            lambda s: _oppf.apply_update(s, oid, field, str(data.get('content') or ''), account, now, extra_fields=_extra),
            _save_opportunity_followup)
```
对 `handle_risk_followup_update`（server.py:2238，表 `'risk'`，`_riskfu`，`riskKey`→`rk`）：
```python
        _cfg = _load_followup_columns()
        _extra = followup_columns.custom_keys(_cfg, 'risk')
        if not rk or (field not in _riskfu.PROGRESS_FIELDS and field not in _extra):
            self._send_json(400, _error_payload(ERR_VALIDATION, "riskKey 必填、field 非法")); return
        ...
        ok, res = self._followup_txn(
            _risk_lock, _load_risk_followup,
            lambda s: _riskfu.apply_update(s, rk, field, str(data.get('content') or ''), account, now, extra_fields=_extra),
            _save_risk_followup)
```
对 `handle_paykey_followup_update`（server.py:2342，表 `'payment_key'`，`_paykey`，`projectId`→`pid`）：
```python
        _cfg = _load_followup_columns()
        _extra = followup_columns.custom_keys(_cfg, 'payment_key')
        if not pid or (field not in _paykey.PROGRESS_FIELDS and field not in _extra):
            self._send_json(400, _error_payload(ERR_VALIDATION, "projectId 必填、field 非法")); return
        ...
        ok, res = self._followup_txn(
            _paykey_lock, _load_paykey_followup,
            lambda s: _paykey.apply_update(s, pid, field, str(data.get('content') or ''), account, now, extra_fields=_extra),
            _save_paykey_followup)
```

- [ ] **Step 2: 4 处 archive handler 传 clear_fields**

`handle_temp_followup_archive`（server.py:1978）的 `_apply` 改为：
```python
        _cfg = _load_followup_columns()
        _clear = followup_columns.clear_field_keys(_cfg, 'temp', _temp.PROGRESS_FIELDS, True)

        def _apply(s):
            inst = _temp.find_instance(s, str(data.get('instanceId') or ''))
            if inst is None:
                raise ValueError("instanceId 不存在")
            _temp.apply_archive(inst, rows, now, clear_fields=_clear)
            return inst.get("archives", [])
```
`handle_opportunity_followup_archive`（server.py:2160，表级清空=True）：
```python
        _cfg = _load_followup_columns()
        _clear = followup_columns.clear_field_keys(_cfg, 'opportunity', _oppf.PROGRESS_FIELDS, True)

        def _apply(s):
            _oppf.apply_archive(s, rows, now, clear_fields=_clear)
            return s.get("archives", [])
```
`handle_risk_followup_archive`（server.py:2264，表级留存=False）：
```python
        _cfg = _load_followup_columns()
        _clear = followup_columns.clear_field_keys(_cfg, 'risk', _riskfu.PROGRESS_FIELDS, False)

        def _apply(s):
            _riskfu.apply_archive(s, rows, now, clear_fields=_clear)
            return s.get("archives", [])
```
`handle_paykey_followup_archive`（server.py:2368，表级留存=False）：
```python
        _cfg = _load_followup_columns()
        _clear = followup_columns.clear_field_keys(_cfg, 'payment_key', _paykey.PROGRESS_FIELDS, False)

        def _apply(s):
            _paykey.apply_archive(s, rows, now, clear_fields=_clear)
            return s.get("archives", [])
```
> 表级清空/留存与各表既有一致：temp/opportunity=True，risk/payment_key=False。

- [ ] **Step 3: 实现 `handle_followup_columns_delete`（删配置 + 清值 + 影响行数）**

在 `handle_followup_columns_reorder` 之后加。删列需要**同时**改配置文件与对应 store 的 current，两把锁按固定顺序取（先 columns 锁、再 store 锁）避免与更新/归档交叉死锁：
```python
    # 表键 → (锁, load, save, instances? 布尔)。temp 为多实例、值散在各 instance 的 current。
    def _store_binding(self, table):
        return {
            'temp': (_temp_lock, _load_temp_followup, _save_temp_followup, True),
            'risk': (_risk_lock, _load_risk_followup, _save_risk_followup, False),
            'payment_key': (_paykey_lock, _load_paykey_followup, _save_paykey_followup, False),
            'opportunity': (_opp_followup_lock, _load_opportunity_followup, _save_opportunity_followup, False),
        }.get(table)

    @staticmethod
    def _purge_key_from_current(current, key):
        """从一个 {记录键: 记录} 里清除 key + EditTime/EditBy;返回被动到的记录数。"""
        n = 0
        for rec in current.values():
            if key in rec or (key + 'EditTime') in rec or (key + 'EditBy') in rec:
                rec.pop(key, None); rec.pop(key + 'EditTime', None); rec.pop(key + 'EditBy', None)
                n += 1
        return n

    def handle_followup_columns_delete(self):
        """POST /api/followup-columns/delete {table,key} — 删列 + 清该列当前值(temp 含全实例);
        历史归档不动。超管专属。"""
        data = self._read_json_body()
        if not isinstance(data, dict):
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败")); return
        table, key = str(data.get('table') or ''), str(data.get('key') or '')
        binding = self._store_binding(table)
        if binding is None:
            self._send_json(400, _error_payload(ERR_VALIDATION, "未知跟进表")); return
        self._audit_set(target='%s/%s' % (table, key), detail='删除自定义列')
        holder = {}

        # 先删配置(校验列存在)
        def _apply_cfg(cfg):
            holder['col'] = followup_columns.delete_column(cfg, table, key)
            return cfg["tables"][table]

        ok, res = self._followup_txn(_followup_columns_lock, _load_followup_columns, _apply_cfg, _save_followup_columns)
        if not ok:
            self._send_json(400 if isinstance(res, str) else 500,
                            _error_payload(ERR_VALIDATION if isinstance(res, str) else ERR_INTERNAL, res or "删除失败")); return

        # 再清值(store 锁)。配置已删,即便这步失败,列也不再展示;清值尽力而为。
        lock, load_fn, save_fn, multi = binding

        def _apply_store(s):
            n = 0
            if multi:
                for inst in s.get('instances', []):
                    n += self._purge_key_from_current(inst.setdefault('current', {}), key)
            else:
                n += self._purge_key_from_current(s.setdefault('current', {}), key)
            holder['affected'] = n
            return n

        ok2, _res2 = self._followup_txn(lock, load_fn, _apply_store, save_fn)
        affected = holder.get('affected', 0) if ok2 else 0
        self._audit_set(detail='删除自定义列「%s」(清 %d 行值)' % (holder.get('col', {}).get('label', ''), affected))
        self._json_response({"success": True, "deleted": holder.get('col'), "affectedRows": affected})
```

- [ ] **Step 4: 语法编译 + 后端全测**

Run: `python -c "import server; print('ok')"`
Expected: `ok`
Run: `python -m pytest -q`
Expected: PASS（全部后端测试）

- [ ] **Step 5: 手动冒烟（超管）**

启动 `python server.py`，用超管登录，`curl`/浏览器：
1. `POST /api/followup-columns/add {table:'risk',label:'责任人',type:'text',clearOnArchive:false}` → 200，返回 column（key 形如 `cf-xxxxxxxx`）。
2. `POST /api/risk-followup/update {riskKey:'<任一>',field:'<上一步 key>',content:'张三'}` → 200。
3. `GET /api/risk-followup` → 该 riskKey 记录含 `cf-xxxx:'张三'`。
4. `POST /api/followup-columns/delete {table:'risk',key:'<key>'}` → 200，`affectedRows>=1`；再 `GET /api/risk-followup` 该值已清。

- [ ] **Step 6: 提交**

```bash
git add server.py
git commit -m "feat(followup-cols): server 更新/归档接线(extra_fields/clear_fields)+删列清值"
```

---

### Task 5: 前端 API 客户端 + Pinia store

**Files:**
- Create: `frontend/src/lib/followupColumns.ts`
- Create: `frontend/src/stores/followupColumns.ts`
- Test: `frontend/src/stores/followupColumns.test.ts`

**Interfaces:**
- Consumes: `@/lib/api`（既有 `api.get`/`api.post` 客户端，参照 `riskFollowupApi`）。
- Produces: `FollowupTableId`、`CustomColumn`、`followupColumnsApi`（见「关键接口约定」）；`useFollowupColumnsStore`（`configs`, `loaded`, `load()`, `columnsFor(table)`, `add/update/reorder/remove`）。

- [ ] **Step 1: 看一眼既有 API 客户端范式**

Run: 阅读 `frontend/src/lib/riskFollowupApi.ts`
Expected: 确认 `api.get('/api/...')` / `api.post('/api/...', body)` 的既有封装形态，`followupColumns.ts` 照抄同风格。

- [ ] **Step 2: 写失败测试**

`frontend/src/stores/followupColumns.test.ts`：
```typescript
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/followupColumns', () => ({
  followupColumnsApi: {
    getAll: vi.fn().mockResolvedValue({
      temp: [], risk: [{ key: 'cf-a', label: '责任人', type: 'text', clearOnArchive: false }],
      payment_key: [], opportunity: [],
    }),
    add: vi.fn().mockResolvedValue({ key: 'cf-b', label: '截止', type: 'date', clearOnArchive: true }),
    remove: vi.fn().mockResolvedValue({ affectedRows: 3 }),
  },
}))

import { useFollowupColumnsStore } from '@/stores/followupColumns'

describe('followupColumns store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load 后 columnsFor 返回该表列', async () => {
    const s = useFollowupColumnsStore()
    await s.load()
    expect(s.loaded).toBe(true)
    expect(s.columnsFor('risk').map((c) => c.label)).toEqual(['责任人'])
    expect(s.columnsFor('temp')).toEqual([])
  })

  it('add 后本地追加', async () => {
    const s = useFollowupColumnsStore()
    await s.load()
    await s.add('risk', '截止', 'date', true)
    expect(s.columnsFor('risk').map((c) => c.key)).toContain('cf-b')
  })

  it('remove 后本地移除并返回影响行数', async () => {
    const s = useFollowupColumnsStore()
    await s.load()
    const r = await s.remove('risk', 'cf-a')
    expect(r.affectedRows).toBe(3)
    expect(s.columnsFor('risk')).toEqual([])
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/followupColumns.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 `lib/followupColumns.ts`**

```typescript
import { api } from '@/lib/api'

export type FollowupTableId = 'temp' | 'risk' | 'payment_key' | 'opportunity'
export type CustomColumnType = 'text' | 'date'
export interface CustomColumn {
  key: string
  label: string
  type: CustomColumnType
  clearOnArchive: boolean
}
export type FollowupColumnsConfig = Record<FollowupTableId, CustomColumn[]>

export const followupColumnsApi = {
  async getAll(): Promise<FollowupColumnsConfig> {
    const r = await api.get('/api/followup-columns')
    return (r.tables ?? {}) as FollowupColumnsConfig
  },
  async add(table: FollowupTableId, label: string, type: CustomColumnType, clearOnArchive: boolean): Promise<CustomColumn> {
    const r = await api.post('/api/followup-columns/add', { table, label, type, clearOnArchive })
    return r.column as CustomColumn
  },
  async update(table: FollowupTableId, key: string,
               patch: Partial<Pick<CustomColumn, 'label' | 'type' | 'clearOnArchive'>>): Promise<CustomColumn> {
    const r = await api.post('/api/followup-columns/update', { table, key, ...patch })
    return r.column as CustomColumn
  },
  async reorder(table: FollowupTableId, keys: string[]): Promise<CustomColumn[]> {
    const r = await api.post('/api/followup-columns/reorder', { table, keys })
    return (r.columns ?? []) as CustomColumn[]
  },
  async remove(table: FollowupTableId, key: string): Promise<{ affectedRows: number }> {
    const r = await api.post('/api/followup-columns/delete', { table, key })
    return { affectedRows: Number(r.affectedRows ?? 0) }
  },
}
```
> 若 `api.get/post` 的既有签名与此不同（如返回已解包/需 `.data`），按 `riskFollowupApi.ts` 实测形态对齐。

- [ ] **Step 5: 实现 `stores/followupColumns.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  followupColumnsApi, type CustomColumn, type CustomColumnType,
  type FollowupColumnsConfig, type FollowupTableId,
} from '@/lib/followupColumns'

const TABLES: FollowupTableId[] = ['temp', 'risk', 'payment_key', 'opportunity']
const emptyConfig = (): FollowupColumnsConfig =>
  ({ temp: [], risk: [], payment_key: [], opportunity: [] })

export const useFollowupColumnsStore = defineStore('followupColumns', () => {
  const configs = ref<FollowupColumnsConfig>(emptyConfig())
  const loaded = ref(false)

  function columnsFor(table: FollowupTableId): CustomColumn[] {
    return configs.value[table] ?? []
  }
  async function load() {
    const all = await followupColumnsApi.getAll()
    const next = emptyConfig()
    for (const t of TABLES) next[t] = Array.isArray(all[t]) ? all[t] : []
    configs.value = next
    loaded.value = true
  }
  async function add(table: FollowupTableId, label: string, type: CustomColumnType, clearOnArchive: boolean) {
    const col = await followupColumnsApi.add(table, label, type, clearOnArchive)
    configs.value = { ...configs.value, [table]: [...configs.value[table], col] }
    return col
  }
  async function update(table: FollowupTableId, key: string,
                        patch: Partial<Pick<CustomColumn, 'label' | 'type' | 'clearOnArchive'>>) {
    const col = await followupColumnsApi.update(table, key, patch)
    configs.value = { ...configs.value, [table]: configs.value[table].map((c) => (c.key === key ? col : c)) }
    return col
  }
  async function reorder(table: FollowupTableId, keys: string[]) {
    const cols = await followupColumnsApi.reorder(table, keys)
    configs.value = { ...configs.value, [table]: cols }
    return cols
  }
  async function remove(table: FollowupTableId, key: string) {
    const r = await followupColumnsApi.remove(table, key)
    configs.value = { ...configs.value, [table]: configs.value[table].filter((c) => c.key !== key) }
    return r
  }
  return { configs, loaded, columnsFor, load, add, update, reorder, remove }
})
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/stores/followupColumns.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/followupColumns.ts frontend/src/stores/followupColumns.ts frontend/src/stores/followupColumns.test.ts
git commit -m "feat(followup-cols): 前端 API 客户端 + Pinia store"
```

---

### Task 6: `useColumnPrefsDynamic` 支持 getter 型 defaultVisible

**Files:**
- Modify: `frontend/src/lib/useColumnPrefs.ts`（`useColumnPrefsDynamic` 的 `defaultVisible` 接受 `string[] | (() => string[])`）
- Test: `frontend/src/lib/useColumnPrefs.test.ts`（若无则新建，仅加本任务用例）

**Interfaces:**
- Consumes: 无。
- Produces: `useColumnPrefsDynamic(viewKey, allKeys: Ref<string[]>, defaultVisible: string[] | (() => string[]))`；数组入参行为**逐字不变**（回归）。

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/useColumnPrefs.test.ts`（追加或新建）：
```typescript
import { ref, nextTick } from 'vue'
import { describe, expect, it, beforeEach } from 'vitest'
import { useColumnPrefsDynamic } from '@/lib/useColumnPrefs'

describe('useColumnPrefsDynamic getter defaultVisible', () => {
  beforeEach(() => localStorage.clear())

  it('defaultVisible 为函数时,在 allKeys 首次非空(init)时求值', async () => {
    const allKeys = ref<string[]>([])
    // 动态默认列在 init 时才知道(如自定义列异步到达)
    let dynamicDefaults: string[] = []
    const prefs = useColumnPrefsDynamic('vk-getter', allKeys, () => dynamicDefaults)
    dynamicDefaults = ['a', 'cf-x']
    allKeys.value = ['a', 'b', 'cf-x']
    await nextTick()
    expect(prefs.visibleKeys.value).toEqual(['a', 'cf-x'])
  })

  it('数组入参行为不变(回归)', async () => {
    const allKeys = ref<string[]>([])
    const prefs = useColumnPrefsDynamic('vk-arr', allKeys, ['a'])
    allKeys.value = ['a', 'b']
    await nextTick()
    expect(prefs.visibleKeys.value).toEqual(['a'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/useColumnPrefs.test.ts`
Expected: FAIL（getter 用例：函数被当成数组，`loadKeys` 里 `defaultVisible.filter` 对函数抛或返回空）

- [ ] **Step 3: 改 `useColumnPrefsDynamic`**

把签名与 `init`/`reset` 里对 `defaultVisible` 的使用改为先解引用：
```typescript
export function useColumnPrefsDynamic(
  viewKey: string,
  allKeys: Ref<string[]>,
  defaultVisible: string[] | (() => string[]),
): ColumnPrefs {
  const resolveDefault = (): string[] =>
    typeof defaultVisible === 'function' ? defaultVisible() : defaultVisible
  const visibleKeys = ref<string[]>([])
  let inited = false
  function set(keys: string[]) { visibleKeys.value = keys; saveKeys(viewKey, keys) }
  function init(ks: string[]) {
    if (inited || !ks.length) return
    inited = true
    visibleKeys.value = loadKeys(viewKey, ks, resolveDefault())
  }
  init(allKeys.value)
  watch(allKeys, init)
  // ...toggle/moveUp/moveDown 不变...
  function reset() { set(resolveDefault().filter((k) => allKeys.value.includes(k))) }
  return { visibleKeys, toggle, moveUp, moveDown, reset, makeToggle: buildMakeToggle(visibleKeys, toggle) }
}
```
（`useColumnPrefs` 静态版**不改**。）

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `cd frontend && npx vitest run src/lib/useColumnPrefs.test.ts src/views/RiskFollowupView.test.ts`
Expected: PASS（新用例 + risk 视图既有用例不回归）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/useColumnPrefs.ts frontend/src/lib/useColumnPrefs.test.ts
git commit -m "feat(followup-cols): useColumnPrefsDynamic 支持 getter 型 defaultVisible(自定义列默认可见)"
```

---

### Task 7: `useCustomColumns` composable + `FollowupCustomCell` 组件

**Files:**
- Create: `frontend/src/composables/useCustomColumns.ts`
- Create: `frontend/src/components/FollowupCustomCell.vue`
- Test: `frontend/src/composables/useCustomColumns.test.ts`

**Interfaces:**
- Consumes: `useFollowupColumnsStore`（Task 5）；`DataColumn`（`@/components/DataTable.vue`）；`htmlToPlainText`（`@/lib/richText`）；`RichTextCell`。
- Produces: `useCustomColumns(tableId, { current, rowKey })`（见「关键接口约定」）；`FollowupCustomCell` props `{ col: CustomColumn, row: Record<string,any>, editable: boolean, save: (v: string) => Promise<unknown> }`。

- [ ] **Step 1: 写失败测试**

`frontend/src/composables/useCustomColumns.test.ts`：
```typescript
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/followupColumns', () => ({ followupColumnsApi: {} }))
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import { useCustomColumns } from '@/composables/useCustomColumns'

describe('useCustomColumns', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const s = useFollowupColumnsStore()
    s.configs = {
      temp: [], payment_key: [], opportunity: [],
      risk: [
        { key: 'cf-t', label: '责任人', type: 'text', clearOnArchive: false },
        { key: 'cf-d', label: '截止', type: 'date', clearOnArchive: true },
      ],
    } as any
    s.loaded = true
  })

  it('text/date 列生成对应 DataColumn', () => {
    const current = ref<Record<string, any>>({})
    const c = useCustomColumns('risk', { current, rowKey: (r) => r.riskKey })
    const cols = c.columns.value
    expect(cols.map((x) => x.key)).toEqual(['cf-t', 'cf-d'])
    const dateCol = cols.find((x) => x.key === 'cf-d')!
    expect(dateCol.sortable).toBe(true)
    expect(c.filterableKeys.value.has('cf-d')).toBe(true)   // date 可筛选
    expect(c.filterableKeys.value.has('cf-t')).toBe(false)  // text 不可筛选
    expect(c.defaultKeys()).toEqual(['cf-t', 'cf-d'])
  })

  it('decorate 把 current 值(+EditTime)并到行', () => {
    const current = ref<Record<string, any>>({
      R1: { 'cf-t': '张三', 'cf-tEditTime': '2026-07-22 10:00:00' },
    })
    const c = useCustomColumns('risk', { current, rowKey: (r) => r.riskKey })
    const [row] = c.decorate([{ riskKey: 'R1', foo: 1 }])
    expect(row['cf-t']).toBe('张三')
    expect(row['cf-tEditTime']).toBe('2026-07-22 10:00:00')
    expect(row.foo).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/composables/useCustomColumns.test.ts`
Expected: FAIL（composable 不存在）

- [ ] **Step 3: 实现 `composables/useCustomColumns.ts`**

```typescript
import { computed, type ComputedRef, type Ref } from 'vue'
import type { DataColumn } from '@/components/DataTable.vue'
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import type { CustomColumn, FollowupTableId } from '@/lib/followupColumns'
import { htmlToPlainText } from '@/lib/richText'

interface UseCustomColumnsOpts {
  current: Ref<Record<string, Record<string, any>>>
  rowKey: (row: any) => string
}

function toDataColumn(col: CustomColumn): DataColumn {
  if (col.type === 'date')
    return { key: col.key, label: col.label, width: 170, sortable: true,
             formatter: (v) => (v ? String(v).slice(0, 10) : '-') }
  // text: 富文本存储,列表显示纯文本
  return { key: col.key, label: col.label, width: 360, wrap: true,
           formatter: (v) => htmlToPlainText(String(v ?? '')) }
}

export function useCustomColumns(tableId: FollowupTableId, opts: UseCustomColumnsOpts) {
  const store = useFollowupColumnsStore()
  const defs = computed<CustomColumn[]>(() => store.columnsFor(tableId))
  const columns = computed<DataColumn[]>(() => defs.value.map(toDataColumn))
  const keys = computed<string[]>(() => defs.value.map((c) => c.key))
  const filterableKeys = computed<Set<string>>(() =>
    new Set(defs.value.filter((c) => c.type === 'date').map((c) => c.key)))
  const loaded = computed(() => store.loaded)

  function defaultKeys(): string[] {
    return defs.value.map((c) => c.key)
  }
  function decorate(rows: any[]): any[] {
    if (!defs.value.length) return rows
    const cur = opts.current.value
    const ks = defs.value.map((c) => c.key)
    return rows.map((r) => {
      const rec = cur[opts.rowKey(r)]
      if (!rec) return r
      const extra: Record<string, any> = {}
      for (const k of ks) {
        if (k in rec) extra[k] = rec[k]
        if ((k + 'EditTime') in rec) extra[k + 'EditTime'] = rec[k + 'EditTime']
        if ((k + 'EditBy') in rec) extra[k + 'EditBy'] = rec[k + 'EditBy']
      }
      return Object.keys(extra).length ? { ...r, ...extra } : r
    })
  }
  return { columns, keys, filterableKeys, loaded, defaultKeys, decorate }
}
```

- [ ] **Step 4: 实现 `components/FollowupCustomCell.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import RichTextCell from '@/components/RichTextCell.vue'
import type { CustomColumn } from '@/lib/followupColumns'

const props = defineProps<{
  col: CustomColumn
  row: Record<string, any>
  editable: boolean
  save: (v: string) => Promise<unknown>
}>()

const value = computed<string>(() => String(props.row[props.col.key] ?? ''))
const editTime = computed<string>(() => {
  const t = props.row[props.col.key + 'EditTime']
  return t ? `${t}：` : ''
})
</script>

<template>
  <RichTextCell
    v-if="col.type === 'text'"
    :content="value"
    :editable="editable"
    :prefix="editTime"
    :save-handler="(html: string) => save(html)"
  />
  <el-date-picker
    v-else-if="col.type === 'date' && editable"
    :model-value="value || ''"
    type="date"
    value-format="YYYY-MM-DD"
    size="small"
    style="width: 150px"
    placeholder="选择日期"
    @click.stop
    @update:model-value="(v: string | null) => save(v ?? '')"
  />
  <span v-else>{{ value || '-' }}</span>
</template>
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/composables/useCustomColumns.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/composables/useCustomColumns.ts frontend/src/components/FollowupCustomCell.vue frontend/src/composables/useCustomColumns.test.ts
git commit -m "feat(followup-cols): useCustomColumns composable + FollowupCustomCell(文本/日期派发)"
```

---

### Task 8: `FollowupColumnConfig` 超管配置抽屉

**Files:**
- Create: `frontend/src/components/FollowupColumnConfig.vue`
- Test: `frontend/src/components/FollowupColumnConfig.test.ts`

**Interfaces:**
- Consumes: `useFollowupColumnsStore`（Task 5）；Element Plus `ElMessageBox`/`ElMessage`。
- Produces: 组件 props `{ modelValue: boolean, table: FollowupTableId }`，emit `update:modelValue`。内部完成 增/改名/切类型/切清空/上下移/删（删二次确认、提示影响行数）。

- [ ] **Step 1: 写失败测试**

`frontend/src/components/FollowupColumnConfig.test.ts`：
```typescript
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/followupColumns', () => ({ followupColumnsApi: {} }))
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import FollowupColumnConfig from '@/components/FollowupColumnConfig.vue'

describe('FollowupColumnConfig', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const s = useFollowupColumnsStore()
    s.configs = { temp: [], payment_key: [], opportunity: [],
      risk: [{ key: 'cf-a', label: '责任人', type: 'text', clearOnArchive: false }] } as any
    s.loaded = true
  })

  it('渲染现有列', () => {
    const w = mount(FollowupColumnConfig, { props: { modelValue: true, table: 'risk' } })
    expect(w.text()).toContain('责任人')
  })

  it('新增列调用 store.add', async () => {
    const s = useFollowupColumnsStore()
    const spy = vi.spyOn(s, 'add').mockResolvedValue({ key: 'cf-b', label: '截止', type: 'date', clearOnArchive: true })
    const w = mount(FollowupColumnConfig, { props: { modelValue: true, table: 'risk' } })
    await w.get('[data-test="fcc-new-label"]').setValue('截止')
    await w.get('[data-test="fcc-add"]').trigger('click')
    expect(spy).toHaveBeenCalledWith('risk', '截止', expect.any(String), expect.any(Boolean))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/FollowupColumnConfig.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 `components/FollowupColumnConfig.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import type { CustomColumnType, FollowupTableId } from '@/lib/followupColumns'

const props = defineProps<{ modelValue: boolean; table: FollowupTableId }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const store = useFollowupColumnsStore()
const cols = computed(() => store.columnsFor(props.table))

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const newLabel = ref('')
const newType = ref<CustomColumnType>('text')
const newClear = ref(false)

async function onAdd() {
  const label = newLabel.value.trim()
  if (!label) return
  try {
    await store.add(props.table, label, newType.value, newClear.value)
    newLabel.value = ''; newType.value = 'text'; newClear.value = false
  } catch (e) {
    ElMessage.error((e as Error).message || '新增失败')
  }
}
async function onRename(key: string, label: string) {
  const l = label.trim()
  if (!l) return
  try { await store.update(props.table, key, { label: l }) }
  catch (e) { ElMessage.error((e as Error).message || '改名失败') }
}
async function onToggleClear(key: string, clearOnArchive: boolean) {
  try { await store.update(props.table, key, { clearOnArchive }) }
  catch (e) { ElMessage.error((e as Error).message || '修改失败') }
}
async function onMove(key: string, dir: -1 | 1) {
  const keys = cols.value.map((c) => c.key)
  const i = keys.indexOf(key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= keys.length) return
  ;[keys[i], keys[j]] = [keys[j], keys[i]]
  try { await store.reorder(props.table, keys) }
  catch (e) { ElMessage.error((e as Error).message || '重排失败') }
}
async function onDelete(key: string, label: string) {
  try {
    await ElMessageBox.confirm(
      `将删除列「${label}」，并清除该列在当前数据里已填写的全部值（历史归档不受影响）。此操作不可撤销。`,
      '删除自定义列', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch { return }
  try {
    const r = await store.remove(props.table, key)
    ElMessage.success(`已删除列「${label}」，清除 ${r.affectedRows} 行值`)
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}
</script>

<template>
  <el-drawer v-model="open" title="列设置（自定义列）" size="480px" append-to-body>
    <div class="fcc">
      <div class="fcc-hint">超管可为本表增加供其他管理员填写的列（文本/日期）。每表最多 8 列。</div>
      <div v-for="c in cols" :key="c.key" class="fcc-row" data-test="fcc-col">
        <el-input :model-value="c.label" size="small" style="width: 130px" maxlength="20"
          @change="(v: string) => onRename(c.key, v)" />
        <span class="fcc-type">{{ c.type === 'date' ? '日期' : '文本' }}</span>
        <el-checkbox :model-value="c.clearOnArchive" label="归档清空"
          @update:model-value="(v: boolean) => onToggleClear(c.key, v)" />
        <button class="fcc-mini" title="上移" @click="onMove(c.key, -1)">↑</button>
        <button class="fcc-mini" title="下移" @click="onMove(c.key, 1)">↓</button>
        <button class="fcc-mini fcc-del" title="删除" @click="onDelete(c.key, c.label)">✕</button>
      </div>
      <div v-if="!cols.length" class="fcc-empty">暂无自定义列。</div>

      <div class="fcc-new">
        <el-input v-model="newLabel" size="small" style="width: 130px" maxlength="20"
          placeholder="新列名" data-test="fcc-new-label" />
        <el-select v-model="newType" size="small" style="width: 90px">
          <el-option label="文本" value="text" />
          <el-option label="日期" value="date" />
        </el-select>
        <el-checkbox v-model="newClear" label="归档清空" />
        <el-button size="small" type="primary" :disabled="cols.length >= 8 || !newLabel.trim()"
          data-test="fcc-add" @click="onAdd">添加</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.fcc { display: flex; flex-direction: column; gap: var(--sp-3); }
.fcc-hint { font-size: var(--fs-1); color: var(--mut); }
.fcc-row { display: flex; align-items: center; gap: var(--sp-2); }
.fcc-type { font-size: var(--fs-1); color: var(--sub); width: 32px; }
.fcc-new { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-3);
  padding-top: var(--sp-3); border-top: 1px solid var(--line); flex-wrap: wrap; }
.fcc-mini { border: 1px solid var(--line); background: var(--card); border-radius: var(--r-sm);
  cursor: pointer; padding: 2px 6px; color: var(--sub); }
.fcc-mini:hover { background: var(--hover-tint); }
.fcc-del:hover { color: var(--danger); }
.fcc-empty { font-size: var(--fs-1); color: var(--mut); }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/FollowupColumnConfig.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/FollowupColumnConfig.vue frontend/src/components/FollowupColumnConfig.test.ts
git commit -m "feat(followup-cols): FollowupColumnConfig 超管配置抽屉(增删改名/切清空/重排)"
```

---

## 视图接入通用配方（Task 9–12 共用，各任务给具体代码）

每张视图统一改 5 处（各任务按该视图的 store/rowKey/TABLE_ID/静态列填具体值）：

1. **import**：`useCustomColumns`、`FollowupColumnConfig`、`useFollowupColumnsStore`、`useColumnPrefsDynamic`（替换 `useColumnPrefs`，risk 已是 dynamic 免替换）。
2. **实例化**：`const fcStore = useFollowupColumnsStore()`；`onMounted` 里 `if (!fcStore.loaded) fcStore.load()`；`const custom = useCustomColumns('<table>', { current: <store>.current 的 ref, rowKey: (r) => r.<键> })`。
3. **数据 decorate**：把喂给 `useFollowupPage` 的当前行源换成 `computed(() => custom.decorate(<原currentRows>.value))`；归档时也传 decorate 后的行。
4. **列合并**：`ALL_COLUMNS` 改 computed，在内置跟进列之后接 `...custom.columns.value`；`allKeys` 改 `computed(() => custom.loaded.value ? [...静态key, ...custom.keys.value] : [])`；`prefs` 换 `useColumnPrefsDynamic(key, allKeys, () => [...静态DEFAULT, ...custom.defaultKeys()])`；`FILTERABLE` 并入 `custom.filterableKeys.value`。
5. **模板**：加泛型 cell 模板 + 工具栏「列设置」按钮 + `<FollowupColumnConfig>`：
```vue
<template v-for="col in custom.columns.value" :key="col.key" #[`cell-${col.key}`]="{ row }">
  <FollowupCustomCell :col="col" :row="row" :editable="fp.isCurrent.value"
    :save="(v: string) => <store>.update((row as <Row>).<键>, col.key, v)" />
</template>
```
```vue
<button v-if="auth.isSuper" class="kp-archive-btn" @click="colCfgOpen = true">列设置</button>
...
<FollowupColumnConfig v-if="auth.isSuper" v-model="colCfgOpen" table="<table>" />
```
6. **放宽 store `update` field 类型**：把该 store `update(key, field: '<union>', content)` 的 `field` 类型改为 `string`（自定义 key 是运行期字符串；服务端已校验合法性）。

> `FILTERABLE`/`FollowupCustomCell` import、`colCfgOpen = ref(false)` 一并加。

---

### Task 9: 接入 `/risk`（RiskFollowupView.vue）

**Files:**
- Modify: `frontend/src/views/RiskFollowupView.vue`
- Modify: `frontend/src/stores/riskFollowup.ts`（`update` field 放宽为 `string`）
- Test: `frontend/src/views/RiskFollowupView.test.ts`（加自定义列渲染用例）

**Interfaces:**
- Consumes: `useCustomColumns('risk', {current: risk.current(ref), rowKey: r=>r.riskKey})`；`risk.update(riskKey, field: string, content)`。
- rowKey = `riskKey`；store = `risk`（`useRiskFollowupStore`）；TABLE_ID 持久化键 = `'risk-followup'`；已用 `useColumnPrefsDynamic`。

- [ ] **Step 1: 放宽 store update 类型**

`frontend/src/stores/riskFollowup.ts:26`：
```typescript
  async function update(riskKey: string, field: string, content: string) {
```
（`riskFollowupApi.update` 的 field 形参同步放宽为 `string`，若其有窄类型。）

- [ ] **Step 2: 写失败测试**

在 `frontend/src/views/RiskFollowupView.test.ts` 加（mock followupColumns store 返回一个 text 列，断言表头出现该列名）：
```typescript
it('渲染超管配置的自定义列表头', async () => {
  const fc = useFollowupColumnsStore()
  fc.configs = { temp: [], payment_key: [], opportunity: [],
    risk: [{ key: 'cf-z', label: '整改责任人', type: 'text', clearOnArchive: false }] } as any
  fc.loaded = true
  // ...沿用该测试既有挂载/数据装载夹具...
  await flushAll()
  expect(wrapper.text()).toContain('整改责任人')
})
```
> 具体夹具沿用该文件既有 `beforeEach`（Pinia + mock data/risk store + 挂载）；只需额外 `useFollowupColumnsStore()` 预置并确保组件 onMounted 装载它。若既有测试未 mock `@/lib/followupColumns`，加 `vi.mock('@/lib/followupColumns', () => ({ followupColumnsApi: {} }))`。

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts`
Expected: FAIL（表头无「整改责任人」）

- [ ] **Step 4: 改 `RiskFollowupView.vue`（按通用配方）**

- import 区加：
```typescript
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import { useCustomColumns } from '@/composables/useCustomColumns'
import FollowupCustomCell from '@/components/FollowupCustomCell.vue'
import FollowupColumnConfig from '@/components/FollowupColumnConfig.vue'
```
- setup 加：
```typescript
const fcStore = useFollowupColumnsStore()
const custom = useCustomColumns('risk', { current: risk.current as any, rowKey: (r) => r.riskKey })
const colCfgOpen = ref(false)
```
（`risk.current` 是 store 的 ref；`useCustomColumns` 内 `.value` 读，传 `risk.current` 本体。`onMounted` 里加 `if (!fcStore.loaded) fcStore.load()`。）
- `allRows` 用 decorate 包一层（自定义值上行，供排序/筛选/导出）：
```typescript
const allRows = computed<RiskRow[]>(() =>
  custom.decorate(buildRiskRows(projects.value, pmisMap.value, risk.current)) as RiskRow[])
```
- `FOLLOW_COLS` 之后并入自定义列。把 `ALL_COLUMNS` 与 `allKeys`/`DEFAULT_VISIBLE`/`FILTERABLE`/`prefs` 调整为：
```typescript
const ALL_COLUMNS = computed<DataColumn[]>(() =>
  data.data ? [...riskCols.value, ...PROJECT_COLS, ...FOLLOW_COLS, ...custom.columns.value] : [])
// NON_RISK_KEYS 追加自定义 key,避免自定义列被误当风险动态列重复渲染:
const NON_RISK_KEYS = computed(() => new Set<string>([
  ...PROJECT_COLS.map((c) => c.key), ...FOLLOW_COLS.map((c) => c.key), ...custom.keys.value,
  'projectId', 'riskKey',
  'followActionEditTime', 'followActionEditBy', 'revConclusionEditTime', 'revConclusionEditBy',
  'nextRevDateEditTime', 'nextRevDateEditBy',
]))
```
（`riskCols` 内 `NON_RISK_KEYS.has(k)` 改用 `NON_RISK_KEYS.value.has(k)`；并给自定义列 EditTime/EditBy 也隐掉——decorate 会把它们并进行对象，但它们不在 `ALL_COLUMNS` 里、不会成列，唯一风险是 `riskCols` 的“未知列”扫描把它们当风险列，故须在排除集内。补充：把 `custom.keys.value` 的每个 key 的 `+EditTime/+EditBy` 也加进排除集。）
```typescript
const FILTERABLE = computed(() => new Set([
  '风险等级', '风险状态', '风险大类', '风险小类', '项目级别', '项目经理', 'L4组织', '项目类型', '项目状态', '客户', 'nextRevDate',
  ...custom.filterableKeys.value,
]))
const DEFAULT_VISIBLE = ['风险编码', '风险等级', '风险状态', '项目编号', '项目名称', '项目金额', '项目级别', '项目经理', 'L4组织',
  '风险名称', '风险大类', '风险小类', '风险描述', 'followAction', 'revConclusion', 'nextRevDate']
const prefs = useColumnPrefsDynamic(userScopedKey(TABLE_ID), allKeys,
  () => [...DEFAULT_VISIBLE, ...custom.defaultKeys()])
```
（`allKeys` 保持 `computed(() => ALL_COLUMNS.value.map((c) => c.key))`——已随 data.data 门控为空/满，自定义列随 `ALL_COLUMNS` 一并出现，dynamic init 一次成型。）
（模板里 `FILTERABLE.has(...)` 改 `FILTERABLE.value.has(...)`。）
- doArchive 传 decorate 后的行：`risk.archive(allRows.value as ...)`（`currentRows===scopedRows===allRows` 链已带自定义值）。当前 `doArchive` 用 `currentRows.value`，因 `allRows` 已 decorate、`currentRows` 派生自它，无需再改。
- 模板：工具栏「归档」按钮附近加「列设置」按钮；DataTable 内 `#cell-nextRevDate` 模板之后加泛型自定义列模板：
```vue
<template v-for="col in custom.columns.value" :key="col.key" #[`cell-${col.key}`]="{ row }">
  <FollowupCustomCell :col="col" :row="row" :editable="fp.isCurrent.value"
    :save="(v: string) => risk.update((row as RiskRow).riskKey, col.key, v)" />
</template>
```
根节点末尾加：`<FollowupColumnConfig v-if="auth.isSuper" v-model="colCfgOpen" table="risk" />`

- [ ] **Step 5: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/views/RiskFollowupView.test.ts && npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: PASS（含新用例）+ 无类型错

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/RiskFollowupView.vue frontend/src/stores/riskFollowup.ts frontend/src/lib/riskFollowupApi.ts frontend/src/views/RiskFollowupView.test.ts
git commit -m "feat(followup-cols): /risk 接入自定义列(列设置+泛型cell+decorate)"
```

---

### Task 10: 接入 `/payment/key`（PaymentKeyFollowupView.vue）

**Files:**
- Modify: `frontend/src/views/PaymentKeyFollowupView.vue`
- Modify: `frontend/src/stores/paymentKeyFollowup.ts`（`update` field → `string`）
- Test: `frontend/src/views/PaymentKeyFollowupView.test.ts`（加自定义列表头用例）

**Interfaces:**
- rowKey = `projectId`；store = `pk`（`usePaymentKeyFollowupStore`）；TABLE_ID = `'payment-key'`；当前用 `useColumnPrefs`（静态）→ 换 `useColumnPrefsDynamic`。
- Consumes: `useCustomColumns('payment_key', {current: pk.current, rowKey: r=>r.projectId})`。

- [ ] **Step 1: 放宽 store update 类型**

`frontend/src/stores/paymentKeyFollowup.ts:27`：`field: 'followAction' | 'revConclusion' | 'nextRevDate'` → `field: string`（并同步 `paymentKeyFollowupApi.update`）。

- [ ] **Step 2: 写失败测试**（同 Task 9 形，mock followupColumns store 给 payment_key 一个 date 列，断言表头出现列名，且该列可筛选图标存在或 FILTERABLE 含之——最简：断言表头文本含列名）

Run: `cd frontend && npx vitest run src/views/PaymentKeyFollowupView.test.ts` → 先失败。

- [ ] **Step 3: 改视图（按通用配方）**

- import 加 4 个（含 `useColumnPrefsDynamic` 替换 `useColumnPrefs`）。
- setup：`const fcStore = useFollowupColumnsStore()`（onMounted 装载）；`const custom = useCustomColumns('payment_key', { current: pk.current as any, rowKey: (r) => r.projectId })`；`const colCfgOpen = ref(false)`。
- 行源 decorate：把喂 `useFollowupPage` 的当前行 `currentRows`（该视图构建风险/回款行处）包一层 `computed(() => custom.decorate(<原>.value))`。
- `ALL_COLUMNS` 改 computed 接 `...custom.columns.value`；`allKeys` = `computed(() => [...ALL_COLUMNS.value.map(c=>c.key)])`；因该视图静态列恒在，为避免 dynamic init 早锁，改门控：`computed(() => custom.loaded.value ? ALL_COLUMNS.value.map(c=>c.key) : [])`；`prefs = useColumnPrefsDynamic(userScopedKey(TABLE_ID), allKeys, () => [...DEFAULT_VISIBLE, ...custom.defaultKeys()])`；`FILTERABLE` 并 `custom.filterableKeys.value`（改 computed，模板 `.value`）。
- 模板：`#cell-nextRevDate` 后加泛型自定义列模板（`pk.update((row as PaymentKeyRow).projectId, col.key, v)`）；工具栏加「列设置」；根末加 `<FollowupColumnConfig v-if="auth.isSuper" v-model="colCfgOpen" table="payment_key" />`。

- [ ] **Step 4: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/views/PaymentKeyFollowupView.test.ts && npx vue-tsc --noEmit -p tsconfig.app.json`
Expected: PASS + 无类型错

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/PaymentKeyFollowupView.vue frontend/src/stores/paymentKeyFollowup.ts frontend/src/lib/paymentKeyFollowupApi.ts frontend/src/views/PaymentKeyFollowupView.test.ts
git commit -m "feat(followup-cols): /payment/key 接入自定义列(切 dynamic prefs)"
```

---

### Task 11: 接入 `/opportunities/key`（OpportunityFollowupView.vue）

**Files:**
- Modify: `frontend/src/views/OpportunityFollowupView.vue`
- Modify: `frontend/src/stores/opportunityFollowup.ts`（`update` field → `string`）
- Test: `frontend/src/views/OpportunityFollowupView.test.ts`（若无则建，最小自定义列表头用例）

**Interfaces:**
- rowKey = `id`（`OppFollowupRow.id`）；store = `oppf`（`useOpportunityFollowupStore`）；TABLE_ID = `'opportunity-followup'`；当前 `useColumnPrefs` → 换 `useColumnPrefsDynamic`。
- Consumes: `useCustomColumns('opportunity', {current: oppf.current, rowKey: r=>r.id})`。

- [ ] **Step 1: 放宽 store update 类型**（`opportunityFollowup.ts:27` field → `string`，同步 api）

- [ ] **Step 2: 写失败测试**（mock followupColumns 给 opportunity 一个 text 列，断言表头含列名）→ 先失败。

- [ ] **Step 3: 改视图（按通用配方）**

- import 加 4 个（含 dynamic 替换）。
- setup：`fcStore` + onMounted 装载；`const custom = useCustomColumns('opportunity', { current: oppf.current as any, rowKey: (r) => r.id })`；`colCfgOpen`。
- 行源 decorate：`allRows`（`buildOppFollowupRows(...)`）外包 `custom.decorate`：
```typescript
const allRows = computed<OppFollowupRow[]>(() =>
  custom.decorate(buildOppFollowupRows(scopedOpportunities.value, oppf.current, now)) as OppFollowupRow[])
```
- `ALL_COLUMNS` computed 接 `...custom.columns.value`（`withSortable([...OPP_COLUMNS.map(oppToDataColumn), ...FOLLOWUP_COLUMNS, ...custom.columns.value])`）；`allKeys` 门控 `custom.loaded`；`prefs = useColumnPrefsDynamic(...)` getter 默认；`FILTERABLE` 并 date 列（computed）。
- 模板：`#cell-nextPlan` 后加泛型自定义列模板（`oppf.update((row as OppFollowupRow).id, col.key, v)`）；工具栏加「列设置」；根末加 `<FollowupColumnConfig v-if="auth.isSuper" v-model="colCfgOpen" table="opportunity" />`。

- [ ] **Step 4: 跑测试 + typecheck** → PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/OpportunityFollowupView.vue frontend/src/stores/opportunityFollowup.ts frontend/src/lib/opportunityFollowupApi.ts frontend/src/views/OpportunityFollowupView.test.ts
git commit -m "feat(followup-cols): /opportunities/key 接入自定义列(切 dynamic prefs)"
```

---

### Task 12: 接入 `/projects/temp`（TempInstancePanel.vue）

**Files:**
- Modify: `frontend/src/components/TempInstancePanel.vue`
- Modify: `frontend/src/views/TempFollowupView.vue`（onMounted 预载 followupColumns，避免子面板挂载时未加载导致列闪烁）
- Modify: `frontend/src/stores/tempFollowup.ts`（`update` field → `string`）
- Test: `frontend/src/components/TempInstancePanel.test.ts`（若无则建，自定义列表头用例）

**Interfaces:**
- rowKey = `projectId`；store = `temp`（`useTempFollowupStore`）；列持久化键 = `temp-followup:{activeId}`（保留），自定义列配置键 = 后端 `'temp'`（表级共享，全实例共用同一套列）。
- Consumes: `useCustomColumns('temp', {current: temp.current, rowKey: r=>r.projectId})`；当前 `useColumnPrefs` → 换 `useColumnPrefsDynamic`。

- [ ] **Step 1: 放宽 store update 类型**（`tempFollowup.ts` 的 `update` field → `string`，同步 api）

- [ ] **Step 2: TempFollowupView.vue 预载配置**

`onMounted` 内 `await temp.load()` 之后加：
```typescript
const fcStore = useFollowupColumnsStore()
if (!fcStore.loaded) await fcStore.load()
```
（import `useFollowupColumnsStore`。预载后子面板挂载时 `custom.loaded` 已真、`allKeys` 一次成型，无闪烁、无 dynamic 早锁。）

- [ ] **Step 3: 写失败测试**（mount TempInstancePanel，Pinia 预置 followupColumns 给 temp 一个 text 列 + temp store 一个实例/若干行，断言表头含列名）→ 先失败。

- [ ] **Step 4: 改 TempInstancePanel.vue（按通用配方）**

- import 加 4 个（`useColumnPrefsDynamic` 替换 `useColumnPrefs`）。
- setup：`const custom = useCustomColumns('temp', { current: temp.current as any, rowKey: (r) => r.projectId })`；`const colCfgOpen = ref(false)`。
- 行源 decorate：
```typescript
const currentRows = computed<TempRow[]>(() =>
  custom.decorate(buildTempRows(projects.value, pmisMap.value, temp.current, inScopeIds.value)) as TempRow[])
```
- `ALL_COLUMNS` 由 `const` 静态改 computed：`computed(() => withSortable([...原静态数组, ...custom.columns.value]))`；`ALL_KEYS` 改 `computed(() => custom.loaded.value ? ALL_COLUMNS.value.map(c=>c.key) : [])`；`prefs = useColumnPrefsDynamic(userScopedKey(TABLE_ID), ALL_KEYS, () => [...DEFAULT_VISIBLE, ...custom.defaultKeys()])`；`pickerColumns` 改 computed；`FILTERABLE` 并 date 列（computed，模板 `.value`）；`visibleColumns` 里 `ALL_COLUMNS.find` → `ALL_COLUMNS.value.find`。
- 模板：`#cell-nextPlan` 后加泛型自定义列模板（`temp.update((row as TempRow).projectId, col.key, v)`）；工具栏加「列设置」按钮；根末加 `<FollowupColumnConfig v-if="auth.isSuper" v-model="colCfgOpen" table="temp" />`。
- 归档：`doArchive` 送 `currentRows.value`（已 decorate）——无需再改（`currentRows` 现已带自定义值）。

- [ ] **Step 5: 跑测试 + typecheck** → PASS。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/TempInstancePanel.vue frontend/src/views/TempFollowupView.vue frontend/src/stores/tempFollowup.ts frontend/src/lib/tempFollowupApi.ts frontend/src/components/TempInstancePanel.test.ts
git commit -m "feat(followup-cols): /projects/temp 接入自定义列(面板+预载配置避闪烁)"
```

---

### Task 13: 版本号 + PROGRESS + 全量验证 + 手动冒烟

**Files:**
- Modify: `frontend/src/version.ts`（版本号由用户钦定，占位 `V4.4.0`，落地前与用户确认）
- Modify: `PROGRESS.md`（记本次交付 + 已知边界）
- Modify: `CLAUDE.md`（§4 关键约定加「跟进表自定义列」一节，约束值内联/删列清值/归档按列）

**Interfaces:** 无（收尾）。

- [ ] **Step 1: 升版本号（在 verify 之前）**

`frontend/src/version.ts`：`APP_VERSION = '<用户钦定>'`，`RELEASE_DATE = '2026-07-22'`。

- [ ] **Step 2: 更新 PROGRESS.md**

在版本史顶部加一条：`V<x>.<y>.<z> 跟进表超管自定义列（4 表：文本/日期列，列名+归档清空可配，值内联，删列清值）`；backlog 记「重点项目进展表暂未接入自定义列（独立代码路径）」「每表 8 列软上限」。

- [ ] **Step 3: 更新 CLAUDE.md §4**

加一小节「跟进表自定义列约定」：值内联 store.current（非第二数据源）；删列即删当前值（历史归档冻结）；归档按列清空叠加表级行为；配置 `data/followup_columns.json`（已 gitignore，无需点更新数据）。

- [ ] **Step 4: 确认 .gitignore 覆盖配置文件**

Run: `git check-ignore data/followup_columns.json`
Expected: 打印该路径（已被 `data/*.json` 覆盖）；若无输出则在 `.gitignore` 显式加 `data/followup_columns.json`。

- [ ] **Step 5: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 6: 手动冒烟（真实启动）**

启动 `python server.py` + `cd frontend && npm run dev`，超管登录：
1. `/risk` 工具栏「列设置」→ 加文本列「整改责任人」+ 日期列「计划完成」（勾归档清空）；表格出现两列。
2. 用普通管理员（或超管）在当前数据填两列；刷新 `/risk` 值仍在；日期列可筛选、可排序。
3. `/risk` 归档（留存跟进）→ 「整改责任人」留存、「计划完成」被清空（因勾了归档清空）；历史快照两列值都在。
4. `/projects/temp`、`/payment/key`、`/opportunities/key` 各加一列并填写，确认各自独立（改一表不影响另一表）。
5. 「列设置」删一列 → 二次确认 → 提示影响行数 → 表格该列消失、值已清；历史归档不受影响。
6. 普通管理员登录：看不到「列设置」按钮，但能看到并填写超管已建的列。

- [ ] **Step 7: 最终提交 + 推送**

```bash
git add frontend/src/version.ts PROGRESS.md CLAUDE.md .gitignore
git commit -m "release: V<x>.<y>.<z> 跟进表超管自定义列"
git push origin master
```

---

## Self-Review（写完计划自检）

- **Spec 覆盖**：§4 数据模型→Task1；§5.1→Task1；§5.2→Task2；§5.3 端点/接线/删值→Task3+4；§6 归档语义→Task2(引擎)+Task4(算 clear_fields)+Task1(clear_field_keys 四象限测试)；§7 前端 lib/store→Task5、composable/cell→Task7、抽屉→Task8、4 视图→Task9-12；§8 权限→Task3(_SUPER_ONLY_PATHS)+Task8(isSuper 按钮)+Task4(值填写复用现有登录校验)；§9 测试→各任务 TDD + Task13 verify；§10 升级/§11 边界→Task13 PROGRESS/CLAUDE。**新增缺口补齐**：行构建器白名单不 spread → 新增 `decorate`（Task7）+ 各视图接入（配方第 3 条）；temp/opp/paykey 静态 prefs → 切 dynamic + getter 默认（Task6）。
- **占位符扫描**：无 TBD/TODO；每个改代码步给完整代码或精确锚点（既有大文件只给增改块 + 行锚，符合「跟随既有大文件、不整体重排」）。
- **类型一致性**：`extra_fields`/`clear_fields` 引擎↔4 域↔server 一致；`CustomColumn`/`FollowupTableId` lib↔store↔composable↔组件一致；`useCustomColumns` 返回 `columns/keys/filterableKeys/loaded/defaultKeys/decorate` 在 Task7 定义、Task9-12 消费一致；`update(key, field: string, content)` 放宽在各 store 与其消费视图一致。
- **端点形状**：改为静态 POST 路径（`/add|/update|/reorder|/delete`），与 `map_action` 精确匹配、与 spec 的 PATCH/<key> 表述已在计划顶部对齐说明（spec 端点表同步更新）。
