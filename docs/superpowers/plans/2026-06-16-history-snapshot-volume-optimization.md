# 历史快照体积优化（分组留存）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把历史快照从"每份全量(产出+源)留 3 份"改为"JSON 产出留 5 份 + Excel 源(input)共享 1 份、yundocs_data 不再归档"，省体积约 45% 且可回滚版本数 3→5。

**Architecture:** 重构 `data_history.py`：`LIVE_ITEMS` 拆为 `JSON_ITEMS`(版本化留 5) 与 `SOURCE_ITEMS`(刷新到全局 `_source/` 只留 1)，`KEEP=5`；回滚只还原 JSON 产出、不动 live 源；`list_versions` 增 `source` 字段。server.py 不动(API 透传)。前端 `useDataHistory` 增 `source`、DataView 卡改留存份数文案+源说明。

**Tech Stack:** Python 标准库(data_history.py)；Vue3+TS(useDataHistory/DataView)；pytest + Vitest。

**版本：** `frontend/src/version.ts` **V1.6.0 → V1.6.1**（/data 数据历史卡本地行为调整，Z 级）。

---

## 关键事实（已核实）

`data_history.py`（当前，将被改）：
- 常量 `HISTORY_DIRNAME="history"`、`PRE_ROLLBACK="_pre_rollback"`、`KEEP=3`、`MANIFEST="manifest.json"`；`LIVE_ITEMS=[(data/analysis_data.json,file),(data/events.json,file),(data/snapshots,dir),(yundocs_data,dir),(input,dir)]`。
- 辅助：`_history_root`、`_dir_size`、`_copy_item`(copy-then-swap)、`_snapshot_live_into(base,dest)`、`_restore_into_live(base,src)`、`_read_meta`(读 analysis_data.json 的 meta)、`_read_manifest`、`_version_ids`(列目录排除 `_pre_rollback`，倒序)。
- 公开：`archive_version(base,version_id=None)`、`list_versions(base)`→`{versions,preRollback}`、`prune(base,keep)`、`rollback(base,version_id)`(先备份 live 到 `_pre_rollback` 再覆盖回 live，失败回退)、`undo_rollback(base)`。

server.py（不需改，仅核对）：`archive_version(BASE_DIR)`(:1334 reprocess 成功)、`list_versions(BASE_DIR)`(:1091 直接 `_json_response`)、`rollback(BASE_DIR,vid)`(:1114)、`undo_rollback(BASE_DIR)`(:1134)。新 `source` 字段随 `list_versions` 返回体自动透传前端。

前端：
- `frontend/src/composables/useDataHistory.ts`：`HistoryVersion{id,createdAt?,projectCount?,paymentNodeCount?,dataLastUpdate?,sizeBytes?,contents?}`、`HistoryResp{versions,preRollback}`、`load/rollback/undo`。
- `frontend/src/views/DataView.vue`：数据历史卡(:264-278)——解构 `useDataHistory` 于 :79-81；空态文案"保留最近 3 份"(:271)；版本行(:272-276)。
- 测试范式：`tests/test_data_history.py`(tmp_path archive/prune/rollback/undo/无残渣)；`frontend/src/views/DataView.test.ts`。

---

## File Structure

修改：
- `data_history.py` — 分组留存重构（常量拆分 + 辅助加 items 参数 + `_refresh_source` + archive/list/rollback/undo 改 JSON 组 + KEEP=5）。
- `tests/test_data_history.py` — 整体重写为新行为（旧用例断言旧全量布局，作废）。
- `frontend/src/composables/useDataHistory.ts` — 加 `HistorySource` + `source`。
- `frontend/src/views/DataView.vue` — 留存份数文案 5 + 源说明行。
- `frontend/src/views/DataView.test.ts` — 对齐文案/源说明。
- `frontend/src/version.ts`、`PROGRESS.md`。

**不做（YAGNI）**：停用云同步/删 fetch_yundocs；内容哈希去重；zip 压缩；KEEP 做成 UI 可配；触碰 `manual_history.py`(2E)。

