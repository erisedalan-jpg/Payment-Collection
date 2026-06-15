# 数据历史版本化与回滚 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现本计划。步骤用 `- [ ]` 复选框追踪。

**Goal:** 每次"更新数据"成功后自动存一份完整数据快照（产出+源），按处理次数留最近 3 份，并在数据管理页提供回滚与撤销，必要时恢复历史数据。

**Architecture:** 新后端模块 `data_history.py` 集中"哪份算一份数据"（`LIVE_ITEMS`）与归档/列表/回滚/撤销/剪枝逻辑（纯文件操作，pytest 先行）。`server.py` 在 `run_reprocess` 成功唯一汇合点调 `archive_version`（一处覆盖 frozen/dev 双模式），并加 3 个 API。前端新增 `useDataHistory` composable 与 `DataView.vue`「数据历史/回滚」卡。依据 `docs/superpowers/specs/2026-06-15-data-history-rollback-design.md`（V1.1.0）。

**Tech Stack:** Python 标准库（shutil/os/json/datetime/threading）；Vue3+Vite+TS+Vitest；PyInstaller 打包。

**分级调度（用户钦定工作模式）：**

| 任务 | 难度 | 派发 | 理由 |
|---|---|---|---|
| T1 `data_history.py` + pytest | 核心+易踩坑 | opus 子代理 | 文件原子性/剪枝/回滚回退/Windows 目录替换，TDD 重 |
| T2 `server.py` 接入（钩子+3 API+锁） | 易踩坑 | opus 子代理 | reprocess 关键路径、frozen/dev、互斥、错误契约 |
| T3 前端 composable + DataView 卡 + vitest | 常规 | sonnet 子代理 | 仿 useReprocess/api client，模式清晰 |
| T4 打包/.gitignore/版本/PROGRESS/verify | 机械 | 主循环直做 | 收尾 |

子代理产出一律经 git diff + pytest/vitest 核实，不取自报。**顺序 T1 → T2（依赖 T1）→ T3 →（T2、T3 可并）→ T4。**

## 文件结构

- 新建 `data_history.py` — 历史版本化核心（LIVE_ITEMS + archive/list/rollback/undo/prune）
- 新建 `tests/test_data_history.py` — pytest（tmp_path）
- 改 `server.py` — 顶部 `import data_history` + `_history_lock`；`run_reprocess` 成功点归档钩子；do_GET/do_POST 路由；3 个 handler
- 新建 `frontend/src/composables/useDataHistory.ts`
- 新建 `frontend/src/composables/useDataHistory.test.ts`
- 改 `frontend/src/views/DataView.vue` — 数据历史卡 + 脚本接线
- 改 `.gitignore` / `PaymentReviewApp.spec` / `frontend/src/version.ts` / `PROGRESS.md`

---

### Task 1: `data_history.py` 模块 + pytest（TDD）

**Files:**
- Create: `data_history.py`
- Create: `tests/test_data_history.py`

- [ ] **Step 1: 写失败测试 `tests/test_data_history.py`**