---

## Task 1: `data_history.py` 分组留存重构 + 测试重写

**难度：易踩坑（copy-then-swap / 留存边界 / 向后兼容）→ opus。**

**Files:**
- Modify: `data_history.py`
- Test（整体重写）: `tests/test_data_history.py`

- [ ] **Step 1: 整体重写 `tests/test_data_history.py` 为新行为（先红）**

把文件内容整体替换为：
```python
import json
import os

import data_history as DH


def _seed(base):
    """造 base_dir：data/analysis_data.json(带 meta)/events.json/snapshots + input(源) + yundocs_data(live,应不进快照)。"""
    os.makedirs(os.path.join(base, "data", "snapshots"), exist_ok=True)
    os.makedirs(os.path.join(base, "yundocs_data"), exist_ok=True)
    os.makedirs(os.path.join(base, "input"), exist_ok=True)
    with open(os.path.join(base, "data", "analysis_data.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {"totalProjects": 5, "totalPaymentNodes": 12, "lastUpdate": "2026-06-15 10:00"},
                   "marker": "v1"}, f)
    with open(os.path.join(base, "data", "events.json"), "w", encoding="utf-8") as f:
        json.dump([{"e": 1}], f)
    with open(os.path.join(base, "data", "snapshots", "2026-06-15.json"), "w", encoding="utf-8") as f:
        f.write("{}")
    with open(os.path.join(base, "yundocs_data", "src.json"), "w", encoding="utf-8") as f:
        f.write("src-v1")
    with open(os.path.join(base, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("input-v1")


def _set_marker(base, marker):
    with open(os.path.join(base, "data", "analysis_data.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {"totalProjects": 5, "totalPaymentNodes": 12, "lastUpdate": "x"}, "marker": marker}, f)


def test_archive_version_only_json_no_source(tmp_path):
    base = str(tmp_path)
    _seed(base)
    mf = DH.archive_version(base, version_id="20260616-100000")
    vdir = os.path.join(base, "data", "history", "20260616-100000")
    assert os.path.isfile(os.path.join(vdir, "analysis_data.json"))
    assert os.path.isfile(os.path.join(vdir, "events.json"))
    assert os.path.isdir(os.path.join(vdir, "snapshots"))
    # 源不进版本目录
    assert not os.path.exists(os.path.join(vdir, "input"))
    assert not os.path.exists(os.path.join(vdir, "yundocs_data"))
    assert set(mf["contents"]) == {"analysis_data.json", "events.json", "snapshots"}
    assert mf["projectCount"] == 5 and mf["paymentNodeCount"] == 12 and mf["sizeBytes"] > 0


def test_source_kept_single_and_refreshed(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260616-100000")
    sdir = os.path.join(base, "data", "history", "_source")
    assert os.path.isfile(os.path.join(sdir, "input", "y.csv"))
    with open(os.path.join(sdir, "input", "y.csv"), encoding="utf-8") as f:
        assert f.read() == "input-v1"
    # 改 live input 再 archive：_source 刷新为最新，仍只 1 份
    with open(os.path.join(base, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("input-v2")
    DH.archive_version(base, version_id="20260616-100001")
    with open(os.path.join(sdir, "input", "y.csv"), encoding="utf-8") as f:
        assert f.read() == "input-v2"
    src_mf = DH.list_versions(base)["source"]
    assert src_mf and src_mf["refreshedFrom"] == "20260616-100001"


def test_prune_keeps_latest_five(tmp_path):
    base = str(tmp_path)
    _seed(base)
    for i in range(7):
        DH.archive_version(base, version_id=f"20260616-10000{i}")
    ids = [v["id"] for v in DH.list_versions(base)["versions"]]
    assert len(ids) == 5
    assert ids[0] == "20260616-100006"  # 最新在前
    assert "20260616-100000" not in ids and "20260616-100001" not in ids
    # _source / _pre_rollback 不计入版本，也不被剪
    assert os.path.isdir(os.path.join(base, "data", "history", "_source"))


def test_rollback_restores_json_only_keeps_live_source(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260616-100000")   # 存 marker=v1, input-v1
    _set_marker(base, "v2")                                   # live JSON -> v2
    with open(os.path.join(base, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("input-v2")                                   # live 源 -> v2
    res = DH.rollback(base, "20260616-100000")
    assert res["id"] == "20260616-100000"
    with open(os.path.join(base, "data", "analysis_data.json"), encoding="utf-8") as f:
        assert json.load(f)["marker"] == "v1"                # JSON 产出已还原
    with open(os.path.join(base, "input", "y.csv"), encoding="utf-8") as f:
        assert f.read() == "input-v2"                        # live 源保持最新不动
    assert DH.list_versions(base)["preRollback"] is not None


def test_undo_rollback_restores_pre_json(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260616-100000")
    _set_marker(base, "v2")
    DH.rollback(base, "20260616-100000")                     # JSON v2 -> v1
    DH.undo_rollback(base)                                    # 撤销 -> v2
    with open(os.path.join(base, "data", "analysis_data.json"), encoding="utf-8") as f:
        assert json.load(f)["marker"] == "v2"


def test_rollback_missing_version_raises(tmp_path):
    base = str(tmp_path)
    _seed(base)
    import pytest
    with pytest.raises(FileNotFoundError):
        DH.rollback(base, "nope")


def test_archive_skips_absent_items(tmp_path):
    base = str(tmp_path)
    os.makedirs(os.path.join(base, "data"), exist_ok=True)
    with open(os.path.join(base, "data", "analysis_data.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {}}, f)                            # 仅 analysis_data.json
    mf = DH.archive_version(base, version_id="20260616-100000")
    assert mf["contents"] == ["analysis_data.json"]
    assert mf["projectCount"] == 0
    # 无 live input -> _source 无 input 子项（不报错）
    sdir = os.path.join(base, "data", "history", "_source")
    assert not os.path.exists(os.path.join(sdir, "input"))


def test_backward_compat_rollback_old_full_layout(tmp_path):
    """旧全量布局版本目录(含 input)回滚时只还原 JSON 产出、不动 live input。"""
    base = str(tmp_path)
    _seed(base)
    vdir = os.path.join(base, "data", "history", "20260601-090000")
    os.makedirs(os.path.join(vdir, "snapshots"), exist_ok=True)
    os.makedirs(os.path.join(vdir, "input"), exist_ok=True)
    with open(os.path.join(vdir, "analysis_data.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": {}, "marker": "old"}, f)
    with open(os.path.join(vdir, "events.json"), "w", encoding="utf-8") as f:
        f.write("[]")
    with open(os.path.join(vdir, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("old-input")
    with open(os.path.join(vdir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"id": "20260601-090000", "contents": ["analysis_data.json", "events.json", "snapshots", "input"]}, f)
    _set_marker(base, "live")
    with open(os.path.join(base, "input", "y.csv"), "w", encoding="utf-8") as f:
        f.write("live-input")
    DH.rollback(base, "20260601-090000")
    with open(os.path.join(base, "data", "analysis_data.json"), encoding="utf-8") as f:
        assert json.load(f)["marker"] == "old"               # JSON 还原
    with open(os.path.join(base, "input", "y.csv"), encoding="utf-8") as f:
        assert f.read() == "live-input"                      # live 源不动(旧目录 input 被忽略)


def test_no_tmp_residue(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260616-100000")
    _set_marker(base, "v2")
    DH.rollback(base, "20260616-100000")
    leftovers = [os.path.join(root, n)
                 for root, dirs, files in os.walk(base)
                 for n in list(dirs) + list(files) if n.endswith(".tmp")]
    assert leftovers == []
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_data_history.py -q`
Expected: FAIL（旧实现会把 input/yundocs 也归档、回滚会动 live 源、prune 保 3、无 `source` 键）。

- [ ] **Step 3: 重构 `data_history.py`**

3a. 改顶部 docstring 与常量块（替换原 `KEEP=3` 与 `LIVE_ITEMS` 段）：
```python
"""数据历史版本化与回滚（分组留存）。
每次"更新数据"成功后：JSON 产出存为新版本目录(留 KEEP 份)，Excel 源(input)刷新到全局共享
_source/(只留最新 1 份)；yundocs_data 不再归档(live 与云同步不受影响)。回滚只还原 JSON 产出，
不动 live 源。与 data/snapshots/(Phase P3 项目域日 diff)无关；本模块所有路径相对 base_dir。
"""
import json
import os
import shutil
from datetime import datetime
from typing import Any, Dict, List, Optional

HISTORY_DIRNAME = "history"
PRE_ROLLBACK = "_pre_rollback"
SOURCE_DIRNAME = "_source"
KEEP = 5
MANIFEST = "manifest.json"

# JSON 产出组：每次 reprocess 存新版本目录，留 KEEP 份。看板唯一数据源在此。
JSON_ITEMS = [
    ("data/analysis_data.json", "file"),
    ("data/events.json", "file"),
    ("data/snapshots", "dir"),
]
# Excel 源组：不进版本目录，刷新到全局共享 _source/，只留最新 1 份。
SOURCE_ITEMS = [
    ("input", "dir"),
]
# yundocs_data 不再归档进历史快照（live 与云同步不受影响）。
```