```python
import json
import os
import data_history as DH


def _seed(base):
    """造一个假的 base_dir:含 data/analysis_data.json(带 meta)/events.json/snapshots + yundocs_data + input。"""
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


def test_archive_creates_version_with_manifest(tmp_path):
    base = str(tmp_path)
    _seed(base)
    mf = DH.archive_version(base, version_id="20260615-100000")
    vdir = os.path.join(base, "data", "history", "20260615-100000")
    assert os.path.isdir(vdir)
    assert os.path.isfile(os.path.join(vdir, "analysis_data.json"))
    assert os.path.isfile(os.path.join(vdir, "events.json"))
    assert os.path.isdir(os.path.join(vdir, "snapshots"))
    assert os.path.isdir(os.path.join(vdir, "yundocs_data"))
    assert os.path.isdir(os.path.join(vdir, "input"))
    assert mf["projectCount"] == 5 and mf["paymentNodeCount"] == 12
    assert mf["sizeBytes"] > 0
    assert set(mf["contents"]) == {"analysis_data.json", "events.json", "snapshots", "yundocs_data", "input"}


def test_prune_keeps_latest_three(tmp_path):
    base = str(tmp_path)
    _seed(base)
    for vid in ["20260615-100001", "20260615-100002", "20260615-100003", "20260615-100004"]:
        DH.archive_version(base, version_id=vid)
    ids = [v["id"] for v in DH.list_versions(base)["versions"]]
    assert ids == ["20260615-100004", "20260615-100003", "20260615-100002"]


def test_rollback_restores_and_makes_pre_rollback(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260615-100000")   # 存档 marker=v1
    _set_marker(base, "v2")                                   # live 变为 v2
    with open(os.path.join(base, "yundocs_data", "src.json"), "w", encoding="utf-8") as f:
        f.write("src-v2")
    res = DH.rollback(base, "20260615-100000")
    assert res["id"] == "20260615-100000"
    with open(os.path.join(base, "data", "analysis_data.json"), encoding="utf-8") as f:
        assert json.load(f)["marker"] == "v1"                # live 已还原为 v1
    with open(os.path.join(base, "yundocs_data", "src.json"), encoding="utf-8") as f:
        assert f.read() == "src-v1"                          # 源也还原
    assert os.path.isdir(os.path.join(base, "data", "history", "_pre_rollback"))
    assert DH.list_versions(base)["preRollback"] is not None


def test_undo_rollback_restores_pre_state(tmp_path):
    base = str(tmp_path)
    _seed(base)
    DH.archive_version(base, version_id="20260615-100000")
    _set_marker(base, "v2")
    DH.rollback(base, "20260615-100000")                     # live: v2 -> v1, _pre_rollback=v2
    DH.undo_rollback(base)                                    # 撤销 -> 回到 v2
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
        json.dump({"meta": {}}, f)                            # 仅有 analysis_data.json,无 events/snapshots/源
    mf = DH.archive_version(base, version_id="20260615-100000")
    assert mf["contents"] == ["analysis_data.json"]
    assert mf["projectCount"] == 0
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m pytest tests/test_data_history.py -q`
Expected: 全部 FAIL（`ModuleNotFoundError: No module named 'data_history'`）。

- [ ] **Step 3: 实现 `data_history.py`**