3b. `_snapshot_live_into` 与 `_restore_into_live` 加 `items` 参数（替换这两个函数）：
```python
def _snapshot_live_into(base_dir: str, dest_dir: str, items: List[tuple]) -> List[str]:
    """把当前 items 中存在项复制进 dest_dir,返回顶层名列表。"""
    os.makedirs(dest_dir, exist_ok=True)
    saved = []
    for rel, kind in items:
        src = os.path.join(base_dir, rel)
        if not os.path.exists(src):
            continue
        _copy_item(src, os.path.join(dest_dir, os.path.basename(rel)), kind)
        saved.append(os.path.basename(rel))
    return saved


def _restore_into_live(base_dir: str, src_dir: str, items: List[tuple]) -> List[str]:
    """把 src_dir 内各项(按 items 映射)覆盖回 base_dir 的 live 位置。返回已还原名列表。"""
    restored = []
    for rel, kind in items:
        src = os.path.join(src_dir, os.path.basename(rel))
        if not os.path.exists(src):
            continue
        _copy_item(src, os.path.join(base_dir, rel), kind)
        restored.append(os.path.basename(rel))
    return restored
```

3c. `_version_ids` 排除 `_source`（替换原函数，原仅排除 `_pre_rollback`）：
```python
def _version_ids(base_dir: str) -> List[str]:
    root = _history_root(base_dir)
    if not os.path.isdir(root):
        return []
    ids = [d for d in os.listdir(root)
           if d not in (PRE_ROLLBACK, SOURCE_DIRNAME) and os.path.isdir(os.path.join(root, d))]
    return sorted(ids, reverse=True)   # id=时间戳,字典序=时间序
```

3d. 新增 `_refresh_source`（放在 `archive_version` 前）：
```python
def _refresh_source(base_dir: str, version_id: str) -> Dict[str, Any]:
    """把当前 live SOURCE_ITEMS 刷新到全局共享 _source/(copy-then-swap,只 1 份),写 manifest。"""
    sdir = os.path.join(_history_root(base_dir), SOURCE_DIRNAME)
    saved = _snapshot_live_into(base_dir, sdir, SOURCE_ITEMS)
    manifest = {
        "id": SOURCE_DIRNAME,
        "refreshedFrom": version_id,
        "refreshedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "contents": saved,
        "sizeBytes": _dir_size(sdir),
    }
    with open(os.path.join(sdir, MANIFEST), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return manifest
```

3e. `archive_version` 改为 JSON 组 + 刷新源（替换原函数）：
```python
def archive_version(base_dir: str, version_id: Optional[str] = None) -> Dict[str, Any]:
    """把当前 JSON 产出存为新历史版本,刷新共享源,写 manifest,剪枝保 KEEP 份。返回 manifest。"""
    version_id = version_id or datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(_history_root(base_dir), version_id)
    if os.path.exists(dest):
        shutil.rmtree(dest)
    contents = _snapshot_live_into(base_dir, dest, JSON_ITEMS)
    _refresh_source(base_dir, version_id)
    meta = _read_meta(base_dir)
    manifest = {
        "id": version_id,
        "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "trigger": "reprocess",
        "projectCount": int(meta.get("totalProjects") or 0),
        "paymentNodeCount": int(meta.get("totalPaymentNodes") or 0),
        "dataLastUpdate": meta.get("lastUpdate") or "-",
        "sizeBytes": _dir_size(dest),
        "contents": contents,
    }
    with open(os.path.join(dest, MANIFEST), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    prune(base_dir, KEEP)
    return manifest
```

3f. `list_versions` 增 `source`（替换原函数）：
```python
def list_versions(base_dir: str) -> Dict[str, Any]:
    root = _history_root(base_dir)
    versions = [(_read_manifest(os.path.join(root, vid)) or {"id": vid})
                for vid in _version_ids(base_dir)]
    return {
        "versions": versions,
        "preRollback": _read_manifest(os.path.join(root, PRE_ROLLBACK)),
        "source": _read_manifest(os.path.join(root, SOURCE_DIRNAME)),
    }
```

3g. `rollback` 与 `undo_rollback` 改为只 JSON 组（替换两函数中调用 `_snapshot_live_into`/`_restore_into_live` 处，补 `JSON_ITEMS` 实参）：
```python
def rollback(base_dir: str, version_id: str) -> Dict[str, Any]:
    """回滚:①备份当前 JSON 产出到 _pre_rollback ②覆盖回 live ③中途失败从备份回退并抛错。不动 live 源。"""
    root = _history_root(base_dir)
    src = os.path.join(root, version_id)
    if not os.path.isdir(src):
        raise FileNotFoundError(f"历史版本不存在: {version_id}")
    pre = os.path.join(root, PRE_ROLLBACK)
    if os.path.exists(pre):
        shutil.rmtree(pre)
    saved = _snapshot_live_into(base_dir, pre, JSON_ITEMS)
    with open(os.path.join(pre, MANIFEST), "w", encoding="utf-8") as f:
        json.dump({"id": PRE_ROLLBACK, "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                   "trigger": "pre_rollback", "rolledBackFrom": version_id, "contents": saved},
                  f, ensure_ascii=False, indent=2)
    try:
        restored = _restore_into_live(base_dir, src, JSON_ITEMS)
    except Exception:
        _restore_into_live(base_dir, pre, JSON_ITEMS)   # 回退到回滚前
        raise
    return {"id": version_id, "restored": restored}


def undo_rollback(base_dir: str) -> Dict[str, Any]:
    """撤销上次回滚:从 _pre_rollback 把 JSON 产出覆盖回 live。"""
    pre = os.path.join(_history_root(base_dir), PRE_ROLLBACK)
    if not os.path.isdir(pre):
        raise FileNotFoundError("无可撤销的回滚(无 _pre_rollback)")
    return {"restored": _restore_into_live(base_dir, pre, JSON_ITEMS)}
```

> `prune`、`_history_root`、`_dir_size`、`_copy_item`、`_read_meta`、`_read_manifest` 不变。确认全文已无 `LIVE_ITEMS` 残留引用。

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_data_history.py -q`
Expected: PASS（9 项）。

- [ ] **Step 5: py_compile + ruff + 全量 pytest（data_history 被 server 引用，跑全量）**

Run: `python -m py_compile data_history.py && python -m ruff check data_history.py tests/test_data_history.py && python -m pytest -q`
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add data_history.py tests/test_data_history.py
git commit -m "feat(snap): data_history 分组留存(JSON 产出留5/源共享1份/弃归档 yundocs)+回滚只还原产出"
```
提交信息末尾追加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 2: 前端 `useDataHistory` source + DataView 卡文案/源说明