```python
"""数据历史版本化与回滚。
每次"更新数据"成功后存一份完整数据快照(产出+源),按处理次数留最近 KEEP 份,支持回滚与撤销。
与 data/snapshots/(Phase P3 项目域日 diff)无关;本模块所有路径相对 base_dir。
"""
import json
import os
import shutil
from datetime import datetime
from typing import Any, Dict, List, Optional

HISTORY_DIRNAME = "history"
PRE_ROLLBACK = "_pre_rollback"
KEEP = 3
MANIFEST = "manifest.json"

# 一份"数据"= 这些 live 项(相对 base_dir);缺失项跳过,不报错。
# 不含 followup_records.json(用户数据)与 analysis_data.js(旧前端遗留)。
LIVE_ITEMS = [
    ("data/analysis_data.json", "file"),
    ("data/events.json", "file"),
    ("data/snapshots", "dir"),
    ("yundocs_data", "dir"),
    ("input", "dir"),
]


def _history_root(base_dir: str) -> str:
    return os.path.join(base_dir, "data", HISTORY_DIRNAME)


def _dir_size(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _copy_item(src: str, dst: str, kind: str) -> None:
    """把项复制到 dst(已知 src 存在)。file 直接 copy2;dir 整目录 copytree(dst 先清)。"""
    if kind == "file":
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
    else:
        if os.path.exists(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst)


def _snapshot_live_into(base_dir: str, dest_dir: str) -> List[str]:
    """把当前 LIVE_ITEMS 存在项复制进 dest_dir,返回顶层名列表。"""
    os.makedirs(dest_dir, exist_ok=True)
    saved = []
    for rel, kind in LIVE_ITEMS:
        src = os.path.join(base_dir, rel)
        if not os.path.exists(src):
            continue
        _copy_item(src, os.path.join(dest_dir, os.path.basename(rel)), kind)
        saved.append(os.path.basename(rel))
    return saved


def _restore_into_live(base_dir: str, src_dir: str) -> List[str]:
    """把 src_dir 内各项(按 LIVE_ITEMS 映射)覆盖回 base_dir 的 live 位置。返回已还原名列表。"""
    restored = []
    for rel, kind in LIVE_ITEMS:
        src = os.path.join(src_dir, os.path.basename(rel))
        if not os.path.exists(src):
            continue
        _copy_item(src, os.path.join(base_dir, rel), kind)
        restored.append(os.path.basename(rel))
    return restored


def _read_meta(base_dir: str) -> Dict[str, Any]:
    try:
        with open(os.path.join(base_dir, "data", "analysis_data.json"), encoding="utf-8") as f:
            return json.load(f).get("meta") or {}
    except (OSError, ValueError):
        return {}


def _read_manifest(version_dir: str) -> Optional[Dict[str, Any]]:
    try:
        with open(os.path.join(version_dir, MANIFEST), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _version_ids(base_dir: str) -> List[str]:
    root = _history_root(base_dir)
    if not os.path.isdir(root):
        return []
    ids = [d for d in os.listdir(root)
           if d != PRE_ROLLBACK and os.path.isdir(os.path.join(root, d))]
    return sorted(ids, reverse=True)   # id=时间戳,字典序=时间序


def archive_version(base_dir: str, version_id: Optional[str] = None) -> Dict[str, Any]:
    """把当前 LIVE 状态存为新历史版本,写 manifest,剪枝保 KEEP 份。返回 manifest。"""
    version_id = version_id or datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(_history_root(base_dir), version_id)
    if os.path.exists(dest):
        shutil.rmtree(dest)
    contents = _snapshot_live_into(base_dir, dest)
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


def list_versions(base_dir: str) -> Dict[str, Any]:
    root = _history_root(base_dir)
    versions = [(_read_manifest(os.path.join(root, vid)) or {"id": vid})
                for vid in _version_ids(base_dir)]
    return {"versions": versions, "preRollback": _read_manifest(os.path.join(root, PRE_ROLLBACK))}


def prune(base_dir: str, keep: int = KEEP) -> List[str]:
    """删超出 keep 的最旧版本目录(不含 _pre_rollback)。返回被删 id。"""
    removed = []
    for vid in _version_ids(base_dir)[keep:]:
        shutil.rmtree(os.path.join(_history_root(base_dir), vid), ignore_errors=True)
        removed.append(vid)
    return removed


def rollback(base_dir: str, version_id: str) -> Dict[str, Any]:
    """回滚:①备份当前到 _pre_rollback ②覆盖回 live ③中途失败从备份回退并抛错。"""
    root = _history_root(base_dir)
    src = os.path.join(root, version_id)
    if not os.path.isdir(src):
        raise FileNotFoundError(f"历史版本不存在: {version_id}")
    pre = os.path.join(root, PRE_ROLLBACK)
    if os.path.exists(pre):
        shutil.rmtree(pre)
    saved = _snapshot_live_into(base_dir, pre)
    with open(os.path.join(pre, MANIFEST), "w", encoding="utf-8") as f:
        json.dump({"id": PRE_ROLLBACK, "createdAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                   "trigger": "pre_rollback", "rolledBackFrom": version_id, "contents": saved},
                  f, ensure_ascii=False, indent=2)
    try:
        restored = _restore_into_live(base_dir, src)
    except Exception:
        _restore_into_live(base_dir, pre)   # 回退到回滚前
        raise
    return {"id": version_id, "restored": restored}


def undo_rollback(base_dir: str) -> Dict[str, Any]:
    """撤销上次回滚:从 _pre_rollback 把各项覆盖回 live。"""
    pre = os.path.join(_history_root(base_dir), PRE_ROLLBACK)
    if not os.path.isdir(pre):
        raise FileNotFoundError("无可撤销的回滚(无 _pre_rollback)")
    return {"restored": _restore_into_live(base_dir, pre)}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m pytest tests/test_data_history.py -q`
Expected: 全部 PASS（7 项）。

- [ ] **Step 5: 语法 + ruff**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m py_compile data_history.py && python -m ruff check data_history.py tests/test_data_history.py`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add data_history.py tests/test_data_history.py
git commit -m "feat(history): data_history.py 历史版本化核心(归档/列表/回滚/撤销/剪枝)+pytest"
```

---

### Task 2: `server.py` 接入（归档钩子 + 3 API + 路由 + 锁）

**Files:**
- Modify: `server.py`（顶部 import + `_history_lock`；`run_reprocess` 成功点 `:1198`；do_GET `:348`；do_POST `:436`；新增 3 handler）

依赖 Task 1 的 `data_history.py`。`_error_payload`/`_json_response`/错误码 `ERR_*`（`server.py:166-175`）与 BASE_DIR（`:91-95`）均已存在直接复用。

- [ ] **Step 1: 顶部加 import 与模块级锁**

在 `server.py` 顶部 import 区（与其它 `import` 同处）加：
```python
import data_history
```
在错误码常量（`ERR_INTERNAL` 行 `:170`）之后加一行模块级锁：
```python
_history_lock = threading.Lock()
```
（`threading` 已 import。）

- [ ] **Step 2: `run_reprocess` 成功点加归档钩子**

`server.py:1198` 当前为：
```python
        reprocess_state = {"running": True, "progress": 100, "message": "数据更新完成"}
```
在该行**之前**插入（frozen 与 subprocess 两分支都 fall through 到此，一处即覆盖双模式）：
```python
        # 更新成功 → 自动存一份数据历史(失败只告警,不推翻"更新成功")
        try:
            mf = data_history.archive_version(BASE_DIR)
            logger.info(f"[history] 已存历史版本 {mf['id']}(项目 {mf['projectCount']},占用 {mf['sizeBytes']} 字节)")
        except Exception as e:
            logger.warning(f"[history] 存历史版本失败(不影响本次更新): {e}")
```

- [ ] **Step 3: 路由注册**

do_GET 路由块（`server.py:352` 的 `clear-data` 分支附近）加：
```python
        elif parsed.path == '/api/data-history':
            self.handle_data_history()
```
do_POST 路由块（`server.py:448` 的 `inputs/upload` 分支之后、`else` 之前）加：
```python
        elif parsed.path == '/api/data-history/rollback':
            self.handle_data_history_rollback()
        elif parsed.path == '/api/data-history/undo-rollback':
            self.handle_data_history_undo()
```

- [ ] **Step 4: 新增 3 个 handler**

在 `handle_reprocess` 方法之后（`server.py:1010` 附近、`_json_response` 定义之前的类体内）加：
```python
    def _history_busy(self):
        return (sync_state.get("running") or import_state.get("running")
                or pmis_state.get("running") or reprocess_state.get("running"))

    def handle_data_history(self):
        """GET /api/data-history - 列出历史版本与 _pre_rollback。"""
        try:
            self._json_response(data_history.list_versions(BASE_DIR))
        except Exception as e:
            logger.error(f"列出历史版本失败: {e}", exc_info=True)
            self._json_response(_error_payload(ERR_INTERNAL, f"列出历史版本失败: {e}"))

    def handle_data_history_rollback(self):
        """POST /api/data-history/rollback {id} - 回滚到指定版本。"""
        if self._history_busy():
            self._json_response(_error_payload(ERR_BUSY, "其他数据操作进行中,请稍后再回滚"))
            return
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(content_length))
        except Exception as e:
            self._json_response(_error_payload(ERR_PARSE, f"请求数据解析失败: {str(e)}"))
            return
        vid = str(data.get("id") or "").strip()
        if not vid:
            self._json_response(_error_payload(ERR_VALIDATION, "缺少版本 id"))
            return
        with _history_lock:
            try:
                res = data_history.rollback(BASE_DIR, vid)
            except FileNotFoundError as e:
                self._json_response(_error_payload(ERR_NOT_FOUND, str(e)))
                return
            except Exception as e:
                logger.error(f"回滚失败: {e}", exc_info=True)
                self._json_response(_error_payload(ERR_INTERNAL, f"回滚失败: {e}"))
                return
        self._json_response({"success": True, "message": f"已回滚到 {res['id']}", **res})

    def handle_data_history_undo(self):
        """POST /api/data-history/undo-rollback - 撤销上次回滚。"""
        if self._history_busy():
            self._json_response(_error_payload(ERR_BUSY, "其他数据操作进行中,请稍后再撤销"))
            return
        with _history_lock:
            try:
                res = data_history.undo_rollback(BASE_DIR)
            except FileNotFoundError as e:
                self._json_response(_error_payload(ERR_NOT_FOUND, str(e)))
                return
            except Exception as e:
                logger.error(f"撤销回滚失败: {e}", exc_info=True)
                self._json_response(_error_payload(ERR_INTERNAL, f"撤销回滚失败: {e}"))
                return
        self._json_response({"success": True, "message": "已撤销上次回滚", **res})
```