**难度：常规小改 → sonnet。**

**Files:**
- Modify: `frontend/src/composables/useDataHistory.ts`
- Modify: `frontend/src/views/DataView.vue`
- Modify: `frontend/src/views/DataView.test.ts`

- [ ] **Step 1: 改 `useDataHistory.ts` 加 source**

在 `HistoryVersion` 接口后加 `HistorySource`，并改 `HistoryResp`：
```ts
export interface HistorySource {
  id?: string
  refreshedFrom?: string
  refreshedAt?: string
  sizeBytes?: number
  contents?: string[]
}
interface HistoryResp { versions: HistoryVersion[]; preRollback: HistoryVersion | null; source?: HistorySource | null }
```
在 `useDataHistory` 内加 `const source = ref<HistorySource | null>(null)`；`load()` 成功分支加 `source.value = r.source ?? null`；`return` 增加 `source`：
```ts
  const source = ref<HistorySource | null>(null)
```
```ts
      versions.value = r.versions ?? []
      preRollback.value = r.preRollback ?? null
      source.value = r.source ?? null
```
```ts
  return { versions, preRollback, source, busy, message, load, rollback, undo }
```

- [ ] **Step 2: 改 `DataView.vue` 文案 + 源说明行**

2a. `<script setup>` 解构处（:79-81）补 `source: historySource`：
```ts
const { versions: historyVersions, preRollback: historyPre, source: historySource, busy: historyBusy,
        message: historyMsg, load: loadHistory, rollback: doRollback, undo: doUndo } =
  useDataHistory({ onChange: () => { data.reload(); loadFileStatus() } })
```

2b. 模板数据历史卡：空态文案 "保留最近 3 份" 改 "保留最近 5 份"，并在版本列表后加源说明行。把卡片块（:264-278）替换为：
```vue
    <div class="dv-card">
      <div class="dv-card-head">数据历史 / 回滚</div>
      <div v-if="historyPre" class="dv-row">
        <span class="dv-label">撤销</span>
        <button class="dv-btn ghost" :disabled="historyBusy" @click="onUndoRollback">撤销上次回滚</button>
        <span class="dv-hint">恢复到最近一次回滚前的状态</span>
      </div>
      <div v-if="!historyVersions.length" class="dv-hint">暂无历史版本，"更新数据"成功后会自动保存（保留最近 5 份）。</div>
      <div v-for="v in historyVersions" :key="v.id" class="dv-row" data-test="history-row">
        <span class="dv-label u-num">{{ v.createdAt || v.id }}</span>
        <span class="dv-hint u-num">项目 {{ v.projectCount ?? '-' }} · 节点 {{ v.paymentNodeCount ?? '-' }} · {{ fmtMB(v.sizeBytes) }}</span>
        <button class="dv-btn" :disabled="historyBusy" data-test="history-rollback" @click="onRollback(v.id)">回滚到此</button>
      </div>
      <div class="dv-row dv-hint" data-test="history-source-note">
        源数据仅保留最新 1 份<template v-if="historySource?.refreshedAt">（来自 {{ historySource.refreshedAt }}{{ historySource.sizeBytes ? ' · ' + fmtMB(historySource.sizeBytes) : '' }}）</template>，回滚仅还原看板数据。
      </div>
      <div v-if="historyMsg" class="dv-hint ok">{{ historyMsg }}</div>
    </div>
```

- [ ] **Step 3: 改 `DataView.test.ts` 对齐**

先读 `frontend/src/views/DataView.test.ts`，确认 `useDataHistory` 的 mock 形态（若它 mock 了 `@/composables/useDataHistory`，给返回对象补 `source: ref(null)`；若用真实 composable + mock api，则给 `/api/data-history` 的返回体补 `source: null`，避免解构 undefined）。新增一条断言：数据历史卡渲染含 `data-test="history-source-note"` 且文案含"源数据仅保留最新 1 份"。不破坏既有用例。