- [ ] **Step 5: 语法 + ruff + 既有 pytest 不回归**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m py_compile server.py && python -m ruff check server.py && python -m pytest -q`
Expected: 编译/ruff 无错；pytest 全绿（含 T1 新测试）。

- [ ] **Step 6: 冒烟——模块联通**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -c "import server, data_history; print('import ok'); print(data_history.list_versions(server.BASE_DIR))"`
Expected: 打印 `import ok` 与 `{'versions': [...], 'preRollback': ...}`（本机已有真实 data/history 则非空，否则 versions 为空列表，均正常）。

- [ ] **Step 7: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add server.py
git commit -m "feat(history): server 接入——reprocess 成功自动归档(双模式单点)+3 API(列表/回滚/撤销)+互斥锁"
```

---

### Task 3: 前端 `useDataHistory` + DataView 数据历史卡 + vitest

**Files:**
- Create: `frontend/src/composables/useDataHistory.ts`
- Create: `frontend/src/composables/useDataHistory.test.ts`
- Modify: `frontend/src/views/DataView.vue`

- [ ] **Step 1: 写 composable `useDataHistory.ts`**

```ts
import { ref } from 'vue'
import { api, ApiRequestError } from '@/api/client'

export interface HistoryVersion {
  id: string
  createdAt?: string
  projectCount?: number
  paymentNodeCount?: number
  dataLastUpdate?: string
  sizeBytes?: number
  contents?: string[]
}
interface HistoryResp { versions: HistoryVersion[]; preRollback: HistoryVersion | null }

export function useDataHistory(opts: { onChange?: () => void } = {}) {
  const versions = ref<HistoryVersion[]>([])
  const preRollback = ref<HistoryVersion | null>(null)
  const busy = ref(false)
  const message = ref('')

  async function load() {
    try {
      const r = await api.get<HistoryResp>('/api/data-history')
      versions.value = r.versions ?? []
      preRollback.value = r.preRollback ?? null
    } catch (e) {
      message.value = e instanceof ApiRequestError ? e.message : '加载历史失败'
    }
  }

  async function rollback(id: string) {
    busy.value = true; message.value = ''
    try {
      await api.post('/api/data-history/rollback', { id })
      message.value = '回滚完成'
      await load()
      opts.onChange?.()
    } catch (e) {
      message.value = e instanceof ApiRequestError ? e.message : '回滚失败'
    } finally {
      busy.value = false
    }
  }

  async function undo() {
    busy.value = true; message.value = ''
    try {
      await api.post('/api/data-history/undo-rollback', {})
      message.value = '已撤销回滚'
      await load()
      opts.onChange?.()
    } catch (e) {
      message.value = e instanceof ApiRequestError ? e.message : '撤销失败'
    } finally {
      busy.value = false
    }
  }

  return { versions, preRollback, busy, message, load, rollback, undo }
}
```

- [ ] **Step 2: 写 vitest `useDataHistory.test.ts`（先确认失败）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDataHistory } from './useDataHistory'

beforeEach(() => { vi.restoreAllMocks() })

describe('useDataHistory', () => {
  it('load 拉取版本与 preRollback', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ versions: [{ id: '20260615-101010', projectCount: 5 }], preRollback: null }),
    }) as any
    const h = useDataHistory()
    await h.load()
    expect(h.versions.value.length).toBe(1)
    expect(h.versions.value[0].projectCount).toBe(5)
    expect(h.preRollback.value).toBeNull()
  })

  it('rollback 调 POST 并触发 onChange + 重载', async () => {
    const calls: string[] = []
    global.fetch = vi.fn().mockImplementation((url: string) => {
      calls.push(url)
      const body = url.includes('rollback') ? { success: true } : { versions: [], preRollback: null }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
    }) as any
    const onChange = vi.fn()
    const h = useDataHistory({ onChange })
    await h.rollback('20260615-101010')
    expect(calls.some((u) => u.includes('/api/data-history/rollback'))).toBe(true)
    expect(onChange).toHaveBeenCalled()
  })
})
```

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection/frontend" && npx vitest run src/composables/useDataHistory.test.ts`
Expected: 先因 composable 未实现/逻辑而 FAIL → Step 1 实现后此步应 PASS（若顺序为先写实现再写测试，则此处直接 PASS 2 项）。

- [ ] **Step 3: DataView 接线（script）**

在 `DataView.vue` `<script setup>` 顶部 import 区加：
```ts
import { useDataHistory } from '@/composables/useDataHistory'
```
在"更新数据 / 设置"区（`const { progress: repProgress, ... } = useReprocess(...)` 之后）加：
```ts
const { versions: historyVersions, preRollback: historyPre, busy: historyBusy,
        message: historyMsg, load: loadHistory, rollback: doRollback, undo: doUndo } =
  useDataHistory({ onChange: () => { data.reload(); loadFileStatus() } })
function fmtMB(bytes?: number) { return bytes ? (bytes / 1048576).toFixed(1) + ' MB' : '-' }
async function onRollback(id: string) {
  if (!window.confirm(`确定回滚到 ${id}？将用该版本覆盖当前数据与源数据，当前状态会先备份可撤销。`)) return
  await doRollback(id)
}
async function onUndoRollback() {
  if (!window.confirm('确定撤销上次回滚，恢复回滚前的状态？')) return
  await doUndo()
}
```
把 `onMounted(...)` 行改为同时拉取历史：
```ts
onMounted(() => { if (!data.data) data.load(); pmisLoadLinks(); loadFileStatus(); loadHistory() })
```

- [ ] **Step 4: DataView 卡（template）**

在"更新数据"卡（含"清空数据"行）的闭合 `</div>` 之后，插入新卡：
```html
    <div class="dv-card">
      <div class="dv-card-head">数据历史 / 回滚</div>
      <div v-if="historyPre" class="dv-row">
        <span class="dv-label">撤销</span>
        <button class="dv-btn ghost" :disabled="historyBusy" @click="onUndoRollback">撤销上次回滚</button>
        <span class="dv-hint">恢复到最近一次回滚前的状态</span>
      </div>
      <div v-if="!historyVersions.length" class="dv-hint">暂无历史版本，"更新数据"成功后会自动保存（保留最近 3 份）。</div>
      <div v-for="v in historyVersions" :key="v.id" class="dv-row" data-test="history-row">
        <span class="dv-label u-num">{{ v.createdAt || v.id }}</span>
        <span class="dv-hint u-num">项目 {{ v.projectCount ?? '-' }} · 节点 {{ v.paymentNodeCount ?? '-' }} · {{ fmtMB(v.sizeBytes) }}</span>
        <button class="dv-btn" :disabled="historyBusy" data-test="history-rollback" @click="onRollback(v.id)">回滚到此</button>
      </div>
      <div v-if="historyMsg" class="dv-hint ok">{{ historyMsg }}</div>
    </div>
```