- [ ] **Step 4: 验证**

Run: `cd frontend && npx vitest run src/views/DataView.test.ts && npm run typecheck`
Expected: PASS（typecheck 干净）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useDataHistory.ts frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(snap): /data 数据历史卡留存份数 5+源仅留1份说明;useDataHistory 增 source"
```
提交信息末尾追加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 3: 版本 V1.6.1 + 全量验证 + 冒烟 + PROGRESS

**难度：机械 + 核实 → 主循环。**

**Files:** Modify `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 版本号** — `version.ts`：`APP_VERSION = 'V1.6.1'`、`RELEASE_DATE = '2026-06-16'`。

- [ ] **Step 2: 全量 verify**

Run: `bash verify.sh`
Expected: 四步全绿。

- [ ] **Step 3: 真实数据冒烟（后端程序化，可主循环代跑）**

用临时 base_dir 验证：`archive_version` 两次 → 版本目录只含 JSON 产出、`_source/input` 单份且为最新；`list_versions` 含 `source`；`rollback` 还原 JSON、不动 live `input`。（前端交互冒烟：`python server.py`+`npm run dev`，/data 数据历史卡显示"保留最近 5 份"与源说明，更新数据后版本+源刷新、回滚仅还原看板——留用户人工确认。）

- [ ] **Step 4: 更新 `PROGRESS.md`**

- 头部"当前版本"→ **V1.6.1**、"最近更新"补一句（历史快照分组留存：JSON 产出留 5/源共享 1 份/弃归档 yundocs，回滚仅还原产出），原"上一版本"行下移或保留 V1.6.0。
- 数据历史交付项（"数据历史版本化与回滚"那条，文中"留近 3 份")补注：2026-06-16 改分组留存（产出 5 份/源 1 份），体积 228MB→~125MB。
- 该条末尾"历史快照体积优化"后续候选标为已做。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(snap): 版本 V1.6.1 + PROGRESS(历史快照分组留存)"
```
提交信息末尾追加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## 合并（finishing-a-development-branch）

全部任务完成且 `bash verify.sh` 全绿后，用 **superpowers:finishing-a-development-branch** 选项 1：`git checkout master && git merge --no-ff feat/phase-snapshot-volume`，补 PROGRESS 合并 SHA。

---

## Self-Review

**1. Spec 覆盖**：§3 分组留存(Task1 JSON_ITEMS/SOURCE_ITEMS/KEEP=5)✓；§3.1 布局含 `_source/`(Task1 `_refresh_source`)✓；§3.2 archive 流程(Task1 archive_version)✓；§4 回滚只还 JSON、不动源(Task1 rollback/undo 用 JSON_ITEMS + test_rollback_restores_json_only_keeps_live_source)✓；§5 manifest 去源字段+`source` 字段+DataView 说明(Task1 list_versions/manifest + Task2 卡)✓；§6 向后兼容(Task1 test_backward_compat_rollback_old_full_layout)✓；§7 非目标未触碰(server/manual_history/云同步均不动)✓；§8 测试 7 类全覆盖(Task1 九用例)✓；§9 verify(Task3)✓。

**2. 占位扫描**：无 TBD/TODO。Task2 Step3 "先读 DataView.test.ts 确认 mock 形态"是对现有文件的校准，非占位。

**3. 类型一致**：`JSON_ITEMS`/`SOURCE_ITEMS`(Task1) 全程一致；`list_versions` 返回 `{versions,preRollback,source}`(Task1) 与前端 `HistoryResp{...,source}`(Task2) 形状一致；`HistorySource{refreshedFrom,refreshedAt,sizeBytes}`(Task2) 与后端 `_refresh_source` manifest(Task1) 字段一致；`_snapshot_live_into`/`_restore_into_live` 均加 `items` 参数且所有调用点(archive/rollback/undo/_refresh_source)都传实参(JSON_ITEMS 或 SOURCE_ITEMS)。

> 无对 spec 的功能偏离。