- [ ] **Step 5: 测试 + 类型 + 构建**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection/frontend" && npx vitest run src/composables/useDataHistory.test.ts && npm run typecheck && npm run build`
Expected: vitest 2 项 PASS；typecheck/build 均无错。

- [ ] **Step 6: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add frontend/src/composables/useDataHistory.ts frontend/src/composables/useDataHistory.test.ts frontend/src/views/DataView.vue
git commit -m "feat(history): 前端 useDataHistory composable + DataView 数据历史/回滚卡 + vitest"
```

---

### Task 4: 打包 / .gitignore / 版本 / PROGRESS / 全量验证（主循环）

**Files:**
- Modify: `.gitignore` / `PaymentReviewApp.spec` / `frontend/src/version.ts` / `PROGRESS.md`

- [ ] **Step 1: `.gitignore` 加 `data/history/`**

在 `.gitignore` 的"生成物/运行时数据"段（`data/snapshots/` 行附近）加：
```
# 数据历史版本(含真实源数据副本,运行时生成,不入库)
data/history/
```

- [ ] **Step 2: `.spec` 加模块**

`PaymentReviewApp.spec` datas 列表中 `('snapshots.py', '.'),`（`:68`）之后加一行：
```python
        ('data_history.py', '.'),
```
hiddenimports 列表（`:87` 起）加：
```python
        'data_history',
```

- [ ] **Step 3: 升版本号**

`frontend/src/version.ts`：
```ts
export const APP_VERSION = 'V1.1.0'
export const RELEASE_DATE = '2026-06-15'
```

- [ ] **Step 4: PROGRESS.md**

在「进行中」区加一条（精确措辞以现有格式为准）：
```
- [~] **数据历史版本化与回滚**（spec：2026-06-15-data-history-rollback-design.md，V1.1.0）：每次"更新数据"成功自动存整份数据快照(产出+源)留近3份；data_history.py(归档/列表/回滚/撤销/剪枝)+3 API+DataView 数据历史卡；回滚前自动备份 _pre_rollback 可撤销。分支 data-history-rollback 待合并。
```

- [ ] **Step 5: 全量门禁**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest含新测试 + 前端 typecheck/vitest/build）。

- [ ] **Step 6: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add .gitignore PaymentReviewApp.spec frontend/src/version.ts PROGRESS.md
git commit -m "chore(history): .gitignore data/history + .spec 入 data_history + 版本 V1.1.0 + PROGRESS"
```

---

## 收尾

全部任务完成且分支 `verify.sh` 全绿后，用 superpowers:finishing-a-development-branch 收束（用户惯例选「1 合并回 master」→ master 复跑 verify.sh → 删分支 → PROGRESS 翻 [x] 带 merge SHA）。

## 自检（writing-plans 强制）

- **spec 覆盖**：§2 存储布局/§3 模块→T1；§4 接入(钩子+API)→T2；§5 前端→T3；§6 错误/并发→T2（busy 互斥+锁+try/except）；§7 测试→T1 Step1/T3 Step2；§8 打包→T4。无遗漏。
- **占位符**：无 TBD；每代码步含完整代码。PROGRESS 精确措辞标注由主循环按现有格式写。
- **类型/命名一致**：`LIVE_ITEMS`、`archive_version/list_versions/rollback/undo_rollback/prune` 五接口在 T1 定义、T2 调用一致；API 路径 `/api/data-history`(GET)、`/api/data-history/rollback`、`/api/data-history/undo-rollback`(POST) 三处（server 路由/handler、composable）一致；`HistoryVersion` 字段(projectCount/paymentNodeCount/sizeBytes/createdAt/id)与后端 manifest 一致；错误码 `ERR_BUSY/ERR_PARSE/ERR_VALIDATION/ERR_NOT_FOUND/ERR_INTERNAL` 均为 server.py:166-170 既有。
- **依赖顺序**：T2/T3 依赖 T1 模块；计划已声明 T1→T2→T3→T4。
